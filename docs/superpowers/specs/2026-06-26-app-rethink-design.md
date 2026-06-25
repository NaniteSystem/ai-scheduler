# AI Scheduler — Whole-App Rethink & Roadmap

**Date:** 2026-06-26
**Status:** Design approved (structure). Roadmap pending build.

## Direction (decided)
- **Spine:** Goals + AI-scheduling. The core loop is `goal → AI plan → execute → track → review`; tasks/habits/calendar feed it.
- **AI:** Hybrid — deterministic engine does scheduling math; Claude does goal-breakdown, NL capture, coaching/review.
- **Audience:** Ship to others soon — onboarding, accounts+sync, reliability, polish are near-term.
- **Scope:** Bold IA rethink, then add functions.
- **Nav model chosen:** Approach A — Goals-centered (objects as tabs).

## The product in one sentence
"Tell it your goals; it builds and runs your schedule."

## Core loop
`CAPTURE → SHAPE(goal) → PLAN(AI) → EXECUTE(today) → TRACK → REVIEW → back to PLAN`

| Stage | Module |
|---|---|
| Capture | ➕ quick capture |
| Shape | Goals (→ roadmap), Habits (tied to goals) |
| Plan | AI scheduler → Calendar |
| Execute | Today + focus timer |
| Track | progress on goals/habits/sessions |
| Review | weekly review + reflection/mood |

## New navigation (5 destinations)
1. **Today** — execution hub. Greeting + progress ring (bell→Notifications, avatar→Me). Running focus-timer card (retire floating bar). Segments: Scheduled / To-Do / Habits. "Plan my day" button. To-Do header → full Tasks (GTD) manager.
2. **Calendar** — day/week/month grid; AI blocks land here. Retire Year view (or fold into Goals timeline).
3. **➕ Create / AI Plan** — quick capture (later NL), create Goal/Habit/Session (fix: Habit/Session must open real creators), "Plan my week with AI".
4. **Goals** — promoted to a tab. List → Detail → Roadmap; linked sessions + linked habits + AI coaching insight.
5. **Me** — dissolves the old Stats hub. Profile+streaks, Stats/Insights (per-goal, energy chart), **Reflection/Mood surfaced** (mood + journal + metrics + mood↔habit correlation, all already in store, no UI today), Weekly Review, Settings, Archive, Account/Sync (later).

## Retire / merge
- Delete orphaned **AI Coach** (`'ai'` view).
- Merge **Architect + Planner** → one **AI Plan** with horizon selector (today/week/month); life-block prefs become its settings.
- Dissolve **Stats tab**: analytics → Me; nav tiles → real tabs.
- **GTD Projects/Areas** non-functional (types only): wire Projects, drop Areas for now.

## Dead/placeholder buttons to fix
- Home bell → Notifications center. Home avatar → Me.
- Create-sheet Habit/Session → real creators.

## Hybrid AI
- Deterministic: time-blocking, wake/sleep/work/meal constraints, energy-peak placement, conflict resolution, auto-rebalancing on misses.
- Claude (behind existing `scheduler` provider seam): goal breakdown → roadmap; NL capture → structured task/habit; weekly review + coaching insight (replaces static `aiInsight`).
- Key handling: serverless/Firebase-function proxy holds the key; user-supplied key in Settings as stopgap.

## New functions
1. Close the loop: Goal roadmap → auto-scheduled sessions.
2. "Plan my day/week" balancing goals+habits+tasks.
3. Weekly Review ritual (`weeklyReviewOpen` flag exists, unused).
4. Reflection/mood insights with correlation callouts.
5. Notifications center.
6. Reschedule/triage: roll undone tasks forward; "what slipped".
7. Goal & routine templates.
8. Global search (`searchQuery` exists, unused).

## Product-ready
- Onboarding auto-advance fix (pending) + refreshed flow.
- Firebase auth + sync.
- Error boundaries, empty/error states; keep self-healing migrations.
- i18n parity EN/RU/JA, touch targets, a11y.
- APK + store assets.

## Phased roadmap
| Phase | Theme | Contents |
|---|---|---|
| 0 | Foundation | Pending bug fixes (onboarding, focus-timer card), delete AI Coach, fix dead buttons |
| 1 | IA rethink | New 5-tab nav, dissolve Stats hub, merge AI engines, surface Reflection/Mood |
| 2 | Close the loop | Goal → roadmap → auto-scheduled sessions → Today → Weekly Review |
| 3 | Hybrid AI | Claude behind seam: goal breakdown, NL capture, review/coaching + key proxy |
| 4 | Ship-ready | Firebase auth+sync, notifications center, onboarding polish, store assets |
| 5 | Delight | Reflection insights, templates, search, streaks |

## Audit reference (current state, 2026-06-26)
- 11 views exist; only 4 reachable from nav (Today/Calendar/Stats/Settings). Goals/Habits/Tasks/Archive/Planner buried in Stats; Architect reachable only from Planner; AI Coach orphaned.
- Reflection/mood/metrics + mood-habit correlation fully coded in `store.ts`, zero UI.
- GTDProject/GTDArea in `types.ts` only, not in store.
- Two rule-based AI engines (day Architect, multi-week Planner).
