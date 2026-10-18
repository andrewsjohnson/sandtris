# Sandtris

A falling sand + Tetris experiment. Steer falling tetrominoes; when they land,
they become sand. Connect a single color from the left wall to the right wall
to clear that connected group and score one point per grain.

**[Play Sandtris](https://andrewsjohnson.github.io/sandtris/)** ·
[GitHub repository](https://github.com/andrewsjohnson/sandtris)

## Publishing

GitHub Pages publishes the repository root from `main`. Push changes to `main`
to update the live game; deployment progress appears in the repository's Actions
tab. Pull requests run syntax checks and simulation tests before merging.
The site is static: no build step, backend, or secrets are needed. Keep asset
URLs relative so the game works under the `/sandtris/` project path.

## Run locally

Requires Node.js 22 or newer (Node 24 is pinned in `.nvmrc`). There are no package
dependencies or install steps.

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. Use `PORT=8080 npm run dev` to change the port.
For a remote preview, use `HOST=0.0.0.0 npm run dev` and forward port 5173.
The included server is for local development.

## Controls

| Input | Action |
| --- | --- |
| Left / right arrows | Move |
| Up arrow | Rotate clockwise |
| Down arrow | Fall faster |
| Space | Hard drop |
| P | Pause / resume |

On-screen buttons support touch. The game pauses when the tab is hidden.
Use **New game** to reset the board and score.

## Development

```sh
npm run check
npm test
```

- `src/engine.js`: DOM-free simulation, collisions, rotation, sand, and scoring.
- `src/main.js`: canvas rendering, fixed 60 Hz simulation, and input.
- `src/style.css`: responsive game layout.
- `test/engine.test.js`: physics, collision, clear, and game-over regression tests.
- `scripts/serve.js`: dependency-free local HTTP server.
- `.github/workflows/ci.yml`: syntax checks and tests on pushes and pull requests.

The board is 60 × 100 sand cells; each tetromino block is 4 × 4 grains.
Sand falls down or diagonally down into empty cells. Four-way same-color
connections clear immediately when they touch both walls; diagonals do not connect.
The active piece blocks sand. A blocked spawn ends the game. `new Game(random)`
accepts an RNG function for reproducible tests and future replay support.

## Next milestones

- Tune gravity, clearing feedback, and difficulty through playtesting.
- Add a next-piece preview and a seven-bag shape randomizer.
- Add seeded replays and saved best scores.
- Improve touch controls with press-and-hold movement.

This is an early prototype: rotation uses simple horizontal kicks and there is
no hold piece, lock delay, audio, or persistence yet. Licensing is still to be
chosen.
