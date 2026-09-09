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
 *   4. One defence neither destroys nor degrades: it THROTTLES. The
 *      protocol-switching-aware warden delays protocol switches, so the hopping
 *      channel comes through with every bit correct and a fraction of the
 *      bitrate. Per-symbol capacity is untouched; symbols per second are not.
 *      That is a third shape of outcome and it gets its own verdict below.
 *
 * One more point is easy to miss and is surfaced explicitly: normalisation is
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
  // The one RATE-LIMITING defence in the lab, and the only one aimed by name at
  // a channel this exhibit builds.
  //
  //   S. Wendzel and J. Keller. 2012a. Preventing Protocol Switching Covert
  //   Channels. International Journal On Advances in Security 5, 3 and 4
  //   (2012), 81-93.
  //
  // Wendzel, Zander, Fechner & Herdin (ACM CSUR 47(3), 2015, §6.3) summarise it
  // as follows: the PCAW "introduces delays on protocol switches and thus limits
  // the bitrate of covert channels that signal hidden information through the
  // use of particular network protocols", and they note it was shown to work on
  // IPv4-based protocol switching and on BACnet building-automation networks.
  //
  // The DETECTION counterpart to this DISRUPTION, for anyone following the
  // module's running distinction, is a separate paper by the same group:
  //
  //   S. Wendzel and S. Zander. 2012. Detecting Protocol Switching Covert
  //   Channels. In 37th IEEE Conference on Local Computer Networks (LCN).
  //   IEEE, 280-283.
  //
  // The DELAY LENGTH below is the lab's own modelling choice, not a figure from
  // either paper: the per-hop gap is stretched from the channel's 0.9 s default
  // to 3.6 s, a four-fold delay picked to be legible on the table. The papers
  // give the mechanism; the number is ours.
  {
    key: 'switchDelay',
    label: 'Protocol-switching-aware warden (PCAW)',
    what: 'Instead of blocking or rewriting anything, the warden holds each change of protocol back before forwarding it, capping how fast a host can switch. Wendzel & Keller (2012a) introduce it to limit the bitrate of channels that signal through the choice of protocol. Modelled here as the hopping channel\'s per-hop gap stretched from 0.9 s to 3.6 s.',
    cost: 'Moderate, and it buys something weaker than the other switches here. Legitimate protocol switches are delayed too, and the channel is never closed — every bit still arrives, just more slowly. A bitrate limit is a budget for the sender, not a barrier.',
    patch: { hopping: { gapMs: 3600 } },
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
  // gapMs is stated explicitly even though 900 is the channel's own default:
  // the PCAW action moves it, and a before/after is only readable if the
  // "before" is written down.
  { key: 'hopping', label: 'Protocol hopping', inPath: true, baseline: { lossProb: 0, blocked: [], coverCount: 30, gapMs: 900 } },
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
 *
 * 'rate-limited' is checked FIRST and deliberately, because it is a different
 * KIND of outcome rather than a point on the same scale. Every other action in
 * this lab attacks the symbol: it corrupts a value, blurs a gap, drops a query.
 * Its signature is a rise in the error rate, and what is left is measured as
 * residual per-symbol capacity C = 1 − H₂(BER).
 *
 * The PCAW attacks the CLOCK. It corrupts nothing, so per-symbol capacity is
 * exactly what it was; there are simply fewer symbols per second. Folding that
 * into 'residual' would tell a reader the channel was damaged, when in fact it
 * still decodes perfectly — the message just takes four times as long. Folding
 * it into 'closed' at a hard enough throttle would be worse: a rate limit is a
 * budget, not a barrier, and a patient sender empties the budget. So the test
 * is not "how much capacity is left" but "is the per-symbol capacity intact",
 * and a throttled-but-intact channel is reported as neither closed nor broken.
 *
 * The consequence is that 'rate-limited' has no lower bound. A hundred-fold
 * delay is still 'rate-limited', not 'closed'. That is the honest reading of
 * what a bitrate limit does, and it is the point of keeping the verdict
 * separate: it stops a defence that only slows an attacker from being scored as
 * one that stops them.
 */
function verdictFor(before, after, touched) {
  if (!touched) return 'untouched';
  // A channel with no capacity to begin with cannot be throttled, and must not
  // be reported as though it were. With before.residualBps === 0 the ratio below
  // is 0 and `perSymbolIntact` reduces to 0 >= -1e-9, which is true — so without
  // this guard a dead-before/dead-after channel would come back 'rate-limited'
  // ("every bit still arrives, just more slowly") when the honest verdict is
  // 'closed'. That is precisely the inversion the verdict exists to prevent.
  if (before.residualBps <= 0) return 'closed';
  const ratio = after.residualBps / before.residualBps;
  // Bits per symbol unchanged, symbols per second down: throttled, not damaged.
  const perSymbolIntact = after.residualBitsPerSymbol >= before.residualBitsPerSymbol - 1e-9;
  if (perSymbolIntact && ratio < 1 - 1e-9) return 'rate-limited';
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
