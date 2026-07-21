import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Archive, ArrowLeft, CalendarDays, Pencil, RotateCcw, X,
} from 'lucide-react';
import { PROJECT_COLORS, nextReviewDateAfter, deriveProjectHealth } from '../domain/projects';
import { localDateKey } from '../domain/date';
import { useDateLocale, useT } from '../i18n';
import { useStore } from '../store';
import type { Project, ProjectHealth, ProjectReviewCadence, ProjectStatus } from '../types';
import type { ProjectSection } from '../domain/projects';
import { ProjectSectionBoard } from './ProjectSectionBoard';
import { parseTaskCapture } from '../utils/taskCapture';

const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'planned', 'active', 'waiting', 'paused', 'completed', 'canceled'];
const PROJECT_HEALTHS: ProjectHealth[] = ['unknown', 'on-track', 'at-risk', 'blocked'];
const REVIEW_CADENCES: ProjectReviewCadence[] = ['none', 'weekly', 'biweekly', 'monthly'];

const SECTION_STATUS: Record<Exclude<ProjectSection, 'waiting'>, 'someday-maybe' | 'next-action' | 'scheduled' | 'done'> = {
  backlog: 'someday-maybe', next: 'next-action', scheduled: 'scheduled', done: 'done',
};

export function ProjectDetailView({ project, onBack }: { project: Project; onBack: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const {
    gtdTasks, goals, areas, updateProject, captureTask, updateTask, processTask, openEditTask, setActiveView, askConfirm,
  } = useStore();
  const today = localDateKey();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editOutcome, setEditOutcome] = useState(project.outcome);
  const [editDefinitionOfDone, setEditDefinitionOfDone] = useState(project.definitionOfDone || '');
  const [editNotes, setEditNotes] = useState(project.notes || '');
  const [editStatus, setEditStatus] = useState<ProjectStatus>(project.status === 'archived' ? 'active' : project.status);
  const [editHealth, setEditHealth] = useState<ProjectHealth>(project.health || 'unknown');
  const [editTargetDate, setEditTargetDate] = useState(project.targetDate || '');
  const [editDeadline, setEditDeadline] = useState(project.deadline || '');
  const [editColor, setEditColor] = useState(project.color);
  const [editGoalId, setEditGoalId] = useState(project.goalId || '');
  const [editAreaId, setEditAreaId] = useState(project.areaId || '');
  const [editReviewCadence, setEditReviewCadence] = useState<ProjectReviewCadence>(project.reviewCadence || 'none');
  const [editNextReviewDate, setEditNextReviewDate] = useState(project.nextReviewDate || '');
  const [editError, setEditError] = useState('');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewHealth, setReviewHealth] = useState<ProjectHealth>(project.health || 'unknown');
  const [reviewOutcome, setReviewOutcome] = useState(project.outcome);

  const tasks = gtdTasks.filter(task => task.projectId === project.id && task.status !== 'trash' && !task.isArchived);
  const done = tasks.filter(task => task.status === 'done');
  const progress = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const displayHealth = deriveProjectHealth(project, tasks, today);
  const isStoredAway = project.status === 'archived' || project.status === 'completed' || project.status === 'canceled';
  const goal = project.goalId ? goals.find(g => g.id === project.goalId) : undefined;
  const area = project.areaId ? areas.find(a => a.id === project.areaId) : undefined;

  const startEdit = () => {
    setEditTitle(project.title);
    setEditOutcome(project.outcome);
    setEditDefinitionOfDone(project.definitionOfDone || '');
    setEditNotes(project.notes || '');
    setEditStatus(project.status === 'archived' ? 'active' : project.status);
    setEditHealth(project.health || 'unknown');
    setEditTargetDate(project.targetDate || '');
    setEditDeadline(project.deadline || '');
    setEditColor(project.color);
    setEditGoalId(project.goalId || '');
    setEditAreaId(project.areaId || '');
    setEditReviewCadence(project.reviewCadence || 'none');
    setEditNextReviewDate(project.nextReviewDate || '');
    setEditError('');
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditError(t('projects.nameRequired')); return; }
    const trimmedOutcome = editOutcome.trim();
    if (!trimmedOutcome) { setEditError(t('projects.outcomeRequired')); return; }
    updateProject(project.id, {
      title: trimmed,
      outcome: trimmedOutcome,
      definitionOfDone: editDefinitionOfDone,
      notes: editNotes,
      status: editStatus,
      health: editHealth,
      targetDate: editTargetDate || undefined,
      deadline: editDeadline || undefined,
      color: editColor,
      goalId: editGoalId,
      areaId: editAreaId,
      reviewCadence: editReviewCadence,
      nextReviewDate: editNextReviewDate || undefined,
    });
    setEditing(false);
  };

  const toggleArchive = () => {
    if (isStoredAway) { updateProject(project.id, { status: 'active' }); return; }
    askConfirm({
      title: t('projects.archiveConfirmTitle', { title: project.title }),
      message: t('projects.archiveConfirmMessage', { n: tasks.filter(task => task.status !== 'done').length }),
      confirmLabel: t('projects.archiveAction'),
      onConfirm: () => updateProject(project.id, { status: 'archived' }),
    });
  };

  const submitReview = () => {
    const next = editReviewCadenceForReview();
    updateProject(project.id, { health: reviewHealth, outcome: reviewOutcome.trim() || project.outcome, ...(next ? { nextReviewDate: next } : {}) });
    setReviewOpen(false);
  };
  function editReviewCadenceForReview() {
    return project.reviewCadence && project.reviewCadence !== 'none' ? nextReviewDateAfter(project.reviewCadence, today) : undefined;
  }

  const openTask = (taskId: string) => { setActiveView('inbox'); openEditTask(taskId); };

  const onMoveTask = (taskId: string, section: ProjectSection, blockingReason?: string) => {
    if (section === 'waiting') { updateTask(taskId, { blockingReason: blockingReason || '' }); return; }
    updateTask(taskId, { blockingReason: undefined });
    processTask(taskId, SECTION_STATUS[section]);
  };

  const onQuickAdd = (section: 'backlog' | 'next' | 'scheduled', input: string) => {
    const parsed = parseTaskCapture(input);
    const taskId = captureTask(parsed.title, parsed.durationMinutes);
    updateTask(taskId, {
      projectId: project.id,
      status: SECTION_STATUS[section],
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.context ? { context: parsed.context } : {}),
      ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.remindAt ? { remindAt: parsed.remindAt } : {}),
      ...(parsed.recurring ? { recurring: parsed.recurring } : {}),
    });
  };

  const healthClass = displayHealth === 'blocked'
    ? 'bg-red-500/10 text-red-500'
    : displayHealth === 'at-risk'
      ? 'bg-amber-500/10 text-amber-600'
      : displayHealth === 'on-track'
        ? 'bg-emerald-500/10 text-emerald-600'
        : 'bg-[var(--surface-2)] text-[var(--text-dim)]';

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-5 pb-32">
      <button onClick={onBack} className="hit h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
        <ArrowLeft className="w-4 h-4" />{t('projects.detail.back')}
      </button>

      <div className="tcard p-5" style={{ borderTop: `3px solid ${project.color}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[22px] font-bold text-[var(--text)] truncate">{project.title}</h1>
              <span className={`h-5 px-2 rounded-full text-[9px] font-bold ${healthClass}`}>{t(`projects.health.${displayHealth}`)}</span>
              <span className="h-5 px-2 rounded-full bg-[var(--surface-2)] text-[var(--text-dim)] text-[9px] font-bold">{t(`projects.status.${project.status}`)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => editing ? setEditing(false) : startEdit()} className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label={editing ? t('common.cancel') : t('projects.edit')}>
              {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button type="button" onClick={toggleArchive} className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              {!isStoredAway ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              <span className="hidden sm:inline">{!isStoredAway ? t('projects.archiveAction') : t('projects.restoreAction')}</span>
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={event => { event.preventDefault(); saveEdit(); }} className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-title">{t('projects.nameLabel')}</label>
              <input id="pd-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-outcome">{t('projects.outcomeLabel')}</label>
              <textarea id="pd-outcome" value={editOutcome} onChange={event => setEditOutcome(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-dod">{t('projects.detail.definitionOfDoneLabel')}</label>
              <textarea id="pd-dod" value={editDefinitionOfDone} onChange={event => setEditDefinitionOfDone(event.target.value)} rows={2} placeholder={t('projects.detail.definitionOfDonePlaceholder')} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-notes">{t('projects.detail.notesLabel')}</label>
              <textarea id="pd-notes" value={editNotes} onChange={event => setEditNotes(event.target.value)} rows={3} placeholder={t('projects.detail.notesPlaceholder')} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.statusLabel')}
                <select value={editStatus} onChange={event => setEditStatus(event.target.value as ProjectStatus)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_STATUSES.map(status => <option key={status} value={status}>{t(`projects.status.${status}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.healthLabel')}
                <select value={editHealth} onChange={event => setEditHealth(event.target.value as ProjectHealth)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_HEALTHS.map(health => <option key={health} value={health}>{t(`projects.health.${health}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.targetLabel')}
                <input type="date" value={editTargetDate} onChange={event => setEditTargetDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.deadlineLabel')}
                <input type="date" value={editDeadline} onChange={event => setEditDeadline(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.detail.goalLabel')}
                <select value={editGoalId} onChange={event => setEditGoalId(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  <option value="">{t('projects.detail.noGoal')}</option>
                  {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.detail.areaLabel')}
                <select value={editAreaId} onChange={event => setEditAreaId(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  <option value="">{t('projects.detail.noArea')}</option>
                  {areas.filter(a => !a.archivedAt).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.cadenceLabel')}
                <select value={editReviewCadence} onChange={event => setEditReviewCadence(event.target.value as ProjectReviewCadence)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {REVIEW_CADENCES.map(cadence => <option key={cadence} value={cadence}>{t(`projects.review.cadence.${cadence}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.nextReviewLabel')}
                <input type="date" value={editNextReviewDate} onChange={event => setEditNextReviewDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.colorLabel')}</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color, index) => (
                  <button key={color} type="button" onClick={() => setEditColor(color)} className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-105" style={{ background: color, borderColor: editColor === color ? 'var(--text)' : 'transparent' }} aria-label={t('projects.colorOption', { n: index + 1 })} aria-pressed={editColor === color} />
                ))}
              </div>
            </div>
            {editError && <p className="text-[10px] text-red-500" role="alert">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
              <button className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('common.save')}</button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.outcomeLabel')}</p>
              <p className="text-[13px] text-[var(--text)]">{project.outcome || t('projects.outcomeMissing')}</p>
              {project.definitionOfDone && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mt-2">{t('projects.detail.definitionOfDoneLabel')}</p>
                  <p className="text-[13px] text-[var(--text)]">{project.definitionOfDone}</p>
                </>
              )}
              {project.notes && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mt-2">{t('projects.detail.notesLabel')}</p>
                  <p className="text-[13px] text-[var(--text)] whitespace-pre-wrap">{project.notes}</p>
                </>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.targetDate && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{t('projects.target', { date: format(parseISO(project.targetDate), 'MMM d', { locale }) })}</span>}
                {project.deadline && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{t('projects.deadline', { date: format(parseISO(project.deadline), 'MMM d', { locale }) })}</span>}
                <button type="button" onClick={() => goal && setActiveView('goals')} disabled={!goal} className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold disabled:opacity-60">{t('projects.detail.goalLabel')}: {goal?.title || t('projects.detail.noGoal')}</button>
                <button type="button" onClick={() => setActiveView('areas')} className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold">{t('projects.detail.areaLabel')}: {area?.title || t('projects.detail.noArea')}</button>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.cadenceLabel')}</p>
                  <p className="text-[12px] text-[var(--text)] mt-0.5">{t(`projects.review.cadence.${project.reviewCadence || 'none'}`)}{project.nextReviewDate ? ` · ${t('projects.review.nextReviewLabel')}: ${format(parseISO(project.nextReviewDate), 'MMM d', { locale })}` : ''}</p>
                </div>
                <button type="button" onClick={() => { setReviewHealth(project.health || 'unknown'); setReviewOutcome(project.outcome); setReviewOpen(true); }} className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('projects.review.reviewNow')}</button>
              </div>
              {reviewOpen && (
                <div className="mt-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2">
                  <p className="text-[12px] font-bold text-[var(--text)]">{t('projects.review.modalTitle', { title: project.title })}</p>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.modalHealthLabel')}
                    <select value={reviewHealth} onChange={event => setReviewHealth(event.target.value as ProjectHealth)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                      {PROJECT_HEALTHS.map(health => <option key={health} value={health}>{t(`projects.health.${health}`)}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.modalOutcomeLabel')}
                    <textarea value={reviewOutcome} onChange={event => setReviewOutcome(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setReviewOpen(false)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{t('common.cancel')}</button>
                    <button type="button" onClick={submitReview} className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('projects.review.modalSave')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)]">
            <span>{t('projects.progress', { n: progress })}</span>
            <span>{t('projects.doneCount', { done: done.length, total: tasks.length })}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: project.color }} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-bold text-[var(--text)] mb-3">{t('projects.detail.boardTitle')}</h2>
        <ProjectSectionBoard tasks={tasks} accentColor={project.color} onMoveTask={onMoveTask} onQuickAdd={onQuickAdd} onOpenTask={openTask} />
      </div>
    </div>
  );
}
