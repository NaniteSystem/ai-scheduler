import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { CATEGORY_META } from '../types';
import type { Goal, RoadmapDepth, Category } from '../types';
import { requestRoadmap, requestRoadmapQuestions, type RoadmapResult } from '../ai/roadmap';
import { useBackClose } from '../hooks/useHardwareBack';
import { AiOfflineError } from '../ai/llm';
import { X, ArrowLeft, ArrowRight, Wand2, Sparkles, RotateCcw, AlertTriangle, WifiOff, Check, Edit2 } from 'lucide-react';
import { createId } from '../domain/id';

type Step = 'mode' | 'intent' | 'manual' | 'depth' | 'disclaimer' | 'questions' | 'generating' | 'refuse' | 'error';
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

  const [step, setStep] = useState<Step>('mode');
  const [intent, setIntent] = useState('');
  const [manualSub, setManualSub] = useState('');
  const [manualCat, setManualCat] = useState<Category>('personal');
  const [depth, setDepth] = useState<RoadmapDepth>('medium');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [refuse, setRefuse] = useState<Extract<RoadmapResult, { status: 'refuse' }> | null>(null);
  const [errKind, setErrKind] = useState<ErrKind>('unavailable');

  const close = () => store.closeWizard();

  // Hardware back mirrors the on-screen back buttons: step back through the
  // wizard, and only close it from the first screen.
  const BACK_STEP: Partial<Record<Step, Step>> = { intent: 'mode', manual: 'mode', depth: 'intent', questions: 'intent', refuse: 'intent' };
  useBackClose(true, () => {
    const prev = BACK_STEP[step];
    if (prev) setStep(prev); else close();
  });

  const fail = (e: unknown) => {
    setErrKind(e instanceof AiOfflineError ? 'offline' : 'unavailable');
    setStep('error');
  };

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
    const id = createId('goal');
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

  const createManual = () => {
    if (!intent.trim()) return;
    const cat: Category = manualCat;
    const meta = CATEGORY_META[cat] || CATEGORY_META.personal;
    const id = createId('goal');
    store.addGoal({
      id, title: intent.trim(), subtitle: manualSub.trim() || undefined,
      category: cat, emoji: meta.emoji, color: meta.color,
      priority: 2, totalHoursEstimated: 0, hoursPerWeekTarget: 3,
      sessionsCompleted: 0, sessionsTotal: 0, hoursLogged: 0,
      milestones: [], metadata: { kind: 'manual' }, status: 'active',
    });
    store.setPendingGoalId(id); store.closeWizard(); store.setActiveView('goals');
  };

  const refuseMsg = (r: Extract<RoadmapResult, { status: 'refuse' }>) =>
    r.message || t(r.reasonType === 'impossible' ? 'gw.refuseImpossible' : r.reasonType === 'unsafe' ? 'gw.refuseUnsafe' : r.reasonType === 'nonsense' ? 'gw.refuseNonsense' : 'gw.refuseUnclear');

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
                <label className="block text-[13px] font-bold text-[var(--text)] mb-2">{t('gd.subtitle')}</label>
                <input value={manualSub} onChange={(e) => setManualSub(e.target.value)} placeholder={t('gw.intentPlaceholder')} className={fld} />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-[var(--text)] mb-2">{t('gw.category')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
                    <button key={c} onClick={() => setManualCat(c)}
                      className={`h-10 px-3 rounded-xl border text-left text-[13px] flex items-center gap-2 transition-all ${manualCat === c ? 'text-[var(--text)]' : 'text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}
                      style={manualCat === c ? { borderColor: CATEGORY_META[c].color, background: `${CATEGORY_META[c].color}1a` } : {}}>
                      <span>{CATEGORY_META[c].emoji}</span><span className="truncate">{t('cat.' + c)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

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

          {step === 'generating' && <GeneratingView t={t} />}

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
          {step === 'intent' && (<>
            <button onClick={() => setStep('mode')} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)] flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.back')}</button>
            <button disabled={!intent.trim()} onClick={() => setStep('depth')} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5">{t('gw.next')}<ArrowRight className="w-4 h-4" /></button>
          </>)}
          {step === 'manual' && (<>
            <button onClick={() => setStep('mode')} className="h-11 px-4 rounded-xl border border-[var(--border)] text-[13px] font-bold text-[var(--text-dim)] flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />{t('gw.back')}</button>
            <button disabled={!intent.trim()} onClick={createManual} className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />{t('gw.create')}</button>
          </>)}
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

// Animated "generating" screen. No real progress is available (one LLM call ~60s),
// so we ease a fake percentage toward ~95% and rotate status lines so the wait feels alive.
function GeneratingView({ t }: { t: (k: string) => string }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      // Ease-out toward 95%: fast at first, asymptotically slowing. TAU≈22s feels right for a ~60s call.
      setPct(Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 22000)))));
    }, 180);
    return () => clearInterval(id);
  }, []);

  const msgKey = pct < 25 ? 'gw.gen1' : pct < 55 ? 'gw.gen2' : pct < 80 ? 'gw.gen3' : 'gw.gen4';
  const R = 44;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="relative w-28 h-28 mb-5">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={R} fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-extrabold text-[var(--text)] leading-none tabular-nums">{pct}<span className="text-[15px] text-[var(--text-dim)]">%</span></span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--text)]">
        <Sparkles className="w-4 h-4 text-[var(--primary)] animate-pulse" />{t('gw.generating')}
      </div>
      <div key={msgKey} className="mt-1.5 text-[12px] text-[var(--text-dim)] anim-pop">{t(msgKey)}</div>
      <div className="mt-3 text-[11px] text-[var(--text-mute)]">{t('gw.genHint')}</div>
    </div>
  );
}
