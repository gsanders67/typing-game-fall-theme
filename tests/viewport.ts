import { expect, type Page } from '@playwright/test';

export async function expectScreenFits(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const problems: string[] = [];
    if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(`page height ${document.documentElement.scrollHeight} > ${innerHeight}`);
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`page width ${document.documentElement.scrollWidth} > ${innerWidth}`);
    for (const element of document.querySelectorAll<HTMLElement>('.settings-menu > button, main, main button, main input, main select, main .panel, main .pager, main .match-card, .typing-bar, .result-banner')) {
      if (!element.checkVisibility()) continue;
      const box = element.getBoundingClientRect();
      if (box.top < -1 || box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1) {
        problems.push(`${element.tagName}.${element.className}: ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`);
      }
      if (element.scrollHeight > element.clientHeight + 1) problems.push(`${element.tagName}.${element.className} clips vertical content`);
    }
    return problems;
  })).toEqual([]);
}
