/**
 * views/hoppingView.js — the protocol-hopping channel module.
 *
 * The defender panel is the reason this module exists: it shows the SAME
 * traffic twice, once aggregated over the host and once grouped by peer, so the
 * gap between "nothing to see" and "obviously machine-driven" is a thing you
 * look at rather than a claim you are asked to believe.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, calloutChip, bitRibbon } from './blocks.js';
import { panel, controlGroup, slider, toggle, button } from './controls.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import {
  simulateHoppingRun, PROTOCOLS, PROTOCOL_KEYS, BITS_PER_HOP, RENDEZVOUS_DEST,
} from '../channels/hopping.js';
import { analyzeHopping } from '../detectors/hoppingDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, setHoppingBlocked, resetChannel, VIEW_MODES } from '../state.js';

const LABEL = Object.fromEntries(PROTOCOLS.map((p) => [p.key, p.label]));

export function renderHoppingView(state) {
  const copy = COPY.hopping;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-hopping' },
    sectionHeader({ ...copy, eyebrow: 'Protocol structure' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulateHoppingRun(s.message, runParams(s));
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function runParams(s) {
  return { ...s.channels.hopping, seed: `${s.seed}:hopping` };
}

/* ---- controls -------------------------------------------------------------- */
function leftPanel(state) {
  const p = state.channels.hopping;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Channel controls' }),
      controlGroup(null,
        slider({
          label: 'Ordinary host traffic', min: 0, max: 120, value: p.coverCount, unit: 'flows',
          help: 'Cover flows to other peers. Watch the whole-host view go quiet while the channel keeps running.',
          onInput: (v) => setChannelParam('hopping', 'coverCount', v),
        }),
        slider({
          label: 'Flow loss', min: 0, max: 0.5, step: 0.01, value: p.lossProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'One dropped flow shifts every symbol after it — there is no framing to resynchronise the bits.',
          onInput: (v) => setChannelParam('hopping', 'lossProb', v),
        }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('hopping') }))),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Egress allow-list' }),
      para('Block a protocol and its flows never arrive. Blocking any one of the five breaks the walk.', 'subtle'),
      controlGroup(null, ...PROTOCOLS.map((proto) => toggle({
        label: `Block ${proto.label}`,
        checked: state.channels.hopping.blocked.includes(proto.key),
        onChange: (v) => setHoppingBlocked(proto.key, v),
      })))),
    calloutChip(CALLOUTS.hopping),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'The grammar' }),
      div({ class: 'block-code mono' },
        `${PROTOCOL_KEYS.map((k, i) => `${i} ${LABEL[k]}`).join('\n')}\n\nto = (from + 1 + symbol) mod ${PROTOCOL_KEYS.length}\n${BITS_PER_HOP} bits per hop`)));
}

/* ---- centre: the flow stream ----------------------------------------------- */
function centerContent(state, run) {
  const shown = run.mixed.slice(0, 60);
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title' },
        span({ text: 'Observed flows ' }), span({ class: 'sim-note', text: '' })),
      para(`Every flow is an ordinary flow. The channel is the sequence of protocols going to ${RENDEZVOUS_DEST}; everything else is the host doing its job.`, 'subtle'),
      div({
        class: 'table-wrap hop-stream-wrap',
        style: { maxHeight: '300px', overflowY: 'auto' },
        attrs: { tabindex: '0', role: 'region', 'aria-label': 'Observed protocol flows in arrival order, marked by destination and carried bits' },
      }, div({ class: 'hop-stream' }, ...shown.map(flowChip))),
      run.mixed.length > shown.length
        ? para(`Showing the first ${shown.length} of ${run.mixed.length} flows.`, 'subtle')
        : null),
    tradeoffInstrument('hopping', state.message, runParams(state)));
}

function flowChip(flow) {
  const covert = flow.covert === true;
  const bits = covert && flow.bits && flow.bits.length ? flow.bits.join('') : null;
  const title = covert
    ? (flow.sync ? `rendezvous flow — establishes the state, carries no bits` : `${LABEL[flow.from]} → ${LABEL[flow.protocol]} = symbol ${flow.symbol} (${bits})`)
    : `ordinary ${LABEL[flow.protocol]} to ${flow.dest}`;
  return div({ class: `hop-flow${covert ? ' covert' : ''}${flow.sync ? ' sync' : ''}`, attrs: { title } },
    span({ class: 'hop-proto mono', text: LABEL[flow.protocol] }),
    span({ class: 'hop-dest mono', text: flow.dest }),
    bits ? span({ class: 'hop-bits mono', text: bits }) : span({ class: 'hop-bits empty mono', text: flow.sync ? 'sync' : '·' }));
}

/* ---- right panel ----------------------------------------------------------- */
function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const ok = run.bitErrors === 0;
  const impaired = run.droppedCount > 0 || run.blockedCount > 0;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Sent vs recovered' }),
      el('p', { class: 'subtle', text: 'Intended' }),
      // Two bits per hop, so the ribbon reads in pairs against the flow stream.
      bitRibbon(run.bits, { max: 64 }),
      el('p', { class: 'subtle', text: 'Recovered' }),
      bitRibbon(run.bits, { decoded: run.decodedBits, max: 64 })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver walks the same state machine' }),
      recoveredBox(run.recoveredText, { ok }),
      statTiles([
        { val: String(run.meta.bitsPerHop), lab: 'bits/hop' },
        { val: String(run.meta.hops), lab: 'hops' },
        { val: String(run.droppedCount + run.blockedCount), lab: 'flows lost', tone: impaired ? 'bad' : undefined },
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
      ]),
      impaired
        ? para('The state machine resynchronised — but the bit positions did not. Every symbol after the missing flow landed one place early, which is why a small loss rate destroys the whole tail of the message.', 'subtle')
        : para('With every flow delivered the walk is exact: each transition decodes to one symbol and the message reassembles.', 'subtle')));
}

function defenderPanel(run) {
  const det = analyzeHopping(run.mixed);
  const m = det.metrics;
  const pivot = m.pivot;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Whole host vs one peer' }),
      metricList([
        { name: 'Self-transitions (all peers)', value: `${Math.round(m.global.selfRatio * 100)}%` },
        {
          name: pivot ? `Self-transitions (${pivot.dest})` : 'Self-transitions (per peer)',
          value: pivot ? `${Math.round(pivot.selfRatio * 100)}%` : 'n/a',
          hi: !!pivot && pivot.selfRatio < 0.1,
        },
        { name: 'Transition entropy (peer)', value: pivot ? `${Math.round(pivot.normEntropy * 100)}% of ceiling` : 'n/a', hi: !!pivot && pivot.normEntropy > 0.8 },
        { name: 'Mean protocol run (peer)', value: pivot ? `${round(pivot.meanRunLength, 2)} flows` : 'n/a', hi: !!pivot && pivot.meanRunLength < 1.2 },
        { name: 'Peers observed', value: String(m.peerCount) },
      ]),
      para('Aggregated over the host the diagonal fills up with ordinary sticky traffic and the channel disappears. The per-peer split is the whole finding.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: pivot ? `Transition matrix — ${pivot.dest}` : 'Transition matrix' }),
      transitionMatrix(m),
      para('Rows are the protocol left, columns the protocol entered. A hopping grammar cannot use the shaded diagonal at all; ordinary traffic lives there.', 'subtle')));
}

/** The 5×5 transition matrix, with the forbidden diagonal called out. */
function transitionMatrix(m) {
  const grid = m.matrix;
  const max = Math.max(1, ...grid.flat());
  const head = el('tr', {},
    el('th', { scope: 'col', text: 'from \\ to' }),
    ...m.protocols.map((k) => el('th', { scope: 'col', text: LABEL[k] })));
  const rows = m.protocols.map((from, i) => el('tr', {},
    el('th', { scope: 'row', text: LABEL[from] }),
    ...m.protocols.map((to, j) => {
      const v = grid[i][j];
      const diag = i === j;
      return el('td', {
        class: `tm-cell${diag ? ' diag' : ''}${v > 0 ? ' used' : ''}`,
        // Intensity is decorative; the count is always present as text.
        style: v > 0 && !diag ? { '--tm-fill': String(0.15 + 0.85 * (v / max)) } : {},
        attrs: { title: `${LABEL[from]} → ${LABEL[to]}: ${v}${diag ? ' (forbidden by the grammar)' : ''}` },
      }, span({ class: 'mono', text: String(v) }));
    })));
  return div({
    class: 'table-wrap',
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Protocol transition matrix: counts of each from-protocol to to-protocol hop' },
  }, el('table', { class: 'data-table transition-matrix' },
    el('thead', {}, head),
    el('tbody', {}, ...rows)));
}
