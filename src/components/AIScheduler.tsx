import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { LifeBlock } from '../types';
import {
  Sparkles, Sun, Moon, Briefcase, Check, X, Wand2,
  Settings2, RotateCcw, Calendar,
  Heart, Utensils, Plus, Minus, Info, CheckCircle2
} from 'lucide-react';

const fmtTime = (mins: number) => {
  const m = ((mins % (24*60)) + 24*60) % (24*60);
  const h = Math.floor(m / 60), min = m % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2,'0')} ${ap}`;
};
const fmtDur = (mins: number) => mins >= 60 ? `${(mins/60).toFixed(mins%60?1:0)}h` : `${mins}m`;

// ── Life Balance Slider ──
function LifeSlider({ block }: { block: LifeBlock }) {
  const { updateLifeBlock } = useStore();
  const pct = ((block.hoursPerDay - block.minHours) / (block.maxHours - block.minHours)) * 100;
  const isRecommended = Math.abs(block.hoursPerDay - block.recommended) < 0.1;

  return (
    <div className={`rounded-2xl border p-4 transition-all ${block.enabled ? 'border-[var(--border)] bg-[var(--surface)]' : 'border-[var(--surface-2)] bg-[#080808] opacity-50'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${block.color}18` }}>{block.emoji}</div>
          <div>
            <div className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
              {block.label}
              {isRecommended && block.enabled && <span className="text-[11px] bg-[var(--primary)]/20 text-[var(--primary)] px-1.5 py-0.5 rounded font-bold">AI</span>}
            </div>
            <div className="text-[10px] text-[var(--text-dim)]">{block.description}</div>
          </div>
        </div>
        <button onClick={() => updateLifeBlock(block.id, { enabled: !block.enabled })}
          className={`w-9 h-5 rounded-full transition-all relative ${block.enabled ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}>
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${block.enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {block.enabled && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => updateLifeBlock(block.id, { hoursPerDay: Math.max(block.minHours, +(block.hoursPerDay - 0.25).toFixed(2)) })}
              className="w-6 h-6 rounded-lg bg-[var(--surface-2)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"><Minus className="w-3 h-3" /></button>
            <div className="flex-1 relative h-6 flex items-center">
              <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--border)]" />
              <div className="absolute h-1.5 rounded-full" style={{ width: `${pct}%`, background: block.color }} />
              {/* recommended marker */}
              <div className="absolute w-0.5 h-3 bg-[var(--primary)]/50" style={{ left: `${((block.recommended-block.minHours)/(block.maxHours-block.minHours))*100}%` }} />
              <input type="range" min={block.minHours} max={block.maxHours} step={0.25} value={block.hoursPerDay}
                onChange={e => updateLifeBlock(block.id, { hoursPerDay: Number(e.target.value) })}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" />
              <div className="absolute w-4 h-4 rounded-full bg-white border-2 shadow-lg pointer-events-none" style={{ left: `calc(${pct}% - 8px)`, borderColor: block.color }} />
            </div>
            <button onClick={() => updateLifeBlock(block.id, { hoursPerDay: Math.min(block.maxHours, +(block.hoursPerDay + 0.25).toFixed(2)) })}
              className="w-6 h-6 rounded-lg bg-[var(--surface-2)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"><Plus className="w-3 h-3" /></button>
            <div className="w-14 text-right shrink-0">
              <span className="text-[15px] font-bold text-[var(--text)] mono">{block.hoursPerDay}</span>
              <span className="text-[10px] text-[var(--text-dim)] ml-0.5">h/day</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Timeline Block ──
function TimelineBlock({ block }: { block: any }) {
  const t = useT();
  const { setBlockStatus } = useStore();
  const rejected = block.status === 'rejected';
  const accepted = block.status === 'accepted';
  return (
    <div className={`group relative flex gap-3 transition-all ${rejected ? 'opacity-30' : ''}`}>
      <div className="w-16 shrink-0 text-right pt-2">
        <div className="text-[11px] font-medium text-[var(--text)] mono">{fmtTime(block.startMinutes)}</div>
        <div className="text-[11px] text-[var(--text-dim)] mono">{fmtDur(block.durationMinutes)}</div>
      </div>
      <div className="relative flex flex-col items-center shrink-0">
        <div className="w-3 h-3 rounded-full border-2 mt-2.5" style={{ borderColor: block.color, background: accepted ? block.color : 'transparent' }} />
        <div className="w-px flex-1 bg-[var(--border)]" />
      </div>
      <div className="flex-1 pb-3">
        <div className="rounded-xl border p-3 transition-all" style={{
          borderColor: accepted ? `${block.color}50` : 'var(--border)',
          background: accepted ? `${block.color}0a` : 'var(--surface)',
        }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg shrink-0">{block.emoji}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text)] truncate">{block.title}</div>
                {block.reasoning && <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{block.reasoning}</div>}
              </div>
            </div>
            {!block.locked && (
              <div className="flex gap-1 hover-actions shrink-0">
                <button onClick={() => setBlockStatus(block.id, accepted ? 'proposed' : 'accepted')}
                  className={`w-6 h-6 rounded-lg grid place-items-center transition-colors ${accepted ? 'bg-emerald-500 text-black' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-emerald-400'}`}><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setBlockStatus(block.id, rejected ? 'proposed' : 'rejected')}
                  className={`w-6 h-6 rounded-lg grid place-items-center transition-colors ${rejected ? 'bg-red-500 text-white' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-red-400'}`}><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {block.locked && <span className="text-[11px] text-[var(--text-dim)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded shrink-0">{t('arch.fixed')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AIScheduler() {
  const t = useT();
  const { schedulePrefs, generatedDay, isGenerating, goals, gtdTasks, generateAISchedule, acceptAllBlocks, commitGeneratedDay, clearGenerated, updatePrefs } = useStore();
  const [tab, setTab] = useState<'setup' | 'result'>('setup');

  const totalEssential = schedulePrefs.lifeBlocks.filter(b => b.enabled && b.category==='essential').reduce((a,b)=>a+b.hoursPerDay,0);
  const totalWellbeing = schedulePrefs.lifeBlocks.filter(b => b.enabled && (b.category==='wellbeing'||b.category==='social')).reduce((a,b)=>a+b.hoursPerDay,0);
  const freeHours = Math.max(0, 24 - totalEssential - totalWellbeing - (schedulePrefs.hasWork ? 8 : 0));

  const activeGoals = goals.length;
  const nextActions = gtdTasks.filter(t=>t.status==='next-action').length;

  const handleGenerate = () => { generateAISchedule(); setTab('result'); };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 md:py-6 border-b border-[var(--surface-2)] shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--primary)] via-[var(--primary-2)] to-[var(--primary-2)] flex items-center justify-center shadow-lg shadow-[var(--primary)]/20">
              <Wand2 className="w-5 h-5 text-[var(--text)]" />
            </div>
            <div>
              <h1 className="display text-[28px] text-[var(--text)]">{t('nav.architect')}</h1>
              <p className="text-[12px] text-[var(--text-dim)]">{t('arch.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab('setup')} className={`h-9 px-4 rounded-xl text-[12px] font-medium transition-all ${tab==='setup'?'bg-[var(--surface-2)] text-[var(--text)]':'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              <Settings2 className="w-3.5 h-3.5 inline mr-1.5" />{t('arch.preferences')}
            </button>
            <button onClick={() => setTab('result')} className={`h-9 px-4 rounded-xl text-[12px] font-medium transition-all ${tab==='result'?'bg-[var(--surface-2)] text-[var(--text)]':'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              <Calendar className="w-3.5 h-3.5 inline mr-1.5" />{t('nav.schedule')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'setup' && (
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {/* Hero generate */}
            <div className="rounded-3xl border border-[var(--primary)]/20 bg-gradient-to-br from-[var(--primary)]/10 via-[var(--surface)] to-[var(--surface)] p-6 anim-fade">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                <div className="flex-1">
                  <h2 className="text-[18px] font-bold text-[var(--text)] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--primary)]" />{t('arch.ready')}</h2>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1.5 leading-relaxed max-w-md">{t('arch.readyDesc',{goals:activeGoals,actions:nextActions})}</p>
                  <div className="flex gap-4 mt-3">
                    <div><div className="text-[20px] font-bold text-[var(--text)] mono">{freeHours.toFixed(1)}{t('common.hourShort')}</div><div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider">{t('arch.freeForGoals')}</div></div>
                    <div className="w-px bg-[var(--border)]" />
                    <div><div className="text-[20px] font-bold text-[var(--text)] mono">{totalEssential.toFixed(1)}{t('common.hourShort')}</div><div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider">{t('arch.essentials')}</div></div>
                    <div className="w-px bg-[var(--border)]" />
                    <div><div className="text-[20px] font-bold text-[var(--text)] mono">{totalWellbeing.toFixed(1)}{t('common.hourShort')}</div><div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider">{t('arch.wellbeing')}</div></div>
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={isGenerating}
                  className="h-14 px-7 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/30 hover:shadow-[var(--primary)]/50 transition-all shrink-0 disabled:opacity-50 w-full md:w-auto">
                  {isGenerating ? <><RotateCcw className="w-5 h-5 animate-spin" />{t('arch.generating')}</> : <><Wand2 className="w-5 h-5" />{t('arch.generate')}</>}
                </button>
              </div>
            </div>

            {/* Schedule basics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-fade anim-delay-1">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4">{t('arch.dailyRhythm')}</div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Sun className="w-4 h-4 text-amber-400" />{t('settings.wake')}</span>
                    <input type="time" value={schedulePrefs.wakeTime} onChange={e=>updatePrefs({wakeTime:e.target.value})} className="h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Moon className="w-4 h-4 text-indigo-400" />{t('settings.sleep')}</span>
                    <input type="time" value={schedulePrefs.sleepTime} onChange={e=>updatePrefs({sleepTime:e.target.value})} className="h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-[var(--text-dim)] block mb-2">{t('arch.peak')}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['morning','afternoon','evening'] as const).map(p => (
                        <button key={p} onClick={()=>updatePrefs({productivityPeak:p})}
                          className={`h-8 rounded-lg text-[11px] border transition-all ${schedulePrefs.productivityPeak===p?'bg-[var(--primary)]/20 border-[var(--primary)]/50 text-[var(--primary)]':'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{t('settings.'+p)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4">{t('arch.workFasting')}</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Briefcase className="w-4 h-4 text-slate-400" />{t('arch.haveWork')}</span>
                    <button onClick={()=>updatePrefs({hasWork:!schedulePrefs.hasWork})} className={`w-9 h-5 rounded-full relative transition-all ${schedulePrefs.hasWork?'bg-emerald-500':'bg-[var(--border)]'}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${schedulePrefs.hasWork?'left-[18px]':'left-0.5'}`} /></button>
                  </div>
                  {schedulePrefs.hasWork && (
                    <div className="flex items-center gap-2">
                      <input type="time" value={schedulePrefs.workStart} onChange={e=>updatePrefs({workStart:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                      <span className="text-[var(--text-dim)] text-[11px]">{t('arch.to')}</span>
                      <input type="time" value={schedulePrefs.workEnd} onChange={e=>updatePrefs({workEnd:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--surface-2)]">
                    <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Utensils className="w-4 h-4 text-amber-400" />{t('arch.fastingToday')}</span>
                    <button onClick={()=>updatePrefs({fasting:!schedulePrefs.fasting})} className={`w-9 h-5 rounded-full relative transition-all ${schedulePrefs.fasting?'bg-emerald-500':'bg-[var(--border)]'}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${schedulePrefs.fasting?'left-[18px]':'left-0.5'}`} /></button>
                  </div>
                  {schedulePrefs.fasting && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {[['16:8','16:8'],['full-day',t('arch.fastingFullDay')],['ramadan',t('arch.fastingRamadan')]].map(([v,l])=>(
                        <button key={v} onClick={()=>updatePrefs({fastingType:v})} className={`h-8 rounded-lg text-[10px] border transition-all ${schedulePrefs.fastingType===v?'bg-amber-500/20 border-amber-500/50 text-amber-300':'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{l}</button>
                      ))}
                    </div>
                  )}
                  {schedulePrefs.fasting && <p className="text-[10px] text-amber-400/60 leading-snug">{t('arch.fastingNote')}</p>}
                </div>
              </div>
            </div>

            {/* Life balance sliders */}
            <div className="anim-fade anim-delay-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text)] flex items-center gap-2"><Heart className="w-4 h-4 text-[var(--primary-2)]" />{t('arch.lifeBalance')}</h3>
                  <p className="text-[11px] text-[var(--text-dim)]">{t('arch.lifeBalanceDesc')}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]"><div className="w-0.5 h-3 bg-[var(--primary)]/50" /> {t('arch.aiRecommended')}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {schedulePrefs.lifeBlocks.map(b => <LifeSlider key={b.id} block={b} />)}
              </div>
            </div>
          </div>
        )}

        {tab === 'result' && (
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-24 anim-fade">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center mb-6 animate-pulse">
                  <Wand2 className="w-7 h-7 text-[var(--text)]" />
                </div>
                <h3 className="text-[18px] font-bold text-[var(--text)]">{t('arch.architecting')}</h3>
                <div className="mt-4 space-y-2 text-[12px] text-[var(--text-dim)]">
                  {[t('arch.step1'),t('arch.step2'),t('arch.step3'),t('arch.step4'),t('arch.step5')].map((s,i)=>(
                    <div key={i} className="flex items-center gap-2 anim-fade" style={{animationDelay:`${i*0.25}s`}}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{s}</div>
                  ))}
                </div>
              </div>
            ) : generatedDay ? (
              <div className="anim-fade">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-[20px] font-bold text-[var(--text)]">{t('arch.generatedTitle')}</h2>
                    <p className="text-[12px] text-[var(--text-dim)]">{t('arch.blocksAccepted',{a:generatedDay.blocks.filter(b=>b.status==='accepted').length,b:generatedDay.blocks.length})}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={clearGenerated} className="h-9 px-4 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{t('arch.discard')}</button>
                    <button onClick={acceptAllBlocks} className="h-9 px-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--border)]"><Check className="w-4 h-4" />{t('arch.acceptAll')}</button>
                    {(() => {
                      const acceptedCount = generatedDay.blocks.filter(b => b.status === 'accepted' && !b.locked).length;
                      return (
                        <button onClick={commitGeneratedDay} disabled={acceptedCount === 0}
                          title={acceptedCount === 0 ? t('arch.nothingAccepted') : undefined}
                          className="h-9 px-4 rounded-xl bg-emerald-500 text-black text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-40 hover:bg-emerald-400 transition-colors">
                          <Calendar className="w-4 h-4" />{t('arch.addToSchedule')}{acceptedCount > 0 ? ` (${acceptedCount})` : ''}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  {generatedDay.blocks.map(b => <TimelineBlock key={b.id} block={b} />)}
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[var(--text)] leading-relaxed">{t('arch.infoNote')}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] grid place-items-center mb-4"><Calendar className="w-6 h-6 text-[var(--text-dim)]" /></div>
                <h3 className="text-[16px] font-medium text-[var(--text)]">{t('arch.noSchedule')}</h3>
                <p className="text-[12px] text-[var(--text-dim)] mt-1 mb-5">{t('arch.noScheduleDesc')}</p>
                <button onClick={handleGenerate} className="h-11 px-6 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] text-white font-bold text-[13px] flex items-center gap-2"><Wand2 className="w-4 h-4" />{t('arch.generate')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
