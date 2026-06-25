# AI Scheduler — Module Audit & Improvement Plan
_Date: 2026-06-23 · Benchmarks: Microsoft To Do, Todoist, TickTick, Google/Outlook Calendar, Sunsama, Notion Calendar_

## 0. Cross-cutting findings (apply to whole app)

### 0a. 🔴 Mobile: hover-only controls are invisible on touch (HIGH)
6 components render their primary row actions as `opacity-0 group-hover:opacity-100`. Touch devices have **no hover**, so on the APK / phone these buttons are simply **unreachable**:
- **GTDView TaskCard** — edit, delete, "focus today", pomodoro (the most-used actions!)
- **ScheduleView** — session controls
- **AIScheduler TimelineBlock** — accept / reject block
- **GoalDetailView** — "Done" quick button on planned sessions
- **ArchiveView** — restore

**Fix:** on touch/coarse-pointer, make actions always visible (or reveal via tap/long-press / swipe). This is the single biggest mobile reliability problem.

### 0b. 🟠 "AI" is entirely simulated (STRATEGIC)
Title says "GPT-4o" but there is **no LLM call anywhere**. The goal wizard uses canned messages; the Day Architect is a rule-based `generateSchedule()` behind a fake 1.4 s spinner; **AI Coach is a "coming soon" stub.** Decision needed: either (a) wire a real Claude API, or (b) rename/reframe honestly as "smart/automatic" and drop the GPT-4o claim. (I'd recommend renaming now, optional real AI later.)

### 0c. 🟠 Day Architect output is a dead end
You can Generate → Accept blocks, but accepted blocks are **never written into the real Schedule** as sessions. Needs an "Add to schedule" action that commits accepted blocks → `addSessions`.

---

## 1. GTD Inbox  → benchmark: Microsoft To Do / Todoist
**Already strong:** NL quick-capture (p1/@ctx/30m/#tag), 10 buckets, contexts, sort, drag-reorder, subtasks, Pomodoro, Focus "Do" mode, Weekly Review, My Day (`today`), edit drawer (priority/status/due/duration/context/energy/delegate/notes).

**ADD**
1. **Recurring tasks** — `recurring` field exists in the type but there's **no UI to set it and no engine** to spawn the next occurrence on completion. This is a core To Do/Todoist feature. (HIGH)
2. **Task reminders/notifications** — tasks have due dates but no reminder time; only calendar sessions fire notifications. Add `reminderAt` + hook into existing `notifications.ts`. (HIGH)
3. **Mobile swipe actions** — swipe-right complete, swipe-left delete (To Do/Todoist standard). Replaces the broken hover buttons (ties to 0a). (HIGH)
4. **Due-date picker consistency** — Edit drawer uses raw `<input type=date>`; everywhere else uses the custom `DatePicker`. Unify. (LOW)
5. **Bulk/multi-select** (optional, MED) — select several → complete/move/delete.

**REMOVE / SIMPLIFY**
- 10 bucket tabs is heavy for mobile. Consider collapsing rarely-used `reference` + `someday-maybe` behind a "More" overflow, keeping Today/Inbox/Next/Scheduled/All up front.
- `estimatedPomodoros`/`area`/`project` fields exist in the type but are unused in UI — either surface or drop from the type to reduce dead surface.

---

## 2. Schedule  → benchmark: Google / Outlook Calendar
**Already strong:** day/week/month/year, drag-move, **touch-enabled** resize, recurrence, all-day, multi-day, reminders, now-line, create modal with repeat.

**ADD**
1. **Overlap/conflict layout** — overlapping sessions currently stack/collide; calendars lay them side-by-side. (MED)
2. **Mobile "Agenda/List" view** — week grid is cramped on phones; a vertical agenda list per day is the mobile-native pattern. (MED)
3. **Tap-empty-slot to create on mobile** — creation is `onDoubleClick` (desktop) + a `+` button; double-tap is unreliable on touch. Add single-tap-empty-slot create on coarse pointers. (MED)

**REMOVE / SIMPLIFY**
- Year view is low-value/!dense; keep but de-prioritize, or make it a goals-timeline rather than a calendar mode.

---

## 3. Goals & Goal Detail  → benchmark: Streaks / Notion goals (more custom)
**Already strong:** rings, metrics, heatmap, pace analysis, milestones, sessions tab, AI-insight card, edit modal, completion flow.

**ADD**
1. **Editable milestones** — milestones render read-only ("+ Add milestone" is a no-op button). Make add/edit/toggle/delete real. (MED)
2. **Localize `CATEGORY_META` labels** — category chips ("COURSE", etc.) are still English-only in both languages. (LOW, quick)

**REMOVE**
- The per-goal "AI Insight" is a static stored string pretending to be AI — either make it derive from real stats (we already compute completion rate, pace, feeling) or drop the "AI" label.

---

## 4. AI Day Architect  → benchmark: Sunsama / Reclaim
**ADD**
1. **"Add accepted blocks to Schedule"** (the 0c dead-end fix). (HIGH — it's the whole point)
2. Make accept/reject usable on mobile (0a). (HIGH)

**REMOVE/REFRAME** — drop "AI" overclaim or make it real (0b).

---

## 5. AI Coach
Currently a **stub** ("coming soon"). Options: (a) build a real Claude-powered coach, (b) replace the nav slot with something shippable (e.g. a "Today" review surface), or (c) hide it until real. Recommend **hide/remove from nav** until it does something — a dead "coming soon" tab hurts perceived quality.

## 6. Dashboard & Progress
Solid overview surfaces. Minor: Progress "AI Review" is templated text (fine, but again not "AI"). Dashboard is good; ensure mobile spacing under the new bottom nav.

## 7. Settings / Archive / Onboarding
Functional and already localized. Archive has a hover-only "restore" (0a). Settings is complete (language, profile, schedule prefs, reset).

---

## Recommended priority order (my proposal)
1. ✅ **Mobile hover-fix (0a)** — DONE (`.hover-actions` utility).
2. ✅ **GTD recurring tasks + task reminders (1.1, 1.2)** — DONE (engine in store.processTask + remindAt + notifications).
3. ✅ **GTD mobile swipe actions (1.3)** — DONE (swipe-right complete / swipe-left delete).
4. ✅ **Day Architect → commit to schedule (0c/4.1)** — DONE (`commitGeneratedDay`, "Add to Schedule" button).
5. ✅ **Honest "AI" reframing + hide AI-Coach stub (0b, 5)** — DONE (title/tagline reframed, AI-Coach nav removed).
6. ✅ **Schedule overlap layout + tap-create (2.1, 2.3)** — DONE (side-by-side `layoutDay`, touch tap-to-create). Mobile agenda (2.2) served by existing Day view; standalone agenda mode deferred.
7. ✅ **Editable milestones + category i18n (3.1, 3.2)** — DONE (toggle/add/delete milestones + `cat.*` keys).

Lower/optional (NOT done): bulk multi-select, year-view rework, dead-field cleanup (`estimatedPomodoros`/`area`/`project`), real Claude API integration, per-goal AI-insight made data-driven.
