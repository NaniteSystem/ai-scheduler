import { useState } from 'react';
import { useStore, habitDueOn, habitStreak, habitBestStreak, habitRate, habitHeatmap, dailyCompletion } from '../store';
import { useT } from '../i18n';
import type { Habit, HabitAnchor, HabitRecurrence } from '../types';
import { Drawer } from './ui/Drawer';
import { SelectMenu } from './ui/SelectMenu';
import { TimePicker } from './ui/TimePicker';
import { format, addDays } from 'date-fns';
import { Plus, Check, X, Moon, Flame, Repeat, Edit2, Trash2, RotateCcw, Target, BarChart3, Trophy, Award, LayoutGrid, ChevronLeft } from 'lucide-react';

type TplHabit = { key: string; emoji: string; color: string; anchor: HabitAnchor; recurrence: HabitRecurrence; targetCount: number; unitKey?: string };
const TEMPLATES: { id: string; emoji: string; habits: TplHabit[] }[] = [
  { id: 'morning', emoji: '🌅', habits: [
    { key: 'water', emoji: '💧', color: '#06b6d4', anchor: 'wake', recurrence: 'daily', targetCount: 1 },
    { key: 'meditate', emoji: '🧘', color: '#8b5cf6', anchor: 'wake', recurrence: 'daily', targetCount: 1 },
    { key: 'stretch', emoji: '🤸', color: '#22c55e', anchor: 'wake', recurrence: 'daily', targetCount: 1 },
    { key: 'plan', emoji: '📝', color: '#3b82f6', anchor: 'afterBreakfast', recurrence: 'daily', targetCount: 1 },
  ] },
  { id: 'body', emoji: '💪', habits: [
    { key: 'exercise', emoji: '🏋️', color: '#22c55e', anchor: 'evening', recurrence: 'weekdays', targetCount: 1 },
    { key: 'water8', emoji: '💧', color: '#06b6d4', anchor: 'morning', recurrence: 'daily', targetCount: 8, unitKey: 'tpl.unit.glasses' },
    { key: 'veggies', emoji: '🥗', color: '#10b981', anchor: 'afterLunch', recurrence: 'daily', targetCount: 1 },
    { key: 'sleepEarly', emoji: '😴', color: '#6366f1', anchor: 'sleep', recurrence: 'daily', targetCount: 1 },
  ] },
  { id: 'focus', emoji: '🧠', habits: [
    { key: 'read', emoji: '📚', color: '#f59e0b', anchor: 'morning', recurrence: 'daily', targetCount: 1 },
    { key: 'noSocial', emoji: '📵', color: '#ef4444', anchor: 'morning', recurrence: 'daily', targetCount: 1 },
    { key: 'deepWork', emoji: '🎯', color: '#3b82f6', anchor: 'afternoon', recurrence: 'weekdays', targetCount: 1 },
    { key: 'journal', emoji: '✍️', color: '#a855f7', anchor: 'sleep', recurrence: 'daily', targetCount: 1 },
  ] },
];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899'];
const EMOJI_SUGGESTIONS = ['💧', '💪', '📖', '🧘', '🏃', '🥗', '💊', '😴', '☀️', '🦷', '🚶', '✍️', '🎯', '🌱', '🧹', '🎧', '☕', '🚭', '🙏', '🎨'];
const ANCHORS: HabitAnchor[] = ['wake', 'afterBreakfast', 'morning', 'afterLunch', 'afternoon', 'afterDinner', 'evening', 'sleep', 'none'];
const RECURRENCES: HabitRecurrence[] = ['daily', 'weekdays', 'weekends', 'weekly', 'everyN'];
const hmToMin = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const minToHm = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;

export function HabitsView({ onBack }: { onBack?: () => void }) {
  const tr = useT();
  const { habits, goals, setHabitStatus, incHabit, clearHabitDay } = useStore();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [templates, setTemplates] = useState(false);
  const [tab, setTab] = useState<'today' | 'stats'>('today');

  const today = format(new Date(), 'yyyy-MM-dd');
  const active = habits.filter(h => !h.archived);
  const due = active.filter(h => habitDueOn(h, new Date()));
  const others = active.filter(h => !habitDueOn(h, new Date()));
  const allDone = due.length > 0 && due.every(h => h.log[today]?.status === 'done');

  // group due habits by anchor (in ANCHORS order)
  // Habits with a missing/unknown anchor (older data) fall into the 'none' bucket instead of vanishing.
  const anchorOf = (h: Habit): HabitAnchor => (ANCHORS.includes(h.anchor) ? h.anchor : 'none');
  const grouped = ANCHORS.map(a => ({ anchor: a, items: due.filter(h => anchorOf(h) === a) })).filter(g => g.items.length > 0);

  const HabitRow = ({ h, dim = false }: { h: Habit; dim?: boolean }) => {
    const entry = h.log[today];
    const status = entry?.status;
    const count = entry?.count || 0;
    const isCounter = h.targetCount > 1;
    const streak = habitStreak(h);
    return (
      <div className={`card p-4 flex items-center gap-3 ${dim ? 'opacity-50' : ''}`}>
        <div className="w-10 h-10 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: `${h.color}22` }}>{h.emoji || '✅'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[14px] font-bold truncate ${status === 'done' ? 'text-emerald-300' : status === 'failed' ? 'text-red-300' : 'text-[var(--text)]'}`}>{h.title}</span>
            {streak > 0 && <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-500 shrink-0"><Flame className="w-3 h-3" />{streak}</span>}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5 flex items-center gap-1.5">
            <Repeat className="w-3 h-3" />{tr('habits.rec.' + (h.recurrence || 'daily'))}
            {isCounter && <span>· {count}/{h.targetCount}{h.unit ? ' ' + h.unit : ''}</span>}
            {h.goalId && goals.find(g => g.id === h.goalId) && <span>· {goals.find(g => g.id === h.goalId)!.emoji}</span>}
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isCounter ? (
            <>
              {count > 0 && <button onClick={() => clearHabitDay(h.id, today)} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--border)]"><RotateCcw className="w-3.5 h-3.5" /></button>}
              <button onClick={() => incHabit(h.id, today)} className="h-9 px-3 rounded-xl text-[13px] font-bold flex items-center gap-1.5 transition-colors"
                style={status === 'done' ? { background: '#22c55e', color: '#000' } : { background: `${h.color}22`, color: h.color }}>
                <Plus className="w-4 h-4" />{count}/{h.targetCount}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setHabitStatus(h.id, today, status === 'done' ? 'rest' : 'done')} title={tr('habits.done')}
                className={`w-9 h-9 rounded-xl grid place-items-center transition-colors ${status === 'done' ? 'bg-emerald-500 text-black' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-emerald-400'}`}>
                <Check className="w-4 h-4" strokeWidth={3} />
              </button>
              <button onClick={() => setHabitStatus(h.id, today, status === 'rest' ? 'done' : 'rest')} title={tr('habits.rest')}
                className={`w-9 h-9 rounded-xl grid place-items-center transition-colors ${status === 'rest' ? 'bg-amber-500 text-black' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-amber-400'}`}>
                <Moon className="w-4 h-4" />
              </button>
              <button onClick={() => setHabitStatus(h.id, today, status === 'failed' ? 'done' : 'failed')} title={tr('habits.failed')}
                className={`w-9 h-9 rounded-xl grid place-items-center transition-colors ${status === 'failed' ? 'bg-red-500 text-white' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-red-400'}`}>
                <X className="w-4 h-4" strokeWidth={3} />
              </button>
            </>
          )}
          <button onClick={() => setEditing(h)} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--border)]"><Edit2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg)] overflow-y-auto">
      <div className="px-4 md:px-10 py-6 md:py-8 max-w-[820px] w-full mx-auto space-y-6 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-3 anim-fade">
          <div>
            {onBack && <button onClick={onBack} className="mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]"><ChevronLeft className="w-4 h-4" />{tr('bottomNav.stats')}</button>}
            <h1 className="display text-[28px] md:text-[44px] text-[var(--text)] leading-none">{tr('habits.title')}</h1>
            <p className="text-[13px] text-[var(--text-dim)] mt-1.5">{tr('habits.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setTemplates(true)} className="h-10 px-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold flex items-center gap-1.5 hover:text-[var(--text)] hover:border-[var(--border)] transition-colors"><LayoutGrid className="w-4 h-4" />{tr('habits.templates')}</button>
            <button onClick={() => setEditing('new')} className="h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--primary)] transition-colors"><Plus className="w-4 h-4" />{tr('habits.new')}</button>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] w-fit anim-fade">
          <button onClick={() => setTab('today')} className={`h-9 px-4 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors ${tab === 'today' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}><Check className="w-4 h-4" />{tr('habits.tabToday')}</button>
          <button onClick={() => setTab('stats')} className={`h-9 px-4 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition-colors ${tab === 'stats' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}><BarChart3 className="w-4 h-4" />{tr('habits.tabStats')}</button>
        </div>

        {tab === 'stats' && (active.length > 0
          ? <HabitsStats habits={active} />
          : <div className="card border-dashed p-10 text-center text-[13px] text-[var(--text-dim)] anim-fade">{tr('habits.statsEmpty')}</div>)}

        {tab === 'today' && active.length === 0 && (
          <div className="card border-dashed p-12 text-center anim-fade">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 grid place-items-center mx-auto mb-4"><Target className="w-6 h-6 text-[var(--primary)]" /></div>
            <h3 className="text-[16px] font-bold text-[var(--text)] mb-1">{tr('habits.empty')}</h3>
            <p className="text-[13px] text-[var(--text-dim)] mb-4">{tr('habits.emptyDesc')}</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setEditing('new')} className="h-10 px-5 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold inline-flex items-center gap-2 hover:bg-[var(--primary)]"><Plus className="w-4 h-4" />{tr('habits.new')}</button>
              <button onClick={() => setTemplates(true)} className="h-10 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold inline-flex items-center gap-2 hover:text-[var(--text)] hover:border-[var(--border)]"><LayoutGrid className="w-4 h-4" />{tr('habits.templates')}</button>
            </div>
          </div>
        )}

        {tab === 'today' && allDone && <div className="card p-4 text-center text-[13px] font-bold text-emerald-300 bg-emerald-500/[0.06] border-emerald-500/20 anim-fade">{tr('habits.allDone')}</div>}

        {tab === 'today' && grouped.map(g => (
          <section key={g.anchor} className="anim-fade">
            <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-[.15em] mb-2.5">{tr('habits.anchor.' + g.anchor)}</h3>
            <div className="space-y-2">{g.items.map(h => <HabitRow key={h.id} h={h} />)}</div>
          </section>
        ))}

        {tab === 'today' && others.length > 0 && (
          <section className="anim-fade">
            <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-[.15em] mb-2.5">{tr('habits.others')}</h3>
            <div className="space-y-2">{others.map(h => <HabitRow key={h.id} h={h} dim />)}</div>
          </section>
        )}
      </div>

      {editing && <HabitModal habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {templates && <TemplatesDrawer onClose={() => setTemplates(false)} onAdded={() => { setTemplates(false); setTab('today'); }} />}
    </div>
  );
}

function TemplatesDrawer({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const tr = useT();
  const { addHabit } = useStore();
  const addTemplate = (tpl: typeof TEMPLATES[number]) => {
    const now = Date.now();
    tpl.habits.forEach((h, i) => addHabit({
      id: `h${now}${i}`, createdAt: new Date().toISOString(), log: {},
      title: tr('tpl.h.' + h.key), emoji: h.emoji, color: h.color, anchor: h.anchor,
      recurrence: h.recurrence, targetCount: h.targetCount, unit: h.unitKey ? tr(h.unitKey) : undefined,
    }));
    onAdded();
  };
  return (
    <Drawer open={true} onClose={onClose} width="md" title={tr('habits.templatesTitle')}>
      <p className="text-[13px] text-[var(--text-dim)] mb-4">{tr('habits.templatesSub')}</p>
      <div className="space-y-3">
        {TEMPLATES.map(tpl => (
          <div key={tpl.id} className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[24px] leading-none shrink-0">{tpl.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-[var(--text)]">{tr('tpl.' + tpl.id + '.name')}</div>
                <div className="text-[11px] text-[var(--text-dim)]">{tr('tpl.' + tpl.id + '.desc')}</div>
              </div>
              <button onClick={() => addTemplate(tpl)} className="h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--primary)] shrink-0"><Plus className="w-4 h-4" />{tr('habits.addAll')}</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tpl.habits.map(h => (
                <span key={h.key} className="text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 flex items-center gap-1">{h.emoji} {tr('tpl.h.' + h.key)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

// ─── Analytics (H2) ────────────────────────────────────────────────────────

function HeatStrip({ h }: { h: Habit }) {
  const cells = habitHeatmap(h, 84);
  return (
    <div className="grid grid-cols-12 grid-rows-7 gap-1 w-full">
      {cells.map(c => {
        let style: React.CSSProperties = { background: 'var(--surface-2)' };
        if (c.status === 'failed') style = { background: '#ef444455' };
        else if (c.ratio > 0) style = { background: h.color, opacity: 0.25 + c.ratio * 0.75 };
        else if (c.due) style = { background: 'var(--border)' };
        return <div key={c.date} title={`${c.date}${c.status ? ' · ' + c.status : ''}`} className="aspect-square min-w-0 rounded-[5px]" style={style} />;
      })}
    </div>
  );
}

function HabitsStats({ habits }: { habits: Habit[] }) {
  const tr = useT();
  const now = new Date();
  const todayPct = dailyCompletion(habits, now);

  // last 14 days completion bars
  const bars = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(now, -(13 - i));
    return { date: d, ...dailyCompletion(habits, d) };
  });

  // achievements
  const anyStreak7 = habits.some(h => habitStreak(h) >= 7);
  const bestEver = Math.max(0, ...habits.map(h => habitBestStreak(h)));
  const anyConsistent = habits.some(h => (habitRate(h, 30) ?? 0) >= 0.8);
  const perfectDay = Array.from({ length: 30 }).some((_, i) => {
    const c = dailyCompletion(habits, addDays(now, -i));
    return c.total > 0 && c.done === c.total;
  });
  const started = habits.some(h => Object.values(h.log).some(e => e.status === 'done'));
  const badges = [
    { id: 'start', icon: '🌱', earned: started },
    { id: 'week', icon: '🔥', earned: anyStreak7 },
    { id: 'perfect', icon: '💯', earned: perfectDay },
    { id: 'consistent', icon: '🌟', earned: anyConsistent },
    { id: 'centurion', icon: '🏆', earned: bestEver >= 30 },
  ];

  const ringPct = todayPct.pct == null ? 0 : Math.round(todayPct.pct * 100);

  return (
    <div className="space-y-6">
      {/* Today summary + 14-day trend */}
      <section className="card p-5 anim-fade">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 shrink-0 grid place-items-center">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#8b5cf6" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={`${ringPct * 0.974} 100`} />
            </svg>
            <div className="absolute text-center">
              <div className="text-[18px] font-bold text-[var(--text)] leading-none mono">{todayPct.pct == null ? '–' : ringPct + '%'}</div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-bold text-[var(--text)]">{tr('habits.todayProgress')}</h3>
            <p className="text-[12px] text-[var(--text-dim)] mt-0.5">{tr('habits.doneOfTotal', { done: todayPct.done, total: todayPct.total })}</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{tr('habits.last14')}</div>
          <div className="flex items-end gap-1.5 h-16">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${format(b.date, 'MMM d')} · ${b.pct == null ? '–' : Math.round(b.pct * 100) + '%'}`}>
                <div className="w-full rounded-t-[3px] transition-all" style={{ height: `${b.pct == null ? 2 : Math.max(6, b.pct * 100)}%`, background: b.pct == null ? 'var(--border)' : b.pct >= 1 ? '#22c55e' : '#8b5cf6', opacity: b.pct == null ? 1 : 0.5 + b.pct * 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievements */}
      <section className="anim-fade">
        <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-[.15em] mb-2.5 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />{tr('habits.achievements')}</h3>
        <div className="grid grid-cols-5 gap-2 max-w-[440px] mx-auto">
          {badges.map(b => (
            <div key={b.id} title={tr('habits.badge.' + b.id + '.desc')} className={`card p-2.5 flex flex-col items-center gap-1 text-center ${b.earned ? '' : 'opacity-30 grayscale'}`}>
              <span className="text-[22px] leading-none">{b.icon}</span>
              <span className="text-[9px] font-bold text-[var(--text)] leading-tight">{tr('habits.badge.' + b.id + '.name')}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Per-habit cards */}
      <section className="anim-fade space-y-2.5">
        <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-[.15em] flex items-center gap-1.5"><Award className="w-3.5 h-3.5" />{tr('habits.perHabit')}</h3>
        {habits.map(h => {
          const streak = habitStreak(h);
          const best = habitBestStreak(h);
          const rate = habitRate(h, 30);
          return (
            <div key={h.id} className="card p-4 w-full">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0" style={{ background: `${h.color}22` }}>{h.emoji || '✅'}</div>
                <span className="text-[14px] font-bold text-[var(--text)] truncate flex-1">{h.title}</span>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] shrink-0">
                  <span className="flex items-center gap-1 text-amber-500 font-bold"><Flame className="w-3.5 h-3.5" />{streak}</span>
                  <span className="text-[var(--text-dim)]">{tr('habits.best')} <b className="text-[var(--text)]">{best}</b></span>
                  <span className="text-[var(--text-dim)]">30d <b className="text-[var(--text)]">{rate == null ? '–' : Math.round(rate * 100) + '%'}</b></span>
                </div>
              </div>
              <HeatStrip h={h} />
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function HabitModal({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const tr = useT();
  const { addHabit, updateHabit, deleteHabit, askConfirm, goals } = useStore();
  const [title, setTitle] = useState(habit?.title || '');
  const [emoji, setEmoji] = useState(habit?.emoji || '✅');
  const [color, setColor] = useState(habit?.color || '#8b5cf6');
  const anchor = habit?.anchor || 'none';
  const [recurrence, setRecurrence] = useState<HabitRecurrence>(habit?.recurrence || 'daily');
  const [intervalDays, setIntervalDays] = useState(habit?.intervalDays || 2);
  const [targetCount, setTargetCount] = useState(habit?.targetCount || 1);
  const [unit, setUnit] = useState(habit?.unit || '');
  const [goalId, setGoalId] = useState(habit?.goalId || '');
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? '');

  const save = () => {
    if (!title.trim()) return;
    const data = {
      title: title.trim(), emoji: emoji.trim() || '✅', color, anchor, recurrence,
      intervalDays: recurrence === 'everyN' ? Math.max(2, intervalDays) : undefined,
      targetCount: Math.max(1, targetCount), unit: unit.trim() || undefined,
      goalId: goalId || undefined, reminderTime: reminderTime || undefined,
    };
    if (habit) updateHabit(habit.id, data);
    else addHabit({ id: `h${Date.now()}`, createdAt: new Date().toISOString(), log: {}, ...data });
    onClose();
  };

  const remove = () => askConfirm({
    title: tr('habits.deleteTitle'), message: tr('habits.deleteMsg', { title: habit!.title }),
    confirmLabel: tr('common.delete'), danger: true, onConfirm: () => { deleteHabit(habit!.id); onClose(); },
  });

  const field = 'w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)]';
  const lbl = 'block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2';

  return (
    <Drawer open={true} onClose={onClose} width="md" title={habit ? tr('habits.editTitle') : tr('habits.newTitle')}>
      <div className="space-y-5">
        {/* Marker (live preview) + name */}
        <div className="flex gap-3 items-end">
          <div>
            <label className={lbl}>{tr('habits.marker')}</label>
            <div className="w-14 h-14 rounded-2xl grid place-items-center text-[26px] transition-colors" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}66` }}>{emoji || '✅'}</div>
          </div>
          <div className="flex-1">
            <label className={lbl}>{tr('habits.name')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr('habits.namePlaceholder')} className={field} />
          </div>
        </div>

        {/* Emoji picker strip */}
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
          {EMOJI_SUGGESTIONS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} className={`shrink-0 w-10 h-10 rounded-xl grid place-items-center text-[19px] border transition-all ${emoji === e ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/40'}`}>{e}</button>
          ))}
          <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2} placeholder="＋" aria-label={tr('habits.marker')} className="shrink-0 w-10 h-10 rounded-xl bg-[var(--surface-2)] border border-dashed border-[var(--border)] text-center text-[17px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--primary)] focus:border-solid" />
        </div>

        {/* Color — swatch strip, selected enlarges */}
        <div>
          <label className={lbl}>{tr('habits.color')}</label>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 -mx-1 px-1">
            {COLORS.map(c => {
              const on = color === c;
              return (
                <button key={c} onClick={() => setColor(c)} aria-label={c}
                  className="shrink-0 rounded-full grid place-items-center transition-all active:scale-90"
                  style={{ width: on ? 36 : 28, height: on ? 36 : 28, background: c, boxShadow: on ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'inset 0 1px 2px rgba(255,255,255,.3)' }}>
                  {on && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time */}
        <div>
          <label className={lbl}>{tr('habits.reminder')}</label>
          <TimePicker
            label={tr('habits.reminder')}
            value={hmToMin(reminderTime || '09:00')}
            onChange={m => setReminderTime(minToHm(m))}
          />
        </div>

        {/* Recurrence */}
        <div>
          <label className={lbl}>{tr('habits.recurrence')}</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
            {RECURRENCES.map(r => (
              <button key={r} onClick={() => setRecurrence(r)} className={`shrink-0 h-9 px-3.5 rounded-xl text-[12px] font-medium border transition-all active:scale-95 whitespace-nowrap ${recurrence === r ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:border-[var(--primary)]/40'}`}>{tr('habits.rec.' + r)}</button>
            ))}
          </div>
          {recurrence === 'everyN' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[12px] text-[var(--text-dim)]">{tr('habits.intervalDays')}</span>
              <input type="number" min={2} value={intervalDays} onChange={e => setIntervalDays(parseInt(e.target.value) || 2)} className="w-20 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] mono focus:outline-none focus:border-[var(--border)]" />
            </div>
          )}
        </div>

        {/* Target + unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{tr('habits.target')}</label>
            <input type="number" min={1} value={targetCount} onChange={e => setTargetCount(parseInt(e.target.value) || 1)} className={`${field} mono`} />
          </div>
          <div>
            <label className={lbl}>{tr('habits.unit')}</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} placeholder={tr('habits.unitPlaceholder')} className={field} />
          </div>
        </div>

        {/* Linked goal */}
        <div>
          <label className={lbl}>{tr('habits.linkGoal')}</label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <SelectMenu value={goalId} onChange={setGoalId} ariaLabel={tr('habits.linkGoal')}
              options={[{ value: '', label: tr('habits.noGoal') }, ...goals.filter(g => g.status !== 'completed').map(g => ({ value: g.id, label: `${g.emoji} ${g.title}` }))]} />
            <button
              type="button"
              onClick={() => setGoalId('')}
              title={tr('common.clear')}
              aria-label={tr('common.clear')}
              className="w-11 h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] grid place-items-center hover:text-[var(--text)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {habit && (
          <button onClick={remove} className="text-[12px] font-bold text-red-400 hover:text-red-300 flex items-center gap-2 pt-1"><Trash2 className="w-4 h-4" /> {tr('common.delete')}</button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)] flex gap-2">
        <button onClick={onClose} className="h-11 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)] hover:text-[var(--text)] transition-colors">{tr('common.cancel')}</button>
        <button onClick={save} disabled={!title.trim()} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[var(--primary)] transition-colors"><Check className="w-4 h-4" /> {tr('habits.save')}</button>
      </div>
    </Drawer>
  );
}
