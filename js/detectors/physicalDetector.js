/**
 * detectors/physicalDetector.js — educational indicators for the simulated
 * air-gap optical channel.
 *
 * The defender here is a camera or light sensor pointed at the machine. It
 * cannot read the message, but on/off keying leaves a shape: luminance piles
 * into TWO tight levels sitting well clear of the noise floor, and — because the
 * payload is arbitrary data — the two levels appear about equally often. An LED
 * blinking for ordinary reasons spreads out instead, and is mostly idle.
 *
 * This detector recovers the levels the same way the receiver does (matched
 * filter already applied upstream, then the shared two-means split from
 * utils/statistics.js), measures how far apart they sit relative to the noise
 * floor, and reports the error rate that separation implies.
 *
 * Pure logic (no DOM).
 */

import {
  mean, stdDev, histogram, clamp, round, qFunction, twoLevelSplit,
} from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';

/**
 * @param {number[]} levels  matched-filter luminance level, one per symbol
 * @param {{ decoderConfidence?:number, bins?:number }} [opts]
 */
export function analyzePhysical(levels, opts = {}) {
  const vals = levels.filter((v) => Number.isFinite(v));
  const hist = histogram(vals, { bins: opts.bins ?? 16 });
  const { c0, c1, fit, separation, pooledSd, dPrime, duty, bimodality } = twoLevelSplit(vals);
  const m = mean(vals);
  const sd = stdDev(vals);

  // The error rate the observed separation implies for a midpoint threshold.
  const estimatedBer = Number.isFinite(dPrime) ? qFunction(dPrime / 2) : 0;
  // Balanced on/off is what arbitrary payload data produces; idle hardware is not.
  const dutyBalance = clamp(1 - Math.abs(duty - 0.5) * 2, 0, 1);
  const dPrimeNorm = Number.isFinite(dPrime) ? clamp(dPrime / 6, 0, 1) : 1;

  const metrics = {
    count: vals.length,
    mean: m,
    stdDev: sd,
    histogram: hist,
    levelLow: c0,
    levelHigh: c1,
    separation,
    noiseFloor: pooledSd,
    dPrime,
    estimatedBer,
    bimodality,
    twoLevelFit: fit,
    dutyCycle: duty,
    decoderConfidence: opts.decoderConfidence ?? null, // receiver-side, shown for teaching only
  };

  const methods = [
    {
      key: 'dprime', name: "Level separation over noise floor (d')",
      citation: 'Educational indicator',
      value: Number.isFinite(dPrime) ? round(dPrime, 2) : '∞ (no measurable noise)',
      interpretation: 'How many noise standard deviations separate the two luminance levels. Large d′ means a threshold receiver can read the medium almost perfectly — and that a sensor can see the channel.',
    },
    {
      key: 'bimodality', name: 'Two-level (on/off keying) clustering',
      citation: 'Educational indicator',
      value: round(bimodality, 2),
      interpretation: 'How cleanly luminance falls into two tight levels — the signature of on/off keying, as opposed to the broad spread of ordinary activity.',
    },
    {
      key: 'duty', name: 'On/off balance',
      citation: 'Educational indicator',
      value: `${Math.round(duty * 100)}% lit`,
      interpretation: 'Arbitrary payload data drives the LED lit about half the time. Routine activity is mostly idle, so a near-50% duty cycle is itself unusual.',
    },
  ];

  const contributions = [
    { value: bimodality, weight: 1.0 },
    { value: dPrimeNorm, weight: 0.9 },
    { value: vals.length >= 8 ? dutyBalance : 0, weight: 0.5 },
    { value: (vals.length >= 8 && bimodality > 0.3) ? fit : 0, weight: 0.4 },
  ];
  const observations = [];

  if (bimodality > 0.45) {
    observations.push(observation(
      `Luminance splits into two tight levels (~${round(c0, 0)} and ~${round(c1, 0)} lux).`,
      'Two clean levels with little in between is what on/off keying looks like; an LED driven by ordinary work wanders across the whole range.',
      'Hardware that genuinely has only two states — a power indicator, a link light — is legitimately two-levelled.',
      { weight: 1.0 },
    ));
  }
  if (Number.isFinite(dPrime) && dPrime > 4) {
    observations.push(observation(
      `The two levels sit ${round(dPrime, 1)} noise deviations apart (implied error rate ${estimatedBer < 1e-4 ? '< 0.01%' : `${round(estimatedBer * 100, 2)}%`}).`,
      'A separation that large means the medium is carrying near-perfect binary data — far cleaner than incidental light from ordinary activity.',
      'A bright, steady indicator in a dark room also separates cleanly from the noise floor without carrying anything.',
      { weight: 0.9 },
    ));
  }
  if (vals.length >= 8 && dutyBalance > 0.6 && bimodality > 0.3) {
    observations.push(observation(
      `The LED is lit ${Math.round(duty * 100)}% of the observed symbols.`,
      'Close to an even split is what arbitrary encoded data produces, whereas an activity indicator spends most of its time dark.',
      'A sustained workload (a long copy, a rebuild) also holds an activity LED near half-lit.',
      { weight: 0.5 },
    ));
  }

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  if (observations.length === 0) {
    observations.push(observation(
      'Luminance is broadly spread, the way an LED driven by ordinary activity looks.',
      'A single wandering distribution with no clean second level is the normal case for an activity indicator.',
      'A slow enough blink rate, or enough ambient light, can bury a real optical channel in exactly this shape.',
      { triggered: false },
    ));
  }

  return { metrics, methods, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
