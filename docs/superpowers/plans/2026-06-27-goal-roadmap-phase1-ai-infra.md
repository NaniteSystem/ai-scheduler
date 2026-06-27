# Goal-AI Roadmap — Phase 1: AI Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the online-only AI layer that turns a goal intent into a structured, validated roadmap JSON — a thin auth proxy (holds the Gemini key) + a typed client seam with strict validation and clear offline/transient/refuse errors. No UI yet.

**Architecture:** A small standalone Node proxy (`server/ai-proxy.mjs`, zero deps, Node 18+ global fetch) forwards an authenticated request to Google Gemini and returns the model's JSON text; the key lives only in the proxy. The client (`src/ai/`) builds the prompt + JSON schema, calls the proxy, parses & validates the response into a discriminated `RoadmapResult`, and throws typed errors (`AiOfflineError` / `AiUnavailableError`). Spec: `docs/superpowers/specs/2026-06-27-goal-ai-roadmap-design.md`.

**Tech Stack:** React 19 + Vite + Zustand + TypeScript; Node 18+ for the proxy; Google Gemini 2.5 Flash (`generateContent`, JSON mode).

**Verification:** No test runner — verify with `npx tsc --noEmit`, `npm run build`, and `node --check` for the proxy; pure validators are exercised with a `node --input-type=module` smoke snippet. A live end-to-end smoke needs a Gemini key (Task 2 Step 6 — requires the user).

**Out of scope (later phases):** wizard UI (Phase 2), roadmap/stages UI (Phase 3), goal-detail rework (Phase 4), i18n + polish (Phase 5).

---

### Task 1: Roadmap data model in `types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the roadmap types.** Append to `src/types.ts` (after the `Goal` interface block, near the other interfaces):

```ts
// ─── Goal-AI Roadmap (Feature 1) ────────────────────────────────────────────
export type GoalKind = 'learn' | 'acquire' | 'build' | 'other';
export type RoadmapDepth = 'surface' | 'medium' | 'deep';
export type RoadmapNodeKind = 'skill' | 'knowledge' | 'task' | 'milestone';

export interface RoadmapResource {
  label: string;
  url?: string;
  kind?: 'video' | 'site' | 'app' | 'course' | 'book';
}
export interface RoadmapNode {
  id: string;
  title: string;                  // only thing shown in the stages list
  detail?: string;                // explanation shown in the tap popup
  resources?: RoadmapResource[];
  kind?: RoadmapNodeKind;
  done: boolean;
}
export interface RoadmapPhase {
  id: string;
  title: string;
  summary?: string;
  nodes: RoadmapNode[];
}
export interface GoalRoadmap {
  depth: RoadmapDepth;
  kind: GoalKind;
  phases: RoadmapPhase[];
  tips: string[];                 // AI Insight advice, read-only
  generatedBy: 'ai';
  model?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add `roadmap` to `Goal`.** In the `Goal` interface in `src/types.ts`, add this line after `aiInsight?: string;`:

```ts
  roadmap?: GoalRoadmap;
```

- [ ] **Step 3: Typecheck + build.**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit.**

```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/types.ts
git commit -m "feat(types): add GoalRoadmap model (phases/nodes/resources) for Goal-AI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Gemini auth proxy

A thin, zero-dependency Node server. The client sends `{ system, prompt, responseSchema?, temperature? }`; the proxy injects the key, calls Gemini, returns `{ text }` (the model's JSON string) or an error status. The key never reaches the client.

**Files:**
- Create: `server/ai-proxy.mjs`
- Create: `server/.env.example`
- Create: `server/README.md`

- [ ] **Step 1: Write the proxy.** Create `server/ai-proxy.mjs`:

```js
// Minimal zero-dependency auth proxy for Google Gemini. Node 18+ (global fetch).
// Run: GEMINI_API_KEY=xxx node server/ai-proxy.mjs   (PORT optional, default 8787)
import { createServer } from 'node:http';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.ALLOW_ORIGIN || '*';

if (!KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
};

const send = (res, code, obj) => { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || !req.url.startsWith('/api/ai')) return send(res, 404, { error: 'not found' });

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
    const { system, prompt, responseSchema, temperature } = payload;
    if (typeof prompt !== 'string' || !prompt) return send(res, 400, { error: 'missing prompt' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
    const gReq = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
        temperature: typeof temperature === 'number' ? temperature : 0.6,
      },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };

    try {
      const g = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
      if (!g.ok) { const t = await g.text(); return send(res, 502, { error: `gemini ${g.status}`, detail: t.slice(0, 500) }); }
      const data = await g.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) return send(res, 502, { error: 'empty completion' });
      return send(res, 200, { text });
    } catch (e) {
      return send(res, 502, { error: 'upstream error', detail: String(e).slice(0, 300) });
    }
  });
});

server.listen(PORT, () => console.log(`ai-proxy on http://localhost:${PORT}  (model ${MODEL})`));
```

- [ ] **Step 2: Write `server/.env.example`:**

```
GEMINI_API_KEY=your_free_key_from_https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash
PORT=8787
ALLOW_ORIGIN=*
```

- [ ] **Step 3: Write `server/README.md`:**

```markdown
# AI proxy (Gemini)

Holds the Gemini API key server-side so the client never embeds it.

## Local
1. Get a free key: https://aistudio.google.com/apikey
2. `GEMINI_API_KEY=xxx node server/ai-proxy.mjs`  (listens on :8787)
3. In the app, set `VITE_AI_PROXY_URL=http://localhost:8787` (e.g. in `.env.local`).

## Deploy (free)
Same logic runs as a Vercel/Cloudflare function. Set `GEMINI_API_KEY` as a secret,
expose `POST /api/ai`, and point `VITE_AI_PROXY_URL` at the deployed origin.
Restrict `ALLOW_ORIGIN` to your app origin in production.

## Contract
`POST /api/ai` body `{ system?, prompt, responseSchema?, temperature? }` → `{ text }` (model JSON string) or `{ error }`.
```

- [ ] **Step 4: Syntax-check the proxy.**

Run: `node --check server/ai-proxy.mjs`
Expected: no output (valid).

- [ ] **Step 5: Boot check (no key needed for failure path).**

Run: `node server/ai-proxy.mjs`
Expected: prints `Missing GEMINI_API_KEY` and exits (confirms the guard). 

- [ ] **Step 6: LIVE smoke (requires the user's Gemini key).**

Ask the user for a free Gemini key, then:
```bash
GEMINI_API_KEY=THE_KEY node server/ai-proxy.mjs &
curl -s localhost:8787/api/ai -H 'Content-Type: application/json' \
  -d '{"prompt":"Return JSON {\"ok\":true} only.","responseSchema":{"type":"object","properties":{"ok":{"type":"boolean"}}}}'
```
Expected: `{"text":"{\"ok\": true}"}` (or similar). Then `kill %1`.
If the user can't provide a key now, skip this step and note it; Tasks 1 & 3 don't need it.

- [ ] **Step 7: Commit.**

```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add server/ai-proxy.mjs server/.env.example server/README.md
git commit -m "feat(ai): zero-dep Gemini auth proxy (key stays server-side)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Client AI seam + roadmap request/validation

**Files:**
- Create: `src/ai/llm.ts` (transport + typed errors)
- Create: `src/ai/roadmap.ts` (prompt build + JSON schema + validation)

- [ ] **Step 1: Transport seam.** Create `src/ai/llm.ts`:

```ts
// Online-only LLM transport. Talks to the auth proxy (VITE_AI_PROXY_URL).
// Throws AiOfflineError when there's no network, AiUnavailableError for any other failure.
export class AiOfflineError extends Error { constructor() { super('offline'); this.name = 'AiOfflineError'; } }
export class AiUnavailableError extends Error { constructor(m: string) { super(m); this.name = 'AiUnavailableError'; } }

export interface LlmRequest {
  system?: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

const proxyBase = (): string => {
  const b = (import.meta as any).env?.VITE_AI_PROXY_URL as string | undefined;
  if (!b) throw new AiUnavailableError('proxy not configured');
  return b.replace(/\/$/, '');
};

/** Send a request and parse the model's JSON output into T. */
export async function llmJson<T>(req: LlmRequest): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiOfflineError();
  let res: Response;
  try {
    res = await fetch(`${proxyBase()}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiOfflineError();
    throw new AiUnavailableError('network');
  }
  if (!res.ok) throw new AiUnavailableError(`proxy ${res.status}`);
  let data: any;
  try { data = await res.json(); } catch { throw new AiUnavailableError('bad proxy json'); }
  if (!data || typeof data.text !== 'string') throw new AiUnavailableError('no completion');
  try { return JSON.parse(data.text) as T; }
  catch { throw new AiUnavailableError('model returned invalid json'); }
}
```

- [ ] **Step 2: Roadmap request + validation.** Create `src/ai/roadmap.ts`:

```ts
import type { GoalKind, RoadmapDepth, GoalRoadmap, RoadmapPhase, RoadmapNode } from '../types';
import { llmJson, AiUnavailableError } from './llm';

export interface RoadmapInput {
  intent: string;                 // what the user wants to achieve
  category?: string;
  depth: RoadmapDepth;
  lang: 'en' | 'ru' | 'ja';
  answers?: { q: string; a: string }[];   // clarifying answers (medium/deep)
}

export type RoadmapResult =
  | { status: 'ok'; kind: GoalKind; roadmap: GoalRoadmap }
  | { status: 'reframe'; kind: GoalKind; message: string; roadmap: GoalRoadmap }
  | { status: 'refuse'; reasonType: 'impossible' | 'unsafe' | 'unclear'; message: string; suggestion?: string };

export interface ClarifyResult { questions: string[] }

const NODE_BUDGET: Record<RoadmapDepth, string> = {
  surface: '5–10 nodes total across 1–3 phases',
  medium: '10–15 nodes across 3–5 phases',
  deep: 'up to 30 nodes across up to 8 phases',
};

const SYSTEM = (lang: string) =>
  `You are a goal-roadmap planner like roadmap.sh. Produce a structured, DATE-AGNOSTIC path (phases → nodes) to reach the user's goal. Never assign dates or times. Cite real, well-known online resources (YouTube, sites, apps); prefer English-language resources. Write node titles and detail in language code "${lang}". Refuse impossible goals (reasonType "impossible") and unsafe/illegal/harmful goals such as weapons or wrongdoing (reasonType "unsafe", message asking for a proper goal). For purchases, return status "reframe" with a savings + buying-decision path. Output STRICT JSON only, matching the requested schema.`;

// JSON schema passed to Gemini so it returns the discriminated result.
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'reframe', 'refuse'] },
    kind: { type: 'string', enum: ['learn', 'acquire', 'build', 'other'] },
    reasonType: { type: 'string', enum: ['impossible', 'unsafe', 'unclear'] },
    message: { type: 'string' },
    suggestion: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
                kind: { type: 'string', enum: ['skill', 'knowledge', 'task', 'milestone'] },
                resources: {
                  type: 'array',
                  items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, kind: { type: 'string' } }, required: ['label'] },
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['title', 'nodes'],
      },
    },
  },
  required: ['status'],
} as const;

let _seq = 0;
const rid = (p: string) => `${p}${Date.now().toString(36)}${(_seq++).toString(36)}`;

const safeUrl = (u?: string): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined;

/** Turn the raw model object into a validated GoalRoadmap (throws AiUnavailableError if malformed). */
function buildRoadmap(raw: any, depth: RoadmapDepth, kind: GoalKind): GoalRoadmap {
  if (!Array.isArray(raw?.phases) || raw.phases.length === 0) throw new AiUnavailableError('no phases');
  const phases: RoadmapPhase[] = raw.phases.map((p: any) => {
    if (!p || typeof p.title !== 'string' || !Array.isArray(p.nodes)) throw new AiUnavailableError('bad phase');
    const nodes: RoadmapNode[] = p.nodes.map((n: any) => {
      if (!n || typeof n.title !== 'string') throw new AiUnavailableError('bad node');
      const resources = Array.isArray(n.resources)
        ? n.resources.filter((r: any) => r && typeof r.label === 'string').map((r: any) => ({ label: String(r.label), url: safeUrl(r.url), kind: r.kind }))
        : undefined;
      return { id: rid('n'), title: String(n.title), detail: typeof n.detail === 'string' ? n.detail : undefined, kind: n.kind, resources, done: false };
    });
    if (nodes.length === 0) throw new AiUnavailableError('empty phase');
    return { id: rid('p'), title: String(p.title), summary: typeof p.summary === 'string' ? p.summary : undefined, nodes };
  });
  const tips = Array.isArray(raw.tips) ? raw.tips.filter((t: any) => typeof t === 'string') : [];
  return { depth, kind, phases, tips, generatedBy: 'ai', model: 'gemini-2.5-flash', createdAt: new Date().toISOString() };
}

/** Ask the model for up to 4 short clarifying questions (medium/deep only). */
export async function requestRoadmapQuestions(input: RoadmapInput): Promise<ClarifyResult> {
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth}.
Return JSON { "questions": string[] } with 2-4 SHORT questions whose answers materially change the roadmap (e.g. current level, target timeframe, sub-focus). Questions in language "${input.lang}". If no question is needed, return an empty array.`;
  const schema = { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] };
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: schema, temperature: 0.4 });
  const questions = Array.isArray(raw?.questions) ? raw.questions.filter((q: any) => typeof q === 'string').slice(0, 4) : [];
  return { questions };
}

/** Generate (or refuse) the roadmap. */
export async function requestRoadmap(input: RoadmapInput): Promise<RoadmapResult> {
  const answers = (input.answers || []).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth} (${NODE_BUDGET[input.depth]}).
${answers ? `Clarifying answers:\n${answers}\n` : ''}Decide status. If ok/reframe, include "kind", "tips" (3-6 short advice strings: apps/courses/channels), and "phases". For refuse, include "reasonType" and "message" (and optional "suggestion"). All user-facing text in language "${input.lang}".`;
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: RESULT_SCHEMA, temperature: 0.6 });

  if (raw?.status === 'refuse') {
    const reasonType = ['impossible', 'unsafe', 'unclear'].includes(raw.reasonType) ? raw.reasonType : 'unclear';
    return { status: 'refuse', reasonType, message: typeof raw.message === 'string' ? raw.message : '', suggestion: typeof raw.suggestion === 'string' ? raw.suggestion : undefined };
  }
  const kind: GoalKind = ['learn', 'acquire', 'build', 'other'].includes(raw?.kind) ? raw.kind : 'other';
  const roadmap = buildRoadmap(raw, input.depth, kind);
  if (raw?.status === 'reframe') return { status: 'reframe', kind, message: typeof raw.message === 'string' ? raw.message : '', roadmap };
  return { status: 'ok', kind, roadmap };
}
```

- [ ] **Step 3: Typecheck + build.**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds. (Files compile though nothing imports them yet — that's fine.)

- [ ] **Step 4: Validate the pure parser with a mock (no key, no network).**

Run:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
node --input-type=module -e '
const safeUrl = (u) => u && /^https?:\/\//i.test(u) ? u : undefined;
// mirror of buildRoadmap core checks
const raw = { status:"ok", kind:"learn", tips:["Use Duolingo"], phases:[{title:"Basics", nodes:[{title:"Alphabet", detail:"…", resources:[{label:"YT", url:"javascript:bad"},{label:"Site", url:"https://x.io"}]}]}] };
const okPhases = Array.isArray(raw.phases) && raw.phases.length>0;
const urls = raw.phases[0].nodes[0].resources.map(r=>safeUrl(r.url));
console.log("phases ok:", okPhases, "| sanitized urls:", JSON.stringify(urls));
'
```
Expected: `phases ok: true | sanitized urls: [null,"https://x.io"]` (confirms phase validation + `javascript:` URL is dropped).

- [ ] **Step 5: Commit.**

```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/ai/llm.ts src/ai/roadmap.ts
git commit -m "feat(ai): client seam + roadmap request/validation (online-only, typed errors)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage (Phase 1 row):** AI seam (`llm.ts`) ✓; proxy holding key (`ai-proxy.mjs`) ✓; Gemini 2.5 Flash default ✓; online-only with `AiOfflineError`/`AiUnavailableError`, no rule fallback ✓; strict JSON validation ✓; discriminated `RoadmapResult` with `ok`/`reframe`/`refuse(impossible|unsafe|unclear)` ✓; depth budgets ✓; clarifying-questions call ✓; resource URL sanitize (http/https only) ✓; output-language instruction ✓; `types.ts` additions ✓. UI (wizard/stages/detail/i18n) intentionally deferred to Phases 2–5.
- **Placeholder scan:** none — full code in every step; verification commands concrete.
- **Type consistency:** `RoadmapResult`, `RoadmapInput`, `requestRoadmap`/`requestRoadmapQuestions`, `llmJson`, `AiOfflineError`/`AiUnavailableError`, and the `GoalRoadmap`/`RoadmapPhase`/`RoadmapNode`/`GoalKind`/`RoadmapDepth` types are defined in Task 1/3 and used consistently; `buildRoadmap` returns `GoalRoadmap` with `generatedBy:'ai'` matching the Task 1 type.

## Dependency for execution
- Tasks 1 and 3 need no external services. **Task 2 Step 6 (live smoke) needs a free Gemini API key from the user** (https://aistudio.google.com/apikey). Without it, build everything and skip only that one step.
- Before Phase 2, set `VITE_AI_PROXY_URL` (e.g. `.env.local` → `http://localhost:8787`) and run the proxy so the wizard can call it.
