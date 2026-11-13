import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultAvatar, draw, emptyRoom, finish } from '../src/tournament/model';
import { expectBadgeMatchesIcon } from './award-artwork';

test('Express serves the game and hash invites under a runtime base path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok()) errors.push(`Asset ${response.status()}: ${response.url()}`);
  });

  await page.goto('/event/#room=ABC234');
  for (const icon of await page.locator('link[rel="icon"]').evaluateAll((icons) => icons.map((icon) => (icon as HTMLLinkElement).href))) {
    expect(new URL(icon).pathname).toMatch(/^\/event\/favicon\.(svg|png)$/);
    const response = await page.request.get(icon);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  }
  await expect(page.getByLabel('Room code')).toHaveValue('ABC234');
  await page.getByRole('button', { name: 'Back to the campfire' }).click();
  await expect(page.getByRole('heading', { name: /Big fall energy/ })).toBeVisible();
  await page.getByRole('button', { name: /Try a practice round/ }).click();
  await expect(page.getByLabel('Type falling words')).toBeVisible();
  await expect(page.getByText('FINGERS ON KEYS')).not.toBeVisible({ timeout: 5000 });
  const word = await page.getByTestId('falling-target').first().innerText();
  await page.getByLabel('Type falling words').pressSequentially(word);
  await expect(page.locator('.game-hud')).not.toContainText('0 streak');
  expect(errors).toEqual([]);
});

test('host and player connect through the production Socket.IO base path', async ({ browser, page: host }) => {
  await host.goto('/event/');
  await host.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await host.locator('.room-code strong').innerText();
  const context = await browser.newContext();
  try {
    const player = await context.newPage();
    await player.goto(`/event/#room=${code}`);
    await player.getByLabel('Your name').fill('Coolify Fox');
    await player.getByRole('button', { name: 'Let me in' }).click();
    await expect(player.getByRole('heading', { name: 'The gathering place.' })).toBeVisible();
    await player.getByRole('button', { name: "I'm ready!" }).click();
    await expect(host.getByText('1 ready', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('downloaded badge reuses the actual favicon under a production base path', async ({ page }) => {
  const room = emptyRoom('ART234');
  room.players = ['Maple', 'Acorn'].map((name) => ({ id: crypto.randomUUID(), name, avatar: defaultAvatar, connected: true, ready: true }));
  draw(room, 'artwork');
  room.matches[0].status = 'playing';
  finish(room, room.matches[0], Object.fromEntries(room.players.map((player, index) => [player.id, { score: 100 + index * 100, wpm: 30, accuracy: 100, best: 4 }])));
  const backup = { format: 'leaf-private-v1', room, secrets: Object.fromEntries(room.players.map((player) => [player.id, crypto.randomUUID()])) };
  await page.addInitScript((data) => localStorage.setItem('leaf-host-checkpoint', JSON.stringify(data)), backup);
  await page.goto('/event/');
  await page.getByRole('button', { name: 'Returning presenter? Restore your event', exact: true }).click();
  await page.getByRole('button', { name: 'Restore last browser checkpoint', exact: true }).click();
  await page.getByRole('button', { name: 'Winner awards', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download email badge', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  await expectBadgeMatchesIcon(page, png);
});
