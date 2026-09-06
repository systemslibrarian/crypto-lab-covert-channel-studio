/**
 * views/timingView.js — the covert timing channel module.
 * Identical packets; the bits live in the gaps between arrivals.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, bitRibbon, calloutChip } from './blocks.js';
import { panel, controlGroup, slider, button } from './controls.js';
import { dualHistogram, horizontalMeter } from './charts.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateTimingFromText, generateNormalGaps } from '../channels/timing.js';
import { analyzeTiming } from '../detectors/timingDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderTimingView(state) {
  const copy = COPY.timing;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-timing' },
    sectionHeader({ ...copy, eyebrow: 'Timing' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulateTimingFromText(s.message, { ...s.channels.timing, seed: `${s.seed}:timing` });
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.timing;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Timing controls' }),
      controlGroup(null,
        slider({ label: 'Short delay (bit 0)', min: 20, max: 300, step: 5, value: p.shortMs, unit: 'ms',
          onInput: (v) => setChannelParam('timing', 'shortMs', v) }),
        slider({ label: 'Long delay (bit 1)', min: 60, max: 600, step: 5, value: p.longMs, unit: 'ms',
          onInput: (v) => setChannelParam('timing', 'longMs', v) }),
        slider({ label: 'Network jitter', min: 0, max: 200, step: 2, value: p.jitterMs, unit: 'ms',
          help: 'The star of the experiment: raise it and the message deteriorates.',
          onInput: (v) => setChannelParam('timing', 'jitterMs', v) }),
        slider({ label: 'Noise spikes', min: 0, max: 200, step: 5, value: p.noiseMs, unit: 'ms',
          onInput: (v) => setChannelParam('timing', 'noiseMs', v) }),
        slider({ label: 'Packet loss', min: 0, max: 0.5, step: 0.02, value: p.lossProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'A dropped packet merges two gaps — very destructive here.',
          onInput: (v) => setChannelParam('timing', 'lossProb', v) }),
        slider({ label: 'Decoder threshold', min: 30, max: 600, step: 5, value: p.thresholdMs, unit: 'ms',
          help: 'The short/long decision boundary the receiver uses.',
          onInput: (v) => setChannelParam('timing', 'thresholdMs', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('timing') }))),
    calloutChip(CALLOUTS.timing));
}

function centerContent(state, run) {
  return div({},
    el('div', { class: 'card' },
      el('div', { class: 'timing-topbar' },
        el('h3', { class: 'card-title', text: 'Packets on the wire (all identical)' }),
        button({ label: 'Replay', variant: 'ghost', icon: '▶', onClick: replayAnim })),
      timeline(run),
      identicalBanner()),
  );
}

let replayToken = 0;
function replayAnim(e) {
  // Re-trigger the staggered entrance by toggling a data attribute on the timeline.
  const tl = e.target.closest('.card').querySelector('.timeline');
  if (!tl) return;
  replayToken++;
  tl.classList.remove('animate');
  // Force reflow so the animation restarts.
  void tl.offsetWidth;
  tl.classList.add('animate');
}

function timeline(run) {
  const received = run.received.slice(0, 48);
  if (received.length < 2) {
    return div({ class: 'empty-note', text: 'Enter a longer message to see the timeline.' });
  }
  const first = received[0].arrivalMs;
  const last = received[received.length - 1].arrivalMs;
  const duration = Math.max(1, last - first);
  const meanGap = duration / (received.length - 1);
  const pxPerMs = Math.min(2.2, Math.max(0.15, 60 / meanGap));
  const leftPad = 24;
  const width = Math.min(4000, leftPad * 2 + duration * pxPerMs);

  const dots = received.map((pkt, i) =>
    span({
      class: `tl-packet${pkt.dropped ? ' dropped' : ''}`,
      style: { left: `${leftPad + (pkt.arrivalMs - first) * pxPerMs}px`, animationDelay: `${i * 45}ms` },
      attrs: { title: `packet ${pkt.index} @ ${Math.round(pkt.arrivalMs)} ms` },
    }, '≡'));

  const intervalEls = [];
  for (let j = 0; j < received.length - 1; j++) {
    const iv = run.intervals[j];
    if (!iv) continue;
    const x0 = leftPad + (received[j].arrivalMs - first) * pxPerMs;
    const x1 = leftPad + (received[j + 1].arrivalMs - first) * pxPerMs;
    const mid = (x0 + x1) / 2;
    const isErr = iv.intendedBit != null && iv.decodedBit !== iv.intendedBit;
    intervalEls.push(span({ class: 'tl-bracket', style: { left: `${x0}px`, width: `${Math.max(2, x1 - x0)}px` } }));
    intervalEls.push(span({ class: 'tl-gap', style: { left: `${mid}px` }, text: `${Math.round(iv.observedGapMs)}ms` }));
    intervalEls.push(span({
      class: `tl-bit b${iv.decodedBit}${isErr ? ' err' : ''}`,
      style: { left: `${mid}px` },
      attrs: { title: isErr ? `decoded ${iv.decodedBit}, sent ${iv.intendedBit}` : `bit ${iv.decodedBit}` },
    }, String(iv.decodedBit)));
  }

  return div({ class: 'timeline-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Packet arrival timeline; gaps between arrivals encode the bits' } },
    div({ class: 'timeline animate', style: { width: `${width}px` } },
      span({ class: 'tl-label', style: { left: `${leftPad}px` }, text: 'arrival →' }),
      div({ class: 'timeline-axis' }),
      ...dots,
      ...intervalEls));
}

function identicalBanner() {
  return div({ class: 'identical-banner' },
    el('strong', { text: 'NOTHING IN THESE PACKETS CONTAINS THE MESSAGE.' }),
    span({ class: 'sub', text: 'The message is in when they arrived.' }));
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
      el('h3', { class: 'card-title', text: 'Receiver' }),
      recoveredBox(run.recoveredText, { ok: success }),
      statTiles([
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
        { val: String(run.lostCount), lab: 'lost pkts', tone: run.lostCount ? 'bad' : undefined },
        { val: `${Math.round(run.confidence * 100)}%`, lab: 'confidence', tone: run.confidence > 0.8 ? 'good' : run.confidence < 0.5 ? 'bad' : undefined },
      ]),
      horizontalMeter(run.confidence, { label: 'Decode confidence', color: run.confidence > 0.7 ? 'var(--ok)' : run.confidence > 0.4 ? 'var(--warn)' : 'var(--danger)' })));
}

function defenderPanel(run) {
  const det = analyzeTiming(run.observedGaps, { decoderConfidence: run.confidence });
  const normal = generateNormalGaps(Math.max(60, run.observedGaps.length * 4), { meanMs: (run.params.shortMs + run.params.longMs) / 2, seed: 'timing-normal' });
  const m = det.metrics;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Inter-arrival histogram' }),
      dualHistogram(normal, run.observedGaps, {
        labelA: 'Typical traffic', labelB: 'This channel', unit: 'ms',
        colorA: 'var(--accent-2)', colorB: 'var(--covert)', height: 150,
        title: 'Gap distribution', ariaLabel: 'Histogram comparing typical broadly-spread gaps against this channel’s two clusters',
      }),
      para('Normal traffic spreads out; a two-level timing channel piles into two clusters.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Timing metrics' }),
      metricList([
        { name: 'Bimodality', value: `${round(m.bimodality, 2)} / 1.0`, hi: m.bimodality > 0.45 },
        { name: 'Two-level fit', value: `${Math.round(m.twoLevelFit * 100)}%`, hi: m.twoLevelFit > 0.8 },
        { name: 'Cluster centres', value: `${Math.round(m.clusterLow)} / ${Math.round(m.clusterHigh)} ms` },
        { name: 'Std deviation', value: `${round(m.stdDev, 1)} ms` },
        { name: 'Coeff. of variation', value: `${round(m.coefficientOfVariation, 2)}` },
      ])));
}

function padTo(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(-1); // -1 marks "no bit recovered" => mismatch
  return out;
}
