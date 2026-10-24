// Parses spoken Hebrew numbers ("עשרים ושלוש", "שלוש מאות וחמש", "1,250") into integers.
// Speech recognition returns digits or words inconsistently, so both are supported.

const UNITS = {
  'אפס': 0,
  'אחד': 1, 'אחת': 1,
  'שניים': 2, 'שנים': 2, 'שתיים': 2, 'שתים': 2, 'שני': 2, 'שתי': 2,
  'שלוש': 3, 'שלושה': 3, 'שלש': 3, 'שלשה': 3,
  'ארבע': 4, 'ארבעה': 4,
  'חמש': 5, 'חמישה': 5, 'חמשה': 5,
  'שש': 6, 'שישה': 6, 'ששה': 6,
  'שבע': 7, 'שבעה': 7,
  'שמונה': 8,
  'תשע': 9, 'תשעה': 9,
};

// Construct forms used before "אלפים" (שלושת אלפים).
const CONSTRUCT = {
  'שלושת': 3, 'שלשת': 3, 'ארבעת': 4, 'חמשת': 5, 'חמישת': 5, 'ששת': 6, 'שישת': 6,
  'שבעת': 7, 'שמונת': 8, 'תשעת': 9, 'עשרת': 10,
};

const TEN = new Set(['עשר', 'עשרה']);

const TENS = {
  'עשרים': 20, 'שלושים': 30, 'שלשים': 30, 'ארבעים': 40, 'חמישים': 50, 'חמשים': 50,
  'שישים': 60, 'ששים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90,
};

const PLAIN = { 'מאה': 100, 'מאתיים': 200 };
const THOUSAND = new Set(['אלף', 'אלפים']);
const MILLION = new Set(['מיליון', 'מליון', 'מיליונים']);

function isKnown(t) {
  return /^\d+$/.test(t) || t in UNITS || t in CONSTRUCT || TEN.has(t) || t in TENS ||
    t in PLAIN || t === 'מאות' || t === 'אלפיים' || THOUSAND.has(t) || MILLION.has(t);
}

// Strip a leading "ו" (and) when the rest is a number word: "ושלוש" → "שלוש".
function normalizeToken(t) {
  if (isKnown(t)) return t;
  if (t.length > 1 && t[0] === 'ו' && isKnown(t.slice(1))) return t.slice(1);
  return null;
}

export function tokenize(text) {
  return String(text)
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/[־\-–—]/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^א-ת0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const magnitude = (v) => 10 ** String(v).length;

// Returns every number found in the text, in order. Non-number words split numbers apart,
// so "שבע ועוד חמש" yields [7, 5] rather than 12.
export function parseNumbers(text) {
  const tokens = tokenize(text);
  const groups = [];
  let total = 0;
  let current = 0;
  let found = false;

  const flush = () => {
    if (found) groups.push(total + current);
    total = 0;
    current = 0;
    found = false;
  };

  // Adding a value that collides with what's already there ("שלוש חמש") starts a new number.
  const add = (v) => {
    if (found && current > 0 && current % magnitude(v) !== 0) flush();
    current += v;
    found = true;
  };

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'ו') continue;
    const t = normalizeToken(tokens[i]);
    if (t === null) {
      flush();
      continue;
    }
    if (/^\d+$/.test(t)) {
      add(Number(t));
    } else if (t in UNITS) {
      const next = i + 1 < tokens.length ? normalizeToken(tokens[i + 1]) : null;
      if (next !== null && TEN.has(next) && tokens[i + 1][0] !== 'ו') {
        add(10 + UNITS[t]);
        i++;
      } else {
        add(UNITS[t]);
      }
    } else if (t in CONSTRUCT) {
      add(CONSTRUCT[t]);
    } else if (TEN.has(t)) {
      add(10);
    } else if (t in TENS) {
      add(TENS[t]);
    } else if (t in PLAIN) {
      add(PLAIN[t]);
    } else if (t === 'מאות') {
      current = (current || 1) * 100;
      found = true;
    } else if (t === 'אלפיים') {
      if (found && current > 0) flush();
      total += 2000;
      found = true;
    } else if (THOUSAND.has(t)) {
      total += (current || 1) * 1000;
      current = 0;
      found = true;
    } else if (MILLION.has(t)) {
      total = (total + (current || 1)) * 1_000_000;
      current = 0;
      found = true;
    }
  }
  flush();
  return groups;
}

// The last number in the text ("שבע ועוד חמש זה שתים עשרה" → 12), or null.
export function parseNumber(text) {
  const nums = parseNumbers(text);
  return nums.length ? nums[nums.length - 1] : null;
}
