# Goal-AI Roadmap — Design Spec (Feature 1)

**Date:** 2026-06-27
**Status:** Design — pending user review, then implementation plan.
**Scope:** Feature 1 only (AI builds a goal's roadmap). Independent of Feature 2 (Schedule-AI). The two features share only the AI provider seam.

## One-liner
When a user creates a goal, AI builds a **locked, date-agnostic path** to achieve it (roadmap.sh style) — ordered phases of concrete nodes (skills / knowledge / tasks) with links to real online resources, at a user-chosen depth. The user can only mark nodes done; they cannot edit the roadmap.

## Decisions (locked)
- **LLM:** Gemini 2.5 Flash, default, behind a self-hosted **free proxy**; provider seam allows swapping to Groq/Claude later.
- **Roadmap is NOT editable** by the user (AI-authored, locked). Only `done` toggling.
- **Roadmap is NOT tied to dates/times** — it is a path, not a schedule (scheduling is Feature 2).
- **Depth chosen by user:** Surface (5–10 nodes) / Medium (10–15) / Deep (≤30). Default Medium.
- **Overview "Energy" stat → replaced with "Current streak (days)".**
- Activity block → GitHub-style monthly contribution grid.

## Current state (what we change)
- Goal creation today = `GoalWizardModal` in `src/App.tsx` (category → name → quick/detailed → generic hours-based `generateRoadmap` in `src/roadmap.ts`). **Replace this whole wizard.**
- `Goal.milestones` is flat `{id,title,targetValue,done}`. **Add a richer `Goal.roadmap`.** Keep `milestones`/hours fields for backward-compat and Feature 2 (scheduler reads `hoursPerWeekTarget`).
- `GoalDetailView.tsx` has 4 sections (Overview / Sessions / Stages / AI Insight) — **rework each** (below).

## AI infrastructure (`src/ai/`, shared seam)
- `LlmProvider { id; label; complete<T>(req): Promise<T> }`. Sends a prompt, expects **strict JSON**, validates it.
- Default provider calls a **self-hosted free proxy** that holds the Gemini key server-side. App never embeds the key.
  - Contract: `POST {AI_PROXY_URL}/api/ai` body `{ kind: 'roadmap.questions' | 'roadmap.generate', payload }` → JSON response (schemas below).
  - `AI_PROXY_URL` from build env `VITE_AI_PROXY_URL`, overridable in Settings. Proxy = free Vercel/Cloudflare Worker (deploy is a one-time manual step, documented in the plan).
- **Fallback:** proxy unreachable / error / 429 / invalid JSON / offline → deterministic generator (adapt `roadmap.ts` to emit the node structure). The app ALWAYS produces a roadmap; mark `generatedBy:'rule'` and show a subtle "offline draft" note.
- **Output language:** node titles/detail in the app's `lang` (en/ru/ja); resource links may be English.

## Data model (`src/types.ts`)
```ts
type GoalKind = 'learn' | 'acquire' | 'build' | 'other';   // AI-inferred
type RoadmapDepth = 'surface' | 'medium' | 'deep';
interface RoadmapResource { label: string; url?: string; kind?: 'video'|'site'|'app'|'course'|'book' }
interface RoadmapNode {
  id: string;
  title: string;                 // ONLY thing shown in the stages list
  detail?: string;               // explanation shown in the tap popup
  resources?: RoadmapResource[]; // links shown in the popup
  kind?: 'skill'|'knowledge'|'task'|'milestone';
  done: boolean;
}
interface RoadmapPhase { id: string; title: string; summary?: string; nodes: RoadmapNode[] }
interface GoalRoadmap {
  depth: RoadmapDepth;
  kind: GoalKind;
  phases: RoadmapPhase[];
  tips: string[];                // AI Insight advice (apps/courses/channels), read-only
  generatedBy: 'ai' | 'rule';
  model?: string;
  createdAt: string;
}
// Goal gains:
roadmap?: GoalRoadmap;
```
- **Progress:** if `goal.roadmap` present → done nodes / total nodes; else existing `goalProgressPct`.

## Goal-creation flow (new wizard, replaces GoalWizardModal)
1. **Intent:** free-text "what do you want to achieve?" (+ optional category; AI also infers `kind`).
2. **Depth:** Surface / Medium / Deep (default Medium), each with a one-line description.
3. **Disclaimer (one-time):** "AI can be wrong — verify links and facts yourself." User must accept (checkbox) once; stored as `store.aiDisclaimerAcceptedAt` (skipped on later goals). Recorded on the roadmap too.
4. **Clarifying questions:** Surface → **none**. Medium/Deep → call `kind:'roadmap.questions'` → AI returns up to 2–4 short questions (e.g., current level, target timeframe, sub-focus); user answers via chips/short inputs.
5. **Generate + feasibility gate:** call `kind:'roadmap.generate'`. AI returns one of:
   - `{ status:'ok', kind, roadmap }` — feasible learning/build path.
   - `{ status:'reframe', kind:'acquire', message, roadmap }` — e.g. "buy a car" → a savings + buying-decision path; show the reframe message, then the roadmap.
   - `{ status:'refuse', reason, suggestion? }` — impossible/unsafe ("fly to the moon") → show reason (+ optional realistic alternative), create NO goal; let the user edit intent and retry.
6. **Save:** on ok/reframe → create the Goal with `roadmap` (locked), open the goal.
7. **Errors/offline:** deterministic fallback roadmap for the chosen depth + "offline draft" note.

**Prompt intent (built by the proxy):** "Act like roadmap.sh. Produce a structured, date-agnostic PATH (phases→nodes) to reach the user's goal. Never assign dates/times. Cite real, well-known online resources (YouTube, sites, apps), prefer English-language. Respect depth: surface 5–10 total nodes / medium 10–15 / deep ≤30; phases ≤ ~8. For purchases produce a savings + buying-decision path. Refuse impossible/unsafe goals with a short reason. Node titles/detail in `{lang}`. Output STRICT JSON matching the schema." (+ schema + intent + answers).

## Goal detail rework (`GoalDetailView.tsx`)
**Header:** % complete · name · **streak (days)** · notes count · sessions count. **Remove the goal type.** **Remove the Edit-goal button** (content is locked); keep inline **Rename**.

**Complete** button → a small **branching feedback flow** (answers are shown to feel heard but are **NOT saved**):
- **Q1:** "Достиг ли ты результата?" → **Да / Нет**. This sets `status:'completed'` and `outcome:'success'` (Да) / `'failed'` (Нет).
- **If Да** → 1–2 follow-ups, each 3–4 options, e.g. "Насколько эффективно это было?" → *Отлично / Хорошо / Не очень*; (optional) "Помог ли roadmap?" → *Очень / Немного / Нет*. (≤3–4 questions total in the branch.)
- **If Нет** → 1–2 follow-ups, each 3–4 options, e.g. "Что не понравилось?" → *Слишком обобщённо / Неверно / Не подошло / Другое*; (optional) one more in the same spirit. (≤3–4 total.)
- **End:** a "Спасибо!" screen, then close. **None of the answers are persisted** — only `status`/`outcome` from Q1 are written to the goal. (Persisting + using this feedback to improve roadmaps = Backlog.)

1. **Overview**
   - Stat tiles: **Hours logged** (from calendar) · **Sessions done** · **Avg session** (≈ time per session) · **Current streak (days)** ← replaces Energy.
   - **Activity grid (GitHub-style):** ~last 30 days as squares (one per date); color by THIS goal's total session minutes that day: gray = 0, then light→dark (e.g. light <30m, mid 30–120m, dark >120m). Larger/clearer than the old 4-week chart.
   - **Recent sessions** (keep).
   - **Remove** the bottom stages-preview block and the AI-coach block.
2. **Sessions** (mostly as-is): done / upcoming / missed; "Add session to goal" (keep modal); completed count; calendar-linked sessions for this goal.
3. **Stages (= Roadmap, locked):** render `goal.roadmap`. Phases as sections; each node row shows **only its title** + a done checkbox (remove the old "target / units / days" line). **Tap a node → detail popup** (title, `detail` explanation, resource links opening external, plus mark done/undone). No add/edit/delete. Progress ring = done/total nodes. If a legacy goal has no roadmap → "Generate roadmap" CTA running the same flow.
4. **AI Insight:** render `goal.roadmap.tips` (AI advice — apps like Duolingo, YouTube courses, online schools…), **read-only**. Hide if empty.

## i18n
Add en/ru/ja keys for: wizard steps, depth labels/descriptions, disclaimer text, feasibility refuse/reframe messages, stages/roadmap section, node popup, activity-grid legend, complete dialog, AI-insight header. (Node CONTENT is AI-authored in the user's language, not i18n keys.)

## Edge cases
- Proxy down / offline / 429 / invalid JSON → deterministic fallback roadmap + note; `tips` empty.
- Refuse → no goal created; show reason; allow edit & retry.
- Cap deep roadmaps at ≤30 nodes / ≤8 phases.
- Resource URLs: render only `http(s)` links (sanitize).

## Implementation order (becomes the plan's phases)
1. **AI seam + proxy contract + deterministic fallback** (`src/ai/`), plus the `types.ts` additions.
2. **New goal-creation wizard** (intent → depth → disclaimer → questions → feasibility → generate → save).
3. **Locked Roadmap (Stages) UI** + node detail popup + progress-by-nodes.
4. **Goal-detail rework** (header, Overview stats + GitHub activity grid, Sessions, AI-Insight tips, Complete dialog, remove edit/type).
5. **i18n + fallback polish + backlog note.**

## Backlog (deferred)
- **Persist + use the Complete-flow feedback** (currently shown but discarded) to rate/improve generated roadmaps and prompts.

## Assumed defaults (flagged for review)
- Proxy hosting = your free Vercel/Cloudflare (deploy is a manual one-time step; `VITE_AI_PROXY_URL`).
- Depth default = Medium. Clarifying questions: Surface 0, Medium ~2, Deep ~3–4.
