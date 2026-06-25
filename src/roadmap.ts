import { parseISO } from 'date-fns';
import type { Category } from './types';

// ─── Goal → Roadmap generator ───────────────────────────────────────────────
// Pure, deterministic, framework-free so it can be unit-tested and later swapped
// for a real AI provider behind the same signature (see ai-scheduler-multiweek spec).
// It returns structured data (i18n keys + numbers); the UI resolves keys to text in
// the user's language, so stored milestone titles are real localized strings.

export type GoalLevel = 'beginner' | 'intermediate' | 'advanced';

export interface RoadmapInput {
  category: Category;
  title: string;
  motivation?: string;
  level?: GoalLevel;
  outcome?: string;
  completionType: 'hours' | 'date';
  deadline?: string;          // 'yyyy-MM-dd' (date mode)
  totalHours?: number;        // hours mode
  hoursPerWeek: number;       // available weekly budget
  today?: Date;
}

export interface RoadmapPhase {
  titleKey: string;           // i18n key, resolved by the UI
  targetValue: number;        // cumulative hours by the end of this phase
}

export interface GeneratedRoadmap {
  phases: RoadmapPhase[];
  totalHoursEstimated: number;
  hoursPerWeekTarget: number;
  starterKeys: { key: string; durationMinutes: number }[];
  insight: { key: string; vars: Record<string, string | number> };
}

// Ordered narrative arc. The window we slice depends on the learner's level.
const PHASE_POOL = [
  'roadmap.phaseFoundations',
  'roadmap.phaseCore',
  'roadmap.phaseDeepen',
  'roadmap.phaseApply',
  'roadmap.phaseRefine',
  'roadmap.phaseConsistency',
  'roadmap.phaseAssess',
  'roadmap.phaseMastery',
] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Build a phased roadmap + hour budget from the wizard answers. */
export function generateRoadmap(input: RoadmapInput): GeneratedRoadmap {
  const today = input.today ?? new Date();
  const hoursPerWeek = Math.max(0.5, Math.round((input.hoursPerWeek || 3) * 2) / 2);

  // Total hours: explicit for hours-goals; derived from pace × weeks for date-goals.
  let totalHours: number;
  if (input.completionType === 'date' && input.deadline) {
    const weeks = Math.max(1, Math.ceil((parseISO(input.deadline).getTime() - today.getTime()) / WEEK_MS));
    totalHours = Math.max(hoursPerWeek, Math.round(weeks * hoursPerWeek));
  } else {
    totalHours = Math.max(1, Math.round(input.totalHours || hoursPerWeek * 12));
  }

  // ~1 phase per 15h of work, clamped to a readable 4–8.
  const n = Math.min(PHASE_POOL.length, Math.max(4, Math.round(totalHours / 15)));

  // A more advanced learner starts later in the arc (skips foundations).
  const offset = input.level === 'advanced' ? 2 : input.level === 'intermediate' ? 1 : 0;
  const windowStart = Math.min(offset, PHASE_POOL.length - n);
  const sliced = PHASE_POOL.slice(windowStart, windowStart + n);

  const phases: RoadmapPhase[] = sliced.map((titleKey, i) => ({
    titleKey,
    targetValue: Math.round((totalHours * (i + 1)) / n),
  }));

  const starterKeys = [
    { key: 'roadmap.starterKickoff', durationMinutes: 60 },
    { key: 'roadmap.starterPractice', durationMinutes: 45 },
    { key: 'roadmap.starterReview', durationMinutes: 30 },
  ];

  return {
    phases,
    totalHoursEstimated: totalHours,
    hoursPerWeekTarget: hoursPerWeek,
    starterKeys,
    insight: { key: 'roadmap.insightBuilt', vars: { phases: n, hours: totalHours, perWeek: hoursPerWeek } },
  };
}
