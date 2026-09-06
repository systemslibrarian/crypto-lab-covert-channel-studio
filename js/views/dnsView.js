/**
 * views/dnsView.js — the DNS-as-a-carrier module.
 */

import { el, div, span, replace, formatClock } from './dom.js';
import { sectionHeader, renderBlocks, callout, calloutChip, para, inline } from './blocks.js';
import { panel, controlGroup, slider, toggle, button } from './controls.js';
import { verticalBars } from './charts.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateDnsRun } from '../channels/dns.js';
import { analyzeDns } from '../detectors/dnsDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderDnsView(state) {
  const copy = COPY.dns;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-dns' },
    sectionHeader({ ...copy, eyebrow: 'Protocol structure' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' },
      leftPanel(state),
      center,
      right));

  function refresh(s) {
    const run = simulateDnsRun(s.message, { ...s.channels.dns, seed: `${s.seed}:dns` });
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.dns;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Simulated channel controls' }),
      controlGroup(null,
        slider({ label: 'Label length (chars/query)', min: 2, max: 30, value: p.labelLength, unit: 'ch',
          help: 'Encoding density: more data per query, but longer, more conspicuous labels.',
          onInput: (v) => setChannelParam('dns', 'labelLength', v) }),
        slider({ label: 'Number of requests', min: 1, max: 80, value: p.requestCount,
          help: 'Length of the simulated tunnel burst (message + continued chatter).',
          onInput: (v) => setChannelParam('dns', 'requestCount', v) }),
        slider({ label: 'Normal cover traffic', min: 0, max: 80, value: p.coverCount, unit: 'q',
          onInput: (v) => setChannelParam('dns', 'coverCount', v) }),
        slider({ label: 'Request interval', min: 100, max: 3000, step: 50, value: p.intervalMs, unit: 'ms',
          help: 'A steady cadence looks like beaconing.',
          onInput: (v) => setChannelParam('dns', 'intervalMs', v) }),
        slider({ label: 'Timing jitter', min: 0, max: 1500, step: 25, value: p.jitterMs, unit: 'ms',
          onInput: (v) => setChannelParam('dns', 'jitterMs', v) }),
        slider({ label: 'Packet loss', min: 0, max: 0.6, step: 0.02, value: p.lossProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'Dropped queries leave gaps the decoder cannot fill.',
          onInput: (v) => setChannelParam('dns', 'lossProb', v) }),
        toggle({ label: 'Simulate resolver cache', checked: p.cache,
          help: 'Repeated names answer from cache; tunnels rarely repeat.',
          onChange: (v) => setChannelParam('dns', 'cache', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('dns') }))),
    calloutChip(CALLOUTS.dns));
}

function centerContent(state, run) {
  const sender = state.viewMode === VIEW_MODES.SENDER;
  return div({},
    sender ? encodeBreakdown(run) : null,
    el('div', { class: 'card' },
      el('h3', { class: 'card-title' }, span({ text: 'Simulated DNS query log ' }), span({ class: 'sim-note', text: '' })),
      dnsLog(run.mixed, { markCovert: sender }),
      run.params.lossProb > 0 ? para(`${countLost(run)} covert queries were lost in transit.`, 'subtle') : null),
    sender ? splitCompare(run) : null);
}

function encodeBreakdown(run) {
  return el('div', { class: 'card' },
    el('h3', { class: 'card-title', text: 'How the message becomes labels' }),
    div({ class: 'dns-encode' },
      encStep('Message', el('span', { class: 'mono', text: run.message || '∅' })),
      encStep('base32', el('span', { class: 'mono dns-b32', text: run.encoded || '∅' })),
      encStep('Query labels', div({ class: 'dns-labels' },
        ...run.covertQueries.filter((q) => q.isMessage !== false).slice(0, 12).map((q) =>
          span({ class: 'mono dns-label-chip', text: `${q.label}.example.test` }))))));
}

function encStep(label, content) {
  return div({ class: 'enc-step' },
    div({ class: 'enc-label', text: label }),
    div({ class: 'enc-content' }, content));
}

function dnsLog(queries, { markCovert }) {
  const rows = queries.slice(0, 80);
  const head = el('tr', {}, ...['Time', 'Client', 'Query', 'Type', 'Len', 'Entropy', 'Status']
    .map((h) => el('th', { text: h })));
  const body = rows.map((q) => {
    const entWord = q.entropy < 0.5 ? 'Low' : q.entropy < 0.75 ? 'Med' : 'High';
    const flagCovert = markCovert && q.covert;
    return el('tr', { class: flagCovert ? 'is-covert' : '' },
      el('td', { class: 'mono', text: formatClock(q.timeMs) }),
      el('td', { class: 'mono', text: q.client }),
      el('td', { class: 'mono', attrs: { title: q.fqdn } },
        flagCovert ? span({ class: 'pill pill-covert', text: 'covert' }) : null,
        flagCovert ? ' ' : null,
        truncName(q.fqdn)),
      el('td', { class: 'mono', text: q.type }),
      el('td', { class: 'mono', text: String(q.length) }),
      el('td', {}, entBar(q.entropy, entWord)),
      el('td', {}, statusPill(q.status)));
  });
  return div({ class: 'table-wrap', style: { maxHeight: '340px', overflowY: 'auto' },
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Simulated DNS query log' } },
    el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...body)));
}

function truncName(fqdn) {
  if (fqdn.length <= 30) return fqdn;
  return `${fqdn.slice(0, 27)}…`;
}
function entBar(v, word) {
  return div({ class: 'ent-bar' },
    div({ class: 'ent-track' }, div({ class: 'ent-fill', style: { width: `${Math.round(v * 100)}%` } })),
    span({ class: 'subtle', text: word }));
}
function statusPill(status) {
  const cls = status === 'LOST' ? 'pill-lost' : status === 'CACHED' ? 'pill-normal' : 'pill-ok';
  return span({ class: `pill ${cls}`, text: status });
}

function splitCompare(run) {
  const normal = run.coverQueries.slice(0, 8);
  const covert = run.covertQueries.slice(0, 8);
  return div({ class: 'split-2' },
    el('div', { class: 'card' },
      el('h4', { class: 'card-title', text: 'Normal-looking DNS' }),
      queryList(normal, 'normal'),
      charList(['short, human-readable labels', 'names repeat and cache', 'many parent domains', 'irregular human timing'])),
    el('div', { class: 'card' },
      el('h4', { class: 'card-title', text: 'Covert-style DNS' }),
      queryList(covert, 'covert'),
      charList(['long, high-entropy labels', 'almost never repeats', 'one parent domain', 'steady machine cadence'])));
}

function queryList(list, kind) {
  if (!list.length) return div({ class: 'empty-note', text: 'no queries — raise the relevant control' });
  return div({ class: 'query-list' }, ...list.map((q) =>
    span({ class: `query-chip mono ${kind === 'covert' ? 'q-covert' : ''}`, attrs: { title: q.fqdn }, text: truncName(q.fqdn) })));
}
function charList(items) {
  return el('ul', { class: 'char-list' }, ...items.map((t) => el('li', { text: t })));
}

function rightContent(state, run) {
  if (state.viewMode === VIEW_MODES.DEFENDER) return defenderPanel(run);
  return senderPanel(run);
}

function senderPanel(run) {
  const ok = run.decoded.complete && run.decoded.text === run.message;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver' }),
      recoveredBox(run.decoded.text, { ok }),
      run.decoded.complete ? null : para('Some labels were lost, so the message cannot be fully reconstructed.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Capacity ↔ observability' }),
      statTiles([
        { val: String(run.meta.bitsPerQuery), lab: 'bits / query' },
        { val: String(run.covertQueries.length), lab: 'covert queries' },
        { val: `${run.meta.totalBytes}B`, lab: 'payload' },
      ]),
      para('Push label length up for more bits per query — and watch the defender’s entropy and length indicators rise with it.', 'subtle')));
}

function defenderPanel(run) {
  const det = analyzeDns(run.mixed.filter((q) => q.forwarded !== false));
  const m = det.metrics;
  const charData = m.charDistribution.slice(0, 18).map((c) => ({ label: c.char, value: c.count, color: 'var(--covert)' }));
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'DNS defender metrics' }),
      metricList([
        { name: 'Unique subdomains', value: `${m.uniqueSubdomainCount} (${Math.round(m.uniqueSubRatio * 100)}%)`, hi: m.uniqueSubRatio > 0.85 },
        { name: 'Avg label length', value: `${round(m.avgLabelLength, 1)} ch`, hi: m.avgLabelLength > 14 },
        { name: 'Max label length', value: `${m.maxLabelLength} ch`, hi: m.maxLabelLength > 20 },
        { name: 'Avg label entropy', value: `${round(m.avgLabelEntropy, 2)} / 1.0`, hi: m.avgLabelEntropy > 0.72 },
        { name: 'Requests / min', value: `${round(m.requestsPerMinute, 0)}`, hi: m.requestsPerMinute > 90 },
        { name: 'Repeated-parent ratio', value: `${Math.round(m.repeatedParentRatio * 100)}%`, hi: m.repeatedParentRatio > 0.8 },
        { name: 'Inter-arrival CV', value: `${round(m.interArrivalCV, 2)}`, hi: m.interArrivalCV < 0.15 },
      ])),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Character distribution of labels' }),
      charData.length ? verticalBars(charData, { height: 130, ariaLabel: 'Character frequency across query labels', unit: 'uses' })
        : div({ class: 'empty-note', text: 'no labels to analyse' }),
      para('A near-uniform spread across many characters is what encoded or encrypted data looks like.', 'subtle')));
}

function countLost(run) { return run.mixed.filter((q) => q.status === 'LOST').length; }
