/**
 * Tests for the simulated timing channel (js/channels/timing.js).
 * Deterministic: fixed seeds and parameters throughout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateTiming, simulateTimingFromText, generateNormalGaps,
} from '../js/channels/timing.js';
import { textToBits } from '../js/utils/bits.js';

const BITS = [0, 1, 1, 0, 1, 0, 0, 1];

test('zero jitter decodes with no bit errors', () => {
  const r = simulateTiming(BITS, { jitterMs: 0, seed: 'z' });
  assert.deepEqual(r.decodedBits, BITS);
  assert.equal(r.bitErrors, 0);
  assert.equal(r.bitErrorRate, 0);
  assert.ok(r.confidence > 0.9);
});

test('packets = bits + 1, and each interval maps to one bit at zero jitter', () => {
  const r = simulateTiming(BITS, { jitterMs: 0, seed: 'p' });
  assert.equal(r.packets.length, BITS.length + 1);
  assert.equal(r.intervals.length, BITS.length);
  for (const iv of r.intervals) {
    assert.equal(iv.decodedBit, iv.observedGapMs >= r.params.thresholdMs ? 1 : 0);
  }
});

test('threshold: gaps below threshold decode 0, above decode 1', () => {
  const r = simulateTiming([0, 1], { shortMs: 100, longMs: 300, jitterMs: 0, seed: 't' });
  assert.equal(r.params.thresholdMs, 200);
  assert.equal(r.intervals[0].decodedBit, 0);
  assert.equal(r.intervals[1].decodedBit, 1);
});

test('simulateTimingFromText recovers the message with zero jitter', () => {
  const r = simulateTimingFromText('HI', { jitterMs: 0, seed: 'hi' });
  assert.equal(r.recoveredText, 'HI');
  assert.equal(r.bitErrors, 0);
  assert.deepEqual(r.bits, textToBits('HI'));
});

test('high jitter produces more errors than low jitter (same seed)', () => {
  const bits = textToBits('HI');
  const low = simulateTiming(bits, { shortMs: 100, longMs: 300, jitterMs: 5, seed: 'j' });
  const high = simulateTiming(bits, { shortMs: 100, longMs: 300, jitterMs: 140, seed: 'j' });
  assert.ok(high.bitErrors >= low.bitErrors);
  assert.ok(high.bitErrors > 0, 'severe jitter should corrupt at least one bit');
});

test('determinism: identical (bits, opts, seed) => identical observed gaps', () => {
  const a = simulateTiming(BITS, { jitterMs: 30, seed: 'same' });
  const b = simulateTiming(BITS, { jitterMs: 30, seed: 'same' });
  assert.deepEqual(a.observedGaps, b.observedGaps);
  const c = simulateTiming(BITS, { jitterMs: 30, seed: 'other' });
  assert.notDeepEqual(a.observedGaps, c.observedGaps);
});

test('packet loss on later packets reduces the number of decoded intervals', () => {
  const r = simulateTiming(BITS, { jitterMs: 0, lossProb: 1, seed: 'loss' });
  // First packet is kept as a sync marker; the rest drop, so intervals collapse.
  assert.ok(r.received.length < r.packets.length);
  assert.ok(r.decodedBits.length < BITS.length);
  assert.ok(r.lostCount > 0);
});

test('generateNormalGaps returns positive, broadly-spread values (not two tight levels)', () => {
  const gaps = generateNormalGaps(300, { meanMs: 200, seed: 'n' });
  assert.equal(gaps.length, 300);
  assert.ok(gaps.every((g) => g > 0));
  const distinct = new Set(gaps.map((g) => Math.round(g))).size;
  assert.ok(distinct > 50, 'exponential gaps should take many distinct values, unlike a 2-level channel');
});
