import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  step,
  changeDirection,
  startGame,
  togglePause,
  DIRECTIONS,
  placeFood,
} from '../src/game.js';

function makeGame(overrides = {}) {
  const game = createGame({ cols: 10, rows: 10, random: () => 0, ...overrides });
  startGame(game);
  return game;
}

describe('createGame', () => {
  test('создаёт змейку из трёх сегментов, движущуюся вправо', () => {
    const game = createGame({ cols: 10, rows: 10, random: () => 0 });
    assert.equal(game.snake.length, 3);
    assert.deepEqual(game.snake, [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]);
    assert.deepEqual(game.direction, DIRECTIONS.RIGHT);
    assert.equal(game.score, 0);
    assert.equal(game.isGameOver, false);
  });

  test('размещает еду не на теле змейки', () => {
    const game = createGame({ cols: 10, rows: 10, random: () => 0 });
    const onSnake = game.snake.some(
      (seg) => seg.x === game.food.x && seg.y === game.food.y
    );
    assert.equal(onSnake, false);
  });

  test('создаёт заданное количество препятствий, не пересекающихся со змейкой и едой', () => {
    const game = createGame({
      cols: 10,
      rows: 10,
      random: () => 0,
      initialObstacleCount: 2,
    });

    assert.equal(game.obstacles.length, 2);

    for (const obstacle of game.obstacles) {
      const onSnake = game.snake.some(
        (seg) => seg.x === obstacle.x && seg.y === obstacle.y
      );
      assert.equal(onSnake, false);

      const onFood = obstacle.x === game.food.x && obstacle.y === game.food.y;
      assert.equal(onFood, false);
    }
  });
});

describe('движение', () => {
  test('шаг без смены направления двигает змейку на одну клетку вправо', () => {
    const game = makeGame();
    const head = { ...game.snake[0] };
    step(game);
    assert.equal(game.snake[0].x, head.x + 1);
    assert.equal(game.snake[0].y, head.y);
    assert.equal(game.snake.length, 3);
  });

  test('смена направления применяется на следующем шаге', () => {
    const game = makeGame();
    changeDirection(game, DIRECTIONS.UP);
    const head = { ...game.snake[0] };
    step(game);
    assert.deepEqual(game.snake[0], { x: head.x, y: head.y - 1 });
  });

  test('разворот на 180 градусов игнорируется', () => {
    const game = makeGame();
    changeDirection(game, DIRECTIONS.LEFT);
    assert.deepEqual(game.pendingDirection, DIRECTIONS.RIGHT);
  });

  test('шаг ничего не делает, пока игра на паузе', () => {
    const game = makeGame();
    togglePause(game);
    const before = JSON.stringify(game.snake);
    step(game);
    assert.equal(JSON.stringify(game.snake), before);
  });

  test('шаг ничего не делает, пока игра не запущена', () => {
    const game = createGame({ cols: 10, rows: 10, random: () => 0 });
    const before = JSON.stringify(game.snake);
    step(game);
    assert.equal(JSON.stringify(game.snake), before);
  });
});

describe('еда и рост', () => {
  test('съедание еды увеличивает счёт и длину змейки', () => {
    const game = makeGame();
    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };
    const lengthBefore = game.snake.length;

    const result = step(game);

    assert.equal(result.ateFood, true);
    assert.equal(game.score, 1);
    assert.equal(game.snake.length, lengthBefore + 1);
  });

  test('съедание бонуса даёт очки без роста змейки и убирает бонус', () => {
    const game = makeGame({ bonusPoints: 3 });
    const head = game.snake[0];
    game.bonus = { x: head.x + 1, y: head.y };
    game.food = { x: head.x + 5, y: head.y + 5 };
    const lengthBefore = game.snake.length;

    const result = step(game);

    assert.equal(result.ateBonus, true);
    assert.equal(game.score, 3);
    assert.equal(game.snake.length, lengthBefore);
    assert.equal(game.bonus, null);
  });

  test('съедание еды при bonusEvery 1 создаёт бонус, не пересекающийся со змейкой и новой едой', () => {
    const game = makeGame({ bonusEvery: 1 });
    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };

    step(game);

    assert.notEqual(game.bonus, null);

    const bonusOnSnake = game.snake.some(
      (seg) => seg.x === game.bonus.x && seg.y === game.bonus.y
    );
    assert.equal(bonusOnSnake, false);

    const bonusOnFood =
      game.food !== null &&
      game.bonus.x === game.food.x &&
      game.bonus.y === game.food.y;
    assert.equal(bonusOnFood, false);
  });

  test('без еды длина змейки не меняется', () => {
    const game = makeGame();
    const lengthBefore = game.snake.length;
    game.food = { x: game.snake[0].x + 5, y: game.snake[0].y + 5 };

    const result = step(game);

    assert.equal(result.ateFood, false);
    assert.equal(game.snake.length, lengthBefore);
  });

  test('скорость увеличивается после съедания еды', () => {
    const game = makeGame({ initialSpeedMs: 140, minSpeedMs: 60, speedStepMs: 4, speedUpEvery: 1 });
    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };
    step(game);
    assert.equal(game.speedMs, 136);
  });

  test('скорость не опускается ниже минимальной', () => {
    const game = makeGame({ initialSpeedMs: 62, minSpeedMs: 60, speedStepMs: 4, speedUpEvery: 1 });
    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };
    step(game);
    assert.equal(game.speedMs, 60);
  });

  test('placeFood возвращает null, когда свободных клеток нет', () => {
    const game = createGame({ cols: 2, rows: 1, random: () => 0 });
    game.snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const food = placeFood(game);
    assert.equal(food, null);
  });

  test('съедание последней свободной клетки завершает игру победой', () => {
    const game = createGame({ cols: 4, rows: 1, random: () => 0 });
    startGame(game);
    game.food = { x: 3, y: 0 };

    const result = step(game);

    assert.equal(result.gameWon, true);
    assert.equal(game.isWon, true);
    assert.equal(game.food, null);
  });
});

describe('уровень', () => {
  test('уровень повышается после каждых levelUpEvery съеденных еды', () => {
    const game = makeGame({ levelUpEvery: 2 });

    const head1 = game.snake[0];
    game.food = { x: head1.x + 1, y: head1.y };
    step(game);
    assert.equal(game.level, 1);

    const head2 = game.snake[0];
    game.food = { x: head2.x + 1, y: head2.y };
    step(game);
    assert.equal(game.level, 2);
  });

  test('повышение уровня добавляет препятствие, не пересекающееся с новой едой', () => {
    const game = makeGame({ levelUpEvery: 1, obstaclesPerLevel: 1 });
    assert.equal(game.obstacles.length, 0);

    const head = game.snake[0];
    game.food = { x: head.x + 1, y: head.y };

    step(game);

    assert.equal(game.level, 2);
    assert.equal(game.obstacles.length, 1);

    const overlapsFood = game.obstacles.some(
      (obstacle) => obstacle.x === game.food.x && obstacle.y === game.food.y
    );
    assert.equal(overlapsFood, false);
  });

  test('повышение уровня от бонуса тоже добавляет препятствие, не пересекающееся с едой', () => {
    const game = makeGame({
      levelUpEvery: 5,
      obstaclesPerLevel: 1,
      bonusPoints: 3,
      initialObstacleCount: 0,
    });
    game.score = 4;
    game.level = 1;
    game.obstacles = [];

    const head = game.snake[0];
    game.bonus = { x: head.x + 1, y: head.y };
    game.food = { x: head.x + 5, y: head.y + 5 };

    step(game);

    assert.equal(game.score, 7);
    assert.equal(game.level, 2);
    assert.equal(game.obstacles.length, 1);

    const overlapsFood = game.obstacles.some(
      (obstacle) => obstacle.x === game.food.x && obstacle.y === game.food.y
    );
    assert.equal(overlapsFood, false);
  });
});

describe('столкновения', () => {
  test('столкновение со стеной справа завершает игру', () => {
    const game = makeGame({ cols: 5, rows: 5 });
    game.snake = [{ x: 4, y: 2 }];
    game.food = { x: 0, y: 0 };
    const result = step(game);
    assert.equal(result.gameOver, true);
    assert.equal(game.isGameOver, true);
  });

  test('столкновение со стеной слева завершает игру', () => {
    const game = makeGame({ cols: 5, rows: 5 });
    changeDirection(game, DIRECTIONS.LEFT);
    game.direction = DIRECTIONS.LEFT;
    game.pendingDirection = DIRECTIONS.LEFT;
    game.snake = [{ x: 0, y: 2 }];
    game.food = { x: 4, y: 4 };
    const result = step(game);
    assert.equal(result.gameOver, true);
  });

  test('столкновение с верхней и нижней стеной завершает игру', () => {
    const top = makeGame({ cols: 5, rows: 5 });
    top.direction = DIRECTIONS.UP;
    top.pendingDirection = DIRECTIONS.UP;
    top.snake = [{ x: 2, y: 0 }];
    top.food = { x: 4, y: 4 };
    assert.equal(step(top).gameOver, true);

    const bottom = makeGame({ cols: 5, rows: 5 });
    bottom.direction = DIRECTIONS.DOWN;
    bottom.pendingDirection = DIRECTIONS.DOWN;
    bottom.snake = [{ x: 2, y: 4 }];
    bottom.food = { x: 0, y: 0 };
    assert.equal(step(bottom).gameOver, true);
  });

  test('столкновение с собственным хвостом завершает игру', () => {
    const game = makeGame({ cols: 10, rows: 10 });
    // U-образная змейка: голова пойдёт вниз и врежется в сегмент под собой.
    game.snake = [
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ];
    game.direction = DIRECTIONS.UP;
    game.pendingDirection = DIRECTIONS.DOWN;
    game.food = { x: 9, y: 9 };

    const result = step(game);
    assert.equal(result.gameOver, true);
    assert.equal(game.isGameOver, true);
  });

  test('движение хвостом в клетку, которую он только что покинул, не считается столкновением', () => {
    const game = makeGame({ cols: 10, rows: 10 });
    game.food = { x: 9, y: 9 };
    const result = step(game);
    assert.equal(result.gameOver, false);
  });

  test('столкновение с препятствием завершает игру', () => {
    const game = makeGame({ cols: 10, rows: 10 });
    const head = game.snake[0];
    game.obstacles = [{ x: head.x + 1, y: head.y }];
    game.food = { x: 9, y: 9 };

    const result = step(game);

    assert.equal(result.gameOver, true);
    assert.equal(game.isGameOver, true);
  });

  test('после game over повторный шаг не меняет состояние', () => {
    const game = makeGame({ cols: 5, rows: 5 });
    game.snake = [{ x: 4, y: 2 }];
    game.food = { x: 0, y: 0 };
    step(game);
    assert.equal(game.isGameOver, true);
    const snapshot = JSON.stringify(game.snake);
    step(game);
    assert.equal(JSON.stringify(game.snake), snapshot);
  });
});

describe('пауза и старт', () => {
  test('togglePause переключает состояние паузы после старта', () => {
    const game = makeGame();
    assert.equal(game.isPaused, false);
    togglePause(game);
    assert.equal(game.isPaused, true);
    togglePause(game);
    assert.equal(game.isPaused, false);
  });

  test('togglePause не действует до старта игры', () => {
    const game = createGame({ cols: 10, rows: 10, random: () => 0 });
    togglePause(game);
    assert.equal(game.isPaused, false);
  });
});
