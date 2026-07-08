import { useState, useEffect, useRef } from 'react';
import { useBackClose } from '../hooks/useHardwareBack';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticSuccess, hapticTick } from '../utils/haptics';
import { extractNLDate } from '../utils/nlDate';
import { nextDueDate, useStore } from '../store';
import { useT, useDateLocale } from '../i18n';
import type { GTDTask, GTDStatus, Priority, TaskContext, RecurringPattern } from '../types';
import { Drawer } from './ui/Drawer';
import { SelectMenu } from './ui/SelectMenu';
import { ensureWebNotifPermission } from '../utils/timerNotifications';
import {
  Inbox, Zap, Folder, Users, Cloud, Trash2, Plus, Search,
  X, Check, Clock, ChevronRight, ChevronDown, ChevronLeft, Edit2,
  Wifi, Phone, Home, ShoppingCart,
  Timer, Hourglass, Minus, Circle, CheckCircle2, Calendar, Play, GripVertical,
  SlidersHorizontal, MoreHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Sun, Sparkles, BookOpen, Layers, Layers3, Target, Repeat, Bell, AlertTriangle, CalendarClock
} from 'lucide-react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';

const PRIORITY_CONFIG = {
  1: { label: 'P1', color: '#ef4444', bg: '#ef444420', dot: 'bg-red-500' },
  2: { label: 'P2', color: '#f97316', bg: '#f9731620', dot: 'bg-orange-500' },
  3: { label: 'P3', color: '#3b82f6', bg: '#3b82f620', dot: 'bg-blue-500' },
  4: { label: 'P4', color: 'var(--text-mute)', bg: 'var(--text-mute)10', dot: 'bg-[var(--text-mute)]' },
};

// label/desc values are i18n keys — translate at render with t(...)
const CONTEXT_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  '@home':     { icon: Home,         label: 'gtd.ctx.@home',     color: '#10b981' },
  '@work':     { icon: Layers,       label: 'gtd.ctx.@work',     color: '#3b82f6' },
  '@phone':    { icon: Phone,        label: 'gtd.ctx.@phone',    color: '#f59e0b' },
  '@computer': { icon: Wifi,         label: 'gtd.ctx.@computer', color: '#8b5cf6' },
  '@errand':   { icon: ShoppingCart, label: 'gtd.ctx.@errand',   color: '#f97316' },
  '@anywhere': { icon: Target,       label: 'gtd.ctx.@anywhere', color: 'var(--text-mute)' },
};

const ENERGY_CONFIG = {
  deep:    { label: 'gtd.energy.deep',    icon: '🧠', color: '#8b5cf6' },
  medium:  { label: 'gtd.energy.medium',  icon: '⚡', color: '#3b82f6' },
  shallow: { label: 'gtd.energy.shallow', icon: '☕', color: '#f59e0b' },
  any:     { label: 'gtd.energy.any',     icon: '✓',  color: 'var(--text-mute)' },
};

const STATUS_CONFIG: Record<GTDStatus | string, { label: string; icon: any; color: string; desc: string }> = {
  inbox:         { label: 'gtd.status.inbox',         icon: Inbox,      color: '#22c55e', desc: 'gtd.status.inboxDesc' },
  'next-action': { label: 'gtd.status.next-action',   icon: Zap,        color: '#eab308', desc: 'gtd.status.next-actionDesc' },
  other:         { label: 'gtd.status.other',         icon: Layers,     color: '#64748b', desc: 'gtd.status.otherDesc' },
  project:       { label: 'gtd.status.project',       icon: Folder,     color: '#a855f7', desc: 'gtd.status.projectDesc' },
  'waiting-for': { label: 'gtd.status.waiting-for',   icon: Users,      color: '#f97316', desc: 'gtd.status.waiting-forDesc' },
  scheduled:     { label: 'gtd.status.scheduled',     icon: Calendar,   color: '#3b82f6', desc: 'gtd.status.scheduledDesc' },
  'someday-maybe':{ label: 'gtd.status.someday-maybe', icon: Cloud,      color: '#64748b', desc: 'gtd.status.someday-maybeDesc' },
  reference:     { label: 'gtd.status.reference',     icon: BookOpen,   color: '#14b8a6', desc: 'gtd.status.referenceDesc' },
  done:          { label: 'gtd.status.done',          icon: CheckCircle2,color: '#22c55e', desc: 'gtd.status.doneDesc' },
  trash:         { label: 'gtd.status.trash',         icon: Trash2,     color: '#ef4444', desc: 'gtd.status.trashDesc' },
};

// ─── Due-date helpers (date-only strings; avoids isPast() marking today as overdue) ──
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
export const isOverdue = (t: GTDTask) => !!t.dueDate && t.dueDate < todayStr();
const dueTodayOrOverdue = (t: GTDTask) => !!t.dueDate && t.dueDate <= todayStr();

// ─── Natural Language Parser (lightweight) ─────────────────────────────────
export function parseNL(input: string): { title: string; priority?: Priority; context?: TaskContext; durationMinutes?: number; tags?: string[]; dueDate?: string; remindAt?: string; recurring?: GTDTask['recurring'] } {
  let priority: Priority | undefined;
  let context: TaskContext | undefined;
  let durationMinutes: number | undefined;
  let tags: string[] = [];

  // Dates/time/recurrence in EN/RU/JA — full parser in utils/nlDate.ts
  const nl = extractNLDate(input);
  let title = nl.title;
  const { dueDate, remindAt, recurring } = nl;

  // Priority: p1, p2, p3, p4 or !!! !! !
  const pMatch = title.match(/\b(p[1-4]|!!!|!!|!)\b/i);
  if (pMatch) {
    const p = pMatch[1].toLowerCase();
    priority = p === 'p1' || p === '!!!' ? 1 : p === 'p2' || p === '!!' ? 2 : p === 'p3' || p === '!' ? 3 : 4;
    title = title.replace(pMatch[0], '').trim();
  }
  // Context: @home @work @phone @computer @errand @anywhere
  const ctxMatch = title.match(/@(home|work|phone|computer|errand|anywhere)/i);
  if (ctxMatch) {
    context = `@${ctxMatch[1].toLowerCase()}` as TaskContext;
    title = title.replace(ctxMatch[0], '').trim();
  }
  // Duration: 30m 1h 90min
  const durMatch = title.match(/(\d+)(m|min|h|hr)(?:\b|$)/i);
  if (durMatch) {
    const n = parseInt(durMatch[1]);
    durationMinutes = durMatch[2].toLowerCase().startsWith('h') ? n * 60 : n;
    title = title.replace(durMatch[0], '').trim();
  }
  // Tags: #tag
  const tagMatches = title.match(/#(\w+)/g);
  if (tagMatches) {
    tags = tagMatches.map(t => t.slice(1));
    title = title.replace(/#\w+/g, '').trim();
  }

  return { title: title.trim() || input, priority, context, durationMinutes, tags, dueDate, remindAt, recurring };
}

// ─── Task Card ───────────────────────────────────────────────────────────────
function TaskCard({ task, compact = false, selecting = false, selected = false, onSelect }: { task: GTDTask; compact?: boolean; selecting?: boolean; selected?: boolean; onSelect?: () => void }) {
  const tr = useT();
  const { processTask, deleteTask, toggleTodayFocus, openEditTask, openTimerLauncher, setDoingTask, scheduleFromTask } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  useBackClose(moreOpen, () => setMoreOpen(false));
  const [completing, setCompleting] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const completeTimer = useRef<number | null>(null);
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4];
  const ctx = task.context ? CONTEXT_CONFIG[task.context] : null;
  const isDue = isOverdue(task) && task.status !== 'done';
  const isTodayDue = task.dueDate && isToday(parseISO(task.dueDate));
  const isTomorrowDue = task.dueDate && isTomorrow(parseISO(task.dueDate));
  const nextRepeat = task.recurring ? nextDueDate(task.dueDate || task.scheduledDate || task.createdAt.slice(0, 10), task.recurring) : null;

  // ── Mobile swipe: right = complete, left = delete ──
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const SWIPE_TRIGGER = 80;
  const swipeEnabled = !compact && task.status !== 'done' && !(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    return () => {
      if (completeTimer.current) window.clearTimeout(completeTimer.current);
    };
  }, []);

  const runMoreAction = (fn: () => void) => {
    fn();
    setMoreOpen(false);
  };

  const completeTask = () => {
    if (task.status === 'done' || completing) return;
    setCompleting(true);
    hapticSuccess();
    if (completeTimer.current) window.clearTimeout(completeTimer.current);
    completeTimer.current = window.setTimeout(() => {
      processTask(task.id, 'done');
      completeTimer.current = null;
    }, 380);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipeEnabled || !start.current) return;
    const ddx = e.touches[0].clientX - start.current.x;
    const ddy = e.touches[0].clientY - start.current.y;
    if (axis.current === null) axis.current = Math.abs(ddx) > Math.abs(ddy) + 4 ? 'h' : 'v';
    if (axis.current !== 'h') return;
    setDx(Math.max(-130, Math.min(130, ddx)));
  };
  const onTouchEnd = () => {
    if (axis.current === 'h') {
      if (dx > SWIPE_TRIGGER) completeTask();
      else if (dx < -SWIPE_TRIGGER) { hapticTick(); deleteTask(task.id); }
    }
    start.current = null; axis.current = null; setDx(0);
  };

  return (
   <div className="relative rounded-xl overflow-visible">
    {/* Swipe reveal backgrounds */}
    {dx !== 0 && (
      <div className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none">
        <span className={`flex items-center gap-1.5 text-[12px] font-bold text-emerald-400 transition-opacity ${dx > 0 ? 'opacity-100' : 'opacity-0'}`}><CheckCircle2 className="w-5 h-5" />{tr('gtd.proc.done')}</span>
        <span className={`flex items-center gap-1.5 text-[12px] font-bold text-red-400 transition-opacity ${dx < 0 ? 'opacity-100' : 'opacity-0'}`}>{tr('gtd.proc.trash')}<Trash2 className="w-5 h-5" /></span>
      </div>
    )}
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform .2s ease, opacity .18s ease, box-shadow .18s ease' : 'none', opacity: completing ? 0.2 : 1 }}
      className={`group relative border rounded-xl ${
        task.status === 'done'
          ? 'border-[var(--border)] bg-[var(--surface)] opacity-70'
          : isDue
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : completing
          ? 'border-emerald-500/40 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]'
      }`}
    >
      {completing && (
        <div className="absolute inset-0 pointer-events-none grid place-items-center overflow-hidden rounded-xl">
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 480, damping: 16 }}
            className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 grid place-items-center text-emerald-500"
          >
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 15 }}>
              <Check className="w-6 h-6" />
            </motion.span>
          </motion.div>
          <motion.div
            initial={{ scale: 0.2, opacity: 0.5 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="absolute w-14 h-14 rounded-full border-2 border-emerald-500/40"
          />
        </div>
      )}
      <div className={`flex items-start gap-3 ${compact ? 'p-3' : 'p-4'}`}>
        {/* Checkbox */}
        {selecting ? (
          <button onClick={onSelect} className="mt-0.5 shrink-0 transition-transform hover:scale-110" aria-label={tr('gtd.selectTask')}>
            {selected ? <CheckCircle2 className="w-4 h-4 text-[var(--primary)]" /> : <Circle className="w-4 h-4 text-[var(--border)]" />}
          </button>
        ) : (
          <button
            onClick={task.status === 'done' ? () => processTask(task.id, 'next-action') : completeTask}
            className="mt-0.5 shrink-0 transition-transform hover:scale-110"
            aria-label={task.status === 'done' ? tr('sm.markUndone') : tr('sm.markDone')}
          >
            {task.status === 'done'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              : <Circle className="w-4 h-4 text-[var(--border)] group-hover:text-[#555]" />
            }
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {/* Priority dot */}
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${p.dot}`} />

            {/* Title */}
            <span className={`text-[13px] font-medium flex-1 ${task.status === 'done' ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>
              {task.title}
            </span>

            {task.isTodayFocus && <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Duration */}
            {task.durationMinutes && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
                <Clock className="w-3 h-3" />{task.durationMinutes}m
              </span>
            )}
            {/* Due date */}
            {task.dueDate && (
              <span className={`flex items-center gap-1 text-[10px] font-medium ${
                isDue ? 'text-red-400' : isTodayDue ? 'text-amber-400' : isTomorrowDue ? 'text-blue-400' : 'text-[var(--text-dim)]'
              }`}>
                <Calendar className="w-3 h-3" />
                {isTodayDue ? tr('common.today') : isTomorrowDue ? tr('common.tomorrow') : format(parseISO(task.dueDate), 'MMM d')}
              </span>
            )}
            {/* Context */}
            {ctx && (
              <span className="flex items-center gap-1 text-[10px]" style={{ color: ctx.color }}>
                <ctx.icon className="w-3 h-3" />{tr(ctx.label)}
              </span>
            )}
            {/* Energy */}
            {task.energyLevel && task.energyLevel !== 'any' && (
              <span className="text-[10px]" style={{ color: ENERGY_CONFIG[task.energyLevel].color }}>
                {ENERGY_CONFIG[task.energyLevel].icon} {tr(ENERGY_CONFIG[task.energyLevel].label)}
              </span>
            )}
            {/* Recurring */}
            {task.recurring && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--primary)]" title={tr('gtd.repeat')}>
                <Repeat className="w-3 h-3" />{tr('gtd.repeat' + task.recurring.charAt(0).toUpperCase() + task.recurring.slice(1))}
              </span>
            )}
            {nextRepeat && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
                <ChevronRight className="w-3 h-3" />{tr('gtd.nextRepeat', { d: format(parseISO(nextRepeat), 'MMM d') })}
              </span>
            )}
            {task.scheduledDate && (
              <span className="flex items-center gap-1 text-[10px] text-blue-400">
                <Calendar className="w-3 h-3" />{tr('gtd.scheduledFor', { d: format(parseISO(task.scheduledDate), 'MMM d') })}
              </span>
            )}
            {task.project && (
              <span className="flex items-center gap-1 text-[10px] text-purple-400">
                <Folder className="w-3 h-3" />{task.project}
              </span>
            )}
            {/* Reminder */}
            {task.remindAt && (
              <span className="flex items-center gap-1 text-[10px] text-sky-400">
                <Bell className="w-3 h-3" />{format(parseISO(task.remindAt), 'MMM d, HH:mm')}
              </span>
            )}
            {/* Tags */}
            {(task.tags || []).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] text-[11px] text-[var(--text-dim)]">#{tag}</span>
            ))}
            {/* Waiting for */}
            {task.delegateTo && (
              <span className="flex items-center gap-1 text-[10px] text-orange-400">
                <Users className="w-3 h-3" />→ {task.delegateTo}
              </span>
            )}
            {/* Subtasks */}
            {(task.subtasks?.length || 0) > 0 && (
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {task.subtasks!.filter(s => s.done).length}/{task.subtasks!.length}
              </button>
            )}
          </div>

          {/* Subtasks expanded */}
          {expanded && (task.subtasks || []).map(st => (
            <div key={st.id} className="flex items-center gap-2 mt-1.5 ml-1">
              <button onClick={() => useStore.getState().toggleSubtask(task.id, st.id)}>
                {st.done
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  : <Circle className="w-3.5 h-3.5 text-[var(--border)]" />}
              </button>
              <span className={`text-[11px] ${st.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>{st.title}</span>
            </div>
          ))}

          {/* Notes preview */}
          {task.notes && !compact && (
            <p className="text-[11px] text-[var(--text-dim)] mt-2 leading-snug line-clamp-2">{task.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {task.status !== 'done' && task.status !== 'inbox' && (
            <button
              onClick={() => setDoingTask(task.id)}
              title={tr('gtd.startDoing')}
              className="h-7 px-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-500/20 transition-colors opacity-100"
            >
              <Play className="w-3 h-3" />{tr('gtd.do')}
            </button>
          )}
          <button
            onClick={() => toggleTodayFocus(task.id)}
            title={tr('gtd.focusToday')}
            className={`w-8 h-8 rounded-lg grid place-items-center transition-colors ${task.isTodayFocus ? 'text-amber-400 bg-amber-500/10' : 'text-[var(--text-dim)] hover:text-amber-400 hover:bg-[var(--surface-2)]'}`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(v => !v)}
              aria-label={tr('gtd.moreActions')}
              className="w-8 h-8 rounded-lg grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 bottom-9 z-[420] w-48 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
                {/* Quick priority (Todoist-style) */}
                <div className="flex gap-1 px-1.5 py-1.5">
                  {([1, 2, 3, 4] as Priority[]).map(pr => (
                    <button key={pr} onClick={() => runMoreAction(() => useStore.getState().updateTask(task.id, { priority: pr }))}
                      className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-colors ${task.priority === pr ? 'ring-1 ring-inset' : 'hover:opacity-80'}`}
                      style={{ color: PRIORITY_CONFIG[pr].color, background: PRIORITY_CONFIG[pr].bg, ...(task.priority === pr ? { boxShadow: `inset 0 0 0 1.5px ${PRIORITY_CONFIG[pr].color}` } : {}) }}>
                      {PRIORITY_CONFIG[pr].label}
                    </button>
                  ))}
                </div>
                <button onClick={() => runMoreAction(() => openEditTask(task.id))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><Edit2 className="w-3.5 h-3.5" />{tr('gtd.editTask')}</button>
                {task.status !== 'inbox' && <button onClick={() => runMoreAction(() => processTask(task.id, 'inbox'))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><Inbox className="w-3.5 h-3.5" />{tr('gtd.moveInbox')}</button>}
                {task.status !== 'next-action' && <button onClick={() => runMoreAction(() => processTask(task.id, 'next-action', { dueDate: undefined, isTodayFocus: false }))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><Zap className="w-3.5 h-3.5" />{tr('gtd.moveNext')}</button>}
                {task.status !== 'someday-maybe' && <button onClick={() => runMoreAction(() => processTask(task.id, 'someday-maybe'))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><Layers className="w-3.5 h-3.5" />{tr('gtd.moveOther')}</button>}
                <button onClick={() => runMoreAction(() => { const d = new Date(); d.setDate(d.getDate() + 1); useStore.getState().updateTask(task.id, { dueDate: format(d, 'yyyy-MM-dd') }); })} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5" />{tr('gtd.postponeTomorrow')}</button>
                <button onClick={() => runMoreAction(() => openTimerLauncher({ linkType: 'task', linkId: task.id, label: task.title }))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"><Timer className="w-3.5 h-3.5" />{tr('gtd.pomodoro')}</button>
                <button onClick={() => runMoreAction(() => deleteTask(task.id))} className="w-full h-9 px-3 rounded-lg text-left text-[12px] font-semibold text-red-400 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" />{tr('common.delete')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag hint (shows on hover) */}
      {!compact && <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity -ml-1 text-[var(--text-dim)] hover:text-[var(--text)]">
        <GripVertical className="w-3 h-3" />
      </div>}

      {/* Processing bar for inbox */}
      {task.status === 'inbox' && (
        <div className="px-4 pb-3 border-t border-[var(--surface-2)] mt-1 pt-3">
          <div className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-widest mb-2">{tr('gtd.whatIsIt')}</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => processTask(task.id, 'next-action', { dueDate: undefined, isTodayFocus: false })} className="h-7 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 transition-colors">{tr('gtd.proc.nextAction')}</button>
            <button onClick={() => processTask(task.id, 'someday-maybe')} className="h-7 px-3 rounded-lg bg-slate-500/10 border border-slate-500/30 text-slate-400 text-[10px] font-bold hover:bg-slate-500/20 transition-colors">{tr('gtd.proc.other')}</button>
            <button onClick={() => { processTask(task.id, 'scheduled', { dueDate: undefined, isTodayFocus: false }); scheduleFromTask(task.title, task.durationMinutes || 60, task.id); }} className="h-7 px-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-colors">{tr('gtd.proc.schedule')}</button>
            <button onClick={() => processTask(task.id, 'done')} className="h-7 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors">{tr('gtd.proc.done')}</button>
            <button onClick={() => deleteTask(task.id)} className="h-7 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] hover:bg-red-500/20 transition-colors">{tr('gtd.proc.trash')}</button>
          </div>
        </div>
      )}
    </div>
   </div>
  );
}

// ─── Quick Capture Bar ────────────────────────────────────────────────────────
function QuickCaptureBar({ onAdd }: { onAdd?: () => void }) {
  const tr = useT();
  const [input, setInput] = useState('');
  const [hint, setHint] = useState('');

  const handleChange = (val: string) => {
    setInput(val);
    const parsed = parseNL(val);
    const hints: string[] = [];
    if (parsed.priority) hints.push(`P${parsed.priority}`);
    if (parsed.context) hints.push(parsed.context);
    if (parsed.durationMinutes) hints.push(`${parsed.durationMinutes}m`);
    if (parsed.tags?.length) hints.push(parsed.tags.map(t => `#${t}`).join(' '));
    if (parsed.dueDate) {
      const today = format(new Date(), 'yyyy-MM-dd');
      const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
      hints.push(parsed.dueDate === today ? tr('common.today') : parsed.dueDate === tomorrow ? tr('common.tomorrow') : parsed.dueDate);
    }
    if (parsed.remindAt) hints.push(`⏰ ${parsed.remindAt.slice(11, 16)}`);
    if (parsed.recurring) hints.push(tr('gtd.repeat' + parsed.recurring.charAt(0).toUpperCase() + parsed.recurring.slice(1)));
    setHint(hints.join(' · '));
  };

  const submit = () => {
    if (!input.trim()) return;
    const parsed = parseNL(input);
    const store = useStore.getState();
    store.captureTask(parsed.title, parsed.durationMinutes || 5);
    if (parsed.priority || parsed.context || parsed.tags?.length || parsed.dueDate || parsed.remindAt || parsed.recurring) {
      // Re-read state: captureTask created a new task, prepended to the list.
      const newId = useStore.getState().gtdTasks[0]?.id;
      if (newId) {
        store.updateTask(newId, {
          priority: parsed.priority || 3,
          context: parsed.context,
          tags: parsed.tags || [],
          dueDate: parsed.dueDate,
          remindAt: parsed.remindAt,
          recurring: parsed.recurring,
        });
      }
    }
    setInput('');
    setHint('');
    onAdd?.();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Plus className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
        <input
          value={input}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={tr('gtd.capturePlaceholder')}
          className="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none"
        />
        {input && <button onClick={submit} className="h-7 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold hover:opacity-90">{tr('common.add')}</button>}
      </div>
      {hint && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-[var(--primary)]" />
          <span className="text-[10px] text-[var(--primary)]">{tr('gtd.parsed',{hint})}</span>
        </div>
      )}
      {!input && (
        <div className="px-4 pb-2.5 flex gap-2 flex-wrap">
          {['p1', 'p2', '@phone', '@computer', '#work', '30m'].map(h => (
            <button key={h} onClick={() => handleChange(input + ' ' + h)} className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text-dim)] border border-[var(--border)]">{h}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Task Drawer ──────────────────────────────────────────────────────────
// Thin wrapper keeps a stable hook count; the form (with its useState calls) only
// mounts when there's a task, so its hooks always run unconditionally.
function EditTaskModal() {
  const gtdEditTaskId = useStore(s => s.gtdEditTaskId);
  const task = useStore(s => s.gtdTasks.find(t => t.id === gtdEditTaskId));
  if (!task) return null;
  return <EditTaskForm key={task.id} task={task} />;
}

function EditTaskForm({ task }: { task: GTDTask }) {
  const tr = useT();
  const { updateTask, processTask, closeEditTask } = useStore();

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [context, setContext] = useState<TaskContext | ''>(task.context || '');
  const [duration, setDuration] = useState(task.durationMinutes || 0);
  const [energy, setEnergy] = useState<string>(task.energyLevel || 'any');
  const [status, setStatus] = useState<GTDStatus>(task.status);
  const [newSub, setNewSub] = useState('');
  const [subtasks, setSubtasks] = useState(task.subtasks || []);
  const [delegateTo, setDelegateTo] = useState(task.delegateTo || '');
  const [project, setProject] = useState(task.project || '');
  const [scheduledDate, setScheduledDate] = useState(task.scheduledDate || '');
  const [recurring, setRecurring] = useState<RecurringPattern | ''>(task.recurring || '');
  const [recurFromCompletion, setRecurFromCompletion] = useState(!!task.recurFromCompletion);
  const [remindAt, setRemindAt] = useState(task.remindAt ? task.remindAt.slice(0, 16) : '');

  const save = () => {
    updateTask(task.id, {
      title,
      notes,
      dueDate: dueDate || undefined,
      priority,
      context: context as TaskContext || undefined,
      durationMinutes: duration || undefined,
      energyLevel: energy as any,
      delegateTo: delegateTo || undefined,
      project: project.trim() || undefined,
      scheduledDate: scheduledDate || undefined,
      subtasks,
      recurring: recurring || undefined,
      recurFromCompletion: recurring && recurFromCompletion ? true : undefined,
      remindAt: remindAt || undefined,
    });
    if (status !== task.status) processTask(task.id, status);
    closeEditTask();
  };

  const addSub = () => {
    if (!newSub.trim()) return;
    setSubtasks(s => [...s, { id: `st${Date.now()}`, title: newSub.trim(), done: false }]);
    setNewSub('');
  };

  return (
    <Drawer open={true} onClose={closeEditTask} width="lg" title={tr('gtd.editTask')} subtitle={task.title} noPadding>

        <div className="p-5 space-y-4">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-transparent text-[var(--text)] text-[16px] font-semibold focus:outline-none border-b border-[var(--border)] pb-2" placeholder={tr('gtd.taskTitle')} />

          {/* Row 1: Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.priority')}</label>
              <div className="flex gap-1.5">
                {([1,2,3,4] as Priority[]).map(p => (
                  <button key={p} onClick={() => setPriority(p)} className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition-all ${priority===p ? 'border-transparent' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`} style={priority===p?{background:PRIORITY_CONFIG[p].bg,color:PRIORITY_CONFIG[p].color,borderColor:PRIORITY_CONFIG[p].color+'50'}:{}}>
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.statusLabel')}</label>
              <SelectMenu value={status === 'project' || status === 'waiting-for' || status === 'reference' ? 'someday-maybe' : status} onChange={(v) => setStatus(v as GTDStatus)} size="sm" ariaLabel={tr('gtd.statusLabel')}
                options={[
                  { value: 'inbox', label: tr('gtd.status.inbox') },
                  { value: 'next-action', label: tr('gtd.status.next-action') },
                  { value: 'scheduled', label: tr('gtd.status.scheduled') },
                  { value: 'someday-maybe', label: tr('gtd.status.other') },
                  { value: 'done', label: tr('gtd.status.done') },
                ]} />
            </div>
          </div>

          {/* Row 2: Due Date + Duration + Context */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.dueDate')}</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {([[tr('common.today'), 0], [tr('common.tomorrow'), 1], [tr('gtd.nextWeek'), 7]] as [string, number][]).map(([label, off]) => {
                  const d = new Date(); d.setDate(d.getDate() + off);
                  const key = format(d, 'yyyy-MM-dd');
                  const a = dueDate === key;
                  return <button key={off} type="button" onClick={() => setDueDate(a ? '' : key)}
                    className={`h-6 px-2 rounded-md text-[10px] font-bold transition-colors ${a ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{label}</button>;
                })}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.durationMin')}</label>
              <input type="number" value={duration||''} onChange={e => setDuration(Number(e.target.value))} placeholder="30" className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.context')}</label>
              <SelectMenu value={context} onChange={(v) => setContext(v as TaskContext)} ariaLabel={tr('gtd.context')}
                options={[{ value: '', label: tr('gtd.none') }, ...Object.entries(CONTEXT_CONFIG).map(([k,v]) => ({ value: k, label: tr(v.label) }))]} />
            </div>
          </div>

          {/* Project + Scheduled date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.projectName')}</label>
              <input value={project} onChange={e => setProject(e.target.value)} placeholder={tr('gtd.projectPlaceholder')} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none placeholder:text-[var(--text-dim)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.scheduledDate')}</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
            </div>
          </div>

          {/* Energy + Delegate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.energyLevel')}</label>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(ENERGY_CONFIG).map(([k,v]) => (
                  <button key={k} onClick={() => setEnergy(k)} className={`h-7 px-2.5 rounded-lg text-[10px] border transition-all ${energy===k?'bg-[var(--primary)]/20 border-[var(--primary)]/50 text-[var(--primary)]':'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                    {v.icon} {tr(v.label)}
                  </button>
                ))}
              </div>
            </div>
            {(status === 'waiting-for') && (
              <div>
                <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.delegatedTo')}</label>
                <input value={delegateTo} onChange={e => setDelegateTo(e.target.value)} placeholder={tr('gtd.personName')} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
              </div>
            )}
          </div>

          {/* Repeat + Reminder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.repeat')}</label>
              <SelectMenu value={recurring} onChange={(v) => setRecurring(v as RecurringPattern | '')} ariaLabel={tr('gtd.repeat')}
                options={[
                  { value: '', label: tr('gtd.repeatNone') },
                  { value: 'daily', label: tr('gtd.repeatDaily') },
                  { value: 'weekdays', label: tr('gtd.repeatWeekdays') },
                  { value: 'weekly', label: tr('gtd.repeatWeekly') },
                  { value: 'monthly', label: tr('gtd.repeatMonthly') },
                ]} />
              {recurring && (
                <button type="button" onClick={() => setRecurFromCompletion(v => !v)}
                  className={`mt-1.5 h-6 px-2 rounded-md text-[10px] font-bold transition-colors ${recurFromCompletion ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                  {recurFromCompletion ? '✓ ' : ''}{tr('gtd.repeatFromDone')}
                </button>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                {tr('gtd.reminder')}
                {remindAt && <button onClick={() => setRemindAt('')} className="text-[9px] text-[var(--text-dim)] hover:text-red-400 normal-case">{tr('gtd.reminderClear')}</button>}
              </label>
              <input type="datetime-local" value={remindAt} onChange={e => setRemindAt(e.target.value)} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-2">{tr('gtd.subtasks')}</label>
            <div className="space-y-1.5 mb-2">
              {subtasks.map((st, i) => (
                <div key={st.id} className="flex items-center gap-2">
                  <button onClick={() => setSubtasks(s => s.map((x,j) => j===i ? {...x,done:!x.done} : x))}>
                    {st.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-[var(--border)]" />}
                  </button>
                  <span className={`flex-1 text-[12px] ${st.done?'line-through text-[var(--text-dim)]':'text-[var(--text)]'}`}>{st.title}</span>
                  <button onClick={() => setSubtasks(s => s.filter((_,j) => j!==i))}><X className="w-3 h-3 text-[var(--border)] hover:text-red-400" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key==='Enter'&&addSub()} placeholder={tr('gtd.addSubtask')} className="flex-1 h-7 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
              <button onClick={addSub} className="h-7 px-2 rounded-lg bg-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.notes')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={tr('gtd.notesPlaceholder')} className="w-full rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-3 py-2 focus:outline-none resize-none placeholder:text-[var(--text-dim)]" />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--surface-2)] flex gap-2">
          <button onClick={closeEditTask} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{tr('common.cancel')}</button>
          <button onClick={save} className="flex-1 h-10 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold">{tr('gtd.saveChanges')}</button>
        </div>
    </Drawer>
  );
}

// ─── Weekly Review Modal ─────────────────────────────────────────────────────
function WeeklyReviewModal() {
  const tr = useT();
  const { weeklyReviewOpen, closeWeeklyReview, gtdTasks } = useStore();
  const [step, setStep] = useState(0);
  const setGTDFilter = useStore(s => s.setGTDFilter);
  if (!weeklyReviewOpen) return null;

  const steps = [
    { title: tr('gtd.review1t'), desc: tr('gtd.review1d'), filter: 'inbox', done: gtdTasks.filter(t=>t.status==='inbox').length === 0 },
    { title: tr('gtd.review2t'), desc: tr('gtd.review2d'), filter: 'next-action', done: false },
    { title: tr('gtd.review3t'), desc: tr('gtd.review3d'), filter: 'project', done: false },
    { title: tr('gtd.review4t'), desc: tr('gtd.review4d'), filter: 'waiting-for', done: gtdTasks.filter(t=>t.status==='waiting-for').length === 0 },
    { title: tr('gtd.review5t'), desc: tr('gtd.review5d'), filter: 'someday-maybe', done: false },
    { title: tr('gtd.review6t'), desc: tr('gtd.review6d'), filter: 'today', done: false },
  ];

  const goToStepModule = (filterId: string) => {
    setGTDFilter(filterId);
    closeWeeklyReview();
    setStep(0);
  };

  return (
    <Drawer open={true} onClose={closeWeeklyReview} width="lg" title={tr('gtd.weeklyReview')} subtitle={tr('gtd.reviewStep',{n:step+1,total:steps.length})}>
      <div className="space-y-1 mb-5">{steps.map((_s, i) => <div key={i} className={`h-1 rounded-full ${i <= step ? 'bg-emerald-500' : 'bg-[var(--border)]'}`} style={{width: `${100/steps.length}%`}}/>)}</div>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${i === step ? 'border-emerald-500/30 bg-emerald-500/5' : i < step ? 'border-[var(--border)] opacity-40' : 'border-[var(--surface-2)] opacity-60'}`}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${i < step ? 'bg-emerald-500 border-emerald-500' : i === step ? 'border-emerald-500' : 'border-[var(--border)]'}`}>
              {i < step && <Check className="w-3 h-3 text-black" />}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[var(--text)] text-[13px]">{s.title}</div>
              <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{s.desc}</div>
              {s.done && i === step && <div className="text-[10px] text-emerald-400 mt-1">{tr('gtd.alreadyClear')}</div>}
            </div>
            {i === step && (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => goToStepModule(s.filter)} className="h-8 px-3 rounded-lg border border-emerald-500/40 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/10 transition-colors">{tr('gtd.open')}</button>
                <button onClick={() => {
                  if (step < steps.length - 1) setStep(step + 1);
                  else { closeWeeklyReview(); setStep(0); }
                }} className="h-8 px-4 rounded-lg bg-emerald-500 text-black text-[11px] font-bold">
                  {step === steps.length - 1 ? tr('gtd.reviewDone') : tr('gtd.next')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

// ─── Main GTD View (Content Only) ───────────────────────────────────────────
// Sorted task lists live on the second level. The first level is Inbox triage.
const SORTED_TABS: { id: string; label: string; icon: any; color: string }[] = [
  { id: 'today',         label: 'gtd.todayBucket',        icon: Sun,         color: '#f59e0b' },
  { id: 'next-action',   label: 'gtd.status.next-action', icon: Zap,         color: '#eab308' },
  { id: 'scheduled',     label: 'gtd.status.scheduled',   icon: Calendar,    color: '#3b82f6' },
  { id: 'other',         label: 'gtd.status.other',       icon: Layers,      color: '#64748b' },
  { id: 'done',          label: 'gtd.status.done',        icon: CheckCircle2,color: '#22c55e' },
];

type TriageDestination = 'today' | 'other' | 'next-action' | 'inbox' | 'scheduled';

const SWIPE_HINT_KEY = 'nebulla-swipe-hint-dismissed';

export function GTDView({ onBack }: { onBack?: () => void }) {
  const tr = useT();
  const dfLocale = useDateLocale();
  const [swipeHintVisible, setSwipeHintVisible] = useState(() => {
    try { return !localStorage.getItem(SWIPE_HINT_KEY); } catch { return false; }
  });
  const dismissSwipeHint = () => {
    setSwipeHintVisible(false);
    try { localStorage.setItem(SWIPE_HINT_KEY, '1'); } catch { /* private mode */ }
  };
  const {
    gtdTasks, gtdFilter, setGTDFilter, activeContext, setActiveContext,
    searchQuery, setSearchQuery, reorderTasks, openWeeklyReview,
    processTask, deleteTask, toggleTodayFocus, scheduleFromTask,
  } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'created'>('priority');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useBackClose(filtersOpen, () => setFiltersOpen(false));
  useBackClose(selecting, () => { setSelecting(false); setSelectedIds([]); });
  const [viewMode, setViewMode] = useState<'inbox' | 'lists'>('inbox');
  const tabsRef = useRef<HTMLDivElement>(null);
  const viewSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const viewSwipeAxis = useRef<'h' | 'v' | null>(null);
  const [viewSwipeDx, setViewSwipeDx] = useState(0);
  const triageStart = useRef<{ x: number; y: number } | null>(null);
  const triageAxis = useRef<'h' | 'v' | null>(null);
  const [triageDx, setTriageDx] = useState(0);
  const [triageDy, setTriageDy] = useState(0);
  const [triageFx, setTriageFx] = useState<{ destination: TriageDestination; x: number; y: number; color: string } | null>(null);
  const triageFxTimer = useRef<number | null>(null);

  const allContexts = ['all', ...Object.keys(CONTEXT_CONFIG)];
  const selectedCount = selectedIds.length;
  const currentBucketIndex = Math.max(0, SORTED_TABS.findIndex(b => b.id === gtdFilter));
  const rawTasks = gtdTasks
    .filter(t => t.status === 'inbox' && !t.processedAt && !t.isArchived)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const triageTask = rawTasks[0];
  const otherStatuses: GTDStatus[] = ['project', 'waiting-for', 'someday-maybe', 'reference'];
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  const triageFxColors: Record<TriageDestination, string> = {
    today: '#f59e0b',
    other: '#64748b',
    'next-action': '#eab308',
    inbox: '#10b981',
    scheduled: '#3b82f6',
  };

  // Count helper for the bucket tabs
  const bucketCount = (id: string) => {
    const activeTasks = gtdTasks.filter(t => t.status !== 'done' && t.status !== 'trash' && !t.isArchived);
    if (id === 'today') return activeTasks.filter(t => t.status !== 'scheduled' && (t.isTodayFocus || dueTodayOrOverdue(t))).length;
    if (id === 'other') return activeTasks.filter(t => otherStatuses.includes(t.status)).length;
    if (id === 'next-action') return activeTasks.filter(t => t.status === 'next-action' && !t.isTodayFocus && !dueTodayOrOverdue(t)).length;
    return activeTasks.filter(t => t.status === id).length;
  };

  // ── Filtered tasks ────────────────────────────────────────────────────────
  const filtered = gtdTasks
    .filter(t => (t.status !== 'trash' && t.status !== 'done') || gtdFilter === 'done' || gtdFilter === 'trash')
    .filter(t => {
      if (gtdFilter === 'today') return t.status !== 'scheduled' && (t.isTodayFocus || dueTodayOrOverdue(t));
      if (gtdFilter === 'other') return otherStatuses.includes(t.status);
      if (gtdFilter === 'next-action') return t.status === 'next-action' && !t.isTodayFocus && !dueTodayOrOverdue(t);
      return t.status === gtdFilter;
    })
    .filter(t => gtdFilter === 'today' || activeContext === 'all' || t.context === activeContext)
    .filter(t => gtdFilter === 'today' || priorityFilter === 'all' || t.priority === priorityFilter)
    .filter(t => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t.tags || []).some(tag => tag.includes(searchQuery.toLowerCase())))
    .sort((a, b) => {
      if (gtdFilter === 'scheduled') {
        // Upcoming view groups by date — always chronological (Things-style)
        const ad = a.scheduledDate || a.dueDate || '9999', bd = b.scheduledDate || b.dueDate || '9999';
        if (ad !== bd) return ad.localeCompare(bd);
        return a.priority - b.priority;
      }
      if (sortBy === 'priority') return a.priority - b.priority;
      if (sortBy === 'due') {
        if (!a.dueDate) return 1; if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  // Date-group headers for the Scheduled (upcoming) list
  const taskDateKey = (t: GTDTask) => t.scheduledDate || t.dueDate || '';
  const dateGroupLabel = (key: string): string => {
    if (!key) return tr('gtd.noDate');
    const d = parseISO(key);
    if (isToday(d)) return tr('common.today');
    if (isTomorrow(d)) return tr('common.tomorrow');
    if (key < todayStr()) return tr('gtd.overdueLabel');
    return format(d, 'EEEE, MMM d', { locale: dfLocale });
  };

  const projectGroups = Array.from(filtered.reduce((acc, task) => {
    const name = task.project?.trim() || tr('gtd.noProject');
    const current = acc.get(name) || { total: 0, next: 0, waiting: 0, scheduled: 0 };
    current.total += 1;
    if (task.status === 'next-action') current.next += 1;
    if (task.status === 'waiting-for') current.waiting += 1;
    if (task.status === 'scheduled') current.scheduled += 1;
    acc.set(name, current);
    return acc;
  }, new Map<string, { total: number; next: number; waiting: number; scheduled: number }>()).entries());

  const doneTasks = gtdTasks.filter(t => t.status === 'done');
  const todayFocusTasks = gtdTasks.filter(t => t.isTodayFocus && t.status !== 'done');
  const inboxCount = gtdTasks.filter(t => t.status === 'inbox').length;
  const nextCount = gtdTasks.filter(t => t.status === 'next-action').length;
  const statusConf = STATUS_CONFIG[gtdFilter as GTDStatus] || STATUS_CONFIG.other;
  const toggleSelected = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const selectedTaskIds = selectedIds.filter(id => gtdTasks.some(t => t.id === id && t.status !== 'trash'));
  const clearSelection = () => setSelectedIds([]);
  const runBulk = (action: 'done' | 'next-action' | 'today' | 'trash') => {
    selectedTaskIds.forEach(id => {
      if (action === 'today') toggleTodayFocus(id);
      else if (action === 'trash') deleteTask(id);
      else processTask(id, action, action === 'next-action' ? { dueDate: undefined, isTodayFocus: false } : undefined);
    });
    clearSelection();
    setSelecting(false);
  };
  const goToBucket = (nextIndex: number) => {
    const next = SORTED_TABS[nextIndex];
    if (!next || next.id === gtdFilter) return;
    setGTDFilter(next.id);
    clearSelection();
    setSelecting(false);
  };
  const commitTriageTask = (destination: TriageDestination) => {
    if (!triageTask) return;
    if (destination === 'today') {
      processTask(triageTask.id, 'inbox', { isTodayFocus: true, dueDate: todayDate });
    } else if (destination === 'other') {
      processTask(triageTask.id, 'someday-maybe');
    } else if (destination === 'next-action') {
      processTask(triageTask.id, 'next-action', { dueDate: undefined, isTodayFocus: false });
    } else if (destination === 'scheduled') {
      processTask(triageTask.id, 'scheduled', { scheduledDate: todayDate, dueDate: undefined, isTodayFocus: false });
      scheduleFromTask(triageTask.title, triageTask.durationMinutes || 60, triageTask.id);
    } else {
      processTask(triageTask.id, destination);
    }
    setTriageDx(0);
    setTriageDy(0);
  };
  const processTriageTask = (destination: TriageDestination, releaseX = triageDx, releaseY = triageDy) => {
    if (!triageTask || triageFx) return;
    setTriageFx({ destination, x: releaseX, y: releaseY, color: triageFxColors[destination] });
    if (triageFxTimer.current) window.clearTimeout(triageFxTimer.current);
    triageFxTimer.current = window.setTimeout(() => {
      commitTriageTask(destination);
      setTriageFx(null);
      triageFxTimer.current = null;
    }, 680);
  };
  const onTriageTouchStart = (e: React.TouchEvent) => {
    triageStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    triageAxis.current = null;
  };
  const onTriageTouchMove = (e: React.TouchEvent) => {
    if (!triageStart.current) return;
    const dx = e.touches[0].clientX - triageStart.current.x;
    const dy = e.touches[0].clientY - triageStart.current.y;
    if (triageAxis.current === null) triageAxis.current = Math.abs(dx) > Math.abs(dy) + 4 ? 'h' : 'v';
    setTriageDx(Math.max(-130, Math.min(130, dx)));
    setTriageDy(Math.max(-130, Math.min(130, dy)));
  };
  const onTriageTouchEnd = () => {
    if (!triageStart.current) return;
    if (triageAxis.current === 'h' && Math.abs(triageDx) > 72) {
      processTriageTask(triageDx > 0 ? 'next-action' : 'other', triageDx, triageDy);
    } else if (triageAxis.current === 'v' && Math.abs(triageDy) > 72) {
      processTriageTask(triageDy < 0 ? 'today' : 'inbox', triageDx, triageDy);
    }
    triageStart.current = null;
    triageAxis.current = null;
    setTriageDx(0);
    setTriageDy(0);
  };

  useEffect(() => {
    return () => {
      if (triageFxTimer.current) window.clearTimeout(triageFxTimer.current);
    };
  }, []);
  const onViewTouchStart = (e: React.TouchEvent) => {
    if (viewMode !== 'lists') return;
    const target = e.target as HTMLElement;
    if (target.closest('button,input,textarea,a,[role="button"],[role="listbox"],[data-no-tab-swipe]')) return;
    viewSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    viewSwipeAxis.current = null;
    setViewSwipeDx(0);
  };
  const onViewTouchMove = (e: React.TouchEvent) => {
    if (!viewSwipeStart.current) return;
    const dx = e.touches[0].clientX - viewSwipeStart.current.x;
    const dy = e.touches[0].clientY - viewSwipeStart.current.y;
    if (viewSwipeAxis.current === null) viewSwipeAxis.current = Math.abs(dx) > Math.abs(dy) + 8 ? 'h' : 'v';
    if (viewSwipeAxis.current !== 'h') return;
    setViewSwipeDx(Math.max(-90, Math.min(90, dx)));
  };
  const onViewTouchEnd = () => {
    if (!viewSwipeStart.current) return;
    if (viewSwipeAxis.current === 'h' && Math.abs(viewSwipeDx) > 64) {
      // Swipe left moves the user visually to the right; swipe right moves back left.
      goToBucket(viewSwipeDx < 0 ? Math.min(currentBucketIndex + 1, SORTED_TABS.length - 1) : Math.max(currentBucketIndex - 1, 0));
    }
    viewSwipeStart.current = null;
    viewSwipeAxis.current = null;
    setViewSwipeDx(0);
  };

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`[data-bucket-id="${gtdFilter}"]`)?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [gtdFilter]);

  useEffect(() => {
    if (viewMode !== 'lists') return;
    if (gtdFilter === 'all' || gtdFilter === 'inbox') setGTDFilter('today');
    if (gtdFilter === 'project' || gtdFilter === 'waiting-for' || gtdFilter === 'reference' || gtdFilter === 'someday-maybe') setGTDFilter('other');
  }, [gtdFilter, setGTDFilter, viewMode]);

  const openSortedLists = () => {
    setViewMode('lists');
    if (!SORTED_TABS.some(t => t.id === gtdFilter)) setGTDFilter('today');
  };
  const openInboxLevel = () => {
    setViewMode('inbox');
    setGTDFilter('inbox');
    clearSelection();
    setSelecting(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg)]">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 md:py-6 border-b border-[var(--surface-2)] shrink-0 bg-[var(--bg)]">
        <div className="space-y-5">
          <div className="flex items-center gap-4 min-w-0">
            {onBack && <button
              onClick={() => {
                if (viewMode === 'lists' || gtdFilter !== 'inbox') openInboxLevel();
                else onBack();
              }}
              className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] grid place-items-center text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"
              aria-label={tr('bottomNav.stats')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>}
            <div className="min-w-0 flex-1 pr-1">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="display text-[22px] md:text-[32px] text-[var(--text)] truncate" style={{ lineHeight: 1.12 }}>
                  {viewMode === 'inbox' ? tr('gtd.status.inbox') : gtdFilter === 'today' ? tr('gtd.todaysFocus') : tr(statusConf.label)}
                </h1>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-[12px] text-[var(--text-dim)] font-medium border border-[var(--border)] shrink-0 ml-1">
                  {tr('gtd.tasksCount',{n:viewMode === 'inbox' ? rawTasks.length : filtered.length})}
                </span>
              </div>
            </div>
            <button
              onClick={viewMode === 'inbox' ? openSortedLists : openInboxLevel}
              className="h-9 px-3 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] text-[12px] font-bold flex items-center justify-center gap-1.5 shrink-0"
            >
              {viewMode === 'inbox' ? <><Layers3 className="w-4 h-4" /><span className="hidden sm:inline">{tr('gtd.sortedLists')}</span></> : <><Inbox className="w-4 h-4" /><span className="hidden sm:inline">{tr('gtd.backToInbox')}</span></>}
            </button>
          </div>

          {/* Bucket tabs (GTD lists) */}
          {viewMode === 'lists' && <div ref={tabsRef} className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-no-tab-swipe>
          {SORTED_TABS.map(b => {
            const Ic = b.icon;
            const a = gtdFilter === b.id;
            const cnt = bucketCount(b.id);
            return (
              <button key={b.id} data-bucket-id={b.id} onClick={() => setGTDFilter(b.id)}
                className={`relative h-9 px-3 rounded-xl text-[12px] font-medium flex items-center gap-2 shrink-0 transition-colors ${a ? 'text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                {a && <motion.span layoutId="gtd-tab-pill" transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  className="absolute inset-0 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]" />}
                <Ic className="relative w-3.5 h-3.5" style={{ color: a ? b.color : undefined }} />
                <span className="relative">{tr(b.label)}</span>
                {cnt > 0 && (
                  <span className="relative text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: a ? b.color : 'var(--text-mute)', background: a ? `${b.color}20` : 'var(--surface-2)' }}>{cnt}</span>
                )}
              </button>
            );
          })}
          </div>}

          {viewMode === 'lists' && <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 flex items-center gap-2 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 focus-within:border-[var(--border)] transition-colors">
            <Search className="w-4 h-4 text-[var(--text-dim)]" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={tr('gtd.searchPlaceholder')} className="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[var(--text-dim)] hover:text-[var(--text)]"><X className="w-3.5 h-3.5" /></button>}
          </div>

            <button
              onClick={() => setFiltersOpen(v => !v)}
              className={`h-10 px-3 rounded-xl border text-[12px] font-bold shrink-0 flex items-center gap-1.5 ${filtersOpen ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] text-[var(--text-dim)] bg-[var(--surface)] hover:text-[var(--text)]'}`}
            >
              <SlidersHorizontal className="w-4 h-4" />{tr('gtd.filters')}
            </button>
            <button onClick={openWeeklyReview} className="h-10 w-10 rounded-xl bg-[var(--primary)] text-white grid place-items-center shadow-sm shrink-0" aria-label={tr('gtd.weeklyReview')}>
              <Sparkles className="w-4 h-4" />
            </button>
          </div>}
          {viewMode === 'lists' && filtersOpen && (
          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
            <SelectMenu value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)} ariaLabel={tr('gtd.sortPriority')}
              options={[
                { value: 'priority', label: tr('gtd.sortPriority') },
                { value: 'due', label: tr('gtd.sortDue') },
                { value: 'created', label: tr('gtd.sortCreated') },
              ]} />
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {allContexts.map(c => {
                const conf = c !== 'all' ? CONTEXT_CONFIG[c] : null;
                const a = activeContext === c;
                return (
                  <button key={c} onClick={() => setActiveContext(c)} className={`h-8 px-3 rounded-lg text-[11px] font-medium border transition-all shrink-0 ${a ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                    style={a && conf ? { color: conf.color } : {}}>
                    {c === 'all' ? tr('gtd.allContexts') : tr(conf?.label || '')}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
              {(['all',1,2,3,4] as const).map(p => {
                const active = priorityFilter === p;
                const label = p === 'all' ? tr('gtd.priorityAll') : `P${p}`;
                return (
                  <button key={p} onClick={() => setPriorityFilter(p)} className={`h-8 px-3 rounded-lg text-[11px] font-bold border shrink-0 ${active ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]' : 'border-transparent text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 max-w-5xl mx-auto w-full space-y-4"
        onTouchStart={onViewTouchStart}
        onTouchMove={onViewTouchMove}
        onTouchEnd={onViewTouchEnd}
      >
        {viewMode === 'lists' && <section className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: tr('gtd.status.inbox'), value: inboxCount, icon: Inbox, color: '#22c55e', action: () => setGTDFilter('inbox') },
            { label: tr('gtd.status.next-action'), value: nextCount, icon: Zap, color: '#eab308', action: () => setGTDFilter('next-action') },
            { label: tr('gtd.todaysFocus'), value: todayFocusTasks.length, icon: Sun, color: '#f59e0b', action: () => setGTDFilter('today') },
            { label: tr('gtd.status.other'), value: bucketCount('other'), icon: Layers, color: '#64748b', action: () => setGTDFilter('other') },
          ].map(item => {
            const Ic = item.icon;
            return (
              <button key={item.label} onClick={item.action} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left flex items-center gap-3 hover:border-[var(--primary)] transition-colors">
                <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${item.color}18`, color: item.color }}><Ic className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block text-[18px] font-bold text-[var(--text)] mono leading-none">{item.value}</span>
                  <span className="block text-[11px] text-[var(--text-dim)] truncate mt-1">{item.label}</span>
                </span>
              </button>
            );
          })}
        </section>}

        {viewMode === 'lists' && <div className="hidden md:block">
          <QuickCaptureBar />
        </div>}

        {viewMode === 'inbox' && (
          <section className="min-h-[430px] flex flex-col items-center justify-center">
            {triageTask ? (
              <div className="relative w-full max-w-[390px] h-[390px] mx-auto" data-no-tab-swipe>
                <button onClick={() => processTriageTask('today')} className={`absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full border grid place-items-center text-center text-[11px] font-bold shadow-sm transition-transform ${triageFx?.destination === 'today' ? 'scale-110 ring-4 ring-amber-400/20' : 'bg-amber-500/10 border-amber-500/25 text-amber-500'}`}>
                  <span><Sun className="w-5 h-5 mx-auto mb-1" />{tr('gtd.todayBucket')}</span>
                </button>
                <button onClick={() => processTriageTask('other')} className={`absolute left-0 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full border grid place-items-center text-center text-[11px] font-bold shadow-sm transition-transform ${triageFx?.destination === 'other' ? 'scale-110 ring-4 ring-slate-400/20' : 'bg-slate-500/10 border-slate-500/25 text-slate-500'}`}>
                  <span><Layers className="w-5 h-5 mx-auto mb-1" />{tr('gtd.status.other')}</span>
                </button>
                <button onClick={() => processTriageTask('next-action')} className={`absolute right-0 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full border grid place-items-center text-center text-[11px] font-bold shadow-sm transition-transform ${triageFx?.destination === 'next-action' ? 'scale-110 ring-4 ring-yellow-400/20' : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-500'}`}>
                  <span><Zap className="w-5 h-5 mx-auto mb-1" />{tr('gtd.status.next-action')}</span>
                </button>
                <button onClick={() => processTriageTask('inbox')} className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full border grid place-items-center text-center text-[11px] font-bold shadow-sm transition-transform ${triageFx?.destination === 'inbox' ? 'scale-110 ring-4 ring-emerald-400/20' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'}`}>
                  <span><Inbox className="w-5 h-5 mx-auto mb-1" />{tr('gtd.status.inbox')}</span>
                </button>
                <button onClick={() => processTriageTask('scheduled')} className={`absolute right-5 top-12 w-20 h-20 rounded-full border grid place-items-center text-center text-[10px] font-bold shadow-sm transition-transform ${triageFx?.destination === 'scheduled' ? 'scale-110 ring-4 ring-blue-400/20' : 'bg-blue-500/10 border-blue-500/25 text-blue-500'}`}>
                  <span><Calendar className="w-4 h-4 mx-auto mb-1" />{tr('gtd.status.scheduled')}</span>
                </button>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] text-[var(--text-dim)] flex items-center gap-1"><ArrowUp className="w-3 h-3" />{tr('gtd.swipeToday')}</div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-[var(--text-dim)] flex items-center gap-1"><ArrowDown className="w-3 h-3" />{tr('gtd.swipeInbox')}</div>
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 text-[10px] text-[var(--text-dim)]"><ArrowLeft className="w-3 h-3 mx-auto" />{tr('gtd.swipeOther')}</div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 text-[10px] text-[var(--text-dim)]"><ArrowRight className="w-3 h-3 mx-auto" />{tr('gtd.swipeNext')}</div>
                </div>
                {!triageFx && (
                  <div
                    onTouchStart={onTriageTouchStart}
                    onTouchMove={onTriageTouchMove}
                    onTouchEnd={onTriageTouchEnd}
                    style={{ transform: `translate(${triageDx}px, ${triageDy}px)`, transition: triageDx === 0 && triageDy === 0 ? 'transform .18s ease' : 'none' }}
                    className="absolute left-1/2 top-1/2 -ml-[74px] -mt-[74px] w-[148px] h-[148px] rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-2xl p-4 flex flex-col items-center justify-center text-center touch-none"
                  >
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--primary)] mb-1.5">{tr('gtd.triageCard')}</div>
                    <div className="text-[14px] font-extrabold text-[var(--text)] leading-tight line-clamp-3">{triageTask.title}</div>
                    <div className="mt-2 flex flex-wrap justify-center gap-1 text-[10px] text-[var(--text-dim)]">
                      <span>P{triageTask.priority}</span>
                      {triageTask.context && <span>{triageTask.context}</span>}
                      {triageTask.durationMinutes && <span>{triageTask.durationMinutes}m</span>}
                    </div>
                  </div>
                )}
                <AnimatePresence>
                  {triageFx && (
                    <motion.div
                      initial={{ opacity: 1, scale: 1, x: triageFx.x, y: triageFx.y, rotate: 0 }}
                      animate={{ opacity: [1, 1, 0.65, 0], scale: [1, 0.9, 1.08, 0.05], rotate: [0, -1.5, 1.5, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.64, times: [0, 0.28, 0.48, 1], ease: [0.16, 1, 0.3, 1] }}
                      className="absolute left-1/2 top-1/2 -ml-[74px] -mt-[74px] w-[148px] h-[148px] rounded-full bg-[var(--surface)] border shadow-2xl p-4 flex flex-col items-center justify-center text-center touch-none pointer-events-none z-20 overflow-visible"
                      style={{
                        borderColor: `${triageFx.color}55`,
                        boxShadow: `0 0 0 1px ${triageFx.color}33, 0 18px 55px ${triageFx.color}22`,
                      }}
                    >
                      <motion.div
                        className="absolute inset-0 rounded-full border-[3px]"
                        style={{ borderColor: `${triageFx.color}55` }}
                        initial={{ scale: 0.86, opacity: 0 }}
                        animate={{ scale: [0.86, 0.86, 2.05], opacity: [0, 0.75, 0] }}
                        transition={{ duration: 0.64, times: [0, 0.32, 1], ease: 'easeOut' }}
                      />
                      <motion.div
                        className="absolute inset-7 rounded-full"
                        style={{ background: `${triageFx.color}22` }}
                        initial={{ scale: 0.65, opacity: 0 }}
                        animate={{ scale: [0.65, 0.65, 1.7], opacity: [0, 0.95, 0] }}
                        transition={{ duration: 0.58, times: [0, 0.3, 1], ease: 'easeOut' }}
                      />
                      {Array.from({ length: 14 }, (_, i) => {
                        const angle = (Math.PI * 2 * i) / 14;
                        const distance = i % 2 === 0 ? 86 : 66;
                        return (
                          <motion.span
                            key={i}
                            className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
                            style={{ background: triageFx.color }}
                            initial={{ x: -4, y: -4, opacity: 0, scale: 0.6 }}
                            animate={{
                              x: [-4, -4, Math.cos(angle) * distance - 4],
                              y: [-4, -4, Math.sin(angle) * distance - 4],
                              opacity: [0, 1, 0],
                              scale: [0.6, 1.2, 0.35],
                            }}
                            transition={{ duration: 0.62, times: [0, 0.34, 1], ease: 'easeOut' }}
                          />
                        );
                      })}
                      <motion.div
                        className="absolute left-1/2 top-1/2 h-1.5 w-24 -ml-12 -mt-[3px] rounded-full"
                        style={{ background: triageFx.color }}
                        initial={{ opacity: 0, scaleX: 0.2, rotate: 0 }}
                        animate={{ opacity: [0, 0.8, 0], scaleX: [0.2, 1.15, 0.1], rotate: [0, 0, 8] }}
                        transition={{ duration: 0.48, times: [0, 0.42, 1], ease: 'easeOut' }}
                      />
                      <motion.div
                        className="absolute left-1/2 top-1/2 h-1.5 w-24 -ml-12 -mt-[3px] rounded-full"
                        style={{ background: triageFx.color }}
                        initial={{ opacity: 0, scaleX: 0.2, rotate: 90 }}
                        animate={{ opacity: [0, 0.75, 0], scaleX: [0.2, 1, 0.1], rotate: [90, 90, 78] }}
                        transition={{ duration: 0.48, times: [0, 0.42, 1], ease: 'easeOut' }}
                      />
                      <motion.div
                        initial={{ opacity: 1, scale: 1 }}
                        animate={{ opacity: [1, 1, 0], scale: [1, 0.96, 0.72] }}
                        transition={{ duration: 0.42, times: [0, 0.45, 1], ease: 'easeOut' }}
                        className="relative z-10"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--primary)] mb-1.5">{tr('gtd.triageCard')}</div>
                        <div className="text-[14px] font-extrabold text-[var(--text)] leading-tight line-clamp-3">{triageTask.title}</div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center max-w-md">
                <Sparkles className="w-12 h-12 text-[var(--primary)]/25 mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-[var(--text)]">{tr('gtd.triageEmpty')}</h3>
                <p className="text-[13px] text-[var(--text-dim)] mt-2">{tr('gtd.triageEmptyDesc')}</p>
                <button onClick={openSortedLists} className="mt-5 h-10 px-4 rounded-xl bg-[var(--primary)] text-white text-[12px] font-bold">{tr('gtd.sortedLists')}</button>
              </div>
            )}
          </section>
        )}

        {viewMode === 'lists' && gtdFilter === 'project' && projectGroups.length > 0 && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Folder className="w-4 h-4 text-purple-400" />
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-dim)]">{tr('gtd.projectsOverview')}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {projectGroups.map(([name, stats]) => (
                <div key={name} className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[var(--text)] truncate">{name}</div>
                      <div className="text-[11px] text-[var(--text-dim)] mt-1">
                        {tr('gtd.projectStats', { total: stats.total, next: stats.next, waiting: stats.waiting, scheduled: stats.scheduled })}
                      </div>
                    </div>
                    <span className="w-8 h-8 rounded-lg grid place-items-center bg-purple-500/10 text-purple-400 text-[12px] font-bold shrink-0">{stats.total}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {viewMode === 'lists' && selecting && (
          <div className="sticky top-0 z-20 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl flex flex-wrap items-center gap-2">
            <span className="mr-auto text-[12px] font-bold text-[var(--text)]">{tr('gtd.selectedN', { n: selectedCount })}</span>
            <button disabled={selectedCount === 0} onClick={() => runBulk('done')} className="h-8 px-3 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-bold disabled:opacity-40">{tr('gtd.proc.done')}</button>
            <button disabled={selectedCount === 0} onClick={() => runBulk('next-action')} className="h-8 px-3 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-bold disabled:opacity-40">{tr('gtd.moveNext')}</button>
            <button disabled={selectedCount === 0} onClick={() => runBulk('today')} className="h-8 px-3 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-[11px] font-bold disabled:opacity-40">{tr('gtd.focusToday')}</button>
            <button disabled={selectedCount === 0} onClick={() => runBulk('trash')} className="h-8 px-3 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-bold disabled:opacity-40">{tr('gtd.proc.trash')}</button>
          </div>
        )}

        {/* One-time swipe hint (touch devices) */}
        {viewMode === 'lists' && filtered.length > 0 && swipeHintVisible && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3 md:hidden">
            <span className="text-lg shrink-0">👉</span>
            <span className="flex-1 text-[12px] text-[var(--text-dim)]">{tr('gtd.swipeHint')}</span>
            <button onClick={dismissSwipeHint} aria-label={tr('common.close')} className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Overdue banner — one-tap reschedule (Todoist-style "roll with the punches") */}
        {viewMode === 'lists' && gtdFilter === 'today' && !selecting && (() => {
          const overdueTasks = filtered.filter(t => isOverdue(t) && t.status !== 'done');
          if (overdueTasks.length === 0) return null;
          const shiftAll = (offset: number) => {
            const d = new Date(); d.setDate(d.getDate() + offset);
            const key = format(d, 'yyyy-MM-dd');
            overdueTasks.forEach(t => useStore.getState().updateTask(t.id, { dueDate: key }));
          };
          return (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 flex flex-wrap items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="mr-auto text-[12px] font-semibold text-[var(--text)]">{tr('gtd.overdueN', { n: overdueTasks.length })}</span>
              <button onClick={() => shiftAll(0)} className="h-8 px-3 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-[11px] font-bold hover:bg-[var(--surface)]">{tr('gtd.toToday')}</button>
              <button onClick={() => shiftAll(1)} className="h-8 px-3 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-[11px] font-bold hover:bg-[var(--primary)]/20">{tr('gtd.toTomorrow')}</button>
            </div>
          );
        })()}

        {viewMode === 'lists' && gtdFilter === 'today' && filtered.length === 0 && (() => {
          const doneToday = gtdTasks.filter(t => t.status === 'done' && (t.completedAt || '').slice(0, 10) === todayStr()).length;
          if (doneToday > 0) return (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-12 text-center overflow-hidden relative">
              <motion.div initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }} className="text-5xl mb-4">🎉</motion.div>
              {[...Array(6)].map((_, i) => (
                <motion.span key={i} className="absolute text-lg" style={{ left: `${14 + i * 14}%`, top: '18%' }}
                  initial={{ y: 0, opacity: 0 }} animate={{ y: [-6, -26], opacity: [0, 1, 0] }}
                  transition={{ duration: 1.4, delay: 0.15 + i * 0.12, repeat: Infinity, repeatDelay: 2.2 }}>
                  {['✨', '🌟', '✨', '💫', '✨', '🌟'][i]}
                </motion.span>
              ))}
              <h3 className="text-[16px] font-bold text-[var(--text)] mb-1">{tr('gtd.allDoneTitle')}</h3>
              <p className="text-[13px] text-[var(--text-dim)]">{tr('gtd.allDoneDesc', { n: doneToday })}</p>
            </motion.div>
          );
          return (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
              <Sun className="w-12 h-12 text-amber-500/20 mx-auto mb-4" />
              <h3 className="text-[16px] font-medium text-[var(--text)] mb-1">{tr('gtd.noFocusToday')}</h3>
              <p className="text-[13px] text-[var(--text-dim)]">{tr('gtd.noFocusDesc')}</p>
            </div>
          );
        })()}

        {viewMode === 'lists' && <div className={gtdFilter === 'reference' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>
          <AnimatePresence mode="popLayout" initial={false}>
          {filtered.map((task, idx) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
            {gtdFilter === 'scheduled' && (idx === 0 || taskDateKey(task) !== taskDateKey(filtered[idx - 1])) && (
              <div className="flex items-center gap-2 pt-2 pb-3 first:pt-0">
                <span className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{dateGroupLabel(taskDateKey(task))}</span>
                <span className="flex-1 h-px bg-[var(--border)]" />
              </div>
            )}
            {/* inner div keeps native HTML5 drag (motion would swallow onDragStart/End) */}
            <div
              draggable={!selecting}
              onDragStart={(e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); if (dragId !== task.id) setOverId(task.id); }}
              onDragEnd={() => { if (dragId && overId && dragId !== overId) reorderTasks(dragId, overId); setDragId(null); setOverId(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== task.id) reorderTasks(dragId, task.id); setDragId(null); setOverId(null); }}
              className={`transition-all cursor-grab active:cursor-grabbing ${overId === task.id && dragId !== task.id ? 'ring-2 ring-[var(--primary)]/50 -translate-y-1 scale-[1.01]' : ''}`}
            >
              {gtdFilter === 'reference' && !selecting ? (
                <div className="card p-5 h-full flex flex-col hover:border-[var(--border)] transition-all bg-[var(--surface)]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-teal-400">
                      <BookOpen className="w-4 h-4"/>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('gtd.referenceCard')}</span>
                  </div>
                  <h4 className="text-[15px] font-bold text-[var(--text)] mb-2">{task.title}</h4>
                  <p className="text-[12px] text-[var(--text-dim)] leading-relaxed mb-4 flex-1">{task.notes || tr('gtd.noDescription')}</p>
                  <div className="flex items-center gap-2 pt-3 border-t border-[var(--surface-2)]">
                    {(task.tags || []).map(t => <span key={t} className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[11px] text-[var(--text-dim)] uppercase font-bold">#{t}</span>)}
                    <button onClick={() => useStore.getState().openEditTask(task.id)} className="ml-auto text-[10px] font-bold text-[var(--primary)] hover:text-[var(--primary)] uppercase">{tr('gtd.editInfo')}</button>
                  </div>
                </div>
              ) : (
                <TaskCard task={task} selecting={selecting} selected={selectedIds.includes(task.id)} onSelect={() => toggleSelected(task.id)} />
              )}
            </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>}

        {viewMode === 'lists' && filtered.length === 0 && gtdFilter !== 'today' && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center mt-8">
            <div className="text-4xl mb-3 opacity-50">{gtdFilter === 'inbox' ? '🎉' : '📭'}</div>
            <h3 className="text-[16px] font-medium text-[var(--text)] mb-1">
              {gtdFilter === 'inbox' ? tr('gtd.inboxZero') : tr('gtd.listEmpty')}
            </h3>
            <p className="text-[13px] text-[var(--text-dim)]">
              {gtdFilter === 'inbox' ? tr('gtd.inboxZeroDesc') : tr('gtd.noMatch')}
            </p>
          </div>
        )}

        {/* Completed section */}
        {viewMode === 'lists' && gtdFilter === 'done' && doneTasks.length > 0 && (
          <details className="group mt-8">
            <summary className="flex items-center gap-2 py-3 cursor-pointer text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] list-none border-t border-[var(--surface-2)]">
              <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
              {tr('gtd.completedCount',{n:doneTasks.length})}
            </summary>
            <div className="mt-4 space-y-2 opacity-60">
              {doneTasks.slice(0, 5).map(t => <TaskCard key={t.id} task={t} compact />)}
            </div>
          </details>
        )}
      </div>

      {/* Modals & Widgets */}
      <EditTaskModal />
      <WeeklyReviewModal />
      <DoTaskModal />
    </div>
  );
}

// ─── Do Task (Focus Execution) Modal ──────────────────────────────────────────
const TIMER_PRESETS = [20, 30, 60] as const;

function DoTaskModal() {
  const tr = useT();
  const { doingTaskId, gtdTasks, setDoingTask, toggleSubtask, startTimer } = useStore();
  const [mode, setMode] = useState<'choose' | 'countdown' | 'stopwatch'>('choose');
  const [minutes, setMinutes] = useState(30);

  useEffect(() => {
    setMode('choose');
    setMinutes(30);
  }, [doingTaskId]);

  if (!doingTaskId) return null;
  const task = gtdTasks.find(t => t.id === doingTaskId);
  if (!task) return null;

  const subDone = (task.subtasks || []).filter(st => st.done).length;
  const subTotal = (task.subtasks || []).length;

  const startFocus = () => {
    ensureWebNotifPermission();
    startTimer({
      mode: mode === 'stopwatch' ? 'stopwatch' : 'countdown',
      targetMinutes: mode === 'stopwatch' ? 1 : minutes,
      linkType: 'task',
      linkId: task.id,
      label: task.title,
    });
    setDoingTask(null);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[var(--surface-2)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            <Target className="w-3.5 h-3.5" /> {tr('gtd.focusMode')}
          </div>
          <button onClick={() => setDoingTask(null)} className="text-[var(--text-dim)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
        </div>

        {/* Task summary */}
        <div className="p-6 text-center border-b border-[var(--surface-2)]">
          <div className="mb-2 flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[task.priority]?.dot}`} />
            <span className="text-[11px] text-[var(--text-dim)]">{PRIORITY_CONFIG[task.priority]?.label} · {task.context || '@anywhere'} · ~{task.durationMinutes || 25}{tr('common.minShort')}</span>
          </div>
          <h2 className="text-[22px] font-bold text-[var(--text)] leading-tight px-4">{task.title}</h2>
          {task.notes && <p className="text-[12px] text-[var(--text-dim)] mt-2 px-4">{task.notes}</p>}
        </div>

        {/* Mode chooser */}
        <div className="p-4">
          {mode === 'choose' ? (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('countdown')} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--primary)] transition-colors">
                <Hourglass className="w-5 h-5 text-[var(--primary)] mb-3" />
                <div className="text-[15px] font-bold text-[var(--text)]">{tr('timer.modeTimer')}</div>
                <div className="text-[12px] text-[var(--text-dim)] mt-1">Set a time and start.</div>
              </button>
              <button onClick={() => setMode('stopwatch')} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--primary)] transition-colors">
                <Timer className="w-5 h-5 text-[var(--primary)] mb-3" />
                <div className="text-[15px] font-bold text-[var(--text)]">{tr('timer.modeStopwatch')}</div>
                <div className="text-[12px] text-[var(--text-dim)] mt-1">Just run it and track time forward.</div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {mode === 'countdown' ? (
                <div>
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <button onClick={() => setMinutes(v => Math.max(5, v - 5))} className="w-11 h-11 rounded-2xl grid place-items-center bg-[var(--surface-2)] text-[var(--text)] active:scale-90 transition-transform"><Minus className="w-5 h-5" /></button>
                    <div className="text-center min-w-[88px]">
                      <div className="text-[34px] font-bold text-[var(--text)] mono leading-none tabular-nums">{minutes}</div>
                      <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mt-1">{tr('timer.minutes')}</div>
                    </div>
                    <button onClick={() => setMinutes(v => Math.min(180, v + 5))} className="w-11 h-11 rounded-2xl grid place-items-center bg-[var(--surface-2)] text-[var(--text)] active:scale-90 transition-transform"><Plus className="w-5 h-5" /></button>
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {TIMER_PRESETS.map((p) => (
                      <button key={p} onClick={() => setMinutes(p)}
                        className={`h-8 px-4 rounded-full text-[12px] font-bold transition-colors ${minutes === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}>{p}m</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4 text-center">
                  <Timer className="w-7 h-7 mx-auto text-[var(--primary)] mb-2" />
                  <div className="text-[14px] font-bold text-[var(--text)]">{tr('timer.modeStopwatch')}</div>
                  <div className="text-[12px] text-[var(--text-dim)] mt-1">Counts forward until you stop it.</div>
                </div>
              )}
            </div>
          )}

          {/* Subtasks checklist */}
          {subTotal > 0 && (
            <div className="text-left bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 mb-2">
              <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-3">{tr('gtd.checklist',{done:subDone,total:subTotal})}</div>
              <div className="space-y-2">
                {task.subtasks!.map(st => (
                  <button key={st.id} onClick={() => toggleSubtask(task.id, st.id)} className="flex items-center gap-2.5 w-full text-left">
                    {st.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 text-[var(--border)] shrink-0" />}
                    <span className={`text-[13px] ${st.done ? 'line-through text-[var(--text-dim)]' : 'text-[var(--text)]'}`}>{st.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[var(--surface-2)] flex gap-2">
          <button onClick={() => { setDoingTask(null); }} className="flex-1 h-11 rounded-xl border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)]">{tr('gtd.pauseExit')}</button>
          <button onClick={() => setMode('choose')} className={`h-11 px-4 rounded-xl bg-[var(--surface-2)] text-[12px] text-[var(--text)] font-bold hover:bg-[var(--border)] flex items-center gap-1.5 ${mode === 'choose' ? 'opacity-40 pointer-events-none' : ''}`}>
            <Timer className="w-4 h-4" />{tr('common.back')}
          </button>
          <button onClick={startFocus} disabled={mode === 'choose'} className="flex-1 h-11 rounded-xl bg-emerald-500 text-black text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
            <Check className="w-4 h-4" />Start
          </button>
        </div>
      </div>
    </div>
  );
}
