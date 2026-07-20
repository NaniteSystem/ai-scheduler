import { addDays, parseISO, format, isWeekend, differenceInCalendarDays, getDay, getDate } from 'date-fns';
import type { PlanInput, GeneratedPlan, GeneratedDay, GeneratedBlock, Goal, Habit, GTDTask } from '../types';
import { createId } from '../domain/id.ts';

// ─── Multi-week scheduling engine ───────────────────────────────────────────
// Pure & deterministic so it is unit-testable and can be swapped for a real AI
// provider behind the SchedulerProvider seam. It must NOT import the store.

export const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Situational anchor → rough clock minute (used when a habit has no reminderTime).
const ANCHOR_MIN: Record<string, number> = {
  none: 7 * 60, wake: 6 * 60 + 45, morning: 9 * 60, afternoon: 14 * 60, evening: 19 * 60,
  sleep: 22 * 60, afterBreakfast: 8 * 60, afterLunch: 13 * 60 + 30, afterDinner: 20 * 60,
};

export function habitFiresOn(h: Habit, date: Date): boolean {
  const diff = differenceInCalendarDays(date, parseISO(h.createdAt));
  if (diff < 0) return false;
  switch (h.recurrence) {
    case 'daily':    return true;
    case 'weekdays': return !isWeekend(date);
    case 'weekends': return isWeekend(date);
    case 'weekly':   return diff % 7 === 0;
    case 'everyN':   return diff % Math.max(2, h.intervalDays || 2) === 0;
    default:         return true;
  }
}

export function recurringFiresOn(t: GTDTask, date: Date): boolean {
  const base = t.scheduledDate || t.dueDate || t.createdAt;
  const b = parseISO(base);
  const diff = differenceInCalendarDays(date, b);
  if (diff < 0) return false;
  switch (t.recurring) {
    case 'daily':    return true;
    case 'weekdays': return !isWeekend(date);
    case 'weekends': return isWeekend(date);
    case 'weekly':   return diff % 7 === 0;
    case 'monthly':  return getDate(date) === getDate(b);
    default:         return diff % 7 === 0;
  }
}

interface GoalSchedule { goal: Goal; days: Set<number>; durMin: number }

/** Turn each goal's weekly-hours target into a fixed set of weekdays + session length. */
function goalSchedules(goals: Goal[]): GoalSchedule[] {
  return goals
    .filter(g => (g.status ?? 'active') !== 'completed')
    .sort((a, b) => a.priority - b.priority)
    .map((goal, gi) => {
      const hpw = Math.max(0.5, goal.hoursPerWeekTarget || 3);
      const durMin = hpw > 6 ? 90 : 60;
      const n = Math.min(6, Math.max(1, Math.round((hpw * 60) / durMin)));
      const days = new Set<number>();
      for (let i = 0; i < n; i++) days.add((Math.round((i * 7) / n) + gi * 2) % 7);
      return { goal, days, durMin };
    });
}

// ─── Day scaffold: the locked/essential frame every provider builds on ──────
// Sleep, work, meals + existing calendar sessions marked busy. Both the rule
// engine and the AI assembler start from this, so precision guarantees (no
// overlaps, inside the waking window, around real sessions) hold everywhere.
export interface DayCtx {
  date: Date;
  dateStr: string;
  wake: number;
  sleep: number;
  blocks: GeneratedBlock[];
  nid: () => string;
  overlaps: (s: number, e: number) => boolean;
  occupy: (s: number, e: number) => void;
  place: (start: number, dur: number) => number | null;
}

export function makeDayCtx(input: PlanInput, dateStr: string): DayCtx {
  const date = parseISO(dateStr);
  const { prefs } = input;
  const blocks: GeneratedBlock[] = [];
  let idc = 0;
  const nid = () => `gb-${dateStr}-${idc++}`;

  const wake = hm(prefs.wakeTime);
  let sleep = hm(prefs.sleepTime);
  if (sleep <= wake) sleep += 24 * 60;

  const occupied: { start: number; end: number }[] = [];
  const overlaps = (s: number, e: number) => occupied.some(o => s < o.end && e > o.start);
  const occupy = (s: number, e: number) => occupied.push({ start: s, end: e });
  const place = (start: number, dur: number): number | null => {
    for (let t = Math.max(start, wake); t + dur <= sleep; t += 15) if (!overlaps(t, t + dur)) return t;
    return null;
  };

  // 0. Existing calendar sessions on this date are busy time — never plan over them.
  for (const s of input.sessions || []) {
    if (s.status === 'done' || s.allDay || (s.date || '').slice(0, 10) !== dateStr) continue;
    if (!Number.isFinite(s.startHour)) continue;
    const st = s.startHour * 60 + (s.startMinute || 0);
    occupy(st, st + Math.max(15, s.durationMinutes || 30));
  }

  // 1. Sleep (locked, doesn't occupy the waking window)
  const sleepB = prefs.lifeBlocks.find(b => b.id === 'sleep');
  if (sleepB?.enabled)
    blocks.push({ id: nid(), title: sleepB.label, emoji: sleepB.emoji, color: sleepB.color, startMinutes: hm(prefs.sleepTime), durationMinutes: Math.round(sleepB.hoursPerDay * 60), type: 'essential', sourceKind: 'life', sourceId: 'sleep', status: 'proposed', locked: true, reasoning: 'plan.r.rest' });

  // Fixed obligations are pushed as locked blocks. An optional break window
  // inside (lunch break, …) splits the block in two and stays FREE, so meals
  // and small tasks can be planned inside it.
  const pushFixed = (title: string, emoji: string, color: string, reason: string, sourceId: string | undefined, startT: string, endT: string, breakS?: string, breakE?: string) => {
    const s0 = hm(startT), e0 = hm(endT);
    if (e0 <= s0) return;
    const bs = breakS ? hm(breakS) : null, be = breakE ? hm(breakE) : null;
    const segs: [number, number][] =
      bs != null && be != null && bs > s0 && be < e0 && be > bs ? [[s0, bs], [be, e0]] : [[s0, e0]];
    for (const [s, e] of segs) {
      blocks.push({ id: nid(), title, emoji, color, startMinutes: s, durationMinutes: e - s, type: 'work', sourceKind: 'life', sourceId, status: 'proposed', locked: true, reasoning: reason });
      occupy(s, e);
    }
  };

  // 2. Work (locked, weekdays only), with optional break window
  if (prefs.hasWork && !isWeekend(date)) {
    pushFixed('Work', '💼', '#64748b', 'plan.r.work', 'work', prefs.workStart, prefs.workEnd, prefs.workBreakStart, prefs.workBreakEnd);
  }

  // 2b. User-defined commitments (study, gym class, …) on their weekdays
  const wd = getDay(date);
  for (const c of prefs.commitments || []) {
    if (!c.enabled || !c.days?.includes(wd)) continue;
    pushFixed(c.title, c.emoji || '📌', '#8b5cf6', 'plan.r.commitment', undefined, c.start, c.end, c.breakStart, c.breakEnd);
  }

  // 3. Meals (essential, respecting fasting). A meal with a fixed time is pinned
  // there even inside work hours — lunch during the workday is normal life, not
  // a conflict to be pushed to the evening.
  for (const mid of ['breakfast', 'lunch', 'dinner']) {
    const mb = prefs.lifeBlocks.find(b => b.id === mid);
    if (!mb?.enabled) continue;
    if (prefs.fasting && (mid === 'breakfast' || prefs.fastingType === 'full-day')) continue;
    const dur = Math.round(mb.hoursPerDay * 60);
    const slot = mb.fixedTime ? hm(mb.fixedTime) : (place(wake + 180, dur) ?? wake + 180);
    blocks.push({ id: nid(), title: mb.label, emoji: mb.emoji, color: mb.color, startMinutes: slot, durationMinutes: dur, type: 'essential', sourceKind: 'life', sourceId: mid, status: 'proposed', reasoning: 'plan.r.meal' });
    occupy(slot, slot + dur);
  }

  return { date, dateStr, wake, sleep, blocks, nid, overlaps, occupy, place };
}

/** Wellbeing / social / relax life blocks fill leftover space (shared by providers). */
export function fillLifeBlocks(input: PlanInput, ctx: DayCtx): void {
  const fill = (id: string, def: number, type: GeneratedBlock['type']) => {
    const b = input.prefs.lifeBlocks.find(x => x.id === id);
    if (!b?.enabled || b.hoursPerDay <= 0) return;
    const dur = Math.round(b.hoursPerDay * 60);
    const slot = ctx.place(def, dur);
    if (slot == null) return;
    ctx.blocks.push({ id: ctx.nid(), title: b.label, emoji: b.emoji, color: b.color, startMinutes: slot, durationMinutes: dur, type, sourceKind: 'life', sourceId: id, status: 'proposed', reasoning: 'plan.r.wellbeing' });
    ctx.occupy(slot, slot + dur);
  };
  fill('exercise', ctx.wake, 'wellbeing');
  fill('friends', hm('18:00'), 'social');
  fill('relax', hm('20:00'), 'wellbeing');
}

function buildDay(input: PlanInput, dateStr: string, scheds: GoalSchedule[]): GeneratedDay {
  const ctx = makeDayCtx(input, dateStr);
  const { date, wake, blocks, nid, occupy, place } = ctx;
  const { prefs, habits, tasks, options } = input;

  // 4. Habits (anchored)
  if (options.includeHabits) for (const h of habits) {
    if (h.archived || !habitFiresOn(h, date)) continue;
    const dur = 20;
    const slot = place(h.reminderTime ? hm(h.reminderTime) : (ANCHOR_MIN[h.anchor] ?? wake + 60), dur);
    if (slot == null) continue;
    blocks.push({ id: nid(), title: h.title, emoji: h.emoji || '✅', color: h.color || '#10b981', startMinutes: slot, durationMinutes: dur, type: 'habit', sourceKind: 'habit', sourceId: h.id, status: 'proposed', reasoning: 'plan.r.habit' });
    occupy(slot, slot + dur);
  }

  // 5. Goal sessions (in the productivity peak)
  if (options.includeGoals) {
    const wd = getDay(date);
    const peak = prefs.productivityPeak === 'morning' ? wake + 30 : prefs.productivityPeak === 'afternoon' ? hm('13:00') : hm('18:00');
    for (const gs of scheds) {
      if (!gs.days.has(wd)) continue;
      const slot = place(peak, gs.durMin);
      if (slot == null) continue;
      blocks.push({ id: nid(), title: gs.goal.title.split(' ').slice(0, 4).join(' '), emoji: gs.goal.emoji, color: gs.goal.color, startMinutes: slot, durationMinutes: gs.durMin, type: 'goal', sourceKind: 'goal', sourceId: gs.goal.id, status: 'proposed', reasoning: 'plan.r.goal' });
      occupy(slot, slot + gs.durMin);
    }
  }

  // 6. Recurring tasks
  if (options.includeRecurring) for (const t of tasks) {
    if (!t.recurring || t.status === 'done' || t.status === 'trash' || t.isArchived) continue;
    if (!recurringFiresOn(t, date)) continue;
    const dur = t.durationMinutes || 30;
    const slot = place(wake, dur);
    if (slot == null) continue;
    blocks.push({ id: nid(), title: t.title, emoji: '🔁', color: '#0d9488', startMinutes: slot, durationMinutes: dur, type: 'task', sourceKind: 'task', sourceId: t.id, status: 'proposed', reasoning: 'plan.r.recurring' });
    occupy(slot, slot + dur);
  }

  // 7. One-off tasks (only on their scheduled/due date)
  if (options.includeTasks) for (const t of tasks) {
    if (t.recurring || t.status === 'done' || t.status === 'trash' || t.isArchived) continue;
    if ((t.scheduledDate || t.dueDate || '').slice(0, 10) !== dateStr) continue;
    const dur = t.durationMinutes || 30;
    const slot = place(wake, dur);
    if (slot == null) continue;
    blocks.push({ id: nid(), title: t.title, emoji: '✓', color: '#eab308', startMinutes: slot, durationMinutes: dur, type: 'task', sourceKind: 'task', sourceId: t.id, status: 'proposed', reasoning: 'plan.r.task' });
    occupy(slot, slot + dur);
  }

  // 8. Wellbeing / social / relax fill the remainder
  fillLifeBlocks(input, ctx);

  blocks.sort((a, b) => a.startMinutes - b.startMinutes);
  return { date: dateStr, blocks };
}

/** Build a full timed plan for every day in the range. */
export function generateRangePlan(input: PlanInput): GeneratedPlan {
  const start = parseISO(input.range.start);
  const end = parseISO(input.range.end);
  const scheds = input.options.includeGoals ? goalSchedules(input.goals) : [];
  const days: GeneratedDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(buildDay(input, format(d, 'yyyy-MM-dd'), scheds));
  return {
    id: createId('plan'),
    createdAt: new Date().toISOString(),
    providerId: 'rule-based',
    range: input.range,
    options: input.options,
    days,
  };
}
