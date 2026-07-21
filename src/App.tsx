import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useStore, habitDueOn, habitStreak, dailyCompletion, goalInsight, goalProgressPct, goalStreak, milestoneReached } from './store';
import { useT, useDateLocale } from './i18n';
import { useEffectiveTheme } from './hooks/useEffectiveTheme';
import { syncReminders } from './utils/notifications';
import { syncWidget } from './utils/widget';
import { initTimerActionListener } from './utils/timerNotifications';
import { popHardwareBack, useBackClose } from './hooks/useHardwareBack';
import { TimerBar, TimerCard, TimerLauncher, TimerAssignmentSheet } from './components/FocusTimer';
import { motion, AnimatePresence } from 'framer-motion';
import { pageTransition, fillBar, listItem } from './utils/motion';
import { parseTaskCapture } from './utils/taskCapture';
import { SearchOverlay } from './components/SearchOverlay';
import { startVoice, voiceAvailable, voiceErrorCode, type VoiceErrorCode, type VoiceSession } from './utils/voice';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { CATEGORY_META } from './types';
import type { Session, GTDTask, AppView } from './types';
import { Calendar,Target,Clock,Plus,CheckCircle2,Circle,X,ChevronRight,ChevronLeft,Sparkles,AlertCircle,MapPin,Link as LinkIcon,Bell,RotateCcw,Repeat2,Edit2,Home as HomeIcon,User as UserIcon,Inbox,Archive,Flame,Timer,Wand2,Search as SearchIcon,Mic,Settings as SettingsIcon,LayoutGrid,BarChart3,Folder,Layers } from 'lucide-react';
import { EnergyChart } from './components/EnergyChart';
import { NebullaMark } from './components/BrandLogo';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { SessionIcon } from './components/ui/IconPicker';
import { Drawer } from './components/ui/Drawer';
import { fmtHours, fmtDur } from './utils/duration';
import { formatClock } from './utils/time';
import { hasTodayFocus } from './domain/taskFocus';

const GTDView = lazy(() => import('./components/GTDView').then(module => ({ default: module.GTDView })));
const HabitsView = lazy(() => import('./components/HabitsView').then(module => ({ default: module.HabitsView })));
const HabitModal = lazy(() => import('./components/HabitsView').then(module => ({ default: module.HabitModal })));
const ArchiveView = lazy(() => import('./components/ArchiveView').then(module => ({ default: module.ArchiveView })));
const ScheduleView = lazy(() => import('./components/ScheduleView').then(module => ({ default: module.ScheduleView })));
const GoalDetailView = lazy(() => import('./components/GoalDetailView').then(module => ({ default: module.GoalDetailView })));
const AIScheduler = lazy(() => import('./components/AIScheduler').then(module => ({ default: module.AIScheduler })));
const AIPlanner = lazy(() => import('./components/AIPlanner').then(module => ({ default: module.AIPlanner })));
const SettingsView = lazy(() => import('./components/SettingsView').then(module => ({ default: module.SettingsView })));
const Onboarding = lazy(() => import('./components/Onboarding').then(module => ({ default: module.Onboarding })));
const IntroCourse = lazy(() => import('./components/IntroCourse').then(module => ({ default: module.IntroCourse })));
const GoalCreateWizard = lazy(() => import('./components/GoalCreateWizard').then(module => ({ default: module.GoalCreateWizard })));
const ProjectsView = lazy(() => import('./components/ProjectsView').then(module => ({ default: module.ProjectsView })));
const AreasView = lazy(() => import('./components/AreasView').then(module => ({ default: module.AreasView })));

function ViewLoading(){
  const t = useT();
  return <div className="flex-1 grid place-items-center bg-[var(--bg)] text-[var(--text-dim)] text-[13px]">{t('common.loading')}</div>;
}

/* ─── SVG Progress Ring ─── */
function Ring({pct,size=80,stroke=5,color='#22c55e',bg='var(--border)',children}:{pct:number;size?:number;stroke?:number;color?:string;bg?:string;children?:React.ReactNode}){
  const r=(size-stroke)/2;const c=2*Math.PI*r;const off=c-(pct/100)*c;
  return <div className="relative inline-flex items-center justify-center" style={{width:size,height:size}}>
    <svg className="progress-ring" width={size} height={size}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}/></svg>
    <div className="absolute inset-0 flex items-center justify-center">{children}</div>
  </div>;
}

const LEGACY_LINKED_SESSION_NOTES = new Set([
  'Linked session. Drag to reschedule.',
  'Связанная сессия. Перетащите, чтобы перенести.',
  'リンクされたセッション。ドラッグして予定を変更できます。',
]);
const cleanSessionNote = (note?: string) => {
  const value = (note || '').trim();
  return LEGACY_LINKED_SESSION_NOTES.has(value) ? '' : value;
};

function HomeTaskRow({ tk, onOpen }: { tk: GTDTask; onOpen: () => void }) {
  const store = useStore();
  const t = useT();
  const [completing, setCompleting] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const completeTask = () => {
    if (completing) return;
    setCompleting(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      store.processTask(tk.id, 'done');
      timerRef.current = null;
    }, 220);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: completing ? 0.2 : 1, scale: completing ? 0.98 : 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={`tcard p-3.5 flex items-center gap-3 relative overflow-hidden ${completing ? 'border-emerald-500/40 bg-emerald-500/10' : ''}`}
    >
      {completing && (
        <div className="absolute inset-0 pointer-events-none grid place-items-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 grid place-items-center text-emerald-500 animate-pulse">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      )}
      <button onClick={completeTask} className="shrink-0 w-10 h-10 -ml-1 grid place-items-center" aria-label={t('common.markDone')}>
        <Circle className={`w-6 h-6 transition-colors ${completing ? 'text-emerald-500' : 'text-[var(--text-mute)] hover:text-emerald-500'}`} />
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <div className={`text-[14px] font-semibold truncate ${completing ? 'text-emerald-500 line-through' : 'text-[var(--text)]'}`}>{tk.title}</div>
        {(tk.context||tk.durationMinutes)&&<div className="text-[11px] text-[var(--text-dim)] mt-0.5 truncate">{[tk.context,tk.durationMinutes?`${tk.durationMinutes}${t('common.minShort')}`:''].filter(Boolean).join(' · ')}</div>}
      </div>
      <span className={`shrink-0 text-[10px] font-extrabold mono px-2 py-1 rounded-lg ${tk.priority===1?'bg-red-500/12 text-red-400':tk.priority===2?'bg-amber-500/12 text-amber-400':'bg-[var(--surface-2)] text-[var(--text-mute)]'}`}>P{tk.priority}</span>
    </motion.div>
  );
}

function HomeSessionRow({ s, index = 0 }: { s: Session; index?: number }) {
  const store = useStore();
  const t = useT();
  const [completing, setCompleting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const goal = store.goals.find(x => x.id === s.goalId);
  const color = s.color || goal?.color || '#22c55e';
  const emoji = goal?.emoji || '🗓️';
  const fmtStart = (session: Session) => Number.isFinite(session.startHour) ? formatClock(session.startHour * 60 + (session.startMinute || 0), store.lang) : '';

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const completeSession = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (completing) return;
    setCompleting(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      store.updateSession(s.id, { status: 'done' });
      timerRef.current = null;
    }, 260);
  };

  return (
    <motion.div
      key={s.id}
      {...listItem(index)}
      animate={{ opacity: completing ? 0.18 : 1, scale: completing ? 0.98 : 1, y: completing ? -4 : 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -8 }}
      onClick={() => store.openSessionModal(s.id)}
      className={`tcard p-3 pl-4 flex items-center gap-3 cursor-pointer active:scale-[.99] transition-transform relative overflow-hidden ${completing ? 'bg-emerald-500/10 border-emerald-500/40' : ''}`}
    >
      {completing && (
        <div className="absolute inset-0 pointer-events-none grid place-items-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 grid place-items-center text-emerald-500 animate-pulse">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      )}
      <div className="shrink-0 w-[52px] text-center">
        {s.allDay || !fmtStart(s)
          ? <div className="text-[11px] font-bold text-[var(--text-dim)] leading-tight">{t('home.allDay')}</div>
          : <>
              <div className="text-[15px] font-bold mono text-[var(--text)] leading-none">{fmtStart(s)}</div>
              {!s.openEnd && <div className="text-[10px] text-[var(--text-mute)] mono mt-1">{fmtDur(s.durationMinutes, store.lang)}</div>}
            </>}
      </div>
      <span className="shrink-0 w-[3px] h-9 rounded-full" style={{ background: completing ? '#10b981' : color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {s.icon ? <SessionIcon name={s.icon} className="w-3.5 h-3.5 text-[var(--text-dim)]" /> : <span className="text-sm leading-none">{emoji}</span>}
          <span className={`font-bold text-[14px] truncate ${completing ? 'text-emerald-500 line-through' : 'text-[var(--text)]'}`}>{s.title}</span>
        </div>
        {!s.allDay && !fmtStart(s) && <div className="text-[11px] text-[var(--text-dim)] mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3"/>{fmtDur(s.durationMinutes, store.lang)}</div>}
      </div>
      <button onClick={completeSession} aria-label={t('common.markDone')}
        className={`w-10 h-10 rounded-full grid place-items-center shrink-0 border transition-colors ${completing ? 'grad border-transparent text-white' : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-mute)] hover:text-emerald-500 hover:border-emerald-500/40'}`}>
        <CheckCircle2 className="w-[18px] h-[18px]" />
      </button>
    </motion.div>
  );
}

export default function App(){
  const t=useT();
  const locale=useDateLocale();
  const store=useStore();
  const{goals,sessions,gtdTasks,projects,habits,activeView,weekOffset,userName,onboarded,introCourseCompleted,schedulePrefs}=store;
  const theme=useEffectiveTheme();
  useEffect(()=>{
    document.documentElement.lang=store.lang;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#06070d':'#eef0f8');
  },[store.lang,theme]);
  useEffect(()=>{ syncReminders(sessions,gtdTasks,habits); },[sessions,gtdTasks,habits,store.notifPrefs,store.habitRemindersEnabled]);
  useEffect(()=>{ syncWidget(sessions,gtdTasks,habits); },[sessions,gtdTasks,habits,store.lang]);
  const undoTs=store.pendingUndo?.ts;
  useEffect(()=>{ if(!undoTs) return; const id=setTimeout(()=>useStore.getState().clearUndo(),5000); return ()=>clearTimeout(id); },[undoTs]);
  useEffect(()=>{ store.syncScheduledSessions(); },[sessions.length,gtdTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ store.extendRecurringSeries(); },[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ initTimerActionListener(); },[]);
  useEffect(()=>{ if(store.pendingGoalId){ setSelectedGoalId(store.pendingGoalId); store.setPendingGoalId(null); } },[store.pendingGoalId]);
  const[selectedGoalId,setSelectedGoalId]=useState<string|null>(null);
  const[qt,setQt]=useState('');
  const[listening,setListening]=useState(false);
  const[voiceError,setVoiceError]=useState<VoiceErrorCode|null>(null);
  const voiceRef=useRef<VoiceSession|null>(null);
  const voiceStoppedManually=useRef(false);
  const toggleVoice=async()=>{
    if(listening){voiceStoppedManually.current=true;voiceRef.current?.stop();return;}
    voiceStoppedManually.current=false;
    setVoiceError(null);
    setListening(true);
    const session=await startVoice(store.lang,{
      onPartial:(text)=>setQt(text),
      onFinal:(text)=>{
        setListening(false);
        voiceRef.current=null;
        if(text)setQt(text);
        else if(!voiceStoppedManually.current)setVoiceError('no-speech');
      },
      onError:(error)=>{setListening(false);voiceRef.current=null;setVoiceError(voiceErrorCode(error));},
    });
    if(!session){setListening(false);return;}
    voiceRef.current=session;
  };
  const[captureOpen,setCaptureOpen]=useState(false);
  const[searchOpen,setSearchOpen]=useState(false);
  const[quickHabitOpen,setQuickHabitOpen]=useState(false);
  const[logMetric,setLogMetric]=useState('progress');
  const[logValue,setLogValue]=useState('1');
  const[logFeeling,setLogFeeling]=useState<'bad'|'ok'|'good'|'great'>('good');
  const[logNotes,setLogNotes]=useState('');
  const[overviewChild,setOverviewChild]=useState(false);
  const[homeDateStr,setHomeDateStr]=useState(()=>format(new Date(),'yyyy-MM-dd'));
  const[profileName,setProfileName]=useState(userName||'');
  const[profileFocus,setProfileFocus]=useState((store.userProfile?.focus||[]).join(', '));
  const[profileStruggles,setProfileStruggles]=useState((store.userProfile?.struggles||[]).join(', '));
  const[profileSleep,setProfileSleep]=useState(store.userProfile?.sleep||'');
  const[profileAge,setProfileAge]=useState(store.userProfile?.age||'');
  const[profileSource,setProfileSource]=useState(store.userProfile?.source||'');
  useEffect(()=>{
    setProfileName(userName||'');
    setProfileFocus((store.userProfile?.focus||[]).join(', '));
    setProfileStruggles((store.userProfile?.struggles||[]).join(', '));
    setProfileSleep(store.userProfile?.sleep||'');
    setProfileAge(store.userProfile?.age||'');
    setProfileSource(store.userProfile?.source||'');
  },[userName,store.userProfile]);
  const profileList=(value:string)=>value.split(',').map(x=>x.trim()).filter(Boolean);
  const saveProfile=()=>{
    store.setUserName(profileName);
    store.setUserProfile({
      focus: profileList(profileFocus),
      struggles: profileList(profileStruggles),
      sleep: profileSleep.trim(),
      age: profileAge.trim()||undefined,
      source: profileSource.trim()||undefined,
    });
  };
  const profileDirty=profileName.trim()!==(userName||'')
    || profileFocus!==((store.userProfile?.focus||[]).join(', '))
    || profileStruggles!==((store.userProfile?.struggles||[]).join(', '))
    || profileSleep!==(store.userProfile?.sleep||'')
    || profileAge!==(store.userProfile?.age||'')
    || profileSource!==(store.userProfile?.source||'');
  // Familiar desktop shortcuts: Cmd/Ctrl+K searches, C opens quick capture.
  // Do not steal keys while the person is typing in a form.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  // ── Hardware back: layer stack (modals close top-first) ───────────────
  useBackClose(!!store.confirmDialog,store.closeConfirm);
  useBackClose(captureOpen,()=>setCaptureOpen(false));
  // Deep links from home-screen widgets open exactly the intended destination.
  useEffect(()=>{
    let h:{remove:()=>void}|undefined; let disposed=false;
    const openUrl=(url?:string)=>{
      const host=(url||'').replace(/^nebulla:\/\//,'').split(/[/?#]/)[0];
      if(host==='capture') { setCaptureOpen(true); return; }
      const destination:Partial<Record<string,AppView>>={today:'dashboard',calendar:'week',manager:'manager',goals:'goals'};
      const view=destination[host];
      if(view){ store.setActiveView(view); setSelectedGoalId(null); setOverviewChild(false); }
    };
    CapacitorApp.addListener('appUrlOpen',(e)=>{ openUrl(e.url); }).then(x=>{ if(disposed)x.remove(); else h=x; });
    CapacitorApp.getLaunchUrl().then(r=>{ openUrl(r?.url); }).catch(()=>{});
    return ()=>{ disposed=true; h?.remove(); };
  },[]);
  useBackClose(quickHabitOpen,()=>setQuickHabitOpen(false));
  useBackClose(!!store.timerLauncher,store.closeTimerLauncher);
  useBackClose(store.timerAssignmentOpen,store.closeTimerAssignment);
  useBackClose(!!store.sessionModalId,store.closeSessionModal);
  useBackClose(store.logOpen,store.closeLog);
  useBackClose(!!store.gtdEditTaskId,store.closeEditTask);
  useBackClose(store.weeklyReviewOpen,store.closeWeeklyReview);
  useBackClose(!!store.doingTaskId,()=>store.setDoingTask(null));
  // ── Hardware back: view history (back returns to the previous screen) ─
  type NavSnap={view:typeof activeView;goalId:string|null;child:boolean};
  const navHistory=useRef<NavSnap[]>([]);
  const navState=useRef<NavSnap>({view:activeView,goalId:selectedGoalId,child:overviewChild});
  const restoringNav=useRef(false);
  useEffect(()=>{
    const prev=navState.current;
    const cur:NavSnap={view:activeView,goalId:selectedGoalId,child:overviewChild};
    navState.current=cur;
    if(restoringNav.current){restoringNav.current=false;return;}
    if(cur.view===prev.view&&cur.goalId===prev.goalId)return;
    navHistory.current.push(prev);
    if(navHistory.current.length>50)navHistory.current.shift();
  },[activeView,selectedGoalId,overviewChild]);
  useEffect(()=>{
    if(!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    let disposed=false;
    CapacitorApp.addListener('backButton',()=>{
      if(popHardwareBack())return;
      const prev=navHistory.current.pop();
      if(prev){
        restoringNav.current=true;
        setSelectedGoalId(prev.goalId);
        setOverviewChild(prev.child);
        useStore.getState().setActiveView(prev.view);
        return;
      }
      const cur=navState.current;
      if(cur.goalId||cur.view!=='dashboard'){
        restoringNav.current=true;
        setSelectedGoalId(null);
        setOverviewChild(false);
        useStore.getState().setActiveView('dashboard');
        return;
      }
      CapacitorApp.exitApp();
    }).then((h)=>{if(disposed)h.remove();else handle=h;});
    return ()=>{disposed=true;handle?.remove();};
  },[]);
  const ws=startOfWeek(addDays(new Date(),weekOffset*7),{weekStartsOn:(schedulePrefs.weekStartsOn??1)});
  const days=Array.from({length:7},(_,i)=>addDays(ws,i));
  const doneW=sessions.filter(s=>s.status==='done').length;
  const totalW=sessions.length;
  const adherence=totalW?Math.round((doneW/totalW)*100):0;

  // ── Real stats helpers ────────────────────────────────────────────────
  // Per category stats
  const catSessions=(cat:string)=>sessions.filter(s=>goals.find(g=>g.id===s.goalId)?.category===cat&&s.status==='done');
  const langHours=+(catSessions('language').reduce((a,s)=>a+s.durationMinutes,0)/60).toFixed(1);
  const readPages=catSessions('reading').reduce((a,s)=>+(a+(s.progressLog?.value||0)),0);
  const sportKm=catSessions('sport').reduce((a,s)=>+(a+(s.progressLog?.value||0)),0);

  const capture=()=>{
    const raw=qt.trim();if(!raw)return;
    const parsed=parseTaskCapture(raw);
    const newId=store.captureTask(parsed.title,parsed.durationMinutes);
    if(parsed.priority||parsed.context||parsed.tags?.length||parsed.dueDate||parsed.remindAt||parsed.recurring){
      store.updateTask(newId,{priority:parsed.priority||3,context:parsed.context,tags:parsed.tags||[],dueDate:parsed.dueDate,remindAt:parsed.remindAt,recurring:parsed.recurring});
    }
    setQt('');
  };
  const goalColor=(gid:string)=>goals.find(g=>g.id===gid)?.color||'#22c55e';
  const goalEmoji=(gid:string)=>goals.find(g=>g.id===gid)?.emoji||'✓';
  const overviewSectionViews = new Set<AppView>(['goals', 'habits', 'inbox', 'archive', 'planner', 'settings']);
  const bottomNavActiveView = overviewChild && overviewSectionViews.has(activeView) ? 'progress' : activeView;

  // ── Home "Today / Tomorrow" data ──────────────────────────────────────
  const _now=new Date();
  const _tomorrow=addDays(_now,1);
  const _todayStr=format(_now,'yyyy-MM-dd');
  const byStart=(a:Session,b:Session)=>(a.startHour*60+(a.startMinute||0))-(b.startHour*60+(b.startMinute||0));
  const taskActive=(tk:GTDTask)=>tk.status!=='done'&&tk.status!=='trash';
  const sessionsOn=(d:Date)=>sessions.filter(s=>!!s.date&&isSameDay(parseISO(s.date),d));
  const sessionsTodayAll=sessionsOn(_now);
  const sessionsTomorrowAll=sessionsOn(_tomorrow);
  const visibleSession=(s:Session)=>s.status!=='done';
  const timedToday=sessionsTodayAll.filter(s=>!s.allDay&&visibleSession(s)).sort(byStart);
  const allDayToday=sessionsTodayAll.filter(s=>s.allDay&&visibleSession(s));
  const tasksToday=gtdTasks.filter(tk=>taskActive(tk)&&(hasTodayFocus(tk,_todayStr)||(tk.dueDate&&tk.dueDate<=_todayStr)));
  const timedTomorrow=sessionsTomorrowAll.filter(s=>!s.allDay&&visibleSession(s)).sort(byStart);
  const allDayTomorrow=sessionsTomorrowAll.filter(s=>s.allDay&&visibleSession(s));
  const tasksTomorrow=gtdTasks.filter(tk=>taskActive(tk)&&tk.dueDate&&isSameDay(parseISO(tk.dueDate),_tomorrow));

  // ── Home selected day (week-strip tap stays on Home and swaps the data) ──
  const homeSelDate=parseISO(homeDateStr);
  const homeIsToday=isSameDay(homeSelDate,_now);
  const sessionsSelAll=homeIsToday?sessionsTodayAll:sessionsOn(homeSelDate);
  const timedSel=homeIsToday?timedToday:sessionsSelAll.filter(s=>!s.allDay&&visibleSession(s)).sort(byStart);
  const allDaySel=homeIsToday?allDayToday:sessionsSelAll.filter(s=>s.allDay&&visibleSession(s));
  const tasksSel=homeIsToday?tasksToday:gtdTasks.filter(tk=>taskActive(tk)&&tk.dueDate===homeDateStr);
  const dueHabitsSel=habits.filter(h=>!h.archived&&habitDueOn(h,homeSelDate));
  const selDayLabel=format(homeSelDate,'EEEE, d MMM',{locale});

  const renderHabitRow=(h:typeof habits[number],i=0)=>{const e=h.log[homeDateStr];const st=e?.status;const count=e?.count||0;const isCounter=h.targetCount>1;return (
    <motion.div key={h.id} {...listItem(i)} className="tcard p-3 pl-3.5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl grid place-items-center text-base shrink-0" style={{background:`${h.color}1f`}}>{h.emoji||'✅'}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-[14px] font-semibold truncate ${st==='done'?'text-[var(--text-mute)] line-through':st==='failed'?'text-red-400':'text-[var(--text)]'}`}>{h.title}</div>
        {isCounter&&<div className="text-[11px] text-[var(--text-dim)] mt-0.5 mono">{count}/{h.targetCount}{h.unit?' '+h.unit:''}</div>}
      </div>
      {isCounter
        ? <button onClick={()=>store.incHabit(h.id,homeDateStr)} className="h-9 px-3.5 rounded-full text-[12px] font-bold flex items-center gap-1 shrink-0 mono" style={st==='done'?{background:'#10b981',color:'#fff'}:{background:`${h.color}1f`,color:h.color}}>{st==='done'?<CheckCircle2 className="w-3.5 h-3.5"/>:<Plus className="w-3.5 h-3.5"/>}{count}/{h.targetCount}</button>
        : <button onClick={()=>st==='done'?store.clearHabitDay(h.id,homeDateStr):store.setHabitStatus(h.id,homeDateStr,'done')} className={`w-10 h-10 rounded-full grid place-items-center shrink-0 border transition-colors ${st==='done'?'bg-emerald-500 border-transparent text-white':'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-mute)] hover:text-emerald-500 hover:border-emerald-500/40'}`}><CheckCircle2 className="w-[18px] h-[18px]"/></button>}
    </motion.div>);};

  const renderSessionRow=(s:Session,i=0)=><HomeSessionRow key={s.id} s={s} index={i} />;

  const renderTaskRow=(tk:GTDTask,i=0)=>(
    <motion.div key={tk.id} {...listItem(i)}>
      <HomeTaskRow tk={tk} onOpen={()=>{store.setActiveView('inbox');store.openEditTask(tk.id);setOverviewChild(false);}} />
    </motion.div>);

  /* ─── NAV ─── */



  if(!onboarded) return <Suspense fallback={<ViewLoading/>}><Onboarding/></Suspense>;
  if(!introCourseCompleted) return <Suspense fallback={<ViewLoading/>}><IntroCourse/></Suspense>;

  return <Suspense fallback={<ViewLoading/>}><div
    className={`${theme==='dark'?'theme-dark ':''}h-[100dvh] w-full max-w-full flex bg-[var(--bg)] text-[var(--text)] overflow-hidden`}
  >

    {/* ═══════════════════ MAIN ═══════════════════ */}
    <main className="relative flex-1 flex flex-col min-w-0 bg-[var(--bg)]">
      {/* Mobile safe-area spacer */}
      <div className="md:hidden shrink-0" style={{height:'env(safe-area-inset-top)'}} />
      {/* ═══════════════ DESKTOP TOP NAV (md+) ═══════════════ */}
      <div className="hidden md:flex items-center gap-1 h-[72px] px-8 border-b border-[var(--border)] glass shrink-0">
        <div className="flex items-center gap-2.5 mr-7">
          <NebullaMark className="w-8 h-8" />
          <span className="text-[16px] font-bold text-[var(--text)]">Nebulla</span>
        </div>
        {(()=>{
          const topTab=(id:AppView,label:string,Ic:React.ComponentType<{className?:string;strokeWidth?:number}>)=>{
            const a=bottomNavActiveView===id;
            return (
              <button key={id} onClick={()=>{store.setActiveView(id);setSelectedGoalId(null);setOverviewChild(false);}}
                className={`relative h-10 px-4 rounded-xl flex items-center gap-2 text-[13px] font-semibold transition-colors ${a?'text-[var(--primary)]':'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}>
                {a&&<motion.span layoutId="top-nav-pill" transition={{type:'spring',stiffness:480,damping:38}} className="absolute inset-0 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/10"/>}
                <Ic className="relative w-[18px] h-[18px]" strokeWidth={a?2.5:2}/><span className="relative">{label}</span>
              </button>
            );
          };
          return <>
            {topTab('dashboard',t('bottomNav.home'),HomeIcon)}
            {topTab('week',t('bottomNav.calendar'),Calendar)}
            {topTab('manager',t('bottomNav.manager'),LayoutGrid)}
            {topTab('progress',t('bottomNav.profile'),UserIcon)}
          </>;
        })()}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setSearchOpen(true)} aria-label={t('search.title')} className="h-9 w-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"><SearchIcon className="w-4 h-4"/></button>
          {(activeView==='dashboard'||(activeView==='goals'&&!selectedGoalId))&&<button onClick={()=>store.openWizard()} className="h-9 px-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold flex items-center gap-1.5 hover:bg-[var(--border)] transition-colors"><Plus className="w-3.5 h-3.5"/>{t('common.newGoal')}</button>}
          <button onClick={()=>setCaptureOpen(v=>!v)} aria-label={t('sidebar.quickCaptureGtd')} className="grad h-10 px-4 rounded-xl text-white text-[13px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform" style={{boxShadow:'var(--shadow-primary)'}}><Plus className="w-4 h-4" strokeWidth={2.6}/>{t('create.title')}</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
      <motion.div key={activeView+(selectedGoalId?':'+selectedGoalId:'')} initial={pageTransition.initial} animate={pageTransition.animate} exit={pageTransition.exit} transition={pageTransition.transition} className={`flex-1 ${activeView==='week'?'':'pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-0 '}${activeView === 'inbox' || activeView === 'architect' || activeView === 'planner' || activeView === 'habits' || activeView === 'week' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

{/* ═══════════════════ AI DAY ARCHITECT ═══════════════════ */}
{activeView==='architect'&&<AIScheduler onBack={()=>store.setActiveView('planner')}/>}
{activeView==='planner'&&<AIPlanner/>}

{/* ═══════════════════ SYSTEM HISTORY ═══════════════════ */}
{activeView==='archive'&&<ArchiveView onBack={overviewChild?()=>{store.setActiveView('progress');setOverviewChild(false);}:undefined}/>}

{/* ═══════════════════ SETTINGS ═══════════════════ */}
{activeView==='settings'&&<SettingsView onBack={overviewChild?()=>{store.setActiveView('progress');setOverviewChild(false);}:undefined}/>}

{/* ═══════════════════ PROJECTS ═══════════════════ */}
{activeView==='projects'&&<ProjectsView onBack={()=>{store.setActiveView('manager');setSelectedGoalId(null);setOverviewChild(false);}}/>}
{activeView==='areas'&&<AreasView onBack={()=>{store.setActiveView('manager');setSelectedGoalId(null);setOverviewChild(false);}} onOpenProject={(id)=>{setSelectedProjectId(id);store.setActiveView('projects');}}/>}

{/* ═══════════════════ DASHBOARD ═══════════════════ */}
{activeView==='dashboard'&&(()=>{
  const initials=(userName||'').trim().split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'·';
  const streak=Math.max(0,...goals.map(g=>goalStreak(g,sessions)));
  const dueHabitsToday=habits.filter(h=>!h.archived&&habitDueOn(h,_now));
  const doneToday=sessionsTodayAll.filter(s=>s.status==='done').length+dueHabitsToday.filter(h=>h.log[_todayStr]?.status==='done').length;
  const totalToday=sessionsTodayAll.length+tasksToday.length+dueHabitsToday.length;
  const pct=totalToday?Math.round(doneToday/totalToday*100):0;
  const isFresh=goals.length===0&&sessions.length===0&&gtdTasks.length===0&&habits.length===0;
  const emptyBox=(txt:string)=><div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-[13px] text-[var(--text-dim)]">{txt}</div>;
  const head=(icon:React.ReactNode,txt:string)=><h3 className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-[.12em] mb-3 flex items-center gap-2">{icon}{txt}</h3>;
  const hour=_now.getHours();
  const greetKey=hour<5?'home.greetNight':hour<12?'home.greetMorning':hour<18?'home.greetDay':'home.greetEvening';
  const homeWs=startOfWeek(_now,{weekStartsOn:(schedulePrefs.weekStartsOn??1)});
  const homeDays=Array.from({length:7},(_,i)=>addDays(homeWs,i));
  const dayBusy=(d:Date)=>sessionsOn(d).length>0;
  return <div className="relative px-4 md:px-10 py-5 md:py-8 max-w-[760px] mx-auto w-full space-y-7 pb-28">
  <div className="aurora"/>
  {/* Hero: greeting + week strip + day progress */}
  <div className="anim-fade relative">
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <NebullaMark className="w-7 h-7"/>
        <span className="display text-[14px] text-[var(--text)]">Nebulla</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {streak>0&&<span className="h-8 px-2.5 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center gap-1 text-[12px] font-bold text-[var(--text)]">🔥 {streak}</span>}
        <button onClick={()=>setSearchOpen(true)} aria-label={t('search.title')} className="hit w-10 h-10 rounded-full grid place-items-center bg-[var(--surface)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]"><SearchIcon className="w-4 h-4"/></button>
        <button onClick={()=>{store.setActiveView('progress');setOverviewChild(false);}} aria-label={t('bottomNav.profile')} className="hit w-10 h-10 rounded-full grid place-items-center text-[12px] font-bold text-white grad">{initials}</button>
      </div>
    </div>
    <h1 className="display text-[24px] md:text-[34px] text-[var(--text)] max-w-[22ch]">{t(greetKey,{name:userName||'···'})} <span className="inline-block">👋</span></h1>
    <p className="text-[13.5px] text-[var(--text-dim)] mt-2">{t('home.heroSub')} <span className="capitalize">{format(_now,'EEEE, d MMMM',{locale})}</span></p>

    {/* Week strip */}
    <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
      {homeDays.map(d=>{
        const today=isSameDay(d,_now);
        const sel=isSameDay(d,homeSelDate);
        return <button key={d.toISOString()} onClick={()=>setHomeDateStr(format(d,'yyyy-MM-dd'))}
          className={`shrink-0 w-[52px] h-[64px] rounded-2xl flex flex-col items-center justify-center gap-1 border transition-colors ${sel?'grad border-transparent text-white shadow-lg':today?'bg-[var(--surface)] border-[var(--primary)]/50 text-[var(--text-dim)]':'bg-[var(--surface)] border-[var(--border)] text-[var(--text-dim)]'}`}
          style={sel?{boxShadow:'var(--shadow-primary)'}:undefined}>
          <span className="text-[10px] font-bold uppercase tracking-wider">{format(d,'EEEEEE',{locale})}</span>
          <span className={`text-[17px] font-bold mono leading-none ${sel?'text-white':'text-[var(--text)]'}`}>{format(d,'d')}</span>
          <span className={`w-1 h-1 rounded-full ${dayBusy(d)?(sel?'bg-white':'bg-[var(--accent)]'):'bg-transparent'}`}/>
        </button>;
      })}
    </div>

    {/* Day progress */}
    {homeIsToday&&totalToday>0&&<div className="mt-4 tcard p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{t('home.dailyProgress')}</span>
        <span className="text-[13px] font-extrabold mono grad-text">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden"><motion.div className="h-full rounded-full grad" {...fillBar(pct)}/></div>
      <div className="text-[11px] text-[var(--text-mute)] mt-1.5">{t('home.doneOf',{done:doneToday,total:totalToday})}</div>
    </div>}
  </div>

  {/* Running focus timer (inline card on Home; floating bar on other views) */}
  <TimerCard/>

  {isFresh&&<section className="relative overflow-hidden rounded-[28px] border border-[var(--primary)]/25 bg-[var(--surface)] p-5 anim-fade anim-delay-1">
    <div className="absolute -right-12 -top-16 w-40 h-40 rounded-full bg-[var(--primary)]/15 blur-3xl pointer-events-none"/>
    <div className="relative">
      <div className="w-11 h-11 rounded-2xl grad text-white grid place-items-center mb-4" style={{boxShadow:'var(--shadow-primary)'}}><Sparkles className="w-5 h-5"/></div>
      <h2 className="display text-[20px] text-[var(--text)]">{t('home.startTitle')}</h2>
      <p className="text-[13px] leading-relaxed text-[var(--text-dim)] mt-2 max-w-lg">{t('home.startSub')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
        <button onClick={()=>store.openWizard()} className="h-12 rounded-2xl bg-[var(--primary)] text-white text-[13px] font-bold flex items-center justify-center gap-2"><Target className="w-4 h-4"/>{t('home.startGoal')}</button>
        <button onClick={()=>setCaptureOpen(true)} className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-[13px] font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4"/>{t('home.startTask')}</button>
      </div>
    </div>
  </section>}

  {/* SELECTED DAY — scheduled */}
  {!isFresh&&<section className="anim-fade anim-delay-1" key={`sched-${homeDateStr}`}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-[.12em] flex items-center gap-2 whitespace-nowrap"><Clock className="w-3.5 h-3.5"/>{homeIsToday?t('home.todayScheduled'):t('home.dayScheduled',{d:selDayLabel})}</h3>
      <button onClick={()=>{store.setActiveView('week');setOverviewChild(false);}} aria-label={t('dash.expandSchedule')} className="hit w-8 h-8 rounded-full grid place-items-center text-[var(--primary)] bg-[var(--primary)]/10 shrink-0"><ChevronRight className="w-4 h-4"/></button>
    </div>
    <div className="space-y-2.5">
      {timedSel.length>0 ? timedSel.map(renderSessionRow) : emptyBox(t('home.noScheduled'))}
    </div>
  </section>}

  {/* SELECTED DAY — to-do */}
  {!isFresh&&<section className="anim-fade anim-delay-2" key={`todo-${homeDateStr}`}>
    {head(<CheckCircle2 className="w-3.5 h-3.5"/>,homeIsToday?t('home.todayTasks'):t('home.dayTasks',{d:selDayLabel}))}
    <div className="space-y-2.5">
      {allDaySel.map(renderSessionRow)}
      {tasksSel.map(renderTaskRow)}
      {allDaySel.length+tasksSel.length===0 && emptyBox(t('home.noTasks'))}
    </div>
  </section>}

  {/* SELECTED DAY — habits */}
  {dueHabitsSel.length>0 && <section className="anim-fade anim-delay-2" key={`hab-${homeDateStr}`}>
    {head(<Repeat2 className="w-3.5 h-3.5"/>,homeIsToday?t('home.todayHabits'):t('home.dayHabits',{d:selDayLabel}))}
    <div className="space-y-2.5">{dueHabitsSel.map(renderHabitRow)}</div>
  </section>}

  {/* TOMORROW (only in today mode) */}
  {!isFresh && homeIsToday && <section className="anim-fade anim-delay-3">
    {head(<Calendar className="w-3.5 h-3.5"/>,t('home.tomorrow'))}
    <div className="space-y-2.5">
      {timedTomorrow.map(renderSessionRow)}
      {allDayTomorrow.map(renderSessionRow)}
      {tasksTomorrow.map(renderTaskRow)}
      {timedTomorrow.length+allDayTomorrow.length+tasksTomorrow.length===0 && emptyBox(t('home.noTomorrow'))}
    </div>
  </section>}
</div>;})()}

{/* ═══════════════════ MANAGER ═══════════════════ */}
{activeView==='manager'&&(()=>{
  const trackedHabits=habits.filter(h=>!h.archived);
  const openTasks=gtdTasks.filter(t=>t.status!=='done'&&t.status!=='trash'&&!t.isArchived);
  const unsortedTasks=gtdTasks.filter(t=>t.status==='inbox'&&!t.processedAt&&!t.isArchived);
  const activeGoals=goals.filter(g=>(g.status??'active')==='active');
  const totalHoursLogged=+(sessions.filter(s=>s.status==='done').reduce((a,s)=>a+s.durationMinutes,0)/60).toFixed(1);
  const tiles: {id:AppView|'pomodoro';Ic:React.ComponentType<{className?:string}>;c:string;label:string;sub:string;onClick?:()=>void}[]=[
    {id:'inbox',Ic:Inbox,c:'#0d9488',label:t('overview.tasks'),sub:t('overview.unsortedN',{n:unsortedTasks.length})},
    {id:'habits',Ic:Flame,c:'#e0532f',label:t('bottomNav.habits'),sub:t('overview.trackedN',{n:trackedHabits.length})},
    {id:'pomodoro',Ic:Timer,c:'#e11d48',label:'Pomodoro',sub:'Focus timer and deep work',onClick:()=>store.openTimerLauncher({linkType:null,linkId:null,label:'Pomodoro'})},
    {id:'planner',Ic:Wand2,c:'#6467f2',label:t('planner.title'),sub:t('planner.cardSub')},
    {id:'projects',Ic:Folder,c:'#8b5cf6',label:t('projects.title'),sub:t('projects.activeCount',{n:projects.filter(project=>project.status==='active').length})},
    {id:'areas',Ic:Layers,c:'#0d9488',label:t('areas.title'),sub:t('areas.activeCount',{n:store.areas.filter(area=>!area.archivedAt).length})},
    {id:'goals',Ic:Target,c:'#6467f2',label:t('bottomNav.goals'),sub:`${activeGoals.length} ${t('overview.activeGoalsSub')}`},
    {id:'statistics',Ic:BarChart3,c:'#22c55e',label:t('overview.statistics'),sub:`${fmtHours(totalHoursLogged, store.lang)} · ${adherence}%`},
  ];
  return <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1040px] space-y-7 pb-32">
    <div className="anim-fade"><h1 className="display text-[30px] md:text-[44px] text-[var(--text)]">{t('overview.manage')}</h1><p className="text-[14px] text-[var(--text-dim)] mt-1">{openTasks.length} {t('overview.tasks').toLowerCase()} · {trackedHabits.length} {t('bottomNav.habits').toLowerCase()}</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{tiles.map((ti,i)=><motion.button {...listItem(i)} key={ti.id} onClick={()=>ti.onClick?ti.onClick():(()=>{store.setActiveView(ti.id as AppView);setSelectedGoalId(null);setOverviewChild(false);})()} className="tcard lift min-h-[116px] p-5 text-left flex items-center gap-4"><div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0" style={{background:`${ti.c}18`,color:ti.c}}><ti.Ic className="w-6 h-6"/></div><div className="min-w-0 flex-1"><div className="text-[16px] font-bold text-[var(--text)]">{ti.label}</div><div className="text-[12px] text-[var(--text-dim)] mt-1">{ti.sub}</div></div><ChevronRight className="w-5 h-5 text-[var(--text-mute)]"/></motion.button>)}</div>

  </div>;
})()}

{/* ═══════════════════ STATISTICS ═══════════════════ */}
{activeView==='statistics'&&(()=>{
  const activeGoals=goals.filter(g=>(g.status??'active')==='active');
  const bestGoalStreak=Math.max(0,...goals.map(g=>goalStreak(g,sessions)));
  const totalHoursLogged=+(sessions.filter(s=>s.status==='done').reduce((a,s)=>a+s.durationMinutes,0)/60).toFixed(1);
  const cards=[
    {l:t('progress.language'),v:fmtHours(langHours, store.lang),s:'',n:t('progress.studied'),c:'#e11d48'},
    {l:t('progress.reading'),v:`${Math.round(readPages)}`,s:'',n:t('progress.pagesLogged'),c:'#d97706'},
    {l:t('progress.fitness'),v:`${Math.round(sportKm)}`,s:'',n:t('progress.kmCompleted'),c:'#059669'},
    {l:t('progress.overall'),v:`${adherence}`,s:'%',n:t('progress.sessionRate'),c:'#22c55e'},
    {l:t('overview.bestStreak'),v:`${bestGoalStreak}`,s:t('common.dayShort'),n:t('overview.bestStreakSub'),c:'#f59e0b'},
    {l:t('overview.hoursLogged'),v:fmtHours(totalHoursLogged, store.lang),s:'',n:t('overview.hoursLoggedSub'),c:'#6467f2'},
    {l:t('overview.activeGoalsStat'),v:`${activeGoals.length}`,s:'',n:t('overview.activeGoalsSub'),c:'#0d9488'},
  ];
  return <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1300px] space-y-7 pb-32">
    <div className="anim-fade flex items-start justify-between gap-3">
      <div>
        <button onClick={()=>{store.setActiveView('manager');setOverviewChild(false);setSelectedGoalId(null);}} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]"><ChevronLeft className="w-4 h-4"/>{t('overview.manage')}</button>
        <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('overview.statistics')}</h1>
        <p className="text-[14px] text-[var(--text-dim)] mt-1">{fmtHours(totalHoursLogged, store.lang)} · {adherence}% {t('progress.sessionRate').toLowerCase()}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {cards.map((k,i)=><div key={i} className="tcard p-5"><div className="text-[10px] font-bold uppercase tracking-wider" style={{color:k.c}}>{k.l}</div><div className="flex items-baseline gap-1 mt-2"><span className="text-[40px] leading-none font-bold mono" style={{color:k.c}}>{k.v}</span><span className="text-[16px] text-[var(--text-dim)]">{k.s}</span></div><div className="text-[11px] text-[var(--text-dim)] mt-1">{k.n}</div></div>)}
    </div>
    <div className="tcard p-5"><div className="text-[12px] font-bold text-[var(--text)] mb-1">{t('overview.timeByTask')}</div><EnergyChart/></div>
  </div>;
})()}

{/* ═══════════════════ GOALS ═══════════════════ */}
{activeView==='goals'&&(()=>{
  const selGoal = selectedGoalId ? goals.find(g=>g.id===selectedGoalId) : null;
  if(selGoal) return <GoalDetailView goal={selGoal} onBack={()=>setSelectedGoalId(null)}/>;
  const activeGoals = goals.filter(g=>g.status!=='completed');
  const completedGoals = goals.filter(g=>g.status==='completed');
  return <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1500px] space-y-6 md:space-y-8 pb-32">
    <div className="flex items-end justify-between anim-fade">
      <div>
        {overviewChild&&<button onClick={()=>{store.setActiveView('progress');setOverviewChild(false);setSelectedGoalId(null);}} className="hit mb-4 h-9 px-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] font-bold text-[var(--text-dim)] flex items-center gap-1.5 hover:text-[var(--text)]"><ChevronLeft className="w-4 h-4"/>{t('bottomNav.stats')}</button>}
        <h1 className="display text-[30px] md:text-[48px] text-[var(--text)]">{t('goals.title')}</h1>
        <p className="text-[15px] text-[var(--text-dim)] mt-1">{t('goals.count',{n:activeGoals.length})}{completedGoals.length>0?t('goals.completedSuffix',{n:completedGoals.length}):''}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>store.openWizard()} className="h-10 px-5 rounded-xl bg-[var(--primary)] text-white font-bold text-[13px] flex items-center gap-2 hover:opacity-90 transition-all"><Plus className="w-4 h-4"/>{t('goals.newGoal')}</button>
      </div>
    </div>
    {goals.length===0 && <div className="card border-dashed p-10 md:p-16 text-center anim-fade">
      <div className="w-14 h-14 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4"><Target className="w-7 h-7 text-[var(--primary)]"/></div>
      <h3 className="text-[18px] font-bold text-[var(--text)] mb-1">{t('goals.emptyTitle')}</h3>
      <p className="text-[13px] text-[var(--text-dim)] mb-5 max-w-sm mx-auto leading-relaxed">{t('goals.emptyDesc')}</p>
      <button onClick={()=>store.openWizard()} className="h-10 px-5 rounded-xl bg-[var(--primary)] text-white font-bold text-[13px] inline-flex items-center gap-2 hover:bg-[var(--primary)] transition-colors"><Plus className="w-4 h-4"/>{t('goals.createGoal')}</button>
    </div>}
    <div className="grid grid-cols-1 gap-5">
      {activeGoals.map((g)=>{
        const cm=CATEGORY_META[g.category];
        const gSessions=sessions.filter(s=>s.goalId===g.id);
        const doneSess=gSessions.filter(s=>s.status==='done');
        const totalMins=doneSess.reduce((a,s)=>a+s.durationMinutes,0);
        const hoursReal=+(totalMins/60).toFixed(1);
        const pct=goalProgressPct(g,sessions);
        const doneMil=g.milestones.filter(m=>milestoneReached(m,hoursReal)).length;
        const gi=goalInsight(g,sessions); const giText=(gi.key==='gi.start'&&g.aiInsight)?g.aiInsight:t(gi.key,gi.vars);
        const needsAttention=(gi.key==='gi.behind'||gi.key==='gi.overdue'||gi.key==='gi.lowCompletion')&&gSessions.length>0;
        return <button key={g.id} onClick={()=>setSelectedGoalId(g.id)} className={`card overflow-hidden group anim-fade text-left border-l-4 hover:border-l-8 transition-all hover:shadow-xl hover:shadow-black/30`} style={{borderLeftColor:g.color}}>
          <div className="p-4 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0">
              <div className="shrink-0">
                <Ring pct={pct} size={72} stroke={5} color={g.color}><div className="text-center"><div className="text-[18px] font-bold text-[var(--text)] mono leading-none">{pct}</div><div className="text-[11px] text-[var(--text-dim)]">%</div></div></Ring>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r ${cm.gradient} text-white`}>{t('cat.'+g.category)}</span>
                  {needsAttention&&<span className="text-[11px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-1"><AlertCircle className="w-3 h-3"/>{t('goals.behind')}</span>}
                  {g.deadline&&<span className="text-[11px] text-[var(--text-dim)]">{format(new Date(g.deadline),'MMM yyyy',{locale})}</span>}
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{g.emoji}</span>
                  <div className="min-w-0">
                    <h3 className="text-[17px] md:text-[20px] font-bold text-[var(--text)] leading-tight truncate group-hover:text-[var(--primary)] transition-colors">{g.title}</h3>
                    {g.subtitle&&<p className="text-[12px] text-[var(--text-dim)] truncate">{g.subtitle}</p>}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 w-full md:flex md:items-center md:gap-8 md:w-auto shrink-0">
              <div className="text-center"><div className="text-[16px] md:text-[22px] font-bold text-[var(--text)] mono">{goalStreak(g,sessions)}{t('common.dayShort')}</div><div className="text-[11px] text-[var(--text-dim)] uppercase">{t('goals.streak')}</div></div>
              <div className="text-center"><div className="text-[16px] md:text-[22px] font-bold text-[var(--text)] mono">{fmtHours(hoursReal, store.lang)}</div><div className="text-[11px] text-[var(--text-dim)] uppercase">{t('goals.logged')}</div></div>
              <div className="text-center"><div className="text-[16px] md:text-[22px] font-bold text-[var(--text)] mono">{doneSess.length}/{gSessions.length}</div><div className="text-[11px] text-[var(--text-dim)] uppercase">{t('goals.sessions')}</div></div>
              <div className="text-center"><div className="text-[16px] md:text-[22px] font-bold text-[var(--text)] mono">{doneMil}/{g.milestones.length}</div><div className="text-[11px] text-[var(--text-dim)] uppercase">{t('goals.milestones')}</div></div>
              <ChevronRight className="hidden md:block w-5 h-5 text-[var(--text-dim)] group-hover:text-[var(--text)] group-hover:translate-x-1 transition-all"/>
            </div>
          </div>
          <div className="px-4 md:px-6 pb-4">
            <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full" style={{background:g.color}} {...fillBar(pct)}/>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--text-dim)]">
              <span className="shrink-0">{t('goals.estimated',{a:fmtHours(hoursReal, store.lang),b:fmtHours(g.totalHoursEstimated, store.lang)})}</span>
              <span className="text-[var(--primary)] truncate hidden sm:block">{giText}</span>
            </div>
          </div>
        </button>
      })}
    </div>

    {/* Completed goals */}
    {completedGoals.length>0 && <div className="anim-fade">
      <h2 className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-3 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5"/>{t('goals.completed',{n:completedGoals.length})}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {completedGoals.map(g=>(
          <button key={g.id} onClick={()=>setSelectedGoalId(g.id)} className="card p-4 flex items-center gap-3 text-left hover:border-[var(--border)] transition-all opacity-80 hover:opacity-100 border-l-4" style={{borderLeftColor:g.color}}>
            <span className="text-xl shrink-0 grayscale">{g.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[var(--text)] truncate">{g.title}</div>
              <div className="text-[10px] text-[var(--text-dim)]">{g.completedAt?format(new Date(g.completedAt),'d MMM yyyy',{locale}):''}</div>
            </div>
            {g.outcome==='success'
              ? <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md shrink-0">{t('goals.outcomeSuccess')}</span>
              : <span className="text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-md shrink-0">{t('goals.outcomeFailed')}</span>}
          </button>
        ))}
      </div>
    </div>}
  </div>;
})()}

{/* ═══════════════════ SCHEDULE ═══════════════════ */}
{activeView==='week'&&<ScheduleView ws={ws} days={days} sessions={sessions} goals={goals} weekOffset={weekOffset} store={store} goalColor={goalColor} goalEmoji={goalEmoji}/>}

{/* ═══════════════════ GTD INBOX ═══════════════════ */}
{activeView==='inbox'&&<GTDView onBack={overviewChild?()=>{store.setActiveView('progress');setOverviewChild(false);}:undefined}/>}

{/* ═══════════════════ HABITS ═══════════════════ */}
{activeView==='habits'&&<HabitsView onBack={overviewChild?()=>{store.setActiveView('progress');setOverviewChild(false);}:undefined}/>}

{/* ═══════════════════ PROGRESS ═══════════════════ */}
{activeView==='progress'&&(()=>{
  const activeGoals=goals.filter(g=>(g.status??'active')==='active');
  const trackedHabits=habits.filter(h=>!h.archived);
  const openTasks=gtdTasks.filter(t=>t.status!=='done'&&t.status!=='trash'&&!t.isArchived);
  const recurringTasks=openTasks.filter(t=>t.recurring);
  const repeatLabel=(p:string)=>t('gtd.repeat'+p.charAt(0).toUpperCase()+p.slice(1));
  return <div className="px-4 md:px-10 py-6 md:py-8 max-w-[1300px] space-y-7">
  <div className="anim-fade flex items-start justify-between gap-3">
    <div><h1 className="display text-[30px] md:text-[44px] text-[var(--text)]">{t('profileHub.title',{name:userName||'Nebulla'})}</h1><p className="text-[14px] text-[var(--text-dim)] mt-1">{t('profileHub.subtitle',{n:sessions.filter(s=>s.status==='done').length})}</p></div>
    <div className="flex gap-2 shrink-0"><button onClick={()=>{store.setActiveView('archive');setSelectedGoalId(null);setOverviewChild(true);}} aria-label={t('overview.archive')} className="hit h-11 px-3 rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/8 text-[var(--primary)] text-[12px] font-bold flex items-center gap-1.5"><Archive className="w-4 h-4"/>{t('overview.archive')}</button><button onClick={()=>{store.setActiveView('settings');setOverviewChild(true);}} aria-label={t('settings.title')} className="hit w-11 h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] grid place-items-center"><SettingsIcon className="w-5 h-5"/></button></div>
  </div>

  {/* ── Profile editing ── */}
  <section className="anim-fade anim-delay-2 tcard p-5 md:p-6 space-y-4">
    <div>
      <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">Profile editing</div>
      <p className="text-[12px] text-[var(--text-dim)] mt-1">Update how Nebulla personalizes planning, reviews and AI suggestions.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Display name
        <input value={profileName} onChange={e=>setProfileName(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="123" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Age
        <input value={profileAge} onChange={e=>setProfileAge(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="Optional" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Focus areas
        <input value={profileFocus} onChange={e=>setProfileFocus(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="sport, work, learning" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Current blockers
        <input value={profileStruggles} onChange={e=>setProfileStruggles(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="procrastination, low energy" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Sleep / energy notes
        <input value={profileSleep} onChange={e=>setProfileSleep(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="6–8 hours, morning energy" />
      </label>
      <label className="grid gap-1.5 text-[12px] font-semibold text-[var(--text-dim)]">Motivation source
        <input value={profileSource} onChange={e=>setProfileSource(e.target.value)} className="h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--primary)]" placeholder="health, career, family" />
      </label>
    </div>
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-[11px] text-[var(--text-dim)]">Use commas for multiple focus areas or blockers.</p>
      <button onClick={saveProfile} disabled={!profileDirty||!profileName.trim()} className="h-10 px-5 rounded-xl bg-[var(--primary)] text-white font-bold text-[13px] disabled:opacity-40 disabled:cursor-not-allowed">Save profile</button>
    </div>
  </section>

  {/* ── Habits week summary ── */}
  {trackedHabits.length>0&&(()=>{
    const days=Array.from({length:7},(_,i)=>addDays(new Date(),i-6));
    const today=dailyCompletion(trackedHabits,new Date());
    const bestStreak=Math.max(0,...trackedHabits.map(h=>habitStreak(h)));
    return <button onClick={()=>{store.setActiveView('habits');setSelectedGoalId(null);setOverviewChild(true);}} className="tcard lift p-6 anim-fade anim-delay-2 w-full text-left block">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{t('overview.habitsWeek')}</div>
        <ChevronRight className="w-4 h-4 text-[var(--text-dim)]"/>
      </div>
      <div className="flex items-end justify-between gap-2 h-[72px] mb-4">
        {days.map((d,i)=>{
          const dc=dailyCompletion(trackedHabits,d);
          const pct=dc.pct??0;
          const isToday=i===6;
          return <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full">
            <div className="flex-1 w-full max-w-[26px] rounded-lg bg-[var(--surface-2)] overflow-hidden flex flex-col justify-end">
              <div className="w-full rounded-lg transition-all" style={{height:`${Math.round(pct*100)}%`,background:dc.total===0?'transparent':'#e0532f',opacity:isToday?1:.55}}/>
            </div>
            <div className={`text-[10px] font-semibold ${isToday?'text-[var(--text)]':'text-[var(--text-dim)]'}`}>{format(d,'EEEEE',{locale})}</div>
          </div>;
        })}
      </div>
      <div className="flex items-center gap-5">
        <div className="text-[12px] text-[var(--text-dim)]"><span className="text-[15px] font-bold mono text-[var(--text)]">{today.done}/{today.total}</span> {t('overview.habitsToday')}</div>
        {bestStreak>0&&<div className="flex items-center gap-1 text-[12px] text-[var(--text-dim)]"><Flame className="w-4 h-4 text-[#e0532f]"/><span className="text-[15px] font-bold mono text-[var(--text)]">{bestStreak}</span> {t('overview.habitsStreak')}</div>}
      </div>
    </button>;
  })()}

  {/* ── Per-goal breakdown ── */}
  {activeGoals.length>0&&<div className="tcard p-6 anim-fade anim-delay-2">
    <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-5">{t('progress.perGoal')}</div>
    <div className="space-y-4">{activeGoals.map(g=>{
      const gDone=sessions.filter(s=>s.goalId===g.id&&s.status==='done');
      const gHours=+(gDone.reduce((a,s)=>a+s.durationMinutes,0)/60).toFixed(1);
      const pct=goalProgressPct(g,sessions);
      return <button key={g.id} onClick={()=>{store.setActiveView('goals');setSelectedGoalId(g.id);setOverviewChild(false);}} className="w-full min-h-[44px] flex items-center gap-4 group hover:opacity-90 transition-opacity">
        <span className="text-xl w-8 text-center">{g.emoji}</span>
        <div className="w-36 text-[13px] font-medium text-[var(--text)] truncate text-left">{g.title.split(' ').slice(0,3).join(' ')}</div>
        <div className="flex-1 h-2.5 bg-[var(--surface-2)] rounded-full overflow-hidden"><motion.div className="h-full rounded-full" style={{background:g.color}} {...fillBar(pct)}/></div>
        <div className="w-12 text-right text-[13px] font-bold mono" style={{color:g.color}}>{pct}%</div>
        <div className="w-20 text-right text-[10px] text-[var(--text-dim)]">{fmtHours(gHours, store.lang)} / {fmtHours(g.totalHoursEstimated, store.lang)}</div>
        <ChevronRight className="w-4 h-4 text-[var(--text-dim)] group-hover:text-[var(--text)] transition-colors"/>
      </button>
    })}</div>
  </div>}

  {/* ── Recurring tasks ── */}
  {recurringTasks.length>0&&<div className="tcard p-6 anim-fade anim-delay-3">
    <div className="flex items-center justify-between mb-4">
      <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{t('overview.recurring')}</div>
      <button onClick={()=>{store.setActiveView('inbox');setOverviewChild(true);}} className="text-[11px] font-semibold text-[var(--primary)]">{t('overview.viewAll')}</button>
    </div>
    <div className="space-y-2">{recurringTasks.slice(0,6).map(tk=>(
      <button key={tk.id} onClick={()=>{store.setActiveView('inbox');setOverviewChild(true);}} className="w-full flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left hover:border-[var(--primary)] transition-colors">
        <Repeat2 className="w-4 h-4 text-[var(--primary)] shrink-0"/>
        <span className="flex-1 text-[13px] text-[var(--text)] truncate">{tk.title}</span>
        <span className="text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-1 rounded-md shrink-0">{repeatLabel(tk.recurring!)}</span>
      </button>
    ))}</div>
  </div>}

</div>;
})()}

      </motion.div>
      </AnimatePresence>

      {/* ═══════════════════ GLOBAL SEARCH ═══════════════════ */}
      <SearchOverlay open={searchOpen} onClose={()=>setSearchOpen(false)}/>

      {/* ═══════════════════ UNDO SNACKBAR ═══════════════════ */}
      <AnimatePresence>
        {store.pendingUndo&&(
          <motion.div key={store.pendingUndo.ts} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:16}}
            className="absolute inset-x-0 z-50 px-4 pointer-events-none flex justify-center"
            style={{bottom:'calc(env(safe-area-inset-bottom) + 96px)'}}>
            <div role="status" aria-live="polite" className="glass pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border)] pl-4 pr-2 py-2 max-w-[420px] w-full" style={{boxShadow:'var(--shadow-md)'}}>
              <span className="flex-1 text-[13px] text-[var(--text)] truncate">{store.pendingUndo.kind==='complete'?t('undo.completedN',{n:store.pendingUndo.items.length}):t('undo.deletedN',{n:store.pendingUndo.items.length})}</span>
              <button onClick={()=>store.undoDelete()} className="h-9 px-3 rounded-xl text-[13px] font-bold text-[var(--primary)] hover:bg-[var(--primary)]/10 shrink-0">{t('undo.action')}</button>
              <button onClick={()=>store.clearUndo()} aria-label={t('common.close')} className="h-9 w-9 grid place-items-center rounded-xl text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"><X className="w-4 h-4"/></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════ FLOATING BOTTOM NAV (mobile only; desktop uses top nav) ═══════════════════ */}
      <div className="md:hidden absolute inset-x-0 bottom-0 z-40 px-3 pointer-events-none" style={{paddingBottom:'calc(env(safe-area-inset-bottom) + 12px)'}}>
        <nav className="glass relative flex items-end justify-around rounded-[24px] border border-[var(--border)] mx-auto w-full max-w-[460px] overflow-visible pointer-events-auto p-1" style={{boxShadow:'var(--shadow-md)'}}>
          {(()=>{
            const navBtn=(id:AppView,label:string,Ic:React.ComponentType<{className?:string;strokeWidth?:number}>)=>{
              const a=bottomNavActiveView===id;
              return (
                <button key={id} onClick={()=>{store.setActiveView(id);setSelectedGoalId(null);setOverviewChild(false);}}
                  className={`relative flex-1 min-h-[56px] rounded-[18px] flex flex-col items-center justify-center gap-1 transition-colors ${a?'text-[var(--primary)] bg-[var(--primary)]/8':'text-[var(--text-mute)] active:text-[var(--text)]'}`}>
                  <Ic className="w-[22px] h-[22px]" strokeWidth={a?2.5:2}/>
                  <span className="text-[10px] font-semibold leading-none">{label}</span>
                  {a&&<motion.span layoutId="bottom-nav-dot" transition={{type:'spring',stiffness:500,damping:35}} className="absolute bottom-1.5 w-4 h-[3px] rounded-full bg-[var(--primary)]"/>}
                </button>
              );
            };
            return <>
              {navBtn('dashboard',t('bottomNav.home'),HomeIcon)}
              {navBtn('week',t('bottomNav.calendar'),Calendar)}
              {/* center create FAB */}
              <button onClick={()=>setCaptureOpen(v=>!v)} aria-label={t('sidebar.quickCaptureGtd')}
                className="grad relative -top-5 shrink-0 rounded-full grid place-items-center text-white active:scale-95 transition-transform"
                style={{width:'58px',height:'58px',boxShadow:'var(--shadow-primary)'}}>
                <Plus className="w-8 h-8" strokeWidth={2.6}/>
              </button>
              {navBtn('manager',t('bottomNav.manager'),LayoutGrid)}
              {navBtn('progress',t('bottomNav.profile'),UserIcon)}
            </>;
          })()}
        </nav>
      </div>
    </main>

    {/* ═══════════════════ CREATE SHEET (iOS-style, center + trigger) ═══════════════════ */}
    {captureOpen&&<>
      <div className="fixed inset-0 z-40 bg-black/40 anim-backdrop" onClick={()=>setCaptureOpen(false)}/>
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 anim-sheet" style={{paddingBottom:'calc(env(safe-area-inset-bottom) + 12px)'}}>
        <div onClick={e=>e.stopPropagation()} className="mx-auto w-full max-w-[460px] rounded-[28px] bg-[var(--surface)] border border-[var(--border)] p-4" style={{boxShadow:'0 -8px 44px rgba(40,50,90,.24)'}}>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]"/>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[17px] font-bold text-[var(--text)]">{t('create.title')}</h3>
            <button onClick={()=>setCaptureOpen(false)} aria-label={t('common.close')} className="w-8 h-8 rounded-full grid place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"><X className="w-4 h-4"/></button>
          </div>
          {/* Quick task capture */}
          <div className="flex gap-2 mb-3">
            <input
              value={qt}
              onChange={e=>setQt(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')capture();if(e.key==='Escape')setCaptureOpen(false);}}
              placeholder={t('create.taskPlaceholder')}
              className="flex-1 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            {voiceAvailable()&&<button onClick={toggleVoice} aria-label={t('voice.start')}
              className={`w-12 h-12 shrink-0 rounded-2xl grid place-items-center transition-all active:scale-95 border ${listening?'bg-red-500 border-red-500 text-white animate-pulse':'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              <Mic className="w-5 h-5"/>
            </button>}
            <button onClick={capture} aria-label={t('sidebar.addTask')} className="grad w-12 h-12 shrink-0 rounded-2xl grid place-items-center text-white transition-all active:scale-95" style={{boxShadow:'var(--shadow-primary)'}}>
              <Plus className="w-5 h-5" strokeWidth={2.6}/>
            </button>
          </div>
          {listening&&<div className="mb-3 text-[12px] text-[var(--text-dim)] text-center animate-pulse">{t('voice.listening')}</div>}
          {voiceError&&<div role="status" className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {t(`voice.error.${voiceError}`)} <span className="text-[var(--text-dim)]">{t('voice.errorHint')}</span>
          </div>}
          {/* Create options */}
          <div className="space-y-2">
            {[
              {Ic:Target,c:'#6467f2',l:t('create.goal'),s:t('create.goalSub'),act:()=>{store.openWizard();setCaptureOpen(false);}},
              {Ic:Repeat2,c:'#e0532f',l:t('create.habit'),s:t('create.habitSub'),act:()=>{setQuickHabitOpen(true);setCaptureOpen(false);}},
              {Ic:Calendar,c:'#0d9488',l:t('create.session'),s:t('create.sessionSub'),act:()=>{store.scheduleFromTask('',60);setSelectedGoalId(null);setOverviewChild(false);setCaptureOpen(false);}},
            ].map((o,i)=>(
              <button key={i} onClick={o.act} className="w-full flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-3 text-left hover:border-[var(--primary)] transition-colors active:scale-[.98]">
                <div className="w-10 h-10 rounded-2xl grid place-items-center shrink-0" style={{background:`${o.c}18`,color:o.c}}><o.Ic className="w-5 h-5"/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[var(--text)]">{o.l}</div>
                  <div className="text-[11px] text-[var(--text-dim)] truncate">{o.s}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-dim)] shrink-0"/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>}
    {quickHabitOpen && <HabitModal habit={null} onClose={() => setQuickHabitOpen(false)} />}

    {/* ═══════════════════ SESSION DRAWER (soft side panel) ═══════════════════ */}
    {store.sessionModalId&&(()=>{const s=sessions.find(x=>x.id===store.sessionModalId);if(!s)return null;const g=goals.find(x=>x.id===s.goalId);const gColor=g?.color||'#22c55e';const gEmoji=g?.emoji||'🗓️';const sColor=s.color||gColor;
    const remLabel=s.reminderMinutes==null||s.reminderMinutes<0?null:s.reminderMinutes===0?t('sm.remAtStart'):s.reminderMinutes>=1440?t('sm.remDays',{n:Math.round(s.reminderMinutes/1440)}):s.reminderMinutes>=60?t('sm.remHours',{n:Math.round(s.reminderMinutes/60)}):t('sm.remMins',{n:s.reminderMinutes});
    const tlabel=Number.isFinite(s.startHour)?`${String(s.startHour).padStart(2,'0')}:${String(s.startMinute||0).padStart(2,'0')}`:'';
    const sessionNote=cleanSessionNote(s.description);
    const sTasks=s.tasks||[];
    return <Drawer open={true} onClose={()=>store.closeSessionModal()} width="md"
        title={`${gEmoji} ${s.title}`}
        subtitle={s.allDay?`${s.date} · ${t('sm.subAllDay')}`:`${s.date}${tlabel?' · '+tlabel:''}${s.openEnd?'':' — '+fmtDur(s.durationMinutes,store.lang)}`}>
      <div className="space-y-4">
        {/* Meta */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          <div className="flex items-center gap-3 px-4 py-3"><Clock className="w-4 h-4 text-[var(--text-dim)] shrink-0"/><span className="text-[13px] text-[var(--text)]">{s.allDay?t('sm.allDayCap'):s.openEnd?tlabel:`${tlabel?tlabel+' · ':''}${fmtDur(s.durationMinutes,store.lang)}`}</span></div>
          {remLabel&&<div className="flex items-center gap-3 px-4 py-3"><Bell className="w-4 h-4 text-[var(--text-dim)] shrink-0"/><span className="text-[13px] text-[var(--text)]">{t('sm.reminder',{label:remLabel})}</span></div>}
          {s.location&&<div className="flex items-center gap-3 px-4 py-3"><MapPin className="w-4 h-4 text-[var(--text-dim)] shrink-0"/><span className="text-[13px] text-[var(--text)] truncate">{s.location}</span></div>}
          {s.url&&<a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"><LinkIcon className="w-4 h-4 text-[var(--text-dim)] shrink-0"/><span className="text-[13px] text-[var(--primary)] truncate underline">{s.url}</span></a>}
          {s.seriesId&&<div className="flex items-center gap-3 px-4 py-3"><Calendar className="w-4 h-4 text-[var(--text-dim)] shrink-0"/><span className="text-[13px] text-[var(--text)]">{t('sm.partOfSeries')}</span></div>}
        </div>
        {sessionNote&&<div className="rounded-xl border p-4" style={{background:`${sColor}08`,borderColor:`${sColor}30`}}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{color:sColor}}/>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:sColor}}>{t('sm.note')}</span>
          </div>
          <p className="text-[13px] text-[var(--text)] leading-relaxed whitespace-pre-line">{sessionNote}</p>
        </div>}
        {sTasks.length>0&&<div>
          <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="flex-1 h-px bg-[var(--border)]"/>{t('sm.tasks')}<span className="flex-1 h-px bg-[var(--border)]"/>
          </div>
          <div className="space-y-1.5">{sTasks.map((t,i)=><div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex items-center gap-3"><div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{background:`${gColor}20`,color:gColor}}>{i+1}</div><span className="flex-1 text-[13px] text-[var(--text)]">{t.task}</span><span className="text-[11px] text-[var(--text-dim)] mono">{t.durationMin}m</span></div>)}</div>
        </div>}
        {s.progressLog&&<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-emerald-400"/><span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{t('sm.completed')}</span></div><p className="text-[13px] text-[var(--text)]"><b>{s.progressLog.value}</b> {s.progressLog.metric} · {s.progressLog.feeling==='good'?'😊':'😐'}{s.progressLog.notes&&<span className="text-[var(--text-dim)] italic ml-2">"{s.progressLog.notes}"</span>}</p></div>}
      </div>
      <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2">
        {s.status!=='done'
          ? <button onClick={()=>{store.updateSession(s.id,{status:'done'});store.closeSessionModal()}} className="w-full h-11 rounded-xl bg-emerald-500 text-black text-[13px] font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-400"><CheckCircle2 className="w-4 h-4"/>{t('sm.markDone')}</button>
          : <button onClick={()=>store.updateSession(s.id,{status:'planned'})} className="w-full h-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[13px] font-bold flex items-center justify-center gap-1.5 hover:text-[var(--text)] hover:bg-[var(--border)] transition-all"><RotateCcw className="w-4 h-4"/>{t('sm.markUndone')}</button>}
        <div className="flex gap-2">
          <button onClick={()=>{store.openTimerLauncher({linkType:'session',linkId:s.id,label:s.title});store.closeSessionModal();}} className="flex-1 min-w-0 h-10 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:bg-[var(--primary)]/20 transition-colors"><Timer className="w-4 h-4 shrink-0"/><span className="truncate">{t('timer.focus')}</span></button>
          <button onClick={()=>store.requestEditSession(s.id)} className="flex-1 min-w-0 h-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-[12px] font-bold flex items-center justify-center gap-1.5 hover:text-[var(--text)] hover:bg-[var(--border)] transition-all"><Edit2 className="w-4 h-4 shrink-0"/><span className="truncate">{t('sm.edit')}</span></button>
          <button aria-label={t('common.delete')} onClick={()=>{
            if(s.seriesId){
              store.askConfirm({title:t('sm.delSeriesTitle'),message:t('sm.delSeriesMsg'),confirmLabel:t('sm.delSeriesBtn'),danger:true,onConfirm:()=>{store.deleteSeries(s.seriesId!);store.closeSessionModal();}});
              return;
            }
            store.askConfirm({title:t('sm.delTitle'),message:t('sm.delMsg'),confirmLabel:t('common.delete'),danger:true,onConfirm:()=>{store.deleteSession(s.id);store.closeSessionModal();}});
          }} className="w-10 h-10 shrink-0 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 grid place-items-center hover:bg-red-500/20 transition-colors"><X className="w-4 h-4"/></button>
        </div>
      </div>
    </Drawer>})()}

    {store.logOpen&&(()=>{const s=sessions.find(x=>x.id===store.loggingSessionId);if(!s)return null;
      const submit=()=>{
        const value=Number(logValue);
        store.updateSession(s.id,{status:'done',progressLog:{metric:logMetric.trim()||'progress',value:Number.isFinite(value)?value:1,feeling:logFeeling,notes:logNotes.trim()||undefined}});
        store.closeLog();setLogMetric('progress');setLogValue('1');setLogFeeling('good');setLogNotes('');
      };
      return <Drawer open={true} onClose={()=>store.closeLog()} width="sm" title={t('log.title')} subtitle={s.title}>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{t('log.metric')}</label>
            <input value={logMetric} onChange={e=>setLogMetric(e.target.value)} className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"/>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{t('log.value')}</label>
            <input type="number" value={logValue} onChange={e=>setLogValue(e.target.value)} className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] mono focus:outline-none focus:border-[var(--primary)]"/>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{t('log.feeling')}</label>
            <div className="grid grid-cols-4 gap-2">
              {(['bad','ok','good','great'] as const).map(f=><button key={f} onClick={()=>setLogFeeling(f)} className={`h-10 rounded-xl border text-[12px] font-bold ${logFeeling===f?'bg-[var(--primary)] text-white border-[var(--primary)]':'bg-[var(--surface)] text-[var(--text-dim)] border-[var(--border)]'}`}>{t('log.feeling.'+f)}</button>)}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{t('sched.note')}</label>
            <textarea value={logNotes} onChange={e=>setLogNotes(e.target.value)} rows={3} className="w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-[14px] text-[var(--text)] focus:outline-none focus:border-[var(--primary)] resize-none"/>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
            <button onClick={()=>store.closeLog()} className="h-11 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)]">{t('common.cancel')}</button>
            <button onClick={submit} className="flex-1 h-11 rounded-xl bg-emerald-500 text-black text-[13px] font-bold flex items-center justify-center gap-1.5"><CheckCircle2 className="w-4 h-4"/>{t('sm.markDone')}</button>
          </div>
        </div>
      </Drawer>;
    })()}

    {/* ═══════════════════ GOAL CREATE WIZARD ═══════════════════ */}
    {store.wizardOpen&&<GoalCreateWizard/>}

    {/* ═══════════════════ FOCUS TIMER (global bar + launcher) ═══════════════════ */}
    <TimerBar/>
    <TimerLauncher/>
    <TimerAssignmentSheet/>

    {/* ═══════════════════ GLOBAL CONFIRM ═══════════════════ */}
    <ConfirmModal/>
  </div></Suspense>;
}
