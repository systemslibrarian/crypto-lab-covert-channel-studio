/**
 * Tests for js/channels/dns.js — the SIMULATED DNS-as-a-carrier channel.
 * Node built-in runner only. Deterministic (fixed seeds / fixed params).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARENT_DOMAIN,
  BITS_PER_LABEL_CHAR,
  base32Encode,
  base32Decode,
  encodeMessageToQueries,
  decodeQueriesToMessage,
  generateCoverTraffic,
  simulateDnsRun,
} from '../js/channels/dns.js';

// ---------------------------------------------------------------------------
// base32 round-trip
// ---------------------------------------------------------------------------

test('base32Encode/base32Decode round-trip for several byte arrays', () => {
  const cases = [
    [],                          // empty
    [0],                         // 1 byte
    [255],                       // 1 byte, all-ones
    [0, 255],                    // 2 bytes
    [1, 2, 3],                   // 3 bytes (non-multiple of 5)
    [10, 20, 30, 40],            // 4 bytes (non-multiple of 5)
    [1, 2, 3, 4, 5],             // 5 bytes (exact multiple)
    [72, 69, 76, 76, 79, 33, 128, 200, 17], // 9 bytes, mixed
  ];
  for (const arr of cases) {
    const encoded = base32Encode(arr);
    // Encoded output is DNS-label-safe: base32 alphabet only, lowercase.
    assert.match(encoded, /^[a-z2-7]*$/, `encoded of ${JSON.stringify(arr)} must be b32-safe`);
    const decoded = base32Decode(encoded);
    assert.ok(decoded instanceof Uint8Array, 'decode returns Uint8Array');
    assert.deepEqual(
      Array.from(decoded),
      arr,
      `round-trip failed for ${JSON.stringify(arr)} (encoded='${encoded}')`,
    );
  }
});

test('base32Encode empty gives empty string, decode empty gives empty array', () => {
  assert.equal(base32Encode([]), '');
  assert.deepEqual(Array.from(base32Decode('')), []);
});

test('base32Encode accepts Uint8Array and number[] identically', () => {
  const arr = [200, 17, 99];
  assert.equal(base32Encode(arr), base32Encode(Uint8Array.from(arr)));
});

// ---------------------------------------------------------------------------
// encode / decode message queries
// ---------------------------------------------------------------------------

test("encodeMessageToQueries('HELLO') then decode round-trips to 'HELLO'", () => {
  const labelLength = 4;
  const { queries, encoded, labels, meta } = encodeMessageToQueries('HELLO', { labelLength });

  // 'HELLO' = bytes [72,69,76,76,79] -> unpadded base32 'jbcuytcp' (deterministic).
  assert.equal(encoded, 'jbcuytcp');
  assert.deepEqual(labels, ['jbcu', 'ytcp']);

  // Every label is within the requested density and non-empty.
  for (const label of labels) {
    assert.ok(label.length > 0 && label.length <= labelLength, `label '${label}' length <= ${labelLength}`);
  }

  // Queries use the documentation parent 'example.test'.
  assert.equal(PARENT_DOMAIN, 'example.test');
  for (const q of queries) {
    assert.equal(q.parent, 'example.test');
    assert.ok(q.fqdn.endsWith('.example.test'), `fqdn '${q.fqdn}' under example.test`);
    assert.equal(q.fqdn, `${q.label}.example.test`);
    assert.ok(q.label.length <= labelLength, 'query label within labelLength');
    assert.equal(q.covert, true);
    assert.equal(q.isMessage, true);
    assert.equal(q.delivered, true);
  }

  // meta reflects the density.
  assert.equal(meta.labelLength, labelLength);
  assert.equal(meta.parent, 'example.test');
  assert.equal(meta.bitsPerQuery, labelLength * BITS_PER_LABEL_CHAR);

  const decoded = decodeQueriesToMessage(queries);
  assert.equal(decoded.text, 'HELLO');
  assert.equal(decoded.complete, true);
});

test('decode of a single delivered set is complete and exact for a longer message', () => {
  const message = 'covert channel'; // 14 bytes, within MAX_MESSAGE_BYTES (24)
  const { queries } = encodeMessageToQueries(message, { labelLength: 6 });
  const decoded = decodeQueriesToMessage(queries);
  assert.equal(decoded.text, message);
  assert.equal(decoded.complete, true);
});

// ---------------------------------------------------------------------------
// simulateDnsRun — lossless round-trip
// ---------------------------------------------------------------------------

test('simulateDnsRun round-trips the message when lossProb is 0', () => {
  const message = 'HELLO';
  const run = simulateDnsRun(message, { seed: 'unit', labelLength: 4, lossProb: 0 });
  assert.equal(run.message, message);
  assert.equal(run.decoded.text, message);
  assert.equal(run.decoded.complete, true);
});

// ---------------------------------------------------------------------------
// requestCount padding
// ---------------------------------------------------------------------------

test('requestCount padding does not change the decoded message and grows covertQueries', () => {
  const message = 'HELLO';
  const requestCount = 6;
  const run = simulateDnsRun(message, {
    seed: 'pad-unit',
    labelLength: 4,
    lossProb: 0,
    requestCount,
  });

  // Covert stream is extended up to requestCount.
  assert.equal(run.covertQueries.length, requestCount);

  // The extension consists of padding queries flagged isMessage:false.
  const messageQueries = run.covertQueries.filter((q) => q.isMessage !== false);
  const paddingQueries = run.covertQueries.filter((q) => q.isMessage === false);
  assert.equal(messageQueries.length, 2); // 'HELLO' -> 'jbcu','ytcp'
  assert.equal(paddingQueries.length, requestCount - 2);
  for (const q of paddingQueries) {
    assert.equal(q.covert, true);
    assert.equal(q.isMessage, false);
    assert.ok(q.fqdn.endsWith('.example.test'));
  }

  // Padding is NOT part of the recovered text.
  assert.equal(run.decoded.text, message);
  assert.equal(run.decoded.complete, true);
});

// ---------------------------------------------------------------------------
// total loss
// ---------------------------------------------------------------------------

test('lossProb 1 drops every covert label => incomplete decode, text differs', () => {
  const message = 'HELLO';
  const run = simulateDnsRun(message, { seed: 'loss', labelLength: 4, lossProb: 1 });

  // All covert queries marked not delivered / LOST.
  assert.ok(run.covertQueries.length > 0);
  for (const q of run.covertQueries) {
    assert.equal(q.delivered, false);
    assert.equal(q.status, 'LOST');
  }

  assert.equal(run.decoded.complete, false);
  assert.notEqual(run.decoded.text, message);
});

// ---------------------------------------------------------------------------
// cover traffic
// ---------------------------------------------------------------------------

test('generateCoverTraffic marks covert:false and uses short dictionary-ish labels', () => {
  const COVER_HOSTS = new Set([
    'portal', 'mail', 'cdn', 'assets', 'www', 'api', 'login', 'static',
    'img', 'updates', 'ntp', 'time', 'vpn', 'docs', 'files', 'chat',
    'analytics', 'search', 'maps', 'account',
  ]);
  const COVER_PARENTS = new Set([
    'example.test', 'service.test', 'corp.test', 'intra.test', 'cdn.test',
  ]);

  const n = 40;
  const queries = generateCoverTraffic(n, { seed: 'cover-unit' });
  assert.equal(queries.length, n);

  for (const q of queries) {
    assert.equal(q.covert, false);
    assert.ok(COVER_PARENTS.has(q.parent), `parent '${q.parent}' from cover pool`);
    // Label is one or two dictionary hosts joined by '.'.
    const parts = q.label.split('.');
    assert.ok(parts.length === 1 || parts.length === 2, `label '${q.label}' is 1-2 levels`);
    for (const part of parts) {
      assert.ok(COVER_HOSTS.has(part), `label part '${part}' is dictionary-ish`);
      assert.ok(part.length <= 9, `label part '${part}' is short`);
    }
    assert.ok(q.fqdn.endsWith(`.${q.parent}`));
  }
});

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

test('same seed => identical fqdn sequence (encodeMessageToQueries)', () => {
  const a = encodeMessageToQueries('covert', { labelLength: 5, seed: 'det' });
  const b = encodeMessageToQueries('covert', { labelLength: 5, seed: 'det' });
  assert.deepEqual(a.queries.map((q) => q.fqdn), b.queries.map((q) => q.fqdn));
});

test('same seed => identical fqdn sequence (simulateDnsRun with padding + cover)', () => {
  const opts = {
    seed: 'determinism',
    labelLength: 4,
    lossProb: 0,
    requestCount: 8,
    coverCount: 12,
  };
  const run1 = simulateDnsRun('HELLO', { ...opts });
  const run2 = simulateDnsRun('HELLO', { ...opts });

  assert.deepEqual(run1.mixed.map((q) => q.fqdn), run2.mixed.map((q) => q.fqdn));
  assert.deepEqual(
    run1.covertQueries.map((q) => q.fqdn),
    run2.covertQueries.map((q) => q.fqdn),
  );
  assert.deepEqual(
    run1.coverQueries.map((q) => q.fqdn),
    run2.coverQueries.map((q) => q.fqdn),
  );
});

test('different seed => padding fqdn sequence differs (covert chatter is fresh)', () => {
  const base = { labelLength: 4, lossProb: 0, requestCount: 8 };
  const run1 = simulateDnsRun('HELLO', { ...base, seed: 'seed-A' });
  const run2 = simulateDnsRun('HELLO', { ...base, seed: 'seed-B' });
  const pad1 = run1.covertQueries.filter((q) => q.isMessage === false).map((q) => q.fqdn);
  const pad2 = run2.covertQueries.filter((q) => q.isMessage === false).map((q) => q.fqdn);
  assert.notDeepEqual(pad1, pad2);
});
