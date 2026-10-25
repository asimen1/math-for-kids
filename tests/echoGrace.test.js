import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EchoGrace } from '../js/echoGrace.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

test('starts at the initial value', () => {
  assert.equal(new EchoGrace({ storage: null }).ms, 2500);
});

test('becomes the longest recent delay plus the margin', () => {
  const g = new EchoGrace({ storage: null });
  g.observe(800);
  assert.equal(g.ms, 1300);
  g.observe(1600);
  g.observe(400);
  assert.equal(g.ms, 2100);
});

test('stays within min and max', () => {
  const g = new EchoGrace({ storage: null });
  g.observe(100);
  assert.equal(g.ms, 1000);
  g.observe(20000);
  assert.equal(g.ms, 5000);
});

test('old samples age out', () => {
  const g = new EchoGrace({ storage: null, samples: 3 });
  g.observe(3000);
  g.observe(500);
  g.observe(500);
  assert.equal(g.ms, 3500);
  g.observe(500);
  assert.equal(g.ms, 1000);
});

test('ignores invalid delays', () => {
  const g = new EchoGrace({ storage: null });
  g.observe(-5);
  g.observe(NaN);
  assert.equal(g.ms, 2500);
});

test('remembers the learned value for the next game', () => {
  const storage = memoryStorage();
  const first = new EchoGrace({ storage });
  first.observe(1200);
  assert.equal(new EchoGrace({ storage }).ms, 1700);
});
