/**
 * channels/dns.js — SIMULATED DNS-as-a-carrier channel.
 *
 * ============================ SAFETY NOTE ==================================
 * NOTHING here touches the network. There is no resolver, no socket, no fetch.
 * Every "query" is a plain JavaScript object. Domains use the reserved
 * reserved TLD ".test" (RFC 6761, reserved for testing). This module
 * demonstrates WHY DNS makes
 * an interesting carrier and HOW a defender would notice it — it is explicitly
 * NOT a DNS tunnel and cannot be used as one.
 * ==========================================================================
 *
 * A real DNS tunnel smuggles data by encoding it into the LABELS of names it
 * asks a resolver to look up. The protocol is entirely legitimate; the
 * *structure* of the requests carries the hidden representation. We reproduce
 * that structure locally so it can be inspected and measured.
 *
 * Pure logic (no DOM).
 */

import { textToUtf8Bytes, utf8BytesToText, tryUtf8BytesToText } from '../utils/utf8.js';
import { createRng } from '../utils/seededRandom.js';
import { normalizedStringEntropy } from '../utils/statistics.js';

export const PARENT_DOMAIN = 'example.test';

/** RFC 4648 base32 alphabet (lower-cased) — DNS-label safe (letters + digits). */
const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const B32_LOOKUP = (() => {
  const m = new Map();
  for (let i = 0; i < B32_ALPHABET.length; i++) m.set(B32_ALPHABET[i], i);
  return m;
})();

/** 5 bits of information per base32 character. */
export const BITS_PER_LABEL_CHAR = 5;

/**
 * Encode bytes to unpadded base32 (lowercase). This is a *toy* encoding chosen
 * because it is DNS-label-safe and easy to read — not because it is stealthy.
 * @param {Uint8Array|number[]} bytes
 * @returns {string}
 */
export function base32Encode(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let out = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const byte of view) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      out += B32_ALPHABET[(buffer >>> bitsInBuffer) & 31];
    }
  }
  if (bitsInBuffer > 0) {
    out += B32_ALPHABET[(buffer << (5 - bitsInBuffer)) & 31];
  }
  return out;
}

/**
 * Decode an unpadded base32 string back to bytes.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function base32Decode(str) {
  const clean = String(str).toLowerCase().replace(/[^a-z2-7]/g, '');
  const bytes = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const ch of clean) {
    const val = B32_LOOKUP.get(ch);
    if (val === undefined) continue;
    buffer = (buffer << 5) | val;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >>> bitsInBuffer) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Split a string into chunks of at most `size` characters. */
function chunk(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

/**
 * Encode a toy message into a sequence of SIMULATED covert DNS queries.
 *
 * @param {string} message
 * @param {{
 *   labelLength?: number,   // characters of data per label (encoding density)
 *   intervalMs?: number,    // nominal gap between queries (request cadence)
 *   jitterMs?: number,      // random timing jitter added to the cadence
 *   client?: string,        // simulated source IP
 *   parent?: string,        // parent domain (documentation ".test")
 *   queryType?: string,     // 'A' | 'AAAA' | 'TXT' | 'NULL' (label only)
 *   startTimeMs?: number,
 *   seed?: string|number,
 * }} [opts]
 * @returns {{
 *   queries: Array<Object>,
 *   encoded: string,
 *   labels: string[],
 *   meta: { labelLength:number, parent:string, queryType:string, totalBytes:number, bitsPerQuery:number }
 * }}
 */
export function encodeMessageToQueries(message, opts = {}) {
  const labelLength = clampInt(opts.labelLength ?? 12, 1, 63);
  const intervalMs = opts.intervalMs ?? 800;
  const jitterMs = opts.jitterMs ?? 0;
  const client = opts.client ?? '10.0.0.21';
  const parent = opts.parent ?? PARENT_DOMAIN;
  const queryType = opts.queryType ?? 'A';
  const startTimeMs = opts.startTimeMs ?? 12 * 3600 * 1000; // 12:00:00 by default
  const rng = createRng(opts.seed ?? 'dns-covert');

  const bytes = textToUtf8Bytes(message);
  const encoded = base32Encode(bytes);
  const labels = chunk(encoded, labelLength);

  const queries = labels.map((label, index) => {
    const fqdn = `${label}.${parent}`;
    const jitter = jitterMs > 0 ? Math.round(rng.gaussian(0, jitterMs)) : 0;
    const timeMs = Math.max(startTimeMs, startTimeMs + index * intervalMs + jitter);
    return {
      index,
      timeMs,
      client,
      label,
      fqdn,
      parent,
      type: queryType,
      length: fqdn.length,
      entropy: normalizedStringEntropy(label, 32), // relative to base32 alphabet
      status: 'NOERROR',
      covert: true,
      isMessage: true,
      delivered: true,
    };
  });

  return {
    queries,
    encoded,
    labels,
    meta: {
      labelLength,
      parent,
      queryType,
      totalBytes: bytes.length,
      bitsPerQuery: labelLength * BITS_PER_LABEL_CHAR,
    },
  };
}

/**
 * Recover the toy message from a set of covert queries (those that were
 * "delivered"). Missing labels leave gaps; the decoder simply concatenates the
 * labels it received in index order, which is why dropped queries corrupt the
 * result — a deliberate teaching point about reliability.
 *
 * @param {Array<Object>} queries
 * @returns {{ encoded:string, bytes:Uint8Array, text:string|null, complete:boolean }}
 */
export function decodeQueriesToMessage(queries) {
  // Only the labels that actually carry message bytes are decoded; continued-
  // tunnel "padding" queries (isMessage === false) are part of the observable
  // stream a defender sees but are not part of the recovered text.
  const isMsg = (q) => q.covert && q.isMessage !== false;
  const covert = queries
    .filter((q) => isMsg(q) && q.delivered !== false)
    .slice()
    .sort((a, b) => a.index - b.index);

  const expectedCount = queries.filter(isMsg).length;
  const complete = covert.length === expectedCount;

  const encoded = covert.map((q) => q.label).join('');
  const bytes = base32Decode(encoded);
  const text = complete ? tryUtf8BytesToText(bytes) : safeLenient(bytes);
  return { encoded, bytes, text, complete };
}

function safeLenient(bytes) {
  try { return utf8BytesToText(bytes, { lenient: true }); } catch { return null; }
}

/** A small pool of ordinary-looking hostnames for cover traffic. */
const COVER_HOSTS = [
  'portal', 'mail', 'cdn', 'assets', 'www', 'api', 'login', 'static',
  'img', 'updates', 'ntp', 'time', 'vpn', 'docs', 'files', 'chat',
  'analytics', 'search', 'maps', 'account',
];
const COVER_PARENTS = [
  'example.test', 'service.test', 'corp.test', 'intra.test', 'cdn.test',
];

/**
 * Generate ordinary-looking DNS cover traffic (short, dictionary-ish labels,
 * frequent repeats, irregular human timing).
 * @param {number} count
 * @param {{ intervalMs?:number, jitterFrac?:number, client?:string, startTimeMs?:number, seed?:string|number }} [opts]
 * @returns {Array<Object>}
 */
export function generateCoverTraffic(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'dns-cover');
  const intervalMs = opts.intervalMs ?? 1200;
  const jitterFrac = opts.jitterFrac ?? 0.8; // human traffic is bursty/irregular
  const client = opts.client ?? '10.0.0.21';
  const startTimeMs = opts.startTimeMs ?? 12 * 3600 * 1000;

  const queries = [];
  let t = startTimeMs;
  for (let i = 0; i < count; i++) {
    const host = rng.pick(COVER_HOSTS);
    const parent = rng.pick(COVER_PARENTS);
    // Occasionally a two-level label, e.g. "cdn.assets.example.test".
    const label = rng.bool(0.25) ? `${host}.${rng.pick(COVER_HOSTS)}` : host;
    const fqdn = `${label}.${parent}`;
    const gap = intervalMs * (1 + rng.gaussian(0, jitterFrac));
    t += Math.max(20, Math.round(gap));
    queries.push({
      index: i,
      timeMs: t,
      client,
      label,
      fqdn,
      parent,
      type: rng.pick(['A', 'A', 'A', 'AAAA', 'HTTPS']),
      length: fqdn.length,
      entropy: normalizedStringEntropy(label.replace(/\./g, ''), 26),
      status: 'NOERROR',
      covert: false,
      delivered: true,
    });
  }
  return queries;
}

/**
 * Full simulated DNS run: covert labels + optional cover traffic, with
 * optional simulated cache de-duplication and packet loss. Returns everything
 * the DNS view and the DNS detector need.
 *
 * @param {string} message
 * @param {{
 *   labelLength?:number, intervalMs?:number, jitterMs?:number, requestCount?:number,
 *   coverCount?:number, cache?:boolean, lossProb?:number, client?:string,
 *   parent?:string, queryType?:string, seed?:string|number
 * }} [opts]
 */
export function simulateDnsRun(message, opts = {}) {
  const seed = opts.seed ?? 'dns';
  const rng = createRng(`${seed}:mix`);
  const lossProb = clamp01(opts.lossProb ?? 0);
  const useCache = opts.cache ?? false;

  const enc = encodeMessageToQueries(message, {
    labelLength: opts.labelLength,
    intervalMs: opts.intervalMs,
    jitterMs: opts.jitterMs,
    client: opts.client,
    parent: opts.parent,
    queryType: opts.queryType,
    seed: `${seed}:covert`,
  });
  let covertQueries = enc.queries;

  // Optionally extend the covert burst to a requested number of requests so a
  // learner can see the statistical *shape* of a sustained tunnel. The extra
  // queries are fresh, unique, high-entropy labels representing continued
  // tunnel chatter (framing / acks) — they are NOT part of the decoded message.
  if (opts.requestCount && opts.requestCount > covertQueries.length) {
    const pad = generateCovertPadding(opts.requestCount - covertQueries.length, {
      startIndex: covertQueries.length,
      startTimeMs: (covertQueries[covertQueries.length - 1]?.timeMs
        ?? (opts.startTimeMs ?? 12 * 3600 * 1000)) + (opts.intervalMs ?? 800),
      intervalMs: opts.intervalMs ?? 800,
      jitterMs: opts.jitterMs ?? 0,
      labelLength: enc.meta.labelLength,
      parent: opts.parent ?? PARENT_DOMAIN,
      client: opts.client,
      queryType: opts.queryType ?? 'A',
      seed: `${seed}:pad`,
    });
    covertQueries = covertQueries.concat(pad);
  }

  const coverQueries = opts.coverCount
    ? generateCoverTraffic(opts.coverCount, {
        intervalMs: opts.intervalMs ? opts.intervalMs * 1.5 : 1200,
        client: opts.client,
        seed: `${seed}:cover`,
      })
    : [];

  // Merge and sort by time.
  let mixed = [...covertQueries, ...coverQueries]
    .map((q, i) => ({ ...q, id: i }))
    .sort((a, b) => a.timeMs - b.timeMs);

  // Simulated resolver cache: a *repeated* identical fqdn is answered from
  // cache and not forwarded. Covert tunnels rarely repeat, so this mostly
  // affects cover traffic — which is itself a lesson (unique-subdomain ratio).
  if (useCache) {
    const seen = new Set();
    mixed = mixed.map((q) => {
      if (seen.has(q.fqdn)) return { ...q, status: 'CACHED', forwarded: false };
      seen.add(q.fqdn);
      return { ...q, forwarded: true };
    });
  } else {
    mixed = mixed.map((q) => ({ ...q, forwarded: true }));
  }

  // Simulated packet loss: some covert queries never reach the receiver.
  if (lossProb > 0) {
    mixed = mixed.map((q) =>
      q.covert && rng.next() < lossProb
        ? { ...q, delivered: false, status: 'LOST' }
        : q
    );
  }

  const decoded = decodeQueriesToMessage(mixed);

  return {
    message,
    encoded: enc.encoded,
    meta: enc.meta,
    covertQueries: mixed.filter((q) => q.covert),
    coverQueries: mixed.filter((q) => !q.covert),
    mixed,
    decoded,
    params: {
      labelLength: enc.meta.labelLength,
      intervalMs: opts.intervalMs ?? 800,
      jitterMs: opts.jitterMs ?? 0,
      lossProb,
      cache: useCache,
      coverCount: opts.coverCount ?? 0,
    },
  };
}

/**
 * Fresh, unique, high-entropy covert labels representing continued tunnel
 * chatter. Not decodable message content — they exist so the observable stream
 * has a realistic sustained shape for the defender to measure.
 */
function generateCovertPadding(count, opts) {
  const rng = createRng(opts.seed ?? 'dns-pad');
  const out = [];
  let t = opts.startTimeMs;
  for (let i = 0; i < count; i++) {
    let label = '';
    for (let k = 0; k < opts.labelLength; k++) label += B32_ALPHABET[rng.int(0, 31)];
    const fqdn = `${label}.${opts.parent}`;
    const jitter = opts.jitterMs > 0 ? Math.round(rng.gaussian(0, opts.jitterMs)) : 0;
    t += Math.max(20, opts.intervalMs + jitter);
    out.push({
      index: opts.startIndex + i,
      timeMs: t,
      client: opts.client ?? '10.0.0.21',
      label,
      fqdn,
      parent: opts.parent,
      type: opts.queryType,
      length: fqdn.length,
      entropy: normalizedStringEntropy(label, 32),
      status: 'NOERROR',
      covert: true,
      isMessage: false,
      delivered: true,
    });
  }
  return out;
}

function clampInt(x, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(x))); }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
