import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GLOSSARY } from '../js/content/glossary.js';
import { QUIZ } from '../js/content/quiz.js';

const guide = readFileSync(new URL('../INSTRUCTOR-GUIDE.md', import.meta.url), 'utf8');

test('the instructor guide counts the published quiz and glossary entries', () => {
  const rows = guide.split('\n');
  const quiz = rows.find(row => row.startsWith('| **Knowledge Check**'));
  const glossary = rows.find(row => row.startsWith('| **Glossary**'));
  assert.equal(Number(quiz?.match(/(\d+) questions?\b/)?.[1]), QUIZ.length);
  assert.equal(Number(glossary?.match(/(\d+) cross-referenced terms?\b/)?.[1]), GLOSSARY.length);
});

test('every glossary cross-reference points to a term students can look up', () => {
  const terms = new Set(GLOSSARY.map(entry => entry.term.toLowerCase()));
  for (const entry of GLOSSARY) {
    for (const related of entry.seeAlso ?? []) {
      assert.ok(terms.has(related.toLowerCase()), `${entry.term} refers to missing term ${related}`);
    }
  }
});
