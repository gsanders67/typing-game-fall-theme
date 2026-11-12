import { z } from 'zod';
import { PRESETS, type Stats, randomAt, hashSeed } from '../game/engine';

export const avatarSchema = z.object({
  animal: z.enum(['fox', 'bear', 'frog', 'owl']),
  color: z.enum(['orange', 'green', 'purple', 'blue']),
  hat: z.enum(['none', 'beanie', 'crown', 'leaf']),
  face: z.enum(['happy', 'cool', 'sleepy']),
});
export type AvatarConfig = z.infer<typeof avatarSchema>;
export const defaultAvatar: AvatarConfig = { animal: 'fox', color: 'orange', hat: 'leaf', face: 'happy' };
const statsSchema = z.object({
  score: z.number().nonnegative().max(1_000_000),
  wpm: z.number().nonnegative().max(10000),
  accuracy: z.number().min(0).max(100).nullable(),
  best: z.number().int().nonnegative().max(10000),
});
const playerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(20),
  avatar: avatarSchema,
  connected: z.boolean(),
  ready: z.boolean(),
});
export type Player = z.infer<typeof playerSchema>;
const matchSchema = z.object({
  id: z.string().max(30),
  round: z.number().int().min(0).max(4),
  sources: z.array(z.string().max(60)).min(2).max(3),
  players: z.array(z.string().uuid()).max(3),
  status: z.enum(['pending', 'arming', 'scheduled', 'playing', 'tie', 'done']),
  startAt: z.number().nonnegative(),
  seed: z.string().max(80),
  preset: z.enum(PRESETS),
  results: z.record(z.string().uuid(), statsSchema),
  winner: z.string().uuid().optional(),
  rolls: z.array(z.record(z.string().uuid(), z.number().int().min(1).max(20))).max(1000),
});
export type Match = z.infer<typeof matchSchema>;
export const roomSchema = z.object({
  version: z.literal(1),
  code: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  revision: z.number().int().nonnegative(),
  phase: z.enum(['lobby', 'tournament', 'finished']),
  players: z.array(playerSchema).max(25),
  matches: z.array(matchSchema).max(24),
  round: z.number().int().min(0).max(4),
  audit: z.array(z.string().max(200)).max(500),
});
export type Room = z.infer<typeof roomSchema>;
export function emptyRoom(code: string): Room {
  return { version: 1, code, revision: 0, phase: 'lobby', players: [], matches: [], round: 0, audit: [] };
}
export function log(room: Room, text: string) {
  room.audit = [...room.audit.slice(-499), text.slice(0, 200)];
}
export function draw(room: Room, seed: string) {
  if (room.phase !== 'lobby' || room.players.length < 2 || room.players.length > 25) throw new Error('Need 2-25 players in the lobby.');
  const order = room.players.map((player) => player.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(randomAt(hashSeed(seed), i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let sources = order;
  let round = 0;
  const stages = Math.floor(Math.log2(order.length));
  room.matches = [];
  while (sources.length > 1) {
    const next: string[] = [];
    let cursor = 0;
    let matchIndex = 0;
    while (cursor < sources.length) {
      const size = sources.length - cursor === 3 ? 3 : 2;
      const id = `r${round}m${matchIndex++}`;
      const group = sources.slice(cursor, cursor + size);
      room.matches.push({
        id, round, sources: group, players: round === 0 ? group : [], status: 'pending',
        startAt: 0, seed: `${seed}-${id}`,
        preset: PRESETS[stages === 1 ? 3 : Math.round(round * 3 / (stages - 1))],
        results: {}, rolls: [],
      });
      next.push(`winner:${id}`);
      cursor += size;
    }
    sources = next;
    round++;
  }
  room.phase = 'tournament';
  room.round = 0;
  log(room, `Draw locked: ${order.length} players, ${round} stages.`);
}
export function resolvePlayers(room: Room, match: Match) {
  return match.sources.map((source) => source.startsWith('winner:')
    ? room.matches.find((item) => item.id === source.slice(7))?.winner
    : source).filter((id): id is string => !!id);
}
export function finish(room: Room, match: Match, results: Record<string, Stats>) {
  if (match.status !== 'playing' && match.status !== 'scheduled') return;
  if (!match.players.every((id) => results[id])) throw new Error('Missing a player result.');
  match.results = results;
  const max = Math.max(...match.players.map((id) => results[id].score));
  const tied = match.players.filter((id) => results[id].score === max);
  if (tied.length === 1) {
    match.winner = tied[0];
    match.status = 'done';
  } else match.status = 'tie';
  log(room, `${match.id}: ${match.status === 'tie' ? 'score tie; dice required' : 'result locked'}.`);
  completeTournament(room);
}
export function contenders(match: Match): string[] {
  if (match.rolls.length) {
    const last = match.rolls.at(-1)!;
    const high = Math.max(...Object.values(last));
    return Object.keys(last).filter((id) => last[id] === high);
  }
  const high = Math.max(...Object.values(match.results).map((result) => result.score));
  return match.players.filter((id) => match.results[id]?.score === high);
}
export function rollDice(room: Room, match: Match, roll: () => number = d20) {
  if (match.status !== 'tie') return;
  const rolls = Object.fromEntries(contenders(match).map((id) => [id, roll()]));
  match.rolls.push(rolls);
  const winners = contenders(match);
  if (winners.length === 1) {
    match.winner = winners[0];
    match.status = 'done';
  }
  log(room, `${match.id}: d20 ${Object.values(rolls).join('/')} ${match.status === 'tie' ? '(reroll)' : '(winner locked)'}.`);
  completeTournament(room);
}
export function d20(): number {
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4294967280);
  return bytes[0] % 20 + 1;
}
export function completeTournament(room: Room) {
  if (room.matches.length && room.matches.at(-1)?.status === 'done') room.phase = 'finished';
}
export function placement(room: Room, id: string): number | null {
  if (room.phase === 'lobby') return null;
  if (room.phase === 'finished' && room.matches.at(-1)?.winner === id) return 1;
  const lost = room.matches.find((match) => match.status === 'done' && match.players.includes(id) && match.winner !== id);
  if (!lost) return null;
  return room.matches.filter((match) => match.round === lost.round).length + 1;
}
export function validateCheckpoint(value: unknown): Room {
  const room = roomSchema.parse(value);
  const ids = new Set(room.players.map((player) => player.id));
  if (ids.size !== room.players.length) throw new Error('Duplicate player IDs in checkpoint.');
  if (room.phase === 'lobby') {
    if (room.matches.length) throw new Error('Lobby checkpoint contains a bracket.');
    return room;
  }
  if (ids.size < 2 || !room.matches.length) throw new Error('Checkpoint has no valid bracket.');
  const seen = new Set<string>();
  const participation = new Map<number, Set<string>>();
  let expected = room.players.length;
  for (let round = 0; expected > 1; round++) {
    const matches = room.matches.filter((match) => match.round === round);
    if (matches.length !== Math.floor(expected / 2)) throw new Error('Invalid stage size.');
    const roundSources = new Set<string>();
    for (const match of matches) {
      if (seen.has(match.id)) throw new Error('Duplicate match ID.');
      const players = new Set(match.players);
      if (players.size !== match.players.length || match.players.some((id) => !ids.has(id))) throw new Error('Invalid player assignment.');
      for (const source of match.sources) {
        if (roundSources.has(source)) throw new Error('A source appears twice in one stage.');
        roundSources.add(source);
        const upstream = source.startsWith('winner:') ? room.matches.find((item) => item.id === source.slice(7)) : undefined;
        if (round === 0 ? !ids.has(source) : !upstream || upstream.round !== round - 1) throw new Error('Invalid bracket source.');
      }
      const resolved = resolvePlayers(room, match);
      if (match.players.length && match.players.join() !== resolved.join()) throw new Error('Bracket player mismatch.');
      if (match.winner && (!players.has(match.winner) || match.status !== 'done')) throw new Error('Invalid winner.');
      if ((match.status === 'done' || match.status === 'tie') && !match.players.every((id) => match.results[id])) throw new Error('Missing results.');
      if (match.status === 'done' && !match.winner) throw new Error('Completed match has no winner.');
      if (match.status !== 'pending' && match.players.length !== match.sources.length) throw new Error('Incomplete active match.');
      const used = participation.get(round) || new Set<string>();
      for (const id of players) {
        if (used.has(id)) throw new Error('Player appears in two matches.');
        used.add(id);
      }
      participation.set(round, used);
      seen.add(match.id);
    }
    if (roundSources.size !== expected) throw new Error('Incomplete stage.');
    expected = matches.length;
  }
  if (seen.size !== room.matches.length) throw new Error('Unexpected extra matches.');
  const finalRound = room.matches.at(-1)!.round;
  if (room.round > finalRound) throw new Error('Invalid current round.');
  if (room.matches.some((match) => match.round < room.round && match.status !== 'done')) throw new Error('Earlier stage is incomplete.');
  if (room.phase === 'finished' && room.matches.at(-1)?.status !== 'done') throw new Error('Champion missing.');
  return room;
}
