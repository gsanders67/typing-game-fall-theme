export type RoomReply = { ok: true } | { ok: false; message: string };
export interface ClientEvents {
  'host-room': (code: string, token: string, reply: (result: RoomReply) => void) => void;
  'join-room': (code: string, linkId: string, reply: (result: RoomReply) => void) => void;
  packet: (linkId: string, data: unknown) => void;
  'close-link': (linkId: string) => void;
}
export interface ServerEvents {
  'player-joined': (linkId: string) => void;
  packet: (linkId: string, data: unknown) => void;
  'link-closed': (linkId: string) => void;
  'room-error': (message: string) => void;
}
