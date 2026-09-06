import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bytesToBits,
  bitsToBytes,
  textToBits,
  bitsToText,
  formatBits,
  bitErrorCount,
  bitErrorRate,
  chunkBitsToBytes,
} from '../js/utils/bits.js';

test('bytesToBits is MSB-first: H (0x48) -> 0,1,0,0,1,0,0,0', () => {
  const bits = bytesToBits(new Uint8Array([0x48]));
  assert.deepEqual(bits, [0, 1, 0, 0, 1, 0, 0, 0]);
});

test('bytesToBits: 0xFF -> all ones, 0x00 -> all zeros', () => {
  assert.deepEqual(bytesToBits([0xff]), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(bytesToBits([0x00]), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('bytesToBits: multiple bytes concatenate in order (MSB-first each)', () => {
  // 'H' 0x48, 'E' 0x45
  const bits = bytesToBits([0x48, 0x45]);
  assert.equal(bits.length, 16);
  assert.deepEqual(bits.slice(0, 8), [0, 1, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(bits.slice(8), [0, 1, 0, 0, 0, 1, 0, 1]);
});

test('bytesToBits accepts a plain number[] and a Uint8Array identically', () => {
  assert.deepEqual(bytesToBits([0x48]), bytesToBits(new Uint8Array([0x48])));
});

test('bitsToBytes is the inverse of bytesToBits for whole bytes', () => {
  const original = new Uint8Array([0x00, 0x48, 0x7f, 0xff, 0xa5]);
  const round = bitsToBytes(bytesToBits(original));
  assert.deepEqual(Array.from(round), Array.from(original));
});

test('bitsToBytes drops a trailing partial byte by default', () => {
  // 8 bits for 0x48, plus 2 stray bits.
  const bits = [0, 1, 0, 0, 1, 0, 0, 0, 1, 1];
  const bytes = bitsToBytes(bits);
  assert.deepEqual(Array.from(bytes), [0x48]);
});

test('bitsToBytes with padRight zero-pads the trailing partial byte on the right', () => {
  const bits = [0, 1, 0, 0, 1, 0, 0, 0, 1, 1];
  const bytes = bitsToBytes(bits, { padRight: true });
  // Second byte: bits 1,1 then six zero pads == 0b11000000 == 0xC0.
  assert.deepEqual(Array.from(bytes), [0x48, 0xc0]);
});

test('bitsToBytes with padRight on an exact multiple of 8 is unchanged', () => {
  const bits = bytesToBits([0x48, 0x45]);
  assert.deepEqual(
    Array.from(bitsToBytes(bits, { padRight: true })),
    Array.from(bitsToBytes(bits)),
  );
});

test('bitsToBytes: fewer than 8 bits yields empty without padRight, one byte with', () => {
  assert.equal(bitsToBytes([1, 0, 1]).length, 0);
  const padded = bitsToBytes([1, 0, 1], { padRight: true });
  // 101 then five zeros == 0b10100000 == 0xA0
  assert.deepEqual(Array.from(padded), [0xa0]);
});

test('textToBits/bitsToText round-trip: ASCII', () => {
  const text = 'Hello!';
  const bits = textToBits(text);
  assert.equal(bits.length, text.length * 8);
  assert.equal(bitsToText(bits), text);
});

test('textToBits/bitsToText round-trip: multibyte and emoji', () => {
  const text = 'café 😀';
  const bits = textToBits(text);
  assert.equal(bitsToText(bits), text);
});

test('textToBits: first byte of H matches bytesToBits', () => {
  assert.deepEqual(textToBits('H').slice(0, 8), [0, 1, 0, 0, 1, 0, 0, 0]);
});

test('bitsToText returns null on corrupted bits (strict)', () => {
  // Bits for invalid UTF-8 bytes 0xFF 0xFE.
  const badBits = bytesToBits([0xff, 0xfe]);
  assert.equal(bitsToText(badBits), null);
});

test('bitsToText returns a string on corrupted bits when lenient', () => {
  const badBits = bytesToBits([0xff, 0xfe]);
  const out = bitsToText(badBits, { lenient: true });
  assert.equal(typeof out, 'string');
  assert.ok(out.includes('�')); // U+FFFD replacement char
});

test('bitsToText: a single bit flip in valid text can be recovered leniently', () => {
  const bits = textToBits('Hi');
  const corrupted = bits.slice();
  corrupted[0] = corrupted[0] ^ 1; // flip MSB of 'H' -> 0xC8, an invalid lead byte
  // Strict decode of a now-invalid sequence returns null.
  assert.equal(bitsToText(corrupted), null);
  // Lenient still returns a string.
  assert.equal(typeof bitsToText(corrupted, { lenient: true }), 'string');
});

test('formatBits: default grouping of 8 with space separator', () => {
  const bits = textToBits('HE');
  assert.equal(formatBits(bits), '01001000 01000101');
});

test('formatBits: custom group size and separator', () => {
  const bits = bytesToBits([0x48]); // 0,1,0,0,1,0,0,0
  assert.equal(formatBits(bits, 4, '-'), '0100-1000');
  assert.equal(formatBits(bits, 2, ' '), '01 00 10 00');
});

test('formatBits: groupSize <= 0 joins with no separators', () => {
  const bits = bytesToBits([0x48]);
  assert.equal(formatBits(bits, 0), '01001000');
  assert.equal(formatBits(bits, -3), '01001000');
});

test('formatBits: final group can be shorter than groupSize', () => {
  const bits = [1, 0, 1, 0, 1]; // 5 bits, group of 2
  assert.equal(formatBits(bits, 2), '10 10 1');
});

test('bitErrorCount: zero for identical arrays', () => {
  const a = textToBits('Hi');
  assert.equal(bitErrorCount(a, a.slice()), 0);
});

test('bitErrorCount: counts differing bits at matching positions', () => {
  assert.equal(bitErrorCount([0, 0, 0, 0], [1, 0, 1, 0]), 2);
});

test('bitErrorCount: length mismatch counts each extra bit as one error', () => {
  // Same prefix, b has 2 extra bits -> 2 errors.
  assert.equal(bitErrorCount([0, 1, 0], [0, 1, 0, 1, 1]), 2);
  // Order of arguments does not matter for the count.
  assert.equal(bitErrorCount([0, 1, 0, 1, 1], [0, 1, 0]), 2);
});

test('bitErrorCount: mismatched positions AND length both counted', () => {
  // pos 0 differs (1 vs 0), and b has one extra trailing bit.
  assert.equal(bitErrorCount([1, 1, 0], [0, 1, 0, 1]), 2);
});

test('bitErrorRate: 0 when both empty, 1 when expected empty but actual not', () => {
  assert.equal(bitErrorRate([], []), 0);
  assert.equal(bitErrorRate([], [0, 1]), 1);
});

test('bitErrorRate: errors divided by the expected length', () => {
  const expected = bytesToBits([0x00]); // 8 zero bits
  const actual = [1, 0, 0, 0, 0, 0, 0, 0]; // one bit flipped
  assert.equal(bitErrorRate(expected, actual), 1 / 8);
});

test('bitErrorRate: rate is relative to expected, so extra actual bits can exceed... within [0,1] for equal length', () => {
  const expected = [0, 0, 0, 0];
  const actual = [1, 1, 1, 1];
  assert.equal(bitErrorRate(expected, actual), 1);
});

test('bitErrorRate: identical arrays give 0', () => {
  const bits = textToBits('abc');
  assert.equal(bitErrorRate(bits, bits.slice()), 0);
});

test('chunkBitsToBytes: splits into groups of 8, last group may be short', () => {
  const bits = bytesToBits([0x48, 0x45]).concat([1, 1]); // 18 bits
  const chunks = chunkBitsToBytes(bits);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], [0, 1, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(chunks[1], [0, 1, 0, 0, 0, 1, 0, 1]);
  assert.deepEqual(chunks[2], [1, 1]);
});

test('chunkBitsToBytes: empty input yields empty array', () => {
  assert.deepEqual(chunkBitsToBytes([]), []);
});
