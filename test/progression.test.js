import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, freshProgress, loadProgress, saveProgress, unlock, recordRun } from '../src/progression.js';
import { Run } from '../src/run.js';

function storage(initial = null) {
  let data = initial;
  return { getItem: key => key === SAVE_KEY ? data : null, setItem: (key, value) => { assert.equal(key, SAVE_KEY); data = value; } };
}

test('missing, corrupt, or unsupported saves recover safely', () => {
  for (const value of [null, '{broken', '{}', '{"version":2}', 'null']) assert.deepEqual(loadProgress(storage(value)), freshProgress());
  assert.deepEqual(loadProgress(undefined), freshProgress());
  assert.equal(saveProgress(undefined, freshProgress()), false);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(loadProgress(blocked), freshProgress());
  assert.equal(saveProgress(blocked, freshProgress()), false);
});

test('invalid values and upgrade ids are sanitized on load', () => {
  const data = loadProgress(storage(JSON.stringify({ version: 1, shards: -4, wins: '99', runs: 2, bestScore: 4.5, unlocked: ['drift', 'drift', 'patience', '<script>'] })));
  assert.equal(data.shards, 0);
  assert.equal(data.wins, 0);
  assert.equal(data.runs, 2);
  assert.equal(data.bestScore, 0);
  assert.deepEqual(data.unlocked, ['drift']);
});

test('unlock purchases charge once and survive reload; insufficient funds do not mutate progress', () => {
  const progress = freshProgress();
  assert.equal(unlock(progress, 'drift'), false);
  progress.shards = 20;
  assert.equal(unlock(progress, 'drift'), true);
  assert.equal(progress.shards, 12);
  assert.equal(unlock(progress, 'drift'), false);
  assert.equal(unlock(progress, 'invalid'), false);
  assert.equal(unlock(progress, 'patience'), false);
  assert.equal(unlock(progress, 'collector'), true);
  assert.equal(progress.shards, 0);
  const saved = storage();
  assert.equal(saveProgress(saved, progress), true);
  assert.deepEqual(loadProgress(saved), progress);
});

test('run rewards bank exactly once and retain bests without counting unfinished runs', () => {
  const progress = freshProgress();
  const run = new Run(progress);
  assert.equal(recordRun(progress, run), false);
  run.score = 384;
  run.stage = 2;
  run.clearedStages = 2;
  run.state = 'lost';
  assert.equal(recordRun(progress, run), true);
  assert.equal(recordRun(progress, run), false);
  assert.equal(progress.shards, 8);
  assert.equal(progress.runs, 1);
  assert.equal(progress.wins, 0);
  assert.equal(progress.bestScore, 384);
  assert.equal(progress.bestStage, 3);
  const won = new Run(progress);
  won.state = 'won'; won.stage = 4; won.clearedStages = 5;
  recordRun(progress, won);
  assert.equal(progress.wins, 1);
  assert.equal(progress.bestScore, 384);
  assert.equal(progress.bestStage, 5);
});

test('old saves retain currency and existing unlocks while supporting all new purchases', () => {
  const progress = loadProgress(storage(JSON.stringify({ version: 1, shards: 100, unlocked: ['drift', 'collector'], runs: 4, wins: 1, bestScore: 1000, bestStage: 5 })));
  for (const id of ['crossroads', 'supply', 'echo', 'salvage', 'dividend', 'revival']) assert.ok(unlock(progress, id));
  assert.equal(progress.unlocked.length, 8);
  assert.equal(progress.shards, 36);
  assert.equal(progress.bestScore, 1000);
  const saved = storage();
  saveProgress(saved, progress);
  assert.deepEqual(loadProgress(saved), progress);
});
