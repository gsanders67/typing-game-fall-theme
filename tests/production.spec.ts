import { expect, test } from '@playwright/test';

test('built static app and hash invites work under a Pages-style repository subpath', async ({ page }) => {
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
