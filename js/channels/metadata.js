/**
 * channels/metadata.js — SIMULATED "unintended inference" channel in operational
 * records. The librarian's-eye exhibit: information hiding is not only a network
 * phenomenon. Routine metadata that no one designed to carry a message — here, a
 * library circulation / transfer log — can be read as one.
 *
 * Each transfer is routed through one of two branches. That routing is an
 * ordinary logistics choice, but its per-record pattern forms a storage-style
 * covert channel: branch A = 0, branch B = 1. A privacy analyst reading the log
 * does not need the "key" to notice that the routing pattern is not random.
 *
 * The defence is data minimisation: keep only daily aggregates and the
 * per-record signal — and much of the privacy exposure — disappears.
 *
 * This is a teaching simulation about metadata and privacy. It is NOT a covert
 * messaging tool and contains no real records. Pure logic (no DOM).
 */

import { textToBits, bitsToText, bitErrorCount } from '../utils/bits.js';
import { createRng } from '../utils/seededRandom.js';

const ITEM_CLASSES = ['Fiction', 'Reference', 'Periodicals', 'Media', 'Juvenile', 'Government Docs'];
const BRANCHES = ['Central', 'Riverside']; // Central = 0, Riverside = 1

/**
 * Encode a message into a simulated transfer log. Each bit becomes one transfer
 * whose destination branch carries the bit.
 * @param {string} message
 * @param {{ seed?:string|number, startDay?:number, perDay?:number }} [opts]
 */
export function encodeMessageToRecords(message, opts = {}) {
  const rng = createRng(opts.seed ?? 'metadata');
  const perDay = opts.perDay ?? 4;
  const startDay = opts.startDay ?? 1;
  const bits = textToBits(message);
  const records = bits.map((bit, i) => ({
    index: i,
    day: startDay + Math.floor(i / perDay),
    itemClass: rng.pick(ITEM_CLASSES),
    branch: BRANCHES[bit],
    covert: true,
    bit,
  }));
  return { records, bits };
}

/** Read the routing pattern back out of the covert records. */
export function decodeRecords(records) {
  const covert = records.filter((r) => r.covert && r.delivered !== false)
    .slice().sort((a, b) => a.index - b.index);
  const bits = covert.map((r) => (r.branch === BRANCHES[1] ? 1 : 0));
  return { bits, text: bitsToText(bits, { lenient: true }) };
}

/** Generate ordinary transfers with a realistic branch split (not a message). */
export function generateNormalRecords(count, opts = {}) {
  const rng = createRng(opts.seed ?? 'metadata-normal');
  const perDay = opts.perDay ?? 4;
  const startDay = opts.startDay ?? 1;
  // Real routing favours one hub; use a stable ~65/35 split, not 50/50.
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    day: startDay + Math.floor(i / perDay),
    itemClass: rng.pick(ITEM_CLASSES),
    branch: rng.bool(0.65) ? BRANCHES[0] : BRANCHES[1],
    covert: false,
  }));
}

/**
 * Data-minimisation defence: collapse per-record routing into daily aggregates.
 * The bit-bearing detail is gone, so the message can no longer be recovered.
 * @param {Array<Object>} records
 * @returns {{ aggregates:Array<{day:number,total:number,central:number,riverside:number}>, records:Array<Object> }}
 */
export function applyMinimization(records) {
  const byDay = new Map();
  for (const r of records) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, total: 0, central: 0, riverside: 0 });
    const d = byDay.get(r.day);
    d.total++;
    if (r.branch === BRANCHES[0]) d.central++; else d.riverside++;
  }
  const aggregates = [...byDay.values()].sort((a, b) => a.day - b.day);
  // The per-record log the analyst now has is only the aggregate; decoding is impossible.
  return { aggregates, records: [] };
}

/**
 * Full simulated run.
 * @param {string} message
 * @param {{ seed?:string|number, minimize?:boolean }} [opts]
 */
export function simulateRecordsRun(message, opts = {}) {
  const seed = opts.seed ?? 'metadata';
  const enc = encodeMessageToRecords(message, { seed: `${seed}:enc` });
  const minimized = opts.minimize ? applyMinimization(enc.records) : null;
  const decoded = opts.minimize
    ? { bits: [], text: null }               // cannot decode from aggregates
    : decodeRecords(enc.records);
  const errors = bitErrorCount(enc.bits, decoded.bits);
  // Branch balance is itself the privacy tell: an encoded message is ~50/50,
  // unlike the hub-weighted split of ordinary operations.
  const ones = enc.bits.reduce((s, b) => s + b, 0);
  const branchBalance = enc.bits.length ? ones / enc.bits.length : 0;
  return {
    message,
    records: enc.records,
    aggregates: minimized ? minimized.aggregates : null,
    decoded,
    bitErrors: errors,
    bitErrorRate: enc.bits.length ? errors / enc.bits.length : 0,
    branchBalance,
    minimize: !!opts.minimize,
  };
}
