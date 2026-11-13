import { describe, expect, it } from 'vitest';
import { awardFilename, certificateHtml } from './awards';

describe('winner awards', () => {
  it('escapes player names in the standalone printable certificate', () => {
    const html = certificateHtml('<img src=x onerror=alert(1)> & "winner"');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;winner&quot;');
    expect(html).toContain('GDS #1 Best Keyboard Warrior');
    expect(html).toContain('2026 Fall Faster Finger Championship');
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/https?:|<script/);
  });
  it('keeps award filenames safe for downloads and handles names without ASCII letters', () => {
    expect(awardFilename('../A "winner"/?:', 'png')).toBe('gds-keyboard-warrior-A-winner.png');
    expect(awardFilename('***', 'html')).toBe('gds-keyboard-warrior-champion.html');
  });
});
