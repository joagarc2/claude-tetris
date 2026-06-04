# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly:

```bash
xdg-open index.html          # Linux
open index.html              # macOS
```

Or serve locally (required if you need `fetch`/module imports):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

Three files, no framework:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, a sidebar with score/lines/level readouts, and a shared overlay div used for both PAUSE and GAME OVER states.
- **`style.css`** — Dark/retro aesthetic, no logic.
- **`game.js`** — All game logic (~300 lines, `'use strict'`, no modules).

### Key data model (`game.js`)

- `board`: `ROWS × COLS` (20×10) matrix; `0` = empty, `1–7` = locked piece color index.
- `current` / `next`: `{ type, shape, x, y }` objects. `shape` is a 2D array copied from `PIECES[type]`.
- All mutable state lives in module-level `let` vars: `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId`.

### Game loop

`init()` → `requestAnimationFrame(loop)`. Each frame: accumulate `dt` into `dropAccum`; when it exceeds `dropInterval`, advance the piece one row or call `lockPiece()`. Then `draw()`.

`lockPiece()` sequence: `merge()` → `clearLines()` → `spawn()`. If the spawned piece immediately collides, `endGame()` fires.

### Tunable constants (top of `game.js`)

| Constant | Default | Note |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | Also update canvas `width`/`height` in `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`) |
| `BLOCK` | 30 | Pixel size per cell |
| `COLORS` | 7 colors | Index 0 = null (empty) |
| `LINE_SCORES` | `[0,100,300,500,800]` | Multiplied by current level |
| `dropInterval` | 1000ms | Initial fall speed; recalculated as `max(100, 1000 − (level−1) × 90)` |
