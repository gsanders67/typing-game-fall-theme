import { expect, test } from '@playwright/test';

test('one host handles 25 browser peers and authoritative typing traffic', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  const host = await context.newPage();
  await host.goto('/');
  const code = await host.evaluate(async () => {
    const path = '/src/network/peer.ts';
    const enginePath = '/src/game/engine.ts';
    const { createPeer } = await import(/* @vite-ignore */ path) as typeof import('../src/network/peer');
    const { newBoard, input } = await import(/* @vite-ignore */ enginePath) as typeof import('../src/game/engine');
    const peer = createPeer();
    const probe = { connections: 0, batches: 0, inputs: 0, failed: false };
    Object.assign(window, { __probe: probe, __peer: peer });
    peer.on('connection', (conn) => {
      const board = newBoard('feasibility');
      conn.on('open', () => { probe.connections++; });
      conn.on('data', (data) => {
        if (typeof data !== 'object' || data === null || !('seq' in data) || typeof data.seq !== 'number') {
          probe.failed = true;
          return;
        }
        for (const key of 'game') {
          input(board, key, data.seq * 20, 'Acorn');
          probe.inputs++;
        }
        probe.batches++;
        conn.send({ seq: data.seq, score: board.score, lives: board.lives, targets: board.targets });
      });
    });
    return await new Promise<string>((resolve, reject) => {
      peer.on('open', resolve);
      peer.on('error', reject);
      setTimeout(() => reject(new Error('Host signaling timeout')), 15000);
    });
  });
  const clients = await Promise.all(Array.from({ length: 25 }, () => context.newPage()));
  await Promise.all(clients.map(async (client) => {
    await client.goto('/');
    await client.evaluate(async (hostId) => {
      const path = '/src/network/peer.ts';
      const { createPeer } = await import(/* @vite-ignore */ path) as typeof import('../src/network/peer');
      const peer = createPeer();
      Object.assign(window, { __peer: peer });
      await new Promise<void>((resolve, reject) => {
        peer.on('error', reject);
        peer.on('open', () => {
          const conn = peer.connect(hostId, { reliable: true });
          let seq = 0;
          conn.on('error', reject);
          conn.on('open', () => conn.send({ seq: ++seq }));
          conn.on('data', () => {
            if (seq === 150) { resolve(); return; }
            setTimeout(() => conn.send({ seq: ++seq }), 20);
          });
        });
        setTimeout(() => reject(new Error('Peer traffic timed out')), 60000);
      });
    }, code);
  }));
  const probe = await host.evaluate(() => Reflect.get(window, '__probe') as {
    connections: number; batches: number; inputs: number; failed: boolean;
  });
  expect(probe).toEqual({ connections: 25, batches: 3750, inputs: 15000, failed: false });
  await context.close();
});
