// Voice commands, matched as whole words (with an optional "ו" prefix).
import { tokenize } from './hebrewNumbers.js';

// Phrases the app says itself are left out, since the mic may hear them: "שוב" ("נסו שוב"),
// "התשובה" ("התשובה היא…") and "להמשיך" ("כדי להמשיך תגידו המשך").
const COMMANDS = {
  repeat: ['חזור', 'תחזור', 'חזרי', 'תחזרי', 'חזרה', 'עוד פעם', 'לא שמעתי', 'לא הבנתי', 'מה אמרת'],
  // "תשובה" and "לא יודע" ask for the answer, which skipping reveals.
  skip: ['דלג', 'תדלג', 'דלגי', 'תדלגי', 'דילוג', 'הבא', 'הלאה', 'תשובה', 'לא יודע', 'לא יודעת',
    'אין לי מושג'],
  pause: ['עצור', 'תעצור', 'עצרי', 'תעצרי', 'עצירה', 'הפסק', 'תפסיק', 'הפסקה', 'חכה', 'תחכה', 'חכי',
    'תחכי'],
  resume: ['המשך', 'תמשיך', 'המשיכי', 'תמשיכי', 'נמשיך', 'ממשיכים', 'קדימה', 'יאללה', 'מוכן', 'מוכנה'],
};

// Common words that are only a command when said alone: "מה?" or "רגע!".
const ALONE = { repeat: ['מה'], pause: ['רגע'] };

// Every command phrase, for the on-device recognizer to favor (see asrWorker.js).
export const COMMAND_PHRASES = Object.values(COMMANDS).flat();

export function parseCommand(text) {
  const words = tokenize(text).map((w) => (w.length > 2 && w[0] === 'ו' ? w.slice(1) : w));
  const joined = ` ${words.join(' ')} `;
  for (const [cmd, phrases] of Object.entries(COMMANDS)) {
    if (phrases.some((p) => joined.includes(` ${p} `))) return cmd;
  }
  for (const [cmd, alone] of Object.entries(ALONE)) {
    if (words.length === 1 && alone.includes(words[0])) return cmd;
  }
  return null;
}
