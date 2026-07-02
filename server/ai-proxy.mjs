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
const ORIGIN = process.env.ALLOW_ORIGIN || '*';

const list = (...vals) => [...new Set(vals.join(',').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

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

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
};
const send = (res, code, obj) => { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (req.method !== 'POST' || !req.url.startsWith('/api/ai')) return send(res, 404, { error: 'not found' });

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
    const { prompt } = payload;
    if (typeof prompt !== 'string' || !prompt) return send(res, 400, { error: 'missing prompt' });

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
              return send(res, 200, { text: last.text });
            }
            console.warn(`✗ ${prov.name} ${mask(key)} ${model} (${last.status}): ${last.detail?.replace(/\s+/g, ' ').slice(0, 55)}`);
            if (last.status && !TRANSIENT.has(last.status)) { keyDead = true; break; }  // bad/blocked key → next key
          }
          if (keyDead) continue;
        }
      }
      console.warn(`✗✗ all providers/keys/models failed ${secs()}s`);
      return send(res, 502, { error: `llm ${last?.status || 'error'}`, detail: last?.detail || '' });
    } catch (e) {
      return send(res, 502, { error: 'upstream error', detail: String(e).slice(0, 300) });
    }
  });
});

server.listen(PORT, () => {
  const desc = PROVIDERS.map((p) => `${p.name}[${p.keys.length}k×${p.models.length}m]`).join(' → ');
  console.log(`ai-proxy on http://localhost:${PORT}  (${desc})`);
});
