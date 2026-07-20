import assert from 'node:assert/strict';
import type { GTDTask } from '../types.ts';
import { hasTodayFocus, todayFocusKey } from './taskFocus.ts';

const task = { id: 'task', title: 'Plan', status: 'next-action', priority: 3, createdAt: '2026-07-01T00:00:00.000Z', todayFocusDate: '2026-07-13' } as GTDTask;
assert.equal(todayFocusKey(new Date('2026-07-13T10:00:00')), '2026-07-13');
assert.equal(hasTodayFocus(task, '2026-07-13'), true);
assert.equal(hasTodayFocus(task, '2026-07-14'), false);

console.log('taskFocus.test.ts: all assertions passed');
