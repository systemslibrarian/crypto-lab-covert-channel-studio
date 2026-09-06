/**
 * views/blocks.js — renders the structured prose from content/copy.js and a few
 * shared visual components (message pipeline, bit ribbon, callouts).
 *
 * Inline emphasis is parsed here without innerHTML: **bold** becomes <strong>
 * and `code` becomes <code>, everything else is a text node.
 */

import { el, div, span, svg } from './dom.js';

/** Parse a limited inline markup string into an array of safe nodes. */
export function inline(str) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  const s = String(str);
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) nodes.push(document.createTextNode(s.slice(last, m.index)));
    if (m[2] != null) nodes.push(el('strong', { text: m[2] }));
    else if (m[3] != null) nodes.push(el('code', { text: m[3] }));
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(document.createTextNode(s.slice(last)));
  return nodes;
}

/** Paragraph with inline markup. */
export function para(str, cls) {
  return el('p', cls ? { class: cls } : {}, ...inline(str));
}

const KIND_ICON = { key: '◆', note: '❯', warn: '▲', tip: '✦' };

/** A callout box. */
export function callout({ kind = 'note', title, body, blocks }) {
  return el('aside', { class: `callout callout-${kind}`, attrs: { role: 'note' } },
    div({ class: 'callout-icon', 'aria-hidden': 'true', text: KIND_ICON[kind] ?? '❯' }),
    div({ class: 'callout-body' },
      title ? el('h4', { class: 'callout-title', text: title }) : null,
      body ? para(body) : null,
      blocks ? renderBlocks(blocks) : null));
}

/** A compact inline learning chip (title + body). */
export function calloutChip({ title, body }) {
  return div({ class: 'callout-chip' },
    el('span', { class: 'chip-title', text: title }),
    el('span', { class: 'chip-body' }, ...inline(body)));
}

/** Render one block object to a node. */
export function renderBlock(b) {
  if (b == null) return null;
  if (typeof b === 'string') return para(b);
  if (b.lead) return para(b.lead, 'lead');
  if (b.h) return el('h3', { class: 'block-h', text: b.h });
  if (b.note) return el('p', { class: 'block-note' }, ...inline(b.note));
  if (b.code) return el('pre', { class: 'block-code' }, el('code', { text: b.code }));
  if (b.ul) return el('ul', { class: 'block-list' }, ...b.ul.map((li) => el('li', {}, ...inline(li))));
  if (b.ol) return el('ol', { class: 'block-list' }, ...b.ol.map((li) => el('li', {}, ...inline(li))));
  if (b.kv) {
    return el('dl', { class: 'kv-list' },
      ...b.kv.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', {}, ...inline(v))]));
  }
  if (b.cards) {
    return div({ class: 'concept-cards' },
      ...b.cards.map((c) => div({ class: 'concept-card' },
        el('span', { class: 'concept-tag', text: c.tag }),
        el('p', {}, ...inline(c.text)))));
  }
  if (b.callout) return callout(b.callout);
  return null;
}

/** Render an array of blocks to a document fragment. */
export function renderBlocks(blocks) {
  const frag = document.createDocumentFragment();
  for (const b of blocks || []) {
    const node = renderBlock(b);
    if (node) frag.appendChild(node);
  }
  return frag;
}

/** Section header (title + optional lede) from a COPY entry. */
export function sectionHeader(copy, extra) {
  return el('header', { class: 'section-header' },
    copy.eyebrow ? el('p', { class: 'eyebrow', text: copy.eyebrow }) : null,
    el('h2', { class: 'section-title', text: copy.title }),
    copy.subtitle ? el('p', { class: 'section-subtitle', text: copy.subtitle }) : null,
    copy.lede ? para(copy.lede, 'section-lede') : null,
    extra || null);
}

/**
 * The bit ribbon: a row of 0/1 cells. Colour is paired with the glyph so the
 * value never depends on colour alone. Optionally compares against a decoded
 * sequence, marking mismatches.
 * @param {number[]} bits
 * @param {{ decoded?:number[], max?:number, compact?:boolean, ariaLabel?:string }} [opts]
 */
export function bitRibbon(bits, opts = {}) {
  const max = opts.max ?? 128;
  const shown = bits.slice(0, max);
  const cells = shown.map((bit, i) => {
    const decodedBit = opts.decoded ? opts.decoded[i] : undefined;
    const missing = decodedBit !== undefined && decodedBit < 0;
    const isError = decodedBit !== undefined && decodedBit !== bit;
    const value = decodedBit !== undefined ? decodedBit : bit;
    const glyph = missing ? '·' : String(value);
    const cls = missing ? 'bit-cell bit-missing bit-error' : `bit-cell bit-${value}${isError ? ' bit-error' : ''}`;
    return span({
      class: cls,
      attrs: { 'data-bit': glyph, title: missing ? `bit ${i}: not recovered (expected ${bit})` : (isError ? `bit ${i}: expected ${bit}, got ${decodedBit}` : `bit ${i}: ${value}`) },
    }, glyph);
  });
  return div({
    class: `bit-ribbon${opts.compact ? ' compact' : ''}`,
    attrs: { role: 'img', 'aria-label': opts.ariaLabel ?? `${bits.length} bits` },
  },
    ...cells,
    bits.length > max ? span({ class: 'bit-more', text: `+${bits.length - max}` }) : null);
}

/**
 * The message pipeline strip: Text → UTF-8 bytes → Bits. Shared header across
 * the network-channel views and the centrepiece of the Overview.
 * @param {Object} pipeline  from simulation.buildMessagePipeline
 * @param {{ full?:boolean }} [opts]
 */
export function messagePipeline(pipeline, opts = {}) {
  const stages = [
    stage('Text', el('span', { class: 'pipe-text mono', text: pipeline.text || '∅' }),
      `${pipeline.charCount} char${pipeline.charCount === 1 ? '' : 's'}`),
    stage('UTF-8 bytes',
      div({ class: 'byte-row' }, ...pipeline.byteHex.map((h, i) =>
        span({ class: 'byte-chip mono', attrs: { title: `byte ${i} = 0x${h} = ${pipeline.byteDecimal[i]}` }, text: h }))),
      `${pipeline.byteCount} byte${pipeline.byteCount === 1 ? '' : 's'}`),
    stage('Bits', bitRibbon(pipeline.bits, { max: 64 }),
      `${pipeline.bitCount} bits`),
  ];
  return div({ class: `pipeline${opts.full ? ' full' : ''}` }, ...stages);
}

function stage(label, content, meta) {
  return div({ class: 'pipe-stage' },
    div({ class: 'pipe-label' }, el('span', { text: label }), meta ? span({ class: 'pipe-meta', text: meta }) : null),
    div({ class: 'pipe-content' }, content));
}

/** A vertical arrow connector used in transform flows. */
export function flowArrow() {
  return div({ class: 'flow-arrow', 'aria-hidden': 'true' }, '↓');
}
