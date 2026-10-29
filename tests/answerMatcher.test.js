import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAnswer, withoutEcho } from '../js/answerMatcher.js';
import { parseNumbers, parseNumbersLenient } from '../js/hebrewNumbers.js';

const verdict = (alts, answer, opts) => matchAnswer(alts, answer, opts).verdict;

test('finds the answer anywhere in a sentence', () => {
  assert.equal(verdict(['אני חושב שזה שתים עשרה'], 12), 'correct');
  assert.equal(verdict(['שבע ועוד חמש זה 12 נכון'], 12), 'correct');
  assert.equal(verdict(['אממ... 12'], 12), 'correct');
  assert.equal(verdict(['זה12'], 12), 'correct');
  assert.equal(verdict(['התשובה היא בשמונה'], 8), 'correct');
});

test('accepts the answer from any alternative, even on partial results', () => {
  assert.equal(verdict(['שלום', 'שלוש'], 3, { final: false }), 'correct');
});

test('another number is wrong, but only once the phrase is final', () => {
  const m = matchAnswer(['אני חושב שזה 13'], 12, { final: true });
  assert.equal(m.verdict, 'wrong');
  assert.equal(m.number, 13);
  assert.equal(verdict(['אני חושב שזה 13'], 12, { final: false }), null);
});

test('no number means no verdict', () => {
  assert.equal(verdict(['אני לא יודע'], 12, { final: true }), null);
});

test("the app's own words are not taken as an answer", () => {
  // Mic heard the question "כמה זה 7 ועוד 5" – not a wrong answer.
  assert.equal(verdict(['כמה זה 7 ועוד 5'], 12, { echo: [7, 5], final: true }), null);
  // Answer equals an operand: the child's "3" survives removing one echo of each number.
  assert.equal(verdict(['כמה זה 3 ועוד 0 3'], 3, { echo: [3, 0], final: true }), 'correct');
  // The repeated wrong number from "13 זה לא נכון" is ignored.
  assert.equal(verdict(['13 זה לא נכון'], 12, { echo: [13], final: true }), null);
});

test('reports when only the app\'s own numbers were heard', () => {
  assert.equal(matchAnswer(['כמה זה 7 ועוד 5'], 12, { echo: [7, 5], final: true }).echoOnly, true);
  assert.equal(matchAnswer(['אני לא יודע'], 12, { final: true }).echoOnly, false);
});

test('flags a lenient-only match', () => {
  assert.equal(matchAnswer(['שמונא'], 8).lenient, true);
  assert.equal(matchAnswer(['שמונה'], 8).lenient, false);
});

test('lenient spelling confirms a correct answer but never a wrong one', () => {
  assert.equal(verdict(['שמונא'], 8), 'correct');
  assert.equal(verdict(['אסרים ושלוש'], 23), 'correct');
  assert.equal(verdict(['שמונא'], 9, { final: true }), null);
});

test('withoutEcho removes one occurrence per echo number', () => {
  assert.deepEqual(withoutEcho([3, 0, 3], [3, 0]), [3]);
  assert.deepEqual(withoutEcho([5], [7, 5]), []);
});

test('prefixes and letters glued to digits', () => {
  assert.deepEqual(parseNumbers('ב12'), [12]);
  assert.deepEqual(parseNumbers('לשבע'), [7]);
  assert.deepEqual(parseNumbers('ושלושים'), [30]);
});

test('lenient parsing handles sound-alike spellings', () => {
  assert.deepEqual(parseNumbersLenient('סבע'), [7]);
  assert.deepEqual(parseNumbersLenient('טשע'), [9]);
  assert.deepEqual(parseNumbersLenient('חמישא'), [5]);
  assert.deepEqual(parseNumbersLenient('שלום'), []);
});

test('lenient parsing maps words the model often hears instead of numbers', () => {
  assert.deepEqual(parseNumbersLenient('עשרים ושבת'), [27]);
  assert.deepEqual(parseNumbersLenient('שמע עשרה'), [17]);
  assert.deepEqual(parseNumbersLenient('ארבעים חיים'), [42]);
  assert.deepEqual(parseNumbersLenient('עזרים'), [20]);
  assert.deepEqual(parseNumbers('שבת'), []); // never strict: it can't make an answer wrong
});

test('ס is treated as ש in every position', () => {
  assert.deepEqual(parseNumbers('סבע'), [7]);
  assert.deepEqual(parseNumbers('סלוס'), [3]);
  assert.deepEqual(parseNumbers('עסרים וסתיים'), [22]);
  assert.deepEqual(parseNumbers('סלוס עסרה'), [13]);
  assert.deepEqual(parseNumbers('וסמונה'), [8]);
  assert.deepEqual(parseNumbers('סס'), [6]);
  // Strict now, so a wrong answer said with ס still counts as wrong.
  assert.equal(matchAnswer(['סבע'], 8, { final: true }).verdict, 'wrong');
  assert.equal(matchAnswer(['זה סמונה'], 8).verdict, 'correct');
});
