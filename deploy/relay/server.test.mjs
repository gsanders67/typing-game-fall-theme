import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { credentialHandler, readConfig } from './server.mjs';

const config = readConfig({
  TURN_SHARED_SECRET: 'a'.repeat(64),
  TURN_HOST: 'turn.example.com',
  ALLOWED_ORIGIN: 'https://gsanders67.github.io',
});
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function start(now) {
  const server = createServer(credentialHandler(config, now));
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

it('issues coturn-compatible expiring credentials without returning the permanent secret', async () => {
  const now = 1800000000000;
  const base = await start(() => now);
  const response = await fetch(`${base}/ice`, { headers: { Origin: config.origin } });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe(config.origin);
  const body = await response.json();
  expect(body.expiresAt).toBe(now / 1000 + 86400);
  const [relay] = body.iceServers;
  expect(relay.username.split(':')[0]).toBe(String(body.expiresAt));
  expect(relay.credential).toBe(createHmac('sha1', config.secret).update(relay.username).digest('base64'));
  expect(relay.urls).toEqual([
    'turn:turn.example.com:3478?transport=udp',
    'turn:turn.example.com:3478?transport=tcp',
    'turns:turn.example.com:443?transport=tcp',
  ]);
  expect(JSON.stringify(body)).not.toContain(config.secret);
});

it('rejects missing and unexpected origins, disallowed methods, and unknown paths', async () => {
  const base = await start();
  expect((await fetch(`${base}/ice`)).status).toBe(403);
  expect((await fetch(`${base}/ice`, { headers: { Origin: 'https://other.example.com' } })).status).toBe(403);
  expect((await fetch(`${base}/ice`, { method: 'POST', headers: { Origin: config.origin } })).status).toBe(405);
  expect((await fetch(`${base}/unknown`)).status).toBe(404);
  expect((await fetch(`${base}/ice`, { method: 'OPTIONS', headers: { Origin: config.origin } })).status).toBe(204);
  expect(await (await fetch(`${base}/health`)).text()).toBe('ok');
});

it('limits credential issuance and resets the limit after one minute', async () => {
  let now = 1800000000000;
  const base = await start(() => now);
  for (let count = 0; count < 120; count++) {
    expect((await fetch(`${base}/ice`, { headers: { Origin: config.origin } })).status).toBe(200);
  }
  const limited = await fetch(`${base}/ice`, { headers: { Origin: config.origin } });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('60');
  now += 60000;
  expect((await fetch(`${base}/ice`, { headers: { Origin: config.origin } })).status).toBe(200);
});

it.each([
  { TURN_SHARED_SECRET: 'too-short' },
  { TURN_HOST: 'https://turn.example.com' },
  { ALLOWED_ORIGIN: 'https://gsanders67.github.io/typing-game-fall-theme' },
  { ALLOWED_ORIGIN: 'http://example.com' },
])('fails startup when configuration is invalid: %j', (patch) => {
  expect(() => readConfig({
    TURN_SHARED_SECRET: config.secret,
    TURN_HOST: config.host,
    ALLOWED_ORIGIN: config.origin,
    ...patch,
  })).toThrow();
});
