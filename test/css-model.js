/**
 * css-model.js — a tiny, dependency-free model of this project's stylesheets.
 *
 * Not a test file: it defines no tests. It exists so the accessibility gates can
 * make *measured* claims about the CSS (contrast ratios, target sizes) instead
 * of asserting a hand-copied number that drifts the moment a token changes.
 *
 * Scope is deliberately narrow — enough CSS to model THIS stylesheet honestly:
 *   • flat rules and rules nested one level inside @media / @supports
 *   • custom properties on :root and on the per-section `#sec-*` scopes
 *   • colours as #hex, rgb()/rgba(), var() with fallback, and color-mix(in srgb)
 *   • gradients, reduced to the set of colour stops a glyph could sit on
 *   • lengths in px / rem, including var(--fs-*) and var(--sp-*) indirection
 *
 * Anything it cannot resolve is reported as `null` rather than guessed, and the
 * gates assert on the size of that unresolved set so a new colour syntax cannot
 * quietly opt itself out of the contrast guard.
 *
 * ---------------------------------------------------------------------------
 * PORTING THIS TO ANOTHER LAB
 * ---------------------------------------------------------------------------
 * This is a port, not a copy. The split is roughly 90% portable / 10% local, but
 * the 10% is load-bearing and silent if you get it wrong — a mis-set surface list
 * makes the gate pass by measuring nothing.
 *
 * PORTABLE AS-IS
 *   Everything below except the CSS_FILES constant: the parser, the custom-property
 *   scope resolution, colour resolution (hex / rgb / var with fallback / color-mix /
 *   gradient stops), alpha compositing, relative luminance, contrast ratio, the
 *   px/rem length resolution, and the compound-selector matcher.
 *
 * WHAT EACH LAB MUST SUPPLY
 *   1. CSS_FILES, in <link> order. Later files win, as in the cascade. Get the
 *      order wrong and overrides resolve backwards.
 *   2. A view registry: section id -> [module basename, exported factory name],
 *      plus a factory contract. Here every view returns { node, refresh? } and is
 *      called with the store state. A lab whose views take different arguments
 *      needs its own adapter; the gates only need a DOM tree per section.
 *   3. A DOM to render into. This lab has a hand-written shim (test/dom-shim.js)
 *      exposing createElement with { attributes, childNodes, className, style,
 *      parentNode } and a `walk` helper. A lab already on jsdom can point the
 *      gates at that instead — the model only reads attributes, classes, inline
 *      style and ancestry, so any tree with those works.
 *   4. The surface list the contrast gate measures against, and the exemptions.
 *      DECORATIVE_CHROME is genuinely per-lab: it records which painted elements
 *      render no meaningful text, and each entry has to carry a justification
 *      rather than a name, or it becomes a place to hide failures.
 *
 * WHAT WILL BITE
 *   - The model covers the CSS *this* project writes. A lab using nesting, layers,
 *     relative colour syntax, or container queries needs the parser extended. It
 *     will report those as unresolved rather than passing them, which is the
 *     intended failure mode: check the unresolved count on first run and expect it
 *     to be non-zero until you have taught it the syntax.
 *   - Contrast is only meaningful once tints are composited. Checking tokens
 *     against tokens is much easier and finds much less: on this lab's first run
 *     the token-level check passed while the rendered check found four defects,
 *     two of them incomplete fixes and one self-inflicted.
 *   - The gate is only as honest as its surfaces. If a lab's panels paint colours
 *     that never appear in the surface list, the gate measures the wrong pairing
 *     and reports success.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Stylesheets in <link> order — later files win, as in the cascade. */
export const CSS_FILES = ['css/base.css', 'css/layout.css', 'css/components.css', 'css/views.css'];

/* ---- parsing -------------------------------------------------------------- */

/** Split on a separator that is not inside parentheses or quotes. */
export function splitTop(str, sep = ',') {
  const out = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of str) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

function stripComments(text) {
  // Replace comment bodies with equivalent whitespace so line numbers survive.
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function parseDeclarations(body) {
  const decls = {};
  for (const part of splitTop(body, ';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!prop) continue;
    decls[prop] = value;
  }
  return decls;
}

/**
 * Parse one stylesheet into a flat list of rules.
 * @returns {{file:string,line:number,selector:string,selectors:string[],media:string|null,decls:Object}[]}
 */
export function parseStylesheet(file, text) {
  const src = stripComments(text);
  const rules = [];
  const lineAt = (idx) => src.slice(0, idx).split('\n').length;

  function parseBlock(start, end, media) {
    let i = start;
    let preludeStart = i;
    while (i < end) {
      const ch = src[i];
      if (ch === '{') {
        const prelude = src.slice(preludeStart, i).trim();
        // find matching close brace
        let depth = 1;
        let j = i + 1;
        while (j < end && depth > 0) {
          if (src[j] === '{') depth += 1;
          else if (src[j] === '}') depth -= 1;
          j += 1;
        }
        const bodyStart = i + 1;
        const bodyEnd = j - 1;
        if (prelude.startsWith('@')) {
          const name = prelude.slice(1).split(/[\s({]/)[0];
          if (['media', 'supports', 'layer', 'container', 'keyframes'].includes(name)) {
            parseBlock(bodyStart, bodyEnd, name === 'keyframes' ? `@keyframes` : prelude);
          }
          // @font-face / @import etc. carry no selectors we model.
        } else if (prelude) {
          rules.push({
            file,
            line: lineAt(i),
            selector: prelude.replace(/\s+/g, ' '),
            selectors: splitTop(prelude.replace(/\s+/g, ' ')),
            media: media || null,
            decls: parseDeclarations(src.slice(bodyStart, bodyEnd)),
          });
        }
        i = j;
        preludeStart = i;
        continue;
      }
      if (ch === '}') { i += 1; preludeStart = i; continue; }
      i += 1;
    }
  }

  parseBlock(0, src.length, null);
  return rules;
}

let _rules = null;
/** Every rule in every stylesheet, in cascade order. */
export function allRules() {
  if (_rules) return _rules;
  _rules = [];
  for (const rel of CSS_FILES) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    _rules.push(...parseStylesheet(rel, text));
  }
  return _rules;
}

/** Custom properties declared on `:root` (the global token table). */
export function rootTokens() {
  const vars = {};
  for (const r of allRules()) {
    if (!r.selectors.includes(':root')) continue;
    for (const [k, v] of Object.entries(r.decls)) if (k.startsWith('--')) vars[k] = v;
  }
  return vars;
}

/**
 * Per-section token overrides: `#sec-hopping { --accent: #818cf8 }`.
 * The exhibit gives each channel its own accent, so "the" accent colour is
 * really fourteen colours and every one of them has to clear contrast.
 * @returns {Map<string, Object>} section id (without the `sec-` prefix) → vars
 */
export function sectionTokenScopes() {
  const scopes = new Map();
  for (const r of allRules()) {
    for (const sel of r.selectors) {
      const m = /^#sec-([a-z0-9-]+)$/.exec(sel.trim());
      if (!m) continue;
      const custom = Object.entries(r.decls).filter(([k]) => k.startsWith('--'));
      if (!custom.length) continue;
      const cur = scopes.get(m[1]) || {};
      for (const [k, v] of custom) cur[k] = v;
      scopes.set(m[1], cur);
    }
  }
  return scopes;
}

/* ---- colour --------------------------------------------------------------- */

const NAMED = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

const rgba = (r, g, b, a = 1) => ({ r, g, b, a });

function parseHex(v) {
  let h = v.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  if ([0, 2, 4].some((i) => Number.isNaN(n(i)))) return null;
  return rgba(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1);
}

function parseNumberish(s) {
  const t = s.trim();
  if (t.endsWith('%')) return parseFloat(t) / 100 * 255;
  return parseFloat(t);
}

/**
 * Resolve a CSS colour expression to sRGB + alpha, or null if this model cannot
 * resolve it (a calc() percentage, currentColor, a keyword we do not model).
 * @param {string} value
 * @param {Object} vars custom-property table
 */
export function resolveColor(value, vars, depth = 0) {
  if (value == null || depth > 12) return null;
  const v = String(value).trim().replace(/\s*!important$/, '');
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower in NAMED) { const [r, g, b, a] = NAMED[lower]; return rgba(r, g, b, a); }
  if (v.startsWith('#')) return parseHex(v);

  const fn = /^([a-z-]+)\((.*)\)$/is.exec(v);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  const args = splitTop(fn[2], ',');

  if (name === 'rgb' || name === 'rgba') {
    // Both comma and space separated forms appear in the wild.
    const parts = args.length >= 3 ? args : splitTop(fn[2].replace('/', ' '), ' ');
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map(parseNumberish);
    const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return rgba(r, g, b, a);
  }

  if (name === 'var') {
    const token = args[0];
    if (vars && Object.prototype.hasOwnProperty.call(vars, token)) {
      return resolveColor(vars[token], vars, depth + 1);
    }
    if (args.length > 1) return resolveColor(args.slice(1).join(','), vars, depth + 1);
    return null;
  }

  if (name === 'color-mix') {
    if (!/^in\s+srgb$/i.test(args[0] || '')) return null; // only srgb is modelled
    const spec = (arg) => {
      const m = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(arg.trim());
      return { color: resolveColor(m[1], vars, depth + 1), pct: m[2] == null ? null : parseFloat(m[2]) };
    };
    const a = spec(args[1] || '');
    const b = spec(args[2] || '');
    if (!a.color || !b.color) return null;
    let pa = a.pct;
    let pb = b.pct;
    if (pa == null && pb == null) { pa = 50; pb = 50; }
    else if (pa == null) pa = 100 - pb;
    else if (pb == null) pb = 100 - pa;
    const sum = pa + pb;
    if (!sum) return null;
    const wa = pa / sum;
    const wb = pb / sum;
    // Premultiplied mixing, per css-color-5.
    const alpha = a.color.a * wa + b.color.a * wb;
    const chan = (k) => {
      const pm = a.color[k] * a.color.a * wa + b.color[k] * b.color.a * wb;
      return alpha === 0 ? 0 : pm / alpha;
    };
    return rgba(chan('r'), chan('g'), chan('b'), alpha);
  }

  return null;
}

/**
 * Every colour a background value can paint. A gradient returns one entry per
 * stop, because text laid over it sits on all of them.
 * @returns {{colors:Array,unresolved:string[]}}
 */
export function backgroundColors(value, vars) {
  const v = String(value || '').trim().replace(/\s*!important$/, '');
  if (!v || v === 'none' || v === 'inherit' || v === 'currentColor') return { colors: [], unresolved: [] };
  const direct = resolveColor(v, vars);
  if (direct) return { colors: [direct], unresolved: [] };

  const grad = /^(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)$/is.exec(v);
  if (grad) {
    const colors = [];
    const unresolved = [];
    for (const part of splitTop(grad[1], ',')) {
      if (/^(to\s|circle|ellipse|at\s|[\d.]+deg|[\d.]+turn|from\s)/i.test(part)) continue;
      // strip a trailing stop position
      const stop = part.replace(/\s+-?[\d.]+(%|px|rem|em)?(\s+-?[\d.]+(%|px|rem|em)?)?$/i, '').trim();
      const c = resolveColor(stop, vars);
      if (c) colors.push(c);
      else unresolved.push(part.trim());
    }
    return { colors, unresolved };
  }
  return { colors: [], unresolved: [v] };
}

/** Composite a (possibly translucent) colour over an opaque backdrop. */
export function over(fg, bg) {
  const a = fg.a;
  if (a >= 1) return rgba(fg.r, fg.g, fg.b, 1);
  return rgba(fg.r * a + bg.r * (1 - a), fg.g * a + bg.g * (1 - a), fg.b * a + bg.b * (1 - a), 1);
}

/** WCAG 2.1 relative luminance (sRGB). */
export function relativeLuminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.1 contrast ratio. Both colours must already be opaque. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const fmtColor = (c) => (c
  ? `rgb(${[c.r, c.g, c.b].map((n) => Math.round(n)).join(' ')})${c.a < 1 ? ` / ${c.a.toFixed(2)}` : ''}`
  : 'unresolved');

/* ---- lengths -------------------------------------------------------------- */

const ROOT_FONT_PX = 16;

/** Resolve a CSS length to px, following var() indirection. null if unknown. */
export function lengthPx(value, vars, depth = 0) {
  if (value == null || depth > 8) return null;
  const v = String(value).trim().replace(/\s*!important$/, '');
  if (!v) return null;
  const varMatch = /^var\((.*)\)$/s.exec(v);
  if (varMatch) {
    const args = splitTop(varMatch[1], ',');
    if (vars && Object.prototype.hasOwnProperty.call(vars, args[0])) return lengthPx(vars[args[0]], vars, depth + 1);
    if (args.length > 1) return lengthPx(args.slice(1).join(','), vars, depth + 1);
    return null;
  }
  let m = /^(-?[\d.]+)px$/i.exec(v);
  if (m) return parseFloat(m[1]);
  m = /^(-?[\d.]+)rem$/i.exec(v);
  if (m) return parseFloat(m[1]) * ROOT_FONT_PX;
  m = /^(-?[\d.]+)$/.exec(v);
  if (m) return parseFloat(m[1]) === 0 ? 0 : null; // unitless is only valid at 0
  return null;
}

/** Resolve the shorthand `padding: a b c d` to {top,right,bottom,left} px. */
export function paddingBox(decls, vars) {
  const box = { top: null, right: null, bottom: null, left: null };
  if (decls.padding) {
    const parts = splitTop(decls.padding, ' ').map((p) => lengthPx(p, vars));
    if (parts.length === 1) { box.top = box.right = box.bottom = box.left = parts[0]; }
    else if (parts.length === 2) { box.top = box.bottom = parts[0]; box.right = box.left = parts[1]; }
    else if (parts.length === 3) { box.top = parts[0]; box.right = box.left = parts[1]; box.bottom = parts[2]; }
    else if (parts.length >= 4) { [box.top, box.right, box.bottom, box.left] = parts; }
  }
  if (decls['padding-block']) {
    const parts = splitTop(decls['padding-block'], ' ').map((p) => lengthPx(p, vars));
    box.top = parts[0]; box.bottom = parts.length > 1 ? parts[1] : parts[0];
  }
  if (decls['padding-top'] != null) box.top = lengthPx(decls['padding-top'], vars);
  if (decls['padding-bottom'] != null) box.bottom = lengthPx(decls['padding-bottom'], vars);
  if (decls['padding-left'] != null) box.left = lengthPx(decls['padding-left'], vars);
  if (decls['padding-right'] != null) box.right = lengthPx(decls['padding-right'], vars);
  return box;
}

/** Border width contributed to the box on one axis, in px (0 when absent). */
export function borderPx(decls, vars) {
  const read = (v) => {
    if (v == null) return null;
    for (const part of splitTop(v, ' ')) {
      const px = lengthPx(part, vars);
      if (px != null) return px;
    }
    return /^none$/i.test(v.trim()) ? 0 : null;
  };
  const shorthand = read(decls.border);
  const top = decls['border-top'] != null ? read(decls['border-top']) : shorthand;
  const bottom = decls['border-bottom'] != null ? read(decls['border-bottom']) : shorthand;
  return { top: top ?? 0, bottom: bottom ?? 0 };
}

/* ---- a very small cascade over the DOM shim -------------------------------
 * Enough of a selector engine to answer "what does this rendered element
 * actually look like": simple compounds (tag / class / attribute) joined by
 * descendant combinators, merged in stylesheet order. Child and sibling
 * combinators are skipped rather than guessed at, and state pseudo-classes
 * (:hover, :checked, …) are not applied, so what is measured is the resting
 * appearance of the element as it renders.
 * ------------------------------------------------------------------------ */

/** Does a simple compound selector match a shim element? */
export function matchesCompound(node, compound) {
  const parts = compound.match(/^[a-z][a-z0-9]*|\.[A-Za-z0-9_-]+|\[[^\]]+\]|::?[a-z-]+(\([^)]*\))?/gi) || [];
  if (!parts.length) return false;
  const classes = (node.className || '').split(' ').filter(Boolean);
  for (const p of parts) {
    if (p.startsWith('.')) { if (!classes.includes(p.slice(1))) return false; continue; }
    if (p.startsWith('[')) {
      const m = /^\[([A-Za-z0-9_-]+)(?:=?"?([^"\]]*)"?)?\]$/.exec(p);
      if (!m) return false;
      const v = node.getAttribute(m[1]);
      if (v == null) return false;
      if (m[2] != null && m[2] !== '' && v !== m[2]) return false;
      continue;
    }
    if (p.startsWith(':')) return false; // state / pseudo-element: not the resting style
    if ((node.tagName || '') !== p.toUpperCase()) return false;
  }
  return true;
}

/** Classes contributed by each node's ancestors, for descendant matching. */
export function ancestorClassIndex(root) {
  const index = new Map();
  const visit = (n, inherited) => {
    if (!n || n.nodeType === 3) return;
    index.set(n, inherited);
    const own = new Set(inherited);
    for (const c of (n.className || '').split(' ')) if (c) own.add(c);
    for (const child of n.childNodes || []) visit(child, own);
  };
  visit(root, new Set());
  return index;
}

/** Inline styles from the shim's style object, normalised to CSS property names. */
export function inlineStyle(node) {
  const out = {};
  for (const [k, v] of Object.entries(node.style || {})) {
    if (v == null) continue;
    out[k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)] = String(v);
  }
  return out;
}

/**
 * Declarations that apply to a rendered element: every non-media rule whose
 * last compound matches it and whose ancestor compounds are satisfied, merged
 * in stylesheet order, with inline styles last.
 */
let _index = null;
/**
 * Rules bucketed by the key of their last compound (a class name, or a tag name
 * when the compound has no class). Without this the walk is O(nodes x rules) and
 * the render-based gates take minutes instead of seconds.
 */
function selectorIndex() {
  if (_index) return _index;
  _index = new Map();
  const add = (key, entry) => {
    if (!_index.has(key)) _index.set(key, []);
    _index.get(key).push(entry);
  };
  for (const [order, r] of allRules().entries()) {
    if (r.media) continue;
    for (const sel of r.selectors) {
      if (/[>+~]/.test(sel)) continue;
      // State rules describe a transient appearance, not the resting one. They
      // are excluded here so a :hover fill is never folded into what the element
      // looks like at rest; the static same-rule gate still measures them.
      if (/:(hover|focus|focus-visible|active|checked|disabled|target|visited)\b/.test(sel)) continue;
      const compounds = sel.split(/\s+/).filter(Boolean);
      const last = compounds[compounds.length - 1];
      if (!last || last.includes('::')) continue;
      const cls = (last.match(/\.[A-Za-z0-9_-]+/g) || []).map((x) => x.slice(1));
      const tag = (/^[a-z][a-z0-9]*/i.exec(last) || [])[0];
      const key = cls.length ? cls[0] : (tag ? tag.toLowerCase() : '*');
      add(key, { rule: r, sel, compounds, last, order });
    }
  }
  return _index;
}

export function computedDecls(node, ancestorClasses, { includeInline = true } = {}) {
  const index = selectorIndex();
  const keys = new Set((node.className || '').split(' ').filter(Boolean));
  if (node.tagName) keys.add(node.tagName.toLowerCase());
  keys.add('*');
  const candidates = [];
  for (const key of keys) for (const entry of index.get(key) || []) candidates.push(entry);
  candidates.sort((a, b) => a.order - b.order);

  const merged = {};
  for (const { rule, compounds, last } of candidates) {
    if (!matchesCompound(node, last)) continue;
    const ok = compounds.slice(0, -1).every((c) => {
      const cls = (c.match(/\.[A-Za-z0-9_-]+/g) || []).map((x) => x.slice(1));
      return cls.length > 0 && cls.every((x) => ancestorClasses.has(x));
    });
    if (!ok) continue;
    Object.assign(merged, rule.decls);
  }
  if (includeInline) Object.assign(merged, inlineStyle(node));
  return merged;
}
