# Projects Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Project Detail screen with a status-driven section board and review reminders, plus a new Areas concept (standing life spheres) linkable to Projects alongside existing Goals — per `docs/superpowers/specs/2026-07-21-projects-expansion-design.md`.

**Architecture:** Extend the existing durable Zustand store (`src/store.ts`) with an `areas` collection and a real `blockingReason` field on `GTDTask` (activating dead "blocked" logic in `deriveProjectHealth`). Add pure derivation helpers in `src/domain/` (section-from-task, review-due-projects, next-review-date), then two new screens (`AreasView`, `ProjectDetailView` + `ProjectSectionBoard`) that consume them. Navigation follows the codebase's existing pattern: `AreasView` gets its own `AppView` and Manager tile (like Goals/Projects); `ProjectDetailView` reuses the `GoalDetailView` pattern — a local `selectedProjectId` in `App.tsx`, no new `AppView`.

**Tech Stack:** React + TypeScript, Zustand (persist middleware), date-fns, Tailwind utility classes, lucide-react icons. Tests are plain Node scripts run via `node --experimental-strip-types` (no test framework) using `node:assert/strict`.

## Global Constraints

- Store version is currently 11 (`CURRENT_STORE_VERSION` in `src/services/persistence.ts`); this work bumps it to 12.
- Backup schema validation in `src/services/backup.ts` must accept/reject the new fields exactly as strictly as existing fields (see `projectIsValid`, `gtdTaskIsValid` for the established rigor level).
- i18n: `src/i18n.ts` holds three flat dictionaries (`en`, `ru`, `ja`), English is the source of truth; every new key must exist in all three with equivalent meaning, matching the existing terse tone.
- No new npm dependencies. No custom drag-and-drop library — plain HTML5 DnD attributes, consistent with the fact `src/hooks/useDragAndDrop.ts` was deliberately deleted (do not resurrect a generic DnD hook abstraction).
- Follow existing component conventions exactly: Tailwind classes copied from `ProjectsView.tsx`/`GoalDetailView.tsx` (`tcard`, `hit`, `var(--text)` etc. design tokens), `useT()`/`useDateLocale()` from `src/i18n.ts`, `useStore()` from `src/store.ts`.
- Run `npm test` after every logic (domain/store/backup) task. Run `npx tsc --noEmit` after every UI task (component/App.tsx) task — this repo has no component test harness, so type-checking plus manual `npm run dev` verification is the correctness bar for UI tasks.

---

## File Structure

New files:
- `src/domain/areas.ts` — pure helpers: `activeAreas`, `areaStats`.
- `src/domain/areas.test.ts`
- `src/components/AreasView.tsx` — Areas list screen (CRUD, linked projects).
- `src/components/ProjectSectionBoard.tsx` — 5-column board (Backlog/Next/Waiting/Scheduled/Done) for one project's tasks.
- `src/components/ProjectDetailView.tsx` — Project Detail screen (brief, review controls, board, progress).

Modified files:
- `src/types.ts` — `GTDTask.blockingReason`, `Area` interface, `AppView` gains `'areas'`.
- `src/domain/projects.ts` — `PROJECT_COLORS`, `ProjectSection` + `deriveProjectSection`, `projectsNeedingReview`, `nextReviewDateAfter`; `deriveProjectHealth` reads real `blockingReason` instead of a cast.
- `src/domain/projects.test.ts` — tests for the above.
- `src/store.ts` — `areas` state + `addArea`/`updateArea`/`deleteArea`, `updateProject` patch type extended, `resetAll`/`partialize` include `areas`.
- `src/services/persistence.ts` — `CURRENT_STORE_VERSION` → 12, migration defaults `areas: []`.
- `src/services/backup.ts` — `areaIsValid`, `blockingReason` validation, `DURABLE_KEYS`/`BackupPreviewKey` gain `'areas'`, `restoreBackupState`/`buildBackupPreview` handle it.
- `src/services/backup.test.ts` — extend for `areas` + `blockingReason`.
- `src/i18n.ts` — new `areas.*`, `projects.detail.*`, `projects.review.*` keys × 3 languages.
- `src/App.tsx` — `AreasView` lazy import + `'areas'` routing + Manager tile; `selectedProjectId` state + `ProjectDetailView` routing (mirrors `selectedGoalId`/`GoalDetailView`).
- `src/components/ProjectsView.tsx` — remove inline edit form (moved to `ProjectDetailView`), cards open detail on click, review-due badge in header, Manager tile subtitle shows pending review count.

---

### Task 1: `blockingReason` field + project board/review domain helpers

**Files:**
- Modify: `src/types.ts` (GTDTask interface, ~line 170-202)
- Modify: `src/domain/projects.ts`
- Modify: `src/domain/projects.test.ts`

**Interfaces:**
- Produces: `PROJECT_COLORS: string[]`, `type ProjectSection = 'backlog' | 'next' | 'waiting' | 'scheduled' | 'done'`, `deriveProjectSection(task: GTDTask): ProjectSection`, `projectsNeedingReview(projects: Project[], today: string): Project[]`, `nextReviewDateAfter(cadence: ProjectReviewCadence, from: string): string | undefined`.
- Consumes: nothing new (uses existing `Project`, `GTDTask`, `ProjectStatus`, `ProjectReviewCadence` types).

- [ ] **Step 1: Add `blockingReason` to `GTDTask`**

In `src/types.ts`, find the `GTDTask` interface and add the field right after `isArchived`:

```ts
export interface GTDTask {
  // ... existing fields unchanged ...
  isArchived?: boolean;
  /** Free-text reason this task is stuck (e.g. "waiting on vendor reply"). Non-empty ⇒ the task is in the project board's Waiting section regardless of status. */
  blockingReason?: string;
}
```

- [ ] **Step 2: Write the failing tests for the new domain helpers**

Open `src/domain/projects.test.ts` and append at the end of the file:

```ts
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
```

Also update the existing `deriveProjectHealth` "blocked" assertion near the top of the file (it currently casts through an ad-hoc type) — replace:

```ts
assert.equal(deriveProjectHealth(baseProject, [({ ...task('blocked'), projectId: 'p-health', status: 'next-action' as const, blockingReason: 'Need reply' } as unknown as GTDTask & { blockingReason: string })], '2026-07-18'), 'blocked');
```

with:

```ts
assert.equal(deriveProjectHealth(baseProject, [{ ...task('blocked'), projectId: 'p-health', status: 'next-action' as const, blockingReason: 'Need reply' }], '2026-07-18'), 'blocked');
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --experimental-strip-types src/domain/projects.test.ts`
Expected: FAIL — `deriveProjectSection`, `nextReviewDateAfter`, `projectsNeedingReview` are not exported from `./projects.ts`.

- [ ] **Step 4: Implement the helpers in `src/domain/projects.ts`**

Add `format, parseISO, addWeeks, addMonths` to the top import and add the new exports. Full updated file:

```ts
import { addMonths, addWeeks, format, parseISO } from 'date-fns';
import type { GTDTask, Project, ProjectHealth, ProjectReviewCadence } from '../types.ts';

const normalizedTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const PROJECT_COLORS = ['#8b5cf6', '#6467f2', '#0d9488', '#22c55e', '#f59e0b', '#e0532f', '#e11d48', '#64748b'];

export const normalizeProject = (project: Project): Project => {
  const record = project as unknown as Record<string, unknown>;
  return {
    ...project,
    ...(!Object.prototype.hasOwnProperty.call(record, 'outcome') || project.outcome === undefined ? { outcome: '' } : {}),
    ...(!Object.prototype.hasOwnProperty.call(record, 'health') || project.health === undefined ? { health: 'unknown' as const } : {}),
  };
};

const projectDate = (project: Project) => project.deadline || project.targetDate || '';

export function deriveProjectHealth(project: Project, tasks: GTDTask[], today: string): ProjectHealth {
  const open = tasks.filter(task => task.status !== 'done' && task.status !== 'trash' && !task.isArchived);
  if (open.some(task => !!task.blockingReason?.trim())) return 'blocked';
  if (open.length > 0 && !open.some(task => task.status === 'next-action' || task.status === 'scheduled')) return 'blocked';
  const deadline = projectDate(project);
  if (deadline && deadline <= today && open.length > 0) return 'at-risk';
  if (open.some(task => !!task.dueDate && task.dueDate < today)) return 'at-risk';
  if (open.some(task => task.status === 'next-action' || task.status === 'scheduled')) return 'on-track';
  return project.health || 'unknown';
}

/** Which board column a task belongs to. Waiting takes priority over status — a blocked task stays visible as blocked even if it's technically "scheduled". */
export type ProjectSection = 'backlog' | 'next' | 'waiting' | 'scheduled' | 'done';

export function deriveProjectSection(task: GTDTask): ProjectSection {
  if (task.status === 'done') return 'done';
  if (task.blockingReason?.trim()) return 'waiting';
  if (task.status === 'next-action') return 'next';
  if (task.status === 'scheduled') return 'scheduled';
  return 'backlog';
}

/** Active projects whose next review date has arrived (or passed). */
export function projectsNeedingReview(projects: Project[], today: string): Project[] {
  const inactive = new Set(['archived', 'completed', 'canceled']);
  return projects.filter(project => !inactive.has(project.status)
    && !!project.nextReviewDate
    && project.nextReviewDate <= today);
}

/** The next `nextReviewDate` value after completing a review today, per cadence. undefined for 'none'. */
export function nextReviewDateAfter(cadence: ProjectReviewCadence, from: string): string | undefined {
  if (cadence === 'none') return undefined;
  const base = parseISO(from);
  const next = cadence === 'weekly' ? addWeeks(base, 1) : cadence === 'biweekly' ? addWeeks(base, 2) : addMonths(base, 1);
  return format(next, 'yyyy-MM-dd');
}

/**
 * Convert the former task.project labels into durable project containers.
 * IDs are deterministic so hydration and recovery-import previews produce the
 * same result for the same data.
 */
export function migrateLegacyProjects(
  projectsValue: unknown,
  tasksValue: unknown,
): { projects: Project[]; gtdTasks: GTDTask[] } {
  const projects = (Array.isArray(projectsValue) ? projectsValue : [])
    .map(project => (project && typeof project === 'object' ? normalizeProject({ ...(project as Record<string, unknown>) } as unknown as Project) : project)) as Project[];
  const tasks = (Array.isArray(tasksValue) ? tasksValue : [])
    .map(task => (task && typeof task === 'object' ? { ...(task as Record<string, unknown>) } : task)) as GTDTask[];
  const validProjects = projects.filter(project => !!project
    && typeof project === 'object'
    && typeof project.id === 'string'
    && typeof project.title === 'string');
  const byTitle = new Map(validProjects.map(project => [normalizedTitle(project.title), project]));
  const usedIds = new Set(validProjects.map(project => project.id));

  const nextId = () => {
    let index = projects.length + 1;
    while (usedIds.has(`project-legacy-${index}`)) index += 1;
    const id = `project-legacy-${index}`;
    usedIds.add(id);
    return id;
  };

  const gtdTasks = tasks.map(task => {
    if (!task || typeof task !== 'object') return task;
    const record = task as unknown as Record<string, unknown>;
    if (typeof record.projectId === 'string' || typeof record.project !== 'string' || !record.project.trim()) return record as unknown as GTDTask;
    const title = record.project.trim().replace(/\s+/g, ' ');
    const key = normalizedTitle(title);
    let project = byTitle.get(key);
    if (!project) {
      project = {
        id: nextId(),
        title,
        color: '#8b5cf6',
        outcome: '',
        status: 'active',
        health: 'unknown',
        createdAt: task.createdAt,
      };
      projects.push(project);
      byTitle.set(key, project);
    }
    const migrated = { ...task, projectId: project.id };
    delete migrated.project;
    return migrated;
  });

  return { projects, gtdTasks };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --experimental-strip-types src/domain/projects.test.ts`
Expected: PASS, no output (assert throws nothing).

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npm test`
Expected: all scripts exit 0 (no assertion errors printed).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/domain/projects.ts src/domain/projects.test.ts
git commit -m "feat(projects): add blockingReason field and board/review domain helpers"
```

---

### Task 2: `Area` type + `domain/areas.ts`

**Files:**
- Modify: `src/types.ts`
- Create: `src/domain/areas.ts`
- Create: `src/domain/areas.test.ts`

**Interfaces:**
- Consumes: `Area`, `Project`, `GTDTask` from `../types.ts`.
- Produces: `activeAreas(areas: Area[]): Area[]`, `areaStats(area: Area, projects: Project[], tasks: GTDTask[], today: string): { projectCount: number; openTaskCount: number; overdueTaskCount: number }`.

- [ ] **Step 1: Add the `Area` type and extend `AppView`**

In `src/types.ts`, change the `AppView` union:

```ts
export type AppView =
  | 'dashboard' | 'goals' | 'projects' | 'areas' | 'week' | 'inbox' | 'habits' | 'progress' | 'manager' | 'statistics'
  | 'architect' | 'planner' | 'archive' | 'settings';
```

Add the `Area` interface right after the `Project` interface (after its closing `}` and before `export type Priority = ...`):

```ts
export interface Area {
  id: string;
  title: string;
  color: string;
  /** Emoji marker, same convention as Goal.emoji. */
  icon?: string;
  notes?: string;
  createdAt: string;
  /** Areas don't complete — only archive. */
  archivedAt?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/areas.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --experimental-strip-types src/domain/areas.test.ts`
Expected: FAIL — `./areas.ts` does not exist.

- [ ] **Step 4: Implement `src/domain/areas.ts`**

```ts
import type { Area, GTDTask, Project } from '../types.ts';

export function activeAreas(areas: Area[]): Area[] {
  return areas.filter(area => !area.archivedAt);
}

export interface AreaStats {
  projectCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
}

/** Aggregate task load across every project linked to this area. */
export function areaStats(area: Area, projects: Project[], tasks: GTDTask[], today: string): AreaStats {
  const areaProjects = projects.filter(project => project.areaId === area.id);
  const projectIds = new Set(areaProjects.map(project => project.id));
  const openTasks = tasks.filter(task => !!task.projectId
    && projectIds.has(task.projectId)
    && task.status !== 'done'
    && task.status !== 'trash'
    && !task.isArchived);
  const overdueTaskCount = openTasks.filter(task => !!task.dueDate && task.dueDate < today).length;
  return { projectCount: areaProjects.length, openTaskCount: openTasks.length, overdueTaskCount };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types src/domain/areas.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the new test to the `test` npm script**

In `package.json`, find the `"test"` script and append ` && node --experimental-strip-types src/domain/areas.test.ts` right after `... src/domain/projects.test.ts` (keep it grouped with the other `domain/` tests, before `src/services/backup.test.ts`):

```json
"test": "node proxy/api/ai.security.test.mjs && node --experimental-strip-types src/domain/id.test.ts && node --experimental-strip-types src/domain/date.test.ts && node --experimental-strip-types src/domain/taskFocus.test.ts && node --experimental-strip-types src/domain/taskTransitions.test.ts && node --experimental-strip-types src/domain/recurrence.test.ts && node --experimental-strip-types src/domain/habitGroups.test.ts && node --experimental-strip-types src/domain/projects.test.ts && node --experimental-strip-types src/domain/areas.test.ts && node --experimental-strip-types src/services/backup.test.ts && node --experimental-strip-types src/components/settingsBackupImportError.test.ts && node --experimental-strip-types src/ai/intentFilter.test.ts && node --experimental-strip-types src/utils/localized.test.ts && node --experimental-strip-types src/ai/schedulePlan.test.ts && node --experimental-strip-types src/utils/nlDate.test.ts && node --experimental-strip-types src/utils/taskCapture.test.ts && node --experimental-strip-types src/utils/time.test.ts && node --experimental-strip-types src/utils/importCsv.test.ts",
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all scripts exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/domain/areas.ts src/domain/areas.test.ts package.json
git commit -m "feat(areas): add Area type and pure area-stats domain helpers"
```

---

### Task 3: Store — `areas` CRUD, `updateProject` extension, persistence v12

**Files:**
- Modify: `src/store.ts`
- Modify: `src/services/persistence.ts`

**Interfaces:**
- Consumes: `Area`, `PROJECT_COLORS` unused here; `createId` from `./domain/id.ts`.
- Produces (store additions): `areas: Area[]`, `addArea(title: string, options?: { color?: string; icon?: string }): string`, `updateArea(id: string, patch: Partial<Pick<Area,'title'|'color'|'icon'|'notes'|'archivedAt'>>): void`, `deleteArea(id: string): void`. `updateProject` patch type gains `'goalId' | 'areaId' | 'reviewCadence' | 'nextReviewDate'`.

- [ ] **Step 1: Bump the store version and add the migration default**

In `src/services/persistence.ts`, change:

```ts
export const CURRENT_STORE_VERSION = 11;
```

to:

```ts
export const CURRENT_STORE_VERSION = 12;
```

At the end of `migratePersistedState`, right before `return next;`, add:

```ts
  if (version < 12 && !Array.isArray(next.areas)) next.areas = [];

  return next;
```

- [ ] **Step 2: Add the store version comment**

In `src/store.ts`, find the comment block right above `version: CURRENT_STORE_VERSION,` (the `// v11: projects become durable...` line) and add a new line after it:

```ts
  // v11: projects become durable operational containers instead of task labels.
  // v12: areas are standing life spheres, independent of Goals, linkable from projects.
  version: CURRENT_STORE_VERSION,
```

- [ ] **Step 3: Add `Area` to the store's imports and state shape**

In `src/store.ts`, update the type import line:

```ts
import type { Goal, Session, GTDTask, GTDStatus, Priority, TaskContext, SchedulePrefs, LifeBlock, Habit, HabitGroup, HabitStatus, ReflectionEntry, MetricDef, FocusTimer, GeneratedPlan, PlanHorizon, PlanOptions, FixedCommitment, Milestone, AppView, Project, Area } from './types';
```

In the `S` interface, add `areas: Area[];` right after `projects: Project[];`:

```ts
  goals: Goal[];
  sessions: Session[];
  gtdTasks: GTDTask[];
  projects: Project[];
  areas: Area[];
  habits: Habit[];
```

Add the three new action signatures right after the `updateProject` line in the `S` interface:

```ts
  addProject: (title: string, options?: { outcome?: string; targetDate?: string; deadline?: string }) => string;
  updateProject: (id: string, patch: Partial<Pick<Project, 'title' | 'outcome' | 'definitionOfDone' | 'color' | 'status' | 'health' | 'targetDate' | 'deadline' | 'notes' | 'goalId' | 'areaId' | 'reviewCadence' | 'nextReviewDate'>>) => void;
  addArea: (title: string, options?: { color?: string; icon?: string }) => string;
  updateArea: (id: string, patch: Partial<Pick<Area, 'title' | 'color' | 'icon' | 'notes' | 'archivedAt'>>) => void;
  deleteArea: (id: string) => void;
```

- [ ] **Step 4: Add the `areas` initial state, actions, and update `resetAll`/`updateProject`/`partialize`**

In the store creator, add `areas: [],` right after `projects: [],`:

```ts
  goals: [],
  sessions: [],
  gtdTasks: [],
  projects: [],
  areas: [],
  habits: [],
```

Update `resetAll` to clear `areas` too:

```ts
  resetAll: () => {
    latestPlanRequest++;
    set({
      goals: [], sessions: [], gtdTasks: [], projects: [], areas: [], habits: [], habitGroups: [], reflections: {}, metricDefs: [],
      generatedPlan: null, isPlanning: false,
      planningError: null, focusTimer: null, pendingUndo: null, weekOffset: 0,
    });
  },
```

Update `updateProject` to trim/clear the two new optional link fields when explicitly patched with an empty string (so a "no goal"/"no area" picker option works the same way the color picker does — pass `''` to clear):

```ts
  updateProject: (id, patch) => set((s) => ({
    projects: s.projects.map(project => project.id === id
      ? {
        ...project,
        ...patch,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.outcome !== undefined ? { outcome: patch.outcome.trim() } : {}),
        ...(patch.definitionOfDone !== undefined ? { definitionOfDone: patch.definitionOfDone.trim() || undefined } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
        ...(patch.goalId !== undefined ? { goalId: patch.goalId || undefined } : {}),
        ...(patch.areaId !== undefined ? { areaId: patch.areaId || undefined } : {}),
        ...(patch.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        ...(patch.status === 'archived' ? { archivedAt: new Date().toISOString() } : {}),
        updatedAt: new Date().toISOString(),
      }
      : project),
  })),
  addArea: (title, options) => {
    const trimmed = title.trim();
    if (!trimmed) return '';
    const id = createId('area');
    const now = new Date().toISOString();
    set((s) => ({
      areas: [...s.areas, {
        id,
        title: trimmed,
        color: options?.color || '#8b5cf6',
        ...(options?.icon ? { icon: options.icon } : {}),
        createdAt: now,
      }],
    }));
    return id;
  },
  updateArea: (id, patch) => set((s) => ({
    areas: s.areas.map(area => area.id === id
      ? {
        ...area,
        ...patch,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
      }
      : area),
  })),
  deleteArea: (id) => set((s) => ({
    areas: s.areas.filter(area => area.id !== id),
    projects: s.projects.map(project => project.areaId === id ? { ...project, areaId: undefined } : project),
  })),
```

Update `partialize` to persist `areas`:

```ts
  partialize: (s) => ({
    goals: s.goals,
    sessions: s.sessions,
    gtdTasks: s.gtdTasks,
    projects: s.projects,
    areas: s.areas,
    habits: s.habits,
    habitGroups: s.habitGroups,
    reflections: s.reflections,
    metricDefs: s.metricDefs,
    habitRemindersEnabled: s.habitRemindersEnabled,
    notifPrefs: s.notifPrefs,
    theme: s.theme,
    userName: s.userName,
    userProfile: s.userProfile,
    onboarded: s.onboarded,
    introCourseCompleted: s.introCourseCompleted,
    aiDisclaimerAcceptedAt: s.aiDisclaimerAcceptedAt,
    lang: s.lang,
    schedulePrefs: s.schedulePrefs,
    generatedPlan: s.generatedPlan,
    weekOffset: s.weekOffset,
    focusTimer: s.focusTimer,
  }),
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `store.ts` or `persistence.ts` (unrelated pre-existing errors, if any, are out of scope — but there should be none since this is a fully-typed codebase).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all scripts exit 0 — `migratePersistedState` isn't directly asserted for v12 yet (that's covered by Task 4's backup roundtrip test), but nothing here should break existing tests.

- [ ] **Step 7: Commit**

```bash
git add src/store.ts src/services/persistence.ts
git commit -m "feat(areas): add areas store slice, extend updateProject, bump store to v12"
```

---

### Task 4: Backup validation for `areas` and `blockingReason`

**Files:**
- Modify: `src/services/backup.ts`
- Modify: `src/services/backup.test.ts`

**Interfaces:**
- Consumes: `areaIsValid` is internal to `backup.ts`, not exported.
- Produces: `DURABLE_KEYS` includes `'areas'`; `BackupPreviewKey` includes `'areas'`; `restoreBackupState`/`buildBackupPreview` handle `data.areas`.

- [ ] **Step 1: Write the failing test — extend the round-trip fixture**

In `src/services/backup.test.ts`, add a `validArea` constant right after `validProject` (before `validHabit`):

```ts
const validArea = {
  id: 'area-ops', title: 'Operations', color: '#0d9488', icon: '🛠️',
  notes: 'Keep the lights on.', createdAt: '2026-07-05T00:00:00.000Z',
  archivedAt: '2026-07-06T00:00:00.000Z',
};
```

Add `blockingReason` to `validTask`:

```ts
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
```

Add `areas: [validArea]` to the big `state` fixture object (right after `projects: [validProject]`):

```ts
const state = {
  goals: [{ ...validGoal, ignored: true }],
  sessions: [validSession], gtdTasks: [validTask], projects: [validProject], areas: [validArea], habits: [validHabit], habitGroups: [validHabitGroup],
  // ... rest unchanged ...
```

The existing loop `for (const key of DURABLE_KEYS) assert.deepEqual(restored[key], parsed[key], ...)` will automatically cover `areas` once it's added to `DURABLE_KEYS` in Step 3 below — no further edit needed there.

Now find the `previewState` fixture (used for `buildBackupPreview` assertions) and add two areas to it, plus the corresponding preview assertion. Locate:

```ts
  projects: [validProject, validProject],
  habits: [validHabit, validHabit],
```

and change to:

```ts
  projects: [validProject, validProject],
  areas: [validArea, validArea],
  habits: [validHabit, validHabit],
```

Right after `assert.deepEqual(fullPreview.projects, { action: 'replace', before: 2, after: 1, count: 1 });` add:

```ts
assert.deepEqual(fullPreview.areas, { action: 'replace', before: 2, after: 1, count: 1 });
```

Find the `emptyCollectionsPreview` block and add `areas: []` to the input and `'areas'` to the key list:

```ts
const emptyCollectionsPreview = buildBackupPreview(previewState, {
  goals: [], sessions: [], gtdTasks: [], projects: [], areas: [], habits: [], habitGroups: [], reflections: {}, metricDefs: [],
});
for (const key of ['goals', 'sessions', 'gtdTasks', 'projects', 'areas', 'habits', 'habitGroups', 'reflections', 'metricDefs'] as const) {
  assert.equal(emptyCollectionsPreview[key]?.count, 0, `${key} previews an explicit empty collection`);
}
```

Add invalid-data assertions right after the existing `['projects', ...]` line inside the duplicate-id `for` loop:

```ts
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
```

Add a standalone malformed-area test near the other `invalid-projects` assertions:

```ts
assert.throws(
  () => parseBackup(JSON.stringify({ areas: [{ id: 'a-min' }] })),
  /invalid-areas/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ areas: [{ ...validArea, archivedAt: 'not-a-date' }] })),
  /invalid-areas/,
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/services/backup.test.ts`
Expected: FAIL — `areas` isn't a recognized durable key yet, so `Object.keys(parsed).sort()` won't include it and the round-trip/preview assertions will throw.

- [ ] **Step 3: Implement `areas` + `blockingReason` support in `src/services/backup.ts`**

Add `'areas'` to `DURABLE_KEYS` (right after `'projects'`):

```ts
export const DURABLE_KEYS = [
  'goals', 'sessions', 'gtdTasks', 'projects', 'areas', 'habits', 'habitGroups', 'reflections', 'metricDefs',
  'habitRemindersEnabled', 'notifPrefs', 'theme', 'userName',
  'userProfile', 'onboarded', 'introCourseCompleted', 'aiDisclaimerAcceptedAt',
  'lang', 'schedulePrefs', 'generatedPlan', 'weekOffset',
  'focusTimer',
] as const;
```

Add `'areas'` to `BackupPreviewKey`:

```ts
export type BackupPreviewKey =
  | 'goals' | 'sessions' | 'gtdTasks' | 'projects' | 'areas' | 'habits' | 'habitGroups' | 'reflections' | 'metricDefs'
  | 'profile' | 'preferences' | 'notifications' | 'generatedPlan' | 'focusTimer';
```

Add a `blockingReason` check to `gtdTaskIsValid` (right after the `isArchived` check, before the closing `;`):

```ts
    && optionalFieldIsValid(value, 'isArchived', field => typeof field === 'boolean')
    && optionalFieldIsValid(value, 'blockingReason', field => typeof field === 'string');
```

Add an `areaIsValid` function right after `projectIsValid`:

```ts
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
```

In `restoreBackupState`, add `areas` right after `projects`:

```ts
    projects: Array.isArray(data.projects) ? data.projects : state.projects,
    areas: Array.isArray(data.areas) ? data.areas : state.areas,
    habits: Array.isArray(data.habits) ? data.habits : state.habits,
```

In `buildBackupPreview`, add `'areas'` to the `collections` tuple list:

```ts
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
```

In `inspectBackup`, add the validation check right after the existing `projects` validation block:

```ts
  if ('projects' in data && Array.isArray(data.projects)) data.projects = data.projects.map(project => isRecord(project) ? normalizeProject(project as unknown as import('../types.ts').Project) : project);
  if ('projects' in data && (!Array.isArray(data.projects) || !recordIdsAreUnique(data.projects) || !data.projects.every(projectIsValid))) throw new Error('invalid-projects');
  if ('areas' in data && (!Array.isArray(data.areas) || !recordIdsAreUnique(data.areas) || !data.areas.every(areaIsValid))) throw new Error('invalid-areas');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types src/services/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all scripts exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/backup.ts src/services/backup.test.ts
git commit -m "feat(areas): validate areas and blockingReason in backup import/export"
```

---

### Task 5: i18n keys — `areas.*`, `projects.detail.*`, `projects.review.*`

**Files:**
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: nothing (data-only).
- Produces: translation keys consumed by Tasks 6-9. Full key list below — every key must exist in `en`, `ru`, `ja`.

- [ ] **Step 1: Add English keys**

In `src/i18n.ts`, in the `en` dictionary, find this line (end of the existing `projects.*` block, right before `// ── Home (Today) ──`):

```ts
  'projects.health.unknown': 'Unknown', 'projects.health.on-track': 'On track', 'projects.health.at-risk': 'At risk', 'projects.health.blocked': 'Blocked',
```

Insert immediately after it (before `// ── Home (Today) ──`):

```ts
  'projects.activeReviewCount': '{n} active · {m} to review',
  'projects.detail.back': 'Projects', 'projects.detail.definitionOfDoneLabel': 'Definition of done', 'projects.detail.definitionOfDonePlaceholder': 'How do you know this is really finished?',
  'projects.detail.notesLabel': 'Notes', 'projects.detail.notesPlaceholder': 'Context, links, decisions…',
  'projects.detail.goalLabel': 'Goal', 'projects.detail.noGoal': 'No goal linked', 'projects.detail.areaLabel': 'Area', 'projects.detail.noArea': 'No area linked',
  'projects.detail.boardTitle': 'Board',
  'projects.detail.section.backlog': 'Backlog', 'projects.detail.section.next': 'Next', 'projects.detail.section.waiting': 'Waiting', 'projects.detail.section.scheduled': 'Scheduled', 'projects.detail.section.done': 'Done',
  'projects.detail.moveTo': 'Move to {section}', 'projects.detail.emptySection': 'Nothing here',
  'projects.detail.waitingPromptTitle': 'What are you waiting for?', 'projects.detail.waitingPromptPlaceholder': 'e.g. reply from the vendor', 'projects.detail.waitingPromptConfirm': 'Mark as waiting',
  'projects.review.cadenceLabel': 'Review cadence', 'projects.review.cadence.none': 'None', 'projects.review.cadence.weekly': 'Weekly', 'projects.review.cadence.biweekly': 'Every 2 weeks', 'projects.review.cadence.monthly': 'Monthly',
  'projects.review.nextReviewLabel': 'Next review', 'projects.review.reviewNow': 'Review now', 'projects.review.pendingBadge': '{n} to review',
  'projects.review.modalTitle': 'Review “{title}”', 'projects.review.modalHealthLabel': 'How is it going?', 'projects.review.modalOutcomeLabel': 'Outcome still accurate?', 'projects.review.modalSave': 'Save review',
  'areas.title': 'Areas', 'areas.subtitle': 'Ongoing responsibilities without a finish line — Health, Home, Work.',
  'areas.activeCount': '{n} areas', 'areas.namePlaceholder': 'Area name', 'areas.create': 'Create area',
  'areas.nameRequired': 'Enter an area name.', 'areas.duplicateName': 'An area with this name already exists.',
  'areas.emptyTitle': 'No areas yet', 'areas.emptySubtitle': 'Areas are standing responsibilities with no finish line, like Health or Home. For work with a result, use Projects; for outcome-driven goals, use Goals.',
  'areas.archived': 'Archived areas', 'areas.archiveAction': 'Archive', 'areas.restoreAction': 'Restore', 'areas.edit': 'Edit area',
  'areas.nameLabel': 'Name', 'areas.colorLabel': 'Color', 'areas.colorOption': 'Area color {n}',
  'areas.notesLabel': 'Notes', 'areas.notesPlaceholder': 'What does this area cover?',
  'areas.projectCount': '{n} projects', 'areas.taskSummary': '{open} open · {overdue} overdue',
  'areas.noProjects': 'No projects linked yet.', 'areas.openProject': 'Open project “{title}”',
```

- [ ] **Step 2: Add Russian keys**

Find the equivalent `ru` dictionary line:

```ts
  'projects.health.unknown': 'Неясно', 'projects.health.on-track': 'По плану', 'projects.health.at-risk': 'Риск', 'projects.health.blocked': 'Блокер',
```

Insert immediately after it (before `// ── Home (Today) ──`):

```ts
  'projects.activeReviewCount': 'активных: {n} · на ревью: {m}',
  'projects.detail.back': 'Проекты', 'projects.detail.definitionOfDoneLabel': 'Критерий завершения', 'projects.detail.definitionOfDonePlaceholder': 'Как понять, что проект действительно завершён?',
  'projects.detail.notesLabel': 'Заметки', 'projects.detail.notesPlaceholder': 'Контекст, ссылки, решения…',
  'projects.detail.goalLabel': 'Цель', 'projects.detail.noGoal': 'Цель не привязана', 'projects.detail.areaLabel': 'Сфера', 'projects.detail.noArea': 'Сфера не привязана',
  'projects.detail.boardTitle': 'Доска',
  'projects.detail.section.backlog': 'Бэклог', 'projects.detail.section.next': 'Далее', 'projects.detail.section.waiting': 'Ожидание', 'projects.detail.section.scheduled': 'Запланировано', 'projects.detail.section.done': 'Готово',
  'projects.detail.moveTo': 'Переместить в «{section}»', 'projects.detail.emptySection': 'Здесь пусто',
  'projects.detail.waitingPromptTitle': 'Чего вы ждёте?', 'projects.detail.waitingPromptPlaceholder': 'например, ответа от поставщика', 'projects.detail.waitingPromptConfirm': 'Отметить как ожидание',
  'projects.review.cadenceLabel': 'Периодичность ревью', 'projects.review.cadence.none': 'Нет', 'projects.review.cadence.weekly': 'Еженедельно', 'projects.review.cadence.biweekly': 'Раз в 2 недели', 'projects.review.cadence.monthly': 'Ежемесячно',
  'projects.review.nextReviewLabel': 'Следующее ревью', 'projects.review.reviewNow': 'Провести ревью', 'projects.review.pendingBadge': 'на ревью: {n}',
  'projects.review.modalTitle': 'Ревью «{title}»', 'projects.review.modalHealthLabel': 'Как идут дела?', 'projects.review.modalOutcomeLabel': 'Результат всё ещё актуален?', 'projects.review.modalSave': 'Сохранить ревью',
  'areas.title': 'Сферы', 'areas.subtitle': 'Постоянные сферы ответственности без даты завершения — здоровье, дом, работа.',
  'areas.activeCount': 'Сфер: {n}', 'areas.namePlaceholder': 'Название сферы', 'areas.create': 'Создать сферу',
  'areas.nameRequired': 'Укажите название сферы.', 'areas.duplicateName': 'Сфера с таким названием уже существует.',
  'areas.emptyTitle': 'Сфер пока нет', 'areas.emptySubtitle': 'Сфера — постоянная ответственность без даты завершения, например «Здоровье» или «Дом». Для работы с результатом используйте Проекты, для целей — Цели.',
  'areas.archived': 'Архивные сферы', 'areas.archiveAction': 'В архив', 'areas.restoreAction': 'Вернуть', 'areas.edit': 'Редактировать сферу',
  'areas.nameLabel': 'Название', 'areas.colorLabel': 'Цвет', 'areas.colorOption': 'Цвет сферы {n}',
  'areas.notesLabel': 'Заметки', 'areas.notesPlaceholder': 'Что охватывает эта сфера?',
  'areas.projectCount': 'Проектов: {n}', 'areas.taskSummary': 'открыто: {open} · просрочено: {overdue}',
  'areas.noProjects': 'Пока нет привязанных проектов.', 'areas.openProject': 'Открыть проект «{title}»',
```

- [ ] **Step 3: Add Japanese keys**

Find the equivalent `ja` dictionary line:

```ts
  'projects.health.unknown': '不明', 'projects.health.on-track': '順調', 'projects.health.at-risk': 'リスクあり', 'projects.health.blocked': 'ブロック中',
```

Insert immediately after it (before `// ── Home (Today) ──`):

```ts
  'projects.activeReviewCount': '進行中 {n}件 · 見直し待ち {m}件',
  'projects.detail.back': 'プロジェクト', 'projects.detail.definitionOfDoneLabel': '完了の定義', 'projects.detail.definitionOfDonePlaceholder': '本当に完了したとどうすれば分かりますか？',
  'projects.detail.notesLabel': 'メモ', 'projects.detail.notesPlaceholder': '背景、リンク、決定事項など…',
  'projects.detail.goalLabel': 'ゴール', 'projects.detail.noGoal': 'ゴール未設定', 'projects.detail.areaLabel': 'エリア', 'projects.detail.noArea': 'エリア未設定',
  'projects.detail.boardTitle': 'ボード',
  'projects.detail.section.backlog': 'バックログ', 'projects.detail.section.next': '次に', 'projects.detail.section.waiting': '待機中', 'projects.detail.section.scheduled': '予定済み', 'projects.detail.section.done': '完了',
  'projects.detail.moveTo': '{section}に移動', 'projects.detail.emptySection': '空です',
  'projects.detail.waitingPromptTitle': '何を待っていますか？', 'projects.detail.waitingPromptPlaceholder': '例：業者からの返信', 'projects.detail.waitingPromptConfirm': '待機中にする',
  'projects.review.cadenceLabel': '見直しの頻度', 'projects.review.cadence.none': 'なし', 'projects.review.cadence.weekly': '毎週', 'projects.review.cadence.biweekly': '隔週', 'projects.review.cadence.monthly': '毎月',
  'projects.review.nextReviewLabel': '次の見直し', 'projects.review.reviewNow': '今すぐ見直す', 'projects.review.pendingBadge': '見直し待ち {n}件',
  'projects.review.modalTitle': '「{title}」の見直し', 'projects.review.modalHealthLabel': '進捗はどうですか？', 'projects.review.modalOutcomeLabel': '成果はまだ正確ですか？', 'projects.review.modalSave': '見直しを保存',
  'areas.title': 'エリア', 'areas.subtitle': '終わりのない継続的な責任範囲 — 健康、家庭、仕事など。',
  'areas.activeCount': 'エリア {n}件', 'areas.namePlaceholder': 'エリア名', 'areas.create': 'エリアを作成',
  'areas.nameRequired': 'エリア名を入力してください。', 'areas.duplicateName': '同じ名前のエリアがすでにあります。',
  'areas.emptyTitle': 'エリアはまだありません', 'areas.emptySubtitle': 'エリアは「健康」や「家庭」のように終わりのない継続的な責任です。成果のある作業にはプロジェクトを、成果志向の目標にはゴールを使ってください。',
  'areas.archived': 'アーカイブ済みエリア', 'areas.archiveAction': 'アーカイブ', 'areas.restoreAction': '復元', 'areas.edit': 'エリアを編集',
  'areas.nameLabel': '名前', 'areas.colorLabel': 'カラー', 'areas.colorOption': 'エリアカラー {n}',
  'areas.notesLabel': 'メモ', 'areas.notesPlaceholder': 'このエリアは何をカバーしますか？',
  'areas.projectCount': 'プロジェクト {n}件', 'areas.taskSummary': '未完了 {open}件 · 期限切れ {overdue}件',
  'areas.noProjects': 'まだプロジェクトが紐付いていません。', 'areas.openProject': 'プロジェクト「{title}」を開く',
```

- [ ] **Step 2 (repeat): Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (the `Dict = Record<string, string>` type accepts any string key, so this step primarily guards against a stray syntax typo like a missing comma).

- [ ] **Step 3: Commit**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): add areas and project detail/review translation keys (en/ru/ja)"
```

---

### Task 6: `AreasView` screen + Manager tile + routing

**Files:**
- Create: `src/components/AreasView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useStore` (`areas`, `projects`, `gtdTasks`, `addArea`, `updateArea`, `deleteArea`, `askConfirm`), `activeAreas`/`areaStats` from `../domain/areas`, `PROJECT_COLORS` from `../domain/projects`, `localDateKey` from `../domain/date`, `useT`/`useDateLocale` from `../i18n`.
- Produces: `export function AreasView({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (id: string) => void })` — `onOpenProject` is called when the user clicks a linked project inside an area card; `App.tsx` wires it to `setSelectedProjectId` (added in Task 8) plus switching `activeView` to `'projects'`.

- [ ] **Step 1: Create `AreasView.tsx`**

```tsx
import { useState } from 'react';
import { Archive, ChevronLeft, Folder, Layers, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { activeAreas, areaStats } from '../domain/areas';
import { PROJECT_COLORS } from '../domain/projects';
import { localDateKey } from '../domain/date';
import { useT } from '../i18n';
import { useStore } from '../store';
import type { Area } from '../types';

export function AreasView({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (id: string) => void }) {
  const t = useT();
  const { areas, projects, gtdTasks, addArea, updateArea, askConfirm } = useStore();
  const [title, setTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState(PROJECT_COLORS[0]);
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const today = localDateKey();

  const active = activeAreas(areas);
  const archived = areas.filter(area => !!area.archivedAt);

  const hasDuplicateTitle = (value: string, exceptId?: string) => areas.some(area => (
    area.id !== exceptId && area.title.toLocaleLowerCase() === value.toLocaleLowerCase()
  ));

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) { setCreateError(t('areas.nameRequired')); return; }
    if (hasDuplicateTitle(trimmed)) { setCreateError(t('areas.duplicateName')); return; }
    addArea(trimmed);
    setTitle('');
    setCreateError('');
  };

  const startEdit = (area: Area) => {
    setEditingId(area.id);
    setEditTitle(area.title);
    setEditColor(area.color);
    setEditNotes(area.notes || '');
    setEditError('');
  };
  const closeEdit = () => { setEditingId(null); setEditError(''); };
  const saveEdit = (area: Area) => {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditError(t('areas.nameRequired')); return; }
    if (hasDuplicateTitle(trimmed, area.id)) { setEditError(t('areas.duplicateName')); return; }
    updateArea(area.id, { title: trimmed, color: editColor, notes: editNotes });
    closeEdit();
  };

  const toggleArchive = (area: Area) => {
    if (area.archivedAt) { updateArea(area.id, { archivedAt: undefined }); return; }
    askConfirm({
      title: t('areas.archiveAction'),
      message: area.title,
      confirmLabel: t('areas.archiveAction'),
      onConfirm: () => updateArea(area.id, { archivedAt: new Date().toISOString() }),
    });
  };

  const renderArea = (area: Area) => {
    const stats = areaStats(area, projects, gtdTasks, today);
    const linkedProjects = projects.filter(project => project.areaId === area.id);
    const editing = editingId === area.id;
    return (
      <article key={area.id} className="tcard p-5 overflow-hidden" style={{ borderTop: `3px solid ${area.color}` }}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 text-[18px]" style={{ background: `${area.color}18`, color: area.color }}>
            {area.icon || <Layers className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-[var(--text)] truncate">{area.title}</h2>
            <p className="text-[11px] text-[var(--text-dim)] mt-1">{t('areas.projectCount', { n: stats.projectCount })} · {t('areas.taskSummary', { open: stats.openTaskCount, overdue: stats.overdueTaskCount })}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => editing ? closeEdit() : startEdit(area)}
              className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={editing ? t('common.cancel') : t('areas.edit')}
            >
              {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleArchive(area)}
              className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={area.archivedAt ? t('areas.restoreAction') : t('areas.archiveAction')}
            >
              {area.archivedAt ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={event => { event.preventDefault(); saveEdit(area); }} className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`area-title-${area.id}`}>{t('areas.nameLabel')}</label>
            <input
              id={`area-title-${area.id}`}
              value={editTitle}
              onChange={event => { setEditTitle(event.target.value); setEditError(''); }}
              className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor={`area-notes-${area.id}`}>{t('areas.notesLabel')}</label>
            <textarea
              id={`area-notes-${area.id}`}
              value={editNotes}
              onChange={event => setEditNotes(event.target.value)}
              rows={2}
              placeholder={t('areas.notesPlaceholder')}
              className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
            />
            <div className="mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('areas.colorLabel')}</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-105"
                    style={{ background: color, borderColor: editColor === color ? 'var(--text)' : 'transparent' }}
                    aria-label={t('areas.colorOption', { n: index + 1 })}
                    aria-pressed={editColor === color}
                  />
                ))}
              </div>
            </div>
            {editError && <p className="mt-2 text-[10px] text-red-500" role="alert">{editError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
              <button className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('common.save')}</button>
            </div>
          </form>
        ) : (
          <>
            {area.notes && <p className="mt-3 text-[12px] text-[var(--text-dim)]">{area.notes}</p>}
            <div className="mt-3 space-y-1.5">
              {linkedProjects.length > 0 ? linkedProjects.map(project => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="w-full min-h-9 rounded-xl px-2.5 flex items-center gap-2 text-left hover:bg-[var(--surface-2)]"
                  aria-label={t('areas.openProject', { title: project.title })}
                >
                  <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: project.color }} />
                  <span className="text-[12px] text-[var(--text)] truncate flex-1">{project.title}</span>
                </button>
              )) : (
                <p className="px-2.5 text-[11px] text-[var(--text-dim)]">{t('areas.noProjects')}</p>
              )}
            </div>
          </>
        )}
      </article>
    );
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-7 pb-32">
      <header className="anim-fade">
        <button onClick={onBack} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />{t('overview.manage')}
        </button>
        <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('areas.title')}</h1>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{t('areas.subtitle')}</p>
      </header>

      <form onSubmit={event => { event.preventDefault(); create(); }} className="tcard p-4 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <input
            value={title}
            onChange={event => { setTitle(event.target.value); setCreateError(''); }}
            placeholder={t('areas.namePlaceholder')}
            aria-label={t('areas.namePlaceholder')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[.99] transition-transform">
            <Plus className="w-4 h-4" />{t('areas.create')}
          </button>
        </div>
        {createError && <p className="mt-1 text-[10px] text-red-500" role="alert">{createError}</p>}
      </form>

      {active.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">{active.map(renderArea)}</section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
          <Layers className="w-10 h-10 mx-auto text-[var(--primary)]/30" />
          <h2 className="mt-3 text-[15px] font-bold text-[var(--text)]">{t('areas.emptyTitle')}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">{t('areas.emptySubtitle')}</p>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{t('areas.archived')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-75">{archived.map(renderArea)}</div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the lazy import**

In `src/App.tsx`, find:

```ts
const ProjectsView = lazy(() => import('./components/ProjectsView').then(module => ({ default: module.ProjectsView })));
```

Add right after it:

```ts
const AreasView = lazy(() => import('./components/AreasView').then(module => ({ default: module.AreasView })));
```

- [ ] **Step 3: Add the `'areas'` route**

Find:

```tsx
{activeView==='projects'&&<ProjectsView onBack={()=>{store.setActiveView('manager');setSelectedGoalId(null);setOverviewChild(false);}}/>}
```

Add right after it:

```tsx
{activeView==='areas'&&<AreasView onBack={()=>{store.setActiveView('manager');setSelectedGoalId(null);setOverviewChild(false);}} onOpenProject={(id)=>{setSelectedProjectId(id);store.setActiveView('projects');}}/>}
```

(`setSelectedProjectId` is introduced in Task 8 — this line will not type-check until that task lands; that's expected and acceptable since both tasks touch `App.tsx` and are executed in sequence within the same plan run. If executing tasks out of order or in isolation, land Task 8's `selectedProjectId` state first.)

- [ ] **Step 4: Add the `Layers` icon import and the Manager tile**

In `src/App.tsx`, extend the lucide-react import line to add `Layers`:

```ts
import { Calendar,Target,Clock,Plus,CheckCircle2,Circle,X,ChevronRight,ChevronLeft,Sparkles,AlertCircle,MapPin,Link as LinkIcon,Bell,RotateCcw,Repeat2,Edit2,Home as HomeIcon,User as UserIcon,Inbox,Archive,Flame,Timer,Wand2,Search as SearchIcon,Mic,Settings as SettingsIcon,LayoutGrid,BarChart3,Folder,Layers } from 'lucide-react';
```

In the Manager tiles array, find:

```tsx
    {id:'projects',Ic:Folder,c:'#8b5cf6',label:t('projects.title'),sub:t('projects.activeCount',{n:projects.filter(project=>project.status==='active').length})},
    {id:'goals',Ic:Target,c:'#6467f2',label:t('bottomNav.goals'),sub:`${activeGoals.length} ${t('overview.activeGoalsSub')}`},
```

Add an Areas tile right after the Projects tile:

```tsx
    {id:'projects',Ic:Folder,c:'#8b5cf6',label:t('projects.title'),sub:t('projects.activeCount',{n:projects.filter(project=>project.status==='active').length})},
    {id:'areas',Ic:Layers,c:'#0d9488',label:t('areas.title'),sub:t('areas.activeCount',{n:store.areas.filter(area=>!area.archivedAt).length})},
    {id:'goals',Ic:Target,c:'#6467f2',label:t('bottomNav.goals'),sub:`${activeGoals.length} ${t('overview.activeGoalsSub')}`},
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only about `setSelectedProjectId` not existing yet (from Step 3) — resolved once Task 8 lands. If Task 8 is not yet implemented, this is the expected, documented state; do not attempt to work around it.

- [ ] **Step 6: Manual verification (after Task 8 lands)**

Run: `npm run dev`, open the app, go to Manage → Areas, create an area, edit it, archive/restore it. Confirm the empty state renders when no areas exist.

- [ ] **Step 7: Commit**

```bash
git add src/components/AreasView.tsx src/App.tsx
git commit -m "feat(areas): add Areas screen with CRUD and Manager tile"
```

---

### Task 7: `ProjectSectionBoard` component

**Files:**
- Create: `src/components/ProjectSectionBoard.tsx`

**Interfaces:**
- Consumes: `deriveProjectSection`, `ProjectSection` from `../domain/projects`; `GTDTask` from `../types`; `parseTaskCapture` from `../utils/taskCapture`.
- Produces: `export function ProjectSectionBoard({ tasks, accentColor, onMoveTask, onQuickAdd, onOpenTask }: ProjectSectionBoardProps)` where:
  ```ts
  interface ProjectSectionBoardProps {
    tasks: GTDTask[];                                                          // already filtered to one project, excludes trash
    accentColor: string;
    onMoveTask: (taskId: string, section: ProjectSection, blockingReason?: string) => void;
    onQuickAdd: (section: 'backlog' | 'next' | 'scheduled', title: string) => void;
    onOpenTask: (taskId: string) => void;
  }
  ```

- [ ] **Step 1: Create `ProjectSectionBoard.tsx`**

```tsx
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { deriveProjectSection } from '../domain/projects';
import type { ProjectSection } from '../domain/projects';
import { useDateLocale, useT } from '../i18n';
import type { GTDTask } from '../types';

interface ProjectSectionBoardProps {
  tasks: GTDTask[];
  accentColor: string;
  onMoveTask: (taskId: string, section: ProjectSection, blockingReason?: string) => void;
  onQuickAdd: (section: 'backlog' | 'next' | 'scheduled', title: string) => void;
  onOpenTask: (taskId: string) => void;
}

const SECTIONS: ProjectSection[] = ['backlog', 'next', 'waiting', 'scheduled', 'done'];
const QUICK_ADD_SECTIONS = new Set<ProjectSection>(['backlog', 'next', 'scheduled']);

const actionableDate = (task: GTDTask) => task.scheduledDate || task.dueDate || '';

export function ProjectSectionBoard({ tasks, accentColor, onMoveTask, onQuickAdd, onOpenTask }: ProjectSectionBoardProps) {
  const t = useT();
  const locale = useDateLocale();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [waitingPromptTaskId, setWaitingPromptTaskId] = useState<string | null>(null);
  const [waitingReason, setWaitingReason] = useState('');
  const [quickAddValue, setQuickAddValue] = useState<Record<string, string>>({});

  const byColumn = new Map<ProjectSection, GTDTask[]>(SECTIONS.map(section => [section, []]));
  for (const task of tasks) byColumn.get(deriveProjectSection(task))!.push(task);

  const requestMove = (taskId: string, section: ProjectSection) => {
    if (section === 'waiting') {
      setWaitingPromptTaskId(taskId);
      setWaitingReason('');
      return;
    }
    onMoveTask(taskId, section);
  };

  const confirmWaiting = () => {
    const reason = waitingReason.trim();
    if (!reason || !waitingPromptTaskId) return;
    onMoveTask(waitingPromptTaskId, 'waiting', reason);
    setWaitingPromptTaskId(null);
    setWaitingReason('');
  };

  const submitQuickAdd = (section: 'backlog' | 'next' | 'scheduled') => {
    const value = (quickAddValue[section] || '').trim();
    if (!value) return;
    onQuickAdd(section, value);
    setQuickAddValue(current => ({ ...current, [section]: '' }));
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {SECTIONS.map(section => (
          <div
            key={section}
            onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); if (draggedId) requestMove(draggedId, section); }}
            className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-2.5 min-h-[140px]"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] px-1 mb-2">{t(`projects.detail.section.${section}`)} · {byColumn.get(section)!.length}</p>
            <div className="space-y-1.5">
              {byColumn.get(section)!.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={() => setDraggedId(null)}
                  className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-2 cursor-grab active:cursor-grabbing"
                >
                  <button type="button" onClick={() => onOpenTask(task.id)} className="w-full text-left text-[12px] text-[var(--text)] truncate">{task.title}</button>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    {actionableDate(task) ? (
                      <span className="text-[9px] text-[var(--text-dim)]">{format(parseISO(actionableDate(task)), 'MMM d', { locale })}</span>
                    ) : <span />}
                    <select
                      value={section}
                      onChange={event => requestMove(task.id, event.target.value as ProjectSection)}
                      aria-label={t('projects.detail.moveTo', { section: t(`projects.detail.section.${section}`) })}
                      className="h-6 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[9px] text-[var(--text-dim)] px-1 sm:hidden"
                    >
                      {SECTIONS.map(option => <option key={option} value={option}>{t(`projects.detail.section.${option}`)}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {byColumn.get(section)!.length === 0 && (
                <p className="px-1 text-[10px] text-[var(--text-dim)]">{t('projects.detail.emptySection')}</p>
              )}
            </div>
            {QUICK_ADD_SECTIONS.has(section) && (
              <form
                onSubmit={event => { event.preventDefault(); submitQuickAdd(section as 'backlog' | 'next' | 'scheduled'); }}
                className="mt-2 flex gap-1"
              >
                <input
                  value={quickAddValue[section] || ''}
                  onChange={event => setQuickAddValue(current => ({ ...current, [section]: event.target.value }))}
                  placeholder={t('projects.quickAddPlaceholder')}
                  aria-label={t('projects.quickAddPlaceholder')}
                  className="h-8 min-w-0 flex-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 text-[11px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  disabled={!(quickAddValue[section] || '').trim()}
                  aria-label={t('projects.addTask')}
                  className="hit w-8 h-8 rounded-lg grid place-items-center text-white disabled:opacity-40"
                  style={{ background: accentColor }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {waitingPromptTaskId && (
        <div className="mt-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
          <p className="text-[11px] font-bold text-[var(--text)]">{t('projects.detail.waitingPromptTitle')}</p>
          <form onSubmit={event => { event.preventDefault(); confirmWaiting(); }} className="mt-2 flex gap-2">
            <input
              value={waitingReason}
              onChange={event => setWaitingReason(event.target.value)}
              placeholder={t('projects.detail.waitingPromptPlaceholder')}
              aria-label={t('projects.detail.waitingPromptTitle')}
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
            />
            <button type="button" onClick={() => setWaitingPromptTaskId(null)} className="h-9 px-3 rounded-xl text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
            <button disabled={!waitingReason.trim()} className="h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-[11px] font-bold disabled:opacity-40">{t('projects.detail.waitingPromptConfirm')}</button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `ProjectSectionBoard.tsx` (it isn't imported anywhere yet, so this only checks the file compiles standalone-correctly given its own imports).

- [ ] **Step 3: Commit**

```bash
git add src/components/ProjectSectionBoard.tsx
git commit -m "feat(projects): add ProjectSectionBoard — 5-column status board with drag-and-drop"
```

---

### Task 8: `ProjectDetailView` screen + navigation wiring

**Files:**
- Create: `src/components/ProjectDetailView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ProjectSectionBoard` (Task 7), `PROJECT_COLORS`/`deriveProjectHealth`/`nextReviewDateAfter` (Task 1), `parseTaskCapture` from `../utils/taskCapture`, `localDateKey` from `../domain/date`, `useStore`.
- Produces: `export function ProjectDetailView({ project, onBack }: { project: Project; onBack: () => void })`. `App.tsx` gains local state `selectedProjectId: string | null` (mirrors `selectedGoalId`), consumed by both this task and Task 6's `AreasView` wiring.

- [ ] **Step 1: Create `ProjectDetailView.tsx`**

```tsx
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Archive, ArrowLeft, CalendarDays, Pencil, RotateCcw, X,
} from 'lucide-react';
import { PROJECT_COLORS, nextReviewDateAfter, deriveProjectHealth } from '../domain/projects';
import { localDateKey } from '../domain/date';
import { useDateLocale, useT } from '../i18n';
import { useStore } from '../store';
import type { Project, ProjectHealth, ProjectReviewCadence, ProjectStatus } from '../types';
import type { ProjectSection } from '../domain/projects';
import { ProjectSectionBoard } from './ProjectSectionBoard';
import { parseTaskCapture } from '../utils/taskCapture';

const PROJECT_STATUSES: ProjectStatus[] = ['idea', 'planned', 'active', 'waiting', 'paused', 'completed', 'canceled'];
const PROJECT_HEALTHS: ProjectHealth[] = ['unknown', 'on-track', 'at-risk', 'blocked'];
const REVIEW_CADENCES: ProjectReviewCadence[] = ['none', 'weekly', 'biweekly', 'monthly'];

const SECTION_STATUS: Record<Exclude<ProjectSection, 'waiting'>, 'someday-maybe' | 'next-action' | 'scheduled' | 'done'> = {
  backlog: 'someday-maybe', next: 'next-action', scheduled: 'scheduled', done: 'done',
};

export function ProjectDetailView({ project, onBack }: { project: Project; onBack: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const {
    gtdTasks, goals, areas, updateProject, captureTask, updateTask, processTask, openEditTask, setActiveView, askConfirm,
  } = useStore();
  const today = localDateKey();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editOutcome, setEditOutcome] = useState(project.outcome);
  const [editDefinitionOfDone, setEditDefinitionOfDone] = useState(project.definitionOfDone || '');
  const [editNotes, setEditNotes] = useState(project.notes || '');
  const [editStatus, setEditStatus] = useState<ProjectStatus>(project.status === 'archived' ? 'active' : project.status);
  const [editHealth, setEditHealth] = useState<ProjectHealth>(project.health || 'unknown');
  const [editTargetDate, setEditTargetDate] = useState(project.targetDate || '');
  const [editDeadline, setEditDeadline] = useState(project.deadline || '');
  const [editColor, setEditColor] = useState(project.color);
  const [editGoalId, setEditGoalId] = useState(project.goalId || '');
  const [editAreaId, setEditAreaId] = useState(project.areaId || '');
  const [editReviewCadence, setEditReviewCadence] = useState<ProjectReviewCadence>(project.reviewCadence || 'none');
  const [editNextReviewDate, setEditNextReviewDate] = useState(project.nextReviewDate || '');
  const [editError, setEditError] = useState('');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewHealth, setReviewHealth] = useState<ProjectHealth>(project.health || 'unknown');
  const [reviewOutcome, setReviewOutcome] = useState(project.outcome);

  const tasks = gtdTasks.filter(task => task.projectId === project.id && task.status !== 'trash' && !task.isArchived);
  const done = tasks.filter(task => task.status === 'done');
  const progress = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const displayHealth = deriveProjectHealth(project, tasks, today);
  const isStoredAway = project.status === 'archived' || project.status === 'completed' || project.status === 'canceled';
  const goal = project.goalId ? goals.find(g => g.id === project.goalId) : undefined;
  const area = project.areaId ? areas.find(a => a.id === project.areaId) : undefined;

  const startEdit = () => {
    setEditTitle(project.title);
    setEditOutcome(project.outcome);
    setEditDefinitionOfDone(project.definitionOfDone || '');
    setEditNotes(project.notes || '');
    setEditStatus(project.status === 'archived' ? 'active' : project.status);
    setEditHealth(project.health || 'unknown');
    setEditTargetDate(project.targetDate || '');
    setEditDeadline(project.deadline || '');
    setEditColor(project.color);
    setEditGoalId(project.goalId || '');
    setEditAreaId(project.areaId || '');
    setEditReviewCadence(project.reviewCadence || 'none');
    setEditNextReviewDate(project.nextReviewDate || '');
    setEditError('');
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditError(t('projects.nameRequired')); return; }
    const trimmedOutcome = editOutcome.trim();
    if (!trimmedOutcome) { setEditError(t('projects.outcomeRequired')); return; }
    updateProject(project.id, {
      title: trimmed,
      outcome: trimmedOutcome,
      definitionOfDone: editDefinitionOfDone,
      notes: editNotes,
      status: editStatus,
      health: editHealth,
      targetDate: editTargetDate || undefined,
      deadline: editDeadline || undefined,
      color: editColor,
      goalId: editGoalId,
      areaId: editAreaId,
      reviewCadence: editReviewCadence,
      nextReviewDate: editNextReviewDate || undefined,
    });
    setEditing(false);
  };

  const toggleArchive = () => {
    if (isStoredAway) { updateProject(project.id, { status: 'active' }); return; }
    askConfirm({
      title: t('projects.archiveConfirmTitle', { title: project.title }),
      message: t('projects.archiveConfirmMessage', { n: tasks.filter(task => task.status !== 'done').length }),
      confirmLabel: t('projects.archiveAction'),
      onConfirm: () => updateProject(project.id, { status: 'archived' }),
    });
  };

  const submitReview = () => {
    const next = editReviewCadenceForReview();
    updateProject(project.id, { health: reviewHealth, outcome: reviewOutcome.trim() || project.outcome, ...(next ? { nextReviewDate: next } : {}) });
    setReviewOpen(false);
  };
  function editReviewCadenceForReview() {
    return project.reviewCadence && project.reviewCadence !== 'none' ? nextReviewDateAfter(project.reviewCadence, today) : undefined;
  }

  const openTask = (taskId: string) => { setActiveView('inbox'); openEditTask(taskId); };

  const onMoveTask = (taskId: string, section: ProjectSection, blockingReason?: string) => {
    if (section === 'waiting') { updateTask(taskId, { blockingReason: blockingReason || '' }); return; }
    updateTask(taskId, { blockingReason: undefined });
    processTask(taskId, SECTION_STATUS[section]);
  };

  const onQuickAdd = (section: 'backlog' | 'next' | 'scheduled', input: string) => {
    const parsed = parseTaskCapture(input);
    const taskId = captureTask(parsed.title, parsed.durationMinutes);
    updateTask(taskId, {
      projectId: project.id,
      status: SECTION_STATUS[section],
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.context ? { context: parsed.context } : {}),
      ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.remindAt ? { remindAt: parsed.remindAt } : {}),
      ...(parsed.recurring ? { recurring: parsed.recurring } : {}),
    });
  };

  const healthClass = displayHealth === 'blocked'
    ? 'bg-red-500/10 text-red-500'
    : displayHealth === 'at-risk'
      ? 'bg-amber-500/10 text-amber-600'
      : displayHealth === 'on-track'
        ? 'bg-emerald-500/10 text-emerald-600'
        : 'bg-[var(--surface-2)] text-[var(--text-dim)]';

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-5 pb-32">
      <button onClick={onBack} className="hit h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
        <ArrowLeft className="w-4 h-4" />{t('projects.detail.back')}
      </button>

      <div className="tcard p-5" style={{ borderTop: `3px solid ${project.color}` }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[22px] font-bold text-[var(--text)] truncate">{project.title}</h1>
              <span className={`h-5 px-2 rounded-full text-[9px] font-bold ${healthClass}`}>{t(`projects.health.${displayHealth}`)}</span>
              <span className="h-5 px-2 rounded-full bg-[var(--surface-2)] text-[var(--text-dim)] text-[9px] font-bold">{t(`projects.status.${project.status}`)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => editing ? setEditing(false) : startEdit()} className="hit w-9 h-9 rounded-xl grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label={editing ? t('common.cancel') : t('projects.edit')}>
              {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button type="button" onClick={toggleArchive} className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              {!isStoredAway ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              <span className="hidden sm:inline">{!isStoredAway ? t('projects.archiveAction') : t('projects.restoreAction')}</span>
            </button>
          </div>
        </div>

        {editing ? (
          <form onSubmit={event => { event.preventDefault(); saveEdit(); }} className="mt-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-title">{t('projects.nameLabel')}</label>
              <input id="pd-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-outcome">{t('projects.outcomeLabel')}</label>
              <textarea id="pd-outcome" value={editOutcome} onChange={event => setEditOutcome(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-dod">{t('projects.detail.definitionOfDoneLabel')}</label>
              <textarea id="pd-dod" value={editDefinitionOfDone} onChange={event => setEditDefinitionOfDone(event.target.value)} rows={2} placeholder={t('projects.detail.definitionOfDonePlaceholder')} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]" htmlFor="pd-notes">{t('projects.detail.notesLabel')}</label>
              <textarea id="pd-notes" value={editNotes} onChange={event => setEditNotes(event.target.value)} rows={3} placeholder={t('projects.detail.notesPlaceholder')} className="mt-1.5 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.statusLabel')}
                <select value={editStatus} onChange={event => setEditStatus(event.target.value as ProjectStatus)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_STATUSES.map(status => <option key={status} value={status}>{t(`projects.status.${status}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.healthLabel')}
                <select value={editHealth} onChange={event => setEditHealth(event.target.value as ProjectHealth)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {PROJECT_HEALTHS.map(health => <option key={health} value={health}>{t(`projects.health.${health}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.targetLabel')}
                <input type="date" value={editTargetDate} onChange={event => setEditTargetDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.deadlineLabel')}
                <input type="date" value={editDeadline} onChange={event => setEditDeadline(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.detail.goalLabel')}
                <select value={editGoalId} onChange={event => setEditGoalId(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  <option value="">{t('projects.detail.noGoal')}</option>
                  {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.detail.areaLabel')}
                <select value={editAreaId} onChange={event => setEditAreaId(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  <option value="">{t('projects.detail.noArea')}</option>
                  {areas.filter(a => !a.archivedAt).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.cadenceLabel')}
                <select value={editReviewCadence} onChange={event => setEditReviewCadence(event.target.value as ProjectReviewCadence)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                  {REVIEW_CADENCES.map(cadence => <option key={cadence} value={cadence}>{t(`projects.review.cadence.${cadence}`)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.nextReviewLabel')}
                <input type="date" value={editNextReviewDate} onChange={event => setEditNextReviewDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
              </label>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.colorLabel')}</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color, index) => (
                  <button key={color} type="button" onClick={() => setEditColor(color)} className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-105" style={{ background: color, borderColor: editColor === color ? 'var(--text)' : 'transparent' }} aria-label={t('projects.colorOption', { n: index + 1 })} aria-pressed={editColor === color} />
                ))}
              </div>
            </div>
            {editError && <p className="text-[10px] text-red-500" role="alert">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface)]">{t('common.cancel')}</button>
              <button className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('common.save')}</button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.outcomeLabel')}</p>
              <p className="text-[13px] text-[var(--text)]">{project.outcome || t('projects.outcomeMissing')}</p>
              {project.definitionOfDone && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mt-2">{t('projects.detail.definitionOfDoneLabel')}</p>
                  <p className="text-[13px] text-[var(--text)]">{project.definitionOfDone}</p>
                </>
              )}
              {project.notes && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] mt-2">{t('projects.detail.notesLabel')}</p>
                  <p className="text-[13px] text-[var(--text)] whitespace-pre-wrap">{project.notes}</p>
                </>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.targetDate && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{t('projects.target', { date: format(parseISO(project.targetDate), 'MMM d', { locale }) })}</span>}
                {project.deadline && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{t('projects.deadline', { date: format(parseISO(project.deadline), 'MMM d', { locale }) })}</span>}
                <button type="button" onClick={() => goal && setActiveView('goals')} disabled={!goal} className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold disabled:opacity-60">{t('projects.detail.goalLabel')}: {goal?.title || t('projects.detail.noGoal')}</button>
                <button type="button" onClick={() => setActiveView('areas')} className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold">{t('projects.detail.areaLabel')}: {area?.title || t('projects.detail.noArea')}</button>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.cadenceLabel')}</p>
                  <p className="text-[12px] text-[var(--text)] mt-0.5">{t(`projects.review.cadence.${project.reviewCadence || 'none'}`)}{project.nextReviewDate ? ` · ${t('projects.review.nextReviewLabel')}: ${format(parseISO(project.nextReviewDate), 'MMM d', { locale })}` : ''}</p>
                </div>
                <button type="button" onClick={() => { setReviewHealth(project.health || 'unknown'); setReviewOutcome(project.outcome); setReviewOpen(true); }} className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('projects.review.reviewNow')}</button>
              </div>
              {reviewOpen && (
                <div className="mt-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3 space-y-2">
                  <p className="text-[12px] font-bold text-[var(--text)]">{t('projects.review.modalTitle', { title: project.title })}</p>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.modalHealthLabel')}
                    <select value={reviewHealth} onChange={event => setReviewHealth(event.target.value as ProjectHealth)} className="mt-1.5 h-9 w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]">
                      {PROJECT_HEALTHS.map(health => <option key={health} value={health}>{t(`projects.health.${health}`)}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.review.modalOutcomeLabel')}
                    <textarea value={reviewOutcome} onChange={event => setReviewOutcome(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setReviewOpen(false)} className="h-8 px-3 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{t('common.cancel')}</button>
                    <button type="button" onClick={submitReview} className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold">{t('projects.review.modalSave')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)]">
            <span>{t('projects.progress', { n: progress })}</span>
            <span>{t('projects.doneCount', { done: done.length, total: tasks.length })}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: project.color }} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-bold text-[var(--text)] mb-3">{t('projects.detail.boardTitle')}</h2>
        <ProjectSectionBoard tasks={tasks} accentColor={project.color} onMoveTask={onMoveTask} onQuickAdd={onQuickAdd} onOpenTask={openTask} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `selectedProjectId` navigation in `App.tsx`**

Find:

```ts
const[selectedGoalId,setSelectedGoalId]=useState<string|null>(null);
```

Add right after it:

```ts
const[selectedProjectId,setSelectedProjectId]=useState<string|null>(null);
```

Add the `ProjectDetailView` lazy import right after the `ProjectsView` one:

```ts
const ProjectsView = lazy(() => import('./components/ProjectsView').then(module => ({ default: module.ProjectsView })));
const ProjectDetailView = lazy(() => import('./components/ProjectDetailView').then(module => ({ default: module.ProjectDetailView })));
```

Replace the original `'projects'` route (the one used as an anchor in Task 6, Step 3 — that step only added a new line *after* it, so this edit is unaffected by Task 6) with the goal-detail-style branch:

```tsx
{activeView==='projects'&&(()=>{
  const selectedProject = selectedProjectId ? projects.find(p=>p.id===selectedProjectId) : null;
  if (selectedProject) return <ProjectDetailView project={selectedProject} onBack={()=>setSelectedProjectId(null)}/>;
  return <ProjectsView onBack={()=>{store.setActiveView('manager');setSelectedGoalId(null);setOverviewChild(false);}} onOpenProject={(id)=>setSelectedProjectId(id)}/>;
})()}
```

(`ProjectsView`'s `onOpenProject` prop is added in Task 9 — until then, pass it as an unused prop; `ProjectsView` will not yet call it, which is harmless.)

Also update the Areas route added in Task 6 to reset `selectedProjectId` before switching view, and the Manager tile navigation so leaving the Projects tile clears any lingering selection — find every `setSelectedGoalId(null)` call that also resets `activeView` away from `'projects'`/`'goals'` in the tile/back-button handlers used for Manager and top-nav, and add `setSelectedProjectId(null)` alongside it. Concretely, update these three spots:

```tsx
              <button key={id} onClick={()=>{store.setActiveView(id);setSelectedGoalId(null);setSelectedProjectId(null);setOverviewChild(false);}}
```
(both occurrences — top tab bar around line 448 and bottom nav around line 897)

```tsx
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{tiles.map((ti,i)=><motion.button {...listItem(i)} key={ti.id} onClick={()=>ti.onClick?ti.onClick():(()=>{store.setActiveView(ti.id as AppView);setSelectedGoalId(null);setSelectedProjectId(null);setOverviewChild(false);})()} className="tcard lift min-h-[116px] p-5 text-left flex items-center gap-4">
```
(the Manager tile grid)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `ProjectsView`'s `onOpenProject` prop doesn't exist yet (Task 9 not done), this line will error — that's expected until Task 9 lands; if executing tasks in order this is a non-issue since Task 9 comes next.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Go to Manage → Projects, click into a project (once Task 9 wires the click), verify: edit form saves all fields including goal/area/review cadence; "Review now" updates health/outcome and bumps `nextReviewDate`; the board shows tasks in the correct columns; dragging a card between columns updates it; dropping onto Waiting prompts for a reason and the task reappears in Waiting; quick-add in Backlog/Next/Scheduled creates a task with the right status.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectDetailView.tsx src/App.tsx
git commit -m "feat(projects): add ProjectDetailView with brief, review controls, and board"
```

---

### Task 9: Simplify `ProjectsView`, add review badge, wire detail navigation

**Files:**
- Modify: `src/components/ProjectsView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `projectsNeedingReview` from `../domain/projects`, `localDateKey` from `../domain/date`.
- Produces: `ProjectsView` gains an `onOpenProject: (id: string) => void` prop (called when a card is clicked); card click opens detail instead of inline edit; inline edit form and its local state (`editingId`, `editTitle`, `editOutcome`, `editStatus`, `editHealth`, `editTargetDate`, `editDeadline`, `editColor`, `editError`) are removed.

- [ ] **Step 1: Rewrite `ProjectsView.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Folder,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { localDateKey } from '../domain/date';
import { deriveProjectHealth, projectsNeedingReview } from '../domain/projects';
import { useDateLocale, useT } from '../i18n';
import { useStore } from '../store';
import type { GTDTask, Project, ProjectStatus } from '../types';
import { parseTaskCapture } from '../utils/taskCapture';

const WORK_VISIBLE_STATUSES = new Set<ProjectStatus>(['idea', 'planned', 'active', 'waiting', 'paused']);

const actionableDate = (task: GTDTask) => task.scheduledDate || task.dueDate || '';

export function ProjectsView({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (id: string) => void }) {
  const t = useT();
  const locale = useDateLocale();
  const {
    projects,
    gtdTasks,
    addProject,
    updateProject,
    captureTask,
    updateTask,
    openEditTask,
    setActiveView,
    askConfirm,
  } = useStore();
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [createError, setCreateError] = useState('');
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const active = projects.filter(project => WORK_VISIBLE_STATUSES.has(project.status));
  const archived = projects.filter(project => project.status === 'archived' || project.status === 'completed' || project.status === 'canceled');
  const today = localDateKey();
  const pendingReview = projectsNeedingReview(projects, today);

  const hasDuplicateTitle = (value: string, exceptId?: string) => projects.some(project => (
    project.id !== exceptId && project.title.toLocaleLowerCase() === value.toLocaleLowerCase()
  ));

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError(t('projects.nameRequired'));
      return;
    }
    const trimmedOutcome = outcome.trim();
    if (!trimmedOutcome) {
      setCreateError(t('projects.outcomeRequired'));
      return;
    }
    if (hasDuplicateTitle(trimmed)) {
      setCreateError(t('projects.duplicateName'));
      return;
    }
    addProject(trimmed, { outcome: trimmedOutcome, targetDate: targetDate || undefined });
    setTitle('');
    setOutcome('');
    setTargetDate('');
    setCreateError('');
  };

  const addTask = (projectId: string) => {
    const input = taskTitles[projectId]?.trim();
    if (!input) return;
    const parsed = parseTaskCapture(input);
    const taskId = captureTask(parsed.title, parsed.durationMinutes);
    updateTask(taskId, {
      projectId,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.context ? { context: parsed.context } : {}),
      ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
      ...(parsed.remindAt ? { remindAt: parsed.remindAt } : {}),
      ...(parsed.recurring ? { recurring: parsed.recurring } : {}),
    });
    setTaskTitles(current => ({ ...current, [projectId]: '' }));
  };

  const openTask = (taskId: string) => {
    setActiveView('inbox');
    openEditTask(taskId);
  };

  const renderProject = (project: Project) => {
    const tasks = gtdTasks.filter(task => task.projectId === project.id && task.status !== 'trash');
    const open = tasks
      .filter(task => task.status !== 'done' && !task.isArchived)
      .sort((a, b) => {
        const dateOrder = (actionableDate(a) || '9999').localeCompare(actionableDate(b) || '9999');
        return dateOrder || a.priority - b.priority || b.createdAt.localeCompare(a.createdAt);
      });
    const done = tasks.filter(task => task.status === 'done');
    const trackedTotal = open.length + done.length;
    const progress = trackedTotal ? Math.round((done.length / trackedTotal) * 100) : 0;
    const overdue = open.filter(task => !!task.dueDate && task.dueDate < today).length;
    const dueToday = open.filter(task => actionableDate(task) === today).length;
    const nextDate = open.map(actionableDate).filter(date => date > today).sort()[0];
    const nextAction = open.find(task => task.status === 'next-action') || open[0];
    const target = project.deadline || project.targetDate;
    const isStoredAway = project.status === 'archived' || project.status === 'completed' || project.status === 'canceled';
    const displayHealth = deriveProjectHealth(project, tasks, today);
    const healthClass = displayHealth === 'blocked'
      ? 'bg-red-500/10 text-red-500'
      : displayHealth === 'at-risk'
        ? 'bg-amber-500/10 text-amber-600'
        : displayHealth === 'on-track'
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-[var(--surface-2)] text-[var(--text-dim)]';

    const changeStatus = () => {
      if (isStoredAway) {
        updateProject(project.id, { status: 'active' });
        return;
      }
      if (open.length === 0) {
        updateProject(project.id, { status: 'archived' });
        return;
      }
      askConfirm({
        title: t('projects.archiveConfirmTitle', { title: project.title }),
        message: t('projects.archiveConfirmMessage', { n: open.length }),
        confirmLabel: t('projects.archiveAction'),
        onConfirm: () => updateProject(project.id, { status: 'archived' }),
      });
    };
    const actionLabel = isStoredAway ? t('projects.restore') : t('projects.archive');

    return (
      <article key={project.id} className="tcard p-5 overflow-hidden" style={{ borderTop: `3px solid ${project.color}` }}>
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => onOpenProject(project.id)} className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: `${project.color}18`, color: project.color }} aria-label={t('projects.edit')}>
            <Folder className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => onOpenProject(project.id)} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[15px] font-bold text-[var(--text)] truncate">{project.title}</h2>
              <span className={`h-5 px-2 rounded-full text-[9px] font-bold ${healthClass}`}>{t(`projects.health.${displayHealth}`)}</span>
            </div>
            <p className="text-[11px] text-[var(--text-dim)] mt-1">{t('projects.taskSummary', { open: open.length, total: trackedTotal })}</p>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={changeStatus}
              className="hit h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              aria-label={actionLabel}
              title={actionLabel}
            >
              {!isStoredAway ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              <span className="hidden sm:inline">{!isStoredAway ? t('projects.archiveAction') : t('projects.restoreAction')}</span>
            </button>
          </div>
        </div>

        <button type="button" onClick={() => onOpenProject(project.id)} className="mt-4 w-full text-left rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-2 hover:border-[var(--primary)]/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.outcomeLabel')}</p>
          <p className="text-[13px] text-[var(--text)]">{project.outcome || t('projects.outcomeMissing')}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1">{t(`projects.status.${project.status}`)}</span>
            {target && <span className="h-7 px-2 rounded-lg bg-[var(--surface)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1"><CalendarDays className="w-3 h-3" />{project.deadline ? t('projects.deadline', { date: format(parseISO(project.deadline), 'MMM d', { locale }) }) : t('projects.target', { date: format(parseISO(project.targetDate!), 'MMM d', { locale }) })}</span>}
          </div>
        </button>
        {nextAction && <button type="button" onClick={() => openTask(nextAction.id)} className="mt-2 w-full rounded-xl bg-[var(--surface-2)] px-3 py-2 text-left text-[12px] text-[var(--text)] hover:bg-[var(--surface-3)]"><span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">{t('projects.nextAction')}</span>{nextAction.title}</button>}

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)]">
            <span>{t('projects.progress', { n: progress })}</span>
            <span>{t('projects.doneCount', { done: done.length, total: trackedTotal })}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${progress}%`, background: project.color }} />
          </div>
        </div>

        {(overdue > 0 || dueToday > 0 || nextDate) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {overdue > 0 && (
              <span className="h-7 px-2 rounded-lg bg-red-500/10 text-red-500 text-[10px] font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{t('projects.overdueCount', { n: overdue })}
              </span>
            )}
            {dueToday > 0 && (
              <span className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-600 text-[10px] font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />{t('projects.todayCount', { n: dueToday })}
              </span>
            )}
            {nextDate && (
              <span className="h-7 px-2 rounded-lg bg-[var(--surface-2)] text-[var(--text-dim)] text-[10px] font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />{t('projects.nextDate', { date: format(parseISO(nextDate), 'MMM d', { locale }) })}
              </span>
            )}
          </div>
        )}

        {!isStoredAway && (
          <form onSubmit={event => { event.preventDefault(); addTask(project.id); }} className="mt-4 flex gap-2">
            <input
              value={taskTitles[project.id] || ''}
              onChange={event => setTaskTitles(current => ({ ...current, [project.id]: event.target.value }))}
              placeholder={t('projects.quickAddPlaceholder')}
              aria-label={t('projects.quickAddPlaceholder')}
              className="h-9 min-w-0 flex-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--primary)]"
            />
            <button
              disabled={!taskTitles[project.id]?.trim()}
              className="hit w-9 h-9 rounded-xl grid place-items-center text-white disabled:opacity-40"
              style={{ background: project.color }}
              aria-label={t('projects.addTask')}
              title={t('projects.addTask')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        )}

        {open.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {open.slice(0, 4).map(task => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task.id)}
                className="w-full min-h-9 rounded-xl px-2.5 flex items-center gap-2 text-left hover:bg-[var(--surface-2)]"
                aria-label={t('projects.openTask', { title: task.title })}
              >
                <Circle className="w-3.5 h-3.5 shrink-0 text-[var(--text-mute)]" />
                <span className="text-[12px] text-[var(--text)] truncate flex-1">{task.title}</span>
                {actionableDate(task) && (
                  <span className={`text-[9px] shrink-0 ${task.dueDate && task.dueDate < today ? 'text-red-500' : 'text-[var(--text-dim)]'}`}>
                    {actionableDate(task) === today ? t('common.today') : format(parseISO(actionableDate(task)), 'MMM d', { locale })}
                  </span>
                )}
              </button>
            ))}
            {open.length > 4 && <div className="px-2.5 text-[10px] text-[var(--text-dim)]">{t('projects.moreTasks', { n: open.length - 4 })}</div>}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--text-dim)] flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />{t('projects.noOpenTasks')}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-7 pb-32">
      <header className="anim-fade">
        <button onClick={onBack} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />{t('overview.manage')}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('projects.title')}</h1>
          {pendingReview.length > 0 && (
            <span className="h-6 px-2.5 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-bold flex items-center">{t('projects.review.pendingBadge', { n: pendingReview.length })}</span>
          )}
        </div>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{t('projects.subtitle')}</p>
      </header>

      <form onSubmit={event => { event.preventDefault(); create(); }} className="tcard p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-2">
          <input
            value={title}
            onChange={event => { setTitle(event.target.value); setCreateError(''); }}
            placeholder={t('projects.namePlaceholder')}
            aria-label={t('projects.namePlaceholder')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <input
            value={outcome}
            onChange={event => { setOutcome(event.target.value); setCreateError(''); }}
            placeholder={t('projects.outcomePlaceholder')}
            aria-label={t('projects.outcomeLabel')}
            aria-invalid={!!createError}
            className="h-11 min-w-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
          <button className="h-11 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[.99] transition-transform">
            <Plus className="w-4 h-4" />{t('projects.create')}
          </button>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)]">
          {t('projects.targetLabel')}
          <input
            type="date"
            value={targetDate}
            onChange={event => setTargetDate(event.target.value)}
            className="mt-1.5 h-10 w-full max-w-[220px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-3 text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
          />
        </label>
        {createError && <p className="mt-2 text-[10px] text-red-500" role="alert">{createError}</p>}
      </form>

      {active.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">{active.map(renderProject)}</section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
          <Folder className="w-10 h-10 mx-auto text-[var(--primary)]/30" />
          <h2 className="mt-3 text-[15px] font-bold text-[var(--text)]">{t('projects.emptyTitle')}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">{t('projects.emptySubtitle')}</p>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{t('projects.archived')}</h2>
          <p className="-mt-1 mb-3 text-[11px] text-[var(--text-dim)]">{t('projects.archivedHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-75">{archived.map(renderProject)}</div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the Manager tile subtitle to include pending-review count**

In `src/App.tsx`, inside the Manager tiles block, add a `pendingProjectReview` computation and use it. Find:

```tsx
{activeView==='manager'&&(()=>{
  const trackedHabits=habits.filter(h=>!h.archived);
  const openTasks=gtdTasks.filter(t=>t.status!=='done'&&t.status!=='trash'&&!t.isArchived);
  const unsortedTasks=gtdTasks.filter(t=>t.status==='inbox'&&!t.processedAt&&!t.isArchived);
  const activeGoals=goals.filter(g=>(g.status??'active')==='active');
```

Add `pendingProjectReview` right after `activeGoals`:

```tsx
  const activeGoals=goals.filter(g=>(g.status??'active')==='active');
  const activeProjectCount=projects.filter(project=>project.status==='active').length;
  const pendingProjectReview=projectsNeedingReview(projects, localDateKey()).length;
```

Update the Projects tile's `sub` to use the new key when there's a pending review:

```tsx
    {id:'projects',Ic:Folder,c:'#8b5cf6',label:t('projects.title'),sub:pendingProjectReview>0 ? t('projects.activeReviewCount',{n:activeProjectCount,m:pendingProjectReview}) : t('projects.activeCount',{n:activeProjectCount})},
```

Add the two required imports at the top of `App.tsx` (find the existing `store.ts` import line and the `domain/date` usage — check whether `localDateKey` and `projectsNeedingReview` are already imported; if not, add):

```ts
import { projectsNeedingReview } from './domain/projects';
import { localDateKey } from './domain/date';
```

(Place these near the top with the other local imports, e.g. right after the `NebullaMark` import line.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `ProjectsView` now requires `onOpenProject`, which `App.tsx` already passes from Task 8's Step 2 rewrite of the `'projects'` route.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all scripts exit 0 (no domain/backup logic changed in this task, but this confirms nothing broke).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Go to Manage → Projects: confirm the review badge appears only when a project's `nextReviewDate` has arrived; confirm clicking a project card (icon, title, or outcome block) opens `ProjectDetailView`; confirm archive/restore and quick-add-task still work directly from the card; confirm the Manager tile subtitle switches to "N active · M to review" once a project is due for review.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectsView.tsx src/App.tsx
git commit -m "feat(projects): open Project Detail from cards, show review-due badge"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (data model) → Tasks 1-4. Section 2 (Areas screen) → Task 6. Section 3 (Project Detail + board) → Tasks 7-8. Section 4 (review reminders) → Tasks 1 (`projectsNeedingReview`) + 9 (badge + tile). Section 5 (migration/backup/tests) → Tasks 1-4. All spec sections have a covering task.
- **Placeholder scan:** every step has literal, complete code; no "TBD"/"similar to Task N" shortcuts.
- **Type consistency:** `ProjectSection` (Task 1) is the single source of truth used identically in `ProjectSectionBoard` (Task 7) and `ProjectDetailView`'s `SECTION_STATUS` map (Task 8). `onMoveTask(taskId, section, blockingReason?)` and `onQuickAdd(section, title)` signatures match between the board (producer) and detail view (consumer). `updateProject`'s patch type (Task 3) matches every field `ProjectDetailView.saveEdit` actually sends (Task 8).
- **Sequencing note:** Tasks 6 and 8 both edit `App.tsx`'s `'areas'`/`'projects'` routes and reference `selectedProjectId` before it's introduced (Task 8) — this is called out explicitly in each task's steps. Execute in numeric order (1→9) to avoid transient type errors; if using subagent-driven execution with review checkpoints between tasks, this is a non-issue since the whole plan runs sequentially.

---

## Execution Handoff

Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, with review between tasks and fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
