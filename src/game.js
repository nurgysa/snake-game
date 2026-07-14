// Чистая игровая логика «Змейки» — без обращений к DOM.
// Всё, что нужно для рендеринга и ввода, вынесено наружу через параметры и возвращаемое состояние.

export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * Создаёт стартовое состояние игры.
 * @param {object} options
 * @param {number} options.cols - количество клеток по горизонтали
 * @param {number} options.rows - количество клеток по вертикали
 * @param {() => number} [options.random] - генератор случайных чисел [0, 1), для тестов подменяется
 * @param {number} [options.initialSpeedMs] - начальная задержка между шагами (мс)
 * @param {number} [options.minSpeedMs] - минимальная задержка между шагами (мс)
 * @param {number} [options.speedStepMs] - на сколько мс ускоряемся за каждое яблоко
 * @param {number} [options.speedUpEvery] - раз в сколько съеденных яблок ускоряемся
 * @param {number} [options.initialObstacleCount] - количество препятствий, создаваемых при старте
 * @param {number} [options.obstaclesPerLevel] - количество препятствий, добавляемых за каждый пройденный уровень
 */
export function createGame(options = {}) {
  const cols = options.cols ?? 20;
  const rows = options.rows ?? 20;
  const random = options.random ?? Math.random;
  const initialSpeedMs = options.initialSpeedMs ?? 140;
  const minSpeedMs = options.minSpeedMs ?? 60;
  const speedStepMs = options.speedStepMs ?? 4;
  const speedUpEvery = options.speedUpEvery ?? 1;
  const levelUpEvery = options.levelUpEvery ?? 5;
  const initialObstacleCount = options.initialObstacleCount ?? 0;
  const obstaclesPerLevel = options.obstaclesPerLevel ?? 1;
  const bonusPoints = options.bonusPoints ?? 3;
  const bonusEvery = options.bonusEvery ?? 5;

  const startX = Math.floor(cols / 2);
  const startY = Math.floor(rows / 2);

  const state = {
    cols,
    rows,
    random,
    initialSpeedMs,
    minSpeedMs,
    speedStepMs,
    speedUpEvery,
    levelUpEvery,
    obstaclesPerLevel,
    bonusPoints,
    bonusEvery,
    foodEaten: 0,
    level: 1,
    snake: [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ],
    direction: DIRECTIONS.RIGHT,
    pendingDirection: DIRECTIONS.RIGHT,
    food: null,
    bonus: null,
    obstacles: [],
    score: 0,
    speedMs: initialSpeedMs,
    isGameOver: false,
    isWon: false,
    isPaused: false,
    isStarted: false,
  };

  for (let i = 0; i < initialObstacleCount; i++) {
    const obstacle = placeFood(state);
    if (obstacle === null) break;
    state.obstacles.push(obstacle);
  }

  state.food = placeFood(state);

  return state;
}

/**
 * Размещает еду в случайной свободной клетке, не занятой змейкой, препятствиями или бонусом.
 */
export function placeFood(state) {
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const onSnake = state.snake.some((seg) => seg.x === x && seg.y === y);
      const onObstacle = state.obstacles.some((obs) => obs.x === x && obs.y === y);
      const onFood = state.food !== null && state.food !== undefined && samePoint(state.food, { x, y });
      const onBonus = state.bonus !== null && state.bonus !== undefined && samePoint(state.bonus, { x, y });
      if (!onSnake && !onObstacle && !onFood && !onBonus) free.push({ x, y });
    }
  }
  if (free.length === 0) {
    return null;
  }
  const index = Math.floor(state.random() * free.length);
  return free[Math.max(0, Math.min(index, free.length - 1))];
}

/**
 * Размещает бонус в случайной свободной клетке, не занятой змейкой, препятствиями или едой.
 */
function placeBonus(state) {
  const free = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const onSnake = state.snake.some((seg) => seg.x === x && seg.y === y);
      const onObstacle = state.obstacles.some((obs) => obs.x === x && obs.y === y);
      const onFood = state.food !== null && state.food !== undefined && samePoint(state.food, { x, y });
      if (!onSnake && !onObstacle && !onFood) free.push({ x, y });
    }
  }
  if (free.length === 0) {
    return null;
  }
  const index = Math.floor(state.random() * free.length);
  return free[Math.max(0, Math.min(index, free.length - 1))];
}

/**
 * Запрашивает смену направления. Разворот на 180 градусов игнорируется.
 * Применяется не сразу, а на следующем шаге, чтобы не потерять быстрые нажатия.
 */
export function changeDirection(state, direction) {
  if (!direction) return state;
  if (isOpposite(direction, state.direction)) return state;
  state.pendingDirection = direction;
  return state;
}

/**
 * Выполняет один шаг игры: двигает змейку, проверяет столкновения и еду.
 * Возвращает объект { state, ateFood, gameOver } для удобства тестирования.
 */
export function step(state) {
  if (state.isGameOver || state.isWon || state.isPaused || !state.isStarted) {
    return { state, ateFood: false, ateBonus: false, gameOver: state.isGameOver, gameWon: state.isWon };
  }

  state.direction = state.pendingDirection;

  const head = state.snake[0];
  const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  const hitWall =
    newHead.x < 0 || newHead.x >= state.cols || newHead.y < 0 || newHead.y >= state.rows;

  if (hitWall) {
    state.isGameOver = true;
    return { state, ateFood: false, ateBonus: false, gameOver: true, gameWon: false };
  }

  const hitObstacle = state.obstacles.some((obs) => samePoint(obs, newHead));

  if (hitObstacle) {
    state.isGameOver = true;
    return { state, ateFood: false, ateBonus: false, gameOver: true, gameWon: false };
  }

  const willEat = state.food && samePoint(newHead, state.food);
  const willEatBonus = state.bonus && samePoint(newHead, state.bonus);

  const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((seg) => samePoint(seg, newHead));

  if (hitSelf) {
    state.isGameOver = true;
    return { state, ateFood: false, ateBonus: false, gameOver: true, gameWon: false };
  }

  state.snake.unshift(newHead);

  let ateFood = false;
  let ateBonus = false;
  let gameWon = false;
  if (willEatBonus) {
    ateBonus = true;
    const previousLevel = state.level;
    state.score += state.bonusPoints;
    state.level = Math.floor(state.score / state.levelUpEvery) + 1;
    state.bonus = null;
    state.snake.pop();
    const levelsGained = state.level - previousLevel;
    const obstaclesToAdd = levelsGained * state.obstaclesPerLevel;
    for (let i = 0; i < obstaclesToAdd; i++) {
      const obstacle = placeFood(state);
      if (obstacle === null) break;
      state.obstacles.push(obstacle);
    }
  } else if (willEat) {
    ateFood = true;
    state.score += 1;
    state.foodEaten += 1;
    const previousLevel = state.level;
    state.level = Math.floor(state.score / state.levelUpEvery) + 1;
    if (state.score % state.speedUpEvery === 0) {
      state.speedMs = Math.max(state.minSpeedMs, state.speedMs - state.speedStepMs);
    }
    state.food = placeFood(state);
    if (state.food === null) {
      state.isWon = true;
      gameWon = true;
    }
    if (!state.isWon) {
      const levelsGained = state.level - previousLevel;
      const obstaclesToAdd = levelsGained * state.obstaclesPerLevel;
      for (let i = 0; i < obstaclesToAdd; i++) {
        const obstacle = placeFood(state);
        if (obstacle === null) break;
        state.obstacles.push(obstacle);
      }
    }
    if (
      !state.isWon &&
      state.bonusEvery > 0 &&
      state.foodEaten % state.bonusEvery === 0 &&
      !state.bonus
    ) {
      state.bonus = placeBonus(state);
    }
  } else {
    state.snake.pop();
  }

  return { state, ateFood, ateBonus, gameOver: false, gameWon };
}

export function startGame(state) {
  state.isStarted = true;
  state.isPaused = false;
  return state;
}

export function togglePause(state) {
  if (!state.isStarted || state.isGameOver) return state;
  state.isPaused = !state.isPaused;
  return state;
}
