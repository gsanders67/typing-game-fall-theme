import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { ClientEvents, ServerEvents, RoomReply } from '../src/network/events.ts';
import type { ServerConfig } from './config.ts';

interface SocketData { code?: string; role?: 'host' | 'player'; linkId?: string }
type RoomSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
interface HostedRoom { hostId: string; token: string; players: Map<string, string> }
const codeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const uuid = z.string().uuid();

export function attachRooms(http: HttpServer, config: ServerConfig) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(http, {
    path: `${config.basePath}/socket.io`,
    serveClient: false,
    maxHttpBufferSize: 256 * 1024,
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      if (!origin) { done(null, true); return; }
      try { done(null, new URL(origin).host === req.headers.host || origin === config.publicOrigin); }
      catch { done('Invalid request origin.', false); }
    },
  });
  const rooms = new Map<string, HostedRoom>();
  const socketById = (id: string) => io.sockets.sockets.get(id);
  const closeLink = (room: HostedRoom, linkId: string) => {
    const playerId = room.players.get(linkId);
    if (!playerId) return;
    room.players.delete(linkId);
    const player = socketById(playerId);
    if (player) { player.data = {}; player.emit('link-closed', linkId); }
    socketById(room.hostId)?.emit('link-closed', linkId);
  };
  const removeRoom = (code: string, room: HostedRoom) => {
    for (const id of [...room.players.keys()]) closeLink(room, id);
    const host = socketById(room.hostId);
    if (host) host.data = {};
    rooms.delete(code);
  };
  const currentRoom = (socket: RoomSocket) => socket.data.code ? rooms.get(socket.data.code) : undefined;
  io.on('connection', (socket) => {
    let windowStart = Date.now();
    let packets = 0;
    let commands = 0;
    const allowCommand = () => {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; packets = 0; commands = 0; }
      return ++commands <= 20;
    };
    const respond = (reply: (result: RoomReply) => void, result: RoomReply) => {
      if (typeof reply === 'function') reply(result);
    };
    socket.on('host-room', (code, token, reply) => {
      if (!allowCommand()) { respond(reply, { ok: false, message: 'Too many room requests.' }); return; }
      if (!codeSchema.safeParse(code).success || !uuid.safeParse(token).success || socket.data.role) {
        respond(reply, { ok: false, message: 'Invalid room registration.' }); return;
      }
      const existing = rooms.get(code);
      if (existing && existing.token !== token) { respond(reply, { ok: false, message: 'Room code is taken.' }); return; }
      if (existing) removeRoom(code, existing);
      if (rooms.size >= 100) { respond(reply, { ok: false, message: 'The server is at room capacity.' }); return; }
      rooms.set(code, { hostId: socket.id, token, players: new Map() });
      socket.data = { code, role: 'host' };
      respond(reply, { ok: true });
    });
    socket.on('join-room', (code, linkId, reply) => {
      if (!allowCommand()) { respond(reply, { ok: false, message: 'Too many room requests.' }); return; }
      const room = rooms.get(code);
      if (!codeSchema.safeParse(code).success || !uuid.safeParse(linkId).success || socket.data.role) {
        respond(reply, { ok: false, message: 'Invalid room join.' }); return;
      }
      if (!room) { respond(reply, { ok: false, message: 'Room not found. Check the code and that the presenter is connected.' }); return; }
      if (room.players.size >= 30 || room.players.has(linkId)) { respond(reply, { ok: false, message: 'Room connections are full or duplicated.' }); return; }
      room.players.set(linkId, socket.id);
      socket.data = { code, role: 'player', linkId };
      socketById(room.hostId)?.emit('player-joined', linkId);
      respond(reply, { ok: true });
    });
    socket.on('packet', (linkId, data) => {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; packets = 0; commands = 0; }
      if (++packets > (socket.data.role === 'host' ? 2000 : 120)) {
        socket.emit('room-error', 'Too many room messages.'); socket.disconnect(true); return;
      }
      const room = currentRoom(socket);
      if (!room) { socket.emit('room-error', 'Join a room before sending messages.'); return; }
      if (room.hostId === socket.id) {
        const player = room.players.get(linkId);
        if (player) socketById(player)?.emit('packet', linkId, data);
      } else if (socket.data.linkId === linkId && room.players.get(linkId) === socket.id) {
        socketById(room.hostId)?.emit('packet', linkId, data);
      } else socket.emit('room-error', 'Cannot send messages to another player.');
    });
    socket.on('close-link', (linkId) => {
      const room = currentRoom(socket);
      if (room && (room.hostId === socket.id || socket.data.linkId === linkId)) closeLink(room, linkId);
    });
    socket.on('disconnect', () => {
      const room = currentRoom(socket);
      if (!room) return;
      if (room.hostId === socket.id) removeRoom(socket.data.code!, room);
      else if (socket.data.linkId) closeLink(room, socket.data.linkId);
    });
  });
  return io;
}
