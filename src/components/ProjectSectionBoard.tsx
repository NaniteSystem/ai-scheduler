import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { deriveProjectSection } from '../domain/projects';
import type { ProjectSection } from '../domain/projects';
import { useDateLocale, useT } from '../i18n';
import type { GTDTask } from '../types';

interface ProjectSectionBoardProps {
  tasks: GTDTask[];
  accentColor: string;
  onMoveTask: (taskId: string, section: ProjectSection, blockingReason?: string) => void;
  onQuickAdd: (section: 'backlog' | 'next' | 'scheduled', title: string) => void;
  onOpenTask: (taskId: string) => void;
}

const SECTIONS: ProjectSection[] = ['backlog', 'next', 'waiting', 'scheduled', 'done'];
const QUICK_ADD_SECTIONS = new Set<ProjectSection>(['backlog', 'next', 'scheduled']);

const actionableDate = (task: GTDTask) => task.scheduledDate || task.dueDate || '';

export function ProjectSectionBoard({ tasks, accentColor, onMoveTask, onQuickAdd, onOpenTask }: ProjectSectionBoardProps) {
  const t = useT();
  const locale = useDateLocale();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [waitingPromptTaskId, setWaitingPromptTaskId] = useState<string | null>(null);
  const [waitingReason, setWaitingReason] = useState('');
  const [quickAddValue, setQuickAddValue] = useState<Record<string, string>>({});

  const byColumn = new Map<ProjectSection, GTDTask[]>(SECTIONS.map(section => [section, []]));
  for (const task of tasks) byColumn.get(deriveProjectSection(task))!.push(task);

  const requestMove = (taskId: string, section: ProjectSection) => {
    if (section === 'waiting') {
      setWaitingPromptTaskId(taskId);
      setWaitingReason('');
      return;
    }
    onMoveTask(taskId, section);
  };

  const confirmWaiting = () => {
    const reason = waitingReason.trim();
    if (!reason || !waitingPromptTaskId) return;
    onMoveTask(waitingPromptTaskId, 'waiting', reason);
    setWaitingPromptTaskId(null);
    setWaitingReason('');
  };

  const submitQuickAdd = (section: 'backlog' | 'next' | 'scheduled') => {
    const value = (quickAddValue[section] || '').trim();
    if (!value) return;
    onQuickAdd(section, value);
    setQuickAddValue(current => ({ ...current, [section]: '' }));
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {SECTIONS.map(section => (
          <div
            key={section}
            onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); if (draggedId) requestMove(draggedId, section); }}
            className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-2.5 min-h-[140px]"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] px-1 mb-2">{t(`projects.detail.section.${section}`)} · {byColumn.get(section)!.length}</p>
            <div className="space-y-1.5">
              {byColumn.get(section)!.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={() => setDraggedId(null)}
                  className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-2 cursor-grab active:cursor-grabbing"
                >
                  <button type="button" onClick={() => onOpenTask(task.id)} className="w-full text-left text-[12px] text-[var(--text)] truncate">{task.title}</button>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    {actionableDate(task) ? (
                      <span className="text-[9px] text-[var(--text-dim)]">{format(parseISO(actionableDate(task)), 'MMM d', { locale })}</span>
                    ) : <span />}
                    <select
                      value={section}
                      onChange={event => requestMove(task.id, event.target.value as ProjectSection)}
                      aria-label={t('projects.detail.moveTo', { section: t(`projects.detail.section.${section}`) })}
                      className="h-6 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[9px] text-[var(--text-dim)] px-1 sm:hidden"
                    >
                      {SECTIONS.map(option => <option key={option} value={option}>{t(`projects.detail.section.${option}`)}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {byColumn.get(section)!.length === 0 && (
                <p className="px-1 text-[10px] text-[var(--text-dim)]">{t('projects.detail.emptySection')}</p>
              )}
            </div>
            {QUICK_ADD_SECTIONS.has(section) && (
              <form
                onSubmit={event => { event.preventDefault(); submitQuickAdd(section as 'backlog' | 'next' | 'scheduled'); }}
                className="mt-2 flex gap-1"
              >
                <input
                  value={quickAddValue[section] || ''}
                  onChange={event => setQuickAddValue(current => ({ ...current, [section]: event.target.value }))}
                  placeholder={t('projects.quickAddPlaceholder')}
                  aria-label={t('projects.quickAddPlaceholder')}
                  className="h-8 min-w-0 flex-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 text-[11px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  disabled={!(quickAddValue[section] || '').trim()}
                  aria-label={t('projects.addTask')}
                  className="hit w-8 h-8 rounded-lg grid place-items-center text-white disabled:opacity-40"
                  style={{ background: accentColor }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {waitingPromptTaskId && (
        <div className="mt-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
          <p className="text-[11px] font-bold text-[var(--text)]">{t('projects.detail.waitingPromptTitle')}</p>
          <form onSubmit={event => { event.preventDefault(); confirmWaiting(); }} className="mt-2 flex gap-2">
            <input
              value={waitingReason}
              onChange={event => setWaitingReason(event.target.value)}
              placeholder={t('projects.detail.waitingPromptPlaceholder')}
              aria-label={t('projects.detail.waitingPromptTitle')}
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
            />
            <button type="button" onClick={() => setWaitingPromptTaskId(null)} className="h-9 px-3 rounded-xl text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
            <button disabled={!waitingReason.trim()} className="h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-[11px] font-bold disabled:opacity-40">{t('projects.detail.waitingPromptConfirm')}</button>
          </form>
        </div>
      )}
    </div>
  );
}
