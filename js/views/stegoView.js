/**
 * views/stegoView.js — LSB image steganography module (canvas-based, local only).
 * The chosen image is never uploaded anywhere; all pixel work happens in-browser.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, calloutChip, inline } from './blocks.js';
import { panel, controlGroup, slider, button } from './controls.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { messageInput } from './controls.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import {
  embedMessage, extractMessage, bitPlane, differenceImage, changedChannels,
  simulateLossyDegradation, capacityBytes,
} from '../channels/stego.js';
import { analyzeStego } from '../detectors/stegoDetector.js';
import { round } from '../utils/statistics.js';
import { setStego, VIEW_MODES } from '../state.js';

const SAMPLE_SRC = 'assets/sample-cover-image.png';
const MAX_DIM = 160;
let sampleRaster = null;
let samplePromise = null;
let uploadedRaster = null;

export function renderStegoView(state) {
  const copy = COPY.stego;
  const center = div({ class: 'panel panel-center' }, div({ class: 'empty-note', text: 'Loading carrier image…' }));
  const right = div({ class: 'panel panel-right' });
  let cur = state;

  const node = el('section', { class: 'section', id: 'sec-stego' },
    sectionHeader({ ...copy, eyebrow: 'Steganography' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  async function refresh(s) {
    cur = s;
    const carrier = await getCarrier(s);
    if (cur !== s) return; // a newer refresh superseded this one
    if (!carrier) { replace(center, div({ class: 'empty-note', text: 'Could not load a carrier image.' })); return; }
    render(s, carrier);
  }

  function render(s, carrier) {
    const capBytes = capacityBytes(carrier);
    let embedded; let error = null;
    try { embedded = embedMessage(carrier, s.stego.message).raster; }
    catch (e) { error = e.message; embedded = carrier; }
    replace(center, centerContent(s, carrier, embedded, error));
    replace(right, rightContent(s, carrier, embedded, capBytes, error));
  }

  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Carrier & payload' }),
      messageInput({
        value: state.stego.message, maxBytes: 24, label: 'Hidden message',
        hint: 'Kept intentionally tiny. The carrier image never leaves your browser.',
        onInput: (v) => setStego('message', v),
      }),
      div({ class: 'ctrl' },
        el('label', { class: 'file-label' }, span({ text: 'Use your own image (optional)' }),
          el('input', {
            type: 'file', accept: 'image/*', class: 'file-input',
            on: { change: onFile },
          })),
        el('p', { class: 'ctrl-help', text: 'Loaded locally and downscaled; nothing is uploaded.' })),
      slider({ label: 'Lossy transform strength', min: 2, max: 32, step: 1, value: state.stego.step,
        help: 'Simulated re-compression: quantises colours and destroys LSB data.',
        onInput: (v) => setStego('step', v) }),
      button({ label: 'Use sample image', variant: 'ghost', icon: '↺', onClick: () => { setStego('carrier', 'sample'); } })),
    calloutChip(CALLOUTS.stego));
}

async function onFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    uploadedRaster = bitmapToRaster(bitmap);
    setStego('carrier', 'custom');
  } catch {
    uploadedRaster = null;
  }
}

/** Load + cache the sample carrier once, sharing the in-flight promise so
 *  concurrent callers never start duplicate image loads. */
function loadSample() {
  if (sampleRaster) return Promise.resolve(sampleRaster);
  samplePromise ??= loadImage(SAMPLE_SRC)
    .then((img) => { sampleRaster = imageToRaster(img); return sampleRaster; })
    .catch(() => { samplePromise = null; return null; });
  return samplePromise;
}

/** Shared loader used by the Detection Console. */
export async function loadSampleCarrier() { return loadSample(); }

async function getCarrier(state) {
  if (state.stego.carrier === 'custom' && uploadedRaster) return uploadedRaster;
  return loadSample();
}

function centerContent(state, original, embedded, error) {
  const diff = differenceImage(original, embedded, { amplify: 40 });
  const plane = bitPlane(embedded, 0, 'all');
  const degraded = simulateLossyDegradation(embedded, { step: state.stego.step });
  const degradedExtract = extractMessage(degraded);

  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Carrier and payload' }),
      error ? div({ class: 'recovered-box err', text: error }) : null,
      div({ class: 'stego-grid' },
        frame('Original', original, 'the cover image'),
        frame('Stego image', embedded, 'message embedded in LSBs'),
        frame('Difference ×40', diff, 'amplified — where bits changed'),
        frame('LSB bit-plane', plane, 'embedded region looks like noise'))),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'The compression experiment' }),
      div({ class: 'stego-grid' },
        frame('After lossy transform', degraded, `quantised to steps of ${state.stego.step}`),
        div({ class: 'img-frame degrade-result' },
          el('div', { class: 'cap-title', text: 'Recovered from degraded' }),
          div({ class: `recovered-box ${degradedExtract.text === state.stego.message && state.stego.message ? 'ok' : 'err'}`,
            text: degradedExtract.text || '∅ (destroyed)' }),
          para('LSB data lives in exactly the bits a lossy transform discards.', 'subtle')))));
}

function frame(title, raster, caption) {
  return el('figure', { class: 'img-frame' },
    rasterToCanvas(raster),
    el('figcaption', {},
      el('span', { class: 'cap-title', text: title }),
      caption ? el('span', { text: ` — ${caption}` }) : null));
}

function rightContent(state, original, embedded, capBytes, error) {
  if (state.viewMode === VIEW_MODES.DEFENDER) return defenderPanel(original, embedded);
  return senderPanel(state, embedded, capBytes, error);
}

function senderPanel(state, embedded, capBytes, error) {
  const rec = extractMessage(embedded);
  const ok = !error && rec.text === state.stego.message;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver extracts the LSBs' }),
      recoveredBox(rec.text, { ok }),
      statTiles([
        { val: `${capBytes}B`, lab: 'capacity' },
        { val: `${state.stego.message.length}`, lab: 'chars hidden' },
      ]),
      para('A ±1 change to a colour value is invisible to the eye, so the stego image looks identical to the original.', 'subtle')));
}

function defenderPanel(original, embedded) {
  const det = analyzeStego(embedded);
  const detClean = analyzeStego(original);
  const m = det.metrics;
  const changed = changedChannels(original, embedded);
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Steganalysis metrics' }),
      metricList([
        { name: 'Hottest block entropy', value: `${round(m.hottestBlock.entropy, 2)}`, hi: m.hottestBlock.entropy > 0.9 },
        { name: 'Median block entropy', value: `${round(m.medianBlockEntropy, 2)}` },
        { name: 'Block contrast', value: `${round(m.blockContrast, 2)}`, hi: m.blockContrast > 0.2 },
        { name: 'Global LSB ratio', value: `${round(m.globalSetRatio, 3)}` },
        { name: 'Clean-image score', value: `${detClean.score}/100` },
      ]),
      para('Compared with the original, the embedded region stands out as over-random — but a small payload in a noisy photo could hide beneath this.', 'subtle')));
}

/* ---- canvas helpers ------------------------------------------------------- */
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function imageToRaster(img) {
  const { w, h } = fitDims(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  return { data: id.data, width: w, height: h };
}
function bitmapToRaster(bitmap) {
  const { w, h } = fitDims(bitmap.width, bitmap.height);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  return { data: id.data, width: w, height: h };
}
function fitDims(w, h) {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
function rasterToCanvas(raster) {
  const c = makeCanvas(raster.width, raster.height);
  const ctx = c.getContext('2d');
  const id = new ImageData(Uint8ClampedArray.from(raster.data), raster.width, raster.height);
  ctx.putImageData(id, 0, 0);
  return c;
}
