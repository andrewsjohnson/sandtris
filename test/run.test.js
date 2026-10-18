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
  assert.equal(UPGRADES.length, 6);
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
