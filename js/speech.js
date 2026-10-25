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
// restarts it right away for as long as it's active. Results are reported while the
// child is still talking (final: false) so a correct answer is caught as early as possible.
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
    this.session = 0;
    this.startedAt = 0;
  }

  create() {
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 10;
    rec.onstart = () => {
      this.sessionError = null;
      this.onListening(true);
    };
    // Each alternative is the whole phrase so far: earlier segments' best guess plus
    // one of the latest segment's alternatives.
    rec.onresult = (e) => {
      const results = Array.from(e.results);
      const last = results[results.length - 1];
      const before = results.slice(0, -1).map((r) => r[0].transcript).join(' ');
      const alternatives = Array.from(last, (a) => `${before} ${a.transcript}`.trim()).filter(Boolean);
      if (alternatives.length) {
        this.onResult({
          alternatives, final: last.isFinal, session: this.session, startedAt: this.startedAt,
        });
      }
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
      if (this.active) this.scheduleStart(this.sessionError === 'network' ? 3000 : 30);
    };
    return rec;
  }

  start() {
    if (!SR) return;
    this.active = true;
    if (!this.running) this.startNow();
  }

  startNow() {
    clearTimeout(this.restartTimer);
    if (!this.active || this.running) return;
    this.rec ??= this.create();
    try {
      this.rec.start();
      this.running = true;
      this.session++;
      this.startedAt = performance.now();
    } catch {
      this.scheduleStart(500);
    }
  }

  scheduleStart(delay) {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.startNow(), delay);
  }

  stop() {
    this.active = false;
    clearTimeout(this.restartTimer);
    if (this.rec && this.running) {
      try { this.rec.abort(); } catch { /* already stopped */ }
    }
  }
}
