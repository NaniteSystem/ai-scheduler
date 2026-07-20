import { format } from 'date-fns';
import type { GTDTask } from '../types.ts';

export const todayFocusKey = (date: Date = new Date()): string => format(date, 'yyyy-MM-dd');

/** A My Day choice belongs to one calendar day; it never silently rolls over. */
export function hasTodayFocus(task: GTDTask, dateKey: string = todayFocusKey()): boolean {
  return task.todayFocusDate === dateKey;
}
