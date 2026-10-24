// Feedback tones generated with Web Audio (no audio files). Plays through the active
// media output, so a connected Bluetooth speaker gets them too.

let ctx = null;

// Must be called from a user tap (mobile browsers block audio until then).
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, start, dur, { type = 'sine', gain = 0.3, endFreq } = {}) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const wait = (sec) => new Promise((r) => setTimeout(r, sec * 1000));

export function playCorrect() {
  if (!ctx) return Promise.resolve();
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(f, i * 0.09, 0.3, { type: 'triangle', gain: 0.4 }));
  return wait(0.6);
}

export function playWrong() {
  if (!ctx) return Promise.resolve();
  tone(220, 0, 0.22, { type: 'square', gain: 0.15 });
  tone(160, 0.25, 0.4, { type: 'square', gain: 0.15 });
  return wait(0.7);
}

export function playTick(last = false) {
  if (!ctx) return;
  // Square wave plus an octave sine: much louder perceived than a plain sine, without clipping.
  const freq = last ? 1320 : 880;
  const dur = last ? 0.3 : 0.15;
  tone(freq, 0, dur, { type: 'square', gain: 0.5 });
  tone(freq * 2, 0, dur, { gain: 0.4 });
}

export function playTimeout() {
  if (!ctx) return Promise.resolve();
  tone(700, 0, 0.8, { type: 'sawtooth', gain: 0.15, endFreq: 160 });
  return wait(0.9);
}
