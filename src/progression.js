export const SAVE_KEY = 'sandtris.progress.v1';
export const UPGRADES = [
  { id: 'aftershock', name: 'Aftershock', icon: '↔', cost: 0, description: 'Each clear nudges nearby sand sideways. Stacks add more nudges.' },
  { id: 'pressure', name: 'Pressure valve', icon: '♧', cost: 0, description: 'Every third clear vents a patch from the highest pile. Stacks widen the patch.' },
  { id: 'demolition', name: 'Controlled demolition', icon: '⌁', cost: 0, description: 'Gain 2 excavation charges. Each removes a 9 × 9 patch from the highest pile.' },
  { id: 'patience', name: 'Patient hands', icon: '◷', cost: 0, description: 'Pieces fall more slowly: +2 simulation ticks between drops per stack.' },
  { id: 'drift', name: 'Chromatic drift', icon: '◈', cost: 8, description: 'Before a clear, up to 12 neighboring grains adopt its color per stack, setting up cascades.' },
  { id: 'collector', name: 'Chain collector', icon: '✧', cost: 12, description: 'Earn 1 extra permanent shard per chain link beyond the first, per stack.' },
];

const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function freshProgress() {
  return { version: 1, shards: 0, unlocked: [], runs: 0, wins: 0, bestScore: 0, bestStage: 0 };
}

export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage.getItem(SAVE_KEY));
    if (data?.version !== 1) return freshProgress();
    return {
      version: 1,
      ...Object.fromEntries(['shards', 'runs', 'wins', 'bestScore', 'bestStage'].map(key => [key, integer(data[key])])),
      unlocked: [...new Set(Array.isArray(data.unlocked) ? data.unlocked.filter(id => UPGRADES.some(u => u.id === id && u.cost)) : [])],
    };
  } catch { return freshProgress(); }
}

export function saveProgress(storage, progress) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(progress)); return true; }
  catch { return false; }
}

export function unlock(progress, id) {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade?.cost || progress.unlocked.includes(id) || progress.shards < upgrade.cost) return false;
  progress.shards -= upgrade.cost;
  progress.unlocked.push(id);
  return true;
}

export function recordRun(progress, run) {
  if (!['lost', 'won', 'retired'].includes(run.state) || run.recorded) return false;
  run.recorded = true;
  progress.shards += run.reward;
  progress.runs++;
  progress.wins += run.state === 'won' ? 1 : 0;
  progress.bestScore = Math.max(progress.bestScore, run.score);
  progress.bestStage = Math.max(progress.bestStage, run.stage + 1);
  return true;
}
