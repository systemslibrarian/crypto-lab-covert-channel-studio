/**
 * atlas.test.js — arithmetic gate on the Carrier Atlas taxonomy card.
 *
 * The intro prose states how many of the eleven patterns carry named
 * sub-patterns and how many rows the table therefore has. Those are counts, so
 * they can be DERIVED from the catalog rather than trusted: a sub-pattern row is
 * one that names a `parent`, and the patterns that carry sub-patterns are the
 * distinct parents. The prose once read "four of the eleven carry named
 * sub-patterns" when the four sub-patterns (P2.a, P2.b, P6.a, P6.b) sit under
 * exactly TWO parents — P2 Sequence and P6 Value Modulation. Rewording the
 * sentence keeps this gate green; getting the arithmetic wrong again turns it
 * red.
 *
 * Node built-in runner only. Data only: no DOM, no clock, no randomness.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TAXONOMY } from '../js/content/atlas.js';

const rows = TAXONOMY.families.flatMap((fam) => fam.patterns);
const subPatterns = rows.filter((p) => p.parent);
const topLevel = rows.filter((p) => !p.parent);
const parents = new Set(subPatterns.map((p) => p.parent));

test('the catalog is eleven top-level patterns and four sub-patterns under two of them', () => {
  assert.equal(topLevel.length, 11, 'eleven top-level patterns');
  assert.equal(subPatterns.length, 4, 'four named sub-patterns');
  assert.equal(rows.length, 15, 'fifteen rows for eleven patterns');
  assert.deepEqual([...parents].sort(), ['P2 Sequence', 'P6 Value Modulation']);
  assert.equal(parents.size, 2, 'the sub-patterns sit under exactly two parents');
  // Every named parent is a real top-level pattern in the catalog.
  const topNames = new Set(topLevel.map((p) => `${p.code} ${p.name}`));
  for (const parent of parents) assert.ok(topNames.has(parent), `parent '${parent}' is a catalog pattern`);
});

test('the intro prose agrees with the counts it describes', () => {
  const { intro } = TAXONOMY;
  assert.match(intro, /fifteen rows for eleven patterns/,
    'the row count in the prose must match the fifteen rows above');
  assert.match(intro, /Two of the eleven carry named sub-patterns/,
    'TWO patterns carry sub-patterns, not four — four is the number of SUB-PATTERNS');
  assert.doesNotMatch(intro, /Four of the eleven carry named sub-patterns/i,
    'the four sub-patterns sit under two parents, so "four of the eleven" miscounts the parents');
});
