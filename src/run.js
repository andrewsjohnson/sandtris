import { Game, WIDTH, HEIGHT, CELL } from './engine.js';
import { UPGRADES } from './progression.js';

export const STAGES = [
  { name: 'The shallows', target: 192, fall: 8 },
  { name: 'Shifting dunes', target: 256, fall: 7 },
  { name: 'Jade basin', target: 384, fall: 6, color: 2, colorTarget: 64 },
  { name: 'The furnace', target: 512, fall: 5, color: 1, colorTarget: 96 },
  { name: 'The deep', target: 640, fall: 4 },
];

export class Run extends Game {
  constructor(progress, random = Math.random, loadout = null) {
    super(random);
    this.stage = 0;
    this.stageScore = 0;
    this.stageColors = [0, 0, 0, 0, 0];
    this.clearedStages = 0;
    this.clearCount = 0;
    this.bestChain = 0;
    this.bonusShards = 0;
    this.state = 'active';
    this.upgrades = {};
    this.charges = 0;
    this.offers = [];
    this.pool = UPGRADES.filter(u => !u.cost || progress.unlocked.includes(u.id));
    // Unlocks also become optional starting loadouts on future runs.
    if (progress.unlocked.includes(loadout)) this.addUpgrade(loadout);
  }

  get objective() { return STAGES[this.stage]; }
  get fallInterval() { return this.objective.fall + 2 * (this.upgrades.patience || 0); }
  get reward() {
    return this.clearedStages * 3 + Math.floor(this.score / 192) + this.bonusShards + (this.state === 'won' ? 8 : 0);
  }
  get canAct() { return this.state === 'active' && !this.over && this.phase === 'playing'; }

  move(dx, dy) { return this.state && this.state !== 'active' ? false : super.move(dx, dy); }
  rotate() { if (this.state === 'active') super.rotate(); }
  fall() { if (this.state === 'active') super.fall(); }
  drop() { if (this.state === 'active') super.drop(); }

  addUpgrade(id) {
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    if (id === 'demolition') this.charges += 2;
  }

  draft() {
    const pool = [...this.pool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.offers = pool.slice(0, 3);
    this.state = 'reward';
  }

  choose(id) {
    if (this.state !== 'reward' || !this.offers.some(u => u.id === id)) return false;
    this.addUpgrade(id);
    this.stage++;
    this.stageScore = 0;
    this.stageColors.fill(0);
    this.offers = [];
    this.state = 'active';
    return true;
  }

  highestGrain() { return this.grid.findIndex(Boolean); }

  excavate(radius) {
    const top = this.highestGrain();
    if (top < 0) return false;
    const cx = top % WIDTH;
    const cy = Math.floor(top / WIDTH) + radius;
    for (let y = Math.max(0, cy - radius); y <= Math.min(HEIGHT - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x++) this.grid[y * WIDTH + x] = 0;
    }
    return true;
  }

  useDemolition() {
    if (!this.canAct || !this.charges || !this.excavate(4)) return false;
    this.charges--;
    this.chain = 0;
    this.beginSettling();
    return true;
  }

  clearHighlighted() {
    const cleared = [...this.highlight];
    const selected = new Set(cleared);
    const fringe = new Set();
    for (const i of cleared) {
      this.stageColors[this.grid[i]]++;
      const x = i % WIDTH;
      for (const j of [i - WIDTH, i + WIDTH, ...(x ? [i - 1] : []), ...(x < WIDTH - 1 ? [i + 1] : [])]) {
        if (j >= 0 && j < this.grid.length && !selected.has(j) && this.grid[j]) fringe.add(j);
      }
    }
    let budget = 12 * (this.upgrades.drift || 0);
    for (const i of cleared) {
      if (!budget) break;
      const x = i % WIDTH;
      for (const j of [i - WIDTH, i + WIDTH, ...(x ? [i - 1] : []), ...(x < WIDTH - 1 ? [i + 1] : [])]) {
        if (budget && fringe.has(j) && this.grid[j] !== this.grid[i]) {
          this.grid[j] = this.grid[i];
          fringe.delete(j);
          budget--;
        }
      }
    }
    super.clearHighlighted();
    this.stageScore += cleared.length;
    this.clearCount++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.bonusShards += (this.chain > 1 ? 1 : 0) * (this.upgrades.collector || 0);
    if (this.upgrades.pressure && this.clearCount % 3 === 0) this.excavate(2 + this.upgrades.pressure);
    // Move only grains bordering the clear, without wrapping rows or entering
    // the frozen active piece. Each pass preserves the remaining grain count.
    const occupied = new Set();
    for (const [bx, by] of this.piece.shape) {
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        occupied.add((this.piece.y + by * CELL + y) * WIDTH + this.piece.x + bx * CELL + x);
      }
    }
    for (let pass = 0; pass < (this.upgrades.aftershock || 0); pass++) {
      const moved = new Set();
      for (const i of fringe) {
        if (!this.grid[i] || moved.has(i)) continue;
        const dir = this.random() < 0.5 ? -1 : 1;
        for (const dx of [dir, -dir]) {
          const x = i % WIDTH + dx;
          const target = i + dx;
          if (x >= 0 && x < WIDTH && !this.grid[target] && !occupied.has(target)) {
            this.grid[target] = this.grid[i];
            this.grid[i] = 0;
            moved.add(target);
            break;
          }
        }
      }
      for (const i of moved) fringe.add(i);
    }
  }

  retire() {
    if (!['active', 'reward'].includes(this.state)) return false;
    this.state = 'retired';
    return true;
  }

  step() {
    if (this.state !== 'active') return;
    super.step();
    if (this.over) { this.state = 'lost'; return; }
    const goal = this.objective;
    if (this.phase !== 'playing' || this.stageScore < goal.target || (goal.color && this.stageColors[goal.color] < goal.colorTarget)) return;
    this.clearedStages++;
    if (this.stage === STAGES.length - 1) this.state = 'won';
    else this.draft();
  }
}
