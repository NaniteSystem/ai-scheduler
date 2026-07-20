import { addDays, addMonths, addWeeks, format, isWeekend, parseISO } from 'date-fns';
import type { RecurringPattern, Session } from '../types.ts';
import { createId } from './id.ts';

// Recurring session series are materialized ~8 weeks at creation time (see
// ScheduleView's expandRecurrence) and otherwise just stop — the user sees no
// signal that "every Monday" quietly ran out. This keeps each series topped up
// to a rolling horizon by cloning the most recent occurrence forward.

const HORIZON_DAYS = 60;          // keep each series filled this far into the future
const REFILL_THRESHOLD_DAYS = 21; // only bother extending once the tail is closer than this

function stepDate(date: Date, pattern: RecurringPattern): Date {
  switch (pattern) {
    case 'daily': return addDays(date, 1);
    case 'weekly': return addWeeks(date, 1);
    case 'monthly': return addMonths(date, 1);
    case 'weekdays': { let d = addDays(date, 1); while (isWeekend(d)) d = addDays(d, 1); return d; }
    case 'weekends': { let d = addDays(date, 1); while (!isWeekend(d)) d = addDays(d, 1); return d; }
    default: return addWeeks(date, 1);
  }
}

/**
 * Returns NEW sessions to append so every active recurring series reaches the
 * rolling horizon. Pure and idempotent — safe to call on every load. 'custom'
 * (explicit weekday picks) is skipped: the weekday set isn't stored on the
 * session, so it can't be reconstructed here.
 */
export function extendRecurringSeries(sessions: Session[], today: Date = new Date(), idFactory: (prefix: string) => string = createId): Session[] {
  const bySeries = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!s.seriesId || !s.recurrence || s.recurrence === 'custom') continue;
    (bySeries.get(s.seriesId) ?? bySeries.set(s.seriesId, []).get(s.seriesId)!).push(s);
  }

  const todayKey = format(today, 'yyyy-MM-dd');
  const refillBy = format(addDays(today, REFILL_THRESHOLD_DAYS), 'yyyy-MM-dd');
  const horizon = addDays(today, HORIZON_DAYS);
  const added: Session[] = [];

  for (const group of bySeries.values()) {
    if (group.length < 2) continue; // a single instance isn't a materialized series yet
    const last = [...group].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    if (last.date < todayKey || last.date >= refillBy) continue; // already lapsed, or not close to running out

    let cursor = parseISO(last.date);
    while (true) {
      cursor = stepDate(cursor, last.recurrence!);
      if (cursor > horizon) break;
      added.push({ ...last, id: idFactory('session'), date: format(cursor, 'yyyy-MM-dd'), status: 'planned', progressLog: undefined });
    }
  }
  return added;
}
