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

/**
 * A callout box.
 *
 * `level` is the heading level of the callout's title, and it defaults to 3
 * rather than 4 on purpose. A callout is normally a sibling of the section's
 * other subheads — renderBlock({h}) emits <h3> — and most callouts sit directly
 * under the section <h2> with no <h3> between, so a fixed <h4> made seven
 * sections read h2 → h4 and claim a tier of structure that is not there. Pass
 * `level: 4` for a callout nested INSIDE an h3 card, which is the only place the
 * deeper level is truthful. (Skipped heading levels are advisory — technique
 * G141 under 1.3.1 — not a hard failure, but they misstate the outline and are
 * the first thing an auditor flags.)
 */
export function callout({ kind = 'note', title, body, blocks, level = 3 }) {
  const h = `h${Math.min(6, Math.max(2, Number(level) || 3))}`;
  return el('aside', { class: `callout callout-${kind}`, attrs: { role: 'note' } },
    div({ class: 'callout-icon', 'aria-hidden': 'true', text: KIND_ICON[kind] ?? '❯' }),
    div({ class: 'callout-body' },
      title ? el(h, { class: 'callout-title', text: title }) : null,
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

/** Section header (title + optional lede + learning outcomes) from a COPY entry. */
export function sectionHeader(copy, extra) {
  return el('header', { class: 'section-header' },
    copy.eyebrow ? el('p', { class: 'eyebrow', text: copy.eyebrow }) : null,
    el('h2', { class: 'section-title', text: copy.title }),
    copy.subtitle ? el('p', { class: 'section-subtitle', text: copy.subtitle }) : null,
    copy.lede ? para(copy.lede, 'section-lede') : null,
    copy.outcomes ? outcomesBlock(copy.outcomes) : null,
    extra || null);
}

/** A compact "By the end you can…" list of learning outcomes. */
export function outcomesBlock(outcomes) {
  return el('div', { class: 'outcomes', attrs: { role: 'note', 'aria-label': 'Learning outcomes' } },
    el('span', { class: 'outcomes-title', text: 'By the end you can' }),
    el('ul', { class: 'outcomes-list' }, ...outcomes.map((o) => el('li', {}, ...inline(o)))));
}

/**
 * The bit ribbon: a row of 0/1 cells. Colour is paired with the glyph so the
 * value never depends on colour alone. Optionally compares against a decoded
 * sequence, marking mismatches.
 *
 * role="img" makes the whole subtree presentational, so the aria-label is the
 * ENTIRE alternative — the per-cell digits and the `bit-error` marking are not
 * in the accessibility tree at all. A bare "recovered bits" therefore threw away
 * exactly the thing the widget exists to show (1.1.1: an alternative that does
 * not serve the equivalent purpose). The label is now composed from the data:
 * the sequence itself, grouped in bytes, plus the mismatch count and the
 * positions that differ, which no other node on the page carries.
 *
 * @param {number[]} bits
 * @param {{ decoded?:number[], max?:number, compact?:boolean, ariaLabel?:string }} [opts]
 */
export function bitRibbon(bits, opts = {}) {
  const max = opts.max ?? 128;
  const shown = bits.slice(0, max);
  const glyphs = [];
  const errorPositions = [];
  let missingCount = 0;
  const cells = shown.map((bit, i) => {
    const decodedBit = opts.decoded ? opts.decoded[i] : undefined;
    const missing = decodedBit !== undefined && decodedBit < 0;
    const isError = decodedBit !== undefined && decodedBit !== bit;
    if (missing) missingCount += 1;
    if (isError) errorPositions.push(i);
    const value = decodedBit !== undefined ? decodedBit : bit;
    const glyph = missing ? '·' : String(value);
    glyphs.push(glyph);
    const cls = missing ? 'bit-cell bit-missing bit-error' : `bit-cell bit-${value}${isError ? ' bit-error' : ''}`;
    return span({
      class: cls,
      attrs: { 'data-bit': glyph, title: missing ? `bit ${i}: not recovered (expected ${bit})` : (isError ? `bit ${i}: expected ${bit}, got ${decodedBit}` : `bit ${i}: ${value}`) },
    }, glyph);
  });
  return div({
    class: `bit-ribbon${opts.compact ? ' compact' : ''}`,
    attrs: {
      role: 'img',
      'aria-label': ribbonLabel({
        name: opts.ariaLabel ?? `${bits.length} bits`,
        glyphs,
        total: bits.length,
        isComparison: !!opts.decoded,
        errorPositions,
        missingCount,
      }),
    },
  },
    ...cells,
    bits.length > max ? span({ class: 'bit-more', text: `+${bits.length - max}` }) : null);
}

/** Group the glyphs in bytes so a reader hears "01001000 01000101", not 64 digits. */
function chunkBits(glyphs) {
  const groups = [];
  for (let i = 0; i < glyphs.length; i += 8) groups.push(glyphs.slice(i, i + 8).join(''));
  return groups.join(' ');
}

const MAX_SPOKEN_POSITIONS = 12;

function ribbonLabel({ name, glyphs, total, isComparison, errorPositions, missingCount }) {
  if (!glyphs.length) return `${name}: none`;
  const parts = [`${name}: ${chunkBits(glyphs)}`];
  if (total > glyphs.length) parts.push(`first ${glyphs.length} of ${total} shown`);
  if (isComparison) {
    parts.push(errorPositions.length === 0
      ? 'matches the intended bits exactly'
      : `${errorPositions.length} of ${glyphs.length} differ from the intended bits`);
    if (missingCount) parts.push(`${missingCount} never recovered`);
    if (errorPositions.length) {
      const listed = errorPositions.slice(0, MAX_SPOKEN_POSITIONS).join(', ');
      parts.push(`at bit ${listed}${errorPositions.length > MAX_SPOKEN_POSITIONS ? ' and more' : ''}`);
    }
  }
  return `${parts.join('; ')}.`;
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
