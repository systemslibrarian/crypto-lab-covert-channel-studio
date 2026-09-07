/**
 * views/physicalView.js — the air-gap optical channel module.
 * No network at all: the carrier is light, and the medium is MODELLED.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, bitRibbon, calloutChip } from './blocks.js';
import { panel, controlGroup, slider, button } from './controls.js';
import { dualHistogram, horizontalMeter, stemLine } from './charts.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles, simChip } from './widgets.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulatePhysicalRun, generateAmbientBaseline } from '../channels/physical.js';
import { analyzePhysical } from '../detectors/physicalDetector.js';
import { round } from '../utils/statistics.js';
import { setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderPhysicalView(state) {
  const copy = COPY.physical;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  const node = el('section', { class: 'section', id: 'sec-physical' },
    sectionHeader({ ...copy, eyebrow: 'Air gap' }),
    div({ class: 'prose-wide', style: { marginBottom: 'var(--sp-4)' } }, renderBlocks(copy.blocks)),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function refresh(s) {
    const run = simulatePhysicalRun(s.message, { ...s.channels.physical, seed: `${s.seed}:physical` });
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
  }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const p = state.channels.physical;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Transmitter and medium' }),
      controlGroup(null,
        slider({ label: 'LED lit level (bit 1)', min: 60, max: 400, step: 5, value: p.onLux, unit: ' lux',
          onInput: (v) => setChannelParam('physical', 'onLux', v) }),
        slider({ label: 'LED dark level (bit 0)', min: 0, max: 200, step: 5, value: p.offLux, unit: ' lux',
          onInput: (v) => setChannelParam('physical', 'offLux', v) }),
        slider({ label: 'Ambient noise', min: 0, max: 420, step: 10, value: p.ambientNoise, unit: ' lux',
          help: 'Random light on the sensor. The matched filter averages this away.',
          onInput: (v) => setChannelParam('physical', 'ambientNoise', v) }),
        slider({ label: 'Ambient drift', min: 0, max: 200, step: 5, value: p.ambientDrift, unit: ' lux',
          help: 'A slow systematic shift. Averaging does NOT remove this one.',
          onInput: (v) => setChannelParam('physical', 'ambientDrift', v) }),
        slider({ label: 'Blink period', min: 5, max: 200, step: 5, value: p.symbolMs, unit: ' ms',
          help: 'One symbol per bit — this sets the raw bit rate.',
          onInput: (v) => setChannelParam('physical', 'symbolMs', v) }),
        slider({ label: 'Samples per bit', min: 1, max: 32, step: 1, value: p.samplesPerBit,
          help: 'Matched-filter length. Averaging N samples buys a √N gain.',
          onInput: (v) => setChannelParam('physical', 'samplesPerBit', v) }),
        slider({ label: 'Decision threshold', min: 0, max: 400, step: 5, value: p.thresholdLux, unit: ' lux',
          help: 'The dark/lit decision boundary the receiver uses.',
          onInput: (v) => setChannelParam('physical', 'thresholdLux', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('physical') }))),
    calloutChip(CALLOUTS.physical));
}

function centerContent(state, run) {
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'The modelled optical link' }),
      simChip('Every luminance value below is generated locally from a documented noise process — no LED, camera, or sensor is involved.'),
      opticalTrace(run),
      airGapBanner()),
    tradeoffInstrument('physical', state.message, { ...state.channels.physical, seed: `${state.seed}:physical` }),
  );
}

function opticalTrace(run) {
  const symbols = run.symbols.slice(0, 40);
  if (symbols.length < 2) {
    return div({ class: 'empty-note', text: 'Enter a longer message to see the light trace.' });
  }
  const threshold = run.params.thresholdLux;
  const cells = symbols.map((sy) => {
    const isErr = sy.decodedBit !== sy.intendedBit;
    return div({ class: `ook-sym${sy.decodedBit ? ' lit' : ''}${isErr ? ' err' : ''}` },
      span({
        class: 'ook-lamp',
        attrs: { title: `symbol ${sy.index}: ${round(sy.filtered, 1)} lux (threshold ${threshold})` },
      }, sy.decodedBit ? '●' : '○'),
      span({ class: 'ook-lux', text: String(Math.round(sy.filtered)) }),
      span({ class: `ook-bit b${sy.decodedBit}${isErr ? ' err' : ''}`, text: String(sy.decodedBit) }));
  });

  return div({},
    div({ class: 'timeline-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Matched-filter luminance per symbol; a lit lamp is a 1 and a dark lamp is a 0' } },
      div({ class: 'ook-strip' }, ...cells)),
    para(`Raw sensor samples (${run.params.samplesPerBit} per symbol), before the matched filter:`, 'subtle'),
    stemLine(run.samples.slice(0, 40 * run.params.samplesPerBit).map((v) => Math.round(v)), {
      height: 64, color: 'var(--accent)',
      ariaLabel: 'Raw luminance samples over time, before matched filtering',
      label: 'lux',
    }));
}

function airGapBanner() {
  return div({ class: 'identical-banner' },
    el('strong', { text: 'THERE IS NO NETWORK HERE AT ALL.' }),
    span({ class: 'sub', text: 'The carrier is the medium — and the medium is modelled.' }));
}

function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const success = run.bitErrors === 0;
  const snrText = Number.isFinite(run.snrDb) ? `${round(run.snrDb, 1)} dB` : '∞';
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
        { val: snrText, lab: 'decision SNR', tone: Number.isFinite(run.snrDb) && run.snrDb < 6 ? 'bad' : 'good' },
        { val: `${Math.round(run.confidence * 100)}%`, lab: 'confidence', tone: run.confidence > 0.8 ? 'good' : run.confidence < 0.5 ? 'bad' : undefined },
      ]),
      horizontalMeter(run.confidence, { label: 'Decode confidence', color: run.confidence > 0.7 ? 'var(--ok)' : run.confidence > 0.4 ? 'var(--warn)' : 'var(--danger)' })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Measured vs predicted' }),
      metricList([
        { name: 'Measured BER', value: `${round(run.bitErrorRate * 100, 2)}%`, hi: run.bitErrorRate > 0.05 },
        { name: 'Predicted BER (Gaussian only)', value: `${round(run.predictedBer * 100, 2)}%` },
        { name: 'Capacity (hard decision)', value: `${round(run.capacityBitsPerSymbol, 3)} bits/symbol` },
        { name: 'Capacity (soft-decision bound)', value: Number.isFinite(run.analogCapacityBitsPerSymbol) ? `${round(run.analogCapacityBitsPerSymbol, 2)} bits/symbol` : '∞' },
        { name: 'Raw bit rate', value: `${round(run.bitsPerSecond, 1)} bit/s` },
      ]),
      para('The prediction models the Gaussian noise only. Drift is a systematic offset, and a sensor reading floors at darkness — so measured error can sit above the predicted curve. That gap is the point.', 'subtle')));
}

function defenderPanel(run) {
  const det = analyzePhysical(run.filteredLevels, { decoderConfidence: run.confidence });
  const baseline = generateAmbientBaseline(Math.max(60, run.filteredLevels.length * 4), {
    onLux: run.params.onLux, offLux: run.params.offLux, seed: 'physical-normal',
  });
  const m = det.metrics;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Luminance histogram' }),
      dualHistogram(baseline, run.filteredLevels, {
        labelA: 'Ordinary LED activity', labelB: 'This channel', unit: ' lux',
        colorA: 'var(--accent-2)', colorB: 'var(--covert)', height: 150,
        title: 'Level distribution',
        ariaLabel: 'Histogram comparing broadly-spread ordinary LED activity against this channel’s two tight levels',
      }),
      para('An LED driven by ordinary work wanders across the range. On/off keying piles into two levels.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Optical metrics' }),
      metricList([
        { name: 'Bimodality', value: `${round(m.bimodality, 2)} / 1.0`, hi: m.bimodality > 0.45 },
        { name: "Separation (d')", value: Number.isFinite(m.dPrime) ? round(m.dPrime, 1) : '∞', hi: Number.isFinite(m.dPrime) && m.dPrime > 4 },
        { name: 'Level centres', value: `${Math.round(m.levelLow)} / ${Math.round(m.levelHigh)} lux` },
        { name: 'Noise floor', value: `${round(m.noiseFloor, 1)} lux` },
        { name: 'Duty cycle', value: `${Math.round(m.dutyCycle * 100)}% lit` },
      ])));
}

function padTo(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(-1); // -1 marks "no bit recovered" => mismatch
  return out;
}
