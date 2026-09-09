/**
 * views/dom.js — tiny safe DOM construction helpers.
 *
 * Everything is built with createElement + textContent. There is deliberately
 * NO innerHTML path anywhere in this project, so user-supplied text (the toy
 * message) can never be interpreted as markup. This is part of the exhibit
 * modelling good security hygiene.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an HTML element.
 * @param {string} tag
 * @param {Object} [props] class/text/attrs/on/dataset/style/aria...
 * @param {...(Node|string|Array)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

/** Create an SVG element (attributes only; no innerHTML). */
export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'on') { for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn); continue; }
    if (k === 'text') { node.textContent = v; continue; }
    node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, children);
  return node;
}

function applyProps(node, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') applyStyle(node, v);
    else if (k === 'on') { for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn); }
    else if (k === 'attrs') { for (const [a, val] of Object.entries(v)) if (val != null && val !== false) node.setAttribute(a, val === true ? '' : String(val)); }
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
}

/**
 * Apply a style object.
 *
 * Custom properties have to go through setProperty: assigning `--x` onto a
 * CSSStyleDeclaration creates an ordinary JS property that the CSS engine never
 * reads, so it fails silently and the rule that consumes it falls back. That is
 * exactly how the transition-matrix tint was lost, so the split is kept explicit
 * rather than relying on Object.assign.
 */
function applyStyle(node, styles) {
  for (const [prop, val] of Object.entries(styles)) {
    if (val == null) continue;
    if (prop.startsWith('--')) {
      // The test DOM shim models style as a plain object; fall back for it.
      if (typeof node.style.setProperty === 'function') node.style.setProperty(prop, String(val));
      else node.style[prop] = String(val);
    } else {
      node.style[prop] = val;
    }
  }
}

/** Append mixed children (nodes, strings, arrays, null) to a node. */
export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'object' && child.nodeType ? child : document.createTextNode(String(child)));
  }
}

/** Remove all children of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Replace the contents of a node with new children. */
export function replace(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/** Convenience factories. */
export const div = (props, ...c) => el('div', props, ...c);
export const span = (props, ...c) => el('span', props, ...c);

/** A labelled figure block used throughout the exhibit. */
export function card(titleText, ...children) {
  return el('section', { class: 'card' },
    titleText ? el('h3', { class: 'card-title', text: titleText }) : null,
    ...children);
}

/** Format a millisecond time-of-day value as HH:MM:SS. */
export function formatClock(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600) % 24;
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
