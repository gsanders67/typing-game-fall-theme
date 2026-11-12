import { describe, expect, it } from 'vitest';
import { advance, DURATION, input, multiplier, newBoard, stats, type Board } from './engine';

function target(board: Board, text = 'game') {
  board.targets = [{ id: board.spawned++, text, born: board.now, fall: 9000, lane: 0.3 }];
  board.nextSpawn = DURATION;
}
describe('typing rules', () => {
  it('uses the same stream regardless of animation frame rate', () => {
    const coarse = newBoard('same-seed');
    const fine = newBoard('same-seed');
    advance(coarse, 7000, 'Harvest');
    for (let time = 0; time <= 7000; time += 50) advance(fine, time, 'Harvest');
    expect(coarse).toEqual(fine);
    advance(coarse, DURATION, 'Harvest');
    for (let time = 7050; time <= DURATION; time += 50) advance(fine, time, 'Harvest');
    expect(coarse).toEqual(fine);
  });
  it('scores completed letters, requires phrase spaces, and ignores case', () => {
    const board = newBoard('phrase');
    target(board, 'one more');
    for (const key of 'ONE MOR') input(board, key, 100, 'Final feast');
    expect(board.score).toBe(0);
    input(board, 'E', 100, 'Final feast');
    expect(board.score).toBe(70);
    expect(board.cleared).toBe(1);
    expect(board.targets).toHaveLength(0);
  });
  it('uses the pre-clear multiplier, caps at 3x, and resets on a typo without life loss', () => {
    const board = newBoard('combo');
    for (let index = 0; index < 6; index++) {
      target(board);
      for (const key of 'game') input(board, key, 100, 'Acorn');
    }
    expect(board.score).toBe(260);
    expect(multiplier(100)).toBe(3);
    target(board);
    input(board, 'g', 100, 'Acorn');
    input(board, 'z', 100, 'Acorn');
    expect(board.streak).toBe(0);
    expect(board.lives).toBe(3);
    input(board, 'Backspace', 100, 'Acorn');
    for (const key of 'ame') input(board, key, 100, 'Acorn');
    expect(board.score).toBe(300);
  });
  it('selects the most urgent matching target, locks it, and clears selection when buffer empties', () => {
    const board = newBoard('select');
    board.targets = [
      { id: 2, text: 'game', born: 0, fall: 8000, lane: 0 },
      { id: 1, text: 'gold', born: 0, fall: 5000, lane: 1 },
    ];
    board.nextSpawn = DURATION;
    input(board, 'g', 100, 'Acorn');
    expect(board.selected).toBe(1);
    input(board, 'a', 100, 'Acorn');
    expect(board.selected).toBe(1);
    input(board, 'Backspace', 100, 'Acorn');
    input(board, 'Backspace', 100, 'Acorn');
    expect(board.selected).toBeNull();
  });
  it('only loses lives for misses, processes simultaneous misses once, and locks zero-life scores', () => {
    const board = newBoard('miss');
    board.score = 120;
    board.targets = [0, 1, 2, 3].map((id) => ({ id, text: 'leaf', born: 0, fall: 5000, lane: 0 }));
    board.nextSpawn = DURATION;
    advance(board, 5000, 'Acorn');
    expect(board.lives).toBe(0);
    expect(board.ended).toBe(true);
    input(board, 'l', 5500, 'Acorn');
    advance(board, 6000, 'Acorn');
    expect(board.score).toBe(120);
    expect(board.lives).toBe(0);
  });
  it('rejects completions at the deadline and does not award partial targets', () => {
    const board = newBoard('deadline');
    board.now = 59900;
    target(board);
    for (const key of 'gam') input(board, key, 59900, 'Acorn');
    input(board, 'e', 60000, 'Acorn');
    expect(board.score).toBe(0);
    expect(board.ended).toBe(true);
    expect(stats(board).wpm).toBe(1);
    expect(stats(newBoard('empty')).accuracy).toBeNull();
  });
});
