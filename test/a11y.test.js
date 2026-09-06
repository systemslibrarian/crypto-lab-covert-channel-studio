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

/* ---- minimal DOM shim (globals) ------------------------------------------ */
function classList(node) {
  return {
    add(...c) { const s = new Set((node.className || '').split(' ').filter(Boolean)); c.forEach((x) => s.add(x)); node.className = [...s].join(' '); },
    remove(...c) { const s = new Set((node.className || '').split(' ').filter(Boolean)); c.forEach((x) => s.delete(x)); node.className = [...s].join(' '); },
    toggle(c, f) { const s = new Set((node.className || '').split(' ').filter(Boolean)); const h = s.has(c); const w = f === undefined ? !h : f; if (w) s.add(c); else s.delete(c); node.className = [...s].join(' '); return w; },
    contains(c) { return (node.className || '').split(' ').includes(c); },
  };
}
function mk(tag, ns) {
  const n = { nodeType: 1, tagName: String(tag).toUpperCase(), _ns: ns || null, childNodes: [], attributes: {}, _text: '', style: {}, dataset: {}, _listeners: {}, value: '', checked: false, files: [] };
  n.classList = classList(n);
  n.appendChild = (c) => { n.childNodes.push(c); c.parentNode = n; return c; };
  n.removeChild = (c) => { const i = n.childNodes.indexOf(c); if (i >= 0) n.childNodes.splice(i, 1); return c; };
  Object.defineProperty(n, 'firstChild', { get() { return n.childNodes[0] || null; } });
  Object.defineProperty(n, 'offsetWidth', { get() { return 0; } });
  Object.defineProperty(n, 'textContent', {
    get() { return n._text || n.childNodes.map((c) => (c.nodeType === 3 ? c.textContent : (c.textContent || ''))).join(''); },
    set(v) { n.childNodes = []; n._text = String(v); },
  });
  n.setAttribute = (k, v) => { n.attributes[k] = String(v); };
  n.getAttribute = (k) => (k in n.attributes ? n.attributes[k] : null);
  n.removeAttribute = (k) => { delete n.attributes[k]; };
  n.addEventListener = (e, f) => { (n._listeners[e] ||= []).push(f); };
  n.querySelector = () => null; n.querySelectorAll = () => []; n.closest = () => null; n.focus = () => {};
  n.getContext = () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
  return n;
}
globalThis.document = {
  createElement: (t) => mk(t), createElementNS: (ns, t) => mk(t, ns),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  createDocumentFragment() { const f = { nodeType: 11, childNodes: [] }; f.appendChild = (c) => { f.childNodes.push(c); return c; }; Object.defineProperty(f, 'firstChild', { get() { return f.childNodes[0] || null; } }); f.removeChild = (c) => { const i = f.childNodes.indexOf(c); if (i >= 0) f.childNodes.splice(i, 1); }; return f; },
  getElementById: () => mk('div'),
};
globalThis.window = { addEventListener() {}, scrollTo() {}, location: { hash: '' } };
globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(new Error('no img')), 0); } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.createImageBitmap = async () => { throw new Error('no bitmap'); };

/* ---- helpers -------------------------------------------------------------- */
function walk(node, pred, out = []) {
  if (!node || node.nodeType === 3) return out;
  if (pred(node)) out.push(node);
  for (const c of node.childNodes || []) walk(c, pred, out);
  return out;
}
const hasClass = (n, c) => (n.className || '').split(' ').includes(c);

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
  detection: ['detectionView', 'renderDetectionView'],
  challenge: ['challengeView', 'renderChallengeView'],
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
