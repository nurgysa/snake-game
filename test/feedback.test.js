import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackForResult } from '../src/feedback.js';

test('gameWon takes precedence and maps to win', () => {
  assert.equal(
    feedbackForResult({ gameWon: true, gameOver: true, ateBonus: true, ateFood: true }),
    'win'
  );
});

test('gameOver maps to gameOver', () => {
  assert.equal(feedbackForResult({ gameOver: true }), 'gameOver');
});

test('ateBonus maps to bonus', () => {
  assert.equal(feedbackForResult({ ateBonus: true }), 'bonus');
});

test('ateFood maps to food', () => {
  assert.equal(feedbackForResult({ ateFood: true }), 'food');
});

test('empty result maps to null', () => {
  assert.equal(feedbackForResult({}), null);
});
