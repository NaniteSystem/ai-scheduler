import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useT } from '../i18n';
import type { GTDTask, GTDStatus, Priority, TaskContext, RecurringPattern } from '../types';
import { Drawer } from './ui/Drawer';
import {
  Inbox, Zap, Folder, Users, Cloud, Trash2, Plus, Search,
  X, Check, Clock, ChevronRight, ChevronDown, Edit2,
  Wifi, Phone, Home, ShoppingCart,
  Timer, Circle, CheckCircle2, Calendar, Play, GripVertical,
  Sun, Sparkles, BookOpen, Layers, Target, Repeat, Bell
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

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
  project:       { label: 'gtd.status.project',       icon: Folder,     color: '#a855f7', desc: 'gtd.status.projectDesc' },
  'waiting-for': { label: 'gtd.status.waiting-for',   icon: Users,      color: '#f97316', desc: 'gtd.status.waiting-forDesc' },
  scheduled:     { label: 'gtd.status.scheduled',     icon: Calendar,   color: '#3b82f6', desc: 'gtd.status.scheduledDesc' },
  'someday-maybe':{ label: 'gtd.status.someday-maybe', icon: Cloud,      color: '#64748b', desc: 'gtd.status.someday-maybeDesc' },
  reference:     { label: 'gtd.status.reference',     icon: BookOpen,   color: '#14b8a6', desc: 'gtd.status.referenceDesc' },
  done:          { label: 'gtd.status.done',          icon: CheckCircle2,color: '#22c55e', desc: 'gtd.status.doneDesc' },
  trash:         { label: 'gtd.status.trash',         icon: Trash2,     color: '#ef4444', desc: 'gtd.status.trashDesc' },
};

// ─── Natural Language Parser (lightweight) ─────────────────────────────────
function parseNL(input: string): { title: string; priority?: Priority; context?: TaskContext; durationMinutes?: number; tags?: string[] } {
  let title = input;
  let priority: Priority | undefined;
  let context: TaskContext | undefined;
  let durationMinutes: number | undefined;
  let tags: string[] = [];

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

  return { title: title.trim() || input, priority, context, durationMinutes, tags };
}

// ─── Task Card ───────────────────────────────────────────────────────────────
function TaskCard({ task, compact = false }: { task: GTDTask; compact?: boolean }) {
  const tr = useT();
  const { processTask, deleteTask, toggleTodayFocus, openEditTask, openTimerLauncher, setDoingTask, scheduleFromTask } = useStore();
  const [expanded, setExpanded] = useState(false);
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4];
  const ctx = task.context ? CONTEXT_CONFIG[task.context] : null;
  const isDue = task.dueDate && isPast(parseISO(task.dueDate)) && task.status !== 'done';
  const isTodayDue = task.dueDate && isToday(parseISO(task.dueDate));
  const isTomorrowDue = task.dueDate && isTomorrow(parseISO(task.dueDate));

  // ── Mobile swipe: right = complete, left = delete ──
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const SWIPE_TRIGGER = 80;
  const swipeEnabled = !compact && task.status !== 'done';

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
      if (dx > SWIPE_TRIGGER) processTask(task.id, 'done');
      else if (dx < -SWIPE_TRIGGER) deleteTask(task.id);
    }
    start.current = null; axis.current = null; setDx(0);
  };

  return (
   <div className="relative rounded-xl overflow-hidden">
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
      style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform .2s ease' : 'none' }}
      className={`group relative border rounded-xl ${
        task.status === 'done'
          ? 'border-[var(--border)] bg-[#080808] opacity-50'
          : isDue
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]'
      }`}
    >
      <div className={`flex items-start gap-3 ${compact ? 'p-3' : 'p-4'}`}>
        {/* Checkbox */}
        <button
          onClick={() => processTask(task.id, task.status === 'done' ? 'next-action' : 'done')}
          className="mt-0.5 shrink-0 transition-transform hover:scale-110"
        >
          {task.status === 'done'
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <Circle className="w-4 h-4 text-[var(--border)] group-hover:text-[#555]" />
          }
        </button>

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
          <div className="flex items-center gap-1 hover-actions">
          <button
            onClick={() => toggleTodayFocus(task.id)}
            title={tr('gtd.focusToday')}
            className={`w-6 h-6 rounded-md grid place-items-center transition-colors ${task.isTodayFocus ? 'text-amber-400' : 'text-[var(--border)] hover:text-amber-400'}`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openTimerLauncher({ linkType: 'task', linkId: task.id, label: task.title })}
            title={tr('gtd.startPomodoro')}
            className="w-6 h-6 rounded-md grid place-items-center text-[var(--border)] hover:text-red-400 transition-colors"
          >
            <Timer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => openEditTask(task.id)}
            className="w-6 h-6 rounded-md grid place-items-center text-[var(--border)] hover:text-[var(--text)] transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => deleteTask(task.id)}
            className="w-6 h-6 rounded-md grid place-items-center text-[var(--border)] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
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
            <button onClick={() => processTask(task.id, 'next-action')} className="h-7 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 transition-colors">{tr('gtd.proc.nextAction')}</button>
            <button onClick={() => processTask(task.id, 'project')} className="h-7 px-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-[var(--primary)] text-[10px] font-bold hover:bg-[var(--primary)]/20 transition-colors">{tr('gtd.proc.project')}</button>
            <button onClick={() => processTask(task.id, 'waiting-for')} className="h-7 px-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-bold hover:bg-orange-500/20 transition-colors">{tr('gtd.proc.delegate')}</button>
            <button onClick={() => { processTask(task.id, 'scheduled'); scheduleFromTask(task.title, task.durationMinutes || 60); }} className="h-7 px-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-colors">{tr('gtd.proc.schedule')}</button>
            <button onClick={() => processTask(task.id, 'someday-maybe')} className="h-7 px-3 rounded-lg bg-[var(--border)] border border-[var(--border)] text-[var(--text-dim)] text-[10px] hover:text-[var(--text)] transition-colors">{tr('gtd.proc.someday')}</button>
            <button onClick={() => processTask(task.id, 'reference')} className="h-7 px-3 rounded-lg bg-[var(--border)] border border-[var(--border)] text-[var(--text-dim)] text-[10px] hover:text-[var(--text)] transition-colors">{tr('gtd.proc.reference')}</button>
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
    setHint(hints.join(' · '));
  };

  const submit = () => {
    if (!input.trim()) return;
    const parsed = parseNL(input);
    const store = useStore.getState();
    store.captureTask(parsed.title, parsed.durationMinutes || 5);
    if (parsed.priority || parsed.context || parsed.tags?.length) {
      // Re-read state: captureTask created a new task, prepended to the list.
      const newId = useStore.getState().gtdTasks[0]?.id;
      if (newId) {
        store.updateTask(newId, {
          priority: parsed.priority || 3,
          context: parsed.context,
          tags: parsed.tags || [],
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
  const [recurring, setRecurring] = useState<RecurringPattern | ''>(task.recurring || '');
  const [remindAt, setRemindAt] = useState(task.remindAt ? task.remindAt.slice(0, 16) : '');

  const save = () => {
    updateTask(task.id, { title, notes, dueDate: dueDate || undefined, priority, context: context as TaskContext || undefined, durationMinutes: duration || undefined, energyLevel: energy as any, delegateTo: delegateTo || undefined, subtasks, recurring: recurring || undefined, remindAt: remindAt || undefined });
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
              <select value={status} onChange={e => setStatus(e.target.value as GTDStatus)} className="w-full h-7 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none">
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'trash').map(([k,v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Due Date + Duration + Context */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.dueDate')}</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.durationMin')}</label>
              <input type="number" value={duration||''} onChange={e => setDuration(Number(e.target.value))} placeholder="30" className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">{tr('gtd.context')}</label>
              <select value={context} onChange={e => setContext(e.target.value as TaskContext)} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none">
                <option value="">{tr('gtd.none')}</option>
                {Object.entries(CONTEXT_CONFIG).map(([k,v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </select>
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
              <select value={recurring} onChange={e => setRecurring(e.target.value as RecurringPattern | '')} className="w-full h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text)] px-2 focus:outline-none">
                <option value="">{tr('gtd.repeatNone')}</option>
                <option value="daily">{tr('gtd.repeatDaily')}</option>
                <option value="weekdays">{tr('gtd.repeatWeekdays')}</option>
                <option value="weekly">{tr('gtd.repeatWeekly')}</option>
                <option value="monthly">{tr('gtd.repeatMonthly')}</option>
              </select>
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

function Ring({ pct, size=80, stroke=5, color='#22c55e', children }: { pct:number; size?:number; stroke?:number; color?:string; children?:React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="progress-ring" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
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
// Bucket tabs shown inside the GTD Inbox view (replaces the old sidebar "GTD Lists" section).
const BUCKET_TABS: { id: string; label: string; icon: any; color: string }[] = [
  { id: 'today',         label: 'gtd.todayBucket',        icon: Sun,         color: '#f59e0b' },
  { id: 'inbox',         label: 'gtd.status.inbox',        icon: Inbox,       color: '#22c55e' },
  { id: 'next-action',   label: 'gtd.status.next-action', icon: Zap,         color: '#eab308' },
  { id: 'project',       label: 'gtd.status.project',     icon: Folder,      color: '#a855f7' },
  { id: 'waiting-for',   label: 'gtd.status.waiting-for', icon: Users,       color: '#f97316' },
  { id: 'scheduled',     label: 'gtd.status.scheduled',   icon: Calendar,    color: '#3b82f6' },
  { id: 'someday-maybe', label: 'gtd.status.someday-maybe', icon: Cloud,     color: '#64748b' },
  { id: 'reference',     label: 'gtd.status.reference',   icon: BookOpen,    color: '#14b8a6' },
  { id: 'all',           label: 'gtd.allBucket',          icon: Layers,      color: 'var(--text-mute)' },
  { id: 'done',          label: 'gtd.status.done',        icon: CheckCircle2,color: '#22c55e' },
];

export function GTDView() {
  const tr = useT();
  const {
    gtdTasks, gtdFilter, setGTDFilter, activeContext, setActiveContext,
    searchQuery, setSearchQuery, reorderTasks,
  } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'created'>('priority');

  const allContexts = ['all', ...Object.keys(CONTEXT_CONFIG)];

  // Count helper for the bucket tabs
  const bucketCount = (id: string) => {
    if (id === 'today') return gtdTasks.filter(t => (t.isTodayFocus || (t.dueDate && isToday(parseISO(t.dueDate)))) && t.status !== 'done').length;
    if (id === 'all') return gtdTasks.filter(t => t.status !== 'done' && t.status !== 'trash').length;
    return gtdTasks.filter(t => t.status === id).length;
  };

  // ── Filtered tasks ────────────────────────────────────────────────────────
  const filtered = gtdTasks
    .filter(t => t.status !== 'trash' && t.status !== 'done' || gtdFilter === 'done' || gtdFilter === 'trash')
    .filter(t => {
      if (gtdFilter === 'today') return t.isTodayFocus || (t.dueDate && isToday(parseISO(t.dueDate)));
      if (gtdFilter === 'all') return t.status !== 'done' && t.status !== 'trash';
      return t.status === gtdFilter;
    })
    .filter(t => activeContext === 'all' || t.context === activeContext)
    .filter(t => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t.tags || []).some(tag => tag.includes(searchQuery.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === 'priority') return a.priority - b.priority;
      if (sortBy === 'due') {
        if (!a.dueDate) return 1; if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const doneTasks = gtdTasks.filter(t => t.status === 'done');
  const todayFocusTasks = gtdTasks.filter(t => t.isTodayFocus && t.status !== 'done');
  const statusConf = STATUS_CONFIG[gtdFilter as GTDStatus] || { label: 'gtd.allTasks', icon: Layers, color: 'var(--text-mute)', desc: '' };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg)]">
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6 border-b border-[var(--surface-2)] shrink-0 bg-[var(--bg)]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="display text-[24px] md:text-[32px] text-[var(--text)]">
              {gtdFilter === 'today' ? tr('gtd.todaysFocus') : tr(statusConf.label)}
            </h1>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] text-[12px] text-[var(--text-dim)] font-medium border border-[var(--border)]">
              {tr('gtd.tasksCount',{n:filtered.length})}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[12px] text-[var(--text)] px-3 focus:outline-none hover:border-[var(--border)] transition-colors">
              <option value="priority">{tr('gtd.sortPriority')}</option>
              <option value="due">{tr('gtd.sortDue')}</option>
              <option value="created">{tr('gtd.sortCreated')}</option>
            </select>
          </div>
        </div>

        {/* Bucket tabs (GTD lists) */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
          {BUCKET_TABS.map(b => {
            const Ic = b.icon;
            const a = gtdFilter === b.id;
            const cnt = bucketCount(b.id);
            return (
              <button key={b.id} onClick={() => setGTDFilter(b.id)}
                className={`h-9 px-3 rounded-xl text-[12px] font-medium flex items-center gap-2 shrink-0 border transition-all ${a ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}>
                <Ic className="w-3.5 h-3.5" style={{ color: a ? b.color : undefined }} />
                {tr(b.label)}
                {cnt > 0 && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: a ? b.color : 'var(--text-mute)', background: a ? `${b.color}20` : 'var(--surface-2)' }}>{cnt}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Search */}
          <div className="w-full sm:flex-1 sm:max-w-md flex items-center gap-2 h-10 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 focus-within:border-[var(--border)] transition-colors">
            <Search className="w-4 h-4 text-[var(--text-dim)]" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={tr('gtd.searchPlaceholder')} className="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-[var(--text-dim)] hover:text-[var(--text)]"><X className="w-3.5 h-3.5" /></button>}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0">
            <div className="h-6 w-px bg-[var(--border)] hidden sm:block" />
            {allContexts.slice(0, 4).map(c => {
              const conf = c !== 'all' ? CONTEXT_CONFIG[c] : null;
              const a = activeContext === c;
              return (
                <button key={c} onClick={() => setActiveContext(c)} className={`h-8 px-3 rounded-lg text-[11px] font-medium border transition-all shrink-0 ${a ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}`}
                  style={a && conf ? { color: conf.color } : {}}>
                  {c === 'all' ? tr('gtd.allContexts') : tr(conf?.label || '')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 max-w-5xl mx-auto w-full space-y-4">
        <QuickCaptureBar />

        {gtdFilter === 'today' && todayFocusTasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <Sun className="w-12 h-12 text-amber-500/20 mx-auto mb-4" />
            <h3 className="text-[16px] font-medium text-[var(--text)] mb-1">{tr('gtd.noFocusToday')}</h3>
            <p className="text-[13px] text-[var(--text-dim)]">{tr('gtd.noFocusDesc')}</p>
          </div>
        )}

        <div className={gtdFilter === 'reference' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>
          <AnimatePresence mode="popLayout" initial={false}>
          {filtered.map(task => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
            {/* inner div keeps native HTML5 drag (motion would swallow onDragStart/End) */}
            <div
              draggable
              onDragStart={(e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); if (dragId !== task.id) setOverId(task.id); }}
              onDragEnd={() => { if (dragId && overId && dragId !== overId) reorderTasks(dragId, overId); setDragId(null); setOverId(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== task.id) reorderTasks(dragId, task.id); setDragId(null); setOverId(null); }}
              className={`transition-all cursor-grab active:cursor-grabbing ${overId === task.id && dragId !== task.id ? 'ring-2 ring-[var(--primary)]/50 -translate-y-1 scale-[1.01]' : ''}`}
            >
              {gtdFilter === 'reference' ? (
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
                <TaskCard task={task} />
              )}
            </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && gtdFilter !== 'today' && (
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
        {gtdFilter === 'all' && doneTasks.length > 0 && (
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
function DoTaskModal() {
  const tr = useT();
  const { doingTaskId, gtdTasks, setDoingTask, processTask, toggleSubtask, openTimerLauncher } = useStore();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => { setElapsed(0); setRunning(true); }, [doingTaskId]);
  useEffect(() => {
    if (!running || !doingTaskId) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running, doingTaskId]);

  if (!doingTaskId) return null;
  const task = gtdTasks.find(t => t.id === doingTaskId);
  if (!task) return null;

  const m = Math.floor(elapsed / 60), s = elapsed % 60;
  const estMin = task.durationMinutes || 25;
  const progress = Math.min(100, (elapsed / (estMin * 60)) * 100);
  const subDone = (task.subtasks || []).filter(st => st.done).length;
  const subTotal = (task.subtasks || []).length;

  const complete = () => { processTask(task.id, 'done'); setDoingTask(null); };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[var(--surface-2)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            <Target className="w-3.5 h-3.5" /> {tr('gtd.focusMode')}
          </div>
          <button onClick={() => setDoingTask(null)} className="text-[var(--text-dim)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
        </div>

        {/* Task & timer */}
        <div className="p-8 text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[task.priority]?.dot}`} />
            <span className="text-[11px] text-[var(--text-dim)]">{PRIORITY_CONFIG[task.priority]?.label} · {task.context || '@anywhere'} · ~{estMin}{tr('common.minShort')}</span>
          </div>
          <h2 className="text-[22px] font-bold text-[var(--text)] leading-tight px-4">{task.title}</h2>
          {task.notes && <p className="text-[12px] text-[var(--text-dim)] mt-2 px-4">{task.notes}</p>}

          {/* Big timer */}
          <div className="my-8 flex flex-col items-center">
            <div className="relative">
              <Ring pct={progress} size={160} stroke={8} color={progress >= 100 ? '#22c55e' : '#8b5cf6'}>
                <div className="text-center">
                  <div className="text-[42px] font-bold text-[var(--text)] mono leading-none">{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}</div>
                  <div className="text-[10px] text-[var(--text-dim)] mt-1">{progress >= 100 ? tr('gtd.timesUp') : tr('gtd.ofTime',{t:`${estMin}:00`})}</div>
                </div>
              </Ring>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setRunning(r => !r)} className="h-10 px-5 rounded-xl bg-[var(--surface-2)] text-[var(--text)] text-[12px] font-bold flex items-center gap-2 hover:bg-[var(--border)]">
                {running ? <><Timer className="w-4 h-4" />{tr('gtd.pause')}</> : <><Timer className="w-4 h-4" />{tr('gtd.resume')}</>}
              </button>
            </div>
          </div>

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
          <button onClick={() => { openTimerLauncher({ linkType: 'task', linkId: task.id, label: task.title }); setDoingTask(null); }} className="h-11 px-4 rounded-xl bg-[var(--surface-2)] text-[12px] text-[var(--primary)] font-bold hover:bg-[var(--border)] flex items-center gap-1.5"><Timer className="w-4 h-4" />{tr('gtd.pomodoro')}</button>
          <button onClick={complete} className="flex-1 h-11 rounded-xl bg-emerald-500 text-black text-[12px] font-bold flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />{tr('gtd.completeTask')}</button>
        </div>
      </div>
    </div>
  );
}
