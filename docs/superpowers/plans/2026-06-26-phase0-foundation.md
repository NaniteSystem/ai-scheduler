# Phase 0 — Foundation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the small foundation debt before the IA rethink — fix the onboarding auto-advance bug, move the running focus-timer into a Home card (retiring the floating bar), delete the orphaned AI Coach view, and make the Home avatar navigate.

**Architecture:** React 19 + Zustand + Tailwind v4, single-file Vite build. No test runner exists; verification is `npx tsc --noEmit` + `npm run build`. The focus-timer's background logic (per-second tick, OS-notification sync, countdown-finished detection) currently lives in the visible `TimerBar`; this plan splits it into a headless `TimerEngine` (always mounted) plus a visible `TimerCard` (mounted only on the Home/dashboard view).

**Tech Stack:** React, Zustand, framer-motion, lucide-react, date-fns.

**Prerequisites:** This folder is not a git repo. Either run `git init` once so the commit steps work, or skip the `git commit` step in each task and just verify with tsc/build.

**Deferred out of Phase 0 (handled later, by design):**
- Create-sheet "Habit"/"Session" opening real creators → folded into Phase 1 (the ➕ sheet is reworked there).
- Home **bell** → a real Notifications center → Phase 4.

---

### Task 1: Onboarding waits for Continue (no auto-advance)

The "energy peak" and "sleep" single-select steps jump to the next step on tap. They should only *select*; the bottom Continue button advances (it already gates on `!!peak`/`!!sleep`).

**Files:**
- Modify: `src/components/Onboarding.tsx:136,142`

- [ ] **Step 1: Remove the auto-advance on the peak step**

In `src/components/Onboarding.tsx` line ~136, change:

```tsx
{PEAK.map(o => <OptionCard key={o.id} o={o} selected={peak === o.id} onClick={() => { setPeak(o.id as typeof peak); setTimeout(next, 180); }} />)}
```

to:

```tsx
{PEAK.map(o => <OptionCard key={o.id} o={o} selected={peak === o.id} onClick={() => setPeak(o.id as typeof peak)} />)}
```

- [ ] **Step 2: Remove the auto-advance on the sleep step**

In `src/components/Onboarding.tsx` line ~142, change:

```tsx
{SLEEP.map(o => <OptionCard key={o.id} o={o} selected={sleep === o.id} onClick={() => { setSleep(o.id); setTimeout(next, 180); }} />)}
```

to:

```tsx
{SLEEP.map(o => <OptionCard key={o.id} o={o} selected={sleep === o.id} onClick={() => setSleep(o.id)} />)}
```

- [ ] **Step 3: Verify the `next` reference is still used**

`next` is still referenced by the Continue button (`onClick={step === STEPS - 1 ? finish : next}`) and the name input's Enter handler, so removing it from these two callbacks won't trip `noUnusedLocals`.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "fix(onboarding): single-select steps wait for Continue instead of auto-advancing"
```

---

### Task 2: Delete the orphaned AI Coach view

The `'ai'` view is in the `activeView` union but nothing renders it and nothing navigates to it (confirmed: no `activeView==='ai'` block, no `setActiveView('ai')`). Remove it from the type so the dead state can't be set.

**Files:**
- Modify: `src/store.ts:353`

- [ ] **Step 1: Remove `'ai'` from the activeView union**

In `src/store.ts` line 353, change:

```ts
  activeView: 'dashboard' | 'goals' | 'week' | 'inbox' | 'habits' | 'progress' | 'ai' | 'architect' | 'planner' | 'archive' | 'settings';
```

to:

```ts
  activeView: 'dashboard' | 'goals' | 'week' | 'inbox' | 'habits' | 'progress' | 'architect' | 'planner' | 'archive' | 'settings';
```

Note: do NOT touch the `Message` `role: 'user' | 'ai'` type (`src/types.ts:255`) or the `addMsg('ai', …)` calls in the Goal Wizard — that `'ai'` is the chat role, unrelated.

- [ ] **Step 2: Verify no code sets the removed view**

Run: `grep -rn "setActiveView('ai')\|activeView==='ai'\|activeView === 'ai'" src/`
Expected: no matches.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "chore: remove orphaned AI Coach ('ai') view from activeView union"
```

---

### Task 3: Home avatar navigates to "Me" (settings)

The avatar circle in the Home greeting card is decorative. Make it open the profile/settings view. (The bell stays as-is for now; it becomes a Notifications center in Phase 4.)

**Files:**
- Modify: `src/App.tsx:191`

- [ ] **Step 1: Wrap the avatar initials in a button**

In `src/App.tsx` line ~191, change:

```tsx
        <div className="w-9 h-9 rounded-full bg-white/25 grid place-items-center text-[13px] font-bold">{initials}</div>
```

to:

```tsx
        <button onClick={()=>store.setActiveView('settings')} aria-label={t('bottomNav.profile')} className="w-9 h-9 rounded-full bg-white/25 grid place-items-center text-[13px] font-bold active:scale-95 transition-transform">{initials}</button>
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(home): tapping the avatar opens the profile/settings view"
```

---

### Task 4: Move the running timer into a Home card; retire the floating bar

Split `TimerBar` into:
- **`TimerEngine`** — headless, always mounted at the App root. Owns the per-second tick, OS-notification sync, and countdown-finished detection (so the timer keeps working on any view).
- **`TimerCard`** — visible, rendered inside the Home/dashboard view only. Shows label + live time + pause/resume + done (+ ±5 for countdown) and a discard that asks for confirmation (the old ✕ deleted instantly, which the user disliked).

**Files:**
- Modify: `src/components/FocusTimer.tsx` (export `clock`; replace `TimerBar` with `TimerEngine` + `TimerCard`)
- Modify: `src/App.tsx:6` (imports), `src/App.tsx:581` (root render), dashboard view (~line 202, add card)
- Modify: `src/i18n.ts` (add `timer.discardConfirm` in en/ru/ja)

- [ ] **Step 1: Add the `timer.discardConfirm` key to all three dictionaries**

In `src/i18n.ts`, find the existing `timer.discard` entry in each language block and add a sibling key. English:

```ts
  'timer.discardConfirm': 'Discard this timer without saving the time?',
```

Russian:

```ts
  'timer.discardConfirm': 'Сбросить таймер, не сохраняя время?',
```

Japanese:

```ts
  'timer.discardConfirm': 'タイマーを破棄して時間を保存しませんか？',
```

- [ ] **Step 2: Verify key parity across the three languages**

Run: `grep -c "timer.discardConfirm" src/i18n.ts`
Expected: `3`

- [ ] **Step 3: Export `clock` and replace `TimerBar` with `TimerEngine`**

In `src/components/FocusTimer.tsx`, change `function clock(` (line 7) to `export function clock(`.

Then replace the entire `TimerBar` function (lines 17–99) with these two components:

```tsx
// ─── Headless timer engine: per-second tick, OS-notification sync, countdown-finished detection.
//     Always mounted at the App root so the timer works regardless of the active view. Renders nothing. ───
export function TimerEngine() {
  const ft = useStore((s) => s.focusTimer);
  const { markTimerFinished, lang } = useStore();
  const [, force] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!ft || !ft.running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ft?.running, ft?.startedAt]);

  useEffect(() => { syncTimerNotification(ft); }, [ft?.running, ft?.mode, ft?.targetMinutes, ft?.finished, ft?.linkId]);
  useEffect(() => { firedRef.current = false; }, [ft?.linkId, ft?.startedAt, ft?.mode]);

  if (ft && ft.mode === 'countdown' && ft.running && !ft.finished && !firedRef.current) {
    const elapsed = ft.accumulatedMs + (Date.now() - ft.startedAt);
    if (ft.targetMinutes * 60000 - elapsed <= 0) {
      firedRef.current = true;
      markTimerFinished();
      notifyTimerComplete(ft.label, lang);
    }
  }
  return null;
}

// ─── Visible running-timer card. Rendered inside the Home/dashboard view. ───
export function TimerCard() {
  const tr = useT();
  const ft = useStore((s) => s.focusTimer);
  const { pauseTimer, resumeTimer, adjustTimer, stopTimer, askConfirm } = useStore();
  const [, force] = useState(0);

  useEffect(() => {
    if (!ft || !ft.running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ft?.running, ft?.startedAt]);

  if (!ft) return null;

  const elapsed = ft.accumulatedMs + (ft.running ? Date.now() - ft.startedAt : 0);
  const isCountdown = ft.mode === 'countdown';
  const remaining = ft.targetMinutes * 60000 - elapsed;
  const display = ft.finished ? '00:00' : isCountdown ? clock(remaining) : clock(elapsed);
  const pct = isCountdown ? Math.min(100, Math.max(0, (elapsed / (ft.targetMinutes * 60000)) * 100)) : 0;

  const discard = () => askConfirm({ message: tr('timer.discardConfirm'), confirmLabel: tr('timer.discard'), danger: true, onConfirm: () => stopTimer(false) });

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden anim-pop" style={{ boxShadow: '0 8px 22px rgba(40,50,90,.14)' }}>
      {isCountdown && <div className="h-[3px] bg-[var(--surface-2)]"><div className="h-full bg-[var(--primary)] transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} /></div>}
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
          {isCountdown ? <Hourglass className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[var(--text)] truncate leading-tight">{ft.label || tr('timer.focus')}</div>
          <div className="text-[20px] font-bold text-[var(--text)] mono leading-tight tabular-nums">{display}</div>
        </div>
        {ft.finished ? (
          <button onClick={() => stopTimer(true)} className="h-9 px-3 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform">
            <Check className="w-4 h-4" />{tr('common.done')}
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {isCountdown && (
              <>
                <button onClick={() => adjustTimer(-5)} aria-label="-5" className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-90 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                <button onClick={() => adjustTimer(5)} aria-label="+5" className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-90 transition-all"><Plus className="w-3.5 h-3.5" /></button>
              </>
            )}
            <button onClick={() => (ft.running ? pauseTimer() : resumeTimer())} aria-label={ft.running ? tr('timer.pause') : tr('timer.resume')}
              className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--primary)] text-white active:scale-90 transition-transform">
              {ft.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={() => (ft.linkType ? stopTimer(true) : discard())} aria-label={tr('common.done')}
              className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 active:scale-90 transition-all">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={discard} aria-label={tr('timer.discard')}
              className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-mute)] hover:text-[var(--text)] active:scale-90 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: `useT` is already imported at the top of `FocusTimer.tsx`; `askConfirm` already exists on the store. No new imports needed (Hourglass/Timer/Pause/Play/X/Check/Minus/Plus are already imported).

- [ ] **Step 4: Update the App imports**

In `src/App.tsx` line 6, change:

```tsx
import { TimerBar, TimerLauncher } from './components/FocusTimer';
```

to:

```tsx
import { TimerEngine, TimerLauncher, TimerCard } from './components/FocusTimer';
```

- [ ] **Step 5: Swap the global render from bar to engine**

In `src/App.tsx` line ~581, change:

```tsx
    <TimerBar/>
    <TimerLauncher/>
```

to:

```tsx
    <TimerEngine/>
    <TimerLauncher/>
```

- [ ] **Step 6: Render the card on the Home view**

In `src/App.tsx`, in the dashboard view, immediately AFTER the greeting card's closing `</div>` (the block ending at line ~202, right before the `{/* TODAY — scheduled */}` comment), insert:

```tsx
  {/* Running focus-timer card */}
  <TimerCard/>
```

It sits inside the dashboard's `space-y-7` container so it spaces correctly. It renders nothing when no timer is active (`TimerCard` returns null).

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors (in particular, no "TimerBar is not exported" and no unused-import error); build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/FocusTimer.tsx src/App.tsx src/i18n.ts
git commit -m "feat(timer): show running timer as a Home card; retire floating bar; confirm before discard"
```

---

## Self-Review

- **Spec coverage (Phase 0 row):** pending bug fixes — onboarding (Task 1) ✓, focus-timer card (Task 4) ✓; delete AI Coach (Task 2) ✓; fix dead buttons — avatar (Task 3) ✓; bell + Create-sheet creators explicitly deferred with rationale ✓.
- **Placeholders:** none — every step shows exact before/after code and exact commands.
- **Type/name consistency:** `TimerEngine`/`TimerCard`/`clock` defined in Task 4 Step 3 and consumed in Steps 4–6 with matching names; `timer.discardConfirm` added (Step 1) and used (Step 3). `TimerBar` fully removed and no longer imported.
