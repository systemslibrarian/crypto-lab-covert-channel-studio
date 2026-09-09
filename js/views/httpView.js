/**
 * views/httpView.js — the HTTP header-order channel module.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, calloutChip, inline } from './blocks.js';
import { panel, controlGroup, slider, toggle, button } from './controls.js';
import {
  metricList, anomalyPanel, recoveredBox, modeBanner, statTiles,
  statusRegion, anomalyPhrase, recoveredPhrase, errorPhrase,
} from './widgets.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateHttpRun, REORDERABLE } from '../channels/http.js';
import { analyzeHttp } from '../detectors/httpDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderHttpView(state) {
  const copy = COPY.http;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  // One status region, built here and never replace()d — see statusRegion().
  const status = statusRegion();

  const node = el('section', { class: 'section', id: 'sec-http' },
    status.node,
    sectionHeader({ ...copy, eyebrow: 'Protocol structure' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulateHttpRun(s.message, { ...s.channels.http, seed: `${s.seed}:http` });
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
    status.announce(s.viewMode === VIEW_MODES.DEFENDER
      ? `${anomalyPhrase(analyzeHttp(run.normalize ? run.processedRequests : run.covertRequests))}.`
      : `${recoveredPhrase(run.decoded.text)}, ${errorPhrase(run.bitErrors)}`
        + `${run.normalize ? ', headers normalised by the proxy' : ''}.`);
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.http;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Channel controls' }),
      controlGroup(null,
        slider({ label: 'Normal cover requests', min: 0, max: 60, value: p.coverCount, unit: 'req',
          onInput: (v) => setChannelParam('http', 'coverCount', v) }),
        toggle({ label: 'Normalizing proxy (re-sorts headers)', checked: p.normalize,
          help: 'A CDN/proxy that canonicalises header order — destroys the channel.',
          onChange: (v) => setChannelParam('http', 'normalize', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('http') }))),
    calloutChip(CALLOUTS.http),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Reorderable headers' }),
      div({ class: 'header-chips' }, ...REORDERABLE.map((h) => span({ class: 'query-chip mono', text: h })))));
}

function centerContent(state, run) {
  const reqs = run.processedRequests.slice(0, 6);
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title' }, span({ text: 'Simulated requests ' }), span({ class: 'sim-note', text: '' })),
      para(run.normalize
        ? 'The normalizing proxy has re-sorted every request into the same canonical order.'
        : 'Fixed headers stay put; the reorderable headers (highlighted) carry the payload in their arrangement.', 'subtle'),
      div({ class: 'http-reqs' }, ...reqs.map((r) => requestCard(r)))),
    tradeoffInstrument('http', state.message, { ...state.channels.http, seed: `${state.seed}:http` }));
}

function requestCard(req) {
  return div({ class: 'http-req' },
    div({ class: 'http-req-line mono' }, `${req.method} ${req.path}`),
    div({ class: 'http-headers' },
      ...req.headers.map((h) => div({ class: `http-header${REORDERABLE.includes(h.name) ? ' reorderable' : ''}` },
        span({ class: 'hh-name mono', text: h.name }),
        span({ class: 'hh-val mono', text: h.value.length > 24 ? h.value.slice(0, 22) + '…' : h.value })))));
}

function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const ok = run.bitErrors === 0 && run.decoded.text === run.message;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver reads the header order' }),
      recoveredBox(run.decoded.text, { ok }),
      statTiles([
        { val: String(run.meta.bitsPerRequest), lab: 'bits/request' },
        { val: String(run.covertRequests.length), lab: 'requests' },
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
      ]),
      run.normalize ? para('The proxy normalised the headers, so the receiver reads only zeros — the channel is gone.', 'subtle') : null));
}

function defenderPanel(run) {
  const observed = run.normalize ? run.processedRequests : run.covertRequests;
  const det = analyzeHttp(observed);
  const m = det.metrics;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Header-order fingerprint' }),
      metricList([
        { name: 'Distinct orderings', value: `${m.distinctOrders} / ${m.requestCount}`, hi: m.uniqueOrderRatio > 0.6 },
        { name: 'Order entropy', value: `${round(m.normOrderEntropy, 2)} / 1.0`, hi: m.normOrderEntropy > 0.3 },
        { name: 'Dominant order share', value: `${Math.round(m.modalFraction * 100)}%` },
      ]),
      para('A real client fingerprints as one dominant header order; this flow barely repeats an ordering.', 'subtle')));
}
