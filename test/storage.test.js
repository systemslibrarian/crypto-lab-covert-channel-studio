/**
 * Tests for js/channels/storage.js — the SIMULATED covert storage channel.
 *
 * These tests are deterministic: every RNG-driven path is given a fixed seed,
 * and assertions are made either on exact values (where the logic is fully
 * determined) or on robust properties (round-trip equality, delivered counts,
 * error thresholds) where a seed merely has to expose the effect.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELDS,
  MIDDLEBOX_IMPACT,
  extractBit,
  encodeBitsToPackets,
  extractBits,
  decodePackets,
  applyMiddlebox,
  simulateStorageRun,
  generateNormalPackets,
} from '../js/channels/storage.js';

import { textToBits, bitErrorCount } from '../js/utils/bits.js';

const FIELD_KEYS = ['ipid-parity', 'ttl-toggle', 'seq-lowbit'];

// A fixed, mixed bit pattern used for round-trips (not all-zeros / not all-ones
// so every field is genuinely exercised).
const SAMPLE_BITS = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0];

// ---------------------------------------------------------------------------
// Per-field round-trip: encode -> extract recovers the exact bit array.
// ---------------------------------------------------------------------------
for (const field of FIELD_KEYS) {
  test(`round-trip: encodeBitsToPackets/extractBits for '${field}'`, () => {
    const packets = encodeBitsToPackets(SAMPLE_BITS, { field, seed: 'round-trip' });
    assert.equal(packets.length, SAMPLE_BITS.length);
    const recovered = extractBits(packets, field);
    assert.deepEqual(recovered, SAMPLE_BITS);
  });
}

// ---------------------------------------------------------------------------
// Per-field full run of 'HI' with no middlebox: text recovered, zero errors.
// ---------------------------------------------------------------------------
for (const field of FIELD_KEYS) {
  test(`simulateStorageRun('HI') with no middlebox recovers 'HI' cleanly for '${field}'`, () => {
    const result = simulateStorageRun('HI', { field, seed: 'clean-run' });
    assert.equal(result.processedDecode.text, 'HI');
    assert.equal(result.bitErrors, 0);
    assert.equal(result.bitErrorRate, 0);
    // The clean decode should also match.
    assert.equal(result.cleanDecode.text, 'HI');
    assert.deepEqual(result.processedDecode.bits, result.bits);
  });
}

// ---------------------------------------------------------------------------
// extractBit matches each documented encoding rule.
// ---------------------------------------------------------------------------
test("extractBit: ttl-toggle reads TTL 64 -> 0 and TTL 65 -> 1", () => {
  assert.equal(extractBit({ ttl: 64 }, 'ttl-toggle'), 0);
  assert.equal(extractBit({ ttl: 65 }, 'ttl-toggle'), 1);
});

test('extractBit: ipid-parity reads even -> 0 and odd -> 1', () => {
  assert.equal(extractBit({ ipId: 0x0000 }, 'ipid-parity'), 0);
  assert.equal(extractBit({ ipId: 0x1234 }, 'ipid-parity'), 0); // even
  assert.equal(extractBit({ ipId: 0x0001 }, 'ipid-parity'), 1);
  assert.equal(extractBit({ ipId: 0xffff }, 'ipid-parity'), 1); // odd
});

test('extractBit: seq-lowbit reads the low bit of the sequence number', () => {
  assert.equal(extractBit({ sequence: 0 }, 'seq-lowbit'), 0);
  assert.equal(extractBit({ sequence: 0x12345678 }, 'seq-lowbit'), 0); // even
  assert.equal(extractBit({ sequence: 1 }, 'seq-lowbit'), 1);
  assert.equal(extractBit({ sequence: 0xffffffff }, 'seq-lowbit'), 1); // odd
});

test('extractBit throws on an unknown field', () => {
  assert.throws(() => extractBit({ ttl: 64 }, 'nope'), /Unknown storage field/);
});

// A direct check that the encoder actually forces the covert field to carry the
// requested bit for each field (the encoding rule end-to-end, one packet each).
test('encoder forces the covert field to the requested bit', () => {
  for (const field of FIELD_KEYS) {
    const zeros = encodeBitsToPackets([0], { field, seed: 'enc0' });
    const ones = encodeBitsToPackets([1], { field, seed: 'enc1' });
    assert.equal(extractBit(zeros[0], field), 0);
    assert.equal(extractBit(ones[0], field), 1);
  }
  // ttl-toggle sets the exact TTL values named in the rule.
  assert.equal(encodeBitsToPackets([0], { field: 'ttl-toggle' })[0].ttl, 64);
  assert.equal(encodeBitsToPackets([1], { field: 'ttl-toggle' })[0].ttl, 65);
});

// ---------------------------------------------------------------------------
// Middlebox experiments — each transform breaks the field it targets.
// ---------------------------------------------------------------------------

// Helper: encode a message for a field, apply a middlebox with fixed seeds, and
// report the resulting bit errors and the processed packets.
function runWithMiddlebox(message, field, mbOpts, seed) {
  const bits = textToBits(message);
  const clean = encodeBitsToPackets(bits, { field, seed: `${seed}:enc` });
  const processed = applyMiddlebox(clean, { ...mbOpts, seed: `${seed}:mb` });
  const decoded = decodePackets(processed, field);
  const bitErrors = bitErrorCount(bits, decoded.bits);
  return { bits, clean, processed, decoded, bitErrors };
}

test('NAT breaks ipid-parity (rewrites IP ID => bit errors)', () => {
  const { bitErrors } = runWithMiddlebox('HI', 'ipid-parity', { nat: true }, 'nat-seed');
  assert.ok(bitErrors > 0, `expected bit errors under NAT, got ${bitErrors}`);
  // The corresponding impact table entry should name this field.
  assert.ok(MIDDLEBOX_IMPACT.nat.affects.includes('ipid-parity'));
});

test('headerNormalization breaks ttl-toggle (TTL forced to 64 => all zeros)', () => {
  const { bits, processed, decoded, bitErrors } = runWithMiddlebox(
    'HI', 'ttl-toggle', { headerNormalization: true }, 'hn-seed',
  );
  // Every TTL is normalised to 64, so every decoded bit reads 0.
  assert.ok(processed.every((p) => p.ttl === 64));
  assert.ok(decoded.bits.every((b) => b === 0));
  // 'HI' is not all-zero, so this must produce errors — exactly the number of
  // 1-bits in the message ('H'=0x48 has two, 'I'=0x49 has three => 5).
  assert.ok(bitErrors > 0, `expected bit errors under header normalization, got ${bitErrors}`);
  const onesInMessage = bits.reduce((n, b) => n + b, 0);
  assert.equal(bitErrors, onesInMessage);
  assert.ok(MIDDLEBOX_IMPACT.headerNormalization.affects.includes('ttl-toggle'));
});

test('proxy breaks seq-lowbit (fresh sequence number => bit errors)', () => {
  const { bitErrors } = runWithMiddlebox('HI', 'seq-lowbit', { proxy: true }, 'proxy-seed');
  assert.ok(bitErrors > 0, `expected bit errors under proxy, got ${bitErrors}`);
  assert.ok(MIDDLEBOX_IMPACT.proxy.affects.includes('seq-lowbit'));
});

test('firewall (drops) reduces the delivered packet count', () => {
  const { processed } = runWithMiddlebox('HELLO WORLD', 'ipid-parity', { firewall: true }, 'fw1');
  const total = processed.length;
  const delivered = processed.filter((p) => p.delivered !== false).length;
  assert.ok(delivered < total, `expected some drops: delivered ${delivered} of ${total}`);
  // At least one packet must be explicitly marked not delivered.
  assert.ok(processed.some((p) => p.delivered === false));
  // extractBits skips dropped packets, so fewer bits come out than went in.
  const recovered = extractBits(processed, 'ipid-parity');
  assert.equal(recovered.length, delivered);
});

test('reorder scrambles the bit order for a multi-bit message', () => {
  const { bits, decoded, bitErrors } = runWithMiddlebox(
    'HELLO WORLD', 'ipid-parity', { reorder: true }, 'ro1',
  );
  // Individual field values survive reordering, but their positions change,
  // so the recovered bit sequence differs and the error count is non-zero.
  assert.ok(bitErrors > 0, `expected bit errors under reordering, got ${bitErrors}`);
  assert.notDeepEqual(decoded.bits, bits);
  assert.equal(decoded.bits.length, bits.length); // no bits lost, only reordered
  assert.ok(MIDDLEBOX_IMPACT.reorder.affects.includes('ipid-parity'));
});

// ---------------------------------------------------------------------------
// Determinism: fixed seeds reproduce identical simulated output.
// ---------------------------------------------------------------------------
test('encodeBitsToPackets is deterministic for a fixed seed', () => {
  const a = encodeBitsToPackets(SAMPLE_BITS, { field: 'ipid-parity', seed: 'det' });
  const b = encodeBitsToPackets(SAMPLE_BITS, { field: 'ipid-parity', seed: 'det' });
  assert.deepEqual(a, b);
});

test('applyMiddlebox is deterministic for a fixed seed', () => {
  const clean = encodeBitsToPackets(textToBits('HELLO'), { field: 'ipid-parity', seed: 'det:enc' });
  const a = applyMiddlebox(clean, { nat: true, firewall: true, reorder: true, seed: 'det:mb' });
  const b = applyMiddlebox(clean, { nat: true, firewall: true, reorder: true, seed: 'det:mb' });
  assert.deepEqual(a, b);
});

test('simulateStorageRun is fully deterministic for a fixed seed', () => {
  const a = simulateStorageRun('HI', { field: 'seq-lowbit', seed: 'run-seed' });
  const b = simulateStorageRun('HI', { field: 'seq-lowbit', seed: 'run-seed' });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// generateNormalPackets: TTLs are drawn only from {64, 128, 255}.
// ---------------------------------------------------------------------------
test('generateNormalPackets uses TTLs only from {64, 128, 255}', () => {
  const allowed = new Set([64, 128, 255]);
  const packets = generateNormalPackets(200, { seed: 'normal-seed' });
  assert.equal(packets.length, 200);
  for (const p of packets) {
    assert.ok(allowed.has(p.ttl), `unexpected TTL ${p.ttl}`);
    // Normal packets carry no hidden structure.
    assert.equal(p.covertBit, null);
    assert.equal(p.field, null);
  }
  // Sanity: field ranges stay within their protocol widths.
  for (const p of packets) {
    assert.ok(p.ipId >= 0 && p.ipId <= 0xffff);
    assert.ok(p.sequence >= 0 && p.sequence <= 0xffffffff);
  }
});

test('generateNormalPackets is deterministic for a fixed seed', () => {
  const a = generateNormalPackets(30, { seed: 'normal-det' });
  const b = generateNormalPackets(30, { seed: 'normal-det' });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// FIELDS metadata is internally consistent (guards against typos in keys).
// ---------------------------------------------------------------------------
test('FIELDS metadata keys match their entry keys and cover all three fields', () => {
  for (const key of FIELD_KEYS) {
    assert.ok(FIELDS[key], `missing field entry for ${key}`);
    assert.equal(FIELDS[key].key, key);
  }
  assert.deepEqual(Object.keys(FIELDS).sort(), [...FIELD_KEYS].sort());
});
