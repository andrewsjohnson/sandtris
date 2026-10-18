import test from 'node:test';
import assert from 'node:assert/strict';
import { Run, STAGES } from '../src/run.js';
import { WIDTH, HEIGHT, GLOW_TICKS } from '../src/engine.js';
import { freshProgress, UPGRADES } from '../src/progression.js';

function until(run, predicate, limit = 700) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    run.step();
  }
  assert.fail(`Run stalled at ${run.state}/${run.phase}`);
}
function clearRow(run, color = 1) {
  run.grid.fill(color, (HEIGHT - 1) * WIDTH);
  run.step();
  until(run, () => run.phase === 'glowing');
  for (let i = 0; i < GLOW_TICKS; i++) run.step();
}

test('a real clear finishes a stage only after the cascade; rewards preserve the board', () => {
  const run = new Run(freshProgress(), () => 0);
  run.stageScore = run.objective.target - WIDTH;
  run.grid[(HEIGHT - 2) * WIDTH + 20] = 2;
  clearRow(run);
  assert.equal(run.state, 'active');
  assert.equal(run.phase, 'settling');
  until(run, () => run.state === 'reward');
  assert.equal(run.clearedStages, 1);
  assert.equal(run.offers.length, 3);
  assert.equal(new Set(run.offers.map(u => u.id)).size, 3);
  const board = run.grid.slice();
  const piece = structuredClone(run.piece);
  run.drop(); run.rotate(); run.fall(); run.step();
  assert.equal(run.move(4, 0), false);
  assert.deepEqual(run.piece, piece);
  assert.deepEqual(run.grid, board);
  assert.equal(run.choose('fake-upgrade'), false);
  const choice = run.offers[0].id;
  assert.equal(run.choose(choice), true);
  assert.equal(run.stage, 1);
  assert.equal(run.stageScore, 0);
  assert.deepEqual(run.stageColors, [0, 0, 0, 0, 0]);
  assert.deepEqual(run.grid, board);
  assert.equal(run.upgrades[choice], 1);
  assert.equal(run.choose(choice), false);
});

test('five stage objectives lead to victory, including color requirements and faster gravity', () => {
  const run = new Run(freshProgress(), () => 0.5);
  let lastFall = Infinity;
  for (let stage = 0; stage < STAGES.length; stage++) {
    const goal = run.objective;
    assert.ok(run.fallInterval < lastFall);
    lastFall = run.fallInterval;
    run.stageScore = goal.target;
    if (goal.color) {
      run.step();
      assert.equal(run.state, 'active');
      run.stageColors[goal.color] = goal.colorTarget;
    }
    run.step();
    assert.equal(run.clearedStages, stage + 1);
    if (stage < STAGES.length - 1) {
      assert.equal(run.state, 'reward');
      const choice = run.offers.find(u => u.id !== 'patience');
      assert.ok(run.choose(choice.id));
    }
  }
  assert.equal(run.state, 'won');
  assert.equal(run.reward, 23);
  run.step();
  assert.equal(run.clearedStages, 5);
});

test('a blocked spawn ends the run; returning to camp also ends it without granting a win', () => {
  const run = new Run(freshProgress(), () => 0);
  run.grid.fill(1);
  run.spawn();
  run.step();
  assert.equal(run.state, 'lost');
  assert.equal(run.retire(), false);
  const retired = new Run(freshProgress());
  retired.score = 384;
  assert.equal(retired.retire(), true);
  assert.equal(retired.reward, 2);
  assert.equal(retired.state, 'retired');
  const board = retired.grid.slice();
  retired.drop(); retired.step();
  assert.deepEqual(retired.grid, board);
});

test('unlock pool is a snapshot; only purchased upgrades can start a run', () => {
  const progress = freshProgress();
  const plain = new Run(progress, () => 0, 'drift');
  assert.equal(plain.upgrades.drift, undefined);
  assert.equal(plain.pool.length, 4);
  progress.unlocked.push('drift');
  assert.equal(plain.pool.length, 4);
  const equipped = new Run(progress, () => 0, 'drift');
  assert.equal(equipped.pool.length, 5);
  assert.equal(equipped.upgrades.drift, 1);
  assert.equal(UPGRADES.length, 14);
});

test('Patient hands stacks slower gravity; demolition consumes charges and settles without scoring', () => {
  const run = new Run(freshProgress(), () => 0);
  const speed = run.fallInterval;
  run.addUpgrade('patience'); run.addUpgrade('patience');
  assert.equal(run.fallInterval, speed + 4);
  run.addUpgrade('demolition'); run.addUpgrade('demolition');
  assert.equal(run.charges, 4);
  assert.equal(run.useDemolition(), false);
  assert.equal(run.charges, 4);
  run.grid[(HEIGHT - 1) * WIDTH + 20] = 2;
  assert.equal(run.useDemolition(), true);
  assert.equal(run.charges, 3);
  assert.equal(run.phase, 'settling');
  assert.equal(run.score, 0);
  assert.equal(run.grid.filter(Boolean).length, 0);
  assert.equal(run.useDemolition(), false);
});

test('Pressure valve removes the highest patch only on every third clear', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('pressure');
  run.grid[40 * WIDTH + 20] = 2;
  for (let n = 1; n <= 3; n++) {
    run.grid[(HEIGHT - 1) * WIDTH] = 1;
    run.highlight = [(HEIGHT - 1) * WIDTH];
    run.chain = 1;
    run.clearHighlighted();
    assert.equal(run.grid[40 * WIDTH + 20], n < 3 ? 2 : 0);
  }
  assert.equal(run.score, 3);
  assert.equal(run.stageScore, 3);
});

test('Chromatic drift recolors at most 12 adjacent grains and only removed grains score', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('drift');
  run.grid.fill(1, (HEIGHT - 1) * WIDTH);
  run.grid.fill(2, (HEIGHT - 2) * WIDTH, (HEIGHT - 1) * WIDTH);
  run.highlight = Array.from({ length: WIDTH }, (_, x) => (HEIGHT - 1) * WIDTH + x);
  run.chain = 1;
  run.clearHighlighted();
  assert.equal(run.grid.filter(v => v === 1).length, 12);
  assert.equal(run.grid.filter(v => v === 2).length, WIDTH - 12);
  assert.equal(run.score, WIDTH);
  assert.equal(run.stageColors[1], WIDTH);
  assert.equal(run.stageColors[2], 0);
});

test('Chain collector rewards each subsequent link once; no bonus on the first', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('collector'); run.addUpgrade('collector');
  for (let chain = 1; chain <= 3; chain++) {
    run.grid[(HEIGHT - 1) * WIDTH] = 1;
    run.highlight = [(HEIGHT - 1) * WIDTH];
    run.chain = chain;
    run.clearHighlighted();
    assert.equal(run.bonusShards, Math.max(0, chain - 1) * 2);
  }
  assert.equal(run.bestChain, 3);
});

test('Aftershock nudges bordering sand without losing grains or crossing the row boundary', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('aftershock');
  const grain = (HEIGHT - 2) * WIDTH;
  run.grid[grain] = 2;
  run.grid[grain + WIDTH] = 1;
  run.highlight = [grain + WIDTH];
  run.chain = 1;
  run.clearHighlighted();
  assert.equal(run.grid[grain], 0);
  assert.equal(run.grid[grain + 1], 2);
  assert.equal(run.grid[grain - 1], 0);
  assert.equal(run.grid.filter(Boolean).length, 1);
  assert.equal(run.score, 1);
});

test('Color echo matches the preview without consuming it; equal colors and blocked phases cost no charges', () => {
  const progress = freshProgress();
  progress.unlocked.push('echo');
  const run = new Run(progress, () => 0, 'echo');
  assert.equal(run.echoCharges, 1);
  assert.equal(run.useEcho(), false);
  assert.equal(run.echoCharges, 1);
  run.nextPiece.color = 3;
  const preview = structuredClone(run.nextPiece);
  run.phase = 'settling';
  assert.equal(run.useEcho(), false);
  run.phase = 'playing';
  assert.equal(run.useEcho(), true);
  assert.equal(run.piece.color, 3);
  assert.equal(run.echoCharges, 0);
  assert.deepEqual(run.nextPiece, preview);
  run.drop();
  assert.equal(run.piece.color, 3);
  assert.deepEqual(run.piece.shape, preview.shape);
});

test('Supply cache refreshes excavation charges on entry; Color echo refills without stockpiling', () => {
  const progress = freshProgress();
  progress.unlocked.push('supply', 'echo');
  const run = new Run(progress, () => 0, 'supply');
  assert.equal(run.charges, 1);
  run.addUpgrade('echo'); run.addUpgrade('echo');
  run.echoCharges = 0;
  run.draft();
  // Choose a neutral upgrade to isolate the refill from the draft reward.
  run.offers = [UPGRADES.find(u => u.id === 'patience')];
  assert.ok(run.choose('patience'));
  assert.equal(run.charges, 2);
  assert.equal(run.echoCharges, 2);
  run.echoCharges = 1;
  run.draft();
  run.offers = [UPGRADES.find(u => u.id === 'echo')];
  assert.ok(run.choose('echo'));
  assert.equal(run.echoCharges, 3);
  assert.equal(run.charges, 3);
});

test('Crossroads rerolls alternatives without changing the board or preview; budget refreshes per draft', () => {
  const progress = freshProgress();
  progress.unlocked = UPGRADES.filter(u => u.cost).map(u => u.id);
  const run = new Run(progress, () => 0.25, 'crossroads');
  assert.equal(run.reroll(), false);
  run.draft();
  const old = run.offers.map(u => u.id);
  const preview = structuredClone(run.nextPiece);
  const board = run.grid.slice();
  assert.equal(run.rerolls, 1);
  assert.equal(run.reroll(), true);
  assert.equal(run.rerolls, 0);
  assert.equal(new Set(run.offers.map(u => u.id)).size, 3);
  assert.ok(run.offers.every(u => !old.includes(u.id)));
  assert.deepEqual(run.nextPiece, preview);
  assert.deepEqual(run.grid, board);
  assert.equal(run.reroll(), false);
  run.choose(run.offers[0].id);
  run.draft();
  assert.equal(run.rerolls, run.upgrades.crossroads);
});

test('Salvage counts only future connected clears, including overflow, and stacks rewards', () => {
  const run = new Run(freshProgress(), () => 0);
  run.score = 1920;
  run.addUpgrade('salvage'); run.addUpgrade('salvage');
  function remove(count) {
    run.grid.fill(1, 0, count);
    run.highlight = Array.from({ length: count }, (_, i) => i);
    run.chain = 1;
    run.clearHighlighted();
  }
  remove(100);
  assert.equal(run.bonusShards, 0);
  remove(100);
  assert.equal(run.bonusShards, 2);
  assert.equal(run.salvageGrains, 8);
  remove(400);
  assert.equal(run.bonusShards, 6);
  assert.equal(run.salvageGrains, 24);
});

test('Deep pockets rewards later completed stages once, including victory', () => {
  const run = new Run(freshProgress(), () => 0);
  run.addUpgrade('dividend'); run.addUpgrade('dividend');
  run.stageScore = run.objective.target;
  run.step();
  assert.equal(run.bonusShards, 4);
  run.step();
  assert.equal(run.bonusShards, 4);
  run.choose(run.offers.find(u => u.id !== 'dividend').id);
  run.stage = 4;
  run.stageScore = run.objective.target;
  run.step();
  assert.equal(run.state, 'won');
  assert.equal(run.bonusShards, 8);
});

test('Second wind spends a rescue, preserves the queued piece, and still allows later defeat', () => {
  const progress = freshProgress();
  progress.unlocked.push('revival');
  const run = new Run(progress, () => 0, 'revival');
  run.grid.fill(1);
  run.spawn();
  const piece = structuredClone(run.piece);
  const next = structuredClone(run.nextPiece);
  run.step();
  assert.equal(run.state, 'active');
  assert.equal(run.over, false);
  assert.equal(run.rescues, 0);
  assert.equal(run.phase, 'settling');
  assert.equal(run.grid.slice(0, 16 * WIDTH).filter(Boolean).length, 0);
  assert.deepEqual(run.piece, piece);
  assert.deepEqual(run.nextPiece, next);
  assert.equal(run.score, 0);
  run.grid.fill(2); run.spawn(); run.step();
  assert.equal(run.state, 'lost');
});
