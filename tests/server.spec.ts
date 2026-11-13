import { expect, test } from '@playwright/test';

test('Express serves the React game, hash invites, and same-origin relay credentials', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok()) errors.push(`Asset ${response.status()}`);
  });
  await page.goto('/#room=ABC234');
  await expect(page.getByLabel('Room code')).toHaveValue('ABC234');
  const credentials = await page.evaluate(async () => {
    const response = await fetch('/api/ice', { credentials: 'omit', cache: 'no-store' });
    const body = await response.json();
    return { status: response.status, urls: body.iceServers[0].urls, expiresAt: body.expiresAt };
  });
  expect(credentials.status).toBe(200);
  expect(credentials.urls).toContain('turns:turn.example.com:443?transport=tcp');
  expect(credentials.expiresAt).toBeGreaterThan(Date.now() / 1000);
  await page.getByRole('button', { name: 'Back to the campfire' }).click();
  await page.getByRole('button', { name: /Try a practice round/ }).click();
  await expect(page.getByLabel('Type falling words')).toBeVisible();
  await page.getByRole('button', { name: 'Leave practice' }).click();
  await page.route('https://*.peerjs.com/**', (route) => route.abort());
  const relayRequest = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/ice');
  await page.getByRole('button', { name: 'Host a game', exact: true }).click();
  expect((await relayRequest).status()).toBe(200);
  expect(errors).toEqual([]);
});
