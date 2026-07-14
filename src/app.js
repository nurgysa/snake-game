import { createGame, step, changeDirection, startGame, togglePause, DIRECTIONS } from './game.js';

const COLS = 20;
const ROWS = 20;
const BEST_SCORES_KEY = 'snake-best-scores';
const LEGACY_BEST_SCORE_KEY = 'snake-best-score';
const DEFAULT_DIFFICULTY = 'normal';

const DIFFICULTY_PRESETS = Object.freeze({
  easy: Object.freeze({ initialSpeedMs: 180, minSpeedMs: 90, speedStepMs: 3, initialObstacleCount: 1 }),
  normal: Object.freeze({ initialSpeedMs: 140, minSpeedMs: 60, speedStepMs: 4, initialObstacleCount: 2 }),
  hard: Object.freeze({ initialSpeedMs: 100, minSpeedMs: 45, speedStepMs: 5, initialObstacleCount: 3 }),
});

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const bestScoreEl = document.getElementById('best-score');
const difficultySelect = document.getElementById('difficulty');
const overlayEl = document.getElementById('overlay');
const overlayTextEl = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const newGameBtn = document.getElementById('new-game-btn');
const dpadUpBtn = document.getElementById('dpad-up');
const dpadDownBtn = document.getElementById('dpad-down');
const dpadLeftBtn = document.getElementById('dpad-left');
const dpadRightBtn = document.getElementById('dpad-right');

const KEY_TO_DIRECTION = {
  ArrowUp: DIRECTIONS.UP,
  ArrowDown: DIRECTIONS.DOWN,
  ArrowLeft: DIRECTIONS.LEFT,
  ArrowRight: DIRECTIONS.RIGHT,
  w: DIRECTIONS.UP,
  W: DIRECTIONS.UP,
  s: DIRECTIONS.DOWN,
  S: DIRECTIONS.DOWN,
  a: DIRECTIONS.LEFT,
  A: DIRECTIONS.LEFT,
  d: DIRECTIONS.RIGHT,
  D: DIRECTIONS.RIGHT,
};

function isValidScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function readLegacyBestScore() {
  try {
    const raw = localStorage.getItem(LEGACY_BEST_SCORE_KEY);
    if (raw === null) return 0;
    const value = Number(raw);
    return isValidScore(value) ? value : 0;
  } catch {
    return 0;
  }
}

function readBestScores() {
  const scores = { easy: 0, normal: 0, hard: 0 };

  try {
    const raw = localStorage.getItem(BEST_SCORES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(scores)) {
          if (isValidScore(parsed[key])) {
            scores[key] = parsed[key];
          }
        }
      }
    }
  } catch {
    // localStorage недоступен или содержит повреждённые данные — используем нули в памяти.
  }

  if (!scores.normal) {
    const legacy = readLegacyBestScore();
    if (legacy) {
      scores.normal = legacy;
    }
  }

  return scores;
}

function saveBestScores(scores) {
  try {
    localStorage.setItem(BEST_SCORES_KEY, JSON.stringify(scores));
  } catch {
    // localStorage недоступен (приватный режим, ограничения браузера) — просто не сохраняем.
  }
}

function currentPreset() {
  return DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY];
}

function createGameForDifficulty() {
  return createGame({
    cols: COLS,
    rows: ROWS,
    ...currentPreset(),
    levelUpEvery: 5,
    obstaclesPerLevel: 1,
    bonusEvery: 5,
    bonusPoints: 3,
  });
}

let difficulty = DIFFICULTY_PRESETS[difficultySelect.value] ? difficultySelect.value : DEFAULT_DIFFICULTY;
let bestScores = readBestScores();
let game = createGameForDifficulty();
let loopHandle = null;

function cellSize() {
  return canvas.width / COLS;
}

function drawStar(cx, cy, outerRadius, innerRadius, color) {
  const points = 5;
  const step = Math.PI / points;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * step;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function draw() {
  const size = cellSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // шахматный фон для лучшей читаемости сетки
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#182029' : '#1c2530';
      ctx.fillRect(x * size, y * size, size, size);
    }
  }

  if (game.food) {
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(
      game.food.x * size + size / 2,
      game.food.y * size + size / 2,
      size * 0.38,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  game.obstacles.forEach((obstacle) => {
    const pad = size * 0.12;
    ctx.fillStyle = '#9c27b0';
    ctx.fillRect(
      obstacle.x * size + pad,
      obstacle.y * size + pad,
      size - pad * 2,
      size - pad * 2
    );
  });

  if (game.bonus) {
    drawStar(
      game.bonus.x * size + size / 2,
      game.bonus.y * size + size / 2,
      size * 0.42,
      size * 0.18,
      '#ffd700'
    );
  }

  game.snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#4caf50' : '#66bb6a';
    const pad = 1;
    ctx.fillRect(
      segment.x * size + pad,
      segment.y * size + pad,
      size - pad * 2,
      size - pad * 2
    );
  });
}

function updateScoreboard() {
  scoreEl.textContent = String(game.score);
  levelEl.textContent = String(game.level);
  bestScoreEl.textContent = String(bestScores[difficulty]);
}

function syncPauseButton() {
  const paused = game.isPaused && game.isStarted;
  pauseBtn.textContent = paused ? 'Продолжить' : 'Пауза';
  pauseBtn.setAttribute('aria-pressed', String(paused));
}

function updateOverlay() {
  if (game.isWon) {
    overlayTextEl.textContent = `Победа! Поле заполнено. Счёт: ${game.score}`;
    overlayEl.hidden = false;
  } else if (game.isGameOver) {
    overlayTextEl.textContent = `Игра окончена. Счёт: ${game.score}`;
    overlayEl.hidden = false;
  } else if (game.isPaused && game.isStarted) {
    overlayTextEl.textContent = 'Пауза';
    overlayEl.hidden = false;
  } else {
    overlayEl.hidden = true;
  }

  syncPauseButton();
}

function stopLoop() {
  if (loopHandle !== null) {
    clearTimeout(loopHandle);
    loopHandle = null;
  }
}

function scheduleNextTick() {
  stopLoop();
  loopHandle = setTimeout(tick, game.speedMs);
}

function tick() {
  const result = step(game);
  draw();
  updateScoreboard();
  updateOverlay();

  if (result.gameOver || result.gameWon) {
    if (game.score > bestScores[difficulty]) {
      bestScores[difficulty] = game.score;
      saveBestScores(bestScores);
      updateScoreboard();
    }
    stopLoop();
    return;
  }

  if (game.isStarted && !game.isPaused) {
    scheduleNextTick();
  }
}

function handleStart() {
  if (game.isGameOver || game.isWon) return;
  if (!game.isStarted) {
    startGame(game);
    updateOverlay();
    scheduleNextTick();
  } else if (game.isPaused) {
    togglePause(game);
    updateOverlay();
    scheduleNextTick();
  }
}

function handlePause() {
  if (!game.isStarted || game.isGameOver || game.isWon) return;
  togglePause(game);
  updateOverlay();
  if (game.isPaused) {
    stopLoop();
  } else {
    scheduleNextTick();
  }
}

function handleNewGame() {
  stopLoop();
  game = createGameForDifficulty();
  draw();
  updateScoreboard();
  updateOverlay();
}

function handleDifficultyChange() {
  difficulty = DIFFICULTY_PRESETS[difficultySelect.value] ? difficultySelect.value : DEFAULT_DIFFICULTY;
  handleNewGame();
}

function handleDirectionInput(direction) {
  changeDirection(game, direction);
}

window.addEventListener('keydown', (event) => {
  const direction = KEY_TO_DIRECTION[event.key];
  if (direction) {
    event.preventDefault();
    handleDirectionInput(direction);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handleStart();
    return;
  }

  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault();
    handleNewGame();
  }
});

startBtn.addEventListener('click', handleStart);
pauseBtn.addEventListener('click', handlePause);
newGameBtn.addEventListener('click', handleNewGame);
difficultySelect.addEventListener('change', handleDifficultyChange);
dpadUpBtn.addEventListener('click', () => handleDirectionInput(DIRECTIONS.UP));
dpadDownBtn.addEventListener('click', () => handleDirectionInput(DIRECTIONS.DOWN));
dpadLeftBtn.addEventListener('click', () => handleDirectionInput(DIRECTIONS.LEFT));
dpadRightBtn.addEventListener('click', () => handleDirectionInput(DIRECTIONS.RIGHT));

// Свайпы для мобильных устройств
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 24;

canvas.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  },
  { passive: true }
);

canvas.addEventListener(
  'touchend',
  (event) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      handleDirectionInput(dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
    } else {
      handleDirectionInput(dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
    }
  },
  { passive: true }
);

draw();
updateScoreboard();
updateOverlay();
