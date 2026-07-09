import { format } from 'date-fns';
import type { Session, GTDTask, Habit, Goal } from '../types';
import { habitDueOn } from '../store';
import { llmJson } from './llm';

// ─── AI weekly review: deterministic stats + LLM narrative ─────────────────

export interface WeekStats {
  weekLabel: string;
  sessionsDone: number;
  sessionsPlanned: number;
  hoursLogged: number;
  tasksCompleted: number;
  tasksOverdue: number;
  habitPct: number | null;        // 0..100 completion across due habit-days
  goals: { title: string; hours: number; progressNote?: string }[];
  staleTasks: string[];           // open tasks untouched > 14 days (titles, max 5)
}

export function collectWeekStats(sessions: Session[], tasks: GTDTask[], habits: Habit[], goals: Goal[], now: Date = new Date()): WeekStats {
  const from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  const fromKey = format(from, 'yyyy-MM-dd');
  const nowKey = format(now, 'yyyy-MM-dd');
  const inWeek = (d?: string) => !!d && d.slice(0, 10) >= fromKey && d.slice(0, 10) <= nowKey;

  const weekSessions = sessions.filter(s => inWeek(s.date));
  const done = weekSessions.filter(s => s.status === 'done');

  let habitDue = 0, habitDone = 0;
  for (const h of habits) {
    if (h.archived) continue;
    for (let i = 0; i < 7; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i);
      if (d > now || !habitDueOn(h, d)) continue;
      const e = h.log[format(d, 'yyyy-MM-dd')];
      if (e?.status === 'rest') continue;
      habitDue++;
      if (e?.status === 'done') habitDone++;
    }
  }

  const open = tasks.filter(t => t.status !== 'done' && t.status !== 'trash' && !t.isArchived);
  const staleCut = new Date(now); staleCut.setDate(staleCut.getDate() - 14);
  const stale = open
    .filter(t => new Date(t.updatedAt || t.createdAt) < staleCut)
    .slice(0, 5).map(t => t.title);

  return {
    weekLabel: `${format(from, 'd MMM')} – ${format(now, 'd MMM yyyy')}`,
    sessionsDone: done.length,
    sessionsPlanned: weekSessions.length,
    hoursLogged: +(done.reduce((a, s) => a + s.durationMinutes, 0) / 60).toFixed(1),
    tasksCompleted: tasks.filter(t => t.status === 'done' && inWeek(t.completedAt)).length,
    tasksOverdue: open.filter(t => t.dueDate && t.dueDate < nowKey).length,
    habitPct: habitDue === 0 ? null : Math.round((habitDone / habitDue) * 100),
    goals: goals.filter(g => (g.status ?? 'active') === 'active').map(g => ({
      title: g.title,
      hours: +(done.filter(s => s.goalId === g.id).reduce((a, s) => a + s.durationMinutes, 0) / 60).toFixed(1),
    })),
    staleTasks: stale,
  };
}

export interface WeeklyReviewText {
  summary: string;
  wins: string[];
  concerns: string[];
  suggestions: string[];
}

const LANG_NAME: Record<string, string> = { en: 'English', ru: 'Russian', ja: 'Japanese' };

export async function requestWeeklyReview(stats: WeekStats, lang: string, profile?: { focus: string[]; struggles: string[] } | null): Promise<WeeklyReviewText> {
  const payload = profile && (profile.focus?.length || profile.struggles?.length)
    ? { ...stats, userProfile: { focus: profile.focus, struggles: profile.struggles } }
    : stats;
  const out = await llmJson<WeeklyReviewText>({
    system:
      'You are a pragmatic productivity coach reviewing a user\'s week in their planner app. ' +
      'Given their real stats as JSON, write a short honest review. Be specific — reference actual numbers, goals and stale tasks. ' +
      'If a userProfile with focus areas/struggles is present, angle the advice toward them. ' +
      'No flattery, no generic advice. 2-4 items per list, one sentence each. ' +
      `Respond ONLY with JSON {"summary": string (2-3 sentences), "wins": string[], "concerns": string[], "suggestions": string[]} in ${LANG_NAME[lang] || 'English'}.`,
    prompt: JSON.stringify(payload),
    temperature: 0.4,
  });
  if (!out || typeof out.summary !== 'string') throw new Error('bad review');
  const arr = (a: unknown) => Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 4) : [];
  return { summary: out.summary, wins: arr(out.wins), concerns: arr(out.concerns), suggestions: arr(out.suggestions) };
}
