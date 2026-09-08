/**
 * a11y.test.js — a dependency-free accessibility gate.
 *
 * Renders every view (both view modes) under a minimal DOM shim and asserts the
 * invariants that are cheap to regress: every interactive control has an
 * accessible name, and every scrollable table/timeline region is a focusable,
 * labelled region. This is what caught (and now prevents) the empty-<label>
 * regression on the challenge dropdown.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDomShim, walk, hasClass } from './dom-shim.js';

installDomShim();

/** Resolve an accessible name for a control, following the shim's DOM. */
function accessibleName(node, root) {
  const aria = node.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const id = node.getAttribute('id');
  if (id) {
    const labels = walk(root, (n) => n.tagName === 'LABEL' && n.getAttribute('for') === id);
    for (const l of labels) if ((l.textContent || '').trim()) return l.textContent.trim();
  }
  // ancestor <label> (wrapping pattern used by switches/segmented/file inputs)
  let p = node.parentNode;
  while (p) { if (p.tagName === 'LABEL' && (p.textContent || '').trim()) return p.textContent.trim(); p = p.parentNode; }
  if (node.tagName === 'BUTTON' && (node.textContent || '').trim()) return node.textContent.trim();
  return '';
}

const VIEW_MODULES = {
  overview: ['overviewView', 'renderOverview'],
  dns: ['dnsView', 'renderDnsView'],
  timing: ['timingView', 'renderTimingView'],
  storage: ['storageView', 'renderStorageView'],
  ordering: ['orderingView', 'renderOrderingView'],
  http: ['httpView', 'renderHttpView'],
  stego: ['stegoView', 'renderStegoView'],
  metadata: ['metadataView', 'renderMetadataView'],
  physical: ['physicalView', 'renderPhysicalView'],
  cache: ['cacheView', 'renderCacheView'],
  detection: ['detectionView', 'renderDetectionView'],
  challenge: ['challengeView', 'renderChallengeView'],
  validation: ['validationView', 'renderValidationView'],
  compare: ['comparisonView', 'renderComparisonView'],
  atlas: ['atlasView', 'renderAtlasView'],
  srm: ['srmView', 'renderSrmView'],
  concepts: ['conceptsView', 'renderConceptsView'],
  defense: ['defenseView', 'renderDefenseView'],
  glossary: ['glossaryView', 'renderGlossaryView'],
  quiz: ['quizView', 'renderQuizView'],
};

const { getState, setViewMode } = await import('../js/state.js');

for (const [id, [mod, fn]] of Object.entries(VIEW_MODULES)) {
  const factory = (await import(`../js/views/${mod}.js`))[fn];

  test(`a11y: ${id} — controls have accessible names, regions are labelled (both modes)`, () => {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node } = factory(getState());

      // Every button, select, textarea, and named-role input has an accessible name.
      const controls = walk(node, (n) => ['BUTTON', 'SELECT', 'TEXTAREA'].includes(n.tagName)
        || (n.tagName === 'INPUT' && ['text', 'search', 'range', 'checkbox', 'radio', 'file'].includes(n.getAttribute('type'))));
      for (const c of controls) {
        const name = accessibleName(c, node);
        assert.ok(name.length > 0, `${id} [${mode}]: ${c.tagName}${c.getAttribute('type') ? '[' + c.getAttribute('type') + ']' : ''} has no accessible name`);
      }

      // Scrollable table/timeline regions must be focusable, labelled regions.
      const regions = walk(node, (n) => hasClass(n, 'table-wrap') || hasClass(n, 'timeline-wrap'));
      for (const r of regions) {
        assert.equal(r.getAttribute('role'), 'region', `${id} [${mode}]: scrollable region missing role=region`);
        assert.equal(r.getAttribute('tabindex'), '0', `${id} [${mode}]: scrollable region not focusable`);
        assert.ok((r.getAttribute('aria-label') || '').length > 0, `${id} [${mode}]: scrollable region missing aria-label`);
      }
    }
  });
}
