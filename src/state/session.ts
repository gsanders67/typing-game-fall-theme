import { z } from 'zod';
import { advance, DURATION, input, newBoard, stats, type Board, type Difficulty } from '../game/engine';
import {
  defaultAvatar, draw, emptyRoom, finish, log, resolvePlayers, rollDice, rollPodium,
  validateCheckpoint, type AvatarConfig, type Room,
} from '../tournament/model';
import { createTransport, type RoomTransport, type RoomConnection } from '../network/transport';
import { messageSchema, type KeyEvent } from '../network/protocol';

const LAG = 300;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const backupSchema = z.object({
  format: z.literal('leaf-private-v1'),
  room: z.unknown(),
  secrets: z.record(z.string().uuid(), z.string().uuid()),
});
type Backup = { format: 'leaf-private-v1'; room: Room; secrets: Record<string, string> };
interface Runtime { board: Board; queue: KeyEvent[]; accepted: number; applied: number; ackStart: boolean }
interface Link { conn: RoomConnection; player?: string; seen: number; messages: number; window: number }
export interface Snapshot {
  role: 'none' | 'host' | 'player';
  room?: Room;
  board?: Board;
  playerId?: string;
  ack: number;
  offset: number;
  connected: boolean;
  error?: string;
  notice?: string;
  live?: Record<string, StatsWithLives>;
}
interface StatsWithLives { score: number; wpm: number; accuracy: number | null; best: number; lives: number }
type StatePacket = {
  type: 'state'; room: Room; board?: Board; ack: number; serverAt: number; notice?: string;
  live: Record<string, StatsWithLives>;
};
const identitySchema = z.object({ id: z.string().uuid(), token: z.string().uuid() });

export class Session {
  private transport?: RoomTransport;
  private connection?: RoomConnection;
  private links = new Map<string, Link>();
  private runtimes = new Map<string, Runtime>();
  private secrets: Record<string, string> = {};
  private room?: Room;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private snapshot: Snapshot = { role: 'none', connected: false, ack: 0, offset: 0 };
  private identity?: z.infer<typeof identitySchema>;
  private pending: KeyEvent[] = [];
  private seq = 0;
  private activeMatch = '';
  private lastPing = 0;
  private lastBroadcast = 0;
  private disposed = false;
  private hello?: { name: string; avatar: AvatarConfig };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<Snapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private error(error: unknown) {
    this.update({ error: error instanceof Error ? error.message : String(error) });
  }
  clearError = () => this.update({ error: undefined });
  private storage(key: string, value: string) {
    try { localStorage.setItem(key, value); }
    catch (error) { this.error(new Error(`Browser storage failed. Export a private backup before closing. ${String(error)}`)); }
  }
  async host(restore?: unknown): Promise<void> {
    this.close();
    this.disposed = false;
    this.update({ role: 'host', room: undefined, connected: false, error: undefined, board: undefined });
    if (restore) {
      const backup = backupSchema.parse(restore);
      this.room = validateCheckpoint(backup.room);
      if (!this.room.rulesVersion && this.room.phase !== 'finished' && this.room.phase !== 'lobby') {
        throw new Error('This unfinished backup uses legacy 60-second rules. Restore it with the previous app version or start a new event. Completed backups remain supported.');
      }
      if (this.room.phase === 'lobby') this.room.rulesVersion = 2;
      this.secrets = backup.secrets;
      if (this.room.players.some((player) => !this.secrets[player.id])) throw new Error('Backup lacks player reconnect credentials.');
      this.room.revision++;
      for (const player of this.room.players) { player.connected = false; player.ready = false; }
      for (const match of this.room.matches) {
        if (match.status === 'playing' || match.status === 'scheduled' || match.status === 'arming') {
          match.status = 'pending'; match.startAt = 0; match.results = {}; match.rolls = [];
        }
      }
      log(this.room, 'Presenter restored checkpoint. Unfinished games require replay.');
    } else {
      this.room = emptyRoom(this.newCode());
      this.secrets = {};
    }
    let opened = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.transport = createTransport(this.room.code);
        await this.waitForServer(this.transport);
        opened = true;
        break;
      } catch (error) {
        this.transport?.destroy();
        if (!(error instanceof Error) || !error.message.includes('taken') || attempt === 3) throw error;
        this.room.code = this.newCode();
        log(this.room, 'Previous code unavailable; new code issued. Players must use the new joining code.');
        this.update({ notice: 'Room code changed. Share the new code; returning players should keep their original tab open.' });
      }
    }
    if (!opened || !this.transport) throw new Error('Could not connect the presenter to the game server.');
    this.transport.on('connection', (conn) => this.accept(conn));
    this.watchServer(this.transport);
    this.update({ connected: true });
    this.persist();
    this.timer = setInterval(() => this.tickHost(), 50);
  }
  private newCode() {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => alphabet[byte % alphabet.length]).join('');
  }
  private waitForServer(transport: RoomTransport): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Game server connection timed out. Check your connection and try again.')), 15000);
      transport.once('open', (id) => { clearTimeout(timeout); resolve(id); });
      transport.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
  }
  private watchServer(transport: RoomTransport) {
    transport.on('error', (error) => this.error(error));
    transport.on('disconnected', () => {
      this.update({ connected: false, notice: 'Game server disconnected. Reconnecting; players may need to use Reconnect.' });
    });
    transport.on('open', () => {
      if (this.snapshot.role === 'host') this.update({ connected: true, error: undefined, notice: 'Game server reconnected. Players can use Reconnect.' });
    });
  }
  async join(code: string, name: string, avatar: AvatarConfig = defaultAvatar) {
    this.close();
    this.disposed = false;
    this.update({ role: 'player', room: undefined, connected: false, error: undefined, notice: undefined, board: undefined, ack: 0 });
    const stored = localStorage.getItem(`leaf-identity-${code}`);
    this.identity = stored ? identitySchema.parse(JSON.parse(stored)) : { id: crypto.randomUUID(), token: crypto.randomUUID() };
    this.storage(`leaf-identity-${code}`, JSON.stringify(this.identity));
    this.hello = { name, avatar };
    this.update({ playerId: this.identity.id });
    this.transport = createTransport();
    await this.waitForServer(this.transport);
    this.watchServer(this.transport);
    await this.connect(code);
    this.timer = setInterval(() => this.tickPlayer(), 100);
  }
  private connect(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.transport || !this.identity || !this.hello) { reject(new Error('No player identity.')); return; }
      const conn = this.transport.connect(code);
      this.connection = conn;
      const timeout = setTimeout(() => {
        reject(new Error('Room connection timed out. Check the code and that the presenter and game server are connected.'));
        conn.close();
      }, 15000);
      conn.on('open', () => {
        conn.send({ type: 'hello', ...this.identity, ...this.hello });
      });
      conn.on('data', (data) => {
        if (typeof data !== 'object' || data === null || !('type' in data)) {
          this.error(new Error('Invalid host message.')); return;
        }
        if (data.type === 'error' && 'message' in data) {
          clearTimeout(timeout);
          const error = new Error(String(data.message));
          this.error(error); reject(error);
          return;
        }
        if (data.type === 'pong' && 'at' in data && 'serverAt' in data && typeof data.at === 'number' && typeof data.serverAt === 'number') {
          this.update({ offset: data.serverAt - (Date.now() + data.at) / 2 });
          return;
        }
        if (data.type === 'state') {
          clearTimeout(timeout);
          const packet = data as StatePacket;
          this.receive(packet);
          resolve();
        }
      });
      conn.on('close', () => {
        this.update({ connected: false, notice: 'Connection lost. The match timer keeps running. Use Reconnect.' });
        clearTimeout(timeout);
        reject(new Error('Room connection closed.'));
      });
      conn.on('error', (error) => { clearTimeout(timeout); this.error(error); reject(error); });
    });
  }
  async reconnect(newCode?: string) {
    if (!this.hello || !this.identity || !this.transport) throw new Error('Rejoin using the room code.');
    const code = newCode || this.snapshot.room?.code;
    if (!code) throw new Error('No room to reconnect to. Rejoin using the room code.');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('Enter a valid six-character room code.');
    this.connection?.close();
    this.storage(`leaf-identity-${code}`, JSON.stringify(this.identity));
    await this.connect(code);
  }
  private receive(packet: StatePacket) {
    const changed = this.snapshot.room?.revision !== packet.room.revision;
    const active = packet.room.matches.find((match) =>
      match.players.includes(this.identity!.id) && (match.status === 'arming' || match.status === 'scheduled' || match.status === 'playing'));
    if (changed || (active && active.id !== this.activeMatch)) {
      this.pending = []; this.seq = 0; this.activeMatch = active?.id || '';
    }
    if (!active) this.pending = [];
    this.pending = this.pending.filter((event) => event.seq > packet.ack);
    this.seq = Math.max(this.seq, packet.ack);
    const initialOffset = this.snapshot.room ? this.snapshot.offset : packet.serverAt - Date.now();
    this.update({
      room: packet.room, board: packet.board, ack: packet.ack, offset: initialOffset,
      connected: true, notice: packet.notice, live: packet.live,
    });
    if (active?.status === 'arming' || active?.status === 'scheduled') {
      this.send({ type: 'startAck', match: active.id, revision: packet.room.revision });
    }
  }
  private send(data: unknown) {
    if (this.connection?.open) this.connection.send(data);
  }
  ready(ready: boolean) { this.send({ type: 'ready', ready }); }
  key(key: string, at: number) {
    if (!this.snapshot.connected || this.pending.length >= 100 || this.seq >= 20000) return;
    const event: KeyEvent = { key, at: Math.max(0, Math.min(DURATION, at)), seq: ++this.seq };
    this.pending.push(event);
    this.flush();
  }
  predicted(): Board | undefined {
    const { board, room, playerId, offset } = this.snapshot;
    if (!board || !room) return undefined;
    const match = room.matches.find((item) => item.players.includes(playerId!) &&
      (item.status === 'arming' || item.status === 'scheduled' || item.status === 'playing'));
    if (!match) return board;
    const copy = structuredClone(board);
    const time = Math.max(0, Date.now() + offset - match.startAt);
    for (const event of this.pending) {
      if (event.at <= time) input(copy, event.key, Math.max(event.at, copy.now), match.preset);
    }
    if (time >= 0) advance(copy, time, match.preset);
    return copy;
  }
  private flush() {
    const room = this.snapshot.room;
    if (room && this.pending.length) this.send({
      type: 'keys', match: this.activeMatch, revision: room.revision,
      events: this.pending,
    });
  }
  private tickPlayer() {
    if (Date.now() - this.lastPing > 1000) {
      this.lastPing = Date.now();
      this.send({ type: 'ping', at: Date.now() });
    }
    this.flush();
  }
  private accept(conn: RoomConnection) {
    if (this.links.size >= 30) { conn.close(); return; }
    const link: Link = { conn, seen: Date.now(), messages: 0, window: Date.now() };
    this.links.set(conn.connectionId, link);
    conn.on('data', (data) => {
      if (!this.room) return;
      const parsed = messageSchema.safeParse(data);
      if (!parsed.success) { this.reject(link, 'Invalid room message.'); return; }
      const now = Date.now();
      if (now - link.window > 1000) { link.window = now; link.messages = 0; }
      if (++link.messages > 100) { this.reject(link, 'Too many messages.'); return; }
      link.seen = now;
      const message = parsed.data;
      if (message.type === 'hello') {
        if (link.player) { this.reject(link, 'Identity already established.'); return; }
        const existing = this.room.players.find((player) => player.id === message.id);
        if (existing) {
          if (this.secrets[message.id] !== message.token) { this.reject(link, 'Invalid reconnect identity.'); return; }
          for (const other of this.links.values()) {
            if (other !== link && other.player === existing.id) other.conn.close();
          }
          existing.connected = true;
        } else {
          if (this.room.phase !== 'lobby') { this.reject(link, 'Roster locked. Only existing players may reconnect.'); return; }
          if (this.room.players.length >= 25) { this.reject(link, 'Room is full (25 players).'); return; }
          if (this.room.players.some((player) => player.name.toLowerCase() === message.name.toLowerCase())) {
            this.reject(link, 'That name is taken. Choose another.'); return;
          }
          this.room.players.push({
            id: message.id, name: message.name, avatar: message.avatar, ready: false, connected: true,
          });
          this.secrets[message.id] = message.token;
        }
        link.player = message.id;
        this.persist();
        this.broadcast();
        return;
      }
      if (!link.player) { this.reject(link, 'Join the room before sending commands.'); return; }
      const player = this.room.players.find((item) => item.id === link.player);
      if (!player) return;
      player.connected = true;
      if (message.type === 'ping') { conn.send({ type: 'pong', at: message.at, serverAt: now }); return; }
      if (message.type === 'ready') {
        player.ready = message.ready; this.broadcast(); return;
      }
      const match = this.room.matches.find((item) => item.id === message.match);
      if (!match || message.revision !== this.room.revision || !match.players.includes(player.id)) return;
      const runtime = this.runtimes.get(player.id);
      if (!runtime) return;
      if (message.type === 'startAck') { runtime.ackStart = true; return; }
      if (match.status !== 'playing' && match.status !== 'scheduled') return;
      for (const event of message.events) {
        if (event.seq <= runtime.accepted) continue;
        if (event.seq !== runtime.accepted + 1) break;
        if (now > match.startAt + DURATION + LAG || now < match.startAt || event.at >= DURATION) continue;
        const at = Math.max(runtime.board.now, runtime.queue.at(-1)?.at || 0, Math.min(event.at, now - match.startAt + 50));
        runtime.queue.push({ ...event, at });
        runtime.accepted = event.seq;
      }
    });
    conn.on('close', () => {
      this.links.delete(conn.connectionId);
      if (this.room && link.player && ![...this.links.values()].some((other) => other.player === link.player && other.conn.open)) {
        const player = this.room.players.find((item) => item.id === link.player);
        if (player) player.connected = false;
        this.broadcast();
      }
    });
    conn.on('error', (error) => { this.error(error); conn.close(); });
  }
  private reject(link: Link, message: string) {
    if (link.conn.open) link.conn.send({ type: 'error', message });
    setTimeout(() => link.conn.close(), 100);
  }
  private packet(player?: string): StatePacket {
    const runtime = player ? this.runtimes.get(player) : undefined;
    return {
      type: 'state', room: this.room!, board: runtime?.board,
      ack: runtime?.applied || 0, serverAt: Date.now(), notice: this.snapshot.notice,
      live: Object.fromEntries([...this.runtimes].map(([id, value]) => [id, {
        ...stats(value.board), lives: value.board.lives,
      }])),
    };
  }
  private broadcast() {
    if (!this.room) return;
    this.update({ room: structuredClone(this.room) });
    for (const link of this.links.values()) {
      if (link.player && link.conn.open) link.conn.send(this.packet(link.player));
    }
  }
  private persist() {
    if (!this.room) return;
    const backup: Backup = { format: 'leaf-private-v1', room: this.room, secrets: this.secrets };
    this.storage('leaf-host-checkpoint', JSON.stringify(backup));
    this.broadcast();
  }
  draw() {
    if (!this.room) return;
    if (!this.room.players.every((player) => player.connected && player.ready)) throw new Error('Every player must be connected and ready.');
    draw(this.room, crypto.randomUUID());
    this.persist();
  }
  remove(id: string) {
    if (!this.room || this.room.phase !== 'lobby') throw new Error('Players can only be removed before the draw.');
    this.room.players = this.room.players.filter((player) => player.id !== id);
    delete this.secrets[id];
    for (const link of this.links.values()) if (link.player === id) this.reject(link, 'Removed from lobby by presenter.');
    this.persist();
  }
  setPreset(preset: Difficulty, round = this.room?.round) {
    if (!this.room) return;
    const matches = this.room.matches.filter((item) => item.round === round);
    if (!matches.length) throw new Error('Stage not found.');
    if (matches.some((match) => match.status !== 'pending')) throw new Error('Difficulty is locked once the stage starts.');
    for (const match of matches) {
      if (match.status !== 'pending') throw new Error('Difficulty is locked once the stage starts.');
      match.preset = preset;
    }
    this.persist();
  }
  start() {
    const room = this.room;
    if (!room || room.phase !== 'tournament') return;
    let matches = room.matches.filter((match) => match.round === room.round);
    if (matches.every((match) => match.status === 'done')) {
      room.round++;
      matches = room.matches.filter((match) => match.round === room.round);
    }
    const pending = matches.filter((match) => match.status === 'pending');
    if (!pending.length) throw new Error('Finish this stage and its tie-breaks first.');
    for (const match of pending) {
      const players = resolvePlayers(room, match);
      if (players.length !== match.sources.length) throw new Error('Upstream matches are incomplete.');
      if (!players.every((id) => room.players.find((player) => player.id === id)?.connected)) throw new Error('All competing players must reconnect before starting.');
    }
    const startAt = Date.now() + 20000;
    for (const match of pending) {
      match.players = resolvePlayers(room, match);
      match.status = 'arming';
      match.startAt = startAt;
      for (const id of match.players) this.runtimes.set(id, {
        board: newBoard(match.seed), queue: [], accepted: 0, applied: 0, ackStart: false,
      });
    }
    this.persist();
  }
  dice(id: string) {
    const match = this.room?.matches.find((item) => item.id === id);
    if (!match || !this.room) return;
    rollDice(this.room, match);
    this.persist();
  }
  podiumDice() {
    if (!this.room || this.snapshot.role !== 'host') throw new Error('Only the presenter can resolve podium ties.');
    rollPodium(this.room);
    this.persist();
  }
  replay(id: string) {
    const room = this.room;
    if (!room) return;
    if (!room.rulesVersion) throw new Error('Legacy results are read-only. Start a new event to use the 30-second rules.');
    const match = room.matches.find((item) => item.id === id);
    if (!match) return;
    const invalid = new Set([id]);
    for (const item of room.matches) {
      if (item.sources.some((source) => invalid.has(source.replace('winner:', '')))) invalid.add(item.id);
    }
    room.revision++;
    room.podiumRolls = [];
    // A revision is room-wide: stop all unfinished games so no client retains stale input.
    for (const item of room.matches) {
      if (invalid.has(item.id) || item.status === 'playing' || item.status === 'scheduled' || item.status === 'arming') {
        item.status = 'pending'; item.results = {}; item.rolls = []; item.winner = undefined;
        item.startAt = 0;
        item.players = item.round === 0 ? item.sources : [];
      }
    }
    this.runtimes.clear();
    room.round = Math.min(room.round, match.round);
    room.phase = 'tournament';
    log(room, `Presenter voided ${id} and dependent results. Unfinished games reset.`);
    this.persist();
  }
  private tickHost() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    for (const link of this.links.values()) {
      if (now - link.seen > 6000 && link.player) {
        const player = room.players.find((item) => item.id === link.player);
        if (player) player.connected = false;
      }
      if (!link.player && now - link.seen > 15000) link.conn.close();
    }
    let checkpoint = false;
    const arming = room.matches.filter((match) => match.status === 'arming');
    if (arming.length) {
      if (arming.every((match) => match.players.every((id) => this.runtimes.get(id)?.ackStart &&
        room.players.find((player) => player.id === id)?.connected))) {
        for (const match of arming) { match.status = 'scheduled'; match.startAt = now + 5000; }
        checkpoint = true;
      } else if (arming.some((match) => now >= match.startAt)) {
        for (const match of arming) {
          match.status = 'pending';
          for (const id of match.players) this.runtimes.delete(id);
        }
        const scheduled = room.matches.filter((match) => match.status === 'scheduled');
        if (scheduled.some((match) => now >= match.startAt) && scheduled.some((match) => !match.players.every((id) =>
          room.players.find((player) => player.id === id)?.connected))) {
          for (const match of scheduled) {
            match.status = 'pending';
            for (const id of match.players) this.runtimes.delete(id);
          }
          this.update({ notice: 'Stage cancelled: a player disconnected during countdown. Reconnect and start again.' });
          checkpoint = true;
        }
        this.update({ notice: 'Stage cancelled: readiness timed out. Reconnect all players and start again.' });
        checkpoint = true;
      }
    }
    for (const match of room.matches) {
      if (match.status !== 'scheduled' && match.status !== 'playing') continue;
      if (match.status === 'scheduled' && now >= match.startAt) {
        if (!match.players.every((id) => this.runtimes.get(id)?.ackStart &&
          room.players.find((player) => player.id === id)?.connected)) {
          match.status = 'pending';
          for (const id of match.players) this.runtimes.delete(id);
          this.update({ notice: `${match.id} cancelled: not all players acknowledged the countdown. Reconnect and start again.` });
          checkpoint = true;
          continue;
        }
        match.status = 'playing';
      }
      if (match.status !== 'playing') continue;
      const until = Math.max(0, Math.min(DURATION, now - match.startAt - LAG));
      for (const id of match.players) {
        const runtime = this.runtimes.get(id)!;
        while (runtime.queue.length && runtime.queue[0].at <= until) {
          const event = runtime.queue.shift()!;
          input(runtime.board, event.key, Math.max(event.at, runtime.board.now), match.preset);
          runtime.applied = event.seq;
        }
        advance(runtime.board, until, match.preset);
      }
      if (until >= DURATION) {
        finish(room, match, Object.fromEntries(match.players.map((id) => [id, stats(this.runtimes.get(id)!.board)])));
        checkpoint = true;
      }
    }
    if (checkpoint) this.persist();
    if (now - this.lastBroadcast > 200) { this.lastBroadcast = now; this.broadcast(); }
  }
  liveStats(id: string) {
    const runtime = this.runtimes.get(id);
    return runtime ? { ...stats(runtime.board), lives: runtime.board.lives } : undefined;
  }
  exportPrivate(): string {
    return JSON.stringify({ format: 'leaf-private-v1', room: this.room, secrets: this.secrets }, null, 2);
  }
  exportResults(): string {
    return JSON.stringify({ format: 'leaf-results-v1', room: this.room }, null, 2);
  }
  close() {
    this.disposed = true;
    clearInterval(this.timer);
    this.transport?.destroy();
    this.connection = undefined; this.transport = undefined;
    this.links.clear(); this.runtimes.clear();
    this.pending = []; this.seq = 0; this.activeMatch = '';
    this.room = undefined;
    this.update({ role: 'none', room: undefined, board: undefined, connected: false, notice: undefined, error: undefined });
  }
  isClosed() { return this.disposed; }
}

export const session = new Session();
