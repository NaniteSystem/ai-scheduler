import { addDays, format } from 'date-fns';
import type { PlanInput, GeneratedPlan, PlanHorizon } from '../types';
import { generateRangePlan } from './engine';

// ─── Provider seam ──────────────────────────────────────────────────────────
// The UI, preview, and commit pipeline all talk to this interface only. A real
// AI provider (Claude/OpenAI) becomes one more entry in `providers` with no
// changes elsewhere — it builds a prompt from the same PlanInput, parses the
// response into a GeneratedPlan, and falls back to rule-based on failure.

export interface SchedulerProvider {
  id: string;
  label: string;
  generate(input: PlanInput): Promise<GeneratedPlan>;
}

export const ruleBasedProvider: SchedulerProvider = {
  id: 'rule-based',
  label: 'Rule-based',
  generate: async (input) => generateRangePlan(input),
};

export const providers: Record<string, SchedulerProvider> = {
  'rule-based': ruleBasedProvider,
};

export const getProvider = (id?: string): SchedulerProvider => providers[id || 'rule-based'] || ruleBasedProvider;

/** Date range (inclusive) for a horizon starting today. */
export function horizonRange(horizon: PlanHorizon, from: Date = new Date()): { start: string; end: string } {
  const weeks = horizon === '1w' ? 1 : horizon === '2w' ? 2 : horizon === '3w' ? 3 : 4;
  return { start: format(from, 'yyyy-MM-dd'), end: format(addDays(from, weeks * 7 - 1), 'yyyy-MM-dd') };
}

export { generateRangePlan } from './engine';
