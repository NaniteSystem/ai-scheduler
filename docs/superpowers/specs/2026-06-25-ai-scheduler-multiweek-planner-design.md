# AI Scheduler — Multi-Week Planner (design)

**Date:** 2026-06-25
**Status:** Approved, ready for implementation planning
**Owner page:** new entry inside the Overview module

## 1. Problem & goal

The app already has an **AI Day Architect** (`activeView: 'architect'`, `AIScheduler.tsx`) that
generates a **single day** via a rule-based `generateSchedule()` in the store. It uses
`SchedulePrefs` + Goals + GTD next-actions, but **ignores Habits and recurring tasks** and only
plans one day.

We want a **new, separate page in the Overview module** — "AI Scheduler" — that builds a
**full minute-by-minute timed schedule across a selectable horizon (1 week → 1 month)**, drawing on:

- **Goals** (priority, `hoursPerWeekTarget`, `deadline`)
- **Habits** (`recurrence`, `anchor`, `reminderTime`, `intervalDays`)
- **Recurring tasks** (GTDTask `recurring`)
- **One-off tasks** (`dueDate`, `priority`, `energyLevel`, `durationMinutes`)
- **SchedulePrefs** (wake/sleep/work/fasting/life balance/productivity peak)

This page must **prepare for a real AI API** (not necessarily Claude) without requiring one now:
the generation engine sits behind a provider interface, and the default is an improved local
rule-based engine. A real API later becomes a single new provider file + a key, with **no changes**
to the UI, data model, preview, or commit pipeline.

The existing Day Architect stays as-is (quick "plan today"). This page is additive.

## 2. Decisions (locked)

1. **Detail level:** full per-day timed plan for every day in the range (Day Architect ×N days).
2. **AI integration now:** build the provider seam; ship a local rule-based provider as default. Real
   API wired later.
3. **Output:** preview (accept/reject/regenerate) → commit into real `Session`s on the calendar.
4. **Relationship to Day Architect:** new separate page; Day Architect kept unchanged.
5. **Commit semantics:** **all** generated block kinds (goal / habit / task / life) become normal
   calendar `Session`s, tagged by source. Habits and tasks remain in their own modules too; the
   committed sessions are calendar projections, not replacements.

## 3. Architecture — the AI seam

```ts
interface SchedulerProvider {
  id: string;                          // 'rule-based' | 'claude' | 'openai'
  label: string;
  generate(input: PlanInput): Promise<GeneratedPlan>;
}
```

- `PlanInput` is a **pure snapshot** (no store access) → deterministic and unit-testable.
- `RuleBasedProvider` (built now) wraps an extended multi-day version of today's `generateSchedule()`.
- `ClaudeProvider` / `OpenAIProvider` (later) build a prompt from the **same** `PlanInput`, call the
  API, parse JSON → `GeneratedPlan`, validate, and **fall back to the rule-based provider** on any
  malformed/failed response.
- A small `providers` registry keyed by id. `SchedulePrefs.provider` (default `'rule-based'`)
  selects the active one. API key / model selection live behind a **disabled stub in Settings** until
  a real provider exists.

Location: `src/scheduler/` — `types.ts` (interfaces), `ruleBased.ts` (engine + provider),
`index.ts` (registry). The pure engine fn is exported for tests.

## 4. Data model (additions to `src/types.ts`)

```ts
export type PlanHorizon = '1w' | '2w' | '3w' | '4w';        // week → month

export interface PlanOptions {
  includeGoals: boolean;
  includeHabits: boolean;
  includeRecurring: boolean;
  includeTasks: boolean;                                    // one-off GTD tasks
}

export interface PlanInput {
  range: { start: string; end: string };                   // ISO yyyy-MM-dd inclusive
  prefs: SchedulePrefs;
  goals: Goal[];
  habits: Habit[];
  tasks: GTDTask[];
  options: PlanOptions;
}

export interface GeneratedPlan {
  id: string;
  createdAt: string;                                        // ISO
  providerId: string;
  range: { start: string; end: string };
  options: PlanOptions;
  days: GeneratedDay[];
}
```

- Reuse existing `GeneratedDay` / `GeneratedBlock`.
- Extend `GeneratedBlock.type` to add `'habit'`.
- Add `GeneratedBlock.sourceKind: 'goal' | 'habit' | 'task' | 'life'` so commit knows the origin.
- `GeneratedBlock.sourceId` already exists (goal id / habit id / task id).
- Add two optional fields to `Session`: `sourceKind?: 'goal'|'habit'|'task'|'life'` and
  `planSourceId?: string` — set on commit so committed sessions carry provenance (see §6).

Store (`src/store.ts`): add `generatedPlan: GeneratedPlan | null` (persisted via `partialize`,
alongside `generatedDay`) and a transient `isPlanning: boolean`. **`generatedDay` and the Day
Architect path are untouched.**

## 5. The engine — `generateRangePlan(input): GeneratedPlan`

Pure function. For each date in `range`, build a free/busy timeline (reuse the existing
`place()` / `occupy()` / `overlaps()` helpers) and place blocks in priority order:

1. **Fixed (locked):** sleep, work hours, meals — from `prefs.lifeBlocks`, respecting fasting rules
   (same logic as today's `generateSchedule`).
2. **Habits** (`options.includeHabits`): for each non-archived habit whose `recurrence` fires on the
   date — `daily` / `weekdays` / `weekends` / `weekly` / `everyN` (using `intervalDays` counted from
   `createdAt`) — place a block at its `anchor` slot (or `reminderTime`, else a sensible default).
   `type:'habit'`, `sourceKind:'habit'`, `sourceId:habit.id`, default duration ~20m (configurable).
3. **Goals** (`options.includeGoals`): convert `hoursPerWeekTarget` → N sessions/week, distributed
   across the week (avoid overloading any single day), placed in the `productivityPeak` window.
   Respect `deadline` (front-load when near). Skip goals with `status:'completed'`. `type:'goal'`,
   `sourceKind:'goal'`.
4. **Recurring tasks** (`options.includeRecurring`): place on the days their `recurring` pattern fires.
   `type:'task'`, `sourceKind:'task'`.
5. **One-off tasks** (`options.includeTasks`): open GTD tasks (not done/trash/archived) placed by
   `dueDate` proximity + `priority` + `energyLevel`, filling remaining slots up to their `dueDate`.
6. **Wellbeing / social / relax** fill leftover time from `prefs.lifeBlocks`.

Every block carries a human `reasoning` string (e.g. "P1 goal · session 1 of 5 this week",
"Habit · after lunch"). This both informs the preview and mirrors the natural-language a future LLM
provider will emit.

**Invariants (tested):** no two non-locked blocks overlap on a day; habit recurrence fires on exactly
the right dates; weekly goal target maps to the right session count; deadline front-loading;
disabled `options.*` sources contribute zero blocks.

## 6. Store actions

- `generatePlan(horizon, options)` → sets `isPlanning`, builds `PlanInput` from current state,
  resolves the active provider via the registry, `await provider.generate(input)`, stores
  `generatedPlan`, clears `isPlanning`. (Local provider wrapped in a short `setTimeout` for a
  "thinking" state, matching the Day Architect.)
- `setPlanBlockStatus(date, blockId, status)` — accept/reject a single block.
- `setPlanDayStatus(date, status)` — accept/reject a whole day.
- `acceptAllPlanBlocks()` — accept every non-rejected block.
- `regeneratePlan()` — re-run with the same horizon/options.
- `clearPlan()` — discard.
- `commitPlan()` — convert every **accepted, non-locked** block (all `sourceKind`s) into real
  `Session`s on their dates. One shared `seriesId = plan-<ts>`. Each session keeps `goalId` when
  `sourceKind==='goal'` (else `''`), copies `color`/`icon`/`title`, and records provenance via two new
  optional fields on `Session` — `sourceKind?: 'goal'|'habit'|'task'|'life'` and `planSourceId?: string`
  — so the calendar can show origin without duplicating the underlying habit/task. (`planSourceId` is
  separate from `goalId`/`seriesId` to avoid overloading those.) Then `generatedPlan = null`,
  `activeView = 'week'`.

## 7. UI/UX — `src/components/AIPlanner.tsx`

New `activeView: 'planner'`, rendered in `App.tsx` like the other full-height views (overflow-hidden,
floating-nav clearance — consistent with the Calendar fix from 2026-06-25).

**Entry:** add a 5th "AI Scheduler" tile (Wand2 icon, indigo) to the Overview/`progress` hub tile row;
`onClick` → `setActiveView('planner')`.

**Setup screen:**
- Horizon selector — 1 / 2 / 3 / 4 weeks (chips).
- Source toggles — Goals / Habits / Recurring / Tasks (default all on).
- Daily rhythm + life-balance: reuse Day Architect prefs; offer a "use my Day Architect settings"
  affordance to avoid duplicating sliders (link, or an inline compact subset).
- Provider badge (shows "Rule-based" now; ready to show a model name later).
- Primary **Generate** button (disabled while `isPlanning`).

**Preview screen (key UX for up to ~30 days):**
- **Week-grid summary** — columns = days, blocks rendered as compact colored chips; horizontally
  scrollable on mobile. Scan-at-a-glance.
- **Drill-down** — tapping a day opens its full timeline (reuse `TimelineBlock`) in a sheet/panel,
  with per-block accept/reject.
- Bulk controls: **Accept all**, accept-per-day, **Regenerate**, **Discard**.
- Header counts: "N of M blocks accepted".

**Commit:** "Add to schedule (N)" → `commitPlan()` → jump to Calendar.

## 8. Cross-cutting

- **i18n:** add `planner.*` keys to **all three** dictionaries (en / ru / ja) at parity — labels,
  horizon options, source toggles, preview controls, empty/loading states.
- **Mobile:** week-grid horizontally scrollable; drill-down as a bottom sheet; respect the
  floating-nav bottom clearance.
- **Build/verify discipline:** `npx tsc --noEmit` + `npm run build` clean; Playwright at 393px
  (seed `ai-scheduler-store`, clear after); no APK rebuild unless explicitly requested.

## 9. Build order (phases)

1. **Engine + seam + tests:** new types; `src/scheduler/` provider interface, registry,
   `RuleBasedProvider` wrapping `generateRangePlan`; unit tests for the engine invariants.
2. **Store:** `generatedPlan`/`isPlanning` state + actions (`generatePlan`, `setPlanBlockStatus`,
   `setPlanDayStatus`, `acceptAllPlanBlocks`, `regeneratePlan`, `clearPlan`, `commitPlan`); persist
   wiring.
3. **AIPlanner.tsx:** setup → preview (week-grid + drill-down) → commit.
4. **Wiring:** Overview "AI Scheduler" tile + `activeView: 'planner'` in `App.tsx` (full-height view,
   nav clearance).
5. **i18n + Settings provider stub** (disabled until a real provider exists).

## 10. Out of scope (this spec)

- The actual Claude/OpenAI provider implementation, API key handling, and APK network proxy.
- Editing committed sessions (handled by existing ScheduleView).
- Replacing or merging the Day Architect.

## 11. Notes

- Project is not a git repo, so this spec is not committed to version control (no git available);
  it lives on disk under `docs/superpowers/specs/`.
