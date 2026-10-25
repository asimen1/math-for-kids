// Random problem generation. The range bounds the answer: every result lands in [min, max],
// all numbers are non-negative, and division is always exact.

const SYMBOLS = { add: '+', sub: '−', mul: '×', div: '÷' };
const WORDS = { add: 'ועוד', sub: 'פחות', mul: 'כפול', div: 'חלקי' };

export function randInt(min, max, rand = Math.random) {
  return min + Math.floor(rand() * (max - min + 1));
}

function properDivisors(n) {
  const ds = [];
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) {
      ds.push(d);
      if (d * d !== n) ds.push(n / d);
    }
  }
  return ds;
}

// Picks the sum, then splits it.
function addition({ min, max }, rand) {
  const sum = randInt(min, max, rand);
  const a = randInt(0, sum, rand);
  return [a, sum - a];
}

// Picks the difference, then a first number no bigger than max.
function subtraction({ min, max }, rand) {
  const diff = randInt(min, max, rand);
  const a = randInt(diff, max, rand);
  return [a, a - diff];
}

// Picks a small factor (2..√max) and a partner that puts the product in range, so 0–100
// gives times-table style problems. Occasionally uses ×0 / ×1 for variety; falls back to 1 × n.
function multiplication({ min, max }, rand) {
  if (rand() < 0.1) {
    if (min === 0 && rand() < 0.5) return [0, randInt(0, Math.max(max, 1), rand)];
    return [1, randInt(min, max, rand)];
  }
  const top = Math.floor(Math.sqrt(max));
  for (let i = 0; i < 40 && top >= 2; i++) {
    const a = randInt(2, top, rand);
    const lo = Math.max(Math.ceil(min / a), 0);
    const hi = Math.floor(max / a);
    if (lo > hi) continue;
    const b = randInt(lo, hi, rand);
    return rand() < 0.5 ? [a, b] : [b, a];
  }
  return [1, randInt(min, max, rand)];
}

// Prefers a dividend no bigger than max with a non-trivial divisor (not 1 or itself).
// When min is high relative to max few such dividends exist (50–100 would mostly give
// 100 ÷ 2), so it picks the answer and a divisor 2–9 instead.
function division({ min, max }, rand) {
  for (let i = 0; i < 40 && max >= 4 * min; i++) {
    const n = randInt(min, max, rand);
    const ds = properDivisors(n).filter((d) => n / d >= min);
    if (ds.length) return [n, ds[randInt(0, ds.length - 1, rand)]];
  }
  const d = randInt(2, 9, rand);
  return [randInt(min, max, rand) * d, d];
}

const BUILDERS = { add: addition, sub: subtraction, mul: multiplication, div: division };
const SOLVE = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
};

export function createProblem(op, range, rand = Math.random) {
  if (!BUILDERS[op]) throw new Error(`Unknown op: ${op}`);
  const [a, b] = BUILDERS[op](range, rand);
  return {
    op, a, b, answer: SOLVE[op](a, b),
    display: `${a} ${SYMBOLS[op]} ${b}`,
    speech: `כמה זה ${a} ${WORDS[op]} ${b}?`,
  };
}

// ops: [{ id, min, max }]. Avoids repeating the previous problem when possible.
export function generateProblem(ops, previous = null, rand = Math.random) {
  let problem;
  for (let i = 0; i < 10; i++) {
    const op = ops[randInt(0, ops.length - 1, rand)];
    problem = createProblem(op.id, op, rand);
    if (!previous || problem.display !== previous.display) break;
  }
  return problem;
}
