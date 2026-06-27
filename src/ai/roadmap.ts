import type { GoalKind, RoadmapDepth, GoalRoadmap, RoadmapPhase, RoadmapNode, RoadmapResource, Category } from '../types';
import { CATEGORY_META } from '../types';
import { llmJson, AiUnavailableError, AiOfflineError } from './llm';
import { normLT } from '../utils/localized';

const LT_SCHEMA = { type: 'object', properties: { en: { type: 'string' }, ru: { type: 'string' }, ja: { type: 'string' } } } as const;

// Retry once on transient failures (not when offline) — the first Gemini call sometimes cold-fails.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof AiOfflineError) throw e;
    await new Promise((r) => setTimeout(r, 700));
    return await fn();
  }
}

export interface RoadmapInput {
  intent: string;
  category?: string;
  depth: RoadmapDepth;
  lang: 'en' | 'ru' | 'ja';
  answers?: { q: string; a: string }[];
}

export type RoadmapResult =
  | { status: 'ok'; kind: GoalKind; category: Category; roadmap: GoalRoadmap }
  | { status: 'reframe'; kind: GoalKind; category: Category; message: string; roadmap: GoalRoadmap }
  | { status: 'refuse'; reasonType: 'impossible' | 'unsafe' | 'unclear'; message: string; suggestion?: string };

export interface ClarifyResult { questions: string[] }

const NODE_BUDGET: Record<RoadmapDepth, string> = {
  surface: '5–10 nodes total across 1–3 phases',
  medium: '10–15 nodes across 3–5 phases',
  deep: 'up to 30 nodes across up to 8 phases',
};

const SYSTEM =
  `You are a goal-roadmap planner like roadmap.sh. Produce a structured, DATE-AGNOSTIC path (phases → nodes) to reach the user's goal. Never assign dates or times. For most nodes attach 1-2 SPECIFIC resources that are genuinely popular and used for THIS exact topic — name the real YouTube channel/playlist, website, course, or app people actually use for this subject (e.g. a concrete channel or site name), tailored and DIFFERENT per node; never reuse one generic link for everything and never invent fake names. Include a real URL only when you are confident it is correct; otherwise give the exact resource name with no url. Refuse impossible goals (reasonType "impossible") and unsafe/illegal/harmful goals such as weapons or wrongdoing (reasonType "unsafe", message asking for a proper goal). For purchases, return status "reframe" with a savings + buying-decision path. Output STRICT JSON only, matching the requested schema.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'reframe', 'refuse'] },
    kind: { type: 'string', enum: ['learn', 'acquire', 'build', 'other'] },
    category: { type: 'string', enum: Object.keys(CATEGORY_META) },
    reasonType: { type: 'string', enum: ['impossible', 'unsafe', 'unclear'] },
    message: { type: 'string' },
    suggestion: { type: 'string' },
    tips: { type: 'array', items: LT_SCHEMA },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: LT_SCHEMA,
          summary: LT_SCHEMA,
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: LT_SCHEMA,
                detail: LT_SCHEMA,
                kind: { type: 'string', enum: ['skill', 'knowledge', 'task', 'milestone'] },
                resources: {
                  type: 'array',
                  items: { type: 'object', properties: { label: LT_SCHEMA, url: { type: 'string' }, kind: { type: 'string' } }, required: ['label'] },
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['title', 'nodes'],
      },
    },
  },
  required: ['status'],
} as const;

let _seq = 0;
const rid = (p: string) => `${p}${Date.now().toString(36)}${(_seq++).toString(36)}`;

const safeUrl = (u?: string): string | undefined =>
  u && /^https?:\/\//i.test(u) ? u : undefined;

function buildRoadmap(raw: any, depth: RoadmapDepth, kind: GoalKind, lang: 'en' | 'ru' | 'ja'): GoalRoadmap {
  if (!Array.isArray(raw?.phases) || raw.phases.length === 0) throw new AiUnavailableError('no phases');
  const phases: RoadmapPhase[] = raw.phases.map((p: any) => {
    const ptitle = normLT(p?.title);
    if (!ptitle || !Array.isArray(p.nodes)) throw new AiUnavailableError('bad phase');
    const nodes: RoadmapNode[] = p.nodes.map((n: any) => {
      const ntitle = normLT(n?.title);
      if (!ntitle) throw new AiUnavailableError('bad node');
      const resources: RoadmapResource[] | undefined = Array.isArray(n.resources)
        ? n.resources
            .map((r: any) => ({ label: normLT(r?.label), url: safeUrl(r?.url), kind: r?.kind }))
            .filter((r: any): r is RoadmapResource => r.label != null)
        : undefined;
      return { id: rid('n'), title: ntitle, detail: normLT(n.detail), kind: n.kind, resources, done: false };
    });
    if (nodes.length === 0) throw new AiUnavailableError('empty phase');
    return { id: rid('p'), title: ptitle, summary: normLT(p.summary), nodes };
  });
  const tips = Array.isArray(raw.tips) ? raw.tips.map(normLT).filter((t: any) => t != null) : [];
  return { depth, kind, phases, tips, generatedBy: 'ai', model: 'gemini-2.5-flash', createdAt: new Date().toISOString(), lang };
}

export async function requestRoadmapQuestions(input: RoadmapInput): Promise<ClarifyResult> {
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth}.
Return JSON { "questions": string[] } with 2-4 SHORT questions whose answers materially change the roadmap (e.g. current level, target timeframe, sub-focus). Questions in language "${input.lang}". If no question is needed, return an empty array.`;
  const schema = { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] };
  const raw = await withRetry(() => llmJson<any>({ system: SYSTEM, prompt, responseSchema: schema, temperature: 0.4 }));
  const questions = Array.isArray(raw?.questions) ? raw.questions.filter((q: any) => typeof q === 'string').slice(0, 4) : [];
  return { questions };
}

export async function requestRoadmap(input: RoadmapInput): Promise<RoadmapResult> {
  const answers = (input.answers || []).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth} (${NODE_BUDGET[input.depth]}).
${answers ? `Clarifying answers:\n${answers}\n` : ''}Decide status. If ok/reframe, include "kind", "tips" (3-6 short advice strings: apps/courses/channels), and "phases". For refuse, include "reasonType" and "message" (and optional "suggestion"). For ok/reframe also set "category" to the best fit from: ${Object.keys(CATEGORY_META).join(', ')}. Return ALL user-facing text — phase titles & summaries, node titles & details, tips, and resource labels — as objects { "en": ..., "ru": ..., "ja": ... } carrying the SAME meaning in all three languages. Resource brand/proper names may stay in their original language but still fill all three keys.`;
  const raw = await withRetry(() => llmJson<any>({ system: SYSTEM, prompt, responseSchema: RESULT_SCHEMA, temperature: 0.6 }));

  if (raw?.status === 'refuse') {
    const reasonType = ['impossible', 'unsafe', 'unclear'].includes(raw.reasonType) ? raw.reasonType : 'unclear';
    return { status: 'refuse', reasonType, message: typeof raw.message === 'string' ? raw.message : '', suggestion: typeof raw.suggestion === 'string' ? raw.suggestion : undefined };
  }
  const kind: GoalKind = ['learn', 'acquire', 'build', 'other'].includes(raw?.kind) ? raw.kind : 'other';
  const category: Category = (raw?.category && raw.category in CATEGORY_META ? raw.category : 'personal') as Category;
  const roadmap = buildRoadmap(raw, input.depth, kind, input.lang);
  if (raw?.status === 'reframe') return { status: 'reframe', kind, category, message: typeof raw.message === 'string' ? raw.message : '', roadmap };
  return { status: 'ok', kind, category, roadmap };
}
