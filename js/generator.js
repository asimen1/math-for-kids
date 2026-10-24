// Random problem generation. Subtraction never goes negative; division is always exact.

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

// Picks a dividend in range and one of its divisors, preferring non-trivial ones (not 1 or itself).
function division({ min, max }, rand) {
  for (let i = 0; i < 40; i++) {
    const n = randInt(min, max, rand);
    const ds = properDivisors(n);
    if (ds.length) return [n, ds[randInt(0, ds.length - 1, rand)]];
  }
  if (max === 0) return [0, 1];
  const n = randInt(Math.max(min, 1), max, rand);
  return [n, rand() < 0.5 ? 1 : n];
}

export function createProblem(op, range, rand = Math.random) {
  let a = randInt(range.min, range.max, rand);
  let b = randInt(range.min, range.max, rand);
  let answer;
  switch (op) {
    case 'add':
      answer = a + b;
      break;
    case 'sub':
      if (a < b) [a, b] = [b, a];
      answer = a - b;
      break;
    case 'mul':
      answer = a * b;
      break;
    case 'div':
      [a, b] = division(range, rand);
      answer = a / b;
      break;
    default:
      throw new Error(`Unknown op: ${op}`);
  }
  return {
    op, a, b, answer,
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
