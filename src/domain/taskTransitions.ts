import { addDays, addMonths, addWeeks, format, isWeekend, parseISO } from 'date-fns';
import type { GTDStatus, GTDTask, RecurringPattern, Session } from '../types.ts';
import { createId } from './id.ts';

export interface TaskSessionState {
  gtdTasks: GTDTask[];
  sessions: Session[];
}

/** Next future occurrence for a recurring task. */
export function nextDueDate(base: string | undefined, pattern: RecurringPattern, today: Date = new Date()): string {
  const step = (from: Date): Date => {
    switch (pattern) {
      case 'daily': return addDays(from, 1);
      case 'weekly': return addWeeks(from, 1);
      case 'monthly': return addMonths(from, 1);
      case 'weekdays': {
        let date = addDays(from, 1);
        while (isWeekend(date)) date = addDays(date, 1);
        return date;
      }
      case 'weekends': {
        let date = addDays(from, 1);
        while (!isWeekend(date)) date = addDays(date, 1);
        return date;
      }
      default: return addWeeks(from, 1);
    }
  };
  const todayKey = format(today, 'yyyy-MM-dd');
  let date = step(base ? parseISO(base) : today);
  while (format(date, 'yyyy-MM-dd') <= todayKey) date = step(date);
  return format(date, 'yyyy-MM-dd');
}

export function linkedTaskId(session: Session, tasks: GTDTask[]): string | undefined {
  return session.taskId || tasks.find(task => task.sessionId === session.id)?.id;
}

/** Canonical task status transition, including recurrence and linked calendar time. */
export function transitionTaskStatus(
  state: TaskSessionState,
  taskId: string,
  status: GTDStatus,
  patch: Partial<GTDTask> = {},
  now: Date = new Date(),
  idFactory: (prefix: string) => string = createId,
): TaskSessionState {
  const original = state.gtdTasks.find(task => task.id === taskId);
  if (!original) return state;

  const timestamp = now.toISOString();
  const completedAt = status === 'done' ? (original.completedAt || timestamp) : undefined;
  // A task only remains scheduled while its reservation exists in the calendar.
  // Moving it back to Inbox/Next/Later must not leave a ghost time block behind.
  const unschedule = status !== 'scheduled' && status !== 'done' && !!linkedSessionIdForTask(original, state.sessions);
  const tasks = state.gtdTasks.map(task => task.id === taskId
    ? {
        ...task,
        ...patch,
        ...(unschedule ? { sessionId: undefined, scheduledDate: undefined } : {}),
        status,
        processedAt: timestamp,
        updatedAt: timestamp,
        completedAt,
      }
    : task);
  const sessions = status === 'done'
    ? state.sessions.map(session => session.taskId === taskId || session.id === original.sessionId
      ? { ...session, status: 'done' as const }
      : session)
    : unschedule
      ? state.sessions.filter(session => session.taskId !== taskId && session.id !== original.sessionId)
    : state.sessions;

  if (status !== 'done' || original.status === 'done' || !original.recurring) {
    return { gtdTasks: tasks, sessions };
  }

  const dueDate = nextDueDate(original.recurFromCompletion ? undefined : original.dueDate, original.recurring, now);
  const next: GTDTask = {
    ...original,
    id: idFactory('task'),
    sessionId: undefined,
    status: 'next-action',
    createdAt: timestamp,
    updatedAt: timestamp,
    processedAt: undefined,
    completedAt: undefined,
    scheduledDate: undefined,
    dueDate,
    remindAt: original.remindAt && original.dueDate
      ? `${dueDate}T${original.remindAt.slice(11, 16) || '09:00'}`
      : undefined,
    todayFocusDate: undefined,
    isTodayFocus: undefined,
    completedPomodoros: 0,
    subtasks: (original.subtasks || []).map(subtask => ({ ...subtask, done: false })),
  };
  return { gtdTasks: [next, ...tasks], sessions };
}

function linkedSessionIdForTask(task: GTDTask, sessions: Session[]): string | undefined {
  return task.sessionId || sessions.find(session => session.taskId === task.id)?.id;
}

/** Update a session and synchronize its explicitly linked task through one path. */
export function transitionSession(
  state: TaskSessionState,
  sessionId: string,
  patch: Partial<Session>,
  now: Date = new Date(),
): TaskSessionState {
  const before = state.sessions.find(session => session.id === sessionId);
  if (!before) return state;
  const after = { ...before, ...patch };
  const taskId = linkedTaskId(after, state.gtdTasks);
  let next: TaskSessionState = {
    sessions: state.sessions.map(session => session.id === sessionId ? after : session),
    gtdTasks: state.gtdTasks,
  };
  if (!taskId) return next;

  const timestamp = now.toISOString();
  next = {
    ...next,
    gtdTasks: next.gtdTasks.map(task => task.id !== taskId ? task : {
      ...task,
      sessionId,
      title: after.title || task.title,
      description: after.description || task.description,
      durationMinutes: after.durationMinutes || task.durationMinutes,
      scheduledDate: after.date || task.scheduledDate,
      status: task.status === 'done' || task.status === 'trash' ? task.status : 'scheduled',
      updatedAt: timestamp,
    }),
  };

  if (after.status === 'done' && before.status !== 'done') {
    return transitionTaskStatus(next, taskId, 'done', {}, now);
  }
  if (before.status === 'done' && after.status !== 'done') {
    const task = next.gtdTasks.find(item => item.id === taskId);
    if (task?.status === 'done' && !task.recurring) {
      next = {
        ...next,
        gtdTasks: next.gtdTasks.map(item => item.id === taskId
          ? { ...item, status: 'scheduled', completedAt: undefined, updatedAt: timestamp }
          : item),
      };
    }
  }
  return next;
}

/** Delete time allocations without silently deleting a user's original task. */
export function removeSessions(state: TaskSessionState, sessionIds: Set<string>, now: Date = new Date()): TaskSessionState {
  if (!sessionIds.size) return state;
  const removed = state.sessions.filter(session => sessionIds.has(session.id));
  if (!removed.length) return state;
  const linkedTaskIds = new Set(removed.map(session => linkedTaskId(session, state.gtdTasks)).filter(Boolean) as string[]);
  const timestamp = now.toISOString();

  const gtdTasks = state.gtdTasks
    .filter(task => !(task.sessionId && sessionIds.has(task.sessionId) && task.id === `t-${task.sessionId}`))
    .map(task => {
      if (!linkedTaskIds.has(task.id) && !(task.sessionId && sessionIds.has(task.sessionId))) return task;
      return {
        ...task,
        sessionId: undefined,
        scheduledDate: undefined,
        status: task.status === 'scheduled' ? 'next-action' as const : task.status,
        updatedAt: timestamp,
      };
    });

  return { sessions: state.sessions.filter(session => !sessionIds.has(session.id)), gtdTasks };
}
