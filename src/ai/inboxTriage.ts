import { format } from 'date-fns';
import type { GTDTask, Goal, Priority } from '../types';
import { llmJson } from './llm';

// ─── AI inbox triage: suggest priority / date / bucket per unsorted task ────

export interface TriageSuggestion {
  id: string;
  priority: Priority;
  dueDate?: string;               // 'yyyy-MM-dd'
  status: 'next-action' | 'someday-maybe' | 'scheduled';
  goalId?: string;
  reason: string;                 // one short sentence, user's language
}

const LANG_NAME: Record<string, string> = { en: 'English', ru: 'Russian', ja: 'Japanese' };

export async function requestInboxTriage(tasks: GTDTask[], goals: Goal[], lang: string, now: Date = new Date()): Promise<TriageSuggestion[]> {
  const today = format(now, 'yyyy-MM-dd');
  const payload = {
    today,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, notes: t.notes || undefined, createdAt: t.createdAt.slice(0, 10) })),
    goals: goals.filter(g => (g.status ?? 'active') === 'active').map(g => ({ id: g.id, title: g.title, category: g.category })),
  };
  const out = await llmJson<{ suggestions: TriageSuggestion[] }>({
    system:
      'You are a GTD assistant sorting a user\'s inbox. For EVERY task, suggest: ' +
      'priority (1 urgent-important … 4 minor), status ("next-action" for actionable soon, "scheduled" if it clearly belongs to a specific date, "someday-maybe" for vague ideas), ' +
      'dueDate (yyyy-MM-dd, ONLY if the title implies a real deadline or you chose "scheduled"; never in the past), ' +
      'goalId (ONLY if the task obviously advances one of the user\'s goals), ' +
      `and reason — one short sentence in ${LANG_NAME[lang] || 'English'} explaining the choice. ` +
      'Respond ONLY with JSON {"suggestions": [{"id","priority","status","dueDate","goalId","reason"}]}. Use the exact task ids given.',
    prompt: JSON.stringify(payload),
    temperature: 0.3,
  });
  const byId = new Set(tasks.map(t => t.id));
  const goalIds = new Set(goals.map(g => g.id));
  const statuses = new Set(['next-action', 'someday-maybe', 'scheduled']);
  const res: TriageSuggestion[] = [];
  for (const s of out?.suggestions || []) {
    if (!s || !byId.has(s.id)) continue;
    const priority = Math.min(Math.max(Math.round(Number(s.priority)) || 3, 1), 4) as Priority;
    const status = statuses.has(s.status) ? s.status : 'next-action';
    let dueDate = typeof s.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dueDate) ? s.dueDate : undefined;
    if (dueDate && dueDate < today) dueDate = today;
    res.push({
      id: s.id,
      priority,
      status,
      dueDate,
      goalId: s.goalId && goalIds.has(s.goalId) ? s.goalId : undefined,
      reason: typeof s.reason === 'string' ? s.reason : '',
    });
  }
  if (!res.length) throw new Error('no suggestions');
  return res;
}
