/**
 * Known-answer tests for the published detection methods in utils/statistics.js.
 * These lock the formulas (chi-square critical values, CCE/Cabuk direction,
 * KL divergence, permutation capacity) so detector behaviour can't silently
 * drift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  klDivergenceBits, cabukRegularity, correctedConditionalEntropy,
  chiSquare, chiSquareUpperProbability, permutationCapacityBits,
} from '../js/utils/statistics.js';

test('KL divergence: zero against itself, positive and monotone otherwise', () => {
  const q = { a: 0.5, b: 0.5 };
  assert.ok(Math.abs(klDivergenceBits({ a: 50, b: 50 }, q)) < 1e-9, 'identical distribution -> 0');
  const mild = klDivergenceBits({ a: 70, b: 30 }, q);
  const strong = klDivergenceBits({ a: 99, b: 1 }, q);
  assert.ok(mild > 0 && strong > mild, 'more skew -> larger divergence');
  // A symbol absent from the baseline is very surprising (floored probability).
  assert.ok(klDivergenceBits({ z: 100 }, q) > 5, 'off-baseline symbol -> large divergence');
});

test('Cabuk regularity: ~0 for constant variability, higher when it changes', () => {
  const constant = [];
  for (let i = 0; i < 100; i++) constant.push(i % 2 ? 300 : 100); // every window same spread
  assert.ok(cabukRegularity(constant, 10) < 1e-9, 'constant per-window spread -> ~0');

  const changing = [];
  for (let i = 0; i < 100; i++) changing.push(i < 50 ? (i % 2 ? 300 : 100) : (i % 2 ? 105 : 100));
  assert.ok(cabukRegularity(changing, 10) > cabukRegularity(constant, 10), 'changing spread -> higher');

  assert.ok(Number.isNaN(cabukRegularity([1, 2, 3], 10)), 'too few windows -> NaN');
});

test('Corrected conditional entropy: low for regular, high for complex', () => {
  const twoLevel = [];
  for (let i = 0; i < 200; i++) twoLevel.push(i % 2 ? 300 : 100);
  const regular = correctedConditionalEntropy(twoLevel).cce;

  // Deterministic pseudo-random series (LCG) — complex, high CCE.
  const rnd = [];
  let s = 1;
  for (let i = 0; i < 200; i++) { s = (s * 1103515245 + 12345) % 2147483648; rnd.push(50 + (s % 400)); }
  const complex = correctedConditionalEntropy(rnd).cce;

  assert.ok(regular < 1, `regular series has low CCE (got ${regular})`);
  assert.ok(complex > regular + 1, `complex series has much higher CCE (got ${complex})`);
});

test('Chi-square upper-tail matches textbook 0.05 critical values', () => {
  assert.ok(Math.abs(chiSquareUpperProbability(3.841, 1) - 0.05) < 0.01, 'Q(3.841,1) ≈ 0.05');
  assert.ok(Math.abs(chiSquareUpperProbability(11.070, 5) - 0.05) < 0.01, 'Q(11.070,5) ≈ 0.05');
  assert.equal(chiSquareUpperProbability(0, 4), 1, 'Q(0,k) = 1');
  assert.ok(chiSquareUpperProbability(1000, 4) < 1e-6, 'huge chi-square -> ~0');
  // Monotone decreasing in x.
  assert.ok(chiSquareUpperProbability(2, 3) > chiSquareUpperProbability(8, 3));
});

test('Chi-square statistic: zero when observed equals expected', () => {
  const { chiSquare: chi, dof } = chiSquare([25, 25, 25, 25], [25, 25, 25, 25]);
  assert.equal(chi, 0);
  assert.equal(dof, 3);
  const skew = chiSquare([40, 10], [25, 25]).chiSquare;
  assert.ok(skew > 0);
});

test('Permutation capacity ⌊log2(n!)⌋', () => {
  assert.equal(permutationCapacityBits(1), 0);
  assert.equal(permutationCapacityBits(2), 1); // log2(2)=1
  assert.equal(permutationCapacityBits(3), 2); // log2(6)=2.58 -> 2
  assert.equal(permutationCapacityBits(5), 6); // log2(120)=6.9 -> 6
  assert.equal(permutationCapacityBits(10), 21); // log2(3628800)=21.79 -> 21
});
