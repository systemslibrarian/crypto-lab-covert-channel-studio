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
import { evaluateLearnedDetector } from '../analysis/learned.js';

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
    div({ class: 'validation-grid' }, ...results.map(detectorCard)),
    learnedSection());

  return { node, refresh() {} };
}

/* ---- the learned detector, next to the classical ones --------------------- */

/**
 * A fitted model beside the hand-built ones. The comparison is only fair
 * because both are scored by AUC, which uses the RANKING alone — the raw scores
 * do not mean the same thing and are never compared directly.
 */
function learnedSection() {
  const r = evaluateLearnedDetector();
  return el('div', { class: 'card learned-card' },
    el('h3', { class: 'card-title', text: 'A learned detector, measured the same way' }),
    para(`The detectors above are hand-built: a person chose the statistics and chose how to weigh them. This one fits the weighting from labelled examples instead — using the **same two features** as the timing detector (${r.features.join(' and ')}), so any difference comes from fitting alone.`, undefined),
    para(`Three sets: **${r.sets.train.n} training** cases, **${r.sets.test.n} held-out** cases from the same distribution, and **${r.sets.shift.n} shifted** cases drawn from processes no model was trained on — scheduled pollers, which are clean but metronomic, and narrow-separation channels, which are covert but subtle.`, 'subtle'),
    learnedTable(r),
    para('The first column means different things per row: for a fitted model it is performance on its own training data, and for the classical detector it is simply the same 12 cases, since it was never fitted to anything. Compare columns down, not the first column across.', 'subtle'),
    el('ul', { class: 'block-list' }, ...r.notes.map((n) => el('li', {}, ...inline(n)))));
}

function learnedTable(r) {
  const aucCell = (v, tone) => el('td', { class: `mono val-auc-cell ${tone || ''}` }, String(v.toFixed(3)));
  const toneFor = (v) => (v >= 0.9 ? 'good' : v >= 0.75 ? 'warn' : 'bad');
  const modelRow = (m) => el('tr', {},
    el('th', { scope: 'row' }, span({ text: m.label })),
    aucCell(m.auc.fit, toneFor(m.auc.fit)),
    aucCell(m.auc.test, toneFor(m.auc.test)),
    aucCell(m.auc.shift, toneFor(m.auc.shift)),
    el('td', { class: 'mono', text: m.generalisationGap.toFixed(3) }),
    el('td', { class: 'mono', text: m.weights.map((w) => round(w.weight, 2)).join(', ') }));
  return div({
    class: 'table-wrap',
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Learned detector versus the classical detector: area under curve on the training, held-out and shifted sets' },
  }, el('table', { class: 'data-table learned-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', text: 'Detector' }),
      el('th', { scope: 'col', text: 'AUC (fit set)' }),
      el('th', { scope: 'col', text: 'AUC (held out)' }),
      el('th', { scope: 'col', text: 'AUC (shifted)' }),
      el('th', { scope: 'col', text: 'Fit − held-out' }),
      el('th', { scope: 'col', text: 'Weights' }))),
    el('tbody', {},
      ...r.models.map(modelRow),
      el('tr', { class: 'classical-row' },
        el('th', { scope: 'row' }, span({ text: r.classical.label })),
        aucCell(r.classical.auc.fit, toneFor(r.classical.auc.fit)),
        aucCell(r.classical.auc.test, toneFor(r.classical.auc.test)),
        aucCell(r.classical.auc.shift, toneFor(r.classical.auc.shift)),
        el('td', { class: 'mono', text: '—' }),
        el('td', { class: 'mono', text: 'not fitted' })))));
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
