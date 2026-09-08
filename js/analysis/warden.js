/**
 * analysis/warden.js — the Active Warden / Normalizer Laboratory.
 *
 * An ACTIVE WARDEN does not try to decide whether a message is hidden. It
 * rewrites traffic into a canonical form on the way past, on the theory that a
 * channel which depends on a degree of freedom cannot survive having that
 * freedom removed. The idea is old — Anderson & Petitcolas framed the warden in
 * the information-hiding literature — and the network form of it is traffic
 * normalisation (Handley, Paxson & Kreibich, "Network Intrusion Detection:
 * Evasion, Traffic Normalization, and End-to-End Protocol Semantics", USENIX
 * Security 2001).
 *
 * This lab flips one switch at a time and re-runs EVERY built channel through
 * the actual simulation, so the verdicts are measured rather than asserted.
 * Three results are worth the whole module:
 *
 *   1. Storage channels die cleanly. They depend on a specific value surviving
 *      the path, and a normaliser's entire job is to not let that happen.
 *
 *   2. The timing channel does NOT die. Shaping raises its error rate without
 *      erasing it, and what is left is a RESIDUAL CHANNEL with real Shannon
 *      capacity. Reported here as C = 1 − H₂(BER) bits per symbol rather than
 *      as naive goodput, because the honest question is how much information
 *      could still cross with ideal coding, not how many bits happen to arrive
 *      intact.
 *
 *   3. Two channels are not affected at all, and cannot be. A normaliser sits
 *      in the network path; the air-gap and shared-cache channels are not in
 *      it. No amount of rewriting packets touches a carrier that is not made of
 *      packets — which is the strongest argument in the exhibit against
 *      treating normalisation as a complete answer.
 *
 * A fourth point is easy to miss and is surfaced explicitly: normalisation is
 * DISRUPTION, not DETECTION. When a warden kills a channel the anomaly score
 * usually falls too, so the defender is left with nothing to investigate and no
 * record that anyone tried. Both columns are shown for that reason.
 *
 * Pure logic (no DOM). Deterministic: every run is seeded.
 */

import { computeTradeoff } from './tradeoff.js';
import { bscCapacityBits, clamp } from '../utils/statistics.js';

/**
 * One warden action, and the parameter patch it applies to each channel it
 * touches. A channel absent from `patch` is genuinely untouched by that action
 * — which is a finding, not an omission.
 */
export const WARDEN_ACTIONS = [
  {
    key: 'scrubHeaders',
    label: 'IP/TCP header scrubbing',
    what: 'A NAT rewrites the IP identification field and a normalising firewall rewrites TTLs to a uniform value.',
    cost: 'Effectively free — most networks already do this without meaning to defend anything.',
    patch: { storage: { middlebox: { nat: true, headerNormalization: true, proxy: false, firewall: false, reorder: false } } },
  },
  {
    key: 'canonicalHeaders',
    label: 'HTTP header canonicalisation',
    what: 'A proxy or CDN re-sorts request headers into one canonical order before forwarding.',
    cost: 'Low. Breaks passive client fingerprinting, which some security tooling relies on.',
    patch: { http: { normalize: true } },
  },
  {
    key: 'resequence',
    label: 'Packet resequencing',
    what: 'The warden forwards interchangeable packets in an order of its own choosing rather than the order it received them.',
    cost: 'Adds latency and buffering, and can hurt protocols that infer loss from reordering.',
    patch: { ordering: { reorderProb: 0.5 } },
  },
  {
    key: 'shapeTiming',
    label: 'Traffic shaping / re-pacing',
    what: 'A shaping buffer re-paces flows, smearing the gaps between packets.',
    cost: 'Real and ongoing: added latency for everyone, and buffer memory proportional to how hard you smear. This is the one defence here with a running cost.',
    patch: { timing: { jitterMs: 140 } },
  },
  {
    key: 'scrubIcmp',
    label: 'ICMP normalisation',
    what: 'Echo requests are rewritten to canonical form: the conventional fill pattern is restored over the data area and the Echo Identifier is replaced.',
    cost: 'Low, though it breaks diagnostic tooling that puts its own markers in ping payloads.',
    patch: { icmp: { scrubPayload: true, rewriteId: true } },
  },
  {
    key: 'allowList',
    label: 'Protocol egress allow-list',
    what: 'Only HTTPS and DNS may leave the network; NTP, SMTP and SSH are blocked at the boundary.',
    cost: 'High. This is a policy decision about what the organisation is allowed to do, not a transparent rewrite.',
    patch: { hopping: { blocked: ['ntp', 'smtp', 'ssh'] } },
  },
  {
    key: 'dnsPolicy',
    label: 'DNS label policy',
    what: 'The resolver refuses queries whose labels are long and high-entropy. Modelled as loss applied to exactly those queries — the policy drops the offending traffic and nothing else.',
    cost: 'Moderate. Legitimate services do use long encoded hostnames, so this generates real false positives.',
    patch: { dns: { lossProb: 0.85 } },
  },
];

/**
 * The channels under test, with the clean baseline parameters each is measured
 * from. `inPath` records whether a network warden is even positioned to act.
 */
export const WARDEN_CHANNELS = [
  { key: 'dns', label: 'DNS labels', inPath: true, baseline: { labelLength: 12, requestCount: 24, intervalMs: 600, coverCount: 0, lossProb: 0 } },
  { key: 'icmp', label: 'ICMP echo data', inPath: true, baseline: { field: 'payload', chunkBytes: 4, coverCount: 20 } },
  { key: 'timing', label: 'Inter-packet timing', inPath: true, baseline: { shortMs: 100, longMs: 300, jitterMs: 0, noiseMs: 0, lossProb: 0 } },
  { key: 'storage', label: 'IP/TCP header fields', inPath: true, baseline: { field: 'ttl-toggle' } },
  { key: 'ordering', label: 'Packet ordering', inPath: true, baseline: { reorderProb: 0 } },
  { key: 'http', label: 'HTTP header order', inPath: true, baseline: { coverCount: 0, normalize: false } },
  { key: 'hopping', label: 'Protocol hopping', inPath: true, baseline: { lossProb: 0, blocked: [], coverCount: 30 } },
  {
    key: 'physical', label: 'Air-gap optical', inPath: false,
    baseline: { ambientNoise: 0, ambientDrift: 0 },
    whyNot: 'The carrier is light across a room. A normaliser rewrites packets on a network the sender is not using.',
  },
  {
    key: 'cache', label: 'Shared cache', inPath: false,
    baseline: { probe: 'flush-reload', jitterCycles: 0, evictionProb: 0 },
    whyNot: 'The carrier is cache-line occupancy inside one machine. There is no network path for a warden to sit in.',
  },
];

/** Deep-merge one action patch into a channel's params (one level of nesting). */
function mergePatch(params, patch) {
  const out = { ...params };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && !Array.isArray(out[k]))
      ? { ...out[k], ...v }
      : v;
  }
  return out;
}

/**
 * Residual capacity of an impaired channel, in bits per symbol.
 *
 * C = 1 − H₂(p) is the binary symmetric channel, which credits a channel whose
 * bits are all INVERTED with full capacity — correct for a flip channel, since
 * the receiver can just relabel. That is the wrong model once a warden is
 * involved: the errors here are a mix of flips, erasures and desynchronisation,
 * and a receiver at or past a coin flip cannot tell an inverted channel from a
 * destroyed one. Everything at or above p = 0.5 is therefore reported as zero
 * capacity, which is the conservative reading and the honest one.
 */
function residualCapacity(ber) {
  return ber >= 0.5 ? 0 : bscCapacityBits(ber);
}

/** Measure one channel once. */
function measure(channel, message, params) {
  const t = computeTradeoff(channel, message, params);
  const ber = clamp(t.reliability.ber ?? 0, 0, 1);
  return {
    rawBps: t.capacity.rawBps,
    goodputBps: t.capacity.goodputBps,
    ber,
    // What could still cross with ideal coding — the honest residual.
    residualBitsPerSymbol: residualCapacity(ber),
    residualBps: t.capacity.rawBps * residualCapacity(ber),
    obsScore: t.observability.score,
    obsLevel: t.observability.level,
    decodedText: t.run.decodedText,
  };
}

/**
 * Verdict for one channel under the active action set.
 *
 * Thresholds are stated in the UI as teaching thresholds, not tuned operating
 * points — the same convention as the anomaly levels.
 */
function verdictFor(before, after, touched) {
  if (!touched) return 'untouched';
  const ratio = before.residualBps > 0 ? after.residualBps / before.residualBps : 0;
  // Under a twentieth of the original capacity is not a channel any more.
  if (ratio <= 0.05) return 'closed';
  if (ratio <= 0.6) return 'residual';
  return 'survives';
}

/**
 * Run every channel with and without the active warden actions.
 *
 * @param {string} message
 * @param {{ seed?:string, active?:string[] }} [opts]
 */
export function runWarden(message, opts = {}) {
  const seed = opts.seed ?? 'warden';
  const active = new Set(opts.active ?? []);
  const actions = WARDEN_ACTIONS.filter((a) => active.has(a.key));

  const rows = WARDEN_CHANNELS.map((ch) => {
    const baseParams = { ...ch.baseline, seed: `${seed}:${ch.key}` };
    const before = measure(ch.key, message, baseParams);

    // Collect every active patch that names this channel.
    const applied = actions.filter((a) => a.patch[ch.key]);
    const touched = ch.inPath && applied.length > 0;
    const afterParams = applied.reduce((p, a) => mergePatch(p, a.patch[ch.key]), baseParams);
    const after = touched ? measure(ch.key, message, afterParams) : before;

    return {
      channel: ch.key,
      label: ch.label,
      inPath: ch.inPath,
      whyNot: ch.whyNot ?? null,
      before,
      after,
      touched,
      appliedActions: applied.map((a) => a.key),
      verdict: ch.inPath ? verdictFor(before, after, touched) : 'out-of-path',
      // Negative means the warden made the channel LESS visible while closing
      // it — the disruption-without-detection case.
      observabilityDelta: after.obsScore - before.obsScore,
    };
  });

  const counts = rows.reduce((m, r) => { m[r.verdict] = (m[r.verdict] || 0) + 1; return m; }, {});
  return {
    rows,
    activeActions: actions.map((a) => a.key),
    counts,
    // Channels the warden closed but left no anomaly behind to investigate.
    silentKills: rows.filter((r) => r.verdict === 'closed' && r.observabilityDelta < 0).map((r) => r.channel),
  };
}
