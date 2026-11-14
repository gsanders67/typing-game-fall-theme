import { describe, expect, it } from 'vitest';
import { defaultAvatar, draw, emptyRoom, finalStandings, finish, placement, podiumContenders, resolvePlayers, rollDice, rollPodium, validateCheckpoint, type Match, type Room } from './model';

function makeRoom(count: number) {
  const room = emptyRoom('ABC234');
  room.players = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(), name: `Player ${index}`, avatar: defaultAvatar, ready: true, connected: true,
  }));
  return room;
}
const result = (score: number) => ({ score, wpm: 10, accuracy: 100, best: 3 });
function complete(room: Room) {
  draw(room, 'podium');
  for (const match of room.matches) {
    room.round = match.round;
    match.players = resolvePlayers(room, match);
    match.status = 'playing';
    finish(room, match, Object.fromEntries(match.players.map((id, index) => [id, result((index + 1) * 100)])));
  }
  return room;
}
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
  it('shares each stage seed across matches but not across stages', () => {
    const room = makeRoom(25);
    draw(room, 'shared');
    const seeds = new Set<string>();
    for (let round = 0; round < 4; round++) {
      const stage = room.matches.filter((match) => match.round === round);
      expect(new Set(stage.map((match) => match.seed)).size).toBe(1);
      seeds.add(stage[0].seed);
    }
    expect(seeds.size).toBe(4);
    room.matches[0].seed = 'different';
    expect(() => validateCheckpoint(room)).toThrow('seeds');
  });
  it.each([2, 3, 4, 5, 25])('awards an exact podium for %s players without changing the champion', (count) => {
    const room = complete(makeRoom(count));
    const champion = room.matches.at(-1)!.winner;
    for (let attempt = 0; podiumContenders(room).length && attempt < 10; attempt++) {
      let value = 0;
      rollPodium(room, () => ++value);
    }
    expect(podiumContenders(room)).toEqual([]);
    const top = finalStandings(room).slice(0, 3);
    expect(top[0].id).toBe(champion);
    expect(top.map((player) => placement(room, player.id))).toEqual(count === 2 ? [1, 2] : [1, 2, 3]);
    for (const player of finalStandings(room).slice(3)) expect(placement(room, player.id)).toBeGreaterThanOrEqual(4);
    expect(validateCheckpoint(room)).toEqual(room);
  });
  it('prefers stage progress over a larger score in an earlier stage', () => {
    const room = complete(makeRoom(4));
    const final = room.matches.at(-1)!;
    const runner = final.players.find((id) => id !== final.winner)!;
    final.results[runner].score = 1;
    const earlier = room.matches[0].players.find((id) => id !== room.matches[0].winner)!;
    room.matches[0].results[earlier].score = 9999;
    expect(finalStandings(room)[1].id).toBe(runner);
  });
  it.each(['score', 'wpm', 'accuracy', 'best'] as const)('uses %s to break same-stage podium ties', (metric) => {
    const room = complete(makeRoom(3));
    const final = room.matches[0];
    const [a, b] = final.players.filter((id) => id !== final.winner);
    final.results[a] = result(100);
    final.results[b] = result(100);
    final.results[b][metric] = (final.results[a][metric] ?? 0) + 1;
    expect(finalStandings(room)[1].id).toBe(b);
    expect(podiumContenders(room)).toEqual([]);
  });
  it('resolves ties across the bronze cutoff, rerolls only unresolved players, and validates history', () => {
    const room = complete(makeRoom(8));
    const semifinalLosers = room.matches.filter((match) => match.round === 1).map((match) => match.players.find((id) => id !== match.winner)!);
    for (const match of room.matches.filter((match) => match.round === 1)) {
      for (const id of semifinalLosers) if (match.results[id]) match.results[id] = result(0);
    }
    expect(new Set(podiumContenders(room))).toEqual(new Set(semifinalLosers));
    rollPodium(room, () => 10);
    expect(podiumContenders(room)).toHaveLength(2);
    let value = 0;
    rollPodium(room, () => ++value);
    expect(podiumContenders(room)).toEqual([]);
    expect(validateCheckpoint(room)).toEqual(room);
    expect(() => rollPodium(room)).toThrow('No unresolved');
    room.podiumRolls.push({ [room.matches.at(-1)!.winner!]: 20 });
    expect(() => validateCheckpoint(room)).toThrow('Invalid podium');
  });
  it('preserves a dice-decided champion even when another finalist has better secondary metrics', () => {
    const room = makeRoom(3);
    draw(room, 'dice');
    const final = room.matches[0];
    final.status = 'playing';
    finish(room, final, Object.fromEntries(final.players.map((id, index) => [id, { ...result(100), wpm: index * 10 }])));
    const values = [20, 2, 1];
    rollDice(room, final, () => values.shift()!);
    expect(finalStandings(room)[0].id).toBe(final.players[0]);
    expect(finalStandings(room)[1].id).toBe(final.players[2]);
  });
  it('accepts completed legacy backups without changing their recorded statistics', () => {
    const room = complete(makeRoom(3));
    const legacy: Record<string, unknown> = { ...room };
    delete legacy.rulesVersion;
    delete legacy.podiumRolls;
    const restored = validateCheckpoint(legacy);
    expect(restored.podiumRolls).toEqual([]);
    expect(restored.matches).toEqual(room.matches);
  });
});
