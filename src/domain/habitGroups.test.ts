import assert from 'node:assert/strict';
import type { Habit, HabitGroup } from '../types.ts';
import { removeHabitGroup } from './habitGroups.ts';

const groups: HabitGroup[] = [
  { id: 'morning', name: 'Morning', color: '#f59e0b', createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'health', name: 'Health', color: '#22c55e', createdAt: '2026-07-01T00:00:00.000Z' },
];
const baseHabit = {
  title: 'Habit', emoji: '✅', color: '#22c55e', anchor: 'morning', recurrence: 'daily',
  targetCount: 1, createdAt: '2026-07-01T00:00:00.000Z', log: {},
} as const;
const habits: Habit[] = [
  { ...baseHabit, id: 'assigned', groupId: 'morning' },
  { ...baseHabit, id: 'other', groupId: 'health' },
  { ...baseHabit, id: 'ungrouped' },
];

const result = removeHabitGroup(groups, habits, 'morning');
assert.deepEqual(result.habitGroups.map(group => group.id), ['health']);
assert.equal(result.habits.find(habit => habit.id === 'assigned')?.groupId, undefined);
assert.equal(result.habits.find(habit => habit.id === 'other')?.groupId, 'health');
assert.equal(result.habits.find(habit => habit.id === 'ungrouped')?.groupId, undefined);
assert.equal(result.habits[1], habits[1], 'unrelated habits retain their identity');

console.log('habitGroups.test.ts: all assertions passed');
