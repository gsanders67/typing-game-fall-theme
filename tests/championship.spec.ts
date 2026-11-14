import { expect, test, type Page } from '@playwright/test';
import { defaultAvatar, draw, emptyRoom, finish } from '../src/tournament/model';
import { expectScreenFits } from './viewport';

function backup(playerCount = 2, pending = false) {
  const room = emptyRoom('AWD234');
  room.players = Array.from({ length: playerCount }, (_, index) => ({
    id: crypto.randomUUID(), name: ['Cozy Fox', 'Golden Maple', 'Dancing Acorn'][index], avatar: defaultAvatar, connected: true, ready: true,
  }));
  draw(room, 'award-preview');
  const final = room.matches[0];
  final.status = 'playing';
  finish(room, final, Object.fromEntries(final.players.map((id, index) => [id, {
    score: pending && index < playerCount - 1 ? 200 : 200 + index * 100,
    wpm: pending && index < playerCount - 1 ? 24 : 24 + index * 10, accuracy: 98, best: 8,
  }])));
  return { format: 'leaf-private-v1', room, secrets: Object.fromEntries(room.players.map((player) => [player.id, crypto.randomUUID()])) };
}

async function expectFullScreenCelebration(page: Page) {
  await expect(page.locator('main.showing-podium')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const main = document.querySelector('main')!.getBoundingClientRect();
    const results = document.querySelector('.championship-results')!.getBoundingClientRect();
    const navigation = document.querySelector('.results-navigation')!.getBoundingClientRect();
    const footer = document.querySelector('footer')!.getBoundingClientRect();
    return {
      fullWidth: Math.abs(results.width - innerWidth) <= 1 && Math.abs(main.left) <= 1,
      fullAvailableHeight: Math.abs(main.top) <= 1 && Math.abs(results.bottom - footer.top) <= 1,
      startsBelowNavigation: Math.abs(results.top - navigation.bottom) <= 1,
      fillsViewport: results.height >= innerHeight * .75,
      contentFits: document.querySelector('.championship-results')!.scrollHeight <= results.height + 1,
    };
  })).toEqual({ fullWidth: true, fullAvailableHeight: true, startsBelowNavigation: true, fillsViewport: true, contentFits: true });
  await expect(page.locator('.celebration-sky')).toHaveCSS('pointer-events', 'none');
  await expectScreenFits(page);
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
  await expectFullScreenCelebration(page);
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

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  for (const pending of [false, true]) test(`full-screen podium and reachable controls ${viewport.width}px, tie ${pending}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const saved = backup(3, pending);
    await page.addInitScript((data) => localStorage.setItem('leaf-host-checkpoint', JSON.stringify(data)), saved);
    await page.goto('/');
    await page.getByRole('button', { name: 'Returning presenter? Restore your event', exact: true }).click();
    await page.getByRole('button', { name: 'Restore last browser checkpoint', exact: true }).click();
    await expect(page.locator('.podium-place')).toHaveCount(pending ? 1 : 3);
    await expectFullScreenCelebration(page);
    await page.getByRole('button', { name: 'Pause party', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Keep partying', exact: true })).toBeFocused();
    for (const selector of ['.mascot-dancer', '.champion-halo', '.party-sparkle', '.celebration-rays']) {
      await expect(page.locator(selector).first()).toHaveCSS('animation-name', 'none');
    }
    expect(await page.locator('.place-1 .podium-step').evaluate((node) => getComputedStyle(node, '::after').animationName)).toBe('none');
    for (const label of ['Winner awards', 'Event backups', 'Event history', 'Settings']) {
      await page.getByRole('button', { name: label, exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: label, exact: true })).not.toBeVisible();
    }
    if (pending) {
      const roll = page.getByRole('button', { name: 'Roll for podium', exact: true });
      await expect(roll).toBeInViewport({ ratio: 1 });
      await roll.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.podium-rolls')).toContainText('Latest podium d20:');
      await expectFullScreenCelebration(page);
    }
    await page.getByRole('button', { name: 'Bracket & standings', exact: true }).click();
    await expect(page.locator('main')).not.toHaveClass(/showing-podium/);
    await expect(page.getByRole('tab', { name: 'The bracket', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show podium', exact: true }).click();
    await expectFullScreenCelebration(page);
    await expect(page.getByRole('button', { name: 'Leave room', exact: true })).toBeInViewport({ ratio: 1 });
  });
}

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
