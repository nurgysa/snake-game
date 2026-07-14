export function feedbackForResult(result = {}) {
  if (result.gameWon) return 'win';
  if (result.gameOver) return 'gameOver';
  if (result.ateBonus) return 'bonus';
  if (result.ateFood) return 'food';
  return null;
}
