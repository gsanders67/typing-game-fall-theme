import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from '../src/network/events';
import { createGameServer } from './app';
import { readConfig } from './config';

type Client = Socket<ServerEvents, ClientEvents>;
const clients: Client[] = [];
const servers: ReturnType<typeof createGameServer>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
async function start(basePath = '', staticDir?: string) {
  const server = createGameServer(readConfig({ BASE_PATH: basePath || '/' }), staticDir);
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
  return { origin, connect };
}
const hostRoom = (client: Client, code = 'ABC234', token = randomUUID()) =>
  client.timeout(2000).emitWithAck('host-room', code, token);
const joinRoom = (client: Client, link: string, code = 'ABC234') =>
  client.timeout(2000).emitWithAck('join-room', code, link);

it('serves React and assets at a runtime base path, redirects missing slash, and isolates private files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leaf-socket-server-'));
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
