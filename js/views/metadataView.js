/**
 * views/metadataView.js — the "records as an unintended channel" exhibit.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, calloutChip, callout } from './blocks.js';
import { panel, controlGroup, toggle, button, segmented } from './controls.js';
import { recoveredBox, modeBanner, statTiles } from './widgets.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateRecordsRun } from '../channels/metadata.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, VIEW_MODES } from '../state.js';

export function renderMetadataView(state) {
  const copy = COPY.metadata;
  let reveal = state.viewMode === VIEW_MODES.SENDER;
  let cur = state;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const bodyArea = div({});
  const seg = segmented({
    name: 'meta-reveal', label: 'View', size: 'sm', value: reveal ? 'reveal' : 'normal',
    options: [{ value: 'normal', label: 'Normal log' }, { value: 'reveal', label: 'Reveal routing bits' }],
    onChange: (v) => { reveal = v === 'reveal'; renderInner(); },
  });
  center.appendChild(el('div', { class: 'card' },
    div({ class: 'timing-topbar' },
      el('h3', { class: 'card-title', text: 'Item transfer log' }), seg),
    bodyArea));

  const node = el('section', { class: 'section', id: 'sec-metadata' },
    sectionHeader({ ...copy, eyebrow: 'Inference' }),
    modeBanner(state.viewMode),
    div({ class: 'prose-wide', style: { marginBottom: 'var(--sp-4)' } }, renderBlocks(copy.blocks)),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function renderInner() {
    const run = simulateRecordsRun(cur.message, { minimize: cur.channels.metadata.minimize, seed: `${cur.seed}:metadata` });
    if (run.minimize) {
      replace(bodyArea,
        para('Data minimisation is on: only daily aggregates are retained. The per-record routing is gone.', 'subtle'),
        aggregateTable(run.aggregates));
    } else {
      replace(bodyArea,
        para(reveal ? 'The routing column (highlighted) is the hidden channel — Central = 0, Riverside = 1.' : 'An ordinary-looking transfer log. Nothing here announces itself as a message.', 'subtle'),
        recordTable(run.records, reveal));
    }
    replace(right, rightContent(cur, run));
  }
  function refresh(s) { cur = s; renderInner(); }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.metadata;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Records controls' }),
      controlGroup(null,
        toggle({ label: 'Data minimisation (daily aggregates only)', checked: p.minimize,
          help: 'Retain only what the task needs — the per-record channel disappears.',
          onChange: (v) => setChannelParam('metadata', 'minimize', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => setChannelParam('metadata', 'minimize', false) }))),
    calloutChip(CALLOUTS.metadata));
}

function recordTable(records, reveal) {
  const shown = records.slice(0, 40);
  const head = el('tr', {}, ...['#', 'Day', 'Item class', 'Routed to', ...(reveal ? ['Bit', 'Char'] : [])].map((h) => el('th', { class: reveal && h === 'Routed to' ? 'covert-col' : '', text: h })));
  const rows = shown.map((r, i) => {
    const complete = (i + 1) % 8 === 0;
    let ch = '';
    if (reveal && complete) {
      const bits = shown.slice(i - 7, i + 1).map((x) => (x.branch === 'Riverside' ? 1 : 0));
      ch = bitsToChar(bits);
    }
    return el('tr', {},
      el('td', { class: 'mono', text: String(r.index) }),
      el('td', { class: 'mono', text: String(r.day) }),
      el('td', { text: r.itemClass }),
      el('td', { class: `mono${reveal ? ' covert-col' : ''}`, text: r.branch }),
      reveal ? el('td', {}, span({ class: `bit-cell bit-${r.bit}`, text: String(r.bit) })) : null,
      reveal ? el('td', { class: 'mono', text: ch }) : null);
  });
  return div({ class: 'table-wrap', style: { maxHeight: '340px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Item transfer log' } },
    el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows)));
}

function aggregateTable(aggregates) {
  const head = el('tr', {}, ...['Day', 'Transfers', 'Central', 'Riverside'].map((h) => el('th', { text: h })));
  const rows = aggregates.slice(0, 40).map((a) => el('tr', {},
    el('td', { class: 'mono', text: String(a.day) }),
    el('td', { class: 'mono', text: String(a.total) }),
    el('td', { class: 'mono', text: String(a.central) }),
    el('td', { class: 'mono', text: String(a.riverside) })));
  return div({ class: 'table-wrap', style: { maxHeight: '340px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Daily aggregate transfer counts' } },
    el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows)));
}

function rightContent(state, run) {
  if (run.minimize) {
    return el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver' }),
      recoveredBox(null, { ok: false }),
      para('With only daily totals retained, the routing pattern — and the message — cannot be reconstructed. Minimisation is the defence.', 'subtle'));
  }
  const analyst = state.viewMode === VIEW_MODES.DEFENDER;
  const ok = run.decoded.text === run.message;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: analyst ? 'Privacy analyst' : 'Receiver' }),
      recoveredBox(run.decoded.text, { ok }),
      statTiles([
        { val: `${round(run.branchBalance * 100, 0)}%`, lab: 'routed to Riverside' },
        { val: String(run.records.length), lab: 'records' },
      ]),
      para(analyst
        ? 'An encoded log routes ~50/50; ordinary operations lean on one hub (~65/35). A near-even split is itself a tell — no key required.'
        : 'The routing pattern reconstructs the message exactly — the log was a channel all along.', 'subtle')),
    callout({ kind: 'warn', title: 'For real library records', body: 'Patron reading is sensitive. Collect the minimum, retain it briefly, and resist building dossiers from circulation, holds, and ILL. This exhibit is an awareness tool, not a technique to deploy.' }));
}

function bitsToChar(bits) {
  const v = parseInt(bits.join(''), 2);
  const c = String.fromCharCode(v);
  return (v >= 32 && v < 127) ? c : '·';
}
