/**
 * Tests for the HTTP header-order channel (js/channels/http.js) and its detector.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateHttpRun, encodeMessageToRequests, decodeRequests,
  permutationFromRank, rankFromPermutation, applyHeaderNormalization,
  generateNormalRequests, REORDERABLE, BITS_PER_REQUEST,
} from '../js/channels/http.js';
import { analyzeHttp } from '../js/detectors/httpDetector.js';

test('BITS_PER_REQUEST is ⌊log2(6!)⌋ = 9', () => {
  assert.equal(REORDERABLE.length, 6);
  assert.equal(BITS_PER_REQUEST, 9);
});

test('permutation rank <-> permutation is a bijection over all 720', () => {
  const seen = new Set();
  for (let r = 0; r < 720; r++) {
    const perm = permutationFromRank(r, 6);
    assert.equal(perm.length, 6);
    assert.equal(new Set(perm).size, 6, 'permutation has no repeats');
    assert.equal(rankFromPermutation(perm), r, 'rank round-trips');
    seen.add(perm.join(','));
  }
  assert.equal(seen.size, 720, 'all permutations distinct');
});

test('encode -> decode round-trips the message', () => {
  const enc = encodeMessageToRequests('HELLO WORLD', { seed: 's' });
  const dec = decodeRequests(enc.requests, enc.meta.totalBits);
  assert.equal(dec.text, 'HELLO WORLD');
  assert.deepEqual(dec.bits, enc.bits);
});

test('simulateHttpRun round-trips with no middlebox', () => {
  const run = simulateHttpRun('NODE7', { seed: 's' });
  assert.equal(run.decoded.text, 'NODE7');
  assert.equal(run.bitErrors, 0);
});

test('header normalization destroys the channel', () => {
  const run = simulateHttpRun('HELLO', { seed: 's', normalize: true });
  assert.ok(run.bitErrors > 0, 'normalized headers no longer decode the message');
  assert.notEqual(run.decoded.text, 'HELLO');
  // Every normalized request shares the same (canonical) header order.
  const orders = run.processedRequests.map((r) => r.headers.map((h) => h.name).join('>'));
  assert.equal(new Set(orders).size, 1, 'all requests canonicalised to one order');
});

test('generateNormalRequests all use one stable order', () => {
  const reqs = generateNormalRequests(30, { seed: 'n' });
  const orders = reqs.map((r) => r.headers.map((h) => h.name).join('>'));
  assert.equal(new Set(orders).size, 1);
  assert.ok(reqs.every((r) => r.covert === false));
});

test('detector: covert order-variety reads HIGH, stable client reads LOW', () => {
  const run = simulateHttpRun('RENDEZVOUS', { seed: 's' });
  const covert = analyzeHttp(run.covertRequests);
  const stable = analyzeHttp(generateNormalRequests(40, { seed: 'n' }));
  assert.equal(stable.score, 0);
  assert.equal(stable.anomalyLevel, 'low');
  assert.ok(covert.score >= 67, `covert reads HIGH (got ${covert.score})`);
  assert.ok(covert.methods.length >= 1, 'detector exposes named methods');
});
