import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT, SAND, GRAVEL, POWDER } from '../src/engine.js';
import { Run } from '../src/run.js';
import { freshProgress, unlock, saveProgress, loadProgress } from '../src/progression.js';

function grain(game, x, y, material, color = 1) {
  const i = y * WIDTH + x;
  game.grid[i] = color;
  game.materials[i] = material;
  return i;
}
function until(game, predicate, limit = 700) {
  for (let n = 0; n < limit; n++) { if (predicate()) return; game.step(); }
  assert.fail(`Timed out in ${game.phase}`);
}
function noStaleMaterials(game) {
  for (let i = 0; i < game.grid.length; i++) if (!game.grid[i]) assert.equal(game.materials[i], SAND, `empty cell ${i}`);
}

test('the same shallow support produces a narrow gravel pile, normal sand, and wider powder', () => {
  for (const [material, finalX, finalY] of [[GRAVEL, 20, HEIGHT - 2], [SAND, 19, HEIGHT - 1], [POWDER, 18, HEIGHT - 1]]) {
    const game = new Game(() => 0);
    grain(game, 20, HEIGHT - 1, GRAVEL, 2);
    grain(game, 20, HEIGHT - 2, material);
    game.settle();
    const destination = finalY * WIDTH + finalX;
    assert.equal(game.grid[destination], 1);
    assert.equal(game.materials[destination], material);
    assert.equal(game.grid.filter(Boolean).length, 2);
    noStaleMaterials(game);
  }
});

test('gravel still falls vertically and rolls off a ledge with a two-cell drop', () => {
  const game = new Game(() => 0);
  grain(game, 20, HEIGHT - 1, GRAVEL, 2);
  grain(game, 20, HEIGHT - 2, GRAVEL, 2);
  grain(game, 20, HEIGHT - 3, GRAVEL);
  grain(game, 40, 40, GRAVEL, 3);
  game.settle();
  assert.equal(game.grid[(HEIGHT - 2) * WIDTH + 19], 1);
  assert.equal(game.materials[(HEIGHT - 2) * WIDTH + 19], GRAVEL);
  assert.equal(game.grid[41 * WIDTH + 40], 3);
  assert.equal(game.grid.filter(Boolean).length, 4);
});

test('powder cannot leap through a wall or wrap around board edges', () => {
  const game = new Game(() => 0);
  for (const x of [19, 20, 21]) grain(game, x, HEIGHT - 1, GRAVEL, 2);
  for (const x of [19, 21]) grain(game, x, HEIGHT - 2, GRAVEL, 2);
  const powder = grain(game, 20, HEIGHT - 2, POWDER);
  game.settle();
  assert.equal(game.grid[powder], 1);
  const edge = new Game(() => 0);
  grain(edge, 0, HEIGHT - 1, GRAVEL, 2);
  grain(edge, 0, HEIGHT - 2, POWDER);
  edge.settle();
  assert.equal(edge.grid[(HEIGHT - 1) * WIDTH + 2], 1);
  assert.equal(edge.grid.filter(Boolean).length, 2);
});

test('powder cannot pass through the active piece to reach an empty cell beyond it', () => {
  const game = new Game(() => 0);
  game.piece.y = 20; // I piece occupies x=22..37, y=24..27.
  const powder = grain(game, 36, 23, POWDER);
  game.settle();
  assert.equal(game.grid[powder], 1);
  assert.equal(game.grid[24 * WIDTH + 38], 0);
  assert.equal(game.fits(game.piece), true);
});

test('mixed settling conserves every color/material pair and clears source metadata', () => {
  let seed = 123;
  const game = new Game(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
  for (let y = 20; y < 35; y++) for (let x = 10; x < 50; x++) grain(game, x, y, (x + y) % 3, 1 + x % 4);
  const histogram = () => {
    const counts = Array(12).fill(0);
    for (let i = 0; i < game.grid.length; i++) if (game.grid[i]) counts[(game.grid[i] - 1) * 3 + game.materials[i]]++;
    return counts;
  };
  const before = histogram();
  for (let tick = 0; tick < 200; tick++) game.settle();
  assert.deepEqual(histogram(), before);
  noStaleMaterials(game);
});

test('same-color grains connect and clear across material boundaries', () => {
  const game = new Game(() => 0);
  for (let x = 0; x < WIDTH; x++) grain(game, x, HEIGHT - 1, x % 3);
  assert.equal(game.findConnections().length, WIDTH);
  game.step();
  until(game, () => game.phase === 'glowing');
  assert.equal(game.highlight.length, WIDTH);
  until(game, () => game.phase === 'playing');
  assert.equal(game.score, WIDTH);
  assert.equal(game.grid.filter(Boolean).length, 0);
  noStaleMaterials(game);
});

test('clearing a gravel support lets separated powder islands fall into a chain reaction', () => {
  const game = new Game(() => 0);
  for (let x = 0; x < WIDTH; x++) grain(game, x, HEIGHT - 1, GRAVEL);
  for (let y = HEIGHT - 3; y < HEIGHT - 1; y++) {
    for (let x = 0; x < WIDTH; x++) grain(game, x, y, x === 30 ? GRAVEL : POWDER, x === 30 ? 1 : 2);
  }
  grain(game, 30, HEIGHT - 4, GRAVEL);
  game.step();
  until(game, () => game.phase === 'glowing');
  assert.equal(game.chain, 1);
  until(game, () => game.phase === 'settling');
  assert.equal(game.score, WIDTH + 3);
  until(game, () => game.phase === 'glowing');
  assert.equal(game.chain, 2);
  assert.ok(game.highlight.every(i => game.materials[i] === POWDER));
  until(game, () => game.phase === 'playing');
  assert.equal(game.score, WIDTH + 3 + 2 * (WIDTH - 1));
  noStaleMaterials(game);
});

test('locking a material piece deposits all 64 grains with its material', () => {
  for (const material of [SAND, GRAVEL, POWDER]) {
    const game = new Game(() => 0);
    game.piece.material = material;
    game.drop();
    const occupied = Array.from(game.grid.keys()).filter(i => game.grid[i]);
    assert.equal(occupied.length, 64);
    assert.ok(occupied.every(i => game.materials[i] === material));
  }
});

test('recoloring changes color without changing material; aftershock transports material', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('drift'); run.addUpgrade('aftershock');
  const colored = grain(run, 10, HEIGHT - 2, GRAVEL, 2);
  const nudged = grain(run, 30, HEIGHT - 2, POWDER, 1);
  grain(run, 10, HEIGHT - 1, SAND);
  grain(run, 30, HEIGHT - 1, SAND);
  run.highlight = [(HEIGHT - 1) * WIDTH + 10, (HEIGHT - 1) * WIDTH + 30];
  run.chain = 1;
  run.clearHighlighted();
  assert.equal(run.grid[colored], 1);
  assert.equal(run.materials[colored], GRAVEL);
  assert.equal(run.grid[nudged - 1], 1);
  assert.equal(run.materials[nudged - 1], POWDER);
  noStaleMaterials(run);
});

test('excavation, pressure vents, and rescues remove material metadata with grains', () => {
  const run = new Run(freshProgress(), () => 0);
  grain(run, 20, 50, POWDER);
  assert.ok(run.excavate(4));
  noStaleMaterials(run);
  run.addUpgrade('pressure'); run.clearCount = 2;
  grain(run, 20, 50, GRAVEL, 2);
  const cleared = grain(run, 30, 99, SAND);
  run.highlight = [cleared]; run.chain = 1; run.clearHighlighted();
  noStaleMaterials(run);
  run.addUpgrade('revival');
  for (let x = 0; x < WIDTH; x++) grain(run, x, 4, GRAVEL);
  run.over = true; run.step();
  assert.equal(run.rescues, 0);
  assert.equal(run.materials.slice(0, 16 * WIDTH).filter(Boolean).length, 0);
  noStaleMaterials(run);
});

test('Powder trail marks every fourth queued piece and preserves the promised next spawn', () => {
  const progress = freshProgress(); progress.unlocked.push('powder');
  const run = new Run(progress, () => 0, 'powder');
  for (let number = 1; number <= 8; number++) {
    assert.equal(run.piece.number, number);
    assert.equal(run.piece.material, number % 4 === 0 ? POWDER : SAND);
    const next = structuredClone(run.nextPiece);
    run.spawn();
    assert.equal(run.piece.material, next.material);
    assert.equal(run.piece.color, next.color);
    assert.deepEqual(run.piece.shape, next.shape);
  }
});

test('powder stacks shorten cadence without overwriting a manual gravel reservation', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('powder'); run.addUpgrade('powder');
  assert.equal(run.nextPiece.material, SAND); // Piece 2; interval 3.
  run.addUpgrade('powder');
  assert.equal(run.nextPiece.material, POWDER); // Piece 2; interval 2.
  run.addUpgrade('gravel');
  assert.equal(run.useGravel(), true);
  const next = structuredClone(run.nextPiece);
  run.addUpgrade('powder');
  assert.equal(run.nextPiece.material, GRAVEL);
  assert.equal(run.nextPiece.color, next.color);
  run.spawn();
  assert.equal(run.piece.material, GRAVEL);
  assert.equal(run.nextPiece.material, POWDER); // Every future piece at level 4.
});

test('Gravel works queues material without altering shape/color; charges refill per stage', () => {
  const progress = freshProgress(); progress.unlocked.push('gravel');
  const run = new Run(progress, () => 0, 'gravel');
  const next = structuredClone(run.nextPiece);
  run.phase = 'settling';
  assert.equal(run.useGravel(), false);
  assert.equal(run.gravelCharges, 1);
  run.phase = 'playing';
  assert.equal(run.useGravel(), true);
  assert.equal(run.gravelCharges, 0);
  assert.equal(run.nextPiece.material, GRAVEL);
  assert.equal(run.nextPiece.color, next.color);
  assert.deepEqual(run.nextPiece.shape, next.shape);
  run.gravelCharges = 1;
  assert.equal(run.useGravel(), false);
  assert.equal(run.gravelCharges, 1);
  run.draft(); run.offers = [{ id: 'patience' }];
  assert.equal(run.choose('patience'), true);
  assert.equal(run.gravelCharges, 1); // Refresh, not stockpile.
  run.spawn();
  assert.equal(run.piece.material, GRAVEL);
  assert.equal(run.useGravel(), true);
});

test('old saves retain their bank and unlocks when material upgrades are purchased', () => {
  let saved = JSON.stringify({ version: 1, shards: 24, unlocked: ['drift'], runs: 3, wins: 1, bestScore: 400, bestStage: 5 });
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const progress = loadProgress(storage);
  assert.ok(unlock(progress, 'powder'));
  assert.ok(unlock(progress, 'gravel'));
  assert.equal(progress.shards, 6);
  saveProgress(storage, progress);
  assert.deepEqual(loadProgress(storage), progress);
  assert.equal(progress.runs, 3);
  assert.equal(progress.bestScore, 400);
});

test('maxed Powder trail is omitted from drafts instead of offering a useless fifth stack', () => {
  const progress = freshProgress(); progress.unlocked.push('powder');
  const run = new Run(progress, () => 0, 'powder');
  run.addUpgrade('powder'); run.addUpgrade('powder'); run.addUpgrade('powder');
  assert.equal(run.upgrades.powder, 4);
  assert.equal(run.addUpgrade('powder'), false);
  run.draft();
  assert.equal(run.offers.length, 3);
  assert.ok(run.offers.every(u => u.id !== 'powder'));
});
