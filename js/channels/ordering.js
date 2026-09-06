/**
 * channels/ordering.js — SIMULATED covert PACKET-ORDERING channel.
 *
 * A channel that carries no value and no timing signature at all: the bit lives
 * purely in the ORDER of two otherwise interchangeable events.
 *
 *   A then B  ->  bit 0
 *   B then A  ->  bit 1
 *
 * It is short but memorable, and it collapses spectacularly the moment the
 * "network" is allowed to reorder packets — which real networks do.
 *
 * Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';

/**
 * Encode bits into ordered pairs of events. Each pair contains an "A" event and
 * a "B" event; their order encodes one bit.
 * @param {number[]} bits
 * @param {{ startTimeMs?:number, gapMs?:number }} [opts]
 * @returns {Array<Object>} one pair object per bit
 */
export function encodeBitsToOrdering(bits, opts = {}) {
  const gapMs = opts.gapMs ?? 20;
  const startTimeMs = opts.startTimeMs ?? 0;
  return bits.map((bit, i) => {
    const base = startTimeMs + i * gapMs * 3;
    // bit 0 => A(0) before B; bit 1 => B before A.
    const aFirst = bit === 0;
    const a = { id: `A${i}`, tag: 'A', pairIndex: i, t: base + (aFirst ? 0 : gapMs) };
    const b = { id: `B${i}`, tag: 'B', pairIndex: i, t: base + (aFirst ? gapMs : 0) };
    const events = [a, b].sort((x, y) => x.t - y.t);
    return {
      index: i,
      bit,
      first: events[0].tag,
      second: events[1].tag,
      events,
    };
  });
}

/**
 * Decode ordered pairs back into bits: whichever of A/B arrives first.
 * @param {Array<Object>} pairs
 * @returns {number[]}
 */
export function decodeOrdering(pairs) {
  return pairs.map((pair) => {
    // Re-derive order from event timestamps so the decoder is honest about
    // what actually arrived first (important after reordering).
    const sorted = pair.events.slice().sort((a, b) => a.t - b.t);
    return sorted[0].tag === 'A' ? 0 : 1;
  });
}

/**
 * Simulate network reordering: with probability `prob`, swap the two events of
 * a pair (flipping that bit). Returns a new array.
 * @param {Array<Object>} pairs
 * @param {{ prob?:number, seed?:string|number }} [opts]
 * @returns {Array<Object>}
 */
export function applyReordering(pairs, opts = {}) {
  const prob = opts.prob ?? 0;
  const rng = createRng(opts.seed ?? 'ordering-noise');
  return pairs.map((pair) => {
    if (prob <= 0 || rng.next() >= prob) return { ...pair, reordered: false };
    // Swap the timestamps of the two events -> flips which arrives first.
    const events = pair.events.map((e) => ({ ...e }));
    const [t0, t1] = [events[0].t, events[1].t];
    events[0].t = t1;
    events[1].t = t0;
    const sorted = events.slice().sort((a, b) => a.t - b.t);
    return {
      ...pair,
      events,
      first: sorted[0].tag,
      second: sorted[1].tag,
      reordered: true,
    };
  });
}

/**
 * Full simulated ordering run from a text message.
 * @param {string} message
 * @param {{ reorderProb?:number, seed?:string|number }} [opts]
 */
export function simulateOrderingRun(message, opts = {}) {
  const bits = textToBits(message);
  const clean = encodeBitsToOrdering(bits, opts);
  const noisy = applyReordering(clean, { prob: opts.reorderProb ?? 0, seed: opts.seed });
  const decodedBits = decodeOrdering(noisy);
  const errors = bitErrorCount(bits, decodedBits);
  return {
    message,
    bits,
    pairs: noisy,
    cleanPairs: clean,
    decodedBits,
    recoveredText: bitsToText(decodedBits, { lenient: true }),
    bitErrors: errors,
    bitErrorRate: bits.length ? errors / bits.length : 0,
    reorderProb: opts.reorderProb ?? 0,
  };
}
