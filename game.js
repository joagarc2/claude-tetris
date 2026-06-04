'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - light blue
  '#ffb74d', // L - orange
  '#f06292', // +    - rosa
  '#26c6da', // U    - turquesa
  '#aed581', // Y    - lima
  '#ffe57a', // 1×1  - dorado (recompensa)
  '#b0bec5', // 3×3  - gris frío (reto)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // 1 I
  [[2,2],[2,2]],                               // 2 O
  [[0,3,0],[3,3,3],[0,0,0]],                  // 3 T
  [[0,4,4],[4,4,0],[0,0,0]],                  // 4 S
  [[5,5,0],[0,5,5],[0,0,0]],                  // 5 Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // 6 J
  [[0,0,7],[7,7,7],[0,0,0]],                  // 7 L
  [[0,8,0],[8,8,8],[0,8,0]],                  // 8 + (plus)
  [[9,0,9],[9,9,9]],                           // 9 U
  [[0,10],[10,10],[0,10],[0,10]],              // 10 Y
  [[11]],                                      // 11 1×1 (recompensa Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],           // 12 3×3 hueca (reto)
];

const STANDARD_MAX = 7;               // tipos 1..7 = piezas clásicas
const SPECIAL_TYPES = [8, 9, 10, 12]; // pool ocasional: +, U, Y, 3×3 hueca
const SINGLE_TYPE = 11;               // recompensa tras Tetris
const SPECIAL_CHANCE = 0.08;          // ~8% de probabilidad de pieza especial

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const restartFromPauseBtn = document.getElementById('restart-from-pause-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const pauseControlsList = document.querySelector('.pause-controls-list');
const initialLevelDisplay = document.getElementById('initial-level-display');
const initialLevelDec = document.getElementById('initial-level-dec');
const initialLevelInc = document.getElementById('initial-level-inc');

(function initTheme() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.checked = true;
  }
})();

let initialLevel = parseInt(localStorage.getItem('tetris-initial-level'), 10) || 1;
if (initialLevel < 1) initialLevel = 1;
if (initialLevel > 15) initialLevel = 15;
initialLevelDisplay.textContent = initialLevel;

themeToggle.addEventListener('change', () => {
  if (themeToggle.checked) {
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
  }
});

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, pendingPieces;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  if (Math.random() < SPECIAL_CHANCE) {
    const type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
    return makePiece(type);
  }
  return makePiece(Math.floor(Math.random() * STANDARD_MAX) + 1);
}

function nextPiece() {
  return pendingPieces.length ? pendingPieces.shift() : randomPiece();
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(initialLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) pendingPieces.push(makePiece(SINGLE_TYPE)); // Tetris → recompensa 1×1
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = nextPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = initialLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (initialLevel - 1) * 90);
  dropAccum = 0;
  pendingPieces = [];
  pauseControlsList.classList.add('hidden');
  controlsToggleBtn.textContent = 'Ver controles';
  lastTime = performance.now();
  next = nextPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

restartFromPauseBtn.addEventListener('click', () => {
  init();
});

controlsToggleBtn.addEventListener('click', () => {
  const visible = pauseControlsList.classList.toggle('hidden');
  // toggle returns true when class WAS added (now hidden), false when removed (now visible)
  controlsToggleBtn.textContent = visible ? 'Ver controles' : 'Ocultar controles';
});

initialLevelDec.addEventListener('click', () => {
  if (initialLevel > 1) {
    initialLevel--;
    initialLevelDisplay.textContent = initialLevel;
    localStorage.setItem('tetris-initial-level', initialLevel);
  }
});

initialLevelInc.addEventListener('click', () => {
  if (initialLevel < 15) {
    initialLevel++;
    initialLevelDisplay.textContent = initialLevel;
    localStorage.setItem('tetris-initial-level', initialLevel);
  }
});

init();
