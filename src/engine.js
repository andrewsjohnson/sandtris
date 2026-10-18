export const WIDTH = 60;
export const HEIGHT = 100;
export const CELL = 4;
export const COLORS = ['#0b1013', '#f0ba65', '#7bc5b4', '#e88379', '#969ee3'];
export const SETTLE_TICKS = 30;
export const STILL_TICKS = 6;
export const GLOW_TICKS = 24;
const SHAPES = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
];

// The simulation has no DOM dependencies. Inject a seeded RNG for reproducible runs.
export class Game {
  constructor(random = Math.random) {
    this.random = random;
    this.grid = new Uint8Array(WIDTH * HEIGHT);
    this.score = 0;
    this.over = false;
    this.tick = 0;
    this.phase = 'playing';
    this.phaseTicks = 0;
    this.stillTicks = 0;
    this.highlight = [];
    this.chain = 0;
    this.spawn();
  }

  spawn() {
    this.piece = {
      shape: SHAPES[Math.floor(this.random() * SHAPES.length)].map(p => [...p]),
      color: 1 + Math.floor(this.random() * 4),
      x: Math.floor(WIDTH / 2) - 2 * CELL,
      y: 0,
    };
    if (!this.fits(this.piece)) this.over = true;
  }

  fits(piece) {
    return piece.shape.every(([bx, by]) => {
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          const x = piece.x + bx * CELL + dx;
          const y = piece.y + by * CELL + dy;
          if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || this.grid[y * WIDTH + x]) return false;
        }
      }
      return true;
    });
  }

  move(dx, dy) {
    if (this.over || this.phase !== 'playing') return false;
    const next = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy };
    if (!this.fits(next)) return false;
    this.piece = next;
    return true;
  }

  rotate() {
    if (this.over || this.phase !== 'playing') return;
    const shape = this.piece.shape.map(([x, y]) => [2 - y, x]);
    for (const offset of [0, -CELL, CELL, -2 * CELL, 2 * CELL]) {
      const next = { ...this.piece, shape, x: this.piece.x + offset };
      if (this.fits(next)) { this.piece = next; return; }
    }
  }

  lock() {
    for (const [bx, by] of this.piece.shape) {
      for (let dy = 0; dy < CELL; dy++) {
        for (let dx = 0; dx < CELL; dx++) {
          this.grid[(this.piece.y + by * CELL + dy) * WIDTH + this.piece.x + bx * CELL + dx] = this.piece.color;
        }
      }
    }
    this.spawn();
  }

  fall() {
    if (!this.over && this.phase === 'playing' && !this.move(0, 1)) this.lock();
  }

  drop() {
    if (this.over || this.phase !== 'playing') return;
    while (this.move(0, 1)) { /* Advance until the next row collides. */ }
    this.lock();
  }

  settle() {
    // Bottom-up traversal moves each grain at most once per tick.
    const occupied = new Set();
    if (!this.over) {
      for (const [bx, by] of this.piece.shape) {
        for (let dy = 0; dy < CELL; dy++) {
          for (let dx = 0; dx < CELL; dx++) {
            occupied.add((this.piece.y + by * CELL + dy) * WIDTH + this.piece.x + bx * CELL + dx);
          }
        }
      }
    }
    const reverse = this.tick++ % 2 === 0;
    let moved = 0;
    for (let y = HEIGHT - 2; y >= 0; y--) {
      for (let col = 0; col < WIDTH; col++) {
        const x = reverse ? WIDTH - 1 - col : col;
        const i = y * WIDTH + x;
        if (!this.grid[i]) continue;
        const direction = this.random() < 0.5 ? -1 : 1;
        for (const dx of [0, direction, -direction]) {
          const nx = x + dx;
          const target = i + WIDTH + dx;
          if (nx >= 0 && nx < WIDTH && !this.grid[target] && !occupied.has(target)) {
            this.grid[target] = this.grid[i];
            this.grid[i] = 0;
            moved++;
            break;
          }
        }
      }
    }
    return moved;
  }

  findConnections() {
    const seen = new Uint8Array(this.grid.length);
    const connected = [];
    for (let start = 0; start < this.grid.length; start++) {
      const color = this.grid[start];
      if (!color || seen[start]) continue;
      const group = [start];
      let left = false;
      let right = false;
      seen[start] = 1;
      for (let n = 0; n < group.length; n++) {
        const i = group[n];
        const x = i % WIDTH;
        left ||= x === 0;
        right ||= x === WIDTH - 1;
        const neighbors = [i - WIDTH, i + WIDTH];
        if (x > 0) neighbors.push(i - 1);
        if (x < WIDTH - 1) neighbors.push(i + 1);
        for (const j of neighbors) {
          if (j >= 0 && j < this.grid.length && !seen[j] && this.grid[j] === color) {
            seen[j] = 1;
            group.push(j);
          }
        }
      }
      if (left && right) {
        connected.push(...group);
      }
    }
    return connected;
  }

  beginSettling() {
    this.phase = 'settling';
    this.phaseTicks = 0;
    this.stillTicks = 0;
    this.highlight = [];
  }

  // Called once per fixed simulation tick. Input and piece gravity wait during
  // resolution, so each cascade can finish before the next piece moves.
  step() {
    if (this.over) return;
    if (this.phase === 'glowing') {
      if (++this.phaseTicks >= GLOW_TICKS) {
        for (const i of this.highlight) this.grid[i] = 0;
        this.score += this.highlight.length;
        this.beginSettling();
      }
      return;
    }

    const moved = this.settle();
    if (this.phase === 'playing') {
      if (this.findConnections().length) {
        this.chain = 0;
        this.beginSettling();
      }
      return;
    }

    this.phaseTicks++;
    this.stillTicks = moved ? 0 : this.stillTicks + 1;
    if (this.phaseTicks < SETTLE_TICKS || this.stillTicks < STILL_TICKS) return;
    // Recompute after settling: islands may have joined or a bridge may have
    // broken. Never remove the stale component found at the start of the delay.
    this.highlight = this.findConnections();
    this.phaseTicks = 0;
    if (this.highlight.length) {
      this.phase = 'glowing';
      this.chain++;
    } else {
      this.phase = 'playing';
      this.chain = 0;
    }
  }
}
