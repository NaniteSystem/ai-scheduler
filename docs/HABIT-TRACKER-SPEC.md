# Habit-Tracker / Routine-Planner Expansion — Spec & Feasibility
_Requested 2026-06-23. Benchmarks: Routinery, Habitica, Streaks, Way of Life._

The current app is **local-only**: React + Vite + Zustand, persisted to `localStorage`, packaged as a single-file web app / Capacitor APK. **No backend, no accounts, no server.** That boundary decides what's buildable now vs. what needs new infrastructure.

## Feasibility legend
- 🟢 **Local-now** — fits current architecture, build directly.
- 🟡 **Local-big** — buildable locally but a substantial feature (new data model + UI).
- 🔴 **Needs backend** — impossible without a server + auth + hosting (out of current scope).

---

## 1. Routine Planning & Scheduling
- 🟡 **Situational triggering** — anchor habits to events/contexts ("after waking", "after meals") instead of a clock time. New `anchor` field on the habit/task model + ordering within an anchor group.
- 🟢 **Flexible recurrence** — daily / weekly / custom interval. _Mostly exists_ (RecurringPattern + recurring engine); add "every N days" interval.
- 🟡 **Template integration** — import predefined routine sets (fitness, productivity, home). Local JSON templates + an "Add template" picker.

## 2. Habit Tracking & Execution
- 🟢 **Multifaceted status logging** — Completed / Failed / Rest (skip without breaking streak).
- 🟢 **Quantitative targets** — N completions per day (e.g. 8 glasses of water), counter UI.
- 🟢 **Visual confirmation** — custom per-habit marker (emoji/icon/colour) on completion.

## 3. Integrated Task & Goal Management
- 🟢 **Task list integration** — one-off to-dos alongside recurring routines (GTD already exists; unify with habits).
- 🟢 **Hierarchical goals** — link daily habits/tasks to long-term goals (goals + `goalId` link already partly exist).

## 4. Progress Monitoring & Analytics
- 🟢 **Aggregate daily completion %** — real-time ring/bar of today's schedule completion.
- 🟡 **Statistical reporting** — automated daily / weekly / monthly metrics.
- 🟡 **Historical visualization** — consistency heatmaps + completion-rate trend charts.
- 🟡 **Achievement system** — local badges/stamps for milestones & streaks.

## 5. Reflection & Well-being
- 🟡 **Qualitative logging** — daily journal/notes.
- 🟡 **State tracking** — mood score + metrics (weight, etc.).
- 🟡 **Trend correlation** — overlay habits vs. mood/physical state to spot patterns.

## 6. Notifications & Reminders
- 🟢 **Contextual reminders** — schedule/interval alerts (extends existing `notifications.ts`; Capacitor local notifications only — works on APK, not web).
- 🟢 **Real-time status alerts** — progress/achievement/upcoming-task notifications (local).

## 7. Social & Accountability — 🔴 ALL need a backend
- 🔴 **Public profiles** — needs accounts + hosting.
- 🔴 **Accountability networking** (peer-to-peer monitoring) — needs server + auth + realtime.
- 🔴 **Community discovery** (shared routines DB) — needs server + database.

## 8. Configuration & Sync
- 🔴 **Multi-platform real-time sync** — needs backend + auth (localStorage can't sync across devices).
- 🟢 **Interface personalization** — layout/density controls (local settings).
- 🟢 **Notification customization** — timing/frequency/content controls (local settings).

---

## Proposed phased roadmap (local-first)
- **Phase H1 — Habit core (🟢): ✅ DONE 2026-06-23.** `Habit` model in types.ts; store habits[] + actions (add/update/delete/setHabitStatus/incHabit/clearHabitDay) + helpers `habitDueOn`/`habitStreak`; new **Habits** nav section (`HabitsView.tsx`) grouped by anchor with Done/Fail/Rest buttons, N/day counters, custom emoji+colour marker, streak flame, edit modal (anchor, recurrence daily/weekdays/weekends/weekly/everyN, target+unit, linked goal, reminder time); Home "Today · habits" section with quick-complete. Full i18n EN/RU/JA. Verified in browser. _Note: reminderTime field stored but not yet wired into notifications.ts._
- **Phase H2 — Analytics (🟢/🟡):** real-time daily completion %; weekly/monthly stats; consistency heatmap + trend charts; streak/badge achievements.
- **Phase H3 — Reflection (🟡): ✅ DONE 2026-06-23.** `ReflectionEntry`/`MetricDef` in types.ts; store `reflections{}`+`metricDefs[]` + `setReflection`/`addMetricDef`/`deleteMetricDef` + `moodHabitCorrelation` (Pearson r); **Reflect** tab in HabitsView: today's mood (1–5 emoji) + journal note + custom numeric metrics; Mood↔habits correlation card with dual sparkline + insight label; journal history (last 21 days). Full i18n EN/RU/JA. Verified in browser.
- **Phase H4 — Polish (🟢): ✅ DONE 2026-06-23.** Routine templates (3 bundles — Morning/Healthy body/Deep focus — one-tap "Add all" Drawer from Habits header + empty state); notification customization (Settings: habit-reminders on/off toggle gating `habitReminderNotifs`, default reminder time pre-filling new habits); interface density (Settings comfortable/compact toggle → `density-compact` class on App root, CSS tightens `.card` padding + section spacing app-wide). Full i18n EN/RU/JA (670 keys). Verified in browser.
- **Phase H5 — Backend (🔴, separate project):** accounts/auth + a server (e.g. Supabase/Vercel) → sync, public profiles, accountability, community. Requires explicit decision to add infrastructure.

Recommend building H1 first (it's the heart of the request and everything else builds on the habit model), then H2–H4. H5 is gated on a product decision to add a backend.
