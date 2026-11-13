export const AWARD_TITLE = 'GDS #1 Best Keyboard Warrior';
export const EVENT_NAME = '2026 Fall Faster Finger Championship';

export function downloadFile(name: string, value: Blob) {
  const url = URL.createObjectURL(value);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function awardFilename(name: string, extension: string) {
  const safe = name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'champion';
  return `gds-keyboard-warrior-${safe}.${extension}`;
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function certificateHtml(name: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(AWARD_TITLE)} - ${escapeHtml(name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#e8e4d7;color:#172d24;font-family:Georgia,serif}
article{max-width:1000px;margin:auto;padding:45px;text-align:center;border:8px double #89722e;background:#fffdf3}
.leaf{font-size:38px;color:#996023}h1{font-size:36px;margin:20px 0}h2{font-size:38px;overflow-wrap:anywhere;margin:22px 0}
p{font-size:18px;line-height:1.6}.event{font-weight:bold;font-size:24px}.small{font:13px Arial,sans-serif}
.seal{display:inline-block;border:2px solid #89722e;border-radius:50%;padding:20px;color:#69551e;font-weight:bold}
@page{size:landscape;margin:12mm}@media print{body{padding:0;background:white}article{max-width:none;break-inside:avoid;padding:20px}h1{font-size:30px}h2{font-size:32px}.screen-only{display:none}}
</style></head><body>
<p class="small screen-only">Use your browser's Print command to print this certificate or Save as PDF.</p>
<article><div class="leaf" aria-hidden="true">&#10086; &#9000; &#10086;</div>
<p class="small">CERTIFICATE OF FIRST PLACE</p><h1>${AWARD_TITLE}</h1>
<p>Presented to</p><h2>${escapeHtml(name)}</h2>
<p>For winning the</p><p class="event">${EVENT_NAME}</p>
<div class="seal">#1<br>CHAMPION</div><p>Fast fingers. Golden leaves. A well-earned victory.</p>
<p class="small">GDS friendly-event award</p></article></body></html>`;
}

function fittedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, width: number) {
  context.font = `bold ${size}px Arial, sans-serif`;
  while (context.measureText(text).width > width && size > 12) context.font = `bold ${--size}px Arial, sans-serif`;
  context.fillText(text, x, y);
}
export async function badgePng(name: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 380;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot create the badge image. Try another browser.');
  context.fillStyle = '#172d24';
  context.beginPath(); context.roundRect(8, 8, 1184, 364, 44); context.fill();
  context.strokeStyle = '#edda8f'; context.lineWidth = 5; context.stroke();
  context.fillStyle = '#e8a060';
  context.beginPath(); context.ellipse(158, 118, 36, 67, Math.PI / 4, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#edda8f';
  context.beginPath(); context.roundRect(65, 185, 190, 96, 14); context.fill();
  context.fillStyle = '#172d24';
  for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) context.fillRect(82 + col * 27, 204 + row * 26, 17, 13);
  context.fillStyle = '#edda8f';
  fittedText(context, AWARD_TITLE, 300, 103, 47, 840);
  context.fillStyle = '#ffffff';
  fittedText(context, name, 300, 182, 59, 840);
  context.fillStyle = '#e0cfac';
  fittedText(context, EVENT_NAME, 300, 245, 34, 840);
  fittedText(context, 'FIRST PLACE  /  FRIENDLY-EVENT CHAMPION', 300, 302, 24, 840);
  return new Promise((resolve, reject) => canvas.toBlob((blob) =>
    blob ? resolve(blob) : reject(new Error('Badge image creation failed. Please try again.')), 'image/png'));
}
