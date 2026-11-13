import { expect, test } from '@playwright/test';
import { expectScreenFits } from './viewport';

test('host validates live typing, reconnect identity, stale input and forged controls', async ({ browser, page: host }) => {
  await host.goto('/');
  await host.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await host.locator('.room-code strong').innerText();
  const clients = await Promise.all(['Quick Fox', 'Cozy Bear'].map(async (name) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/#room=${code}`);
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Let me in' }).click();
    await page.getByRole('button', { name: "I'm ready!" }).click();
    return { context, page };
  }));
  await expect(host.getByText('2 ready', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Lock roster & draw bracket' }).click();
  await host.getByLabel('Stage difficulty').selectOption('Acorn');
  await host.getByRole('button', { name: 'Start pending matches' }).click();
  const fox = clients[0].page;
  await expect(fox.getByLabel('Type falling words')).toBeVisible();
  await expect(fox.getByText('FINGERS ON KEYS')).not.toBeVisible({ timeout: 10000 });
  const word = await fox.getByTestId('falling-target').first().innerText();
  await fox.getByLabel('Type falling words').pressSequentially(word, { delay: 50 });
  await expect(host.getByRole('article', { name: 'Match r0m0' })).toContainText(`${word.length * 10}`);
  const authoritativeScore = await host.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const id = session.getSnapshot().room!.players.find((player) => player.name === 'Quick Fox')!.id;
    return session.liveStats(id)!.score;
  });
  expect(authoritativeScore).toBe(word.length * 10);
  await expect.poll(() => fox.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    return session.getSnapshot().ack;
  })).toBe(word.length);
  await fox.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const state = session.getSnapshot();
    const connection = Reflect.get(session, 'connection') as import('../src/network/transport').RoomConnection;
    const packet = { type: 'keys', match: 'r0m0', revision: state.room!.revision };
    connection.send({ ...packet, events: [{ seq: state.ack, at: 1, key: 'z' }] });
    connection.send({ ...packet, events: [{ seq: state.ack + 2, at: 1, key: 'z' }] });
    connection.send({ ...packet, revision: state.room!.revision + 1, events: [{ seq: state.ack + 1, at: 1, key: 'z' }] });
    const probe = Date.now() - 0.5;
    await new Promise<void>((resolve) => {
      const onData = (data: unknown) => {
        if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'pong' && 'at' in data && data.at === probe) {
          connection.off('data', onData);
          resolve();
        }
      };
      connection.on('data', onData);
      connection.send({ type: 'ping', at: probe });
    });
  });
  expect(await host.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const id = session.getSnapshot().room!.players.find((player) => player.name === 'Quick Fox')!.id;
    const runtimes = Reflect.get(session, 'runtimes') as Map<string, { accepted: number; queue: unknown[]; board: { attempts: number } }>;
    const runtime = runtimes.get(id)!;
    return { accepted: runtime.accepted, queued: runtime.queue.length, attempts: runtime.board.attempts };
  })).toEqual({ accepted: word.length, queued: 0, attempts: word.length });
  await fox.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const connection = Reflect.get(session, 'connection') as import('../src/network/transport').RoomConnection;
    connection.send({ type: 'keys', match: 'r0m0', revision: -1, events: [{ seq: 1, at: 1, key: 'a' }] });
  });
  await expect(fox.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
  await fox.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(fox.getByRole('button', { name: 'Reconnect', exact: true })).not.toBeVisible();
  await expect(host.locator('.match-card.playing')).toHaveCount(1);
  await expect(host.getByRole('article', { name: 'Match r0m0' })).toContainText(`${authoritativeScore}`);
  await fox.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const connection = Reflect.get(session, 'connection') as import('../src/network/transport').RoomConnection;
    connection.send({ type: 'start' });
  });
  await expect(fox.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
  await expect(host.locator('.match-card.playing')).toHaveCount(1);
  for (const client of clients) await client.context.close();
});

test('presenter reconnects to the backend without losing the room or player identities', async ({ browser, page: host }) => {
  await host.goto('/');
  await host.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await host.locator('.room-code strong').innerText();
  const context = await browser.newContext();
  try {
    const player = await context.newPage();
    await player.goto(`/#room=${code}`);
    await player.getByLabel('Your name').fill('Returning Fox');
    await player.getByRole('button', { name: 'Let me in' }).click();
    await player.getByRole('button', { name: "I'm ready!" }).click();
    await expect(host.getByText('1 ready', { exact: true })).toBeVisible();
    await host.evaluate(async () => {
      const path = '/src/state/session.ts';
      const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
      const transport = Reflect.get(session, 'transport') as import('../src/network/transport').RoomTransport;
      const socket = Reflect.get(transport, 'socket') as import('socket.io-client').Socket;
      socket.io.engine.close();
    });
    await expect(player.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
    await expect(host.getByText('Game server reconnected. Players can use Reconnect.')).toBeVisible();
    await player.getByRole('button', { name: 'Reconnect', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Reconnect', exact: true })).not.toBeVisible();
    await expect(host.locator('.room-code strong')).toHaveText(code);
    await expect(host.getByText('1 ready', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('restored green screens fit desktop viewports without clipping or scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big fall energy/ })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('.world-forest, .hero-cannon')).toHaveCount(0);
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await expectScreenFits(page);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/landing.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Join the fun' }).click();
  for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await expectScreenFits(page);
  }
  await page.getByRole('button', { name: 'Back to the campfire' }).click();
  await page.getByRole('button', { name: /Try a practice round/ }).click();
  await expect(page.getByLabel('Type falling words')).toBeVisible();
  await expect(page.getByText('FINGERS ON KEYS')).not.toBeVisible({ timeout: 5000 });
  await expectScreenFits(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/gameplay.png', fullPage: true, animations: 'disabled' });
  await expectScreenFits(page);
});

test('classic word targets clear, with reduced-motion and button feedback', async ({ page }) => {
  await page.goto('/');
  const join = page.getByRole('button', { name: 'Join the fun' });
  await join.hover();
  await expect.poll(() => join.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
  await page.getByRole('button', { name: /Try a practice round/ }).click();
  await expect(page.getByLabel('Type falling words')).toBeVisible();
  await expect(page.getByText('FINGERS ON KEYS')).not.toBeVisible({ timeout: 5000 });
  const target = page.getByTestId('falling-target').first();
  const id = await target.getAttribute('data-target-id');
  const word = await target.innerText();
  await page.getByLabel('Type falling words').pressSequentially(word, { delay: 30 });
  await expect(page.locator(`[data-target-id="${id}"]`)).toHaveCount(0);
  await expect(page.locator('.game-hud').first()).not.toContainText('0 streak');
  await expect(page.locator('.cannon-station, .blaster-effects')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Less motion').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await page.getByRole('button', { name: 'Leave practice' }).click();
  await expect.poll(() => page.locator('.main-mascot > svg').evaluate((node) => getComputedStyle(node).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await join.hover();
  await expect.poll(() => join.evaluate((node) => getComputedStyle(node).transform)).toBe('none');
});

test('settings menu preserves audio preferences and closes with Escape', async ({ page }) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Enable sound' }).click();
  const volume = page.getByLabel('Volume');
  await volume.focus();
  await volume.press('Home');
  for (let step = 0; step < 5; step++) await volume.press('ArrowRight');
  await expect(volume).toHaveValue('0.25');
  await page.getByLabel('Cozy music').check();
  await page.getByLabel('Less motion').check();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(settings).toBeFocused();
  await page.reload();
  await settings.click();
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  await expect(volume).toHaveValue('0.25');
  await expect(page.getByLabel('Cozy music')).toBeChecked();
  await expect(page.getByLabel('Less motion')).toBeChecked();
});
