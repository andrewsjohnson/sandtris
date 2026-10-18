import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, CELL } from '../src/engine.js';

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

test('only same-color components touching both walls clear', () => {
  const game = new Game(() => 0);
  game.grid.fill(1, (HEIGHT - 1) * WIDTH);
  game.grid[(HEIGHT - 2) * WIDTH + 10] = 1;
  game.grid[(HEIGHT - 2) * WIDTH + 20] = 2;
  assert.equal(game.clearConnections(), WIDTH + 1);
  assert.equal(game.score, WIDTH + 1);
  assert.equal(game.grid.filter(Boolean).length, 1);
});

test('adjacency never wraps across row edges', () => {
  const game = new Game(() => 0);
  game.grid[WIDTH - 1] = 1;
  game.grid[WIDTH] = 1;
  assert.equal(game.clearConnections(), 0);
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
