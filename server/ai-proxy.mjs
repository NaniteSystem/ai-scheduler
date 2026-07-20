// Minimal zero-dependency auth proxy for LLM roadmap generation. Node 18+ (global fetch).
//
// Multi-PROVIDER + multi-key + multi-model failover. On quota (429) / overload
// (503) it rotates through every provider → key → model until one answers.
//   Provider order: Gemini (native JSON schema) → OpenRouter (free-model backup).
//
// Run (loads keys from gitignored .env.local):
//   node --env-file=.env.local server/ai-proxy.mjs
//
// .env.local keys:
//   GEMINI_API_KEYS=key1,key2        (comma/space/newline separated)  + GEMINI_API_KEY
//   OPENROUTER_API_KEYS=sk-or-...     + OPENROUTER_API_KEY
// Optional: GEMINI_MODEL, OPENROUTER_MODELS (comma list), PORT (8787), ALLOW_ORIGIN (*).
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const APP_SECRET = process.env.APP_SECRET || '';
const RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 6));
const MAX_REQUEST_BYTES = Math.max(1024, Number(process.env.MAX_REQUEST_BYTES || 262144));

const list = (...vals) => [...new Set(vals.join(',').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
const ALLOWED_ORIGINS = list(process.env.ALLOW_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,https://localhost');

const GEMINI_KEYS = list(process.env.GEMINI_API_KEYS || '', process.env.GEMINI_API_KEY || '');
const OPENROUTER_KEYS = list(process.env.OPENROUTER_API_KEYS || '', process.env.OPENROUTER_API_KEY || '');

const GEMINI_MODELS = list(process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest');
// Free OpenRouter models are heavily upstream-rate-limited (429) and rotate in/out.
// Order = most reliable JSON producers first; proxy skips a 429'd one instantly.
const OR_MODELS = list(process.env.OPENROUTER_MODELS || '',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free');

const mask = (k) => (k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '****');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

// ── Provider request builders: each does ONE fetch, returns {ok,text} | {ok:false,status,detail} ──
async function geminiAttempt(model, key, { system, prompt, responseSchema, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(responseSchema ? { responseSchema } : {}),
      temperature: typeof temperature === 'number' ? temperature : 0.6,
      maxOutputTokens: 65536,                   // model max — room for unbounded "very detailed" trilingual roadmaps
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const g = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!g.ok) return { ok: false, status: g.status, detail: (await g.text()).slice(0, 300) };
  const data = await g.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'empty completion' };
}

async function openrouterAttempt(model, key, { system, prompt, temperature }) {
  const body = {
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    temperature: typeof temperature === 'number' ? temperature : 0.6,
    response_format: { type: 'json_object' },
    max_tokens: 16000,
  };
  const g = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Title': 'Nebulla Roadmap' },
    body: JSON.stringify(body),
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

if (PROVIDERS.length === 0) { console.error('No API keys — set GEMINI_API_KEYS and/or OPENROUTER_API_KEYS'); process.exit(1); }

// Retry transient overloads (not 429 — quota won't recover in seconds) with backoff.
async function callWithRetry(attempt, tries = 3) {
  let last = { ok: false, status: 0, detail: '' };
  for (let i = 0; i < tries; i++) {
    try { last = await attempt(); } catch (e) { last = { ok: false, status: 0, detail: String(e).slice(0, 300) }; }
    if (last.ok) return last;
    if (last.status && !TRANSIENT.has(last.status)) return last;   // 400/403 — won't fix on retry
    if (last.status === 429) return last;                          // rotate key/provider instead
    if (i < tries - 1) await sleep(600 * 2 ** i);                  // 0.6s, 1.2s, 2.4s
  }
  return last;
}

let reqSeq = 0;   // round-robin key start, spreads quota across the pool
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map();

const cors = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};
const send = (req, res, code, obj, headers = {}) => {
  cors(req, res);
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};

function consumeRateLimit(req) {
  const now = Date.now();
  const key = req.socket.remoteAddress || 'unknown';
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

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return send(req, res, 403, { error: 'origin not allowed' });
  if (req.method === 'OPTIONS') { cors(req, res); res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || !req.url.startsWith('/api/ai')) return send(req, res, 404, { error: 'not found' });

  const rate = consumeRateLimit(req);
  if (!rate.allowed) return send(req, res, 429, { error: 'rate limit exceeded' }, { 'Retry-After': String(rate.retryAfter) });

  if (APP_SECRET && req.headers['x-app-secret'] !== APP_SECRET) {
    return send(req, res, 401, { error: 'unauthorized' });
  }

  let body = '';
  req.on('data', (c) => {
    body += c;
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) req.destroy();
  });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { return send(req, res, 400, { error: 'bad json' }); }
    const { prompt } = payload;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 100_000) {
      return send(req, res, 400, { error: 'invalid prompt' });
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
              return send(req, res, 200, { text: last.text });
            }
            console.warn(`✗ ${prov.name} ${mask(key)} ${model} (${last.status}): ${last.detail?.replace(/\s+/g, ' ').slice(0, 55)}`);
            if (last.status && !TRANSIENT.has(last.status)) { keyDead = true; break; }  // bad/blocked key → next key
          }
          if (keyDead) continue;
        }
      }
      console.warn(`✗✗ all providers/keys/models failed ${secs()}s`);
      return send(req, res, 502, { error: 'upstream unavailable' });
    } catch (e) {
      console.error(`proxy failure: ${String(e).replace(/\s+/g, ' ').slice(0, 160)}`);
      return send(req, res, 502, { error: 'upstream unavailable' });
    }
  });
});

server.listen(PORT, () => {
  const desc = PROVIDERS.map((p) => `${p.name}[${p.keys.length}k×${p.models.length}m]`).join(' → ');
  console.log(`ai-proxy on http://localhost:${PORT}  (${desc})`);
});
