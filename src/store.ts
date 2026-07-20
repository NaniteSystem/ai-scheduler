import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, parseISO, format, isWeekend, differenceInCalendarDays } from 'date-fns';
import type { Goal, Session, GTDTask, GTDStatus, Priority, TaskContext, SchedulePrefs, LifeBlock, Habit, HabitGroup, HabitStatus, ReflectionEntry, MetricDef, FocusTimer, GeneratedPlan, PlanHorizon, PlanOptions, FixedCommitment, Milestone, AppView, Project } from './types';
import { getProvider, horizonRange } from './scheduler';
import { hapticSuccess, hapticTick } from './utils/haptics';
import { createId } from './domain/id';
import { removeSessions, transitionSession, transitionTaskStatus } from './domain/taskTransitions';
import { extendRecurringSeries } from './domain/recurrence';
import { todayFocusKey } from './domain/taskFocus';
import { removeHabitGroup } from './domain/habitGroups';
import { migrateLegacyProjects } from './domain/projects';
import { CURRENT_STORE_VERSION, DEFAULT_LIFE_BLOCKS, migratePersistedState } from './services/persistence';
import { restoreBackupState } from './services/backup';

export { nextDueDate } from './domain/taskTransitions';

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
    case 'timesPerWeek': {
      // Flexible weekly quota: a done day is always "due"; otherwise the day is
      // due while the week (Mon-start) hasn't reached the quota yet.
      const key = format(date, 'yyyy-MM-dd');
      if (h.log[key]?.status === 'done') return true;
      const quota = Math.max(1, Math.min(7, h.timesPerWeek || 3));
      const dow = (date.getDay() + 6) % 7; // Monday = 0
      let done = 0;
      for (let i = 0; i < dow; i++) {
        const d = addDays(date, -(dow - i));
        if (h.log[format(d, 'yyyy-MM-dd')]?.status === 'done') done++;
      }
      return done < quota;
    }
    default:         return true;
  }
}

/** Current streak: consecutive due-days ending today with status 'done' ('rest' keeps it, 'failed'/missed past day breaks it). */
export function habitStreak(h: Habit, today: Date = new Date()): number {
  if (h.recurrence === 'timesPerWeek') {
    // Flexible habits streak in WEEKS that met the quota; the current week
    // doesn't break the streak while it's still in progress.
    const quota = Math.max(1, Math.min(7, h.timesPerWeek || 3));
    const weekStart = new Date(today); weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const doneInWeek = (ws: Date) => {
      let n = 0;
      for (let i = 0; i < 7; i++) n += h.log[format(addDays(ws, i), 'yyyy-MM-dd')]?.status === 'done' ? 1 : 0;
      return n;
    };
    let streak = doneInWeek(weekStart) >= quota ? 1 : 0;
    const created = parseISO(h.createdAt);
    for (let w = 1; w < 200; w++) {
      const ws = addDays(weekStart, -7 * w);
      if (addDays(ws, 6) < created) break;
      if (doneInWeek(ws) >= quota) streak++;
      else break;
    }
    return streak;
  }
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

/** A milestone counts as reached when marked done manually OR when the goal's
 *  logged hours have crossed its targetValue (cumulative hours). Derived — never persisted. */
export function milestoneReached(m: Milestone, hoursLogged: number): boolean {
  return m.done || (m.targetValue > 0 && hoursLogged >= m.targetValue);
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
  if (ms.length > 0) return Math.round((ms.filter((m) => milestoneReached(m, hours)).length / ms.length) * 100);
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

const defaultPrefs: SchedulePrefs = {
  wakeTime: '06:30',
  sleepTime: '23:00',
  fasting: false,
  workStart: '09:00',
  workEnd: '17:00',
  hasWork: true,
  productivityPeak: 'morning',
  weekStartsOn: 1,
  lifeBlocks: DEFAULT_LIFE_BLOCKS,
  commitments: [],
};

/** Add calendar allocations and connect only sessions that explicitly came from a task. */
function appendSessions(tasks: GTDTask[], current: Session[], incoming: Session[]) {
  const timestamp = new Date().toISOString();
  const taskBySession = new Map(tasks.filter(task => task.sessionId).map(task => [task.sessionId!, task.id]));
  const normalized = incoming.map(session => session.taskId || !taskBySession.has(session.id)
    ? session
    : { ...session, taskId: taskBySession.get(session.id) });
  const sessionByTask = new Map(normalized.filter(session => session.taskId).map(session => [session.taskId!, session]));
  const gtdTasks = tasks.map(task => {
    const session = sessionByTask.get(task.id);
    if (!session) return task;
    return {
      ...task,
      sessionId: session.id,
      scheduledDate: session.date || task.scheduledDate,
      durationMinutes: session.durationMinutes || task.durationMinutes,
      status: task.status === 'done' || task.status === 'trash' ? task.status : 'scheduled' as const,
      updatedAt: timestamp,
    };
  });
  return { sessions: [...current, ...normalized], gtdTasks };
}


export interface NotifPrefs {
  sessions: boolean;
  tasks: boolean;
  quietEnabled: boolean;
  quietStart: string; // 'HH:MM'
  quietEnd: string;   // 'HH:MM'
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
  projects: Project[];
  habits: Habit[];
  habitGroups: HabitGroup[];
  addHabit: (h: Habit) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  addHabitGroup: (group: HabitGroup) => void;
  updateHabitGroup: (id: string, patch: Pick<Partial<HabitGroup>, 'name' | 'color'>) => void;
  deleteHabitGroup: (id: string) => void;
  setHabitStatus: (id: string, dateStr: string, status: HabitStatus) => void;
  incHabit: (id: string, dateStr: string) => void;
  clearHabitDay: (id: string, dateStr: string) => void;
  reflections: Record<string, ReflectionEntry>;
  metricDefs: MetricDef[];
  setReflection: (date: string, patch: Partial<ReflectionEntry>) => void;
  addMetricDef: (m: MetricDef) => void;
  deleteMetricDef: (id: string) => void;
  habitRemindersEnabled: boolean;
  setNotifPref: (patch: { habitRemindersEnabled?: boolean }) => void;
  notifPrefs: NotifPrefs;
  setNotifPrefs: (patch: Partial<NotifPrefs>) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  userName: string;
  userProfile: { focus: string[]; struggles: string[]; sleep: string; age?: string; source?: string } | null;
  setUserProfile: (p: { focus: string[]; struggles: string[]; sleep: string; age?: string; source?: string }) => void;
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
  activeView: AppView;
  gtdFilter: string;
  activeContext: string;
  activePriority: string;
  searchQuery: string;
  focusTimer: FocusTimer | null;
  timerLauncher: { linkType: 'task' | 'session' | 'habit' | null; linkId: string | null; label: string } | null;
  timerAssignmentOpen: boolean;
  weeklyReviewOpen: boolean;
  wizardOpen: boolean;
  logOpen: boolean;
  loggingSessionId: string | null;
  sessionModalId: string | null;
  gtdEditTaskId: string | null;
  weekOffset: number;
  // AI Scheduler
  schedulePrefs: SchedulePrefs;
  doingTaskId: string | null;

  confirmDialog: ConfirmOpts | null;
  askConfirm: (o: ConfirmOpts) => void;
  closeConfirm: () => void;
  scheduleSeed: { title: string; durationMinutes: number; taskId?: string; goalId?: string } | null;
  scheduleFromTask: (title: string, durationMinutes: number, taskId?: string, goalId?: string) => void;
  consumeScheduleSeed: () => void;
  editSessionId: string | null;
  requestEditSession: (id: string) => void;
  consumeEditSession: () => void;
  setUserName: (name: string) => void;
  completeOnboarding: (name: string) => void;
  resetAll: () => void;
  restoreBackup: (data: any) => void;
  importTasks: (tasks: GTDTask[]) => void;
  addProject: (title: string, options?: { outcome?: string; targetDate?: string; deadline?: string }) => string;
  updateProject: (id: string, patch: Partial<Pick<Project, 'title' | 'outcome' | 'definitionOfDone' | 'color' | 'status' | 'health' | 'targetDate' | 'deadline' | 'notes'>>) => void;
  setActiveView: (v: AppView) => void;
  setGTDFilter: (f: string) => void;
  setActiveContext: (c: string) => void;
  setActivePriority: (p: string) => void;
  setSearchQuery: (q: string) => void;
  setWeekOffset: (n: number) => void;
  openWizard: () => void;
  closeWizard: () => void;
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
  extendRecurringSeries: () => void;
  openSessionModal: (id: string) => void;
  closeSessionModal: () => void;
  captureTask: (title: string, dur?: number) => string;
  processTask: (id: string, status: GTDStatus, ctx?: Partial<GTDTask>) => void;
  updateTask: (id: string, patch: Partial<GTDTask>) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteTask: (id: string) => void;
  pendingUndo: {
    kind?: 'delete' | 'complete';
    items: { id: string; status: GTDStatus; isArchived?: boolean; sessionId?: string; scheduledDate?: string }[];
    taskSnapshot?: GTDTask;
    sessionSnapshots?: { id: string; status: Session['status'] }[];
    ts: number;
  } | null;
  undoDelete: () => void;
  clearUndo: () => void;
  toggleTodayFocus: (id: string) => void;
  openEditTask: (id: string) => void;
  closeEditTask: () => void;
  openTimerLauncher: (o: { linkType: 'task' | 'session' | 'habit' | null; linkId: string | null; label: string }) => void;
  closeTimerLauncher: () => void;
  openTimerAssignment: () => void;
  closeTimerAssignment: () => void;
  assignTimerLink: (o: { linkType: 'task' | 'session' | 'habit'; linkId: string; label: string }) => void;
  startTimer: (o: { mode: import('./types').TimerMode; targetMinutes: number; linkType: 'task' | 'session' | 'habit' | null; linkId: string | null; label: string }) => void;
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
  setDoingTask: (id: string | null) => void;
  // ── Multi-week AI Scheduler ──
  generatedPlan: GeneratedPlan | null;
  isPlanning: boolean;
  planningError: string | null;
  generatePlan: (horizon: PlanHorizon, options: PlanOptions) => void;
  regeneratePlan: () => void;
  setPlanBlockStatus: (date: string, blockId: string, status: 'accepted' | 'rejected' | 'proposed') => void;
  setPlanDayStatus: (date: string, status: 'accepted' | 'rejected') => void;
  acceptAllPlanBlocks: () => void;
  commitPlan: () => void;
  clearPlan: () => void;
}

// Guards async planning from committing an obsolete result after a newer run
// (or after the user discards the draft) has already started.
let latestPlanRequest = 0;

export const useStore = create<S>()(persist((set) => ({
  goals: [],
  sessions: [],
  gtdTasks: [],
  projects: [],
  habits: [],
  habitGroups: [],
  addHabit: (h) => set((s) => ({ habits: [...s.habits, h] })),
  updateHabit: (id, patch) => set((s) => ({ habits: s.habits.map((h) => h.id === id ? { ...h, ...patch } : h) })),
  deleteHabit: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
  addHabitGroup: (group) => set((s) => ({ habitGroups: [...s.habitGroups, group] })),
  updateHabitGroup: (id, patch) => set((s) => ({
    habitGroups: s.habitGroups.map(group => group.id === id ? { ...group, ...patch } : group),
  })),
  deleteHabitGroup: (id) => set((s) => removeHabitGroup(s.habitGroups, s.habits, id)),
  setHabitStatus: (id, dateStr, status) => set((s) => {
    if (status === 'done') hapticSuccess(); else hapticTick();
    return {
      habits: s.habits.map((h) => h.id === id
        ? { ...h, log: { ...h.log, [dateStr]: { status, count: status === 'done' ? h.targetCount : 0 } } }
        : h)
    };
  }),
  incHabit: (id, dateStr) => set((s) => ({
    habits: s.habits.map((h) => {
      if (h.id !== id) return h;
      const cur = h.log[dateStr]?.count || 0;
      const count = Math.min(h.targetCount, cur + 1);
      if (count >= h.targetCount) hapticSuccess(); else hapticTick();
      // Under-target progress is 'partial', not 'failed' — 3/8 glasses is not a failure.
      return { ...h, log: { ...h.log, [dateStr]: { status: count >= h.targetCount ? 'done' : 'partial', count } } };
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
  setNotifPref: (patch) => set(() => patch),
  notifPrefs: { sessions: true, tasks: true, quietEnabled: false, quietStart: '22:00', quietEnd: '08:00' },
  setNotifPrefs: (patch) => set((s) => ({ notifPrefs: { ...s.notifPrefs, ...patch } })),
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
  activePriority: 'all',
  searchQuery: '',
  focusTimer: null,
  timerLauncher: null,
  timerAssignmentOpen: false,
  weeklyReviewOpen: false,
  wizardOpen: false,
  logOpen: false,
  loggingSessionId: null,
  sessionModalId: null,
  gtdEditTaskId: null,
  weekOffset: 0,

  confirmDialog: null,
  askConfirm: (o) => set({ confirmDialog: o }),
  closeConfirm: () => set({ confirmDialog: null }),
  scheduleSeed: null,
  scheduleFromTask: (title, durationMinutes, taskId, goalId) => set({ scheduleSeed: { title, durationMinutes, taskId, goalId }, activeView: 'week' }),
  consumeScheduleSeed: () => set({ scheduleSeed: null }),
  editSessionId: null,
  requestEditSession: (id) => set({ editSessionId: id, sessionModalId: null, activeView: 'week' }),
  consumeEditSession: () => set({ editSessionId: null }),
  setUserName: (name) => set({ userName: name.trim() }),
  completeOnboarding: (name) => set({ userName: name.trim(), onboarded: true, introCourseCompleted: true }),
  resetAll: () => {
    latestPlanRequest++;
    set({
      goals: [], sessions: [], gtdTasks: [], projects: [], habits: [], habitGroups: [], reflections: {}, metricDefs: [],
      generatedPlan: null, isPlanning: false,
      planningError: null, focusTimer: null, pendingUndo: null, weekOffset: 0,
    });
  },
  importTasks: (tasks) => set((s) => {
    const migrated = migrateLegacyProjects(s.projects, tasks);
    return { projects: migrated.projects, gtdTasks: [...migrated.gtdTasks, ...s.gtdTasks] };
  }),
  addProject: (title, options) => {
    const trimmed = title.trim();
    if (!trimmed) return '';
    const id = createId('project');
    const now = new Date().toISOString();
    set((s) => ({
      projects: [...s.projects, {
        id,
        title: trimmed,
        outcome: options?.outcome?.trim() || '',
        color: '#8b5cf6',
        status: 'active',
        health: 'unknown',
        ...(options?.targetDate ? { targetDate: options.targetDate } : {}),
        ...(options?.deadline ? { deadline: options.deadline } : {}),
        createdAt: now,
      }],
    }));
    return id;
  },
  updateProject: (id, patch) => set((s) => ({
    projects: s.projects.map(project => project.id === id
      ? {
        ...project,
        ...patch,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.outcome !== undefined ? { outcome: patch.outcome.trim() } : {}),
        ...(patch.definitionOfDone !== undefined ? { definitionOfDone: patch.definitionOfDone.trim() || undefined } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
        ...(patch.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        ...(patch.status === 'archived' ? { archivedAt: new Date().toISOString() } : {}),
        updatedAt: new Date().toISOString(),
      }
      : project),
  })),
  restoreBackup: (data) => set((s) => restoreBackupState(s as unknown as Record<string, unknown>, data) as Partial<S>),
  setActiveView: (v) => set({ activeView: v }),
  setGTDFilter: (f) => set({ gtdFilter: f, activeContext: 'all', activePriority: 'all' }),
  setActiveContext: (c) => set({ activeContext: c }),
  setActivePriority: (p) => set({ activePriority: p }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setWeekOffset: (n) => set({ weekOffset: n }),
  openWizard: () => set({ wizardOpen: true }),
  closeWizard: () => set({ wizardOpen: false }),
  addGoal: (g) => set((s) => ({ goals: [...s.goals, g] })),
  updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map(g => g.id === id ? { ...g, ...patch } : g) })),
  toggleRoadmapNode: (goalId, nodeId) => set((s) => ({
    goals: s.goals.map((g) => {
      if (g.id !== goalId || !g.roadmap) return g;
      return { ...g, roadmap: { ...g.roadmap, phases: g.roadmap.phases.map((p) => ({ ...p, nodes: p.nodes.map((n) => n.id === nodeId ? { ...n, done: !n.done } : n) })) } };
    }),
  })),
  deleteGoal: (id) => set((s) => ({
    goals: s.goals.filter(g => g.id !== id),
    sessions: s.sessions.map(session => session.goalId === id ? { ...session, goalId: '' } : session),
    habits: s.habits.map(habit => habit.goalId === id ? { ...habit, goalId: undefined } : habit),
  })),
  openLog: (id) => set({ logOpen: true, loggingSessionId: id }),
  closeLog: () => set({ logOpen: false, loggingSessionId: null }),
  addSession: (sess) => set((s) => appendSessions(s.gtdTasks, s.sessions, [sess])),
  addSessions: (arr) => set((s) => appendSessions(s.gtdTasks, s.sessions, arr)),
  deleteSession: (id) => set((s) => removeSessions(s, new Set([id]))),
  deleteSeries: (seriesId) => set((s) => {
    const ids = new Set(s.sessions.filter((x) => x.seriesId === seriesId).map((x) => x.id));
    return removeSessions(s, ids);
  }),
  updateSession: (id, p) => set((s) => transitionSession(s, id, p)),
  moveSession: (id, newDate, newHour, newMinute) => set((s) => transitionSession(s, id, {
    date: newDate,
    ...(newHour !== undefined ? { startHour: newHour } : {}),
    ...(newMinute !== undefined ? { startMinute: newMinute } : {}),
  })),
  resizeSession: (id, newDuration) => set((s) => transitionSession(s, id, { durationMinutes: Math.max(15, newDuration) })),
  syncScheduledSessions: () => set((s) => {
    const taskBySession = new Map(s.gtdTasks.filter(task => task.sessionId).map(task => [task.sessionId!, task.id]));
    let changed = false;
    const sessions = s.sessions.map(session => {
      const taskId = taskBySession.get(session.id);
      if (session.taskId || !taskId) return session;
      changed = true;
      return { ...session, taskId };
    });
    return changed ? { sessions } : {};
  }),
  extendRecurringSeries: () => set((s) => {
    const added = extendRecurringSeries(s.sessions);
    return added.length ? { sessions: [...s.sessions, ...added] } : {};
  }),
  openSessionModal: (id) => set({ sessionModalId: id }),
  closeSessionModal: () => set({ sessionModalId: null }),
  captureTask: (title, dur) => {
    const id = createId('task');
    set((s) => ({
      gtdTasks: [{
        id,
        title,
        status: 'inbox' as GTDStatus,
        priority: 3 as Priority,
        createdAt: new Date().toISOString(),
        durationMinutes: dur && dur > 0 ? dur : undefined,
        context: '@anywhere' as TaskContext,
        tags: [],
      }, ...s.gtdTasks]
    }));
    return id;
  },
  processTask: (id, status, ctx) => set((s) => {
    const before = s.gtdTasks.find(task => task.id === id);
    const next = transitionTaskStatus(s, id, status, ctx);
    // Completion is one tap in every task list. For non-recurring tasks keep a
    // short rollback window, including a linked calendar session, so a stray
    // tap never turns into silent data loss. Recurring completion deliberately
    // skips this because it creates the next occurrence.
    if (status === 'done' && before && before.status !== 'done' && !before.recurring) {
      const sessionSnapshots = s.sessions
        .filter(session => session.taskId === id || session.id === before.sessionId)
        .map(session => ({ id: session.id, status: session.status }));
      return {
        ...next,
        pendingUndo: { kind: 'complete', items: [{ id, status: before.status }], taskSnapshot: before, sessionSnapshots, ts: Date.now() },
      };
    }
    return next;
  }),
  updateTask: (id, patch) => set((s) => ({
    gtdTasks: s.gtdTasks.map((x) => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x),
    sessions: patch.sessionId
      ? s.sessions.map(session => session.id === patch.sessionId ? { ...session, taskId: id } : session)
      : s.sessions,
  })),
  toggleSubtask: (taskId, subtaskId) => set((s) => ({
    gtdTasks: s.gtdTasks.map((t) => t.id === taskId
      ? { ...t, subtasks: (t.subtasks||[]).map(st => st.id===subtaskId ? { ...st, done: !st.done } : st) }
      : t)
  })),
  deleteTask: (id) => set((s) => {
    const t = s.gtdTasks.find((x) => x.id === id);
    if (!t || t.status === 'trash') return {};
    return {
      gtdTasks: s.gtdTasks.map((x) => x.id === id ? { ...x, sessionId: undefined, status: 'trash' as GTDStatus, isArchived: true, updatedAt: new Date().toISOString() } : x),
      sessions: s.sessions.map(session => session.taskId === id ? { ...session, taskId: undefined } : session),
      pendingUndo: { kind: 'delete', items: [...(s.pendingUndo?.items ?? []), { id, status: t.status, isArchived: t.isArchived, sessionId: t.sessionId, scheduledDate: t.scheduledDate }], ts: Date.now() },
    };
  }),
  pendingUndo: null,
  undoDelete: () => set((s) => {
    if (!s.pendingUndo) return {};
    if (s.pendingUndo.kind === 'complete' && s.pendingUndo.taskSnapshot) {
      const task = s.pendingUndo.taskSnapshot;
      const statuses = new Map((s.pendingUndo.sessionSnapshots || []).map(session => [session.id, session.status]));
      return {
        gtdTasks: s.gtdTasks.map(item => item.id === task.id ? task : item),
        sessions: s.sessions.map(session => statuses.has(session.id) ? { ...session, status: statuses.get(session.id)! } : session),
        pendingUndo: null,
      };
    }
    const prev = new Map(s.pendingUndo.items.map((i) => [i.id, i]));
    return {
      gtdTasks: s.gtdTasks.map((x) => {
        const p = prev.get(x.id);
        return p ? { ...x, status: p.status, isArchived: p.isArchived, sessionId: p.sessionId, scheduledDate: p.scheduledDate, updatedAt: new Date().toISOString() } : x;
      }),
      sessions: s.sessions.map(session => {
        const task = s.pendingUndo?.items.find(item => item.sessionId === session.id);
        return task ? { ...session, taskId: task.id } : session;
      }),
      pendingUndo: null,
    };
  }),
  clearUndo: () => set({ pendingUndo: null }),
  toggleTodayFocus: (id) => set((s) => {
    const today = todayFocusKey();
    return {
      gtdTasks: s.gtdTasks.map((x) => x.id === id
        ? { ...x, todayFocusDate: x.todayFocusDate === today ? undefined : today, isTodayFocus: undefined }
        : x),
    };
  }),
  openEditTask: (id) => set({ gtdEditTaskId: id }),
  closeEditTask: () => set({ gtdEditTaskId: null }),
  openTimerLauncher: (o) => set({ timerLauncher: o }),
  closeTimerLauncher: () => set({ timerLauncher: null }),
  openTimerAssignment: () => set({ timerAssignmentOpen: true }),
  closeTimerAssignment: () => set({ timerAssignmentOpen: false }),
  assignTimerLink: (o) => set((s) => s.focusTimer ? { focusTimer: { ...s.focusTimer, ...o }, timerAssignmentOpen: false } : { timerAssignmentOpen: false }),
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
        return { gtdTasks: s.gtdTasks.map((x) => x.id === ft.linkId ? { ...x, completedPomodoros: (task.completedPomodoros || 0) + 1, updatedAt: new Date().toISOString() } : x), focusTimer: null };
      }
    }
    if (ft.linkType === 'session' && ft.linkId) {
      const next = transitionSession(s, ft.linkId, { status: 'done', durationMinutes: elapsedMin });
      return { ...next, focusTimer: null };
    }
    if (ft.linkType === 'habit' && ft.linkId) {
      const date = format(new Date(), 'yyyy-MM-dd');
      return { habits: s.habits.map((h) => h.id === ft.linkId ? { ...h, log: { ...h.log, [date]: { status: 'done', count: h.targetCount } } } : h), focusTimer: null };
    }
    return { focusTimer: null };
  }),
  openWeeklyReview: () => set({ weeklyReviewOpen: true }),
  closeWeeklyReview: () => set({ weeklyReviewOpen: false }),

  // ─── AI Scheduler ───
  schedulePrefs: defaultPrefs,
  generatedPlan: null,
  isPlanning: false,
  planningError: null,
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
    schedulePrefs: { ...s.schedulePrefs, commitments: [...(s.schedulePrefs.commitments || []), { ...c, id: createId('commitment') }] }
  })),
  updateCommitment: (id, patch) => set((s) => ({
    schedulePrefs: { ...s.schedulePrefs, commitments: (s.schedulePrefs.commitments || []).map(c => c.id === id ? { ...c, ...patch } : c) }
  })),
  removeCommitment: (id) => set((s) => ({
    schedulePrefs: { ...s.schedulePrefs, commitments: (s.schedulePrefs.commitments || []).filter(c => c.id !== id) }
  })),
  setDoingTask: (id) => set({ doingTaskId: id }),

  // ─── Multi-week AI Scheduler ───
  generatePlan: (horizon, options) => {
    const requestId = ++latestPlanRequest;
    set({ isPlanning: true, planningError: null, generatedPlan: null });
    (async () => {
      try {
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
          profile: st.userProfile,
        });
        const minWait = 600 - (Date.now() - started);
        if (minWait > 0) await new Promise(r => setTimeout(r, minWait));
        if (requestId !== latestPlanRequest) return;
        set({ generatedPlan: plan, isPlanning: false, planningError: null });
      } catch (error) {
        if (requestId !== latestPlanRequest) return;
        const message = error instanceof Error ? error.message.slice(0, 160) : 'planning-failed';
        set({ generatedPlan: null, isPlanning: false, planningError: message });
      }
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
    const planId = s.generatedPlan.id;
    const newSessions: Session[] = [];
    for (const day of s.generatedPlan.days) {
      for (const b of day.blocks) {
        if (b.status !== 'accepted' || b.locked) continue;
        const sourceTask = b.sourceKind === 'task' && b.sourceId ? s.gtdTasks.find(task => task.id === b.sourceId) : undefined;
        newSessions.push({
          id: createId('session'),
          goalId: b.sourceKind === 'goal' && b.sourceId ? b.sourceId : '',
          ...(sourceTask && !sourceTask.recurring ? { taskId: sourceTask.id } : {}),
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
          planId,
          sourceKind: b.sourceKind,
          planSourceId: b.sourceKind === 'habit' || b.sourceKind === 'task' ? b.sourceId : undefined,
        });
      }
    }
    if (!newSessions.length) return {};
    const appended = appendSessions(s.gtdTasks, s.sessions, newSessions);
    return { ...appended, generatedPlan: null, activeView: 'week' };
  }),
  clearPlan: () => {
    latestPlanRequest++;
    set({ generatedPlan: null, isPlanning: false, planningError: null });
  },
}), {
  name: 'ai-scheduler-store',
  // v2: dropped the seeded demo data — start every install on a clean slate.
  // v3: self-heal malformed/legacy sessions (missing tasks[] or startHour) so they
  //     never crash the session drawer or render "undefined:00".
  // v4: add first-run intro course; existing onboarded users are marked complete.
  // v5: life-balance sanity — merge in any life blocks missing from old installs
  //     (breakfast/dinner/…), clamp hours into [min,max], add commitments[].
  // v6: counter-habit days logged under target were stored as 'failed' — reclassify
  //     them as 'partial' so history stops showing honest progress as failures.
  // v7: Session.taskId becomes the canonical task↔calendar link; old plan batch
  //     ids stop masquerading as recurrence series (deleting one must not delete all).
  // v8: GTDStatus dropped 'project'/'waiting-for'/'reference' — those statuses had no
  //     way to be assigned from the UI (dead-end data). Any leftover tasks fold into
  //     'someday-maybe', which is where they were already grouped for viewing.
  // v9: My Day is date-scoped. The former boolean leaked yesterday's focus into
  // every future day, so existing selected tasks are kept for today only.
  // v10: habit groups organize related routines while habits remain independent.
  // v11: projects become durable operational containers instead of task labels.
  version: CURRENT_STORE_VERSION,
  migrate: migratePersistedState,
  // Persist only durable data — not transient UI/modal state.
  partialize: (s) => ({
    goals: s.goals,
    sessions: s.sessions,
    gtdTasks: s.gtdTasks,
    projects: s.projects,
    habits: s.habits,
    habitGroups: s.habitGroups,
    reflections: s.reflections,
    metricDefs: s.metricDefs,
    habitRemindersEnabled: s.habitRemindersEnabled,
    notifPrefs: s.notifPrefs,
    theme: s.theme,
    userName: s.userName,
    userProfile: s.userProfile,
    onboarded: s.onboarded,
    introCourseCompleted: s.introCourseCompleted,
    aiDisclaimerAcceptedAt: s.aiDisclaimerAcceptedAt,
    lang: s.lang,
    schedulePrefs: s.schedulePrefs,
    generatedPlan: s.generatedPlan,
    weekOffset: s.weekOffset,
    focusTimer: s.focusTimer,
  }),
}));
