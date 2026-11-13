import { expect, test } from '@playwright/test';
import { defaultAvatar, draw, emptyRoom, finish } from '../src/tournament/model';
import { expectScreenFits } from './viewport';

function backup() {
  const room = emptyRoom('AWD234');
  room.players = Array.from({ length: 2 }, (_, index) => ({
    id: crypto.randomUUID(), name: index ? 'Golden Maple' : 'Cozy Fox', avatar: defaultAvatar, connected: true, ready: true,
  }));
  draw(room, 'award-preview');
  const final = room.matches[0];
  final.status = 'playing';
  finish(room, final, Object.fromEntries(final.players.map((id, index) => [id, { score: 200 + index * 100, wpm: 24 + index * 10, accuracy: 98, best: 8 }])));
  return { format: 'leaf-private-v1', room, secrets: Object.fromEntries(room.players.map((player) => [player.id, crypto.randomUUID()])) };
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`two-player podium, ${reducedMotion}, public export, and replay invalidation`, async ({ page }) => {
  const saved = backup();
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript((data) => localStorage.setItem('leaf-host-checkpoint', JSON.stringify(data)), saved);
  await page.goto('/');
  await page.getByRole('button', { name: 'Returning presenter? Restore your event', exact: true }).click();
  await page.getByRole('button', { name: 'Restore last browser checkpoint', exact: true }).click();
  await expect(page.locator('.podium-place')).toHaveCount(2);
  await expect(page.locator('.place-3')).toHaveCount(0);
  const champion = saved.room.players.find((player) => player.id === saved.room.matches[0].winner)!;
  await expect(page.locator('.place-1 .podium-name')).toHaveText(champion.name);
  await expect(page.locator('.place-1')).toHaveCSS('opacity', '1');
  if (reducedMotion === 'reduce') {
    await expect(page.locator('.party-confetti')).toHaveCount(0);
    await expect(page.locator('.mascot-dancer').first()).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.avatar-celebrating')).toHaveCount(0);
    await expect(page.locator('.champion-halo')).toHaveCSS('animation-name', 'none');
  } else {
    await expect(page.locator('.party-confetti')).toHaveCount(60);
    await expect(page.locator('.avatar-celebrating')).toHaveCount(2);
    const dancer = page.locator('.place-1 .mascot-dancer');
    const start = await dancer.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(() => dancer.evaluate((node) => getComputedStyle(node).transform)).not.toBe(start);
    await page.getByRole('button', { name: 'Pause party', exact: true }).click();
    await expect(page.locator('.party-confetti')).toHaveCount(0);
    await expect(dancer).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.avatar-celebrating')).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep partying', exact: true }).click();
    await expect(page.locator('.party-confetti')).toHaveCount(60);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Less motion').check();
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await expect(page.locator('.party-confetti')).toHaveCount(0);
    await expect(dancer).toHaveCSS('animation-name', 'none');
  }
  await expectScreenFits(page);
  const initialSeed = saved.room.matches[0].seed;
  await page.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const exported = JSON.parse(session.exportResults());
    if ('secrets' in exported) throw new Error('Public results contain credentials.');
    if (exported.room.phase !== 'finished') throw new Error('Finished results were not exported.');
    session.replay('r0m0');
  });
  await expect(page.getByRole('heading', { name: 'The race for the crown.' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    const room = session.getSnapshot().room!;
    return { seed: room.matches[0].seed, results: room.matches[0].results, rolls: room.podiumRolls, phase: room.phase };
  })).toEqual({ seed: initialSeed, results: {}, rolls: [], phase: 'tournament' });
});

test('badge artwork failures show an error instead of downloading a broken badge', async ({ page }) => {
  const saved = backup();
  await page.addInitScript((data) => localStorage.setItem('leaf-host-checkpoint', JSON.stringify(data)), saved);
  await page.goto('/');
  await page.getByRole('button', { name: 'Returning presenter? Restore your event', exact: true }).click();
  await page.getByRole('button', { name: 'Restore last browser checkpoint', exact: true }).click();
  await page.getByRole('button', { name: 'Winner awards', exact: true }).click();
  await page.route('**/favicon.svg', (route) => route.fulfill({ status: 404, body: 'Missing artwork' }));
  await page.getByRole('button', { name: 'Download email badge', exact: true }).click();
  await expect(page.locator('[role="alert"]')).toContainText('The badge icon could not load');
});

test('legacy unfinished backups fail visibly instead of mixing rules', async ({ page }) => {
  const saved = backup();
  const legacy: Record<string, unknown> = { ...saved.room, phase: 'tournament' };
  delete legacy.rulesVersion;
  delete legacy.podiumRolls;
  const final = saved.room.matches[0];
  legacy.matches = [{ ...final, status: 'pending', winner: undefined, results: {} }];
  await page.addInitScript((data) => localStorage.setItem('leaf-host-checkpoint', JSON.stringify(data)), { ...saved, room: legacy });
  await page.goto('/');
  await page.getByRole('button', { name: 'Returning presenter? Restore your event', exact: true }).click();
  await page.getByRole('button', { name: 'Restore last browser checkpoint', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('legacy 60-second rules');
});
