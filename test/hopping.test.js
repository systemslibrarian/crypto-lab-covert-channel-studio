/**
 * Tests for js/channels/hopping.js and js/detectors/hoppingDetector.js — the
 * simulated PROTOCOL-HOPPING channel, where the payload lives in the choice of
 * which protocol to speak next rather than inside any one of them.
 *
 * Three properties are locked down here because the whole module depends on
 * them:
 *
 *   1. The encoder never emits a self-transition. The detector's primary
 *      statistic is the emptiness of the transition-matrix diagonal, so if the
 *      grammar ever repeated a protocol the indicator would lose its footing.
 *   2. Loss is locally survivable and globally fatal. The state machine
 *      resynchronises off the carrier, but the bit indexing does not, so the
 *      damage from a dropped flow vastly exceeds the bits that flow carried.
 *   3. Dilution does not defeat the detector, because it pivots per peer —
 *      while a fixed-rotation monitoring agent DOES trip it, which is the
 *      honest false positive that justifies the second statistic.
 *
 * Node built-in runner only. Deterministic: fixed seeds, fixed parameters, no
 * wall-clock and no Math.random.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROTOCOLS,
  PROTOCOL_KEYS,
  BITS_PER_HOP,
  SYMBOL_COUNT,
  START_PROTOCOL,
  RENDEZVOUS_DEST,
  successor,
  symbolFor,
  bitsToSymbols,
  symbolToBits,
  encodeBitsToFlows,
  decodeFlows,
  simulateHoppingRun,
  generateNormalFlows,
  generateMonitorFlows,
} from '../js/channels/hopping.js';

import { analyzeHopping } from '../js/detectors/hoppingDetector.js';
import { levelFromScore, DISCLAIMER } from '../js/detectors/anomaly.js';
import { textToBits } from '../js/utils/bits.js';

const MESSAGE = 'HELLO WORLD';

// ---------------------------------------------------------------------------
// The grammar: capacity and the successor/symbol bijection
// ---------------------------------------------------------------------------

test('capacity is ⌊log₂(n−1)⌋ bits per hop for the n-protocol set', () => {
  const n = PROTOCOLS.length;
  assert.equal(n, 5, 'the shipped set is five protocols');
  // Assert the relationship, not just the literal, so changing the protocol
  // set can never silently desync the constant from the encoding.
  assert.equal(BITS_PER_HOP, Math.floor(Math.log2(n - 1)));
  assert.equal(BITS_PER_HOP, 2);
  assert.equal(SYMBOL_COUNT, 2 ** BITS_PER_HOP);
  assert.equal(SYMBOL_COUNT, 4);
  // With n = 5 every admissible successor is used: no wasted transition.
  assert.equal(SYMBOL_COUNT, n - 1, 'all n−1 successors carry a symbol');
});

test('successor() and symbolFor() are exact inverses for every (protocol, symbol)', () => {
  for (const from of PROTOCOL_KEYS) {
    for (let symbol = 0; symbol < SYMBOL_COUNT; symbol++) {
      const to = successor(from, symbol);
      assert.ok(PROTOCOL_KEYS.includes(to), `${from}+${symbol} lands on a real protocol`);
      assert.notEqual(to, from, 'a hop always changes protocol');
      assert.equal(symbolFor(from, to), symbol, `${from} → ${to} decodes back to ${symbol}`);
    }
  }
});

test('symbolFor() rejects a self-transition as inadmissible', () => {
  for (const p of PROTOCOL_KEYS) {
    assert.equal(symbolFor(p, p), null, `${p} → ${p} is not in the grammar`);
  }
});

test('successor()/symbolFor() return null for protocols outside the set', () => {
  assert.equal(successor('gopher', 0), null);
  assert.equal(symbolFor('gopher', 'https'), null);
  assert.equal(symbolFor('https', 'gopher'), null);
});

test('bitsToSymbols/symbolToBits round-trip and pack MSB first', () => {
  assert.deepEqual(bitsToSymbols([0, 0]), [0]);
  assert.deepEqual(bitsToSymbols([0, 1]), [1]);
  assert.deepEqual(bitsToSymbols([1, 0]), [2]);
  assert.deepEqual(bitsToSymbols([1, 1]), [3]);
  assert.deepEqual(symbolToBits(0), [0, 0]);
  assert.deepEqual(symbolToBits(3), [1, 1]);

  const bits = textToBits('HI');
  const symbols = bitsToSymbols(bits);
  assert.deepEqual(symbols.flatMap(symbolToBits), bits);
});

// ---------------------------------------------------------------------------
// The encoder never repeats a protocol — the property the detector rests on
// ---------------------------------------------------------------------------

test('the encoder NEVER emits a self-transition, for any message', () => {
  for (const message of ['A', 'HI', MESSAGE, 'covert!', '\u{1F600}']) {
    const { flows } = encodeBitsToFlows(textToBits(message));
    for (let i = 1; i < flows.length; i++) {
      assert.notEqual(
        flows[i].protocol, flows[i - 1].protocol,
        `"${message}": flow ${i} repeated ${flows[i].protocol}`,
      );
    }
  }
});

test('the first flow is the agreed rendezvous state and carries no payload', () => {
  const { flows, meta } = encodeBitsToFlows(textToBits(MESSAGE));
  assert.equal(flows[0].protocol, START_PROTOCOL);
  assert.equal(flows[0].sync, true);
  assert.equal(flows[0].symbol, null);
  assert.deepEqual(flows[0].bits, []);
  // One flow per symbol, plus the rendezvous flow.
  assert.equal(flows.length, meta.hops + 1);
  assert.equal(meta.bitsPerHop, BITS_PER_HOP);
  assert.equal(meta.totalBits, textToBits(MESSAGE).length);
});

test('every covert flow goes to the one rendezvous peer', () => {
  const run = simulateHoppingRun(MESSAGE, { seed: 'peer', coverCount: 40 });
  for (const f of run.deliveredFlows) {
    assert.equal(f.dest, RENDEZVOUS_DEST);
    assert.equal(f.covert, true);
  }
  // Cover traffic must go somewhere else, or the pivot would be meaningless.
  assert.ok(run.coverFlows.every((f) => f.dest !== RENDEZVOUS_DEST));
});

// ---------------------------------------------------------------------------
// Clean round-trip and determinism
// ---------------------------------------------------------------------------

test('decodeFlows(encodeBitsToFlows(bits)) recovers the bits exactly', () => {
  for (const message of ['A', 'HI', MESSAGE]) {
    const bits = textToBits(message);
    const { flows } = encodeBitsToFlows(bits);
    const decoded = decodeFlows(flows);
    assert.equal(decoded.invalidHops, 0);
    assert.deepEqual(decoded.bits, bits);
  }
});

test('simulateHoppingRun with a clean path recovers the message with zero errors', () => {
  const run = simulateHoppingRun(MESSAGE, { seed: 'clean', lossProb: 0, blocked: [] });
  assert.equal(run.recoveredText, MESSAGE);
  assert.equal(run.bitErrors, 0);
  assert.equal(run.bitErrorRate, 0);
  assert.equal(run.droppedCount, 0);
  assert.equal(run.blockedCount, 0);
  assert.equal(run.invalidHops, 0);
  assert.deepEqual(run.decodedBits, run.bits);
});

test('determinism: same (message, opts, seed) reproduces the identical walk', () => {
  const opts = { seed: 'repro-42', lossProb: 0.1, coverCount: 25 };
  const a = simulateHoppingRun(MESSAGE, opts);
  const b = simulateHoppingRun(MESSAGE, opts);
  assert.deepEqual(a.flows.map((f) => f.protocol), b.flows.map((f) => f.protocol));
  assert.deepEqual(a.decodedBits, b.decodedBits);
  assert.equal(a.bitErrors, b.bitErrors);
  assert.equal(a.droppedCount, b.droppedCount);
  assert.deepEqual(a.mixed, b.mixed);
});

test('different seeds produce different walks for the same message', () => {
  const a = simulateHoppingRun(MESSAGE, { seed: 'walk-A', lossProb: 0.2 });
  const b = simulateHoppingRun(MESSAGE, { seed: 'walk-B', lossProb: 0.2 });
  // The protocol sequence is a pure function of the message, so it must match;
  // it is the PATH outcome that the seed changes.
  assert.deepEqual(a.flows.map((f) => f.protocol), b.flows.map((f) => f.protocol));
  assert.notDeepEqual(a.decodedBits, b.decodedBits);
});

// ---------------------------------------------------------------------------
// Loss desynchronises: the "no framing" property
// ---------------------------------------------------------------------------

test('one dropped flow damages far more than the bits it carried', () => {
  // The state machine resynchronises (state is read off the carrier), but the
  // bit INDEXING does not — every symbol after the gap lands one place early.
  // So the damage must exceed droppedCount × BITS_PER_HOP, which is all a
  // framed channel would have lost.
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let examined = 0;
  for (const seed of seeds) {
    const run = simulateHoppingRun(MESSAGE, { seed, lossProb: 0.05 });
    if (run.droppedCount === 0) continue;
    examined++;
    const directLoss = run.droppedCount * BITS_PER_HOP;
    assert.ok(
      run.bitErrors > directLoss,
      `seed ${seed}: ${run.bitErrors} bit errors should exceed the ${directLoss} directly-lost bits`,
    );
  }
  assert.ok(examined >= 4, `expected several seeds to drop a flow (saw ${examined})`);
});

test('a 5% loss rate drives the bit-error rate an order of magnitude higher', () => {
  const rates = ['a', 'b', 'c', 'd', 'e', 'f']
    .map((seed) => simulateHoppingRun(MESSAGE, { seed, lossProb: 0.05 }).bitErrorRate);
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  assert.ok(mean > 0.25, `mean BER should be far above the 5% loss rate (got ${mean.toFixed(3)})`);
});

test('zero loss leaves no dropped or blocked flows at all', () => {
  const run = simulateHoppingRun(MESSAGE, { seed: 'no-loss', lossProb: 0 });
  assert.ok(run.observedFlows.every((f) => f.delivered === true));
  assert.equal(run.deliveredFlows.length, run.flows.length);
});

// ---------------------------------------------------------------------------
// Egress allow-list
// ---------------------------------------------------------------------------

test('blocking three of the five protocols destroys the message', () => {
  const run = simulateHoppingRun(MESSAGE, { seed: 'allow', blocked: ['ntp', 'smtp', 'ssh'] });
  assert.ok(run.blockedCount > 0, 'flows were actually blocked');
  assert.notEqual(run.recoveredText, MESSAGE);
  assert.ok(
    run.bitErrorRate > 0.5,
    `an allow-list this narrow should wreck the walk (BER ${run.bitErrorRate.toFixed(2)})`,
  );
});

test('blocking nothing is identical to no allow-list at all', () => {
  const a = simulateHoppingRun(MESSAGE, { seed: 'x', blocked: [] });
  const b = simulateHoppingRun(MESSAGE, { seed: 'x' });
  assert.deepEqual(a.decodedBits, b.decodedBits);
  assert.equal(a.blockedCount, 0);
});

// ---------------------------------------------------------------------------
// The ordinary-traffic baseline is sticky, per peer
// ---------------------------------------------------------------------------

test('generateNormalFlows is sticky per destination, not just in aggregate', () => {
  // A baseline that were only globally sticky would fall apart when sliced by
  // peer, and the per-peer pivot would then flag ordinary traffic. Real hosts
  // speak one protocol to one peer, so the stickiness has to survive the slice.
  for (const seed of ['n-a', 'n-b', 'n-c']) {
    const det = analyzeHopping(generateNormalFlows(120, { seed }));
    assert.ok(det.metrics.peers.length >= 2, 'several peers have enough hops to measure');
    for (const peer of det.metrics.peers) {
      assert.ok(
        peer.selfRatio > 0.4,
        `${seed}/${peer.dest}: per-peer self-transition ratio ${peer.selfRatio.toFixed(2)} should stay high`,
      );
    }
  }
});

test('generateNormalFlows is deterministic and uses only known protocols', () => {
  const a = generateNormalFlows(40, { seed: 'det' });
  const b = generateNormalFlows(40, { seed: 'det' });
  assert.deepEqual(a, b);
  assert.ok(a.every((f) => PROTOCOL_KEYS.includes(f.protocol)));
});

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

test('detector: a covert walk scores HIGH and ordinary host traffic scores LOW', () => {
  const covert = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'd1', coverCount: 0 }).mixed);
  assert.ok(covert.score >= 67, `covert walk should be HIGH (got ${covert.score})`);
  assert.equal(covert.anomalyLevel, 'high');
  assert.equal(covert.anomalyLevel, levelFromScore(covert.score));
  assert.equal(covert.disclaimer, DISCLAIMER);

  for (const seed of ['q-a', 'q-b', 'q-c']) {
    const clean = analyzeHopping(generateNormalFlows(120, { seed }));
    assert.ok(clean.score < 34, `${seed}: ordinary traffic should be LOW (got ${clean.score})`);
    assert.equal(clean.anomalyLevel, 'low');
  }
});

test('detector: dilution does not lower the score, because the pivot is per peer', () => {
  // This is the central claim of the module. Burying the walk in ordinary host
  // traffic hides it from an AGGREGATE view, and from nothing else.
  const bare = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'p', coverCount: 0 }).mixed);
  const buried = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'p', coverCount: 100 }).mixed);

  assert.ok(bare.score >= 67, `undiluted score should be HIGH (got ${bare.score})`);
  assert.ok(buried.score >= 67, `diluted score should still be HIGH (got ${buried.score})`);
  assert.equal(buried.score, bare.score, 'the pivot makes the score independent of cover volume');

  // Meanwhile the whole-host view really has been washed out — which is what
  // makes the pivot necessary rather than merely tidy.
  assert.ok(
    buried.metrics.global.selfRatio > bare.metrics.global.selfRatio + 0.1,
    'the aggregate diagonal fills up with cover traffic',
  );
  assert.equal(buried.metrics.pivot.selfRatio, 0, 'the peer diagonal stays empty');
});

test('detector: a fixed-rotation monitor is the honest false positive', () => {
  // A monitoring agent that round-robins service checks has an empty diagonal
  // for the same structural reason the channel does, so the first statistic
  // cannot separate them. The second one can: a fixed rotation uses only n of
  // the n(n−1) admissible transitions, while payload uses them all. This is
  // precisely what the transition-entropy term is in the detector for.
  const monitor = analyzeHopping(generateMonitorFlows(60));
  const covert = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'm', coverCount: 0 }).mixed);

  assert.equal(monitor.metrics.pivot.selfRatio, 0, 'the monitor never repeats a protocol either');
  assert.equal(covert.metrics.pivot.selfRatio, 0);

  assert.ok(
    monitor.metrics.pivot.normEntropy < covert.metrics.pivot.normEntropy,
    `rotation entropy ${monitor.metrics.pivot.normEntropy.toFixed(2)} should sit below `
    + `payload entropy ${covert.metrics.pivot.normEntropy.toFixed(2)}`,
  );
  assert.ok(
    monitor.score < covert.score,
    `the monitor should score strictly below the real channel (${monitor.score} vs ${covert.score})`,
  );
  // It is still worth a look — an empty diagonal is genuinely unusual — so this
  // is a deliberate MODERATE, not a detector that has been tuned to hide it.
  assert.equal(monitor.anomalyLevel, 'moderate');
});

test('detector: too few hops produces an untriggered observation, not a score', () => {
  const det = analyzeHopping(simulateHoppingRun('A', { seed: 'tiny', coverCount: 0 }).mixed);
  assert.equal(det.score, 0, 'a handful of hops cannot populate a 20-cell matrix');
  assert.equal(det.anomalyLevel, 'low');
  assert.ok(det.observations.some((o) => o.triggered === false));
});

test('detector: every observation carries the three teaching fields', () => {
  const det = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'obs', coverCount: 30 }).mixed);
  assert.ok(det.observations.length >= 1);
  for (const o of det.observations) {
    assert.equal(typeof o.what, 'string');
    assert.equal(typeof o.why, 'string');
    assert.equal(typeof o.alsoCouldBe, 'string');
    assert.ok(o.what.length > 0 && o.why.length > 0 && o.alsoCouldBe.length > 0);
  }
  for (const m of det.methods) {
    assert.ok(m.name && m.citation && m.interpretation, 'each method names and cites itself');
  }
});

test('detector: the transition matrix is square over the protocol set and counts every hop', () => {
  const det = analyzeHopping(simulateHoppingRun(MESSAGE, { seed: 'mx', coverCount: 0 }).mixed);
  const n = PROTOCOL_KEYS.length;
  assert.equal(det.metrics.matrix.length, n);
  assert.ok(det.metrics.matrix.every((row) => row.length === n));
  // The grammar forbids the diagonal, so it must be entirely zero.
  for (let i = 0; i < n; i++) {
    assert.equal(det.metrics.matrix[i][i], 0, `diagonal cell ${i} must be empty`);
  }
  const total = det.metrics.matrix.flat().reduce((s, v) => s + v, 0);
  assert.equal(total, det.metrics.pivot.hops);
  assert.equal(det.metrics.admissibleTransitions, n * (n - 1));
});
