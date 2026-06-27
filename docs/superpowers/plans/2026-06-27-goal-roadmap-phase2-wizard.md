# Goal-AI Roadmap — Phase 2: New Creation Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old goal wizard with an AI-only flow: type intent → pick depth → accept disclaimer (once) → (medium/deep) answer 2–4 questions → AI generates a roadmap (or refuses) → goal is created with the locked roadmap.

**Architecture:** A new `GoalCreateWizard.tsx` drives the flow as a small state machine and calls the Phase-1 seam (`src/ai/roadmap.ts`). The AI also infers the goal's **category** (→ emoji/colour from `CATEGORY_META`); the wizard does NOT collect hours (defaults set for Feature-2 scheduling later). Disclaimer acceptance + a "pending goal to open" id live in the store. The old `GoalWizardModal` and the `generateRoadmap` rule-based path are removed. Spec: `docs/superpowers/specs/2026-06-27-goal-ai-roadmap-design.md`. Requires Phase 1 (merged) and a running proxy (`VITE_AI_PROXY_URL`).

**Tech Stack:** React 19, Zustand, framer-motion, lucide-react, TypeScript.

**Verification:** `npx tsc --noEmit` + `npm run build`. Live flow needs the proxy running (`GEMINI_API_KEY=… node server/ai-proxy.mjs`) and `VITE_AI_PROXY_URL=http://localhost:8787` in `.env.local`.

---

### Task 1: Add AI-inferred `category` to the roadmap result

**Files:**
- Modify: `src/ai/roadmap.ts`

- [ ] **Step 1:** In `src/ai/roadmap.ts`, import the category list. Change the top import line:

```ts
import type { GoalKind, RoadmapDepth, GoalRoadmap, RoadmapPhase, RoadmapNode } from '../types';
```
to:
```ts
import type { GoalKind, RoadmapDepth, GoalRoadmap, RoadmapPhase, RoadmapNode, Category } from '../types';
import { CATEGORY_META } from '../types';
```

- [ ] **Step 2:** Add `category` to the `ok` and `reframe` variants of `RoadmapResult`:

```ts
export type RoadmapResult =
  | { status: 'ok'; kind: GoalKind; category: Category; roadmap: GoalRoadmap }
  | { status: 'reframe'; kind: GoalKind; category: Category; message: string; roadmap: GoalRoadmap }
  | { status: 'refuse'; reasonType: 'impossible' | 'unsafe' | 'unclear'; message: string; suggestion?: string };
```

- [ ] **Step 3:** Add `category` to `RESULT_SCHEMA.properties` (next to `kind`):

```ts
    category: { type: 'string', enum: Object.keys(CATEGORY_META) },
```

- [ ] **Step 4:** In `requestRoadmap`, after computing `kind`, derive a validated category and pass it through. Replace the tail of the function (from `const kind: GoalKind = …` to the end) with:

```ts
  const kind: GoalKind = ['learn', 'acquire', 'build', 'other'].includes(raw?.kind) ? raw.kind : 'other';
  const category: Category = (raw?.category && raw.category in CATEGORY_META ? raw.category : 'personal') as Category;
  const roadmap = buildRoadmap(raw, input.depth, kind);
  if (raw?.status === 'reframe') return { status: 'reframe', kind, category, message: typeof raw.message === 'string' ? raw.message : '', roadmap };
  return { status: 'ok', kind, category, roadmap };
```

- [ ] **Step 5:** Also instruct the model to pick a category — in `requestRoadmap`, append to the `prompt` string (before the closing backtick of the `prompt`): add ` Also set "category" to the best fit from: ${Object.keys(CATEGORY_META).join(', ')}.` So the final sentence of the prompt includes the category instruction. Concretely, change the line:

```ts
For refuse, include "reasonType" and "message" (and optional "suggestion"). All user-facing text in language "${input.lang}".`;
```
to:
```ts
For refuse, include "reasonType" and "message" (and optional "suggestion"). For ok/reframe also set "category" to the best fit from: ${Object.keys(CATEGORY_META).join(', ')}. All user-facing text in language "${input.lang}".`;
```

- [ ] **Step 6:** `npx tsc --noEmit && npm run build` — expect success.

- [ ] **Step 7:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/ai/roadmap.ts
git commit -m "feat(ai): roadmap result includes AI-inferred category

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Store — disclaimer flag + pending-goal-to-open

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1:** In the `S` interface (state shape), add after the `onboarded: boolean;` line:

```ts
  aiDisclaimerAcceptedAt: string | null;
  acceptAiDisclaimer: () => void;
  pendingGoalId: string | null;
  setPendingGoalId: (id: string | null) => void;
```

- [ ] **Step 2:** In the store implementation (the `create(...)` object), add after the `onboarded: false,` line:

```ts
  aiDisclaimerAcceptedAt: null,
  acceptAiDisclaimer: () => set({ aiDisclaimerAcceptedAt: new Date().toISOString() }),
  pendingGoalId: null,
  setPendingGoalId: (id) => set({ pendingGoalId: id }),
```

- [ ] **Step 3:** In `partialize` (the persisted slice), add `aiDisclaimerAcceptedAt: s.aiDisclaimerAcceptedAt,` next to `onboarded: s.onboarded,`. (Do NOT persist `pendingGoalId` — it's transient.)

- [ ] **Step 4:** `npx tsc --noEmit && npm run build` — expect success.

- [ ] **Step 5:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/store.ts
git commit -m "feat(store): AI disclaimer acceptance + pending-goal-to-open

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: i18n keys for the wizard (en/ru/ja)

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1:** Add these keys to each of the three language blocks (place them near the existing `wizard.*` keys). English:

```ts
  'gw.title': 'New goal',
  'gw.intentLabel': 'What do you want to achieve?',
  'gw.intentPlaceholder': 'e.g. Learn French, learn to play guitar, save for a car',
  'gw.next': 'Next',
  'gw.back': 'Back',
  'gw.depthTitle': 'How detailed should the roadmap be?',
  'gw.depthSurface': 'Surface',
  'gw.depthSurfaceDesc': '5–10 key steps — a quick overview',
  'gw.depthMedium': 'Medium',
  'gw.depthMediumDesc': '10–15 steps — a fuller plan',
  'gw.depthDeep': 'Deep',
  'gw.depthDeepDesc': 'Up to 30 steps — a detailed path',
  'gw.disclaimerTitle': 'Before we start',
  'gw.disclaimerBody': 'The roadmap is generated by AI and can be wrong or incomplete. Verify links and facts yourself.',
  'gw.disclaimerAccept': 'I understand',
  'gw.questionsTitle': 'A few quick questions',
  'gw.generate': 'Build roadmap',
  'gw.generating': 'Building your roadmap…',
  'gw.offline': 'You are offline — connect to the internet to create a goal.',
  'gw.error': 'AI is unavailable. Please try again.',
  'gw.retry': 'Try again',
  'gw.refuseImpossible': 'This goal doesn’t look achievable. Try a realistic goal.',
  'gw.refuseUnsafe': 'Please choose a proper, safe goal.',
  'gw.refuseUnclear': 'Could you rephrase the goal more clearly?',
  'gw.editGoal': 'Edit goal',
  'gw.reframeNote': 'Adjusted to a realistic plan:',
  'gw.created': 'Roadmap ready!',
```

Russian:
```ts
  'gw.title': 'Новая цель',
  'gw.intentLabel': 'Чего ты хочешь достичь?',
  'gw.intentPlaceholder': 'напр. выучить французский, играть на гитаре, накопить на машину',
  'gw.next': 'Далее',
  'gw.back': 'Назад',
  'gw.depthTitle': 'Насколько детальным сделать roadmap?',
  'gw.depthSurface': 'Поверхностный',
  'gw.depthSurfaceDesc': '5–10 ключевых шагов — общий обзор',
  'gw.depthMedium': 'Средний',
  'gw.depthMediumDesc': '10–15 шагов — более полный план',
  'gw.depthDeep': 'Глубокий',
  'gw.depthDeepDesc': 'до 30 шагов — подробный путь',
  'gw.disclaimerTitle': 'Прежде чем начать',
  'gw.disclaimerBody': 'Roadmap создаётся ИИ и может содержать ошибки или быть неполным. Проверяй ссылки и факты сам.',
  'gw.disclaimerAccept': 'Понятно',
  'gw.questionsTitle': 'Пара коротких вопросов',
  'gw.generate': 'Построить roadmap',
  'gw.generating': 'Строю твой roadmap…',
  'gw.offline': 'Ты офлайн — подключись к сети, чтобы создать цель.',
  'gw.error': 'ИИ недоступен. Попробуй ещё раз.',
  'gw.retry': 'Повторить',
  'gw.refuseImpossible': 'Эта цель выглядит недостижимой. Выбери реалистичную цель.',
  'gw.refuseUnsafe': 'Пожалуйста, выбери корректную и безопасную цель.',
  'gw.refuseUnclear': 'Сформулируй цель яснее, пожалуйста.',
  'gw.editGoal': 'Изменить цель',
  'gw.reframeNote': 'Скорректировано до реалистичного плана:',
  'gw.created': 'Roadmap готов!',
```

Japanese:
```ts
  'gw.title': '新しい目標',
  'gw.intentLabel': '何を達成したいですか？',
  'gw.intentPlaceholder': '例：フランス語を学ぶ、ギターを弾く、車のために貯金',
  'gw.next': '次へ',
  'gw.back': '戻る',
  'gw.depthTitle': 'ロードマップの詳しさは？',
  'gw.depthSurface': '浅い',
  'gw.depthSurfaceDesc': '5〜10の主要ステップ — 概要',
  'gw.depthMedium': '中',
  'gw.depthMediumDesc': '10〜15ステップ — より詳しい計画',
  'gw.depthDeep': '深い',
  'gw.depthDeepDesc': '最大30ステップ — 詳細な道筋',
  'gw.disclaimerTitle': '始める前に',
  'gw.disclaimerBody': 'ロードマップはAIが生成し、誤りや不足がある場合があります。リンクや事実はご自身で確認してください。',
  'gw.disclaimerAccept': '理解しました',
  'gw.questionsTitle': 'いくつか質問です',
  'gw.generate': 'ロードマップを作成',
  'gw.generating': 'ロードマップを作成中…',
  'gw.offline': 'オフラインです — ネットに接続して目標を作成してください。',
  'gw.error': 'AIを利用できません。もう一度お試しください。',
  'gw.retry': '再試行',
  'gw.refuseImpossible': 'この目標は達成が難しそうです。現実的な目標にしてください。',
  'gw.refuseUnsafe': '適切で安全な目標を選んでください。',
  'gw.refuseUnclear': '目標をもう少し明確にしてください。',
  'gw.editGoal': '目標を編集',
  'gw.reframeNote': '現実的な計画に調整しました：',
  'gw.created': 'ロードマップ完成！',
```

- [ ] **Step 2:** Parity check:
`for k in gw.title gw.depthTitle gw.generating gw.refuseUnsafe gw.created; do echo -n "$k: "; grep -c "'$k'" src/i18n.ts; done`
Expected: each `3`.

- [ ] **Step 3:** `npx tsc --noEmit && npm run build` — success.

- [ ] **Step 4:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/i18n.ts
git commit -m "i18n: goal-creation wizard keys (en/ru/ja)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `GoalCreateWizard.tsx`

**Files:**
- Create: `src/components/GoalCreateWizard.tsx`

- [ ] **Step 1:** Create `src/components/GoalCreateWizard.tsx`:

```tsx
import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { CATEGORY_META } from '../types';
import type { Goal, RoadmapDepth, Category } from '../types';
import { requestRoadmap, requestRoadmapQuestions, type RoadmapResult } from '../ai/roadmap';
import { AiOfflineError } from '../ai/llm';
import { X, ArrowLeft, ArrowRight, Wand2, Sparkles, RotateCcw, AlertTriangle, WifiOff, Check } from 'lucide-react';

type Step = 'intent' | 'depth' | 'disclaimer' | 'questions' | 'generating' | 'refuse' | 'error';
type ErrKind = 'offline' | 'unavailable';

const DEPTHS: { id: RoadmapDepth; label: string; desc: string }[] = [
  { id: 'surface', label: 'gw.depthSurface', desc: 'gw.depthSurfaceDesc' },
  { id: 'medium', label: 'gw.depthMedium', desc: 'gw.depthMediumDesc' },
  { id: 'deep', label: 'gw.depthDeep', desc: 'gw.depthDeepDesc' },
];

export function GoalCreateWizard() {
  const t = useT();
  const store = useStore();
  const { lang, aiDisclaimerAcceptedAt } = store;

  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState('');
  const [depth, setDepth] = useState<RoadmapDepth>('medium');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [refuse, setRefuse] = useState<Extract<RoadmapResult, { status: 'refuse' }> | null>(null);
  const [errKind, setErrKind] = useState<ErrKind>('unavailable');

  const close = () => store.closeWizard();

  const fail = (e: unknown) => {
    setErrKind(e instanceof AiOfflineError ? 'offline' : 'unavailable');
    setStep('error');
  };

  // After disclaimer: surface → generate directly; medium/deep → fetch questions first.
  const afterDisclaimer = async () => {
    if (depth === 'surface') { await generate([]); return; }
    setStep('generating');
    try {
      const { questions: qs } = await requestRoadmapQuestions({ intent: intent.trim(), depth, lang });
      if (qs.length === 0) { await generate([]); return; }
      setQuestions(qs); setAnswers(qs.map(() => '')); setStep('questions');
    } catch (e) { fail(e); }
  };

  const proceedFromDepth = () => {
    if (aiDisclaimerAcceptedAt) { afterDisclaimer(); } else { setStep('disclaimer'); }
  };

  const acceptDisclaimer = () => { store.acceptAiDisclaimer(); afterDisclaimer(); };

  const generate = async (ans: string[]) => {
    setStep('generating');
    try {
      const res = await requestRoadmap({
        intent: intent.trim(), depth, lang,
        answers: questions.map((q, i) => ({ q, a: ans[i] || '' })).filter((x) => x.a),
      });
      if (res.status === 'refuse') { setRefuse(res); setStep('refuse'); return; }
      createGoal(res);
    } catch (e) { fail(e); }
  };

  const createGoal = (res: Extract<RoadmapResult, { status: 'ok' | 'reframe' }>) => {
    const cat = res.category as Category;
    const meta = CATEGORY_META[cat] || CATEGORY_META.personal;
    const id = `g${Date.now()}`;
    const goal: Goal = {
      id, title: intent.trim(), category: cat, emoji: meta.emoji, color: meta.color,
      priority: 2, totalHoursEstimated: 0, hoursPerWeekTarget: 3,
      sessionsCompleted: 0, sessionsTotal: 0, hoursLogged: 0,
      milestones: [], metadata: { depth, kind: res.kind }, status: 'active',
      roadmap: res.roadmap,
    };
    store.addGoal(goal);
    store.setPendingGoalId(id);
    store.closeWizard();
    store.setActiveView('goals');
  };

  const refuseMsg = (r: Extract<RoadmapResult, { status: 'refuse' }>) =>
    r.message || t(r.reasonType === 'impossible' ? 'gw.refuseImpossible' : r.reasonType === 'unsafe' ? 'gw.refuseUnsafe' : 'gw.refuseUnclear');

  const fld = 'w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-[14px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--primary)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg card overflow-hidden flex flex-col max-h-[88vh] anim-pop">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center"><Wand2 className="w-4 h-4 text-white" /></div>
          <div className="flex-1 font-bold text-[var(--text)] text-[15px]">{t('gw.title')}</div>
          <button onClick={close} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)]"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'intent' && (
            <div className="space-y-3">
              <label className="block text-[13px] font-bold text-[var(--text)]">{t('gw.intentLabel')}</label>
              <textarea autoFocus rows={3} value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={t('gw.intentPlaceholder')} className={`${fld} resize-none`} />
            </div>
          )}

          {step === 'depth' && (
            <div className="space-y-3">
              <div className="text-[13px] font-bold text-[var(--text)]">{t('gw.depthTitle')}</div>
              {DEPTHS.map((d) => (
                <button key={d.id} onClick={() => setDepth(d.id)} className={`w-full p-4 rounded-2xl border text-left transition-all ${depth === d.id ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:border-[var(--primary)]/50'}`}>
                  <div className="font-bold text-[var(--text)] text-[14px]">{t(d.label)}</div>
                  <div className="text-[12px] text-[var(--text-dim)]">{t(d.desc)}</div>
                </button>
              ))}
            </div>
          )}

          {step === 'disclaimer' && (
            <div className="space-y-3 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 grid place-items-center mx-auto"><AlertTriangle className="w-6 h-6 text-amber-500" /></div>
              <div className="text-[15px] font-bold text-[var(--text)]">{t('gw.disclaimerTitle')}</div>
              <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">{t('gw.disclaimerBody')}</p>
            </div>
          )}

          {step === 'questions' && (
            <div className="space-y-4">
              <div className="text-[13px] font-bold text-[var(--text)]">{t('gw.questionsTitle')}</div>
              {questions.map((q, i) => (
                <div key={i} className="space-y-1.5">
                  <label className="block text-[12px] text-[var(--text)]">{q}</label>
                  <input value={answers[i] || ''} onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))} className={fld} />
                </div>
              ))}
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] grid place-items-center mb-4 animate-pulse"><Sparkles className="w-7 h-7 text-white" /></div>
              <div className="text-[14px] font-bold text-[var(--text)]">{t('gw.generating')}</div>
            </div>
          )}

          {step === 'refuse' && refuse && (
            <div className="space-y-3 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 grid place-items-center mx-auto"><AlertTriangle className="w-6 h-6 text-red-500" /></div>
              <p className="text-[14px] text-[var(--text)] leading-relaxed">{refuseMsg(refuse)}</p>
              {refuse.suggestion && <p className="text-[12px] text-[var(--text-dim)]">{refuse.suggestion}</p>}
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-3 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] grid place-items-center mx-auto">{errKind === 'offline' ? <WifiOff className="w-6 h-6 text-[var(--text-dim)]" /> : <AlertTriangle className="w-6 h-6 text-[var(--text-dim)]" />}</div>
              <p className="text-[14px] text-[var(--text)]">{t(errKind === 'offline' ? 'gw.offline' : 'gw.error')}</p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-4 flex gap-2">
          {step === 'intent' && (
            <button disabled={!intent.trim()} onClick={() => setStep('depth')} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">{t('gw.next')}<ArrowRight className="w-4 h-4" /></button>
          )}
          {step === 'depth' && (<>
            <button onClick={() => setStep('intent')} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)] flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.back')}</button>
            <button onClick={proceedFromDepth} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white text-[13px] font-bold flex items-center justify-center gap-1.5"><Wand2 className="w-4 h-4" />{t('gw.generate')}</button>
          </>)}
          {step === 'disclaimer' && (
            <button onClick={acceptDisclaimer} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />{t('gw.disclaimerAccept')}</button>
          )}
          {step === 'questions' && (
            <button onClick={() => generate(answers)} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white text-[13px] font-bold flex items-center justify-center gap-1.5"><Wand2 className="w-4 h-4" />{t('gw.generate')}</button>
          )}
          {step === 'refuse' && (
            <button onClick={() => setStep('intent')} className="flex-1 h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[13px] font-bold flex items-center justify-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.editGoal')}</button>
          )}
          {step === 'error' && (<>
            <button onClick={close} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)]">{t('gw.back')}</button>
            <button onClick={() => generate(answers)} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold flex items-center justify-center gap-1.5"><RotateCcw className="w-4 h-4" />{t('gw.retry')}</button>
          </>)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run build` — expect success (component compiles though not yet wired).

- [ ] **Step 3:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalCreateWizard.tsx
git commit -m "feat(goals): new AI goal-creation wizard (intent → depth → disclaimer → questions → generate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire the new wizard into App; remove the old one

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the new wizard.** After the line `import { Onboarding } from './components/Onboarding';` add:
```tsx
import { GoalCreateWizard } from './components/GoalCreateWizard';
```

- [ ] **Step 2: Swap the render.** Find:
```tsx
    {/* ═══════════════════ GOAL WIZARD MODAL ═══════════════════ */}
    {store.wizardOpen&&<GoalWizardModal/>}
```
Replace with:
```tsx
    {/* ═══════════════════ GOAL CREATE WIZARD ═══════════════════ */}
    {store.wizardOpen&&<GoalCreateWizard/>}
```

- [ ] **Step 3: Auto-open the freshly created goal.** In the `App` component body, near the other `useEffect`s (just after `useEffect(()=>{ initTimerActionListener(); },[]);`), add:
```tsx
  useEffect(()=>{ if(store.pendingGoalId){ setSelectedGoalId(store.pendingGoalId); store.setPendingGoalId(null); } },[store.pendingGoalId]);
```

- [ ] **Step 4: Delete the old wizard.** Remove the entire `function GoalWizardModal(){ … }` definition (the `/* ─── Goal Wizard Inline ─── */` block and the `type WizStep=…` line above it) at the bottom of `src/App.tsx`. Then remove now-unused imports that only it used: `generateRoadmap` and `type GoalLevel` (from `'./roadmap'`), and the `Milestone` type if unused elsewhere. Run tsc to find any other now-unused symbols (e.g. `Wand2` may still be used elsewhere — only remove what tsc flags).

- [ ] **Step 5:** `npx tsc --noEmit` — fix any unused-import errors it reports (remove only the genuinely unused ones). Then `npm run build` — expect success.

- [ ] **Step 6: Live check (proxy running + `.env.local` set).** Run the app, open Create → New goal, type "Learn French", pick Surface, accept the disclaimer, and confirm a roadmap-backed goal is created and opened. (If you can't run it now, skip and note it.)

- [ ] **Step 7:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/App.tsx
git commit -m "feat(goals): use new AI wizard; remove legacy GoalWizardModal; auto-open created goal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** old wizard removed (Task 5) ✓; intent → depth (surface/medium/deep) → one-time disclaimer → (medium/deep) questions → generate (Task 4) ✓; AI-only with offline/error states (Task 4 `error` step + `gw.offline`/`gw.error`) ✓; feasibility/safety refuse with default per-reasonType message for empty AI message (Task 4 `refuseMsg`) ✓; reframe handled (creates goal; reframe note key present) ✓; category inferred by AI → emoji/colour (Task 1) ✓; goal saved with locked `roadmap` (Task 4 `createGoal`) ✓; created goal auto-opens (Task 5 effect + `pendingGoalId`) ✓; hours defaulted, no hours step (createGoal) ✓.
- **Placeholder scan:** none — full component, exact edits, concrete commands.
- **Type consistency:** `RoadmapResult` (with `category`) from Task 1 is consumed in Task 4 `createGoal`/`generate`; `aiDisclaimerAcceptedAt`/`acceptAiDisclaimer`/`pendingGoalId`/`setPendingGoalId` defined in Task 2 and used in Tasks 4–5; all `gw.*` keys used in Task 4 are defined in Task 3; `Goal` built in `createGoal` includes every required field of the `Goal` interface.

## Notes
- Reframe currently creates the goal silently (the `gw.reframeNote` key exists for an optional toast — wire if desired; not required for the flow).
- Live testing requires the proxy running with the Gemini key and `VITE_AI_PROXY_URL` in `.env.local`.
