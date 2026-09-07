/**
 * Tests for js/simulation.js (orchestration) and js/utils/utf8.js (validation).
 *
 * Deterministic: every channel run passes an explicit fixed seed and the
 * "clean" parameters (no jitter/loss/reordering/middlebox) so that decoded
 * text round-trips exactly. No wall-clock, Math.random, or animation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMessagePipeline, runChannel, CHANNELS } from '../js/simulation.js';
import { validateMessage, MAX_MESSAGE_BYTES } from '../js/utils/utf8.js';

// --- buildMessagePipeline: exact deterministic values ----------------------

test("buildMessagePipeline('HELLO') produces the expected byte/bit breakdown", () => {
  const p = buildMessagePipeline('HELLO');
  assert.equal(p.text, 'HELLO');
  assert.equal(p.byteCount, 5);
  assert.equal(p.bitCount, 40);
  assert.equal(p.charCount, 5);
  // 'H' == 0x48 == 01001000, first 8-bit group of the bit string.
  assert.equal(p.bitString.split(' ')[0], '01001000');
  assert.deepEqual(p.byteHex, ['48', '45', '4c', '4c', '4f']);
  assert.deepEqual(p.byteDecimal, [0x48, 0x45, 0x4c, 0x4c, 0x4f]);
});

test('buildMessagePipeline counts UTF-8 bytes, not characters, for a multibyte char', () => {
  // U+1F600 GRINNING FACE is a single code point encoded as 4 UTF-8 bytes.
  const p = buildMessagePipeline('\u{1F600}');
  assert.equal(p.charCount, 1);
  assert.equal(p.byteCount, 4);
  assert.equal(p.bitCount, 32);
  assert.ok(p.byteCount > p.charCount, 'byteCount should exceed charCount for a multibyte char');
});

test("buildMessagePipeline('') yields empty counts without throwing", () => {
  const p = buildMessagePipeline('');
  assert.equal(p.byteCount, 0);
  assert.equal(p.bitCount, 0);
  assert.equal(p.charCount, 0);
  assert.deepEqual(p.byteHex, []);
  assert.deepEqual(p.byteDecimal, []);
  assert.equal(p.bitString, '');
});

// --- runChannel: normalised result shape -----------------------------------

const cleanParams = {
  dns: { seed: 'test-dns', lossProb: 0 },
  timing: { seed: 'test-timing', jitterMs: 0 },
  storage: { seed: 'test-storage' }, // no middlebox by default
  ordering: { seed: 'test-ordering', reorderProb: 0 },
  physical: { seed: 'test-physical', ambientNoise: 0, ambientDrift: 0 },
  cache: { seed: 'test-cache', jitterCycles: 0, evictionProb: 0 },
};

for (const channel of CHANNELS) {
  test(`runChannel('${channel}', 'HI') returns a normalised result with a detector`, () => {
    const res = runChannel(channel, 'HI', cleanParams[channel]);
    assert.equal(res.channel, channel);
    assert.equal(res.message, 'HI');
    assert.ok('decodedText' in res);

    const d = res.detector;
    assert.ok(d && typeof d === 'object', 'detector is an object');
    assert.equal(typeof d.score, 'number');
    assert.ok(Number.isFinite(d.score));
    assert.equal(typeof d.anomalyLevel, 'string');
    assert.ok(Array.isArray(d.observations));
    assert.ok(d.observations.length >= 1);
    assert.equal(typeof d.disclaimer, 'string');
    assert.ok(d.disclaimer.length > 0);
  });
}

// --- runChannel: clean round-trip decoding ---------------------------------

test("runChannel round-trips 'HI' cleanly on every channel", () => {
  for (const channel of CHANNELS) {
    const res = runChannel(channel, 'HI', cleanParams[channel]);
    assert.equal(res.decodedText, 'HI', `${channel} should decode back to 'HI'`);
  }
});

test('runChannel throws on an unknown channel name', () => {
  assert.throws(
    () => runChannel('smoke-signals', 'HI', { seed: 'x' }),
    /Unknown channel: smoke-signals/,
  );
});

// --- validateMessage: size limit -------------------------------------------

test('validateMessage enforces the UTF-8 byte limit', () => {
  assert.equal(MAX_MESSAGE_BYTES, 24);

  const over = validateMessage('A'.repeat(25));
  assert.equal(over.ok, false);
  assert.equal(over.byteLength, 25);
  assert.ok(over.error, 'a 25-byte message must be rejected');

  const atLimit = validateMessage('A'.repeat(24));
  assert.equal(atLimit.ok, true);
  assert.equal(atLimit.byteLength, 24);
  assert.equal(atLimit.error, null);
});
