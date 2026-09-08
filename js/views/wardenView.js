/**
 * views/wardenView.js — the Active Warden / Normalizer Laboratory.
 *
 * One switch per normaliser action; every channel is re-run through the real
 * simulation each time, so the verdicts in the table are measured rather than
 * looked up.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, callout } from './blocks.js';
import { toggle, controlGroup, button } from './controls.js';
import { statTiles } from './widgets.js';
import { COPY } from '../content/copy.js';
import { runWarden, WARDEN_ACTIONS } from '../analysis/warden.js';
import { round } from '../utils/statistics.js';

/** Section-local selection; the store holds per-channel controls, not this. */
let active = new Set();

const VERDICT = {
  closed: { label: 'Closed', pill: 'pill-ok', note: 'under 5% of its original capacity survives' },
  residual: { label: 'Residual', pill: 'pill-mod', note: 'degraded, but still carrying information' },
  survives: { label: 'Survives', pill: 'pill-high', note: 'largely unaffected' },
  untouched: { label: 'Not targeted', pill: 'pill-normal', note: 'no active action applies to this carrier' },
  'out-of-path': { label: 'Out of path', pill: 'pill-normal', note: 'a network warden is not positioned to act' },
};

export function renderWardenView(state) {
  const copy = COPY.warden;
  const switches = div({ class: 'warden-switches' });
  const results = div({});
  let cur = state;

  const node = el('section', { class: 'section', id: 'sec-warden' },
    sectionHeader({ ...copy, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' }, renderBlocks(copy.blocks)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Warden actions' }),
      para('Each switch is a rewrite the warden applies to everything passing through. Flip them one at a time first — each one closes exactly one carrier.', 'subtle'),
      switches,
      div({ class: 'warden-buttons' },
        button({
          label: 'Enable every action', variant: 'ghost', icon: '⛨',
          onClick: () => setAll(WARDEN_ACTIONS.map((a) => a.key)),
        }),
        button({
          label: 'Clear', variant: 'ghost', icon: '↺',
          onClick: () => setAll([]),
        }))),
    results);

  // Flipping one switch only needs the table redrawn; the bulk buttons change
  // the switch states themselves, so those redraw both.
  function drawResults() { replace(results, resultsContent(cur)); }
  function drawSwitches() {
    replace(switches, controlGroup(null, ...WARDEN_ACTIONS.map((a) => actionToggle(a, drawResults))));
  }
  function setAll(keys) { active = new Set(keys); drawSwitches(); drawResults(); }

  drawSwitches();
  drawResults();
  return { node, refresh(s) { cur = s; drawResults(); } };
}

function actionToggle(action, onChange) {
  return toggle({
    label: action.label,
    checked: active.has(action.key),
    help: `${action.what} — Cost: ${action.cost}`,
    onChange: (v) => { if (v) active.add(action.key); else active.delete(action.key); onChange(); },
  });
}

function resultsContent(state) {
  const res = runWarden(state.message, { seed: `${state.seed}:warden`, active: [...active] });
  const counts = res.counts;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Outcome' }),
      statTiles([
        { val: String(counts.closed || 0), lab: 'closed', tone: 'good' },
        { val: String(counts.residual || 0), lab: 'residual', tone: (counts.residual || 0) ? 'bad' : undefined },
        { val: String((counts.survives || 0) + (counts.untouched || 0)), lab: 'untouched' },
        { val: String(counts['out-of-path'] || 0), lab: 'out of path' },
      ]),
      wardenTable(res),
      para('Capacity is residual Shannon capacity, C = 1 − H₂(BER) bits per symbol, scaled by the channel’s symbol rate. Verdict thresholds (5% of original capacity = closed, 60% = residual) are teaching thresholds, not tuned operating points.', 'subtle')),
    res.silentKills.length
      ? callout({
        kind: 'warn',
        title: 'Closed quietly',
        body: `The warden closed ${listOf(res.silentKills)} **and lowered the anomaly indicator while doing it**. A defender running this normaliser gets a network where those attempts fail and no alert that anyone made them. If you want to know that someone tried, normalisation alone will not tell you.`,
      })
      : null,
    residualCallout(res),
    callout({
      kind: 'note',
      title: 'What a warden cannot reach',
      body: 'The air-gap optical and shared-cache rows never move, whatever is switched on. That is not a gap in the simulation — a normaliser rewrites packets on a network path, and neither of those carriers is on one. Enumerate the carriers before choosing the control.',
    }));
}

function residualCallout(res) {
  const residual = res.rows.filter((r) => r.verdict === 'residual');
  if (!residual.length) return null;
  const r = residual[0];
  return callout({
    kind: 'key',
    title: 'The residual channel',
    body: `${r.label} was degraded, not closed: its error rate rose to ${Math.round(r.after.ber * 100)}%, which still leaves **${round(r.after.residualBitsPerSymbol, 3)} bits per symbol** of Shannon capacity — about ${round(r.after.residualBps, 2)} bits per second. Timing channels degrade gracefully because the warden cannot delete a gap, only blur it, and blurring harder means buffering harder. This is the one defence on this page with an ongoing cost, and it still does not reach zero.`,
  });
}

function listOf(keys) {
  if (keys.length === 1) return `the ${keys[0]} channel`;
  return `the ${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]} channels`;
}

function wardenTable(res) {
  const row = (r) => {
    const v = VERDICT[r.verdict];
    const delta = r.observabilityDelta;
    return el('tr', {},
      el('th', { scope: 'row' }, span({ text: r.label })),
      el('td', { class: 'mono', text: fmtBps(r.before.residualBps) }),
      el('td', { class: 'mono', text: r.touched ? fmtBps(r.after.residualBps) : '—' }),
      el('td', { class: 'mono', text: r.touched ? `${Math.round(r.after.ber * 100)}%` : '—' }),
      el('td', { class: 'mono' },
        span({ text: String(r.before.obsScore) }),
        r.touched ? span({ text: ' → ' }) : null,
        r.touched ? span({ class: delta < 0 ? 'obs-drop' : '' }, String(r.after.obsScore)) : null),
      el('td', {},
        span({ class: `pill ${v.pill}`, text: v.label }),
        r.whyNot ? span({ class: 'warden-why', text: ` ${r.whyNot}` }) : null));
  };
  return div({
    class: 'table-wrap',
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Effect of the active warden on each channel: residual capacity, error rate, observability and verdict' },
  }, el('table', { class: 'data-table warden-table' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', text: 'Carrier' }),
      el('th', { scope: 'col', text: 'Capacity before' }),
      el('th', { scope: 'col', text: 'Capacity after' }),
      el('th', { scope: 'col', text: 'Error rate' }),
      el('th', { scope: 'col', text: 'Anomaly score' }),
      el('th', { scope: 'col', text: 'Verdict' }))),
    el('tbody', {}, ...res.rows.map(row))));
}

function fmtBps(v) {
  if (v <= 0) return '0 bit/s';
  if (v >= 1000) return `${round(v / 1000, 1)} kbit/s`;
  if (v >= 10) return `${Math.round(v)} bit/s`;
  return `${round(v, 2)} bit/s`;
}
