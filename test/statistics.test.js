import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sum,
  mean,
  median,
  variance,
  stdDev,
  coefficientOfVariation,
  minMax,
  frequency,
  shannonEntropy,
  stringEntropy,
  normalizedStringEntropy,
  histogram,
  oddEvenRatio,
  uniqueRatio,
  bimodalityScore,
  clamp,
  round,
} from '../js/utils/statistics.js';

test('sum adds values, empty is 0', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
  assert.equal(sum([]), 0);
  assert.equal(sum([-2, 2]), 0);
});

test('mean of a known array; empty array is 0', () => {
  assert.equal(mean([1, 2, 3, 4, 5]), 3);
  assert.equal(mean([2, 4]), 3);
  assert.equal(mean([]), 0);
});

test('median for odd and even lengths, unsorted input', () => {
  assert.equal(median([3, 1, 2]), 2); // odd
  assert.equal(median([1, 2, 3, 4]), 2.5); // even -> average of middle two
  assert.equal(median([10, 2, 8, 4]), 6); // even, unsorted -> (4+8)/2
  assert.equal(median([]), 0);
  // Does not mutate the input.
  const input = [5, 1, 3];
  median(input);
  assert.deepEqual(input, [5, 1, 3]);
});

test('variance is population variance; stdDev is its root', () => {
  // [1,2,3,4,5] mean 3, deviations^2 = 4,1,0,1,4 => 10/5 = 2
  assert.equal(variance([1, 2, 3, 4, 5]), 2);
  assert.equal(stdDev([1, 2, 3, 4, 5]), Math.sqrt(2));
  // constant array -> 0
  assert.equal(variance([7, 7, 7]), 0);
  assert.equal(stdDev([7, 7, 7]), 0);
  assert.equal(variance([]), 0);
});

test('coefficientOfVariation = stdDev / |mean|; 0 when mean is 0', () => {
  // [2,4,6,8] mean 5, var = (9+1+1+9)/4 = 5, std = sqrt(5)
  const cv = coefficientOfVariation([2, 4, 6, 8]);
  assert.ok(Math.abs(cv - Math.sqrt(5) / 5) < 1e-12);
  // constant cadence -> CV 0
  assert.equal(coefficientOfVariation([3, 3, 3, 3]), 0);
  // mean 0 -> guarded to 0
  assert.equal(coefficientOfVariation([-1, 1]), 0);
});

test('minMax finds bounds; empty gives {0,0}', () => {
  assert.deepEqual(minMax([3, -1, 7, 2]), { min: -1, max: 7 });
  assert.deepEqual(minMax([5]), { min: 5, max: 5 });
  assert.deepEqual(minMax([]), { min: 0, max: 0 });
});

test('frequency counts distinct occurrences', () => {
  const f = frequency(['a', 'b', 'a', 'c', 'a', 'b']);
  assert.equal(f.get('a'), 3);
  assert.equal(f.get('b'), 2);
  assert.equal(f.get('c'), 1);
  assert.equal(f.size, 3);
});

test('shannonEntropy: 0 for constant, 1 bit for balanced binary, 2 bits for 4 equal', () => {
  assert.equal(shannonEntropy(['x', 'x', 'x', 'x']), 0);
  assert.equal(shannonEntropy([]), 0);
  assert.ok(Math.abs(shannonEntropy(['a', 'b']) - 1) < 1e-12);
  assert.ok(Math.abs(shannonEntropy(['a', 'b', 'a', 'b']) - 1) < 1e-12);
  assert.ok(Math.abs(shannonEntropy(['a', 'b', 'c', 'd']) - 2) < 1e-12);
});

test('stringEntropy matches shannonEntropy of the characters', () => {
  assert.equal(stringEntropy('aaaa'), 0);
  assert.ok(Math.abs(stringEntropy('ab') - 1) < 1e-12);
  assert.ok(Math.abs(stringEntropy('abcd') - 2) < 1e-12);
  // coerces non-strings via String()
  assert.equal(stringEntropy(1111), 0);
});

test('normalizedStringEntropy stays in [0, 1]', () => {
  assert.equal(normalizedStringEntropy(''), 0);
  // single distinct char -> 0 (guard against log2(1))
  assert.equal(normalizedStringEntropy('aaaa'), 0);
  // perfectly balanced over its own alphabet -> 1
  assert.ok(Math.abs(normalizedStringEntropy('abcd') - 1) < 1e-12);
  assert.ok(Math.abs(normalizedStringEntropy('ab') - 1) < 1e-12);
  // sample many strings; always within [0,1]
  for (const s of ['abcabc', 'hello world', 'aabbccdd', 'xyz', '112233']) {
    const v = normalizedStringEntropy(s);
    assert.ok(v >= 0 && v <= 1, `${s} -> ${v}`);
  }
  // explicit alphabet size larger than seen distinct chars lowers the ratio below 1
  const v = normalizedStringEntropy('abcd', 8);
  assert.ok(v > 0 && v < 1, `explicit alphabet -> ${v}`);
});

test('histogram bin counts sum to the number of in-range values', () => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const h = histogram(values, { bins: 5, min: 0, max: 10 });
  assert.equal(h.bins.length, 5);
  assert.equal(h.binWidth, 2);
  const total = h.bins.reduce((acc, b) => acc + b.count, 0);
  assert.equal(total, values.length); // all in range
});

test('histogram excludes out-of-range values from the counts', () => {
  const values = [-5, 0, 5, 10, 15];
  const h = histogram(values, { bins: 4, min: 0, max: 10 });
  const total = h.bins.reduce((acc, b) => acc + b.count, 0);
  // -5 and 15 are outside [0,10] and are dropped; 0, 5, 10 remain.
  assert.equal(total, 3);
});

test('histogram puts the max edge in the last bin', () => {
  const h = histogram([10], { bins: 5, min: 0, max: 10 });
  const total = h.bins.reduce((acc, b) => acc + b.count, 0);
  assert.equal(total, 1);
  assert.equal(h.bins[h.bins.length - 1].count, 1, 'max lands in final bin');
  assert.equal(h.bins[0].count, 0);
});

test('histogram derives min/max from data when not supplied', () => {
  const values = [2, 4, 6, 8];
  const h = histogram(values, { bins: 4 });
  assert.equal(h.min, 2);
  assert.equal(h.max, 8);
  const total = h.bins.reduce((acc, b) => acc + b.count, 0);
  assert.equal(total, values.length);
});

test('histogram guards degenerate range (max <= min) by widening', () => {
  const h = histogram([5, 5, 5], { bins: 3 });
  assert.ok(h.max > h.min, 'range widened');
  const total = h.bins.reduce((acc, b) => acc + b.count, 0);
  assert.equal(total, 3);
});

test('oddEvenRatio splits integers by parity', () => {
  const r = oddEvenRatio([1, 2, 3, 4, 5]);
  assert.equal(r.odd, 3);
  assert.equal(r.even, 2);
  assert.equal(r.total, 5);
  assert.ok(Math.abs(r.oddRatio - 0.6) < 1e-12);
  // empty -> oddRatio guarded to 0
  assert.deepEqual(oddEvenRatio([]), { odd: 0, even: 0, total: 0, oddRatio: 0 });
});

test('oddEvenRatio truncates toward zero via | 0 for parity', () => {
  // 2.9 | 0 === 2 (even); 3.9 | 0 === 3 (odd)
  const r = oddEvenRatio([2.9, 3.9]);
  assert.equal(r.even, 1);
  assert.equal(r.odd, 1);
});

test('uniqueRatio = distinct / total; empty is 0', () => {
  assert.equal(uniqueRatio([1, 1, 2, 3]), 0.75);
  assert.equal(uniqueRatio(['a', 'a', 'a']), 1 / 3);
  assert.equal(uniqueRatio([1, 2, 3, 4]), 1);
  assert.equal(uniqueRatio([]), 0);
});

test('bimodalityScore is higher for two tight clusters than for a uniform spread', () => {
  const twoClusters = [];
  for (let i = 0; i < 50; i++) twoClusters.push(0 + (i % 3) * 0.01); // ~0
  for (let i = 0; i < 50; i++) twoClusters.push(10 + (i % 3) * 0.01); // ~10
  const uniform = Array.from({ length: 100 }, (_, i) => i * (10 / 99)); // 0..10 evenly

  const sClusters = bimodalityScore(twoClusters);
  const sUniform = bimodalityScore(uniform);

  assert.ok(sClusters >= 0 && sClusters <= 1, `cluster score in [0,1] got ${sClusters}`);
  assert.ok(sUniform >= 0 && sUniform <= 1, `uniform score in [0,1] got ${sUniform}`);
  assert.ok(sClusters > sUniform, `bimodal ${sClusters} should exceed uniform ${sUniform}`);
  assert.ok(sClusters > 0.5, `tight two-level clusters should score high got ${sClusters}`);
});

test('bimodalityScore returns 0 for tiny samples or a constant', () => {
  assert.equal(bimodalityScore([1, 2, 3]), 0); // fewer than 4
  assert.equal(bimodalityScore([5, 5, 5, 5]), 0); // no spread
});

test('clamp keeps values within [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('round returns a Number rounded to given decimals (default 2)', () => {
  assert.equal(round(3.14159), 3.14);
  assert.equal(round(3.14159, 3), 3.142);
  assert.equal(round(2.5, 0), 3);
  assert.equal(round(10), 10);
  assert.equal(typeof round(1.23456), 'number');
});
