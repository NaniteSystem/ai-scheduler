import { useState } from 'react';
import { useStore, goalInsight, goalProgressPct, goalStreak } from '../store';
import { CATEGORY_META } from '../types';
import type { Goal, RoadmapNode } from '../types';
import {
  ArrowLeft, Sparkles, CheckCircle2, Clock, Target, Flame, Calendar,
  TrendingUp, ChevronRight, Check, AlertCircle, Play, BookOpen,
  Activity, Award, BarChart3, Plus, Edit2, X, ExternalLink
} from 'lucide-react';
import { format, differenceInDays, parseISO, isSameDay } from 'date-fns';
import { fmtHours } from '../utils/duration';
import { DatePicker } from './ui/DatePicker';
import { useT, useDateLocale } from '../i18n';

function Ring({ pct, size = 80, stroke = 5, color = '#22c55e', bg = 'var(--border)', children }: {
  pct: number; size?: number; stroke?: number; color?: string; bg?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg style={{ transform: 'rotate(-90deg)' }} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function GoalDetailView({ goal, onBack }: { goal: Goal; onBack: () => void }) {
  const tr = useT();
  const locale = useDateLocale();
  const { sessions, openLog, openSessionModal, updateGoal, addSession, toggleRoadmapNode } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'milestones' | 'insights'>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDur, setNewDur] = useState(60);
  const [mlTitle, setMlTitle] = useState('');
  const [mlTarget, setMlTarget] = useState(1);
  const [nodeModal, setNodeModal] = useState<{ phaseTitle: string; node: RoadmapNode } | null>(null);

  const addBacklogSession = () => {
    const t = newTitle.trim();
    if (!t) return;
    addSession({
      id: `s${Date.now()}`, goalId: goal.id, date: '', startHour: 0, startMinute: 0,
      durationMinutes: Math.max(15, newDur), title: t, description: '', tasks: [],
      sessionType: 'regular', status: 'planned',
    });
    setNewTitle('');
    setNewDur(60);
  };

  const cm = CATEGORY_META[goal.category];

  // ── Real Stats from sessions ──────────────────────────────────────────
  const goalSessions = sessions.filter(s => s.goalId === goal.id);
  const doneSessions = goalSessions.filter(s => s.status === 'done');
  const plannedSessions = goalSessions.filter(s => s.status === 'planned');
  const skippedSessions = goalSessions.filter(s => s.status === 'skipped');

  const totalMinutesLogged = doneSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const hoursLogged = +(totalMinutesLogged / 60).toFixed(1);
  const hoursLeft = Math.max(0, goal.totalHoursEstimated - hoursLogged);
  const progressPct = goalProgressPct(goal, sessions);

  // ── Completion state ──
  const completionType = goal.completionType || 'hours';
  const isCompleted = goal.status === 'completed';
  const readyByHours = completionType === 'hours' && goal.totalHoursEstimated > 0 && hoursLogged >= goal.totalHoursEstimated;
  const readyByDate = completionType === 'date' && !!goal.deadline && new Date() >= parseISO(goal.deadline);
  const readyToComplete = !isCompleted && (readyByHours || readyByDate);
  const completeGoal = (outcome: 'success' | 'failed') => {
    updateGoal(goal.id, { status: 'completed', outcome, completedAt: new Date().toISOString() });
    setCompleteOpen(false);
  };
  const reopenGoal = () => updateGoal(goal.id, { status: 'active', outcome: undefined, completedAt: undefined });

  // ── Editable milestones ──
  const setMilestones = (ms: Goal['milestones']) => updateGoal(goal.id, { milestones: ms });
  const toggleMs = (id: string) => setMilestones(goal.milestones.map(m => m.id === id ? { ...m, done: !m.done } : m));
  const delMs = (id: string) => setMilestones(goal.milestones.filter(m => m.id !== id));
  const addMs = () => {
    if (!mlTitle.trim()) return;
    setMilestones([...goal.milestones, { id: `m${Date.now()}`, title: mlTitle.trim(), targetValue: Math.max(1, mlTarget), done: false }]);
    setMlTitle(''); setMlTarget(1);
  };

  const doneCount = doneSessions.length;
  const totalCount = goalSessions.length;
  const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const avgDuration = doneSessions.length > 0
    ? Math.round(doneSessions.reduce((s, x) => s + x.durationMinutes, 0) / doneSessions.length)
    : 0;

  const avgFeeling = doneSessions.filter(s => s.progressLog).map(s => {
    const f = s.progressLog!.feeling;
    return f === 'great' ? 4 : f === 'good' ? 3 : f === 'ok' ? 2 : 1;
  });
  const feelingScore = avgFeeling.length > 0
    ? +(avgFeeling.reduce((a, b) => a + b, 0) / avgFeeling.length).toFixed(1)
    : 0;
  const feelingLabel = feelingScore >= 3.5 ? tr('gd.feelGreat') : feelingScore >= 2.5 ? tr('gd.feelGood') : feelingScore > 0 ? tr('gd.feelTough') : '—';

  // Deadline + days left
  const daysLeft = goal.deadline ? differenceInDays(parseISO(goal.deadline), new Date()) : null;
  const weeksLeft = daysLeft !== null ? Math.ceil(daysLeft / 7) : null;
  const hNeededPerWeek = weeksLeft && weeksLeft > 0 ? +(hoursLeft / weeksLeft).toFixed(1) : null;
  const onTrack = hNeededPerWeek !== null && hNeededPerWeek <= goal.hoursPerWeekTarget * 1.2;

  // Activity Heatmap — last 4 weeks
  const today = new Date();
  const heatmap = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (27 - i));
    const ds = doneSessions.filter(s => isSameDay(new Date(s.date), d));
    return { date: d, count: ds.length, mins: ds.reduce((sum, s) => sum + s.durationMinutes, 0) };
  });

  // Data-driven insight (falls back to seed aiInsight only before any session is logged)
  const insight = goalInsight(goal, sessions);
  const insightText = (insight.key === 'gi.start' && goal.aiInsight) ? goal.aiInsight : tr(insight.key, insight.vars);

  // Milestones
  const doneMilestones = goal.milestones.filter(m => m.done).length;

  // Recent logs
  const recentLogs = doneSessions
    .filter(s => s.progressLog)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const tabs = [
    { id: 'overview', label: tr('gd.tabOverview'), icon: BarChart3 },
    { id: 'sessions', label: tr('gd.tabSessions'), icon: Calendar },
    { id: 'milestones', label: tr('gd.tabRoadmap'), icon: Target },
    { id: 'insights', label: tr('gd.tabInsights'), icon: Sparkles },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] overflow-y-auto md:overflow-hidden">
      {/* Hero Header */}
      <div
        className="relative shrink-0 px-4 md:px-8 pt-5 md:pt-8 pb-6 border-b border-[var(--surface-2)]"
        style={{ background: `linear-gradient(135deg, ${goal.color}18 0%, transparent 60%)` }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] transition-colors mb-5 md:mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          {tr('gd.allGoals')}
        </button>

        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
         <div className="flex items-start gap-4 md:gap-8 flex-1 min-w-0">
          {/* Ring */}
          <div className="shrink-0">
            <Ring pct={progressPct} size={84} stroke={6} color={goal.color}>
              <div className="text-center">
                <div className="text-[24px] font-bold text-[var(--text)] mono leading-none">{progressPct}</div>
                <div className="text-[10px] text-[var(--text-dim)]">%</div>
              </div>
            </Ring>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r ${cm.gradient} text-white`}>
                {tr('cat.' + goal.category)}
              </span>
              {daysLeft !== null && daysLeft < 30 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                  <AlertCircle className="w-3 h-3" /> {tr('gd.daysLeft', { n: daysLeft })}
                </span>
              )}
              {!onTrack && weeksLeft && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/20">
                  <AlertCircle className="w-3 h-3" /> {tr('gd.needsEffort')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mb-2 min-w-0">
              <span className="text-3xl md:text-4xl shrink-0">{goal.emoji}</span>
              <div className="min-w-0">
                <h1 className="display text-[26px] md:text-[40px] text-[var(--text)] leading-tight md:leading-none break-words">{goal.title}</h1>
                {goal.subtitle && <p className="text-[13px] md:text-[15px] text-[var(--text-dim)] mt-1">{goal.subtitle}</p>}
              </div>
            </div>

            {/* Key metrics strip */}
            <div className="flex items-center gap-6 mt-4 flex-wrap">
              {[
                { icon: Flame, val: `${goalStreak(goal, sessions)}d`, label: tr('gd.mStreak'), color: '#f59e0b' },
                { icon: Clock, val: fmtHours(hoursLogged), label: tr('gd.mLogged'), color: goal.color },
                { icon: CheckCircle2, val: `${doneCount}/${totalCount}`, label: tr('gd.mSessions'), color: '#22c55e' },
                { icon: TrendingUp, val: `${completionRate}%`, label: tr('gd.mCompletionRate'), color: '#8b5cf6' },
                ...(daysLeft !== null ? [{ icon: Calendar, val: `${daysLeft}d`, label: tr('gd.mUntilDeadline'), color: daysLeft < 30 ? '#f59e0b' : '#3b82f6' }] : []),
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <m.icon className="w-4 h-4" style={{ color: m.color }} />
                  <div>
                    <div className="text-[16px] font-bold text-[var(--text)] mono leading-none">{m.val}</div>
                    <div className="text-[11px] text-[var(--text-dim)] uppercase tracking-wider">{m.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
         </div>

          {/* CTA */}
          <div className="shrink-0 flex flex-row md:flex-col gap-2 w-full md:w-auto">
            {plannedSessions[0] && (
              <button
                onClick={() => openSessionModal(plannedSessions[0].id)}
                className="h-10 px-5 rounded-xl text-[12px] font-bold text-white flex items-center justify-center gap-2 flex-1 md:flex-none"
                style={{ background: goal.color }}
              >
                <Play className="w-4 h-4" /> {tr('gd.nextSession')}
              </button>
            )}
            <button onClick={() => setEditOpen(true)} className="h-10 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] flex items-center justify-center gap-2 transition-colors flex-1 md:flex-none">
              <Edit2 className="w-4 h-4" /> {tr('gd.editGoal')}
            </button>
            {isCompleted ? (
              <button onClick={reopenGoal} className="h-10 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] flex items-center justify-center gap-2 transition-colors flex-1 md:flex-none">
                <ArrowLeft className="w-4 h-4" /> {tr('gd.reactivate')}
              </button>
            ) : (
              <button onClick={() => setCompleteOpen(true)}
                className={`h-10 px-5 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2 transition-all flex-1 md:flex-none ${readyToComplete ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/20' : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                <CheckCircle2 className="w-4 h-4" /> {tr('gd.complete')}
              </button>
            )}
          </div>
        </div>

        {/* Completion banner */}
        {isCompleted ? (
          <div className={`mt-5 rounded-2xl p-4 flex items-center gap-3 border ${goal.outcome === 'success' ? 'bg-emerald-500/[0.07] border-emerald-500/25' : 'bg-red-500/[0.06] border-red-500/20'}`}>
            <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${goal.outcome === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {goal.outcome === 'success' ? <Award className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className={`text-[13px] font-bold ${goal.outcome === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{goal.outcome === 'success' ? tr('gd.achieved') : tr('gd.endedNoSuccess')}</div>
              <div className="text-[11px] text-[var(--text-dim)]">{tr('gd.completedOn', { d: goal.completedAt ? format(parseISO(goal.completedAt), 'd MMM yyyy', { locale }) : '' })}</div>
            </div>
          </div>
        ) : readyToComplete ? (
          <button onClick={() => setCompleteOpen(true)} className="mt-5 w-full rounded-2xl p-4 flex items-center gap-3 bg-emerald-500/[0.07] border border-emerald-500/25 hover:bg-emerald-500/10 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-emerald-500/15 text-emerald-400"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-emerald-300">{readyByHours ? tr('gd.hoursReached') : tr('gd.dateReached')}</div>
              <div className="text-[11px] text-[var(--text-dim)]">{tr('gd.markOutcome')}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
          </button>
        ) : null}

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest">
              {tr('gd.ofEstimated', { a: fmtHours(hoursLogged), b: fmtHours(goal.totalHoursEstimated) })}
            </span>
            <span className="text-[10px] font-bold text-[var(--text-dim)]">{tr('gd.remaining', { x: fmtHours(hoursLeft) })}</span>
          </div>
          <div className="h-2 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: `linear-gradient(to right, ${goal.color}cc, ${goal.color})` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 md:px-8 py-3 border-b border-[var(--surface-2)] shrink-0 bg-[var(--bg)] overflow-x-auto sticky top-0 z-10 md:static">
        {tabs.map(t => {
          const Icon = t.icon;
          const a = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-all shrink-0 ${a ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-8 py-6">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-12 gap-6 max-w-[1200px]">
            {/* Left Col */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[
                  { label: tr('gd.hoursLogged'), value: fmtHours(hoursLogged), sub: tr('gd.ofX', { x: fmtHours(goal.totalHoursEstimated) }), color: goal.color, icon: Clock },
                  { label: tr('gd.sessionsDone'), value: doneCount, sub: tr('gd.nSkipped', { n: skippedSessions.length }), color: '#22c55e', icon: CheckCircle2 },
                  { label: tr('gd.avgSession'), value: avgDuration > 0 ? `${avgDuration}m` : '—', sub: tr('gd.perSession'), color: '#8b5cf6', icon: Activity },
                  { label: tr('gd.energy'), value: feelingLabel, sub: tr('gd.avgFeeling'), color: '#f59e0b', icon: Award },
                ].map((s, i) => (
                  <div key={i} className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className="w-4 h-4" style={{ color: s.color }} />
                      <span className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{s.label}</span>
                    </div>
                    <div className="text-[22px] font-bold text-[var(--text)] mono leading-none">{s.value}</div>
                    <div className="text-[11px] text-[var(--text-dim)] mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Activity Heatmap */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gd.activity4w')}</h3>
                  <span className="text-[10px] text-[var(--text-dim)]">{tr('gd.nSessionsTotal', { n: doneSessions.length })}</span>
                </div>
                <div className="flex gap-1">
                  {heatmap.map((day, i) => (
                    <div key={i} className="group relative flex-1">
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: 28,
                          background: day.count > 0 ? goal.color : 'var(--surface-2)',
                          opacity: day.count > 0 ? Math.min(1, 0.4 + day.count * 0.3) : 1,
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--text)] whitespace-nowrap shadow-xl">
                          {format(day.date, 'MMM d', { locale })}
                          {day.count > 0 ? ` · ${day.mins}m` : ` · ${tr('gd.rest')}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-[var(--text-dim)]">
                  <span>{format(heatmap[0].date, 'MMM d', { locale })}</span>
                  <span>{tr('gd.today')}</span>
                </div>
              </div>

              {/* Recent Sessions */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gd.recentSessions')}</h3>
                  <button onClick={() => setActiveTab('sessions')} className="text-[10px] text-[var(--primary)] hover:text-[var(--primary)] flex items-center gap-1">
                    {tr('gd.all')} <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2">
                  {doneSessions.slice(0, 4).map(s => (
                    <div
                      key={s.id}
                      onClick={() => openSessionModal(s.id)}
                      className="flex items-center gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--border)] hover:bg-[var(--surface)] transition-all"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${goal.color}20` }}>
                        <CheckCircle2 className="w-4 h-4" style={{ color: goal.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] truncate">{s.title}</div>
                        <div className="text-[10px] text-[var(--text-dim)] mono">{s.date ? `${format(new Date(s.date), 'MMM d, yyyy', { locale })} · ` : ''}{s.durationMinutes}m</div>
                      </div>
                      {s.progressLog && (
                        <div className="text-right shrink-0">
                          <div className="text-[12px] font-bold text-[var(--text)] mono">{s.progressLog.value} {s.progressLog.metric}</div>
                          <div className="text-[10px]">{s.progressLog.feeling === 'great' ? '🚀' : s.progressLog.feeling === 'good' ? '😊' : s.progressLog.feeling === 'ok' ? '😐' : '😔'}</div>
                        </div>
                      )}
                    </div>
                  ))}
                  {doneSessions.length === 0 && (
                    <div className="py-8 text-center text-[var(--text-dim)] text-[13px]">{tr('gd.noCompletedYet')}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Col */}
            <div className="col-span-12 lg:col-span-4 space-y-5">
              {/* Pace Analysis */}
              {daysLeft !== null && hNeededPerWeek !== null && (
                <div className="card p-5" style={{ borderColor: onTrack ? '#22c55e30' : '#ef444430', background: onTrack ? '#22c55e08' : '#ef444408' }}>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: onTrack ? '#22c55e' : '#ef4444' }}>
                    {onTrack ? tr('gd.onTrack') : tr('gd.needsAttention')}
                  </h3>
                  <div className="space-y-3 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-dim)]">{tr('gd.requiredWeek')}</span>
                      <span className="font-bold text-[var(--text)] mono">{hNeededPerWeek}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-dim)]">{tr('gd.currentPace')}</span>
                      <span className="font-bold text-[var(--text)] mono">{goal.hoursPerWeekTarget}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-dim)]">{tr('gd.weeksLeft')}</span>
                      <span className="font-bold text-[var(--text)] mono">{weeksLeft}w</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-dim)]">{tr('gd.deadline')}</span>
                      <span className="font-bold text-[var(--text)] mono">{format(parseISO(goal.deadline!), 'MMM d, yy', { locale })}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Milestones mini */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gd.milestones')}</h3>
                  <span className="text-[10px] font-bold text-[var(--primary)]">{doneMilestones}/{goal.milestones.length}</span>
                </div>
                <div className="space-y-3">
                  {goal.milestones.map((ml) => (
                    <div key={ml.id} className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${ml.done ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                        {ml.done && <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />}
                      </div>
                      <span className={`text-[12px] flex-1 truncate ${ml.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>
                        {ml.title}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setActiveTab('milestones')} className="mt-4 w-full h-8 rounded-lg border border-[var(--border)] text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors">
                  {tr('gd.viewRoadmap')}
                </button>
              </div>

              {/* AI Insight */}
              <div className="card p-5 bg-gradient-to-br from-[var(--primary)]/8 to-transparent border-[var(--primary)]/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                  <span className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider">{tr('gd.aiCoach')}</span>
                </div>
                <p className="text-[12px] text-[var(--text)] leading-relaxed">{insightText}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {activeTab === 'sessions' && (
          <div className="max-w-[900px] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                { label: tr('gd.completed'), value: doneCount, color: '#22c55e' },
                { label: tr('gd.upcoming'), value: plannedSessions.length, color: '#3b82f6' },
                { label: tr('gd.skipped'), value: skippedSessions.length, color: '#ef4444' },
              ].map((s, i) => (
                <div key={i} className="card p-4 flex items-center gap-4">
                  <div className="text-[32px] font-bold text-[var(--text)] mono leading-none" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Add backlog session */}
            <div className="card p-4">
              <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-2.5 flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> {tr('gd.addSessionToGoal')}</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBacklogSession()}
                  placeholder={tr('gd.sessionTitlePlaceholder')}
                  className="flex-1 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)]" />
                <div className="flex gap-2">
                  <input type="number" min={15} step={15} value={newDur} onChange={e => setNewDur(parseInt(e.target.value) || 60)}
                    className="w-20 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] mono focus:outline-none focus:border-[var(--border)]" title={tr('gd.minutesTitle')} />
                  <button onClick={addBacklogSession} disabled={!newTitle.trim()}
                    className="h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold disabled:opacity-40 flex items-center gap-1.5 hover:bg-[var(--primary)] transition-colors"><Plus className="w-4 h-4" />{tr('common.add')}</button>
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-dim)] mt-2">{tr('gd.willAppearHint')}</p>
            </div>

            {goalSessions.length === 0 && (
              <div className="card p-10 text-center">
                <BookOpen className="w-10 h-10 text-[var(--text-dim)] mx-auto mb-4" />
                <div className="text-[var(--text-dim)] text-[14px] font-medium">{tr('gd.noSessionsYet')}</div>
                <div className="text-[12px] text-[var(--text-dim)] mt-1">{tr('gd.addSessionsHint')}</div>
              </div>
            )}

            {/* Group by status */}
            {(['done', 'planned', 'skipped'] as const).map(status => {
              const list = goalSessions.filter(s => s.status === status);
              if (list.length === 0) return null;
              const label = status === 'done' ? tr('gd.completed') : status === 'planned' ? tr('gd.upcoming') : tr('gd.skipped');
              const color = status === 'done' ? '#22c55e' : status === 'planned' ? '#3b82f6' : '#ef4444';
              return (
                <div key={status}>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color }}>
                    <span className="flex-1 h-px bg-[var(--surface-2)]" />{label} ({list.length})<span className="flex-1 h-px bg-[var(--surface-2)]" />
                  </div>
                  <div className="space-y-2">
                    {list.map(s => (
                      <div
                        key={s.id}
                        onClick={() => { if (status !== 'done') openSessionModal(s.id); }}
                        className={`card p-4 flex items-start gap-4 group ${status !== 'done' ? 'cursor-pointer hover:border-[var(--border)]' : ''} transition-all`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status === 'done' ? 'bg-emerald-500/15' : status === 'skipped' ? 'bg-red-500/15' : 'bg-blue-500/15'}`}>
                          {status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          {status === 'planned' && <Clock className="w-4 h-4 text-blue-400" />}
                          {status === 'skipped' && <AlertCircle className="w-4 h-4 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[14px] font-bold text-[var(--text)]">{s.title}</div>
                              <div className="text-[11px] text-[var(--text-dim)] mono mt-0.5">
                                {s.date
                                  ? `${format(new Date(s.date), 'EEE, MMM d', { locale })} · ${String(s.startHour).padStart(2, '0')}:${String(s.startMinute || 0).padStart(2, '0')} · ${s.durationMinutes}m`
                                  : tr('gd.notScheduled', { n: s.durationMinutes })}
                              </div>
                            </div>
                            {status === 'planned' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openLog(s.id); }}
                                className="h-8 px-3 rounded-lg bg-emerald-500 text-black text-[10px] font-bold shrink-0 hover-actions flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> {tr('common.done')}
                              </button>
                            )}
                          </div>
                          {s.progressLog && (
                            <div className="mt-2 flex items-center gap-3 text-[11px]">
                              <span className="text-[var(--text-dim)]">{s.progressLog.value} {s.progressLog.metric}</span>
                              <span>{s.progressLog.feeling === 'great' ? '🚀' : s.progressLog.feeling === 'good' ? '😊' : s.progressLog.feeling === 'ok' ? '😐' : '😔'}</span>
                              {s.progressLog.notes && <span className="text-[var(--text-dim)] italic truncate">"{s.progressLog.notes}"</span>}
                            </div>
                          )}
                          {status === 'planned' && (
                            <div className="mt-2 text-[11px] text-[var(--text-dim)] line-clamp-1">{s.description}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ROADMAP (AI, locked) ── */}
        {activeTab === 'milestones' && goal.roadmap && goal.roadmap.phases.length > 0 && (() => {
          const rm = goal.roadmap;
          const allNodes = rm.phases.flatMap((p) => p.nodes);
          const doneN = allNodes.filter((n) => n.done).length;
          const pct = allNodes.length ? Math.round((doneN / allNodes.length) * 100) : 0;
          return (
            <div className="max-w-[700px]">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <h2 className="text-[18px] md:text-[20px] font-bold text-[var(--text)]">{tr('gd.goalRoadmap')}</h2>
                  <p className="text-[12px] text-[var(--text-dim)] mt-1">{tr('gr.stepsDone', { a: doneN, b: allNodes.length })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 bg-[var(--surface-2)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: goal.color }} /></div>
                  <span className="text-[12px] font-bold text-[var(--text)] mono">{pct}%</span>
                </div>
              </div>
              <div className="space-y-7">
                {rm.phases.map((ph, pi) => {
                  const pn = ph.nodes.filter((n) => n.done).length;
                  return (
                    <div key={ph.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg grid place-items-center text-[11px] font-bold shrink-0" style={{ background: `${goal.color}1f`, color: goal.color }}>{pi + 1}</div>
                        <h3 className="text-[14px] font-bold text-[var(--text)] flex-1 min-w-0">{ph.title}</h3>
                        <span className="text-[10px] text-[var(--text-dim)] mono shrink-0">{pn}/{ph.nodes.length}</span>
                      </div>
                      <div className="relative pl-7 space-y-2">
                        <div className="absolute left-[11px] top-1 bottom-1 w-[2px] bg-[var(--surface-2)]" />
                        {ph.nodes.map((n) => (
                          <div key={n.id} className="relative">
                            <button onClick={() => toggleRoadmapNode(goal.id, n.id)} title={tr(n.done ? 'gr.markUndone' : 'gr.markDone')}
                              className={`absolute -left-7 top-2 w-5 h-5 rounded-full border-2 grid place-items-center z-10 transition-all ${n.done ? 'bg-emerald-500 border-emerald-500' : 'bg-[var(--surface)] border-[var(--border)] hover:border-emerald-500/60'}`}>
                              {n.done && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                            </button>
                            <button onClick={() => setNodeModal({ phaseTitle: ph.title, node: n })}
                              className={`tcard w-full text-left p-3 flex items-center gap-2 ${n.done ? 'opacity-60' : ''}`}>
                              <span className={`flex-1 text-[13px] font-semibold ${n.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>{n.title}</span>
                              <ChevronRight className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── MILESTONES TAB (legacy, no roadmap) ── */}
        {activeTab === 'milestones' && (!goal.roadmap || goal.roadmap.phases.length === 0) && (
          <div className="max-w-[700px]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[20px] font-bold text-[var(--text)]">{tr('gd.goalRoadmap')}</h2>
                <p className="text-[13px] text-[var(--text-dim)] mt-1">{tr('gd.milestonesCompleted', { a: doneMilestones, b: goal.milestones.length })}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(doneMilestones / Math.max(1, goal.milestones.length)) * 100}%`, background: goal.color }} />
                </div>
                <span className="text-[12px] font-bold text-[var(--text)] mono">{Math.round((doneMilestones / Math.max(1, goal.milestones.length)) * 100)}%</span>
              </div>
            </div>

            <div className="relative pl-8">
              {/* Line */}
              <div className="absolute left-4 top-0 bottom-0 w-[2px] bg-[var(--surface-2)]" />

              <div className="space-y-6">
                {goal.milestones.map((ml, i) => (
                  <div key={ml.id} className="relative group">
                    {/* Node — tap to toggle done */}
                    <button
                      onClick={() => toggleMs(ml.id)}
                      title={tr('gd.doneCheck')}
                      className={`absolute -left-[17px] w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all ${ml.done ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-[var(--surface)] border-[var(--border)] hover:border-emerald-500/60'}`}
                    >
                      {ml.done && <Check className="w-3 h-3 text-black" strokeWidth={4} />}
                    </button>

                    <div className={`card p-5 transition-all ${ml.done ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button onClick={() => toggleMs(ml.id)} className="flex-1 text-left">
                          <div className={`text-[15px] font-bold ${ml.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>{ml.title}</div>
                          <div className="text-[11px] text-[var(--text-dim)] mt-1">{tr('gd.targetUnits', { n: ml.targetValue })}</div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`px-3 py-1 rounded-lg text-[10px] font-bold ${ml.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--surface-2)] text-[var(--text-dim)]'}`}>
                            {ml.done ? tr('gd.doneCheck') : tr('gd.stepN', { n: i + 1 })}
                          </div>
                          <button onClick={() => delMs(ml.id)} className="w-7 h-7 rounded-lg grid place-items-center text-[var(--text-mute)] hover:text-red-400 hover:bg-red-500/10 transition-colors hover-actions">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add milestone form */}
                <div className="relative">
                  <div className="absolute -left-[17px] w-6 h-6 rounded-full border-2 border-dashed border-[var(--border)] flex items-center justify-center z-10">
                    <Plus className="w-3 h-3 text-[var(--text-dim)]" />
                  </div>
                  <div className="card p-3 border-dashed flex flex-col sm:flex-row gap-2">
                    <input value={mlTitle} onChange={e => setMlTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMs()}
                      placeholder={tr('gd.milestoneTitle')}
                      className="flex-1 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)]" />
                    <div className="flex gap-2">
                      <input type="number" min={1} value={mlTarget} onChange={e => setMlTarget(parseInt(e.target.value) || 1)}
                        title={tr('gd.milestoneTarget')}
                        className="w-16 h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 text-[13px] text-[var(--text)] mono focus:outline-none focus:border-[var(--border)]" />
                      <button onClick={addMs} disabled={!mlTitle.trim()}
                        className="h-9 px-4 rounded-lg bg-[var(--primary)] text-white text-[12px] font-bold disabled:opacity-40 flex items-center gap-1.5 hover:bg-[var(--primary)] transition-colors"><Plus className="w-4 h-4" />{tr('gd.addMilestoneShort')}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AI INSIGHTS TAB ── */}
        {activeTab === 'insights' && (
          <div className="max-w-[900px] space-y-5">
            {/* Main insight */}
            <div className="card p-6 bg-gradient-to-br from-[var(--primary)]/10 to-transparent border-[var(--primary)]/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-2)] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[var(--text)]" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-[var(--text)]">{tr('gd.aiGoalAnalysis')}</div>
                  <div className="text-[10px] text-[var(--text-dim)]">{tr('gd.updatedAfter')}</div>
                </div>
              </div>
              <p className="text-[14px] text-[var(--text)] leading-relaxed">{insightText}</p>
            </div>

            {/* Derived insights from real data */}
            <div className="grid grid-cols-2 gap-4">
              {completionRate > 0 && (
                <div className="card p-5">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3" /> {tr('gd.completionRate')}
                  </div>
                  <div className="text-[36px] font-bold text-[var(--text)] mono">{completionRate}%</div>
                  <p className="text-[11px] text-[var(--text-dim)] mt-1">
                    {completionRate >= 80 ? tr('gd.crExcellent') : completionRate >= 60 ? tr('gd.crGood') : tr('gd.crLow')}
                  </p>
                </div>
              )}
              {avgDuration > 0 && (
                <div className="card p-5">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> {tr('gd.avgSessionLength')}
                  </div>
                  <div className="text-[36px] font-bold text-[var(--text)] mono">{avgDuration}m</div>
                  <p className="text-[11px] text-[var(--text-dim)] mt-1">
                    {avgDuration >= 60 ? tr('gd.aslGood') : tr('gd.aslShort')}
                  </p>
                </div>
              )}
              {feelingScore > 0 && (
                <div className="card p-5">
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Award className="w-3 h-3" /> {tr('gd.energyQuality')}
                  </div>
                  <div className="text-[36px] font-bold text-[var(--text)] mono">{feelingLabel}</div>
                  <p className="text-[11px] text-[var(--text-dim)] mt-1">
                    {tr('gd.basedOnN', { n: doneSessions.filter(s => s.progressLog).length })}
                  </p>
                </div>
              )}
              {hNeededPerWeek !== null && (
                <div className="card p-5" style={{ borderColor: onTrack ? '#22c55e30' : '#ef444430' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: onTrack ? '#22c55e' : '#ef4444' }}>
                    <Target className="w-3 h-3" /> {tr('gd.paceRequired')}
                  </div>
                  <div className="text-[36px] font-bold text-[var(--text)] mono">{hNeededPerWeek}h/w</div>
                  <p className="text-[11px] text-[var(--text-dim)] mt-1">
                    {onTrack ? tr('gd.paceOk', { h: goal.hoursPerWeekTarget }) : tr('gd.paceBehind', { need: hNeededPerWeek, plan: goal.hoursPerWeekTarget })}
                  </p>
                </div>
              )}
            </div>

            {/* Log history */}
            {recentLogs.length > 0 && (
              <div className="card p-5">
                <h3 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-4">{tr('gd.recentLogs')}</h3>
                <div className="space-y-3">
                  {recentLogs.map(s => (
                    <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--surface)] border border-[var(--surface-2)]">
                      <div className="text-[12px] text-[var(--text-dim)] mono shrink-0">{s.date ? format(new Date(s.date), 'MMM d', { locale }) : '—'}</div>
                      <div className="flex-1 text-[12px] text-[var(--text)] truncate">{s.title}</div>
                      <div className="text-[13px] font-bold text-[var(--text)] mono shrink-0">{s.progressLog!.value} {s.progressLog!.metric}</div>
                      <div className="text-[14px] shrink-0">
                        {s.progressLog!.feeling === 'great' ? '🚀' : s.progressLog!.feeling === 'good' ? '😊' : s.progressLog!.feeling === 'ok' ? '😐' : '😔'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {editOpen && <EditGoalModal goal={goal} onClose={() => setEditOpen(false)} onDeleted={onBack} />}
      {completeOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm anim-fade" onClick={() => setCompleteOpen(false)}>
          <div className="w-full max-w-sm card p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/15 grid place-items-center mx-auto mb-3"><CheckCircle2 className="w-6 h-6 text-[var(--primary)]" /></div>
              <h3 className="text-[16px] font-bold text-[var(--text)]">{tr('gd.completeGoalQ')}</h3>
              <p className="text-[12px] text-[var(--text-dim)] mt-1">{tr('gd.completeGoalDesc', { title: goal.title })}</p>
            </div>
            <div className="space-y-2">
              <button onClick={() => completeGoal('success')} className="w-full h-12 rounded-xl bg-emerald-500 text-black text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors"><Award className="w-4 h-4" /> {tr('gd.success')}</button>
              <button onClick={() => completeGoal('failed')} className="w-full h-12 rounded-xl bg-[var(--surface-2)] border border-red-500/20 text-red-400 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"><AlertCircle className="w-4 h-4" /> {tr('gd.failed')}</button>
              <button onClick={() => setCompleteOpen(false)} className="w-full h-11 rounded-xl text-[12px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">{tr('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
        {nodeModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setNodeModal(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md card rounded-b-none sm:rounded-3xl max-h-[85vh] overflow-y-auto anim-sheet sm:anim-pop">
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-1 truncate">{nodeModal.phaseTitle}</div>
                    <h3 className="text-[17px] font-bold text-[var(--text)]">{nodeModal.node.title}</h3>
                  </div>
                  <button onClick={() => setNodeModal(null)} className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] shrink-0"><X className="w-4 h-4" /></button>
                </div>
                {nodeModal.node.detail && <p className="text-[14px] text-[var(--text)] leading-relaxed">{nodeModal.node.detail}</p>}
                {nodeModal.node.resources && nodeModal.node.resources.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gr.resources')}</div>
                    {nodeModal.node.resources.map((r, i) => r.url ? (
                      <a key={i} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 hover:border-[var(--primary)] transition-colors">
                        <ExternalLink className="w-4 h-4 text-[var(--primary)] shrink-0" /><span className="flex-1 text-[13px] text-[var(--text)] truncate">{r.label}</span>
                      </a>
                    ) : (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                        <BookOpen className="w-4 h-4 text-[var(--text-dim)] shrink-0" /><span className="flex-1 text-[13px] text-[var(--text)]">{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { toggleRoadmapNode(goal.id, nodeModal.node.id); setNodeModal((m) => m ? { ...m, node: { ...m.node, done: !m.node.done } } : null); }}
                  className={`w-full h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 ${nodeModal.node.done ? 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]' : 'bg-emerald-500 text-white'}`}>
                  <Check className="w-4 h-4" />{tr(nodeModal.node.done ? 'gr.markUndone' : 'gr.markDone')}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

const GOAL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899'];

function EditGoalModal({ goal, onClose, onDeleted }: { goal: Goal; onClose: () => void; onDeleted: () => void }) {
  const tr = useT();
  const { updateGoal, deleteGoal, askConfirm, schedulePrefs } = useStore();
  const weekStartsOn = schedulePrefs.weekStartsOn ?? 1;
  const [title, setTitle] = useState(goal.title);
  const [subtitle, setSubtitle] = useState(goal.subtitle || '');
  const [emoji, setEmoji] = useState(goal.emoji);
  const [category, setCategory] = useState(goal.category);
  const [color, setColor] = useState(goal.color);
  const [deadline, setDeadline] = useState(goal.deadline ? goal.deadline.slice(0, 10) : '');
  const [priority, setPriority] = useState(goal.priority);
  const [hpw, setHpw] = useState(goal.hoursPerWeekTarget);
  const [total, setTotal] = useState(goal.totalHoursEstimated);
  const [completionType, setCompletionType] = useState<'hours' | 'date'>(goal.completionType || 'hours');

  const save = () => {
    if (!title.trim()) return;
    updateGoal(goal.id, {
      title: title.trim(), subtitle: subtitle.trim() || undefined, emoji: emoji.trim() || '🎯',
      category, color, deadline: deadline || undefined, priority,
      hoursPerWeekTarget: Math.max(0, hpw), totalHoursEstimated: Math.max(0, total),
      completionType,
    });
    onClose();
  };

  const remove = () => askConfirm({
    title: tr('gd.deleteGoalQ'), message: tr('gd.deleteGoalMsg', { title: goal.title }),
    confirmLabel: tr('gd.deleteGoal'), danger: true, onConfirm: () => { deleteGoal(goal.id); onDeleted(); },
  });

  const field = 'w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)]';
  const lbl = 'block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm anim-fade" onClick={onClose}>
      <div className="w-full max-w-lg card overflow-hidden flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}22`, color }}><Edit2 className="w-4 h-4" /></div>
          <div className="flex-1 font-bold text-[var(--text)] text-[14px]">{tr('gd.editGoalTitle')}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--border)] grid place-items-center text-[var(--text-dim)]"><Plus className="w-4 h-4 rotate-45" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Emoji + title */}
          <div className="flex gap-3">
            <div>
              <label className={lbl}>{tr('gd.emoji')}</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2}
                className="w-14 h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-center text-[22px] focus:outline-none focus:border-[var(--border)]" />
            </div>
            <div className="flex-1">
              <label className={lbl}>{tr('gd.name')}</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tr('gd.goalNamePlaceholder')} className={field} />
            </div>
          </div>

          <div>
            <label className={lbl}>{tr('gd.subtitle')}</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder={tr('gd.subtitlePlaceholder')} className={field} />
          </div>

          {/* Category */}
          <div>
            <label className={lbl}>{tr('gd.category')}</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_META).map(([k, v]: [string, any]) => (
                <button key={k} onClick={() => setCategory(k as Goal['category'])}
                  className={`px-3 py-1.5 rounded-xl text-[12px] flex items-center gap-1.5 border transition-all ${category === k ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  <span>{v.emoji}</span>{tr('cat.' + k)}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className={lbl}>{tr('gd.color')}</label>
            <div className="grid grid-cols-6 gap-2.5 justify-items-center">
              {GOAL_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-9 h-9 rounded-full grid place-items-center transition-transform hover:scale-110 active:scale-95"
                  style={{ background: c, boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'inset 0 1px 2px rgba(255,255,255,.3), inset 0 -2px 5px rgba(0,0,0,.3)' }}>
                  {color === c && <Check className="w-4 h-4 text-[var(--text)]" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Completion criterion */}
          <div>
            <label className={lbl}>{tr('gd.completionCriterion')}</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([['hours', tr('gd.byHours')], ['date', tr('gd.byDate')]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setCompletionType(v)}
                  className={`h-10 rounded-xl text-[12px] font-bold border transition-all ${completionType === v ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  {label}
                </button>
              ))}
            </div>
            {completionType === 'hours' ? (
              <div>
                <div className="text-[11px] text-[var(--text-dim)] mb-1.5">{tr('gd.byHoursDesc')}</div>
                <input type="number" min={0} step={1} value={total} onChange={e => setTotal(parseFloat(e.target.value) || 0)} className={`${field} mono`} />
              </div>
            ) : (
              <div>
                <div className="text-[11px] text-[var(--text-dim)] mb-1.5">{tr('gd.byDateDesc')}</div>
                <DatePicker value={deadline} weekStartsOn={weekStartsOn} onChange={setDeadline} />
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className={lbl}>{tr('gd.priority')}</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`h-10 rounded-xl text-[12px] font-bold border transition-all ${priority === p ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  P{p}
                </button>
              ))}
            </div>
          </div>

          {/* Weekly target */}
          <div>
            <label className={lbl}>{tr('gd.hoursPerWeek')}</label>
            <input type="number" min={0} step={0.5} value={hpw} onChange={e => setHpw(parseFloat(e.target.value) || 0)} className={`${field} mono`} />
          </div>

          <button onClick={remove} className="text-[12px] font-bold text-red-400 hover:text-red-300 flex items-center gap-2 pt-1">
            <AlertCircle className="w-4 h-4" /> {tr('gd.deleteGoal')}
          </button>
        </div>

        <div className="border-t border-[var(--border)] p-4 flex gap-2">
          <button onClick={onClose} className="h-11 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)] hover:text-[var(--text)] transition-colors">{tr('common.cancel')}</button>
          <button onClick={save} disabled={!title.trim()}
            className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[var(--primary)] transition-colors">
            <Check className="w-4 h-4" /> {tr('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
