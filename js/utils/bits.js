/**
 * bits.js — conversions between bytes, bit arrays, and text, plus small
 * bit-level helpers used across the channels and detectors.
 *
 * Convention: bits are ordered most-significant-bit first within each byte
 * (network / big-endian bit order), which is the ordering a reader expects
 * when they see `01001000` map to the byte 0x48 ('H').
 *
 * Pure logic (no DOM).
 */

import { textToUtf8Bytes, utf8BytesToText, tryUtf8BytesToText } from './utf8.js';

/**
 * Expand bytes into a flat array of bits (MSB first).
 * @param {Uint8Array|number[]} bytes
 * @returns {number[]} array of 0/1
 */
export function bytesToBits(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const bits = new Array(view.length * 8);
  for (let i = 0; i < view.length; i++) {
    const b = view[i];
    for (let k = 0; k < 8; k++) {
      bits[i * 8 + k] = (b >> (7 - k)) & 1;
    }
  }
  return bits;
}

/**
 * Pack a bit array (MSB first) back into bytes. If the bit count is not a
 * multiple of 8 the trailing partial byte is dropped unless `padRight` is set,
 * in which case it is zero-padded on the right.
 * @param {number[]} bits
 * @param {{ padRight?: boolean }} [opts]
 * @returns {Uint8Array}
 */
export function bitsToBytes(bits, opts = {}) {
  const padRight = opts.padRight ?? false;
  const usable = padRight ? Math.ceil(bits.length / 8) * 8 : bits.length - (bits.length % 8);
  const out = new Uint8Array(usable / 8);
  for (let i = 0; i < out.length; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      const idx = i * 8 + k;
      b = (b << 1) | (idx < bits.length ? (bits[idx] & 1) : 0);
    }
    out[i] = b;
  }
  return out;
}

/**
 * Convenience: text -> bits (via UTF-8).
 * @param {string} text
 * @returns {number[]}
 */
export function textToBits(text) {
  return bytesToBits(textToUtf8Bytes(text));
}

/**
 * Convenience: bits -> text (via UTF-8). Strict by default; returns null when
 * the recovered bytes are not valid UTF-8 (e.g. after a noisy channel).
 * @param {number[]} bits
 * @param {{ lenient?: boolean }} [opts]
 * @returns {string|null}
 */
export function bitsToText(bits, opts = {}) {
  const bytes = bitsToBytes(bits);
  if (opts.lenient) return utf8BytesToText(bytes, { lenient: true });
  return tryUtf8BytesToText(bytes);
}

/**
 * Format bits as a grouped string, e.g. "01001000 01000101".
 * @param {number[]} bits
 * @param {number} [groupSize]
 * @param {string} [sep]
 * @returns {string}
 */
export function formatBits(bits, groupSize = 8, sep = ' ') {
  if (groupSize <= 0) return bits.join('');
  const groups = [];
  for (let i = 0; i < bits.length; i += groupSize) {
    groups.push(bits.slice(i, i + groupSize).join(''));
  }
  return groups.join(sep);
}

/**
 * Hamming distance between two bit arrays. Extra bits in the longer array each
 * count as one difference (a missing bit is a difference).
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function bitErrorCount(a, b) {
  const n = Math.max(a.length, b.length);
  let errors = 0;
  for (let i = 0; i < n; i++) {
    const x = i < a.length ? (a[i] & 1) : -1;
    const y = i < b.length ? (b[i] & 1) : -1;
    if (x !== y) errors++;
  }
  return errors;
}

/**
 * Bit error rate in [0, 1] relative to the expected length.
 * @param {number[]} expected
 * @param {number[]} actual
 * @returns {number}
 */
export function bitErrorRate(expected, actual) {
  if (expected.length === 0) return actual.length === 0 ? 0 : 1;
  return bitErrorCount(expected, actual) / expected.length;
}

/**
 * Group a flat bit array into bytes-worth chunks of 8 for display.
 * @param {number[]} bits
 * @returns {number[][]}
 */
export function chunkBitsToBytes(bits) {
  const chunks = [];
  for (let i = 0; i < bits.length; i += 8) chunks.push(bits.slice(i, i + 8));
  return chunks;
}
