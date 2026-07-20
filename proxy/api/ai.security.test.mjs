import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = 'test-key';
process.env.ALLOW_ORIGIN = 'https://localhost';
process.env.RATE_LIMIT_PER_MINUTE = '2';
process.env.MAX_REQUEST_BYTES = '1024';

const { default: handler } = await import('./ai.mjs');

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function request({ ip, origin = 'https://localhost', body = {} }) {
  const req = {
    method: 'POST',
    body,
    headers: { origin, 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  };
  const res = response();
  await handler(req, res);
  return res;
}

assert.equal((await request({ ip: '198.51.100.1', origin: 'https://evil.example' })).statusCode, 403);

assert.equal((await request({ ip: '198.51.100.2' })).statusCode, 400);
assert.equal((await request({ ip: '198.51.100.2' })).statusCode, 400);
const limited = await request({ ip: '198.51.100.2' });
assert.equal(limited.statusCode, 429);
assert.ok(Number(limited.headers['Retry-After']) >= 1);

const oversized = await request({ ip: '198.51.100.3', body: { prompt: 'x'.repeat(2_000) } });
assert.equal(oversized.statusCode, 413);

console.log('ai.security.test.mjs: all assertions passed');
