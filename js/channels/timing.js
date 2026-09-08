/**
 * channels/timing.js — SIMULATED covert TIMING channel.
 *
 * The idea that surprises people: the packets can be byte-for-byte identical.
 * The message is not in any packet. It is in the GAPS between them.
 *
 *   short gap  ->  bit 0
 *   long gap   ->  bit 1
 *
 * This module builds the arrival times, corrupts them with simulated jitter,
 * noise, and loss, and decodes them back with a threshold — so a learner can
 * watch a clean message deteriorate as the "network" gets messier.
 *
 * Everything is a JavaScript number. No packets are sent. Pure logic (no DOM).
 */

import { textToBits, bitsToText } from '../utils/bits.js';
import { bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { clamp } from '../utils/statistics.js';

/**
 * @param {number[]} bits  intended bit sequence (0/1)
 * @param {{
 *   shortMs?:number, longMs?:number, jitterMs?:number, noiseMs?:number,
 *   lossProb?:number, thresholdMs?:number, startTimeMs?:number, seed?:string|number
 * }} [opts]
 * @returns {Object} full timing simulation result (see fields below)
 */
export function simulateTiming(bits, opts = {}) {
  const shortMs = opts.shortMs ?? 100;
  const longMs = opts.longMs ?? 300;
  const jitterMs = Math.max(0, opts.jitterMs ?? 0);
  const noiseMs = Math.max(0, opts.noiseMs ?? 0);
  const lossProb = clamp(opts.lossProb ?? 0, 0, 1);
  const thresholdMs = opts.thresholdMs ?? (shortMs + longMs) / 2;
  const startTimeMs = opts.startTimeMs ?? 0;
  const rng = createRng(opts.seed ?? 'timing');

  const n = bits.length;
  const separation = Math.max(1e-6, (longMs - shortMs) / 2);

  // ---- Build arrival times for packets P0..Pn -----------------------------
  // gap_i (between P_i and P_{i+1}) carries bit_i.
  const intendedGaps = bits.map((b) => (b ? longMs : shortMs));
  const packets = [{ index: 0, intendedArrivalMs: startTimeMs, arrivalMs: startTimeMs, dropped: false }];
  let intended = startTimeMs;
  let arrival = startTimeMs;
  for (let i = 0; i < n; i++) {
    intended += intendedGaps[i];
    // Gaussian jitter on every gap, plus occasional larger "noise" spikes.
    let g = intendedGaps[i] + (jitterMs > 0 ? rng.gaussian(0, jitterMs) : 0);
    if (noiseMs > 0 && rng.bool(0.15)) g += rng.float(-noiseMs, noiseMs);
    arrival += Math.max(1, g);
    packets.push({
      index: i + 1,
      intendedArrivalMs: intended,
      arrivalMs: arrival,
      dropped: false,
    });
  }

  // ---- Simulated packet loss ---------------------------------------------
  // P0 is kept as the synchronisation marker; any later packet can drop.
  if (lossProb > 0) {
    for (let i = 1; i < packets.length; i++) {
      if (rng.next() < lossProb) packets[i].dropped = true;
    }
  }
  const received = packets.filter((p) => !p.dropped);

  // ---- Observed intervals between consecutive RECEIVED packets ------------
  // With loss, a dropped packet merges two gaps into one interval — which is
  // exactly why loss is so destructive to a timing channel.
  const intervals = [];
  for (let j = 0; j < received.length - 1; j++) {
    const from = received[j];
    const to = received[j + 1];
    const observedGapMs = to.arrivalMs - from.arrivalMs;
    const decodedBit = observedGapMs >= thresholdMs ? 1 : 0;
    const confidence = clamp(Math.abs(observedGapMs - thresholdMs) / separation, 0, 1);
    // How many intended gaps does this interval span? (1 = clean, >1 = merged)
    const spannedBits = to.index - from.index;
    intervals.push({
      index: j,
      fromPacket: from.index,
      toPacket: to.index,
      intendedBit: from.index < n ? bits[from.index] : null,
      intendedGapMs: from.index < n ? intendedGaps[from.index] : null,
      observedGapMs,
      decodedBit,
      confidence,
      ambiguous: confidence < 0.25,
      merged: spannedBits > 1,
      spannedBits,
    });
  }

  const decodedBits = intervals.map((iv) => iv.decodedBit);
  const errors = bitErrorCount(bits, decodedBits);
  const bitErrorRate = n ? errors / n : 0;
  const recoveredText = bitsToText(decodedBits, { lenient: true });
  const meanConfidence = intervals.length
    ? intervals.reduce((s, iv) => s + iv.confidence, 0) / intervals.length
    : 0;
  // Overall decode confidence blends per-interval margin with the error rate.
  const confidence = clamp((1 - bitErrorRate) * 0.7 + meanConfidence * 0.3, 0, 1);

  return {
    params: { shortMs, longMs, jitterMs, noiseMs, lossProb, thresholdMs },
    bits,
    intendedGaps,
    packets,
    received,
    intervals,
    observedGaps: intervals.map((iv) => iv.observedGapMs),
    decodedBits,
    bitErrors: errors,
    bitErrorRate,
    lostCount: packets.filter((p) => p.dropped).length,
    recoveredText,
    confidence,
    separation,
  };
}

/**
 * Convenience: run the timing simulation straight from a text message.
 * @param {string} message
 * @param {Object} [opts]
 */
export function simulateTimingFromText(message, opts = {}) {
  const bits = textToBits(message);
  return { bits, ...simulateTiming(bits, opts) };
}

/**
 * Generate a batch of "ordinary" inter-arrival gaps for the defender's
 * comparison histogram. Normal packet inter-arrivals are bursty and broadly
 * distributed (modelled here as an exponential around `meanMs`), in contrast to
 * the two tight clusters a two-level timing channel produces.
 * @param {number} count
 * @param {{ meanMs?:number, seed?:string|number }} [opts]
 * @returns {number[]}
 */
export function generateNormalGaps(count, opts = {}) {
  const meanMs = opts.meanMs ?? 200;
  const rng = createRng(opts.seed ?? 'timing-normal');
  const gaps = [];
  for (let i = 0; i < count; i++) {
    // Inverse-CDF sampling of an exponential distribution.
    const u = Math.max(1e-9, rng.next());
    gaps.push(Math.max(1, -meanMs * Math.log(u)));
  }
  return gaps;
}

/**
 * A scheduled health-check poller: a fixed interval with a little scheduling
 * jitter. This is the classic false-positive trap for every timing-channel
 * detector, because "suspiciously regular" is exactly what a cron job looks
 * like — and unlike the exponential baseline above, it is NOT drawn from the
 * same distribution as ordinary bursty traffic.
 *
 * Kept separate from `generateNormalGaps` on purpose: the detector benchmark in
 * analysis/validation.js is a published set of numbers, and this generator is
 * used for the distribution-shift experiment rather than added to it.
 *
 * @param {number} count
 * @param {{ intervalMs?:number, jitterMs?:number, seed?:string|number }} [opts]
 * @returns {number[]}
 */
export function generatePollerGaps(count, opts = {}) {
  const intervalMs = opts.intervalMs ?? 200;
  const jitterMs = Math.max(0, opts.jitterMs ?? 4);
  const rng = createRng(opts.seed ?? 'timing-poller');
  return Array.from({ length: count }, () => Math.max(1, intervalMs + rng.gaussian(0, jitterMs)));
}
