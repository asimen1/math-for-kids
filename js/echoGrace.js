// Learns how long after the app stops talking its own words can still arrive from the
// recognizer (results lag behind the audio, more so on slow networks). The grace is the
// longest recent delay plus a margin, kept within [min, max] and remembered on the device.

const STORAGE_KEY = 'showerMath.echoGraceMs';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class EchoGrace {
  constructor({
    initial = 2500, min = 1000, max = 5000, margin = 500, samples = 10, storage = defaultStorage(),
  } = {}) {
    this.min = min;
    this.max = max;
    this.margin = margin;
    this.samples = samples;
    this.storage = storage;
    this.delays = [];
    this.fallback = this.clamp(this.load() ?? initial);
  }

  clamp(ms) {
    return Math.min(this.max, Math.max(this.min, Math.round(ms)));
  }

  get ms() {
    if (!this.delays.length) return this.fallback;
    return this.clamp(Math.max(...this.delays) + this.margin);
  }

  // delayMs: time from the end of the app's speech to a result that still contained it.
  observe(delayMs) {
    if (!(delayMs >= 0)) return;
    this.delays.push(Math.min(delayMs, this.max));
    if (this.delays.length > this.samples) this.delays.shift();
    this.save(this.ms);
  }

  load() {
    try {
      const v = Number(this.storage?.getItem(STORAGE_KEY));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  save(ms) {
    try {
      this.storage?.setItem(STORAGE_KEY, String(ms));
    } catch { /* storage unavailable */ }
  }
}
