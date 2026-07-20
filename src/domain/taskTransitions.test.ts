import assert from 'node:assert/strict';
import type { GTDTask, Session } from '../types.ts';
import { removeSessions, transitionSession, transitionTaskStatus } from './taskTransitions.ts';

const task = (patch: Partial<GTDTask> = {}): GTDTask => ({
  id: 'task-1', title: 'Write', status: 'scheduled', priority: 2,
  createdAt: '2026-07-01T00:00:00.000Z', sessionId: 'session-1', ...patch,
});
const session = (patch: Partial<Session> = {}): Session => ({
  id: 'session-1', taskId: 'task-1', goalId: '', date: '2026-07-12',
  startHour: 9, durationMinutes: 60, title: 'Write', description: '', tasks: [],
  sessionType: 'regular', status: 'planned', ...patch,
});
const now = new Date('2026-07-12T10:00:00.000Z');

const completed = transitionSession({ gtdTasks: [task()], sessions: [session()] }, 'session-1', { status: 'done' }, now);
assert.equal(completed.sessions[0].status, 'done');
assert.equal(completed.gtdTasks[0].status, 'done');

const recurring = transitionTaskStatus(
  { gtdTasks: [task({ recurring: 'daily', dueDate: '2026-07-12' })], sessions: [session()] },
  'task-1', 'done', {}, now, () => 'task-next',
);
assert.equal(recurring.gtdTasks.length, 2);
assert.equal(recurring.gtdTasks[0].id, 'task-next');
assert.equal(recurring.gtdTasks[0].dueDate, '2026-07-13');
assert.equal(recurring.sessions[0].status, 'done');
const idempotent = transitionTaskStatus(recurring, 'task-1', 'done', {}, now, () => 'duplicate');
assert.equal(idempotent.gtdTasks.length, 2);

const removed = removeSessions({ gtdTasks: [task()], sessions: [session()] }, new Set(['session-1']), now);
assert.equal(removed.sessions.length, 0);
assert.equal(removed.gtdTasks[0].status, 'next-action');
assert.equal(removed.gtdTasks[0].sessionId, undefined);

const unscheduled = transitionTaskStatus({ gtdTasks: [task()], sessions: [session()] }, 'task-1', 'next-action', {}, now);
assert.equal(unscheduled.sessions.length, 0);
assert.equal(unscheduled.gtdTasks[0].status, 'next-action');
assert.equal(unscheduled.gtdTasks[0].sessionId, undefined);
assert.equal(unscheduled.gtdTasks[0].scheduledDate, undefined);

const postponed = transitionTaskStatus(
  { gtdTasks: [task()], sessions: [session()] }, 'task-1', 'next-action', { dueDate: '2026-07-13', scheduledDate: undefined }, now,
);
assert.equal(postponed.sessions.length, 0);
assert.equal(postponed.gtdTasks[0].status, 'next-action');
assert.equal(postponed.gtdTasks[0].dueDate, '2026-07-13');

console.log('taskTransitions.test.ts: all assertions passed');
