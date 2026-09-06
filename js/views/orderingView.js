/**
 * views/orderingView.js — the packet-ordering channel (short secondary module).
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, bitRibbon, calloutChip } from './blocks.js';
import { panel, controlGroup, slider, button } from './controls.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateOrderingRun } from '../channels/ordering.js';
import { analyzeOrdering } from '../detectors/orderingDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderOrderingView(state) {
  const copy = COPY.ordering;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-ordering' },
    sectionHeader({ ...copy, eyebrow: 'Ordering' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulateOrderingRun(s.message, { reorderProb: s.channels.ordering.reorderProb, seed: `${s.seed}:ordering` });
    replace(center, centerContent(run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.ordering;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Ordering controls' }),
      controlGroup(null,
        slider({ label: 'Network reordering', min: 0, max: 0.6, step: 0.02, value: p.reorderProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'Probability the network swaps a pair — each swap flips a bit.',
          onInput: (v) => setChannelParam('ordering', 'reorderProb', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('ordering') }))),
    calloutChip(CALLOUTS.ordering),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Rule' }),
      div({ class: 'block-code mono' }, 'A then B → 0\nB then A → 1')));
}

function centerContent(run) {
  const pairs = run.pairs.slice(0, 32);
  return el('div', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Ordered event pairs' }),
    div({ class: 'ord-stream' }, ...pairs.map((pair) => orderPair(pair))),
    para('Each unit is the same two events; only their order carries the bit. Swaps from reordering are marked.', 'subtle'));
}

function orderPair(pair) {
  const events = pair.events;
  const d = decoded(pair);           // the bit the receiver actually reads
  const flipped = d !== pair.bit;    // reordering changed the intended bit
  return div({ class: `ord-pair${pair.reordered ? ' reordered' : ''}`, attrs: { title: pair.reordered ? 'reordered by the network' : `bit ${pair.bit}` } },
    pair.reordered ? span({ class: 'ord-flip', 'aria-hidden': 'true', text: '⇄' }) : null,
    pair.reordered ? span({ class: 'visually-hidden', text: 'reordered by the network' }) : null,
    div({ class: 'ord-events' },
      ...events.map((e) => span({ class: `ord-ev ev-${e.tag.toLowerCase()}`, text: e.tag }))),
    span({ class: `ord-bit b${d}${flipped ? ' err' : ''}`, text: String(d) }));
}
function decoded(pair) {
  const sorted = pair.events.slice().sort((a, b) => a.t - b.t);
  return sorted[0].tag === 'A' ? 0 : 1;
}

function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const success = run.bitErrors === 0;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Sent vs recovered' }),
      el('p', { class: 'subtle', text: 'Intended' }),
      bitRibbon(run.bits, { max: 64 }),
      el('p', { class: 'subtle', text: 'Recovered' }),
      bitRibbon(run.bits, { decoded: run.decodedBits, max: 64 })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver' }),
      recoveredBox(run.recoveredText, { ok: success }),
      statTiles([
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
        { val: `${Math.round(run.reorderProb * 100)}%`, lab: 'reordering', tone: run.reorderProb ? 'bad' : undefined },
      ]),
      run.reorderProb > 0 ? para('Reliability collapses as reordering rises — the channel has no redundancy to recover order.', 'subtle') : null));
}

function defenderPanel(run) {
  const det = analyzeOrdering(run.pairs);
  const m = det.metrics;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Pair-frequency structure' }),
      metricList([
        { name: 'A-first pairs', value: String(m.aFirst) },
        { name: 'B-first pairs', value: String(m.bFirst) },
        { name: 'Balance', value: `${round(m.balance, 2)}` },
        { name: 'Longest run', value: String(m.longestRun) },
        { name: 'All tight pairs', value: m.wellFormedPairs ? 'yes' : 'no' },
      ]),
      para('An ordering channel barely disturbs frequency counts — it is caught by structure and context, not by a histogram.', 'subtle')));
}
