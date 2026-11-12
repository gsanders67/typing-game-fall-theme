import { z } from 'zod';
import { avatarSchema } from '../tournament/model';

export const keyEventSchema = z.object({
  seq: z.number().int().positive().max(20000),
  at: z.number().finite().min(0).max(60000),
  key: z.string().regex(/^(Backspace|[a-zA-Z ])$/),
});
export type KeyEvent = z.infer<typeof keyEventSchema>;
export const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    id: z.string().uuid(), token: z.string().uuid(),
    name: z.string().trim().min(1).max(20),
    avatar: avatarSchema,
  }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('ping'), at: z.number().finite() }),
  z.object({ type: z.literal('startAck'), match: z.string().max(30), revision: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('keys'), match: z.string().max(30), revision: z.number().int().nonnegative(),
    events: z.array(keyEventSchema).min(1).max(100),
  }),
]);
