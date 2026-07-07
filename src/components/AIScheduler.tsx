import { useState } from 'react';
import { useBackClose } from '../hooks/useHardwareBack';
import { useStore } from '../store';
import { useT, useDateLocale } from '../i18n';
import type { LifeBlock, FixedCommitment } from '../types';
import { addDays, format, startOfWeek } from 'date-fns';
import {
  Sparkles, Sun, Moon, Briefcase, Check, X, Wand2,
  Settings2, RotateCcw, Calendar, Coffee, Trash2, Pencil,
  Heart, Utensils, Plus, Minus, Info, CheckCircle2, BookOpen
} from 'lucide-react';

const fmtTime = (mins: number) => {
  const m = ((mins % (24*60)) + 24*60) % (24*60);
  const h = Math.floor(m / 60), min = m % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2,'0')} ${ap}`;
};
const fmtDur = (mins: number) => mins >= 60 ? `${(mins/60).toFixed(mins%60?1:0)}h` : `${mins}m`;

// Default life blocks render localized regardless of the language they were stored in.
const LB_IDS = new Set(['work', 'sleep', 'breakfast', 'lunch', 'dinner', 'exercise', 'friends', 'relax', 'commute']);
export const lbLabel = (id: string | undefined, fallback: string, t: (k: string) => string) =>
  id && LB_IDS.has(id) ? t('lb.' + id) : fallback;
export const lbDesc = (id: string | undefined, fallback: string, t: (k: string) => string) =>
  id && LB_IDS.has(id) ? t('lb.' + id + '.d') : fallback;

// ── Life Balance Slider ──
function LifeSlider({ block }: { block: LifeBlock }) {
  const t = useT();
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
              {lbLabel(block.id, block.label, t)}
              {isRecommended && block.enabled && <span className="text-[11px] bg-[var(--primary)]/20 text-[var(--primary)] px-1.5 py-0.5 rounded font-bold">AI</span>}
            </div>
            <div className="text-[10px] text-[var(--text-dim)]">{lbDesc(block.id, block.description, t)}</div>
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
          {block.id === 'sleep' && block.hoursPerDay > 10 && (
            <p className="mt-2.5 text-[11px] leading-snug text-amber-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />{t('arch.sleepWarn')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Fixed commitments (study, gym class, …) ──
const EMOJI_PICKS = ['📚', '🏫', '🏋️', '⚽', '🎾', '🎹', '🎨', '🧑‍💻', '🩺', '🚗', '📌'];

function CommitmentEditor({ initial, onSave, onCancel }: { initial: FixedCommitment | null; onSave: (c: Omit<FixedCommitment, 'id'>) => void; onCancel: () => void }) {
  const t = useT();
  const locale = useDateLocale();
  const weekStartsOn = useStore(s => s.schedulePrefs.weekStartsOn ?? 1);
  const [title, setTitle] = useState(initial?.title || '');
  const [emoji, setEmoji] = useState(initial?.emoji || '📚');
  const [start, setStart] = useState(initial?.start || '09:00');
  const [end, setEnd] = useState(initial?.end || '12:00');
  const [days, setDays] = useState<number[]>(initial?.days || [1, 3, 5]);
  const [hasBreak, setHasBreak] = useState(!!initial?.breakStart);
  const [breakStart, setBreakStart] = useState(initial?.breakStart || '13:00');
  const [breakEnd, setBreakEnd] = useState(initial?.breakEnd || '14:00');

  const ws = startOfWeek(new Date(), { weekStartsOn });
  const dayOpts = Array.from({ length: 7 }, (_, i) => { const d = addDays(ws, i); return { wd: d.getDay(), label: format(d, 'EEEEEE', { locale }) }; });
  const toggleDay = (wd: number) => setDays(p => p.includes(wd) ? p.filter(x => x !== wd) : [...p, wd]);
  const valid = title.trim().length > 0 && days.length > 0 && end > start;

  return (
    <div className="rounded-2xl border border-[var(--primary)]/30 bg-[var(--surface)] p-4 space-y-3">
      <div className="flex gap-2">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={40} placeholder={t('arch.commitTitlePh')}
          className="flex-1 h-10 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--primary)]" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {EMOJI_PICKS.map(e => (
          <button key={e} onClick={() => setEmoji(e)} className={`w-9 h-9 rounded-xl grid place-items-center text-[17px] border transition-all ${emoji === e ? 'border-[var(--primary)] bg-[var(--primary)]/15' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>{e}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {dayOpts.map(o => (
          <button key={o.wd} onClick={() => toggleDay(o.wd)}
            className={`flex-1 h-9 rounded-xl text-[11px] font-bold uppercase border transition-all ${days.includes(o.wd) ? 'grad border-transparent text-white' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>{o.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="time" value={start} onChange={e => setStart(e.target.value)} className="flex-1 h-9 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
        <span className="text-[var(--text-dim)] text-[11px]">{t('arch.to')}</span>
        <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="flex-1 h-9 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Coffee className="w-4 h-4 text-amber-400" />{t('arch.workBreak')}</span>
        <button onClick={() => setHasBreak(v => !v)} className={`w-9 h-5 rounded-full relative transition-all ${hasBreak ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${hasBreak ? 'left-[18px]' : 'left-0.5'}`} /></button>
      </div>
      {hasBreak && (
        <div className="flex items-center gap-2">
          <input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)} className="flex-1 h-9 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
          <span className="text-[var(--text-dim)] text-[11px]">{t('arch.to')}</span>
          <input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)} className="flex-1 h-9 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] focus:outline-none" />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="h-10 px-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-bold text-[var(--text)]">{t('common.cancel')}</button>
        <button disabled={!valid}
          onClick={() => onSave({ title: title.trim(), emoji, start, end, days: [...days].sort(), enabled: initial?.enabled ?? true, breakStart: hasBreak ? breakStart : undefined, breakEnd: hasBreak ? breakEnd : undefined })}
          className="grad flex-1 h-10 rounded-xl text-white text-[12px] font-bold disabled:opacity-40">{t('common.save')}</button>
      </div>
    </div>
  );
}

function CommitmentsSection() {
  const t = useT();
  const locale = useDateLocale();
  const { schedulePrefs, addCommitment, updateCommitment, removeCommitment } = useStore();
  const weekStartsOn = schedulePrefs.weekStartsOn ?? 1;
  const [editing, setEditing] = useState<FixedCommitment | 'new' | null>(null);
  useBackClose(editing !== null, () => setEditing(null));
  const commitments = schedulePrefs.commitments || [];

  const ws = startOfWeek(new Date(), { weekStartsOn });
  const dayLabel = new Map(Array.from({ length: 7 }, (_, i) => { const d = addDays(ws, i); return [d.getDay(), format(d, 'EEEEEE', { locale })] as const; }));

  return (
    <div className="anim-fade anim-delay-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--text)] flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--primary-2)]" />{t('arch.commitments')}</h3>
          <p className="text-[11px] text-[var(--text-dim)]">{t('arch.commitmentsDesc')}</p>
        </div>
        {editing === null && (
          <button onClick={() => setEditing('new')} className="h-9 px-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-bold text-[var(--text)] flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" />{t('arch.addCommitment')}</button>
        )}
      </div>
      <div className="space-y-2.5">
        {commitments.map(c => (
          editing !== 'new' && editing?.id === c.id
            ? <CommitmentEditor key={c.id} initial={c} onCancel={() => setEditing(null)} onSave={patch => { updateCommitment(c.id, patch); setEditing(null); }} />
            : <div key={c.id} className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 flex items-center gap-3 ${c.enabled ? '' : 'opacity-50'}`}>
                <div className="w-10 h-10 rounded-xl grid place-items-center text-[18px] bg-[var(--surface-2)] shrink-0">{c.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[var(--text)] truncate">{c.title}</div>
                  <div className="text-[11px] text-[var(--text-dim)] mono">
                    {c.start}–{c.end}{c.breakStart ? ` · ☕ ${c.breakStart}–${c.breakEnd}` : ''} · <span className="uppercase">{[...c.days].sort().map(d => dayLabel.get(d)).join(' ')}</span>
                  </div>
                </div>
                <button onClick={() => setEditing(c)} aria-label={t('sm.edit')} className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => updateCommitment(c.id, { enabled: !c.enabled })}
                  className={`w-9 h-5 rounded-full relative transition-all shrink-0 ${c.enabled ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${c.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button>
                <button onClick={() => removeCommitment(c.id)} aria-label={t('common.delete')} className="w-9 h-9 rounded-xl grid place-items-center bg-red-500/10 text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
        ))}
        {editing === 'new' && <CommitmentEditor initial={null} onCancel={() => setEditing(null)} onSave={c => { addCommitment(c); setEditing(null); }} />}
        {commitments.length === 0 && editing === null && (
          <button onClick={() => setEditing('new')} className="w-full rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-[12px] text-[var(--text-dim)] hover:border-[var(--primary)]/40 transition-colors">
            {t('arch.commitmentsEmpty')}
          </button>
        )}
      </div>
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
  // Real fixed load: work minus its break, plus commitments averaged over the week.
  const hmm = (v?: string) => { if (!v) return 0; const [h, m] = v.split(':').map(Number); return h + (m || 0) / 60; };
  const workHours = schedulePrefs.hasWork
    ? Math.max(0, hmm(schedulePrefs.workEnd) - hmm(schedulePrefs.workStart) - Math.max(0, hmm(schedulePrefs.workBreakEnd) - hmm(schedulePrefs.workBreakStart))) * (5 / 7)
    : 0;
  const commitHours = (schedulePrefs.commitments || []).filter(c => c.enabled).reduce((a, c) =>
    a + Math.max(0, hmm(c.end) - hmm(c.start) - Math.max(0, hmm(c.breakEnd) - hmm(c.breakStart))) * (c.days?.length || 0) / 7, 0);
  const freeHours = Math.max(0, 24 - totalEssential - totalWellbeing - workHours - commitHours);

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
                    <>
                      <div className="flex items-center gap-2">
                        <input type="time" value={schedulePrefs.workStart} onChange={e=>updatePrefs({workStart:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                        <span className="text-[var(--text-dim)] text-[11px]">{t('arch.to')}</span>
                        <input type="time" value={schedulePrefs.workEnd} onChange={e=>updatePrefs({workEnd:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[var(--text)]"><Coffee className="w-4 h-4 text-amber-400" />{t('arch.workBreak')}</span>
                        <button onClick={()=>updatePrefs(schedulePrefs.workBreakStart ? {workBreakStart:undefined,workBreakEnd:undefined} : {workBreakStart:'13:00',workBreakEnd:'14:00'})}
                          className={`w-9 h-5 rounded-full relative transition-all ${schedulePrefs.workBreakStart?'bg-emerald-500':'bg-[var(--border)]'}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${schedulePrefs.workBreakStart?'left-[18px]':'left-0.5'}`} /></button>
                      </div>
                      {schedulePrefs.workBreakStart && (
                        <>
                          <div className="flex items-center gap-2">
                            <input type="time" value={schedulePrefs.workBreakStart} onChange={e=>updatePrefs({workBreakStart:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                            <span className="text-[var(--text-dim)] text-[11px]">{t('arch.to')}</span>
                            <input type="time" value={schedulePrefs.workBreakEnd || '14:00'} onChange={e=>updatePrefs({workBreakEnd:e.target.value})} className="flex-1 h-8 px-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none" />
                          </div>
                          <p className="text-[10px] text-[var(--text-dim)] leading-snug">{t('arch.workBreakNote')}</p>
                        </>
                      )}
                    </>
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

            {/* Fixed commitments (study, gym, …) */}
            <CommitmentsSection />

            {/* Life balance sliders */}
            <div className="anim-fade anim-delay-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text)] flex items-center gap-2"><Heart className="w-4 h-4 text-[var(--primary-2)]" />{t('arch.lifeBalance')}</h3>
                  <p className="text-[11px] text-[var(--text-dim)]">{t('arch.lifeBalanceDesc')}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]"><div className="w-0.5 h-3 bg-[var(--primary)]/50" /> {t('arch.aiRecommended')}</div>
              </div>
              {freeHours <= 0 && (
                <div className="mb-3 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-3.5 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[var(--text)] leading-relaxed">{t('arch.dayFull')}</p>
                </div>
              )}
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
