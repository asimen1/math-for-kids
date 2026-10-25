// Game loop: ask → wait for an answer (voice or keypad) → feedback → next.
// Every transition bumps `seq`; async steps check it so stale continuations stop.

import { generateProblem } from './generator.js';
import { parseNumbers } from './hebrewNumbers.js';
import { parseCommand } from './commands.js';
import { matchAnswer } from './answerMatcher.js';
import { speak, cancelSpeech } from './speech.js';
import * as sounds from './sounds.js';

const PRAISE = ['כל הכבוד!', 'מצוין!', 'נכון מאוד!', 'יפה מאוד!', 'בדיוק!', 'אלופים!'];
const TICK_FROM_SEC = 5;
const MAX_DIGITS = 7;
// How long after the app stops talking its own words may still show up in a result.
const ECHO_GRACE_MS = 2500;

const COMMAND_NAMES = { repeat: 'חזור', skip: 'דלג', pause: 'עצור', resume: 'המשך' };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  // config: { ops: [{ id, min, max }], timerSeconds: number|null, voiceInput: boolean,
  //           listenWhileSpeaking: boolean }
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
    this.echoes = []; // [{ numbers, until }] – numbers the app said recently
    this.usedSession = null; // recognition session that already produced a verdict
    this.speaking = false;
    this.lastSpeechEnd = 0;
  }

  get listenEarly() {
    return this.config.voiceInput && this.config.listenWhileSpeaking;
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
    if (this.listenEarly) this.listener.start();
    else this.listener.stop();
    await this.say(this.problem.speech);
    if (s !== this.seq) return;
    this.listen();
  }

  listen() {
    this.state = 'waiting';
    if (this.timerMs) this.startTimer();
    if (this.config.voiceInput) this.listener.start();
  }

  // Speaks and remembers the numbers said, so the mic hearing the app isn't taken as an answer.
  async say(text) {
    const echo = { numbers: parseNumbers(text), until: Infinity };
    this.echoes.push(echo);
    this.speaking = true;
    await speak(text);
    this.speaking = false;
    this.lastSpeechEnd = performance.now();
    echo.until = this.lastSpeechEnd + ECHO_GRACE_MS;
  }

  activeEcho() {
    const now = performance.now();
    this.echoes = this.echoes.filter((e) => e.until > now);
    return this.echoes.flatMap((e) => e.numbers);
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
    await this.say(pick(PRAISE));
    if (s !== this.seq) return;
    this.next();
  }

  // The problem stays and the timer keeps running. The child may answer again
  // while the feedback is still being spoken.
  async wrong(value) {
    const s = this.beginFeedback();
    this.streak = 0;
    this.ui.setScore(this.score, this.streak);
    this.ui.setTyped(String(value));
    this.ui.flash('wrong');
    await sounds.playWrong();
    if (s !== this.seq) return;
    this.state = 'speaking';
    this.setTyped('');
    await this.say(`${value} זה לא נכון. נסו שוב`);
    if (s !== this.seq) return;
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
    await this.say(text);
    if (s !== this.seq) return;
    await wait(700);
    if (s !== this.seq) return;
    this.next();
  }

  // In listen-while-speaking mode the mic stays on; results are ignored until answering resumes.
  beginFeedback() {
    const s = ++this.seq;
    this.state = 'feedback';
    if (!this.listenEarly) this.listener.stop();
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
    this.listener.stop(); // so the mic doesn't hear "המשך" in the message below
    cancelSpeech();
    this.ui.setPaused(true);
    if (silent) return;
    this.say('עצרנו. כדי להמשיך תגידו המשך').then(() => {
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

  // Called for partial results while the child talks (final: false) and once at the end.
  // A correct answer is accepted as soon as it shows up; anything else waits for the final.
  // A phrase recorded while the app was talking may contain a misheard echo of it, so it
  // can confirm a correct answer but never count as a wrong one.
  // Every outcome goes to the on-screen speech log, so it's clear what was heard and why.
  onVoice({ alternatives, final, session, startedAt }) {
    if (session === this.usedSession) return;
    const text = alternatives[0];
    if (!final) this.ui.setLiveHeard(text);
    const log = (kind, note) => this.ui.logHeard(text, kind, note);

    if (this.state === 'paused') {
      if (!final) return;
      if (alternatives.some((a) => parseCommand(a) === 'resume')) {
        log('command', COMMAND_NAMES.resume);
        return this.resume();
      }
      return log('ignored', 'בהפסקה');
    }
    if (!this.canAnswer()) {
      if (final) log('ignored', 'בזמן משוב – לא נספר');
      return;
    }

    const match = matchAnswer(alternatives, this.problem.answer, {
      echo: this.activeEcho(),
      final,
    });
    if (match.verdict === 'correct') {
      this.usedSession = session;
      log('correct', match.lenient ? 'נכון (התאמה גמישה)' : 'נכון');
      return this.correct();
    }
    if (!final) return;

    const command = alternatives.map(parseCommand).find(Boolean);
    if (command) {
      this.usedSession = session;
      log('command', COMMAND_NAMES[command]);
    }
    if (command === 'repeat') return this.repeat();
    if (command === 'skip') return this.skip();
    if (command === 'pause') return this.pause();

    if (match.verdict === 'wrong') {
      if (this.speaking || startedAt < this.lastSpeechEnd) {
        return log('echo', `${match.number} – נשמע בזמן שהאפליקציה דיברה, לא נספר`);
      }
      this.usedSession = session;
      log('wrong', `לא נכון (${match.number})`);
      return this.wrong(match.number);
    }
    if (match.echoOnly) return log('echo', 'קול האפליקציה');
    log('unclear', 'לא נמצא מספר');
    if (this.state === 'waiting') this.ui.setStatus('לא הבנתי 🤔');
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
