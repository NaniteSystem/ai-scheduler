import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { User, Info, Clock, Target, Sparkles, Calendar, Check, Languages, LayoutGrid, Download, Trash2, Bell } from 'lucide-react';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-[var(--primary)]' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}>
      <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function SettingsView() {
  const t = useT();
  const store = useStore();
  const { goals, sessions, gtdTasks, userName, schedulePrefs, lang, setLang, setUserName, updatePrefs,
    theme, setTheme, askConfirm, resetAll, resetIntroCourse,
    notifPrefs, setNotifPrefs, habitRemindersEnabled, setNotifPref } = store;
  const [name, setName] = useState(userName);
  const [saved, setSaved] = useState(false);

  const initials = userName.trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '·';
  const weekStartsOn = schedulePrefs.weekStartsOn ?? 1;

  const saveName = () => {
    const n = name.trim();
    if (!n) return;
    setUserName(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const confirmReset = () => askConfirm({ title: t('settings.resetTitle'), message: t('settings.resetMsg'), confirmLabel: t('settings.reset'), danger: true, onConfirm: resetAll });

  return (
    <div className="px-4 md:px-10 py-6 md:py-8 max-w-[820px] space-y-6">
      <div className="anim-fade">
        <h1 className="display text-[30px] md:text-[44px] text-[var(--text)]">{t('settings.title')}</h1>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Language */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-1">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><Languages className="w-3.5 h-3.5" /> {t('settings.language')}</div>
        <div className="text-[12px] text-[var(--text-dim)] mb-3">{t('settings.languageSub')}</div>
        <div className="flex gap-2">
          {([['en', t('settings.english')], ['ru', t('settings.russian')], ['ja', t('settings.japanese')]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setLang(val)}
              className={`flex-1 h-11 rounded-xl text-[13px] font-bold border transition-all flex items-center justify-center gap-2 ${lang === val ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface)] text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}>
              {lang === val && <Check className="w-4 h-4" />}{label}
            </button>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-1">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><User className="w-3.5 h-3.5" /> {t('settings.profile')}</div>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center text-[16px] font-bold text-white shadow-lg shrink-0">{initials}</div>
          <div className="min-w-0">
            <div className="text-[16px] font-bold text-[var(--text)] truncate">{userName || t('settings.noName')}</div>
            <div className="text-[12px] text-[var(--text-dim)]">{t('sidebar.personalPlanner')}</div>
          </div>
        </div>
        <label className="block text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-2">{t('settings.nameLabel')}</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
            maxLength={40}
            placeholder={t('settings.yourName')}
            className="flex-1 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--primary)]/50 transition-colors"
          />
          <button onClick={saveName} disabled={!name.trim() || name.trim() === userName} className="h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            {saved ? <><Check className="w-4 h-4" /> {t('settings.saved')}</> : t('common.save')}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 anim-fade anim-delay-1">
        {[
          { l: t('settings.statGoals'), v: goals.length, ic: Target, c: '#8b5cf6' },
          { l: t('settings.statSessions'), v: sessions.length, ic: Clock, c: '#22c55e' },
          { l: t('settings.statGtd'), v: gtdTasks.filter(t => t.status !== 'trash').length, ic: Sparkles, c: '#f59e0b' },
        ].map((s, i) => {
          const Ic = s.ic;
          return (
            <div key={i} className="card p-4">
              <Ic className="w-4 h-4 mb-2" style={{ color: s.c }} />
              <div className="text-[24px] font-bold text-[var(--text)] mono leading-none">{s.v}</div>
              <div className="text-[10px] text-[var(--text-dim)] mt-1">{s.l}</div>
            </div>
          );
        })}
      </div>

      {/* Schedule preferences */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-2 space-y-5">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {t('settings.schedule')}</div>

        {/* Week start */}
        <div>
          <div className="text-[12px] text-[var(--text)] font-medium mb-2">{t('settings.weekStart')}</div>
          <div className="flex gap-2">
            {([[t('settings.monday'), 1], [t('settings.sunday'), 0]] as const).map(([label, val]) => (
              <button key={val} onClick={() => updatePrefs({ weekStartsOn: val })}
                className={`flex-1 h-10 rounded-xl text-[12px] font-bold border transition-all ${weekStartsOn === val ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface)] text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Productivity peak */}
        <div>
          <div className="text-[12px] text-[var(--text)] font-medium mb-2">{t('settings.peak')}</div>
          <div className="flex gap-2">
            {([[t('settings.morning'), 'morning'], [t('settings.afternoon'), 'afternoon'], [t('settings.evening'), 'evening']] as const).map(([label, val]) => (
              <button key={val} onClick={() => updatePrefs({ productivityPeak: val })}
                className={`flex-1 h-10 rounded-xl text-[12px] font-bold border transition-all ${schedulePrefs.productivityPeak === val ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface)] text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-2 space-y-4">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest flex items-center gap-2"><Bell className="w-3.5 h-3.5" /> {t('settings.notifications')}</div>
        {([
          { l: t('settings.notifSessions'), sub: t('settings.notifSessionsSub'), on: notifPrefs.sessions, fn: () => setNotifPrefs({ sessions: !notifPrefs.sessions }) },
          { l: t('settings.notifTasks'), sub: t('settings.notifTasksSub'), on: notifPrefs.tasks, fn: () => setNotifPrefs({ tasks: !notifPrefs.tasks }) },
          { l: t('settings.habitReminders'), sub: t('settings.habitRemindersSub'), on: habitRemindersEnabled, fn: () => setNotifPref({ habitRemindersEnabled: !habitRemindersEnabled }) },
          { l: t('settings.quietHours'), sub: t('settings.quietHoursSub'), on: notifPrefs.quietEnabled, fn: () => setNotifPrefs({ quietEnabled: !notifPrefs.quietEnabled }) },
        ]).map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-[var(--text)] font-medium">{row.l}</div>
              <div className="text-[11px] text-[var(--text-dim)]">{row.sub}</div>
            </div>
            <Toggle on={row.on} onClick={row.fn} />
          </div>
        ))}
        {notifPrefs.quietEnabled && (
          <div className="flex items-center gap-3 pt-1">
            {([['quietStart', t('settings.quietFrom')], ['quietEnd', t('settings.quietTo')]] as const).map(([field, label]) => (
              <label key={field} className="flex-1">
                <span className="block text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-1.5">{label}</span>
                <input type="time" value={notifPrefs[field]}
                  onChange={e => e.target.value && setNotifPrefs({ [field]: e.target.value })}
                  className="w-full h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]/50 transition-colors" />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Appearance / theme */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-2">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><LayoutGrid className="w-3.5 h-3.5" /> {t('settings.appearance')}</div>
        <div className="text-[12px] text-[var(--text)] font-medium mb-2">{t('settings.theme')}</div>
        <div className="flex gap-2">
          {([['system', t('settings.themeSystem')], ['light', t('settings.themeLight')], ['dark', t('settings.themeDark')]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setTheme(val)}
              className={`flex-1 h-10 rounded-xl text-[12px] font-bold border transition-all flex items-center justify-center gap-2 ${theme === val ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface)] text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}>
              {theme === val && <Check className="w-4 h-4" />}{label}
            </button>
          ))}
        </div>
      </div>

      {/* App guide */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-2">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> {t('settings.guide')}</div>
        <p className="text-[12px] text-[var(--text-dim)] leading-relaxed mb-4">{t('settings.guideSub')}</p>
        <button
          onClick={resetIntroCourse}
          className="w-full h-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/25 text-[var(--primary)] text-[12px] font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--primary)]/15 transition-colors"
        >
          <Sparkles className="w-4 h-4" />{t('settings.guideOpen')}
        </button>
      </div>

      {/* Data export/import actions were retired; keep only reset in the UI. */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-3">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><Download className="w-3.5 h-3.5" /> {t('settings.data')}</div>
        <div className="grid grid-cols-1 gap-2">
          <button onClick={confirmReset} className="h-10 rounded-xl bg-red-500/10 border border-red-500/30 text-[12px] font-bold text-red-400 flex items-center justify-center gap-1.5"><Trash2 className="w-4 h-4" />{t('settings.reset')}</button>
        </div>
      </div>

      {/* About */}
      <div className="card p-5 md:p-6 anim-fade anim-delay-3">
        <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-4 flex items-center gap-2"><Info className="w-3.5 h-3.5" /> {t('settings.about')}</div>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between"><span className="text-[var(--text-dim)]">{t('settings.appField')}</span><span className="text-[var(--text)]">Nebulla — {t('app.tagline')}</span></div>
          <div className="flex items-center justify-between"><span className="text-[var(--text-dim)]">{t('settings.version')}</span><span className="text-[var(--text)] mono">1.0.0</span></div>
          <div className="flex items-center justify-between"><span className="text-[var(--text-dim)]">{t('settings.weekStart')}</span><span className="text-[var(--text)]">{weekStartsOn === 1 ? t('settings.monday') : t('settings.sunday')}</span></div>
        </div>
      </div>
    </div>
  );
}
