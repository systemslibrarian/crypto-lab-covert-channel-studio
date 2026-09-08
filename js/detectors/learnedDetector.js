/**
 * detectors/learnedDetector.js — a deliberately small LEARNED detector, put
 * next to the classical ones so "statistics vs machine learning" can be a
 * measurement instead of an argument.
 *
 * It is a two-feature logistic regression, and the two features are the SAME
 * numbers the hand-built timing detector already computes:
 *
 *   x₁  corrected conditional entropy of the inter-arrival series
 *       (Gianvecchio & Wang, CCS 2007)
 *   x₂  coefficient of variation of the same series
 *
 * That choice is the point. Nothing here has more information than the
 * classical detector does; the only difference is that the weighting of the two
 * features is FITTED from labelled examples rather than chosen by a person. So
 * whatever the learned model gains or loses, it gains or loses from fitting
 * alone — which is exactly the comparison worth teaching.
 *
 *   P(covert | x) = σ(w·z + b),  z = standardised features
 *
 * Everything is deterministic: weights start at zero, the optimiser is
 * full-batch gradient descent with a fixed learning rate and epoch count, and
 * standardisation statistics come from the training set only (fitting them on
 * all the data would leak the test set — a mistake worth not making in a
 * teaching implementation).
 *
 * This is a TOY. Two features, a linear boundary, a few hundred synthetic
 * cases. It is here to make overfitting and distribution shift visible, not to
 * suggest that a logistic regression is a covert-channel detector.
 *
 * Pure logic (no DOM). No Math.random, no Date.
 */

import { correctedConditionalEntropy, coefficientOfVariation, clamp } from '../utils/statistics.js';

export const FEATURE_NAMES = ['Corrected conditional entropy', 'Coefficient of variation'];

/**
 * Feature vector for one inter-arrival series.
 *
 * CCE is undefined for short series; a covert channel is not the only reason a
 * window can be short, so an undefined value is mapped to a neutral mid-range
 * number rather than to something the model could learn to treat as evidence.
 * @param {number[]} gaps
 * @returns {number[]}
 */
export function timingFeatures(gaps) {
  const { cce } = correctedConditionalEntropy(gaps);
  const cv = coefficientOfVariation(gaps);
  return [Number.isFinite(cce) ? cce : 1.0, Number.isFinite(cv) ? cv : 0];
}

/** Per-feature mean and standard deviation, computed on the TRAINING set only. */
function standardiser(X) {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const mu = new Array(d).fill(0);
  const sigma = new Array(d).fill(1);
  if (!n) return { mu, sigma };
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (const row of X) s += row[j];
    mu[j] = s / n;
    let v = 0;
    for (const row of X) v += (row[j] - mu[j]) ** 2;
    // A degenerate feature (no spread) must not divide by zero.
    sigma[j] = Math.sqrt(v / n) || 1;
  }
  return { mu, sigma };
}

function applyStandardiser({ mu, sigma }, x) {
  return x.map((v, j) => (v - mu[j]) / sigma[j]);
}

function sigmoid(z) {
  // Split the branches so a large-magnitude z cannot overflow exp().
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Fit a logistic regression by full-batch gradient descent.
 *
 * @param {number[][]} X  feature rows
 * @param {number[]} y    labels, 1 = covert, 0 = clean
 * @param {{ epochs?:number, lr?:number, l2?:number }} [opts]
 * @returns {{ w:number[], b:number, mu:number[], sigma:number[], epochs:number, lr:number, l2:number, logLoss:number }}
 */
export function trainLogistic(X, y, opts = {}) {
  const epochs = opts.epochs ?? 600;
  const lr = opts.lr ?? 0.35;
  const l2 = opts.l2 ?? 0;
  const d = X[0]?.length ?? 0;
  const n = X.length;

  const std = standardiser(X);
  const Z = X.map((x) => applyStandardiser(std, x));

  const w = new Array(d).fill(0);
  let b = 0;
  for (let epoch = 0; epoch < epochs && n > 0; epoch++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(Z[i].reduce((acc, v, j) => acc + v * w[j], 0) + b);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
  }

  // Training log loss, so the fit quality is reportable alongside the AUCs.
  let loss = 0;
  for (let i = 0; i < n; i++) {
    const p = clamp(sigmoid(Z[i].reduce((acc, v, j) => acc + v * w[j], 0) + b), 1e-9, 1 - 1e-9);
    loss -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
  }

  return { w, b, mu: std.mu, sigma: std.sigma, epochs, lr, l2, logLoss: n ? loss / n : 0 };
}

/** P(covert) for one feature vector. */
export function predictProb(model, x) {
  const z = applyStandardiser(model, x);
  return sigmoid(z.reduce((acc, v, j) => acc + v * model.w[j], 0) + model.b);
}

/**
 * Score an inter-arrival series 0..100, so the learned model is directly
 * comparable with the classical detectors on the same axis.
 *
 * NOTE the difference in meaning, which the UI has to keep saying out loud: a
 * classical detector's score is a weighted indicator with no probabilistic
 * claim, while this one IS a calibrated-ish probability — on the training
 * distribution, and nowhere else.
 * @param {Object} model
 * @param {number[]} gaps
 */
export function scoreLearnedTiming(model, gaps) {
  return Math.round(100 * predictProb(model, timingFeatures(gaps)));
}
