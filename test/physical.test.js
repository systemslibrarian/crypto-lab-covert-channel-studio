/**
 * Tests for the simulated air-gap optical channel (js/channels/physical.js)
 * and its detector (js/detectors/physicalDetector.js).
 * Deterministic: fixed seeds and parameters throughout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulatePhysical, simulatePhysicalRun, generateAmbientBaseline, theoreticalBer,
} from '../js/channels/physical.js';
import { analyzePhysical } from '../js/detectors/physicalDetector.js';
import { textToBits } from '../js/utils/bits.js';

const BITS = [0, 1, 1, 0, 1, 0, 0, 1];
/** Noiseless optical link: every symbol lands exactly on its level. */
const CLEAN = { ambientNoise: 0, ambientDrift: 0, seed: 'phys' };

// ---- Known-answer vectors --------------------------------------------------

test('known answer: a dark symbol reads 0 and a lit symbol reads 1', () => {
  const r = simulatePhysical([0, 1], { onLux: 220, offLux: 40, ...CLEAN });
  assert.equal(r.params.thresholdLux, 130); // midpoint of 40 and 220
  assert.equal(r.symbols[0].filtered, 40);
  assert.equal(r.symbols[1].filtered, 220);
  assert.equal(r.symbols[0].decodedBit, 0);
  assert.equal(r.symbols[1].decodedBit, 1);
});

test('known answer: matched filter averages exactly samplesPerBit samples', () => {
  const r = simulatePhysical([1, 0, 1], { samplesPerBit: 6, ...CLEAN });
  assert.equal(r.symbols.length, 3);
  for (const s of r.symbols) assert.equal(s.samples.length, 6);
  assert.equal(r.samples.length, 18);
});

test('known answer: theoretical BER is 1/2 when the threshold sits on a level', () => {
  // Threshold exactly on the lit level: half of all lit symbols fall below it.
  const p = { onLux: 200, offLux: 0, ambientNoise: 10, samplesPerBit: 1, thresholdLux: 200 };
  assert.ok(Math.abs(theoreticalBer(p) - 0.25) < 1e-6,
    'a threshold on the lit level errs on half the 1s and none of the 0s');
});

// ---- Round-trip ------------------------------------------------------------

test('round-trip: decode(encode(bits)) === bits on a noiseless link', () => {
  const r = simulatePhysical(BITS, CLEAN);
  assert.deepEqual(r.decodedBits, BITS);
  assert.equal(r.bitErrors, 0);
  assert.equal(r.bitErrorRate, 0);
});

test('round-trip: simulatePhysicalRun recovers the message text', () => {
  const r = simulatePhysicalRun('HI', CLEAN);
  assert.equal(r.recoveredText, 'HI');
  assert.equal(r.bitErrors, 0);
  assert.deepEqual(r.bits, textToBits('HI'));
});

test('structure: one symbol per bit', () => {
  const r = simulatePhysical(BITS, CLEAN);
  assert.equal(r.symbols.length, BITS.length);
  assert.equal(r.filteredLevels.length, BITS.length);
  assert.equal(r.decodedBits.length, BITS.length);
});

// ---- BER -> 0 as noise -> 0 ------------------------------------------------

test('BER falls monotonically to zero as ambient noise falls to zero', () => {
  const noises = [400, 300, 220, 160, 110, 40, 0];
  const bits = textToBits('AIR GAP');
  const rates = noises.map((ambientNoise) =>
    simulatePhysical(bits, { ambientNoise, ambientDrift: 0, seed: 'ber' }).bitErrorRate);

  for (let i = 1; i < rates.length; i++) {
    assert.ok(rates[i] <= rates[i - 1] + 1e-12,
      `BER should not rise as noise falls: ${rates[i - 1]} -> ${rates[i]} at sigma ${noises[i]}`);
  }
  assert.equal(rates[rates.length - 1], 0, 'a noiseless link must be error-free');
  assert.ok(rates[0] > 0, 'severe ambient noise should corrupt at least one bit');
});

test('predicted BER is monotone in the noise level and vanishes at zero', () => {
  const base = { onLux: 220, offLux: 40, samplesPerBit: 8, thresholdLux: 130 };
  const noises = [400, 300, 220, 160, 110, 40, 0];
  const preds = noises.map((ambientNoise) => theoreticalBer({ ...base, ambientNoise }));
  for (let i = 1; i < preds.length; i++) {
    assert.ok(preds[i] < preds[i - 1], `prediction should fall with noise at sigma ${noises[i]}`);
  }
  assert.equal(preds[preds.length - 1], 0);
});

test('predicted BER also goes to zero as noise goes to zero', () => {
  const loud = simulatePhysical(BITS, { ambientNoise: 220, seed: 'p' });
  const quiet = simulatePhysical(BITS, { ambientNoise: 0, seed: 'p' });
  assert.ok(loud.predictedBer > 0.01, 'loud ambient should predict real errors');
  assert.equal(quiet.predictedBer, 0);
});

test('capacity rises to 1 bit per symbol as the channel cleans up', () => {
  const loud = simulatePhysical(BITS, { ambientNoise: 260, seed: 'c' });
  const quiet = simulatePhysical(BITS, { ambientNoise: 0, seed: 'c' });
  assert.equal(quiet.capacityBitsPerSymbol, 1);
  assert.ok(loud.capacityBitsPerSymbol < quiet.capacityBitsPerSymbol,
    'a noisy binary symmetric channel carries less than one bit per use');
  assert.equal(quiet.snrDb, Infinity);
});

test('matched filter: more samples per bit lowers the predicted error rate', () => {
  const base = { onLux: 220, offLux: 40, ambientNoise: 70, thresholdLux: 130 };
  const few = theoreticalBer({ ...base, samplesPerBit: 1 });
  const many = theoreticalBer({ ...base, samplesPerBit: 16 });
  assert.ok(many < few, 'averaging N samples buys a sqrt(N) processing gain');
});

// ---- Determinism and the drift impairment ----------------------------------

test('determinism: identical (bits, opts, seed) => identical samples', () => {
  const a = simulatePhysical(BITS, { ambientNoise: 30, seed: 'same' });
  const b = simulatePhysical(BITS, { ambientNoise: 30, seed: 'same' });
  assert.deepEqual(a.filteredLevels, b.filteredLevels);
  const c = simulatePhysical(BITS, { ambientNoise: 30, seed: 'other' });
  assert.notDeepEqual(a.filteredLevels, c.filteredLevels);
});

test('drift is a systematic offset a fixed threshold cannot average away', () => {
  const bits = textToBits('DRIFT');
  const flat = simulatePhysical(bits, { ambientDrift: 0, ambientNoise: 0, seed: 'd' });
  const drifting = simulatePhysical(bits, { ambientDrift: 140, ambientNoise: 0, seed: 'd' });
  assert.equal(flat.bitErrors, 0);
  assert.ok(drifting.bitErrors > 0, 'strong drift should push levels across the threshold');
  // Theory covers the Gaussian term only, so measurement exceeds it under drift.
  assert.equal(drifting.predictedBer, 0);
  assert.ok(drifting.bitErrorRate > drifting.predictedBer,
    'measured BER should exceed the Gaussian-only prediction when drift is on');
});

// ---- Detector --------------------------------------------------------------

test('detector fires on a clean optical signal', () => {
  const r = simulatePhysicalRun('HELLO', { ambientNoise: 4, seed: 'det' });
  const det = analyzePhysical(r.filteredLevels, { decoderConfidence: r.confidence });
  assert.ok(det.score >= 67, `expected a high indicator, got ${det.score}`);
  assert.equal(det.anomalyLevel, 'high');
  assert.ok(det.metrics.bimodality > 0.45, 'two clean levels should read as bimodal');
  assert.ok(det.observations.some((o) => o.triggered), 'at least one observation should trigger');
});

test('detector stays quiet on the ordinary-activity baseline', () => {
  const baseline = generateAmbientBaseline(160, { seed: 'base' });
  const det = analyzePhysical(baseline);
  assert.ok(det.score < 34, `expected a low indicator on baseline, got ${det.score}`);
  assert.equal(det.anomalyLevel, 'low');
});

test('detector reports the standing educational disclaimer', () => {
  const det = analyzePhysical(generateAmbientBaseline(40, { seed: 'x' }));
  assert.equal(det.disclaimer, 'EDUCATIONAL INDICATOR — NOT A SECURITY VERDICT');
  assert.ok(det.methods.length > 0);
});

test('baseline generator produces a broad, non-degenerate spread', () => {
  const levels = generateAmbientBaseline(120, { seed: 'spread' });
  assert.equal(levels.length, 120);
  assert.ok(levels.every((v) => v >= 0), 'luminance cannot be negative');
  const distinct = new Set(levels.map((v) => v.toFixed(3))).size;
  assert.ok(distinct > 50, 'ordinary activity should take many distinct levels');
});
