import assert from 'node:assert/strict';
import { backupImportErrorMessage } from './settingsBackupImportError.ts';

const translatedKey = (key: string) => key;

for (const [error, expectedKey] of [
  [new Error('invalid-json'), 'settings.backupError.invalidJson'],
  [new Error('unsupported-version'), 'settings.backupError.unsupportedVersion'],
  [new Error('not-nebulla'), 'settings.backupError.notNebulla'],
  [new Error('invalid-root'), 'settings.backupError.invalidStructure'],
  [new Error('invalid-data'), 'settings.backupError.invalidStructure'],
  [new Error('invalid-store-version'), 'settings.backupError.invalidStructure'],
  [new Error('invalid-goals'), 'settings.backupError.invalidGoals'],
  [new Error('invalid-sessions'), 'settings.backupError.invalidSessions'],
  [new Error('invalid-tasks'), 'settings.backupError.invalidTasks'],
  [new Error('invalid-projects'), 'settings.backupError.invalidProjects'],
  [new Error('invalid-habits'), 'settings.backupError.invalidHabits'],
  [new Error('invalid-habit-groups'), 'settings.backupError.invalidHabitGroups'],
  [new Error('invalid-metrics'), 'settings.backupError.invalidMetrics'],
  [new Error('invalid-reflections'), 'settings.backupError.invalidReflections'],
  [new Error('invalid-user-profile'), 'settings.backupError.invalidUserProfile'],
  [new Error('invalid-notif-prefs'), 'settings.backupError.invalidNotifPrefs'],
  [new Error('invalid-prefs'), 'settings.backupError.invalidPrefs'],
  [new Error('invalid-generated-plan'), 'settings.backupError.invalidGeneratedPlan'],
  [new Error('invalid-focus-timer'), 'settings.backupError.invalidFocusTimer'],
  [new Error('invalid-future-section'), 'settings.backupError.invalidContent'],
  [new Error('disk-failure'), 'settings.backupErr'],
  ['invalid-json', 'settings.backupErr'],
] as const) {
  assert.equal(backupImportErrorMessage(error, translatedKey), expectedKey);
}

console.log('settingsBackupImportError.test.ts: all assertions passed');
