/**
 * views/charts.js — small, dependency-free SVG charts.
 *
 * Design follows the exhibit's dataviz rules: thin marks with rounded ends
 * anchored to a baseline, recessive axes, a legend whenever two series share a
 * plot, per-mark hover titles, and colour used only as a SECONDARY encoding
 * (every series also has a label/glyph). Charts scale to their container width
 * via a viewBox; callers give them a height.
 */

import { svg, el, div } from './dom.js';
import { histogram, minMax } from '../utils/statistics.js';

const VB_W = 320; // viewBox width in abstract units; CSS stretches to 100%

/**
 * Vertical bar chart.
 * @param {Array<{label?:string, value:number, color?:string, glyph?:string, title?:string}>} data
 * @param {{ height?:number, color?:string, maxValue?:number, ariaLabel?:string,
 *   showAxis?:boolean, unit?:string, showValue?:boolean }} [opts]
 * @returns {SVGElement}
 */
export function verticalBars(data, opts = {}) {
  const height = opts.height ?? 150;
  const color = opts.color ?? 'var(--accent)';
  const pad = { top: 10, bottom: opts.showAxis === false ? 6 : 22, left: 6, right: 6 };
  const plotH = height - pad.top - pad.bottom;
  const plotW = VB_W - pad.left - pad.right;
  const n = Math.max(1, data.length);
  const max = opts.maxValue ?? Math.max(1, ...data.map((d) => d.value));
  const slot = plotW / n;
  const barW = Math.min(slot * 0.72, 26);
  const radius = Math.min(3, barW / 2);

  const bars = data.map((d, i) => {
    const h = max > 0 ? (d.value / max) * plotH : 0;
    const x = pad.left + i * slot + (slot - barW) / 2;
    const y = pad.top + (plotH - h);
    const fill = d.color ?? color;
    const title = d.title ?? `${d.label ?? i}: ${d.value}${opts.unit ? ' ' + opts.unit : ''}`;
    return svg('g', {},
      svg('rect', {
        x, y: h < radius ? pad.top + plotH - radius : y, width: barW,
        height: Math.max(radius, h), rx: radius, ry: radius, fill,
      }, svg('title', { text: title })),
      opts.showValue && d.value > 0
        ? svg('text', { x: x + barW / 2, y: y - 3, 'text-anchor': 'middle', class: 'chart-val' }, String(d.value))
        : null,
      opts.showAxis !== false && d.label != null
        ? svg('text', { x: x + barW / 2, y: height - 7, 'text-anchor': 'middle', class: 'chart-xlabel' }, String(d.label))
        : null,
    );
  });

  return svg('svg', {
    viewBox: `0 0 ${VB_W} ${height}`, class: 'chart', role: 'img',
    'aria-label': opts.ariaLabel ?? 'bar chart', preserveAspectRatio: 'none',
  },
    // baseline
    svg('line', { x1: pad.left, y1: pad.top + plotH, x2: VB_W - pad.right, y2: pad.top + plotH, class: 'chart-axis' }),
    ...bars);
}

/**
 * Two histograms of value arrays drawn on a shared range (grouped bars) — used
 * for "normal vs covert" comparisons. Returns a figure with legend.
 * @param {number[]} valuesA
 * @param {number[]} valuesB
 * @param {Object} opts { labelA, labelB, colorA, colorB, bins, unit, height, ariaLabel, title }
 * @returns {HTMLElement}
 */
export function dualHistogram(valuesA, valuesB, opts = {}) {
  const bins = opts.bins ?? 16;
  const colorA = opts.colorA ?? 'var(--accent-2)';
  const colorB = opts.colorB ?? 'var(--covert)';
  const labelA = opts.labelA ?? 'A';
  const labelB = opts.labelB ?? 'B';
  const all = [...valuesA, ...valuesB];
  const { min, max } = minMax(all.length ? all : [0, 1]);
  const hA = histogram(valuesA, { bins, min, max });
  const hB = histogram(valuesB, { bins, min, max });
  const maxCount = Math.max(1, ...hA.bins.map((b) => b.count), ...hB.bins.map((b) => b.count));

  const height = opts.height ?? 150;
  const pad = { top: 10, bottom: 24, left: 6, right: 6 };
  const plotH = height - pad.top - pad.bottom;
  const plotW = VB_W - pad.left - pad.right;
  const slot = plotW / bins;
  const barW = Math.max(1.5, (slot - 2) / 2 - 0.5);

  const group = (h, fill, dx, name) => h.bins.map((b, i) => {
    const bh = (b.count / maxCount) * plotH;
    const x = pad.left + i * slot + dx;
    const y = pad.top + (plotH - bh);
    return svg('rect', {
      x, y: pad.top + plotH - Math.max(0, bh), width: barW, height: Math.max(0, bh),
      rx: 1.5, fill,
    }, svg('title', { text: `${name}: ${b.count} in [${b.start.toFixed(0)}–${b.end.toFixed(0)}]${opts.unit ? ' ' + opts.unit : ''}` }));
  });

  const chart = svg('svg', {
    viewBox: `0 0 ${VB_W} ${height}`, class: 'chart', role: 'img', preserveAspectRatio: 'none',
    'aria-label': opts.ariaLabel ?? `Distribution comparison of ${labelA} versus ${labelB}`,
  },
    svg('line', { x1: pad.left, y1: pad.top + plotH, x2: VB_W - pad.right, y2: pad.top + plotH, class: 'chart-axis' }),
    ...group(hA, colorA, 1, labelA),
    ...group(hB, colorB, 1 + barW + 1, labelB),
    svg('text', { x: pad.left, y: height - 6, class: 'chart-xlabel', 'text-anchor': 'start' }, `${min.toFixed(0)}${opts.unit ? ' ' + opts.unit : ''}`),
    svg('text', { x: VB_W - pad.right, y: height - 6, class: 'chart-xlabel', 'text-anchor': 'end' }, `${max.toFixed(0)}${opts.unit ? ' ' + opts.unit : ''}`),
  );

  return el('figure', { class: 'chart-figure' },
    opts.title ? el('figcaption', { class: 'chart-caption', text: opts.title }) : null,
    chart,
    legend([{ label: labelA, color: colorA }, { label: labelB, color: colorB }]),
  );
}

/** A legend row (color chip + text label). Identity is never colour-alone. */
export function legend(items) {
  return div({ class: 'chart-legend' },
    ...items.map((it) => div({ class: 'legend-item' },
      svg('svg', { width: 12, height: 12, class: 'legend-chip', 'aria-hidden': 'true' },
        svg('rect', { x: 1, y: 1, width: 10, height: 10, rx: 2, fill: it.color })),
      el('span', { text: it.label }))));
}

/**
 * Horizontal meter (0..1). Used for signal/noise, confidence, entropy, etc.
 * @param {number} value 0..1
 * @param {{ label?:string, valueText?:string, color?:string, height?:number, ariaLabel?:string }} [opts]
 */
export function horizontalMeter(value, opts = {}) {
  const v = Math.max(0, Math.min(1, value));
  const color = opts.color ?? 'var(--accent)';
  return div({ class: 'meter' },
    opts.label ? div({ class: 'meter-head' },
      el('span', { class: 'meter-label', text: opts.label }),
      el('span', { class: 'meter-value mono', text: opts.valueText ?? `${Math.round(v * 100)}%` })) : null,
    div({ class: 'meter-track', role: 'meter', attrs: { 'aria-valuenow': Math.round(v * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': opts.ariaLabel ?? opts.label ?? 'meter' } },
      div({ class: 'meter-fill', style: { width: `${v * 100}%`, background: color } })));
}

/**
 * The educational anomaly gauge: a 0..100 bar banded low/moderate/high with a
 * marker, the level label, and the standing disclaimer.
 * @param {number} score 0..100
 * @param {string} level 'low'|'moderate'|'high'
 * @param {{ disclaimer?:string, compact?:boolean }} [opts]
 */
export function anomalyGauge(score, level, opts = {}) {
  const s = Math.max(0, Math.min(100, score));
  const levelText = level === 'high' ? 'HIGH ANOMALY' : level === 'moderate' ? 'MODERATE ANOMALY' : 'LOW ANOMALY';
  return div({ class: `anomaly-gauge level-${level}` },
    div({ class: 'anomaly-head' },
      el('span', { class: 'anomaly-level', text: levelText }),
      el('span', { class: 'anomaly-score mono', text: `${Math.round(s)}/100` })),
    div({ class: 'anomaly-track', role: 'meter', attrs: { 'aria-valuenow': Math.round(s), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `Educational anomaly score ${Math.round(s)} of 100, ${levelText}` } },
      div({ class: 'anomaly-band band-low' }),
      div({ class: 'anomaly-band band-mod' }),
      div({ class: 'anomaly-band band-high' }),
      div({ class: 'anomaly-marker', style: { left: `${s}%` } })),
    !opts.compact ? el('p', { class: 'anomaly-disclaimer', text: opts.disclaimer ?? 'EDUCATIONAL INDICATOR — NOT A SECURITY VERDICT' }) : null);
}

/**
 * A compact sparkline-style line of stems for a sequence of values (e.g. gap
 * timeline). Not interactive; used as a quick shape indicator.
 */
export function stemLine(values, opts = {}) {
  const height = opts.height ?? 60;
  const color = opts.color ?? 'var(--accent)';
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const slot = (VB_W - 8) / n;
  return svg('svg', { viewBox: `0 0 ${VB_W} ${height}`, class: 'chart', preserveAspectRatio: 'none', role: 'img', 'aria-label': opts.ariaLabel ?? 'value sequence' },
    ...values.map((v, i) => {
      const h = (v / max) * (height - 10);
      const x = 4 + i * slot + slot / 2;
      return svg('line', { x1: x, y1: height - 4, x2: x, y2: height - 4 - h, stroke: color, 'stroke-width': Math.min(3, slot * 0.5), 'stroke-linecap': 'round' },
        svg('title', { text: `${opts.label ?? 'value'} ${i}: ${v}` }));
    }));
}
