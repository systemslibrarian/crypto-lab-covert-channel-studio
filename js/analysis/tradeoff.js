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
 * @param {'dns'|'timing'|'storage'|'ordering'} channel
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
      const bitsPerSecond = 1000 / (20 * 3); // pair spacing default
      capacity = { bitsPerEvent: 1, bitsPerSecond, ceilingBits, achievedBits: msgBits, eventLabel: 'pair' };
      reliability = { ber: run.bitErrorRate ?? 0 };
      break;
    }
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }

  reliability.successRate = clamp(1 - (reliability.ber ?? 0), 0, 1);
  capacity.norm = throughputNorm(capacity.bitsPerSecond);

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
