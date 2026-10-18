# Sandtris

A falling sand + Tetris roguelite. Guide tetrominoes into the pile, connect a
single color from wall to wall, and build a different set of upgrades each run.

**[Play Sandtris](https://andrewsjohnson.github.io/sandtris/)** ·
[GitHub repository](https://github.com/andrewsjohnson/sandtris)

## The descent

Begin a run at camp. Clear each stage's objective, then choose one of three
random upgrades. The sand and active piece carry into the next stage. Drafts
wait for the entire clearing cascade to finish, and gravity pauses while you
choose. Complete all five stages to win; a blocked spawn ends your run.

| Stage | Objective | Gravity interval at 60 Hz |
| --- | --- | --- |
| The shallows | Clear 192 grains | 8 ticks |
| Shifting dunes | Clear 256 grains | 7 ticks |
| Jade basin | Clear 384 grains, including 64 jade | 6 ticks |
| The furnace | Clear 512 grains, including 96 gold | 5 ticks |
| The deep | Clear 640 grains | 4 ticks |

Objectives reset between stages. All cleared grains in a cascade belong to the
current stage; excess does not roll over. Only connected clears count toward
objectives and score; excavation and pressure vents do not.

### Upgrades

Four upgrades are available in the starting draft pool. Ten more can be unlocked
permanently at camp. Picks last for the current run and repeat picks stack.

| Upgrade | Effect | Unlock |
| --- | --- | --- |
| Aftershock | Nudge grains bordering a clear sideways; one pass per stack | Available |
| Pressure valve | Every third clear vents a patch from the highest pile; stacks widen it | Available |
| Controlled demolition | Gain two charges; excavate up to a 9 × 9 patch from the highest pile | Available |
| Patient hands | Add two ticks between piece falls per stack | Available |
| Chromatic drift | Before clearing, recolor up to 12 neighboring grains per stack to the clearing color | 8 shards |
| Chain collector | Each clear after the first in a cascade earns one extra shard per stack | 12 shards |
| Crossroads | One draft reroll per stack, refreshed at each stage reward | 6 shards |
| Supply cache | One excavation charge now and on entering each later stage, per stack | 6 shards |
| Color echo | Match the falling piece to the queued color once per stage per stack | 10 shards |
| Salvage | Every 192 future connected-clear grains earn one extra shard per stack | 8 shards |
| Deep pockets | Each later stage completion earns two extra shards per stack | 14 shards |
| Second wind | One top-out rescue per stack; clear the top 16 rows and continue | 20 shards |
| Powder trail | Every fourth future piece is powder; stacks reduce the interval to 3, 2, then 1 | 8 shards |
| Gravel works | Make the next piece gravel; one charge per stage per stack | 10 shards |

Drift grains remain on the board and can become part of a later clear. Aftershock
preserves grain count and cannot push grains into the active piece. Excavation
starts a settling phase that can trigger a normal cascade.

The **Next piece** panel shows the queued shape and named color. Its shape and color stay fixed
through movement, rotation, sand simulation, and reward choices, then becomes the
next falling piece. The material is also named and textured in the preview.
Color echo changes only the active piece, leaving that queue
intact. Matching an already matching color costs no charge; echo charges refill
at stage entry rather than stockpiling.

Crossroads prefers options absent from the previous draft; small pools may repeat
some choices. Rerolls never change the board or queued piece. Supply cache adds
charges to your stockpile. Second wind charges last across the run and are not
refilled by changing stages; rescue removal grants no score or objective progress.
Powder trail stops at four stacks and disappears from drafts when maxed.

### Permanent progress

When you win, lose, or choose to end a run at camp, bank:

- Three shards per completed stage.
- One shard per 192 grains cleared across the run.
- Chain collector, Salvage, and Deep pockets bonuses.
- Eight extra shards for winning.

Use shards at camp to expand the upgrade pool. Each purchased upgrade also
becomes a free optional starting loadout for future runs. Unspent shards,
unlocks, total runs, wins, best score, and deepest stage persist in localStorage
on the current browser and device. Active runs restart on reload. If browser
storage is unavailable, the game still works and shows that progress is temporary.
There is no account, backend, or cross-device sync.
Existing version 1 saves keep their shards, records, and purchased upgrades when
new upgrades are added.

## Controls

| Input | Action |
| --- | --- |
| Left / right arrows | Move |
| Up arrow | Rotate clockwise |
| Down arrow | Fall faster |
| Space | Hard drop |
| P | Pause / resume |
| B / Excavate button | Use a demolition charge |
| C / Match next button | Use a Color echo charge |
| G / Queue gravel button | Use a Gravel works charge on the next piece |

On-screen buttons support touch. Mobile zoom gestures, text selection, tap
highlighting, and long-press callouts are disabled. The game pauses when the tab
is hidden. **Camp** asks before ending an active run; cancel to keep playing.

## Sand and clearing

The board is 60 × 100 sand cells; each tetromino block is 4 × 4 grains. Color and
material are independent. Four-way same-color connections trigger a
settling window when they touch both walls; diagonals do not connect.

| Material | Movement | Texture |
| --- | --- | --- |
| Sand | Falls vertically, then tries a one-cell diagonal | Solid |
| Gravel | Falls vertically; rolls diagonally only if the ledge has at least two cells of drop | Coarse stripes |
| Powder | Falls vertically; can spread two cells sideways into a lower row if the entire path is clear | Light dots |

All three materials support each other and connect when their colors match.
Gravel builds steeper supports; removing a support can collapse powder above it
into a cascade. Powder cannot jump through walls or the active piece. Every
grain moves down at most one row per simulation tick, so all materials eventually
settle and use the same glow-and-clear sequence.

Unlock **Powder trail** for automatic powder pieces at piece numbers 4, 8, 12,
and so on. Stacks change that cadence to every third, second, then every future
piece. Taking or stacking the upgrade updates the already queued piece if it
falls on the new cadence; the current falling piece stays unchanged.

Unlock **Gravel works** to choose when to queue a gravel piece. It changes only
the next piece's material, preserving shape and color. Charges refill at stage
entry without stockpiling. Queuing an already gravel piece costs nothing, and
a manual gravel reservation takes priority over Powder trail. The queue remains
fixed unless you explicitly change its material or take a Powder trail upgrade.

Recoloring preserves material. Aftershock carries material with displaced grains;
clears, excavation, vents, and Second wind remove material data alongside grains.

Sand settles for at least 0.5 seconds and must be still for six ticks before
connected groups are recomputed. The selected grains glow for 0.4 seconds, then
clear. Remaining sand gets the same settling window before checking for another
chain. Piece movement and gravity wait until the sequence finishes. Each removed
grain scores once; chain collector affects shards rather than score.

## Run locally

Requires Node.js 22 or newer (Node 24 is pinned in `.nvmrc`). There are no package
dependencies or install steps.

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. Use `PORT=8080 npm run dev` to change the port.
For a remote preview, use `HOST=0.0.0.0 npm run dev` and forward port 5173.
The included server is for local development.

```sh
npm run check
npm test
```

- `src/engine.js`: DOM-free sand, collisions, rotation, and clear timing.
- `src/run.js`: stages, upgrade drafting and effects, run rewards.
- `src/progression.js`: validated local saves, purchases, and reward banking.
- `src/main.js`: canvas, input, camp, draft, summary, and persistence UI.
- `src/style.css`: responsive desktop and phone layouts.
- `test/`: physics, cascade, run, upgrade, and persistence regression tests.
- `scripts/serve.js`: dependency-free local HTTP server.

`new Game(random)` and `new Run(progress, random, loadout)` accept an RNG function
for reproducible tests. Run state and saves are independent of the DOM.

## Publishing

GitHub Pages publishes the repository root from `main`. Pushes update the live
game; progress appears in Actions. CI checks syntax and runs tests on pushes and
pull requests. Keep asset URLs relative for the `/sandtris/` project path.

## Next milestones

Playtest stage targets and upgrade balance; add a landing preview,
press-and-hold movement, richer clear feedback, and saved in-progress runs.
Rotation uses simple horizontal kicks. There is no hold piece, lock delay,
audio, or online leaderboard. Licensing is still to be chosen.
