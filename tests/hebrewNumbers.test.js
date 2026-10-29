import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseNumbers } from '../js/hebrewNumbers.js';
import { parseCommand } from '../js/commands.js';

const cases = {
  'אפס': 0,
  'אחת': 1,
  'אחד': 1,
  'שתיים': 2,
  'שניים': 2,
  'חמש': 5,
  'חמישה': 5,
  'עשר': 10,
  'אחת עשרה': 11,
  'אחד עשר': 11,
  'שתים עשרה': 12,
  'שנים עשר': 12,
  'שלוש עשרה': 13,
  'תשעה עשר': 19,
  'עשרים': 20,
  'עשרים ואחת': 21,
  'עשרים ושלוש': 23,
  'עשרים ו שלוש': 23,
  'תשעים ותשע': 99,
  'מאה': 100,
  'מאה וחמש': 105,
  'מאה ועשרים': 120,
  'מאה עשרים ושלוש': 123,
  'מאה ושתים עשרה': 112,
  'מאתיים': 200,
  'מאתיים וחמישים': 250,
  'שלוש מאות': 300,
  'שלוש מאות ושש עשרה': 316,
  'תשע מאות תשעים ותשע': 999,
  'אלף': 1000,
  'אלף ומאתיים': 1200,
  'אלפיים': 2000,
  'שלושת אלפים': 3000,
  'עשרת אלפים וחמש מאות': 10500,
  'עשרים אלף': 20000,
  'מיליון': 1000000,
  '12': 12,
  '1,250': 1250,
  '100 ו-5': 105,
  'עשרים־ושלוש': 23,
  'התשובה היא 42': 42,
  'זה שבע': 7,
  'שבע ועוד חמש זה שתים עשרה': 12,
};

for (const [text, expected] of Object.entries(cases)) {
  test(`parses "${text}" → ${expected}`, () => {
    assert.equal(parseNumber(text), expected);
  });
}

test('every number 0–1000 written as digits parses', () => {
  for (let n = 0; n <= 1000; n++) assert.equal(parseNumber(String(n)), n);
});

test('non-numbers return null', () => {
  assert.equal(parseNumber('לא יודע'), null);
  assert.equal(parseNumber(''), null);
});

test('separated numbers are not summed', () => {
  assert.deepEqual(parseNumbers('שבע ועוד חמש'), [7, 5]);
  assert.deepEqual(parseNumbers('שלוש חמש'), [3, 5]);
  assert.deepEqual(parseNumbers('3 4'), [3, 4]);
});

test('commands', () => {
  assert.equal(parseCommand('חזור'), 'repeat');
  assert.equal(parseCommand('תחזור על השאלה'), 'repeat');
  assert.equal(parseCommand('עוד פעם'), 'repeat');
  assert.equal(parseCommand('דלג'), 'skip');
  assert.equal(parseCommand('תשובה'), 'skip');
  assert.equal(parseCommand('התשובה היא 12'), null);
  assert.equal(parseCommand('עצור'), 'pause');
  assert.equal(parseCommand('המשך'), 'resume');
  assert.equal(parseCommand('שבע ועוד חמש'), null);
  assert.equal(parseCommand('12'), null);
});
