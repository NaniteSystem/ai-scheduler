import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, addWeeks, addMonths, parseISO, format, isWeekend, differenceInCalendarDays } from 'date-fns';
import type { Goal, Session, Message, GTDTask, GTDStatus, Priority, TaskContext, RecurringPattern, SchedulePrefs, LifeBlock, GeneratedDay, GeneratedBlock, Habit, HabitStatus, ReflectionEntry, MetricDef, FocusTimer, GeneratedPlan, PlanHorizon, PlanOptions, FixedCommitment } from './types';
import { getProvider, horizonRange } from './scheduler';

/** Is a habit scheduled on the given date (by its recurrence rule)? */
export function habitDueOn(h: Habit, date: Date): boolean {
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

/** Current streak: consecutive due-days ending today with status 'done' ('rest' keeps it, 'failed'/missed past day breaks it). */
export function habitStreak(h: Habit, today: Date = new Date()): number {
  let streak = 0;
  let d = new Date(today); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    if (habitDueOn(h, d)) {
      const e = h.log[format(d, 'yyyy-MM-dd')];
      if (e?.status === 'done') streak++;
      else if (e?.status === 'rest') { /* excused — keep streak, no increment */ }
      else if (i === 0) { /* today not logged yet — don't break */ }
      else break;
    }
    d = addDays(d, -1);
  }
  return streak;
}

/** Longest run of consecutive due-days completed ('done'; 'rest' excused, doesn't break) over the habit's history. */
export function habitBestStreak(h: Habit, today: Date = new Date()): number {
  let best = 0, cur = 0;
  let d = new Date(h.createdAt ? parseISO(h.createdAt) : today); d.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(0, 0, 0, 0);
  for (; d <= end; d = addDays(d, 1)) {
    if (!habitDueOn(h, d)) continue;
    const e = h.log[format(d, 'yyyy-MM-dd')];
    if (e?.status === 'done') { cur++; if (cur > best) best = cur; }
    else if (e?.status === 'rest') { /* excused — keep streak */ }
    else { cur = 0; }   // failed or missed (incl. today if unlogged) resets the run
  }
  return best;
}

/** Completion rate over the last `days` due-days: done / (due, excluding 'rest' and today-if-unlogged). null if nothing counted. */
export function habitRate(h: Habit, days = 30, today: Date = new Date()): number | null {
  let done = 0, total = 0;
  let d = new Date(today); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    if (habitDueOn(h, d)) {
      const e = h.log[format(d, 'yyyy-MM-dd')];
      if (e?.status === 'rest') { /* excused */ }
      else if (i === 0 && !e) { /* today not logged yet — don't penalise */ }
      else { total++; if (e?.status === 'done') done++; }
    }
    d = addDays(d, -1);
  }
  return total === 0 ? null : done / total;
}

/** Per-day cells for a habit heatmap over the last `days` days (oldest→newest). ratio 0..1 drives cell intensity. */
export function habitHeatmap(h: Habit, days = 91, today: Date = new Date()): { date: string; due: boolean; status?: HabitStatus; ratio: number }[] {
  const cells: { date: string; due: boolean; status?: HabitStatus; ratio: number }[] = [];
  let d = addDays(new Date(today), -(days - 1)); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const key = format(d, 'yyyy-MM-dd');
    const e = h.log[key];
    let ratio = 0;
    if (e?.status === 'done') ratio = 1;
    else if (e && e.count > 0 && h.targetCount > 1) ratio = Math.min(1, e.count / h.targetCount);
    cells.push({ date: key, due: habitDueOn(h, d), status: e?.status, ratio });
    d = addDays(d, 1);
  }
  return cells;
}

/** Completion across all active habits due on a date: done / (due, excluding 'rest'). */
export function dailyCompletion(habits: Habit[], date: Date): { done: number; total: number; pct: number | null } {
  const key = format(date, 'yyyy-MM-dd');
  let done = 0, total = 0;
  for (const h of habits) {
    if (h.archived || !habitDueOn(h, date)) continue;
    const e = h.log[key];
    if (e?.status === 'rest') continue;
    total++;
    if (e?.status === 'done') done++;
  }
  return { done, total, pct: total === 0 ? null : done / total };
}

/** Pearson correlation between daily mood (1..5) and habit completion ratio over days where both are recorded. */
export function moodHabitCorrelation(habits: Habit[], reflections: Record<string, ReflectionEntry>, days = 60, today: Date = new Date()): { r: number | null; n: number } {
  const xs: number[] = [], ys: number[] = [];
  let d = new Date(today); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const key = format(d, 'yyyy-MM-dd');
    const mood = reflections[key]?.mood;
    const comp = dailyCompletion(habits, d);
    if (mood != null && comp.pct != null) { xs.push(mood); ys.push(comp.pct); }
    d = addDays(d, -1);
  }
  const n = xs.length;
  if (n < 3) return { r: null, n };
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  if (dx === 0 || dy === 0) return { r: null, n };
  return { r: num / Math.sqrt(dx * dy), n };
}

/** Single source of truth for a goal's progress %.
 *  Hours-based when an hours estimate exists; otherwise milestone-based (roadmap); else 0.
 *  (Replaces the vestigial stored `progressPercent`.) */
export function goalProgressPct(goal: Goal, sessions: Session[]): number {
  if (goal.roadmap && goal.roadmap.phases.length) {
    const ns = goal.roadmap.phases.flatMap((p) => p.nodes);
    if (ns.length) return Math.round((ns.filter((n) => n.done).length / ns.length) * 100);
  }
  const mins = sessions.filter((s) => s.goalId === goal.id && s.status === 'done').reduce((a, s) => a + s.durationMinutes, 0);
  const hours = mins / 60;
  if (goal.totalHoursEstimated > 0) return Math.min(100, Math.round((hours / goal.totalHoursEstimated) * 100));
  const ms = goal.milestones;
  if (ms.length > 0) return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
  return 0;
}

/** Consecutive-day streak ending today (or yesterday, if today isn't logged yet) with a completed session.
 *  Computed from sessions — the stored `streak` field is no longer used. */
export function goalStreak(goal: Goal, sessions: Session[], today: Date = new Date()): number {
  const dates = new Set<string>();
  for (const s of sessions) if (s.goalId === goal.id && s.status === 'done' && s.date) dates.add(s.date.slice(0, 10));
  if (dates.size === 0) return 0;
  const cursor = new Date(today);
  if (!dates.has(format(cursor, 'yyyy-MM-dd'))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(format(cursor, 'yyyy-MM-dd'))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

/** Data-driven goal insight: picks the most relevant message from real session stats. Returns an i18n key + vars. */
export function goalInsight(goal: Goal, sessions: Session[], today: Date = new Date()): { key: string; vars?: Record<string, string | number> } {
  const gs = sessions.filter((s) => s.goalId === goal.id);
  const done = gs.filter((s) => s.status === 'done');
  const skipped = gs.filter((s) => s.status === 'skipped');
  const hoursLogged = +(done.reduce((sum, x) => sum + x.durationMinutes, 0) / 60).toFixed(1);
  const hoursLeft = Math.max(0, goal.totalHoursEstimated - hoursLogged);
  const pct = goalProgressPct(goal, sessions);
  const total = gs.length;
  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

  if (goal.status === 'completed') return { key: goal.outcome === 'failed' ? 'gi.completedFailed' : 'gi.completedSuccess', vars: { h: hoursLogged } };
  if (done.length === 0) return { key: 'gi.start' };

  const daysLeft = goal.deadline ? differenceInCalendarDays(parseISO(goal.deadline), today) : null;
  const weeksLeft = daysLeft != null ? Math.ceil(daysLeft / 7) : null;
  const needPerWeek = weeksLeft && weeksLeft > 0 ? +(hoursLeft / weeksLeft).toFixed(1) : null;

  if (daysLeft != null && daysLeft < 0 && pct < 100) return { key: 'gi.overdue', vars: { pct } };
  if (needPerWeek != null && needPerWeek > goal.hoursPerWeekTarget * 1.2) return { key: 'gi.behind', vars: { need: needPerWeek, plan: goal.hoursPerWeekTarget } };
  if (total >= 4 && completionRate < 60) return { key: 'gi.lowCompletion', vars: { rate: completionRate, skipped: skipped.length } };

  const feels = done.filter((s) => s.progressLog).map((s) => { const f = s.progressLog!.feeling; return f === 'great' ? 4 : f === 'good' ? 3 : f === 'ok' ? 2 : 1; });
  const feelScore = feels.length ? feels.reduce((a, b) => a + b, 0) / feels.length : 0;
  if (feelScore > 0 && feelScore < 2.2) return { key: 'gi.lowEnergy' };

  if (needPerWeek != null) return { key: 'gi.onTrack', vars: { pct, need: needPerWeek } };
  if (completionRate >= 80) return { key: 'gi.strong', vars: { rate: completionRate, pct } };
  return { key: 'gi.progress', vars: { pct, h: hoursLogged } };
}

/** Next due date (yyyy-MM-dd) for a recurring task, from its current due date (or today). */
export function nextDueDate(base: string | undefined, pattern: RecurringPattern): string {
  const start = base ? parseISO(base) : new Date();
  let d: Date;
  switch (pattern) {
    case 'daily':    d = addDays(start, 1); break;
    case 'weekly':   d = addWeeks(start, 1); break;
    case 'monthly':  d = addMonths(start, 1); break;
    case 'weekdays': { d = addDays(start, 1); while (isWeekend(d)) d = addDays(d, 1); break; }
    case 'weekends': { d = addDays(start, 1); while (!isWeekend(d)) d = addDays(d, 1); break; }
    default:         d = addWeeks(start, 1);
  }
  return format(d, 'yyyy-MM-dd');
}

function taskFromSession(session: Session, createdAt = new Date().toISOString()): GTDTask {
  return {
    id: `t-${session.id}`,
    sessionId: session.id,
    title: session.title,
    description: session.description || undefined,
    status: 'scheduled',
    priority: 3,
    createdAt,
    processedAt: createdAt,
    updatedAt: createdAt,
    durationMinutes: session.durationMinutes || undefined,
    scheduledDate: session.date || undefined,
    context: '@anywhere',
    tags: [],
  };
}

function syncTaskWithSession(task: GTDTask, session: Session): GTDTask {
  return {
    ...task,
    title: session.title || task.title,
    description: session.description || task.description,
    durationMinutes: session.durationMinutes || task.durationMinutes,
    scheduledDate: session.date || task.scheduledDate,
    status: task.status === 'trash' || task.status === 'done' ? task.status : 'scheduled',
    updatedAt: new Date().toISOString(),
  };
}

const defaultLifeBlocks: LifeBlock[] = [
  { id:'sleep', label:'Sleep', emoji:'😴', color:'#6366f1', category:'essential', hoursPerDay:8, minHours:4, maxHours:14, recommended:8, enabled:true, flexible:false, fixedTime:'23:00', description:'Quality rest is the foundation of productivity' },
  { id:'breakfast', label:'Breakfast', emoji:'🍳', color:'#f59e0b', category:'essential', hoursPerDay:0.5, minHours:0, maxHours:1.5, recommended:0.5, enabled:true, flexible:true, fixedTime:'07:30', description:'Morning fuel' },
  { id:'lunch', label:'Lunch', emoji:'🥗', color:'#84cc16', category:'essential', hoursPerDay:0.75, minHours:0, maxHours:1.5, recommended:0.75, enabled:true, flexible:true, fixedTime:'13:00', description:'Midday meal' },
  { id:'dinner', label:'Dinner', emoji:'🍽️', color:'#ef4444', category:'essential', hoursPerDay:1, minHours:0, maxHours:2, recommended:1, enabled:true, flexible:true, fixedTime:'19:00', description:'Evening meal' },
  { id:'exercise', label:'Exercise', emoji:'💪', color:'#10b981', category:'wellbeing', hoursPerDay:1, minHours:0, maxHours:3, recommended:1, enabled:true, flexible:true, description:'Physical health & energy' },
  { id:'friends', label:'Friends & Social', emoji:'🤝', color:'#ec4899', category:'social', hoursPerDay:1, minHours:0, maxHours:5, recommended:1, enabled:true, flexible:true, description:'Time with people you love' },
  { id:'relax', label:'Relax & Recharge', emoji:'☕', color:'#0ea5e9', category:'wellbeing', hoursPerDay:1.5, minHours:0.5, maxHours:5, recommended:1.5, enabled:true, flexible:true, description:'Downtime to avoid burnout' },
  { id:'commute', label:'Commute / Transit', emoji:'🚗', color:'#737373', category:'buffer', hoursPerDay:0.5, minHours:0, maxHours:3, recommended:0.5, enabled:false, flexible:false, description:'Travel time between places' },
];

const defaultPrefs: SchedulePrefs = {
  wakeTime: '06:30',
  sleepTime: '23:00',
  fasting: false,
  workStart: '09:00',
  workEnd: '17:00',
  hasWork: true,
  productivityPeak: 'morning',
  weekStartsOn: 1,
  lifeBlocks: defaultLifeBlocks,
  commitments: [],
};

const hm = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };

export function generateSchedule(prefs: SchedulePrefs, goals: Goal[], tasks: GTDTask[], dateStr: string): GeneratedDay {
  const blocks: GeneratedBlock[] = [];
  let id = 0;
  const nid = () => `gb${dateStr}-${id++}`;

  const wake = hm(prefs.wakeTime);
  let sleep = hm(prefs.sleepTime);
  if (sleep <= wake) sleep += 24*60;

  // 1. Sleep (essential, fixed)
  const sleepBlock = prefs.lifeBlocks.find(b => b.id==='sleep');
  if (sleepBlock?.enabled) {
    blocks.push({ id:nid(), title:'Sleep', emoji:'😴', color:sleepBlock.color, startMinutes:sleep, durationMinutes:sleepBlock.hoursPerDay*60, type:'essential', status:'proposed', locked:true, reasoning:`${sleepBlock.hoursPerDay}h of rest as you set` });
  }

  // Build occupied set: list of {start,end}
  const occupied: {start:number;end:number}[] = [];
  const overlaps = (s:number,e:number) => occupied.some(o => s < o.end && e > o.start);
  const place = (start:number, dur:number): number | null => {
    // find nearest free slot at or after start within wake..sleep
    for (let t = start; t + dur <= sleep; t += 15) {
      if (!overlaps(t, t+dur)) return t;
    }
    return null;
  };
  const occupy = (s:number,e:number) => occupied.push({start:s,end:e});

  // 2. Work + user commitments (fixed). An optional break window splits the
  // block and stays free for meals/tasks.
  const pushFixed = (title:string, emoji:string, color:string, startT:string, endT:string, breakS?:string, breakE?:string, reason='Your fixed work hours') => {
    const s0 = hm(startT), e0 = hm(endT);
    if (e0 <= s0) return;
    const bs = breakS ? hm(breakS) : null, be = breakE ? hm(breakE) : null;
    const segs: [number,number][] = bs!=null && be!=null && bs>s0 && be<e0 && be>bs ? [[s0,bs],[be,e0]] : [[s0,e0]];
    for (const [s,e] of segs) {
      blocks.push({ id:nid(), title, emoji, color, startMinutes:s, durationMinutes:e-s, type:'work', status:'proposed', locked:true, reasoning:reason });
      occupy(s, e);
    }
  };
  if (prefs.hasWork) pushFixed('Work', '💼', '#64748b', prefs.workStart, prefs.workEnd, prefs.workBreakStart, prefs.workBreakEnd);
  const todayWd = parseISO(dateStr).getDay();
  for (const c of prefs.commitments || []) {
    if (!c.enabled || !c.days?.includes(todayWd)) continue;
    pushFixed(c.title, c.emoji || '📌', '#8b5cf6', c.start, c.end, c.breakStart, c.breakEnd, 'Your fixed commitment');
  }

  // 3. Meals (essential, near fixed times) — skip if fasting
  const mealIds = ['breakfast','lunch','dinner'];
  for (const mid of mealIds) {
    const mb = prefs.lifeBlocks.find(b => b.id===mid);
    if (!mb?.enabled) continue;
    if (prefs.fasting && (mid==='breakfast' || (prefs.fastingType==='full-day'))) continue;
    if (prefs.fasting && prefs.fastingType==='16:8' && mid==='breakfast') continue;
    const target = mb.fixedTime ? hm(mb.fixedTime) : wake+180;
    const dur = mb.hoursPerDay*60;
    const slot = place(Math.max(target, wake), dur) ?? target;
    blocks.push({ id:nid(), title:mb.label, emoji:mb.emoji, color:mb.color, startMinutes:slot, durationMinutes:dur, type:'essential', status:'proposed', reasoning:prefs.fasting?'Adjusted for fasting':'Regular meal time' });
    occupy(slot, slot+dur);
  }

  // 4. Goal sessions (deep work in productivity peak)
  const peakStart = prefs.productivityPeak==='morning' ? wake+30 : prefs.productivityPeak==='afternoon' ? hm('13:00') : hm('18:00');
  const activeGoals = [...goals].sort((a,b)=>a.priority-b.priority).slice(0,3);
  let cursor = peakStart;
  for (const g of activeGoals) {
    const dur = 60;
    const slot = place(Math.max(cursor, wake), dur);
    if (slot===null) continue;
    blocks.push({ id:nid(), title:`${g.title.split(' ').slice(0,3).join(' ')}`, emoji:g.emoji, color:g.color, startMinutes:slot, durationMinutes:dur, type:'goal', sourceId:g.id, status:'proposed', reasoning:`Priority ${g.priority} goal, scheduled in your ${prefs.productivityPeak} peak` });
    occupy(slot, slot+dur);
    cursor = slot+dur+15;
  }

  // 5. Exercise (wellbeing)
  const ex = prefs.lifeBlocks.find(b=>b.id==='exercise');
  if (ex?.enabled && ex.hoursPerDay>0) {
    const dur = ex.hoursPerDay*60;
    const slot = place(wake, dur);
    if (slot!==null) { blocks.push({ id:nid(), title:'Exercise', emoji:'💪', color:ex.color, startMinutes:slot, durationMinutes:dur, type:'wellbeing', status:'proposed', reasoning:'Boosts energy and focus' }); occupy(slot,slot+dur); }
  }

  // 6. Top GTD next-actions
  const nextActions = tasks.filter(t=>t.status==='next-action').sort((a,b)=>a.priority-b.priority).slice(0,3);
  for (const t of nextActions) {
    const dur = t.durationMinutes||30;
    const slot = place(wake, dur);
    if (slot===null) continue;
    blocks.push({ id:nid(), title:t.title, emoji:'✓', color:'#eab308', startMinutes:slot, durationMinutes:dur, type:'task', sourceId:t.id, status:'proposed', reasoning:`P${t.priority} next action` });
    occupy(slot, slot+dur);
  }

  // 7. Social
  const soc = prefs.lifeBlocks.find(b=>b.id==='friends');
  if (soc?.enabled && soc.hoursPerDay>0) {
    const dur = soc.hoursPerDay*60;
    const slot = place(hm('18:00'), dur) ?? place(wake, dur);
    if (slot!==null) { blocks.push({ id:nid(), title:'Friends & Social', emoji:'🤝', color:soc.color, startMinutes:slot, durationMinutes:dur, type:'social', status:'proposed', reasoning:'Social connection prevents burnout' }); occupy(slot,slot+dur); }
  }

  // 8. Relax
  const rx = prefs.lifeBlocks.find(b=>b.id==='relax');
  if (rx?.enabled && rx.hoursPerDay>0) {
    const dur = rx.hoursPerDay*60;
    const slot = place(hm('20:00'), dur) ?? place(wake, dur);
    if (slot!==null) { blocks.push({ id:nid(), title:'Relax & Recharge', emoji:'☕', color:rx.color, startMinutes:slot, durationMinutes:dur, type:'wellbeing', status:'proposed', reasoning:'Wind-down time' }); occupy(slot,slot+dur); }
  }

  blocks.sort((a,b)=>a.startMinutes-b.startMinutes);
  return { date: dateStr, blocks };
}

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface S {
  goals: Goal[];
  sessions: Session[];
  gtdTasks: GTDTask[];
  habits: Habit[];
  addHabit: (h: Habit) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  setHabitStatus: (id: string, dateStr: string, status: HabitStatus) => void;
  incHabit: (id: string, dateStr: string) => void;
  clearHabitDay: (id: string, dateStr: string) => void;
  reflections: Record<string, ReflectionEntry>;
  metricDefs: MetricDef[];
  setReflection: (date: string, patch: Partial<ReflectionEntry>) => void;
  addMetricDef: (m: MetricDef) => void;
  deleteMetricDef: (id: string) => void;
  habitRemindersEnabled: boolean;
  defaultReminderTime: string;
  setNotifPref: (patch: { habitRemindersEnabled?: boolean; defaultReminderTime?: string }) => void;
  density: 'comfortable' | 'compact';
  setDensity: (d: 'comfortable' | 'compact') => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  userName: string;
  userProfile: { focus: string[]; struggles: string[]; sleep: string } | null;
  setUserProfile: (p: { focus: string[]; struggles: string[]; sleep: string }) => void;
  onboarded: boolean;
  introCourseCompleted: boolean;
  completeIntroCourse: () => void;
  resetIntroCourse: () => void;
  aiDisclaimerAcceptedAt: string | null;
  acceptAiDisclaimer: () => void;
  pendingGoalId: string | null;
  setPendingGoalId: (id: string | null) => void;
  lang: 'en' | 'ru' | 'ja';
  setLang: (l: 'en' | 'ru' | 'ja') => void;
  activeView: 'dashboard' | 'goals' | 'week' | 'inbox' | 'habits' | 'progress' | 'ai' | 'architect' | 'planner' | 'archive' | 'settings';
  gtdFilter: string;
  activeContext: string;
  activeArea: string;
  activePriority: string;
  searchQuery: string;
  focusTimer: FocusTimer | null;
  timerLauncher: { linkType: 'task' | 'session' | null; linkId: string | null; label: string } | null;
  weeklyReviewOpen: boolean;
  wizardOpen: boolean;
  wizardMessages: Message[];
  logOpen: boolean;
  loggingSessionId: string | null;
  sessionModalId: string | null;
  gtdEditTaskId: string | null;
  weekOffset: number;
  // AI Scheduler
  schedulePrefs: SchedulePrefs;
  generatedDay: GeneratedDay | null;
  isGenerating: boolean;
  doingTaskId: string | null;

  confirmDialog: ConfirmOpts | null;
  askConfirm: (o: ConfirmOpts) => void;
  closeConfirm: () => void;
  scheduleSeed: { title: string; durationMinutes: number; taskId?: string } | null;
  scheduleFromTask: (title: string, durationMinutes: number, taskId?: string) => void;
  consumeScheduleSeed: () => void;
  editSessionId: string | null;
  requestEditSession: (id: string) => void;
  consumeEditSession: () => void;
  setUserName: (name: string) => void;
  completeOnboarding: (name: string) => void;
  resetAll: () => void;
  restoreBackup: (data: any) => void;
  setActiveView: (v: S['activeView']) => void;
  setGTDFilter: (f: string) => void;
  setActiveContext: (c: string) => void;
  setActiveArea: (a: string) => void;
  setActivePriority: (p: string) => void;
  setSearchQuery: (q: string) => void;
  setWeekOffset: (n: number) => void;
  openWizard: () => void;
  closeWizard: () => void;
  addWizardMessage: (m: Message) => void;
  addGoal: (g: Goal) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  toggleRoadmapNode: (goalId: string, nodeId: string) => void;
  deleteGoal: (id: string) => void;
  openLog: (id: string) => void;
  closeLog: () => void;
  addSession: (s: Session) => void;
  addSessions: (s: Session[]) => void;
  deleteSession: (id: string) => void;
  deleteSeries: (seriesId: string) => void;
  updateSession: (id: string, p: Partial<Session>) => void;
  moveSession: (id: string, newDate: string, newHour?: number, newMinute?: number) => void;
  resizeSession: (id: string, newDuration: number) => void;
  syncScheduledSessions: () => void;
  openSessionModal: (id: string) => void;
  closeSessionModal: () => void;
  captureTask: (title: string, dur?: number) => void;
  processTask: (id: string, status: GTDStatus, ctx?: Partial<GTDTask>) => void;
  updateTask: (id: string, patch: Partial<GTDTask>) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (fromId: string, toId: string) => void;
  toggleTodayFocus: (id: string) => void;
  openEditTask: (id: string) => void;
  closeEditTask: () => void;
  openTimerLauncher: (o: { linkType: 'task' | 'session' | null; linkId: string | null; label: string }) => void;
  closeTimerLauncher: () => void;
  startTimer: (o: { mode: import('./types').TimerMode; targetMinutes: number; linkType: 'task' | 'session' | null; linkId: string | null; label: string }) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  adjustTimer: (deltaMinutes: number) => void;
  markTimerFinished: () => void;
  stopTimer: (markDone?: boolean) => void;
  openWeeklyReview: () => void;
  closeWeeklyReview: () => void;
  // AI Scheduler actions
  updateLifeBlock: (id: string, patch: Partial<LifeBlock>) => void;
  updatePrefs: (patch: Partial<SchedulePrefs>) => void;
  addCommitment: (c: Omit<FixedCommitment, 'id'>) => void;
  updateCommitment: (id: string, patch: Partial<FixedCommitment>) => void;
  removeCommitment: (id: string) => void;
  generateAISchedule: () => void;
  setBlockStatus: (blockId: string, status: 'accepted' | 'rejected' | 'proposed') => void;
  acceptAllBlocks: () => void;
  commitGeneratedDay: () => void;
  clearGenerated: () => void;
  setDoingTask: (id: string | null) => void;
  // ── Multi-week AI Scheduler ──
  generatedPlan: GeneratedPlan | null;
  isPlanning: boolean;
  generatePlan: (horizon: PlanHorizon, options: PlanOptions) => void;
  regeneratePlan: () => void;
  setPlanBlockStatus: (date: string, blockId: string, status: 'accepted' | 'rejected' | 'proposed') => void;
  setPlanDayStatus: (date: string, status: 'accepted' | 'rejected') => void;
  acceptAllPlanBlocks: () => void;
  commitPlan: () => void;
  clearPlan: () => void;
}

export const useStore = create<S>()(persist((set) => ({
  goals: [],
  sessions: [],
  gtdTasks: [],
  habits: [],
  addHabit: (h) => set((s) => ({ habits: [...s.habits, h] })),
  updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => h.id === id ? { ...h, ...patch } : h) })),
  deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
  setHabitStatus: (id, dateStr, status) => set((s) => ({
    habits: s.habits.map((h) => h.id === id
      ? { ...h, log: { ...h.log, [dateStr]: { status, count: status === 'done' ? h.targetCount : 0 } } }
      : h)
  })),
  incHabit: (id, dateStr) => set((s) => ({
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const cur = h.log[dateStr]?.count || 0;
      const count = Math.min(h.targetCount, cur + 1);
      return { ...h, log: { ...h.log, [dateStr]: { status: count >= h.targetCount ? 'done' : 'failed', count } } };
    })
  })),
  clearHabitDay: (id, dateStr) => set((s) => ({
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const log = { ...h.log }; delete log[dateStr];
      return { ...h, log };
    })
  })),
  reflections: {},
  metricDefs: [],
  setReflection: (date, patch) => set((s) => {
    const prev = s.reflections[date] || { date };
    return { reflections: { ...s.reflections, [date]: { ...prev, ...patch, date } } };
  }),
  addMetricDef: (m) => set((s) => ({ metricDefs: [...s.metricDefs, m] })),
  deleteMetricDef: (id) => set((s) => ({ metricDefs: s.metricDefs.filter((m) => m.id !== id) })),
  habitRemindersEnabled: true,
  defaultReminderTime: '',
  setNotifPref: (patch) => set(() => patch),
  density: 'comfortable',
  setDensity: (d) => set({ density: d }),
  theme: 'light',
  setTheme: (t) => set({ theme: t }),
  userName: '',
  userProfile: null,
  setUserProfile: (p) => set({ userProfile: p }),
  onboarded: false,
  introCourseCompleted: false,
  completeIntroCourse: () => set({ introCourseCompleted: true }),
  resetIntroCourse: () => set({ introCourseCompleted: false }),
  aiDisclaimerAcceptedAt: null,
  acceptAiDisclaimer: () => set({ aiDisclaimerAcceptedAt: new Date().toISOString() }),
  pendingGoalId: null,
  setPendingGoalId: (id) => set({ pendingGoalId: id }),
  lang: (typeof navigator !== 'undefined' && /^ru\b/i.test(navigator.language || '')) ? 'ru' : (typeof navigator !== 'undefined' && /^ja\b/i.test(navigator.language || '')) ? 'ja' : 'en',
  setLang: (l) => set({ lang: l }),
  activeView: 'dashboard',
  gtdFilter: 'inbox',
  activeContext: 'all',
  activeArea: 'all',
  activePriority: 'all',
  searchQuery: '',
  focusTimer: null,
  timerLauncher: null,
  weeklyReviewOpen: false,
  wizardOpen: false,
  wizardMessages: [],
  logOpen: false,
  loggingSessionId: null,
  sessionModalId: null,
  gtdEditTaskId: null,
  weekOffset: 0,

  confirmDialog: null,
  askConfirm: (o) => set({ confirmDialog: o }),
  closeConfirm: () => set({ confirmDialog: null }),
  scheduleSeed: null,
  scheduleFromTask: (title, durationMinutes, taskId) => set({ scheduleSeed: { title, durationMinutes, taskId }, activeView: 'week' }),
  consumeScheduleSeed: () => set({ scheduleSeed: null }),
  editSessionId: null,
  requestEditSession: (id) => set({ editSessionId: id, sessionModalId: null, activeView: 'week' }),
  consumeEditSession: () => set({ editSessionId: null }),
  setUserName: (name) => set({ userName: name.trim() }),
  completeOnboarding: (name) => set({ userName: name.trim(), onboarded: true }),
  resetAll: () => set({ goals: [], sessions: [], gtdTasks: [], habits: [], reflections: {}, metricDefs: [], generatedDay: null, weekOffset: 0 }),
  restoreBackup: (data) => set((s) => ({
    goals: Array.isArray(data?.goals) ? data.goals : s.goals,
    sessions: Array.isArray(data?.sessions) ? data.sessions : s.sessions,
    gtdTasks: Array.isArray(data?.gtdTasks) ? data.gtdTasks : s.gtdTasks,
    habits: Array.isArray(data?.habits) ? data.habits : s.habits,
    reflections: data?.reflections && typeof data.reflections === 'object' ? data.reflections : s.reflections,
    metricDefs: Array.isArray(data?.metricDefs) ? data.metricDefs : s.metricDefs,
    schedulePrefs: data?.schedulePrefs && typeof data.schedulePrefs === 'object' ? { ...s.schedulePrefs, ...data.schedulePrefs } : s.schedulePrefs,
    userName: typeof data?.userName === 'string' ? data.userName : s.userName,
    userProfile: data?.userProfile && typeof data.userProfile === 'object' ? data.userProfile : s.userProfile,
    onboarded: typeof data?.onboarded === 'boolean' ? data.onboarded : s.onboarded,
    introCourseCompleted: typeof data?.introCourseCompleted === 'boolean' ? data.introCourseCompleted : s.introCourseCompleted,
    lang: data?.lang === 'en' || data?.lang === 'ru' || data?.lang === 'ja' ? data.lang : s.lang,
    theme: data?.theme === 'light' || data?.theme === 'dark' ? data.theme : s.theme,
    density: data?.density === 'comfortable' || data?.density === 'compact' ? data.density : s.density,
    habitRemindersEnabled: typeof data?.habitRemindersEnabled === 'boolean' ? data.habitRemindersEnabled : s.habitRemindersEnabled,
    defaultReminderTime: typeof data?.defaultReminderTime === 'string' ? data.defaultReminderTime : s.defaultReminderTime,
    generatedDay: data?.generatedDay ?? s.generatedDay,
    generatedPlan: data?.generatedPlan ?? s.generatedPlan,
    weekOffset: Number.isFinite(data?.weekOffset) ? data.weekOffset : s.weekOffset,
  })),
  setActiveView: (v) => set({ activeView: v }),
  setGTDFilter: (f) => set({ gtdFilter: f, activeContext: 'all', activePriority: 'all' }),
  setActiveContext: (c) => set({ activeContext: c }),
  setActiveArea: (a) => set({ activeArea: a }),
  setActivePriority: (p) => set({ activePriority: p }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setWeekOffset: (n) => set({ weekOffset: n }),
  // content uses an i18n key marker; GoalWizardModal renders the localized greeting.
  openWizard: () => set({ wizardOpen: true, wizardMessages: [{ id:'m0', role:'ai', content:'wizard.pickCategory' }] }),
  closeWizard: () => set({ wizardOpen: false }),
  addWizardMessage: (m) => set((s) => ({ wizardMessages: [...s.wizardMessages, m] })),
  addGoal: (g) => set((s) => ({ goals: [...s.goals, g] })),
  updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map(g => g.id === id ? { ...g, ...patch } : g) })),
  toggleRoadmapNode: (goalId, nodeId) => set((s) => ({
    goals: s.goals.map((g) => {
      if (g.id !== goalId || !g.roadmap) return g;
      return { ...g, roadmap: { ...g.roadmap, phases: g.roadmap.phases.map((p) => ({ ...p, nodes: p.nodes.map((n) => n.id === nodeId ? { ...n, done: !n.done } : n) })) } };
    }),
  })),
  deleteGoal: (id) => set((s) => ({ goals: s.goals.filter(g => g.id !== id), sessions: s.sessions.map(x => x.goalId === id ? { ...x, goalId: '' } : x) })),
  openLog: (id) => set({ logOpen: true, loggingSessionId: id }),
  closeLog: () => set({ logOpen: false, loggingSessionId: null }),
  addSession: (sess) => set((s) => ({
    sessions: [...s.sessions, sess],
    gtdTasks: s.gtdTasks.some((t) => t.sessionId === sess.id) ? s.gtdTasks : [taskFromSession(sess), ...s.gtdTasks],
  })),
  addSessions: (arr) => set((s) => {
    const now = new Date().toISOString();
    const existing = new Set(s.gtdTasks.map((t) => t.sessionId).filter(Boolean));
    const linkedTasks = arr.filter((sess) => !existing.has(sess.id)).map((sess) => taskFromSession(sess, now));
    return { sessions: [...s.sessions, ...arr], gtdTasks: [...linkedTasks, ...s.gtdTasks] };
  }),
  deleteSession: (id) => set((s) => ({
    sessions: s.sessions.filter((x) => x.id !== id),
    gtdTasks: s.gtdTasks.map((t) => t.sessionId === id ? { ...t, status: 'trash' as GTDStatus, isArchived: true, updatedAt: new Date().toISOString() } : t),
  })),
  deleteSeries: (seriesId) => set((s) => ({ sessions: s.sessions.filter((x) => x.seriesId !== seriesId) })),
  updateSession: (id, p) => set((s) => {
    const updated = s.sessions.map((x) => x.id === id ? { ...x, ...p } : x);
    const session = updated.find((x) => x.id === id);
    return {
      sessions: updated,
      gtdTasks: session ? s.gtdTasks.map((t) => t.sessionId === id ? syncTaskWithSession(t, session) : t) : s.gtdTasks,
    };
  }),
  moveSession: (id, newDate, newHour, newMinute) => set((s) => ({ 
    sessions: s.sessions.map((x) => x.id === id ? { 
      ...x, 
      date: newDate, 
      ...(newHour !== undefined ? { startHour: newHour } : {}),
      ...(newMinute !== undefined ? { startMinute: newMinute } : {}),
    } : x),
    gtdTasks: s.gtdTasks.map((t) => t.sessionId === id ? { ...t, scheduledDate: newDate, updatedAt: new Date().toISOString() } : t),
  })),
  resizeSession: (id, newDuration) => set((s) => ({ 
    sessions: s.sessions.map((x) => x.id === id ? { ...x, durationMinutes: Math.max(15, newDuration) } : x),
    gtdTasks: s.gtdTasks.map((t) => t.sessionId === id ? { ...t, durationMinutes: Math.max(15, newDuration), updatedAt: new Date().toISOString() } : t),
  })),
  syncScheduledSessions: () => set((s) => {
    const linked = new Set(s.gtdTasks.map((t) => t.sessionId).filter(Boolean));
    const missing = s.sessions.filter((session) => session.date && !linked.has(session.id));
    if (!missing.length) return {};
    const now = new Date().toISOString();
    return { gtdTasks: [...missing.map((session) => taskFromSession(session, now)), ...s.gtdTasks] };
  }),
  openSessionModal: (id) => set({ sessionModalId: id }),
  closeSessionModal: () => set({ sessionModalId: null }),
  captureTask: (title, dur = 5) => set((s) => ({
    gtdTasks: [{
      id: `t${Date.now()}`,
      title,
      status: 'inbox' as GTDStatus,
      priority: 3 as Priority,
      createdAt: new Date().toISOString(),
      durationMinutes: dur,
      context: '@anywhere' as TaskContext,
      tags: [],
    }, ...s.gtdTasks]
  })),
  processTask: (id, status, ctx) => set((s) => {
    const now = new Date().toISOString();
    const orig = s.gtdTasks.find((x) => x.id === id);
    const mapped = s.gtdTasks.map((x) => x.id === id ? { ...x, status, processedAt: now, updatedAt: now, completedAt: status === 'done' ? now : x.completedAt, ...ctx } : x);
    const linkedSessionId = orig?.sessionId;
    // Completing a recurring task spawns the next occurrence (Microsoft To Do behaviour).
    if (status === 'done' && orig && orig.recurring && orig.status !== 'done') {
      const due = nextDueDate(orig.dueDate, orig.recurring);
      const next: GTDTask = {
        ...orig,
        id: `t${Date.now()}`,
        status: 'next-action',
        createdAt: now,
        updatedAt: now,
        processedAt: undefined,
        completedAt: undefined,
        dueDate: due,
        remindAt: orig.remindAt && orig.dueDate
          ? `${due}T${orig.remindAt.slice(11, 16) || '09:00'}` : undefined,
        isTodayFocus: false,
        completedPomodoros: 0,
        subtasks: (orig.subtasks || []).map((st) => ({ ...st, done: false })),
      };
      return {
        gtdTasks: [next, ...mapped],
        sessions: linkedSessionId ? s.sessions.map((x) => x.id === linkedSessionId ? { ...x, status: 'done' } : x) : s.sessions,
      };
    }
    return {
      gtdTasks: mapped,
      sessions: linkedSessionId && status === 'done'
        ? s.sessions.map((x) => x.id === linkedSessionId ? { ...x, status: 'done' } : x)
        : s.sessions,
    };
  }),
  updateTask: (id, patch) => set((s) => ({
    gtdTasks: s.gtdTasks.map((x) => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)
  })),
  toggleSubtask: (taskId, subtaskId) => set((s) => ({
    gtdTasks: s.gtdTasks.map((t) => t.id === taskId
      ? { ...t, subtasks: (t.subtasks||[]).map(st => st.id===subtaskId ? { ...st, done: !st.done } : st) }
      : t)
  })),
  deleteTask: (id) => set((s) => ({ 
    gtdTasks: s.gtdTasks.map((x) => x.id === id ? { ...x, status: 'trash' as GTDStatus, isArchived: true, updatedAt: new Date().toISOString() } : x)
  })),
  reorderTasks: (fromId, toId) => set((s) => {
    const fromIdx = s.gtdTasks.findIndex(x => x.id === fromId);
    const toIdx = s.gtdTasks.findIndex(x => x.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return {};
    const items = [...s.gtdTasks];
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    return { gtdTasks: items.map((t, i) => ({ ...t, updatedAt: new Date().toISOString(), _order: i })) };
  }),
  toggleTodayFocus: (id) => set((s) => ({
    gtdTasks: s.gtdTasks.map((x) => x.id === id ? { ...x, isTodayFocus: !x.isTodayFocus } : x)
  })),
  openEditTask: (id) => set({ gtdEditTaskId: id }),
  closeEditTask: () => set({ gtdEditTaskId: null }),
  openTimerLauncher: (o) => set({ timerLauncher: o }),
  closeTimerLauncher: () => set({ timerLauncher: null }),
  startTimer: (o) => set({
    focusTimer: {
      mode: o.mode,
      targetMinutes: Math.max(1, o.targetMinutes),
      startedAt: Date.now(),
      accumulatedMs: 0,
      running: true,
      finished: false,
      linkType: o.linkType,
      linkId: o.linkId,
      label: o.label,
    },
    timerLauncher: null,
  }),
  pauseTimer: () => set((s) => {
    const ft = s.focusTimer;
    if (!ft || !ft.running) return {};
    return { focusTimer: { ...ft, running: false, accumulatedMs: ft.accumulatedMs + (Date.now() - ft.startedAt), startedAt: 0 } };
  }),
  resumeTimer: () => set((s) => {
    const ft = s.focusTimer;
    if (!ft || ft.running) return {};
    return { focusTimer: { ...ft, running: true, finished: false, startedAt: Date.now() } };
  }),
  adjustTimer: (deltaMinutes) => set((s) => {
    const ft = s.focusTimer;
    if (!ft || ft.mode !== 'countdown') return {};
    return { focusTimer: { ...ft, targetMinutes: Math.max(1, ft.targetMinutes + deltaMinutes) } };
  }),
  markTimerFinished: () => set((s) => {
    const ft = s.focusTimer;
    if (!ft) return {};
    return { focusTimer: { ...ft, running: false, finished: true, accumulatedMs: ft.targetMinutes * 60000, startedAt: 0 } };
  }),
  stopTimer: (markDone) => set((s) => {
    const ft = s.focusTimer;
    if (!ft) return { focusTimer: null };
    if (!markDone) return { focusTimer: null };
    const elapsedMs = ft.accumulatedMs + (ft.running ? Date.now() - ft.startedAt : 0);
    const elapsedMin = Math.max(1, Math.round(elapsedMs / 60000));
    if (ft.linkType === 'task' && ft.linkId) {
      const task = s.gtdTasks.find((x) => x.id === ft.linkId);
      if (task) {
        return {
          focusTimer: null,
          gtdTasks: s.gtdTasks.map((x) => x.id === ft.linkId
            ? { ...x, status: 'done' as GTDStatus, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedPomodoros: (x.completedPomodoros || 0) + 1 }
            : x),
        };
      }
    }
    if (ft.linkType === 'session' && ft.linkId) {
      return {
        focusTimer: null,
        sessions: s.sessions.map((x) => x.id === ft.linkId
          ? { ...x, status: 'done', durationMinutes: elapsedMin }
          : x),
      };
    }
    return { focusTimer: null };
  }),
  openWeeklyReview: () => set({ weeklyReviewOpen: true }),
  closeWeeklyReview: () => set({ weeklyReviewOpen: false }),

  // ─── AI Scheduler ───
  schedulePrefs: defaultPrefs,
  generatedDay: null,
  isGenerating: false,
  generatedPlan: null,
  isPlanning: false,
  doingTaskId: null,

  updateLifeBlock: (id, patch) => set((s) => {
    const blocks = s.schedulePrefs.lifeBlocks.map(b => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      if (typeof patch.hoursPerDay === 'number') {
        // Per-block bounds, then a hard day cap: all enabled blocks together can never exceed 24h.
        let v = Math.min(Math.max(patch.hoursPerDay, b.minHours), b.maxHours);
        const others = s.schedulePrefs.lifeBlocks
          .filter(x => x.id !== id && x.enabled)
          .reduce((a, x) => a + x.hoursPerDay, 0);
        v = Math.min(v, Math.max(b.minHours, +(24 - others).toFixed(2)));
        next.hoursPerDay = v;
      }
      return next;
    });
    return { schedulePrefs: { ...s.schedulePrefs, lifeBlocks: blocks } };
  }),
  updatePrefs: (patch) => set((s) => ({ schedulePrefs: { ...s.schedulePrefs, ...patch } })),
  addCommitment: (c) => set((s) => ({
    schedulePrefs: { ...s.schedulePrefs, commitments: [...(s.schedulePrefs.commitments || []), { ...c, id: `fc-${Date.now()}` }] }
  })),
  updateCommitment: (id, patch) => set((s) => ({
    schedulePrefs: { ...s.schedulePrefs, commitments: (s.schedulePrefs.commitments || []).map(c => c.id === id ? { ...c, ...patch } : c) }
  })),
  removeCommitment: (id) => set((s) => ({
    schedulePrefs: { ...s.schedulePrefs, commitments: (s.schedulePrefs.commitments || []).filter(c => c.id !== id) }
  })),
  generateAISchedule: () => {
    set({ isGenerating: true, generatedDay: null });
    setTimeout(() => {
      const st = useStore.getState();
      const today = new Date().toISOString().slice(0,10);
      const day = generateSchedule(st.schedulePrefs, st.goals, st.gtdTasks, today);
      set({ generatedDay: day, isGenerating: false });
    }, 1400);
  },
  setBlockStatus: (blockId, status) => set((s) => ({
    generatedDay: s.generatedDay ? { ...s.generatedDay, blocks: s.generatedDay.blocks.map(b => b.id===blockId ? { ...b, status } : b) } : null
  })),
  acceptAllBlocks: () => set((s) => ({
    generatedDay: s.generatedDay ? { ...s.generatedDay, blocks: s.generatedDay.blocks.map(b => b.status==='rejected' ? b : { ...b, status:'accepted' as const }) } : null
  })),
  // Convert accepted (non-locked) blocks into real planned sessions on the schedule.
  commitGeneratedDay: () => set((s) => {
    if (!s.generatedDay) return {};
    const accepted = s.generatedDay.blocks.filter(b => b.status === 'accepted' && !b.locked);
    if (!accepted.length) return {};
    const date = s.generatedDay.date;
    const seriesId = `arch-${Date.now()}`;
    const newSessions: Session[] = accepted.map((b, i) => ({
      id: `s${Date.now()}-${i}`,
      goalId: b.type === 'goal' && b.sourceId ? b.sourceId : '',
      date,
      startHour: Math.floor(b.startMinutes / 60) % 24,
      startMinute: b.startMinutes % 60,
      durationMinutes: b.durationMinutes,
      title: b.title,
      description: b.reasoning || '',
      tasks: [],
      sessionType: 'regular',
      status: 'planned',
      color: b.color,
      seriesId,
    }));
    return { sessions: [...s.sessions, ...newSessions], generatedDay: null, activeView: 'week' };
  }),
  clearGenerated: () => set({ generatedDay: null }),
  setDoingTask: (id) => set({ doingTaskId: id }),

  // ─── Multi-week AI Scheduler ───
  generatePlan: (horizon, options) => {
    set({ isPlanning: true, generatedPlan: null });
    (async () => {
      const st = useStore.getState();
      const provider = getProvider(st.schedulePrefs.provider);
      const started = Date.now();
      const plan = await provider.generate({
        range: horizonRange(horizon),
        prefs: st.schedulePrefs,
        goals: st.goals,
        habits: st.habits,
        tasks: st.gtdTasks,
        sessions: st.sessions,
        options,
        lang: st.lang,
      });
      // keep the "building…" state visible for at least a beat so the UI doesn't flash
      const minWait = 600 - (Date.now() - started);
      if (minWait > 0) await new Promise(r => setTimeout(r, minWait));
      set({ generatedPlan: plan, isPlanning: false });
    })();
  },
  regeneratePlan: () => {
    const cur = useStore.getState().generatedPlan;
    if (!cur) return;
    const days = Math.round((parseISO(cur.range.end).getTime() - parseISO(cur.range.start).getTime()) / 86400000) + 1;
    const horizon = (days <= 7 ? '1w' : days <= 14 ? '2w' : days <= 21 ? '3w' : '4w') as PlanHorizon;
    useStore.getState().generatePlan(horizon, cur.options);
  },
  setPlanBlockStatus: (date, blockId, status) => set((s) => ({
    generatedPlan: s.generatedPlan ? { ...s.generatedPlan, days: s.generatedPlan.days.map(d => d.date !== date ? d : { ...d, blocks: d.blocks.map(b => b.id === blockId ? { ...b, status } : b) }) } : null,
  })),
  setPlanDayStatus: (date, status) => set((s) => ({
    generatedPlan: s.generatedPlan ? { ...s.generatedPlan, days: s.generatedPlan.days.map(d => d.date !== date ? d : { ...d, blocks: d.blocks.map(b => b.locked ? b : { ...b, status }) }) } : null,
  })),
  acceptAllPlanBlocks: () => set((s) => ({
    generatedPlan: s.generatedPlan ? { ...s.generatedPlan, days: s.generatedPlan.days.map(d => ({ ...d, blocks: d.blocks.map(b => b.status === 'rejected' || b.locked ? b : { ...b, status: 'accepted' as const }) })) } : null,
  })),
  // Convert every accepted, non-locked block (all source kinds) into real sessions.
  commitPlan: () => set((s) => {
    if (!s.generatedPlan) return {};
    const seriesId = `plan-${Date.now()}`;
    const newSessions: Session[] = [];
    let i = 0;
    for (const day of s.generatedPlan.days) {
      for (const b of day.blocks) {
        if (b.status !== 'accepted' || b.locked) continue;
        newSessions.push({
          id: `s${Date.now()}-${i++}`,
          goalId: b.sourceKind === 'goal' && b.sourceId ? b.sourceId : '',
          date: day.date,
          startHour: Math.floor(b.startMinutes / 60) % 24,
          startMinute: b.startMinutes % 60,
          durationMinutes: b.durationMinutes,
          title: b.title,
          description: '',
          tasks: [],
          sessionType: 'regular',
          status: 'planned',
          color: b.color,
          seriesId,
          sourceKind: b.sourceKind,
          planSourceId: b.sourceKind === 'habit' || b.sourceKind === 'task' ? b.sourceId : undefined,
        });
      }
    }
    if (!newSessions.length) return {};
    return { sessions: [...s.sessions, ...newSessions], generatedPlan: null, activeView: 'week' };
  }),
  clearPlan: () => set({ generatedPlan: null }),
}), {
  name: 'ai-scheduler-store',
  // v2: dropped the seeded demo data — start every install on a clean slate.
  // v3: self-heal malformed/legacy sessions (missing tasks[] or startHour) so they
  //     never crash the session drawer or render "undefined:00".
  // v4: add first-run intro course; existing onboarded users are marked complete.
  // v5: life-balance sanity — merge in any life blocks missing from old installs
  //     (breakfast/dinner/…), clamp hours into [min,max], add commitments[].
  version: 5,
  migrate: (persisted: any, version) => {
    if (version < 2 && persisted) {
      return { ...persisted, goals: [], sessions: [], gtdTasks: [], generatedDay: null, userName: '', onboarded: false };
    }
    if (version < 3 && persisted && Array.isArray(persisted.sessions)) {
      persisted.sessions = persisted.sessions.map((s: any) => ({
        ...s,
        tasks: Array.isArray(s.tasks) ? s.tasks : [],
        startHour: Number.isFinite(s.startHour) ? s.startHour : 9,
        startMinute: Number.isFinite(s.startMinute) ? s.startMinute : 0,
        durationMinutes: Number.isFinite(s.durationMinutes) ? s.durationMinutes : 60,
      }));
    }
    if (version < 4 && persisted) {
      persisted.introCourseCompleted = !!persisted.onboarded;
    }
    if (version < 5 && persisted?.schedulePrefs) {
      const prefs = persisted.schedulePrefs;
      const existing: any[] = Array.isArray(prefs.lifeBlocks) ? prefs.lifeBlocks : [];
      // Re-add default blocks lost by older installs, clamp saved hours into bounds.
      prefs.lifeBlocks = defaultLifeBlocks.map(def => {
        const cur = existing.find((b: any) => b.id === def.id);
        if (!cur) return def;
        const merged = { ...def, ...cur, minHours: def.minHours, maxHours: def.maxHours };
        merged.hoursPerDay = Math.min(Math.max(Number(merged.hoursPerDay) || def.recommended, def.minHours), def.maxHours);
        return merged;
      });
      // Keep any custom blocks that aren't part of the defaults.
      for (const b of existing) if (!prefs.lifeBlocks.some((x: any) => x.id === b.id)) prefs.lifeBlocks.push(b);
      if (!Array.isArray(prefs.commitments)) prefs.commitments = [];
    }
    return persisted;
  },
  // Persist only durable data — not transient UI/modal state.
  partialize: (s) => ({
    goals: s.goals,
    sessions: s.sessions,
    gtdTasks: s.gtdTasks,
    habits: s.habits,
    reflections: s.reflections,
    metricDefs: s.metricDefs,
    habitRemindersEnabled: s.habitRemindersEnabled,
    defaultReminderTime: s.defaultReminderTime,
    density: s.density,
    theme: s.theme,
    userName: s.userName,
    userProfile: s.userProfile,
    onboarded: s.onboarded,
    introCourseCompleted: s.introCourseCompleted,
    aiDisclaimerAcceptedAt: s.aiDisclaimerAcceptedAt,
    lang: s.lang,
    schedulePrefs: s.schedulePrefs,
    generatedDay: s.generatedDay,
    generatedPlan: s.generatedPlan,
    weekOffset: s.weekOffset,
    focusTimer: s.focusTimer,
  }),
}));
