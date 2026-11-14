import { expect, test } from '@playwright/test';

test('Express serves the game and hash invites under a runtime base path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok()) errors.push(`Asset ${response.status()}: ${response.url()}`);
  });

  await page.goto('/event/#room=ABC234');
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
