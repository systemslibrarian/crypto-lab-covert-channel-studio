/**
 * Tests for the library-records inference channel (js/channels/metadata.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateRecordsRun, encodeMessageToRecords, decodeRecords,
  applyMinimization, generateNormalRecords,
} from '../js/channels/metadata.js';

test('encode -> decode round-trips the message via routing', () => {
  const enc = encodeMessageToRecords('HELLO', { seed: 's' });
  const dec = decodeRecords(enc.records);
  assert.equal(dec.text, 'HELLO');
  // Central = 0, Riverside = 1.
  assert.ok(enc.records.every((r) => (r.bit === 1) === (r.branch === 'Riverside')));
});

test('simulateRecordsRun round-trips with no minimisation', () => {
  const run = simulateRecordsRun('NODE7', { seed: 's' });
  assert.equal(run.decoded.text, 'NODE7');
  assert.equal(run.bitErrors, 0);
});

test('data minimisation destroys the channel', () => {
  const run = simulateRecordsRun('HELLO', { seed: 's', minimize: true });
  assert.equal(run.decoded.text, null, 'nothing decodable from aggregates');
  assert.ok(Array.isArray(run.aggregates) && run.aggregates.length > 0);
  const totals = run.aggregates.reduce((s, a) => s + a.total, 0);
  assert.equal(totals, encodeMessageToRecords('HELLO', { seed: 's:enc' }).records.length, 'aggregate totals conserve record count');
  for (const a of run.aggregates) assert.equal(a.total, a.central + a.riverside);
});

test('applyMinimization aggregates by day and drops records', () => {
  const enc = encodeMessageToRecords('GO NOW', { seed: 's', perDay: 3 });
  const { aggregates, records } = applyMinimization(enc.records);
  assert.equal(records.length, 0);
  assert.ok(aggregates.length >= 1);
});

test('normal records lean on one hub (not 50/50)', () => {
  const recs = generateNormalRecords(200, { seed: 'n' });
  const riverside = recs.filter((r) => r.branch === 'Riverside').length / recs.length;
  assert.ok(riverside > 0.25 && riverside < 0.45, `hub-weighted split (~35% Riverside), got ${riverside.toFixed(2)}`);
  assert.ok(recs.every((r) => r.covert === false));
});
