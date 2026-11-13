import { VOCABULARY } from './vocabulary';

export const DURATION = 30_000;
export const PRESETS = ['Acorn', 'Harvest', 'Bonfire', 'Final feast'] as const;
export type Difficulty = (typeof PRESETS)[number];
const CONFIG = [
  { interval: 1800, fall: 9500 },
  { interval: 1600, fall: 10000 },
  { interval: 2000, fall: 12000 },
  { interval: 2600, fall: 14500 },
];
export interface Target {
  id: number;
  text: string;
  born: number;
  fall: number;
  lane: number;
}
export interface Board {
  now: number;
  seed: number;
  spawned: number;
  nextSpawn: number;
  targets: Target[];
  selected: number | null;
  buffer: string;
  lives: number;
  score: number;
  streak: number;
  best: number;
  attempts: number;
  correct: number;
  cleared: number;
  ended: boolean;
}
export interface Stats {
  score: number;
  wpm: number;
  accuracy: number | null;
  best: number;
}
export function hashSeed(seed: string): number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function randomAt(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}
export function promptAt(seed: number, index: number, preset: Difficulty): string {
  const pool = VOCABULARY[preset];
  const cycle = Math.floor(index / pool.length);
  const deck = (round: number) => {
    const items = [...pool];
    const shuffleSeed = hashSeed(`${seed}:prompts:${preset}:${round}`);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(randomAt(shuffleSeed, i) * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const items = deck(cycle);
  // Keep the last entry untouched so the previous deck's boundary is reproducible.
  if (cycle && items[0] === deck(cycle - 1).at(-1)) [items[0], items[1]] = [items[1], items[0]];
  return items[index % pool.length];
}
export function newBoard(seed: string): Board {
  return {
    now: 0, seed: hashSeed(seed), spawned: 0, nextSpawn: 0, targets: [],
    selected: null, buffer: '', lives: 3, score: 0, streak: 0, best: 0,
    attempts: 0, correct: 0, cleared: 0, ended: false,
  };
}
export function multiplier(streak: number): number {
  return Math.min(3, 1 + Math.floor(streak / 5) * 0.5);
}
export function stats(board: Board): Stats {
  return {
    score: board.score,
    wpm: Math.round(board.correct / 5 / (DURATION / 60_000)),
    accuracy: board.attempts ? Math.round((board.correct / board.attempts) * 100) : null,
    best: board.best,
  };
}
export function advance(board: Board, time: number, preset: Difficulty): void {
  if (board.ended) return;
  const until = Math.max(board.now, Math.min(time, DURATION));
  const config = CONFIG[PRESETS.indexOf(preset)];
  while (!board.ended) {
    const missAt = Math.min(...board.targets.map((target) => target.born + target.fall));
    const next = Math.min(until, missAt, board.nextSpawn < DURATION ? board.nextSpawn : Infinity);
    board.now = next;
    if (board.nextSpawn <= next && board.nextSpawn < DURATION) {
      const id = board.spawned++;
      board.targets.push({
        id, born: board.nextSpawn, fall: config.fall,
        text: promptAt(board.seed, id, preset),
        lane: randomAt(board.seed, id * 2 + 1),
      });
      board.nextSpawn += config.interval;
    }
    const missed = board.targets.filter((target) => target.born + target.fall <= next)
      .sort((a, b) => a.born + a.fall - b.born - b.fall || a.id - b.id);
    for (const target of missed) {
      if (board.lives === 0) break;
      board.lives--;
      board.streak = 0;
      if (target.id === board.selected) { board.selected = null; board.buffer = ''; }
    }
    board.targets = board.targets.filter((target) => target.born + target.fall > next);
    board.ended = board.lives === 0 || next >= DURATION;
    if (next >= until) break;
  }
}
export function input(board: Board, key: string, time: number, preset: Difficulty): void {
  advance(board, time, preset);
  if (board.ended || time >= DURATION) return;
  if (key === 'Backspace') {
    board.buffer = board.buffer.slice(0, -1);
    if (!board.buffer) board.selected = null;
    return;
  }
  if (!/^[a-zA-Z ]$/.test(key)) return;
  const char = key.toLowerCase();
  board.attempts++;
  if (board.selected === null) {
    const target = board.targets.filter((target) => target.text.startsWith(char))
      .sort((a, b) => (a.born + a.fall) - (b.born + b.fall) || a.id - b.id)[0];
    if (target) board.selected = target.id;
  }
  const target = board.targets.find((item) => item.id === board.selected);
  const next = board.buffer + char;
  if (!target || !target.text.startsWith(next)) {
    board.streak = 0;
    if (board.buffer.length < 100) board.buffer = next;
    return;
  }
  board.buffer = next;
  board.correct++;
  if (next === target.text) {
    board.score += target.text.replaceAll(' ', '').length * 10 * multiplier(board.streak);
    board.streak++;
    board.best = Math.max(board.best, board.streak);
    board.cleared++;
    board.targets = board.targets.filter((item) => item.id !== target.id);
    board.selected = null;
    board.buffer = '';
  }
}
