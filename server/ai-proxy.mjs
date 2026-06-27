// Minimal zero-dependency auth proxy for Google Gemini. Node 18+ (global fetch).
// Run: GEMINI_API_KEY=xxx node server/ai-proxy.mjs   (PORT optional, default 8787)
import { createServer } from 'node:http';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.ALLOW_ORIGIN || '*';

if (!KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }

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
    const { system, prompt, responseSchema, temperature } = payload;
    if (typeof prompt !== 'string' || !prompt) return send(res, 400, { error: 'missing prompt' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
    const gReq = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
        temperature: typeof temperature === 'number' ? temperature : 0.6,
      },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };

    try {
      const g = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
      if (!g.ok) { const t = await g.text(); return send(res, 502, { error: `gemini ${g.status}`, detail: t.slice(0, 500) }); }
      const data = await g.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) return send(res, 502, { error: 'empty completion' });
      return send(res, 200, { text });
    } catch (e) {
      return send(res, 502, { error: 'upstream error', detail: String(e).slice(0, 300) });
    }
  });
});

server.listen(PORT, () => console.log(`ai-proxy on http://localhost:${PORT}  (model ${MODEL})`));
