import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle,
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Folder,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { localDateKey } from '../domain/date';
import { deriveProjectHealth } from '../domain/projects';
import { useDateLocale, useT } from '../i18n';
import { useStore } from '../store';
import type { GTDTask, Project, ProjectHealth, ProjectStatus } from '../types';
import { parseTaskCapture } from '../utils/taskCapture';

const PROJECT_COLORS = ['#8b5cf6', '#6467f2', '#0d9488', '#22c55e', '#f59e0b', '#e0532f', '#e11d48', '#64748b'];
const PROJECT_HEALTH: ProjectHealth[] = ['unknown', 'on-track', 'at-risk', 'blocked'];
const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'planned', 'active', 'waiting', 'paused', 'completed', 'canceled'];
const WORK_VISIBLE_STATUSES = new Set<ProjectStatus>(['idea', 'planned', 'active', 'waiting', 'paused']);

// Match the Tasks view: a deliberately scheduled day is the task's next
// operational date, while dueDate still independently drives overdue warnings.
const actionableDate = (task: GTDTask) => task.scheduledDate || task.dueDate || '';

export function ProjectsView({ onBack }: { onBack: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const {
    projects,
    gtdTasks,
    addProject,
    updateProject,
    captureTask,
    updateTask,
    openEditTask,
    setActiveView,
    askConfirm,
  } = useStore();
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [createError, setCreateError] = useState('');
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editOutcome, setEditOutcome] = useState('');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('active');
  const [editHealth, setEditHealth] = useState<ProjectHealth>('unknown');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editColor, setEditColor] = useState(PROJECT_COLORS[0]);
  const [editError, setEditError] = useState('');
  const active = projects.filter(project => WORK_VISIBLE_STATUSES.has(project.status));
  const archived = projects.filter(project => project.status === 'archived' || project.status === 'completed' || project.status === 'canceled');
  const today = localDateKey();

  const hasDuplicateTitle = (value: string, exceptId?: string) => projects.some(project => (
    project.id !== exceptId && project.title.toLocaleLowerCase() === value.toLocaleLowerCase()
  ));

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError(t('projects.nameRequired'));
      return;
    }
    const trimmedOutcome = outcome.trim();
    if (!trimmedOutcome) {
      setCreateError(t('projects.outcomeRequired'));
      return;
    }
    if (hasDuplicateTitle(trimmed)) {
      setCreateError(t('projects.duplicateName'));
      return;
    }
    addProject(trimmed, { outcome: trimmedOutcome, targetDate: targetDate || undefined });
    setTitle('');
    setOutcome('');
    setTargetDate('');
    setCreateError('');
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditTitle(project.title);
    setEditOutcome(project.outcome || '');
    setEditStatus(project.status === 'archived' ? 'active' : project.status);
    setEditHealth(project.health || 'unknown');
    setEditTargetDate(project.targetDate || '');
    setEditDeadline(project.deadline || '');
    setEditColor(project.color);
    setEditError('');
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEdit = (project: Project) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError(t('projects.nameRequired'));
      return;
    }
    const trimmedOutcome = editOutcome.trim();
    if (!trimmedOutcome) {
      setEditError(t('projects.outcomeRequired'));
      return;
    }
    if (hasDuplicateTitle(trimmed, project.id)) {
      setEditError(t('projects.duplicateName'));
      return;
    }
    updateProject(project.id, {
      title: trimmed,
      outcome: trimmedOutcome,
      status: editStatus,
      health: editHealth,
      targetDate: editTargetDate || undefined,
      deadline: editDeadline || undefined,
      color: editColor,
    });
    closeEdit();
  };

  const addTask = (projectId: string) => {
    const input = taskTitles[projectId]?.trim();
    if (!input) return;
    const parsed = parseTaskCapture(input);
    const taskId = captureTask(parsed.title, parsed.durationMinutes);
    updateTask(taskId, {
      projectId,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.context ? { context: parsed.context } : {}),
      ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.remindAt ? { remindAt: parsed.remindAt } : {}),
      ...(parsed.recurring ? { recurring: parsed.recurring } : {}),
    });
    setTaskTitles(current => ({ ...current, [projectId]: '' }));
  };

  const openTask = (taskId: string) => {
    setActiveView('inbox');
    openEditTask(taskId);
  };

  const renderProject = (project: Project) => {
    const tasks = gtdTasks.filter(task => task.projectId === project.id && task.status !== 'trash');
    const open = tasks
      .filter(task => task.status !== 'done' && !task.isArchived)
      .sort((a, b) => {
        const dateOrder = (actionableDate(a) || '9999').localeCompare(actionableDate(b) || '9999');
        return dateOrder || a.priority - b.priority || b.createdAt.localeCompare(a.createdAt);
      });
    const done = tasks.filter(task => task.status === 'done');
    const trackedTotal = open.length + done.length;
    const progress = trackedTotal ? Math.round((done.length / trackedTotal) * 100) : 0;
    const overdue = open.filter(task => !!task.dueDate && task.dueDate < today).length;
    const dueToday = open.filter(task => actionableDate(task) === today).length;
    const nextDate = open.map(actionableDate).filter(date => date > today).sort()[0];
    const nextAction = open.find(task => task.status === 'next-action') || open[0];
    const target = project.deadline || project.targetDate;
    const isStoredAway = project.status === 'archived' || project.status === 'completed' || project.status === 'canceled';
    const displayHealth = deriveProjectHealth(project, tasks, today);
    const healthClass = displayHealth === 'blocked'
      ? 'bg-red-500/10 text-red-500'
      : displayHealth === 'at-risk'
        ? 'bg-amber-500/10 text-amber-600'
        : displayHealth === 'on-track'
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-[var(--surface-2)] text-[var(--text-dim)]';
    const editing = editingId === project.id;

    const changeStatus = () => {
      if (isStoredAway) {
        updateProject(project.id, { status: 'active' });
        return;
      }
      if (open.length === 0) {
        updateProject(project.id, { status: 'archived' });
        return;
      }
      askConfirm({
        title: t('projects.archiveConfirmTitle', { title: project.title }),
        message: t('projects.archiveConfirmMessage', { n: open.length }),
        confirmLabel: t('projects.archiveAction'),
        onConfirm: () => updateProject(project.id, { status: 'archived' }),
      });
    };
    const actionLabel = isStoredAway ? t('projects.restore') : t('projects.archive');

    return (
      <article key={project.id} className="tcard p-5 overflow-hidden" style={{ borderTop: `3px solid ${project.color}` }}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: `${project.color}18`, color: project.color }}>
            <Folder className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[15px] font-bold text-[var(--text)] truncate">{project.title}</h2>
              <span className={`h-5 px-2 rounded-full text-[9px] font-bold ${healthClass}`}>{t(`projects.health.${displayHealth}`)}</span>
            </div>
            <p className="text-[11px] text-[var(--text-dim)] mt-1">{t('projects.taskSummary', { open: open.length, total: trackedTotal })}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => editing ? closeEdit() : startEdit(project)}
              className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={editing ? t('common.cancel') : t('projects.edit')}
              title={editing ? t('common.cancel') : t('projects.edit')}
            >
              {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={changeStatus}
              className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={actionLabel}
              title={actionLabel}
            >
              {!isStoredAway ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              <span className="hidden sm:inline">{!isStoredAway ? t('projects.archiveAction') : t('projects.restoreAction')}</span>
            </button>
          </div>
        </div>

        {!editing && (
          <div className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.outcomeLabel')}</p>
            <p className="text-[13px] text-[var(--text)]">{project.outcome || t('projects.outcomeMissing')}</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1">{t(`projects.status.${project.status}`)}</span>
              {target && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{project.deadline ? t('projects.deadline', { date: format(parseISO(project.deadline), 'MMM d', { locale }) }) : t('projects.target', { date: format(parseISO(project.targetDate!), 'MMM d', { locale }) })}</span>}
            </div>
            {nextAction && <button type="button" onClick={() => openTask(nextAction.id)} className="w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-3)]"><span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.nextAction')}</span>{nextAction.title}</button>}
          </div>
        )}

        {editing && (
          <form onSubmit={event => { event.preventDefault(); saveEdit(project); }} className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`project-title-${project.id}`}>{t('projects.nameLabel')}</label>
            <input
              id={`project-title-${project.id}`}
              value={editTitle}
              onChange={event => { setEditTitle(event.target.value); setEditError(''); }}
              className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`project-outcome-${project.id}`}>{t('projects.outcomeLabel')}</label>
            <textarea
              id={`project-outcome-${project.id}`}
              value={editOutcome}
              onChange={event => { setEditOutcome(event.target.value); setEditError(''); }}
              rows={2}
              className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.statusLabel')}
                <select value={editStatus} onChange={event => setEditStatus(event.target.value as ProjectStatus)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_STATUSES.map(status => <option key={status} value={status}>{t(`projects.status.${status}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.healthLabel')}
                <select value={editHealth} onChange={event => setEditHealth(event.target.value as ProjectHealth)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_HEALTH.map(health => <option key={health} value={health}>{t(`projects.health.${health}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.targetLabel')}
                <input type="date" value={editTargetDate} onChange={event => setEditTargetDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.deadlineLabel')}
                <input type="date" value={editDeadline} onChange={event => setEditDeadline(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
            </div>
            <div className="mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.colorLabel')}</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className="w-7 h-7 rounded-full grid place-items-center border-2 transition-transform hover:scale-105"
                    style={{ background: color, borderColor: editColor === color ? 'var(--text)' : 'transparent' }}
                    aria-label={t('projects.colorOption', { n: index + 1 })}
                    aria-pressed={editColor === color}
                  >
                    {editColor === color && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            {editError && <p className="mt-2 text-[10px] text-red-500" role="alert">{editError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
              <button className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('common.save')}</button>
            </div>
          </form>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)]">
            <span>{t('projects.progress', { n: progress })}</span>
            <span>{t('projects.doneCount', { done: done.length, total: trackedTotal })}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: project.color }} />
          </div>
        </div>

        {(overdue > 0 || dueToday > 0 || nextDate) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {overdue > 0 && (
              <span className="h-7 px-2 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{t('projects.overdueCount', { n: overdue })}
              </span>
            )}
            {dueToday > 0 && (
              <span className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />{t('projects.todayCount', { n: dueToday })}
              </span>
            )}
            {nextDate && (
              <span className="h-7 px-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />{t('projects.nextDate', { date: format(parseISO(nextDate), 'MMM d', { locale }) })}
              </span>
            )}
          </div>
        )}

        {!isStoredAway && (
          <form onSubmit={event => { event.preventDefault(); addTask(project.id); }} className="mt-4 flex gap-2">
            <input
              value={taskTitles[project.id] || ''}
              onChange={event => setTaskTitles(current => ({ ...current, [project.id]: event.target.value }))}
              placeholder={t('projects.quickAddPlaceholder')}
              aria-label={t('projects.quickAddPlaceholder')}
              className="h-9 min-w-0 flex-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              disabled={!taskTitles[project.id]?.trim()}
              className="hit w-9 h-9 rounded-xl grid place-items-center text-white disabled:opacity-40"
              style={{ background: project.color }}
              aria-label={t('projects.addTask')}
              title={t('projects.addTask')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        )}

        {open.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {open.slice(0, 4).map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task.id)}
                className="w-full min-h-9 rounded-xl px-2.5 flex items-center gap-2 text-left hover:bg-[var(--surface-2)]"
                aria-label={t('projects.openTask', { title: task.title })}
              >
                <Circle className="w-3.5 h-3.5 shrink-0 text-[var(--text-mute)]" />
                <span className="text-[12px] text-[var(--text)] truncate flex-1">{task.title}</span>
                {actionableDate(task) && (
                  <span className={`text-[9px] shrink-0 ${task.dueDate && task.dueDate < today ? 'text-red-500' : 'text-[var(--text-dim)]'}`}>
                    {actionableDate(task) === today ? t('common.today') : format(parseISO(actionableDate(task)), 'MMM d', { locale })}
                  </span>
                )}
              </button>
            ))}
            {open.length > 4 && <div className="px-2.5 text-[10px] text-[var(--text-dim)]">{t('projects.moreTasks', { n: open.length - 4 })}</div>}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--text-dim)] flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />{t('projects.noOpenTasks')}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-7 pb-32">
      <header className="anim-fade">
        <button onClick={onBack} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />{t('overview.manage')}
        </button>
        <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('projects.title')}</h1>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{t('projects.subtitle')}</p>
      </header>

      <form onSubmit={event => { event.preventDefault(); create(); }} className="tcard p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-2">
          <input
            value={title}
            onChange={event => { setTitle(event.target.value); setCreateError(''); }}
            placeholder={t('projects.namePlaceholder')}
            aria-label={t('projects.namePlaceholder')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <input
            value={outcome}
            onChange={event => { setOutcome(event.target.value); setCreateError(''); }}
            placeholder={t('projects.outcomePlaceholder')}
            aria-label={t('projects.outcomeLabel')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[.99] transition-transform">
            <Plus className="w-4 h-4" />{t('projects.create')}
          </button>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
          {t('projects.targetLabel')}
          <input
            type="date"
            value={targetDate}
            onChange={event => setTargetDate(event.target.value)}
            className="mt-1.5 h-10 w-full max-w-[220px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
        </label>
        {createError && <p className="mt-2 text-[10px] text-red-500" role="alert">{createError}</p>}
      </form>

      {active.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">{active.map(renderProject)}</section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
          <Folder className="w-10 h-10 mx-auto text-[var(--primary)]/30" />
          <h2 className="mt-3 text-[15px] font-bold text-[var(--text)]">{t('projects.emptyTitle')}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">{t('projects.emptySubtitle')}</p>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{t('projects.archived')}</h2>
          <p className="-mt-1 mb-3 text-[11px] text-[var(--text-dim)]">{t('projects.archivedHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-75">{archived.map(renderProject)}</div>
        </section>
      )}
    </div>
  );
}
