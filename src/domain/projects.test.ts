import assert from 'node:assert/strict';
import { deriveProjectHealth, migrateLegacyProjects } from './projects.ts';
import type { GTDTask } from '../types.ts';

const createdAt = '2026-07-16T00:00:00.000Z';
const task = (id: string, project?: string) => ({
  id, title: id, status: 'next-action' as const, priority: 3 as const, createdAt, project,
});

const migrated = migrateLegacyProjects(undefined, [
  task('t1', 'Launch site'),
  task('t2', '  launch   SITE '),
  task('t3'),
]);
assert.equal(migrated.projects.length, 1);
assert.equal(migrated.projects[0].title, 'Launch site');
assert.equal(migrated.projects[0].outcome, '');
assert.equal(migrated.projects[0].health, 'unknown');
assert.equal(migrated.projects[0].status, 'active');
assert.equal(migrated.gtdTasks[0].projectId, migrated.projects[0].id);
assert.equal(migrated.gtdTasks[1].projectId, migrated.projects[0].id);
assert.equal('project' in migrated.gtdTasks[0], false);
assert.equal(migrated.gtdTasks[2].projectId, undefined);

const existing = {
  id: 'project-existing', title: 'Launch site', color: '#123456', status: 'active' as const, createdAt,
};
const reused = migrateLegacyProjects([existing], [task('t4', 'launch site')]);
assert.equal(reused.projects.length, 1);
assert.equal(reused.gtdTasks[0].projectId, existing.id);

const current = { ...task('t5', 'Ignored legacy label'), projectId: 'project-current' };
const preserved = migrateLegacyProjects([existing], [current]);
assert.equal(preserved.gtdTasks[0].projectId, 'project-current');
assert.equal(preserved.gtdTasks[0].project, 'Ignored legacy label');

const malformed = migrateLegacyProjects([{ id: 'bad', title: 1 }], [null, 7, task('t6', 'Recovered')]);
assert.equal(malformed.projects.length, 2);
assert.equal((malformed.projects[0] as any).title, 1);
assert.equal(malformed.projects[1].title, 'Recovered');
assert.equal(malformed.gtdTasks[0], null);
assert.equal(malformed.gtdTasks[1], 7);

assert.deepEqual(migrateLegacyProjects(undefined, undefined), { projects: [], gtdTasks: [] });

const baseProject = { id: 'p-health', title: 'Health', outcome: 'Known result', color: '#8b5cf6', status: 'active' as const, health: 'unknown' as const, createdAt };
assert.equal(deriveProjectHealth(baseProject, [{ ...task('blocked'), projectId: 'p-health', status: 'next-action' as const, blockingReason: 'Need reply' }], '2026-07-18'), 'blocked');
assert.equal(deriveProjectHealth({ ...baseProject, deadline: '2026-07-18' }, [task('open')], '2026-07-18'), 'at-risk');
assert.equal(deriveProjectHealth(baseProject, [{ ...task('next'), status: 'next-action' as const }], '2026-07-18'), 'on-track');
assert.equal(deriveProjectHealth(baseProject, [{ ...task('inbox'), status: 'inbox' as const }], '2026-07-18'), 'blocked');
assert.equal(deriveProjectHealth(baseProject, [], '2026-07-18'), 'unknown');

import { deriveProjectSection, nextReviewDateAfter, projectsNeedingReview } from './projects.ts';

const sectionTask = (overrides: Partial<GTDTask>): GTDTask => ({
  id: 'sect', title: 'sect', status: 'inbox', priority: 3, createdAt, ...overrides,
});
assert.equal(deriveProjectSection(sectionTask({ status: 'done' })), 'done');
assert.equal(deriveProjectSection(sectionTask({ status: 'next-action', blockingReason: 'Waiting on vendor' })), 'waiting');
assert.equal(deriveProjectSection(sectionTask({ status: 'next-action' })), 'next');
assert.equal(deriveProjectSection(sectionTask({ status: 'scheduled' })), 'scheduled');
assert.equal(deriveProjectSection(sectionTask({ status: 'inbox' })), 'backlog');
assert.equal(deriveProjectSection(sectionTask({ status: 'someday-maybe' })), 'backlog');
assert.equal(deriveProjectSection(sectionTask({ status: 'next-action', blockingReason: '   ' })), 'next');

const reviewBase = { id: 'p-review', title: 'Review me', outcome: 'Shipped', color: '#8b5cf6', health: 'unknown' as const, createdAt };
assert.deepEqual(
  projectsNeedingReview([
    { ...reviewBase, status: 'active', nextReviewDate: '2026-07-18' },
    { ...reviewBase, id: 'p-future', status: 'active', nextReviewDate: '2026-07-20' },
    { ...reviewBase, id: 'p-none', status: 'active' },
    { ...reviewBase, id: 'p-archived', status: 'archived', nextReviewDate: '2026-07-10' },
  ], '2026-07-19').map(p => p.id),
  ['p-review'],
);

assert.equal(nextReviewDateAfter('none', '2026-07-19'), undefined);
assert.equal(nextReviewDateAfter('weekly', '2026-07-19'), '2026-07-26');
assert.equal(nextReviewDateAfter('biweekly', '2026-07-19'), '2026-08-02');
assert.equal(nextReviewDateAfter('monthly', '2026-07-19'), '2026-08-19');
