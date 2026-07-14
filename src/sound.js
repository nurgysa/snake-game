// Синтез звуковых эффектов через Web Audio API — без внешних файлов и сети.

function playTone(ctx, { freq, duration, type = 'sine', gain = 0.15, delay = 0 }) {
  const startAt = ctx.currentTime + delay;
  const stopAt = startAt + duration;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  osc.connect(gainNode).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(stopAt + 0.02);
}

const EVENT_CUES = {
  food: (ctx) => {
    playTone(ctx, { freq: 660, duration: 0.1, type: 'sine', gain: 0.14 });
  },
  bonus: (ctx) => {
    playTone(ctx, { freq: 880, duration: 0.1, type: 'triangle', gain: 0.15 });
    playTone(ctx, { freq: 1320, duration: 0.14, type: 'triangle', gain: 0.13, delay: 0.08 });
  },
  gameOver: (ctx) => {
    playTone(ctx, { freq: 220, duration: 0.22, type: 'sawtooth', gain: 0.12 });
    playTone(ctx, { freq: 150, duration: 0.32, type: 'sawtooth', gain: 0.12, delay: 0.15 });
  },
  win: (ctx) => {
    playTone(ctx, { freq: 523.25, duration: 0.12, type: 'sine', gain: 0.15 });
    playTone(ctx, { freq: 659.25, duration: 0.12, type: 'sine', gain: 0.15, delay: 0.12 });
    playTone(ctx, { freq: 783.99, duration: 0.2, type: 'sine', gain: 0.15, delay: 0.24 });
  },
};

/**
 * Создаёт проигрыватель звуковых эффектов на синтезированных сигналах Web Audio API.
 * AudioContext создаётся лениво внутри unlock(), а не при импорте модуля.
 */
export function createSoundPlayer({ enabled = true } = {}) {
  let ctx = null;
  let isEnabled = Boolean(enabled);

  function unlock() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return Promise.resolve();
      try {
        ctx = new AudioContextClass();
      } catch {
        ctx = null;
        return Promise.resolve();
      }
    }

    if (ctx.state === 'suspended') {
      return ctx.resume().catch(() => {});
    }

    return Promise.resolve();
  }

  function setEnabled(value) {
    isEnabled = Boolean(value);
  }

  function play(eventName) {
    if (!isEnabled) return;
    if (!ctx || ctx.state !== 'running') return;

    const cue = EVENT_CUES[eventName];
    if (!cue) return;

    try {
      cue(ctx);
    } catch {
      // Синтез звука не должен ломать игровой процесс.
    }
  }

  return { unlock, setEnabled, play };
}
