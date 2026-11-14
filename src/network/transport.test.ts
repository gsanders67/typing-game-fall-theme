import { io } from 'socket.io-client';
import { expect, it } from 'vitest';
import { RoomConnection } from './transport';

it('marks every channel offline before disconnect callbacks can broadcast to other channels', () => {
  const socket = io('http://127.0.0.1', { autoConnect: false });
  socket.connected = true;
  const a = new RoomConnection('a', socket), b = new RoomConnection('b', socket);
  a.activate(); b.activate();
  expect(b.open).toBe(true);
  a.on('close', () => expect(b.open).toBe(false));
  socket.connected = false;
  a.end();
  expect(() => b.send({ type: 'state' })).toThrow('not open');
  b.end();
  socket.disconnect();
});
