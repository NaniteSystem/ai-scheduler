# Goal-AI Roadmap — Phase 4a: Manual goal-creation mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** At the start of goal creation, let the user choose **AI roadmap** (existing flow) or **Manual** (define the goal themselves — no AI). Manual creates a goal with no `roadmap`, so its "Stages" tab shows the existing editable milestone editor and the user adds sessions/stages themselves.

**Architecture:** Add a `mode` step (first) and a `manual` step to `GoalCreateWizard.tsx`. Manual builds a `Goal` (no roadmap) from a title + category pick + optional subtitle, then opens it. AI path is unchanged. Spec: `docs/superpowers/specs/2026-06-27-goal-ai-roadmap-design.md`.

**Tech Stack:** React 19, Zustand, lucide-react.

**Verification:** `npx tsc --noEmit` + `npm run build`; live check at 393px.

---

### Task 1: i18n keys for modes + manual (en/ru/ja)

**Files:** Modify `src/i18n.ts`

- [ ] **Step 1:** Add to each language block near the `gw.*` keys. English:
```ts
  'gw.modeTitle': 'How do you want to create this goal?',
  'gw.modeAi': 'AI roadmap',
  'gw.modeAiDesc': 'AI builds a full step-by-step path to your goal',
  'gw.modeManual': 'Manual',
  'gw.modeManualDesc': 'Set up the goal, stages and sessions yourself',
  'gw.category': 'Category',
  'gw.create': 'Create',
```
Russian:
```ts
  'gw.modeTitle': 'Как создать эту цель?',
  'gw.modeAi': 'AI-roadmap',
  'gw.modeAiDesc': 'ИИ построит полный пошаговый путь к цели',
  'gw.modeManual': 'Вручную',
  'gw.modeManualDesc': 'Сам задаёшь цель, этапы и сессии',
  'gw.category': 'Категория',
  'gw.create': 'Создать',
```
Japanese:
```ts
  'gw.modeTitle': 'この目標の作成方法は？',
  'gw.modeAi': 'AIロードマップ',
  'gw.modeAiDesc': 'AIが目標までの道筋を作成します',
  'gw.modeManual': '手動',
  'gw.modeManualDesc': '目標・段階・セッションを自分で設定',
  'gw.category': 'カテゴリ',
  'gw.create': '作成',
```

- [ ] **Step 2:** Parity: `for k in gw.modeTitle gw.modeManual gw.category gw.create; do echo -n "$k: "; grep -c "'$k'" src/i18n.ts; done` — each `3`.
- [ ] **Step 3:** `npx tsc --noEmit && npm run build` — success.
- [ ] **Step 4:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/i18n.ts
git commit -m "i18n: goal-creation mode + manual keys (en/ru/ja)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add mode + manual steps to `GoalCreateWizard.tsx`

**Files:** Modify `src/components/GoalCreateWizard.tsx`

- [ ] **Step 1: Icon import.** In the lucide import line add `Edit2`:
```tsx
import { X, ArrowLeft, ArrowRight, Wand2, Sparkles, RotateCcw, AlertTriangle, WifiOff, Check, Edit2 } from 'lucide-react';
```

- [ ] **Step 2: Step type + initial state.** Replace:
```tsx
type Step = 'intent' | 'depth' | 'disclaimer' | 'questions' | 'generating' | 'refuse' | 'error';
```
with:
```tsx
type Step = 'mode' | 'intent' | 'manual' | 'depth' | 'disclaimer' | 'questions' | 'generating' | 'refuse' | 'error';
```
Replace `const [step, setStep] = useState<Step>('intent');` with `const [step, setStep] = useState<Step>('mode');`
And right after `const [intent, setIntent] = useState('');` add:
```tsx
  const [manualCat, setManualCat] = useState<Category | ''>('');
  const [manualSub, setManualSub] = useState('');
```

- [ ] **Step 3: Manual create fn.** Right after the `createGoal` function definition, add:
```tsx
  const createManual = () => {
    if (!intent.trim() || !manualCat) return;
    const meta = CATEGORY_META[manualCat as Category] || CATEGORY_META.personal;
    const id = `g${Date.now()}`;
    store.addGoal({
      id, title: intent.trim(), subtitle: manualSub.trim() || undefined,
      category: manualCat as Category, emoji: meta.emoji, color: meta.color,
      priority: 2, totalHoursEstimated: 0, hoursPerWeekTarget: 3,
      sessionsCompleted: 0, sessionsTotal: 0, hoursLogged: 0,
      milestones: [], metadata: { kind: 'manual' }, status: 'active',
    });
    store.setPendingGoalId(id); store.closeWizard(); store.setActiveView('goals');
  };
```

- [ ] **Step 4: Body — add mode + manual steps.** Find `{step === 'intent' && (` (the body block, inside the scrollable content div) and insert BEFORE it:
```tsx
          {step === 'mode' && (
            <div className="space-y-3">
              <div className="text-[13px] font-bold text-[var(--text)]">{t('gw.modeTitle')}</div>
              <button onClick={() => setStep('intent')} className="w-full p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] text-left transition-all">
                <div className="flex items-center gap-2 mb-1"><Wand2 className="w-4 h-4 text-[var(--primary)]" /><span className="font-bold text-[var(--text)] text-[14px]">{t('gw.modeAi')}</span></div>
                <div className="text-[12px] text-[var(--text-dim)]">{t('gw.modeAiDesc')}</div>
              </button>
              <button onClick={() => setStep('manual')} className="w-full p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--primary)] text-left transition-all">
                <div className="flex items-center gap-2 mb-1"><Edit2 className="w-4 h-4 text-[var(--text-dim)]" /><span className="font-bold text-[var(--text)] text-[14px]">{t('gw.modeManual')}</span></div>
                <div className="text-[12px] text-[var(--text-dim)]">{t('gw.modeManualDesc')}</div>
              </button>
            </div>
          )}

          {step === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-[var(--text)] mb-2">{t('gw.intentLabel')}</label>
                <input autoFocus value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={t('gw.intentPlaceholder')} className={fld} />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-[var(--text)] mb-2">{t('gw.category')}</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <button key={k} onClick={() => setManualCat(k as Category)} className={`px-2 py-2 rounded-xl border text-[11px] text-left transition-all ${manualCat === k ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{v.emoji} {t('cat.' + k)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-bold text-[var(--text)] mb-2">{t('gd.subtitle')}</label>
                <input value={manualSub} onChange={(e) => setManualSub(e.target.value)} placeholder={t('gw.intentPlaceholder')} className={fld} />
              </div>
            </div>
          )}
```

- [ ] **Step 5: Footer — mode/manual + intent Back.** Find:
```tsx
          {step === 'intent' && (
            <button disabled={!intent.trim()} onClick={() => setStep('depth')} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">{t('gw.next')}<ArrowRight className="w-4 h-4" /></button>
          )}
```
Replace with:
```tsx
          {step === 'intent' && (<>
            <button onClick={() => setStep('mode')} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)] flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.back')}</button>
            <button disabled={!intent.trim()} onClick={() => setStep('depth')} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">{t('gw.next')}<ArrowRight className="w-4 h-4" /></button>
          </>)}
          {step === 'manual' && (<>
            <button onClick={() => setStep('mode')} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)] flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.back')}</button>
            <button disabled={!intent.trim() || !manualCat} onClick={createManual} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />{t('gw.create')}</button>
          </>)}
```

- [ ] **Step 6:** `npx tsc --noEmit && npm run build` — success (Edit2 used; manualCat/manualSub/createManual used; Category already imported).

- [ ] **Step 7: Live check (393px).** Create → New goal → "Manual" → type a title, pick a category, Create → goal opens; its Roadmap/Stages tab shows the editable milestone editor (add stage works). Also confirm "AI roadmap" path still works (mode → AI roadmap → intent…). If unable, note skipped.

- [ ] **Step 8:** Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalCreateWizard.tsx
git commit -m "feat(goals): manual goal-creation mode (AI roadmap vs manual)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- **Spec coverage:** mode choice at creation (Step 4) ✓; AI path unchanged (mode → intent) ✓; manual path builds a goal with no roadmap → editable milestone/stages + manual sessions (existing legacy editors) ✓; manual fields title+category+subtitle ✓.
- **Placeholders:** none.
- **Type consistency:** `Step` widened to include `'mode'`/`'manual'`; `manualCat: Category | ''`, `manualSub`, `createManual` defined and used; `Edit2` imported/used; reused existing keys `gw.intentLabel`/`gw.intentPlaceholder`/`gd.subtitle`/`cat.*` plus new `gw.*` from Task 1.
