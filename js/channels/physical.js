/**
 * channels/physical.js — SIMULATED air-gap OPTICAL channel (a MODEL of a medium).
 *
 * An air-gapped machine has no network. It still has an LED. Malware that can
 * blink that LED turns light itself into the carrier, and a camera or photodiode
 * across the room is the receiver — on/off keying (OOK) over open air:
 *
 *   LED dark    ->  bit 0
 *   LED lit     ->  bit 1
 *
 * WHAT IS REAL AND WHAT IS MODELLED
 *   Real here:      the OOK encoder, the matched filter (averaging N samples per
 *                   symbol), the threshold decoder, the measured bit-error rate,
 *                   and the capacity arithmetic — all ordinary signal processing.
 *   MODELLED here:  the medium. The "photodiode" is a JavaScript number. Ambient
 *                   light is an explicit noise process (Gaussian shot/sensor
 *                   noise plus a slow sinusoidal drift standing in for room
 *                   lighting), not a measurement. No hardware is touched, no LED
 *                   exists, and nothing is sensed.
 *
 * The ambient process is deliberately explicit so a learner can separate the two
 * impairments: Gaussian noise is what the matched filter averages away (the
 * √N processing gain), while DRIFT is a systematic offset that a fixed threshold
 * cannot average away at all — which is why real receivers track the baseline.
 *
 * Everything is a JavaScript number. No hardware is accessed. Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { clamp, qFunction, bscCapacityBits } from '../utils/statistics.js';

/** Period of the modelled ambient-light drift, in samples. Slow relative to a
 *  symbol, so drift looks like a wandering baseline rather than more noise. */
const DRIFT_PERIOD_SAMPLES = 240;

/** The modelled ambient-light offset at sample `t` (lux above the dark floor). */
function ambientAt(t, driftLux) {
  if (driftLux <= 0) return 0;
  return driftLux * Math.sin((2 * Math.PI * t) / DRIFT_PERIOD_SAMPLES);
}

/**
 * Closed-form bit-error rate for this model, from the Gaussian noise term only.
 *
 * After the matched filter averages `samplesPerBit` samples the effective noise
 * standard deviation is sigma / sqrt(N) — the processing gain. With a decision
 * threshold anywhere between the two levels the two error directions differ, so
 * they are computed separately and averaged over equiprobable bits.
 *
 * NOTE: this curve covers the Gaussian term ONLY, so measured BER can exceed it
 * for two documented reasons — both worth pointing at in class:
 *   1. drift is a systematic offset, not Gaussian noise, so no amount of
 *      averaging removes it and a fixed threshold simply walks off the levels;
 *   2. a sensor reading floors at zero (darkness), and once the noise is large
 *      relative to the dark level that clipping biases readings upward.
 * The gap between the predicted and measured curves is the teaching point.
 *
 * @param {{ onLux:number, offLux:number, ambientNoise:number,
 *           samplesPerBit:number, thresholdLux:number }} p
 * @returns {number} bit-error probability in [0, 1]
 */
export function theoreticalBer(p) {
  const n = Math.max(1, p.samplesPerBit);
  const sigmaEff = Math.max(0, p.ambientNoise) / Math.sqrt(n);
  if (sigmaEff <= 0) {
    // Noiseless: the only way to err is to put the threshold outside the levels.
    const p01 = p.offLux >= p.thresholdLux ? 1 : 0;
    const p10 = p.onLux < p.thresholdLux ? 1 : 0;
    return (p01 + p10) / 2;
  }
  const p01 = qFunction((p.thresholdLux - p.offLux) / sigmaEff); // dark read as lit
  const p10 = qFunction((p.onLux - p.thresholdLux) / sigmaEff);  // lit read as dark
  return clamp((p01 + p10) / 2, 0, 1);
}

/**
 * Encode bits as LED blinks, push them through the modelled ambient medium, and
 * recover them with a matched filter plus threshold.
 *
 * @param {number[]} bits  intended bit sequence (0/1)
 * @param {{
 *   onLux?:number, offLux?:number, ambientNoise?:number, ambientDrift?:number,
 *   samplesPerBit?:number, symbolMs?:number, thresholdLux?:number, seed?:string|number
 * }} [opts]
 * @returns {Object} full optical simulation result (see fields below)
 */
export function simulatePhysical(bits, opts = {}) {
  const onLux = opts.onLux ?? 220;
  const offLux = opts.offLux ?? 40;
  const ambientNoise = Math.max(0, opts.ambientNoise ?? 0);
  const ambientDrift = Math.max(0, opts.ambientDrift ?? 0);
  const samplesPerBit = Math.max(1, Math.round(opts.samplesPerBit ?? 8));
  const symbolMs = Math.max(1, opts.symbolMs ?? 20);
  const thresholdLux = opts.thresholdLux ?? (onLux + offLux) / 2;
  const rng = createRng(opts.seed ?? 'physical');

  const n = bits.length;
  const separation = Math.max(1e-6, (onLux - offLux) / 2);
  // The matched filter's processing gain: averaging N samples shrinks the noise
  // standard deviation by sqrt(N), which is why oversampling buys reliability.
  const sigmaEff = ambientNoise / Math.sqrt(samplesPerBit);

  // ---- Transmit each bit as one OOK symbol, sample the modelled medium -----
  const symbols = [];
  const samples = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const bit = bits[i];
    const intendedLux = bit ? onLux : offLux;
    const symSamples = [];
    for (let k = 0; k < samplesPerBit; k++) {
      const noise = ambientNoise > 0 ? rng.gaussian(0, ambientNoise) : 0;
      // Luminance cannot go negative — a photodiode floors at darkness.
      const v = Math.max(0, intendedLux + ambientAt(t, ambientDrift) + noise);
      symSamples.push(v);
      samples.push(v);
      t++;
    }
    // Matched filter for a rectangular pulse == the mean over the symbol.
    const filtered = symSamples.reduce((s, v) => s + v, 0) / symSamples.length;
    const decodedBit = filtered >= thresholdLux ? 1 : 0;
    const confidence = clamp(Math.abs(filtered - thresholdLux) / separation, 0, 1);
    symbols.push({
      index: i,
      intendedBit: bit,
      intendedLux,
      samples: symSamples,
      filtered,
      decodedBit,
      confidence,
      ambiguous: confidence < 0.25,
    });
  }

  const decodedBits = symbols.map((s) => s.decodedBit);
  const errors = bitErrorCount(bits, decodedBits);
  const bitErrorRate = n ? errors / n : 0;
  const recoveredText = bitsToText(decodedBits, { lenient: true });
  const meanConfidence = symbols.length
    ? symbols.reduce((s, sy) => s + sy.confidence, 0) / symbols.length
    : 0;
  const confidence = clamp((1 - bitErrorRate) * 0.7 + meanConfidence * 0.3, 0, 1);

  // ---- Channel arithmetic -------------------------------------------------
  const params = { onLux, offLux, ambientNoise, ambientDrift, samplesPerBit, symbolMs, thresholdLux };
  const predictedBer = theoreticalBer(params);
  // Decision SNR: signal amplitude (half the level separation) over the noise
  // that survives the matched filter.
  const snr = sigmaEff > 0 ? (separation * separation) / (sigmaEff * sigmaEff) : Infinity;
  const snrDb = sigmaEff > 0 ? 10 * Math.log10(snr) : Infinity;
  // Hard-decision (BSC) capacity from the predicted error rate, and the
  // soft-decision AWGN bound above it — the gap is the cost of thresholding.
  const capacityBitsPerSymbol = bscCapacityBits(predictedBer);
  const analogCapacityBitsPerSymbol = Number.isFinite(snr)
    ? 0.5 * Math.log2(1 + snr)
    : Infinity;
  const bitsPerSecond = 1000 / symbolMs;

  return {
    params,
    bits,
    symbols,
    samples,
    filteredLevels: symbols.map((s) => s.filtered),
    decodedBits,
    bitErrors: errors,
    bitErrorRate,
    predictedBer,
    recoveredText,
    confidence,
    separation,
    sigmaEff,
    snr,
    snrDb,
    capacityBitsPerSymbol,
    analogCapacityBitsPerSymbol,
    bitsPerSecond,
    goodputBitsPerSecond: bitsPerSecond * (1 - bitErrorRate),
  };
}

/**
 * Convenience: run the optical simulation straight from a text message.
 * @param {string} message
 * @param {Object} [opts]
 */
export function simulatePhysicalRun(message, opts = {}) {
  const bits = textToBits(message);
  return { bits, ...simulatePhysical(bits, opts) };
}

/**
 * Generate the "no covert transmitter" baseline: the same LED blinking for
 * ordinary reasons (disk activity), which is exactly why the carrier is covert.
 * Routine activity spreads luminance broadly — modelled with an exponential
 * tail — instead of piling into the two tight levels an OOK channel produces.
 * @param {number} count
 * @param {{ onLux?:number, offLux?:number, ambientNoise?:number, seed?:string|number }} [opts]
 * @returns {number[]} matched-filter levels, one per observation
 */
export function generateAmbientBaseline(count, opts = {}) {
  const onLux = opts.onLux ?? 220;
  const offLux = opts.offLux ?? 40;
  const ambientNoise = Math.max(0, opts.ambientNoise ?? 6);
  const rng = createRng(opts.seed ?? 'physical-normal');
  const span = Math.max(1, onLux - offLux);
  const levels = [];
  for (let i = 0; i < count; i++) {
    // Inverse-CDF sampling of an exponential: mostly idle, with an activity tail.
    const u = Math.max(1e-9, rng.next());
    const activity = Math.min(1, -0.35 * Math.log(u));
    const noise = ambientNoise > 0 ? rng.gaussian(0, ambientNoise) : 0;
    levels.push(Math.max(0, offLux + span * activity + noise));
  }
  return levels;
}
