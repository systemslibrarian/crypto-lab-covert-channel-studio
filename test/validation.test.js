/**
 * Tests for the Detector Validation Lab (js/analysis/validation.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auc, roc, confusion, validateDetector, validateAll } from '../js/analysis/validation.js';

test('AUC: known-answer cases', () => {
  assert.equal(auc([{ score: 10, label: 'clean' }, { score: 90, label: 'covert' }]), 1, 'perfect separation');
  assert.equal(auc([{ score: 90, label: 'clean' }, { score: 10, label: 'covert' }]), 0, 'reversed separation');
  assert.equal(auc([{ score: 50, label: 'clean' }, { score: 50, label: 'covert' }]), 0.5, 'ties -> 0.5');
  // Two covert (80,60) vs two clean (70,30): pairs covert>clean = (80>70,80>30,60>30)=3, 60 vs 70 no -> 3/4.
  assert.equal(auc([
    { score: 80, label: 'covert' }, { score: 60, label: 'covert' },
    { score: 70, label: 'clean' }, { score: 30, label: 'clean' },
  ]), 0.75);
});

test('confusion: counts and rates at a threshold', () => {
  const pts = [
    { score: 80, label: 'covert' }, { score: 40, label: 'covert' }, { score: 20, label: 'covert' },
    { score: 50, label: 'clean' }, { score: 10, label: 'clean' },
  ];
  const c = confusion(pts, 34); // flag if >= 34
  assert.equal(c.tp, 2); // 80, 40
  assert.equal(c.fn, 1); // 20
  assert.equal(c.fp, 1); // 50
  assert.equal(c.tn, 1); // 10
  assert.equal(round2(c.recall), 0.67);
  assert.equal(round2(c.fpr), 0.5);
  assert.equal(round2(c.fnr), 0.33);
});

test('ROC starts near (0,0) and ends at (1,1)', () => {
  const pts = [{ score: 90, label: 'covert' }, { score: 10, label: 'clean' }];
  const r = roc(pts);
  assert.equal(r[0].fpr, 0);
  assert.equal(r[0].tpr, 0);
  const last = r[r.length - 1];
  assert.equal(last.tpr, 1);
  assert.equal(last.fpr, 1);
});

test('validateDetector: DNS separates covert from clean with high AUC', () => {
  const r = validateDetector('dns');
  assert.ok(r.counts.covert > 10 && r.counts.clean > 10, 'benchmark has many cases');
  assert.ok(r.auc >= 0.9, `DNS AUC should be high (got ${r.auc})`);
  assert.ok(r.confusion.fpr <= 0.1, 'DNS keeps false positives low at the investigate threshold');
});

test('validateAll: statistical detectors are strong; stego is honestly weaker', () => {
  const byId = Object.fromEntries(validateAll().map((r) => [r.channel, r]));
  for (const id of ['dns', 'timing', 'storage', 'http']) {
    assert.ok(byId[id].auc >= 0.9, `${id} AUC >= 0.9 (got ${byId[id].auc})`);
  }
  // The chi-square attack false-positives on noisy carriers -> lower AUC.
  assert.ok(byId.stego.auc > 0.5 && byId.stego.auc < 0.95, `stego AUC is honestly middling (got ${byId.stego.auc})`);
});

test('validateAll is deterministic', () => {
  const a = validateAll().map((r) => `${r.channel}:${r.auc}`).join('|');
  const b = validateAll().map((r) => `${r.channel}:${r.auc}`).join('|');
  assert.equal(a, b);
});

function round2(x) { return Math.round(x * 100) / 100; }
