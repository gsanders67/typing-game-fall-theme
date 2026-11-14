export const SITE_TITLE = 'Leaf It On The Keyboard | Xbox Type Night';
export const isRoomCode = (value: string): boolean => /^[A-HJ-NP-Z2-9]{6}$/.test(value);

export function joinRoomTitle(code: string): string {
  if (!isRoomCode(code)) throw new Error('Invalid room code.');
  return `Join room ${code} | Leaf It On The Keyboard`;
}

export function roomFromUrl(url: URL): string {
  const params = url.searchParams.has('room') ? url.searchParams : new URLSearchParams(url.hash.slice(1));
  const codes = params.getAll('room');
  return codes.length === 1 && isRoomCode(codes[0]) ? codes[0] : '';
}

export function roomInviteUrl(href: string, code: string): string {
  if (!isRoomCode(code)) throw new Error('Invalid room code.');
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.href;
}
