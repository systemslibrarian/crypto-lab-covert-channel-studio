/**
 * analysis/tradeoff.js — the capacity / reliability / observability triangle as
 * live NUMBERS, computed from the actual seeded simulation rather than presets.
 *
 *   Capacity      = how much the channel carries (bits per event, bits/second)
 *   Reliability   = how much survives the network (1 − bit-error-rate)
 *   Observability = how visible it is to a defender (the detector's score)
 *
 * Moving one knob moves the others; sweep() traces that curve so the trade-off
 * is a plot, not a slogan. Pure logic (no DOM).
 */

import { runChannel } from '../simulation.js';
import { textToBits } from '../utils/bits.js';
import { permutationCapacityBits, clamp } from '../utils/statistics.js';

/** Normalise a throughput (bits/second) onto 0..1 for a meter (log scale). */
function throughputNorm(bps) {
  return clamp(Math.log2(bps + 1) / 8, 0, 1); // ~256 bits/s fills the meter
}

/**
 * Compute the trade-off triple for one channel run.
 * @param {'dns'|'icmp'|'timing'|'storage'|'ordering'|'http'|'hopping'|'physical'|'cache'} channel
 * @param {string} message
 * @param {Object} params  channel controls (as in state.channels[channel]) + seed
 * @returns {{ capacity:Object, reliability:Object, observability:Object, run:Object }}
 */
export function computeTradeoff(channel, message, params = {}) {
  const run = runChannel(channel, message, params);
  const msgBits = textToBits(message).length;

  let capacity;
  let reliability;

  switch (channel) {
    case 'dns': {
      const bitsPerEvent = run.raw.meta.bitsPerQuery; // labelLength * 5
      const intervalSec = (params.intervalMs ?? 600) / 1000;
      const bitsPerSecond = intervalSec > 0 ? bitsPerEvent / intervalSec : bitsPerEvent;
      const msgQueries = run.raw.covertQueries.filter((q) => q.isMessage !== false);
      const delivered = msgQueries.filter((q) => q.delivered !== false).length;
      const ber = msgQueries.length ? 1 - delivered / msgQueries.length : 0;
      capacity = { bitsPerEvent, bitsPerSecond, eventLabel: 'query' };
      reliability = { ber };
      break;
    }
    case 'timing': {
      const meanGap = (((params.shortMs ?? 100) + (params.longMs ?? 300)) / 2) || 200;
      const bitsPerSecond = 1000 / meanGap;
      capacity = { bitsPerEvent: 1, bitsPerSecond, eventLabel: 'gap' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'storage': {
      const pkts = run.raw.cleanPackets;
      const span = pkts.length > 1 ? (pkts[pkts.length - 1].timestamp - pkts[0].timestamp) : 0;
      const bitsPerSecond = span > 0 ? (pkts.length - 1) / (span / 1000) : 30;
      capacity = { bitsPerEvent: 1, bitsPerSecond, eventLabel: 'packet' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'ordering': {
      const nEvents = msgBits * 2; // two events per bit
      const ceilingBits = permutationCapacityBits(nEvents);
      const bitsPerSecond = 1000 / (20 * 3); // toy encoder: 1 bit per pair
      const durationSec = msgBits * (20 * 3) / 1000;
      // The full-permutation ceiling is a HIGHER theoretical rate than this toy
      // encoder achieves — the capacity it trades away for simplicity.
      const theoreticalBps = durationSec > 0 ? ceilingBits / durationSec : bitsPerSecond;
      capacity = { bitsPerEvent: 1, bitsPerSecond, theoreticalBps, ceilingBits, achievedBits: msgBits, eventLabel: 'pair' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'icmp': {
      // One echo carries chunkBytes×8 bits in payload mode, or a single
      // identifier bit. The interval is the sender's own ping cadence.
      const bitsPerEvent = run.raw.meta.bitsPerEcho;
      const intervalSec = (run.raw.meta.intervalMs ?? 1000) / 1000;
      const bitsPerSecond = intervalSec > 0 ? bitsPerEvent / intervalSec : bitsPerEvent;
      capacity = { bitsPerEvent, bitsPerSecond, eventLabel: 'echo' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'hopping': {
      // Capacity grows only with log2(n−1): adding protocols to the set buys
      // very little, which is why hopping is a low-rate channel by nature.
      const bitsPerEvent = run.raw.meta.bitsPerHop;
      const gapSec = (run.raw.meta.gapMs ?? 900) / 1000;
      const bitsPerSecond = gapSec > 0 ? bitsPerEvent / gapSec : bitsPerEvent;
      capacity = { bitsPerEvent, bitsPerSecond, eventLabel: 'hop' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'http': {
      const bitsPerEvent = run.raw.meta.bitsPerRequest; // ⌊log2(6!)⌋ = 9
      const bitsPerSecond = bitsPerEvent / 0.3; // ~300 ms between requests
      capacity = { bitsPerEvent, bitsPerSecond, eventLabel: 'request' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'physical': {
      // One OOK symbol carries one bit; the blink period sets the raw rate.
      // The BSC capacity from the modelled noise is the theoretical ceiling.
      const symbolMs = params.symbolMs ?? 20;
      const bitsPerSecond = 1000 / symbolMs;
      const ceiling = run.raw.capacityBitsPerSymbol;
      capacity = {
        bitsPerEvent: 1,
        bitsPerSecond,
        theoreticalBps: bitsPerSecond * ceiling,
        eventLabel: 'blink',
      };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    case 'cache': {
      // One probe carries one bit. Repeating the probe R times to beat the noise
      // is exactly the reliability-for-capacity trade this panel is about.
      const reps = Math.max(1, params.repetitions ?? 1);
      const probeUs = 2; // modelled: ~2 us per flush/reload round, per repetition
      const bitsPerSecond = 1e6 / (probeUs * reps);
      const ceiling = run.raw.capacityBitsPerProbe;
      capacity = {
        bitsPerEvent: 1,
        bitsPerSecond,
        theoreticalBps: bitsPerSecond * ceiling,
        eventLabel: 'probe',
      };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }

  reliability.successRate = clamp(1 - (reliability.ber ?? 0), 0, 1);
  // Three explicit measurements, so "capacity" is never one hand-wavy number:
  //   theoretical  — the structural maximum for this carrier
  //   raw          — what THIS encoder actually emits
  //   goodput      — bits/second recovered correctly, after errors/normalisation
  // For most channels theoretical == raw; ordering's toy encoder sits below its
  // permutation ceiling. goodput <= raw always, and collapses when a middlebox
  // or heavy jitter drives the bit-error rate up.
  capacity.rawBps = capacity.bitsPerSecond;
  capacity.theoreticalBps = capacity.theoreticalBps ?? capacity.rawBps;
  capacity.goodputBps = capacity.rawBps * reliability.successRate;
  capacity.norm = throughputNorm(capacity.goodputBps);

  const observability = {
    score: run.detector.score,
    level: run.detector.anomalyLevel,
    norm: clamp(run.detector.score / 100, 0, 1),
  };

  return { capacity, reliability, observability, run };
}

/** The most illustrative "knob" to sweep for each channel's trade-off curve. */
export const SWEEP = {
  timing: { key: 'jitterMs', label: 'Jitter (ms)', values: [0, 10, 20, 40, 60, 90, 130, 180] },
  dns: { key: 'labelLength', label: 'Label length (chars)', values: [2, 4, 6, 9, 12, 16, 22, 30] },
  ordering: { key: 'reorderProb', label: 'Reordering', values: [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6] },
  physical: { key: 'ambientNoise', label: 'Ambient noise (lux)', values: [0, 40, 80, 120, 180, 260, 340, 420] },
  cache: { key: 'jitterCycles', label: 'Co-tenant jitter (cycles)', values: [0, 30, 60, 100, 150, 220, 300, 400] },
  // Deliberately a FLAT curve, and that is the finding: burying the tunnel in
  // ordinary ping traffic does not move the indicator, because the detector
  // groups by peer before it measures anything.
  icmp: { key: 'coverCount', label: 'Ordinary pings mixed in', values: [0, 10, 20, 40, 80, 120, 160] },
  hopping: { key: 'lossProb', label: 'Flow loss', values: [0, 0.02, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5] },
};

/**
 * Trace the trade-off curve by sweeping one knob.
 * @returns {Array<{ x:number, ber:number, obsScore:number, bitsPerSecond:number }>}
 */
export function sweepTradeoff(channel, message, baseParams = {}) {
  const spec = SWEEP[channel];
  if (!spec) return [];
  return spec.values.map((v) => {
    const t = computeTradeoff(channel, message, { ...baseParams, [spec.key]: v });
    return {
      x: v,
      ber: t.reliability.ber ?? 0,
      obsScore: t.observability.score,
      bitsPerSecond: t.capacity.bitsPerSecond,
    };
  });
}
