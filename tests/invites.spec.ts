import { expect, test } from '@playwright/test';

test('query invites show the join-room title and copied links use the current room', async ({ browser, page }) => {
  await page.goto('/?room=ABC234');
  await expect(page.getByLabel('Room code')).toHaveValue('ABC234');
  await expect(page).toHaveTitle('Join room ABC234 | Leaf It On The Keyboard');
  await page.getByRole('button', { name: 'Back to the campfire', exact: true }).click();
  await expect(page).toHaveTitle('Leaf It On The Keyboard | Xbox Type Night');
  await page.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await page.locator('.room-code strong').innerText();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { document.documentElement.dataset.copiedInvite = value; },
    } });
  });
  await page.getByRole('button', { name: 'Copy invite link', exact: true }).click();
  const expected = new URL(`/?room=${code}`, page.url()).href;
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copiedInvite)).toBe(expected);
  const context = await browser.newContext();
  try {
    const joiner = await context.newPage();
    await joiner.goto(expected);
    await expect(joiner.getByLabel('Room code')).toHaveValue(code);
    await expect(joiner).toHaveTitle(`Join room ${code} | Leaf It On The Keyboard`);
  } finally { await context.close(); }
});
