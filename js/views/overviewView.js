/**
 * views/overviewView.js — the Overview section.
 * Shows the sender → carrier → receiver idea, the text→bytes→bits pipeline, and
 * a preview of how the SAME bits become five different covert representations.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, messagePipeline, bitRibbon, flowArrow, para } from './blocks.js';
import { COPY } from '../content/copy.js';
import { buildMessagePipeline } from '../simulation.js';
import { encodeMessageToQueries } from '../channels/dns.js';

export function renderOverview(state) {
  const copy = COPY.overview;
  const dynamic = div({ class: 'ov-dynamic' });

  const node = el('section', { class: 'section', id: 'sec-overview' },
    sectionHeader({ ...copy, eyebrow: 'Overview' }),
    senderReceiverDiagram(),
    dynamic,
    div({ class: 'prose-wide' }, renderBlocks(copy.blocks)));

  function refresh(s) { replace(dynamic, buildDynamic(s)); }
  refresh(state);
  return { node, refresh };
}

function senderReceiverDiagram() {
  return div({ class: 'card' },
    div({ class: 'sr-diagram' },
      srNode('SENDER', 'Encodes the message into the carrier’s observable behaviour'),
      div({ class: 'sr-link' },
        div({ class: 'sr-track' }, span({ class: 'signal-dot sr-dot', 'aria-hidden': 'true' })),
        span({ class: 'sr-link-label', text: 'cover traffic / protocol' })),
      srNode('RECEIVER', 'Knows the rule and reconstructs the hidden bits')),
    para('An ordinary channel puts information in an intended message field. A covert channel instead uses some other observable property of the same traffic.', 'subtle'));
}

function srNode(title, desc) {
  return div({ class: 'sr-node' },
    div({ class: 'sr-node-title', text: title }),
    div({ class: 'sr-node-desc', text: desc }));
}

function buildDynamic(state) {
  const pipeline = buildMessagePipeline(state.message);
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'From text to bits' }),
      messagePipeline(pipeline, { full: true }),
      flowArrow(),
      el('h3', { class: 'card-title', text: 'The same bits, five carriers' }),
      representations(pipeline)));
}

/** Preview how the first byte's bits look in each channel. */
function representations(pipeline) {
  const bits8 = pipeline.bits.slice(0, 8);
  const label = pipeline.byteCount
    ? encodeMessageToQueries(pipeline.text || '', { labelLength: 24 }).labels[0] || '—'
    : '—';

  const rows = [
    repRow('Storage', 'IP TTL toggles 64/65', ttlRep(bits8)),
    repRow('Timing', 'short vs long gap', timingRep(bits8)),
    repRow('Ordering', 'A→B or B→A', orderingRep(bits8)),
    repRow('Protocol (DNS)', 'base32 label under example.test', el('span', { class: 'mono rep-dns' }, `${label}.example.test`)),
    repRow('Steganography', 'flip pixel LSBs', el('span', { class: 'subtle', text: 'the carrier image is unchanged to the eye — see the module' })),
  ];
  return div({ class: 'rep-list' },
    div({ class: 'rep-bits' }, span({ class: 'subtle', text: `first byte “${firstChar(pipeline)}” = ` }), bitRibbon(bits8, { compact: true })),
    ...rows);
}

function firstChar(pipeline) { return pipeline.text ? [...pipeline.text][0] ?? '∅' : '∅'; }

function repRow(name, rule, content) {
  return div({ class: 'rep-row' },
    div({ class: 'rep-head' }, span({ class: 'rep-name', text: name }), span({ class: 'rep-rule', text: rule })),
    div({ class: 'rep-content' }, content));
}

function ttlRep(bits) {
  return div({ class: 'rep-inline' }, ...bits.map((b) =>
    span({ class: `rep-cell ttl b${b}`, text: String(64 + b), attrs: { title: `bit ${b} → TTL ${64 + b}` } })));
}
function timingRep(bits) {
  return div({ class: 'rep-inline' }, ...bits.map((b) =>
    span({ class: `rep-cell gap b${b}`, attrs: { title: `bit ${b} → ${b ? 'long' : 'short'} gap` } },
      span({ class: 'gap-bar', style: { width: b ? '26px' : '10px' } }))));
}
function orderingRep(bits) {
  return div({ class: 'rep-inline' }, ...bits.map((b) =>
    span({ class: `rep-cell ord b${b}`, text: b ? 'B·A' : 'A·B', attrs: { title: `bit ${b} → ${b ? 'B before A' : 'A before B'}` } })));
}
