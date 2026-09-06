/**
 * Tests for js/channels/ordering.js — the simulated packet-ordering covert
 * channel where a bit lives purely in the ORDER of two interchangeable events.
 *
 * Node built-in runner only. Deterministic: fixed seeds and fixed parameters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeBitsToOrdering,
  decodeOrdering,
  applyReordering,
  simulateOrderingRun,
} from '../js/channels/ordering.js';

import { textToBits } from '../js/utils/bits.js';

test('encodeBitsToOrdering: bit 0 => A before B (first === "A")', () => {
  const pairs = encodeBitsToOrdering([0]);
  assert.equal(pairs.length, 1);
  const p = pairs[0];
  assert.equal(p.bit, 0);
  assert.equal(p.first, 'A');
  assert.equal(p.second, 'B');
  // The stored events are pre-sorted by timestamp; A must arrive first.
  assert.equal(p.events[0].tag, 'A');
  assert.equal(p.events[1].tag, 'B');
  assert.ok(p.events[0].t < p.events[1].t);
});

test('encodeBitsToOrdering: bit 1 => B before A (first === "B")', () => {
  const pairs = encodeBitsToOrdering([1]);
  const p = pairs[0];
  assert.equal(p.bit, 1);
  assert.equal(p.first, 'B');
  assert.equal(p.second, 'A');
  assert.equal(p.events[0].tag, 'B');
  assert.equal(p.events[1].tag, 'A');
  assert.ok(p.events[0].t < p.events[1].t);
});

test('encodeBitsToOrdering: exact timestamps and structure for [0, 1]', () => {
  // Default gapMs = 20, startTimeMs = 0. base = i * gapMs * 3 = i * 60.
  const pairs = encodeBitsToOrdering([0, 1]);
  assert.equal(pairs.length, 2);

  // Pair 0 (bit 0): A at base(0), B at base+gap(20).
  const p0 = pairs[0];
  assert.equal(p0.index, 0);
  assert.equal(p0.first, 'A');
  const a0 = p0.events.find((e) => e.tag === 'A');
  const b0 = p0.events.find((e) => e.tag === 'B');
  assert.equal(a0.t, 0);
  assert.equal(b0.t, 20);
  assert.equal(a0.pairIndex, 0);
  assert.equal(a0.id, 'A0');
  assert.equal(b0.id, 'B0');

  // Pair 1 (bit 1): base = 60. B at base(60), A at base+gap(80).
  const p1 = pairs[1];
  assert.equal(p1.index, 1);
  assert.equal(p1.first, 'B');
  const a1 = p1.events.find((e) => e.tag === 'A');
  const b1 = p1.events.find((e) => e.tag === 'B');
  assert.equal(b1.t, 60);
  assert.equal(a1.t, 80);
  assert.equal(a1.id, 'A1');
  assert.equal(b1.id, 'B1');
});

test('encodeBitsToOrdering respects startTimeMs and gapMs options', () => {
  const pairs = encodeBitsToOrdering([0, 0], { startTimeMs: 100, gapMs: 10 });
  // Pair i base = 100 + i * 10 * 3 = 100 + i*30.
  const a0 = pairs[0].events.find((e) => e.tag === 'A');
  const b0 = pairs[0].events.find((e) => e.tag === 'B');
  assert.equal(a0.t, 100);
  assert.equal(b0.t, 110);
  const a1 = pairs[1].events.find((e) => e.tag === 'A');
  assert.equal(a1.t, 130);
});

test('decodeOrdering(encodeBitsToOrdering(bits)) deep-equals bits (round trip)', () => {
  const cases = [
    [0],
    [1],
    [0, 1],
    [1, 0],
    [0, 0, 1, 1, 0, 1, 0, 0],
    textToBits('HI'),
    textToBits('Covert!'),
  ];
  for (const bits of cases) {
    const decoded = decodeOrdering(encodeBitsToOrdering(bits));
    assert.deepEqual(decoded, bits);
  }
});

test('decodeOrdering on empty input returns []', () => {
  assert.deepEqual(decodeOrdering(encodeBitsToOrdering([])), []);
});

test('simulateOrderingRun("HI", {reorderProb:0}) recovers "HI" with 0 bit errors', () => {
  const run = simulateOrderingRun('HI', { reorderProb: 0 });
  assert.deepEqual(run.bits, textToBits('HI'));
  assert.deepEqual(run.decodedBits, run.bits);
  assert.equal(run.bitErrors, 0);
  assert.equal(run.bitErrorRate, 0);
  assert.equal(run.recoveredText, 'HI');
  // With prob 0 nothing should be marked reordered.
  assert.ok(run.pairs.every((p) => p.reordered === false));
});

test('applyReordering with prob 1 flips every pair (decoded bits are the complement)', () => {
  const bits = [0, 1, 0, 0, 1, 0, 0, 0];
  const clean = encodeBitsToOrdering(bits);
  const reordered = applyReordering(clean, { prob: 1, seed: 'flip-all' });

  // Every pair is reordered.
  assert.ok(reordered.every((p) => p.reordered === true));

  // Decoded bits are the exact bitwise complement of the input.
  const decoded = decodeOrdering(reordered);
  const complement = bits.map((b) => b ^ 1);
  assert.deepEqual(decoded, complement);

  // The "first" tag flips relative to the clean encoding for every pair.
  for (let i = 0; i < clean.length; i++) {
    assert.notEqual(reordered[i].first, clean[i].first);
    assert.equal(reordered[i].first, clean[i].second);
  }
});

test('applyReordering with prob 0 leaves order untouched (no reorder, no bit change)', () => {
  const bits = [1, 0, 1, 1];
  const clean = encodeBitsToOrdering(bits);
  const out = applyReordering(clean, { prob: 0, seed: 'unused' });
  assert.ok(out.every((p) => p.reordered === false));
  assert.deepEqual(decodeOrdering(out), bits);
});

test('reordering causes bit errors: high reorderProb yields bitErrors > 0', () => {
  const run = simulateOrderingRun('HI', { reorderProb: 0.9, seed: 'noisy-1' });
  assert.ok(run.bitErrors > 0, `expected bitErrors > 0, got ${run.bitErrors}`);
  assert.ok(run.bitErrors <= run.bits.length);
  assert.ok(run.bitErrorRate > 0 && run.bitErrorRate <= 1);
});

test('simulateOrderingRun with reorderProb 1 flips every bit (bitErrors === bits.length)', () => {
  const run = simulateOrderingRun('HI', { reorderProb: 1, seed: 'anything' });
  assert.equal(run.bitErrors, run.bits.length);
  assert.equal(run.bitErrorRate, 1);
  // Decoded bits are the complement of the source bits.
  const complement = run.bits.map((b) => b ^ 1);
  assert.deepEqual(run.decodedBits, complement);
});

test('determinism: same seed + params reproduces identical simulated run', () => {
  const opts = { reorderProb: 0.5, seed: 'repro-seed-42' };
  const a = simulateOrderingRun('Hello, world!', opts);
  const b = simulateOrderingRun('Hello, world!', opts);

  assert.deepEqual(a.decodedBits, b.decodedBits);
  assert.equal(a.bitErrors, b.bitErrors);
  assert.equal(a.bitErrorRate, b.bitErrorRate);
  // Full structural determinism, including per-pair reordered flags and events.
  assert.deepEqual(a.pairs, b.pairs);
});

test('determinism: applyReordering is stable across calls with the same seed', () => {
  const clean = encodeBitsToOrdering(textToBits('seed-check'));
  const r1 = applyReordering(clean, { prob: 0.4, seed: 'stable-seed' });
  const r2 = applyReordering(clean, { prob: 0.4, seed: 'stable-seed' });
  assert.deepEqual(r1, r2);
  assert.deepEqual(decodeOrdering(r1), decodeOrdering(r2));
});

test('different seeds can produce different reorder patterns', () => {
  // Not guaranteed for every seed pair, but a mid probability over many bits
  // should differ for these two distinct seeds.
  const message = 'The quick brown fox jumps over the lazy dog';
  const a = simulateOrderingRun(message, { reorderProb: 0.5, seed: 'seed-A' });
  const b = simulateOrderingRun(message, { reorderProb: 0.5, seed: 'seed-B' });
  assert.notDeepEqual(a.decodedBits, b.decodedBits);
});
