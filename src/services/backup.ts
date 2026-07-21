import { APP_VERSION } from '../version.ts';
import { CURRENT_STORE_VERSION, migratePersistedState } from './persistence.ts';
import { migrateLegacyProjects, normalizeProject } from '../domain/projects.ts';

const FORMAT = 'nebulla.backup';
const SCHEMA_VERSION = 1;
const MIN_RECOVERY_STORE_VERSION = 2;

export const DURABLE_KEYS = [
  'goals', 'sessions', 'gtdTasks', 'projects', 'areas', 'habits', 'habitGroups', 'reflections', 'metricDefs',
  'habitRemindersEnabled', 'notifPrefs', 'theme', 'userName',
  'userProfile', 'onboarded', 'introCourseCompleted', 'aiDisclaimerAcceptedAt',
  'lang', 'schedulePrefs', 'generatedPlan', 'weekOffset',
  'focusTimer',
] as const;

export type BackupData = Partial<Record<(typeof DURABLE_KEYS)[number], unknown>>;

export interface NebullaBackup {
  format: typeof FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  data: BackupData;
}

export type BackupSourceMetadata =
  | { kind: 'envelope'; schemaVersion: number; appVersion?: string; exportedAt?: string }
  | { kind: 'recovery'; storeVersion: number }
  | { kind: 'legacy' };

export interface BackupInspection {
  data: BackupData;
  source: BackupSourceMetadata;
}

export type BackupPreviewAction = 'update' | 'replace' | 'clear';
export type BackupPreviewKey =
  | 'goals' | 'sessions' | 'gtdTasks' | 'projects' | 'areas' | 'habits' | 'habitGroups' | 'reflections' | 'metricDefs'
  | 'profile' | 'preferences' | 'notifications' | 'generatedPlan' | 'focusTimer';

export interface BackupPreviewRow {
  action: BackupPreviewAction;
  /** Collection size before import. Present only on collection rows. */
  before?: number;
  /** Collection size after import. Present only on collection rows. */
  after?: number;
  /** Convenient alias for the resulting collection size. */
  count?: number;
}

export type BackupPreview = Partial<Record<BackupPreviewKey, BackupPreviewRow>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_WEEK_OFFSET = 5_200;

const dateIsValid = (value: unknown): value is string => typeof value === 'string'
  && DATE_PATTERN.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const dateTimeIsValid = (value: unknown): value is string => typeof value === 'string'
  && DATE_TIME_PATTERN.test(value)
  && dateIsValid(value.slice(0, 10))
  && !Number.isNaN(Date.parse(value));
const timeIsValid = (value: unknown): value is string => typeof value === 'string' && TIME_PATTERN.test(value);
const optionalFieldIsValid = (
  value: Record<string, unknown>,
  key: string,
  validate: (field: unknown) => boolean,
) => !hasOwn(value, key) || value[key] === undefined || validate(value[key]);
const recordIdsAreUnique = (items: unknown[]): boolean => {
  const seen = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string') return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return true;
};

const CATEGORIES = new Set([
  'language', 'reading', 'sport', 'course', 'creative', 'career', 'personal',
  'home', 'finance', 'social', 'writing', 'music', 'meditation', 'health',
]);
const HABIT_ANCHORS = new Set([
  'none', 'wake', 'morning', 'afternoon', 'evening', 'sleep',
  'afterBreakfast', 'afterLunch', 'afterDinner',
]);
const HABIT_RECURRENCES = new Set(['daily', 'weekdays', 'weekends', 'weekly', 'everyN', 'timesPerWeek']);
const HABIT_STATUSES = new Set(['done', 'failed', 'rest', 'partial']);
const PRODUCTIVITY_PEAKS = new Set(['morning', 'afternoon', 'evening']);
const LIFE_CATEGORIES = new Set(['essential', 'wellbeing', 'social', 'buffer']);
const GTD_STATUSES = new Set(['inbox', 'next-action', 'scheduled', 'someday-maybe', 'done', 'trash']);
const ENERGY_LEVELS = new Set(['deep', 'medium', 'shallow', 'any']);
const TASK_CONTEXTS = new Set(['@home', '@work', '@phone', '@computer', '@errand', '@anywhere']);
const RECURRING_PATTERNS = new Set(['daily', 'weekly', 'monthly', 'weekdays', 'weekends', 'custom']);
const PLAN_INTENSITIES = new Set(['light', 'balanced', 'intense']);
const PLAN_BLOCK_TYPES = new Set(['goal', 'task', 'habit', 'essential', 'wellbeing', 'social', 'buffer', 'work']);
const PLAN_SOURCE_KINDS = new Set(['goal', 'habit', 'task', 'life']);
const PLAN_BLOCK_STATUSES = new Set(['proposed', 'accepted', 'rejected']);
const LANGUAGES = new Set(['en', 'ru', 'ja']);
const THEMES = new Set(['light', 'dark', 'system']);
const GOAL_COMPLETION_TYPES = new Set(['hours', 'date']);
const GOAL_STATUSES = new Set(['active', 'completed']);
const GOAL_OUTCOMES = new Set(['success', 'failed']);
const ROADMAP_DEPTHS = new Set(['surface', 'medium', 'deep']);
const GOAL_KINDS = new Set(['learn', 'acquire', 'build', 'other']);
const ROADMAP_NODE_KINDS = new Set(['skill', 'knowledge', 'task', 'milestone']);
const ROADMAP_RESOURCE_KINDS = new Set(['video', 'site', 'app', 'course', 'book']);
const FASTING_TYPES = new Set(['16:8', 'full-day', 'ramadan']);
const PROJECT_STATUSES = new Set(['idea', 'planned', 'active', 'waiting', 'paused', 'completed', 'canceled', 'archived']);
const PROJECT_HEALTH = new Set(['on-track', 'at-risk', 'blocked', 'unknown']);
const PROJECT_REVIEW_CADENCES = new Set(['none', 'weekly', 'biweekly', 'monthly']);

function projectIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string' && value.title.trim().length > 0
    && typeof value.outcome === 'string'
    && typeof value.color === 'string'
    && typeof value.status === 'string' && PROJECT_STATUSES.has(value.status)
    && typeof value.health === 'string' && PROJECT_HEALTH.has(value.health)
    && dateTimeIsValid(value.createdAt)
    && optionalFieldIsValid(value, 'definitionOfDone', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'goalId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'areaId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'startDate', dateIsValid)
    && optionalFieldIsValid(value, 'targetDate', dateIsValid)
    && optionalFieldIsValid(value, 'deadline', dateIsValid)
    && optionalFieldIsValid(value, 'reviewCadence', field => typeof field === 'string' && PROJECT_REVIEW_CADENCES.has(field))
    && optionalFieldIsValid(value, 'nextReviewDate', dateIsValid)
    && optionalFieldIsValid(value, 'defaultSectionId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'notes', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'updatedAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'completedAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'archivedAt', dateTimeIsValid);
}

function areaIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string' && value.title.trim().length > 0
    && typeof value.color === 'string'
    && dateTimeIsValid(value.createdAt)
    && optionalFieldIsValid(value, 'icon', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'notes', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'archivedAt', dateTimeIsValid);
}

function gtdTaskIsValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.status === 'string' && GTD_STATUSES.has(value.status)
    && Number.isInteger(value.priority) && (value.priority as number) >= 1 && (value.priority as number) <= 4
    && dateTimeIsValid(value.createdAt)
    && optionalFieldIsValid(value, 'sessionId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'description', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'notes', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'processedAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'updatedAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'durationMinutes', field => isFiniteNumber(field) && field >= 0)
    && optionalFieldIsValid(value, 'dueDate', dateIsValid)
    && optionalFieldIsValid(value, 'scheduledDate', dateIsValid)
    && optionalFieldIsValid(value, 'completedAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'energyLevel', field => typeof field === 'string' && ENERGY_LEVELS.has(field))
    && optionalFieldIsValid(value, 'remindAt', dateTimeIsValid)
    && optionalFieldIsValid(value, 'context', field => typeof field === 'string' && TASK_CONTEXTS.has(field))
    && optionalFieldIsValid(value, 'projectId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'project', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'tags', field => Array.isArray(field) && field.every(tag => typeof tag === 'string'))
    && optionalFieldIsValid(value, 'subtasks', field => Array.isArray(field) && field.every(subtask => isRecord(subtask)
      && typeof subtask.id === 'string'
      && typeof subtask.title === 'string'
      && typeof subtask.done === 'boolean'))
    && optionalFieldIsValid(value, 'recurring', field => typeof field === 'string' && RECURRING_PATTERNS.has(field))
    && optionalFieldIsValid(value, 'recurFromCompletion', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'completedPomodoros', field => Number.isInteger(field) && (field as number) >= 0)
    && optionalFieldIsValid(value, 'todayFocusDate', dateIsValid)
    && optionalFieldIsValid(value, 'isTodayFocus', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'isArchived', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'blockingReason', field => typeof field === 'string');
}

function userProfileIsValid(value: unknown): boolean {
  return value === null || (isRecord(value)
    && Array.isArray(value.focus) && value.focus.every(item => typeof item === 'string')
    && Array.isArray(value.struggles) && value.struggles.every(item => typeof item === 'string')
    && typeof value.sleep === 'string'
    && optionalFieldIsValid(value, 'age', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'source', field => typeof field === 'string'));
}

function notifPrefsAreValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.sessions === 'boolean'
    && typeof value.tasks === 'boolean'
    && typeof value.quietEnabled === 'boolean'
    && timeIsValid(value.quietStart)
    && timeIsValid(value.quietEnd);
}

function reflectionsAreValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([date, entry]) => dateIsValid(date)
    && isRecord(entry)
    && entry.date === date
    && dateIsValid(entry.date)
    && optionalFieldIsValid(entry, 'mood', field => Number.isInteger(field) && (field as number) >= 1 && (field as number) <= 5)
    && optionalFieldIsValid(entry, 'note', field => typeof field === 'string')
    && optionalFieldIsValid(entry, 'metrics', field => isRecord(field) && Object.values(field).every(isFiniteNumber)));
}

function planOptionsAreValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.includeGoals === 'boolean'
    && typeof value.includeHabits === 'boolean'
    && typeof value.includeRecurring === 'boolean'
    && typeof value.includeTasks === 'boolean'
    && optionalFieldIsValid(value, 'intensity', field => typeof field === 'string' && PLAN_INTENSITIES.has(field))
    && optionalFieldIsValid(value, 'instructions', field => typeof field === 'string');
}

function generatedBlockIsValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.emoji === 'string'
    && typeof value.color === 'string'
    && isFiniteNumber(value.startMinutes) && value.startMinutes >= 0
    && isFiniteNumber(value.durationMinutes) && value.durationMinutes >= 0
    && typeof value.type === 'string' && PLAN_BLOCK_TYPES.has(value.type)
    && typeof value.status === 'string' && PLAN_BLOCK_STATUSES.has(value.status)
    && optionalFieldIsValid(value, 'sourceKind', field => typeof field === 'string' && PLAN_SOURCE_KINDS.has(field))
    && optionalFieldIsValid(value, 'sourceId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'locked', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'reasoning', field => typeof field === 'string');
}

function generatedPlanIsValid(value: unknown): boolean {
  return value === null || (isRecord(value)
    && typeof value.id === 'string'
    && dateTimeIsValid(value.createdAt)
    && typeof value.providerId === 'string'
    && optionalFieldIsValid(value, 'fallback', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'advice', field => typeof field === 'string')
    && isRecord(value.range)
    && dateIsValid(value.range.start)
    && dateIsValid(value.range.end)
    && planOptionsAreValid(value.options)
    && Array.isArray(value.days)
    && value.days.every(day => isRecord(day)
      && dateIsValid(day.date)
      && Array.isArray(day.blocks)
      && day.blocks.every(generatedBlockIsValid)));
}

function localizedTextIsValid(value: unknown): boolean {
  return typeof value === 'string' || (isRecord(value) && Object.values(value).every(item => typeof item === 'string'));
}

function roadmapIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.depth === 'string' && ROADMAP_DEPTHS.has(value.depth)
    && typeof value.kind === 'string' && GOAL_KINDS.has(value.kind)
    && Array.isArray(value.phases)
    && value.phases.every(phase => isRecord(phase)
      && typeof phase.id === 'string'
      && localizedTextIsValid(phase.title)
      && optionalFieldIsValid(phase, 'summary', localizedTextIsValid)
      && Array.isArray(phase.nodes)
      && phase.nodes.every(node => isRecord(node)
        && typeof node.id === 'string'
        && localizedTextIsValid(node.title)
        && optionalFieldIsValid(node, 'detail', localizedTextIsValid)
        && optionalFieldIsValid(node, 'resources', field => Array.isArray(field)
          && field.every(resource => isRecord(resource)
            && localizedTextIsValid(resource.label)
            && optionalFieldIsValid(resource, 'url', item => typeof item === 'string')
            && optionalFieldIsValid(resource, 'kind', item => typeof item === 'string' && ROADMAP_RESOURCE_KINDS.has(item))))
        && optionalFieldIsValid(node, 'kind', field => typeof field === 'string' && ROADMAP_NODE_KINDS.has(field))
        && typeof node.done === 'boolean'))
    && Array.isArray(value.tips)
    && value.tips.every(localizedTextIsValid)
    && value.generatedBy === 'ai'
    && dateTimeIsValid(value.createdAt)
    && optionalFieldIsValid(value, 'model', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'lang', field => typeof field === 'string' && LANGUAGES.has(field));
}

function goalIsValid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.category === 'string' && CATEGORIES.has(value.category)
    && typeof value.emoji === 'string'
    && typeof value.color === 'string'
    && isFiniteNumber(value.priority)
    && isFiniteNumber(value.totalHoursEstimated)
    && isFiniteNumber(value.hoursPerWeekTarget)
    && isFiniteNumber(value.sessionsCompleted)
    && isFiniteNumber(value.sessionsTotal)
    && isFiniteNumber(value.hoursLogged)
    && Array.isArray(value.milestones)
    && value.milestones.every(milestone => isRecord(milestone)
      && typeof milestone.id === 'string'
      && typeof milestone.title === 'string'
      && isFiniteNumber(milestone.targetValue)
      && typeof milestone.done === 'boolean')
    && isRecord(value.metadata)
    && optionalFieldIsValid(value, 'subtitle', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'deadline', dateIsValid)
    && optionalFieldIsValid(value, 'aiInsight', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'roadmap', roadmapIsValid)
    && optionalFieldIsValid(value, 'nextSessionTitle', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'nextSessionDate', dateIsValid)
    && optionalFieldIsValid(value, 'completionType', field => typeof field === 'string' && GOAL_COMPLETION_TYPES.has(field))
    && optionalFieldIsValid(value, 'status', field => typeof field === 'string' && GOAL_STATUSES.has(field))
    && optionalFieldIsValid(value, 'outcome', field => typeof field === 'string' && GOAL_OUTCOMES.has(field))
    && optionalFieldIsValid(value, 'completedAt', dateTimeIsValid);
}

function habitIsValid(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.log)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.emoji === 'string'
    && typeof value.color === 'string'
    && typeof value.anchor === 'string' && HABIT_ANCHORS.has(value.anchor)
    && typeof value.recurrence === 'string' && HABIT_RECURRENCES.has(value.recurrence)
    && isFiniteNumber(value.targetCount) && value.targetCount > 0
    && dateTimeIsValid(value.createdAt)
    && optionalFieldIsValid(value, 'intervalDays', field => Number.isInteger(field) && (field as number) >= 2)
    && optionalFieldIsValid(value, 'timesPerWeek', field => Number.isInteger(field) && (field as number) >= 1 && (field as number) <= 7)
    && optionalFieldIsValid(value, 'unit', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'goalId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'groupId', field => typeof field === 'string')
    && optionalFieldIsValid(value, 'reminderTime', timeIsValid)
    && optionalFieldIsValid(value, 'archived', field => typeof field === 'boolean')
    && Object.values(value.log).every(entry => isRecord(entry)
      && typeof entry.status === 'string' && HABIT_STATUSES.has(entry.status)
      && isFiniteNumber(entry.count) && entry.count >= 0);
}

function habitGroupIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.color === 'string'
    && dateTimeIsValid(value.createdAt);
}

function lifeBlockIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && typeof value.emoji === 'string'
    && typeof value.color === 'string'
    && typeof value.category === 'string' && LIFE_CATEGORIES.has(value.category)
    && isFiniteNumber(value.hoursPerDay)
    && isFiniteNumber(value.minHours)
    && isFiniteNumber(value.maxHours)
    && isFiniteNumber(value.recommended)
    && typeof value.enabled === 'boolean'
    && optionalFieldIsValid(value, 'fixedTime', timeIsValid)
    && typeof value.flexible === 'boolean'
    && typeof value.description === 'string';
}

function commitmentIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.emoji === 'string'
    && timeIsValid(value.start)
    && timeIsValid(value.end)
    && Array.isArray(value.days)
    && value.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    && typeof value.enabled === 'boolean'
    && optionalFieldIsValid(value, 'breakStart', timeIsValid)
    && optionalFieldIsValid(value, 'breakEnd', timeIsValid);
}

function schedulePrefsAreValid(value: unknown): boolean {
  return isRecord(value)
    && timeIsValid(value.wakeTime)
    && timeIsValid(value.sleepTime)
    && typeof value.fasting === 'boolean'
    && optionalFieldIsValid(value, 'fastingType', field => typeof field === 'string' && FASTING_TYPES.has(field))
    && timeIsValid(value.workStart)
    && timeIsValid(value.workEnd)
    && typeof value.hasWork === 'boolean'
    && optionalFieldIsValid(value, 'workBreakStart', timeIsValid)
    && optionalFieldIsValid(value, 'workBreakEnd', timeIsValid)
    && typeof value.productivityPeak === 'string' && PRODUCTIVITY_PEAKS.has(value.productivityPeak)
    && (value.weekStartsOn === 0 || value.weekStartsOn === 1)
    && Array.isArray(value.lifeBlocks) && value.lifeBlocks.every(lifeBlockIsValid) && recordIdsAreUnique(value.lifeBlocks)
    && Array.isArray(value.commitments) && value.commitments.every(commitmentIsValid) && recordIdsAreUnique(value.commitments)
    && (!hasOwn(value, 'provider') || value.provider === undefined || typeof value.provider === 'string');
}

function metricDefsAreValid(value: unknown): boolean {
  return Array.isArray(value) && recordIdsAreUnique(value) && value.every(metric => isRecord(metric)
    && typeof metric.id === 'string'
    && typeof metric.name === 'string'
    && optionalFieldIsValid(metric, 'unit', field => typeof field === 'string'));
}

function focusTimerIsValid(value: unknown): boolean {
  return value === null || (isRecord(value)
    && (value.mode === 'countdown' || value.mode === 'stopwatch')
    && isFiniteNumber(value.targetMinutes)
    && isFiniteNumber(value.startedAt)
    && isFiniteNumber(value.accumulatedMs)
    && typeof value.running === 'boolean'
    && typeof value.finished === 'boolean'
    && (value.linkType === null || value.linkType === 'task' || value.linkType === 'session' || value.linkType === 'habit')
    && (value.linkId === null || typeof value.linkId === 'string')
    && typeof value.label === 'string');
}

const SESSION_TYPES = new Set(['regular', 'checkpoint', 'catchup', 'intensive']);
const SESSION_STATUSES = new Set(['planned', 'confirmed', 'done', 'skipped']);
const SESSION_FEELINGS = new Set(['bad', 'ok', 'good', 'great']);

function progressLogIsValid(value: unknown): boolean {
  return isRecord(value)
    && typeof value.metric === 'string'
    && isFiniteNumber(value.value)
    && typeof value.feeling === 'string' && SESSION_FEELINGS.has(value.feeling)
    && optionalFieldIsValid(value, 'notes', field => typeof field === 'string');
}

function normalizeSessions(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const sessions: Record<string, unknown>[] = [];

  for (const item of value) {
    if (!isRecord(item)
      || typeof item.id !== 'string'
      || typeof item.title !== 'string'
      || typeof item.goalId !== 'string'
      || !dateIsValid(item.date)) return null;

    const startHour = item.startHour === undefined ? 9 : item.startHour;
    const startMinute = item.startMinute === undefined ? 0 : item.startMinute;
    const durationMinutes = item.durationMinutes === undefined ? 60 : item.durationMinutes;
    const description = item.description === undefined ? '' : item.description;
    const tasks = item.tasks === undefined ? [] : item.tasks;
    const sessionType = item.sessionType === undefined ? 'regular' : item.sessionType;
    const status = item.status === undefined ? 'planned' : item.status;

    if (!Number.isInteger(startHour) || (startHour as number) < 0 || (startHour as number) > 23
      || !Number.isInteger(startMinute) || (startMinute as number) < 0 || (startMinute as number) > 59
      || !Number.isFinite(durationMinutes) || (durationMinutes as number) < 0
      || typeof description !== 'string'
      || !Array.isArray(tasks)
      || !tasks.every(task => isRecord(task)
        && typeof task.task === 'string'
        && Number.isFinite(task.durationMin)
        && (task.durationMin as number) >= 0)
      || typeof sessionType !== 'string' || !SESSION_TYPES.has(sessionType)
      || typeof status !== 'string' || !SESSION_STATUSES.has(status)
      || !optionalFieldIsValid(item, 'openEnd', field => typeof field === 'boolean')
      || !optionalFieldIsValid(item, 'taskId', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'recurrence', field => typeof field === 'string' && RECURRING_PATTERNS.has(field))
      || !optionalFieldIsValid(item, 'seriesId', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'progressLog', progressLogIsValid)
      || !optionalFieldIsValid(item, 'color', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'icon', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'allDay', field => typeof field === 'boolean')
      || !optionalFieldIsValid(item, 'reminderMinutes', field => isFiniteNumber(field) && field >= 0)
      || !optionalFieldIsValid(item, 'location', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'url', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'sourceKind', field => typeof field === 'string' && PLAN_SOURCE_KINDS.has(field))
      || !optionalFieldIsValid(item, 'planSourceId', field => typeof field === 'string')
      || !optionalFieldIsValid(item, 'planId', field => typeof field === 'string')) return null;

    sessions.push({
      ...item,
      startHour,
      startMinute,
      durationMinutes,
      description,
      tasks,
      sessionType,
      status,
    });
  }

  return sessions;
}

/** Fill the former task.sessionId-only link without changing valid current links. */
function normalizeTaskLinks(data: BackupData): void {
  if (!Array.isArray(data.sessions) || !Array.isArray(data.gtdTasks)) return;
  const taskBySession = new Map(
    data.gtdTasks
      .filter(task => isRecord(task) && typeof task.id === 'string' && typeof task.sessionId === 'string')
      .map(task => [(task as Record<string, unknown>).sessionId as string, (task as Record<string, unknown>).id as string]),
  );
  data.sessions = data.sessions.map(session => {
    if (!isRecord(session) || typeof session.taskId === 'string') return session;
    const taskId = typeof session.id === 'string' ? taskBySession.get(session.id) : undefined;
    return taskId ? { ...session, taskId } : session;
  });
}

function sessionTaskLinksAreValid(data: BackupData): boolean {
  if (!Array.isArray(data.sessions) || !Array.isArray(data.gtdTasks)) return true;
  const taskIds = new Set(data.gtdTasks
    .filter(task => isRecord(task) && typeof task.id === 'string')
    .map(task => (task as Record<string, unknown>).id));
  return data.sessions.every(session => !isRecord(session)
    || typeof session.taskId !== 'string'
    || taskIds.has(session.taskId));
}

function normalizeLegacyTaskProjects(data: BackupData): void {
  if (!Array.isArray(data.gtdTasks)
    || !data.gtdTasks.some(task => isRecord(task) && typeof task.project === 'string' && task.project.trim())) return;
  const migrated = migrateLegacyProjects(data.projects, data.gtdTasks);
  data.projects = migrated.projects;
  data.gtdTasks = migrated.gtdTasks;
}

function taskProjectLinksAreValid(data: BackupData): boolean {
  const tasksReferenceProjects = Array.isArray(data.gtdTasks)
    && data.gtdTasks.some(task => isRecord(task) && typeof task.projectId === 'string');
  if ('projects' in data && !('gtdTasks' in data)) return false;
  if (tasksReferenceProjects && !('projects' in data)) return false;
  if (!Array.isArray(data.projects) || !Array.isArray(data.gtdTasks)) return true;
  const projectIds = new Set(data.projects
    .filter(project => isRecord(project) && typeof project.id === 'string')
    .map(project => project.id));
  return data.gtdTasks.every(task => !isRecord(task)
    || typeof task.projectId !== 'string'
    || projectIds.has(task.projectId));
}

/** Select only durable fields; Zustand actions and transient modal state never enter a backup. */
export function makeBackup(state: Record<string, unknown>, now = new Date()): NebullaBackup {
  const data: BackupData = {};
  for (const key of DURABLE_KEYS) if (key in state) data[key] = state[key];
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: now.toISOString(), data };
}

export function serializeBackup(state: Record<string, unknown>, now = new Date()): string {
  return JSON.stringify(makeBackup(state, now), null, 2);
}

/** Build the durable store patch used by the Zustand restore action. */
export function restoreBackupState(state: Record<string, unknown>, data: BackupData): Record<string, unknown> {
  const gtdTasks = Array.isArray(data.gtdTasks) ? data.gtdTasks : state.gtdTasks;
  const restoredSessions = Array.isArray(data.sessions) ? data.sessions : state.sessions;
  const taskBySession = new Map(
    (Array.isArray(gtdTasks) ? gtdTasks : [])
      .filter(task => isRecord(task) && typeof task.id === 'string' && typeof task.sessionId === 'string')
      .map(task => [task.sessionId as string, task.id as string]),
  );
  const sessions = (Array.isArray(restoredSessions) ? restoredSessions : []).map(session => {
    if (!isRecord(session) || typeof session.taskId === 'string' || typeof session.id !== 'string') return session;
    const taskId = taskBySession.get(session.id);
    return taskId ? { ...session, taskId } : session;
  });
  const currentPrefs = isRecord(state.schedulePrefs) ? state.schedulePrefs : {};
  const currentNotifPrefs = isRecord(state.notifPrefs) ? state.notifPrefs : {};

  return {
    goals: Array.isArray(data.goals) ? data.goals : state.goals,
    sessions,
    gtdTasks,
    projects: Array.isArray(data.projects) ? data.projects : state.projects,
    areas: Array.isArray(data.areas) ? data.areas : state.areas,
    habits: Array.isArray(data.habits) ? data.habits : state.habits,
    habitGroups: Array.isArray(data.habitGroups) ? data.habitGroups : state.habitGroups,
    reflections: isRecord(data.reflections) ? data.reflections : state.reflections,
    metricDefs: Array.isArray(data.metricDefs) ? data.metricDefs : state.metricDefs,
    schedulePrefs: isRecord(data.schedulePrefs) ? { ...currentPrefs, ...data.schedulePrefs } : state.schedulePrefs,
    userName: typeof data.userName === 'string' ? data.userName : state.userName,
    userProfile: data.userProfile === null || isRecord(data.userProfile) ? data.userProfile : state.userProfile,
    onboarded: typeof data.onboarded === 'boolean' ? data.onboarded : state.onboarded,
    introCourseCompleted: typeof data.introCourseCompleted === 'boolean' ? data.introCourseCompleted : state.introCourseCompleted,
    aiDisclaimerAcceptedAt: data.aiDisclaimerAcceptedAt === null || typeof data.aiDisclaimerAcceptedAt === 'string'
      ? data.aiDisclaimerAcceptedAt
      : state.aiDisclaimerAcceptedAt,
    lang: data.lang === 'en' || data.lang === 'ru' || data.lang === 'ja' ? data.lang : state.lang,
    theme: data.theme === 'light' || data.theme === 'dark' || data.theme === 'system' ? data.theme : state.theme,
    habitRemindersEnabled: typeof data.habitRemindersEnabled === 'boolean' ? data.habitRemindersEnabled : state.habitRemindersEnabled,
    notifPrefs: isRecord(data.notifPrefs) ? { ...currentNotifPrefs, ...data.notifPrefs } : state.notifPrefs,
    generatedPlan: hasOwn(data, 'generatedPlan') && (data.generatedPlan === null || isRecord(data.generatedPlan))
      ? data.generatedPlan
      : state.generatedPlan,
    weekOffset: isFiniteNumber(data.weekOffset) ? data.weekOffset : state.weekOffset,
    focusTimer: hasOwn(data, 'focusTimer') && focusTimerIsValid(data.focusTimer) ? data.focusTimer : state.focusTimer,
  };
}

const previewCollectionCount = (key: BackupPreviewKey, value: unknown): number => {
  if (key === 'reflections') return isRecord(value) ? Object.keys(value).length : 0;
  return Array.isArray(value) ? value.length : 0;
};

const hasAnyOwn = (value: object, keys: readonly string[]): boolean => keys.some(key => hasOwn(value, key));

/**
 * Describe exactly what restoreBackupState would touch without changing either
 * the current store snapshot or the parsed backup data.
 */
export function buildBackupPreview(state: Record<string, unknown>, data: BackupData): BackupPreview {
  const next = restoreBackupState(state, data);
  const preview: BackupPreview = {};
  const collections = [
    ['goals', 'goals'],
    ['sessions', 'sessions'],
    ['gtdTasks', 'gtdTasks'],
    ['projects', 'projects'],
    ['areas', 'areas'],
    ['habits', 'habits'],
    ['habitGroups', 'habitGroups'],
    ['reflections', 'reflections'],
    ['metricDefs', 'metricDefs'],
  ] as const satisfies readonly (readonly [BackupPreviewKey, keyof BackupData])[];

  for (const [previewKey, dataKey] of collections) {
    if (!hasOwn(data, dataKey)) continue;
    const before = previewCollectionCount(previewKey, state[dataKey]);
    const after = previewCollectionCount(previewKey, next[dataKey]);
    preview[previewKey] = { action: 'replace', before, after, count: after };
  }

  const currentSessions = state.sessions;
  const nextSessions = next.sessions;
  if (!hasOwn(data, 'sessions')
    && Array.isArray(currentSessions)
    && Array.isArray(nextSessions)
    && currentSessions.some((session, index) => nextSessions[index] !== session)) {
    const before = previewCollectionCount('sessions', currentSessions);
    const after = previewCollectionCount('sessions', nextSessions);
    preview.sessions = { action: 'update', before, after, count: after };
  }

  const profileKeys = [
    'userName', 'userProfile', 'onboarded', 'introCourseCompleted', 'aiDisclaimerAcceptedAt',
  ] as const;
  if (hasAnyOwn(data, profileKeys)) {
    preview.profile = {
      action: hasOwn(data, 'userProfile')
        ? data.userProfile === null ? 'clear' : 'replace'
        : 'update',
    };
  }

  if (hasAnyOwn(data, ['schedulePrefs', 'theme', 'lang', 'weekOffset'])) {
    preview.preferences = { action: 'update' };
  }
  if (hasAnyOwn(data, ['notifPrefs', 'habitRemindersEnabled'])) {
    preview.notifications = { action: 'update' };
  }
  if (hasOwn(data, 'generatedPlan')) {
    preview.generatedPlan = { action: next.generatedPlan === null ? 'clear' : 'replace' };
  }
  if (hasOwn(data, 'focusTimer')) {
    preview.focusTimer = { action: next.focusTimer === null ? 'clear' : 'replace' };
  }

  return preview;
}

/** Accept current backups plus the raw Zustand payload saved by recovery mode. */
export function inspectBackup(text: string): BackupInspection {
  let root: unknown;
  try { root = JSON.parse(text); }
  catch { throw new Error('invalid-json'); }
  if (!isRecord(root)) throw new Error('invalid-root');

  let source: unknown;
  let sourceMetadata: BackupSourceMetadata;
  if (root.format === FORMAT) {
    if (root.schemaVersion !== SCHEMA_VERSION) throw new Error('unsupported-version');
    source = root.data;
    sourceMetadata = {
      kind: 'envelope',
      schemaVersion: root.schemaVersion,
      ...(typeof root.appVersion === 'string' ? { appVersion: root.appVersion } : {}),
      ...(typeof root.exportedAt === 'string' ? { exportedAt: root.exportedAt } : {}),
    };
  } else if ('state' in root) {
    if (!isRecord(root.state)) throw new Error('invalid-data');
    if (!Number.isInteger(root.version) || (root.version as number) < 0) throw new Error('invalid-store-version');
    // v0-v1 migration deliberately clears core collections, so importing it would silently lose user data.
    if ((root.version as number) < MIN_RECOVERY_STORE_VERSION) throw new Error('unsupported-version');
    if ((root.version as number) > CURRENT_STORE_VERSION) throw new Error('unsupported-version');
    source = migratePersistedState(root.state, root.version as number);
    sourceMetadata = { kind: 'recovery', storeVersion: root.version as number };
  } else {
    source = root; // legacy direct snapshot
    sourceMetadata = { kind: 'legacy' };
  }
  if (!isRecord(source)) throw new Error('invalid-data');

  const data: BackupData = {};
  let recognized = 0;
  for (const key of DURABLE_KEYS) {
    if (!(key in source)) continue;
    data[key] = source[key];
    recognized++;
  }
  if (!recognized) throw new Error('not-nebulla');

  normalizeLegacyTaskProjects(data);

  if ('goals' in data && (!Array.isArray(data.goals) || !recordIdsAreUnique(data.goals) || !data.goals.every(goalIsValid))) throw new Error('invalid-goals');
  if ('sessions' in data) {
    const sessions = normalizeSessions(data.sessions);
    if (!sessions || !recordIdsAreUnique(sessions)) throw new Error('invalid-sessions');
    data.sessions = sessions;
  }
  if ('gtdTasks' in data && (!Array.isArray(data.gtdTasks) || !recordIdsAreUnique(data.gtdTasks) || !data.gtdTasks.every(gtdTaskIsValid))) throw new Error('invalid-tasks');
  if ('projects' in data && Array.isArray(data.projects)) data.projects = data.projects.map(project => isRecord(project) ? normalizeProject(project as unknown as import('../types.ts').Project) : project);
  if ('projects' in data && (!Array.isArray(data.projects) || !recordIdsAreUnique(data.projects) || !data.projects.every(projectIsValid))) throw new Error('invalid-projects');
  if ('areas' in data && (!Array.isArray(data.areas) || !recordIdsAreUnique(data.areas) || !data.areas.every(areaIsValid))) throw new Error('invalid-areas');
  if ('habits' in data && (!Array.isArray(data.habits) || !recordIdsAreUnique(data.habits) || !data.habits.every(habitIsValid))) throw new Error('invalid-habits');
  if ('habitGroups' in data && (!Array.isArray(data.habitGroups) || !recordIdsAreUnique(data.habitGroups) || !data.habitGroups.every(habitGroupIsValid))) throw new Error('invalid-habit-groups');
  if ('metricDefs' in data && !metricDefsAreValid(data.metricDefs)) throw new Error('invalid-metrics');
  if ('reflections' in data && !reflectionsAreValid(data.reflections)) throw new Error('invalid-reflections');
  if ('userProfile' in data && !userProfileIsValid(data.userProfile)) throw new Error('invalid-user-profile');
  if ('notifPrefs' in data && !notifPrefsAreValid(data.notifPrefs)) throw new Error('invalid-notif-prefs');
  if ('schedulePrefs' in data && !schedulePrefsAreValid(data.schedulePrefs)) throw new Error('invalid-prefs');
  if ('generatedPlan' in data && !generatedPlanIsValid(data.generatedPlan)) throw new Error('invalid-generated-plan');
  if ('focusTimer' in data && !focusTimerIsValid(data.focusTimer)) throw new Error('invalid-focus-timer');
  if ('habitRemindersEnabled' in data && typeof data.habitRemindersEnabled !== 'boolean') throw new Error('invalid-habit-reminders');
  if ('theme' in data && (typeof data.theme !== 'string' || !THEMES.has(data.theme))) throw new Error('invalid-theme');
  if ('userName' in data && typeof data.userName !== 'string') throw new Error('invalid-user-name');
  if ('onboarded' in data && typeof data.onboarded !== 'boolean') throw new Error('invalid-onboarded');
  if ('introCourseCompleted' in data && typeof data.introCourseCompleted !== 'boolean') throw new Error('invalid-intro-course');
  if ('aiDisclaimerAcceptedAt' in data && data.aiDisclaimerAcceptedAt !== null && !dateTimeIsValid(data.aiDisclaimerAcceptedAt)) {
    throw new Error('invalid-ai-disclaimer');
  }
  if ('lang' in data && (typeof data.lang !== 'string' || !LANGUAGES.has(data.lang))) throw new Error('invalid-lang');
  if ('weekOffset' in data
    && (!Number.isSafeInteger(data.weekOffset) || Math.abs(data.weekOffset as number) > MAX_WEEK_OFFSET)) {
    throw new Error('invalid-week-offset');
  }

  normalizeTaskLinks(data);
  if (!sessionTaskLinksAreValid(data)) throw new Error('invalid-sessions');
  if (!taskProjectLinksAreValid(data)) throw new Error('invalid-tasks');

  return { data, source: sourceMetadata };
}

/** Backward-compatible data-only parser. */
export function parseBackup(text: string): BackupData {
  return inspectBackup(text).data;
}

export function downloadBackup(state: Record<string, unknown>): void {
  const text = serializeBackup(state);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nebulla-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
