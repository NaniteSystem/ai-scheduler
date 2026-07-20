export type Category =
  | 'language' | 'reading' | 'sport' | 'course' | 'creative'
  | 'career' | 'personal' | 'home' | 'finance' | 'social'
  | 'writing' | 'music' | 'meditation' | 'health';

export type AppView =
  | 'dashboard' | 'goals' | 'projects' | 'week' | 'inbox' | 'habits' | 'progress' | 'manager' | 'statistics'
  | 'architect' | 'planner' | 'archive' | 'settings';

export type SessionType = 'regular' | 'checkpoint' | 'catchup' | 'intensive';
export type SessionStatus = 'planned' | 'confirmed' | 'done' | 'skipped';

export interface Milestone {
  id: string;
  title: string;
  targetValue: number;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  subtitle?: string;
  category: Category;
  emoji: string;
  color: string;
  deadline?: string;
  priority: number;
  totalHoursEstimated: number;
  hoursPerWeekTarget: number;
  sessionsCompleted: number;
  sessionsTotal: number;
  hoursLogged: number;
  milestones: Milestone[];
  metadata: Record<string, any>;
  aiInsight?: string;
  roadmap?: GoalRoadmap;
  nextSessionTitle?: string;
  nextSessionDate?: string;
  // ── Completion ──
  completionType?: 'hours' | 'date';   // criterion: target hours of sessions, or a target date. Default 'hours'.
  status?: 'active' | 'completed';     // default 'active'
  outcome?: 'success' | 'failed';      // set when completed
  completedAt?: string;                // ISO timestamp when marked complete
}

// ─── Goal-AI Roadmap (Feature 1) ────────────────────────────────────────────
export type GoalKind = 'learn' | 'acquire' | 'build' | 'other';
export type RoadmapDepth = 'surface' | 'medium' | 'deep';
export type RoadmapNodeKind = 'skill' | 'knowledge' | 'task' | 'milestone';
export type LocalizedText = string | Partial<Record<'en' | 'ru' | 'ja', string>>;

export interface RoadmapResource {
  label: LocalizedText;
  url?: string;
  kind?: 'video' | 'site' | 'app' | 'course' | 'book';
}
export interface RoadmapNode {
  id: string;
  title: LocalizedText;
  detail?: LocalizedText;
  resources?: RoadmapResource[];
  kind?: RoadmapNodeKind;
  done: boolean;
}
export interface RoadmapPhase {
  id: string;
  title: LocalizedText;
  summary?: LocalizedText;
  nodes: RoadmapNode[];
}
export interface GoalRoadmap {
  depth: RoadmapDepth;
  kind: GoalKind;
  phases: RoadmapPhase[];
  tips: LocalizedText[];
  generatedBy: 'ai';
  model?: string;
  createdAt: string;
  lang?: 'en' | 'ru' | 'ja';
}

export interface Session {
  id: string;
  /** Start time only — no explicit end chosen. durationMinutes then holds a
   *  nominal 60 for grid layout/engine, but UI hides the end/duration. */
  openEnd?: boolean;
  goalId: string;
  /** Optional actionable item whose time this session reserves. */
  taskId?: string;
  date: string;
  startHour: number;
  startMinute?: number;
  durationMinutes: number;
  title: string;
  description: string;
  tasks: { task: string; durationMin: number }[];
  sessionType: SessionType;
  status: SessionStatus;
  recurrence?: RecurringPattern;   // if part of a repeating series
  seriesId?: string;               // groups sessions created from one repeat rule OR multi-day instances
  progressLog?: { metric: string; value: number; feeling: 'bad'|'ok'|'good'|'great'; notes?: string };
  // ── Optional calendar-style fields ──
  color?: string;                  // custom block color; overrides goal color when set
  icon?: string;                   // custom icon key (see ui/IconPicker)
  allDay?: boolean;                // all-day event (no specific time slot)
  reminderMinutes?: number;        // minutes before start to fire a local notification; undefined = none
  location?: string;
  url?: string;
  // ── Provenance when created by the multi-week AI Scheduler ──
  sourceKind?: 'goal' | 'habit' | 'task' | 'life';
  planSourceId?: string;           // originating habit/task id (separate from goalId/seriesId)
  planId?: string;                 // provenance only; unlike seriesId it does not couple deletion
}

// ── Focus timer (Pomodoro / stopwatch) ──
export type TimerMode = 'countdown' | 'stopwatch';
export interface FocusTimer {
  mode: TimerMode;
  targetMinutes: number;     // countdown length (adjustable); ignored for stopwatch
  startedAt: number;         // epoch ms of the current running stretch; 0 when paused
  accumulatedMs: number;     // elapsed time banked before the current stretch
  running: boolean;
  finished: boolean;         // countdown reached zero, awaiting user confirm/dismiss
  linkType: 'task' | 'session' | 'habit' | null;
  linkId: string | null;
  label: string;             // task/session title, for the bar + notification
}

export type GTDStatus = 'inbox' | 'next-action' | 'scheduled' | 'someday-maybe' | 'done' | 'trash';

export type ProjectStatus = 'idea' | 'planned' | 'active' | 'waiting' | 'paused' | 'completed' | 'canceled' | 'archived';
export type ProjectHealth = 'on-track' | 'at-risk' | 'blocked' | 'unknown';
export type ProjectReviewCadence = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface Project {
  id: string;
  title: string;
  /** What should become true when this finite project is finished. */
  outcome: string;
  /** Optional completion criteria that separate "done" from merely archived. */
  definitionOfDone?: string;
  color: string;
  status: ProjectStatus;
  health: ProjectHealth;
  /** Optional long-term outcome or responsibility this project contributes to. */
  goalId?: string;
  areaId?: string;
  /** When to begin work; unlike deadline this is not external pressure. */
  startDate?: string;
  /** Planned finish date. */
  targetDate?: string;
  /** Hard external finish date. */
  deadline?: string;
  reviewCadence?: ProjectReviewCadence;
  nextReviewDate?: string;
  defaultSectionId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  archivedAt?: string;
}

export type Priority = 1 | 2 | 3 | 4; // P1=urgent, P4=none
export type EnergyLevel = 'deep' | 'medium' | 'shallow' | 'any';
export type TaskContext = '@home' | '@work' | '@phone' | '@computer' | '@errand' | '@anywhere';
export type RecurringPattern = 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'weekends' | 'custom';

export interface GTDTask {
  id: string;
  /** Legacy/shortcut back-reference. Session.taskId is the canonical link. */
  sessionId?: string;
  title: string;
  description?: string;
  notes?: string;
  status: GTDStatus;
  priority: Priority;
  createdAt: string;
  processedAt?: string;
  updatedAt?: string;
  durationMinutes?: number;
  dueDate?: string;
  scheduledDate?: string;
  completedAt?: string;
  energyLevel?: EnergyLevel;
  remindAt?: string;     // ISO datetime to fire a local notification reminder
  context?: TaskContext;
  projectId?: string;    // operational container; Goals remain outcome-oriented
  /** @deprecated migrated to projectId; retained for older backup compatibility. */
  project?: string;
  tags?: string[];
  subtasks?: { id: string; title: string; done: boolean }[];
  recurring?: RecurringPattern;
  recurFromCompletion?: boolean;   // Todoist "every!": next occurrence counts from completion, not due date
  completedPomodoros?: number;
  /** Calendar date for the My Day selection. Replaces the old permanent flag. */
  todayFocusDate?: string;
  /** @deprecated use todayFocusDate; retained only while older backups migrate. */
  isTodayFocus?: boolean;
  isArchived?: boolean;
}

// ─── Habits (routine tracker) ──────────────────────────────────────────────
export type HabitStatus = 'done' | 'failed' | 'rest' | 'partial';   // per-day outcome; 'rest' = excused skip (keeps streak); 'partial' = counter habit under target
export type HabitAnchor =
  | 'none' | 'wake' | 'morning' | 'afternoon' | 'evening' | 'sleep'
  | 'afterBreakfast' | 'afterLunch' | 'afterDinner';     // situational trigger instead of a clock time
export type HabitRecurrence = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'everyN' | 'timesPerWeek';

export interface HabitLogEntry { status: HabitStatus; count: number }

export interface HabitGroup {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  emoji: string;               // custom completion marker
  color: string;
  anchor: HabitAnchor;         // "after waking", "after lunch", … (or 'none')
  recurrence: HabitRecurrence;
  intervalDays?: number;       // for 'everyN'
  timesPerWeek?: number;       // for 'timesPerWeek' — flexible weekly quota (e.g. 3× a week, any days)
  targetCount: number;         // quantitative target per day (default 1)
  unit?: string;               // e.g. 'glasses', 'pages'
  goalId?: string;             // link to a long-term goal (hierarchy)
  groupId?: string;            // optional routine group; the habit remains independently editable
  reminderTime?: string;       // optional daily reminder 'HH:MM'
  createdAt: string;
  archived?: boolean;
  log: Record<string, HabitLogEntry>;  // keyed by 'yyyy-MM-dd'
}

// ─── Reflection & well-being (H3) ──────────────────────────────────────────
export interface MetricDef { id: string; name: string; unit?: string }   // user-defined numeric metric (weight, sleep, …)
export interface ReflectionEntry {
  date: string;                       // 'yyyy-MM-dd' — one entry per day
  mood?: number;                      // 1..5
  note?: string;                      // free-text journal
  metrics?: Record<string, number>;   // values keyed by MetricDef.id
}

// ─── AI Scheduling Engine ───────────────────────────────────────────────
export interface LifeBlock {
  id: string;
  label: string;
  emoji: string;
  color: string;
  category: 'essential' | 'wellbeing' | 'social' | 'buffer';
  hoursPerDay: number;       // current setting
  minHours: number;
  maxHours: number;
  recommended: number;       // AI default
  enabled: boolean;
  fixedTime?: string;        // e.g. "07:00" for breakfast
  flexible: boolean;         // can AI move it?
  description: string;
}

// A user-defined fixed obligation (study, gym class, second job, …) that
// repeats on chosen weekdays and is locked busy time for every scheduler.
export interface FixedCommitment {
  id: string;
  title: string;
  emoji: string;
  start: string;             // "HH:MM"
  end: string;               // "HH:MM"
  days: number[];            // weekdays 0=Sun … 6=Sat
  enabled: boolean;
  breakStart?: string;       // optional free window inside the commitment
  breakEnd?: string;         //   (e.g. lunch break) — schedulable time
}

export interface SchedulePrefs {
  wakeTime: string;          // "06:30"
  sleepTime: string;         // "23:00"
  fasting: boolean;          // skip meals
  fastingType?: string;      // "16:8" | "full-day" | "ramadan"
  workStart: string;
  workEnd: string;
  hasWork: boolean;
  workBreakStart?: string;   // optional break inside work hours (free window)
  workBreakEnd?: string;
  productivityPeak: 'morning' | 'afternoon' | 'evening';
  weekStartsOn: 0 | 1;        // 0 = Sunday, 1 = Monday
  lifeBlocks: LifeBlock[];
  commitments: FixedCommitment[];   // user-defined fixed obligations
  provider?: string;          // active SchedulerProvider id; default 'rule-based'
}

export interface GeneratedBlock {
  id: string;
  title: string;
  emoji: string;
  color: string;
  startMinutes: number;      // minutes from 00:00
  durationMinutes: number;
  type: 'goal' | 'task' | 'habit' | 'essential' | 'wellbeing' | 'social' | 'buffer' | 'work';
  sourceKind?: 'goal' | 'habit' | 'task' | 'life';   // where the block came from (for commit)
  sourceId?: string;         // goal id / habit id / task id
  status: 'proposed' | 'accepted' | 'rejected';
  locked?: boolean;
  reasoning?: string;        // why AI placed it here
}

export interface GeneratedDay {
  date: string;
  blocks: GeneratedBlock[];
}

// ─── Multi-week AI Scheduler ────────────────────────────────────────────
export type PlanHorizon = '1w' | '2w' | '3w' | '4w';   // selectable week → month

export type PlanIntensity = 'light' | 'balanced' | 'intense';

export interface PlanOptions {
  includeGoals: boolean;
  includeHabits: boolean;
  includeRecurring: boolean;
  includeTasks: boolean;
  intensity?: PlanIntensity;   // how packed the schedule should be (default 'balanced')
  instructions?: string;       // free-text wishes passed to the AI ("keep evenings free", …)
}

export interface PlanInput {
  range: { start: string; end: string };   // ISO 'yyyy-MM-dd', inclusive
  prefs: SchedulePrefs;
  goals: Goal[];
  habits: Habit[];
  tasks: GTDTask[];
  sessions: Session[];         // existing calendar sessions — treated as busy time
  options: PlanOptions;
  lang: 'en' | 'ru' | 'ja';
  profile?: { focus: string[]; struggles: string[]; sleep: string; age?: string; source?: string } | null; // onboarding answers → personalization
}

export interface GeneratedPlan {
  id: string;
  createdAt: string;
  providerId: string;          // 'ai' | 'rule-based'
  fallback?: boolean;          // true when AI was requested but the local engine built the plan
  advice?: string;             // AI's short summary of how it balanced the plan (user language)
  range: { start: string; end: string };
  options: PlanOptions;
  days: GeneratedDay[];
}

export const CATEGORY_META: Record<Category, { emoji: string; label: string; color: string; gradient: string }> = {
  language:   { emoji: '🌍', label: 'Language',    color: '#e11d48', gradient: 'from-rose-600 to-pink-600' },
  reading:    { emoji: '📖', label: 'Reading',     color: '#d97706', gradient: 'from-amber-600 to-yellow-600' },
  sport:      { emoji: '🏃', label: 'Fitness',     color: '#059669', gradient: 'from-emerald-600 to-green-600' },
  course:     { emoji: '🎓', label: 'Course',      color: '#2563eb', gradient: 'from-blue-600 to-indigo-600' },
  creative:   { emoji: '🎨', label: 'Creative',    color: '#db2777', gradient: 'from-pink-600 to-fuchsia-600' },
  career:     { emoji: '💼', label: 'Career',      color: '#7c3aed', gradient: 'from-violet-600 to-purple-600' },
  personal:   { emoji: '🧠', label: 'Personal',    color: '#8b5cf6', gradient: 'from-purple-500 to-violet-600' },
  home:       { emoji: '🏠', label: 'Home',        color: '#0891b2', gradient: 'from-cyan-600 to-teal-600' },
  finance:    { emoji: '💰', label: 'Finance',     color: '#16a34a', gradient: 'from-green-600 to-emerald-600' },
  social:     { emoji: '🤝', label: 'Social',      color: '#ea580c', gradient: 'from-orange-600 to-red-600' },
  writing:    { emoji: '✍️', label: 'Writing',     color: '#4f46e5', gradient: 'from-indigo-600 to-blue-600' },
  music:      { emoji: '🎵', label: 'Music',       color: '#c026d3', gradient: 'from-fuchsia-600 to-purple-600' },
  meditation: { emoji: '🧘', label: 'Meditation',  color: '#0d9488', gradient: 'from-teal-600 to-cyan-600' },
  health:     { emoji: '❤️', label: 'Health',      color: '#dc2626', gradient: 'from-red-600 to-rose-600' },
};
