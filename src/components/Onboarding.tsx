import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Sparkles, ArrowRight, ArrowLeft, Check } from 'lucide-react';

type Opt = { id: string; emoji: string; label: string };

// Sleep answer → sensible wake/sleep defaults applied to schedulePrefs.
const SLEEP_PREFS: Record<string, { wakeTime: string; sleepTime: string }> = {
  lt6:    { wakeTime: '06:00', sleepTime: '00:30' },
  '6to8': { wakeTime: '07:00', sleepTime: '23:00' },
  '8to10':{ wakeTime: '07:30', sleepTime: '22:30' },
  '10plus':{ wakeTime: '08:30', sleepTime: '22:00' },
};

export function Onboarding() {
  const t = useT();
  const { completeOnboarding, updatePrefs, setUserProfile, theme } = useStore();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [focus, setFocus] = useState<string[]>([]);
  const [peak, setPeak] = useState<'morning' | 'afternoon' | 'evening' | ''>('');
  const [sleep, setSleep] = useState('');
  const [struggles, setStruggles] = useState<string[]>([]);

  const FOCUS: Opt[] = [
    { id: 'procrast', emoji: '⚡', label: t('onb.focus.procrast') },
    { id: 'organize', emoji: '🗂️', label: t('onb.focus.organize') },
    { id: 'habits', emoji: '🔁', label: t('onb.focus.habits') },
    { id: 'energy', emoji: '💪', label: t('onb.focus.energy') },
    { id: 'goals', emoji: '🚀', label: t('onb.focus.goals') },
    { id: 'calm', emoji: '🌿', label: t('onb.focus.calm') },
  ];
  const PEAK: Opt[] = [
    { id: 'morning', emoji: '☀️', label: t('settings.morning') },
    { id: 'afternoon', emoji: '🌤️', label: t('settings.afternoon') },
    { id: 'evening', emoji: '🌙', label: t('settings.evening') },
  ];
  const SLEEP: Opt[] = [
    { id: 'lt6', emoji: '🌙', label: t('onb.sleep.lt6') },
    { id: '6to8', emoji: '😴', label: t('onb.sleep.6to8') },
    { id: '8to10', emoji: '🛌', label: t('onb.sleep.8to10') },
    { id: '10plus', emoji: '💤', label: t('onb.sleep.10plus') },
  ];
  const STRUGGLES: Opt[] = [
    { id: 'energy', emoji: '😮‍💨', label: t('onb.str.energy') },
    { id: 'time', emoji: '⏳', label: t('onb.str.time') },
    { id: 'miss', emoji: '😬', label: t('onb.str.miss') },
    { id: 'procrast', emoji: '🐢', label: t('onb.str.procrast') },
    { id: 'distract', emoji: '🎯', label: t('onb.str.distract') },
  ];

  const STEPS = 6;
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, id: string) =>
    set(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const next = () => setStep(s => Math.min(STEPS - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const finish = () => {
    const prefs: Record<string, unknown> = {};
    if (peak) prefs.productivityPeak = peak;
    if (sleep && SLEEP_PREFS[sleep]) Object.assign(prefs, SLEEP_PREFS[sleep]);
    if (Object.keys(prefs).length) updatePrefs(prefs);
    setUserProfile({ focus, struggles, sleep });
    completeOnboarding(name.trim() || 'You');
  };

  // per-step "can advance" + primary action
  const canNext =
    step === 0 ? !!name.trim() :
    step === 1 ? focus.length > 0 :
    step === 2 ? !!peak :
    step === 3 ? !!sleep :
    true; // struggles optional, final always ok

  const OptionCard = ({ o, selected, onClick, multi }: { o: Opt; selected: boolean; onClick: () => void; multi?: boolean }) => (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[.99] ${
        selected ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/40'}`}>
      <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[20px] shrink-0">{o.emoji}</span>
      <span className="flex-1 text-[15px] font-semibold text-[var(--text)]">{o.label}</span>
      <span className={`w-6 h-6 ${multi ? 'rounded-md' : 'rounded-full'} border-2 grid place-items-center shrink-0 transition-colors ${
        selected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border)]'}`}>
        {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
      </span>
    </button>
  );

  return (
    <div className={`${theme === 'dark' ? 'theme-dark ' : ''}fixed inset-0 z-[100] flex flex-col bg-[var(--bg)] text-[var(--text)]`}>
      {/* Top bar: back + progress */}
      <div className="flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
        <button onClick={back} disabled={step === 0}
          className={`w-9 h-9 rounded-xl grid place-items-center transition-opacity ${step === 0 ? 'opacity-0 pointer-events-none' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? 'w-6 bg-[var(--primary)]' : i < step ? 'w-1.5 bg-[var(--primary)]' : 'w-1.5 bg-[var(--border)]'}`} />
          ))}
        </div>
        <div className="w-9 shrink-0" aria-hidden />
      </div>

      {/* Body */}
      <div key={step} className="flex-1 overflow-y-auto px-6 pb-4 anim-fade">
        <div className="max-w-md mx-auto w-full">
          {step === 0 && (
            <div className="flex flex-col items-center text-center pt-8">
              <div className="w-16 h-16 rounded-3xl grid place-items-center mb-5 anim-pop" style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', boxShadow: '0 12px 30px rgba(79,91,213,.35)' }}>
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h1 className="display text-[32px] text-[var(--text)] leading-tight">{t('onb.welcome')}</h1>
              <p className="text-[14px] text-[var(--text-dim)] mt-2 leading-relaxed">{t('onb.subtitle')}</p>
              <div className="w-full text-left mt-8">
                <label className="block text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-2">{t('onb.yourName')}</label>
                <input autoFocus value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && name.trim()) next(); }}
                  placeholder={t('onb.placeholder')} maxLength={40}
                  className="w-full h-12 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--primary)] transition-colors" />
              </div>
            </div>
          )}

          {step === 1 && (
            <Question title={t('onb.q.focus')} hint={t('onb.multiHint')}>
              {FOCUS.map(o => <OptionCard key={o.id} o={o} multi selected={focus.includes(o.id)} onClick={() => toggle(setFocus, o.id)} />)}
            </Question>
          )}

          {step === 2 && (
            <Question title={t('onb.q.peak')}>
              {PEAK.map(o => <OptionCard key={o.id} o={o} selected={peak === o.id} onClick={() => { setPeak(o.id as typeof peak); setTimeout(next, 180); }} />)}
            </Question>
          )}

          {step === 3 && (
            <Question title={t('onb.q.sleep')}>
              {SLEEP.map(o => <OptionCard key={o.id} o={o} selected={sleep === o.id} onClick={() => { setSleep(o.id); setTimeout(next, 180); }} />)}
            </Question>
          )}

          {step === 4 && (
            <Question title={t('onb.q.struggles')} hint={t('onb.multiHint')}>
              {STRUGGLES.map(o => <OptionCard key={o.id} o={o} multi selected={struggles.includes(o.id)} onClick={() => toggle(setStruggles, o.id)} />)}
            </Question>
          )}

          {step === 5 && (
            <div className="flex flex-col items-center text-center pt-10">
              <div className="w-20 h-20 rounded-[28px] grid place-items-center mb-6 anim-pop" style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', boxShadow: '0 14px 36px rgba(79,91,213,.4)' }}>
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
              <h1 className="display text-[30px] text-[var(--text)] leading-tight">{t('onb.finalTitle', { name: name.trim() || '' })}</h1>
              <p className="text-[14px] text-[var(--text-dim)] mt-3 leading-relaxed max-w-xs">{t('onb.finalSub')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer action */}
      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
        <div className="max-w-md mx-auto">
          <button
            onClick={step === STEPS - 1 ? finish : next}
            disabled={!canNext}
            className="w-full h-12 rounded-2xl text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[.99]"
            style={{ background: 'linear-gradient(135deg,var(--primary),var(--primary-2))', boxShadow: '0 10px 24px rgba(79,91,213,.32)' }}>
            {step === STEPS - 1 ? t('onb.letsGo') : step === 0 ? t('onb.getStarted') : t('onb.continue')}
            <ArrowRight className="w-4 h-4" />
          </button>
          {step === 0 && <p className="text-[11px] text-[var(--text-mute)] text-center mt-3">{t('onb.changeLater')}</p>}
        </div>
      </div>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="pt-4">
      {hint && <p className="text-[12px] font-semibold text-[var(--primary)] mb-1.5">{hint}</p>}
      <h2 className="display text-[26px] text-[var(--text)] leading-tight mb-6">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
