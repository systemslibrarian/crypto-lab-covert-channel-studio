/**
 * views/cacheView.js — the shared-cache (Flush+Reload) channel module.
 * The concrete instance of the abstraction taught in the Shared-Resource Matrix.
 * The cache itself is MODELLED.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, bitRibbon, calloutChip } from './blocks.js';
import { panel, controlGroup, slider, button, select } from './controls.js';
import { dualHistogram, horizontalMeter } from './charts.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles, simChip } from './widgets.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateCacheRun, generateIdleLatencies, PROBES } from '../channels/cache.js';
import { analyzeCache } from '../detectors/cacheDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, setSection, VIEW_MODES } from '../state.js';

export function renderCacheView(state) {
  const copy = COPY.cache;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-cache' },
    sectionHeader({ ...copy, eyebrow: 'Shared resource' }),
    div({ class: 'prose-wide', style: { marginBottom: 'var(--sp-4)' } }, renderBlocks(copy.blocks)),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulateCacheRun(s.message, { ...s.channels.cache, seed: `${s.seed}:cache` });
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.cache;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Probe and cache model' }),
      controlGroup(null,
        select({
          label: 'Probing protocol',
          value: p.probe,
          options: PROBES.map((pr) => ({ value: pr.key, label: pr.label })),
          help: 'Flush+Reload needs shared memory. Prime+Probe does not — and its polarity is inverted.',
          onChange: (v) => setChannelParam('cache', 'probe', v),
        }),
        slider({ label: 'Hit latency', min: 20, max: 200, step: 5, value: p.hitCycles, unit: ' cycles',
          onInput: (v) => setChannelParam('cache', 'hitCycles', v) }),
        slider({ label: 'Miss latency', min: 120, max: 600, step: 10, value: p.missCycles, unit: ' cycles',
          onInput: (v) => setChannelParam('cache', 'missCycles', v) }),
        slider({ label: 'Co-tenant jitter', min: 0, max: 400, step: 10, value: p.jitterCycles, unit: ' cycles',
          help: 'Scheduler and neighbour noise on every measurement.',
          onInput: (v) => setChannelParam('cache', 'jitterCycles', v) }),
        slider({ label: 'Eviction probability', min: 0, max: 0.6, step: 0.02, value: p.evictionProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'A neighbour evicts a line the sender placed. Asymmetric: it only damages 1s.',
          onInput: (v) => setChannelParam('cache', 'evictionProb', v) }),
        slider({ label: 'Probe repetitions', min: 1, max: 32, step: 1, value: p.repetitions,
          help: 'Averaging R probes buys a √R gain — at R times the cost per bit.',
          onInput: (v) => setChannelParam('cache', 'repetitions', v) }),
        slider({ label: 'Decision threshold', min: 20, max: 600, step: 10, value: p.thresholdCycles, unit: ' cycles',
          help: 'The fast/slow decision boundary the receiver uses.',
          onInput: (v) => setChannelParam('cache', 'thresholdCycles', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('cache') }))),
    calloutChip(CALLOUTS.cache));
}

function centerContent(state, run) {
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: `The modelled cache — ${run.probeInfo.label}` }),
      simChip('Every latency below is drawn from a documented distribution — no cache line is flushed and no timer is read.'),
      para(run.probeInfo.description, 'subtle'),
      probeTable(run),
      srmCrossLink()),
    tradeoffInstrument('cache', state.message, { ...state.channels.cache, seed: `${state.seed}:cache` }),
  );
}

function probeTable(run) {
  const probes = run.probes.slice(0, 32);
  if (!probes.length) {
    return div({ class: 'empty-note', text: 'Enter a message to see the probe sequence.' });
  }
  const rows = probes.map((p) => {
    const isErr = p.decodedBit !== p.intendedBit;
    return el('tr', { class: isErr ? 'row-err' : '' },
      el('td', { text: String(p.index) }),
      el('td', { text: String(p.intendedBit) }),
      el('td', { text: p.senderTouched ? 'touched' : '—' }),
      el('td', { text: p.expectedState === 'fast' ? 'fast' : 'slow' }),
      el('td', { text: `${Math.round(p.latencyCycles)}` }),
      el('td', {}, span({ class: `ook-bit b${p.decodedBit}${isErr ? ' err' : ''}`, text: String(p.decodedBit) })),
      el('td', { text: p.evicted ? 'evicted' : '' }));
  });

  return div({ class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Probe-by-probe cache latencies and the bit each one decodes to' } },
    el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {},
        el('th', { text: '#' }),
        el('th', { text: 'sent' }),
        el('th', { text: 'sender' }),
        el('th', { text: 'state' }),
        el('th', { text: 'cycles' }),
        el('th', { text: 'read' }),
        el('th', { text: 'noise' }))),
      el('tbody', {}, ...rows)));
}

function srmCrossLink() {
  return div({ class: 'identical-banner' },
    el('strong', { text: 'NEITHER PROCESS WRITES TO THE OTHER.' }),
    span({ class: 'sub', text: 'They share one attribute — cache occupancy — and that is enough.' }),
    button({
      label: 'See this in the Shared-Resource Matrix →',
      variant: 'ghost',
      onClick: () => setSection('srm'),
    }));
}

function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const success = run.bitErrors === 0;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Sent vs recovered bits' }),
      el('p', { class: 'lab-line subtle', text: 'Intended' }),
      bitRibbon(run.bits, { max: 64, ariaLabel: 'intended bits' }),
      el('p', { class: 'lab-line subtle', text: 'Recovered (mismatches marked)' }),
      bitRibbon(run.bits, { decoded: padTo(run.decodedBits, run.bits.length), max: 64, ariaLabel: 'recovered bits' })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiving process' }),
      recoveredBox(run.recoveredText, { ok: success }),
      statTiles([
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
        { val: String(run.evictedCount), lab: 'evicted', tone: run.evictedCount ? 'bad' : undefined },
        { val: `${Math.round(run.confidence * 100)}%`, lab: 'confidence', tone: run.confidence > 0.8 ? 'good' : run.confidence < 0.5 ? 'bad' : undefined },
      ]),
      horizontalMeter(run.confidence, { label: 'Decode confidence', color: run.confidence > 0.7 ? 'var(--ok)' : run.confidence > 0.4 ? 'var(--warn)' : 'var(--danger)' })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Measured vs predicted' }),
      metricList([
        { name: 'Measured BER', value: `${round(run.bitErrorRate * 100, 2)}%`, hi: run.bitErrorRate > 0.05 },
        { name: 'Predicted BER', value: `${round(run.predictedBer * 100, 2)}%` },
        { name: 'Capacity', value: `${round(run.capacityBitsPerProbe, 3)} bits/probe` },
        { name: 'Rule', value: run.probeInfo.rule },
        { name: 'Requires', value: run.probeInfo.needs },
      ]),
      para('Eviction noise damages only the symbol the sender had to place, so this channel is asymmetric. The capacity figure uses the symmetric formula on the average error rate — exact when eviction is off, mildly pessimistic otherwise.', 'subtle')));
}

function defenderPanel(run) {
  const det = analyzeCache(run.latencies, { decoderConfidence: run.confidence, probe: run.probe });
  const baseline = generateIdleLatencies(Math.max(80, run.latencies.length * 4), {
    hitCycles: run.params.hitCycles, missCycles: run.params.missCycles, seed: 'cache-normal',
  });
  const m = det.metrics;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Access-latency histogram' }),
      dualHistogram(baseline, run.latencies, {
        labelA: 'Ordinary workload', labelB: 'This channel', unit: ' cyc',
        colorA: 'var(--accent-2)', colorB: 'var(--covert)', height: 150,
        title: 'Latency distribution',
        ariaLabel: 'Histogram comparing an ordinary hit-dominated workload against this channel’s evenly balanced classes',
      }),
      para('Both are bimodal — memory either hits or misses. Look at the BALANCE: ordinary code mostly hits, a channel uses both classes about equally.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Cache metrics' }),
      metricList([
        { name: 'Access-class balance', value: `${Math.round(m.slowShare * 100)}% slow`, hi: Math.abs(m.slowShare - 0.5) < 0.2 },
        { name: "Separation (d')", value: Number.isFinite(m.dPrime) ? round(m.dPrime, 1) : '∞', hi: Number.isFinite(m.dPrime) && m.dPrime > 4 },
        { name: 'Class centres', value: `${Math.round(m.fastCentre)} / ${Math.round(m.slowCentre)} cycles` },
        { name: 'Noise floor', value: `${round(m.noiseFloor, 1)} cycles` },
        { name: 'Bimodality', value: `${round(m.bimodality, 2)} / 1.0` },
      ])));
}

function padTo(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(-1); // -1 marks "no bit recovered" => mismatch
  return out;
}
