# Session creation rethink — compact form

**Date:** 2026-07-09 · **Status:** approved by default (user AFK, recommended option)

## Problem

`CreateSessionModal` (ScheduleView.tsx) is a single scroll of 12 sections (~4 phone
screens): title+autocomplete, goal, color palette, icon picker, all-day, day
(week strip AND a full DatePicker simultaneously), start+end TimePickers AND
duration presets, multi-day span, reminder grid, session type, recurrence with
custom weekdays, location/URL/note. Creating "тренировка завтра 18:00" requires
scrolling past rarely-used fields; several controls duplicate each other.

## Decisions

- **Approach A**: compact primary form + collapsed «Дополнительно» section.
  Questionable fields (session type, multi-day) are HIDDEN, not deleted.
- Data model (`Session`, `Draft`) unchanged — pure UI reorganization.

## Design

Primary form, in order:

1. **Title** — existing autocomplete kept. NEW: NLP via `extractNLDate` (same
   as task quick-add): typing a date/time phrase shows a hint chip; on create
   the parsed date/time/recurrence is applied and stripped from the title.
   Parsed recurrence maps: daily→daily, weekdays→weekdays, weekly→weekly.
2. **Goal** — chips row, unchanged.
3. **Day** — week strip only; a calendar toggle button opens the full
   DatePicker collapsibly. A free-picked date outside the visible week shows
   as a highlighted label.
4. **Time** — start TimePicker + duration preset chips. The End TimePicker is
   REMOVED (duration already covers it). All-day becomes a small toggle in the
   Time block header; when on, time controls hide.
5. **Repeat** — SelectMenu (none/daily/weekdays/weekly/custom); custom expands
   weekday chips. Occurrence count hint kept.
6. **Reminder** — SelectMenu instead of the 3×N button grid.
7. **▸ Дополнительно** (collapsed by default) — color palette, icon picker,
   session type, multi-day span, location, URL, note. Auto-expanded when
   editing a session where any of those is non-default (color/icon set,
   type ≠ regular, span > 1, location/url/description non-empty).

Footer unchanged: Cancel / Create (N).

## Not doing

- No two-step quick-add sheet (option B) — one compact modal is enough.
- No deletion of sessionType/spanDays fields or migration.

## Verification

- tsc + vite build + npm test green.
- Playwright @393px: fast path (title→create), NLP «завтра 18:00» prefills,
  advanced section round-trips color/location, edit mode auto-expands.
