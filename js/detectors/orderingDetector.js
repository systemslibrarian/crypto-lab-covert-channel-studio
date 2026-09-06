/**
 * detectors/orderingDetector.js — educational indicators for the ordering channel.
 *
 * An ordering channel is genuinely subtle from a frequency standpoint: text
 * produces a roughly balanced mix of A-first and B-first pairs, so the split
 * alone rarely looks wrong. The structural tell is that the same two event
 * types keep arriving as tight, isolated pairs with nothing else interleaved.
 *
 * Pure logic (no DOM).
 */

import { clamp } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';

/**
 * @param {Array<Object>} pairs  ordered-pair objects from channels/ordering.js
 */
export function analyzeOrdering(pairs) {
  const n = pairs.length;
  let aFirst = 0;
  let bFirst = 0;
  let longestRun = 0;
  let run = 0;
  let prev = null;
  for (const p of pairs) {
    const sorted = p.events.slice().sort((a, b) => a.t - b.t);
    const first = sorted[0].tag;
    if (first === 'A') aFirst++; else bFirst++;
    if (first === prev) run++; else run = 1;
    if (run > longestRun) longestRun = run;
    prev = first;
  }
  const aRatio = n ? aFirst / n : 0;
  const balance = 1 - Math.abs(aRatio - 0.5) * 2; // 1 = perfectly balanced

  // Structural regularity: every unit is exactly a 2-event A/B pair.
  const allClean = pairs.every((p) => p.events.length === 2
    && new Set(p.events.map((e) => e.tag)).size === 2);
  const structureVal = allClean && n >= 6 ? clamp(balance, 0, 1) * 0.6 : 0;

  const metrics = {
    pairCount: n,
    aFirst,
    bFirst,
    aFirstRatio: aRatio,
    balance,
    longestRun,
    wellFormedPairs: allClean,
  };

  const contributions = [{ value: structureVal, weight: 1.0 }];
  const observations = [];

  if (allClean && n >= 6) {
    observations.push(observation(
      `Traffic is entirely tight A/B pairs (${n} of them), split ${aFirst}:${bFirst}.`,
      'A pure stream of isolated two-event pairs whose order alternates is an unusual, machine-like structure.',
      'Legitimate request/response or ACK pairing also produces paired events — order alone is weak evidence.',
      { weight: 1.0 },
    ));
  } else {
    observations.push(observation(
      `Pair ordering split is ${aFirst}:${bFirst} (balance ${balance.toFixed(2)}).`,
      'The A/B ordering looks close to a coin flip, as encoded text would.',
      'This channel barely disturbs frequency statistics — it is caught by structure and context, not counts.',
      { triggered: false },
    ));
  }

  // Each 2-event pair carries at most log2(2!) = 1 bit; the surprise of an
  // all-pairs stream is how far its structure sits from path-typical traffic.
  const methods = [
    {
      key: 'permCapacity', name: 'Permutation capacity',
      citation: 'Shannon (⌊log₂ n!⌋)',
      value: `${n} bit${n === 1 ? '' : 's'} over ${n} pairs`,
      interpretation: 'A 2-event pair holds 1 bit; full permutations of n events would hold ⌊log₂(n!)⌋ bits — the ceiling this toy encoder trades away for simplicity.',
    },
    {
      key: 'structure', name: 'Pair-structure regularity',
      citation: 'Educational indicator',
      value: metrics.wellFormedPairs ? 'all tight pairs' : 'mixed',
      interpretation: 'A pure stream of isolated A/B pairs is machine-like; ordinary traffic interleaves many flows.',
    },
  ];

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  return { metrics, methods, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
