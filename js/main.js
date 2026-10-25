import { loadSettings, saveSettings, renderSettings, validateSettings, toGameConfig } from './settings.js';
import { initVoices, ensureMicPermission, Listener, setSpeechRate, speak } from './speech.js';
import { unlockAudio } from './sounds.js';
import { enableWakeLock, disableWakeLock, wakeLockSupported } from './wakelock.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

let settings = loadSettings();
let game = null;

setSpeechRate(settings.speechRate);
renderSettings($('settings-form'), settings, (s) => {
  settings = s;
  saveSettings(s);
  setSpeechRate(s.speechRate);
  $('settings-error').textContent = '';
});

// Let the slider's new speed be heard once it's released.
$('settings-form').addEventListener('change', (e) => {
  if (e.target.dataset.field === 'rate') speak('כמה זה 7 ועוד 5?');
});

function warn(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('warnings').append(li);
}

initVoices().then((voice) => {
  if (!voice) warn('לא נמצא קול בעברית. כדאי להתקין: הגדרות ← מערכת ← שפות וקלט ← פלט טקסט לדיבור ← Google ← התקנת נתונים קוליים ← עברית.');
});
if (!Listener.supported) warn('זיהוי דיבור לא נתמך בדפדפן הזה, אפשר רק להקליד. מומלץ Chrome.');
if (!wakeLockSupported) warn('הדפדפן לא תומך בהשארת המסך דלוק. מומלץ Chrome מעודכן.');

// --- game UI ---

const LOG_ICONS = { correct: '✅', wrong: '❌', command: '🔁', echo: '🔈', ignored: '⏳', unclear: '❓' };
const LOG_MAX_LINES = 60;

function scrollLog() {
  const box = $('speech-box');
  box.scrollTop = box.scrollHeight;
}

// parts: [[className, text]] – built with textContent, since the text is whatever was heard.
function addLogLine(className, parts) {
  const li = document.createElement('li');
  li.className = className;
  for (const [cls, text] of parts) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    li.append(span);
  }
  const log = $('speech-log');
  log.append(li);
  while (log.children.length > LOG_MAX_LINES) log.firstElementChild.remove();
  scrollLog();
}

let flashTimer = null;
const ui = {
  showProblem(p) {
    $('expr').textContent = p.display;
    addLogLine('log-problem', [['log-text', p.display]]);
  },
  setTyped(value) {
    $('answer-box').textContent = value || '?';
    $('answer-box').classList.toggle('empty', !value);
  },
  setScore(score, streak) {
    $('score').textContent = score;
    $('streak').textContent = streak;
  },
  setTimer(remaining, total) {
    $('timer').hidden = !total;
    if (!total) return;
    $('timer-fill').style.transform = `scaleX(${remaining / total})`;
    $('timer-text').textContent = Math.ceil(remaining / 1000);
    $('timer').classList.toggle('low', remaining <= 5000);
  },
  setStatus(text) {
    $('status').textContent = text;
  },
  setLiveHeard(text) {
    $('speech-live').textContent = text;
    scrollLog();
  },
  logHeard(text, kind, note) {
    $('speech-live').textContent = '';
    addLogLine(`log-${kind}`, [
      ['log-icon', LOG_ICONS[kind]],
      ['log-text', `"${text}"`],
      ['log-note', note],
    ]);
  },
  clearLog() {
    $('speech-log').replaceChildren();
    $('speech-live').textContent = '';
  },
  setPaused(paused) {
    $('pause-overlay').hidden = !paused;
  },
  setListening(on) {
    $('mic').classList.toggle('on', on);
  },
  flash(kind) {
    const screen = $('game-screen');
    screen.classList.remove('flash-correct', 'flash-wrong', 'flash-timeout');
    void screen.offsetWidth; // restart the animation
    screen.classList.add(`flash-${kind}`);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => screen.classList.remove(`flash-${kind}`), 900);
  },
};

const listener = new Listener({
  onResult: (alts) => game?.onVoice(alts),
  onListening: (on) => ui.setListening(on),
  onError: (error) => {
    if (error === 'network') ui.setStatus('אין חיבור לאינטרנט – זיהוי הדיבור לא עובד');
    else ui.setStatus('המיקרופון לא זמין – אפשר להקליד');
  },
});

function showScreen(name) {
  $('settings-screen').hidden = name !== 'settings';
  $('game-screen').hidden = name !== 'game';
}

async function startGame() {
  const error = validateSettings(settings);
  if (error) {
    $('settings-error').textContent = error;
    return;
  }
  unlockAudio();
  const config = toGameConfig(settings);
  config.voiceInput &&= Listener.supported;
  if (config.voiceInput && !(await ensureMicPermission())) {
    config.voiceInput = false;
    warn('אין הרשאה למיקרופון – אפשר רק להקליד. אפשר לאשר בהגדרות האתר ב-Chrome.');
  }
  $('mic').hidden = !config.voiceInput;
  showScreen('game');
  history.pushState({ game: true }, '');
  enableWakeLock();
  ui.clearLog();
  $('speech-box').hidden = !config.voiceInput;
  game = new Game(config, ui, listener);
  game.start();
}

function exitGame() {
  game?.stop();
  game = null;
  ui.setPaused(false);
  disableWakeLock();
  showScreen('settings');
}

$('start-btn').addEventListener('click', startGame);
$('exit-btn').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => game && exitGame()); // Android back button

$('repeat-btn').addEventListener('click', () => game?.repeat());
$('skip-btn').addEventListener('click', () => game?.canAnswer() && game.skip());
$('pause-btn').addEventListener('click', () => game?.pause());
$('resume-btn').addEventListener('click', () => game?.resume());

$('numpad').addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (!game || !key) return;
  if (key === 'back') game.backspace();
  else if (key === 'enter') game.enter();
  else game.typeDigit(key);
});

// Physical keyboard (handy when testing on a computer).
document.addEventListener('keydown', (e) => {
  if (!game || $('game-screen').hidden) return;
  if (/^\d$/.test(e.key)) game.typeDigit(e.key);
  else if (e.key === 'Backspace') game.backspace();
  else if (e.key === 'Enter') game.enter();
});

document.addEventListener('visibilitychange', () => {
  if (!game) return;
  if (document.visibilityState === 'hidden') game.pause({ silent: true });
  else game.listenForResume();
});

// The version shown on the settings screen comes from package.json.
fetch('package.json')
  .then((res) => res.json())
  .then(({ version }) => { $('app-version').textContent = `גרסה ${version}`; })
  .catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
