/**
 * dom-shim.js — the shared, dependency-free DOM shim used by the view-layer
 * gates (a11y.test.js, disclosure.test.js).
 *
 * Extracted so more than one gate can render every view without duplicating the
 * shim. Not a test file itself: it defines no tests and installs nothing until
 * installDomShim() is called.
 */

/* ---- minimal DOM shim (globals) ------------------------------------------ */
export function installDomShim(GLOBAL_TARGET = globalThis) {
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
    // Model just enough of CSSStyleDeclaration that code using custom properties
  // takes the same path here as it does in a browser.
  function makeStyle() {
    const st = {};
    Object.defineProperty(st, 'setProperty', {
      enumerable: false,
      value(prop, val) { st[prop] = String(val); },
    });
    return st;
  }
  const n = { nodeType: 1, tagName: String(tag).toUpperCase(), _ns: ns || null, childNodes: [], attributes: {}, _text: '', style: makeStyle(), dataset: {}, _listeners: {}, value: '', checked: false, files: [] };
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
  GLOBAL_TARGET.document = {
    createElement: (t) => mk(t), createElementNS: (ns, t) => mk(t, ns),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    createDocumentFragment() { const f = { nodeType: 11, childNodes: [] }; f.appendChild = (c) => { f.childNodes.push(c); return c; }; Object.defineProperty(f, 'firstChild', { get() { return f.childNodes[0] || null; } }); f.removeChild = (c) => { const i = f.childNodes.indexOf(c); if (i >= 0) f.childNodes.splice(i, 1); }; return f; },
    getElementById: () => mk('div'),
  };
  GLOBAL_TARGET.window = { addEventListener() {}, scrollTo() {}, location: { hash: '' } };
  GLOBAL_TARGET.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(new Error('no img')), 0); } };
  GLOBAL_TARGET.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  GLOBAL_TARGET.createImageBitmap = async () => { throw new Error('no bitmap'); };

}

/* ---- helpers -------------------------------------------------------------- */
export function walk(node, pred, out = []) {
  if (!node || node.nodeType === 3) return out;
  if (pred(node)) out.push(node);
  for (const c of node.childNodes || []) walk(c, pred, out);
  return out;
}
export const hasClass = (n, c) => (n.className || '').split(' ').includes(c);


/**
 * Text a real browser would render for this subtree.
 *
 * Deliberately descends into DocumentFragments: the shim gives fragments no
 * textContent getter, but a real DOM splices a fragment's children into the
 * parent on append. A naive textContent read therefore reports empty for
 * anything built with renderBlocks() — which is exactly how a missing
 * disclosure once looked like a present one.
 */
export function renderedText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.textContent || '';
  if (node._text) return node._text;
  return (node.childNodes || []).map(renderedText).join(' ');
}
