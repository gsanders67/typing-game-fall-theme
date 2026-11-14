import { describe, expect, it } from 'vitest';
import { joinRoomTitle, roomFromUrl, roomInviteUrl } from './invites';

describe('room invites', () => {
  it('creates crawlable root and prefixed invites without stale fragments or query values', () => {
    expect(roomInviteUrl('https://typing.example/?old=1#room=DEF234', 'ABC234')).toBe('https://typing.example/?room=ABC234');
    expect(roomInviteUrl('https://typing.example/event/?room=DEF234#old', 'ABC234')).toBe('https://typing.example/event/?room=ABC234');
  });
  it('reads query invites first and keeps legacy hash invites compatible', () => {
    expect(roomFromUrl(new URL('https://typing.example/?room=ABC234#room=DEF234'))).toBe('ABC234');
    expect(roomFromUrl(new URL('https://typing.example/event/#room=ABC234'))).toBe('ABC234');
    expect(joinRoomTitle('ABC234')).toContain('Join room ABC234');
  });
  it.each(['?room=INVALID', '?room=abc234', '?room=ABC234&room=DEF234', '?room=%3Cimg%3E', '?room=ABC230', '?room=bad#room=ABC234', '#room=ABC234&room=DEF234'])('ignores malformed or ambiguous room values: %s', (suffix) => {
    expect(roomFromUrl(new URL(`https://typing.example/${suffix}`))).toBe('');
  });
  it('rejects invalid codes rather than producing misleading links or titles', () => {
    expect(() => roomInviteUrl('https://typing.example/', '<img>')).toThrow('Invalid room code');
    expect(() => joinRoomTitle('ABC230')).toThrow('Invalid room code');
  });
});
