# Goal-AI Roadmap — Phase 4b: Goal-detail rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rework `GoalDetailView`: header (remove goal type; "Edit Goal" → rename-only); Overview (Energy→streak stat; GitHub-style activity grid; remove the milestones-mini + AI-coach cards); Complete → a branching feedback survey (NOT saved); AI Insights tab → the AI roadmap `tips`.

**Architecture:** All edits are in `src/components/GoalDetailView.tsx` plus i18n. The `EditGoalModal` is trimmed to rename + delete only. Spec: `docs/superpowers/specs/2026-06-27-goal-ai-roadmap-design.md`.

**Tech Stack:** React 19, Zustand, lucide-react, date-fns.

**Verification:** `npx tsc --noEmit` (noUnusedLocals) + `npm run build`; live check @393px.

---

### Task 1: i18n keys (rename, streak sub, complete-survey) — en/ru/ja

**Files:** Modify `src/i18n.ts`. Add to each language block near the `gd.*` keys.

- [ ] **English:**
```ts
  'gd.rename': 'Rename',
  'gd.streakSub': 'current streak',
  'cs.q1': 'Did you reach the result?',
  'cs.yes': 'Yes', 'cs.no': 'No',
  'cs.gQ1': 'How effective was it?',
  'cs.gA1a': 'Great', 'cs.gA1b': 'Good', 'cs.gA1c': 'Not very',
  'cs.gQ2': 'Did the roadmap help?',
  'cs.gA2a': 'A lot', 'cs.gA2b': 'A bit', 'cs.gA2c': 'Not really',
  'cs.bQ1': 'What didn’t you like?',
  'cs.bA1a': 'Too generic', 'cs.bA1b': 'Inaccurate', 'cs.bA1c': 'Didn’t fit', 'cs.bA1d': 'Other',
  'cs.bQ2': 'What should improve?',
  'cs.bA2a': 'More detail', 'cs.bA2b': 'More accuracy', 'cs.bA2c': 'Better resources', 'cs.bA2d': 'Other',
  'cs.thanks': 'Thank you!', 'cs.thanksSub': 'Your goal has been saved.',
```
- [ ] **Russian:**
```ts
  'gd.rename': 'Переименовать',
  'gd.streakSub': 'текущая серия',
  'cs.q1': 'Достиг результата?',
  'cs.yes': 'Да', 'cs.no': 'Нет',
  'cs.gQ1': 'Насколько эффективно это было?',
  'cs.gA1a': 'Отлично', 'cs.gA1b': 'Хорошо', 'cs.gA1c': 'Не очень',
  'cs.gQ2': 'Помог ли roadmap?',
  'cs.gA2a': 'Очень', 'cs.gA2b': 'Немного', 'cs.gA2c': 'Не особо',
  'cs.bQ1': 'Что не понравилось?',
  'cs.bA1a': 'Слишком обобщённо', 'cs.bA1b': 'Неверно', 'cs.bA1c': 'Не подошло', 'cs.bA1d': 'Другое',
  'cs.bQ2': 'Что улучшить?',
  'cs.bA2a': 'Больше деталей', 'cs.bA2b': 'Точнее', 'cs.bA2c': 'Другие ресурсы', 'cs.bA2d': 'Другое',
  'cs.thanks': 'Спасибо!', 'cs.thanksSub': 'Цель сохранена.',
```
- [ ] **Japanese:**
```ts
  'gd.rename': '名前を変更',
  'gd.streakSub': '現在の連続',
  'cs.q1': '結果を達成しましたか？',
  'cs.yes': 'はい', 'cs.no': 'いいえ',
  'cs.gQ1': 'どのくらい効果的でしたか？',
  'cs.gA1a': '最高', 'cs.gA1b': '良い', 'cs.gA1c': 'いまいち',
  'cs.gQ2': 'ロードマップは役立ちましたか？',
  'cs.gA2a': 'とても', 'cs.gA2b': '少し', 'cs.gA2c': 'あまり',
  'cs.bQ1': '何が不満でしたか？',
  'cs.bA1a': '一般的すぎる', 'cs.bA1b': '不正確', 'cs.bA1c': '合わない', 'cs.bA1d': 'その他',
  'cs.bQ2': '改善すべき点は？',
  'cs.bA2a': '詳細を', 'cs.bA2b': '正確さ', 'cs.bA2c': '別の資料', 'cs.bA2d': 'その他',
  'cs.thanks': 'ありがとう！', 'cs.thanksSub': '目標を保存しました。',
```
- [ ] **Verify:** `for k in gd.rename cs.q1 cs.gQ1 cs.bQ1 cs.thanks; do echo -n "$k: "; grep -c "'$k'" src/i18n.ts; done` → each `3`. Then `npx tsc --noEmit && npm run build`. Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/i18n.ts && git commit -m "i18n: rename + complete-survey keys (en/ru/ja)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Header — remove type chip; Edit → rename-only

**Files:** `src/components/GoalDetailView.tsx`

- [ ] **Step 1:** Remove the category type chip. Delete:
```tsx
              <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r ${cm.gradient} text-white`}>
                {tr('cat.' + goal.category)}
              </span>
```
Then run `npx tsc --noEmit`; if it flags `cm` as unused, remove the line `const cm = CATEGORY_META[goal.category];` and (if then unused) the `CATEGORY_META` import.

- [ ] **Step 2:** Relabel the Edit button. Change:
```tsx
              <Edit2 className="w-4 h-4" /> {tr('gd.editGoal')}
```
to:
```tsx
              <Edit2 className="w-4 h-4" /> {tr('gd.rename')}
```

- [ ] **Step 3:** Trim `EditGoalModal` to rename + delete. Replace its body (the `save` function, the field JSX, and all the unused field state) so it only edits the title. Concretely, in `EditGoalModal`:
  - Keep state: `const [title, setTitle] = useState(goal.title);` — REMOVE the other `useState`s (subtitle, emoji, category, color, deadline, priority, hpw, total, completionType).
  - Replace `save` with:
```tsx
  const save = () => { if (!title.trim()) return; updateGoal(goal.id, { title: title.trim() }); onClose(); };
```
  - Replace the modal body (everything between the header div and the footer) with a single title field:
```tsx
        <div className="p-6 space-y-5">
          <div>
            <label className={lbl}>{tr('gd.name')}</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={tr('gd.goalNamePlaceholder')} className={field} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] flex gap-2">
          <button onClick={remove} className="h-11 px-4 rounded-xl border border-red-500/30 text-red-400 text-[12px] font-bold hover:bg-red-500/10 transition-colors">{tr('gd.deleteGoal')}</button>
          <button onClick={save} disabled={!title.trim()} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold disabled:opacity-40">{tr('common.save')}</button>
        </div>
```
  - Update the modal header title to `{tr('gd.rename')}`.
  - Keep `remove` (delete via askConfirm) and the `deleteGoal`/`askConfirm` from the store.
  - Run `npx tsc --noEmit` and remove every now-unused import/const it flags (likely `DatePicker`, `GOAL_COLORS`, `schedulePrefs`, `weekStartsOn`, and field-only icons). Iterate until clean.

- [ ] **Step 4:** `npx tsc --noEmit && npm run build` — success. Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalDetailView.tsx && git commit -m "feat(goals): remove goal type chip; Edit → rename-only (+delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Overview — streak stat, GitHub grid, drop mini cards

**Files:** `src/components/GoalDetailView.tsx`

- [ ] **Step 1:** Energy → streak. Replace:
```tsx
                  { label: tr('gd.energy'), value: feelingLabel, sub: tr('gd.avgFeeling'), color: '#f59e0b', icon: Award },
```
with:
```tsx
                  { label: tr('gd.mStreak'), value: `${goalStreak(goal, sessions)}d`, sub: tr('gd.streakSub'), color: '#f59e0b', icon: Flame },
```

- [ ] **Step 2:** Widen the heatmap to 30 days. Replace `Array.from({ length: 28 }, (_, i) => {` with `Array.from({ length: 30 }, (_, i) => {` and the line `d.setDate(d.getDate() - (27 - i));` with `d.setDate(d.getDate() - (29 - i));`.

- [ ] **Step 3:** GitHub-style grid. Replace the heatmap render — the `<div className="flex gap-1">…</div>` block that maps `heatmap` (the row of vertical bars) — with:
```tsx
                <div className="flex flex-wrap gap-1">
                  {heatmap.map((day, i) => {
                    const lvl = day.mins === 0 ? 0 : day.mins < 30 ? 1 : day.mins < 60 ? 2 : day.mins < 120 ? 3 : 4;
                    const op = lvl === 0 ? 1 : lvl === 1 ? 0.3 : lvl === 2 ? 0.5 : lvl === 3 ? 0.75 : 1;
                    return (
                      <div key={i} className="group relative">
                        <div className="w-[13px] h-[13px] rounded-[3px]" style={{ background: lvl === 0 ? 'var(--surface-2)' : goal.color, opacity: op }} />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10">
                          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-[10px] text-[var(--text)] whitespace-nowrap shadow-xl">
                            {format(day.date, 'MMM d', { locale })}{day.mins > 0 ? ` · ${day.mins}m` : ` · ${tr('gd.rest')}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
```

- [ ] **Step 4:** Remove the two right-column cards. Delete the entire **"Milestones mini"** card block (the `<div className="card p-5">` containing `tr('gd.milestones')` and the `goal.milestones.map` mini list with the "View Roadmap" button) AND the entire **"AI Insight"** card block (the `<div className="card p-5 bg-gradient-to-br from-[var(--primary)]/8 …">` containing `tr('gd.aiCoach')` and `{insightText}`). Leave the "Pace Analysis" card. Run `npx tsc --noEmit` and remove anything now unused ONLY in Overview scope (note: `doneMilestones` is still used by the legacy milestones tab and `insightText` by the Insights tab — keep both).

- [ ] **Step 5:** `npx tsc --noEmit && npm run build` — success. Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalDetailView.tsx && git commit -m "feat(goals): Overview — streak stat, GitHub activity grid, drop mini cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Complete → branching feedback survey (not saved)

**Files:** `src/components/GoalDetailView.tsx`

- [ ] **Step 1:** Add survey state. After `const [completeOpen, setCompleteOpen] = useState(false);` add:
```tsx
  const [survey, setSurvey] = useState<'q1' | 'good1' | 'good2' | 'bad1' | 'bad2' | 'thanks'>('q1');
  const openComplete = () => { setSurvey('q1'); setCompleteOpen(true); };
```

- [ ] **Step 2:** Route the two "open complete" triggers through `openComplete`. Change both `onClick={() => setCompleteOpen(true)}` occurrences (the header Complete button and the readyToComplete banner) to `onClick={openComplete}`.

- [ ] **Step 3:** Replace the whole `completeOpen` modal block (`{completeOpen && ( … )}`) with the branching survey:
```tsx
      {completeOpen && (() => {
        const opt = (label: string, onClick: () => void, danger = false) => (
          <button onClick={onClick} className={`w-full h-11 rounded-xl text-[13px] font-bold transition-colors ${danger ? 'bg-[var(--surface-2)] border border-red-500/20 text-red-400 hover:bg-red-500/10' : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]'}`}>{label}</button>
        );
        return (
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm anim-fade" onClick={() => setCompleteOpen(false)}>
            <div className="w-full sm:max-w-sm card rounded-b-none sm:rounded-3xl p-6 anim-sheet sm:anim-pop" onClick={e => e.stopPropagation()}>
              {survey === 'q1' && (<>
                <div className="text-center mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/15 grid place-items-center mx-auto mb-3"><CheckCircle2 className="w-6 h-6 text-[var(--primary)]" /></div>
                  <h3 className="text-[16px] font-bold text-[var(--text)]">{tr('cs.q1')}</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1">{goal.title}</p>
                </div>
                <div className="space-y-2">
                  {opt(tr('cs.yes'), () => { completeGoal('success'); setSurvey('good1'); })}
                  {opt(tr('cs.no'), () => { completeGoal('failed'); setSurvey('bad1'); }, true)}
                </div>
              </>)}
              {survey === 'good1' && (<>
                <h3 className="text-[15px] font-bold text-[var(--text)] mb-4 text-center">{tr('cs.gQ1')}</h3>
                <div className="space-y-2">{['cs.gA1a','cs.gA1b','cs.gA1c'].map(k => <span key={k}>{opt(tr(k), () => setSurvey('good2'))}</span>)}</div>
              </>)}
              {survey === 'good2' && (<>
                <h3 className="text-[15px] font-bold text-[var(--text)] mb-4 text-center">{tr('cs.gQ2')}</h3>
                <div className="space-y-2">{['cs.gA2a','cs.gA2b','cs.gA2c'].map(k => <span key={k}>{opt(tr(k), () => setSurvey('thanks'))}</span>)}</div>
              </>)}
              {survey === 'bad1' && (<>
                <h3 className="text-[15px] font-bold text-[var(--text)] mb-4 text-center">{tr('cs.bQ1')}</h3>
                <div className="space-y-2">{['cs.bA1a','cs.bA1b','cs.bA1c','cs.bA1d'].map(k => <span key={k}>{opt(tr(k), () => setSurvey('bad2'))}</span>)}</div>
              </>)}
              {survey === 'bad2' && (<>
                <h3 className="text-[15px] font-bold text-[var(--text)] mb-4 text-center">{tr('cs.bQ2')}</h3>
                <div className="space-y-2">{['cs.bA2a','cs.bA2b','cs.bA2c','cs.bA2d'].map(k => <span key={k}>{opt(tr(k), () => setSurvey('thanks'))}</span>)}</div>
              </>)}
              {survey === 'thanks' && (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 grid place-items-center mx-auto mb-3"><Award className="w-7 h-7 text-emerald-500" /></div>
                  <h3 className="text-[17px] font-bold text-[var(--text)]">{tr('cs.thanks')}</h3>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1">{tr('cs.thanksSub')}</p>
                  <button onClick={() => setCompleteOpen(false)} className="mt-5 w-full h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold">{tr('common.done')}</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
```
Note: answers are NOT persisted — only `completeGoal()` (status/outcome) runs, at Q1.

- [ ] **Step 4:** `npx tsc --noEmit && npm run build` — success. Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalDetailView.tsx && git commit -m "feat(goals): Complete → branching feedback survey (not saved)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: AI Insights tab → roadmap tips

**Files:** `src/components/GoalDetailView.tsx`

- [ ] **Step 1:** In the Insights tab, replace the "Main insight" card (the `<div className="card p-6 bg-gradient-to-br from-[var(--primary)]/10 …">` block that shows `{insightText}`) with a tips-first card that falls back to `insightText` for goals without a roadmap:
```tsx
            {/* AI tips (roadmap) or fallback insight */}
            <div className="card p-6 bg-gradient-to-br from-[var(--primary)]/10 to-transparent border-[var(--primary)]/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center"><Sparkles className="w-5 h-5 text-[var(--text)]" /></div>
                <div>
                  <div className="text-[13px] font-bold text-[var(--text)]">{tr('gd.aiGoalAnalysis')}</div>
                  <div className="text-[10px] text-[var(--text-dim)]">{tr('gd.updatedAfter')}</div>
                </div>
              </div>
              {goal.roadmap && goal.roadmap.tips.length > 0 ? (
                <ul className="space-y-2.5">
                  {goal.roadmap.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[14px] text-[var(--text)] leading-relaxed">
                      <Sparkles className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />{tip}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-[var(--text)] leading-relaxed">{insightText}</p>
              )}
            </div>
```

- [ ] **Step 2:** `npx tsc --noEmit && npm run build` — success. Commit:
```bash
cd "/Users/sailor/Downloads/ai-scheduler-product-requirements 2"
git add src/components/GoalDetailView.tsx && git commit -m "feat(goals): AI Insights tab shows roadmap tips (fallback to insight)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- **Spec coverage:** type chip removed (T2) ✓; Edit→rename-only + delete kept (T2) ✓; Overview Energy→streak (T3.1) ✓; GitHub grid (T3.2-3) ✓; mini cards removed (T3.4) ✓; Complete→branching survey not saved (T4) ✓; AI Insights→tips (T5) ✓; lock note already removed earlier ✓.
- **Placeholders:** none.
- **Type consistency:** `survey`/`openComplete` defined (T4.1) and used (T4.2-3); `goalStreak`/`Flame` already imported and used (T3.1); `cs.*`/`gd.rename`/`gd.streakSub` from T1 used in T2-4; `goal.roadmap.tips` from the GoalRoadmap type used in T5; `completeGoal` unchanged.
- **Note:** delete is preserved inside the trimmed rename modal (a goal with no delete path would be a UX trap); flag for the user if they want delete gone too.
