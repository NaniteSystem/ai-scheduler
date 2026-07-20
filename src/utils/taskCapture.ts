import type { GTDTask, Priority, TaskContext } from '../types';
import { extractNLDate } from './nlDate.ts';

export interface ParsedTaskCapture {
  title: string;
  priority?: Priority;
  context?: TaskContext;
  durationMinutes?: number;
  tags?: string[];
  dueDate?: string;
  remindAt?: string;
  recurring?: GTDTask['recurring'];
}

/** Parse compact task syntax without coupling fast capture to the GTD screen. */
export function parseTaskCapture(input: string): ParsedTaskCapture {
  let priority: Priority | undefined;
  let context: TaskContext | undefined;
  let durationMinutes: number | undefined;
  let tags: string[] = [];

  const nl = extractNLDate(input);
  let title = nl.title;
  const { dueDate, remindAt, recurring } = nl;

  const priorityMatch = title.match(/\b(p[1-4]|!!!|!!|!)\b/i);
  if (priorityMatch) {
    const value = priorityMatch[1].toLowerCase();
    priority = value === 'p1' || value === '!!!' ? 1 : value === 'p2' || value === '!!' ? 2 : value === 'p3' || value === '!' ? 3 : 4;
    title = title.replace(priorityMatch[0], '').trim();
  }
  const contextMatch = title.match(/@(home|work|phone|computer|errand|anywhere)/i);
  if (contextMatch) {
    context = `@${contextMatch[1].toLowerCase()}` as TaskContext;
    title = title.replace(contextMatch[0], '').trim();
  }
  // Keep capture language-agnostic: people naturally type "30m", "30 мин"
  // or "2 часа" depending on their keyboard and current app language.
  const durationMatch = title.match(/(\d+)\s*(m|min(?:ute)?s?|h|hr|hrs?|hours?|мин(?:ут[аы]?)?|м|ч(?:ас(?:а|ов)?)?)(?=\s|$|[,.])/iu);
  if (durationMatch) {
    const value = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    durationMinutes = /^(h|hr|hrs|hour|hours|ч)/.test(unit) ? value * 60 : value;
    title = title.replace(durationMatch[0], '').trim();
  }
  const tagMatches = title.match(/#[\p{L}\p{N}_-]+/gu);
  if (tagMatches) {
    tags = tagMatches.map(tag => tag.slice(1));
    title = title.replace(/#[\p{L}\p{N}_-]+/gu, '').trim();
  }

  return { title: title.trim() || input, priority, context, durationMinutes, tags, dueDate, remindAt, recurring };
}
