import { useState } from 'react';
import { useStore } from '../store';
import { useT, useDateLocale } from '../i18n';
import type { PlanHorizon, PlanOptions, PlanIntensity, GeneratedDay, GeneratedBlock } from '../types';
import { format, parseISO, differenceInCalendarWeeks } from 'date-fns';
import { aiConfigured } from '../scheduler';
import { lbLabel } from './AIScheduler';
import {
  Wand2, Sparkles, Target, Flame, Repeat2, CheckSquare, Calendar,
  Check, X, RotateCcw, ChevronDown, CalendarRange, Info, WifiOff,
} from 'lucide-react';

const fmtTime = (mins: number) => {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60), min = m % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
};
const fmtDur = (mins: number) => (mins >= 60 ? `${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h` : `${mins}m`);

const HORIZONS: PlanHorizon[] = ['1w', '2w', '3w', '4w'];

export function AIPlanner() {
  const t = useT();
  const locale = useDateLocale();
  const store = useStore();
  const { generatedPlan, isPlanning, goals, habits, gtdTasks,
    generatePlan, regeneratePlan, acceptAllPlanBlocks, commitPlan, clearPlan } = store;

  const [tab, setTab] = useState<'setup' | 'preview'>('setup');
  const [horizon, setHorizon] = useState<PlanHorizon>('2w');
  const [options, setOptions] = useState<PlanOptions>({ includeGoals: true, includeHabits: true, includeRecurring: true, includeTasks: true });
  const [intensity, setIntensity] = useState<PlanIntensity>('balanced');
  const [wishes, setWishes] = useState('');
  const [drill, setDrill] = useState<string | null>(null);
  const hasAi = aiConfigured();

  const activeGoals = goals.filter(g => (g.status ?? 'active') !== 'completed').length;
  const trackedHabits = habits.filter(h => !h.archived).length;
  const recurring = gtdTasks.filter(t => t.recurring && t.status !== 'done' && t.status !== 'trash' && !t.isArchived).length;
  const openTasks = gtdTasks.filter(t => !t.recurring && t.status !== 'done' && t.status !== 'trash' && !t.isArchived && (t.scheduledDate || t.dueDate)).length;

  const sources = [
    { key: 'includeGoals' as const, Ic: Target, c: '#6467f2', label: t('bottomNav.goals'), n: activeGoals },
    { key: 'includeHabits' as const, Ic: Flame, c: '#e0532f', label: t('bottomNav.habits'), n: trackedHabits },
    { key: 'includeRecurring' as const, Ic: Repeat2, c: '#0d9488', label: t('overview.recurring'), n: recurring },
    { key: 'includeTasks' as const, Ic: CheckSquare, c: '#eab308', label: t('overview.tasks'), n: openTasks },
  ];

  const handleGenerate = () => {
    generatePlan(horizon, { ...options, intensity, instructions: wishes.trim() || undefined });
    setTab('preview'); setDrill(null);
  };

  const allBlocks = generatedPlan ? generatedPlan.days.flatMap(d => d.blocks).filter(b => !b.locked) : [];
  const acceptedCount = allBlocks.filter(b => b.status === 'accepted').length;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 md:py-6 border-b border-[var(--surface-2)] shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center shadow-lg shadow-[var(--primary)]/20">
              <CalendarRange className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="display text-[26px] md:text-[28px] text-[var(--text)]">{t('planner.title')}</h1>
              <p className="text-[12px] text-[var(--text-dim)]">{t('planner.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab('setup')} className={`h-9 px-4 rounded-xl text-[12px] font-medium transition-all ${tab === 'setup' ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{t('planner.setup')}</button>
            <button onClick={() => setTab('preview')} className={`h-9 px-4 rounded-xl text-[12px] font-medium transition-all ${tab === 'preview' ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{t('planner.preview')}</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-8">
        {tab === 'setup' && (
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {/* Horizon */}
            <div className="anim-fade">
              <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-3">{t('planner.horizon')}</div>
              <div className="grid grid-cols-4 gap-2">
                {HORIZONS.map(h => (
                  <button key={h} onClick={() => setHorizon(h)} className={`h-12 rounded-xl text-[13px] font-bold border transition-all ${horizon === h ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                    {t('planner.weeks', { n: Number(h[0]) })}
                  </button>
                ))}
              </div>
            </div>

            {/* Sources */}
            <div className="anim-fade anim-delay-1">
              <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-3">{t('planner.include')}</div>
              <div className="grid grid-cols-2 gap-3">
                {sources.map(src => {
                  const on = options[src.key];
                  return (
                    <button key={src.key} onClick={() => setOptions(o => ({ ...o, [src.key]: !o[src.key] }))}
                      className={`tcard p-4 flex items-center gap-3 text-left transition-all ${on ? '' : 'opacity-50'}`}>
                      <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${src.c}18`, color: src.c }}><src.Ic className="w-[18px] h-[18px]" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-[var(--text)] leading-tight">{src.label}</div>
                        <div className="text-[11px] text-[var(--text-dim)]">{t('planner.nAvailable', { n: src.n })}</div>
                      </div>
                      <div className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${on ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Intensity */}
            <div className="anim-fade anim-delay-1">
              <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-3">{t('planner.intensity')}</div>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'balanced', 'intense'] as const).map(i => (
                  <button key={i} onClick={() => setIntensity(i)} className={`h-12 rounded-xl text-[13px] font-bold border transition-all ${intensity === i ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                    {t('planner.int.' + i)}
                  </button>
                ))}
              </div>
            </div>

            {/* Wishes for the AI */}
            {hasAi && (
              <div className="anim-fade anim-delay-2">
                <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-3">{t('planner.wishes')}</div>
                <textarea value={wishes} onChange={e => setWishes(e.target.value)} rows={2} maxLength={500}
                  placeholder={t('planner.wishesPh')}
                  className="w-full rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-[13px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--primary)] resize-none transition-colors" />
              </div>
            )}

            {/* Prefs hint + provider */}
            <div className="anim-fade anim-delay-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[12px] text-[var(--text)] leading-relaxed">{t('planner.prefsHint')}</p>
                <button onClick={() => store.setActiveView('architect')} className="text-[12px] font-bold text-[var(--primary)] mt-1">{t('planner.openPrefs')} →</button>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 flex items-center gap-1 ${hasAi ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--text-dim)] bg-[var(--surface-2)]'}`}><Sparkles className="w-3 h-3" />{hasAi ? t('planner.providerAi') : t('planner.providerRuleBased')}</span>
            </div>

            {/* Generate */}
            <button onClick={handleGenerate} disabled={isPlanning || !Object.values(options).some(Boolean)}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/30 hover:shadow-[var(--primary)]/50 transition-all disabled:opacity-50 anim-fade anim-delay-2">
              {isPlanning ? <><RotateCcw className="w-5 h-5 animate-spin" />{t('planner.generating')}</> : <><Wand2 className="w-5 h-5" />{t('planner.generate')}</>}
            </button>
          </div>
        )}

        {tab === 'preview' && (
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
            {isPlanning ? (
              <div className="flex flex-col items-center justify-center py-24 anim-fade">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center mb-6 animate-pulse"><CalendarRange className="w-7 h-7 text-white" /></div>
                <h3 className="text-[18px] font-bold text-[var(--text)]">{t('planner.building')}</h3>
              </div>
            ) : generatedPlan ? (
              <div className="anim-fade">
                {/* AI fallback notice */}
                {generatedPlan.fallback && (
                  <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 flex items-start gap-2.5">
                    <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[var(--text)] leading-relaxed">{t('planner.fallbackNotice')}</p>
                  </div>
                )}
                {/* AI advice */}
                {generatedPlan.advice && (
                  <div className="mb-4 rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/[0.07] p-3.5 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[var(--text)] leading-relaxed">{generatedPlan.advice}</p>
                  </div>
                )}
                {/* Action bar */}
                <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--text)]">{t('planner.yourPlan')}</h2>
                    <p className="text-[12px] text-[var(--text-dim)]">{t('planner.rangeLabel', { a: format(parseISO(generatedPlan.range.start), 'MMM d', { locale }), b: format(parseISO(generatedPlan.range.end), 'MMM d', { locale }) })} · {t('planner.nAccepted', { a: acceptedCount, b: allBlocks.length })}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={clearPlan} className="h-9 px-3 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{t('planner.discard')}</button>
                    <button onClick={regeneratePlan} className="h-9 px-3 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />{t('planner.regenerate')}</button>
                    <button onClick={acceptAllPlanBlocks} className="h-9 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--border)]"><Check className="w-4 h-4" />{t('planner.acceptAll')}</button>
                    <button onClick={commitPlan} disabled={acceptedCount === 0} className="h-9 px-4 rounded-xl bg-emerald-500 text-black text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-40 hover:bg-emerald-400 transition-colors"><Calendar className="w-4 h-4" />{t('planner.addToSchedule')}{acceptedCount > 0 ? ` (${acceptedCount})` : ''}</button>
                  </div>
                </div>

                {/* Weeks */}
                {weekGroups(generatedPlan.days).map((wk, wi) => (
                  <div key={wi} className="mb-6">
                    <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-2">
                      {t('planner.weekN', { n: wi + 1 })} · {format(parseISO(wk[0].date), 'MMM d', { locale })} – {format(parseISO(wk[wk.length - 1].date), 'MMM d', { locale })}
                    </div>
                    <div className="space-y-2">
                      {wk.map(day => <DayRow key={day.date} day={day} open={drill === day.date} onToggle={() => setDrill(drill === day.date ? null : day.date)} locale={locale} t={t} store={store} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] grid place-items-center mb-4"><CalendarRange className="w-6 h-6 text-[var(--text-dim)]" /></div>
                <h3 className="text-[16px] font-medium text-[var(--text)]">{t('planner.empty')}</h3>
                <p className="text-[12px] text-[var(--text-dim)] mt-1 mb-5">{t('planner.emptyDesc')}</p>
                <button onClick={() => setTab('setup')} className="h-11 px-6 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white font-bold text-[13px] flex items-center gap-2"><Wand2 className="w-4 h-4" />{t('planner.setup')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// One day: compact chip row that expands into a per-block timeline.
function DayRow({ day, open, onToggle, locale, t, store }: { day: GeneratedDay; open: boolean; onToggle: () => void; locale: any; t: any; store: any }) {
  const editable = day.blocks.filter(b => !b.locked);
  const accepted = editable.filter(b => b.status === 'accepted').length;
  const date = parseISO(day.date);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
        <div className="w-11 shrink-0 text-center">
          <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase">{format(date, 'EEE', { locale })}</div>
          <div className="text-[16px] font-bold text-[var(--text)] mono leading-none">{format(date, 'd', { locale })}</div>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
          {editable.length === 0 && <span className="text-[11px] text-[var(--text-dim)]">{t('planner.freeDay')}</span>}
          {editable.slice(0, 7).map(b => (
            <span key={b.id} className={`w-6 h-6 rounded-md grid place-items-center text-[12px] shrink-0 ${b.status === 'rejected' ? 'opacity-30 grayscale' : ''}`} style={{ background: `${b.color}1f` }}>{b.emoji}</span>
          ))}
          {editable.length > 7 && <span className="text-[10px] text-[var(--text-dim)]">+{editable.length - 7}</span>}
        </div>
        <span className="text-[10px] font-bold text-[var(--text-dim)] shrink-0">{accepted}/{editable.length}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--text-dim)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-3 space-y-1.5">
          {day.blocks.map(b => <BlockRow key={b.id} block={b} date={day.date} t={t} store={store} />)}
        </div>
      )}
    </div>
  );
}

function BlockRow({ block, date, t, store }: { block: GeneratedBlock; date: string; t: any; store: any }) {
  const rejected = block.status === 'rejected';
  const accepted = block.status === 'accepted';
  const reason = block.reasoning?.startsWith('plan.r.') ? t(block.reasoning) : block.reasoning;
  const title = block.sourceKind === 'life' ? lbLabel(block.sourceId, block.title, t) : block.title;
  return (
    <div className={`group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all ${rejected ? 'opacity-40' : ''}`} style={{ borderColor: accepted ? `${block.color}55` : 'var(--border)', background: accepted ? `${block.color}0c` : 'var(--surface-2)' }}>
      <div className="w-12 shrink-0 text-[10px] text-[var(--text-dim)] mono leading-tight">{fmtTime(block.startMinutes)}<br />{fmtDur(block.durationMinutes)}</div>
      <span className="text-base shrink-0">{block.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-[var(--text)] truncate">{title}</div>
        {reason && <div className="text-[10px] text-[var(--text-dim)] truncate">{reason}</div>}
      </div>
      {block.locked ? (
        <span className="text-[10px] text-[var(--text-dim)] bg-[var(--surface)] px-1.5 py-0.5 rounded shrink-0">{t('arch.fixed')}</span>
      ) : (
        <div className="flex gap-1 shrink-0">
          <button onClick={() => store.setPlanBlockStatus(date, block.id, accepted ? 'proposed' : 'accepted')} className={`w-6 h-6 rounded-lg grid place-items-center transition-colors ${accepted ? 'bg-emerald-500 text-black' : 'bg-[var(--surface)] text-[var(--text-dim)] hover:text-emerald-500'}`}><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => store.setPlanBlockStatus(date, block.id, rejected ? 'proposed' : 'rejected')} className={`w-6 h-6 rounded-lg grid place-items-center transition-colors ${rejected ? 'bg-red-500 text-white' : 'bg-[var(--surface)] text-[var(--text-dim)] hover:text-red-400'}`}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}

// Split the flat day list into ISO-week chunks for display.
function weekGroups(days: GeneratedDay[]): GeneratedDay[][] {
  if (!days.length) return [];
  const start = parseISO(days[0].date);
  const out: GeneratedDay[][] = [];
  for (const d of days) {
    const wi = differenceInCalendarWeeks(parseISO(d.date), start, { weekStartsOn: 1 });
    (out[wi] ||= []).push(d);
  }
  return out.filter(Boolean);
}
