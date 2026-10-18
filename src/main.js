import { Game, WIDTH, HEIGHT, CELL, COLORS } from './engine.js';

const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const score = document.querySelector('#score');
const status = document.querySelector('#status');
const pauseButton = document.querySelector('#pause');
let game = new Game();
let paused = false;
let elapsed = 0;
let fallTicks = 0;
let lastTime = performance.now();
const STEP = 1000 / 60;

function action(name) {
  if (paused || game.over) return;
  if (name === 'left') game.move(-CELL, 0);
  if (name === 'right') game.move(CELL, 0);
  if (name === 'rotate') game.rotate();
  if (name === 'down') game.fall();
  if (name === 'drop') { game.drop(); fallTicks = 0; }
}

function setPaused(value) {
  paused = value;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
}

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement) return;
  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' };
  if (keys[event.key]) {
    event.preventDefault();
    if (!event.repeat || !['rotate', 'drop'].includes(keys[event.key])) action(keys[event.key]);
  }
  if (event.key.toLowerCase() === 'p' && !event.repeat) setPaused(!paused);
});
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => { action(button.dataset.action); button.blur(); });
});
pauseButton.addEventListener('click', () => { setPaused(!paused); pauseButton.blur(); });
document.querySelector('#restart').addEventListener('click', event => {
  game = new Game();
  elapsed = 0;
  fallTicks = 0;
  setPaused(false);
  event.target.blur();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

function draw() {
  context.fillStyle = COLORS[0];
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / WIDTH;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const color = game.grid[y * WIDTH + x];
      if (!color) continue;
      context.fillStyle = COLORS[color];
      context.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  if (!game.over) {
    context.fillStyle = COLORS[game.piece.color];
    for (const [x, y] of game.piece.shape) {
      context.fillRect((game.piece.x + x * CELL) * scale, (game.piece.y + y * CELL) * scale, CELL * scale, CELL * scale);
    }
  }
  score.textContent = game.score.toLocaleString();
  status.textContent = game.over ? 'Pile reached the top. Start a new game.' : paused ? 'Paused. Take your time.' : 'Make a color reach both walls.';
}

function frame(time) {
  elapsed += Math.min(time - lastTime, 100);
  lastTime = time;
  while (elapsed >= STEP) {
    if (!paused && !game.over) {
      game.settle();
      game.clearConnections();
      if (++fallTicks >= 6) { game.fall(); fallTicks = 0; }
    }
    elapsed -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
