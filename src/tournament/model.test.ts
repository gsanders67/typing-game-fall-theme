import { describe, expect, it } from 'vitest';
import { defaultAvatar, draw, emptyRoom, finish, placement, resolvePlayers, rollDice, validateCheckpoint, type Match } from './model';

function makeRoom(count: number) {
  const room = emptyRoom('ABC234');
  room.players = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(), name: `Player ${index}`, avatar: defaultAvatar, ready: true, connected: true,
  }));
  return room;
}
const result = (score: number) => ({ score, wpm: 10, accuracy: 100, best: 3 });
describe('fixed elimination bracket', () => {
  it('handles every size 2-25 with no byes/duplicate players and one final champion', () => {
    for (let count = 2; count <= 25; count++) {
      const room = makeRoom(count);
      draw(room, 'draw');
      const initialPaths = room.matches.map((match) => [...match.sources]);
      for (const match of room.matches) {
        room.round = match.round;
        match.players = resolvePlayers(room, match);
        expect(new Set(match.players).size).toBe(match.sources.length);
        match.status = 'playing';
        finish(room, match, Object.fromEntries(match.players.map((id, index) => [id, result(index * 10)])));
      }
      expect(room.phase).toBe('finished');
      expect(placement(room, room.matches.at(-1)!.winner!)).toBe(1);
      expect(room.matches.map((match) => match.sources)).toEqual(initialPaths);
      expect(validateCheckpoint(room)).toEqual(room);
    }
  });
  it('builds the agreed 25 -> 12 -> 6 -> 3 -> 1 progression with a trio final', () => {
    const room = makeRoom(25);
    draw(room, 'draw');
    expect([0, 1, 2, 3].map((round) => room.matches.filter((match) => match.round === round).length)).toEqual([12, 6, 3, 1]);
    expect(room.matches.at(-1)!.sources).toHaveLength(3);
    expect(room.matches[0].preset).toBe('Acorn');
    expect(room.matches.at(-1)!.preset).toBe('Final feast');
  });
  it('rerolls only tied high rollers, records every roll, and cannot reroll a winner', () => {
    const room = makeRoom(3);
    draw(room, 'tie');
    const match = room.matches[0];
    match.status = 'playing';
    finish(room, match, Object.fromEntries(match.players.map((id) => [id, result(0)])));
    let rolls = [18, 18, 2];
    rollDice(room, match, () => rolls.shift()!);
    expect(match.status).toBe('tie');
    rolls = [5, 15];
    rollDice(room, match, () => rolls.shift()!);
    expect(match.status).toBe('done');
    expect(Object.keys(match.rolls[1])).toHaveLength(2);
    expect(match.winner).toBe(match.players[1]);
    rollDice(room, match, () => 20);
    expect(match.rolls).toHaveLength(2);
  });
  it('shares placements within a stage and ranks a trio loss correctly', () => {
    const room = makeRoom(5);
    draw(room, 'rank');
    for (const match of room.matches.filter((match) => match.round === 0)) {
      match.status = 'playing';
      finish(room, match, Object.fromEntries(match.players.map((id, index) => [id, result(index * 10)])));
    }
    const losers = room.matches.filter((match) => match.round === 0).flatMap((match) => match.players.filter((id) => id !== match.winner));
    expect(losers.map((id) => placement(room, id))).toEqual([3, 3, 3]);
  });
  it('rejects corrupt imports, duplicate sources, and inconsistent completed results', () => {
    const room = makeRoom(4);
    draw(room, 'invalid');
    room.matches[1].sources[0] = room.matches[0].sources[0];
    expect(() => validateCheckpoint(room)).toThrow();
    const other = makeRoom(2);
    draw(other, 'invalid');
    other.matches[0].status = 'done';
    expect(() => validateCheckpoint(other)).toThrow();
    expect(() => draw(makeRoom(1), 'single')).toThrow();
  });
  it('finalization is idempotent and needs every participant result', () => {
    const room = makeRoom(2);
    draw(room, 'finalize');
    const match: Match = room.matches[0];
    match.status = 'playing';
    expect(() => finish(room, match, {})).toThrow('Missing');
    const scores = Object.fromEntries(match.players.map((id, index) => [id, result(index * 50)]));
    finish(room, match, scores);
    const winner = match.winner;
    finish(room, match, {});
    expect(match.winner).toBe(winner);
  });
});
