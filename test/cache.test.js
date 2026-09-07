/**
 * Tests for the simulated shared-cache channel (js/channels/cache.js)
 * and its detector (js/detectors/cacheDetector.js).
 * Deterministic: fixed seeds and parameters throughout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateCache, simulateCacheRun, generateIdleLatencies, theoreticalBer,
  PROBES, probeInfo,
} from '../js/channels/cache.js';
import { analyzeCache } from '../js/detectors/cacheDetector.js';
import { textToBits } from '../js/utils/bits.js';

const BITS = [0, 1, 1, 0, 1, 0, 0, 1];
/** Noiseless cache: every probe lands exactly on its centre. */
const CLEAN = { jitterCycles: 0, evictionProb: 0, seed: 'cache' };
const PROBE_KEYS = PROBES.map((p) => p.key);

// ---- Known-answer vectors --------------------------------------------------

test('known answer: Flush+Reload reads a hit as 1 and a miss as 0', () => {
  const r = simulateCache([1, 0], { probe: 'flush-reload', ...CLEAN });
  assert.equal(r.params.thresholdCycles, 190); // midpoint of 80 and 300
  assert.equal(r.probes[0].latencyCycles, 80);  // sender touched -> hit -> fast
  assert.equal(r.probes[1].latencyCycles, 300); // sender absent  -> miss -> slow
  assert.deepEqual(r.decodedBits, [1, 0]);
});

test('known answer: Prime+Probe inverts the polarity of the same signal', () => {
  const r = simulateCache([1, 0], { probe: 'prime-probe', ...CLEAN });
  // Sender touching the set EVICTS the receiver's line, so a 1 is now the SLOW one.
  assert.equal(r.probes[0].latencyCycles, 300);
  assert.equal(r.probes[1].latencyCycles, 80);
  assert.deepEqual(r.decodedBits, [1, 0]);
});

test('known answer: the two protocols disagree on which latency means one', () => {
  const fr = probeInfo('flush-reload');
  const pp = probeInfo('prime-probe');
  assert.equal(fr.fastMeansOne, true);
  assert.equal(pp.fastMeansOne, false);
  assert.throws(() => probeInfo('nope'), /Unknown cache probe/);
});

test('known answer: eviction turns a fast symbol slow, never the reverse', () => {
  const r = simulateCache([1, 1, 1, 1, 1, 1, 1, 1], {
    probe: 'flush-reload', jitterCycles: 0, evictionProb: 1, seed: 'ev',
  });
  assert.equal(r.evictedCount, 8, 'every intended hit should be evicted');
  assert.ok(r.probes.every((p) => p.latencyCycles === 300));
  assert.ok(r.decodedBits.every((b) => b === 0), 'evicted hits decode as misses');

  const zeros = simulateCache([0, 0, 0, 0], {
    probe: 'flush-reload', jitterCycles: 0, evictionProb: 1, seed: 'ev',
  });
  assert.equal(zeros.evictedCount, 0, 'a line never placed cannot be evicted');
  assert.equal(zeros.bitErrors, 0);
});

// ---- Round-trip ------------------------------------------------------------

for (const probe of PROBE_KEYS) {
  test(`round-trip: decode(encode(bits)) === bits for '${probe}'`, () => {
    const r = simulateCache(BITS, { probe, ...CLEAN });
    assert.deepEqual(r.decodedBits, BITS);
    assert.equal(r.bitErrors, 0);
    assert.equal(r.bitErrorRate, 0);
  });

  test(`round-trip: simulateCacheRun recovers the message for '${probe}'`, () => {
    const r = simulateCacheRun('HI', { probe, ...CLEAN });
    assert.equal(r.recoveredText, 'HI');
    assert.equal(r.bitErrors, 0);
    assert.deepEqual(r.bits, textToBits('HI'));
  });
}

test('structure: one probe per bit', () => {
  const r = simulateCache(BITS, CLEAN);
  assert.equal(r.probes.length, BITS.length);
  assert.equal(r.latencies.length, BITS.length);
  assert.equal(r.decodedBits.length, BITS.length);
});

// ---- BER -> 0 as noise -> 0 ------------------------------------------------

test('BER falls monotonically to zero as co-tenant jitter falls to zero', () => {
  const jitters = [400, 300, 220, 160, 110, 40, 0];
  const bits = textToBits('CACHE');
  const rates = jitters.map((jitterCycles) =>
    simulateCache(bits, { jitterCycles, evictionProb: 0, seed: 'ber' }).bitErrorRate);

  for (let i = 1; i < rates.length; i++) {
    assert.ok(rates[i] <= rates[i - 1] + 1e-12,
      `BER should not rise as jitter falls: ${rates[i - 1]} -> ${rates[i]} at sigma ${jitters[i]}`);
  }
  assert.equal(rates[rates.length - 1], 0, 'a noiseless cache must be error-free');
  assert.ok(rates[0] > 0, 'severe jitter should corrupt at least one bit');
});

test('predicted BER is monotone in jitter and vanishes at zero noise', () => {
  const base = {
    hitCycles: 80, missCycles: 300, evictionProb: 0, repetitions: 1, thresholdCycles: 190,
  };
  const jitters = [400, 300, 220, 160, 110, 40, 0];
  const preds = jitters.map((jitterCycles) => theoreticalBer({ ...base, jitterCycles }));
  for (let i = 1; i < preds.length; i++) {
    assert.ok(preds[i] < preds[i - 1], `prediction should fall with jitter at sigma ${jitters[i]}`);
  }
  assert.equal(preds[preds.length - 1], 0);
});

test('BER also goes to zero as eviction noise goes to zero', () => {
  const bits = textToBits('CACHE');
  const rates = [0.6, 0.4, 0.25, 0.1, 0].map((evictionProb) =>
    simulateCache(bits, { evictionProb, jitterCycles: 0, seed: 'ev2' }).bitErrorRate);
  for (let i = 1; i < rates.length; i++) {
    assert.ok(rates[i] <= rates[i - 1] + 1e-12, 'BER should not rise as eviction falls');
  }
  assert.equal(rates[rates.length - 1], 0);
  assert.ok(rates[0] > 0);
});

test('capacity rises to 1 bit per probe as the channel cleans up', () => {
  const loud = simulateCache(BITS, { jitterCycles: 260, seed: 'c' });
  const quiet = simulateCache(BITS, { jitterCycles: 0, seed: 'c' });
  assert.equal(quiet.capacityBitsPerProbe, 1);
  assert.ok(loud.capacityBitsPerProbe < quiet.capacityBitsPerProbe,
    'a noisy channel carries less than one bit per probe');
  assert.equal(quiet.snrDb, Infinity);
});

test('repeated probing lowers the predicted error rate', () => {
  const base = {
    hitCycles: 80, missCycles: 300, jitterCycles: 150, evictionProb: 0, thresholdCycles: 190,
  };
  const once = theoreticalBer({ ...base, repetitions: 1 });
  const many = theoreticalBer({ ...base, repetitions: 16 });
  assert.ok(many < once, 'averaging R probes buys a sqrt(R) gain');
});

test('eviction noise is asymmetric: it only damages the fast symbol', () => {
  const base = {
    hitCycles: 80, missCycles: 300, jitterCycles: 0, repetitions: 1, thresholdCycles: 190,
  };
  // With no jitter, eviction at probability e corrupts half the symbols' worth
  // of ones: BER = e/2, because zeros are untouched.
  assert.ok(Math.abs(theoreticalBer({ ...base, evictionProb: 0.5 }) - 0.25) < 1e-9);
  assert.equal(theoreticalBer({ ...base, evictionProb: 0 }), 0);
});

// ---- Determinism -----------------------------------------------------------

test('determinism: identical (bits, opts, seed) => identical latencies', () => {
  const a = simulateCache(BITS, { jitterCycles: 40, seed: 'same' });
  const b = simulateCache(BITS, { jitterCycles: 40, seed: 'same' });
  assert.deepEqual(a.latencies, b.latencies);
  const c = simulateCache(BITS, { jitterCycles: 40, seed: 'other' });
  assert.notDeepEqual(a.latencies, c.latencies);
});

// ---- Detector --------------------------------------------------------------

test('detector fires on a clean cache signal', () => {
  const r = simulateCacheRun('HELLO', { jitterCycles: 8, seed: 'det' });
  const det = analyzeCache(r.latencies, { decoderConfidence: r.confidence, probe: r.probe });
  assert.ok(det.score >= 67, `expected a high indicator, got ${det.score}`);
  assert.equal(det.anomalyLevel, 'high');
  assert.ok(det.metrics.bimodality > 0.45, 'two clean latency classes should read as bimodal');
  assert.ok(det.observations.some((o) => o.triggered), 'at least one observation should trigger');
});

test('detector stays quiet on the ordinary-workload baseline', () => {
  const baseline = generateIdleLatencies(160, { seed: 'base' });
  const det = analyzeCache(baseline);
  assert.ok(det.score < 34, `expected a low indicator on baseline, got ${det.score}`);
  assert.equal(det.anomalyLevel, 'low');
});

test('detector reports the standing educational disclaimer', () => {
  const det = analyzeCache(generateIdleLatencies(40, { seed: 'x' }));
  assert.equal(det.disclaimer, 'EDUCATIONAL INDICATOR — NOT A SECURITY VERDICT');
  assert.ok(det.methods.length > 0);
});

test('baseline generator is lopsided towards hits, unlike a channel', () => {
  const lat = generateIdleLatencies(200, { seed: 'spread' });
  assert.equal(lat.length, 200);
  assert.ok(lat.every((v) => v >= 0), 'latency cannot be negative');
  const slow = lat.filter((v) => v > 190).length / lat.length;
  assert.ok(slow < 0.3, `ordinary code should mostly hit, got ${Math.round(slow * 100)}% slow`);
});
