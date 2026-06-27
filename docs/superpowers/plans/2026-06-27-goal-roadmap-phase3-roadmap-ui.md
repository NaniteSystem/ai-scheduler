# Goal-AI Roadmap — Phase 3: Locked Roadmap UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the AI-generated roadmap in the goal's "Stages" tab as a locked, mobile-first path (phases → name-only node rows; tap a node → detail popup with explanation + resource links; mark done; progress by nodes). Plus a 1× auto-retry so the first Gemini call rarely shows an error.

**Architecture:** When `goal.roadmap` exists, the milestones/"Stages" tab renders the locked roadmap (no add/edit); legacy editable milestones remain as fallback for goals without a roadmap. A node-detail popup (local state in `GoalDetailView`) shows detail + resources. Goal progress becomes node-based when a roadmap is present. Spec: `docs/superpowers/specs/2026-06-27-goal-ai-roadmap-design.md`.

**Tech Stack:** React 19, Zustand, lucide-react, Tailwind v4.

**Verification:** `npx tsc --noEmit` + `npm run build`; live check at **393px** with the proxy running.

---

### Task 1: 1× auto-retry on transient AI failures

**Files:** Modify `src/ai/roadmap.ts`

- [ ] **Step 1:** Change the import line `import { llmJson, AiUnavailableError } from './llm';` to:
```ts
import { llmJson, AiUnavailableError, AiOfflineError } from './llm';
```

- [ ] **Step 2:** Add a retry helper just below the imports (before `export interface RoadmapInput`):
```ts
// Retry once on transient failures (not when offline) — the first Gemini call sometimes cold-fails.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof AiOfflineError) throw e;
    await new Promise((r) => setTimeout(r, 700));
    return await fn();
  }
}
```

- [ ] **Step 3:** In `requestRoadmapQuestions`, wrap the call. Replace:
```ts
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: schema, temperature: 0.4 });
```
with:
```ts
  const raw = await withRetry(() => llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: schema, temperature: 0.4 }));
```

- [ ] **Step 4:** In `requestRoadmap`, replace:
```ts
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: RESULT_SCHEMA, temperature: 0.6 });
```
with:
```ts
  const raw = await withRetry(() => llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: RESULT_SCHEMA, temperature: 0.6 }));
```

- [ ] **Step 5:** `npx tsc --noEmit && npm run build` — success. (`AiUnavailableError` stays used by `buildRoadmap`; `AiOfflineError` now used by `withRetry`.)

- [ ] **Step 6:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/ai/roadmap.ts
git commit -m "feat(ai): retry roadmap generation once on transient failure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Store — node toggle + node-based progress

**Files:** Modify `src/store.ts`

- [ ] **Step 1:** In the `S` interface, after `updateGoal: (id: string, patch: Partial<Goal>) => void;` add:
```ts
  toggleRoadmapNode: (goalId: string, nodeId: string) => void;
```

- [ ] **Step 2:** In the store implementation, right after the `updateGoal: (id, patch) => set(...)` line, add:
```ts
  toggleRoadmapNode: (goalId, nodeId) => set((s) => ({
    goals: s.goals.map((g) => {
      if (g.id !== goalId || !g.roadmap) return g;
      return { ...g, roadmap: { ...g.roadmap, phases: g.roadmap.phases.map((p) => ({ ...p, nodes: p.nodes.map((n) => n.id === nodeId ? { ...n, done: !n.done } : n) })) } };
    }),
  })),
```

- [ ] **Step 3:** Make `goalProgressPct` roadmap-aware. Find the function `export function goalProgressPct(goal: Goal, sessions: Session[]): number {` and insert, as its FIRST statements (right after the `{`):
```ts
  if (goal.roadmap && goal.roadmap.phases.length) {
    const ns = goal.roadmap.phases.flatMap((p) => p.nodes);
    if (ns.length) return Math.round((ns.filter((n) => n.done).length / ns.length) * 100);
  }
```

- [ ] **Step 4:** `npx tsc --noEmit && npm run build` — success.

- [ ] **Step 5:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/store.ts
git commit -m "feat(store): toggleRoadmapNode + node-based goal progress

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: i18n `gr.*` keys (en/ru/ja)

**Files:** Modify `src/i18n.ts`

- [ ] **Step 1:** Add to each language block (near the `gd.*`/`gw.*` keys). English:
```ts
  'gr.stepsDone': '{a} of {b} steps',
  'gr.lockedNote': 'AI-generated path — check off steps as you complete them',
  'gr.resources': 'Resources',
  'gr.markDone': 'Mark done',
  'gr.markUndone': 'Mark not done',
```
Russian:
```ts
  'gr.stepsDone': '{a} из {b} шагов',
  'gr.lockedNote': 'Путь от ИИ — отмечай шаги по мере выполнения',
  'gr.resources': 'Ресурсы',
  'gr.markDone': 'Отметить выполненным',
  'gr.markUndone': 'Снять отметку',
```
Japanese:
```ts
  'gr.stepsDone': '{b}ステップ中{a}',
  'gr.lockedNote': 'AIが生成した道筋 — 完了したらチェック',
  'gr.resources': 'リソース',
  'gr.markDone': '完了にする',
  'gr.markUndone': '未完了に戻す',
```

- [ ] **Step 2:** Parity: `for k in gr.stepsDone gr.lockedNote gr.resources gr.markDone gr.markUndone; do echo -n "$k: "; grep -c "'$k'" src/i18n.ts; done` — each `3`.

- [ ] **Step 3:** `npx tsc --noEmit && npm run build` — success.

- [ ] **Step 4:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/i18n.ts
git commit -m "i18n: roadmap (stages) UI keys (en/ru/ja)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Render the locked roadmap in `GoalDetailView`

**Files:** Modify `src/components/GoalDetailView.tsx`

- [ ] **Step 1: Imports.** Change the lucide import block to add `ExternalLink` and `Lock`:
```tsx
import {
  ArrowLeft, Sparkles, CheckCircle2, Clock, Target, Flame, Calendar,
  TrendingUp, ChevronRight, Check, AlertCircle, Play, BookOpen,
  Activity, Award, BarChart3, Plus, Edit2, X, ExternalLink, Lock
} from 'lucide-react';
```
And add the `RoadmapNode` type to the types import:
```tsx
import type { Goal, RoadmapNode } from '../types';
```

- [ ] **Step 2: Store + state.** Change the store destructure (line ~36) to include `toggleRoadmapNode`:
```tsx
  const { sessions, openLog, openSessionModal, updateGoal, addSession, toggleRoadmapNode } = useStore();
```
And add node-popup state after the other `useState`s (after line ~43 `const [mlTarget, setMlTarget] = useState(1);`):
```tsx
  const [nodeModal, setNodeModal] = useState<{ phaseTitle: string; node: RoadmapNode } | null>(null);
```

- [ ] **Step 3: Gate the legacy milestones block.** Find the legacy block opener:
```tsx
        {/* ── MILESTONES TAB ── */}
        {activeTab === 'milestones' && (
```
Replace with (so legacy only shows when there is NO roadmap):
```tsx
        {/* ── ROADMAP (AI, locked) ── */}
        {activeTab === 'milestones' && goal.roadmap && goal.roadmap.phases.length > 0 && (() => {
          const rm = goal.roadmap;
          const allNodes = rm.phases.flatMap((p) => p.nodes);
          const doneN = allNodes.filter((n) => n.done).length;
          const pct = allNodes.length ? Math.round((doneN / allNodes.length) * 100) : 0;
          return (
            <div className="max-w-[700px]">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <h2 className="text-[18px] md:text-[20px] font-bold text-[var(--text)]">{tr('gd.goalRoadmap')}</h2>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1">{tr('gr.stepsDone', { a: doneN, b: allNodes.length })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 bg-[var(--surface-2)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: goal.color }} /></div>
                  <span className="text-[12px] font-bold text-[var(--text)] mono">{pct}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)] mb-5"><Lock className="w-3 h-3" />{tr('gr.lockedNote')}</div>
              <div className="space-y-7">
                {rm.phases.map((ph, pi) => {
                  const pn = ph.nodes.filter((n) => n.done).length;
                  return (
                    <div key={ph.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg grid place-items-center text-[11px] font-bold shrink-0" style={{ background: `${goal.color}1f`, color: goal.color }}>{pi + 1}</div>
                        <h3 className="text-[14px] font-bold text-[var(--text)] flex-1 min-w-0">{ph.title}</h3>
                        <span className="text-[10px] text-[var(--text-dim)] mono shrink-0">{pn}/{ph.nodes.length}</span>
                      </div>
                      <div className="relative pl-7 space-y-2">
                        <div className="absolute left-[11px] top-1 bottom-1 w-[2px] bg-[var(--surface-2)]" />
                        {ph.nodes.map((n) => (
                          <div key={n.id} className="relative">
                            <button onClick={() => toggleRoadmapNode(goal.id, n.id)} title={tr(n.done ? 'gr.markUndone' : 'gr.markDone')}
                              className={`absolute -left-7 top-2 w-5 h-5 rounded-full border-2 grid place-items-center z-10 transition-all ${n.done ? 'bg-emerald-500 border-emerald-500' : 'bg-[var(--surface)] border-[var(--border)] hover:border-emerald-500/60'}`}>
                              {n.done && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                            </button>
                            <button onClick={() => setNodeModal({ phaseTitle: ph.title, node: n })}
                              className={`tcard w-full text-left p-3 flex items-center gap-2 ${n.done ? 'opacity-60' : ''}`}>
                              <span className={`flex-1 text-[13px] font-semibold ${n.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>{n.title}</span>
                              <ChevronRight className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── MILESTONES TAB (legacy, no roadmap) ── */}
        {activeTab === 'milestones' && (!goal.roadmap || goal.roadmap.phases.length === 0) && (
```
(The rest of the legacy block — its `<div className="max-w-[700px]">` through its closing `)}` — stays exactly as it is.)

- [ ] **Step 4: Node popup.** Just before the component's final closing `</div>` + `);` (end of the returned JSX, near where `editOpen`/`completeOpen` modals are rendered), add:
```tsx
        {nodeModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setNodeModal(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md card rounded-b-none sm:rounded-3xl max-h-[85vh] overflow-y-auto anim-sheet sm:anim-pop">
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-1 truncate">{nodeModal.phaseTitle}</div>
                    <h3 className="text-[17px] font-bold text-[var(--text)]">{nodeModal.node.title}</h3>
                  </div>
                  <button onClick={() => setNodeModal(null)} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] shrink-0"><X className="w-4 h-4" /></button>
                </div>
                {nodeModal.node.detail && <p className="text-[14px] text-[var(--text)] leading-relaxed">{nodeModal.node.detail}</p>}
                {nodeModal.node.resources && nodeModal.node.resources.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gr.resources')}</div>
                    {nodeModal.node.resources.map((r, i) => r.url ? (
                      <a key={i} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 hover:border-[var(--primary)] transition-colors">
                        <ExternalLink className="w-4 h-4 text-[var(--primary)] shrink-0" /><span className="flex-1 text-[13px] text-[var(--text)] truncate">{r.label}</span>
                      </a>
                    ) : (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                        <BookOpen className="w-4 h-4 text-[var(--text-dim)] shrink-0" /><span className="flex-1 text-[13px] text-[var(--text)]">{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { toggleRoadmapNode(goal.id, nodeModal.node.id); setNodeModal((m) => m ? { ...m, node: { ...m.node, done: !m.node.done } } : null); }}
                  className={`w-full h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 ${nodeModal.node.done ? 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]' : 'bg-emerald-500 text-white'}`}>
                  <Check className="w-4 h-4" />{tr(nodeModal.node.done ? 'gr.markUndone' : 'gr.markDone')}
                </button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 5:** `npx tsc --noEmit && npm run build` — success (all new imports used: `ExternalLink`, `Lock`, `RoadmapNode`, `toggleRoadmapNode`, `nodeModal`).

- [ ] **Step 6: Live check (proxy + `npm run dev`, viewport 393px).** Open a roadmap-backed goal → Stages tab shows phases + name-only nodes; tap a node → popup with detail + resource links; mark done updates the dot, the phase counter, and the % ring. If you can't run it, skip and note.

- [ ] **Step 7:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalDetailView.tsx
git commit -m "feat(goals): render locked AI roadmap in Stages tab + node detail popup (mobile-first)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** locked roadmap in Stages tab (Task 4) ✓; name-only node rows (Task 4) ✓; tap → detail popup with explanation + resource links (Task 4) ✓; mark-done only, no edit/add when roadmap present (Task 4 gates legacy editor off) ✓; progress by nodes (Task 2 `goalProgressPct` + tab header) ✓; mobile-first popup (bottom-sheet on mobile, centered on sm+) ✓; transient-retry robustness (Task 1) ✓. Header/Overview rework + Complete survey = Phase 4.
- **Placeholder scan:** none — full code, exact anchors, concrete commands.
- **Type consistency:** `toggleRoadmapNode(goalId,nodeId)` defined in Task 2 used in Task 4; `RoadmapNode` imported/used; `nodeModal` typed `{phaseTitle; node: RoadmapNode}`; all `gr.*` keys (Task 3) used in Task 4; legacy block preserved, only its render condition changed.
