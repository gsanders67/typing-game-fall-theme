import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createServer as createViteServer } from 'vite';
import { io, type Socket } from 'socket.io-client';
import type { RequestHandler } from 'express';
import type { ClientEvents, ServerEvents } from '../src/network/events';
import { createGameServer } from './app';
import { readConfig } from './config';
import { roomMetadataPlugin } from './metadata';

type Client = Socket<ServerEvents, ClientEvents>;
const clients: Client[] = [];
const servers: ReturnType<typeof createGameServer>[] = [];
const developmentServers: Awaited<ReturnType<typeof createViteServer>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await Promise.all(developmentServers.splice(0).map((server) => server.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
async function start(basePath = '', staticDir?: string, development?: RequestHandler) {
  const server = createGameServer(readConfig({ BASE_PATH: basePath || '/' }), staticDir, development);
  servers.push(server);
  await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to bind.');
  const origin = `http://127.0.0.1:${address.port}`;
  const connect = async (polling = false) => {
    const client: Client = io(origin, {
      path: `${basePath}/socket.io`, forceNew: true, reconnection: false,
      transports: polling ? ['polling'] : ['websocket'],
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  };
  return { origin, connect, http: server.http };
}
const hostRoom = (client: Client, code = 'ABC234', token = randomUUID()) =>
  client.timeout(2000).emitWithAck('host-room', code, token);
const joinRoom = (client: Client, link: string, code = 'ABC234') =>
  client.timeout(2000).emitWithAck('join-room', code, link);

async function htmlFixture(html?: string) {
  const directory = await mkdtemp(join(process.cwd(), '.leaf-html-server-'));
  directories.push(directory);
  await writeFile(join(directory, 'index.html'), html ?? await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  return directory;
}

it('renders dev invites through Vite without losing generic metadata or the HMR client', async () => {
  const title = 'Leaf It On The Keyboard | Xbox Type Night';
  const description = 'An autumn arcade typing tournament.';
  const directory = await htmlFixture(`<html><head><title>${title}</title><meta name="description" content="${description}"></head><body></body></html>`);
  const { origin, http } = await start('', directory, (req, res, next) => vite.middlewares(req, res, next));
  const vite = await createViteServer({
    configFile: false,
    root: directory,
    plugins: [roomMetadataPlugin],
    server: { middlewareMode: true, hmr: { server: http } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  developmentServers.push(vite);
  const page = await fetch(`${origin}/?room=DEMX26`);
  const html = await page.text();
  expect(page.status).toBe(200);
  expect(html.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi)).toEqual([
    '<title>Join room DEMX26 | Leaf It On The Keyboard</title>',
  ]);
  for (const name of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) {
    expect(html).toMatch(new RegExp(`<meta (?:name|property)="${name}" content="[^"]*DEMX26[^"]*" />`));
  }
  expect(html).toContain('src="/@vite/client"');
  const hmrClient = await fetch(`${origin}/@vite/client`);
  expect(hmrClient.status).toBe(200);
  expect(hmrClient.headers.get('content-type')).toContain('javascript');
  const hmr = new WebSocket(`${origin.replace('http:', 'ws:')}/?token=${vite.config.webSocketToken}`, 'vite-hmr');
  try {
    const connected = await new Promise<MessageEvent>((resolve, reject) => {
      hmr.addEventListener('message', resolve, { once: true });
      hmr.addEventListener('error', () => reject(new Error('Vite HMR connection failed.')), { once: true });
    });
    expect(JSON.parse(String(connected.data))).toEqual({ type: 'connected' });
  } finally {
    hmr.close();
  }
  for (const query of ['', '?room=invalid', '?room=DEMX26&room=ABC234', '?room=%3Cscript%3E']) {
    const generic = await (await fetch(`${origin}/${query}`)).text();
    expect(generic).toContain(`<title>${title}</title>`);
    expect(generic).toContain(`<meta name="description" content="${description}">`);
    expect(generic).not.toContain('og:title');
    expect(generic).not.toContain('twitter:title');
    expect(generic).not.toContain('Join room');
    expect(generic).toContain('src="/@vite/client"');
  }
}, 15000);

it.each(['', '/games/fall'])('renders crawlable room metadata at runtime base "%s" without conflicting tags', async (basePath) => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const staleMetadata = `<title>Old title</title>
    <meta content="Old description" name="description">
    <meta content="Old title" property="og:title">
    <meta property='og:description' content='Old description'>
    <meta name=twitter:title content="Old title">
    <META NAME="twitter:description" CONTENT="Old description">`;
  const directory = await htmlFixture(template.replace('</head>', `${staleMetadata}</head>`));
  const { origin } = await start(basePath, directory);
  for (const pagePath of [`${basePath}/`, `${basePath}/index.html`]) {
    const response = await fetch(`${origin}${pagePath}?room=ABC234`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain(`<base href="${basePath}/">`);
    expect(html.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi)).toEqual([
      '<title>Join room ABC234 | Leaf It On The Keyboard</title>',
    ]);
    for (const name of ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description']) {
      const tags = [...html.matchAll(/<meta\b[^>]*>/gi)]
        .map(([tag]) => tag)
        .filter((tag) => tag.includes(`="${name}"`));
      expect(tags).toHaveLength(1);
      expect(tags[0]).toContain('ABC234');
    }
    expect(html).not.toContain('Old title');
    expect(html).not.toContain('Old description');
    expect(html).toContain('<meta name="theme-color" content="#172d24" />');
    expect(html).toContain('<div id="root"></div>');
  }
});

it('keeps the generic home title and description unchanged after serving an invite', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const directory = await htmlFixture(template);
  const { origin } = await start('', directory);
  await fetch(`${origin}/?room=ABC234`);
  const response = await fetch(`${origin}/`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(template.replace('<head>', '<head><base href="/">'));
});

it.each([
  '',
  '?room=',
  '?room=abc234',
  '?room=ABC23',
  '?room=ABC2345',
  '?room=ABI234',
  '?room=ABO234',
  '?room=ABC230',
  '?room=ABC231',
  '?room=ABC234&room=XYZ789',
  '?room=ABC234&room=ABC234',
  '?room=ABC234&room=',
  '?room[]=ABC234',
  '?room=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E',
  '?room=ABC234%0A',
])('preserves generic HTML without reflecting invalid or ambiguous room query "%s"', async (query) => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const directory = await htmlFixture(template);
  const { origin } = await start('/games/fall', directory);
  const response = await fetch(`${origin}/games/fall/${query}`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(template.replace('<head>', '<head><base href="/games/fall/">'));
});

it('serves React and assets at a runtime base path, redirects missing slash, and isolates private files', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.leaf-socket-server-'));
  directories.push(directory);
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<html><head></head><body><script src="./assets/app.js"></script></body></html>');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("react-app")');
  await writeFile(join(directory, 'secret.txt'), 'private');
  const { origin } = await start('/games/fall', dist);
  const redirect = await fetch(`${origin}/games/fall?room=ABC234`, { redirect: 'manual' });
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get('location')).toBe('/games/fall/?room=ABC234');
  const page = await fetch(`${origin}/games/fall/`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('<base href="/games/fall/">');
  expect(await (await fetch(`${origin}/games/fall/assets/app.js`)).text()).toContain('react-app');
  expect((await fetch(`${origin}/games/fall/secret.txt`)).status).toBe(404);
  expect((await fetch(`${origin}/games/fall/assets/missing.js`)).status).toBe(404);
  expect(await (await fetch(`${origin}/health`)).text()).toBe('ok');
});

it('routes host/player messages through Socket.IO at a subpath and blocks player impersonation', async () => {
  const { connect } = await start('/event');
  const host = await connect();
  const a = await connect();
  const b = await connect();
  expect(await hostRoom(host)).toEqual({ ok: true });
  const linkA = randomUUID(), linkB = randomUUID();
  expect(await joinRoom(a, linkA)).toEqual({ ok: true });
  expect(await joinRoom(b, linkB)).toEqual({ ok: true });
  const messages: unknown[] = [];
  host.on('packet', (_id, data) => messages.push(data));
  const denied = new Promise<string>((resolve) => a.once('room-error', resolve));
  a.emit('packet', linkB, 'forged');
  expect(await denied).toContain('another player');
  const delivered = new Promise<{ id: string; data: unknown }>((resolve) =>
    host.once('packet', (id, data) => resolve({ id, data })));
  a.emit('packet', linkA, { type: 'ping', at: 5 });
  expect(await delivered).toEqual({ id: linkA, data: { type: 'ping', at: 5 } });
  expect(messages).toEqual([{ type: 'ping', at: 5 }]);
  const response = new Promise<unknown>((resolve) => a.once('packet', (_id, data) => resolve(data)));
  host.emit('packet', linkA, { type: 'state', score: 10 });
  expect(await response).toEqual({ type: 'state', score: 10 });
});

it('rejects occupied codes and missing rooms and releases a room when its presenter disconnects', async () => {
  const { connect } = await start();
  const host = await connect(), other = await connect(), player = await connect();
  expect(await hostRoom(host)).toEqual({ ok: true });
  expect(await hostRoom(other)).toMatchObject({ ok: false, message: expect.stringContaining('taken') });
  expect(await joinRoom(player, randomUUID(), 'ZZZ234')).toMatchObject({ ok: false });
  const link = randomUUID();
  expect(await joinRoom(player, link)).toEqual({ ok: true });
  const closed = new Promise<string>((resolve) => player.once('link-closed', resolve));
  host.disconnect();
  expect(await closed).toBe(link);
  expect(await hostRoom(other)).toEqual({ ok: true });
  expect(await joinRoom(player, randomUUID())).toEqual({ ok: true });
});

it('allows a player to reconnect without joining a different room or closing another player', async () => {
  const { connect } = await start();
  const host = await connect(), player = await connect();
  await hostRoom(host);
  const link = randomUUID();
  await joinRoom(player, link);
  const closed = new Promise<string>((resolve) => player.once('link-closed', resolve));
  player.emit('close-link', randomUUID());
  player.emit('close-link', link);
  expect(await closed).toBe(link);
  expect(await joinRoom(player, randomUUID())).toEqual({ ok: true });
});

it('supports HTTP polling when a proxy blocks WebSocket upgrades', async () => {
  const { connect } = await start();
  const host = await connect(true), player = await connect(true);
  await hostRoom(host);
  const link = randomUUID();
  await joinRoom(player, link);
  const received = new Promise<unknown>((resolve) => host.once('packet', (_id, data) => resolve(data)));
  player.emit('packet', link, { type: 'ping', at: 1 });
  expect(await received).toEqual({ type: 'ping', at: 1 });
  expect(player.io.engine.transport.name).toBe('polling');
});
