// Vercel serverless function — auth proxy for LLM roadmap generation.
// Mirrors server/ai-proxy.mjs (local dev) but as a Vercel Node function.
//
// Multi-PROVIDER + multi-key + multi-model failover. On quota (429) / overload
// (503) it rotates through every provider → key → model until one answers.
//   Provider order: Gemini (native JSON schema) → OpenRouter (free-model backup).
//
// Vercel env vars (Project → Settings → Environment Variables):
//   GEMINI_API_KEYS=key1,key2        (comma/space/newline separated)  + GEMINI_API_KEY
//   OPENROUTER_API_KEYS=sk-or-...     + OPENROUTER_API_KEY
//   APP_SECRET=...                    required header x-app-secret (skip check if unset)
// Optional: GEMINI_MODEL, OPENROUTER_MODELS (comma list).

const list = (...vals) => [...new Set(vals.join(',').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

const GEMINI_KEYS = list(process.env.GEMINI_API_KEYS || '', process.env.GEMINI_API_KEY || '');
const OPENROUTER_KEYS = list(process.env.OPENROUTER_API_KEYS || '', process.env.OPENROUTER_API_KEY || '');

const GEMINI_MODELS = list(process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest');
const OR_MODELS = list(process.env.OPENROUTER_MODELS || '',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free');

const APP_SECRET = process.env.APP_SECRET || '';
const ALLOWED_ORIGINS = list(process.env.ALLOW_ORIGIN || 'https://localhost');
const RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 6));
const MAX_REQUEST_BYTES = Math.max(1024, Number(process.env.MAX_REQUEST_BYTES || 262144));
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map();

const mask = (k) => (k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '****');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

async function geminiAttempt(model, key, { system, prompt, responseSchema, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const reqBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(responseSchema ? { responseSchema } : {}),
      temperature: typeof temperature === 'number' ? temperature : 0.6,
      maxOutputTokens: 65536,
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const g = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
  if (!g.ok) return { ok: false, status: g.status, detail: (await g.text()).slice(0, 300) };
  const data = await g.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'empty completion' };
}

async function openrouterAttempt(model, key, { system, prompt, temperature }) {
  const reqBody = {
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    temperature: typeof temperature === 'number' ? temperature : 0.6,
    response_format: { type: 'json_object' },
    max_tokens: 16000,
  };
  const g = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'Nebulla Roadmap' },
    body: JSON.stringify(reqBody),
  });
  if (!g.ok) return { ok: false, status: g.status, detail: (await g.text()).slice(0, 300) };
  const data = await g.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'empty completion' };
}

const PROVIDERS = [
  { name: 'gemini', keys: GEMINI_KEYS, models: GEMINI_MODELS, attempt: geminiAttempt },
  { name: 'openrouter', keys: OPENROUTER_KEYS, models: OR_MODELS, attempt: openrouterAttempt },
].filter((p) => p.keys.length > 0);

async function callWithRetry(attempt, tries = 3) {
  let last = { ok: false, status: 0, detail: '' };
  for (let i = 0; i < tries; i++) {
    try { last = await attempt(); } catch (e) { last = { ok: false, status: 0, detail: String(e).slice(0, 300) }; }
    if (last.ok) return last;
    if (last.status && !TRANSIENT.has(last.status)) return last;
    if (last.status === 429) return last;
    if (i < tries - 1) await sleep(600 * 2 ** i);
  }
  return last;
}

let reqSeq = 0;

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

function applyResponseHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
}

function consumeRateLimit(req) {
  const now = Date.now();
  const key = clientAddress(req);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export default async function handler(req, res) {
  applyResponseHeaders(req, res);
  if (!requestOriginAllowed(req)) { res.status(403).json({ error: 'origin not allowed' }); return; }
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const rate = consumeRateLimit(req);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'rate limit exceeded' });
    return;
  }

  if (APP_SECRET) {
    const got = req.headers['x-app-secret'];
    if (got !== APP_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  }

  if (PROVIDERS.length === 0) { res.status(500).json({ error: 'no API keys configured' }); return; }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    res.status(413).json({ error: 'request too large' });
    return;
  }
  const payload = typeof req.body === 'object' && req.body ? req.body : (() => { try { return JSON.parse(rawBody || '{}'); } catch { return {}; } })();
  const { prompt } = payload;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 100_000) {
    res.status(400).json({ error: 'invalid prompt' });
    return;
  }

  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  let last;
  try {
    for (const prov of PROVIDERS) {
      const start = reqSeq++ % prov.keys.length;
      const keyOrder = prov.keys.map((_, i) => prov.keys[(start + i) % prov.keys.length]);
      for (const key of keyOrder) {
        let keyDead = false;
        for (const model of prov.models) {
          last = await callWithRetry(() => prov.attempt(model, key, payload));
          if (last.ok) {
            console.log(`✓ ${prov.name} ${mask(key)} ${model} ${secs()}s`);
            res.status(200).json({ text: last.text });
            return;
          }
          console.warn(`✗ ${prov.name} ${mask(key)} ${model} (${last.status}): ${last.detail?.replace(/\s+/g, ' ').slice(0, 55)}`);
          if (last.status && !TRANSIENT.has(last.status)) { keyDead = true; break; }
        }
        if (keyDead) continue;
      }
    }
    console.warn(`✗✗ all providers/keys/models failed ${secs()}s`);
    res.status(502).json({ error: 'upstream unavailable' });
  } catch (e) {
    console.error(`proxy failure: ${String(e).replace(/\s+/g, ' ').slice(0, 160)}`);
    res.status(502).json({ error: 'upstream unavailable' });
  }
}
