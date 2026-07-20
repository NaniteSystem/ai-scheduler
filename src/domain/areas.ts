import type { Area, GTDTask, Project } from '../types.ts';

export function activeAreas(areas: Area[]): Area[] {
  return areas.filter(area => !area.archivedAt);
}

export interface AreaStats {
  projectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
}

/** Aggregate task load across every project linked to this area. */
export function areaStats(area: Area, projects: Project[], tasks: GTDTask[], today: string): AreaStats {
  const areaProjects = projects.filter(project => project.areaId === area.id);
  const projectIds = new Set(areaProjects.map(project => project.id));
  const openTasks = tasks.filter(task => !!task.projectId
    && projectIds.has(task.projectId)
    && task.status !== 'done'
    && task.status !== 'trash'
    && !task.isArchived);
  const overdueTaskCount = openTasks.filter(task => !!task.dueDate && task.dueDate < today).length;
  return { projectCount: areaProjects.length, openTaskCount: openTasks.length, overdueTaskCount };
}
