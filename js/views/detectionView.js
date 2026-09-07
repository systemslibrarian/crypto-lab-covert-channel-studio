/**
 * views/detectionView.js — the unified SOC-style Detection Console.
 * One place to compare the observable indicators every channel leaves behind.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, callout } from './blocks.js';
import { segmented } from './controls.js';
import { anomalyGauge, verticalBars, dualHistogram } from './charts.js';
import { metricList, observationList } from './widgets.js';
import { COPY } from '../content/copy.js';
import { round } from '../utils/statistics.js';

import { simulateDnsRun } from '../channels/dns.js';
import { simulateTimingFromText, generateNormalGaps } from '../channels/timing.js';
import { simulateStorageRun } from '../channels/storage.js';
import { simulateOrderingRun } from '../channels/ordering.js';
import { simulateHttpRun } from '../channels/http.js';
import { embedMessage } from '../channels/stego.js';
import { simulatePhysicalRun } from '../channels/physical.js';
import { simulateCacheRun } from '../channels/cache.js';

import { analyzeDns } from '../detectors/dnsDetector.js';
import { analyzeTiming } from '../detectors/timingDetector.js';
import { analyzeStorage } from '../detectors/storageDetector.js';
import { analyzeOrdering } from '../detectors/orderingDetector.js';
import { analyzeHttp } from '../detectors/httpDetector.js';
import { analyzeStego } from '../detectors/stegoDetector.js';
import { analyzePhysical } from '../detectors/physicalDetector.js';
import { analyzeCache } from '../detectors/cacheDetector.js';
import { loadSampleCarrier } from './stegoView.js';

const CHANNELS = [
  { key: 'dns', label: 'DNS' },
  { key: 'timing', label: 'Timing' },
  { key: 'storage', label: 'Storage' },
  { key: 'ordering', label: 'Ordering' },
  { key: 'http', label: 'HTTP' },
  { key: 'stego', label: 'Image' },
  { key: 'physical', label: 'Air gap' },
  { key: 'cache', label: 'Cache' },
];

let selected = 'dns';
let stegoCache = null; // { det } computed once carrier + message known

export function renderDetectionView(state) {
  const copy = COPY.detection;
  const overview = div({ class: 'det-overview' });
  const detail = div({ class: 'det-detail' });
  let cur = state;

  const node = el('section', { class: 'section', id: 'sec-detection' },
    sectionHeader({ ...copy, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' }, renderBlocks(copy.blocks)),
    el('div', { class: 'card det-console' },
      div({ class: 'det-console-head' },
        el('h3', { class: 'card-title', text: 'Signals at a glance' }),
        span({ class: 'sim-note', text: '' })),
      overview,
      div({ class: 'det-selector' },
        segmented({
          name: 'det-channel', label: 'Inspect channel', value: selected,
          options: CHANNELS.map((c) => ({ value: c.key, label: c.label })),
          onChange: (v) => { selected = v; replace(overview, overviewRow(cur)); replace(detail, detailFor(cur, v)); },
        })),
      detail));

  function refresh(s) {
    cur = s;
    replace(overview, overviewRow(s));
    replace(detail, detailFor(s, selected));
    // Stego needs the carrier image; compute async then patch overview + detail,
    // but only if a newer refresh hasn't superseded this one.
    computeStego(s).then((det) => {
      if (cur !== s) return;
      stegoCache = det;
      replace(overview, overviewRow(cur));
      if (selected === 'stego') replace(detail, detailFor(cur, 'stego'));
    });
  }
  refresh(state);
  return { node, refresh };
}

/* ---- per-channel analysis ------------------------------------------------- */
function analyze(channel, state) {
  switch (channel) {
    case 'dns': {
      const run = simulateDnsRun(state.message, { ...state.channels.dns, seed: `${state.seed}:dns` });
      return { det: analyzeDns(run.mixed.filter((q) => q.forwarded !== false)), run };
    }
    case 'timing': {
      const run = simulateTimingFromText(state.message, { ...state.channels.timing, seed: `${state.seed}:timing` });
      return { det: analyzeTiming(run.observedGaps, { decoderConfidence: run.confidence }), run };
    }
    case 'storage': {
      const run = simulateStorageRun(state.message, { field: state.channels.storage.field, middlebox: state.channels.storage.middlebox, seed: `${state.seed}:storage` });
      return { det: analyzeStorage(run.processedPackets, run.field), run };
    }
    case 'ordering': {
      const run = simulateOrderingRun(state.message, { reorderProb: state.channels.ordering.reorderProb, seed: `${state.seed}:ordering` });
      return { det: analyzeOrdering(run.pairs), run };
    }
    case 'http': {
      const run = simulateHttpRun(state.message, { ...state.channels.http, seed: `${state.seed}:http` });
      return { det: analyzeHttp(run.normalize ? run.processedRequests : run.covertRequests), run };
    }
    case 'physical': {
      const run = simulatePhysicalRun(state.message, { ...state.channels.physical, seed: `${state.seed}:physical` });
      return { det: analyzePhysical(run.filteredLevels, { decoderConfidence: run.confidence }), run };
    }
    case 'cache': {
      const run = simulateCacheRun(state.message, { ...state.channels.cache, seed: `${state.seed}:cache` });
      return { det: analyzeCache(run.latencies, { decoderConfidence: run.confidence, probe: run.probe }), run };
    }
    default: return { det: stegoCache, run: null };
  }
}

async function computeStego(state) {
  const carrier = await loadSampleCarrier();
  if (!carrier) return null;
  let embedded = carrier;
  try { embedded = embedMessage(carrier, state.stego.message).raster; } catch { /* keep carrier */ }
  return analyzeStego(embedded);
}

function overviewRow(state) {
  return div({ class: 'gauge-row' },
    ...CHANNELS.map((c) => {
      const { det } = c.key === 'stego' ? { det: stegoCache } : analyze(c.key, state);
      return div({ class: `gauge-tile level-${det ? det.anomalyLevel : 'low'}${selected === c.key ? ' selected' : ''}` },
        div({ class: 'gauge-tile-label', text: c.label }),
        det ? anomalyGauge(det.score, det.anomalyLevel, { compact: true }) : div({ class: 'subtle', text: '…' }));
    }));
}

function detailFor(state, channel) {
  const { det, run } = analyze(channel, state);
  if (!det) return div({ class: 'empty-note', text: 'Loading image analysis…' });
  return div({ class: 'det-detail-grid' },
    div({},
      el('h3', { class: 'card-title', text: `${labelFor(channel)} — indicator` }),
      anomalyGauge(det.score, det.anomalyLevel, { disclaimer: det.disclaimer }),
      observationList(det.observations)),
    div({}, detailExtras(channel, det, run)));
}

function detailExtras(channel, det, run) {
  const m = det.metrics;
  switch (channel) {
    case 'dns':
      return div({},
        el('h3', { class: 'card-title', text: 'Key metrics' }),
        metricList([
          { name: 'Avg label length', value: `${round(m.avgLabelLength, 1)} ch`, hi: m.avgLabelLength > 14 },
          { name: 'Avg label entropy', value: `${round(m.avgLabelEntropy, 2)}`, hi: m.avgLabelEntropy > 0.72 },
          { name: 'Unique subdomains', value: `${Math.round(m.uniqueSubRatio * 100)}%`, hi: m.uniqueSubRatio > 0.85 },
          { name: 'Inter-arrival CV', value: `${round(m.interArrivalCV, 2)}`, hi: m.interArrivalCV < 0.15 },
        ]),
        verticalBars(m.charDistribution.slice(0, 16).map((c) => ({ label: c.char, value: c.count, color: 'var(--covert)' })), { height: 110, ariaLabel: 'Label character frequency' }));
    case 'timing':
      return div({},
        el('h3', { class: 'card-title', text: 'Inter-arrival histogram' }),
        dualHistogram(generateNormalGaps(160, { meanMs: (run.params.shortMs + run.params.longMs) / 2, seed: 'n' }), run.observedGaps, {
          labelA: 'Typical', labelB: 'This channel', unit: 'ms', colorA: 'var(--accent-2)', colorB: 'var(--covert)', height: 130,
        }),
        metricList([
          { name: 'Bimodality', value: `${round(m.bimodality, 2)}`, hi: m.bimodality > 0.45 },
          { name: 'Two-level fit', value: `${Math.round(m.twoLevelFit * 100)}%`, hi: m.twoLevelFit > 0.8 },
        ]));
    case 'storage':
      return div({},
        el('h3', { class: 'card-title', text: `${m.fieldLabel} distribution` }),
        verticalBars(m.valueCounts.slice(0, 14).map((c) => ({ label: String(c.value), value: c.count, color: 'var(--covert)' })), { height: 120, ariaLabel: 'Field value distribution' }),
        metricList([
          { name: 'Distinct values', value: `${m.distinctValues} / ${m.count}` },
          { name: 'Bit bias', value: `${round(m.bitBias, 2)}`, hi: m.bitBias > 0.5 },
        ]));
    case 'ordering':
      return div({},
        el('h3', { class: 'card-title', text: 'Pair structure' }),
        metricList([
          { name: 'A-first : B-first', value: `${m.aFirst} : ${m.bFirst}` },
          { name: 'Balance', value: `${round(m.balance, 2)}` },
          { name: 'Longest run', value: String(m.longestRun) },
        ]),
        para('Frequency is near a coin-flip; ordering is caught by structure, not counts.', 'subtle'));
    case 'http':
      return div({},
        el('h3', { class: 'card-title', text: 'Header-order fingerprint' }),
        metricList([
          { name: 'Distinct orderings', value: `${m.distinctOrders} / ${m.requestCount}`, hi: m.uniqueOrderRatio > 0.6 },
          { name: 'Order entropy', value: `${round(m.normOrderEntropy, 2)} / 1.0`, hi: m.normOrderEntropy > 0.3 },
          { name: 'Dominant order share', value: `${Math.round(m.modalFraction * 100)}%` },
        ]),
        para('A stable client fingerprints as one header order; near-random order is the tell.', 'subtle'));
    case 'stego':
      return div({},
        el('h3', { class: 'card-title', text: 'LSB block sweep' }),
        metricList([
          { name: 'Hottest block entropy', value: `${round(m.hottestBlock.entropy, 2)}`, hi: m.hottestBlock.entropy > 0.9 },
          { name: 'Block contrast', value: `${round(m.blockContrast, 2)}`, hi: m.blockContrast > 0.2 },
          { name: 'Global LSB ratio', value: `${round(m.globalSetRatio, 3)}` },
        ]),
        para('A single over-random region against a smooth median is the tell here.', 'subtle'));
    default: return null;
  }
}

function labelFor(k) { return (CHANNELS.find((c) => c.key === k) || {}).label || k; }
