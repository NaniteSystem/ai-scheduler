import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Timer, Hourglass, Pause, Play, X, Check, Minus, Plus } from 'lucide-react';
import { syncTimerNotification, notifyTimerComplete, ensureWebNotifPermission } from '../utils/timerNotifications';

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Running timer bar (floats above the bottom nav, persists across views) ───
export function TimerBar() {
  const tr = useT();
  const ft = useStore((s) => s.focusTimer);
  const { pauseTimer, resumeTimer, adjustTimer, stopTimer, markTimerFinished, lang } = useStore();
  const [, force] = useState(0);
  const firedRef = useRef(false);

  // Re-render every second while running so the digits tick.
  useEffect(() => {
    if (!ft || !ft.running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ft?.running, ft?.startedAt]);

  // Keep OS notifications in sync with timer state.
  useEffect(() => { syncTimerNotification(ft); }, [ft?.running, ft?.mode, ft?.targetMinutes, ft?.finished, ft?.linkId]);

  // Reset the "completion fired" guard whenever a fresh timer starts.
  useEffect(() => { firedRef.current = false; }, [ft?.linkId, ft?.startedAt, ft?.mode]);

  if (!ft) return null;

  const elapsed = ft.accumulatedMs + (ft.running ? Date.now() - ft.startedAt : 0);
  const isCountdown = ft.mode === 'countdown';
  const remaining = ft.targetMinutes * 60000 - elapsed;

  // Countdown reached zero → flip to finished + fire the completion cue once.
  if (isCountdown && ft.running && remaining <= 0 && !ft.finished && !firedRef.current) {
    firedRef.current = true;
    markTimerFinished();
    notifyTimerComplete(ft.label, lang);
  }

  const display = ft.finished ? '00:00' : isCountdown ? clock(remaining) : clock(elapsed);
  const pct = isCountdown ? Math.min(100, Math.max(0, (elapsed / (ft.targetMinutes * 60000)) * 100)) : 0;

  return (
    <div className="fixed inset-x-0 z-40 px-3 pointer-events-none" style={{ bottom: 0, paddingBottom: 'calc(env(safe-area-inset-bottom) + 86px)' }}>
      <div className="mx-auto w-full max-w-[460px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] pointer-events-auto overflow-hidden anim-pop"
        style={{ boxShadow: '0 12px 30px rgba(40,50,90,.22)' }}>
        {/* countdown progress line */}
        {isCountdown && <div className="h-[3px] bg-[var(--surface-2)]"><div className="h-full bg-[var(--primary)] transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} /></div>}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
            {isCountdown ? <Hourglass className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[var(--text)] truncate leading-tight">{ft.label || tr('timer.focus')}</div>
            <div className="text-[18px] font-bold text-[var(--text)] mono leading-tight tabular-nums">{display}</div>
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
              <button onClick={() => (ft.linkType ? stopTimer(true) : stopTimer(false))} aria-label={tr('common.done')}
                className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 active:scale-90 transition-all">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => stopTimer(false)} aria-label={tr('timer.discard')}
                className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-mute)] hover:text-[var(--text)] active:scale-90 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Launcher sheet: pick Timer (adjustable) or Stopwatch, then start ───
const PRESETS = [15, 25, 50];

export function TimerLauncher() {
  const tr = useT();
  const launcher = useStore((s) => s.timerLauncher);
  const { closeTimerLauncher, startTimer } = useStore();
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState(25);

  useEffect(() => { if (launcher) { setMode('countdown'); setMinutes(25); } }, [launcher]);

  if (!launcher) return null;

  const start = () => {
    ensureWebNotifPermission();
    startTimer({ mode, targetMinutes: minutes, linkType: launcher.linkType, linkId: launcher.linkId, label: launcher.label });
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 anim-backdrop" onClick={closeTimerLauncher} />
      <div className="fixed inset-x-0 bottom-0 z-[61] px-3 anim-sheet" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[460px] rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-4" style={{ boxShadow: '0 -8px 44px rgba(40,50,90,.24)' }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[17px] font-bold text-[var(--text)]">{tr('timer.start')}</h3>
            <button onClick={closeTimerLauncher} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"><X className="w-4 h-4" /></button>
          </div>
          {launcher.label && <p className="text-[12px] text-[var(--text-dim)] truncate mb-3">{launcher.label}</p>}

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-2xl bg-[var(--surface-2)]">
            {([['countdown', tr('timer.modeTimer'), Hourglass], ['stopwatch', tr('timer.modeStopwatch'), Timer]] as const).map(([m, label, Ic]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${mode === m ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-dim)]'}`}>
                <Ic className="w-4 h-4" />{label}
              </button>
            ))}
          </div>

          {/* Duration picker (countdown only) */}
          {mode === 'countdown' && (
            <div className="mb-4">
              <div className="flex items-center justify-center gap-4 mb-3">
                <button onClick={() => setMinutes((v) => Math.max(1, v - 5))} className="w-11 h-11 rounded-2xl grid place-items-center bg-[var(--surface-2)] text-[var(--text)] active:scale-90 transition-transform"><Minus className="w-5 h-5" /></button>
                <div className="text-center min-w-[88px]">
                  <div className="text-[34px] font-bold text-[var(--text)] mono leading-none tabular-nums">{minutes}</div>
                  <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mt-1">{tr('timer.minutes')}</div>
                </div>
                <button onClick={() => setMinutes((v) => Math.min(180, v + 5))} className="w-11 h-11 rounded-2xl grid place-items-center bg-[var(--surface-2)] text-[var(--text)] active:scale-90 transition-transform"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="flex justify-center gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => setMinutes(p)}
                    className={`h-8 px-4 rounded-full text-[12px] font-bold transition-colors ${minutes === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{p}m</button>
                ))}
              </div>
            </div>
          )}

          <button onClick={start} className="w-full h-12 rounded-2xl bg-[var(--primary)] text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform">
            <Play className="w-4 h-4" />{tr('timer.startBtn')}
          </button>
        </div>
      </div>
    </>
  );
}
