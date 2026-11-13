import { createHmac } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer, get, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApp, readConfig } from './app';

const config = readConfig({
  TURN_SHARED_SECRET: 'a'.repeat(64),
  TURN_HOST: 'turn.example.com',
  ALLOWED_ORIGIN: 'https://game.example.com',
});
const servers: Server[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function start(now?: () => number, staticDir?: string) {
  const server = createServer(createApp(config, { now, staticDir }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  return `http://127.0.0.1:${address.port}`;
}

it('serves the React entry and its assets without exposing files outside dist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leaf-type-server-'));
  directories.push(directory);
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<html><script src="/assets/app.js"></script></html>');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("react-app")');
  await writeFile(join(directory, 'secret.txt'), 'private-server-config');
  await writeFile(join(dist, '.env'), 'private');
  const base = await start(undefined, dist);
  const response = await fetch(`${base}/`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(await response.text()).toContain('/assets/app.js');
  expect(await (await fetch(`${base}/assets/app.js`)).text()).toContain('react-app');
  expect((await fetch(`${base}/secret.txt`)).status).toBe(404);
  expect((await fetch(`${base}/.env`)).status).toBe(404);
  expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
});

it('issues coturn-compatible expiring credentials without returning the permanent secret', async () => {
  const now = 1800000000000;
  const base = await start(() => now);
  const response = await fetch(`${base}/api/ice`, { headers: { Origin: config.origin } });
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

it('accepts same-origin browser requests that omit Origin but verifies their Host', async () => {
  const base = await start();
  const status = (host: string) => new Promise<number | undefined>((resolve, reject) => {
    get(`${base}/api/ice`, { headers: { 'Sec-Fetch-Site': 'same-origin', Host: host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  expect(await status('game.example.com')).toBe(200);
  expect(await status('other.example.com')).toBe(403);
});

it('rejects missing and unexpected origins, disallowed methods, and unknown paths', async () => {
  const base = await start();
  expect((await fetch(`${base}/api/ice`)).status).toBe(403);
  expect((await fetch(`${base}/api/ice`, { headers: { Origin: 'https://other.example.com' } })).status).toBe(403);
  expect((await fetch(`${base}/api/ice`, { method: 'POST', headers: { Origin: config.origin } })).status).toBe(405);
  expect((await fetch(`${base}/unknown`)).status).toBe(404);
  expect((await fetch(`${base}/api/ice`, { method: 'OPTIONS', headers: { Origin: config.origin } })).status).toBe(204);
  expect(await (await fetch(`${base}/health`)).text()).toBe('ok');
});

it('limits credential issuance and resets the limit after one minute', async () => {
  let now = 1800000000000;
  const base = await start(() => now);
  for (let count = 0; count < 120; count++) {
    expect((await fetch(`${base}/api/ice`, { headers: { Origin: config.origin } })).status).toBe(200);
  }
  const limited = await fetch(`${base}/api/ice`, { headers: { Origin: config.origin } });
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('60');
  now += 60000;
  expect((await fetch(`${base}/api/ice`, { headers: { Origin: config.origin } })).status).toBe(200);
});

it.each([
  { TURN_SHARED_SECRET: 'too-short' },
  { TURN_HOST: 'https://turn.example.com' },
  { TURN_HOST: 'turn..example.com' },
  { ALLOWED_ORIGIN: 'https://game.example.com/path' },
  { ALLOWED_ORIGIN: 'http://example.com' },
])('fails startup when configuration is invalid: %j', (patch) => {
  expect(() => readConfig({
    TURN_SHARED_SECRET: config.secret,
    TURN_HOST: config.host,
    ALLOWED_ORIGIN: config.origin,
    ...patch,
  })).toThrow();
});
