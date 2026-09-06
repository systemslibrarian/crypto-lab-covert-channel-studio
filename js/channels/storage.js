/**
 * channels/storage.js — SIMULATED covert STORAGE channel.
 *
 * The classic covert storage channel hides bits inside the VALUE of a protocol
 * field that is not supposed to carry a message. The packets look ordinary; a
 * receiver who knows the encoding rule reads the hidden bit out of one field.
 *
 * Toy encodings offered here (all simulated — no packet is ever built or sent):
 *   - 'ipid-parity' : parity of the 16-bit IP identification field (even=0, odd=1)
 *   - 'ttl-toggle'  : TTL 64 => 0, TTL 65 => 1
 *   - 'seq-lowbit'  : the low bit of the TCP sequence number
 *
 * The middlebox experiment then shows the real-world catch: NATs, proxies, and
 * header-normalising firewalls rewrite exactly these fields, quietly destroying
 * a channel that is perfectly valid on paper.
 *
 * Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';

export const FIELDS = {
  'ipid-parity': {
    key: 'ipid-parity',
    label: 'IP ID parity',
    field: 'ipId',
    rule: 'even → 0, odd → 1',
    description: 'The 16-bit IP identification field is normally set arbitrarily, so its parity is a tempting place to hide one bit per packet.',
  },
  'ttl-toggle': {
    key: 'ttl-toggle',
    label: 'TTL toggle',
    field: 'ttl',
    rule: 'TTL 64 → 0, TTL 65 → 1',
    description: 'A toy example: nudging the initial TTL between two adjacent values encodes a bit. Real stacks use a few well-known initial TTLs, so this stands out.',
  },
  'seq-lowbit': {
    key: 'seq-lowbit',
    label: 'TCP sequence low bit',
    field: 'sequence',
    rule: 'low bit of the sequence number',
    description: 'The initial sequence number should look random; borrowing its lowest bit hides one bit per segment.',
  },
};

const DEFAULT_SRC = '10.0.0.21';
const DEFAULT_DST = '203.0.113.10'; // RFC 5737 documentation address

/**
 * Build a single ordinary-looking simulated packet, then overwrite the covert
 * field so it carries `bit`.
 */
function makePacket(index, bit, field, rng, baseTs) {
  const ipId = rng.int(0, 0xffff);
  const sequence = rng.int(0, 0xffffffff) >>> 0;
  const pkt = {
    index,
    timestamp: baseTs + index * rng.int(4, 40),
    src: DEFAULT_SRC,
    dst: DEFAULT_DST,
    protocol: 'TCP',
    ttl: 64,
    ipId,
    sequence,
    payloadLength: rng.int(40, 1400),
    covertBit: bit,
    field,
  };
  applyEncoding(pkt, field, bit);
  return pkt;
}

/** Set the covert field of `pkt` so that it decodes to `bit`. */
function applyEncoding(pkt, field, bit) {
  switch (field) {
    case 'ipid-parity':
      if ((pkt.ipId & 1) !== bit) pkt.ipId ^= 1;
      break;
    case 'ttl-toggle':
      pkt.ttl = 64 + bit;
      break;
    case 'seq-lowbit':
      pkt.sequence = ((pkt.sequence & ~1) | bit) >>> 0;
      break;
    default:
      throw new Error(`Unknown storage field: ${field}`);
  }
}

/**
 * Read the covert bit out of one packet for a given field.
 * @returns {number} 0 or 1
 */
export function extractBit(pkt, field) {
  switch (field) {
    case 'ipid-parity': return pkt.ipId & 1;
    case 'ttl-toggle': return pkt.ttl & 1;
    case 'seq-lowbit': return pkt.sequence & 1;
    default: throw new Error(`Unknown storage field: ${field}`);
  }
}

/**
 * Encode a bit sequence into an array of simulated packets.
 * @param {number[]} bits
 * @param {{ field?:string, seed?:string|number, startTimeMs?:number }} [opts]
 * @returns {Array<Object>}
 */
export function encodeBitsToPackets(bits, opts = {}) {
  const field = opts.field ?? 'ipid-parity';
  if (!FIELDS[field]) throw new Error(`Unknown storage field: ${field}`);
  const rng = createRng(opts.seed ?? 'storage');
  const baseTs = opts.startTimeMs ?? 0;
  return bits.map((bit, i) => makePacket(i, bit, field, rng, baseTs));
}

/**
 * Extract the bit sequence carried by a set of packets.
 * @param {Array<Object>} packets
 * @param {string} field
 * @returns {number[]}
 */
export function extractBits(packets, field) {
  return packets
    .filter((p) => p.delivered !== false)
    .map((p) => extractBit(p, field));
}

/**
 * Decode packets back to text for a given field.
 * @param {Array<Object>} packets
 * @param {string} field
 * @returns {{ bits:number[], text:string|null }}
 */
export function decodePackets(packets, field) {
  const bits = extractBits(packets, field);
  return { bits, text: bitsToText(bits, { lenient: true }) };
}

/**
 * Which middlebox transforms break which fields, and why. Used by the UI to
 * explain the outcome rather than just show it.
 */
export const MIDDLEBOX_IMPACT = {
  nat: {
    label: 'NAT',
    affects: ['ipid-parity'],
    why: 'A NAT commonly rewrites the IP identification field, randomising its parity.',
  },
  headerNormalization: {
    label: 'Header normalization',
    affects: ['ttl-toggle'],
    why: 'A normalising firewall rewrites the TTL to a standard value, erasing the toggle.',
  },
  proxy: {
    label: 'Proxy',
    affects: ['seq-lowbit'],
    why: 'A proxy terminates the connection and opens a new one with a fresh sequence number.',
  },
  firewall: {
    label: 'Firewall (drops)',
    affects: ['ipid-parity', 'ttl-toggle', 'seq-lowbit'],
    why: 'Dropping packets removes bits and misaligns everything after the gap.',
  },
  reorder: {
    label: 'Reordering',
    affects: ['ipid-parity', 'ttl-toggle', 'seq-lowbit'],
    why: 'Reordering scrambles the bit sequence even though each individual value survives.',
  },
};

/**
 * Apply a simulated middlebox to a copy of the packets.
 * @param {Array<Object>} packets
 * @param {{
 *   nat?:boolean, headerNormalization?:boolean, proxy?:boolean,
 *   firewall?:boolean, reorder?:boolean, dropProb?:number, seed?:string|number
 * }} [opts]
 * @returns {Array<Object>}
 */
export function applyMiddlebox(packets, opts = {}) {
  const rng = createRng(opts.seed ?? 'middlebox');
  const dropProb = opts.dropProb ?? 0.15;
  let out = packets.map((p) => ({ ...p }));

  if (opts.nat) {
    out = out.map((p) => ({ ...p, ipId: rng.int(0, 0xffff), rewritten: true }));
  }
  if (opts.headerNormalization) {
    out = out.map((p) => ({ ...p, ttl: 64, rewritten: true }));
  }
  if (opts.proxy) {
    out = out.map((p) => ({ ...p, sequence: rng.int(0, 0xffffffff) >>> 0, rewritten: true }));
  }
  if (opts.firewall) {
    out = out.map((p) => (rng.next() < dropProb ? { ...p, delivered: false } : p));
  }
  if (opts.reorder) {
    // Local reordering within small windows (as real networks do), not a full
    // shuffle — enough to scramble the message but visually believable.
    const win = 3;
    for (let i = 0; i < out.length; i += win) {
      const slice = out.slice(i, i + win);
      const shuffled = rng.shuffle(slice);
      for (let k = 0; k < slice.length; k++) out[i + k] = shuffled[k];
    }
  }
  return out;
}

/**
 * Full simulated storage run: encode, keep a pristine copy, apply an optional
 * middlebox, and decode both — plus a batch of "normal" packets for the
 * defender's field-distribution comparison.
 *
 * @param {string} message
 * @param {{
 *   field?:string, seed?:string|number, middlebox?:Object, normalCount?:number
 * }} [opts]
 */
export function simulateStorageRun(message, opts = {}) {
  const field = opts.field ?? 'ipid-parity';
  const seed = opts.seed ?? 'storage';
  const bits = textToBits(message);
  const clean = encodeBitsToPackets(bits, { field, seed: `${seed}:enc` });

  const middleboxOpts = opts.middlebox ?? {};
  const anyMiddlebox = Object.values(middleboxOpts).some((v) => v === true);
  const processed = anyMiddlebox
    ? applyMiddlebox(clean, { ...middleboxOpts, seed: `${seed}:mb` })
    : clean.map((p) => ({ ...p }));

  const cleanDecode = decodePackets(clean, field);
  const processedDecode = decodePackets(processed, field);
  const errors = bitErrorCount(bits, processedDecode.bits);

  // "Normal" packets: field values chosen naturally (no hidden structure).
  const normal = generateNormalPackets(opts.normalCount ?? clean.length, { seed: `${seed}:normal` });

  return {
    message,
    field,
    fieldInfo: FIELDS[field],
    bits,
    cleanPackets: clean,
    processedPackets: processed,
    cleanDecode,
    processedDecode,
    bitErrors: errors,
    bitErrorRate: bits.length ? errors / bits.length : 0,
    normalPackets: normal,
    middlebox: middleboxOpts,
  };
}

/**
 * Generate ordinary packets with naturally-distributed field values for the
 * defender comparison. Real initial TTLs cluster at a few values (64/128/255);
 * IP IDs and sequence numbers look uniform.
 * @param {number} count
 * @param {{ seed?:string|number }} [opts]
 */
export function generateNormalPackets(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'storage-normal');
  const ttlChoices = [64, 128, 255];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      index: i,
      timestamp: i * rng.int(4, 40),
      src: DEFAULT_SRC,
      dst: DEFAULT_DST,
      protocol: 'TCP',
      ttl: rng.pick(ttlChoices),
      ipId: rng.int(0, 0xffff),
      sequence: rng.int(0, 0xffffffff) >>> 0,
      payloadLength: rng.int(40, 1400),
      covertBit: null,
      field: null,
    });
  }
  return out;
}
