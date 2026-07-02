// Online-only LLM transport. Talks to the auth proxy (VITE_AI_PROXY_URL).
// Throws AiOfflineError when there's no network, AiUnavailableError for any other failure.
export class AiOfflineError extends Error { constructor() { super('offline'); this.name = 'AiOfflineError'; } }
export class AiUnavailableError extends Error { constructor(m: string) { super(m); this.name = 'AiUnavailableError'; } }

export interface LlmRequest {
  system?: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

const proxyBase = (): string => {
  const b = (import.meta as any).env?.VITE_AI_PROXY_URL as string | undefined;
  if (!b) throw new AiUnavailableError('proxy not configured');
  return b.replace(/\/$/, '');
};

/** Send a request and parse the model's JSON output into T. */
export async function llmJson<T>(req: LlmRequest): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiOfflineError();
  let res: Response;
  try {
    const secret = (import.meta as any).env?.VITE_AI_PROXY_SECRET as string | undefined;
    res = await fetch(`${proxyBase()}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-app-secret': secret } : {}) },
      body: JSON.stringify(req),
    });
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiOfflineError();
    throw new AiUnavailableError('network');
  }
  if (!res.ok) throw new AiUnavailableError(`proxy ${res.status}`);
  let data: any;
  try { data = await res.json(); } catch { throw new AiUnavailableError('bad proxy json'); }
  if (!data || typeof data.text !== 'string') throw new AiUnavailableError('no completion');
  try { return JSON.parse(data.text) as T; }
  catch { throw new AiUnavailableError('model returned invalid json'); }
}
