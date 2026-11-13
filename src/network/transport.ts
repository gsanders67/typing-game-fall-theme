import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from './events';

class Events<E extends { [K in keyof E]: unknown[] }> {
  private listeners: { [K in keyof E]?: Set<(...args: E[K]) => void> } = {};
  on<K extends keyof E>(event: K, listener: (...args: E[K]) => void) {
    (this.listeners[event] ??= new Set()).add(listener);
    return this;
  }
  off<K extends keyof E>(event: K, listener: (...args: E[K]) => void) {
    this.listeners[event]?.delete(listener);
    return this;
  }
  once<K extends keyof E>(event: K, listener: (...args: E[K]) => void) {
    const handler = (...args: E[K]) => { this.off(event, handler); listener(...args); };
    return this.on(event, handler);
  }
  protected emit<K extends keyof E>(event: K, ...args: E[K]) {
    for (const listener of this.listeners[event] ?? []) listener(...args);
  }
}

export class RoomConnection extends Events<{ open: []; data: [unknown]; close: []; error: [Error] }> {
  private active = false;
  private closed = false;
  get open() { return this.active && this.socket.connected; }
  constructor(readonly connectionId: string, private socket: Socket<ServerEvents, ClientEvents>) { super(); }
  send(data: unknown) {
    if (!this.open || !this.socket.connected) throw new Error('Room connection is not open.');
    this.socket.emit('packet', this.connectionId, data);
  }
  activate() { if (!this.closed) { this.active = true; this.emit('open'); } }
  receive(data: unknown) { if (this.open) this.emit('data', data); }
  fail(error: Error) { if (!this.closed) this.emit('error', error); this.end(); }
  end() {
    if (this.closed) return;
    this.closed = true; this.active = false;
    this.emit('close');
  }
  close() {
    if (this.closed) return;
    if (this.socket.connected) this.socket.emit('close-link', this.connectionId);
    this.end();
  }
}

class RoomTransport extends Events<{ open: [string]; connection: [RoomConnection]; error: [Error]; disconnected: [] }> {
  private socket: Socket<ServerEvents, ClientEvents>;
  private links = new Map<string, RoomConnection>();
  private token = crypto.randomUUID();
  destroyed = false;
  constructor(private code?: string) {
    super();
    const base = new URL('.', document.baseURI).pathname;
    this.socket = io({ path: `${base}socket.io`, autoConnect: false, forceNew: true, timeout: 10000 });
    this.socket.on('connect', () => {
      if (!this.code) { this.emit('open', this.socket.id!); return; }
      this.socket.timeout(10000).emit('host-room', this.code, this.token, (error, result) => {
        if (this.destroyed) return;
        if (error) this.emit('error', new Error('Server connection timed out.'));
        else if (!result.ok) this.emit('error', new Error(result.message));
        else this.emit('open', this.code!);
      });
    });
    this.socket.on('player-joined', (id) => {
      const link = this.makeLink(id);
      this.emit('connection', link);
      link.activate();
    });
    this.socket.on('packet', (id, data) => this.links.get(id)?.receive(data));
    this.socket.on('link-closed', (id) => this.links.get(id)?.end());
    this.socket.on('room-error', (message) => this.emit('error', new Error(message)));
    this.socket.on('connect_error', (error) => this.emit('error', new Error(`Cannot connect to the game server: ${error.message}`)));
    this.socket.on('disconnect', () => {
      for (const link of this.links.values()) link.end();
      this.emit('disconnected');
    });
    this.socket.connect();
  }
  private makeLink(id: string) {
    const link = new RoomConnection(id, this.socket);
    this.links.set(id, link);
    link.once('close', () => this.links.delete(id));
    return link;
  }
  connect(code: string) {
    const id = crypto.randomUUID();
    const link = this.makeLink(id);
    if (!this.socket.connected) {
      queueMicrotask(() => link.fail(new Error('Server is offline. Wait for it to reconnect, then try again.')));
      return link;
    }
    this.socket.timeout(10000).emit('join-room', code, id, (error, result) => {
      if (error) link.fail(new Error('Joining the room timed out.'));
      else if (!result.ok) link.fail(new Error(result.message));
      else link.activate();
    });
    return link;
  }
  destroy() {
    this.destroyed = true;
    this.socket.disconnect();
    for (const link of this.links.values()) link.end();
  }
}

export function createTransport(code?: string) { return new RoomTransport(code); }
export type { RoomTransport };
