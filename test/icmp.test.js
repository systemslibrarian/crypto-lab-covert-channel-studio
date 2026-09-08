/**
 * Tests for js/channels/icmp.js and js/detectors/icmpDetector.js — the
 * simulated ICMP echo channel ("ping tunnel").
 *
 * The module pairs a LOUD carrier (message bytes in the echo data area) with a
 * QUIET one (a single bit in the Echo Identifier), and the point of the pairing
 * is that they fail to different defences. That orthogonality is asserted here
 * cell by cell, because it is the module's whole teaching claim: no single
 * normaliser closes ICMP.
 *
 * Two results are deliberate and are locked down as such rather than treated as
 * shortfalls:
 *
 *   - The identifier channel scores LOW. It is a TAUGHT FALSE NEGATIVE, the
 *     ICMP twin of the IP-ID parity channel in the storage module: one bit in a
 *     field with no reference distribution leaves nothing for a content or size
 *     statistic to find.
 *   - Payload ENTROPY is the wrong statistic here, and the test below proves
 *     it: the conventional ping fill is an incrementing run of distinct bytes,
 *     so its Shannon entropy is already maximal. Predictability separates them;
 *     entropy cannot.
 *
 * Node built-in runner only. Deterministic: fixed seeds, no wall-clock, no
 * Math.random.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELDS,
  STANDARD_PAYLOAD_BYTES,
  TIMESTAMP_BYTES,
  DEST_ADDRESS,
  standardFill,
  encodeMessageToEchoes,
  decodeEchoes,
  applyPathHandling,
  generateNormalEchoes,
  simulateIcmpRun,
} from '../js/channels/icmp.js';

import { analyzeIcmp } from '../js/detectors/icmpDetector.js';
import { levelFromScore, DISCLAIMER } from '../js/detectors/anomaly.js';
import { shannonEntropy } from '../js/utils/statistics.js';

const MESSAGE = 'HELLO WORLD';
const FIELD_KEYS = ['payload', 'id-lowbits'];

/** A clamp small enough to actually bite a covert payload (see the note below). */
const BITING_CLAMP = 12;
/** A chunk size whose data area comfortably exceeds BITING_CLAMP. */
const BIG_CHUNK = 24;

// ---------------------------------------------------------------------------
// Clean round-trip, both carriers
// ---------------------------------------------------------------------------

for (const field of FIELD_KEYS) {
  test(`simulateIcmpRun recovers the message cleanly for '${field}'`, () => {
    const run = simulateIcmpRun(MESSAGE, { field, seed: `clean:${field}` });
    assert.equal(run.recoveredText, MESSAGE);
    assert.equal(run.bitErrors, 0);
    assert.equal(run.bitErrorRate, 0);
    assert.equal(run.clampedCount, 0);
    assert.equal(run.droppedCount, 0);
    assert.deepEqual(run.decodedBits, run.bits);
  });
}

test('encodeMessageToEchoes/decodeEchoes round-trip without the path in the way', () => {
  for (const field of FIELD_KEYS) {
    const enc = encodeMessageToEchoes(MESSAGE, { field, chunkBytes: 4, seed: 'rt' });
    const dec = decodeEchoes(enc.echoes, { field, totalBits: enc.bits.length });
    assert.deepEqual(dec.bits, enc.bits);
    assert.equal(dec.text, MESSAGE);
  }
});

test("the identifier carrier is exactly one bit per echo; the payload carrier is chunkBytes×8", () => {
  const id = encodeMessageToEchoes(MESSAGE, { field: 'id-lowbits', seed: 'm' });
  assert.equal(id.meta.bitsPerEcho, 1);
  assert.equal(id.echoes.length, id.bits.length, 'one echo per bit');
  assert.equal(FIELDS['id-lowbits'].bitsPerEcho, 1);

  for (const chunkBytes of [1, 2, 4]) {
    const p = encodeMessageToEchoes(MESSAGE, { field: 'payload', chunkBytes, seed: 'm' });
    assert.equal(p.meta.bitsPerEcho, chunkBytes * 8);
    assert.equal(p.meta.chunkBytes, chunkBytes);
  }
});

test('covert echoes go to the documentation-range rendezvous address', () => {
  const enc = encodeMessageToEchoes(MESSAGE, { seed: 'dest' });
  assert.ok(enc.echoes.every((e) => e.dest === DEST_ADDRESS));
  // RFC 5737 TEST-NET-2: reserved for documentation, never routable.
  assert.ok(DEST_ADDRESS.startsWith('198.51.100.'));
});

// ---------------------------------------------------------------------------
// The orthogonality property — the module's central claim
// ---------------------------------------------------------------------------

/** Run one (carrier, defence) cell and report whether the message survived. */
function survives(field, pathOpts) {
  const run = simulateIcmpRun(MESSAGE, { field, chunkBytes: BIG_CHUNK, seed: 'orth', ...pathOpts });
  return run.recoveredText === MESSAGE && run.bitErrors === 0;
}

test('a payload size clamp closes the data-area channel and spares the identifier', () => {
  // NOTE the boundary condition: a clamp only bites when the data area is
  // actually longer than it. With chunkBytes = 24 the covert payload is
  // 8 (timestamp) + 24 = 32 bytes, comfortably past a 12-byte clamp.
  assert.equal(survives('payload', { clampBytes: BITING_CLAMP }), false);
  assert.equal(survives('id-lowbits', { clampBytes: BITING_CLAMP }), true);
});

test('a NAT rewriting the Echo Identifier closes that channel and spares the payload', () => {
  // RFC 5508 requires a NAT to rewrite the Query Identifier so it can
  // demultiplex replies — the defence comes free with address translation.
  assert.equal(survives('id-lowbits', { rewriteId: true }), false);
  assert.equal(survives('payload', { rewriteId: true }), true);
});

test('an active warden scrubbing the data area closes the payload channel and spares the identifier', () => {
  assert.equal(survives('payload', { scrubPayload: true }), false);
  assert.equal(survives('id-lowbits', { scrubPayload: true }), true);
});

test('no single defence closes both carriers at once', () => {
  const defences = [
    { clampBytes: BITING_CLAMP },
    { rewriteId: true },
    { scrubPayload: true },
  ];
  for (const d of defences) {
    const both = FIELD_KEYS.map((f) => survives(f, d));
    assert.ok(
      both.some((ok) => ok === true),
      `${JSON.stringify(d)} closed both carriers, which the module claims is impossible`,
    );
  }
  // ...but the full set does, which is the "layer your normalisers" point.
  const all = { clampBytes: BITING_CLAMP, rewriteId: true, scrubPayload: true };
  assert.ok(FIELD_KEYS.every((f) => survives(f, all) === false));
});

test('scrubbing restores the conventional fill over the data area', () => {
  const enc = encodeMessageToEchoes(MESSAGE, { chunkBytes: 4, seed: 's' });
  const scrubbed = applyPathHandling(enc.echoes, { scrubPayload: true, seed: 's:path' });
  for (const e of scrubbed) {
    const region = e.data.slice(TIMESTAMP_BYTES);
    assert.deepEqual(region, standardFill(region.length), 'the data area is canonical again');
    assert.equal(e.clamped, true, 'a scrub is recorded as damage to the payload');
  }
  // The timestamp prefix is left alone — a normaliser rewrites, it does not
  // blank the packet.
  assert.deepEqual(scrubbed[0].data.slice(0, TIMESTAMP_BYTES), enc.echoes[0].data.slice(0, TIMESTAMP_BYTES));
});

test('a clamp truncates rather than guesses: lost bytes decode as unrecovered', () => {
  const run = simulateIcmpRun(MESSAGE, {
    field: 'payload', chunkBytes: BIG_CHUNK, clampBytes: BITING_CLAMP, seed: 'trunc',
  });
  assert.ok(run.clampedCount > 0);
  assert.ok(run.decodedBits.some((b) => b < 0), 'unrecovered bits are marked, not invented');
});

// ---------------------------------------------------------------------------
// Padding hides the size tell but not the content tell
// ---------------------------------------------------------------------------

test('padToStandard emits exactly the standard payload size and still round-trips', () => {
  const run = simulateIcmpRun(MESSAGE, { chunkBytes: 8, padToStandard: true, seed: 'pad' });
  const sizes = new Set(run.cleanEchoes.map((e) => e.dataBytes));
  assert.deepEqual([...sizes], [STANDARD_PAYLOAD_BYTES]);
  assert.equal(run.recoveredText, MESSAGE);
  assert.equal(run.bitErrors, 0);
});

test('padding lowers the indicator without closing the channel', () => {
  const bare = analyzeIcmp(simulateIcmpRun(MESSAGE, { chunkBytes: 2, coverCount: 20, seed: 'pd' }).mixed);
  const padded = analyzeIcmp(simulateIcmpRun(MESSAGE, { chunkBytes: 2, padToStandard: true, coverCount: 20, seed: 'pd' }).mixed);
  assert.ok(
    padded.score < bare.score,
    `padding should remove the size tell (${padded.score} vs ${bare.score})`,
  );
  assert.ok(padded.score > 0, 'the content tell survives padding');
});

// ---------------------------------------------------------------------------
// The ordinary-ping baseline
// ---------------------------------------------------------------------------

test('standardFill is the incrementing pattern a conventional ping sends', () => {
  const fill = standardFill(6);
  assert.deepEqual(fill, [0x10, 0x11, 0x12, 0x13, 0x14, 0x15]);
  // Every byte is one more than the last, and it wraps inside a byte.
  const long = standardFill(300);
  for (let i = 1; i < long.length; i++) {
    assert.equal(long[i], (long[i - 1] + 1) & 0xff);
  }
  assert.deepEqual(standardFill(0), []);
  assert.deepEqual(standardFill(-5), []);
});

test('generateNormalEchoes holds one identifier, a sequential seq, and one size', () => {
  const echoes = generateNormalEchoes(40, { seed: 'norm' });
  assert.equal(new Set(echoes.map((e) => e.identifier)).size, 1, 'one session, one identifier');
  assert.ok(echoes.every((e, i) => e.seq === i + 1), 'sequence numbers increment by one');
  assert.deepEqual([...new Set(echoes.map((e) => e.dataBytes))], [STANDARD_PAYLOAD_BYTES]);
  // Every echo repeats the same fill after its timestamp.
  const expected = standardFill(STANDARD_PAYLOAD_BYTES - TIMESTAMP_BYTES);
  for (const e of echoes) {
    assert.deepEqual(e.data.slice(TIMESTAMP_BYTES), expected);
  }
});

test('determinism: same seed and params reproduce the identical run', () => {
  const opts = { field: 'payload', chunkBytes: 4, coverCount: 20, lossProb: 0.1, seed: 'det-icmp' };
  const a = simulateIcmpRun(MESSAGE, opts);
  const b = simulateIcmpRun(MESSAGE, opts);
  assert.deepEqual(a.mixed, b.mixed);
  assert.deepEqual(a.decodedBits, b.decodedBits);
  assert.equal(a.bitErrors, b.bitErrors);
  assert.deepEqual(generateNormalEchoes(20, { seed: 'z' }), generateNormalEchoes(20, { seed: 'z' }));
});

// ---------------------------------------------------------------------------
// The entropy trap
// ---------------------------------------------------------------------------

test('payload entropy CANNOT separate a ping from a tunnel — predictability can', () => {
  // The reflex statistic is entropy. It fails here, and this test is the proof.
  // The conventional fill is an incrementing run of DISTINCT bytes, so its
  // Shannon entropy sits at the theoretical maximum for a sequence of that
  // length — higher than plenty of real message data.
  const fill = standardFill(STANDARD_PAYLOAD_BYTES - TIMESTAMP_BYTES);
  const fillEntropy = shannonEntropy(fill);
  const maxPossible = Math.log2(fill.length);
  assert.equal(new Set(fill).size, fill.length, 'every fill byte is distinct');
  assert.ok(
    Math.abs(fillEntropy - maxPossible) < 1e-9,
    `the benign fill is at MAXIMUM entropy (${fillEntropy.toFixed(3)} of ${maxPossible.toFixed(3)})`,
  );
  assert.ok(fillEntropy > 5, 'and in absolute terms it is high, not low');

  // Real message bytes score LOWER, because English repeats characters. An
  // entropy threshold would therefore flag the benign traffic and clear the
  // tunnel — exactly backwards.
  const messageBytes = [...Buffer.from('HELLO WORLD HELLO WORLD HELLO WORLD HELLO WORLD', 'utf8')];
  assert.ok(
    shannonEntropy(messageBytes) < fillEntropy,
    'message bytes are LESS random-looking than the benign ping fill',
  );

  // What actually works is the structural test the detector uses: is the region
  // the predictable pattern, and is it identical in every echo?
  const covert = analyzeIcmp(simulateIcmpRun(MESSAGE, { chunkBytes: 2, seed: 'ent' }).mixed);
  const normal = analyzeIcmp(generateNormalEchoes(40, { seed: 'ent-n' }));
  assert.equal(normal.metrics.global.fillConformFraction, 1, 'benign traffic conforms exactly');
  assert.ok(covert.metrics.global.fillConformFraction < 1, 'a tunnel cannot conform');
});

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

test('detector: the loud payload carrier scores far above the quiet identifier carrier', () => {
  const payload = analyzeIcmp(simulateIcmpRun(MESSAGE, { field: 'payload', chunkBytes: 2, coverCount: 20, seed: 'd' }).mixed);
  const idLow = analyzeIcmp(simulateIcmpRun(MESSAGE, { field: 'id-lowbits', coverCount: 20, seed: 'd' }).mixed);

  assert.ok(payload.score >= 67, `data-area tunnel should be HIGH (got ${payload.score})`);
  assert.ok(
    payload.score > idLow.score + 40,
    `the two carriers should be far apart (${payload.score} vs ${idLow.score})`,
  );
});

test('detector: the identifier carrier scores LOW — a deliberate false negative', () => {
  // This is a TAUGHT false negative, not a bug, and it is the direct analogue
  // of the IP-ID parity channel in the storage module: a single bit in a field
  // with no reference distribution barely disturbs anything, so no simple
  // content or size statistic can separate it. Lowering the score was the
  // honest choice over keying on a signal ordinary ping traffic also produces.
  const det = analyzeIcmp(simulateIcmpRun(MESSAGE, { field: 'id-lowbits', coverCount: 20, seed: 'fn' }).mixed);
  assert.equal(det.anomalyLevel, 'low', `expected a LOW score, got ${det.score}`);
  assert.ok(det.score < 34);
  // ...and the channel genuinely worked, which is what makes it a false negative
  // rather than a case where there was nothing to find.
  const run = simulateIcmpRun(MESSAGE, { field: 'id-lowbits', coverCount: 20, seed: 'fn' });
  assert.equal(run.recoveredText, MESSAGE);
});

test('detector: ordinary ping traffic scores LOW', () => {
  for (const seed of ['n1', 'n2', 'n3']) {
    const det = analyzeIcmp(generateNormalEchoes(40, { seed }));
    assert.ok(det.score < 34, `${seed}: benign ping should be LOW (got ${det.score})`);
    assert.equal(det.anomalyLevel, 'low');
    assert.equal(det.anomalyLevel, levelFromScore(det.score));
  }
});

test('detector: reports the standard sizes and a size histogram that totals the echoes', () => {
  const run = simulateIcmpRun(MESSAGE, { chunkBytes: 2, coverCount: 20, seed: 'hist' });
  const det = analyzeIcmp(run.mixed);
  assert.equal(det.metrics.standardBytes, STANDARD_PAYLOAD_BYTES);
  const total = det.metrics.sizeHistogram.reduce((s, b) => s + b.count, 0);
  assert.equal(total, run.mixed.length);
  assert.equal(det.metrics.echoCount, run.mixed.length);
  // Sorted ascending by size, for a readable chart.
  const values = det.metrics.sizeHistogram.map((b) => b.value);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

test('detector: observations and methods carry their teaching fields', () => {
  const det = analyzeIcmp(simulateIcmpRun(MESSAGE, { chunkBytes: 2, coverCount: 20, seed: 'shape' }).mixed);
  assert.equal(det.disclaimer, DISCLAIMER);
  assert.ok(det.observations.length >= 1);
  for (const o of det.observations) {
    assert.ok(o.what.length > 0 && o.why.length > 0 && o.alsoCouldBe.length > 0);
  }
  for (const m of det.methods) {
    assert.ok(m.name && m.citation && m.interpretation);
  }
});

test('detector: an empty stream does not throw', () => {
  const det = analyzeIcmp([]);
  assert.equal(det.metrics.echoCount, 0);
  assert.ok(Number.isFinite(det.score));
});
