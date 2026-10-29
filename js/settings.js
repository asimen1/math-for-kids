// Settings screen: state, persistence, rendering and validation.

export const OPS = [
  { id: 'add', label: 'חיבור', symbol: '+' },
  { id: 'sub', label: 'חיסור', symbol: '−' },
  { id: 'mul', label: 'כפל', symbol: '×' },
  { id: 'div', label: 'חילוק', symbol: '÷' },
];

const RANGE_PRESETS = ['10', '100', '1000'];
const TIMER_PRESETS = ['10', '20', '30', '60'];
const MAX_VALUE = 1_000_000;
export const SPEECH_RATE = { min: 0.5, max: 1, step: 0.05, default: 0.7 };
const STORAGE_KEY = 'showerMath.settings.v1';

export function defaultSettings() {
  const op = (enabled) => ({ enabled, preset: '10', min: 0, max: 20 });
  return {
    ops: { add: op(true), sub: op(true), mul: op(false), div: op(false) },
    timer: { enabled: false, preset: '30', seconds: 45 },
    voiceInput: true,
    listenWhileSpeaking: true,
    speechEngine: 'local', // 'local' (on-device model) | 'google' (Chrome's recognizer)
    echoCancellation: true,
    noiseSuppression: true,
    numberBias: true,
    enhanceAudio: true,
    speechRate: SPEECH_RATE.default,
  };
}

export function loadSettings() {
  const defaults = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return defaults;
    for (const { id } of OPS) defaults.ops[id] = { ...defaults.ops[id], ...saved.ops?.[id] };
    defaults.timer = { ...defaults.timer, ...saved.timer };
    if (typeof saved.voiceInput === 'boolean') defaults.voiceInput = saved.voiceInput;
    if (typeof saved.listenWhileSpeaking === 'boolean') {
      defaults.listenWhileSpeaking = saved.listenWhileSpeaking;
    }
    if (['local', 'google'].includes(saved.speechEngine)) defaults.speechEngine = saved.speechEngine;
    for (const key of ['echoCancellation', 'noiseSuppression', 'numberBias', 'enhanceAudio']) {
      if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
    }
    if (saved.speechRate >= SPEECH_RATE.min && saved.speechRate <= SPEECH_RATE.max) {
      defaults.speechRate = saved.speechRate;
    }
  } catch { /* storage unavailable or corrupt: use defaults */ }
  return defaults;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage unavailable */ }
}

function opRange(op) {
  return op.preset === 'custom' ? { min: op.min, max: op.max } : { min: 0, max: Number(op.preset) };
}

function timerSeconds(timer) {
  return timer.preset === 'custom' ? timer.seconds : Number(timer.preset);
}

const isInt = (v) => Number.isInteger(v);

// Returns an error message, or null when the settings can start a game.
export function validateSettings(settings) {
  const enabled = OPS.filter(({ id }) => settings.ops[id].enabled);
  if (!enabled.length) return 'יש לבחור לפחות סוג תרגיל אחד';
  for (const { id, label } of enabled) {
    const { min, max } = opRange(settings.ops[id]);
    if (!isInt(min) || !isInt(max) || min < 0 || max > MAX_VALUE) {
      return `טווח לא תקין ב${label}: מספרים שלמים בין 0 ל-${MAX_VALUE.toLocaleString('he-IL')}`;
    }
    if (min > max) return `ב${label} המספר "מ-" צריך להיות קטן מ"עד"`;
  }
  if (settings.timer.enabled) {
    const sec = timerSeconds(settings.timer);
    if (!isInt(sec) || sec < 3 || sec > 600) return 'זמן הטיימר צריך להיות בין 3 ל-600 שניות';
  }
  return null;
}

export function toGameConfig(settings) {
  return {
    ops: OPS.filter(({ id }) => settings.ops[id].enabled)
      .map(({ id }) => ({ id, ...opRange(settings.ops[id]) })),
    timerSeconds: settings.timer.enabled ? timerSeconds(settings.timer) : null,
    voiceInput: settings.voiceInput,
    listenWhileSpeaking: settings.listenWhileSpeaking,
    speechEngine: settings.speechEngine,
    mic: {
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      enhance: settings.enhanceAudio,
    },
    numberBias: settings.numberBias,
  };
}

// --- rendering ---

const pressed = (on) => `aria-pressed="${on}"`;

function opCard({ id, label, symbol }, op) {
  const presets = RANGE_PRESETS.map((p) =>
    `<button type="button" class="seg-btn" data-op="${id}" data-preset="${p}" ${pressed(op.preset === p)}><span dir="ltr">0–${p}</span></button>`).join('');
  return `
    <div class="card op-card ${op.enabled ? 'on' : ''}">
      <label class="switch-row">
        <span class="op-symbol">${symbol}</span>
        <span class="op-label">${label}</span>
        <input type="checkbox" data-op="${id}" data-field="enabled" ${op.enabled ? 'checked' : ''}>
      </label>
      <div class="op-body" ${op.enabled ? '' : 'hidden'}>
        <div class="seg">
          ${presets}
          <button type="button" class="seg-btn" data-op="${id}" data-preset="custom" ${pressed(op.preset === 'custom')}>מותאם</button>
        </div>
        <div class="custom-row" ${op.preset === 'custom' ? '' : 'hidden'}>
          <label>מ- <input type="number" inputmode="numeric" min="0" data-op="${id}" data-field="min" value="${op.min}"></label>
          <label>עד <input type="number" inputmode="numeric" min="0" data-op="${id}" data-field="max" value="${op.max}"></label>
        </div>
      </div>
    </div>`;
}

function timerCard(timer) {
  const presets = TIMER_PRESETS.map((p) =>
    `<button type="button" class="seg-btn" data-timer-preset="${p}" ${pressed(timer.preset === p)}>${p} ש׳</button>`).join('');
  return `
    <div class="card ${timer.enabled ? 'on' : ''}">
      <label class="switch-row">
        <span class="op-symbol">⏱</span>
        <span class="op-label">טיימר לכל תרגיל</span>
        <input type="checkbox" data-field="timer" ${timer.enabled ? 'checked' : ''}>
      </label>
      <div class="op-body" ${timer.enabled ? '' : 'hidden'}>
        <div class="seg">
          ${presets}
          <button type="button" class="seg-btn" data-timer-preset="custom" ${pressed(timer.preset === 'custom')}>מותאם</button>
        </div>
        <div class="custom-row" ${timer.preset === 'custom' ? '' : 'hidden'}>
          <label><input type="number" inputmode="numeric" min="3" max="600" data-field="seconds" value="${timer.seconds}"> שניות</label>
        </div>
      </div>
    </div>`;
}

const checkRow = (field, label, on) => `
        <label class="sub-row">
          <span>${label}</span>
          <input type="checkbox" data-field="${field}" ${on ? 'checked' : ''}>
        </label>`;

function voiceCard(settings) {
  const { voiceInput, listenWhileSpeaking, speechEngine } = settings;
  const local = speechEngine === 'local';
  return `
    <div class="card ${voiceInput ? 'on' : ''}">
      <label class="switch-row">
        <span class="op-symbol">🎤</span>
        <span class="op-label">תשובות בקול</span>
        <input type="checkbox" data-field="voice" ${voiceInput ? 'checked' : ''}>
      </label>
      <div class="op-body" ${voiceInput ? '' : 'hidden'}>
        <p class="hint">אפשר לומר את התשובה (גם בתוך משפט), או: <b>חזור</b> · <b>דלג</b> (או <b>תשובה</b>) · <b>עצור</b> · <b>המשך</b></p>
        <div class="seg engine-seg">
          <button type="button" class="seg-btn" data-engine="local" ${pressed(local)}>זיהוי על המכשיר</button>
          <button type="button" class="seg-btn" data-engine="google" ${pressed(!local)}>זיהוי של Google</button>
        </div>
        <p class="hint">${local
    ? 'מודל עברית שרץ בטלפון (ivrit.ai): שומע גם דיבור שקט, בלי צפצופים. הורדה חד־פעמית של כ־73MB.'
    : 'זיהוי הדיבור המובנה של Chrome. דורש אינטרנט.'}</p>
        ${local ? checkRow('echo', 'סינון הקול של האפליקציה (ביטול הד)', settings.echoCancellation) : ''}
        ${local ? checkRow('noise', 'סינון רעשי רקע', settings.noiseSuppression) : ''}
        ${local ? checkRow('number-bias', 'העדפת מספרים ופקודות בזיהוי (עוזר ברעש)', settings.numberBias) : ''}
        ${local ? checkRow('enhance', 'הגברת קולות שקטים ורחוקים', settings.enhanceAudio) : ''}
        <label class="sub-row">
          <span>להקשיב גם בזמן שהאפליקציה מדברת</span>
          <input type="checkbox" data-field="listen-early" ${listenWhileSpeaking ? 'checked' : ''}>
        </label>
        <p class="hint">עונים מהר יותר בלי לחכות לסוף השאלה. אם הרמקול בבלוטות׳ נשמע רע – לכבות.</p>
      </div>
    </div>`;
}

const ratePercent = (rate) => `${Math.round(rate * 100)}%`;

function speechRateCard(rate) {
  return `
    <div class="card on">
      <label class="switch-row" for="speech-rate">
        <span class="op-symbol">🔊</span>
        <span class="op-label">קצב דיבור</span>
        <output id="speech-rate-value" class="rate-value">${ratePercent(rate)}</output>
      </label>
      <div class="rate-row">
        <span>🐢</span>
        <input id="speech-rate" type="range" data-field="rate" min="${SPEECH_RATE.min}" max="${SPEECH_RATE.max}" step="${SPEECH_RATE.step}" value="${rate}">
        <span>🐇</span>
      </div>
    </div>`;
}

export function renderSettings(root, settings, onChange) {
  const render = () => {
    root.innerHTML = OPS.map((op) => opCard(op, settings.ops[op.id])).join('') +
      timerCard(settings.timer) + voiceCard(settings) + speechRateCard(settings.speechRate);
  };
  const changed = (rerender) => {
    onChange(settings);
    if (rerender) render();
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.preset) {
      settings.ops[btn.dataset.op].preset = btn.dataset.preset;
      changed(true);
    } else if (btn.dataset.engine) {
      settings.speechEngine = btn.dataset.engine;
      changed(true);
    } else if (btn.dataset.timerPreset) {
      settings.timer.preset = btn.dataset.timerPreset;
      changed(true);
    }
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type !== 'checkbox') return;
    if (el.dataset.field === 'enabled') settings.ops[el.dataset.op].enabled = el.checked;
    else if (el.dataset.field === 'timer') settings.timer.enabled = el.checked;
    else if (el.dataset.field === 'voice') settings.voiceInput = el.checked;
    else if (el.dataset.field === 'listen-early') settings.listenWhileSpeaking = el.checked;
    else if (el.dataset.field === 'echo') settings.echoCancellation = el.checked;
    else if (el.dataset.field === 'noise') settings.noiseSuppression = el.checked;
    else if (el.dataset.field === 'number-bias') settings.numberBias = el.checked;
    else if (el.dataset.field === 'enhance') settings.enhanceAudio = el.checked;
    changed(true);
  });

  // Number inputs and the slider update state without re-rendering, so they keep focus.
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.field === 'rate') {
      settings.speechRate = Number(el.value);
      root.querySelector('#speech-rate-value').textContent = ratePercent(settings.speechRate);
      changed(false);
      return;
    }
    if (el.type !== 'number') return;
    const value = el.value === '' ? NaN : Number(el.value);
    if (el.dataset.field === 'seconds') settings.timer.seconds = value;
    else settings.ops[el.dataset.op][el.dataset.field] = value;
    changed(false);
  });

  render();
}
