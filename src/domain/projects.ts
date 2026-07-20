import type { GTDTask, Project, ProjectHealth } from '../types.ts';

const normalizedTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const normalizeProject = (project: Project): Project => {
  const record = project as unknown as Record<string, unknown>;
  return {
    ...project,
    ...(!Object.prototype.hasOwnProperty.call(record, 'outcome') || project.outcome === undefined ? { outcome: '' } : {}),
    ...(!Object.prototype.hasOwnProperty.call(record, 'health') || project.health === undefined ? { health: 'unknown' as const } : {}),
  };
};

const projectDate = (project: Project) => project.deadline || project.targetDate || '';

export function deriveProjectHealth(project: Project, tasks: GTDTask[], today: string): ProjectHealth {
  const open = tasks.filter(task => task.status !== 'done' && task.status !== 'trash' && !task.isArchived);
  if (open.some(task => typeof (task as GTDTask & { blockingReason?: string }).blockingReason === 'string'
    && !!(task as GTDTask & { blockingReason?: string }).blockingReason?.trim())) return 'blocked';
  if (open.length > 0 && !open.some(task => task.status === 'next-action' || task.status === 'scheduled')) return 'blocked';
  const deadline = projectDate(project);
  if (deadline && deadline <= today && open.length > 0) return 'at-risk';
  if (open.some(task => !!task.dueDate && task.dueDate < today)) return 'at-risk';
  if (open.some(task => task.status === 'next-action' || task.status === 'scheduled')) return 'on-track';
  return project.health || 'unknown';
}

/**
 * Convert the former task.project labels into durable project containers.
 * IDs are deterministic so hydration and recovery-import previews produce the
 * same result for the same data.
 */
export function migrateLegacyProjects(
  projectsValue: unknown,
  tasksValue: unknown,
): { projects: Project[]; gtdTasks: GTDTask[] } {
  // Preserve malformed records during migration so backup/recovery validation can
  // reject the whole import instead of silently dropping user data.
  const projects = (Array.isArray(projectsValue) ? projectsValue : [])
    .map(project => (project && typeof project === 'object' ? normalizeProject({ ...(project as Record<string, unknown>) } as unknown as Project) : project)) as Project[];
  const tasks = (Array.isArray(tasksValue) ? tasksValue : [])
    .map(task => (task && typeof task === 'object' ? { ...(task as Record<string, unknown>) } : task)) as GTDTask[];
  const validProjects = projects.filter(project => !!project
    && typeof project === 'object'
    && typeof project.id === 'string'
    && typeof project.title === 'string');
  const byTitle = new Map(validProjects.map(project => [normalizedTitle(project.title), project]));
  const usedIds = new Set(validProjects.map(project => project.id));

  const nextId = () => {
    let index = projects.length + 1;
    while (usedIds.has(`project-legacy-${index}`)) index += 1;
    const id = `project-legacy-${index}`;
    usedIds.add(id);
    return id;
  };

  const gtdTasks = tasks.map(task => {
    if (!task || typeof task !== 'object') return task;
    const record = task as unknown as Record<string, unknown>;
    if (typeof record.projectId === 'string' || typeof record.project !== 'string' || !record.project.trim()) return record as unknown as GTDTask;
    const title = record.project.trim().replace(/\s+/g, ' ');
    const key = normalizedTitle(title);
    let project = byTitle.get(key);
    if (!project) {
      project = {
        id: nextId(),
        title,
        color: '#8b5cf6',
        outcome: '',
        status: 'active',
        health: 'unknown',
        createdAt: task.createdAt,
      };
      projects.push(project);
      byTitle.set(key, project);
    }
    const migrated = { ...task, projectId: project.id };
    delete migrated.project;
    return migrated;
  });

  return { projects, gtdTasks };
}
