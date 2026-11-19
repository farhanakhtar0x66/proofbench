// Race tasks: small JavaScript modules with real bugs and node:test suites.
// Each runs inside the Node permission sandbox (no network, no child
// processes, no file access outside its own folder).

export interface RaceTask {
  id: string;
  title: string;
  /** What a developer would type into a coding agent. */
  prompt: string;
  file: string;
  source: string;
  testFile: string;
  tests: string;
  difficulty: 'routine' | 'tricky';
}

const header = "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\n";

export const RACE_TASKS: RaceTask[] = [
  {
    id: 'slugify',
    title: 'Slugs keep double dashes',
    difficulty: 'routine',
    prompt: 'slugify() should lowercase, turn every run of non-alphanumerics into one dash and trim dashes at both ends. Fix it.',
    file: 'slugify.js',
    source: `'use strict';
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '-');
}
module.exports = { slugify };
`,
    testFile: 'slugify.test.js',
    tests: `${header}const { slugify } = require('./slugify.js');
test('basic', () => assert.equal(slugify('Hello World'), 'hello-world'));
test('runs collapse', () => assert.equal(slugify('Rock  &  Roll!!'), 'rock-roll'));
test('trims ends', () => assert.equal(slugify('  --Bifrost Gateway--  '), 'bifrost-gateway'));
test('digits kept', () => assert.equal(slugify('Top 10 Agents'), 'top-10-agents'));
`,
  },
  {
    id: 'median',
    title: 'Median of numbers is wrong',
    difficulty: 'tricky',
    prompt: 'median() returns wrong answers for numbers above 9 and for even-length input, and it mutates the caller\'s array. Fix it.',
    file: 'stats.js',
    source: `'use strict';
function median(xs) {
  if (xs.length === 0) throw new RangeError('empty');
  const s = xs.sort();
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m] + s[m + 1]) / 2;
}
module.exports = { median };
`,
    testFile: 'stats.test.js',
    tests: `${header}const { median } = require('./stats.js');
test('odd', () => assert.equal(median([3, 1, 2]), 2));
test('numeric sort', () => assert.equal(median([10, 9, 100]), 10));
test('even', () => assert.equal(median([4, 1, 3, 2]), 2.5));
test('even numeric', () => assert.equal(median([10, 2, 30, 4]), 7));
test('does not mutate', () => { const xs = [3, 1, 2]; median(xs); assert.deepEqual(xs, [3, 1, 2]); });
test('empty throws', () => assert.throws(() => median([]), RangeError));
`,
  },
  {
    id: 'lru',
    title: 'LRU cache evicts the wrong entry',
    difficulty: 'tricky',
    prompt: 'LRUCache should evict the least recently USED key. Reading a key with get() must count as a use, and set() on an existing key must update it without growing the cache. Fix it.',
    file: 'lru.js',
    source: `'use strict';
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
  }
  get(key) {
    return this.map.get(key);
  }
  set(key, value) {
    if (this.map.size >= this.capacity) {
      const newest = [...this.map.keys()].pop();
      this.map.delete(newest);
    }
    this.map.set(key, value);
  }
  get size() {
    return this.map.size;
  }
}
module.exports = { LRUCache };
`,
    testFile: 'lru.test.js',
    tests: `${header}const { LRUCache } = require('./lru.js');
test('evicts oldest', () => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.set('c', 3); assert.equal(c.get('a'), undefined); assert.equal(c.get('b'), 2); assert.equal(c.get('c'), 3); });
test('get refreshes', () => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3); assert.equal(c.get('a'), 1); assert.equal(c.get('b'), undefined); });
test('update keeps size', () => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.set('a', 10); assert.equal(c.size, 2); assert.equal(c.get('a'), 10); assert.equal(c.get('b'), 2); });
test('update refreshes', () => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.set('a', 10); c.set('c', 3); assert.equal(c.get('b'), undefined); assert.equal(c.get('a'), 10); });
test('missing is undefined', () => { const c = new LRUCache(1); assert.equal(c.get('x'), undefined); });
`,
  },
  {
    id: 'duration',
    title: 'Duration parser drops units',
    difficulty: 'routine',
    prompt: 'parseDuration("1h30m15s") should return total seconds. Units are d, h, m and s, each optional, numbers can have several digits, and bad input must throw. Fix it.',
    file: 'duration.js',
    source: `'use strict';
const UNITS = { h: 60, m: 60, s: 1 };
function parseDuration(text) {
  let total = 0;
  for (const [, n, unit] of text.matchAll(/(\\d)([hms])/g)) total += Number(n) * UNITS[unit];
  return total;
}
module.exports = { parseDuration };
`,
    testFile: 'duration.test.js',
    tests: `${header}const { parseDuration } = require('./duration.js');
test('hms', () => assert.equal(parseDuration('1h30m15s'), 5415));
test('multi digit', () => assert.equal(parseDuration('90m'), 5400));
test('days', () => assert.equal(parseDuration('2d3h'), 183600));
test('seconds only', () => assert.equal(parseDuration('45s'), 45));
test('bad input throws', () => assert.throws(() => parseDuration('soon')));
test('empty throws', () => assert.throws(() => parseDuration('')));
`,
  },
  {
    id: 'intervals',
    title: 'Booking intervals do not merge',
    difficulty: 'tricky',
    prompt: 'mergeIntervals() must merge overlapping AND touching [start, end] pairs in any input order, return them sorted, and never mutate the input. Fix it.',
    file: 'intervals.js',
    source: `'use strict';
function mergeIntervals(list) {
  const out = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv[0] < last[1]) last[1] = iv[1];
    else out.push(iv);
  }
  return out;
}
module.exports = { mergeIntervals };
`,
    testFile: 'intervals.test.js',
    tests: `${header}const { mergeIntervals } = require('./intervals.js');
test('overlap', () => assert.deepEqual(mergeIntervals([[1, 3], [2, 6]]), [[1, 6]]));
test('touching', () => assert.deepEqual(mergeIntervals([[1, 2], [2, 4]]), [[1, 4]]));
test('unsorted', () => assert.deepEqual(mergeIntervals([[8, 10], [1, 3], [2, 4]]), [[1, 4], [8, 10]]));
test('contained', () => assert.deepEqual(mergeIntervals([[1, 10], [2, 3]]), [[1, 10]]));
test('no mutation', () => { const input = [[3, 4], [1, 2]]; mergeIntervals(input); assert.deepEqual(input, [[3, 4], [1, 2]]); });
test('empty', () => assert.deepEqual(mergeIntervals([]), []));
`,
  },
  {
    id: 'semver',
    title: 'Release ordering puts rc after final',
    difficulty: 'tricky',
    prompt: 'compareVersions(a, b) must follow SemVer 2.0 precedence and return -1, 0 or 1. Build metadata (+...) is ignored, and a pre-release is lower than the release. Fix it.',
    file: 'semver.js',
    source: `'use strict';
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}
module.exports = { compareVersions };
`,
    testFile: 'semver.test.js',
    tests: `${header}const { compareVersions: cmp } = require('./semver.js');
test('core', () => { assert.equal(cmp('1.2.10', '1.2.9'), 1); assert.equal(cmp('2.0.0', '10.0.0'), -1); });
test('equal', () => assert.equal(cmp('1.0.0', '1.0.0'), 0));
test('prerelease below release', () => { assert.equal(cmp('1.0.0-rc.1', '1.0.0'), -1); assert.equal(cmp('1.0.0', '1.0.0-alpha'), 1); });
test('spec order', () => {
  const order = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i < order.length - 1; i++) assert.equal(cmp(order[i], order[i + 1]), -1, order[i] + ' < ' + order[i + 1]);
});
test('build metadata ignored', () => assert.equal(cmp('1.0.0+build.5', '1.0.0+build.9'), 0));
test('sort works', () => assert.deepEqual(['1.0.0', '1.0.0-rc.1', '0.9.9'].sort(cmp), ['0.9.9', '1.0.0-rc.1', '1.0.0']));
`,
  },
  {
    id: 'calc',
    title: 'Calculator ignores precedence',
    difficulty: 'tricky',
    prompt: 'evaluate(expr) must handle + - * / ^, parentheses, unary minus and decimals with normal precedence; ^ is right-associative and binds tighter than unary minus. Throw on malformed input. Fix it without using eval or Function.',
    file: 'calc.js',
    source: `'use strict';
function evaluate(expr) {
  const tokens = expr.match(/\\d+|[-+*/^()]/g) || [];
  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (op === '+') result += n;
    else if (op === '-') result -= n;
    else if (op === '*') result *= n;
    else if (op === '/') result /= n;
    else if (op === '^') result **= n;
  }
  return result;
}
module.exports = { evaluate };
`,
    testFile: 'calc.test.js',
    tests: `${header}const { evaluate } = require('./calc.js');
const fs = require('node:fs');
test('precedence', () => assert.equal(evaluate('2 + 3 * 4'), 14));
test('parentheses', () => assert.equal(evaluate('(2 + 3) * 4'), 20));
test('right assoc power', () => assert.equal(evaluate('2 ^ 3 ^ 2'), 512));
test('unary minus', () => { assert.equal(evaluate('-2 ^ 2'), -4); assert.equal(evaluate('(-2) ^ 2'), 4); assert.equal(evaluate('3 - -2'), 5); });
test('decimals', () => assert.equal(evaluate('1.5 * 4 / 0.5'), 12));
test('nested', () => assert.equal(evaluate('2 * (3 + (4 - 1)) ^ 2'), 72));
test('malformed throws', () => { assert.throws(() => evaluate('2 +')); assert.throws(() => evaluate('(1 + 2')); assert.throws(() => evaluate('4 $ 2')); });
test('no eval', () => { const src = fs.readFileSync(__dirname + '/calc.js', 'utf8'); assert.ok(!/\\beval\\s*\\(|new Function|Function\\s*\\(/.test(src)); });
`,
  },
  {
    id: 'csv',
    title: 'CSV import splits quoted commas',
    difficulty: 'tricky',
    prompt: 'parseCSV(text) must follow RFC 4180: quoted fields may contain commas, line breaks and doubled quotes (""), rows end with \\n or \\r\\n, and a trailing newline adds no empty row. Return an array of rows. Fix it.',
    file: 'csv.js',
    source: `'use strict';
function parseCSV(text) {
  return text.split('\\n').map(line => line.split(','));
}
module.exports = { parseCSV };
`,
    testFile: 'csv.test.js',
    tests: `${header}const { parseCSV } = require('./csv.js');
test('simple', () => assert.deepEqual(parseCSV('a,b\\n1,2'), [['a', 'b'], ['1', '2']]));
test('quoted comma', () => assert.deepEqual(parseCSV('name,city\\n"Doe, Jane",Pune'), [['name', 'city'], ['Doe, Jane', 'Pune']]));
test('escaped quotes', () => assert.deepEqual(parseCSV('"say ""hi""",x'), [['say "hi"', 'x']]));
test('newline in quotes', () => assert.deepEqual(parseCSV('"line1\\nline2",z'), [['line1\\nline2', 'z']]));
test('crlf and trailing newline', () => assert.deepEqual(parseCSV('a,b\\r\\nc,d\\r\\n'), [['a', 'b'], ['c', 'd']]));
test('empty fields', () => assert.deepEqual(parseCSV(',x,\\n'), [['', 'x', '']]));
`,
  },
];

export function findTask(id: string): RaceTask | undefined {
  return RACE_TASKS.find(task => task.id === id);
}
