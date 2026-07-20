import assert from 'node:assert/strict';
import { extendRecurringSeries } from './recurrence.ts';
import type { Session } from '../types.ts';

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

const base = (over: Partial<Session>): Session => ({
  id: id('session'), goalId: '', date: '2026-07-01', startHour: 9, durationMinutes: 60,
  title: 'Practice', description: '', tasks: [], sessionType: 'regular', status: 'planned',
  ...over,
});

// Series whose tail is about to run out gets extended to the horizon.
{
  const today = new Date(2026, 6, 20); // 2026-07-20
  const series = [
    base({ id: 's1', date: '2026-07-01', seriesId: 'sr1', recurrence: 'weekly' }),
    base({ id: 's2', date: '2026-07-08', seriesId: 'sr1', recurrence: 'weekly' }),
    base({ id: 's3', date: '2026-07-27', seriesId: 'sr1', recurrence: 'weekly' }), // tail within 21d of today
  ];
  const added = extendRecurringSeries(series, today, id);
  assert.ok(added.length > 0, 'expected extension when tail is close');
  assert.ok(added.every(s => s.date > '2026-07-27'), 'new occurrences continue after the last one');
  assert.ok(added.every(s => new Date(s.date) <= new Date(2026, 8, 18)), 'never extends past the horizon');
}

// A tail far in the future is left alone.
{
  const today = new Date(2026, 6, 1);
  const series = [
    base({ id: 's1', date: '2026-07-01', seriesId: 'sr2', recurrence: 'daily' }),
    base({ id: 's2', date: '2026-08-20', seriesId: 'sr2', recurrence: 'daily' }),
  ];
  assert.equal(extendRecurringSeries(series, today, id).length, 0);
}

// A single instance with recurrence set (not yet a multi-session series) is not extended.
{
  const today = new Date(2026, 6, 20);
  const series = [base({ id: 's1', date: '2026-07-21', seriesId: 'sr3', recurrence: 'daily' })];
  assert.equal(extendRecurringSeries(series, today, id).length, 0);
}

// 'custom' recurrence is skipped (weekday set can't be reconstructed).
{
  const today = new Date(2026, 6, 20);
  const series = [
    base({ id: 's1', date: '2026-07-01', seriesId: 'sr4', recurrence: 'custom' }),
    base({ id: 's2', date: '2026-07-22', seriesId: 'sr4', recurrence: 'custom' }),
  ];
  assert.equal(extendRecurringSeries(series, today, id).length, 0);
}

// A lapsed series (tail already in the past) is not silently resurrected.
{
  const today = new Date(2026, 8, 1);
  const series = [
    base({ id: 's1', date: '2026-07-01', seriesId: 'sr5', recurrence: 'weekly' }),
    base({ id: 's2', date: '2026-07-08', seriesId: 'sr5', recurrence: 'weekly' }),
  ];
  assert.equal(extendRecurringSeries(series, today, id).length, 0);
}

console.log('recurrence.test.ts: all assertions passed');
