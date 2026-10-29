// Voice commands, matched as whole words (with an optional "ו" prefix).
import { tokenize } from './hebrewNumbers.js';

const COMMANDS = {
  // Not "שוב": the app itself says "נסו שוב", and the mic may hear it.
  repeat: ['חזור', 'תחזור', 'חזרי', 'תחזרי', 'חזרה', 'עוד פעם'],
  // "תשובה" asks for the answer, which skipping reveals. Not "התשובה": the app says
  // "התשובה היא…" when it reveals one, and hearing that would skip the next problem too.
  skip: ['דלג', 'תדלג', 'דלגי', 'תדלגי', 'דילוג', 'הבא', 'הלאה', 'תשובה'],
  pause: ['עצור', 'תעצור', 'עצרי', 'תעצרי', 'עצירה', 'הפסק', 'תפסיק', 'הפסקה'],
  resume: ['המשך', 'תמשיך', 'המשיכי', 'תמשיכי', 'נמשיך', 'ממשיכים', 'קדימה'],
};

export function parseCommand(text) {
  const words = tokenize(text).map((w) => (w.length > 2 && w[0] === 'ו' ? w.slice(1) : w));
  const joined = ` ${words.join(' ')} `;
  for (const [cmd, phrases] of Object.entries(COMMANDS)) {
    if (phrases.some((p) => joined.includes(` ${p} `))) return cmd;
  }
  return null;
}
