// Game loop: ask → wait for an answer (voice or keypad) → feedback → next.
// Every transition bumps `seq`; async steps check it so stale continuations stop.

import { generateProblem } from './generator.js';
import { parseNumber } from './hebrewNumbers.js';
import { parseCommand } from './commands.js';
import { speak, cancelSpeech } from './speech.js';
import * as sounds from './sounds.js';

const PRAISE = ['כל הכבוד!', 'מצוין!', 'נכון מאוד!', 'יפה מאוד!', 'בדיוק!', 'אלופים!'];
const TICK_FROM_SEC = 5;
const MAX_DIGITS = 7;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  // config: { ops: [{ id, min, max }], timerSeconds: number|null, voiceInput: boolean }
  constructor(config, ui, listener) {
    this.config = config;
    this.ui = ui;
    this.listener = listener;
    this.timerMs = config.timerSeconds ? config.timerSeconds * 1000 : 0;
    this.seq = 0;
    this.state = 'idle'; // idle | speaking | waiting | feedback | paused
    this.problem = null;
    this.done = false; // current problem already answered / revealed
    this.typed = '';
    this.score = 0;
    this.streak = 0;
    this.remaining = 0;
    this.timerId = null;
    this.lastTick = null;
  }

  start() {
    this.ui.setScore(0, 0);
    this.next();
  }

  stop() {
    this.seq++;
    this.state = 'idle';
    this.stopTimer();
    this.listener.stop();
    cancelSpeech();
  }

  next() {
    this.problem = generateProblem(this.config.ops, this.problem);
    this.done = false;
    this.remaining = this.timerMs;
    this.lastTick = null;
    this.setTyped('');
    this.ui.showProblem(this.problem);
    this.ui.setStatus('');
    this.ui.setTimer(this.remaining, this.timerMs);
    this.ask();
  }

  async ask() {
    const s = ++this.seq;
    this.state = 'speaking';
    this.listener.stop();
    await speak(this.problem.speech);
    if (s !== this.seq) return;
    this.listen();
  }

  listen() {
    this.state = 'waiting';
    if (this.timerMs) this.startTimer();
    if (this.config.voiceInput) this.listener.start();
  }

  // --- answers ---

  canAnswer() {
    return this.state === 'waiting' || this.state === 'speaking';
  }

  submit(value) {
    if (!this.canAnswer()) return;
    if (value === this.problem.answer) this.correct();
    else this.wrong(value);
  }

  async correct() {
    const s = this.beginFeedback();
    this.done = true;
    this.stopTimer();
    this.score++;
    this.streak++;
    this.ui.setScore(this.score, this.streak);
    this.ui.setTyped(String(this.problem.answer));
    this.ui.flash('correct');
    await sounds.playCorrect();
    if (s !== this.seq) return;
    await speak(pick(PRAISE));
    if (s !== this.seq) return;
    this.next();
  }

  // The problem stays; the timer keeps running.
  async wrong(value) {
    const s = this.beginFeedback();
    this.streak = 0;
    this.ui.setScore(this.score, this.streak);
    this.ui.setTyped(String(value));
    this.ui.flash('wrong');
    await sounds.playWrong();
    if (s !== this.seq) return;
    await speak(`${value} זה לא נכון. נסו שוב`);
    if (s !== this.seq) return;
    this.setTyped('');
    this.listen();
  }

  timeout() {
    this.reveal(`נגמר הזמן! התשובה היא ${this.problem.answer}`, sounds.playTimeout);
  }

  skip() {
    this.reveal(`התשובה היא ${this.problem.answer}`);
  }

  async reveal(text, sound) {
    const s = this.beginFeedback();
    this.done = true;
    this.stopTimer();
    this.streak = 0;
    this.ui.setScore(this.score, this.streak);
    this.ui.setTyped(String(this.problem.answer));
    this.ui.flash('timeout');
    if (sound) await sound();
    if (s !== this.seq) return;
    await speak(text);
    if (s !== this.seq) return;
    await wait(700);
    if (s !== this.seq) return;
    this.next();
  }

  beginFeedback() {
    const s = ++this.seq;
    this.state = 'feedback';
    this.listener.stop();
    cancelSpeech();
    return s;
  }

  // --- controls ---

  repeat() {
    if (this.canAnswer()) this.ask();
  }

  pause({ silent = false } = {}) {
    if (this.state === 'paused' || this.state === 'idle') return;
    const s = ++this.seq;
    this.state = 'paused';
    this.stopTimer();
    this.listener.stop();
    cancelSpeech();
    this.ui.setPaused(true);
    if (silent) return;
    speak('עצרנו. כדי להמשיך תגידו המשך').then(() => {
      if (s === this.seq) this.listenForResume();
    });
  }

  listenForResume() {
    if (this.state === 'paused' && this.config.voiceInput) this.listener.start();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.setPaused(false);
    if (this.done) this.next();
    else this.ask();
  }

  // --- voice ---

  onVoice(alternatives) {
    this.ui.setHeard(alternatives[0]);
    if (this.state === 'paused') {
      if (alternatives.some((a) => parseCommand(a) === 'resume')) this.resume();
      return;
    }
    if (this.state !== 'waiting') return;

    const numbers = alternatives.map(parseNumber);
    if (numbers.includes(this.problem.answer)) return this.correct();

    const command = alternatives.map(parseCommand).find(Boolean);
    if (command === 'repeat') return this.repeat();
    if (command === 'skip') return this.skip();
    if (command === 'pause') return this.pause();

    const heard = numbers.find((n) => n !== null);
    if (heard !== undefined) return this.wrong(heard);
    this.ui.setStatus('לא הבנתי 🤔');
  }

  // --- keypad ---

  setTyped(value) {
    this.typed = value;
    this.ui.setTyped(value);
  }

  // Auto-submits once the typed length matches the answer's length.
  typeDigit(d) {
    if (!this.canAnswer() || this.typed.length >= MAX_DIGITS) return;
    this.setTyped(this.typed === '0' ? d : this.typed + d);
    if (this.typed.length === String(this.problem.answer).length) this.submit(Number(this.typed));
  }

  backspace() {
    if (this.canAnswer()) this.setTyped(this.typed.slice(0, -1));
  }

  enter() {
    if (this.canAnswer() && this.typed) this.submit(Number(this.typed));
  }

  // --- timer ---

  startTimer() {
    if (this.timerId) return;
    let last = performance.now();
    this.timerId = setInterval(() => {
      const now = performance.now();
      this.remaining -= now - last;
      last = now;
      this.tickTimer();
    }, 100);
  }

  stopTimer() {
    clearInterval(this.timerId);
    this.timerId = null;
  }

  tickTimer() {
    this.ui.setTimer(Math.max(0, this.remaining), this.timerMs);
    if (this.remaining <= 0) return this.timeout();
    const sec = Math.ceil(this.remaining / 1000);
    if (sec <= TICK_FROM_SEC && sec !== this.lastTick) {
      this.lastTick = sec;
      sounds.playTick(sec === 1);
    }
  }
}
