import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Timer, Hourglass, Pause, Play, X, Check, Minus, Plus, Link2 } from 'lucide-react';
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

// ─── Shared running-timer panel (used as a floating bar and as a Home card) ───
function TimerPanel() {
  const tr = useT();
  const ft = useStore((s) => s.focusTimer);
  const { pauseTimer, resumeTimer, adjustTimer, stopTimer, markTimerFinished, openTimerAssignment, lang } = useStore();
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
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
      {/* countdown progress line */}
      {isCountdown && <div className="h-[3px] bg-[var(--surface-2)]"><div className="h-full grad transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} /></div>}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}>
          {isCountdown ? <Hourglass className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[var(--text)] truncate leading-tight">{ft.label || tr('timer.focus')}</div>
          <div className="text-[18px] font-bold text-[var(--text)] mono leading-tight tabular-nums">{display}</div>
        </div>

        {ft.finished ? (
          <div className="flex items-center gap-1 shrink-0">
            {!ft.linkType && <button onClick={openTimerAssignment} className="h-9 px-3 rounded-xl bg-[var(--surface-2)] text-[var(--primary)] text-[12px] font-bold flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />{tr('timer.assign')}</button>}
            <button onClick={() => stopTimer(true)} className="grad h-9 px-3 rounded-xl text-white text-[12px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform">
              <Check className="w-4 h-4" />{tr('common.done')}
            </button>
            <button onClick={() => stopTimer(false)} aria-label={tr('timer.discard')}
              className="w-9 h-9 rounded-xl grid place-items-center text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {isCountdown && (
              <>
                <button onClick={() => adjustTimer(-5)} aria-label="-5" className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-90 transition-all"><Minus className="w-3.5 h-3.5" /></button>
                <button onClick={() => adjustTimer(5)} aria-label="+5" className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] active:scale-90 transition-all"><Plus className="w-3.5 h-3.5" /></button>
              </>
            )}
            <button onClick={() => (ft.running ? pauseTimer() : resumeTimer())} aria-label={ft.running ? tr('timer.pause') : tr('timer.resume')}
              className="grad w-9 h-9 rounded-xl grid place-items-center text-white active:scale-90 transition-transform">
              {ft.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={() => (ft.linkType ? stopTimer(true) : stopTimer(false))} aria-label={tr('common.done')}
              className="w-9 h-9 rounded-xl grid place-items-center bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 active:scale-90 transition-all">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => stopTimer(false)} aria-label={tr('timer.discard')}
              className="w-9 h-9 rounded-xl grid place-items-center text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Floating bar: shows everywhere EXCEPT Home (Home renders TimerCard inline) ───
export function TimerBar() {
  const ft = useStore((s) => s.focusTimer);
  const activeView = useStore((s) => s.activeView);
  if (!ft || activeView === 'dashboard') return null;
  return (
    <div className="fixed inset-x-0 z-40 px-3 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <div className="mx-auto w-full max-w-[460px] pointer-events-auto anim-pop">
        <TimerPanel />
      </div>
    </div>
  );
}

// ─── Inline card for the Home screen ───
export function TimerCard() {
  const ft = useStore((s) => s.focusTimer);
  if (!ft) return null;
  return <div className="anim-pop"><TimerPanel /></div>;
}

// ─── Launcher sheet: pick Timer (adjustable) or Stopwatch, then start ───
const PRESETS = [15, 25, 50];

export function TimerLauncher() {
  const tr = useT();
  const launcher = useStore((s) => s.timerLauncher);
  const { closeTimerLauncher, startTimer, gtdTasks, sessions, habits } = useStore();
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState(25);
  const [link, setLink] = useState<{linkType:'task'|'session'|'habit'|null;linkId:string|null;label:string}>({linkType:null,linkId:null,label:''});

  useEffect(() => { if (launcher) { setMode('countdown'); setMinutes(25); setLink(launcher); } }, [launcher]);

  if (!launcher) return null;

  const start = () => {
    ensureWebNotifPermission();
    startTimer({ mode, targetMinutes: minutes, ...link });
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 anim-backdrop" onClick={closeTimerLauncher} />
      <div className="fixed inset-x-0 bottom-0 z-[61] px-3 anim-sheet" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[460px] rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-4" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[17px] font-bold text-[var(--text)]">{tr('timer.start')}</h3>
            <button onClick={closeTimerLauncher} aria-label={tr('common.close')} className="w-8 h-8 rounded-full grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"><X className="w-4 h-4" /></button>
          </div>
          {launcher.label && <p className="text-[12px] text-[var(--text-dim)] truncate mb-3">{launcher.label}</p>}

          <TimerLinkPicker value={link} onChange={setLink} tasks={gtdTasks} sessions={sessions} habits={habits} />

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

          <button onClick={start} className="grad w-full h-12 rounded-2xl text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform" style={{ boxShadow: 'var(--shadow-primary)' }}>
            <Play className="w-4 h-4" />{tr('timer.startBtn')}
          </button>
        </div>
      </div>
    </>
  );
}

type TimerLink = { linkType: 'task' | 'session' | 'habit' | null; linkId: string | null; label: string };
function TimerLinkPicker({ value, onChange, tasks, sessions, habits }: { value: TimerLink; onChange: (value: TimerLink) => void; tasks: ReturnType<typeof useStore.getState>['gtdTasks']; sessions: ReturnType<typeof useStore.getState>['sessions']; habits: ReturnType<typeof useStore.getState>['habits'] }) {
  const tr = useT();
  const [kind, setKind] = useState<TimerLink['linkType']>(value.linkType);
  const options = kind === 'task' ? tasks.filter(t => t.status !== 'done' && t.status !== 'trash').map(t => ({ id: t.id, label: t.title }))
    : kind === 'session' ? sessions.filter(s => s.status !== 'done').map(s => ({ id: s.id, label: s.title }))
    : kind === 'habit' ? habits.filter(h => !h.archived).map(h => ({ id: h.id, label: h.title })) : [];
  const chooseKind = (next: TimerLink['linkType']) => { setKind(next); onChange({ linkType: next, linkId: null, label: '' }); };
  return <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
    <div className="flex items-center justify-between gap-2 mb-2"><span className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('timer.relatedTo')}</span><button onClick={() => chooseKind(null)} className="text-[11px] font-semibold text-[var(--primary)]">{tr('timer.noLink')}</button></div>
    <div className="grid grid-cols-3 gap-1.5 mb-2">{([['task',tr('timer.task')],['session',tr('timer.session')],['habit',tr('timer.habit')]] as const).map(([id,label])=><button key={id} onClick={()=>chooseKind(id)} className={`h-8 rounded-lg text-[11px] font-bold transition-colors ${kind===id?'bg-[var(--surface)] text-[var(--primary)] shadow-sm':'text-[var(--text-dim)]'}`}>{label}</button>)}</div>
    {kind && <select value={value.linkId || ''} onChange={e=>{const item=options.find(o=>o.id===e.target.value); onChange({linkType:kind,linkId:item?.id||null,label:item?.label||''});}} className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text)] outline-none"><option value="">{tr('timer.chooseItem')}</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>}
  </div>;
}

export function TimerAssignmentSheet() {
  const tr = useT();
  const { timerAssignmentOpen, closeTimerAssignment, assignTimerLink, gtdTasks, sessions, habits } = useStore();
  const [link, setLink] = useState<TimerLink>({linkType:null,linkId:null,label:''});
  useEffect(()=>{ if(timerAssignmentOpen) setLink({linkType:null,linkId:null,label:''}); },[timerAssignmentOpen]);
  if (!timerAssignmentOpen) return null;
  return <><div className="fixed inset-0 z-[70] bg-black/40 anim-backdrop" onClick={closeTimerAssignment}/><div className="fixed inset-x-0 bottom-0 z-[71] px-3 anim-sheet" style={{paddingBottom:'calc(env(safe-area-inset-bottom) + 12px)'}}><div className="mx-auto w-full max-w-[460px] rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-4"><div className="flex items-center justify-between mb-2"><h3 className="text-[17px] font-bold">{tr('timer.assignTitle')}</h3><button onClick={closeTimerAssignment} className="w-9 h-9 grid place-items-center rounded-full"><X className="w-4 h-4"/></button></div><TimerLinkPicker value={link} onChange={setLink} tasks={gtdTasks} sessions={sessions} habits={habits}/><button disabled={!link.linkId || !link.linkType} onClick={()=>link.linkId&&link.linkType&&assignTimerLink({linkType:link.linkType,linkId:link.linkId,label:link.label})} className="grad w-full h-12 rounded-2xl text-white text-[14px] font-bold disabled:opacity-40">{tr('timer.assign')}</button></div></div></>;
}
