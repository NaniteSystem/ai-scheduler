import assert from 'node:assert/strict';
import {
  DURABLE_KEYS,
  buildBackupPreview,
  inspectBackup,
  parseBackup,
  restoreBackupState,
  serializeBackup,
} from './backup.ts';
import { CURRENT_STORE_VERSION, DEFAULT_LIFE_BLOCKS, migratePersistedState } from './persistence.ts';

const validRoadmap = {
  depth: 'medium', kind: 'build', generatedBy: 'ai', model: 'planner',
  createdAt: '2026-07-01T00:00:00.000Z', lang: 'en',
  phases: [{
    id: 'phase-1', title: { en: 'Prepare', ja: '準備' }, summary: 'Get ready',
    nodes: [{
      id: 'node-1', title: 'Validate backup', detail: { en: 'Check every field' },
      resources: [{ label: 'Documentation', url: 'https://example.com', kind: 'site' }],
      kind: 'task', done: false,
    }],
  }],
  tips: ['Keep a copy'],
};
const validGoal = {
  id: 'g1', title: 'Ship', category: 'career', emoji: '🎯', color: '#123456',
  priority: 1, totalHoursEstimated: 10, hoursPerWeekTarget: 2, sessionsCompleted: 0,
  sessionsTotal: 1, hoursLogged: 0, milestones: [], metadata: {},
  subtitle: 'Release safely', deadline: '2026-08-01', aiInsight: 'Stay focused',
  roadmap: validRoadmap, nextSessionTitle: 'Run checks', nextSessionDate: '2026-07-13',
  completionType: 'date', status: 'active', outcome: 'success',
  completedAt: '2026-07-12T03:00:00.000Z',
};
const validSession = {
  id: 's1', goalId: 'g1', taskId: 't1', date: '2026-07-12',
  startHour: 9, startMinute: 30, durationMinutes: 45, title: 'Linked session',
  description: '', tasks: [], sessionType: 'regular', status: 'planned',
  openEnd: false, recurrence: 'weekly', seriesId: 'series-1',
  progressLog: { metric: 'minutes', value: 45, feeling: 'good', notes: 'Useful' },
  color: '#abcdef', icon: 'target', allDay: false, reminderMinutes: 10,
  location: 'Home', url: 'https://example.com/session', sourceKind: 'task',
  planSourceId: 't1', planId: 'plan-1',
};
const validTask = {
  id: 't1', sessionId: 's1', title: 'Linked task', status: 'scheduled',
  priority: 2, createdAt: '2026-07-11T00:00:00.000Z', scheduledDate: '2026-07-12',
  description: 'Description', notes: 'Notes', processedAt: '2026-07-11T01:00:00.000Z',
  updatedAt: '2026-07-11T02:00:00.000Z', durationMinutes: 45, dueDate: '2026-07-12',
  completedAt: '2026-07-12T03:00:00.000Z', energyLevel: 'deep', remindAt: '2026-07-12T08:45',
  context: '@computer', projectId: 'p1', tags: ['release'],
  subtasks: [{ id: 'sub-1', title: 'Validate', done: false }], recurring: 'weekly',
  recurFromCompletion: true, completedPomodoros: 2, todayFocusDate: '2026-07-12',
  isTodayFocus: false, isArchived: false, blockingReason: 'Waiting on vendor reply',
};
const validProject = {
  id: 'p1', title: 'Backup', color: '#8b5cf6', status: 'active',
  outcome: 'A verified backup flow exists', definitionOfDone: 'Backup exports and restores safely',
  health: 'on-track', goalId: 'g1', areaId: 'area-ops', startDate: '2026-07-09',
  targetDate: '2026-07-20', deadline: '2026-08-01', reviewCadence: 'weekly',
  nextReviewDate: '2026-07-17', defaultSectionId: 'section-next', notes: 'Keep import safe.',
  createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z',
  completedAt: '2026-07-12T03:00:00.000Z', archivedAt: '2026-07-13T00:00:00.000Z',
};
const validArea = {
  id: 'area-ops', title: 'Operations', color: '#0d9488', icon: '🛠️',
  notes: 'Keep the lights on.', createdAt: '2026-07-05T00:00:00.000Z',
  archivedAt: '2026-07-06T00:00:00.000Z',
};
const validHabit = {
  id: 'h1', title: 'Linked habit', emoji: '✓', color: '#654321', anchor: 'morning',
  recurrence: 'daily', targetCount: 1, goalId: 'g1', groupId: 'hg1',
  intervalDays: 2, timesPerWeek: 3, unit: 'checks', reminderTime: '08:15', archived: false,
  createdAt: '2026-07-01T00:00:00.000Z', log: {},
};
const validHabitGroup = {
  id: 'hg1', name: 'Morning routine', color: '#f59e0b', createdAt: '2026-07-01T00:00:00.000Z',
};
const validPrefs = {
  wakeTime: '06:30', sleepTime: '23:00', fasting: false, fastingType: '16:8',
  workStart: '09:00', workEnd: '17:00', hasWork: true,
  workBreakStart: '12:00', workBreakEnd: '13:00',
  productivityPeak: 'morning', weekStartsOn: 1,
  lifeBlocks: DEFAULT_LIFE_BLOCKS.map(block => ({ ...block })),
  commitments: [{
    id: 'commitment-1', title: 'Class', emoji: '🏫', start: '18:00', end: '20:00',
    days: [2], enabled: true, breakStart: '18:50', breakEnd: '19:00',
  }],
};
const focusTimer = {
  mode: 'countdown', targetMinutes: 25, startedAt: 0, accumulatedMs: 60_000,
  running: false, finished: false, linkType: 'task', linkId: 't1', label: 'Linked task',
};
const validGeneratedPlan = {
  id: 'plan-1', createdAt: '2026-07-12T00:00:00.000Z', providerId: 'rule-based',
  fallback: false, advice: 'Keep the week balanced.',
  range: { start: '2026-07-12', end: '2026-07-18' },
  options: {
    includeGoals: true, includeHabits: true, includeRecurring: true, includeTasks: true,
    intensity: 'balanced', instructions: 'Keep evenings open.',
  },
  days: [{
    date: '2026-07-12',
    blocks: [{
      id: 'block-1', title: 'Ship', emoji: '🎯', color: '#123456',
      startMinutes: 540, durationMinutes: 45, type: 'task', sourceKind: 'task', sourceId: 't1',
      status: 'proposed', locked: false, reasoning: 'Due soon',
    }],
  }],
};

const state = {
  goals: [{ ...validGoal, ignored: true }],
  sessions: [validSession], gtdTasks: [validTask], projects: [validProject], areas: [validArea], habits: [validHabit], habitGroups: [validHabitGroup],
  reflections: { '2026-07-12': { date: '2026-07-12', mood: 4, note: 'Good', metrics: { sleep: 8 } } },
  metricDefs: [{ id: 'sleep', name: 'Sleep', unit: 'hours' }], habitRemindersEnabled: false,
  notifPrefs: { sessions: false, tasks: true, quietEnabled: true, quietStart: '21:00', quietEnd: '07:00' },
  theme: 'system', userName: 'A',
  userProfile: { focus: ['career'], struggles: ['time'], sleep: 'good', age: '30', source: 'friend' },
  onboarded: true,
  introCourseCompleted: true, aiDisclaimerAcceptedAt: '2026-07-01T00:00:00.000Z',
  lang: 'ja', schedulePrefs: validPrefs, generatedPlan: validGeneratedPlan, weekOffset: 3, focusTimer,
  generatedDay: { stale: true }, transientModal: true, action: () => undefined,
};
const serialized = serializeBackup(state, new Date('2026-07-12T00:00:00.000Z'));
const inspected = inspectBackup(serialized);
assert.deepEqual(inspected.source, {
  kind: 'envelope',
  schemaVersion: 1,
  appVersion: JSON.parse(serialized).appVersion,
  exportedAt: '2026-07-12T00:00:00.000Z',
});
const parsed = parseBackup(serialized);
assert.equal((parsed.goals as { title: string }[])[0].title, 'Ship');
assert.deepEqual(Object.keys(parsed).sort(), [...DURABLE_KEYS].sort());
assert.equal('generatedDay' in parsed, false);
assert.equal('transientModal' in parsed, false);

const currentState: Record<string, unknown> = Object.fromEntries(DURABLE_KEYS.map(key => [key, `old-${key}`]));
currentState.schedulePrefs = { ...validPrefs, wakeTime: '10:00' };
currentState.notifPrefs = { sessions: true, tasks: false, quietEnabled: false, quietStart: '22:00', quietEnd: '08:00' };
currentState.userProfile = { focus: ['old'], struggles: [], sleep: 'old' };
currentState.generatedPlan = { id: 'old-plan' };
currentState.focusTimer = null;
const restored = restoreBackupState(currentState, parsed);
for (const key of DURABLE_KEYS) assert.deepEqual(restored[key], parsed[key], `restores durable key ${key}`);

assert.equal((parsed.sessions as { goalId: string; taskId?: string }[])[0].goalId, 'g1');
assert.equal((parsed.sessions as { taskId?: string }[])[0].taskId, 't1');
assert.equal((parsed.gtdTasks as { sessionId?: string }[])[0].sessionId, 's1');
assert.equal((parsed.gtdTasks as { projectId?: string }[])[0].projectId, 'p1');
assert.equal((parsed.projects as { title: string }[])[0].title, 'Backup');
assert.equal((parsed.projects as { outcome?: string }[])[0].outcome, 'A verified backup flow exists');
assert.equal((parsed.projects as { health?: string }[])[0].health, 'on-track');
assert.equal((parsed.projects as { deadline?: string }[])[0].deadline, '2026-08-01');
assert.equal((parsed.habits as { goalId?: string }[])[0].goalId, 'g1');
assert.equal((parsed.habits as { groupId?: string }[])[0].groupId, 'hg1');
assert.equal((parsed.habitGroups as { name: string }[])[0].name, 'Morning routine');
assert.equal((parsed.goals as { deadline?: string }[])[0].deadline, '2026-08-01');
assert.equal((parsed.habits as { reminderTime?: string }[])[0].reminderTime, '08:15');
assert.equal((parsed.sessions as { recurrence?: string }[])[0].recurrence, 'weekly');

const previewState = {
  ...currentState,
  goals: [validGoal, validGoal],
  sessions: [validSession, validSession],
  gtdTasks: [validTask, validTask],
  projects: [validProject, validProject],
  areas: [validArea, validArea],
  habits: [validHabit, validHabit],
  habitGroups: [validHabitGroup, validHabitGroup],
  reflections: {
    '2026-07-10': { date: '2026-07-10' },
    '2026-07-11': { date: '2026-07-11' },
  },
  metricDefs: [{ id: 'old', name: 'Old' }, { id: 'older', name: 'Older' }],
};
const fullPreview = buildBackupPreview(previewState, parsed);
assert.deepEqual(fullPreview.goals, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.sessions, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.gtdTasks, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.projects, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.areas, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.habits, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.habitGroups, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.reflections, { action: 'replace', before: 2, after: 1, count: 1 });
assert.deepEqual(fullPreview.metricDefs, { action: 'replace', before: 2, after: 1, count: 1 });
assert.equal(fullPreview.profile?.action, 'replace');
assert.equal(fullPreview.preferences?.action, 'update');
assert.equal(fullPreview.notifications?.action, 'update');
assert.equal(fullPreview.generatedPlan?.action, 'replace');
assert.equal(fullPreview.focusTimer?.action, 'replace');

const partialPreview = buildBackupPreview(previewState, {
  goals: [],
  schedulePrefs: validPrefs,
  notifPrefs: state.notifPrefs,
});
assert.deepEqual(partialPreview, {
  goals: { action: 'replace', before: 2, after: 0, count: 0 },
  preferences: { action: 'update' },
  notifications: { action: 'update' },
});
assert.equal('sessions' in partialPreview, false);
assert.equal('profile' in partialPreview, false);

const sessionWithoutTaskId: Record<string, unknown> = { ...validSession, id: 's-repair' };
delete sessionWithoutTaskId.taskId;
const taskRepairState = {
  ...previewState,
  sessions: [sessionWithoutTaskId],
};
const taskRepairData = {
  gtdTasks: [{ ...validTask, id: 't-repair', sessionId: 's-repair' }],
};
const taskRepairStateBeforePreview = structuredClone(taskRepairState);
const taskRepairDataBeforePreview = structuredClone(taskRepairData);
assert.equal('taskId' in taskRepairState.sessions[0], false);
const taskRepairPreview = buildBackupPreview(taskRepairState, taskRepairData);
assert.deepEqual(taskRepairPreview.sessions, { action: 'update', before: 1, after: 1, count: 1 });
assert.deepEqual(taskRepairPreview.gtdTasks, { action: 'replace', before: 2, after: 1, count: 1 });
assert.equal(
  ((restoreBackupState(taskRepairState, taskRepairData).sessions as { taskId?: string }[])[0]).taskId,
  't-repair',
);
assert.deepEqual(taskRepairState, taskRepairStateBeforePreview, 'task repair preview does not mutate current sessions');
assert.deepEqual(taskRepairData, taskRepairDataBeforePreview, 'task repair preview does not mutate imported tasks');

const emptyCollectionsPreview = buildBackupPreview(previewState, {
  goals: [], sessions: [], gtdTasks: [], projects: [], areas: [], habits: [], habitGroups: [], reflections: {}, metricDefs: [],
});
for (const key of ['goals', 'sessions', 'gtdTasks', 'projects', 'areas', 'habits', 'habitGroups', 'reflections', 'metricDefs'] as const) {
  assert.equal(emptyCollectionsPreview[key]?.count, 0, `${key} previews an explicit empty collection`);
}
const clearPreview = buildBackupPreview(previewState, { generatedPlan: null, focusTimer: null });
assert.deepEqual(clearPreview, {
  generatedPlan: { action: 'clear' },
  focusTimer: { action: 'clear' },
});
assert.deepEqual(buildBackupPreview(previewState, { userProfile: null }), {
  profile: { action: 'clear' },
});
assert.deepEqual(buildBackupPreview(previewState, { userName: 'New name' }), {
  profile: { action: 'update' },
});

const purityState = structuredClone(previewState);
const purityData = structuredClone(parsed);
buildBackupPreview(previewState, parsed);
assert.deepEqual(previewState, purityState, 'preview does not mutate the current state');
assert.deepEqual(parsed, purityData, 'preview does not mutate parsed backup data');

const legacyInspection = inspectBackup(JSON.stringify({
  sessions: [{
    id: 's-legacy', goalId: '', date: '2026-07-12', startHour: 9, durationMinutes: 30,
    title: 'Legacy link', description: '', tasks: [], sessionType: 'regular', status: 'planned',
  }],
  gtdTasks: [{
    id: 't-legacy', title: 'Legacy task', sessionId: 's-legacy', status: 'scheduled',
    priority: 3, createdAt: '2026-07-12T00:00:00.000Z',
  }],
}));
assert.deepEqual(legacyInspection.source, { kind: 'legacy' });
const legacyLinked = legacyInspection.data;
assert.equal((legacyLinked.sessions as { taskId?: string }[])[0].taskId, 't-legacy');
const legacyPreview = buildBackupPreview(previewState, legacyLinked);
assert.equal(legacyPreview.sessions?.count, 1);
assert.equal(legacyPreview.gtdTasks?.count, 1);

const recoveryInspection = inspectBackup(JSON.stringify({
  version: 2,
  state: {
    sessions: [{
      id: 's-old', goalId: '', date: '2026-07-12', title: 'Old session',
      description: '', sessionType: 'regular', status: 'planned', seriesId: 'plan-old',
    }],
    gtdTasks: [{
      id: 't-old', title: 'Old task', status: 'project', priority: 2,
      createdAt: '2026-07-11T00:00:00.000Z', sessionId: 's-old', isTodayFocus: true,
    }],
    habits: [{
      ...validHabit, id: 'h-old', targetCount: 3,
      log: { '2026-07-10': { status: 'failed', count: 1 } },
    }],
    schedulePrefs: {
      ...validPrefs,
      lifeBlocks: [{ ...DEFAULT_LIFE_BLOCKS[0], hoursPerDay: 99 }],
      commitments: undefined,
    },
    onboarded: true,
  },
}));
assert.deepEqual(recoveryInspection.source, { kind: 'recovery', storeVersion: 2 });
const legacyRecovery = recoveryInspection.data;
const migratedSession = (legacyRecovery.sessions as Record<string, unknown>[])[0];
const migratedTask = (legacyRecovery.gtdTasks as Record<string, unknown>[])[0];
const migratedHabit = (legacyRecovery.habits as { log: Record<string, { status: string }> }[])[0];
const migratedPrefs = legacyRecovery.schedulePrefs as { lifeBlocks: { id: string; hoursPerDay: number }[]; commitments: unknown[] };
assert.deepEqual({
  startHour: migratedSession.startHour,
  startMinute: migratedSession.startMinute,
  durationMinutes: migratedSession.durationMinutes,
  tasks: migratedSession.tasks,
  taskId: migratedSession.taskId,
  planId: migratedSession.planId,
  seriesId: migratedSession.seriesId,
}, { startHour: 9, startMinute: 0, durationMinutes: 60, tasks: [], taskId: 't-old', planId: 'plan-old', seriesId: undefined });
assert.equal(legacyRecovery.introCourseCompleted, true);
assert.equal(migratedHabit.log['2026-07-10'].status, 'partial');
assert.deepEqual(legacyRecovery.habitGroups, []);
assert.equal(migratedTask.status, 'someday-maybe');
assert.match(String(migratedTask.todayFocusDate), /^\d{4}-\d{2}-\d{2}$/);
assert.equal('isTodayFocus' in migratedTask, false);
assert.equal(migratedPrefs.lifeBlocks.length, DEFAULT_LIFE_BLOCKS.length);
assert.equal(migratedPrefs.lifeBlocks.find(block => block.id === 'sleep')?.hoursPerDay, 14);
assert.deepEqual(migratedPrefs.commitments, []);

const deterministicStoreMigration = migratePersistedState(
  { gtdTasks: [{ id: 't-focus', title: 'Focus', isTodayFocus: true }] },
  8,
  new Date(2026, 6, 16),
) as { projects: unknown[]; gtdTasks: { todayFocusDate?: string; isTodayFocus?: boolean }[] };
assert.deepEqual(deterministicStoreMigration.gtdTasks[0], { id: 't-focus', title: 'Focus', todayFocusDate: '2026-07-16' });
assert.deepEqual(deterministicStoreMigration.projects, []);

const delegatedStoreMigration = migratePersistedState(
  { gtdTasks: [{ id: 't-wait', title: 'Reply', status: 'waiting-for', priority: 3, createdAt: validTask.createdAt, delegateTo: 'Aiko' }] },
  7,
) as { gtdTasks: { status?: string; delegateTo?: string }[] };
assert.equal(delegatedStoreMigration.gtdTasks[0].status, 'someday-maybe');
assert.equal(delegatedStoreMigration.gtdTasks[0].delegateTo, 'Aiko');

const projectStoreMigration = migratePersistedState({
  gtdTasks: [{ ...validTask, id: 't-project-old', projectId: undefined, project: 'Release train' }],
}, 10) as { projects: { id: string; title: string }[]; gtdTasks: { projectId?: string; project?: string }[] };
assert.equal(projectStoreMigration.projects[0].title, 'Release train');
assert.equal(projectStoreMigration.gtdTasks[0].projectId, projectStoreMigration.projects[0].id);
assert.equal('project' in projectStoreMigration.gtdTasks[0], false);

const legacyProjectBackup = parseBackup(JSON.stringify({
  gtdTasks: [{ ...validTask, projectId: undefined, project: 'Legacy operations' }],
}));
assert.equal((legacyProjectBackup.projects as { title: string }[])[0].title, 'Legacy operations');
assert.equal(
  (legacyProjectBackup.gtdTasks as { projectId?: string }[])[0].projectId,
  (legacyProjectBackup.projects as { id: string }[])[0].id,
);

const mixedLegacyProjectBackup = parseBackup(JSON.stringify({
  projects: [],
  gtdTasks: [{ ...validTask, projectId: undefined, project: 'Mixed legacy operations' }],
}));
assert.equal((mixedLegacyProjectBackup.projects as { title: string }[])[0].title, 'Mixed legacy operations');
assert.equal(
  (mixedLegacyProjectBackup.gtdTasks as { projectId?: string }[])[0].projectId,
  (mixedLegacyProjectBackup.projects as { id: string }[])[0].id,
);
assert.throws(
  () => parseBackup(JSON.stringify({ projects: [] })),
  /invalid-tasks/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ gtdTasks: [{ ...validTask, projectId: 'p1' }] })),
  /invalid-tasks/,
);
assert.throws(
  () => inspectBackup(JSON.stringify({ state: { projects: [{ id: 'bad', title: 1 }], gtdTasks: [{ ...validTask, projectId: undefined, project: 'Recovered label' }] }, version: 10 })),
  /invalid-projects/,
);
assert.throws(
  () => inspectBackup(JSON.stringify({ state: { projects: [{ ...validProject, health: 'fine' }], gtdTasks: [validTask] }, version: 10 })),
  /invalid-projects/,
);
assert.throws(
  () => inspectBackup(JSON.stringify({ state: { projects: [{ ...validProject, deadline: '2026-99-99' }], gtdTasks: [validTask] }, version: 10 })),
  /invalid-projects/,
);
assert.throws(
  () => inspectBackup(JSON.stringify({ state: { projects: [], gtdTasks: [null] }, version: 10 })),
  /invalid-tasks/,
);

let malformedPreview: ReturnType<typeof buildBackupPreview> | null = null;
assert.throws(() => {
  const malformed = inspectBackup('{nope');
  malformedPreview = buildBackupPreview(previewState, malformed.data);
});
assert.equal(malformedPreview, null);
assert.throws(() => parseBackup(JSON.stringify({ unrelated: true })));
assert.throws(() => parseBackup(JSON.stringify({ goals: [{ id: 'g-min', title: 'Too little' }] })), /invalid-goals/);
assert.throws(() => parseBackup(JSON.stringify({ habits: [{ id: 'h-min', title: 'Too little' }] })), /invalid-habits/);
assert.throws(() => parseBackup(JSON.stringify({ schedulePrefs: {} })), /invalid-prefs/);

for (const [field, value, error] of [
  ['goals', [validGoal, { ...validGoal, title: 'Duplicate' }], /invalid-goals/],
  ['sessions', [validSession, { ...validSession, title: 'Duplicate' }], /invalid-sessions/],
  ['gtdTasks', [validTask, { ...validTask, title: 'Duplicate' }], /invalid-tasks/],
  ['projects', [validProject, { ...validProject, title: 'Duplicate' }], /invalid-projects/],
  ['areas', [validArea, { ...validArea, title: 'Duplicate' }], /invalid-areas/],
  ['habits', [validHabit, { ...validHabit, title: 'Duplicate' }], /invalid-habits/],
  ['habitGroups', [validHabitGroup, { ...validHabitGroup, name: 'Duplicate' }], /invalid-habit-groups/],
  ['metricDefs', [{ id: 'sleep', name: 'Sleep' }, { id: 'sleep', name: 'Duplicate' }], /invalid-metrics/],
] as const) {
  assert.throws(() => parseBackup(JSON.stringify({ [field]: value })), error);
}

assert.throws(
  () => parseBackup(JSON.stringify({ schedulePrefs: { ...validPrefs, commitments: [validPrefs.commitments[0], validPrefs.commitments[0]] } })),
  /invalid-prefs/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ schedulePrefs: { ...validPrefs, lifeBlocks: [validPrefs.lifeBlocks[0], validPrefs.lifeBlocks[0]] } })),
  /invalid-prefs/,
);
assert.doesNotThrow(
  () => parseBackup(JSON.stringify({
    schedulePrefs: {
      ...validPrefs,
      workBreakStart: undefined,
      workBreakEnd: undefined,
      lifeBlocks: validPrefs.lifeBlocks.map(({ fixedTime: _, ...block }) => block),
      commitments: validPrefs.commitments.map(({ breakStart: _, breakEnd: __, ...commitment }) => commitment),
    },
  })),
);

for (const fastingType of ['16:8', 'full-day', 'ramadan']) {
  assert.doesNotThrow(() => parseBackup(JSON.stringify({ schedulePrefs: { ...validPrefs, fastingType } })));
}

for (const prefs of [
  { ...validPrefs, wakeTime: 630 },
  { ...validPrefs, sleepTime: 2300 },
  { ...validPrefs, workStart: 900 },
  { ...validPrefs, workEnd: 1700 },
  { ...validPrefs, workBreakStart: 1200 },
  { ...validPrefs, workBreakEnd: 1300 },
  { ...validPrefs, lifeBlocks: [{ ...validPrefs.lifeBlocks[0], fixedTime: 2300 }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], start: 1800 }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], end: 2000 }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], breakStart: 1850 }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], breakEnd: 1900 }] },
  { ...validPrefs, fastingType: '18:6' },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ schedulePrefs: prefs })), /invalid-prefs/);
}

for (const prefs of [
  { ...validPrefs, wakeTime: '6:30' },
  { ...validPrefs, sleepTime: '25:00' },
  { ...validPrefs, workStart: '09:60' },
  { ...validPrefs, workEnd: 'tomorrow' },
  { ...validPrefs, workBreakStart: '12' },
  { ...validPrefs, workBreakEnd: '13:00:00' },
  { ...validPrefs, lifeBlocks: [{ ...validPrefs.lifeBlocks[0], fixedTime: 'not-a-time' }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], start: '18:60' }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], end: '24:00' }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], breakStart: 'invalid' }] },
  { ...validPrefs, commitments: [{ ...validPrefs.commitments[0], breakEnd: '7pm' }] },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ schedulePrefs: prefs })), /invalid-prefs/);
}

assert.doesNotThrow(() => parseBackup(JSON.stringify({ metricDefs: [{ id: 'm1', name: 'Metric' }] })));
assert.throws(
  () => parseBackup(JSON.stringify({ metricDefs: [{ id: 'm1', name: 'Metric', unit: 1 }] })),
  /invalid-metrics/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ sessions: [{ id: 's1', title: 'Too little' }] })),
  /invalid-sessions/,
);

for (const goal of [
  { ...validGoal, subtitle: 1 },
  { ...validGoal, deadline: 20260801 },
  { ...validGoal, aiInsight: [] },
  { ...validGoal, nextSessionTitle: 1 },
  { ...validGoal, nextSessionDate: [] },
  { ...validGoal, completionType: 'sessions' },
  { ...validGoal, status: 'paused' },
  { ...validGoal, outcome: 'partial' },
  { ...validGoal, completedAt: 1 },
  { ...validGoal, roadmap: { ...validRoadmap, tips: ['Good', 1] } },
  { ...validGoal, roadmap: {
    ...validRoadmap,
    phases: [{ ...validRoadmap.phases[0], nodes: [{ ...validRoadmap.phases[0].nodes[0], resources: 'docs' }] }],
  } },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ goals: [goal] })), /invalid-goals/);
}

for (const goal of [
  { ...validGoal, deadline: '2026-02-30' },
  { ...validGoal, nextSessionDate: '2026-02-30' },
  { ...validGoal, completedAt: 'not-a-date' },
  { ...validGoal, roadmap: { ...validRoadmap, createdAt: 'not-a-date' } },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ goals: [goal] })), /invalid-goals/);
}

for (const habit of [
  { ...validHabit, intervalDays: '2' },
  { ...validHabit, intervalDays: 1 },
  { ...validHabit, timesPerWeek: 8 },
  { ...validHabit, unit: 1 },
  { ...validHabit, goalId: [] },
  { ...validHabit, reminderTime: 815 },
  { ...validHabit, archived: 'no' },
  { ...validHabit, createdAt: 'not-a-date' },
  { ...validHabit, reminderTime: '24:00' },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ habits: [habit] })), /invalid-habits/);
}

for (const session of [
  { ...validSession, openEnd: 'yes' },
  { ...validSession, recurrence: 'yearly' },
  { ...validSession, seriesId: 1 },
  { ...validSession, progressLog: { ...validSession.progressLog, feeling: 'excellent' } },
  { ...validSession, color: 1 },
  { ...validSession, icon: [] },
  { ...validSession, allDay: 1 },
  { ...validSession, reminderMinutes: -1 },
  { ...validSession, location: 1 },
  { ...validSession, url: [] },
  { ...validSession, sourceKind: 'calendar' },
  { ...validSession, planSourceId: 1 },
  { ...validSession, planId: [] },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ sessions: [session] })), /invalid-sessions/);
}

assert.throws(
  () => parseBackup(JSON.stringify({ sessions: [{ ...validSession, date: '2026-13-12' }] })),
  /invalid-sessions/,
);

assert.throws(
  () => parseBackup(JSON.stringify({ sessions: [{ ...validSession, taskId: 'missing' }], gtdTasks: [validTask] })),
  /invalid-sessions/,
);
assert.equal(
  (parseBackup(JSON.stringify({ sessions: [{ ...validSession, taskId: 'not-in-partial-backup' }] }))
    .sessions as { taskId: string }[])[0].taskId,
  'not-in-partial-backup',
);

for (const [field, value, error] of [
  ['habitRemindersEnabled', 'yes', /invalid-habit-reminders/],
  ['theme', 'sepia', /invalid-theme/],
  ['userName', 42, /invalid-user-name/],
  ['onboarded', 1, /invalid-onboarded/],
  ['introCourseCompleted', 'yes', /invalid-intro-course/],
  ['aiDisclaimerAcceptedAt', false, /invalid-ai-disclaimer/],
  ['aiDisclaimerAcceptedAt', 'not-a-date', /invalid-ai-disclaimer/],
  ['lang', 'fr', /invalid-lang/],
  ['weekOffset', 1.5, /invalid-week-offset/],
  ['weekOffset', Number.MAX_SAFE_INTEGER, /invalid-week-offset/],
] as const) {
  assert.throws(() => parseBackup(JSON.stringify({ [field]: value })), error);
}

for (const task of [
  { ...validTask, status: 'project' },
  { ...validTask, priority: 0 },
  { ...validTask, createdAt: 123 },
  { ...validTask, tags: 'release' },
  { ...validTask, subtasks: [{ id: 'sub-1', title: 'Bad', done: 'no' }] },
  { ...validTask, durationMinutes: '45' },
  { ...validTask, energyLevel: 'maximum' },
  { ...validTask, context: '@moon' },
  { ...validTask, projectId: 1 },
  { ...validTask, recurring: 'yearly' },
  { ...validTask, recurFromCompletion: 'yes' },
  { ...validTask, completedPomodoros: -1 },
  { ...validTask, isArchived: 0 },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ gtdTasks: [task] })), /invalid-tasks/);
}

for (const project of [
  { ...validProject, title: '   ' },
  { ...validProject, color: 1 },
  { ...validProject, status: 'stuck' },
  { ...validProject, outcome: 1 },
  { ...validProject, health: 'fine' },
  { ...validProject, deadline: '2026-99-99' },
  { ...validProject, reviewCadence: 'quarterly' },
  { ...validProject, createdAt: 'not-a-date' },
  { ...validProject, updatedAt: 'not-a-date' },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ projects: [project], gtdTasks: [validTask] })), /invalid-projects/);
}

assert.throws(
  () => parseBackup(JSON.stringify({ projects: [validProject], gtdTasks: [{ ...validTask, projectId: 'missing' }] })),
  /invalid-tasks/,
);

assert.throws(
  () => parseBackup(JSON.stringify({ areas: [{ id: 'a-min' }] })),
  /invalid-areas/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ areas: [{ ...validArea, archivedAt: 'not-a-date' }] })),
  /invalid-areas/,
);

for (const [field, value] of [
  ['createdAt', 'not-a-date'],
  ['dueDate', '2026-02-30'],
  ['scheduledDate', '2026-00-12'],
  ['remindAt', '2026-07-12T25:00'],
  ['todayFocusDate', 'today'],
  ['processedAt', 'invalid'],
  ['updatedAt', '2026-07-12T09:99'],
  ['completedAt', '2026-07-12'],
] as const) {
  assert.throws(
    () => parseBackup(JSON.stringify({ gtdTasks: [{ ...validTask, [field]: value }] })),
    /invalid-tasks/,
  );
}

assert.throws(
  () => parseBackup(JSON.stringify({ userProfile: { focus: 'career', struggles: [], sleep: 'good' } })),
  /invalid-user-profile/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ userProfile: { focus: [], struggles: [1], sleep: 'good' } })),
  /invalid-user-profile/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ notifPrefs: { ...state.notifPrefs, sessions: 'yes' } })),
  /invalid-notif-prefs/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ notifPrefs: { sessions: true, tasks: true, quietEnabled: false } })),
  /invalid-notif-prefs/,
);
for (const notifPrefs of [
  { ...state.notifPrefs, quietStart: '24:00' },
  { ...state.notifPrefs, quietEnd: '7:00' },
]) {
  assert.throws(() => parseBackup(JSON.stringify({ notifPrefs })), /invalid-notif-prefs/);
}
assert.throws(
  () => parseBackup(JSON.stringify({ reflections: { '2026-07-12': null } })),
  /invalid-reflections/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ reflections: { '2026-07-12': { date: '2026-07-13', mood: 6 } } })),
  /invalid-reflections/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ reflections: { '2026-07-12': { date: '2026-07-12', metrics: { sleep: 'eight' } } } })),
  /invalid-reflections/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ reflections: { '2026-02-30': { date: '2026-02-30', mood: 3 } } })),
  /invalid-reflections/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ generatedPlan: { ...validGeneratedPlan, days: {} } })),
  /invalid-generated-plan/,
);
assert.throws(
  () => parseBackup(JSON.stringify({
    generatedPlan: { ...validGeneratedPlan, days: [{ date: '2026-07-12', blocks: null }] },
  })),
  /invalid-generated-plan/,
);
for (const generatedPlan of [
  { ...validGeneratedPlan, createdAt: 'not-a-date' },
  { ...validGeneratedPlan, range: { ...validGeneratedPlan.range, start: 'not-a-date' } },
  { ...validGeneratedPlan, range: { ...validGeneratedPlan.range, end: '2026-02-30' } },
  { ...validGeneratedPlan, days: [{ ...validGeneratedPlan.days[0], date: '2026-07-32' }] },
]) {
  assert.throws(
    () => parseBackup(JSON.stringify({ generatedPlan })),
    /invalid-generated-plan/,
  );
}
assert.throws(
  () => parseBackup(JSON.stringify({
    generatedPlan: {
      ...validGeneratedPlan,
      days: [{ date: '2026-07-12', blocks: [{ ...validGeneratedPlan.days[0].blocks[0], status: 'done' }] }],
    },
  })),
  /invalid-generated-plan/,
);

for (const version of [0, 1]) {
  assert.throws(
    () => parseBackup(JSON.stringify({ state: { userName: 'unsafe-old-recovery' }, version })),
    /unsupported-version/,
  );
}
assert.throws(
  () => parseBackup(JSON.stringify({ state: { userName: 'future' }, version: CURRENT_STORE_VERSION + 1 })),
  /unsupported-version/,
);

console.log('backup.test.ts: all assertions passed');
