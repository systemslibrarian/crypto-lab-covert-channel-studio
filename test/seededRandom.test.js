import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashSeed, createRng } from '../js/utils/seededRandom.js';

test('hashSeed returns a uint32 and is deterministic', () => {
  const h = hashSeed('HELLO');
  assert.equal(Number.isInteger(h), true);
  assert.ok(h >= 0 && h <= 0xffffffff, 'in uint32 range');
  // Deterministic exact value (mulberry32/FNV-1a is auditable).
  assert.equal(h, 844380939);
  // Same input -> same hash.
  assert.equal(hashSeed('HELLO'), 844380939);
});

test('hashSeed coerces via String(), so 42 and "42" collide', () => {
  assert.equal(hashSeed(42), hashSeed('42'));
});

test('same seed produces an identical next() sequence', () => {
  const a = createRng('seed-xyz');
  const b = createRng('seed-xyz');
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('createRng("HELLO") yields the exact expected first samples', () => {
  const r = createRng('HELLO');
  const seq = [r.next(), r.next(), r.next(), r.next(), r.next()];
  assert.deepEqual(seq, [
    0.45481246314011514,
    0.6392051836010069,
    0.2470187800936401,
    0.5783829702995718,
    0.21288315649144351,
  ]);
});

test('different seeds produce different sequences', () => {
  const a = createRng('alpha');
  const b = createRng('bravo');
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('next() is always in [0, 1)', () => {
  const r = createRng('range-check');
  for (let i = 0; i < 5000; i++) {
    const v = r.next();
    assert.ok(v >= 0, `>= 0 got ${v}`);
    assert.ok(v < 1, `< 1 got ${v}`);
  }
});

test('int(min, max) stays within inclusive bounds and hits both edges', () => {
  const r = createRng('int-bounds');
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = r.int(3, 9);
    assert.ok(Number.isInteger(v), 'integer result');
    assert.ok(v >= 3 && v <= 9, `within [3,9] got ${v}`);
    if (v === 3) sawMin = true;
    if (v === 9) sawMax = true;
  }
  assert.ok(sawMin, 'lower bound reachable');
  assert.ok(sawMax, 'upper bound (inclusive) reachable');
});

test('int(min, max) returns lo when hi < lo', () => {
  const r = createRng('inverted');
  assert.equal(r.int(10, 4), 10);
});

test('int with equal bounds always returns that value', () => {
  const r = createRng('single');
  for (let i = 0; i < 100; i++) {
    assert.equal(r.int(7, 7), 7);
  }
});

test('float(min, max) stays within [min, max)', () => {
  const r = createRng('float-range');
  for (let i = 0; i < 2000; i++) {
    const v = r.float(-2, 5);
    assert.ok(v >= -2 && v < 5, `within [-2,5) got ${v}`);
  }
});

test('pick returns an element that is a member of the array', () => {
  const r = createRng('pick-seed');
  const arr = ['w', 'x', 'y', 'z'];
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = r.pick(arr);
    assert.ok(arr.includes(v), `member of arr got ${v}`);
    seen.add(v);
  }
  // Over many draws every element should show up at least once.
  assert.equal(seen.size, arr.length);
});

test('shuffle is a permutation (same multiset) of the input', () => {
  const r = createRng('shuffle-perm');
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = r.shuffle(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  // Does not mutate the input array.
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('shuffle is deterministic per seed', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = createRng('same').shuffle(input);
  const b = createRng('same').shuffle(input);
  assert.deepEqual(a, b);
  // Exact expected ordering for seed "HELLO".
  const h = createRng('HELLO').shuffle(input);
  assert.deepEqual(h, [8, 6, 7, 1, 3, 2, 5, 4]);
});

test('shuffle with different seeds generally differs', () => {
  const input = Array.from({ length: 20 }, (_, i) => i);
  const a = createRng('one').shuffle(input);
  const b = createRng('two').shuffle(input);
  assert.notDeepEqual(a, b);
});

test('bool(p) respects the probability roughly', () => {
  const r = createRng('bool-seed');
  let trues = 0;
  const n = 10000;
  for (let i = 0; i < n; i++) if (r.bool(0.3)) trues++;
  const frac = trues / n;
  assert.ok(Math.abs(frac - 0.3) < 0.03, `~0.3 got ${frac}`);
});

test('gaussian mean/std are approximately correct over many samples', () => {
  const r = createRng('gauss-seed');
  const n = 40000;
  const mean = 5;
  const std = 2;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = r.gaussian(mean, std);
    s += v;
    s2 += v * v;
  }
  const empMean = s / n;
  const empVar = s2 / n - empMean * empMean;
  const empStd = Math.sqrt(empVar);
  assert.ok(Math.abs(empMean - mean) < 0.1, `mean ~${mean} got ${empMean}`);
  assert.ok(Math.abs(empStd - std) < 0.1, `std ~${std} got ${empStd}`);
});

test('gaussian defaults to standard normal (mean 0, std 1)', () => {
  const r = createRng('gauss-default');
  const n = 40000;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = r.gaussian();
    s += v;
    s2 += v * v;
  }
  const empMean = s / n;
  const empStd = Math.sqrt(s2 / n - empMean * empMean);
  assert.ok(Math.abs(empMean) < 0.05, `mean ~0 got ${empMean}`);
  assert.ok(Math.abs(empStd - 1) < 0.05, `std ~1 got ${empStd}`);
});

test('state() advances as next() is drawn and is reproducible per seed', () => {
  const a = createRng('state-seed');
  const b = createRng('state-seed');
  const before = a.state();
  a.next();
  const after = a.state();
  assert.notEqual(before, after);
  // A second identical RNG walks through the same states.
  assert.equal(b.state(), before);
  b.next();
  assert.equal(b.state(), after);
});
