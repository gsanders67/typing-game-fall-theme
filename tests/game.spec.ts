import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectScreenFits } from './viewport';

async function player(browser: Browser, code: string, name: string, fixedTime?: number) {
  const context = await browser.newContext({ reducedMotion: fixedTime === undefined ? 'no-preference' : 'reduce' });
  const page = await context.newPage();
  if (fixedTime !== undefined) await page.clock.setFixedTime(fixedTime);
  await page.goto(`/#room=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Let me in' }).click();
  await expect(page.getByRole('heading', { name: 'The gathering place.' })).toBeVisible();
  await page.getByRole('button', { name: "I'm ready!" }).click();
  return { context, page };
}
async function breakTies(host: Page) {
  for (let count = 0; count < 30; count++) {
    const buttons = host.getByRole('button', { name: /Roll for the crown|Reroll tied leaders/ });
    if (await buttons.count() === 0) {
      const next = host.getByRole('button', { name: 'Next matches' });
      if (await next.isVisible() && await next.isEnabled()) { await next.click(); continue; }
      return;
    }
    await buttons.first().click();
  }
  throw new Error('Unusually many tied dice rolls.');
}
test('practice supports automatic clearing, typo correction, life loss and accessible options', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Less motion').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await page.getByRole('button', { name: /Try a practice round/ }).click();
  await expect(page.getByLabel('Type falling words')).toBeVisible();
  await expect(page.getByText('FINGERS ON KEYS')).not.toBeVisible({ timeout: 5000 });
  const target = page.getByTestId('falling-target').first();
  const word = await target.innerText();
  const keyboard = page.getByLabel('Type falling words');
  await keyboard.pressSequentially(word);
  await expect(page.locator('.game-hud').first()).not.toContainText('0 streak');
  await keyboard.pressSequentially('z');
  await expect(page.getByText('Backspace to correct')).toBeVisible();
  await expect(page.getByLabel('3 lives')).toBeVisible();
  await keyboard.press('Backspace');
  await expect(page.getByText('Backspace to correct')).not.toBeVisible();
  await page.getByRole('button', { name: 'Leave practice' }).click();
  await expect(page.getByRole('heading', { name: /Big fall energy/ })).toBeVisible();
});

test('trio tournament, checkpoint restore, reconnect, dice and one champion', async ({ browser, page: host }) => {
  await host.clock.install();
  await host.goto('/');
  await host.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await host.locator('.room-code strong').innerText();
  const clients = await Promise.all(['Acorn', 'Maple', 'Fern'].map((name) => player(browser, code, name)));
  await expect(host.getByText('3 ready', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Lock roster & draw bracket' }).click();
  await expect(host.getByText('TRIO', { exact: true })).toBeVisible();
  await host.getByLabel('Stage difficulty').selectOption('Acorn');
  await host.getByRole('button', { name: 'Start pending matches' }).click();
  await expect(clients[0].page.getByText('FINGERS ON KEYS')).toBeVisible();
  // Let all data channels acknowledge the common start before advancing host time.
  await Promise.all(clients.map((client) => expect(client.page.getByText('FINGERS ON KEYS')).toBeVisible()));
  await host.waitForTimeout(500);
  const backup = await host.evaluate(async () => {
    const path = '/src/state/session.ts';
    const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
    return session.exportPrivate();
  });
  await host.reload();
  await host.getByText('Returning presenter? Restore your event').click();
  await host.getByRole('button', { name: 'Restore last browser checkpoint' }).click();
  await expect(host.getByRole('heading', { name: 'The race for the crown.' })).toBeVisible();
  for (const client of clients) {
    await expect(client.page.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
    await client.page.getByRole('button', { name: 'Reconnect', exact: true }).click();
    await expect(client.page.getByRole('button', { name: 'Reconnect', exact: true })).not.toBeVisible();
  }
  await host.getByRole('button', { name: 'Start pending matches' }).click();
  await Promise.all(clients.map((client) => expect(client.page.getByText('FINGERS ON KEYS')).toBeVisible()));
  await expect(host.locator('.match-card.scheduled')).toHaveCount(1);
  await host.clock.runFor(5100);
  await expect(host.locator('.match-card.playing')).toHaveCount(1);
  await host.clock.fastForward(62000);
  await expect(host.getByRole('button', { name: 'Roll for the crown' })).toBeVisible();
  await breakTies(host);
  await expect(host.locator('.champion-banner h2')).toBeVisible();
  await expect(host.locator('.champion-banner')).toContainText('Type Night champion');
  await host.getByRole('tab', { name: 'Leaderboard' }).click();
  await expect(host.getByRole('cell', { name: '#1', exact: true })).toHaveCount(1);
  await expect(host.getByRole('cell', { name: '#2', exact: true })).toHaveCount(2);
  expect(JSON.parse(backup).format).toBe('leaf-private-v1');
  for (const client of clients) await client.context.close();
});

test('25-player fixed bracket completes four simultaneous stages with one champion', async ({ browser, page: host }) => {
  test.setTimeout(240_000);
  await host.setViewportSize({ width: 1280, height: 720 });
  let time = Date.now();
  await host.clock.setFixedTime(time);
  await host.goto('/');
  await host.getByRole('button', { name: 'Host a game', exact: true }).click();
  const code = await host.locator('.room-code strong').innerText();
  // Use one logical clock so rendering 26 windows cannot consume the typing window.
  const clients = await Promise.all(Array.from({ length: 25 }, (_, i) => player(browser, code, `Player ${String(i + 1).padStart(2, '0')}`, time)));
  async function advanceTime(milliseconds: number) {
    time += milliseconds;
    await host.clock.setFixedTime(time);
    await Promise.all(clients.map((client) => client.page.clock.setFixedTime(time)));
    // Let real data-channel heartbeats catch up before the next snapshot tick.
    await expect.poll(() => host.evaluate(async () => {
      const path = '/src/state/session.ts';
      const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
      const room = JSON.parse(session.exportPrivate()).room as import('../src/tournament/model').Room;
      return room.players.every((player) => player.connected);
    })).toBe(true);
    time += 250;
    await host.clock.setFixedTime(time);
    await Promise.all(clients.map((client) => client.page.clock.setFixedTime(time)));
  }
  await expect(host.getByText('25 ready', { exact: true })).toBeVisible();
  await expectScreenFits(host);
  for (let page = 0; page < 3; page++) await host.getByRole('button', { name: 'Next players' }).click();
  await expect(host.locator('.player-card')).toHaveCount(1);
  await expectScreenFits(host);
  await host.getByRole('button', { name: 'Lock roster & draw bracket' }).click();
  await expect(host.locator('.bracket-round')).toHaveCount(4);
  for (let round = 0; round < 4; round++) {
    await expect.poll(async () => host.evaluate(async () => {
      const path = '/src/state/session.ts';
      const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
      return session.getSnapshot().room?.players.filter((player) => !player.connected).map((player) => player.name);
    })).toEqual([]).catch(async (error: unknown) => {
      console.error('Client transport diagnostics:', await Promise.all(clients.map((client) => client.page.evaluate(async () => {
        const path = '/src/state/session.ts';
        const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
        const snapshot = session.getSnapshot();
        return { connected: snapshot.connected, error: snapshot.error, notice: snapshot.notice };
      }))));
      throw error;
    });
    await host.getByRole('button', { name: round === 0 ? 'Start pending matches' : 'Start next stage' }).click();
    await expect(host.locator('.match-card.scheduled')).toHaveCount([12, 6, 3, 1][round]).catch(async (error: unknown) => {
      console.error('Presenter start diagnostics:', await host.evaluate(async () => {
        const path = '/src/state/session.ts';
        const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
        const state = session.getSnapshot();
        return { role: state.role, error: state.error, notice: state.notice, matches: state.room?.matches.map((match) => ({ id: match.id, status: match.status })), main: document.querySelector('main')?.className };
      }));
      throw error;
    });
    await advanceTime(5100);
    await expect(host.locator('.match-card.playing')).toHaveCount([12, 6, 3, 1][round]);
    await expectScreenFits(host);
    if (round === 0) {
      await Promise.all(clients.map(async (client) => {
        await expect(client.page.getByLabel('Type falling words')).toBeVisible();
        await expect(client.page.getByText('FINGERS ON KEYS')).not.toBeVisible();
        const word = await client.page.getByTestId('falling-target').first().innerText();
        await client.page.getByLabel('Type falling words').pressSequentially(word);
      }));
      await advanceTime(500);
      await expect.poll(() => host.evaluate(async () => {
        const path = '/src/state/session.ts';
        const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
        return session.getSnapshot().room!.players.filter((player) => (session.liveStats(player.id)?.score || 0) > 0).length;
      })).toBe(25);
      await clients[0].page.evaluate(async () => {
        const path = '/src/state/session.ts';
        const { session } = await import(/* @vite-ignore */ path) as typeof import('../src/state/session');
        const connection = Reflect.get(session, 'connection') as import('peerjs').DataConnection;
        connection.close();
      });
      await expect(clients[0].page.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
      await clients[0].page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await expect(clients[0].page.getByRole('button', { name: 'Reconnect', exact: true })).not.toBeVisible();
    }
    await advanceTime(62000);
    await expect(host.getByRole('button', { name: 'Roll for the crown' }).first()).toBeVisible();
    await expectScreenFits(host);
    await breakTies(host);
  }
  await expect(host.locator('.champion-banner h2')).toHaveCount(1);
  await host.getByRole('tab', { name: 'Leaderboard' }).click();
  await expect(host.getByRole('cell', { name: '#1', exact: true })).toHaveCount(1);
  await expect(host.locator('tbody tr')).toHaveCount(5);
  await expect(host.getByText('25 players / placement first')).toBeVisible();
  const names = new Set(await host.locator('.table-player').allTextContents());
  for (let page = 0; page < 4; page++) {
    await expectScreenFits(host);
    await host.getByRole('button', { name: 'Next players' }).click();
    for (const name of await host.locator('.table-player').allTextContents()) names.add(name);
  }
  expect(names.size).toBe(25);
  for (const client of clients) await client.context.close();
});
