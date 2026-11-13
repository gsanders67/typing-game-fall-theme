import { expect, type Page } from '@playwright/test';

export async function expectBadgeMatchesIcon(page: Page, png: Buffer) {
  const maximumChannelDifference = await page.evaluate(async (base64) => {
    const badge = new Image();
    badge.src = `data:image/png;base64,${base64}`;
    const icon = new Image();
    const favicon = document.querySelector<HTMLLinkElement>('link[type="image/svg+xml"]');
    if (!favicon) throw new Error('SVG favicon is missing.');
    icon.src = favicon.href;
    await Promise.all([badge.decode(), icon.decode()]);
    const pixels = (image: HTMLImageElement, crop: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 224;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      context.fillStyle = '#172d24';
      context.fillRect(0, 0, 224, 224);
      if (crop) context.drawImage(image, 48, 74, 224, 224, 0, 0, 224, 224);
      else context.drawImage(image, 0, 0, 224, 224);
      return context.getImageData(0, 0, 224, 224).data;
    };
    const actual = pixels(badge, true), expected = pixels(icon, false);
    return actual.reduce((difference, value, index) => Math.max(difference, Math.abs(value - expected[index])), 0);
  }, png.toString('base64'));
  expect(maximumChannelDifference, 'Badge artwork should match the SVG favicon, allowing one-channel rasterization rounding').toBeLessThanOrEqual(1);
}
