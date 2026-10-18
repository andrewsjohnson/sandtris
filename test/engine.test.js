import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, CELL, SETTLE_TICKS, GLOW_TICKS } from '../src/engine.js';

test('grains fall one row per tick and preserve mass', () => {
  const game = new Game(() => 0);
  game.grid[10 * WIDTH + 2] = 1;
  game.settle();
  assert.equal(game.grid[11 * WIDTH + 2], 1);
  assert.equal(game.grid.filter(Boolean).length, 1);
});

test('grains slide diagonally when supported', () => {
  const game = new Game(() => 0);
  game.grid[(HEIGHT - 1) * WIDTH + 20] = 1;
  game.grid[(HEIGHT - 2) * WIDTH + 20] = 2;
  game.settle();
  assert.equal(game.grid[(HEIGHT - 1) * WIDTH + 19], 2);
  assert.equal(game.grid.filter(Boolean).length, 2);
});

test('hard drop converts all four blocks into sand and spawns a piece', () => {
  const game = new Game(() => 0);
  game.drop();
  assert.equal(game.grid.filter(Boolean).length, 4 * CELL * CELL);
  assert.equal(game.piece.y, 0);
  assert.equal(game.over, false);
});

test('movement and rotation cannot leave the board', () => {
  const game = new Game(() => 0);
  while (game.move(-1, 0)) {}
  assert.equal(game.move(-1, 0), false);
  game.rotate();
  assert.equal(game.fits(game.piece), true);
});

test('only same-color components touching both walls are selected without removing them', () => {
  const game = new Game(() => 0);
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  game.grid[(HEIGHT - 2) * WIDTH + 10] = 1;
  game.grid[(HEIGHT - 2) * WIDTH + 20] = 2;
  assert.equal(game.findConnections().length, WIDTH + 1);
  assert.equal(game.score, 0);
  assert.equal(game.grid.filter(Boolean).length, WIDTH + 2);
});

test('adjacency never wraps across row edges', () => {
  const game = new Game(() => 0);
  game.grid[WIDTH - 1] = 1;
  game.grid[WIDTH] = 1;
  assert.equal(game.findConnections().length, 0);
});

test('blocked spawn ends the game', () => {
  const game = new Game(() => 0);
  game.grid.fill(1);
  game.spawn();
  assert.equal(game.over, true);
  const before = game.grid.slice();
  game.drop();
  assert.deepEqual(game.grid, before);
});

test('settling cannot move grains into the active piece', () => {
  const game = new Game(() => 0);
  game.piece.y = 20;
  const x = game.piece.x;
  game.grid[23 * WIDTH + x] = 1;
  game.settle();
  assert.equal(game.fits(game.piece), true);
  assert.equal(game.grid.filter(Boolean).length, 1);
});

function advanceUntil(game, predicate, limit = 600) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    game.step();
  }
  assert.fail(`Resolution did not finish: ${game.phase}`);
}

test('settling includes a falling island, then freezes and glows before clearing', () => {
  const game = new Game(() => 0);
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  game.grid[(HEIGHT - 6) * WIDTH + 20] = 1;
  game.step();
  assert.equal(game.phase, 'settling');
  const piece = structuredClone(game.piece);
  assert.equal(game.move(CELL, 0), false);
  game.rotate();
  game.fall();
  game.drop();
  assert.deepEqual(game.piece, piece);
  for (let i = 0; i < SETTLE_TICKS - 1; i++) game.step();
  assert.equal(game.phase, 'settling');
  assert.equal(game.score, 0);
  advanceUntil(game, () => game.phase === 'glowing');
  assert.equal(game.highlight.length, WIDTH + 1);
  const glowingGrid = game.grid.slice();
  for (let i = 0; i < GLOW_TICKS - 1; i++) game.step();
  assert.equal(game.phase, 'glowing');
  assert.deepEqual(game.grid, glowingGrid);
  assert.equal(game.score, 0);
  game.step();
  assert.equal(game.phase, 'settling');
  assert.equal(game.score, WIDTH + 1);
  assert.equal(game.grid.filter(Boolean).length, 0);
  advanceUntil(game, () => game.phase === 'playing');
  assert.deepEqual(game.piece, piece);
});

test('removal lets remaining sand settle and glow as a second chain', () => {
  const game = new Game(() => 0);
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  // A red divider separates two blue islands until the first clear removes it.
  for (let y = HEIGHT - 3; y < HEIGHT - 1; y++) {
    for (let x = 0; x < WIDTH; x++) game.grid[y * WIDTH + x] = x === 30 ? 1 : 2;
  }
  game.grid[(HEIGHT - 4) * WIDTH + 30] = 1;
  game.step();
  advanceUntil(game, () => game.phase === 'glowing');
  assert.equal(game.chain, 1);
  assert.equal(game.highlight.length, WIDTH + 3);
  advanceUntil(game, () => game.phase === 'settling');
  assert.equal(game.score, WIDTH + 3);
  assert.equal(game.grid.filter(Boolean).length, 2 * (WIDTH - 1));
  for (let i = 0; i < SETTLE_TICKS - 1; i++) game.step();
  assert.equal(game.phase, 'settling');
  advanceUntil(game, () => game.phase === 'glowing');
  assert.equal(game.chain, 2);
  assert.equal(game.highlight.length, 2 * (WIDTH - 1));
  advanceUntil(game, () => game.phase === 'playing');
  assert.equal(game.score, WIDTH + 3 + 2 * (WIDTH - 1));
  assert.equal(game.grid.filter(Boolean).length, 0);
});

test('a connection that breaks while settling is not cleared', () => {
  const game = new Game(() => 0);
  // Remove a bridge during the delay to model a component separating.
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  game.step();
  assert.equal(game.phase, 'settling');
  game.grid[(HEIGHT - 1) * WIDTH + 30] = 0;
  advanceUntil(game, () => game.phase === 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.highlight.length, 0);
  assert.equal(game.grid.filter(Boolean).length, WIDTH - 1);
});

test('restart creates a fresh game without pending glow or chain state', () => {
  let game = new Game(() => 0);
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  game.step();
  advanceUntil(game, () => game.phase === 'glowing');
  game = new Game(() => 0);
  assert.equal(game.phase, 'playing');
  assert.equal(game.chain, 0);
  assert.deepEqual(game.highlight, []);
  for (let i = 0; i < 100; i++) game.step();
  assert.equal(game.score, 0);
});

test('queued piece keeps its shape and color through settling and becomes the next spawn', () => {
  const values = [0, 0.1, 0.4, 0.9, 0.8, 0.5];
  let cursor = 0;
  const game = new Game(() => values[cursor++ % values.length]);
  const preview = structuredClone(game.nextPiece);
  assert.notEqual(game.piece.color, preview.color);
  game.rotate();
  for (let n = 0; n < 30; n++) game.step();
  assert.deepEqual(game.nextPiece, preview);
  game.drop();
  assert.equal(game.piece.color, preview.color);
  assert.equal(game.piece.name, preview.name);
  assert.deepEqual(game.piece.shape, preview.shape);
  assert.equal(game.piece.y, 0);
  assert.notEqual(game.piece.shape, preview.shape);
  const afterSpawn = structuredClone(game.nextPiece);
  game.piece.shape[0][0] += 1;
  assert.deepEqual(game.nextPiece, afterSpawn);
});
