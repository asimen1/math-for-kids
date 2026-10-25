// Decides what a recognized phrase means for the current problem. Numbers are searched for
// anywhere in the phrase, across all of the recognizer's alternatives.

import { parseNumbers, parseNumbersLenient } from './hebrewNumbers.js';

// Removes one occurrence of each echo number: the app's own speech picked up by the mic.
// "כמה זה 3 ועוד 0 3" with echo [3, 0] leaves [3], the child's answer.
export function withoutEcho(numbers, echo) {
  const rest = [...numbers];
  for (const n of echo) {
    const i = rest.indexOf(n);
    if (i !== -1) rest.splice(i, 1);
  }
  return rest;
}

// Returns { verdict: 'correct' | 'wrong' | null, number, lenient, echoOnly }.
// - correct: the answer appears in any alternative (strict, then lenient spelling match;
//   lenient: true when only the lenient match found it).
// - wrong: only on a final result, when the top alternative still has some other number.
// - echoOnly: numbers were heard, but all of them were the app's own words.
export function matchAnswer(alternatives, answer, { echo = [], final = false } = {}) {
  const raw = alternatives.map(parseNumbers);
  const strict = raw.map((nums) => withoutEcho(nums, echo));
  if (strict.some((nums) => nums.includes(answer))) {
    return { verdict: 'correct', number: answer, lenient: false, echoOnly: false };
  }

  const lenient = alternatives.map((alt) => withoutEcho(parseNumbersLenient(alt), echo));
  if (lenient.some((nums) => nums.includes(answer))) {
    return { verdict: 'correct', number: answer, lenient: true, echoOnly: false };
  }

  if (final) {
    const heard = strict.find((nums) => nums.length);
    if (heard) return { verdict: 'wrong', number: heard[heard.length - 1], lenient: false, echoOnly: false };
  }
  const echoOnly = raw.some((nums) => nums.length) && strict.every((nums) => !nums.length);
  return { verdict: null, number: null, lenient: false, echoOnly };
}
