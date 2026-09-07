/**
 * detectors/cacheDetector.js — educational indicators for the simulated
 * shared-cache channel.
 *
 * A defender here is not reading the message; it is watching a latency
 * distribution and asking whether it is being USED like a signal.
 *
 * The hit-vs-miss classifier below is the same two-level split the receiver
 * uses. The scoring reflects a measured property of this model that is easy to
 * get wrong: a bimodal latency histogram is NOT by itself suspicious, because
 * ordinary memory access is already bimodal — hits and misses are two clusters.
 * Clean separation is not suspicious either; an idle machine gives ordinary code
 * clean timings. What actually distinguishes a channel is BALANCE: arbitrary
 * payload data drives both classes about equally often, while locality makes
 * real workloads hit far more than they miss. Balance therefore gates the shape
 * indicators here rather than being averaged in beside them.
 *
 * Pure logic (no DOM).
 */

import {
  mean, stdDev, histogram, clamp, round, qFunction, twoLevelSplit,
} from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';

/**
 * @param {number[]} latencies  measured access times, one per probe (cycles)
 * @param {{ decoderConfidence?:number, bins?:number, probe?:string }} [opts]
 */
export function analyzeCache(latencies, opts = {}) {
  const vals = latencies.filter((v) => Number.isFinite(v));
  const hist = histogram(vals, { bins: opts.bins ?? 16 });
  const { c0, c1, fit, separation, pooledSd, dPrime, duty, bimodality } = twoLevelSplit(vals);
  const m = mean(vals);
  const sd = stdDev(vals);

  // The error rate this separation implies for a midpoint threshold — i.e. how
  // reliably ANYONE (receiver or analyst) could read bits off this distribution.
  const estimatedBer = Number.isFinite(dPrime) ? qFunction(dPrime / 2) : 0;
  // Ordinary code is mostly hits; a channel carrying arbitrary data is ~50/50.
  const classBalance = clamp(1 - Math.abs(duty - 0.5) * 2, 0, 1);
  const dPrimeNorm = Number.isFinite(dPrime) ? clamp(dPrime / 6, 0, 1) : 1;

  const metrics = {
    count: vals.length,
    mean: m,
    stdDev: sd,
    histogram: hist,
    fastCentre: c0,
    slowCentre: c1,
    separation,
    noiseFloor: pooledSd,
    dPrime,
    estimatedBer,
    bimodality,
    twoLevelFit: fit,
    slowShare: duty,
    probe: opts.probe ?? null,
    decoderConfidence: opts.decoderConfidence ?? null, // receiver-side, shown for teaching only
  };

  const methods = [
    {
      key: 'dprime', name: "Hit/miss separation (d')",
      citation: 'Yarom & Falkner, USENIX Security 2014',
      value: Number.isFinite(dPrime) ? round(dPrime, 2) : '∞ (no measurable jitter)',
      interpretation: 'How many standard deviations separate the fast and slow classes. Flush+Reload works precisely because this gap is large on real hardware; a large gap here means the distribution is trivially readable.',
    },
    {
      key: 'bimodality', name: 'Two-cluster latency fit',
      citation: 'Educational indicator',
      value: round(bimodality, 2),
      interpretation: 'How cleanly the latencies fall into two tight groups, as opposed to one peak with a tail — the shape ordinary memory access produces.',
    },
    {
      key: 'balance', name: 'Access-class balance',
      citation: 'Osvik, Shamir & Tromer, CT-RSA 2006',
      value: `${Math.round(duty * 100)}% slow`,
      interpretation: 'Programs with normal locality miss a small minority of the time. A near-even split between fast and slow is what encoded data looks like, not what a working set looks like.',
    },
  ];

  // Balance is the discriminator, and it gates the rest: two tight, cleanly
  // separated clusters only count as evidence when both are used equally often.
  const balanced = vals.length >= 8 ? classBalance : 0;
  const contributions = [
    { value: balanced, weight: 1.0 },
    { value: dPrimeNorm * balanced, weight: 0.35 },
    { value: bimodality * balanced, weight: 0.35 },
    { value: (bimodality > 0.3 ? fit : 0) * balanced, weight: 0.3 },
  ];
  const observations = [];

  if (vals.length >= 8 && classBalance > 0.6) {
    observations.push(observation(
      `Fast and slow accesses are close to evenly split (${Math.round(duty * 100)}% slow).`,
      'Locality means real workloads hit far more often than they miss. A near-even split suggests the access pattern is carrying data rather than doing work — this is the indicator that actually separates a channel from ordinary memory traffic.',
      'A streaming scan over memory larger than the cache legitimately misses most of the time.',
      { weight: 1.0 },
    ));
  }
  if (vals.length >= 8 && classBalance > 0.6 && bimodality > 0.45) {
    observations.push(observation(
      `Those evenly-used accesses also fall into two tight groups (~${round(c0, 0)} and ~${round(c1, 0)} cycles).`,
      'Balance plus tight clustering is the presence/absence signature: every probe is deliberately driven to one extreme or the other.',
      'Code alternating evenly between a hot loop and a cold data structure looks the same.',
      { weight: 0.35 },
    ));
  }
  if (vals.length >= 8 && classBalance > 0.6 && Number.isFinite(dPrime) && dPrime > 4) {
    observations.push(observation(
      `The two groups sit ${round(dPrime, 1)} deviations apart (implied error rate ${estimatedBer < 1e-4 ? '< 0.01%' : `${round(estimatedBer * 100, 2)}%`}).`,
      'That is a near-noiseless binary readout — the condition a cache channel needs to work at all.',
      'An unloaded machine gives clean cache timings to ordinary code as well; low noise is not by itself evidence of a channel.',
      { weight: 0.35 },
    ));
  }

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  if (observations.length === 0) {
    observations.push(observation(
      'Latencies look like ordinary memory access: two clusters, but heavily skewed towards hits.',
      'A bimodal histogram is normal here — memory either hits or misses. Locality keeps real programs lopsided rather than using both classes equally, which is what a channel needs.',
      'Enough co-tenant noise, or a slow enough probe, can smear a real cache channel into this shape too.',
      { triggered: false },
    ));
  }

  return { metrics, methods, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
