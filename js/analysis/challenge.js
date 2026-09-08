/**
 * analysis/challenge.js — a genuinely BLIND detection exercise.
 *
 * Each case shows only observables (a query log, an inter-arrival trace, a packet
 * table). The ground truth — clean or covert, and any hidden message — is kept
 * out of the observables and revealed ONLY after the analyst commits to a call.
 * This trains analysis, not recognition of a labelled example.
 *
 * Deterministic from a master seed, so an instructor can share a case set with
 * `#challenge?seed=...`. Pure logic (no DOM).
 */

import { createRng } from '../utils/seededRandom.js';
import { simulateDnsRun, generateCoverTraffic } from '../channels/dns.js';
import { simulateTimingFromText, generateNormalGaps } from '../channels/timing.js';
import { simulateStorageRun, generateNormalPackets, encodeBitsToPackets } from '../channels/storage.js';
import { textToBits } from '../utils/bits.js';
import { analyzeDns } from '../detectors/dnsDetector.js';
import { analyzeTiming } from '../detectors/timingDetector.js';
import { analyzeStorage } from '../detectors/storageDetector.js';
import { simulatePhysical, generateAmbientBaseline } from '../channels/physical.js';
import { simulateCache, generateIdleLatencies } from '../channels/cache.js';
import { simulateIcmpRun, generateNormalEchoes } from '../channels/icmp.js';
import { simulateHoppingRun, generateNormalFlows, generateMonitorFlows, PROTOCOL_KEYS } from '../channels/hopping.js';
import { analyzeIcmp } from '../detectors/icmpDetector.js';
import { analyzeHopping } from '../detectors/hoppingDetector.js';
import { analyzePhysical } from '../detectors/physicalDetector.js';
import { analyzeCache } from '../detectors/cacheDetector.js';

const HIDDEN = ['MEET', 'GO NOW', 'NODE7', 'ACKED', 'RENDEZVOUS', 'PING'];

/** Indicator menus shown for the "name the tell" step. */
export const INDICATORS = {
  dns: ['Long / high-entropy labels', 'Character mix unlike hostnames', 'Almost no repeated names', 'High query volume', 'Metronomic cadence', 'Nothing unusual'],
  timing: ['Two tight timing levels', 'Very low entropy (predictable)', 'Metronomic regularity', 'Nothing unusual'],
  storage: ['A field stuck on two odd values', 'Tiny value support', 'Skewed bit pattern', 'Nothing unusual'],
  physical: ['Two tight luminance levels', 'Levels far above the noise floor', 'Near-50% duty cycle', 'Nothing unusual'],
  cache: ['Fast and slow used about equally', 'Two tight latency groups', 'Groups far apart (clean readout)', 'Nothing unusual'],
  hopping: ['Never repeats a protocol', 'Transitions spread evenly', 'One peer unlike the others', 'A fixed repeating rotation', 'Nothing unusual'],
  icmp: ['Payload is not the standard fill', 'Unusual or varying payload size', 'Every echo carries different data', 'More than one Echo Identifier', 'Nothing unusual'],
};

/**
 * The fixed scenario templates — chosen to include honest false-positive and
 * false-negative traps, not just clean/covert extremes.
 */
const SCENARIOS = [
  {
    channel: 'dns', truth: 'covert', title: 'Outbound DNS from a workstation',
    build(rng, seed) {
      const run = simulateDnsRun(pick(rng, HIDDEN), {
        labelLength: rng.int(12, 18), requestCount: rng.int(16, 28),
        coverCount: rng.int(15, 35), intervalMs: rng.int(400, 700), seed,
      });
      return { observables: dnsObs(run.mixed), detector: analyzeDns(forwarded(run.mixed)), decoded: run.decoded.text };
    },
  },
  {
    channel: 'dns', truth: 'clean', title: 'Outbound DNS from a workstation',
    build(rng, seed) {
      const q = generateCoverTraffic(rng.int(40, 70), { seed });
      return { observables: dnsObs(q), detector: analyzeDns(q) };
    },
  },
  {
    channel: 'dns', truth: 'clean', title: 'DNS during a software update burst',
    build(rng, seed) {
      // Busy but benign: a flood of queries to one CDN, dictionary-ish labels.
      const q = generateCoverTraffic(rng.int(60, 90), { intervalMs: 300, seed });
      return { observables: dnsObs(q), detector: analyzeDns(q), note: 'high volume can look alarming' };
    },
  },
  {
    channel: 'timing', truth: 'covert', title: 'Inter-packet timing on a session',
    build(rng, seed) {
      const run = simulateTimingFromText(pick(rng, HIDDEN), { jitterMs: rng.int(0, 18), seed });
      return { observables: timingObs(run.observedGaps, run.params), detector: analyzeTiming(run.observedGaps), decoded: run.recoveredText };
    },
  },
  {
    channel: 'timing', truth: 'clean', title: 'Inter-packet timing on a session',
    build(rng, seed) {
      const gaps = generateNormalGaps(rng.int(120, 200), { meanMs: rng.int(120, 240), seed });
      return { observables: timingObs(gaps, { shortMs: 0, longMs: 0 }), detector: analyzeTiming(gaps) };
    },
  },
  {
    channel: 'timing', truth: 'clean', title: 'Timing on a health-check poller',
    build(rng, seed) {
      // Regular-looking but benign: fixed interval + small jitter (one level).
      const r = createRng(seed);
      const base = rng.int(150, 250);
      const gaps = Array.from({ length: 140 }, () => Math.max(1, base + r.gaussian(0, 8)));
      return { observables: timingObs(gaps, { shortMs: 0, longMs: 0 }), detector: analyzeTiming(gaps), note: 'regular does not mean covert' };
    },
  },
  {
    channel: 'storage', truth: 'covert', title: 'IP/TCP header fields on a flow',
    build(rng, seed) {
      const bits = textToBits(pick(rng, HIDDEN));
      const packets = encodeBitsToPackets(bits, { field: 'ttl-toggle', seed });
      return { observables: storageObs(packets), detector: analyzeStorage(packets, 'ttl-toggle'), field: 'ttl-toggle' };
    },
  },
  {
    channel: 'storage', truth: 'clean', title: 'IP/TCP header fields on a flow',
    build(rng, seed) {
      const packets = generateNormalPackets(rng.int(40, 64), { seed });
      return { observables: storageObs(packets), detector: analyzeStorage(packets, 'ttl-toggle') };
    },
  },
  {
    channel: 'physical', truth: 'covert', title: 'Activity LED filmed across the room',
    build(rng, seed) {
      const run = simulatePhysical(textToBits(pick(rng, HIDDEN)), { ambientNoise: rng.int(0, 40), seed });
      return {
        observables: seriesObs(run.filteredLevels, 'luminance readings', 'lux'),
        detector: analyzePhysical(run.filteredLevels), decoded: run.recoveredText,
      };
    },
  },
  {
    channel: 'physical', truth: 'clean', title: 'Activity LED filmed across the room',
    build(rng, seed) {
      const levels = generateAmbientBaseline(rng.int(120, 180), { ambientNoise: rng.int(4, 20), seed });
      return { observables: seriesObs(levels, 'luminance readings', 'lux'), detector: analyzePhysical(levels) };
    },
  },
  {
    channel: 'cache', truth: 'covert', title: 'Cache access timings from a co-tenant VM',
    build(rng, seed) {
      const probe = rng.bool(0.5) ? 'flush-reload' : 'prime-probe';
      const run = simulateCache(textToBits(pick(rng, HIDDEN)), { probe, jitterCycles: rng.int(0, 60), seed });
      return {
        observables: seriesObs(run.latencies, 'access latencies', 'cycles'),
        detector: analyzeCache(run.latencies), decoded: run.recoveredText,
      };
    },
  },
  {
    channel: 'cache', truth: 'clean', title: 'Cache access timings from a co-tenant VM',
    build(rng, seed) {
      const lat = generateIdleLatencies(rng.int(120, 180), { missRate: rng.float(0.05, 0.2), seed });
      return { observables: seriesObs(lat, 'access latencies', 'cycles'), detector: analyzeCache(lat) };
    },
  },
  {
    channel: 'cache', truth: 'clean', title: 'A streaming scan over a large array',
    build(rng, seed) {
      // Honest false-positive trap: a working set larger than the cache misses
      // about as often as it hits, which is the balance the detector keys on.
      const lat = generateIdleLatencies(rng.int(120, 180), { missRate: rng.float(0.4, 0.5), seed });
      return {
        observables: seriesObs(lat, 'access latencies', 'cycles'),
        detector: analyzeCache(lat), note: 'a big streaming scan misses about as often as it hits',
      };
    },
  },
  {
    channel: 'hopping', truth: 'covert', title: 'Outbound flows from a build server',
    build(rng, seed) {
      const run = simulateHoppingRun(pick(rng, HIDDEN), {
        coverCount: rng.int(30, 90), lossProb: 0, seed,
      });
      return { observables: flowObs(run.mixed), detector: analyzeHopping(run.mixed), decoded: run.recoveredText };
    },
  },
  {
    channel: 'hopping', truth: 'clean', title: 'Outbound flows from a build server',
    build(rng, seed) {
      const flows = generateNormalFlows(rng.int(70, 130), { seed, stickiness: rng.float(0.5, 0.7) });
      return { observables: flowObs(flows), detector: analyzeHopping(flows) };
    },
  },
  {
    channel: 'hopping', truth: 'clean', title: 'Outbound flows from a monitoring host',
    build(rng, seed) {
      // Honest false-positive trap, and the best one in the set: a monitoring
      // agent that round-robins service checks has an EMPTY transition diagonal,
      // exactly like a covert state machine. The discriminator is that it reuses
      // a handful of transitions where a payload-carrying walk uses them all.
      const len = rng.int(3, 5);
      const rotation = rng.shuffle(PROTOCOL_KEYS).slice(0, len);
      const flows = generateMonitorFlows(rng.int(50, 80), { rotation, dest: '203.0.113.77' });
      return {
        observables: flowObs(flows), detector: analyzeHopping(flows),
        note: 'a scheduled service check never repeats a protocol either — look at how MANY distinct transitions are used, not just whether the diagonal is empty',
      };
    },
  },
  {
    channel: 'icmp', truth: 'covert', title: 'ICMP echo traffic from a jump host',
    build(rng, seed) {
      const run = simulateIcmpRun(pick(rng, HIDDEN), {
        chunkBytes: rng.int(1, 6), padToStandard: rng.bool(0.4),
        coverCount: rng.int(15, 35), seed,
      });
      return { observables: icmpObs(run.mixed), detector: analyzeIcmp(run.mixed), decoded: run.recoveredText };
    },
  },
  {
    channel: 'icmp', truth: 'covert', title: 'ICMP echo traffic from a workstation',
    build(rng, seed) {
      // Honest FALSE NEGATIVE: one bit in the Echo Identifier. Size, fill and
      // repetition statistics all see a completely ordinary ping session.
      const run = simulateIcmpRun(pick(rng, HIDDEN), {
        field: 'id-lowbits', coverCount: rng.int(15, 30), seed,
      });
      return {
        observables: icmpObs(run.mixed), detector: analyzeIcmp(run.mixed), decoded: run.recoveredText,
        note: 'the payload is untouched and correctly-sized — this one is carried in a single header bit, and a content statistic cannot see it',
      };
    },
  },
  {
    channel: 'icmp', truth: 'clean', title: 'ICMP echo traffic from a workstation',
    build(rng, seed) {
      const echoes = generateNormalEchoes(rng.int(25, 50), { seed });
      return { observables: icmpObs(echoes), detector: analyzeIcmp(echoes) };
    },
  },
];

/**
 * Build a shuffled challenge set.
 * @param {string|number} masterSeed
 * @param {number} [count]
 * @returns {Array<Object>} cases (each with id, channel, title, observables, and
 *   a `reveal` object that the UI shows only after the analyst answers)
 */
export function generateChallengeSet(masterSeed, count = 6) {
  const rng = createRng(`challenge:${masterSeed}`);
  const order = rng.shuffle(SCENARIOS.map((_, i) => i)).slice(0, Math.min(count, SCENARIOS.length));
  return order.map((sIdx, i) => {
    const scenario = SCENARIOS[sIdx];
    const caseSeed = `${masterSeed}:${i}:${sIdx}`;
    const built = scenario.build(createRng(caseSeed), caseSeed);
    const fired = built.detector.observations.filter((o) => o.triggered !== false).map((o) => o.what);
    return {
      id: `case-${i + 1}`,
      index: i,
      channel: scenario.channel,
      title: scenario.title,
      observables: built.observables,
      reveal: {
        truth: scenario.truth,
        score: built.detector.score,
        level: built.detector.anomalyLevel,
        methods: built.detector.methods || [],
        firedIndicators: fired,
        decoded: built.decoded ?? null,
        note: built.note ?? null,
        field: built.field ?? null,
      },
    };
  });
}

/**
 * Score a single call against the ground truth.
 * @param {'clean'|'suspicious'|'covert'} call
 * @param {'clean'|'covert'} truth
 * @returns {{ outcome:'caught'|'missed'|'false-positive'|'correct-clean'|'over-cautious', correct:boolean }}
 */
export function scoreCall(call, truth) {
  if (truth === 'covert') {
    if (call === 'covert') return { outcome: 'caught', correct: true };
    if (call === 'suspicious') return { outcome: 'caught', correct: true };
    return { outcome: 'missed', correct: false };
  }
  // truth clean
  if (call === 'clean') return { outcome: 'correct-clean', correct: true };
  if (call === 'suspicious') return { outcome: 'over-cautious', correct: true };
  return { outcome: 'false-positive', correct: false };
}

/* ---- observable projections (safe to render; no ground truth) ------------- */
function dnsObs(queries) {
  return {
    type: 'dns',
    rows: queries.slice(0, 60).map((q) => ({
      time: q.timeMs, client: q.client, fqdn: q.fqdn, qtype: q.type, len: q.length, entropy: q.entropy,
    })),
    count: queries.length,
  };
}
function timingObs(gaps, params) {
  return { type: 'timing', gaps: gaps.slice(0, 220).map((g) => Math.round(g)), count: gaps.length };
}
function storageObs(packets) {
  return {
    type: 'storage',
    rows: packets.slice(0, 40).map((p) => ({
      index: p.index, ttl: p.ttl, ipId: p.ipId, sequence: p.sequence, len: p.payloadLength,
    })),
    count: packets.length,
  };
}

/** Protocol flows: the analyst has to find the transition structure themselves. */
function flowObs(flows) {
  return {
    type: 'flows',
    rows: flows.slice(0, 80).map((f) => ({ time: f.t, protocol: f.protocol, dest: f.dest })),
    count: flows.length,
  };
}

/** ICMP echoes, with the head of each data area shown as hex. */
function icmpObs(echoes) {
  return {
    type: 'icmp',
    rows: echoes.slice(0, 60).map((e) => ({
      seq: e.seq,
      identifier: e.identifier,
      bytes: e.dataBytes,
      dest: e.dest,
      head: (e.data || []).slice(8, 8 + 8).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    })),
    count: echoes.length,
  };
}

/** A plain numeric series (luminance levels, access latencies) to read as a shape. */
function seriesObs(values, label, unit) {
  return {
    type: 'series',
    values: values.slice(0, 220).map((v) => Math.round(v)),
    count: values.length,
    label,
    unit,
  };
}

function forwarded(list) { return list.filter((q) => q.forwarded !== false); }
function pick(rng, arr) { return arr[rng.int(0, arr.length - 1)]; }
