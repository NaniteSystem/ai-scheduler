import type { LifeBlock } from '../types.ts';
import { migrateLegacyProjects } from '../domain/projects.ts';

export const CURRENT_STORE_VERSION = 11;

export const DEFAULT_LIFE_BLOCKS: LifeBlock[] = [
  { id:'sleep', label:'Sleep', emoji:'😴', color:'#6366f1', category:'essential', hoursPerDay:8, minHours:4, maxHours:14, recommended:8, enabled:true, flexible:false, fixedTime:'23:00', description:'Quality rest is the foundation of productivity' },
  { id:'breakfast', label:'Breakfast', emoji:'🍳', color:'#f59e0b', category:'essential', hoursPerDay:0.5, minHours:0, maxHours:1.5, recommended:0.5, enabled:true, flexible:true, fixedTime:'07:30', description:'Morning fuel' },
  { id:'lunch', label:'Lunch', emoji:'🥗', color:'#84cc16', category:'essential', hoursPerDay:0.75, minHours:0, maxHours:1.5, recommended:0.75, enabled:true, flexible:true, fixedTime:'13:00', description:'Midday meal' },
  { id:'dinner', label:'Dinner', emoji:'🍽️', color:'#ef4444', category:'essential', hoursPerDay:1, minHours:0, maxHours:2, recommended:1, enabled:true, flexible:true, fixedTime:'19:00', description:'Evening meal' },
  { id:'exercise', label:'Exercise', emoji:'💪', color:'#10b981', category:'wellbeing', hoursPerDay:1, minHours:0, maxHours:3, recommended:1, enabled:true, flexible:true, description:'Physical health & energy' },
  { id:'friends', label:'Friends & Social', emoji:'🤝', color:'#ec4899', category:'social', hoursPerDay:1, minHours:0, maxHours:5, recommended:1, enabled:true, flexible:true, description:'Time with people you love' },
  { id:'relax', label:'Relax & Recharge', emoji:'☕', color:'#0ea5e9', category:'wellbeing', hoursPerDay:1.5, minHours:0.5, maxHours:5, recommended:1.5, enabled:true, flexible:true, description:'Downtime to avoid burnout' },
  { id:'commute', label:'Commute / Transit', emoji:'🚗', color:'#737373', category:'buffer', hoursPerDay:0.5, minHours:0, maxHours:3, recommended:0.5, enabled:false, flexible:false, description:'Travel time between places' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const localDateKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Shared by Zustand hydration and raw {state, version} recovery imports. */
export function migratePersistedState(persisted: unknown, version: number, today = new Date()): unknown {
  if (!isRecord(persisted)) return persisted;

  if (version < 2) {
    return { ...persisted, goals: [], sessions: [], gtdTasks: [], userName: '', onboarded: false };
  }

  const next: Record<string, unknown> = { ...persisted };

  if (version < 3 && Array.isArray(next.sessions)) {
    next.sessions = next.sessions.map((session) => isRecord(session) ? {
      ...session,
      tasks: Array.isArray(session.tasks) ? session.tasks : [],
      startHour: Number.isFinite(session.startHour) ? session.startHour : 9,
      startMinute: Number.isFinite(session.startMinute) ? session.startMinute : 0,
      durationMinutes: Number.isFinite(session.durationMinutes) ? session.durationMinutes : 60,
    } : session);
  }
  if (version < 4) {
    next.introCourseCompleted = !!next.onboarded;
  }
  if (version < 5 && isRecord(next.schedulePrefs)) {
    const prefs: Record<string, unknown> = { ...next.schedulePrefs };
    const existing = Array.isArray(prefs.lifeBlocks) ? prefs.lifeBlocks : [];
    const lifeBlocks: unknown[] = DEFAULT_LIFE_BLOCKS.map((def) => {
      const current = existing.find((block) => isRecord(block) && block.id === def.id);
      if (!isRecord(current)) return { ...def };
      const merged = { ...def, ...current, minHours: def.minHours, maxHours: def.maxHours };
      merged.hoursPerDay = Math.min(Math.max(Number(merged.hoursPerDay) || def.recommended, def.minHours), def.maxHours);
      return merged;
    });
    for (const block of existing) {
      if (isRecord(block) && !lifeBlocks.some((candidate) => isRecord(candidate) && candidate.id === block.id)) lifeBlocks.push(block);
    }
    prefs.lifeBlocks = lifeBlocks;
    if (!Array.isArray(prefs.commitments)) prefs.commitments = [];
    next.schedulePrefs = prefs;
  }
  if (version < 6 && Array.isArray(next.habits)) {
    next.habits = next.habits.map((habit) => {
      if (!isRecord(habit) || !isRecord(habit.log) || !(Number(habit.targetCount) > 1)) return habit;
      let changed = false;
      const log: Record<string, unknown> = { ...habit.log };
      for (const key of Object.keys(log)) {
        const entry = log[key];
        if (isRecord(entry) && entry.status === 'failed' && Number(entry.count) > 0 && Number(entry.count) < Number(habit.targetCount)) {
          log[key] = { ...entry, status: 'partial' };
          changed = true;
        }
      }
      return changed ? { ...habit, log } : habit;
    });
  }
  if (version < 7 && Array.isArray(next.sessions)) {
    const taskBySession = new Map(
      (Array.isArray(next.gtdTasks) ? next.gtdTasks : [])
        .filter((task): task is Record<string, unknown> => isRecord(task) && typeof task.id === 'string' && typeof task.sessionId === 'string')
        .map((task) => [task.sessionId as string, task.id as string]),
    );
    next.sessions = next.sessions.map((session) => {
      if (!isRecord(session)) return session;
      const legacyPlanId = typeof session.seriesId === 'string' && /^(plan|arch)-/.test(session.seriesId) ? session.seriesId : undefined;
      const migrated: Record<string, unknown> = { ...session };
      const taskId = typeof session.taskId === 'string' ? session.taskId : taskBySession.get(String(session.id));
      if (taskId) migrated.taskId = taskId;
      if (legacyPlanId) {
        migrated.planId = legacyPlanId;
        delete migrated.seriesId;
      }
      return migrated;
    });
  }
  if (version < 8 && Array.isArray(next.gtdTasks)) {
    const retired = new Set(['project', 'waiting-for', 'reference']);
    next.gtdTasks = next.gtdTasks.map((task) => isRecord(task) && retired.has(String(task.status))
      ? { ...task, status: 'someday-maybe' }
      : task);
  }
  if (version < 9 && Array.isArray(next.gtdTasks)) {
    const dateKey = localDateKey(today);
    next.gtdTasks = next.gtdTasks.map((task) => {
      if (!isRecord(task) || !task.isTodayFocus || task.todayFocusDate) return task;
      const migrated: Record<string, unknown> = { ...task, todayFocusDate: dateKey };
      delete migrated.isTodayFocus;
      return migrated;
    });
  }
  if (version < 10 && !Array.isArray(next.habitGroups)) next.habitGroups = [];
  if (version < 11) {
    const migrated = migrateLegacyProjects(next.projects, next.gtdTasks);
    next.projects = migrated.projects;
    next.gtdTasks = migrated.gtdTasks;
  }

  return next;
}
