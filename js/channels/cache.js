/**
 * channels/cache.js — SIMULATED shared-cache channel (a MODEL of the cache).
 *
 * Two processes that are forbidden to talk to each other still share the CPU
 * cache. Neither writes to the other; they signal purely by whether a cache line
 * is PRESENT, and the receiver reads that presence off the clock:
 *
 *   Flush + Reload    fast reload (line was HIT)   ->  bit 1
 *                     slow reload (line was MISS)  ->  bit 0
 *
 *   Prime + Probe     slow probe (set was EVICTED) ->  bit 1
 *                     fast probe (set intact)      ->  bit 0
 *
 * This is the concrete instance of the abstraction taught in the Shared-Resource
 * Matrix: the high process can MODIFY a shared attribute (cache occupancy) that
 * the low process can REFERENCE (by timing it). The matrix says a channel exists;
 * this module is what one actually looks like.
 *
 * WHAT IS REAL AND WHAT IS MODELLED
 *   Real here:      the two protocols and their opposite polarities, the
 *                   threshold classifier, repeated probing and its averaging
 *                   gain, the measured bit-error rate, and the capacity
 *                   arithmetic — all ordinary protocol and signal logic.
 *   MODELLED here:  the cache. There is no cache line, no flush instruction, and
 *                   no timer. "Cycles" are JavaScript numbers drawn from a
 *                   documented distribution. Nothing is measured, nothing is
 *                   evicted, and no timing side channel exists in this page.
 *
 * The noise process is deliberately ASYMMETRIC, because real cache channels are:
 * a co-tenant can evict a line the sender did place (turning a 1 into a 0), but
 * cannot conjure a line the sender never touched. Errors therefore fall mostly
 * on one symbol — a fact the capacity note below is explicit about.
 *
 * Everything is a JavaScript number. No cache is touched. Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { clamp, qFunction, bscCapacityBits } from '../utils/statistics.js';

/**
 * The two probing protocols. `fastMeansOne` captures the polarity flip that
 * catches everyone out the first time: in Flush+Reload the sender's access makes
 * the receiver FASTER, in Prime+Probe it makes the receiver SLOWER.
 */
export const PROBES = [
  {
    key: 'flush-reload',
    label: 'Flush + Reload',
    fastMeansOne: true,
    rule: 'fast reload (HIT) = 1, slow reload (MISS) = 0',
    needs: 'A page both processes map read-only — typically a shared library.',
    description: 'The receiver flushes one specific line, waits, then reloads it and times the load. If the sender touched that line in between, the reload is a hit.',
    citation: 'Yarom & Falkner, USENIX Security 2014',
  },
  {
    key: 'prime-probe',
    label: 'Prime + Probe',
    fastMeansOne: false,
    rule: 'slow probe (EVICTED) = 1, fast probe (intact) = 0',
    needs: 'Nothing shared — only co-residency on the same cache.',
    description: 'The receiver fills a cache set with its own lines, waits, then re-walks the set and times it. If the sender used that set, some of the receiver\'s lines were evicted and the walk is slow.',
    citation: 'Osvik, Shamir & Tromer, CT-RSA 2006',
  },
];

/** Look up a probe protocol by key. */
export function probeInfo(key) {
  const found = PROBES.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown cache probe: ${key}`);
  return found;
}

/**
 * Closed-form bit-error rate for this model.
 *
 * Latencies are Gaussian around the fast and slow centres; averaging `repetitions`
 * probes shrinks the standard deviation by sqrt(R). On top of that, an intended
 * FAST symbol is converted to a slow one with probability `evictionProb` by a
 * modelled co-tenant, which is very likely to be misread.
 *
 * @param {{ hitCycles:number, missCycles:number, jitterCycles:number,
 *           evictionProb:number, repetitions:number, thresholdCycles:number }} p
 * @returns {number} bit-error probability in [0, 1]
 */
export function theoreticalBer(p) {
  const r = Math.max(1, p.repetitions);
  const sigmaEff = Math.max(0, p.jitterCycles) / Math.sqrt(r);
  const e = clamp(p.evictionProb, 0, 1);

  let pFastErr; // a genuinely fast measurement misread as slow
  let pSlowErr; // a genuinely slow measurement misread as fast
  if (sigmaEff <= 0) {
    pFastErr = p.hitCycles >= p.thresholdCycles ? 1 : 0;
    pSlowErr = p.missCycles < p.thresholdCycles ? 1 : 0;
  } else {
    pFastErr = qFunction((p.thresholdCycles - p.hitCycles) / sigmaEff);
    pSlowErr = qFunction((p.missCycles - p.thresholdCycles) / sigmaEff);
  }

  // Symbols meant to be fast can be evicted into the slow distribution, and are
  // then wrong unless the noise flips them back. Symbols meant to be slow cannot
  // be un-evicted, so they only suffer the ordinary threshold error.
  const errGivenFast = (1 - e) * pFastErr + e * (1 - pSlowErr);
  const errGivenSlow = pSlowErr;
  return clamp((errGivenFast + errGivenSlow) / 2, 0, 1);
}

/**
 * Run the colluding pair end-to-end over the modelled cache.
 *
 * @param {number[]} bits  intended bit sequence (0/1)
 * @param {{
 *   probe?:string, hitCycles?:number, missCycles?:number, jitterCycles?:number,
 *   evictionProb?:number, repetitions?:number, thresholdCycles?:number,
 *   seed?:string|number
 * }} [opts]
 * @returns {Object} full cache simulation result (see fields below)
 */
export function simulateCache(bits, opts = {}) {
  const probe = opts.probe ?? 'flush-reload';
  const info = probeInfo(probe);
  const hitCycles = opts.hitCycles ?? 80;
  const missCycles = opts.missCycles ?? 300;
  const jitterCycles = Math.max(0, opts.jitterCycles ?? 0);
  const evictionProb = clamp(opts.evictionProb ?? 0, 0, 1);
  const repetitions = Math.max(1, Math.round(opts.repetitions ?? 1));
  const thresholdCycles = opts.thresholdCycles ?? (hitCycles + missCycles) / 2;
  const rng = createRng(opts.seed ?? 'cache');

  const n = bits.length;
  const separation = Math.max(1e-6, (missCycles - hitCycles) / 2);
  // Repeated probing is the receiver's matched filter: R probes, sigma/sqrt(R).
  const sigmaEff = jitterCycles / Math.sqrt(repetitions);

  const probes = [];
  for (let i = 0; i < n; i++) {
    const bit = bits[i];
    // Does the sender touch the monitored line/set for this bit? In Flush+Reload
    // the sender touches it to signal a 1; in Prime+Probe, touching it evicts the
    // receiver's line, which also signals a 1. Either way: touch iff bit === 1.
    const senderTouched = bit === 1;
    // The protocol decides whether "touched" reads as fast or slow.
    let isFast = info.fastMeansOne ? senderTouched : !senderTouched;

    // Modelled co-tenant interference: a line that WAS resident can be evicted,
    // pushing a fast measurement into the slow distribution. The reverse never
    // happens — nobody can restore a line the sender never placed.
    const evicted = isFast && evictionProb > 0 && rng.bool(evictionProb);
    if (evicted) isFast = false;

    const centre = isFast ? hitCycles : missCycles;
    const samples = [];
    for (let k = 0; k < repetitions; k++) {
      const noise = jitterCycles > 0 ? rng.gaussian(0, jitterCycles) : 0;
      // A measured latency cannot be negative.
      samples.push(Math.max(0, centre + noise));
    }
    // Averaging keeps the noise arithmetic transparent. Real implementations
    // often take the minimum or median instead, to reject interference spikes.
    const latencyCycles = samples.reduce((s, v) => s + v, 0) / samples.length;

    const measuredFast = latencyCycles < thresholdCycles;
    const decodedBit = (measuredFast === info.fastMeansOne) ? 1 : 0;
    const confidence = clamp(Math.abs(latencyCycles - thresholdCycles) / separation, 0, 1);

    probes.push({
      index: i,
      intendedBit: bit,
      senderTouched,
      evicted,
      expectedState: isFast ? 'fast' : 'slow',
      samples,
      latencyCycles,
      measuredFast,
      decodedBit,
      confidence,
      ambiguous: confidence < 0.25,
    });
  }

  const decodedBits = probes.map((p) => p.decodedBit);
  const errors = bitErrorCount(bits, decodedBits);
  const bitErrorRate = n ? errors / n : 0;
  const recoveredText = bitsToText(decodedBits, { lenient: true });
  const meanConfidence = probes.length
    ? probes.reduce((s, p) => s + p.confidence, 0) / probes.length
    : 0;
  const confidence = clamp((1 - bitErrorRate) * 0.7 + meanConfidence * 0.3, 0, 1);

  const params = {
    probe, hitCycles, missCycles, jitterCycles, evictionProb, repetitions, thresholdCycles,
  };
  const predictedBer = theoreticalBer(params);
  const snr = sigmaEff > 0 ? (separation * separation) / (sigmaEff * sigmaEff) : Infinity;
  const snrDb = sigmaEff > 0 ? 10 * Math.log10(snr) : Infinity;
  // NOTE: eviction noise makes this channel asymmetric, so the symmetric (BSC)
  // formula below is an approximation that uses the average error rate. It is
  // exact when evictionProb is 0, and slightly pessimistic otherwise.
  const capacityBitsPerProbe = bscCapacityBits(predictedBer);

  return {
    params,
    probe,
    probeInfo: info,
    bits,
    probes,
    latencies: probes.map((p) => p.latencyCycles),
    fastLatencies: probes.filter((p) => p.expectedState === 'fast').map((p) => p.latencyCycles),
    slowLatencies: probes.filter((p) => p.expectedState === 'slow').map((p) => p.latencyCycles),
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
    capacityBitsPerProbe,
    evictedCount: probes.filter((p) => p.evicted).length,
  };
}

/**
 * Convenience: run the cache simulation straight from a text message.
 * @param {string} message
 * @param {Object} [opts]
 */
export function simulateCacheRun(message, opts = {}) {
  const bits = textToBits(message);
  return { bits, ...simulateCache(bits, opts) };
}

/**
 * Generate the "no covert sender" baseline: one ordinary process timing its own
 * memory accesses. Real programs have locality, so most accesses hit and a
 * minority miss — a lopsided, single-shouldered distribution rather than the
 * balanced two-level split a covert channel produces.
 * @param {number} count
 * @param {{ hitCycles?:number, missCycles?:number, jitterCycles?:number,
 *           missRate?:number, seed?:string|number }} [opts]
 * @returns {number[]} measured latencies, one per access
 */
export function generateIdleLatencies(count, opts = {}) {
  const hitCycles = opts.hitCycles ?? 80;
  const missCycles = opts.missCycles ?? 300;
  const jitterCycles = Math.max(0, opts.jitterCycles ?? 18);
  const missRate = clamp(opts.missRate ?? 0.12, 0, 1);
  const rng = createRng(opts.seed ?? 'cache-normal');
  const out = [];
  for (let i = 0; i < count; i++) {
    const miss = rng.bool(missRate);
    const centre = miss ? missCycles : hitCycles;
    // Misses have a long tail (queueing behind other memory traffic).
    const tail = miss ? Math.max(0, -Math.log(Math.max(1e-9, rng.next())) * 40) : 0;
    const noise = jitterCycles > 0 ? rng.gaussian(0, jitterCycles) : 0;
    out.push(Math.max(0, centre + noise + tail));
  }
  return out;
}
