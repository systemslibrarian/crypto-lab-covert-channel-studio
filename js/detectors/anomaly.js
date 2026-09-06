/**
 * detectors/anomaly.js — shared vocabulary for the (educational) detectors.
 *
 * Every detector in this exhibit produces a *graded indicator*, never a verdict.
 * The whole point is that detection is probabilistic: real analysts combine many
 * weak signals and still investigate before concluding. These helpers keep the
 * three anomaly levels and the standing disclaimer consistent everywhere.
 */

export const ANOMALY = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
};

/** The label the UI must always show near any score. */
export const DISCLAIMER = 'EDUCATIONAL INDICATOR — NOT A SECURITY VERDICT';

/**
 * Map a 0..100 score to a graded level. Thresholds are intentionally round and
 * are described in the UI as teaching thresholds, not tuned IDS thresholds.
 * @param {number} score
 * @returns {'low'|'moderate'|'high'}
 */
export function levelFromScore(score) {
  if (score >= 67) return ANOMALY.HIGH;
  if (score >= 34) return ANOMALY.MODERATE;
  return ANOMALY.LOW;
}

/** Human-facing text for a level. */
export function levelLabel(level) {
  switch (level) {
    case ANOMALY.HIGH: return 'HIGH ANOMALY';
    case ANOMALY.MODERATE: return 'MODERATE ANOMALY';
    default: return 'LOW ANOMALY';
  }
}

/**
 * Build a single observation with the three fields the exhibit always shows:
 * what was observed, why it may matter, and what else could cause it (so the
 * false-positive lesson is never far away).
 * @param {string} what
 * @param {string} why
 * @param {string} alsoCouldBe
 * @param {{ weight?:number, triggered?:boolean }} [meta]
 */
export function observation(what, why, alsoCouldBe, meta = {}) {
  return {
    what,
    why,
    alsoCouldBe,
    weight: meta.weight ?? 0,
    triggered: meta.triggered ?? true,
  };
}

/**
 * Combine weighted indicator contributions (each 0..1) into a 0..100 score.
 * @param {Array<{ value:number, weight:number }>} contributions
 * @returns {number}
 */
export function weightedScore(contributions) {
  let total = 0;
  let wsum = 0;
  for (const c of contributions) {
    total += Math.max(0, Math.min(1, c.value)) * c.weight;
    wsum += c.weight;
  }
  if (wsum === 0) return 0;
  return Math.round((total / wsum) * 100);
}
