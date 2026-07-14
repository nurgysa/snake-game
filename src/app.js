import { createGame, step, changeDirection, startGame, togglePause, DIRECTIONS } from './game.js';
import { feedbackForResult } from './feedback.js';
import { createSoundPlayer } from './sound.js';

const COLS = 20;
const ROWS = 20;
const BEST_SCORES_KEY = 'snake-best-scores';
const LEGACY_BEST_SCORE_KEY = 'snake-best-score';
const SOUND_ENABLED_KEY = 'snake-sound-enabled';
const DEFAULT_DIFFICULTY = 'normal';
const EFFECT_DURATION_MS = 360;

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
const soundBtn = document.getElementById('sound-btn');
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

function readSoundEnabled() {
  try {
    const raw = localStorage.getItem(SOUND_ENABLED_KEY);
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return true;
  } catch {
    return true;
  }
}

function saveSoundEnabled(value) {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(value));
  } catch {
    // localStorage недоступен — просто не сохраняем предпочтение.
  }
}

function prefersReducedMotion() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
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
let soundEnabled = readSoundEnabled();
let effects = [];
const reducedMotion = prefersReducedMotion();
const soundPlayer = createSoundPlayer({ enabled: soundEnabled });

function cellSize() {
  return canvas.width / COLS;
}

function drawStar(cx, cy, outerRadius, innerRadius, color, rotation = 0) {
  const points = 5;
  const step = Math.PI / points;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * step + rotation;
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

function addEffect(type, x, y, timestamp) {
  if (reducedMotion) return;
  effects.push({ type, x, y, start: timestamp });
}

function drawEffect(effect, timestamp) {
  const elapsed = timestamp - effect.start;
  if (elapsed < 0 || elapsed > EFFECT_DURATION_MS) return;

  const size = cellSize();
  const progress = elapsed / EFFECT_DURATION_MS;
  const cx = effect.x * size + size / 2;
  const cy = effect.y * size + size / 2;
  const radius = size * (0.4 + progress * 0.9);
  const alpha = 1 - progress;
  const color = effect.type === 'bonus' ? '255, 215, 0' : '255, 82, 82';

  ctx.save();
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = Math.max(1, size * 0.06 * (1 - progress * 0.5));
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function draw(timestamp = performance.now()) {
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
    const pulse = reducedMotion ? 1 : 1 + Math.sin(timestamp / 220) * 0.08;
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(
      game.food.x * size + size / 2,
      game.food.y * size + size / 2,
      size * 0.38 * pulse,
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
    const rotation = reducedMotion ? 0 : (timestamp / 1400) % (Math.PI * 2);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(timestamp / 260) * 0.1;
    drawStar(
      game.bonus.x * size + size / 2,
      game.bonus.y * size + size / 2,
      size * 0.42 * pulse,
      size * 0.18 * pulse,
      '#ffd700',
      rotation
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

  effects.forEach((effect) => drawEffect(effect, timestamp));
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

function syncSoundButton() {
  soundBtn.textContent = soundEnabled ? 'Звук: вкл' : 'Звук: выкл';
  soundBtn.setAttribute('aria-pressed', String(soundEnabled));
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
  const feedback = feedbackForResult(result);
  if (feedback) {
    soundPlayer.play(feedback);
    if (!reducedMotion && (feedback === 'food' || feedback === 'bonus')) {
      const head = game.snake[0];
      addEffect(feedback, head.x, head.y, performance.now());
    }
  }
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
  if (soundEnabled) {
    soundPlayer.unlock().catch(() => {});
  }
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

function handleSoundToggle() {
  soundEnabled = !soundEnabled;
  soundPlayer.setEnabled(soundEnabled);
  saveSoundEnabled(soundEnabled);
  syncSoundButton();
  if (soundEnabled) {
    soundPlayer.unlock().catch(() => {});
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
soundBtn.addEventListener('click', handleSoundToggle);
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

function renderFrame(timestamp) {
  effects = effects.filter((effect) => timestamp - effect.start < EFFECT_DURATION_MS);
  draw(timestamp);
  requestAnimationFrame(renderFrame);
}

syncSoundButton();
draw();
updateScoreboard();
updateOverlay();
if (!reducedMotion) {
  requestAnimationFrame(renderFrame);
}
