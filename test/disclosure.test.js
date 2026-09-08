/**
 * disclosure.test.js — the model-boundary honesty gate.
 *
 * Two modules in this exhibit simulate a PHYSICAL medium rather than a protocol:
 * the air-gap optical channel models light, and the shared-cache channel models
 * a cache. For those, "this is a model, not a measurement" is not decoration —
 * it is the claim that keeps the exhibit honest, so it has to be on the page.
 *
 * This gate exists because that disclosure once shipped invisible. The copy was
 * written and reviewed, but `sectionHeader()` renders only title/lede/outcomes —
 * NOT `copy.blocks` — so the callout lived in the content layer and never
 * reached the DOM. Nothing failed: the a11y gate passed, every unit test passed,
 * and the text was present in the source. Only rendering the view and reading
 * the resulting DOM caught it.
 *
 * So these assertions deliberately go through the rendered output, deriving the
 * expected strings FROM the copy. Rewording the callout keeps the gate green;
 * dropping it, or dropping the renderBlocks() call that puts it on the page,
 * turns it red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installDomShim, renderedText } from './dom-shim.js';

installDomShim();

const { getState, setViewMode } = await import('../js/state.js');
const { COPY } = await import('../js/content/copy.js');
const { sectionHeader } = await import('../js/views/blocks.js');

/**
 * Channels whose MEDIUM is modelled. Adding a new one here is the whole
 * registration step — the gate then demands the same disclosure of it.
 */
const MODELLED_CHANNELS = [
  {
    id: 'physical',
    module: 'physicalView',
    render: 'renderPhysicalView',
    /** Must appear somewhere in the rendered view, in either mode. */
    disclaims: [
      /model of a medium, not a measurement/i,
      /no LED, camera, or (light )?sensor/i,
    ],
  },
  {
    id: 'cache',
    module: 'cacheView',
    render: 'renderCacheView',
    disclaims: [
      /model of a cache, not a measurement/i,
      /no cache line is flushed|nothing is flushed/i,
    ],
  },
];

/** The warn callout in a channel's copy that carries the boundary statement. */
function boundaryCallout(id) {
  const blocks = COPY[id]?.blocks ?? [];
  return blocks
    .map((b) => b.callout)
    .find((c) => c && c.kind === 'warn' && /MODEL of a/i.test(c.title || ''));
}

for (const ch of MODELLED_CHANNELS) {
  // ---- content invariant --------------------------------------------------
  test(`disclosure: ${ch.id} copy carries a model-boundary callout`, () => {
    const callout = boundaryCallout(ch.id);
    assert.ok(callout, `COPY.${ch.id}.blocks must contain a warn callout titled "…MODEL of a…"`);
    assert.ok(callout.body.length > 120,
      `${ch.id}: the boundary callout should explain the boundary, not just label it`);
  });

  // ---- the invariant that actually regressed ------------------------------
  test(`disclosure: ${ch.id} states its model boundary in the RENDERED view (both modes)`, async () => {
    const mod = await import(`../js/views/${ch.module}.js`);
    const callout = boundaryCallout(ch.id);

    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node } = mod[ch.render](getState());
      const shown = renderedText(node);

      // The copy's own callout must be on the page — title and body, verbatim.
      assert.ok(shown.includes(callout.title),
        `${ch.id} [${mode}]: the boundary callout TITLE is in the copy but never reaches the DOM. `
        + 'sectionHeader() does not render copy.blocks — the view must call renderBlocks(copy.blocks).');
      assert.ok(shown.includes(callout.body.slice(0, 60)),
        `${ch.id} [${mode}]: the boundary callout BODY is in the copy but never reaches the DOM.`);

      // And the specific things it must deny.
      for (const re of ch.disclaims) {
        assert.match(shown, re, `${ch.id} [${mode}]: rendered view must state ${re}`);
      }
    }
  });

  // ---- no view may imply live hardware ------------------------------------
  test(`disclosure: ${ch.id} rendered view never implies live hardware`, async () => {
    const mod = await import(`../js/views/${ch.module}.js`);
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const shown = renderedText(mod[ch.render](getState()).node);
      // Phrases that would assert a real measurement. Each is allowed only when
      // negated ("no real…", "not a real…"), which the disclosures rely on.
      for (const claim of ['measured from', 'read from your', 'live hardware', 'your actual cache']) {
        assert.ok(!shown.toLowerCase().includes(claim),
          `${ch.id} [${mode}]: rendered view must not claim "${claim}"`);
      }
    }
  });
}

/**
 * Pins the exact failure mode. The disclosure must come from copy.blocks, so the
 * header alone must NOT contain it — otherwise the gate above could pass while
 * the view silently stopped rendering blocks.
 */
test('disclosure: the boundary text comes from copy.blocks, not the section header', () => {
  for (const ch of MODELLED_CHANNELS) {
    const callout = boundaryCallout(ch.id);
    const headerOnly = renderedText(sectionHeader({ ...COPY[ch.id], eyebrow: 'x' }));
    assert.ok(!headerOnly.includes(callout.title),
      `${ch.id}: sectionHeader unexpectedly renders blocks — this gate would stop detecting the regression`);
  }
});

/**
 * The fragment-descending reader is load-bearing: renderBlocks() returns a
 * DocumentFragment, and the shim gives fragments no textContent getter. A naive
 * read reports empty and a missing disclosure looks identical to a present one.
 */
test('disclosure: renderedText descends DocumentFragments', () => {
  const frag = globalThis.document.createDocumentFragment();
  const p = globalThis.document.createElement('p');
  p.textContent = 'boundary text';
  frag.appendChild(p);
  const host = globalThis.document.createElement('div');
  host.appendChild(frag);
  assert.match(renderedText(host), /boundary text/,
    'renderedText must see through fragments, or this whole gate is vacuous');
  assert.ok(!(host.textContent || '').includes('boundary text'),
    'sanity: a naive textContent read is exactly what missed the original regression');
});
