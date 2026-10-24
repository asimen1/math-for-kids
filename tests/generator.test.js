import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProblem, generateProblem } from '../js/generator.js';

const RANGES = [
  { min: 0, max: 10 },
  { min: 0, max: 100 },
  { min: 0, max: 1000 },
  { min: 5, max: 7 },
  { min: 0, max: 0 },
  { min: 13, max: 13 },
];
const N = 2000;

const inRange = (v, { min, max }) => v >= min && v <= max;

test('addition and multiplication operands stay in range', () => {
  for (const range of RANGES) {
    for (let i = 0; i < N; i++) {
      for (const op of ['add', 'mul']) {
        const p = createProblem(op, range);
        assert.ok(inRange(p.a, range) && inRange(p.b, range), JSON.stringify({ op, range, p }));
        assert.equal(p.answer, op === 'add' ? p.a + p.b : p.a * p.b);
      }
    }
  }
});

test('subtraction never goes negative', () => {
  for (const range of RANGES) {
    for (let i = 0; i < N; i++) {
      const p = createProblem('sub', range);
      assert.ok(inRange(p.a, range) && inRange(p.b, range));
      assert.ok(p.answer >= 0);
      assert.equal(p.answer, p.a - p.b);
    }
  }
});

test('division is exact, divisor ≥ 1, dividend in range', () => {
  for (const range of RANGES) {
    for (let i = 0; i < N; i++) {
      const p = createProblem('div', range);
      assert.ok(p.b >= 1, JSON.stringify({ range, p }));
      assert.ok(inRange(p.a, range), JSON.stringify({ range, p }));
      assert.ok(Number.isInteger(p.answer));
      assert.equal(p.answer * p.b, p.a);
    }
  }
});

test('division usually avoids trivial divisors when possible', () => {
  let trivial = 0;
  for (let i = 0; i < N; i++) {
    const p = createProblem('div', { min: 0, max: 100 });
    if (p.b === 1 || p.b === p.a) trivial++;
  }
  assert.ok(trivial < N * 0.02, `trivial: ${trivial}`);
});

test('generateProblem uses only enabled ops and avoids immediate repeats', () => {
  const ops = [{ id: 'add', min: 0, max: 10 }, { id: 'div', min: 0, max: 100 }];
  let prev = null;
  for (let i = 0; i < N; i++) {
    const p = generateProblem(ops, prev);
    assert.ok(['add', 'div'].includes(p.op));
    if (prev) assert.notEqual(p.display, prev.display);
    prev = p;
  }
});

test('speech text uses Hebrew operation words', () => {
  assert.match(createProblem('add', { min: 1, max: 1 }).speech, /^כמה זה 1 ועוד 1\?$/);
  assert.match(createProblem('sub', { min: 1, max: 1 }).speech, /פחות/);
  assert.match(createProblem('mul', { min: 1, max: 1 }).speech, /כפול/);
  assert.match(createProblem('div', { min: 6, max: 6 }).speech, /חלקי/);
});
