/**
 * dom.test.js — invariants for the safe DOM construction helpers.
 *
 * These lock two things that fail SILENTLY in a browser and are therefore
 * invisible to every other test in this suite:
 *
 *   1. CSS custom properties set through the `style` prop actually reach the
 *      style declaration. Assigning `--x` onto a CSSStyleDeclaration creates an
 *      ordinary JS property the CSS engine never reads, so the rule consuming it
 *      quietly falls back to its default. That is how the transition-matrix
 *      heat tint was lost: every cell rendered fully transparent while the code
 *      looked correct and every test passed.
 *
 *   2. There is still no innerHTML path, so user-supplied text cannot become
 *      markup.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installDomShim } from './dom-shim.js';

installDomShim();
const { el, div } = await import('../js/views/dom.js');

test('custom properties in the style prop reach the style declaration', () => {
  const node = el('td', { style: { '--tm-fill': '0.7' } });
  assert.equal(node.style['--tm-fill'], '0.7',
    'a --custom-property passed via style must be set, not silently dropped');
});

test('ordinary style properties still apply', () => {
  const node = div({ style: { width: '26px', color: 'red' } });
  assert.equal(node.style.width, '26px');
  assert.equal(node.style.color, 'red');
});

test('custom and ordinary style properties coexist in one call', () => {
  const node = div({ style: { '--tm-fill': '0.25', display: 'flex' } });
  assert.equal(node.style['--tm-fill'], '0.25');
  assert.equal(node.style.display, 'flex');
});

test('null and undefined style values are skipped, not stringified', () => {
  const node = div({ style: { '--tm-fill': null, width: undefined, height: '2px' } });
  assert.equal(node.style['--tm-fill'], undefined, 'null must not become the string "null"');
  assert.equal(node.style.height, '2px');
});

test('the transition matrix sets a real custom property on tinted cells', async () => {
  // The regression this file exists for, exercised through the actual view.
  const { getState, setViewMode } = await import('../js/state.js');
  const { renderHoppingView } = await import('../js/views/hoppingView.js');
  const { walk, hasClass } = await import('./dom-shim.js');
  setViewMode('defender');
  const { node } = renderHoppingView(getState());
  const tinted = walk(node, (n) => hasClass(n, 'tm-cell') && n.style['--tm-fill'] !== undefined);
  assert.ok(tinted.length > 0,
    'at least one used, off-diagonal transition cell must carry --tm-fill');
  for (const c of tinted) {
    const v = Number(c.style['--tm-fill']);
    assert.ok(Number.isFinite(v) && v > 0 && v <= 1, `--tm-fill must be a 0..1 number, got ${c.style['--tm-fill']}`);
  }
  setViewMode('sender');
});

test('no module anywhere assigns innerHTML or outerHTML', () => {
  // Comments are stripped first: dom.js documents the ban in prose, and the
  // prose must not be what satisfies the check.
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const offenders = [];
  for (const file of jsFiles(new URL('../js/', import.meta.url))) {
    const code = strip(readFileSync(file, 'utf8'));
    if (/\b(inner|outer)HTML\b/.test(code) || /insertAdjacentHTML/.test(code)) {
      offenders.push(fileURLToPath(file).split('/js/')[1]);
    }
  }
  assert.deepEqual(offenders, [],
    `these modules reach for an HTML-parsing sink: ${offenders.join(', ')}`);
});

/** Every .js file under a directory, recursively. */
function jsFiles(dirUrl) {
  const out = [];
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
    if (entry.isDirectory()) out.push(...jsFiles(child));
    else if (entry.name.endsWith('.js')) out.push(child);
  }
  return out;
}
