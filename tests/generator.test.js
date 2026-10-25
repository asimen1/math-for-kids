import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProblem, generateProblem } from '../js/generator.js';

const RANGES = [
  { min: 0, max: 10 },
  { min: 0, max: 100 },
  { min: 0, max: 1000 },
  { min: 5, max: 7 },
  { min: 50, max: 100 },
  { min: 0, max: 0 },
  { min: 13, max: 13 },
  { min: 97, max: 97 },
];
const N = 2000;
const OPS = ['add', 'sub', 'mul', 'div'];

const inRange = (v, { min, max }) => v >= min && v <= max;

test('the answer is always inside the range, for every op', () => {
  for (const range of RANGES) {
    for (const op of OPS) {
      for (let i = 0; i < N; i++) {
        const p = createProblem(op, range);
        assert.ok(inRange(p.answer, range), JSON.stringify({ op, range, p }));
        assert.ok(Number.isInteger(p.answer), JSON.stringify({ op, range, p }));
        assert.ok(p.a >= 0 && p.b >= 0, JSON.stringify({ op, range, p }));
      }
    }
  }
});

test('answers match the operation', () => {
  for (let i = 0; i < N; i++) {
    const range = RANGES[i % RANGES.length];
    const add = createProblem('add', range);
    assert.equal(add.answer, add.a + add.b);
    const sub = createProblem('sub', range);
    assert.equal(sub.answer, sub.a - sub.b);
    const mul = createProblem('mul', range);
    assert.equal(mul.answer, mul.a * mul.b);
    const div = createProblem('div', range);
    assert.ok(div.b >= 1);
    assert.equal(div.answer * div.b, div.a);
  }
});

test('addition and subtraction numbers stay within max', () => {
  for (const range of RANGES) {
    for (let i = 0; i < N; i++) {
      for (const op of ['add', 'sub']) {
        const p = createProblem(op, range);
        assert.ok(p.a <= range.max && p.b <= range.max, JSON.stringify({ op, range, p }));
      }
    }
  }
});

test('division dividend stays within max when the range starts at 0', () => {
  for (const max of [10, 100, 1000]) {
    for (let i = 0; i < N; i++) {
      const p = createProblem('div', { min: 0, max });
      assert.ok(p.a <= max, JSON.stringify(p));
    }
  }
});

test('multiplication and division mostly avoid trivial problems', () => {
  for (const op of ['mul', 'div']) {
    let trivial = 0;
    for (let i = 0; i < N; i++) {
      const p = createProblem(op, { min: 0, max: 100 });
      if (p.a <= 1 || p.b <= 1 || (op === 'div' && p.a === p.b)) trivial++;
    }
    assert.ok(trivial < N * 0.2, `${op} trivial: ${trivial}`);
  }
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
  assert.match(createProblem('add', { min: 0, max: 0 }).speech, /^כמה זה 0 ועוד 0\?$/);
  assert.match(createProblem('sub', { min: 1, max: 1 }).speech, /פחות/);
  assert.match(createProblem('mul', { min: 1, max: 1 }).speech, /כפול/);
  assert.match(createProblem('div', { min: 6, max: 6 }).speech, /חלקי/);
});
