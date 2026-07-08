import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Search, X, Target, Flame, CheckCircle2, Clock } from 'lucide-react';
import { useStore } from '../store';
import { useT, useDateLocale } from '../i18n';
import { useBackClose } from '../hooks/useHardwareBack';

/** Global search across tasks, goals, habits and sessions. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { gtdTasks, goals, habits, sessions } = useStore();
  useBackClose(open, onClose);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (needle.length < 2) return null;
    const has = (s?: string) => !!s && s.toLowerCase().includes(needle);
    return {
      tasks: gtdTasks.filter(x => x.status !== 'trash' && !x.isArchived &&
        (has(x.title) || has(x.notes) || has(x.description) || (x.tags || []).some(tg => tg.toLowerCase().includes(needle)))).slice(0, 8),
      goals: goals.filter(g => has(g.title) || has(g.subtitle)).slice(0, 6),
      habits: habits.filter(h => !h.archived && has(h.title)).slice(0, 6),
      sessions: sessions.filter(s => has(s.title)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8),
    };
  }, [needle, gtdTasks, goals, habits, sessions]);

  if (!open) return null;

  const go = (fn: () => void) => { fn(); onClose(); };
  const st = () => useStore.getState();
  const empty = results && !results.tasks.length && !results.goals.length && !results.habits.length && !results.sessions.length;

  const section = (label: string, items: React.ReactNode) => (
    <div>
      <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest px-1 mb-1.5">{label}</div>
      <div className="space-y-1">{items}</div>
    </div>
  );
  const row = (key: string, icon: React.ReactNode, title: string, sub: string | undefined, onClick: () => void) => (
    <button key={key} onClick={onClick} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-[var(--text)] truncate">{title}</span>
        {sub && <span className="block text-[11px] text-[var(--text-dim)] truncate">{sub}</span>}
      </span>
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 anim-backdrop" onClick={onClose} />
      <div className="fixed inset-x-0 top-0 z-50 px-3 pt-[calc(env(safe-area-inset-top)+12px)] pointer-events-none">
        <div onClick={e => e.stopPropagation()} className="pointer-events-auto mx-auto w-full max-w-[560px] rounded-[24px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden anim-sheet" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border)]">
            <Search className="w-[18px] h-[18px] text-[var(--text-dim)] shrink-0" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
              placeholder={t('search.placeholder')}
              className="flex-1 bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none" />
            <button onClick={onClose} aria-label={t('common.close')} className="w-8 h-8 grid place-items-center rounded-full text-[var(--text-dim)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
          </div>
          {results && (
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
              {empty && <div className="text-[13px] text-[var(--text-dim)] text-center py-6">{t('search.noResults')}</div>}
              {results.tasks.length > 0 && section(t('search.tasks'), results.tasks.map(x =>
                row(x.id, <CheckCircle2 className="w-4 h-4 text-[#0d9488]" />, x.title,
                  x.dueDate ? format(parseISO(x.dueDate), 'd MMM', { locale }) : undefined,
                  () => go(() => { st().setActiveView('inbox'); st().openEditTask(x.id); }))))}
              {results.goals.length > 0 && section(t('search.goals'), results.goals.map(g =>
                row(g.id, <Target className="w-4 h-4" style={{ color: g.color }} />, `${g.emoji} ${g.title}`, g.subtitle,
                  () => go(() => { st().setPendingGoalId(g.id); st().setActiveView('goals'); }))))}
              {results.habits.length > 0 && section(t('search.habits'), results.habits.map(h =>
                row(h.id, <Flame className="w-4 h-4 text-[#e0532f]" />, `${h.emoji} ${h.title}`, undefined,
                  () => go(() => st().setActiveView('habits')))))}
              {results.sessions.length > 0 && section(t('search.sessions'), results.sessions.map(s =>
                row(s.id, <Clock className="w-4 h-4 text-[var(--primary)]" />, s.title,
                  s.date ? format(parseISO(s.date), 'd MMM yyyy', { locale }) : undefined,
                  () => go(() => st().openSessionModal(s.id)))))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
