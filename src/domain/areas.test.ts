import assert from 'node:assert/strict';
import { activeAreas, areaStats } from './areas.ts';
import type { Area, GTDTask, Project } from '../types.ts';

const createdAt = '2026-07-20T00:00:00.000Z';

const areas: Area[] = [
  { id: 'a1', title: 'Health', color: '#22c55e', createdAt },
  { id: 'a2', title: 'Home', color: '#0d9488', createdAt, archivedAt: '2026-07-19T00:00:00.000Z' },
];
assert.deepEqual(activeAreas(areas).map(a => a.id), ['a1']);

const projects: Project[] = [
  { id: 'p1', title: 'Gym routine', outcome: 'x', color: '#22c55e', status: 'active', health: 'unknown', areaId: 'a1', createdAt },
  { id: 'p2', title: 'Unrelated', outcome: 'x', color: '#22c55e', status: 'active', health: 'unknown', createdAt },
];
const task = (overrides: Partial<GTDTask>): GTDTask => ({
  id: overrides.id || 't', title: 't', status: 'next-action', priority: 3, createdAt, ...overrides,
});
const tasks: GTDTask[] = [
  task({ id: 't1', projectId: 'p1', status: 'next-action' }),
  task({ id: 't2', projectId: 'p1', status: 'done' }),
  task({ id: 't3', projectId: 'p1', status: 'next-action', dueDate: '2026-07-10' }),
  task({ id: 't4', projectId: 'p2', status: 'next-action' }),
];
const stats = areaStats(areas[0], projects, tasks, '2026-07-20');
assert.equal(stats.projectCount, 1);
assert.equal(stats.openTaskCount, 2);
assert.equal(stats.overdueTaskCount, 1);

const emptyStats = areaStats(areas[1], projects, tasks, '2026-07-20');
assert.deepEqual(emptyStats, { projectCount: 0, openTaskCount: 0, overdueTaskCount: 0 });
