/**
 * Tests for js/detectors/learnedDetector.js and js/analysis/learned.js — the
 * small fitted detector that sits next to the classical ones so "statistics vs
 * machine learning" can be a measurement instead of an argument.
 *
 * These tests lock down the properties that make the comparison HONEST rather
 * than the numbers that come out of it:
 *
 *   - The optimiser is deterministic (zero-initialised weights, fixed learning
 *     rate and epoch count), because a teaching benchmark that moves between
 *     runs teaches nothing.
 *   - Standardisation statistics are fitted per call, from the rows handed in.
 *     Fitting them across the whole data set would leak the test split into the
 *     model, which is exactly the mistake this module exists to make visible.
 *   - The sigmoid cannot overflow into NaN at extreme inputs.
 *   - Features stay finite even when corrected conditional entropy is undefined
 *     for a short series.
 *
 * DELIBERATELY NOT ASSERTED: the specific AUC values. Those are a calibration
 * that is still moving, and pinning them here would turn a teaching benchmark
 * into a change-detector. Only robust ordering properties are checked.
 *
 * Node built-in runner only. Deterministic: no wall-clock, no Math.random.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FEATURE_NAMES,
  timingFeatures,
  trainLogistic,
  predictProb,
  scoreLearnedTiming,
} from '../js/detectors/learnedDetector.js';

import { evaluateLearnedDetector } from '../js/analysis/learned.js';
import { simulateTiming, generateNormalGaps, generatePollerGaps } from '../js/channels/timing.js';
import { textToBits } from '../js/utils/bits.js';

/** A trivially separable toy set: label follows the second feature. */
const TOY_X = [[0, 0], [0.1, 0.2], [0.2, 0.1], [3, 3], [3.1, 3.2], [2.9, 3.1]];
const TOY_Y = [0, 0, 0, 1, 1, 1];

// ---------------------------------------------------------------------------
// The optimiser
// ---------------------------------------------------------------------------

test('trainLogistic is deterministic: same (X, y) gives identical weights', () => {
  const a = trainLogistic(TOY_X, TOY_Y);
  const b = trainLogistic(TOY_X, TOY_Y);
  assert.deepEqual(a.w, b.w);
  assert.equal(a.b, b.b);
  assert.deepEqual(a.mu, b.mu);
  assert.deepEqual(a.sigma, b.sigma);
  assert.equal(a.logLoss, b.logLoss);
});

test('trainLogistic separates a trivially separable set', () => {
  const model = trainLogistic(TOY_X, TOY_Y);
  for (let i = 0; i < TOY_X.length; i++) {
    const p = predictProb(model, TOY_X[i]);
    assert.ok(Number.isFinite(p));
    assert.equal(p > 0.5, TOY_Y[i] === 1, `row ${i} should land on its own side`);
  }
  assert.ok(model.logLoss < 0.3, `a separable set should fit well (log loss ${model.logLoss})`);
});

test('trainLogistic records its own hyperparameters, so a run is reproducible', () => {
  const model = trainLogistic(TOY_X, TOY_Y, { epochs: 100, lr: 0.2, l2: 0.01 });
  assert.equal(model.epochs, 100);
  assert.equal(model.lr, 0.2);
  assert.equal(model.l2, 0.01);
  assert.equal(model.w.length, TOY_X[0].length);
});

test('more epochs drive the training loss down (the optimiser actually descends)', () => {
  const few = trainLogistic(TOY_X, TOY_Y, { epochs: 5 });
  const many = trainLogistic(TOY_X, TOY_Y, { epochs: 800 });
  assert.ok(many.logLoss < few.logLoss, `${many.logLoss} should be below ${few.logLoss}`);
});

test('trainLogistic handles an empty training set without throwing', () => {
  const model = trainLogistic([], []);
  assert.equal(model.logLoss, 0);
  assert.deepEqual(model.w, []);
});

// ---------------------------------------------------------------------------
// Standardisation is fitted per call, not global
// ---------------------------------------------------------------------------

test('standardisation is fitted from the rows passed in, not from a global constant', () => {
  // If mu/sigma were global or cached, adding rows could not change them — and
  // a model fitted on the training split would silently know about the rest of
  // the data. This is the leak the module is meant to avoid demonstrating.
  const base = trainLogistic(TOY_X, TOY_Y);
  const wider = trainLogistic([...TOY_X, [50, 50], [-50, -50]], [...TOY_Y, 1, 0]);

  assert.notDeepEqual(base.mu, wider.mu, 'the mean must move when the rows change');
  assert.notDeepEqual(base.sigma, wider.sigma, 'so must the spread');

  // And the reported mu is genuinely the mean of the rows it was given.
  for (let j = 0; j < TOY_X[0].length; j++) {
    const expected = TOY_X.reduce((s, row) => s + row[j], 0) / TOY_X.length;
    assert.ok(Math.abs(base.mu[j] - expected) < 1e-9, `mu[${j}] should be the column mean`);
  }
});

test('a degenerate feature with no spread does not divide by zero', () => {
  const X = [[1, 0], [1, 1], [1, 2], [1, 3]];
  const model = trainLogistic(X, [0, 0, 1, 1]);
  assert.ok(model.sigma.every((s) => Number.isFinite(s) && s !== 0));
  for (const row of X) assert.ok(Number.isFinite(predictProb(model, row)));
});

// ---------------------------------------------------------------------------
// Numerical robustness
// ---------------------------------------------------------------------------

test('predictProb never overflows to NaN, even at extreme feature values', () => {
  // The sigmoid splits its branches on the sign of z precisely so exp() cannot
  // overflow. At saturation the result is exactly 0 or 1, which is fine — what
  // must never happen is NaN or Infinity.
  const model = trainLogistic(TOY_X, TOY_Y);
  const extremes = [
    [1e9, 1e9], [-1e9, -1e9], [1e300, -1e300], [-1e300, 1e300],
    [0, 0], [Number.MAX_SAFE_INTEGER, 0],
  ];
  for (const x of extremes) {
    const p = predictProb(model, x);
    assert.ok(Number.isFinite(p), `predictProb(${x}) returned ${p}`);
    assert.ok(p >= 0 && p <= 1, `probability out of range for ${x}: ${p}`);
  }
});

test('scoreLearnedTiming returns an integer 0..100, comparable with the classical scale', () => {
  const bits = textToBits('HELLO WORLD');
  const covert = simulateTiming(bits, { shortMs: 100, longMs: 300, jitterMs: 0, seed: 'sc:c' }).observedGaps;
  const clean = generateNormalGaps(160, { meanMs: 180, seed: 'sc:n' });
  const model = trainLogistic(
    [timingFeatures(covert), timingFeatures(clean)],
    [1, 0],
  );
  for (const gaps of [covert, clean, generatePollerGaps(160, { seed: 'sc:p' })]) {
    const s = scoreLearnedTiming(model, gaps);
    assert.ok(Number.isInteger(s), `score should be an integer, got ${s}`);
    assert.ok(s >= 0 && s <= 100);
  }
});

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

test('timingFeatures returns finite numbers even when CCE is undefined', () => {
  // Corrected conditional entropy needs a long enough series; a short window is
  // not evidence of anything, so it must map to a neutral value rather than to
  // NaN or to something the model could learn to read as a signal.
  for (const gaps of [[], [1], [1, 2, 3], [5, 5, 5, 5]]) {
    const f = timingFeatures(gaps);
    assert.equal(f.length, FEATURE_NAMES.length);
    assert.ok(f.every(Number.isFinite), `features for ${JSON.stringify(gaps)} were ${f}`);
  }
});

test('timingFeatures is a pure function of the series', () => {
  const gaps = generateNormalGaps(160, { meanMs: 200, seed: 'pure' });
  assert.deepEqual(timingFeatures(gaps), timingFeatures(gaps));
  assert.equal(FEATURE_NAMES.length, 2, 'two features, both borrowed from the classical detector');
});

test('the two features genuinely differ between a channel and ordinary traffic', () => {
  const bits = textToBits('HELLO WORLD');
  const covert = timingFeatures(simulateTiming(bits, { shortMs: 100, longMs: 300, jitterMs: 0, seed: 'f:c' }).observedGaps);
  const clean = timingFeatures(generateNormalGaps(160, { meanMs: 180, seed: 'f:n' }));
  assert.notDeepEqual(covert, clean);
  // A two-level channel is more regular than exponential traffic on both axes.
  assert.ok(covert[0] < clean[0], 'lower corrected conditional entropy');
  assert.ok(covert[1] < clean[1], 'lower coefficient of variation');
});

// ---------------------------------------------------------------------------
// The benchmark
// ---------------------------------------------------------------------------

test('evaluateLearnedDetector is deterministic', () => {
  const a = evaluateLearnedDetector();
  const b = evaluateLearnedDetector();
  assert.deepEqual(
    a.models.map((m) => [m.key, m.auc, m.model.w, m.model.b]),
    b.models.map((m) => [m.key, m.auc, m.model.w, m.model.b]),
  );
  assert.deepEqual(a.classical, b.classical);
  assert.deepEqual(a.sets, b.sets);
});

test('every reported AUC is a valid area in [0, 1]', () => {
  const r = evaluateLearnedDetector();
  const all = [...r.models.map((m) => m.auc), r.classical.auc];
  for (const set of all) {
    for (const key of ['fit', 'test', 'shift']) {
      const v = set[key];
      assert.ok(Number.isFinite(v), `${key} AUC is not finite`);
      assert.ok(v >= 0 && v <= 1, `${key} AUC out of range: ${v}`);
    }
  }
});

test('a model never scores worse on the data it was fitted to than on held-out data', () => {
  // The only ordering property that is safe to assert while the benchmark is
  // being calibrated: fitting cannot make in-sample performance worse. The gap
  // between these two numbers is what the lab displays as overfitting.
  for (const m of evaluateLearnedDetector().models) {
    assert.ok(
      m.auc.fit >= m.auc.test - 1e-9,
      `${m.key}: fit AUC ${m.auc.fit} should not fall below test AUC ${m.auc.test}`,
    );
    assert.ok(Math.abs(m.generalisationGap - (m.auc.fit - m.auc.test)) < 1e-9);
  }
});

test('the benchmark reports non-empty, balanced train / test / shift splits', () => {
  const { sets } = evaluateLearnedDetector();
  for (const key of ['train', 'test', 'shift']) {
    const s = sets[key];
    assert.ok(s.n > 0, `${key} split is empty`);
    assert.ok(s.covert > 0 && s.covert < s.n, `${key} split must hold both labels`);
  }
  // Train and test are drawn from the same pool, so they should be comparable
  // in size; the shift set is a separate construction.
  assert.equal(sets.train.n, sets.test.n);
});

test('the models span a range of training-set sizes, up to the whole split', () => {
  // Driven from the returned model list rather than a hardcoded roster, so
  // adding a variant (a regularised one, say) does not break the test.
  const { models, sets } = evaluateLearnedDetector();
  assert.ok(models.length >= 2, 'the comparison needs at least two fitted models');
  assert.equal(new Set(models.map((m) => m.key)).size, models.length, 'model keys are unique');

  const sizes = models.map((m) => m.trainSize);
  assert.ok(Math.min(...sizes) < Math.max(...sizes), 'at least one model is fitted on less data');
  assert.equal(Math.max(...sizes), sets.train.n, 'the largest model sees the whole training split');
  assert.ok(models.every((m) => m.trainSize > 0 && m.trainSize <= sets.train.n));

  for (const m of models) {
    assert.ok(m.label && m.label.length > 0, `${m.key} needs a human-readable label`);
    assert.equal(m.weights.length, FEATURE_NAMES.length);
    assert.deepEqual(m.weights.map((w) => w.name), FEATURE_NAMES);
    assert.ok(m.weights.every((w) => Number.isFinite(w.weight)));
    assert.ok(Number.isFinite(m.logLoss));
  }
});

test('the classical detector is scored on the same sets, for a fair comparison', () => {
  const r = evaluateLearnedDetector();
  assert.ok(r.classical.label.length > 0);
  for (const key of ['fit', 'test', 'shift']) {
    assert.ok(Number.isFinite(r.classical.auc[key]), `classical ${key} AUC missing`);
  }
});

test('the benchmark ships its own caveats, including that it is a toy', () => {
  const { notes } = evaluateLearnedDetector();
  assert.ok(Array.isArray(notes) && notes.length >= 4);
  for (const n of notes) assert.ok(typeof n === 'string' && n.length > 0);
  assert.ok(
    notes.some((n) => /toy/i.test(n)),
    'the honest framing that this is not a real detector must be stated',
  );
});

// ---------------------------------------------------------------------------
// The shift generator
// ---------------------------------------------------------------------------

test('generatePollerGaps is metronomic and deterministic — the classic false positive', () => {
  const a = generatePollerGaps(120, { intervalMs: 200, jitterMs: 4, seed: 'poll' });
  const b = generatePollerGaps(120, { intervalMs: 200, jitterMs: 4, seed: 'poll' });
  assert.deepEqual(a, b);
  assert.ok(a.every((g) => g > 0));
  const mean = a.reduce((s, g) => s + g, 0) / a.length;
  assert.ok(Math.abs(mean - 200) < 5, `a poller sits on its interval (mean ${mean.toFixed(1)})`);
  // Far more regular than the exponential baseline: that is why it trips
  // regularity-based detectors even though it is entirely benign.
  const normal = generateNormalGaps(120, { meanMs: 200, seed: 'poll-n' });
  const cv = (xs) => {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) / m;
  };
  assert.ok(cv(a) < cv(normal) / 5, 'the poller is dramatically more regular');
});
