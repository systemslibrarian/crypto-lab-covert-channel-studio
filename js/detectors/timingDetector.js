/**
 * detectors/timingDetector.js — educational indicators for simulated timing.
 *
 * A two-level timing channel leaves a fingerprint even when the defender cannot
 * read the message: the inter-arrival times pile up into TWO tight clusters
 * instead of the single broad spread normal traffic shows. This detector
 * measures that clustering and how metronomic the two levels are.
 *
 * Pure logic (no DOM).
 */

import { variance, stdDev, coefficientOfVariation, histogram, minMax, mean, clamp } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';

/** Two-means (k=2) clustering with tightness/fit stats. Deterministic. */
function twoLevelFit(values) {
  if (values.length < 4) return { c0: 0, c1: 0, within: 0, fit: 0, separation: 0 };
  const { min, max } = minMax(values);
  // All gaps identical: there is only ONE level, so the two-level fit is 0, not 1.
  if (max === min) return { c0: min, c1: max, within: 0, fit: 0, separation: 0 };
  let c0 = min + (max - min) * 0.25;
  let c1 = min + (max - min) * 0.75;
  for (let iter = 0; iter < 16; iter++) {
    let s0 = 0; let n0 = 0; let s1 = 0; let n1 = 0;
    for (const v of values) {
      if (Math.abs(v - c0) <= Math.abs(v - c1)) { s0 += v; n0++; }
      else { s1 += v; n1++; }
    }
    const nc0 = n0 ? s0 / n0 : c0;
    const nc1 = n1 ? s1 / n1 : c1;
    if (nc0 === c0 && nc1 === c1) break;
    c0 = nc0; c1 = nc1;
  }
  let within = 0;
  for (const v of values) within += Math.min(Math.abs(v - c0), Math.abs(v - c1));
  within /= values.length;
  const separation = Math.abs(c1 - c0);
  // Fraction of points that sit within 20% of the separation from their centre.
  const tol = Math.max(1, separation * 0.2);
  let close = 0;
  for (const v of values) {
    if (Math.min(Math.abs(v - c0), Math.abs(v - c1)) <= tol) close++;
  }
  const fit = values.length ? close / values.length : 0;
  return { c0, c1, within, fit, separation };
}

/**
 * @param {number[]} observedGaps  inter-arrival times (ms)
 * @param {{ decoderConfidence?:number, bins?:number }} [opts]
 */
export function analyzeTiming(observedGaps, opts = {}) {
  const gaps = observedGaps.filter((g) => Number.isFinite(g));
  const hist = histogram(gaps, { bins: opts.bins ?? 16 });
  const { c0, c1, fit, separation, within } = twoLevelFit(gaps);
  const varr = variance(gaps);
  const sd = stdDev(gaps);
  const cv = coefficientOfVariation(gaps);
  const m = mean(gaps);

  // Bimodality: two centres far apart relative to within-cluster spread.
  // Calibrated against a UNIMODAL baseline: a uniform/exponential spread has a
  // mean within/separation ratio near 0.25, so dividing by 0.25 makes ordinary
  // one-blob traffic score ~0 and only genuinely two-clustered data approach 1.
  let bimodality = 0;
  if (separation > 0) bimodality = clamp(1 - (within / separation) / 0.25, 0, 1);

  const metrics = {
    count: gaps.length,
    mean: m,
    variance: varr,
    stdDev: sd,
    coefficientOfVariation: cv,
    histogram: hist,
    clusterLow: c0,
    clusterHigh: c1,
    clusterSeparation: separation,
    twoLevelFit: fit,
    bimodality,
    decoderConfidence: opts.decoderConfidence ?? null, // receiver-side, shown for teaching only
  };

  // "How tightly do points sit on two levels" only means something once two
  // levels actually exist; otherwise k=2 trivially splits any spread and would
  // inflate ordinary one-blob traffic.
  const twoLevelPresent = bimodality > 0.3;
  const contributions = [
    { value: bimodality, weight: 1.0 },
    { value: (gaps.length >= 8 && twoLevelPresent) ? fit : 0, weight: 0.9 },
  ];
  const observations = [];

  if (bimodality > 0.45) {
    observations.push(observation(
      `Inter-arrival times split into two clusters (~${c0.toFixed(0)} ms and ~${c1.toFixed(0)} ms).`,
      'Two tight timing levels are the hallmark of a binary timing channel; normal traffic spreads out.',
      'Some applications alternate between two natural states (idle keepalive vs active burst), which also looks bimodal.',
      { weight: 1.0 },
    ));
  }
  if (gaps.length >= 8 && twoLevelPresent && fit > 0.8) {
    observations.push(observation(
      `${(fit * 100).toFixed(0)}% of gaps sit tightly on one of the two levels.`,
      'Very little spread around two exact values suggests a generated, not human, pattern.',
      'Fixed polling intervals and hardware timers can also produce tightly-quantised gaps.',
      { weight: 0.9 },
    ));
  }

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  if (observations.length === 0) {
    observations.push(observation(
      'Inter-arrival times form a single broad distribution.',
      'This looks like ordinary bursty traffic rather than a two-level signal.',
      'Enough jitter can smear a real timing channel into one blob too — subtlety cuts both ways.',
      { triggered: false },
    ));
  }

  return { metrics, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
