/**
 * channels/hopping.js — SIMULATED PROTOCOL-HOPPING covert channel.
 *
 * Every other network module in this exhibit hides bits *inside* a protocol —
 * in a field, in a gap, in an ordering. This one hides them in the CHOICE OF
 * PROTOCOL ITSELF. Each flow is completely ordinary in isolation; the payload
 * lives in the sequence of protocols the host decides to speak next.
 *
 *   current protocol  +  chosen successor  ->  one 2-bit symbol
 *
 * The encoder is a small state machine over an agreed, ordered protocol set.
 * From protocol `i` there are n−1 admissible successors (a hop must change
 * protocol), so with n = 5 protocols each hop carries exactly
 * ⌊log₂(n−1)⌋ = 2 bits and no successor is wasted:
 *
 *   to = (from + 1 + symbol) mod n        symbol ∈ {0, 1, 2, 3}
 *   symbol = (to − from − 1 + n) mod n    (values ≥ n−1 are inadmissible)
 *
 * Two properties make it a good teaching channel:
 *
 *   1. There is no anomalous *value* anywhere. Every flow is a normal flow.
 *      The tell is a TRANSITION statistic — a property of the sequence, which
 *      no per-packet inspector can see.
 *   2. Its state is read straight off the carrier, so the state machine
 *      resynchronises after a lost flow — but the BIT INDEXING does not. One
 *      dropped flow shifts every symbol after it. Loss is locally survivable
 *      and globally fatal, which is not obvious until you watch it happen.
 *
 * Pure logic (no DOM). Nothing here opens a socket or speaks any protocol;
 * "flows" are plain objects in an array.
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { clamp } from '../utils/statistics.js';

/**
 * The agreed protocol set. ORDER IS PART OF THE KEY — sender and receiver must
 * share this list and its indices, exactly as they must share any encoding rule.
 * Ports are shown for realism only; nothing is ever contacted.
 */
export const PROTOCOLS = [
  { key: 'https', label: 'HTTPS', port: 443, role: 'web browsing' },
  { key: 'dns', label: 'DNS', port: 53, role: 'name lookups' },
  { key: 'ntp', label: 'NTP', port: 123, role: 'clock sync' },
  { key: 'smtp', label: 'SMTP', port: 587, role: 'mail submission' },
  { key: 'ssh', label: 'SSH', port: 22, role: 'remote shell' },
];

export const PROTOCOL_KEYS = PROTOCOLS.map((p) => p.key);

/** The rendezvous state both sides agree to start from. */
export const START_PROTOCOL = 'https';

/**
 * Addresses are from the RFC 5737 documentation ranges, which are reserved for
 * exactly this purpose and are not routable — nothing here can be pointed at a
 * real host by copying a value out of the UI.
 *
 * The rendezvous peer matters more than it looks. The receiver has to know
 * WHICH flows are the channel, so the covert walk all goes to one peer. A
 * defender who does not know that peer sees the hops smeared through ordinary
 * host traffic — which is why the detector below pivots per destination.
 */
export const RENDEZVOUS_DEST = '198.51.100.24';
const COVER_DESTS = [
  '192.0.2.11', '192.0.2.37', '192.0.2.90',
  '203.0.113.5', '203.0.113.48', '203.0.113.201',
];

/** ⌊log₂(n−1)⌋ = 2 for n = 5: every admissible successor is used. */
export const BITS_PER_HOP = Math.floor(Math.log2(PROTOCOLS.length - 1));
export const SYMBOL_COUNT = 2 ** BITS_PER_HOP;

const N = PROTOCOLS.length;
const indexOf = (key) => PROTOCOL_KEYS.indexOf(key);

/** Look up a protocol descriptor by key. */
export function protocolInfo(key) {
  return PROTOCOLS.find((p) => p.key === key) || null;
}

/** The successor protocol reached by sending `symbol` from `fromKey`. */
export function successor(fromKey, symbol) {
  const from = indexOf(fromKey);
  if (from < 0) return null;
  return PROTOCOL_KEYS[(from + 1 + (symbol % SYMBOL_COUNT)) % N];
}

/**
 * The symbol a from→to transition encodes, or null if the transition is
 * inadmissible under the grammar (which for n = 5 means only a self-transition,
 * something the encoder never emits).
 */
export function symbolFor(fromKey, toKey) {
  const from = indexOf(fromKey);
  const to = indexOf(toKey);
  if (from < 0 || to < 0) return null;
  const s = (to - from - 1 + N) % N;
  return s < SYMBOL_COUNT ? s : null;
}

/** Pack a flat bit array into BITS_PER_HOP-wide symbols (MSB first, zero-padded). */
export function bitsToSymbols(bits) {
  const symbols = [];
  for (let i = 0; i < bits.length; i += BITS_PER_HOP) {
    let s = 0;
    for (let k = 0; k < BITS_PER_HOP; k++) {
      s = (s << 1) | (i + k < bits.length ? (bits[i + k] & 1) : 0);
    }
    symbols.push(s);
  }
  return symbols;
}

/** Expand one symbol back into its bits (MSB first). */
export function symbolToBits(symbol) {
  const out = [];
  for (let k = BITS_PER_HOP - 1; k >= 0; k--) out.push((symbol >> k) & 1);
  return out;
}

/**
 * Encode bits as a walk over the protocol state machine.
 *
 * The returned array starts with the agreed rendezvous flow (which carries no
 * payload — it only establishes the state), followed by one flow per symbol.
 *
 * @param {number[]} bits
 * @param {{ startProtocol?:string, gapMs?:number, startTimeMs?:number }} [opts]
 * @returns {{ flows:Array<Object>, symbols:number[], meta:Object }}
 */
export function encodeBitsToFlows(bits, opts = {}) {
  const gapMs = opts.gapMs ?? 900;
  const startTimeMs = opts.startTimeMs ?? 0;
  const startProtocol = opts.startProtocol ?? START_PROTOCOL;
  const symbols = bitsToSymbols(bits);

  const dest = opts.dest ?? RENDEZVOUS_DEST;
  const flows = [{
    index: 0, protocol: startProtocol, from: null, symbol: null,
    bits: [], t: startTimeMs, sync: true, dest, covert: true,
  }];
  let cur = startProtocol;
  symbols.forEach((symbol, i) => {
    const to = successor(cur, symbol);
    flows.push({
      index: i + 1, protocol: to, from: cur, symbol,
      bits: symbolToBits(symbol), t: startTimeMs + (i + 1) * gapMs,
      sync: false, dest, covert: true,
    });
    cur = to;
  });

  return {
    flows,
    symbols,
    meta: {
      bitsPerHop: BITS_PER_HOP,
      hops: symbols.length,
      totalBits: bits.length,
      protocolCount: N,
      startProtocol,
      gapMs,
      dest,
    },
  };
}

/**
 * Decode the flow sequence a receiver actually observed.
 *
 * The receiver reads each transition off the carrier, so it never needs hidden
 * state — but it also has no framing. If the path dropped a flow, the pair it
 * reads spans the gap and every later symbol is off by one position.
 *
 * @param {Array<Object>} flows  observed flows, in arrival order
 * @returns {{ symbols:Array<number|null>, bits:number[], invalidHops:number }}
 */
export function decodeFlows(flows) {
  const symbols = [];
  const bits = [];
  let invalidHops = 0;
  for (let i = 1; i < flows.length; i++) {
    const s = symbolFor(flows[i - 1].protocol, flows[i].protocol);
    symbols.push(s);
    if (s === null) {
      invalidHops++;
      // Nothing recoverable: mark the bits as "not recovered" (-1), which the
      // bit ribbon renders as · and the error count treats as a miss.
      for (let k = 0; k < BITS_PER_HOP; k++) bits.push(-1);
    } else {
      bits.push(...symbolToBits(s));
    }
  }
  return { symbols, bits, invalidHops };
}

/**
 * Apply the path's policy to the emitted flows.
 *
 * `blocked` models an egress allow-list: flows to a disallowed protocol simply
 * never arrive. `lossProb` models ordinary drops. Both are the same event from
 * the receiver's point of view — a hop that is not there.
 *
 * @param {Array<Object>} flows
 * @param {{ lossProb?:number, blocked?:string[], seed?:string|number }} [opts]
 * @returns {{ delivered:Array<Object>, all:Array<Object>, droppedCount:number, blockedCount:number }}
 */
export function applyPathPolicy(flows, opts = {}) {
  const lossProb = clamp(opts.lossProb ?? 0, 0, 1);
  const blocked = new Set(opts.blocked ?? []);
  const rng = createRng(opts.seed ?? 'hopping-path');
  let droppedCount = 0;
  let blockedCount = 0;

  const all = flows.map((f) => {
    // Draw for every flow so the sequence of draws — and therefore the whole
    // run — stays stable when only the allow-list changes.
    const lost = rng.next() < lossProb;
    const isBlocked = blocked.has(f.protocol);
    if (isBlocked) blockedCount++;
    else if (lost) droppedCount++;
    return { ...f, blocked: isBlocked, dropped: !isBlocked && lost, delivered: !isBlocked && !lost };
  });

  return { delivered: all.filter((f) => f.delivered), all, droppedCount, blockedCount };
}

/**
 * Peer profiles for the ordinary-traffic baseline.
 *
 * Real hosts do not speak a uniform protocol mix to every peer — they speak
 * HTTPS to web servers, DNS to a resolver, NTP to a time source. A peer usually
 * has ONE dominant protocol with occasional others. That is why the covert walk
 * is conspicuous once traffic is grouped by conversation: it is the only peer a
 * host speaks five protocols to in rotation.
 */
const PEER_PROFILES = [
  { dest: '192.0.2.11', mix: { https: 0.90, dns: 0.02, ntp: 0.01, smtp: 0.02, ssh: 0.05 } },
  { dest: '192.0.2.37', mix: { https: 0.86, dns: 0.02, ntp: 0.01, smtp: 0.09, ssh: 0.02 } },
  { dest: '192.0.2.90', mix: { https: 0.08, dns: 0.90, ntp: 0.01, smtp: 0.005, ssh: 0.005 } },
  { dest: '203.0.113.5', mix: { https: 0.05, dns: 0.03, ntp: 0.90, smtp: 0.01, ssh: 0.01 } },
  { dest: '203.0.113.48', mix: { https: 0.10, dns: 0.02, ntp: 0.01, smtp: 0.82, ssh: 0.05 } },
  { dest: '203.0.113.201', mix: { https: 0.12, dns: 0.02, ntp: 0.01, smtp: 0.03, ssh: 0.82 } },
];

/** Weighted draw from a protocol mix. */
function drawProtocol(rng, mix) {
  let r = rng.next();
  for (const k of PROTOCOL_KEYS) {
    r -= mix[k] ?? 0;
    if (r <= 0) return k;
  }
  return 'https';
}

/**
 * A baseline of ordinary host traffic over the same protocol set.
 *
 * Both the peer and the protocol are STICKY: a browsing session is a run of
 * HTTPS to one server, with lookups to the resolver woven through it. That
 * stickiness is exactly what the covert grammar forbids, which is why the
 * diagonal of the transition matrix is the discriminator — and it has to
 * survive being sliced per peer, or the baseline is not a fair comparison.
 *
 * @param {number} count
 * @param {{ seed?:string|number, stickiness?:number, gapMs?:number }} [opts]
 * @returns {Array<Object>}
 */
export function generateNormalFlows(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'hopping-normal');
  const stickiness = clamp(opts.stickiness ?? 0.62, 0, 0.95);
  const gapMs = opts.gapMs ?? 900;

  const flows = [];
  let peer = PEER_PROFILES[rng.int(0, PEER_PROFILES.length - 1)];
  let cur = drawProtocol(rng, peer.mix);
  for (let i = 0; i < count; i++) {
    if (i > 0 && rng.next() >= stickiness) {
      // Move on: usually a new conversation, sometimes a new protocol with the
      // same peer (fetching over HTTPS, then opening a shell to the same host).
      if (rng.bool(0.7)) peer = PEER_PROFILES[rng.int(0, PEER_PROFILES.length - 1)];
      cur = drawProtocol(rng, peer.mix);
    }
    flows.push({
      index: i, protocol: cur, from: i > 0 ? flows[i - 1].protocol : null,
      symbol: null, bits: [], t: i * gapMs,
      sync: false, dest: peer.dest, covert: false, cover: true,
    });
  }
  return flows;
}

/**
 * A monitoring agent that round-robins a FIXED rotation of service checks
 * against one peer — the honest false positive for this detector.
 *
 * It never repeats a protocol, so its transition-matrix diagonal is empty just
 * like the covert channel's. What separates them is entropy: a fixed rotation
 * uses only n of the n(n−1) admissible transitions, while a channel carrying
 * arbitrary payload uses them all about equally. Keep this case in the
 * benchmark — it is where the second statistic earns its place.
 *
 * @param {number} count
 * @param {{ seed?:string|number, dest?:string, gapMs?:number }} [opts]
 */
export function generateMonitorFlows(count, opts = {}) {
  const dest = opts.dest ?? '203.0.113.77';
  const gapMs = opts.gapMs ?? 900;
  const rotation = opts.rotation ?? PROTOCOL_KEYS;
  return Array.from({ length: count }, (_, i) => ({
    index: i, protocol: rotation[i % rotation.length],
    from: i > 0 ? rotation[(i - 1) % rotation.length] : null,
    symbol: null, bits: [], t: i * gapMs,
    sync: false, dest, covert: false, cover: true, monitor: true,
  }));
}

/**
 * Full simulated protocol-hopping run from a text message.
 * @param {string} message
 * @param {{ lossProb?:number, blocked?:string[], gapMs?:number, seed?:string|number }} [opts]
 */
export function simulateHoppingRun(message, opts = {}) {
  const seed = opts.seed ?? 'hopping';
  const bits = textToBits(message);
  const enc = encodeBitsToFlows(bits, opts);
  const path = applyPathPolicy(enc.flows, {
    lossProb: opts.lossProb ?? 0,
    blocked: opts.blocked ?? [],
    seed: `${seed}:path`,
  });
  const decoded = decodeFlows(path.delivered);

  // Ordinary host traffic to other peers, spread across the same window. The
  // receiver filters by rendezvous peer, so cover never confuses it; the
  // defender has no such filter until they think to pivot.
  const span = Math.max(1, (enc.flows.length - 1) * (enc.meta.gapMs || 900));
  const coverCount = Math.max(0, Math.round(opts.coverCount ?? 0));
  const cover = coverCount
    ? generateNormalFlows(coverCount, {
      seed: `${seed}:cover`,
      gapMs: span / coverCount,
      stickiness: opts.coverStickiness,
    })
    : [];
  // Only the payload bits are compared; the rendezvous flow carries none.
  const errors = bitErrorCount(bits, decoded.bits);
  const cleanBits = decoded.bits.map((b) => (b < 0 ? 0 : b));

  return {
    message,
    bits,
    symbols: enc.symbols,
    flows: enc.flows,
    observedFlows: path.all,
    deliveredFlows: path.delivered,
    decodedBits: decoded.bits,
    decodedSymbols: decoded.symbols,
    invalidHops: decoded.invalidHops,
    recoveredText: bitsToText(cleanBits, { lenient: true }),
    bitErrors: errors,
    bitErrorRate: bits.length ? errors / bits.length : 0,
    coverFlows: cover,
    // What a defender actually sees on the wire: both streams, in time order.
    mixed: [...path.delivered, ...cover].sort((a, b) => a.t - b.t),
    droppedCount: path.droppedCount,
    blockedCount: path.blockedCount,
    blocked: opts.blocked ?? [],
    lossProb: opts.lossProb ?? 0,
    meta: enc.meta,
  };
}
