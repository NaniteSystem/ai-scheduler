# AI proxy (Gemini)

Holds the Gemini API key server-side so the client never embeds it.

## Local
1. Get a free key: https://aistudio.google.com/apikey
2. `GEMINI_API_KEY=xxx node server/ai-proxy.mjs`  (listens on :8787)
3. In the app, set `VITE_AI_PROXY_URL=http://localhost:8787` (e.g. in `.env.local`).

## Deploy (free)
Same logic runs as a Vercel/Cloudflare function. Set `GEMINI_API_KEY` as a secret,
expose `POST /api/ai`, and point `VITE_AI_PROXY_URL` at the deployed origin.
Restrict `ALLOW_ORIGIN` to your app origin in production.

## Contract
`POST /api/ai` body `{ system?, prompt, responseSchema?, temperature? }` -> `{ text }` (model JSON string) or `{ error }`.
