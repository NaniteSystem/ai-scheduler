import { useState, useRef, useCallback, useEffect } from 'react';
import { useBackClose } from '../hooks/useHardwareBack';
import { format, isToday, isPast, isSameDay, addDays, addMonths, addYears, startOfMonth, endOfMonth, startOfWeek, getYear, getMonth, differenceInCalendarWeeks, differenceInCalendarDays, parseISO, isSameMonth, addWeeks } from 'date-fns';
import { useT, useDateLocale } from '../i18n';
import type { Session, Goal, SessionType, RecurringPattern } from '../types';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, X, Repeat, Clock, Target, CalendarDays, Bell, MapPin, Link as LinkIcon, Check } from 'lucide-react';
import { TimePicker } from './ui/TimePicker';
import { DatePicker } from './ui/DatePicker';
import { IconPicker, SessionIcon } from './ui/IconPicker';
import { fmtDur } from '../utils/duration';
import { WeekGrid } from './WeekGrid';

const HOUR_H = 52; // px per hour (taller rows → bigger, easier-to-tap blocks; labels every 2h)
const SLOT = 15;   // snap to 15 min
const DEFAULT_START_H = 7;
const DEFAULT_END_H = 23;

function snapTo15(minutes: number) {
  return Math.round(minutes / SLOT) * SLOT;
}

function minToTime(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const LEGACY_LINKED_NOTES = new Set([
  'Linked session. Drag to reschedule.',
  'Связанная сессия. Перетащите, чтобы перенести.',
  'リンクされたセッション。ドラッグして予定を変更できます。',
]);

function cleanSessionNote(note?: string) {
  const value = (note || '').trim();
  return LEGACY_LINKED_NOTES.has(value) ? '' : value;
}

interface Props {
  ws: Date;
  days: Date[];
  sessions: Session[];
  goals: Goal[];
  weekOffset: number;
  store: any;
  goalColor: (id: string) => string;
  goalEmoji: (id: string) => string;
}

interface Draft {
  title: string;
  goalId: string;
  dayIdx: number;
  date?: string;           // explicit yyyy-MM-dd (used by Day view); overrides dayIdx
  startMin: number;        // minutes from 00:00
  durationMinutes: number;
  sessionType: SessionType;
  recurrence: RecurringPattern | 'none';
  weekdays: number[];      // selected weekdays (0 Sun..6 Sat) for 'custom' recurrence
  // calendar-style extras
  color?: string;          // custom color override
  icon?: string;           // custom icon key
  sourceId?: string;       // id of an unscheduled backlog session to move (instead of copy)
  sourceTaskId?: string;   // GTD task that requested calendar scheduling
  editId?: string;         // id of an existing session being edited (update in place instead of create)
  allDay: boolean;
  spanDays: number;        // 1 = single day; >1 creates linked instances across consecutive days
  reminderMinutes: number; // -1 = none
  location: string;
  url: string;
  description: string;
}

// Defaults applied to every freshly-opened draft.
export const DRAFT_DEFAULTS = { allDay: false, spanDays: 1, reminderMinutes: -1, location: '', url: '', description: '', weekdays: [] as number[] };

// Curated, harmonious palette (warm → cool → neutral), each with a soft gradient pair for depth.
const PALETTE: { c: string; from: string; to: string }[] = [
  { c: '#f43f5e', from: '#fb7185', to: '#e11d48' }, // rose
  { c: '#ef4444', from: '#f87171', to: '#dc2626' }, // red
  { c: '#f97316', from: '#fb923c', to: '#ea580c' }, // orange
  { c: '#f59e0b', from: '#fbbf24', to: '#d97706' }, // amber
  { c: '#eab308', from: '#facc15', to: '#ca8a04' }, // yellow
  { c: '#84cc16', from: '#a3e635', to: '#65a30d' }, // lime
  { c: '#22c55e', from: '#4ade80', to: '#16a34a' }, // green
  { c: '#10b981', from: '#34d399', to: '#059669' }, // emerald
  { c: '#14b8a6', from: '#2dd4bf', to: '#0d9488' }, // teal
  { c: '#06b6d4', from: '#22d3ee', to: '#0891b2' }, // cyan
  { c: '#3b82f6', from: '#60a5fa', to: '#2563eb' }, // blue
  { c: '#6366f1', from: '#818cf8', to: '#4f46e5' }, // indigo
  { c: '#8b5cf6', from: '#a78bfa', to: '#7c3aed' }, // violet
  { c: '#a855f7', from: '#c084fc', to: '#9333ea' }, // purple
  { c: '#ec4899', from: '#f472b6', to: '#db2777' }, // pink
  { c: '#64748b', from: '#94a3b8', to: '#475569' }, // slate
];
// label values are i18n keys — translate at render with t(...)
const REMINDER_OPTS: { v: number; label: string }[] = [
  { v: -1, label: 'sched.rem.none' }, { v: 0, label: 'sched.rem.now' }, { v: 5, label: 'sched.rem.m5' },
  { v: 10, label: 'sched.rem.m10' }, { v: 30, label: 'sched.rem.m30' }, { v: 60, label: 'sched.rem.h1' }, { v: 1440, label: 'sched.rem.d1' },
];

type ViewMode = 'day' | 'week' | 'month' | 'year';
const MODE_LABELS: { id: ViewMode; label: string }[] = [
  { id: 'day', label: 'sched.mode.day' },
  { id: 'week', label: 'sched.mode.week' },
  { id: 'month', label: 'sched.mode.month' },
  { id: 'year', label: 'sched.mode.year' },
];

const REPEAT_OPTS: { id: RecurringPattern | 'none'; label: string }[] = [
  { id: 'none', label: 'sched.rep.none' },
  { id: 'daily', label: 'sched.rep.daily' },
  { id: 'weekdays', label: 'sched.rep.weekdays' },
  { id: 'weekends', label: 'sched.rep.weekends' },
  { id: 'weekly', label: 'sched.rep.weekly' },
  { id: 'custom', label: 'sched.rep.custom' },
];

// Weekday picker, Monday-first; value is JS getDay() (0 Sun..6 Sat). Labels come from date-fns locale at render.
const WEEKDAY_PICKER: { v: number }[] = [
  { v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }, { v: 6 }, { v: 0 },
];

const TYPE_OPTS: { id: SessionType; label: string }[] = [
  { id: 'regular', label: 'sched.type.regular' },
  { id: 'intensive', label: 'sched.type.intensive' },
  { id: 'checkpoint', label: 'sched.type.checkpoint' },
];

const DUR_PRESETS = [15, 30, 45, 60, 90, 120];

// Build list of dates for a recurrence over the next `weeksAhead` weeks.
// `weekdays` (0 Sun..6 Sat) is used only by the 'custom' pattern.
function expandRecurrence(base: Date, pattern: RecurringPattern | 'none', weekdays: number[] = [], weeksAhead = 8): Date[] {
  if (pattern === 'none') return [base];
  const out: Date[] = [];
  const horizon = weeksAhead * 7;
  if (pattern === 'weekly') {
    for (let w = 0; w < weeksAhead; w++) out.push(addDays(base, w * 7));
    return out;
  }
  if (pattern === 'custom') {
    if (!weekdays.length) return [base];
    for (let i = 0; i < horizon; i++) {
      const d = addDays(base, i);
      if (weekdays.includes(d.getDay())) out.push(d);
    }
    return out.length ? out : [base];
  }
  for (let i = 0; i < horizon; i++) {
    const d = addDays(base, i);
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    if (pattern === 'daily') out.push(d);
    else if (pattern === 'weekdays' && dow >= 1 && dow <= 5) out.push(d);
    else if (pattern === 'weekends' && (dow === 0 || dow === 6)) out.push(d);
  }
  return out;
}

// Side-by-side layout for overlapping timed sessions (Google-Calendar style).
// Returns id → { col, cols }: column index and total columns in its overlap cluster.
function layoutDay(items: Session[]): Record<string, { col: number; cols: number }> {
  const ev = items
    .map(s => ({ id: s.id, start: s.startHour * 60 + (s.startMinute || 0), end: s.startHour * 60 + (s.startMinute || 0) + s.durationMinutes }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const colEnd: number[] = [];
  const col: Record<string, number> = {};
  for (const e of ev) {
    let c = 0;
    for (; c < colEnd.length; c++) if (colEnd[c] <= e.start) break;
    colEnd[c] = e.end;
    col[e.id] = c;
  }
  const res: Record<string, { col: number; cols: number }> = {};
  let i = 0;
  while (i < ev.length) {
    let clusterEnd = ev[i].end, j = i + 1;
    while (j < ev.length && ev[j].start < clusterEnd) { clusterEnd = Math.max(clusterEnd, ev[j].end); j++; }
    const group = ev.slice(i, j);
    const cols = Math.max(...group.map(g => col[g.id])) + 1;
    for (const g of group) res[g.id] = { col: col[g.id], cols };
    i = j;
  }
  return res;
}

export function ScheduleView({ ws, days, sessions, goals, weekOffset, store, goalColor, goalEmoji }: Props) {
  const tr = useT();
  const locale = useDateLocale();
  const monthsShort = Array.from({ length: 12 }, (_, i) => format(new Date(2020, i, 1), 'LLL', { locale }));
  const wkStart: 0 | 1 = store.schedulePrefs?.weekStartsOn ?? 1;
  const [dragSid, setDragSid] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ dayIdx: number; min: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  useBackClose(draft !== null, () => setDraft(null));
  useBackClose(budgetOpen, () => setBudgetOpen(false));
  const [mode, setMode] = useState<ViewMode>('day');
  const [dayOffset, setDayOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Live clock — re-render every 30s so the "now" line moves
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // A GTD task asked to be scheduled → open the create modal pre-filled with its title/duration.
  useEffect(() => {
    const seed = store.scheduleSeed;
    if (!seed) return;
    setMode('week');
    setDraft({ title: seed.title, goalId: seed.goalId ?? goals[0]?.id ?? '', dayIdx: 0, date: format(new Date(), 'yyyy-MM-dd'), startMin: 9 * 60, durationMinutes: seed.durationMinutes || 60, sessionType: 'regular', recurrence: 'none', sourceTaskId: seed.taskId, ...DRAFT_DEFAULTS });
    store.consumeScheduleSeed();
  }, [store.scheduleSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit an existing session → open the create modal in edit mode, pre-filled with its values.
  useEffect(() => {
    const id = store.editSessionId;
    if (!id) return;
    const s = sessions.find(x => x.id === id);
    if (!s) { store.consumeEditSession(); return; }
    setMode('week');
    setDraft({
      editId: s.id, title: s.title, goalId: s.goalId, dayIdx: 0,
      date: s.date || format(new Date(), 'yyyy-MM-dd'),
      startMin: (s.startHour || 0) * 60 + (s.startMinute || 0),
      durationMinutes: s.durationMinutes || 60,
      sessionType: s.sessionType || 'regular', recurrence: 'none',
      color: s.color || '', icon: s.icon || '',
      allDay: !!s.allDay, spanDays: 1,
      reminderMinutes: s.reminderMinutes ?? -1,
      location: s.location || '', url: s.url || '', description: cleanSessionNote(s.description),
      weekdays: [],
    });
    store.consumeEditSession();
  }, [store.editSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = now;
  const selectedDay = addDays(today, dayOffset);
  const monthDate = addMonths(today, monthOffset);
  const yearDate = addYears(today, yearOffset);

  // ── Dynamic visible hour range ──
  // Default 07:00–23:00, but expand to reveal early/late sessions (e.g. a 02:00 session
  // unhides the 23:00→07:00 night band) so nothing is ever clipped out of view.
  const gridDateStrs = (mode === 'day' ? [selectedDay] : days).map(d => format(d, 'yyyy-MM-dd'));
  let START_H = DEFAULT_START_H, END_H = DEFAULT_END_H;
  for (const s of sessions) {
    if (s.allDay || !gridDateStrs.includes(s.date)) continue;
    START_H = Math.min(START_H, s.startHour);
    END_H = Math.max(END_H, Math.ceil((s.startHour * 60 + (s.startMinute || 0) + s.durationMinutes) / 60));
  }
  START_H = Math.max(0, START_H);
  END_H = Math.min(24, END_H);
  const ROWS = Math.max(1, END_H - START_H);

  const goPrev = () => mode === 'week' ? store.setWeekOffset(weekOffset - 1) : mode === 'day' ? setDayOffset(d => d - 1) : mode === 'month' ? setMonthOffset(m => m - 1) : setYearOffset(y => y - 1);
  const goNext = () => mode === 'week' ? store.setWeekOffset(weekOffset + 1) : mode === 'day' ? setDayOffset(d => d + 1) : mode === 'month' ? setMonthOffset(m => m + 1) : setYearOffset(y => y + 1);
  const goToday = () => mode === 'week' ? store.setWeekOffset(0) : mode === 'day' ? setDayOffset(0) : mode === 'month' ? setMonthOffset(0) : setYearOffset(0);

  // Compute minute from mouse Y relative to grid
  const yToMin = useCallback((clientY: number) => {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const rel = clientY - rect.top;
    const totalMin = (rel / (ROWS * HOUR_H)) * ROWS * 60;
    return snapTo15(Math.max(0, Math.min(ROWS * 60 - SLOT, totalMin))) + START_H * 60;
  }, [ROWS, START_H]);

  // Compute day index from mouse X
  const xToDayIdx = useCallback((clientX: number) => {
    if (!gridRef.current) return 0;
    const rect = gridRef.current.getBoundingClientRect();
    const gridLeft = 56; // time column width
    const rel = clientX - rect.left - gridLeft;
    const colW = (rect.width - gridLeft) / 7;
    return Math.max(0, Math.min(6, Math.floor(rel / colW)));
  }, []);

  // ── Long-press drag / resize (touch-first; mouse drags immediately) ──
  // On touch: hold a block ~0.45s to "pick it up", then drag to move, or drag
  // from the bottom edge to resize. Moving the finger before the hold completes
  // is treated as a scroll and cancels. A plain tap still opens the session.
  const LONG_PRESS_MS = 260;
  const PRESS_CANCEL_PX = 16;
  const [pressSid, setPressSid] = useState<string | null>(null);
  const draggedRef = useRef(false);
  const pressRef = useRef<{ sid: string; startX: number; startY: number; origDur: number; origStartMin: number; kind: 'move' | 'resize'; armed: boolean; touch: boolean; timer: number; tgtDayIdx: number; tgtMin: number } | null>(null);

  const armPress = (info: NonNullable<typeof pressRef.current>, el: HTMLElement, pointerId: number) => {
    info.armed = true;
    setPressSid(info.sid);
    try { el.setPointerCapture(pointerId); } catch { /* noop */ }
    if (info.touch && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
    if (info.kind === 'move') { setDragSid(info.sid); setGhostPos({ dayIdx: info.tgtDayIdx, min: info.tgtMin }); }
  };

  const onBlockPointerDown = (e: React.PointerEvent, s: Session) => {
    if (e.button && e.button !== 0) return;
    draggedRef.current = false; // fresh interaction; a real drag re-sets this on release
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const info = { sid: s.id, startX: e.clientX, startY: e.clientY, origDur: s.durationMinutes, origStartMin: s.startHour * 60 + (s.startMinute || 0), kind: (e.clientY >= rect.bottom - 20 ? 'resize' : 'move') as 'move' | 'resize', armed: false, touch, timer: 0, tgtDayIdx: mode === 'week' ? xToDayIdx(e.clientX) : 0, tgtMin: s.startHour * 60 + (s.startMinute || 0) };
    pressRef.current = info;
    const pid = e.pointerId;
    if (touch) info.timer = window.setTimeout(() => { if (pressRef.current === info) armPress(info, el, pid); }, LONG_PRESS_MS);
  };

  const onBlockPointerMove = (e: React.PointerEvent) => {
    const info = pressRef.current;
    if (!info) return;
    const dx = e.clientX - info.startX, dy = e.clientY - info.startY;
    if (!info.armed) {
      const dist = Math.hypot(dx, dy);
      if (info.touch) { if (dist > PRESS_CANCEL_PX) { clearTimeout(info.timer); pressRef.current = null; } return; }
      if (dist > 4) armPress(info, e.currentTarget as HTMLElement, e.pointerId); else return;
    }
    e.preventDefault();
    if (info.kind === 'move') {
      info.tgtDayIdx = mode === 'week' ? xToDayIdx(e.clientX) : 0;
      info.tgtMin = yToMin(e.clientY);
      setGhostPos({ dayIdx: info.tgtDayIdx, min: info.tgtMin });
    } else {
      store.resizeSession(info.sid, Math.max(15, info.origDur + snapTo15(Math.round((dy / HOUR_H) * 60))));
    }
  };

  const endBlockPress = (e: React.PointerEvent) => {
    const info = pressRef.current;
    if (!info) return;
    clearTimeout(info.timer);
    if (info.armed && info.kind === 'move') {
      const dateStr = mode === 'week' ? format(days[info.tgtDayIdx], 'yyyy-MM-dd') : format(selectedDay, 'yyyy-MM-dd');
      store.moveSession(info.sid, dateStr, Math.floor(info.tgtMin / 60), info.tgtMin % 60);
    }
    if (info.armed) { try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ } draggedRef.current = true; }
    pressRef.current = null;
    setPressSid(null); setDragSid(null); setGhostPos(null);
  };

  // Open the session on a plain tap, but swallow the click that trails a drag.
  const onBlockClick = (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    if (draggedRef.current) { draggedRef.current = false; return; }
    store.openSessionModal(sid);
  };

  // Day-view double-click → create draft for the selected day
  const handleDayDouble = (e: React.MouseEvent) => {
    const totalMin = yToMin(e.clientY);
    setDraft({ title: '', goalId: goals[0]?.id ?? '', dayIdx: 0, date: format(selectedDay, 'yyyy-MM-dd'), startMin: totalMin, durationMinutes: 60, sessionType: 'regular', recurrence: 'none', ...DRAFT_DEFAULTS });
  };

  // Touch devices have no double-click → single tap on an empty slot creates.
  const isCoarse = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const handleDayTap = (e: React.MouseEvent) => { if (!draft && isCoarse()) handleDayDouble(e); };

  const createFromDraft = () => {
    if (!draft || !draft.title.trim()) return;
    const baseDate = draft.date ? parseISO(draft.date) : days[draft.dayIdx];
    const h0 = draft.allDay ? 0 : Math.floor(draft.startMin / 60);
    const m0 = draft.allDay ? 0 : draft.startMin % 60;

    // Editing an existing session → update it in place.
    if (draft.editId) {
      store.updateSession(draft.editId, {
        date: format(baseDate, 'yyyy-MM-dd'), startHour: h0, startMinute: m0,
        durationMinutes: draft.allDay ? 0 : draft.durationMinutes,
        title: draft.title.trim(), goalId: draft.goalId, sessionType: draft.sessionType,
        description: draft.description.trim(),
        color: draft.color || undefined, icon: draft.icon || undefined,
        allDay: draft.allDay || undefined,
        reminderMinutes: draft.reminderMinutes >= 0 ? draft.reminderMinutes : undefined,
        location: draft.location.trim() || undefined, url: draft.url.trim() || undefined,
      });
      setDraft(null);
      return;
    }

    // If picked from an unscheduled backlog session (single, non-recurring), MOVE it
    // onto the schedule (keep its id) so completing it later also updates the goal.
    if (draft.sourceId && draft.spanDays === 1 && draft.recurrence === 'none') {
      const src = sessions.find(x => x.id === draft.sourceId);
      if (src && !src.date) {
        store.updateSession(src.id, {
          date: format(baseDate, 'yyyy-MM-dd'), startHour: h0, startMinute: m0,
          durationMinutes: draft.allDay ? 0 : draft.durationMinutes,
          title: draft.title.trim(), goalId: draft.goalId, sessionType: draft.sessionType,
          description: draft.description.trim(),
          color: draft.color || undefined, icon: draft.icon || undefined,
          allDay: draft.allDay || undefined, reminderMinutes: draft.reminderMinutes >= 0 ? draft.reminderMinutes : undefined,
          location: draft.location.trim() || undefined, url: draft.url.trim() || undefined,
        });
        setDraft(null);
        return;
      }
    }

    // Multi-day: consecutive days from baseDate. Otherwise honour recurrence.
    const span = Math.max(1, draft.spanDays || 1);
    const dates = span > 1
      ? Array.from({ length: span }, (_, i) => addDays(baseDate, i))
      : expandRecurrence(baseDate, draft.recurrence, draft.weekdays);
    const linked = span > 1 || draft.recurrence !== 'none';
    const seriesId = linked ? `ser${Date.now()}` : undefined;
    const h = draft.allDay ? 0 : Math.floor(draft.startMin / 60);
    const m = draft.allDay ? 0 : draft.startMin % 60;
    const note = draft.description.trim();
    const newSessions: Session[] = dates.map((d, i) => ({
      id: `s${Date.now()}-${i}`,
      goalId: draft.goalId,
      date: format(d, 'yyyy-MM-dd'),
      startHour: h,
      startMinute: m,
      durationMinutes: draft.allDay ? 0 : draft.durationMinutes,
      title: draft.title.trim(),
      description: note,
      tasks: [],
      sessionType: draft.sessionType,
      status: 'planned',
      ...(draft.color ? { color: draft.color } : {}),
      ...(draft.icon ? { icon: draft.icon } : {}),
      ...(draft.allDay ? { allDay: true } : {}),
      ...(draft.reminderMinutes >= 0 ? { reminderMinutes: draft.reminderMinutes } : {}),
      ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
      ...(draft.url.trim() ? { url: draft.url.trim() } : {}),
      ...(seriesId ? { seriesId } : {}),
      ...(seriesId && draft.recurrence !== 'none' ? { recurrence: draft.recurrence as RecurringPattern } : {}),
    }));
    if (draft.sourceTaskId && newSessions.length === 1) {
      const sess = newSessions[0];
      store.updateTask(draft.sourceTaskId, {
        sessionId: sess.id,
        title: sess.title,
        status: 'scheduled',
        scheduledDate: sess.date,
        durationMinutes: sess.durationMinutes || undefined,
        dueDate: undefined,
        isTodayFocus: false,
      });
    }
    if (newSessions.length === 1) store.addSession(newSessions[0]);
    else store.addSessions(newSessions);
    setDraft(null);
  };

  const dragSession = dragSid ? sessions.find(s => s.id === dragSid) : null;

  // ── Weekly time budget (visible week) ──
  const weekDateStrs = days.map(d => format(d, 'yyyy-MM-dd'));
  const weekSessions = sessions.filter(s => weekDateStrs.includes(s.date));
  const totalWeekMin = weekSessions.reduce((a, s) => a + s.durationMinutes, 0);
  const doneWeekMin = weekSessions.filter(s => s.status === 'done').reduce((a, s) => a + s.durationMinutes, 0);
  const perGoal = goals.map(g => {
    const gs = weekSessions.filter(s => s.goalId === g.id);
    const mins = gs.reduce((a, s) => a + s.durationMinutes, 0);
    return { goal: g, mins, count: gs.length };
  }).filter(x => x.mins > 0).sort((a, b) => b.mins - a.mins);
  const maxGoalMin = Math.max(...perGoal.map(p => p.mins), 1);
  const hShort = tr('common.hourShort');
  const fmtH = (min: number) => (min / 60) % 1 === 0 ? `${min / 60}${hShort}` : `${(min / 60).toFixed(1)}${hShort}`;

  return (
    <div className="px-3 md:px-6 py-4 md:py-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-5 shrink-0">
        {/* Row 1: title + period navigation */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-[26px] md:text-[36px] text-[var(--text)]">{tr('nav.schedule')}</h1>
            <div className="text-[13px] text-[var(--text-dim)] mt-1 truncate capitalize">
              {mode === 'week' && `${format(ws, 'MMM d', { locale })} — ${format(days[6], 'MMM d, yyyy', { locale })}`}
              {mode === 'day' && format(selectedDay, 'EEEE, d MMMM yyyy', { locale })}
              {mode === 'month' && format(monthDate, 'LLLL yyyy', { locale })}
              {mode === 'year' && format(yearDate, 'yyyy', { locale })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start">
            <button onClick={goPrev} className="w-8 h-8 rounded-lg border border-[var(--border)] grid place-items-center hover:bg-[var(--surface-2)] text-[var(--text-dim)] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="h-8 px-3 rounded-lg border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors">
              {tr('common.today')}
            </button>
            <button onClick={goNext} className="w-8 h-8 rounded-lg border border-[var(--border)] grid place-items-center hover:bg-[var(--surface-2)] text-[var(--text-dim)] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Row 2: mode toggle + new session */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 min-w-0">
            <div className="inline-flex w-fit max-w-full items-center p-0.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
              {MODE_LABELS.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`h-7 px-3 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${mode === m.id ? 'bg-[var(--border)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                  {tr(m.label)}
                </button>
              ))}
            </div>
            {mode === 'year' ? (
              <button
                onClick={() => store.openWizard()}
                className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold flex items-center gap-1.5 hover:opacity-90 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> {tr('goals.newGoal')}
              </button>
            ) : (
              <button
                onClick={() => setDraft({ title: '', goalId: goals[0]?.id ?? '', dayIdx: 0, date: mode === 'day' ? format(selectedDay, 'yyyy-MM-dd') : undefined, startMin: 9 * 60, durationMinutes: 60, sessionType: 'regular', recurrence: 'none', ...DRAFT_DEFAULTS })}
                className="h-8 px-3 rounded-lg bg-[var(--primary)] text-white text-[11px] font-bold flex items-center gap-1.5 hover:opacity-90 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> {tr('sched.newSession')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ WEEK VIEW ═══════════ */}
      {mode === 'week' && (
      <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-5 min-h-0 overflow-y-auto md:overflow-hidden pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0">
        {/* Calendar Grid */}
        <WeekGrid
          days={days}
          sessions={sessions}
          weekOffset={weekOffset}
          startH={START_H}
          rows={ROWS}
          store={store}
          goalColor={goalColor}
          goalEmoji={goalEmoji}
          now={now}
          onCreateAt={(dayIdx, startMin) => setDraft({ title: '', goalId: goals[0]?.id ?? '', dayIdx, startMin, durationMinutes: 60, sessionType: 'regular', recurrence: 'none', ...DRAFT_DEFAULTS })}
        />

        {/* Side Panel */}
        <div className="w-full md:w-[300px] shrink-0 space-y-4 md:overflow-y-auto">
          {/* Weekly Time Budget */}
          <button onClick={() => setBudgetOpen(true)} className="card p-5 w-full text-left hover:border-[var(--border)] transition-colors block">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {tr('sched.weekBudget')} <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" /></h3>
              <span className="text-[15px] font-bold text-[var(--text)] mono">{fmtH(totalWeekMin)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] mb-3">
              <span>{tr('sched.sessionsPlanned',{n:weekSessions.length})}</span>
              <span className="text-emerald-400">{fmtH(doneWeekMin)} {tr('sched.doneWord')}</span>
            </div>
            {/* overall done bar */}
            <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: totalWeekMin ? `${(doneWeekMin / totalWeekMin) * 100}%` : '0%' }} />
            </div>
            {/* per-goal breakdown */}
            {perGoal.length > 0 ? (
              <div className="space-y-2.5">
                {perGoal.map(({ goal, mins, count }) => (
                  <div key={goal.id}>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-[var(--text)] truncate flex items-center gap-1.5"><span>{goal.emoji}</span>{goal.title.split(' ').slice(0, 3).join(' ')}</span>
                      <span className="mono text-[var(--text-dim)] shrink-0">{fmtH(mins)} · {count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(mins / maxGoalMin) * 100}%`, background: goal.color }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-dim)] text-center py-2">{tr('sched.noWeekSessions')}</p>
            )}
          </button>

          {/* Missed */}
          {sessions.filter(s => !!s.date && isPast(new Date(s.date)) && s.status === 'planned').length > 0 && (
            <div className="card p-4 border-red-500/10 bg-red-500/[.02]">
              <div className="text-[11px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Missed</div>
              <div className="space-y-1.5">
                {sessions.filter(s => !!s.date && isPast(new Date(s.date)) && s.status === 'planned').slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="truncate text-[var(--text-dim)]">{s.title}</span>
                    <button onClick={() => store.moveSession(s.id, format(new Date(), 'yyyy-MM-dd'))} className="text-[11px] font-bold text-[var(--text)] bg-[var(--border)] px-2 py-0.5 rounded hover:bg-[var(--border)] shrink-0">↻</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="text-[11px] text-[var(--text-dim)] text-center py-2 leading-snug">
            {tr('sched.dblGridCreate')}<br />
            {tr('sched.dragHint')}
          </div>
        </div>
      </div>
      )}

      {/* ═══════════ DAY VIEW ═══════════ */}
      {mode === 'day' && (() => {
        const dateStr = format(selectedDay, 'yyyy-MM-dd');
        const daySessions = sessions.filter(s => s.date === dateStr).sort((a, b) => (a.startHour * 60 + (a.startMinute || 0)) - (b.startHour * 60 + (b.startMinute || 0)));
        const dayMin = daySessions.reduce((a, s) => a + s.durationMinutes, 0);
        const dayDoneMin = daySessions.filter(s => s.status === 'done').reduce((a, s) => a + s.durationMinutes, 0);
        const dayPerGoal = goals.map(g => { const gs = daySessions.filter(s => s.goalId === g.id); return { goal: g, mins: gs.reduce((a, s) => a + s.durationMinutes, 0), count: gs.length }; }).filter(x => x.mins > 0).sort((a, b) => b.mins - a.mins);
        const maxDayGoal = Math.max(...dayPerGoal.map(p => p.mins), 1);
        const stripStart = startOfWeek(selectedDay, { weekStartsOn: wkStart });
        const stripDays = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i));
        return (
          <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-5 min-h-0 overflow-y-auto md:overflow-hidden pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0">
            <div
              className="card overflow-auto min-w-0 h-[62vh] md:h-auto md:flex-1 shrink-0"
              style={{ touchAction: 'pan-y' }}
            >
              {/* Week strip — day selector (как в iOS-календаре) */}
              <div className="sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] px-1.5 py-2 grid grid-cols-7 gap-1">
                {stripDays.map(d => {
                  const sel = isSameDay(d, selectedDay);
                  const tdy = isToday(d);
                  return (
                    <button key={d.toISOString()} onClick={() => setDayOffset(differenceInCalendarDays(d, today))}
                      className="flex flex-col items-center gap-1 py-1 rounded-lg hover:bg-[var(--surface-2)] transition-colors">
                      <span className={`text-[10px] font-bold uppercase ${sel ? 'text-[var(--primary)]' : 'text-[var(--text-dim)]'}`}>{format(d, 'EEEEE', { locale })}</span>
                      <span className={`w-7 h-7 grid place-items-center rounded-full text-[13px] font-bold transition-colors ${sel ? 'bg-[var(--primary)] text-white' : tdy ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>{format(d, 'd')}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-[56px_1fr] relative select-none" style={{ height: ROWS * HOUR_H }}>
                <div className="border-r border-[var(--border)]">
                  {Array.from({ length: ROWS }, (_, i) => i + START_H).map(h => (
                    <div key={h} className="border-b border-[var(--surface)] pr-2 text-right text-[11px] text-[var(--text-dim)] mono pt-1" style={{ height: HOUR_H }}>{(h - START_H) % 2 === 0 ? `${String(h).padStart(2, '0')}:00` : ''}</div>
                  ))}
                </div>
                <div ref={gridRef} className="relative border-l border-[var(--border)]" onDoubleClick={handleDayDouble} onClick={handleDayTap} title={tr('sched.dblCreate')}>
                  {Array.from({ length: ROWS }).map((_, i) => (
                    <div key={i} className="border-b border-[var(--surface)] relative" style={{ height: HOUR_H }}>
                      <div className="absolute top-1/2 left-0 right-0 border-b border-[var(--border)]" />
                    </div>
                  ))}
                  {/* Drag ghost — semi-transparent shadow that follows the move */}
                  {dragSession && ghostPos && (
                    <div className="absolute left-2 right-2 rounded-lg border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/15 pointer-events-none z-30 flex items-center justify-center"
                      style={{ top: ((ghostPos.min - START_H * 60) / 60) * HOUR_H, height: Math.max(20, dragSession.durationMinutes / 60 * HOUR_H - 4) }}>
                      <span className="text-[11px] font-bold text-[var(--primary)] mono">{minToTime(ghostPos.min)}</span>
                    </div>
                  )}
                  {daySessions.filter(s => s.allDay).map((s, ai) => {
                    const color = s.color || goalColor(s.goalId);
                    return (
                      <div key={s.id} onClick={(e) => { e.stopPropagation(); store.openSessionModal(s.id); }}
                        className={`absolute left-2 right-2 rounded-md px-3 flex items-center z-20 cursor-pointer overflow-hidden ${s.status === 'done' ? 'opacity-50' : ''}`}
                        style={{ top: 2 + ai * 24, height: 22, background: `${color}dd`, borderLeft: `3px solid ${color}` }}>
                        <span className="text-[10px] font-bold text-[var(--text)] truncate flex items-center gap-1">{s.icon ? <SessionIcon name={s.icon} className="w-3 h-3 shrink-0" /> : <span>{goalEmoji(s.goalId)}</span>} {s.title} · {tr('sched.allDayShort')}</span>
                      </div>
                    );
                  })}
                  {(() => { const layout = layoutDay(daySessions.filter(s => !s.allDay)); return daySessions.filter(s => !s.allDay).map(s => {
                    const color = s.color || (s.sessionType === 'checkpoint' ? '#ef4444' : goalColor(s.goalId));
                    const top = ((s.startHour * 60 + (s.startMinute || 0) - START_H * 60) / 60) * HOUR_H;
                    const height = Math.max(20, (s.durationMinutes / 60) * HOUR_H - 2);
                    const lay = layout[s.id] || { col: 0, cols: 1 };
                    return (
                      <div key={s.id}
                        onClick={(e) => onBlockClick(e, s.id)} onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => onBlockPointerDown(e, s)} onPointerMove={onBlockPointerMove} onPointerUp={endBlockPress} onPointerCancel={endBlockPress}
                        className={`absolute rounded-lg overflow-hidden group transition-shadow z-10 hover:z-20 hover:shadow-xl ${dragSid === s.id ? 'opacity-30 z-20 cursor-grabbing' : pressSid === s.id ? 'z-30 shadow-2xl ring-2 ring-[var(--primary)] cursor-grabbing' : 'cursor-pointer'} ${s.status === 'done' ? 'opacity-50' : ''}`}
                        style={{ top, height, left: `calc(${(lay.col / lay.cols) * 100}% + 6px)`, width: `calc(${100 / lay.cols}% - 10px)`, background: `${color}${s.status === 'done' ? '44' : 'dd'}`, borderLeft: `3px solid ${color}`, touchAction: pressSid === s.id ? 'none' : 'pan-y' }}>
                        <div className="px-3 py-1.5 h-full flex flex-col">
                          <div className={`text-[11px] font-bold ${s.status === 'done' ? 'text-[var(--text)]' : 'text-white'} truncate leading-tight flex items-center gap-1`}>
                            {s.seriesId && <Repeat className="w-2.5 h-2.5 shrink-0 opacity-80" />}{s.icon ? <SessionIcon name={s.icon} className="w-3 h-3 shrink-0 inline" /> : <span>{goalEmoji(s.goalId)}</span>} {s.title}
                          </div>
                          {height > 34 && <div className={`mono text-[11px] ${s.status === 'done' ? 'text-[var(--text-dim)]' : 'text-white/70'} mt-0.5`}>{String(s.startHour).padStart(2, '0')}:{String(s.startMinute || 0).padStart(2, '0')} · {fmtDur(s.durationMinutes, store.lang)}</div>}
                          {height > 55 && cleanSessionNote(s.description) && <div className={`text-[11px] ${s.status === 'done' ? 'text-[var(--text-dim)]' : 'text-white/60'} mt-1 line-clamp-2 leading-snug`}>{cleanSessionNote(s.description)}</div>}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-5 flex items-end justify-center pb-1 pointer-events-none"><span className={`w-8 h-1 rounded-full ${s.status === 'done' ? 'bg-[var(--text-mute)]/40' : 'bg-white/45'}`} /></div>
                      </div>
                    );
                  }); })()}
                  {dayOffset === 0 && (() => {
                    const nowMin = now.getHours() * 60 + now.getMinutes() - START_H * 60;
                    if (nowMin < 0 || nowMin > ROWS * 60) return null;
                    return (
                      <div className="absolute left-0 right-0 pointer-events-none z-30" style={{ top: (nowMin / 60) * HOUR_H }}>
                        <div className="flex items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shadow-[0_0_8px_rgba(239,68,68,.5)]" />
                          <div className="h-[1.5px] flex-1 bg-red-500" />
                          <span className="text-[11px] font-bold text-red-500 mono leading-none pr-1.5">{minToTime(now.getHours() * 60 + now.getMinutes())}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            {/* Day budget panel */}
            <div className="w-full md:w-[300px] shrink-0 space-y-4 md:overflow-y-auto">
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {tr('sched.dayBudget')}</h3>
                  <span className="text-[15px] font-bold text-[var(--text)] mono">{fmtH(dayMin)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] mb-3">
                  <span>{tr('sched.sessionsN',{n:daySessions.length})}</span><span className="text-emerald-400">{fmtH(dayDoneMin)} {tr('sched.doneWord')}</span>
                </div>
                <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden mb-4"><div className="h-full bg-emerald-500 rounded-full" style={{ width: dayMin ? `${(dayDoneMin / dayMin) * 100}%` : '0%' }} /></div>
                {dayPerGoal.length > 0 ? (
                  <div className="space-y-2.5">{dayPerGoal.map(({ goal, mins, count }) => (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between text-[10px] mb-1"><span className="text-[var(--text)] truncate flex items-center gap-1.5"><span>{goal.emoji}</span>{goal.title.split(' ').slice(0, 3).join(' ')}</span><span className="mono text-[var(--text-dim)] shrink-0">{fmtH(mins)} · {count}</span></div>
                      <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(mins / maxDayGoal) * 100}%`, background: goal.color }} /></div>
                    </div>
                  ))}</div>
                ) : <p className="text-[10px] text-[var(--text-dim)] text-center py-2">{tr('sched.noDaySessions')}</p>}
              </div>
              <div className="text-[11px] text-[var(--text-dim)] text-center py-2 leading-snug">{tr('sched.dblGridCreate')}</div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════ MONTH VIEW (compact calendar grid, fits screen) ═══════════ */}
      {mode === 'month' && (() => {
        const mStart = startOfMonth(monthDate);
        const gridStart = startOfWeek(mStart, { weekStartsOn: wkStart });
        const mEnd = endOfMonth(monthDate);
        const weeksCount = differenceInCalendarWeeks(mEnd, gridStart, { weekStartsOn: wkStart }) + 1;
        const cells = Array.from({ length: weeksCount * 7 }, (_, i) => addDays(gridStart, i));
        const dayToOffset = (day: Date) => Math.round((day.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
        return (
          <div className="flex-1 card overflow-y-auto min-w-0 flex flex-col pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-[var(--border)] sticky top-0 z-40 bg-[var(--surface)]">
              {[1, 2, 3, 4, 5, 6, 0].map((v, i) => (
                <div key={v} className={`h-8 flex items-center justify-center text-[10px] font-bold capitalize ${i >= 5 ? 'text-red-400/70' : 'text-[var(--text-dim)]'}`}>{format(new Date(2024, 0, 7 + v), 'EEEEEE', { locale })}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: 'minmax(74px, 1fr)' }}>
              {cells.map((day, i) => {
                const inMonth = isSameMonth(day, monthDate);
                const ds = format(day, 'yyyy-MM-dd');
                const dSessions = sessions.filter(s => s.date === ds).sort((a, b) => (a.startHour * 60 + (a.startMinute || 0)) - (b.startHour * 60 + (b.startMinute || 0)));
                const active = isToday(day);
                return (
                  <div key={i} onClick={() => { setMode('day'); setDayOffset(dayToOffset(day)); }}
                    className={`text-left border-r border-b border-[var(--surface-2)] p-1 flex flex-col overflow-hidden min-w-0 cursor-pointer transition-colors hover:bg-[var(--surface)] ${active ? 'bg-[var(--primary)]/10' : ''} ${inMonth ? '' : 'opacity-35'}`}>
                    <div className={`text-[11px] font-bold leading-none mb-1 ${active ? 'text-[var(--primary)]' : inMonth ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{format(day, 'd')}</div>
                    <div className="space-y-0.5 overflow-hidden">
                      {dSessions.slice(0, 3).map(s => {
                        const color = s.color || (s.sessionType === 'checkpoint' ? '#ef4444' : goalColor(s.goalId));
                        return (
                          <button key={s.id} onClick={(e) => { e.stopPropagation(); store.openSessionModal(s.id); }}
                            className={`block w-full text-left rounded px-1 py-0.5 text-[11px] md:text-[10px] font-medium leading-tight truncate ${s.status === 'done' ? 'opacity-50 line-through' : ''}`}
                            style={{ background: `${color}30`, color }}>
                            {s.title}
                          </button>
                        );
                      })}
                      {dSessions.length > 3 && <div className="text-[11px] text-[var(--text-dim)] px-1 leading-none">+{dSessions.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══════════ YEAR VIEW (12 month cells) ═══════════ */}
      {mode === 'year' && (() => {
        // Goals-timeline: one row per goal, its span drawn across the 12 months.
        const year = getYear(yearDate);
        const yStart = new Date(year, 0, 1).getTime();
        const yEnd = new Date(year + 1, 0, 1).getTime();
        const pctOf = (t: number) => Math.min(100, Math.max(0, ((t - yStart) / (yEnd - yStart)) * 100));
        const spans = goals
          .filter(g => (g.status ?? 'active') !== 'completed')
          .map(g => {
            const gDates = sessions.filter(s => s.goalId === g.id && !!s.date).map(s => parseISO(s.date)).sort((a, b) => a.getTime() - b.getTime());
            const start = gDates[0] || new Date(year, 0, 1);
            const weeks = Math.max(1, Math.ceil(g.totalHoursEstimated / Math.max(g.hoursPerWeekTarget, 1)));
            const end = g.deadline ? parseISO(g.deadline) : addWeeks(start, weeks);
            return { g, start, end };
          })
          .filter(s => s.end.getTime() > yStart && s.start.getTime() < yEnd);
        const monthCounts = Array.from({ length: 12 }, (_, m) =>
          sessions.filter(s => { if (!s.date) return false; const d = parseISO(s.date); return getYear(d) === year && getMonth(d) === m; }).length);
        const maxCount = Math.max(1, ...monthCounts);
        const todayY = getYear(today), todayM = getMonth(today);
        const showToday = year === todayY;
        return (
          <div className="flex-1 card overflow-auto min-w-0 p-4 md:p-5 pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-5">
            {/* Month header (tap a month → month view) */}
            <div className="grid grid-cols-12 mb-1">
              {monthsShort.map((mLabel, m) => (
                <button key={m} onClick={() => { setMode('month'); setMonthOffset((year - todayY) * 12 + (m - todayM)); }}
                  className={`text-[10px] font-bold py-1.5 rounded-lg transition-colors ${showToday && m === todayM ? 'text-[var(--primary)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
                  {mLabel.slice(0, 1)}
                </button>
              ))}
            </div>
            {/* Session density strip */}
            <div className="grid grid-cols-12 gap-[3px] mb-4">
              {monthCounts.map((c, m) => (
                <div key={m} title={`${monthsShort[m]}: ${c}`} className="h-2 rounded-full"
                  style={{ background: c === 0 ? 'var(--surface-2)' : 'var(--primary)', opacity: c === 0 ? 1 : 0.25 + 0.75 * (c / maxCount) }} />
              ))}
            </div>
            {/* Goal timeline rows */}
            {spans.length === 0 ? (
              <div className="text-[12px] text-[var(--text-dim)] py-8 text-center">{tr('sched.noActiveGoals')}</div>
            ) : (
              <div className="relative">
                {/* month grid lines + today marker */}
                <div className="absolute inset-y-0 left-24 md:left-32 right-0 pointer-events-none">
                  {Array.from({ length: 11 }, (_, i) => (
                    <div key={i} className="absolute inset-y-0 w-px bg-[var(--border)] opacity-50" style={{ left: `${((i + 1) / 12) * 100}%` }} />
                  ))}
                  {showToday && <div className="absolute inset-y-0 w-[2px] bg-[var(--primary)] z-10" style={{ left: `${pctOf(today.getTime())}%` }} />}
                </div>
                <div className="space-y-2.5">
                  {spans.map(({ g, start, end }) => {
                    const left = pctOf(start.getTime());
                    const width = Math.max(2.5, pctOf(end.getTime()) - left);
                    return (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="w-[88px] md:w-[120px] shrink-0 flex items-center gap-1.5 min-w-0">
                          <span className="text-[14px] shrink-0">{g.emoji}</span>
                          <span className="text-[11px] font-medium text-[var(--text)] truncate">{g.title}</span>
                        </div>
                        <div className="relative flex-1 h-7 rounded-lg bg-[var(--surface-2)]/60 overflow-hidden">
                          <div title={g.title} className="absolute inset-y-1 rounded-md"
                            style={{ left: `${left}%`, width: `${width}%`, background: `${g.color}33`, borderLeft: `3px solid ${g.color}` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-[11px] text-[var(--text-dim)] mt-4">{tr('sched.yearHint',{year})}</div>
          </div>
        );
      })()}

      {/* ── Create Session Modal ── */}
      {draft && (
        <CreateSessionModal
          draft={draft}
          setDraft={setDraft}
          days={days}
          goals={goals}
          sessions={sessions}
          weekStartsOn={wkStart}
          onClose={() => setDraft(null)}
          onCreate={createFromDraft}
        />
      )}

      {/* ── Budget breakdown ── */}
      {budgetOpen && (
        <BudgetModal sessions={sessions} goals={goals} days={days} ws={ws} onClose={() => setBudgetOpen(false)} />
      )}
    </div>
  );
}

/* ─── Budget Breakdown Modal ─── */
function BudgetModal({ sessions, goals, days, ws, onClose }: {
  sessions: Session[]; goals: Goal[]; days: Date[]; ws: Date; onClose: () => void;
}) {
  const tr = useT();
  const locale = useDateLocale();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const h = tr('common.hourShort');
  const fmtH = (min: number) => min === 0 ? `0${h}` : (min / 60) % 1 === 0 ? `${min / 60}${h}` : `${(min / 60).toFixed(1)}${h}`;

  const weekStrs = days.map(d => format(d, 'yyyy-MM-dd'));
  const mStart = format(startOfMonth(ws), 'yyyy-MM-dd');
  const mEnd = format(endOfMonth(ws), 'yyyy-MM-dd');
  const inRange = (s: Session) => range === 'week' ? weekStrs.includes(s.date) : (s.date >= mStart && s.date <= mEnd);

  const list = sessions.filter(s => inRange(s) && !s.allDay);
  const groups = new Map<string, { plan: number; done: number; count: number }>();
  for (const s of list) {
    const key = s.goalId || '__general';
    const g = groups.get(key) || { plan: 0, done: 0, count: 0 };
    g.plan += s.durationMinutes;
    if (s.status === 'done') g.done += s.durationMinutes;
    g.count += 1;
    groups.set(key, g);
  }
  const rows = [...groups.entries()].map(([key, v]) => {
    const goal = goals.find(g => g.id === key);
    return { key, title: goal ? goal.title : tr('sched.noGoal'), emoji: goal?.emoji || '🗓️', color: goal?.color || '#22c55e', ...v };
  }).sort((a, b) => b.plan - a.plan);
  const totalPlan = rows.reduce((a, r) => a + r.plan, 0);
  const totalDone = rows.reduce((a, r) => a + r.done, 0);
  const maxPlan = Math.max(...rows.map(r => r.plan), 1);
  const rangeLabel = range === 'week'
    ? `${format(days[0], 'd MMM', { locale })} — ${format(days[6], 'd MMM', { locale })}`
    : format(ws, 'LLLL yyyy', { locale });

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm anim-fade" onClick={onClose}>
      <div className="w-full max-w-md card overflow-hidden flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/15 grid place-items-center shrink-0"><Clock className="w-4 h-4 text-[var(--primary)]" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[var(--text)] text-[14px]">{tr('sched.timeBudget')}</div>
            <div className="text-[10px] text-[var(--text-dim)] capitalize">{rangeLabel}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--border)] grid place-items-center text-[var(--text-dim)]"><X className="w-4 h-4" /></button>
        </div>

        {/* Week / Month toggle */}
        <div className="p-4 pb-0">
          <div className="grid grid-cols-2 gap-2">
            {(['week', 'month'] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`h-10 rounded-xl text-[12px] font-bold border transition-all ${range === r ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                {r === 'week' ? tr('sched.mode.week') : tr('sched.mode.month')}
              </button>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="card-inner p-3"><div className="text-[18px] font-bold text-[var(--text)] mono leading-none">{fmtH(totalPlan)}</div><div className="text-[10px] text-[var(--text-dim)] mt-1">{tr('sched.planned')}</div></div>
            <div className="card-inner p-3"><div className="text-[18px] font-bold text-emerald-400 mono leading-none">{fmtH(totalDone)}</div><div className="text-[10px] text-[var(--text-dim)] mt-1">{tr('dash.completed')}</div></div>
            <div className="card-inner p-3"><div className="text-[18px] font-bold text-[var(--text)] mono leading-none">{list.length}</div><div className="text-[10px] text-[var(--text-dim)] mt-1">{tr('sched.sessionsWord')}</div></div>
          </div>
        </div>

        {/* Per-task breakdown */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('sched.byTasks')}</div>
          {rows.length === 0 ? (
            <p className="text-[12px] text-[var(--text-dim)] text-center py-6">{tr('sched.noPeriodSessions')}</p>
          ) : rows.map(r => (
            <div key={r.key} className="card-inner p-3.5">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[13px] text-[var(--text)] font-medium truncate flex items-center gap-1.5 min-w-0"><span className="shrink-0">{r.emoji}</span>{r.title}</span>
                <span className="text-[11px] text-[var(--text-dim)] shrink-0">{tr('sched.sessAbbr',{n:r.count})}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-emerald-400 mono font-bold">{fmtH(r.done)} <span className="text-[var(--text-dim)] font-normal">{tr('sched.doneShort')}</span></span>
                <span className="text-[var(--text-dim)] mono">{fmtH(r.plan)} <span className="text-[var(--text-dim)]">{tr('sched.planShort')}</span></span>
              </div>
              {/* plan bar (relative to biggest task) with done overlay */}
              <div className="h-2 w-full bg-[var(--surface)] rounded-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(r.plan / maxPlan) * 100}%`, background: r.color }} />
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.done / maxPlan) * 100}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Create Session Modal ─── */
function CreateSessionModal({ draft, setDraft, days, goals, sessions, weekStartsOn, onClose, onCreate }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  days: Date[];
  goals: Goal[];
  sessions: Session[];
  weekStartsOn: 0 | 1;
  onClose: () => void;
  onCreate: () => void;
}) {
  const tr = useT();
  const locale = useDateLocale();
  const weekdayLabel = (v: number) => format(new Date(2024, 0, 7 + v), 'EEEEEE', { locale });
  const upd = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const goal = goals.find(g => g.id === draft.goalId);
  const goalColor = goal?.color || '#22c55e';
  const effColor = draft.color || goalColor;
  // Base date: explicit `date` (free-picked) wins, else the selected weekday of the visible week.
  const baseDate = draft.date ? parseISO(draft.date) : days[draft.dayIdx];
  const baseDateStr = format(baseDate, 'yyyy-MM-dd');
  const occCount = expandRecurrence(baseDate, draft.recurrence, draft.weekdays).length;
  const toggleWeekday = (v: number) => upd({ weekdays: draft.weekdays.includes(v) ? draft.weekdays.filter(d => d !== v) : [...draft.weekdays, v] });
  const [showSug, setShowSug] = useState(false);
  useBackClose(showSug, () => setShowSug(false));

  // Autocomplete: up to 5 suggestions. Empty query → most-frequent titles; typing → matches.
  // Sessions of the currently selected goal (incl. its unscheduled backlog) float to the top.
  const suggestions = (() => {
    const q = draft.title.trim().toLowerCase();
    const byTitle = new Map<string, { title: string; count: number; sample: Session; goalMatch: boolean; unscheduled: boolean }>();
    for (const s of sessions) {
      const key = s.title.trim();
      if (!key) continue;
      const lc = key.toLowerCase();
      if (q && !lc.includes(q)) continue;
      const isGoal = !!draft.goalId && s.goalId === draft.goalId;
      const unsched = !s.date;
      const e = byTitle.get(lc);
      if (e) {
        e.count++;
        e.goalMatch = e.goalMatch || isGoal;
        if (unsched && !e.unscheduled) { e.sample = s; e.unscheduled = true; } // prefer backlog item as the link source
      } else {
        byTitle.set(lc, { title: key, count: 1, sample: s, goalMatch: isGoal, unscheduled: unsched });
      }
    }
    return [...byTitle.values()]
      .sort((a, b) => (Number(b.goalMatch) - Number(a.goalMatch)) || (b.count - a.count) || a.title.localeCompare(b.title))
      .slice(0, 5)
      .map(e => e.sample);
  })();

  // Pick an existing session → reuse it as the same task. If it's an unscheduled
  // backlog session, remember its id so creation moves it instead of copying.
  const pickExisting = (s: Session) => {
    setShowSug(false);
    upd({
      title: s.title,
      goalId: s.goalId,
      durationMinutes: s.durationMinutes || draft.durationMinutes,
      sessionType: s.sessionType,
      ...(s.color ? { color: s.color } : {}),
      ...(s.icon ? { icon: s.icon } : {}),
      allDay: !!s.allDay,
      reminderMinutes: s.reminderMinutes ?? -1,
      location: s.location || '',
      url: s.url || '',
      description: cleanSessionNote(s.description),
      sourceId: s.date ? undefined : s.id,
    });
  };

  const endMin = draft.startMin + draft.durationMinutes;
  const setEnd = (mins: number) => upd({ durationMinutes: Math.max(15, mins - draft.startMin) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg card overflow-hidden flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${effColor}22` }}>
            <CalendarDays className="w-4 h-4" style={{ color: effColor }} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-[var(--text)] text-[14px]">{draft.editId ? tr('sched.editSession') : tr('sched.newSession')}</div>
            <div className="text-[10px] text-[var(--text-dim)] capitalize">{format(baseDate, 'EEEE, d MMM', { locale })}{draft.allDay ? ' · ' + tr('sched.allDayShort') : ' · ' + minToTime(draft.startMin)}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--border)] flex items-center justify-center text-[var(--text-dim)]"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title + autocomplete */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{tr('sched.titleField')}</label>
            <input autoFocus value={draft.title}
              onChange={e => { upd({ title: e.target.value, sourceId: undefined }); setShowSug(e.target.value.trim().length > 0); }}
              onFocus={() => setShowSug(draft.title.trim().length > 0)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              onKeyDown={e => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') setShowSug(false); }}
              placeholder={tr('sched.namePlaceholder')}
              className="w-full h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)]" />
            {showSug && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl shadow-black/50 overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider">{tr('sched.fromExisting')}</div>
                {suggestions.map(s => {
                  const g = goals.find(x => x.id === s.goalId);
                  return (
                    <button key={s.id} onMouseDown={e => { e.preventDefault(); pickExisting(s); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color || g?.color || '#22c55e' }} />
                      <span className="flex-1 text-[13px] text-[var(--text)] truncate">{s.title}</span>
                      {g && <span className="text-[10px] text-[var(--text-dim)] shrink-0">{g.emoji}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goal */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Target className="w-3 h-3" /> {tr('sched.goalField')} <span className="text-[var(--text-mute)] normal-case font-medium tracking-normal">· {tr('sched.optional')}</span></label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => upd({ goalId: '' })}
                className={`px-3 py-1.5 rounded-xl text-[12px] flex items-center gap-1.5 border transition-all ${!draft.goalId ? 'text-emerald-600 border-emerald-500 bg-emerald-500/15' : 'text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}>
                <span>🗓️</span>{tr('sched.general')}
              </button>
              {goals.map(g => (
                <button key={g.id} onClick={() => upd({ goalId: draft.goalId === g.id ? '' : g.id })}
                  className={`px-3 py-1.5 rounded-xl text-[12px] flex items-center gap-1.5 border transition-all ${draft.goalId === g.id ? 'text-[var(--text)]' : 'text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--border)]'}`}
                  style={draft.goalId === g.id ? { borderColor: g.color, background: `${g.color}1a` } : {}}>
                  <span>{g.emoji}</span>{g.title.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2.5">{tr('sched.color')}</label>
            <div className="grid grid-cols-8 gap-2.5 justify-items-center">
              {goal && (
                <button onClick={() => upd({ color: undefined })} title={tr('sched.goalColor')}
                  className="relative w-9 h-9 rounded-full grid place-items-center transition-transform hover:scale-110 active:scale-95"
                  style={{ background: goalColor, boxShadow: !draft.color ? `0 0 0 2px var(--surface), 0 0 0 4px ${goalColor}` : `inset 0 1px 2px rgba(255,255,255,.25), inset 0 -2px 4px rgba(0,0,0,.25)` }}>
                  <span className="text-[10px] drop-shadow">{goal.emoji}</span>
                </button>
              )}
              {PALETTE.map(p => {
                const sel = draft.color === p.c;
                return (
                  <button key={p.c} onClick={() => upd({ color: p.c })} title={p.c}
                    className="relative w-9 h-9 rounded-full grid place-items-center transition-transform hover:scale-110 active:scale-95"
                    style={{ backgroundImage: `linear-gradient(145deg, ${p.from}, ${p.to})`, boxShadow: sel ? `0 0 0 2px var(--surface), 0 0 0 4px ${p.c}` : `inset 0 1px 2px rgba(255,255,255,.3), inset 0 -2px 5px rgba(0,0,0,.3)` }}>
                    {sel && <Check className="w-4 h-4 text-[var(--text)] drop-shadow-[0_1px_1px_rgba(0,0,0,.5)]" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{tr('sched.icon')}</label>
            <IconPicker value={draft.icon} color={effColor} onChange={k => upd({ icon: k })} />
          </div>

          {/* All-day */}
          <button onClick={() => upd({ allDay: !draft.allDay })}
            className="w-full flex items-center justify-between h-11 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border)] transition-all">
            <span className="text-[13px] text-[var(--text)] font-medium">{tr('sched.allDay')}</span>
            <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${draft.allDay ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${draft.allDay ? 'translate-x-4' : ''}`} />
            </span>
          </button>

          {/* Day — quick week picker + free date */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{draft.spanDays > 1 ? tr('sched.startDay') : tr('sched.mode.day')}</label>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d, i) => {
                const ds = format(d, 'yyyy-MM-dd');
                const active = baseDateStr === ds;
                return (
                  <button key={i} onClick={() => upd({ dayIdx: i, date: ds })}
                    className={`h-12 rounded-xl border text-center transition-all ${active ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                    <div className="text-[11px] font-bold uppercase">{format(d, 'EEE', { locale })}</div>
                    <div className="text-[14px] font-bold leading-none mt-0.5">{format(d, 'd', { locale })}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <DatePicker value={baseDateStr} weekStartsOn={weekStartsOn} onChange={d => upd({ date: d })} />
            </div>
          </div>

          {/* Time + End (hidden for all-day) */}
          {!draft.allDay && (<>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 whitespace-nowrap">{tr('sched.start')}</label>
                <TimePicker label={tr('sched.start')} value={draft.startMin} onChange={v => upd({ startMin: v })} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 whitespace-nowrap">{tr('sched.end')}</label>
                <TimePicker label={tr('sched.end')} value={Math.min(endMin, 24 * 60 - 5)} onChange={v => setEnd(v)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DUR_PRESETS.map(m => (
                <button key={m} onClick={() => upd({ durationMinutes: m })}
                  className={`h-10 rounded-xl border text-[12px] font-medium transition-all ${draft.durationMinutes === m ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  {m < 60 ? `${m}${tr('common.minShort')}` : `${Math.floor(m / 60)}${tr('common.hourShort')}${m % 60 ? ` ${m % 60}${tr('common.minShort')}` : ''}`}
                </button>
              ))}
            </div>
          </>)}

          {/* Multi-day span */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{tr('sched.multiDay')}</label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 5, 7].map(n => (
                <button key={n} onClick={() => upd({ spanDays: n })}
                  className={`h-10 rounded-xl text-[12px] font-medium border transition-all ${draft.spanDays === n ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  {n === 1 ? tr('sched.rem.none') : tr('sched.daysN',{n})}
                </button>
              ))}
            </div>
            {draft.spanDays > 1 && <p className="text-[10px] text-[var(--primary)]/80 mt-2">{tr('sched.spanInfo',{n:draft.spanDays})}</p>}
          </div>

          {/* Reminder */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Bell className="w-3 h-3" /> {tr('sched.reminder')}</label>
            <div className="grid grid-cols-3 gap-2">
              {REMINDER_OPTS.map(r => (
                <button key={r.v} onClick={() => upd({ reminderMinutes: r.v })}
                  className={`h-10 rounded-xl text-[12px] font-medium border transition-all ${draft.reminderMinutes === r.v ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  {tr(r.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2">{tr('sched.typeField')}</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTS.map(t => (
                <button key={t.id} onClick={() => upd({ sessionType: t.id })}
                  className={`h-10 rounded-xl border text-[12px] font-medium transition-all ${draft.sessionType === t.id ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                  {tr(t.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Recurrence (disabled while multi-day is active) */}
          {draft.spanDays === 1 && (
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Repeat className="w-3 h-3" /> {tr('sched.repeat')}</label>
              <div className="grid grid-cols-2 gap-2">
                {REPEAT_OPTS.map(r => (
                  <button key={r.id} onClick={() => upd({ recurrence: r.id })}
                    className={`h-10 rounded-xl text-[12px] font-medium border transition-all ${draft.recurrence === r.id ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                    {tr(r.label)}
                  </button>
                ))}
              </div>
              {draft.recurrence === 'custom' && (
                <div className="grid grid-cols-7 gap-1.5 mt-2.5">
                  {WEEKDAY_PICKER.map(d => (
                    <button key={d.v} onClick={() => toggleWeekday(d.v)}
                      className={`h-9 rounded-lg text-[12px] font-bold border capitalize transition-all ${draft.weekdays.includes(d.v) ? 'border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border)]'}`}>
                      {weekdayLabel(d.v)}
                    </button>
                  ))}
                </div>
              )}
              {draft.recurrence !== 'none' && (
                draft.recurrence === 'custom' && !draft.weekdays.length
                  ? <p className="text-[10px] text-amber-400/80 mt-2">{tr('sched.pickWeekday')}</p>
                  : <p className="text-[10px] text-[var(--primary)]/80 mt-2">{tr('sched.willCreate',{n:occCount})}</p>
              )}
            </div>
          )}

          {/* Location / URL / Note */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 focus-within:border-[var(--border)]">
              <MapPin className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
              <input value={draft.location} onChange={e => upd({ location: e.target.value })} placeholder={tr('sched.location')}
                className="flex-1 h-11 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 focus-within:border-[var(--border)]">
              <LinkIcon className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
              <input value={draft.url} onChange={e => upd({ url: e.target.value })} placeholder="URL" inputMode="url"
                className="flex-1 h-11 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none" />
            </div>
            <textarea value={draft.description} onChange={e => upd({ description: e.target.value })} placeholder={tr('sched.note')} rows={2}
              className="w-full rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border)] resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] p-4 flex gap-2">
          <button onClick={onClose} className="h-11 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-bold text-[var(--text)] hover:text-[var(--text)] transition-colors">{tr('common.cancel')}</button>
          <button onClick={onCreate} disabled={!draft.title.trim()}
            className="flex-1 h-11 rounded-xl bg-[var(--primary)] text-white text-[13px] font-bold disabled:bg-[var(--border)] disabled:text-[var(--text-mute)] flex items-center justify-center gap-2 hover:opacity-90 transition-colors">
            <Plus className="w-4 h-4" /> {draft.editId ? tr('sched.saveBtn') : tr('sched.createBtn')}{!draft.editId && (draft.spanDays > 1 ? ` (${draft.spanDays})` : draft.recurrence !== 'none' ? ` (${occCount})` : '')}
          </button>
        </div>
      </div>
    </div>
  );
}
