import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MESSAGE_BYTES,
  textToUtf8Bytes,
  utf8BytesToText,
  tryUtf8BytesToText,
  utf8ByteLength,
  validateMessage,
  truncateToByteLimit,
} from '../js/utils/utf8.js';

test('MAX_MESSAGE_BYTES is 24', () => {
  assert.equal(MAX_MESSAGE_BYTES, 24);
});

test('textToUtf8Bytes/utf8BytesToText round-trip: ASCII', () => {
  const text = 'Hello, world!';
  const bytes = textToUtf8Bytes(text);
  assert.ok(bytes instanceof Uint8Array);
  // ASCII 'H' == 0x48
  assert.equal(bytes[0], 0x48);
  assert.equal(bytes.length, text.length);
  assert.equal(utf8BytesToText(bytes), text);
});

test('textToUtf8Bytes/utf8BytesToText round-trip: multibyte é', () => {
  const text = 'café';
  const bytes = textToUtf8Bytes(text);
  // 'é' (U+00E9) encodes as 0xC3 0xA9 -> 3 ASCII + 2 = 5 bytes.
  assert.equal(bytes.length, 5);
  assert.deepEqual(Array.from(bytes.slice(3)), [0xc3, 0xa9]);
  assert.equal(utf8BytesToText(bytes), text);
});

test('textToUtf8Bytes/utf8BytesToText round-trip: emoji', () => {
  const text = 'hi 😀';
  const bytes = textToUtf8Bytes(text);
  // '😀' (U+1F600) is a 4-byte sequence: F0 9F 98 80
  assert.deepEqual(Array.from(bytes.slice(3)), [0xf0, 0x9f, 0x98, 0x80]);
  assert.equal(utf8BytesToText(bytes), text);
});

test('utf8BytesToText accepts a plain number[] array', () => {
  // 0x48 0x69 == 'Hi'
  assert.equal(utf8BytesToText([0x48, 0x69]), 'Hi');
});

test('textToUtf8Bytes coerces null/undefined to empty', () => {
  assert.equal(textToUtf8Bytes(null).length, 0);
  assert.equal(textToUtf8Bytes(undefined).length, 0);
});

test('utf8ByteLength counts multibyte characters correctly', () => {
  assert.equal(utf8ByteLength(''), 0);
  assert.equal(utf8ByteLength('abc'), 3);
  assert.equal(utf8ByteLength('é'), 2);
  assert.equal(utf8ByteLength('€'), 3); // U+20AC is a 3-byte sequence
  assert.equal(utf8ByteLength('😀'), 4);
  assert.equal(utf8ByteLength('a😀é'), 1 + 4 + 2);
});

test('validateMessage: empty rejected when allowEmpty is false (default)', () => {
  const res = validateMessage('');
  assert.equal(res.ok, false);
  assert.equal(res.byteLength, 0);
  assert.ok(res.error);
  assert.equal(typeof res.error, 'string');
  assert.match(res.error, /empty/i);
});

test('validateMessage: empty accepted when allowEmpty is true', () => {
  const res = validateMessage('', { allowEmpty: true });
  assert.equal(res.ok, true);
  assert.equal(res.byteLength, 0);
  assert.equal(res.error, null);
});

test('validateMessage: a 24-byte message is accepted', () => {
  const text = 'a'.repeat(MAX_MESSAGE_BYTES); // exactly 24 ASCII bytes
  const res = validateMessage(text);
  assert.equal(res.byteLength, 24);
  assert.equal(res.ok, true);
  assert.equal(res.error, null);
  assert.ok(res.bytes instanceof Uint8Array);
  assert.equal(res.bytes.length, 24);
});

test('validateMessage: over-limit message (25 bytes) is rejected with an error string', () => {
  const text = 'a'.repeat(MAX_MESSAGE_BYTES + 1); // 25 bytes
  const res = validateMessage(text);
  assert.equal(res.ok, false);
  assert.equal(res.byteLength, 25);
  assert.ok(res.error);
  assert.equal(typeof res.error, 'string');
  assert.match(res.error, /25 bytes/);
  assert.match(res.error, /24/);
});

test('validateMessage: multibyte pushing past the byte limit is rejected', () => {
  // 23 ASCII + one 2-byte 'é' == 25 bytes > 24
  const text = 'a'.repeat(23) + 'é';
  const res = validateMessage(text);
  assert.equal(res.byteLength, 25);
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

test('validateMessage: honours a custom maxBytes', () => {
  const res = validateMessage('abcdef', { maxBytes: 3 });
  assert.equal(res.ok, false);
  assert.match(res.error, /limit is 3/);
});

test('truncateToByteLimit: returns input unchanged when it already fits', () => {
  const text = 'short';
  assert.equal(truncateToByteLimit(text, MAX_MESSAGE_BYTES), text);
});

test('truncateToByteLimit: fits the limit for pure ASCII', () => {
  const text = 'a'.repeat(50);
  const out = truncateToByteLimit(text, MAX_MESSAGE_BYTES);
  assert.equal(utf8ByteLength(out), MAX_MESSAGE_BYTES);
  assert.equal(out, 'a'.repeat(24));
});

test('truncateToByteLimit: never splits a multibyte character', () => {
  // 23 'a' then a 4-byte emoji: total 27 bytes. Limit 24 cannot fit the emoji,
  // so it must be dropped whole, leaving 23 bytes (not a split emoji).
  const text = 'a'.repeat(23) + '😀';
  const out = truncateToByteLimit(text, MAX_MESSAGE_BYTES);
  assert.equal(out, 'a'.repeat(23));
  assert.ok(utf8ByteLength(out) <= MAX_MESSAGE_BYTES);
  // The result must be valid UTF-8 that round-trips (no orphaned surrogate/bytes).
  assert.equal(utf8BytesToText(textToUtf8Bytes(out)), out);
});

test('truncateToByteLimit: keeps a multibyte char that exactly fits', () => {
  // 22 'a' + one 2-byte 'é' == 24 bytes exactly.
  const text = 'a'.repeat(22) + 'é';
  const out = truncateToByteLimit(text, MAX_MESSAGE_BYTES);
  assert.equal(out, text);
  assert.equal(utf8ByteLength(out), 24);
});

test('truncateToByteLimit: emoji-only string trimmed to whole emoji count', () => {
  // Each emoji is 4 bytes; limit 24 fits exactly 6 of them.
  const text = '😀'.repeat(10); // 40 bytes
  const out = truncateToByteLimit(text, MAX_MESSAGE_BYTES);
  assert.equal(utf8ByteLength(out), 24);
  assert.equal([...out].length, 6);
  assert.equal(out, '😀'.repeat(6));
});

test('tryUtf8BytesToText: returns null for invalid UTF-8', () => {
  // 0xFF 0xFE are never valid UTF-8 lead bytes.
  assert.equal(tryUtf8BytesToText(new Uint8Array([0xff, 0xfe])), null);
  // A truncated multibyte sequence (lone lead byte) is also invalid.
  assert.equal(tryUtf8BytesToText(new Uint8Array([0xc3])), null);
});

test('tryUtf8BytesToText: returns the decoded string for valid UTF-8', () => {
  assert.equal(tryUtf8BytesToText(new Uint8Array([0x48, 0x69])), 'Hi');
  assert.equal(tryUtf8BytesToText(textToUtf8Bytes('é')), 'é');
});

test('utf8BytesToText: strict decode throws on invalid bytes; lenient does not', () => {
  assert.throws(() => utf8BytesToText(new Uint8Array([0xff, 0xfe])));
  const lenient = utf8BytesToText(new Uint8Array([0xff, 0xfe]), { lenient: true });
  assert.equal(typeof lenient, 'string');
  // Lenient decoding substitutes U+FFFD for each bad byte.
  assert.ok(lenient.includes('�'));
});
