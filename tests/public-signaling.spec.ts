import { expect, test } from '@playwright/test';

test('public PeerJS signaling connects two real browser peers', async ({ page }) => {
  test.skip(process.env.PUBLIC_P2P !== '1', 'Opt-in external-network preflight; local tests run without public services.');
  await page.goto('/');
  const received = await page.evaluate(async () => {
    const path = '/node_modules/.vite/deps/peerjs.js';
    const { default: Peer } = await import(/* @vite-ignore */ path) as typeof import('peerjs');
    const host = new Peer();
    const player = new Peer();
    try {
      const open = (peer: import('peerjs').default) => new Promise<string>((resolve, reject) => {
        peer.on('open', resolve); peer.on('error', reject);
      });
      return await Promise.race([
        (async () => {
          const [id] = await Promise.all([open(host), open(player)]);
          const delivered = new Promise<string>((resolve, reject) => {
            host.on('connection', (conn) => { conn.on('data', (data) => resolve(String(data))); conn.on('error', reject); });
          });
          const conn = player.connect(id, { reliable: true });
          conn.on('open', () => conn.send('public-signal-ok'));
          return await delivered;
        })(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Public signaling/P2P timed out on this network.')), 20000)),
      ]);
    } finally { host.destroy(); player.destroy(); }
  });
  expect(received).toBe('public-signal-ok');
});
