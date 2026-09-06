/**
 * utf8.js — text <-> UTF-8 byte conversions and message validation.
 *
 * Pure logic (no DOM). Runs identically in the browser and in Node, so the
 * same functions are exercised by the automated tests.
 *
 * Toy messages in this exhibit are deliberately tiny. A covert channel trades
 * bandwidth for concealment, and keeping the payload small keeps the
 * visualisations legible and keeps this project firmly in "demonstration"
 * territory rather than "tool" territory.
 */

/** Hard cap on a toy message, in UTF-8 bytes. */
export const MAX_MESSAGE_BYTES = 24;

const encoder = new TextEncoder();
// `fatal: true` makes malformed byte sequences throw instead of silently
// producing U+FFFD, which lets us surface decode failures honestly.
const strictDecoder = new TextDecoder('utf-8', { fatal: true });
const lenientDecoder = new TextDecoder('utf-8', { fatal: false });

/**
 * Encode a string to its UTF-8 bytes.
 * @param {string} text
 * @returns {Uint8Array}
 */
export function textToUtf8Bytes(text) {
  return encoder.encode(String(text ?? ''));
}

/**
 * Decode UTF-8 bytes back to a string.
 * @param {Uint8Array|number[]} bytes
 * @param {{ lenient?: boolean }} [opts] when lenient, malformed sequences
 *        become the U+FFFD replacement character instead of throwing.
 * @returns {string}
 */
export function utf8BytesToText(bytes, opts = {}) {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const decoder = opts.lenient ? lenientDecoder : strictDecoder;
  return decoder.decode(view);
}

/**
 * Like {@link utf8BytesToText} but never throws; returns null on malformed
 * input. Useful when a simulated channel has corrupted the byte stream.
 * @param {Uint8Array|number[]} bytes
 * @returns {string|null}
 */
export function tryUtf8BytesToText(bytes) {
  try {
    return utf8BytesToText(bytes, { lenient: false });
  } catch {
    return null;
  }
}

/**
 * Number of UTF-8 bytes a string occupies (counts code units correctly for
 * multibyte characters and emoji).
 * @param {string} text
 * @returns {number}
 */
export function utf8ByteLength(text) {
  return textToUtf8Bytes(text).length;
}

/**
 * Validate a candidate toy message against the exhibit's limits.
 * @param {string} text
 * @param {{ maxBytes?: number, allowEmpty?: boolean }} [opts]
 * @returns {{ ok: boolean, bytes: Uint8Array, byteLength: number, error: string|null }}
 */
export function validateMessage(text, opts = {}) {
  const maxBytes = opts.maxBytes ?? MAX_MESSAGE_BYTES;
  const allowEmpty = opts.allowEmpty ?? false;
  const str = String(text ?? '');
  const bytes = textToUtf8Bytes(str);

  let error = null;
  if (!allowEmpty && bytes.length === 0) {
    error = 'Message is empty.';
  } else if (bytes.length > maxBytes) {
    error = `Message is ${bytes.length} bytes; the limit is ${maxBytes} UTF-8 bytes.`;
  }

  return { ok: error === null, bytes, byteLength: bytes.length, error };
}

/**
 * Truncate a string so that its UTF-8 encoding fits within `maxBytes`, without
 * splitting a multibyte character. Used to keep text inputs within bounds.
 * @param {string} text
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function truncateToByteLimit(text, maxBytes = MAX_MESSAGE_BYTES) {
  const str = String(text ?? '');
  if (utf8ByteLength(str) <= maxBytes) return str;
  // Trim code points from the end until it fits. Array spread iterates by code
  // point, so surrogate pairs are never split.
  const codePoints = [...str];
  while (codePoints.length && utf8ByteLength(codePoints.join('')) > maxBytes) {
    codePoints.pop();
  }
  return codePoints.join('');
}
