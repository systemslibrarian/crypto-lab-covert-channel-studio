/**
 * test/detectors.test.js — educational-indicator detectors.
 *
 * These tests exercise the five anomaly detectors against the channels they
 * consume. Everything is seeded and deterministic (mulberry32, no wall-clock,
 * no Math.random), so exact scores are asserted where the logic is fully
 * determined, and robust properties (ordering, ranges, presence of fields)
 * elsewhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeDns } from '../js/detectors/dnsDetector.js';
import { analyzeTiming } from '../js/detectors/timingDetector.js';
import { analyzeStorage } from '../js/detectors/storageDetector.js';
import { analyzeStego } from '../js/detectors/stegoDetector.js';
import { analyzeOrdering } from '../js/detectors/orderingDetector.js';
import { levelFromScore, DISCLAIMER } from '../js/detectors/anomaly.js';

import { simulateDnsRun, generateCoverTraffic } from '../js/channels/dns.js';
import { simulateTiming, generateNormalGaps } from '../js/channels/timing.js';
import { simulateStorageRun } from '../js/channels/storage.js';
import { simulateOrderingRun } from '../js/channels/ordering.js';
import { embedMessage } from '../js/channels/stego.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert every observation carries the three teaching fields. */
function assertObservationShape(observations) {
  assert.ok(Array.isArray(observations), 'observations is an array');
  assert.ok(observations.length >= 1, 'at least one observation');
  for (const obs of observations) {
    assert.equal(typeof obs.what, 'string', 'observation.what is a string');
    assert.equal(typeof obs.why, 'string', 'observation.why is a string');
    assert.equal(typeof obs.alsoCouldBe, 'string', 'observation.alsoCouldBe is a string');
    assert.ok(obs.what.length > 0, 'observation.what non-empty');
    assert.ok(obs.why.length > 0, 'observation.why non-empty');
    assert.ok(obs.alsoCouldBe.length > 0, 'observation.alsoCouldBe non-empty');
  }
}

/** Build a smooth (constant-colour) RGBA raster: an ideal LSB carrier. */
function smoothRaster(width, height, value = 128) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

// ---------------------------------------------------------------------------
// anomaly.js — level thresholds
// ---------------------------------------------------------------------------

test('levelFromScore uses the teaching thresholds (<34 low, 34-66 moderate, >=67 high)', () => {
  assert.equal(levelFromScore(0), 'low');
  assert.equal(levelFromScore(33), 'low');
  assert.equal(levelFromScore(33.999), 'low');
  assert.equal(levelFromScore(34), 'moderate');
  assert.equal(levelFromScore(50), 'moderate');
  assert.equal(levelFromScore(66), 'moderate');
  assert.equal(levelFromScore(67), 'high');
  assert.equal(levelFromScore(100), 'high');
});

// ---------------------------------------------------------------------------
// DNS detector
// ---------------------------------------------------------------------------

test('analyzeDns flags a sustained covert tunnel as HIGH and rates cover traffic far lower', () => {
  const run = simulateDnsRun('HELLO', {
    labelLength: 16,
    requestCount: 24,
    intervalMs: 500,
    seed: 'x',
  });
  const forwarded = run.mixed.filter((q) => q.forwarded);
  assert.equal(forwarded.length, 24, 'all 24 queries were forwarded (no cache)');

  const covert = analyzeDns(forwarded);

  // The sustained tunnel reads HIGH, driven by character-frequency divergence
  // (base32 labels sit far from hostname text) plus length/entropy/uniqueness.
  assert.ok(covert.score >= 67, `covert score is in the HIGH band (got ${covert.score})`);
  assert.equal(covert.anomalyLevel, 'high');
  assert.ok(covert.metrics.charDivergence > 1.5, 'encoded labels diverge from hostname text');
  assert.ok(covert.methods.some((mm) => /Born/.test(mm.citation)), 'character-frequency method is cited');
  assert.equal(covert.metrics.queryCount, 24);

  // The standing disclaimer must ride along on the result.
  assert.equal(covert.disclaimer, DISCLAIMER);
  assert.equal(covert.disclaimer, 'EDUCATIONAL INDICATOR — NOT A SECURITY VERDICT');

  // Each observation exposes the what / why / alsoCouldBe teaching triad.
  assertObservationShape(covert.observations);

  // Ordinary cover traffic must score well below the covert tunnel.
  const cover = analyzeDns(generateCoverTraffic(60, { seed: 'y' }));
  assert.ok(cover.score < 34, `cover traffic reads LOW (got ${cover.score})`);
  assert.ok(cover.metrics.charDivergence < 1, 'dictionary labels look like hostname text');
  assert.ok(cover.score < covert.score, 'cover scores lower than the covert tunnel');
  assert.equal(cover.anomalyLevel, 'low', 'cover traffic reads as LOW anomaly');
  assert.equal(cover.disclaimer, DISCLAIMER);
  assertObservationShape(cover.observations);
});

// ---------------------------------------------------------------------------
// Timing detector
// ---------------------------------------------------------------------------

test('analyzeTiming: a jitter-free alternating pattern is sharply bimodal and outscores normal gaps', () => {
  // Alternating bit pattern 0,1,0,1,... with zero jitter -> gaps alternate
  // exactly between shortMs (100) and longMs (300): two perfect clusters.
  const altBits = [];
  for (let i = 0; i < 40; i++) altBits.push(i % 2);
  const sim = simulateTiming(altBits, { jitterMs: 0, seed: 'timing-alt' });

  // Sanity: the observed gaps really are the two clean levels.
  const uniqueGaps = [...new Set(sim.observedGaps)].sort((a, b) => a - b);
  assert.deepEqual(uniqueGaps, [100, 300]);

  const alt = analyzeTiming(sim.observedGaps);
  assert.ok(alt.score >= 67, `a perfect two-level signal reads HIGH (got ${alt.score})`);
  assert.equal(alt.anomalyLevel, 'high');
  assert.ok(alt.metrics.cce < 1, 'corrected conditional entropy is low for a regular signal');
  assert.ok(alt.metrics.regularity < 0.05, 'Cabuk regularity is near zero for a metronomic signal');
  assert.equal(alt.metrics.bimodality, 1, 'bimodality is maximal with no within-cluster spread');
  assert.equal(alt.metrics.twoLevelFit, 1, 'every gap sits exactly on a cluster centre');
  // Cited methods are exposed to the UI.
  assert.ok(alt.methods.some((mm) => /Gianvecchio/.test(mm.citation)), 'CCE method is cited');
  assert.ok(alt.methods.some((mm) => /Cabuk/.test(mm.citation)), 'Cabuk method is cited');
  assert.equal(alt.metrics.clusterLow, 100);
  assert.equal(alt.metrics.clusterHigh, 300);
  assert.equal(alt.disclaimer, DISCLAIMER);
  assertObservationShape(alt.observations);

  // Ordinary exponential inter-arrival gaps: one broad spread must read LOW —
  // the detector is calibrated against a unimodal baseline so normal traffic is
  // not mistaken for a two-level channel.
  const normal = analyzeTiming(generateNormalGaps(200, { seed: 'z' }));
  assert.ok(normal.score < 34, `normal gaps should read LOW (got ${normal.score})`);
  assert.equal(normal.anomalyLevel, 'low');
  assert.ok(normal.score < alt.score, 'normal gaps score lower than the timing channel');
  assert.ok(
    normal.metrics.bimodality < alt.metrics.bimodality,
    'normal gaps are less bimodal than the two-level channel',
  );
  // And normal traffic must NOT trigger a "two clusters" claim.
  assert.ok(
    normal.observations.every((o) => !/two clusters|two levels/i.test(o.what)),
    'normal traffic should not be described as two-level',
  );
  assert.equal(normal.disclaimer, DISCLAIMER);
  assertObservationShape(normal.observations);
});

// ---------------------------------------------------------------------------
// Storage detector — the honest detectability lesson
// ---------------------------------------------------------------------------

test('analyzeStorage: a TTL toggle is glaring while an IP-ID parity channel hides (parity stays low)', () => {
  const message = 'Hi';

  const ttlRun = simulateStorageRun(message, { field: 'ttl-toggle', seed: 's1' });
  const ttl = analyzeStorage(ttlRun.cleanPackets, 'ttl-toggle');

  const ipidRun = simulateStorageRun(message, { field: 'ipid-parity', seed: 's1' });
  const ipid = analyzeStorage(ipidRun.cleanPackets, 'ipid-parity');

  // Deterministic scores (seed 's1'): TTL toggle is a strong structural anomaly.
  assert.equal(ttl.score, 91);
  assert.equal(ttl.anomalyLevel, 'high');

  // Parity barely perturbs a uniform field -> essentially no statistical signal.
  assert.equal(ipid.score, 0);
  assert.equal(ipid.anomalyLevel, 'low');

  // The lesson: the same message is far more detectable via TTL than via parity.
  assert.ok(ttl.score > ipid.score, 'TTL toggle scores higher than IP-ID parity');
  assert.ok(ipid.score < 34, 'the parity channel stays in the LOW band');

  // Both still expose the disclaimer and well-formed observations (the parity
  // detector always emits the deliberate false-negative teaching observation).
  assert.equal(ttl.disclaimer, DISCLAIMER);
  assert.equal(ipid.disclaimer, DISCLAIMER);
  assertObservationShape(ttl.observations);
  assertObservationShape(ipid.observations);
  assert.equal(ipid.metrics.field, 'ipid-parity');
  assert.equal(ttl.metrics.field, 'ttl-toggle');
});

// ---------------------------------------------------------------------------
// Stego detector
// ---------------------------------------------------------------------------

test('analyzeStego: embedding into a smooth carrier raises the score and a hottest block; the clean image scores lower', () => {
  const clean = smoothRaster(48, 48, 128);
  const { raster: embedded } = embedMessage(
    clean,
    'Secret message hidden in the smooth pixels of this carrier.',
  );

  const stego = analyzeStego(embedded);
  assert.ok(stego.score >= 34, `embedded score ${stego.score} is at least 34`);
  assert.ok(stego.metrics.hottestBlock, 'a hottest block is reported');
  assert.equal(typeof stego.metrics.hottestBlock.bx, 'number');
  assert.equal(typeof stego.metrics.hottestBlock.by, 'number');
  assert.ok(
    stego.metrics.hottestBlock.entropy > 0,
    'the hottest block has non-zero LSB entropy',
  );
  assert.equal(stego.disclaimer, DISCLAIMER);
  assertObservationShape(stego.observations);

  // The pristine smooth image has a near-constant LSB plane -> a much lower score.
  const cleanAnalysis = analyzeStego(clean);
  assert.ok(
    cleanAnalysis.score < stego.score,
    `clean score ${cleanAnalysis.score} is below embedded score ${stego.score}`,
  );
  assert.equal(cleanAnalysis.disclaimer, DISCLAIMER);
});

// ---------------------------------------------------------------------------
// Ordering detector
// ---------------------------------------------------------------------------

test('analyzeOrdering returns aFirst/bFirst metrics and an observations array', () => {
  const run = simulateOrderingRun('Ok', { seed: 'o1' });
  const ordering = analyzeOrdering(run.pairs);

  assert.equal(typeof ordering.metrics.aFirst, 'number');
  assert.equal(typeof ordering.metrics.bFirst, 'number');
  // Every pair contributes to exactly one of the two counts.
  assert.equal(
    ordering.metrics.aFirst + ordering.metrics.bFirst,
    run.pairs.length,
    'aFirst + bFirst accounts for every pair',
  );
  assert.equal(ordering.metrics.pairCount, run.pairs.length);
  assert.ok(ordering.metrics.wellFormedPairs, 'clean A/B pairs are well-formed');

  assertObservationShape(ordering.observations);
  assert.equal(ordering.disclaimer, DISCLAIMER);
  assert.equal(ordering.anomalyLevel, levelFromScore(ordering.score));
});
