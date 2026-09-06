/**
 * views/validationView.js — the Detector Validation Laboratory section.
 * Shows ROC/AUC and confusion matrices measured over deterministic sweeps, with
 * the "published statistic → implementation → threshold → measured behaviour"
 * framing and the honest caveat that an anomaly score is not a probability.
 */

import { el, div, span, svg } from './dom.js';
import { sectionHeader, para, inline } from './blocks.js';
import { round } from '../utils/statistics.js';
import { validateAll, VALIDATION_NOTES } from '../analysis/validation.js';

export function renderValidationView(state) {
  const results = validateAll();

  const node = el('section', { class: 'section', id: 'sec-validation' },
    sectionHeader({
      title: 'Detector Validation Lab', eyebrow: 'Analysis',
      lede: 'Are the detectors any good? Each one is run over hundreds of deterministic clean and covert cases (parameter sweeps × seeds). This measures how well its score separates the two — and where it fails.',
      outcomes: [
        'read a **ROC curve, AUC, and confusion matrix** for each detector',
        'explain why an anomaly score is **not** a probability of a covert channel',
        'see honest failure modes: a parity channel and a noisy-image false positive',
      ],
    }),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Reading this lab' }),
      para('For every detector, the chain is explicit: a **published statistic** → **this implementation** → a **chosen threshold** → **measured behaviour** on a synthetic benchmark. AUC is the probability the score ranks a random covert case above a random clean one; the confusion matrix fixes a decision threshold and counts the outcomes.', undefined),
      el('ul', { class: 'block-list' }, ...VALIDATION_NOTES.map((n) => el('li', {}, ...inline(n))))),
    div({ class: 'validation-grid' }, ...results.map(detectorCard)));

  return { node, refresh() {} };
}

function detectorCard(r) {
  const c = r.confusion;
  const h = r.confusionHigh;
  const aucTone = r.auc >= 0.9 ? 'good' : r.auc >= 0.75 ? 'warn' : 'bad';
  return el('div', { class: 'card validation-card' },
    div({ class: 'val-head' },
      el('h3', { class: 'card-title', text: r.label }),
      div({ class: `val-auc ${aucTone}` }, span({ class: 'val-auc-num mono', text: r.auc.toFixed(3) }), span({ class: 'val-auc-lab', text: 'AUC' }))),
    para(`Statistic: ${r.method}. Benchmark: ${r.counts.covert} covert + ${r.counts.clean} clean cases.`, 'subtle'),
    div({ class: 'val-body' },
      rocChart(r.roc, r.auc),
      confusionMatrix(c)),
    div({ class: 'val-rates' },
      rate('False-positive rate', c.fpr, true),
      rate('False-negative rate', c.fnr, true),
      rate('Precision', c.precision, false),
      rate('Recall (TPR)', c.recall, false)),
    para(`Decision threshold ${c.threshold} (investigate). At threshold ${h.threshold} (high confidence): FPR ${pct(h.fpr)}, FNR ${pct(h.fnr)}.`, 'subtle'));
}

function rate(label, v, riskHi) {
  const tone = riskHi ? (v > 0.25 ? 'bad' : v > 0.05 ? 'warn' : 'good') : (v > 0.8 ? 'good' : v > 0.5 ? 'warn' : 'bad');
  return div({ class: 'val-rate' },
    span({ class: 'val-rate-label', text: label }),
    span({ class: `val-rate-val ${tone} mono`, text: pct(v) }));
}
function pct(v) { return `${Math.round(v * 100)}%`; }

/** ROC curve on a unit square with the chance diagonal. */
function rocChart(rocPoints, aucVal) {
  const S = 150;
  const pad = 22;
  const plot = S - pad * 2;
  const x = (fpr) => pad + fpr * plot;
  const y = (tpr) => S - pad - tpr * plot;
  const pts = rocPoints.slice().sort((a, b) => (a.fpr - b.fpr) || (a.tpr - b.tpr));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.fpr).toFixed(1)},${y(p.tpr).toFixed(1)}`).join(' ');
  return svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'roc-chart', role: 'img', 'aria-label': `ROC curve, area under curve ${aucVal.toFixed(3)}` },
    svg('rect', { x: pad, y: pad, width: plot, height: plot, fill: 'none', stroke: 'var(--border)', 'stroke-width': 1 }),
    svg('line', { x1: pad, y1: S - pad, x2: S - pad, y2: pad, stroke: 'var(--border-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
    svg('path', { d: path, fill: 'none', stroke: 'var(--covert)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svg('text', { x: S / 2, y: S - 4, 'text-anchor': 'middle', class: 'chart-xlabel' }, 'false-positive rate →'),
    svg('text', { x: 8, y: S / 2, 'text-anchor': 'middle', class: 'chart-xlabel', transform: `rotate(-90 8 ${S / 2})` }, 'true-positive rate →'));
}

/** 2×2 confusion matrix. */
function confusionMatrix(c) {
  const cell = (v, cls) => div({ class: `cm-cell ${cls}` }, span({ class: 'cm-v mono', text: String(v) }));
  return div({ class: 'confusion' },
    div({ class: 'cm-corner' }),
    div({ class: 'cm-colhead', text: 'Actual covert' }),
    div({ class: 'cm-colhead', text: 'Actual clean' }),
    div({ class: 'cm-rowhead', text: 'Flagged' }),
    cell(c.tp, 'tp'), cell(c.fp, 'fp'),
    div({ class: 'cm-rowhead', text: 'Cleared' }),
    cell(c.fn, 'fn'), cell(c.tn, 'tn'));
}
