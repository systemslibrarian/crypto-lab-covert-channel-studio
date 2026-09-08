/**
 * views/tradeoffView.js — the live capacity/reliability/observability instrument
 * and its trade-off curve, computed from the actual simulation.
 */

import { el, div, span, svg } from './dom.js';
import { horizontalMeter, legend } from './charts.js';
import { para } from './blocks.js';
import { button } from './controls.js';
import { round } from '../utils/statistics.js';
import { computeTradeoff, sweepTradeoff, SWEEP } from '../analysis/tradeoff.js';

const CHANNEL_LABEL = { dns: 'DNS', icmp: 'ICMP echo', timing: 'Timing', storage: 'Storage', ordering: 'Packet ordering', http: 'HTTP header order', hopping: 'Protocol hopping', physical: 'Air-gap optical', cache: 'Shared cache' };

/**
 * A full trade-off card for a channel: three live meters + (where a natural knob
 * exists) the observability/BER curve as that knob is swept.
 * @param {string} channel
 * @param {string} message
 * @param {Object} params  channel params incl. seed
 */
export function tradeoffInstrument(channel, message, params) {
  const t = computeTradeoff(channel, message, params);
  const cap = t.capacity;
  const rel = t.reliability;
  const obs = t.observability;

  const meters = div({ class: 'tri-meters' },
    horizontalMeter(cap.norm, {
      label: 'Capacity — effective goodput',
      valueText: `${round(cap.goodputBps, 0)} bits/s · ${round(cap.bitsPerEvent, 2)}/${cap.eventLabel}`,
      color: 'var(--accent)',
    }),
    horizontalMeter(rel.successRate, {
      label: 'Reliability — survives the network',
      valueText: `BER ${round((rel.ber ?? 0) * 100, 0)}%`,
      color: 'var(--accent-2)',
    }),
    horizontalMeter(obs.norm, {
      label: 'Observability — visible to a defender',
      valueText: `${obs.score}/100 (${obs.level})`,
      color: 'var(--covert)',
    }));

  const children = [
    el('h3', { class: 'card-title', text: 'Trade-off — capacity · reliability · observability' }),
    meters,
    capacityBreakdown(cap),
  ];

  if (cap.ceilingBits !== undefined) {
    children.push(para(`This toy encoder carries **${cap.achievedBits} bits** across ${message ? [...message].length : 0} characters; full permutations of the same events could hold **${cap.ceilingBits} bits** (⌊log₂ n!⌋) — capacity traded for simplicity.`, 'subtle'));
  }

  if (SWEEP[channel]) {
    const points = sweepTradeoff(channel, message, params);
    children.push(el('h4', { class: 'card-title', style: { marginTop: 'var(--sp-4)' }, text: `Push one knob: ${SWEEP[channel].label}` }));
    children.push(tradeoffCurve(points, SWEEP[channel].label));
    children.push(para(curveCaption(channel), 'subtle'));
  } else {
    const cap = fallbackCaption(channel);
    if (cap) children.push(para(cap, 'subtle'));
  }

  children.push(labNotebook(channel, message, t));

  return el('div', { class: 'card tradeoff-card' }, ...children);
}

/** An exportable, reproducible record of this run — for a take-home / instructor. */
function labNotebook(channel, message, t) {
  const md = buildNotebook(channel, message, t);
  const copyBtn = button({
    label: 'Copy Markdown', variant: 'ghost', icon: '⧉',
    onClick: (e) => {
      const b = e.target.closest('button');
      const done = () => { if (b) { const s = b.querySelector('span:last-child'); if (s) { s.textContent = 'Copied!'; setTimeout(() => { s.textContent = 'Copy Markdown'; }, 1500); } } };
      try { navigator.clipboard.writeText(md).then(done, () => {}); } catch { /* the <pre> is selectable as a fallback */ }
    },
  });
  return el('details', { class: 'notebook' },
    el('summary', { class: 'notebook-summary', text: 'Lab notebook — export this run' }),
    div({ class: 'notebook-body' },
      div({ class: 'notebook-actions' }, copyBtn,
        span({ class: 'subtle', text: 'Reproducible: the link, seed, and settings replay this exact run.' })),
      el('pre', { class: 'notebook-md' }, el('code', { text: md }))));
}

function buildNotebook(channel, message, t) {
  const run = t.run;
  const L = [];
  L.push('# Covert Channel Studio — lab notebook', '');
  L.push(`- Channel: ${CHANNEL_LABEL[channel] || channel}`);
  L.push(`- Message: ${JSON.stringify(message)}`);
  const href = safeHref();
  if (href) L.push(`- Shareable link: ${href}`);
  try { L.push(`- Captured: ${new Date().toISOString()}`); } catch { /* no clock */ }
  L.push('', '## Result');
  L.push(`- Decoded: ${JSON.stringify(run.decodedText)}${run.bitErrors != null ? ` (${run.bitErrors} bit errors)` : ''}`);
  L.push(`- Capacity (${round(t.capacity.bitsPerEvent, 2)}/${t.capacity.eventLabel}) — theoretical ${round(t.capacity.theoreticalBps, 1)} b/s · raw ${round(t.capacity.rawBps, 1)} b/s · effective goodput ${round(t.capacity.goodputBps, 1)} b/s`);
  if (t.capacity.ceilingBits !== undefined) L.push(`- Ordering capacity ceiling: ${t.capacity.ceilingBits} bits (⌊log2 n!⌋)`);
  L.push(`- Reliability: bit-error rate ${round((t.reliability.ber || 0) * 100, 0)}%`);
  L.push(`- Observability: ${t.observability.score}/100 (${t.observability.level})`);
  if (run.detector && run.detector.methods && run.detector.methods.length) {
    L.push('', '### Detector methods');
    for (const m of run.detector.methods) L.push(`- ${m.name} (${m.citation}): ${m.value}`);
  }
  L.push('', '_Educational indicator — not a security verdict. All traffic is simulated in-browser; nothing is sent._');
  return L.join('\n');
}

function safeHref() {
  try { return location.href; } catch { return ''; }
}

/** Theoretical vs raw throughput vs effective goodput — three explicit numbers. */
function capacityBreakdown(cap) {
  const rows = [
    ['Theoretical', cap.theoreticalBps, 'structural maximum for this carrier'],
    ['Raw throughput', cap.rawBps, 'what this encoder emits'],
    ['Effective goodput', cap.goodputBps, 'recovered correctly, after errors/normalisation'],
  ];
  return div({ class: 'cap-breakdown' },
    ...rows.map(([label, v, note]) => div({ class: 'cap-row' },
      span({ class: 'cap-label', text: label }),
      span({ class: 'cap-val mono', text: `${round(v, 1)} bits/s` }),
      span({ class: 'cap-note subtle', text: note }))));
}

function fallbackCaption(channel) {
  switch (channel) {
    case 'storage': return 'Storage capacity is one bit per packet; reliability holds until a middlebox rewrites the field, at which point bit errors jump. Try the middlebox toggles.';
    case 'http': return 'Header order carries ~9 bits per request; a normalizing proxy that re-sorts headers collapses the channel entirely.';
    default: return '';
  }
}

function curveCaption(channel) {
  switch (channel) {
    case 'timing': return 'As jitter rises, bit errors climb AND the detector score falls — past a point the receiver and the defender both lose the signal.';
    case 'dns': return 'Longer labels carry more per query, but the detector score rises with them: capacity and observability move together.';
    case 'ordering': return 'More reordering means more bit errors; the ordering structure stays visible until reliability has already collapsed.';
    case 'icmp': return 'This curve is flat on purpose. Burying the tunnel in more ordinary ping traffic does not lower the indicator at all, because the detector groups by destination before it measures anything — dilution defeats an aggregate, not an analyst who pivots.';
    case 'hopping': return 'Loss barely dents the rate but wrecks the message: the state machine resynchronises while the bit positions do not, so every symbol after a dropped flow lands in the wrong place.';
    case 'physical': return 'As ambient light rises, bit errors climb and the two luminance levels smear together — the receiver and the sensor lose the signal at much the same point.';
    case 'cache': return 'As co-tenant jitter rises, the hit and miss classes overlap: bit errors climb while the latency histogram stops looking cleanly separated.';
    default: return '';
  }
}

/**
 * Dual-line curve on a single 0..100 axis: observability score and bit-error-%
 * versus the swept knob. One axis, two lines, legend — never dual-axis.
 */
export function tradeoffCurve(points, xLabel) {
  const W = 320;
  const H = 150;
  const pad = { top: 10, bottom: 26, left: 30, right: 8 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const n = points.length;
  if (n < 2) return div({ class: 'empty-note', text: 'not enough points' });

  const xAt = (i) => pad.left + (plotW * i) / (n - 1);
  const yAt = (v) => pad.top + plotH * (1 - v / 100); // v in 0..100

  const linePath = (getV) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(getV(p)).toFixed(1)}`).join(' ');
  const obsPath = linePath((p) => Math.max(0, Math.min(100, p.obsScore)));
  const berPath = linePath((p) => Math.max(0, Math.min(100, (p.ber ?? 0) * 100)));

  const gridLines = [0, 25, 50, 75, 100].map((v) =>
    svg('g', {},
      svg('line', { x1: pad.left, y1: yAt(v), x2: W - pad.right, y2: yAt(v), class: 'chart-grid' }),
      svg('text', { x: pad.left - 4, y: yAt(v) + 3, 'text-anchor': 'end', class: 'chart-xlabel' }, String(v))));

  const dots = (getV, color) => points.map((p, i) =>
    svg('circle', { cx: xAt(i), cy: yAt(getV(p)), r: 3, fill: color },
      svg('title', { text: `${xLabel} ${p.x}: ${Math.round(getV(p))}` })));

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', preserveAspectRatio: 'none', role: 'img', 'aria-label': `Trade-off curve of observability score and bit-error percentage versus ${xLabel}` },
    ...gridLines,
    svg('path', { d: berPath, fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svg('path', { d: obsPath, fill: 'none', stroke: 'var(--covert)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    ...dots((p) => (p.ber ?? 0) * 100, 'var(--accent-2)'),
    ...dots((p) => p.obsScore, 'var(--covert)'),
    svg('text', { x: pad.left, y: H - 6, class: 'chart-xlabel', 'text-anchor': 'start' }, String(points[0].x)),
    svg('text', { x: W - pad.right, y: H - 6, class: 'chart-xlabel', 'text-anchor': 'end' }, String(points[n - 1].x)));

  return el('figure', { class: 'chart-figure' },
    chart,
    div({ class: 'curve-xlabel subtle', text: xLabel + ' →' }),
    legend([{ label: 'Observability (0–100)', color: 'var(--covert)' }, { label: 'Bit errors (%)', color: 'var(--accent-2)' }]));
}
