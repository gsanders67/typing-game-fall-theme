import type { Plugin } from 'vite';
import { isRoomCode, joinRoomTitle } from '../src/network/invites.ts';

export const escapeHtml = (value: string) => value.replace(/[&"<>]/g, (char) =>
  ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]!);

export function renderRoomMetadata(html: string, requestUrl: string) {
  const rooms = new URL(requestUrl, 'http://localhost').searchParams.getAll('room');
  if (rooms.length !== 1 || !isRoomCode(rooms[0])) return html;
  const room = rooms[0];
  const title = escapeHtml(joinRoomTitle(room));
  const description = escapeHtml(`Join room ${room} for an autumn arcade typing tournament. Bring your keyboard. Leave with the crown.`);
  const replacedNames = new Set(['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description']);
  return html.replace(/(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i, (_match, open, head: string, close) => {
    const cleaned = head.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
      .replace(/<meta\b[^>]*>/gi, (tag) => {
        const attributes = tag.matchAll(/\s(?:name|property)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi);
        for (const attribute of attributes) {
          if (replacedNames.has((attribute[1] ?? attribute[2] ?? attribute[3]).toLowerCase())) return '';
        }
        return tag;
      });
    return `${open}${cleaned}
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
  ${close}`;
  });
}

export const roomMetadataPlugin: Plugin = {
  name: 'room-preview-metadata',
  apply: 'serve',
  transformIndexHtml(html, context) {
    return renderRoomMetadata(html, context.originalUrl ?? context.path);
  },
};
