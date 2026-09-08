/**
 * channels/icmp.js — SIMULATED ICMP ECHO covert channel ("ping tunnel").
 *
 * The textbook covert channel, and the one students ask for by name. An echo
 * request carries a data area that the protocol never inspects: RFC 792 says
 * only that whatever is sent must be echoed back. Implementations fill it with
 * a fixed pattern, so it is free space — and it is large.
 *
 * Two encodings live here, deliberately chosen to fail in OPPOSITE ways:
 *
 *   payload      message bytes written into the echo data area.
 *                Loud: high capacity, and the data area stops looking like the
 *                fixed pattern every ping implementation sends.
 *
 *   id-lowbits   one bit in the low bit of the 16-bit Echo Identifier.
 *                Quiet: one bit per echo, the data area is left completely
 *                normal, and no size or content statistic sees anything. This
 *                is the ICMP twin of the IP-ID parity channel in the storage
 *                module, and it is a TAUGHT FALSE NEGATIVE — the detector is
 *                supposed to miss it.
 *
 * They also die to different defences, which is the point of pairing them: a
 * size clamp erases the payload channel and leaves the identifier channel
 * untouched, while a NAT rewriting the Echo Identifier (RFC 5508 requires
 * exactly this, so the NAT can demultiplex replies) erases the identifier
 * channel and leaves the payload untouched. No single normaliser closes ICMP.
 *
 * Addresses are from the RFC 5737 documentation ranges, which are reserved for
 * documentation and are not routable.
 *
 * Pure logic (no DOM). Nothing here crafts, sends, or receives a packet; an
 * "echo" is a plain object in an array.
 */

import { textToUtf8Bytes } from '../utils/utf8.js';
import { bytesToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';
import { clamp } from '../utils/statistics.js';

/** Linux `ping` sends 56 data bytes by default; Windows sends 32. */
export const STANDARD_PAYLOAD_BYTES = 56;
/** The leading bytes a real ping uses for its timestamp, before the fill pattern. */
export const TIMESTAMP_BYTES = 8;
/** Where the classic incrementing fill pattern starts. */
const PATTERN_START = 0x10;

export const DEST_ADDRESS = '198.51.100.24';

export const FIELDS = {
  payload: {
    key: 'payload',
    label: 'Echo data area',
    bitsPerEcho: null, // depends on chunkBytes
    idea: 'Write message bytes straight into the data area the protocol only has to echo back.',
    breaks: 'A normaliser that clamps ICMP payloads to the standard size, or drops non-conforming echoes.',
    tell: 'The data area stops being the fixed incrementing pattern every ping implementation sends, and no two echoes carry the same data.',
  },
  'id-lowbits': {
    key: 'id-lowbits',
    label: 'Echo Identifier (low bit)',
    bitsPerEcho: 1,
    idea: 'Flip the low bit of the 16-bit Echo Identifier; leave everything else exactly as a real ping would send it.',
    breaks: 'Any NAT on the path — RFC 5508 requires the Echo Identifier to be rewritten so replies can be demultiplexed.',
    tell: 'Almost nothing. One session normally keeps one identifier, so a balanced low bit is mildly odd and nothing more.',
  },
};

/** The fixed fill pattern a conventional ping puts after its timestamp. */
export function standardFill(dataBytes) {
  return Array.from({ length: Math.max(0, dataBytes) }, (_, i) => (PATTERN_START + i) & 0xff);
}

/** A plausible per-echo timestamp prefix (deterministic, from the seeded RNG). */
function timestampBytes(rng, seq) {
  // Monotone microsecond-ish counter with a little variation, as a real
  // timestamp would be — the bytes differ per echo but are not random noise.
  const base = 1_500_000 + seq * 1000 + rng.int(0, 400);
  const out = [];
  for (let i = 0; i < TIMESTAMP_BYTES; i++) out.push((base >> ((i % 4) * 8)) & 0xff);
  return out;
}

/**
 * Encode a message as a sequence of echo request/reply exchanges.
 *
 * @param {string} message
 * @param {{ field?:string, chunkBytes?:number, padToStandard?:boolean,
 *   intervalMs?:number, sessionId?:number, seed?:string|number }} [opts]
 */
export function encodeMessageToEchoes(message, opts = {}) {
  const field = opts.field ?? 'payload';
  const chunkBytes = clamp(Math.round(opts.chunkBytes ?? 8), 1, 32);
  const padToStandard = opts.padToStandard ?? false;
  const intervalMs = opts.intervalMs ?? 1000;
  const sessionId = opts.sessionId ?? 0x4f21;
  const rng = createRng(opts.seed ?? 'icmp');

  const bytes = [...textToUtf8Bytes(message)];
  const bits = bytesToBits(bytes);
  const echoes = [];

  if (field === 'id-lowbits') {
    // One bit per echo, hidden in the identifier. Everything else is a
    // by-the-book ping: standard size, standard fill, sequential numbering.
    bits.forEach((bit, i) => {
      const data = [...timestampBytes(rng, i), ...standardFill(STANDARD_PAYLOAD_BYTES - TIMESTAMP_BYTES)];
      echoes.push(makeEcho({
        index: i, seq: i + 1, identifier: (sessionId & 0xfffe) | (bit & 1),
        data, t: i * intervalMs, carriedBits: [bit],
      }));
    });
    return { echoes, bits, bytes, meta: meta(field, 1, bits.length, echoes.length, intervalMs, chunkBytes, padToStandard) };
  }

  // payload: chunk the message across the data areas.
  for (let i = 0, o = 0; o < bytes.length || i === 0; i++, o += chunkBytes) {
    const chunk = bytes.slice(o, o + chunkBytes);
    if (!chunk.length && i > 0) break;
    const data = [...timestampBytes(rng, i), ...chunk];
    if (padToStandard && data.length < STANDARD_PAYLOAD_BYTES) {
      // Pad out with the ordinary fill so the SIZE looks completely normal —
      // the content statistic is then the only thing left to catch it.
      data.push(...standardFill(STANDARD_PAYLOAD_BYTES - data.length));
    }
    echoes.push(makeEcho({
      index: i, seq: i + 1, identifier: sessionId, data,
      t: i * intervalMs, carriedBits: bytesToBits(chunk), chunkLength: chunk.length,
    }));
    if (o + chunkBytes >= bytes.length) break;
  }
  return {
    echoes, bits, bytes,
    meta: meta(field, chunkBytes * 8, bits.length, echoes.length, intervalMs, chunkBytes, padToStandard),
  };
}

function meta(field, bitsPerEcho, totalBits, echoCount, intervalMs, chunkBytes, padToStandard) {
  return { field, bitsPerEcho, totalBits, echoCount, intervalMs, chunkBytes, padToStandard };
}

function makeEcho({ index, seq, identifier, data, t, carriedBits, chunkLength }) {
  return {
    index, seq, identifier, t,
    type: 8, typeLabel: 'echo request',
    dest: DEST_ADDRESS,
    data,
    dataBytes: data.length,
    chunkLength: chunkLength ?? null,
    carriedBits: carriedBits ?? [],
    replied: true,
    covert: true,
  };
}

/**
 * Decode the echoes a receiver observed.
 * @param {Array<Object>} echoes
 * @param {{ field?:string, totalBits?:number, chunkBytes?:number }} [opts]
 */
export function decodeEchoes(echoes, opts = {}) {
  const field = opts.field ?? 'payload';
  const bits = [];
  if (field === 'id-lowbits') {
    for (const e of echoes) bits.push(e.identifier & 1);
  } else {
    for (const e of echoes) {
      // The receiver knows the framing: skip the timestamp, take chunkLength
      // bytes. A clamped echo yields fewer bytes than were sent.
      const want = e.chunkLength ?? Math.max(0, e.dataBytes - TIMESTAMP_BYTES);
      const chunk = e.data.slice(TIMESTAMP_BYTES, TIMESTAMP_BYTES + want);
      const missing = want - chunk.length;
      bits.push(...bytesToBits(chunk));
      // Bytes the path removed are not recoverable — mark, do not guess.
      for (let i = 0; i < missing * 8; i++) bits.push(-1);
    }
  }
  const limited = opts.totalBits != null ? bits.slice(0, opts.totalBits) : bits;
  return { bits: limited, text: bitsToText(limited.map((b) => (b < 0 ? 0 : b)), { lenient: true }) };
}

/**
 * Path handling: a normaliser and/or NAT between sender and receiver.
 *
 * @param {Array<Object>} echoes
 * `scrubPayload` is the ACTIVE-WARDEN action rather than a passive one: instead
 * of merely truncating, the normaliser rewrites the data area into the
 * conventional form it should have had. Rewriting to canonical form is what a
 * traffic normaliser does (Handley, Paxson & Kreibich, USENIX Security 2001),
 * and it closes the channel regardless of how the payload was sized.
 *
 * @param {{ clampBytes?:number|null, rewriteId?:boolean, scrubPayload?:boolean,
 *   lossProb?:number, seed?:string|number }} [opts]
 */
export function applyPathHandling(echoes, opts = {}) {
  const clampBytes = opts.clampBytes ?? null;
  const scrubPayload = !!opts.scrubPayload;
  const rewriteId = !!opts.rewriteId;
  const lossProb = clamp(opts.lossProb ?? 0, 0, 1);
  const rng = createRng(opts.seed ?? 'icmp-path');
  // A NAT assigns its own identifier for the whole mapping, not per packet.
  const natId = 0x9c00 | (rng.int(0, 0xff) & 0xfe);

  return echoes.map((e) => {
    const dropped = rng.next() < lossProb;
    let data = e.data;
    let clamped = false;
    if (clampBytes != null && data.length > clampBytes) {
      data = data.slice(0, clampBytes);
      clamped = true;
    }
    if (scrubPayload) {
      // Keep the timestamp, restore the conventional fill over everything else.
      data = [...data.slice(0, TIMESTAMP_BYTES), ...standardFill(Math.max(0, data.length - TIMESTAMP_BYTES))];
      clamped = true;
    }
    return {
      ...e,
      data,
      dataBytes: data.length,
      identifier: rewriteId ? natId : e.identifier,
      idRewritten: rewriteId,
      clamped,
      dropped,
      delivered: !dropped,
      replied: !dropped,
    };
  });
}

/**
 * A baseline of ordinary ping traffic: one session, one identifier, sequential
 * numbering, standard size, and the same fill pattern in every echo.
 *
 * @param {number} count
 * @param {{ seed?:string|number, intervalMs?:number, dataBytes?:number }} [opts]
 */
export function generateNormalEchoes(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'icmp-normal');
  const intervalMs = opts.intervalMs ?? 1000;
  const dataBytes = opts.dataBytes ?? STANDARD_PAYLOAD_BYTES;
  const sessionId = 0x2000 | rng.int(0, 0x0fff);
  const fill = standardFill(Math.max(0, dataBytes - TIMESTAMP_BYTES));
  return Array.from({ length: count }, (_, i) => ({
    index: i, seq: i + 1, identifier: sessionId,
    t: i * intervalMs + rng.int(-20, 20),
    type: 8, typeLabel: 'echo request',
    dest: '192.0.2.11',
    data: [...timestampBytes(rng, i), ...fill],
    dataBytes,
    chunkLength: null,
    carriedBits: [],
    replied: true,
    delivered: true,
    covert: false,
    cover: true,
  }));
}

/**
 * Full simulated ICMP run from a text message.
 * @param {string} message
 * @param {{ field?:string, chunkBytes?:number, padToStandard?:boolean,
 *   clampBytes?:number|null, rewriteId?:boolean, scrubPayload?:boolean,
 *   lossProb?:number, coverCount?:number, seed?:string|number }} [opts]
 */
export function simulateIcmpRun(message, opts = {}) {
  const seed = opts.seed ?? 'icmp';
  const field = opts.field ?? 'payload';
  const enc = encodeMessageToEchoes(message, { ...opts, seed: `${seed}:enc` });
  const processed = applyPathHandling(enc.echoes, {
    clampBytes: opts.clampBytes ?? null,
    rewriteId: opts.rewriteId ?? false,
    scrubPayload: opts.scrubPayload ?? false,
    lossProb: opts.lossProb ?? 0,
    seed: `${seed}:path`,
  });
  const delivered = processed.filter((e) => e.delivered);
  const decoded = decodeEchoes(delivered, { field, totalBits: enc.bits.length });
  const errors = bitErrorCount(enc.bits, decoded.bits);

  const coverCount = Math.max(0, Math.round(opts.coverCount ?? 0));
  const cover = coverCount
    ? generateNormalEchoes(coverCount, {
      seed: `${seed}:cover`,
      intervalMs: enc.meta.intervalMs,
    })
    : [];

  return {
    message,
    field,
    bits: enc.bits,
    cleanEchoes: enc.echoes,
    processedEchoes: processed,
    deliveredEchoes: delivered,
    coverEchoes: cover,
    mixed: [...delivered, ...cover].sort((a, b) => a.t - b.t),
    decodedBits: decoded.bits,
    recoveredText: decoded.text,
    bitErrors: errors,
    bitErrorRate: enc.bits.length ? errors / enc.bits.length : 0,
    clampedCount: processed.filter((e) => e.clamped).length,
    droppedCount: processed.filter((e) => e.dropped).length,
    idRewritten: !!opts.rewriteId,
    payloadScrubbed: !!opts.scrubPayload,
    clampBytes: opts.clampBytes ?? null,
    meta: enc.meta,
  };
}
