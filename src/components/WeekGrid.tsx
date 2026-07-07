import { useRef, useState, useEffect, useCallback } from 'react';
import { format, isToday } from 'date-fns';
import { useT, useDateLocale } from '../i18n';
import type { Session } from '../types';
import { Repeat, GripVertical } from 'lucide-react';
import { SessionIcon } from './ui/IconPicker';
import { fmtDur } from '../utils/duration';

/*
 * WeekGrid — the week-mode calendar grid, rebuilt from scratch.
 *
 * Layout: ONE scroll container handles both axes. The day-header row is
 * sticky to the top, the hour column is sticky to the left (Google-Calendar
 * style), so neither is ever lost while panning around the grid on a phone.
 *
 * Geometry: drop targets are resolved from the *measured* rects of the day
 * columns, never from hard-coded pixel widths, so drag/tap targeting stays
 * correct at any breakpoint or zoom level.
 */

const HOUR_H = 52;      // px per hour
const SLOT = 15;        // snap granularity, minutes
const HEADER_H = 56;    // sticky day-header height
const TIME_COL = 48;    // sticky hour-column width
const DAY_MIN_W = 112;  // min day-column width on narrow screens

const LONG_PRESS_MS = 260;
const PRESS_CANCEL_PX = 16;

const snap = (min: number) => Math.round(min / SLOT) * SLOT;
const minToTime = (totalMin: number) =>
  `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

const LEGACY_LINKED_NOTES = new Set([
  'Linked session. Drag to reschedule.',
  'Связанная сессия. Перетащите, чтобы перенести.',
  'リンクされたセッション。ドラッグして予定を変更できます。',
]);
const cleanNote = (note?: string) => {
  const v = (note || '').trim();
  return LEGACY_LINKED_NOTES.has(v) ? '' : v;
};

// Side-by-side layout for overlapping timed sessions.
// Returns id → { col, cols }: column index and cluster width.
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

interface Props {
  days: Date[];
  sessions: Session[];
  weekOffset: number;
  startH: number;          // first visible hour
  rows: number;            // number of visible hour rows
  store: any;
  goalColor: (id: string) => string;
  goalEmoji: (id: string) => string;
  now: Date;
  onCreateAt: (dayIdx: number, startMin: number) => void;
}

export function WeekGrid({ days, sessions, weekOffset, startH, rows, store, goalColor, goalEmoji, now, onCreateAt }: Props) {
  const tr = useT();
  const locale = useDateLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [pressSid, setPressSid] = useState<string | null>(null);
  const [dragSid, setDragSid] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ dayIdx: number; min: number } | null>(null);
  const dragSession = dragSid ? sessions.find(s => s.id === dragSid) : undefined;

  const hShort = tr('common.hourShort');
  const fmtH = (min: number) => (min / 60) % 1 === 0 ? `${min / 60}${hShort}` : `${(min / 60).toFixed(1)}${hShort}`;

  /* ── Geometry from measured column rects ── */
  const dayIdxFromX = useCallback((x: number) => {
    let best = 0, bestDist = Infinity;
    colRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x < r.right) { best = i; bestDist = 0; return; }
      const d = Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }, []);

  const minFromY = useCallback((y: number) => {
    const el = colRefs.current.find(Boolean);
    if (!el) return startH * 60;
    const rel = ((y - el.getBoundingClientRect().top) / HOUR_H) * 60;
    return snap(Math.max(0, Math.min(rows * 60 - SLOT, rel))) + startH * 60;
  }, [startH, rows]);

  /* ── Auto-scroll: vertical to "now" (or grid start), horizontal to today ── */
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const todayIdx = days.findIndex(d => isToday(d));
    if (todayIdx >= 0) {
      const nowMin = now.getHours() * 60 + now.getMinutes() - startH * 60;
      sc.scrollTop = Math.max(0, (nowMin / 60) * HOUR_H - sc.clientHeight / 3);
      const col = colRefs.current[todayIdx];
      if (col) sc.scrollLeft = Math.max(0, col.offsetLeft - TIME_COL - 8);
    } else {
      sc.scrollTop = 0;
      sc.scrollLeft = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  /* ── Long-press drag / resize (touch) · immediate drag (mouse) ── */
  const draggedRef = useRef(false);
  const pressRef = useRef<{
    sid: string; startX: number; startY: number;
    origDur: number; kind: 'move' | 'resize'; armed: boolean; touch: boolean;
    timer: number; tgtDayIdx: number; tgtMin: number;
  } | null>(null);

  const armPress = (info: NonNullable<typeof pressRef.current>, el: HTMLElement, pointerId: number) => {
    info.armed = true;
    setPressSid(info.sid);
    try { el.setPointerCapture(pointerId); } catch { /* noop */ }
    if (info.touch && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
    if (info.kind === 'move') { setDragSid(info.sid); setGhost({ dayIdx: info.tgtDayIdx, min: info.tgtMin }); }
  };

  const onBlockPointerDown = (e: React.PointerEvent, s: Session) => {
    if (e.button && e.button !== 0) return;
    draggedRef.current = false;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const info = {
      sid: s.id, startX: e.clientX, startY: e.clientY,
      origDur: s.durationMinutes,
      kind: (e.clientY >= rect.bottom - 20 ? 'resize' : 'move') as 'move' | 'resize',
      armed: false, touch, timer: 0,
      tgtDayIdx: dayIdxFromX(e.clientX),
      tgtMin: s.startHour * 60 + (s.startMinute || 0),
    };
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
      info.tgtDayIdx = dayIdxFromX(e.clientX);
      info.tgtMin = minFromY(e.clientY);
      setGhost({ dayIdx: info.tgtDayIdx, min: info.tgtMin });
    } else {
      store.resizeSession(info.sid, Math.max(15, info.origDur + snap(Math.round((dy / HOUR_H) * 60))));
    }
  };

  const endBlockPress = (e: React.PointerEvent) => {
    const info = pressRef.current;
    if (!info) return;
    clearTimeout(info.timer);
    if (info.armed && info.kind === 'move') {
      const dateStr = format(days[info.tgtDayIdx], 'yyyy-MM-dd');
      store.moveSession(info.sid, dateStr, Math.floor(info.tgtMin / 60), info.tgtMin % 60);
    }
    if (info.armed) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      draggedRef.current = true;
    }
    pressRef.current = null;
    setPressSid(null); setDragSid(null); setGhost(null);
  };

  // Plain tap opens the session; the click trailing a drag is swallowed.
  const onBlockClick = (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    if (draggedRef.current) { draggedRef.current = false; return; }
    store.openSessionModal(sid);
  };

  /* ── Empty-slot create: double-click (mouse) or single tap (touch) ── */
  const isCoarse = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const createAtEvent = (e: React.MouseEvent, dayIdx: number) => onCreateAt(dayIdx, minFromY(e.clientY));
  const onColumnDouble = (e: React.MouseEvent, dayIdx: number) => createAtEvent(e, dayIdx);
  const onColumnClick = (e: React.MouseEvent, dayIdx: number) => { if (isCoarse()) createAtEvent(e, dayIdx); };

  /* ── Now indicator ── */
  const todayIdx = days.findIndex(d => isToday(d));
  const nowMin = now.getHours() * 60 + now.getMinutes() - startH * 60;
  const showNow = todayIdx >= 0 && nowMin >= 0 && nowMin <= rows * 60;
  const nowTop = (nowMin / 60) * HOUR_H;

  return (
    <div
      ref={scrollRef}
      className="card overflow-auto overscroll-contain min-w-0 h-[62dvh] md:h-auto md:flex-1 shrink-0"
      style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
    >
      {/*
        Sticky layout note: grid items can't be sticky (their containing block
        is their own grid area), so the sheet is two FLEX rows — a sticky-top
        header row and a body row with a sticky-left hour column. Both rows use
        identical column sizing (fixed time col + 7 equal flex columns), so
        they stay aligned.
      */}
      <div className="w-max min-w-full">
        {/* Header row (sticky top) */}
        <div className="flex sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)]" style={{ height: HEADER_H }}>
          {/* Corner (sticky left within the row) */}
          <div className="sticky left-0 z-10 shrink-0 bg-[var(--surface)] border-r border-[var(--border)]" style={{ width: TIME_COL }} />
          {days.map((day, di) => {
            const active = isToday(day);
            const dayMin = sessions.filter(s => s.date === format(day, 'yyyy-MM-dd')).reduce((a, s) => a + s.durationMinutes, 0);
            return (
              <div key={di} style={{ minWidth: DAY_MIN_W }}
                className={`flex-1 flex flex-col items-center justify-center border-l border-[var(--border)] ${active ? 'bg-[var(--primary)]/15' : ''}`}>
                <div className={`text-[11px] font-bold uppercase tracking-wider ${active ? 'text-[var(--primary)]' : 'text-[var(--text-dim)]'}`}>
                  {format(day, 'EEE', { locale })}
                </div>
                <div className={`text-[20px] leading-none font-bold mt-0.5 ${active ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
                  {format(day, 'd', { locale })}
                </div>
                {dayMin > 0 && <div className="text-[11px] text-[var(--text-dim)] mono mt-0.5">{fmtH(dayMin)}</div>}
              </div>
            );
          })}
        </div>

        {/* Body row: sticky-left hour column + 7 day columns */}
        <div className="flex relative" style={{ height: rows * HOUR_H }}>
          {/* Hour column (sticky left) */}
          <div className="sticky left-0 z-30 shrink-0 bg-[var(--surface)] border-r border-[var(--border)]" style={{ width: TIME_COL }}>
            {Array.from({ length: rows }, (_, i) => i + startH).map(h => (
              <div key={h} className="border-b border-[var(--surface)] pr-1.5 text-right text-[11px] text-[var(--text-dim)] mono pt-1" style={{ height: HOUR_H }}>
                {(h - startH) % 2 === 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
            {showNow && (
              <div className="absolute left-0 right-0 pointer-events-none z-10" style={{ top: nowTop - 7 }}>
                <div className="text-right pr-1 text-[11px] font-bold text-red-500 mono leading-none bg-[var(--surface)]">
                  {minToTime(now.getHours() * 60 + now.getMinutes())}
                </div>
              </div>
            )}
          </div>

          {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const daySessions = sessions
            .filter(s => s.date === dateStr)
            .sort((a, b) => (a.startHour * 60 + (a.startMinute || 0)) - (b.startHour * 60 + (b.startMinute || 0)));
          const active = isToday(day);
          const timed = daySessions.filter(s => !s.allDay);
          const layout = layoutDay(timed);

          return (
            <div
              key={dayIdx}
              ref={el => { colRefs.current[dayIdx] = el; }}
              style={{ minWidth: DAY_MIN_W }}
              className={`flex-1 relative border-l border-[var(--border)] ${active ? 'bg-[var(--primary)]/[.02]' : ''}`}
              onDoubleClick={(e) => onColumnDouble(e, dayIdx)}
              onClick={(e) => onColumnClick(e, dayIdx)}
              title={tr('sched.dblCreate')}
            >
              {/* Hour rows with 15-min guides */}
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="border-b border-[var(--surface)] relative" style={{ height: HOUR_H }}>
                  <div className="absolute top-1/4 left-0 right-0 border-b border-dashed border-[var(--surface)]" />
                  <div className="absolute top-1/2 left-0 right-0 border-b border-[var(--border)]" />
                  <div className="absolute top-3/4 left-0 right-0 border-b border-dashed border-[var(--surface)]" />
                </div>
              ))}

              {/* Ghost preview while dragging */}
              {ghost?.dayIdx === dayIdx && dragSession && (
                <div
                  className="absolute left-1 right-1 rounded-lg border-2 border-dashed border-[var(--primary)]/60 bg-[var(--primary)]/10 pointer-events-none z-10 flex items-center justify-center"
                  style={{
                    top: ((ghost.min - startH * 60) / 60) * HOUR_H,
                    height: Math.max(20, (dragSession.durationMinutes / 60) * HOUR_H - 4),
                  }}
                >
                  <span className="text-[10px] font-bold text-[var(--primary)] mono">{minToTime(ghost.min)}</span>
                </div>
              )}

              {/* All-day banners pinned at top */}
              {daySessions.filter(s => s.allDay).map((s, ai) => {
                const color = s.color || goalColor(s.goalId);
                return (
                  <div key={s.id} onClick={(e) => { e.stopPropagation(); store.openSessionModal(s.id); }}
                    className={`absolute left-1.5 right-1.5 rounded-md px-2 flex items-center z-20 cursor-pointer overflow-hidden ${s.status === 'done' ? 'opacity-50' : ''}`}
                    style={{ top: 2 + ai * 22, height: 20, background: `${color}dd`, borderLeft: `3px solid ${color}` }}>
                    <span className="text-[11px] font-bold text-[var(--text)] truncate leading-none">{s.title}</span>
                  </div>
                );
              })}

              {/* Timed session blocks */}
              {timed.map(s => {
                const color = s.color || (s.sessionType === 'checkpoint' ? '#ef4444' : goalColor(s.goalId));
                const topMin = s.startHour * 60 + (s.startMinute || 0) - startH * 60;
                const top = (topMin / 60) * HOUR_H;
                const height = Math.max(20, (s.durationMinutes / 60) * HOUR_H - 2);
                const isDragging = dragSid === s.id;
                const lay = layout[s.id] || { col: 0, cols: 1 };

                return (
                  <div
                    key={s.id}
                    onClick={(e) => onBlockClick(e, s.id)}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => onBlockPointerDown(e, s)}
                    onPointerMove={onBlockPointerMove}
                    onPointerUp={endBlockPress}
                    onPointerCancel={endBlockPress}
                    className={`absolute rounded-lg overflow-hidden group transition-shadow z-10 ${
                      isDragging ? 'opacity-30 scale-95' : 'hover:z-20 hover:shadow-xl'
                    } ${pressSid === s.id ? 'z-30 shadow-2xl ring-2 ring-[var(--primary)]' : ''} ${s.status === 'done' ? 'opacity-50' : ''}`}
                    style={{
                      top,
                      height,
                      left: `calc(${(lay.col / lay.cols) * 100}% + 3px)`,
                      width: `calc(${100 / lay.cols}% - 4px)`,
                      background: `${color}${s.status === 'done' ? '44' : 'dd'}`,
                      borderLeft: `3px solid ${color}`,
                      cursor: pressSid === s.id ? 'grabbing' : 'grab',
                      touchAction: pressSid === s.id ? 'none' : 'pan-x pan-y',
                    }}
                  >
                    <div className="absolute top-0 left-0 right-0 h-3 flex items-center justify-center opacity-0 group-hover:opacity-50 cursor-grab">
                      <GripVertical className="w-3 h-3 text-[var(--text)]" />
                    </div>

                    <div className="px-2 py-1 h-full flex flex-col">
                      <div className={`text-[11px] font-bold ${s.status === 'done' ? 'text-[var(--text)]' : 'text-white'} truncate leading-tight flex items-center gap-1`}>
                        {s.seriesId && <Repeat className="w-2.5 h-2.5 shrink-0 opacity-80" />}
                        {s.icon ? <SessionIcon name={s.icon} className="w-3 h-3 shrink-0" /> : <span>{goalEmoji(s.goalId)}</span>} {s.title}
                      </div>
                      {height > 34 && (
                        <div className={`mono text-[11px] ${s.status === 'done' ? 'text-[var(--text-dim)]' : 'text-white/70'} mt-0.5`}>
                          {String(s.startHour).padStart(2, '0')}:{String(s.startMinute || 0).padStart(2, '0')} · {fmtDur(s.durationMinutes, store.lang)}
                        </div>
                      )}
                      {height > 55 && cleanNote(s.description) && (
                        <div className={`text-[11px] ${s.status === 'done' ? 'text-[var(--text-dim)]' : 'text-white/60'} mt-1 line-clamp-2 leading-snug`}>
                          {cleanNote(s.description)}
                        </div>
                      )}
                    </div>

                    {/* Resize affordance (bottom edge) */}
                    <div className="absolute bottom-0 left-0 right-0 h-5 flex items-end justify-center pb-1 pointer-events-none">
                      <span className={`w-8 h-1 rounded-full ${s.status === 'done' ? 'bg-[var(--text-mute)]/40' : 'bg-white/45'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

          {/* Now line across the day area */}
          {showNow && (
            <div className="absolute right-0 flex items-center pointer-events-none z-20" style={{ top: nowTop, left: TIME_COL }}>
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.6)] -ml-1" />
              <div className="h-[1.5px] flex-1 bg-red-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
