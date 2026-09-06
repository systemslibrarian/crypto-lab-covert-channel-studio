/**
 * Tests for js/channels/stego.js — LSB image steganography (pure logic).
 *
 * Deterministic: rasters are built from a fixed smooth pattern, so every
 * assertion is reproducible with no reliance on Math.random or wall-clock time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capacityBytes,
  embedMessage,
  extractMessage,
  bitPlane,
  differenceImage,
  changedChannels,
  simulateLossyDegradation,
} from '../js/channels/stego.js';

const HEADER_BITS = 16; // must match the source's reserved length-header bits.

/**
 * Build a raster { data: Uint8ClampedArray(w*h*4), width, height } filled with
 * a smooth, deterministic gradient pattern. The pattern varies the low bits so
 * that embedding genuinely flips some LSBs, and stays opaque (alpha = 255).
 */
function makeRaster(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (17 + x * 5 + y * 3) & 0xff; // R: smooth gradient
      data[i + 1] = (40 + x * 3 + y * 7) & 0xff; // G: smooth gradient
      data[i + 2] = (90 + x * 2 + y * 2) & 0xff; // B: smooth gradient
      data[i + 3] = 255; // A: fully opaque
    }
  }
  return { data, width, height };
}

test('capacityBytes matches floor((w*h*3 - 16)/8)', () => {
  for (const [w, h] of [[16, 16], [8, 8], [20, 12], [3, 3], [1, 1]]) {
    const raster = makeRaster(w, h);
    const expected = Math.max(0, Math.floor((w * h * 3 - HEADER_BITS) / 8));
    assert.equal(capacityBytes(raster), expected, `size ${w}x${h}`);
  }
  // A concrete sanity value: 16x16 => floor((768-16)/8) = 94.
  assert.equal(capacityBytes(makeRaster(16, 16)), 94);
});

test('embedMessage then extractMessage round-trips a short message', () => {
  const message = 'hi there';
  const raster = makeRaster(16, 16);
  const { raster: stego } = embedMessage(raster, message);
  const result = extractMessage(stego);

  assert.equal(result.valid, true);
  assert.equal(result.length, 8); // 'hi there' is 8 UTF-8 bytes
  assert.equal(result.text, message);
});

test('embedMessage throws when the message exceeds capacity', () => {
  // 2x2 raster: usableChannels = 12 < 16-bit header, so capacity is 0.
  const tiny = makeRaster(2, 2);
  assert.equal(capacityBytes(tiny), 0);
  assert.throws(() => embedMessage(tiny, 'x'), /bytes/);

  // 3x3 raster: capacity is exactly 1 byte; a 2-byte message overflows.
  const small = makeRaster(3, 3);
  assert.equal(capacityBytes(small), 1);
  assert.throws(() => embedMessage(small, 'hi'), /bytes/);
});

test('only LSBs change: high 7 bits preserved and alpha untouched', () => {
  const message = 'hi there';
  const raster = makeRaster(16, 16);
  const original = raster.data;
  const { raster: stego } = embedMessage(raster, message);
  const embedded = stego.data;

  assert.equal(embedded.length, original.length);

  let changed = 0;
  for (let i = 0; i < original.length; i++) {
    if (i % 4 === 3) {
      // Alpha bytes must be identical.
      assert.equal(embedded[i], original[i], `alpha at ${i} changed`);
      continue;
    }
    // Any change must be confined to the least-significant bit only.
    assert.equal(
      embedded[i] & 0xfe,
      original[i] & 0xfe,
      `channel at ${i} changed beyond its LSB`,
    );
    if (embedded[i] !== original[i]) changed++;
  }
  // Embedding a real message must have actually flipped at least one LSB.
  assert.ok(changed > 0, 'expected embed to change at least one LSB');
});

test('simulateLossyDegradation(step:8) destroys the hidden payload', () => {
  const message = 'hi there';
  const raster = makeRaster(16, 16);
  const { raster: stego } = embedMessage(raster, message);

  // Sanity: it round-trips before degradation.
  assert.equal(extractMessage(stego).text, message);

  const degraded = simulateLossyDegradation(stego, { step: 8 });
  const result = extractMessage(degraded);

  // The compression lesson: LSB data lives in the bits quantisation discards,
  // so the original message no longer survives extraction.
  assert.notEqual(result.text, message);
});

test('bitPlane returns same dimensions with only 0/255 channels and alpha 255', () => {
  const raster = makeRaster(16, 16);
  const { raster: stego } = embedMessage(raster, 'hi there');
  const plane = bitPlane(stego, 0, 'all');

  assert.equal(plane.width, stego.width);
  assert.equal(plane.height, stego.height);
  assert.equal(plane.data.length, stego.data.length);

  for (let i = 0; i < plane.data.length; i++) {
    if (i % 4 === 3) {
      assert.equal(plane.data[i], 255, `alpha at ${i} not 255`);
    } else {
      assert.ok(
        plane.data[i] === 0 || plane.data[i] === 255,
        `channel at ${i} is ${plane.data[i]}, expected 0 or 255`,
      );
    }
  }
});

test('differenceImage of identical rasters is all zero (except alpha)', () => {
  const raster = makeRaster(16, 16);
  const diff = differenceImage(raster, raster);

  for (let i = 0; i < diff.data.length; i++) {
    if (i % 4 === 3) {
      assert.equal(diff.data[i], 255, `alpha at ${i} not 255`);
    } else {
      assert.equal(diff.data[i], 0, `channel at ${i} not zero`);
    }
  }
});

test('changedChannels of identical rasters is 0', () => {
  const raster = makeRaster(16, 16);
  assert.equal(changedChannels(raster, raster), 0);

  // And after embedding, it equals the count of flipped RGB channels.
  const { raster: stego } = embedMessage(raster, 'hi there');
  let flipped = 0;
  for (let i = 0; i < raster.data.length; i++) {
    if (i % 4 === 3) continue;
    if (raster.data[i] !== stego.data[i]) flipped++;
  }
  assert.equal(changedChannels(raster, stego), flipped);
  assert.ok(flipped > 0);
});
