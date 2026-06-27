import type { GoalKind, RoadmapDepth, GoalRoadmap, RoadmapPhase, RoadmapNode } from '../types';
import { llmJson, AiUnavailableError } from './llm';

export interface RoadmapInput {
  intent: string;
  category?: string;
  depth: RoadmapDepth;
  lang: 'en' | 'ru' | 'ja';
  answers?: { q: string; a: string }[];
}

export type RoadmapResult =
  | { status: 'ok'; kind: GoalKind; roadmap: GoalRoadmap }
  | { status: 'reframe'; kind: GoalKind; message: string; roadmap: GoalRoadmap }
  | { status: 'refuse'; reasonType: 'impossible' | 'unsafe' | 'unclear'; message: string; suggestion?: string };

export interface ClarifyResult { questions: string[] }

const NODE_BUDGET: Record<RoadmapDepth, string> = {
  surface: '5–10 nodes total across 1–3 phases',
  medium: '10–15 nodes across 3–5 phases',
  deep: 'up to 30 nodes across up to 8 phases',
};

const SYSTEM = (lang: string) =>
  `You are a goal-roadmap planner like roadmap.sh. Produce a structured, DATE-AGNOSTIC path (phases → nodes) to reach the user's goal. Never assign dates or times. Cite real, well-known online resources (YouTube, sites, apps); prefer English-language resources. Write node titles and detail in language code "${lang}". Refuse impossible goals (reasonType "impossible") and unsafe/illegal/harmful goals such as weapons or wrongdoing (reasonType "unsafe", message asking for a proper goal). For purchases, return status "reframe" with a savings + buying-decision path. Output STRICT JSON only, matching the requested schema.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'reframe', 'refuse'] },
    kind: { type: 'string', enum: ['learn', 'acquire', 'build', 'other'] },
    reasonType: { type: 'string', enum: ['impossible', 'unsafe', 'unclear'] },
    message: { type: 'string' },
    suggestion: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
                kind: { type: 'string', enum: ['skill', 'knowledge', 'task', 'milestone'] },
                resources: {
                  type: 'array',
                  items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, kind: { type: 'string' } }, required: ['label'] },
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

function buildRoadmap(raw: any, depth: RoadmapDepth, kind: GoalKind): GoalRoadmap {
  if (!Array.isArray(raw?.phases) || raw.phases.length === 0) throw new AiUnavailableError('no phases');
  const phases: RoadmapPhase[] = raw.phases.map((p: any) => {
    if (!p || typeof p.title !== 'string' || !Array.isArray(p.nodes)) throw new AiUnavailableError('bad phase');
    const nodes: RoadmapNode[] = p.nodes.map((n: any) => {
      if (!n || typeof n.title !== 'string') throw new AiUnavailableError('bad node');
      const resources = Array.isArray(n.resources)
        ? n.resources.filter((r: any) => r && typeof r.label === 'string').map((r: any) => ({ label: String(r.label), url: safeUrl(r.url), kind: r.kind }))
        : undefined;
      return { id: rid('n'), title: String(n.title), detail: typeof n.detail === 'string' ? n.detail : undefined, kind: n.kind, resources, done: false };
    });
    if (nodes.length === 0) throw new AiUnavailableError('empty phase');
    return { id: rid('p'), title: String(p.title), summary: typeof p.summary === 'string' ? p.summary : undefined, nodes };
  });
  const tips = Array.isArray(raw.tips) ? raw.tips.filter((t: any) => typeof t === 'string') : [];
  return { depth, kind, phases, tips, generatedBy: 'ai', model: 'gemini-2.5-flash', createdAt: new Date().toISOString() };
}

export async function requestRoadmapQuestions(input: RoadmapInput): Promise<ClarifyResult> {
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth}.
Return JSON { "questions": string[] } with 2-4 SHORT questions whose answers materially change the roadmap (e.g. current level, target timeframe, sub-focus). Questions in language "${input.lang}". If no question is needed, return an empty array.`;
  const schema = { type: 'object', properties: { questions: { type: 'array', items: { type: 'string' } } }, required: ['questions'] };
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: schema, temperature: 0.4 });
  const questions = Array.isArray(raw?.questions) ? raw.questions.filter((q: any) => typeof q === 'string').slice(0, 4) : [];
  return { questions };
}

export async function requestRoadmap(input: RoadmapInput): Promise<RoadmapResult> {
  const answers = (input.answers || []).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  const prompt = `Goal intent: "${input.intent}". Category: ${input.category || 'unknown'}. Depth: ${input.depth} (${NODE_BUDGET[input.depth]}).
${answers ? `Clarifying answers:\n${answers}\n` : ''}Decide status. If ok/reframe, include "kind", "tips" (3-6 short advice strings: apps/courses/channels), and "phases". For refuse, include "reasonType" and "message" (and optional "suggestion"). All user-facing text in language "${input.lang}".`;
  const raw = await llmJson<any>({ system: SYSTEM(input.lang), prompt, responseSchema: RESULT_SCHEMA, temperature: 0.6 });

  if (raw?.status === 'refuse') {
    const reasonType = ['impossible', 'unsafe', 'unclear'].includes(raw.reasonType) ? raw.reasonType : 'unclear';
    return { status: 'refuse', reasonType, message: typeof raw.message === 'string' ? raw.message : '', suggestion: typeof raw.suggestion === 'string' ? raw.suggestion : undefined };
  }
  const kind: GoalKind = ['learn', 'acquire', 'build', 'other'].includes(raw?.kind) ? raw.kind : 'other';
  const roadmap = buildRoadmap(raw, input.depth, kind);
  if (raw?.status === 'reframe') return { status: 'reframe', kind, message: typeof raw.message === 'string' ? raw.message : '', roadmap };
  return { status: 'ok', kind, roadmap };
}
