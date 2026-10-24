// Hebrew text-to-speech and a self-restarting speech recognition loop.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasTTS = 'speechSynthesis' in window;

let heVoice = null;
let speechRate = 0.7;

export function setSpeechRate(rate) {
  speechRate = rate;
}

function pickVoice() {
  heVoice = speechSynthesis.getVoices().find((v) => /^(he|iw)([-_]|$)/i.test(v.lang)) || null;
  return heVoice;
}

// Resolves with the Hebrew voice, or null if none shows up within 2 seconds.
export function initVoices() {
  return new Promise((resolve) => {
    if (!hasTTS) return resolve(null);
    if (pickVoice()) return resolve(heVoice);
    const done = () => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(heVoice);
    };
    const onChange = () => pickVoice() && done();
    const timer = setTimeout(() => { pickVoice(); done(); }, 2000);
    speechSynthesis.addEventListener('voiceschanged', onChange);
  });
}

let finishCurrent = null;

// Resolves when the utterance ends, is cancelled, or a safety timeout passes
// (Chrome sometimes never fires onend).
export function speak(text) {
  if (!hasTTS) return Promise.resolve();
  cancelSpeech();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'he-IL';
    if (heVoice) u.voice = heVoice;
    u.rate = speechRate;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (finishCurrent === finish) finishCurrent = null;
      resolve();
    };
    const timer = setTimeout(finish, 3000 + text.length * 250);
    u.onend = finish;
    u.onerror = finish;
    finishCurrent = finish;
    speechSynthesis.resume();
    speechSynthesis.speak(u);
  });
}

export function cancelSpeech() {
  if (!hasTTS) return;
  const finish = finishCurrent;
  finishCurrent = null;
  speechSynthesis.cancel();
  finish?.();
}

// Asks for microphone permission up front, so the prompt doesn't pop up mid-game.
export async function ensureMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

// Android ends recognition after each phrase or a few seconds of silence, so this
// restarts it for as long as it's active.
export class Listener {
  static supported = !!SR;

  constructor({ onResult, onError = () => {}, onListening = () => {} }) {
    this.onResult = onResult;
    this.onError = onError;
    this.onListening = onListening;
    this.active = false;
    this.running = false;
    this.rec = null;
    this.restartTimer = null;
    this.sessionError = null;
  }

  create() {
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.onstart = () => {
      this.sessionError = null;
      this.onListening(true);
    };
    rec.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      if (!result.isFinal) return;
      const alternatives = Array.from(result, (a) => a.transcript.trim()).filter(Boolean);
      if (alternatives.length) this.onResult(alternatives);
    };
    rec.onerror = (e) => {
      this.sessionError = e.error;
      if (['not-allowed', 'service-not-allowed', 'language-not-supported'].includes(e.error)) {
        this.active = false;
        this.onError(e.error);
      } else if (e.error === 'network') {
        this.onError(e.error);
      }
    };
    rec.onend = () => {
      this.running = false;
      this.onListening(false);
      if (this.active) this.scheduleStart(this.sessionError === 'network' ? 3000 : 250);
    };
    return rec;
  }

  start() {
    if (!SR) return;
    this.active = true;
    if (!this.running) this.scheduleStart(0);
  }

  scheduleStart(delay) {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      if (!this.active || this.running) return;
      this.rec ??= this.create();
      try {
        this.rec.start();
        this.running = true;
      } catch {
        this.scheduleStart(1000);
      }
    }, delay);
  }

  stop() {
    this.active = false;
    clearTimeout(this.restartTimer);
    if (this.rec && this.running) {
      try { this.rec.abort(); } catch { /* already stopped */ }
    }
  }
}
