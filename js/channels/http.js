/**
 * channels/http.js — SIMULATED application-layer covert channel in HTTP header
 * ORDER. No requests are sent; every "request" is a plain JavaScript object and
 * the host is the reserved documentation domain example.test.
 *
 * A real client library emits its request headers in a stable, recognisable
 * order. Data can be hidden by permuting a set of reorderable headers: k headers
 * give k! orderings, i.e. ⌊log2(k!)⌋ bits per request. The receiver reads the
 * permutation back out. It is a storage-style channel at layer 7 — and, like the
 * IP/TCP field channels, a normalising proxy that re-sorts headers destroys it.
 *
 * Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { permutationCapacityBits } from '../utils/statistics.js';

/** Headers whose order a client may vary without breaking the request. */
export const REORDERABLE = ['Accept', 'Accept-Language', 'Accept-Encoding', 'DNT', 'Referer', 'Upgrade-Insecure-Requests'];
/** Headers a normal client keeps in a fixed position. */
const FIXED_LEADING = ['Host', 'User-Agent'];
const FIXED_TRAILING = ['Connection'];

const HEADER_VALUES = {
  Host: 'portal.example.test',
  'User-Agent': 'Mozilla/5.0 (compatible; LabClient/1.0)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  DNT: '1',
  Referer: 'https://portal.example.test/',
  'Upgrade-Insecure-Requests': '1',
  Connection: 'keep-alive',
};

/** Bits carried by one request via header order. */
export const BITS_PER_REQUEST = permutationCapacityBits(REORDERABLE.length); // ⌊log2(6!)⌋ = 9

const factorials = (() => {
  const f = [1];
  for (let i = 1; i <= 12; i++) f[i] = f[i - 1] * i;
  return f;
})();

/** Rank (0..n!-1) -> permutation of [0..n-1] via the Lehmer code. */
export function permutationFromRank(rank, n) {
  const items = Array.from({ length: n }, (_, i) => i);
  const perm = [];
  let r = rank;
  for (let i = n; i >= 1; i--) {
    const f = factorials[i - 1];
    const idx = Math.floor(r / f);
    r %= f;
    perm.push(items.splice(idx, 1)[0]);
  }
  return perm;
}

/** Permutation of [0..n-1] -> rank. */
export function rankFromPermutation(perm) {
  const n = perm.length;
  const items = Array.from({ length: n }, (_, i) => i);
  let rank = 0;
  for (let i = 0; i < n; i++) {
    const idx = items.indexOf(perm[i]);
    rank += idx * factorials[n - 1 - i];
    items.splice(idx, 1);
  }
  return rank;
}

function makeRequest(index, orderIdx, timestamp) {
  const ordered = orderIdx.map((i) => REORDERABLE[i]);
  const names = [...FIXED_LEADING, ...ordered, ...FIXED_TRAILING];
  return {
    index,
    timestamp,
    method: 'GET',
    path: `/asset/${index}`,
    headers: names.map((name) => ({ name, value: HEADER_VALUES[name] })),
    orderIdx,
  };
}

/**
 * Encode a message into a sequence of simulated requests via header order.
 * @param {string} message
 * @param {{ seed?:string|number, startTimeMs?:number, intervalMs?:number }} [opts]
 */
export function encodeMessageToRequests(message, opts = {}) {
  const rng = createRng(opts.seed ?? 'http');
  const start = opts.startTimeMs ?? 9 * 3600 * 1000;
  const interval = opts.intervalMs ?? 300;
  const bits = textToBits(message);
  const requests = [];
  let bitPos = 0;
  let index = 0;
  while (bitPos < bits.length) {
    const chunk = bits.slice(bitPos, bitPos + BITS_PER_REQUEST);
    // Pad the final chunk with zeros to a full symbol.
    const padded = chunk.concat(Array(BITS_PER_REQUEST - chunk.length).fill(0));
    const rank = parseInt(padded.join(''), 2);
    const orderIdx = permutationFromRank(rank, REORDERABLE.length);
    requests.push({ ...makeRequest(index, orderIdx, start + index * interval), covert: true, bitsUsed: chunk.length });
    bitPos += BITS_PER_REQUEST;
    index++;
  }
  return { requests, bits, meta: { bitsPerRequest: BITS_PER_REQUEST, totalBits: bits.length } };
}

/**
 * Decode requests back into text by reading each request's header permutation.
 * @param {Array<Object>} requests
 * @param {number} totalBits how many message bits were originally encoded
 */
export function decodeRequests(requests, totalBits) {
  const covert = requests.filter((r) => r.covert && r.delivered !== false);
  let bits = [];
  for (const r of covert) {
    const order = orderIdxFromHeaders(r.headers);
    const rank = rankFromPermutation(order);
    const chunk = rank.toString(2).padStart(BITS_PER_REQUEST, '0').split('').map(Number);
    bits = bits.concat(chunk);
  }
  bits = bits.slice(0, totalBits);
  return { bits, text: bitsToText(bits, { lenient: true }) };
}

/** Recover the reorderable-header permutation (as indices into REORDERABLE). */
function orderIdxFromHeaders(headers) {
  const names = headers.map((h) => h.name).filter((n) => REORDERABLE.includes(n));
  return names.map((n) => REORDERABLE.indexOf(n));
}

/** Canonical order a real client would always use (identity permutation). */
const CANONICAL = REORDERABLE.map((_, i) => i);

/**
 * Generate ordinary requests: a real client keeps a STABLE header order every
 * time (here, the canonical order), with natural request timing.
 */
export function generateNormalRequests(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'http-normal');
  const start = opts.startTimeMs ?? 9 * 3600 * 1000;
  const out = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    t += Math.max(20, Math.round(300 * (1 + rng.gaussian(0, 0.7))));
    out.push({ ...makeRequest(i, CANONICAL, t), covert: false });
  }
  return out;
}

/**
 * A normalising proxy/CDN re-sorts request headers into a canonical order,
 * erasing any information hidden in their arrangement.
 */
export function applyHeaderNormalization(requests) {
  return requests.map((r) => ({ ...makeRequest(r.index, CANONICAL, r.timestamp), covert: r.covert, bitsUsed: r.bitsUsed, delivered: r.delivered }));
}

/**
 * Full simulated HTTP run.
 * @param {string} message
 * @param {{ seed?:string|number, normalize?:boolean, coverCount?:number }} [opts]
 */
export function simulateHttpRun(message, opts = {}) {
  const seed = opts.seed ?? 'http';
  const enc = encodeMessageToRequests(message, { seed: `${seed}:enc` });
  const cover = opts.coverCount ? generateNormalRequests(opts.coverCount, { seed: `${seed}:cover` }) : [];
  const covertReqs = enc.requests;
  const processed = opts.normalize ? applyHeaderNormalization(covertReqs) : covertReqs.map((r) => ({ ...r }));
  const decoded = decodeRequests(processed, enc.meta.totalBits);
  const errors = bitErrorCount(enc.bits, decoded.bits);
  return {
    message,
    covertRequests: covertReqs,
    processedRequests: processed,
    coverRequests: cover,
    mixed: [...covertReqs, ...cover].sort((a, b) => a.timestamp - b.timestamp),
    decoded,
    bitErrors: errors,
    bitErrorRate: enc.bits.length ? errors / enc.bits.length : 0,
    meta: enc.meta,
    normalize: !!opts.normalize,
  };
}
