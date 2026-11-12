import { expect, it } from 'vitest';
import { messageSchema } from './protocol';

it('rejects forged control actions, oversized bursts, invalid keys and timestamps', () => {
  const event = { seq: 1, at: 1000, key: 'a' };
  const packet = { type: 'keys', match: 'r0m0', revision: 0, events: [event] };
  expect(messageSchema.safeParse(packet).success).toBe(true);
  for (const invalid of [
    { type: 'start' },
    { ...packet, events: Array.from({ length: 101 }, () => event) },
    { ...packet, events: [{ ...event, key: '<script>' }] },
    { ...packet, events: [{ ...event, at: -100 }] },
    { ...packet, events: [{ ...event, seq: 1.5 }] },
  ]) expect(messageSchema.safeParse(invalid).success).toBe(false);
});
