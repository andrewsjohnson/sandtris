import { WIDTH, CELL, COLORS, GLOW_TICKS } from './engine.js';
import { Run, STAGES } from './run.js';
import { UPGRADES, loadProgress, saveProgress, unlock, recordRun } from './progression.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const context = canvas.getContext('2d');
const preview = $('#next-piece');
const previewContext = preview.getContext('2d');
const dialog = $('#camp');
let storage;
try { storage = window.localStorage; } catch { /* Private browsing can block access. */ }
const progress = loadProgress(storage);
let game = null;
let paused = false;
let elapsed = 0;
let fallTicks = 0;
let lastTime = performance.now();
let presentedState = null;
let selectedLoadout = '';
let buildSignature = '';
let previewSignature = '';
const STEP = 1000 / 60;
const colorNames = ['', 'gold', 'jade', 'coral', 'violet'];
function setText(selector, value) {
  const element = $(selector);
  if (element.textContent !== String(value)) element.textContent = value;
}

function persist() {
  const saved = saveProgress(storage, progress);
  $('#save-status').textContent = saved
    ? 'Unlocks saved on this device. Active runs restart on reload.'
    : 'Saving unavailable. Progress lasts only while this page stays open.';
}
function openDialog(content) {
  dialog.innerHTML = content;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function collection() {
  const unlocks = UPGRADES.filter(u => u.cost).sort((a, b) => a.cost - b.cost);
  return `<div class="collection"><span class="eyebrow">PERMANENT UNLOCKS · ${progress.unlocked.length} / ${unlocks.length}</span><p class="small">Expand your draft pool. Unlocked upgrades can also be chosen as a starting loadout.</p>${unlocks.map(u => {
    const owned = progress.unlocked.includes(u.id);
    return `<article class="unlock"><div><strong>${u.icon} ${u.name}</strong><p>${u.description}</p></div><button data-unlock="${u.id}" ${owned || progress.shards < u.cost ? 'disabled' : ''}>${owned ? 'Unlocked' : `${u.cost} shards`}</button></article>`;
  }).join('')}</div>`;
}
function camp() {
  game = null;
  presentedState = null;
  const available = UPGRADES.filter(u => progress.unlocked.includes(u.id));
  openDialog(`<span class="eyebrow">THE CAMP · ${progress.shards} SHARDS</span><h2 id="dialog-title">One more descent.</h2><p>Five stages. A board that remembers. A different build every run.</p><div class="camp-stats"><span>${progress.runs} runs</span><span>${progress.wins} wins</span><span>Best: ${progress.bestScore.toLocaleString()} grains</span></div><label for="loadout">Starting loadout</label><select id="loadout"><option value="">Travel light · no starting upgrade</option>${available.map(u => `<option value="${u.id}" ${selectedLoadout === u.id ? 'selected' : ''}>${u.name}</option>`).join('')}</select><p class="small">${available.length ? 'Starting upgrades are free and last for this run.' : 'Earn shards to unlock more ways to start.'}</p><button class="primary wide" id="begin">Begin run →</button>${collection()}<p class="small">Clear a stage to draft 1 of 3 upgrades. Bank shards when you finish, lose, or return to camp. Unlocks stay on this device.</p>`);
}
function showReward() {
  const next = STAGES[game.stage + 1];
  openDialog(`<span class="eyebrow">STAGE ${game.stage + 1} COMPLETE</span><h2 id="dialog-title">Take something with you.</h2><p>Your sand stays. Choose one upgrade for the rest of this run. Repeats stack.</p><div class="choices">${game.offers.map(u => `<button class="upgrade" data-choice="${u.id}"><span class="upgrade-icon">${u.icon}</span><strong>${u.name}</strong><span>${u.description}</span><small>${game.upgrades[u.id] ? `Stack ${game.upgrades[u.id] + 1}` : 'Add to your build'} →</small></button>`).join('')}</div>${game.upgrades.crossroads ? `<button id="reroll" class="wide" ${game.rerolls ? '' : 'disabled'}>Reroll choices · ${game.rerolls} left</button>` : ''}<p class="small">Next: ${next.name} · clear ${next.target} grains${next.color ? `, including ${next.colorTarget} ${colorNames[next.color]}` : ''}. Gravity gets faster.</p><button class="quiet" id="bank">Bank ${game.reward} shards & end run</button>`);
}
function showSummary() {
  if (recordRun(progress, game)) persist();
  const victory = game.state === 'won';
  openDialog(`<span class="eyebrow">${victory ? 'DESCENT COMPLETE' : game.state === 'retired' ? 'BACK AT CAMP' : 'THE SAND WINS THIS TIME'}</span><h2 id="dialog-title">${victory ? 'You reached the deep.' : 'Every run leaves something.'}</h2><p>${victory ? 'All five stages cleared. Bring what you learned into the next descent.' : 'Your upgrades end here. Your unlocks stay with you.'}</p><div class="summary-stats"><div><strong>+${game.reward}</strong><span>shards banked</span></div><div><strong>${game.score.toLocaleString()}</strong><span>grains cleared</span></div><div><strong>${game.clearedStages}/5</strong><span>stages cleared</span></div><div><strong>×${game.bestChain}</strong><span>best chain</span></div></div><p class="small">Bank: ${progress.shards} shards · Best: ${progress.bestScore.toLocaleString()} grains</p><button class="primary wide" id="return">Return to camp →</button>`);
}
function startRun() {
  selectedLoadout = $('#loadout').value;
  game = new Run(progress, Math.random, selectedLoadout);
  paused = false;
  fallTicks = 0;
  elapsed = 0;
  buildSignature = '';
  presentedState = 'active';
  dialog.close();
  canvas.focus({ preventScroll: true });
}
function action(name) {
  if (!game?.canAct || paused || dialog.open) return;
  if (name === 'left') game.move(-CELL, 0);
  if (name === 'right') game.move(CELL, 0);
  if (name === 'rotate') game.rotate();
  if (name === 'down') game.fall();
  if (name === 'drop') { game.drop(); fallTicks = 0; }
  if (name === 'demolish') game.useDemolition();
  if (name === 'echo') game.useEcho();
}
function confirmReturn() {
  if (!game || ['won', 'lost', 'retired'].includes(game.state)) { camp(); return; }
  openDialog(`<span class="eyebrow">RETURN TO CAMP</span><h2 id="dialog-title">End this descent?</h2><p>Bank ${game.reward} shards. Your board and current upgrades will be left behind.</p><button class="primary wide" id="bank">Bank shards & end run</button><button class="wide" id="continue">Keep playing</button>`);
}
function setPaused(value) {
  paused = value;
  $('#pause').textContent = paused ? 'Resume' : 'Pause';
}

dialog.addEventListener('cancel', event => event.preventDefault());
dialog.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.id === 'begin') startRun();
  if (button.id === 'return') camp();
  if (button.id === 'continue') {
    if (game.state === 'reward') showReward();
    else { dialog.close(); canvas.focus({ preventScroll: true }); }
  }
  if (button.id === 'bank') { game.retire(); presentedState = game.state; showSummary(); }
  if (button.id === 'reroll' && game.reroll()) showReward();
  if (button.dataset.choice && game.choose(button.dataset.choice)) {
    presentedState = 'active';
    elapsed = 0;
    fallTicks = 0;
    dialog.close();
    canvas.focus({ preventScroll: true });
  }
  if (button.dataset.unlock) {
    selectedLoadout = $('#loadout').value;
    if (unlock(progress, button.dataset.unlock)) { persist(); camp(); }
  }
});
$('#camp-button').addEventListener('click', confirmReturn);
$('#pause').addEventListener('click', event => { setPaused(!paused); event.target.blur(); });
$('#demolish').addEventListener('click', event => { action('demolish'); event.target.blur(); });
$('#echo').addEventListener('click', event => { action('echo'); event.target.blur(); });
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => { action(button.dataset.action); button.blur(); });
});
document.addEventListener('keydown', event => {
  if (dialog.open || event.target instanceof HTMLButtonElement) return;
  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop', b: 'demolish', B: 'demolish', c: 'echo', C: 'echo' };
  if (keys[event.key]) {
    event.preventDefault();
    if (!event.repeat || !['rotate', 'drop', 'demolish', 'echo'].includes(keys[event.key])) action(keys[event.key]);
  }
  if (event.key.toLowerCase() === 'p' && !event.repeat && game?.state === 'active') setPaused(!paused);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game) setPaused(true); });

function drawPreview() {
  const signature = JSON.stringify(game?.nextPiece || null);
  if (signature === previewSignature) return;
  previewSignature = signature;
  previewContext.clearRect(0, 0, preview.width, preview.height);
  const next = game?.nextPiece;
  setText('#next-color', next ? colorNames[next.color] : '—');
  preview.setAttribute('aria-label', next ? `Next piece: ${next.name}, ${colorNames[next.color]}` : 'Begin a run to see the next piece');
  if (!next) return;
  const xs = next.shape.map(([x]) => x);
  const ys = next.shape.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const block = 12;
  const offsetX = (preview.width - (Math.max(...xs) - minX + 1) * block) / 2;
  const offsetY = (preview.height - (Math.max(...ys) - minY + 1) * block) / 2;
  previewContext.fillStyle = COLORS[next.color];
  for (const [x, y] of next.shape) previewContext.fillRect(offsetX + (x - minX) * block, offsetY + (y - minY) * block, block - 1, block - 1);
}

function draw() {
  drawPreview();
  context.fillStyle = COLORS[0];
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / WIDTH;
  if (game) {
    for (let i = 0; i < game.grid.length; i++) {
      if (!game.grid[i]) continue;
      context.fillStyle = COLORS[game.grid[i]];
      context.fillRect((i % WIDTH) * scale, Math.floor(i / WIDTH) * scale, scale, scale);
    }
    if (game.phase === 'glowing') {
      context.save();
      context.globalAlpha = 0.2 + 0.65 * Math.sin(game.phaseTicks / GLOW_TICKS * Math.PI);
      context.fillStyle = '#ffffff';
      context.shadowColor = '#ffffff';
      context.shadowBlur = 8;
      for (const i of game.highlight) context.fillRect((i % WIDTH) * scale, Math.floor(i / WIDTH) * scale, scale, scale);
      context.restore();
    }
    if (!game.over) {
      context.fillStyle = COLORS[game.piece.color];
      for (const [x, y] of game.piece.shape) context.fillRect((game.piece.x + x * CELL) * scale, (game.piece.y + y * CELL) * scale, CELL * scale, CELL * scale);
    }
  }
  setText('#score', (game?.score || 0).toLocaleString());
  setText('#reward', game?.reward || 0);
  $('#pause').disabled = !game || game.state !== 'active';
  $('#pause').textContent = paused ? 'Resume' : 'Pause';
  $('#demolish').disabled = !game?.canAct || !game.charges || paused || dialog.open;
  const toolText = `Excavate · ${game?.charges || 0} charges`;
  if ($('#demolish').dataset.label !== toolText) { $('#demolish').innerHTML = `${toolText} <kbd>B</kbd>`; $('#demolish').dataset.label = toolText; }
  $('#echo').disabled = !game?.canAct || !game.echoCharges || paused || dialog.open || game.piece.color === game.nextPiece.color;
  const echoText = `Match next · ${game?.echoCharges || 0} charges`;
  if ($('#echo').dataset.label !== echoText) { $('#echo').innerHTML = `${echoText} <kbd>C</kbd>`; $('#echo').dataset.label = echoText; }
  $('#echo').title = game && game.piece.color === game.nextPiece.color ? 'This piece already matches the next color; no charge needed.' : 'Color echo: match this piece to the next color.';
  $('#rescue-count').hidden = !game?.upgrades.revival;
  setText('#rescue-count', `Rescues remaining: ${game?.rescues || 0}`);
  document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !game?.canAct || paused || dialog.open; });
  const status = !game ? 'Connect one color from wall to wall.'
    : paused ? 'Paused. Take your time.'
    : game.state !== 'active' ? 'Take a breath. Plan your next descent.'
    : game.phase === 'glowing' ? (game.chain > 1 ? `Chain reaction ×${game.chain}!` : 'Connected!')
    : game.phase === 'settling' ? 'Letting the sand settle…' : 'Connect one color from wall to wall.';
  setText('#status', status);
  if (game) {
    const goal = game.objective;
    setText('#stage-label', `STAGE ${game.stage + 1} / 5`);
    setText('#stage-name', goal.name);
    setText('#objective', `Clear ${goal.target} grains${goal.color ? `, including ${goal.colorTarget} ${colorNames[goal.color]} grains` : ''}.`);
    $('#goal-progress').max = goal.target;
    $('#goal-progress').value = Math.min(game.stageScore, goal.target);
    setText('#goal-count', `${Math.min(game.stageScore, goal.target)} / ${goal.target} grains${goal.color ? ` · ${Math.min(game.stageColors[goal.color], goal.colorTarget)} / ${goal.colorTarget} ${colorNames[goal.color]}` : ''}`);
  } else {
    setText('#stage-label', 'YOUR NEXT DESCENT');
    setText('#stage-name', 'Five stages. One board.');
    setText('#objective', 'Clear sand, choose upgrades, and see how deep you can go.');
    $('#goal-progress').value = 0;
    setText('#goal-count', 'Ready when you are.');
  }
  const signature = JSON.stringify([game?.stage, game?.upgrades, game?.clearedStages]);
  if (signature !== buildSignature) {
    buildSignature = signature;
    $('#build-list').innerHTML = game && Object.keys(game.upgrades).length
      ? UPGRADES.filter(u => game.upgrades[u.id]).map(u => `<li><details><summary>${u.icon} ${u.name} <span>×${game.upgrades[u.id]}</span></summary><p>${u.description}</p></details></li>`).join('')
      : '<li>No upgrades yet. Finish a stage to draft one.</li>';
    $('#route').innerHTML = STAGES.map((stage, i) => `<span class="${game && i < game.clearedStages ? 'complete' : game && i === game.stage ? 'current' : ''}" ${game && i === game.stage ? 'aria-current="step"' : ''}>${game && i < game.clearedStages ? '✓' : i + 1}<span>${stage.name}</span></span>`).join('');
  }
}
function frame(time) {
  elapsed += Math.min(time - lastTime, 100);
  lastTime = time;
  while (elapsed >= STEP) {
    if (game?.state === 'active' && !paused && !dialog.open) {
      game.step();
      if (game.state !== 'active' || game.phase !== 'playing') fallTicks = 0;
      else if (++fallTicks >= game.fallInterval) { game.fall(); fallTicks = 0; }
    }
    elapsed -= STEP;
  }
  if (game && game.state !== presentedState) {
    presentedState = game.state;
    if (game.state === 'reward') showReward();
    if (['won', 'lost', 'retired'].includes(game.state)) showSummary();
  }
  draw();
  requestAnimationFrame(frame);
}
persist();
camp();
requestAnimationFrame(frame);
