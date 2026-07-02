import { useState } from 'react';
import { useStore } from '../store';
import { useT, useDateLocale } from '../i18n';
import { Archive, Trash2, CheckCircle2, Search, Clock, RotateCcw, Target, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';

export function ArchiveView({ onBack }: { onBack?: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const { gtdTasks, goals, processTask, updateGoal } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'done' | 'trash'>('all');
  const filterLabel: Record<string, string> = { all: t('archive.filterAll'), done: t('archive.filterDone'), trash: t('archive.filterTrash') };
  const statusLabel: Record<string, string> = { done: t('archive.statusDone'), trash: t('archive.statusTrash'), inbox: t('archive.statusInbox') };

  const taskItems = gtdTasks
    .filter(t => t.isArchived || t.status === 'done' || t.status === 'trash')
    .filter(t => filter === 'all' || t.status === filter)
    .filter(t => !q || t.title.toLowerCase().includes(q.toLowerCase()))
    .map((task) => ({ kind: 'task' as const, task, date: task.updatedAt || task.completedAt || task.createdAt }));
  const goalItems = goals
    .filter(g => g.status === 'completed')
    .filter(() => filter === 'all' || filter === 'done')
    .filter(g => !q || g.title.toLowerCase().includes(q.toLowerCase()))
    .map((goal) => ({ kind: 'goal' as const, goal, date: goal.completedAt || '' }));
  const filtered = [...taskItems, ...goalItems].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      <div className="px-4 md:px-8 py-5 md:py-6 border-b border-[var(--surface-2)] shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 md:mb-6">
          <div className="flex items-center gap-3">
            {onBack && <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] shrink-0" aria-label={t('bottomNav.stats')}><ChevronLeft className="w-4 h-4" /></button>}
            <div className="w-10 h-10 rounded-xl bg-[var(--border)] flex items-center justify-center">
              <Archive className="w-5 h-5 text-[var(--text-dim)]" />
            </div>
            <div>
              <h1 className="display text-[22px] md:text-[28px] text-[var(--text)]">{t('archive.title')}</h1>
              <p className="text-[12px] text-[var(--text-dim)]">{t('archive.subtitle')}</p>
            </div>
          </div>
          <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
            {['all', 'done', 'trash'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                  filter === f ? 'bg-[var(--border)] text-[var(--text)] shadow-lg' : 'text-[var(--text-dim)] hover:text-[var(--text-dim)]'
                }`}
              >
                {filterLabel[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('archive.search')}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--border)] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-[calc(env(safe-area-inset-bottom)+128px)] md:pb-6 max-w-5xl mx-auto w-full space-y-3">
        {filtered.map((item) => {
          if (item.kind === 'goal') {
            const goal = item.goal;
            return (
              <div key={`g-${goal.id}`} className="card p-4 group flex items-start gap-4">
                <div className="mt-1 shrink-0 text-emerald-500"><Target className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-[var(--text)]">{goal.emoji} {goal.title}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {goal.completedAt && <span className="flex items-center gap-1 text-[10px] text-emerald-500/60"><CheckCircle2 className="w-3 h-3" /> {t('archive.done', { d: format(new Date(goal.completedAt), 'MMM d', { locale }) })}</span>}
                    <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{goal.outcome === 'failed' ? t('goals.outcomeFailed') : t('goals.outcomeSuccess')}</span>
                  </div>
                </div>
                <button onClick={() => updateGoal(goal.id, { status: 'active', outcome: undefined, completedAt: undefined })} className="hover-actions h-8 px-3 rounded-lg border border-[var(--border)] text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-1.5">
                  <RotateCcw className="w-3 h-3" /> {t('archive.restore')}
                </button>
              </div>
            );
          }
          const task = item.task;
          return (
          <div key={`t-${task.id}`} className="card p-4 group flex items-start gap-4">
            <div className={`mt-1 shrink-0 ${task.status === 'done' ? 'text-emerald-500' : 'text-red-500'}`}>
              {task.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium text-[var(--text)]">{task.title}</div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
                  <Clock className="w-3 h-3" /> {t('archive.created', { d: format(new Date(task.createdAt), 'MMM d, HH:mm', { locale }) })}
                </span>
                {task.completedAt && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-500/60">
                    <CheckCircle2 className="w-3 h-3" /> {t('archive.done', { d: format(new Date(task.completedAt), 'MMM d', { locale }) })}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">
                  {statusLabel[task.status] || task.status}
                </span>
              </div>
            </div>
            <button
              onClick={() => processTask(task.id, 'inbox')}
              className="hover-actions h-8 px-3 rounded-lg border border-[var(--border)] text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> {t('archive.restore')}
            </button>
          </div>
        );})}

        {filtered.length === 0 && (
          <div className="py-24 text-center">
            <div className="text-4xl mb-4 opacity-20">📜</div>
            <p className="text-[var(--text-dim)] text-[13px]">{t('archive.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
