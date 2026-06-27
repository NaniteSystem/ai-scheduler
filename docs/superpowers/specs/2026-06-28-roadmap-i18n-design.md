# Goal-AI Roadmap — Multilingual content (i18n) design

**Date:** 2026-06-28
**Status:** Approved (design)
**Feature:** Goal-AI Roadmap (Feature 1) — closing the last gap (call it Phase 6)

## Problem

The AI generates a goal roadmap in the language that was active at creation time
(`input.lang` is passed into the Gemini prompt — `src/ai/roadmap.ts`). The result is
stored as **plain data** in `goal.roadmap`: `phases[].title/summary`,
`nodes[].title/detail`, `resources[].label`, and `tips[]`. The `GoalRoadmap` type has
no record of which language it was generated in.

When the user later switches the app language, the UI chrome (tabs, buttons, headings)
re-translates via i18n, but the roadmap **content stays in the creation language**.
Result: English UI with Russian milestones, etc.

This is not a Phase 5 regression — Phase 5 only touched static i18n keys. It is an
inherent limitation of the AI-generated content that Phases 1–4 never addressed.

## Scope

In scope: translate the **persisted** roadmap content only —
`phase.title/summary`, `node.title/detail`, `resource.label`, `tips[]`.

Out of scope (ephemeral, shown once in the wizard on the current language, never stored):
clarifying questions, `reframe` message, `refuse` message.

## Decisions (agreed)

1. **Generate all three languages up front** in a **single** AI call (not three calls).
   The model returns each user-facing text as an `{en, ru, ja}` object. Tripled text
   volume per goal creation is the accepted trade-off.
2. **Storage approach A — inline localization.** Text fields become
   `LocalizedText = string | Partial<Record<Lang,string>>`. Structure and state
   (`id`, `done`, `kind`, `url`, ordering) stay in a single `roadmap.phases` tree, so
   per-node progress never desyncs. Because `string` is part of the union, existing
   single-language goals remain type-safe and **no store migration is needed**.
3. **Old goals:** fallback to the original text (no migration, no badge).

Rejected alternatives: (B) parallel id-keyed dictionary — duplicates structure, fragile
index-based resource mapping; (C) three separate trees + hoisted progress — the model can
return different node counts per language, desyncing ids.

## Data model (`src/types.ts`)

```ts
export type LocalizedText = string | Partial<Record<Lang,string>>;
```

Field changes:
- `RoadmapResource.label: LocalizedText`
- `RoadmapNode.title: LocalizedText`, `detail?: LocalizedText`
- `RoadmapPhase.title: LocalizedText`, `summary?: LocalizedText`
- `GoalRoadmap.tips: LocalizedText[]`
- `GoalRoadmap.lang: Lang` — language at creation (fallback priority; optional so old
  goals without it remain valid)

`Lang` is `'en'|'ru'|'ja'`. To avoid an import cycle, either import `Lang` from `i18n.ts`
(verify i18n does not import from types in a way that cycles) or define it locally in
`types.ts` and have `i18n.ts` re-use it. Resolve during planning.

## Helpers (`src/i18n.ts`)

```ts
export function lt(v: LocalizedText | undefined, lang: Lang): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;          // old goals + AI-returned-as-string
  return v[lang] ?? v.en ?? v.ru ?? v.ja ?? ''; // partial-language fallback
}
export function useLang(): Lang;                  // reads store.lang
```

## AI layer (`src/ai/roadmap.ts`)

- `RESULT_SCHEMA`: every user-facing text field becomes an object
  `{ type:'object', properties:{ en:{type:'string'}, ru:{type:'string'}, ja:{type:'string'} } }`
  — applies to `phase.title/summary`, `node.title/detail`, `resource.label`, and each
  `tips[]` entry.
- `SYSTEM`/prompt: replace the current "write node titles and detail in language X"
  instruction with: "Return every user-facing text (phase titles/summaries, node
  titles/details, tips, resource labels) as an object with keys en, ru, ja carrying the
  same meaning in all three languages. Resource brand names may stay in their original
  language but still fill all three keys."
- `normLT(v): LocalizedText` — accepts a string (kept as-is) or an object (keep only
  non-empty `en/ru/ja` keys). For `title` an empty result throws `AiUnavailableError`;
  for `detail/summary` an empty result yields `undefined`.
- `buildRoadmap` runs each text field through `normLT`; sets `roadmap.lang = input.lang`.
- `requestRoadmapQuestions` unchanged (questions stay single-language on `input.lang`).
- `reframe`/`refuse` messages stay plain strings on `input.lang` (ephemeral).

## Rendering (`src/components/GoalDetailView.tsx`)

`const lang = useLang();` then wrap the roadmap text sites in `lt(..., lang)`:
- node row title (≈L564)
- phase title carried into `nodeModal.phaseTitle` (≈L562 set, ≈L802 render) — resolve via
  `lt(ph.title, lang)` at `setNodeModal` time so `phaseTitle` stays a string
- node modal title (≈L803), node modal detail (≈L807)
- resource label (≈L813 / L817)
- tips list (≈L668)

The stored `nodeModal.node` keeps the raw node (for `id`/`done`); only its title/detail are
resolved through `lt` at render.

## Error handling / degradation

- AI returns a plain string instead of an `{en,ru,ja}` object → `normLT` accepts it; the
  text is identical across languages (acceptable degraded mode).
- AI returns only some languages → `lt` falls back `en` → other available.
- Offline at creation → unchanged (`AiOfflineError`, blocked).
- Old single-language goals → `lt` returns the stored string. No badge.

## Testing

The project has no unit harness (no vitest/jest). Strategy:
1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. Standalone node script asserting `lt()` and `normLT`/`buildRoadmap` behavior
   (string passthrough, partial-language fallback, object normalization, empty-title
   throw) — same lightweight approach used for the i18n audit.
4. Playwright @393px with a real Gemini key + proxy: create a goal → switch EN↔RU↔JA →
   phases/nodes/tips re-translate; seed an old single-language goal → fallback shows the
   original. Clean up localStorage after.

## Files touched

`src/types.ts`, `src/i18n.ts`, `src/ai/roadmap.ts`, `src/components/GoalDetailView.tsx`.
No new i18n UI keys. No store migration.
