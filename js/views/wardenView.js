/**
 * views/wardenView.js — the Active Warden / Normalizer Laboratory.
 *
 * One switch per normaliser action; every channel is re-run through the real
 * simulation each time, so the verdicts in the table are measured rather than
 * looked up.
 */

import { el, div, span, replace, tableCaption } from './dom.js';
import { sectionHeader, renderBlocks, para, callout } from './blocks.js';
import { toggle, controlGroup, button } from './controls.js';
import { statTiles, statusRegion } from './widgets.js';
import { COPY } from '../content/copy.js';
import { runWarden, WARDEN_ACTIONS } from '../analysis/warden.js';
import { round } from '../utils/statistics.js';

/** Section-local selection; the store holds per-channel controls, not this. */
let active = new Set();

/**
 * Every verdict `runWarden` can return needs an entry here. A missing one is not
 * a cosmetic gap: the table reads `.pill` off this object unguarded, so a
 * verdict the model can produce and the view has never heard of takes the whole
 * section down with a TypeError. That is exactly what happened when
 * 'rate-limited' was added to the model and not to this table, and it was hidden
 * by "Enable every action" (where the allow-list overrides the throttle and the
 * hopping row comes back 'closed'). test/wardenView.test.js now flips each
 * switch on its own so the same omission cannot reach a reader again.
 */
const VERDICT = {
  closed: { label: 'Closed', pill: 'pill-ok', note: 'under 5% of its original capacity survives' },
  residual: { label: 'Residual', pill: 'pill-mod', note: 'degraded, but still carrying information' },
  'rate-limited': { label: 'Rate-limited', pill: 'pill-mod', note: 'every bit still arrives, just more slowly' },
  survives: { label: 'Survives', pill: 'pill-high', note: 'largely unaffected' },
  untouched: { label: 'Not targeted', pill: 'pill-normal', note: 'no active action applies to this carrier' },
  'out-of-path': { label: 'Out of path', pill: 'pill-normal', note: 'a network warden is not positioned to act' },
};

export function renderWardenView(state) {
  const copy = COPY.warden;
  const switches = div({ class: 'warden-switches' });
  const results = div({});
  let cur = state;

  // One status region, built here and never replace()d — see statusRegion().
  // Flipping a switch rewrites twelve verdicts and five count tiles with nothing
  // said; this carries the tally, and only the tally.
  const status = statusRegion();

  const node = el('section', { class: 'section', id: 'sec-warden' },
    status.node,
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
  function drawResults() {
    const res = runWarden(cur.message, { seed: `${cur.seed}:warden`, active: [...active] });
    replace(results, resultsContent(res));
    const c = res.counts;
    status.announce(`${active.size} warden action${active.size === 1 ? '' : 's'} active: `
      + `${c.closed || 0} closed, ${c.residual || 0} residual, ${c['rate-limited'] || 0} rate-limited, `
      + `${(c.survives || 0) + (c.untouched || 0)} untouched, ${c['out-of-path'] || 0} out of path.`);
  }
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

function resultsContent(res) {
  const counts = res.counts;
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Outcome' }),
      statTiles([
        { val: String(counts.closed || 0), lab: 'closed', tone: 'good' },
        { val: String(counts.residual || 0), lab: 'residual', tone: (counts.residual || 0) ? 'bad' : undefined },
        { val: String(counts['rate-limited'] || 0), lab: 'rate-limited', tone: (counts['rate-limited'] || 0) ? 'bad' : undefined },
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
    rateLimitedCallout(res),
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

/**
 * The third shape of outcome, called out because a tile alone reads as a
 * smaller version of "closed" and it is not one: nothing was corrupted, so the
 * message still decodes exactly. Only the clock was attacked.
 */
function rateLimitedCallout(res) {
  const limited = res.rows.filter((r) => r.verdict === 'rate-limited');
  if (!limited.length) return null;
  const r = limited[0];
  const factor = r.after.residualBps > 0 ? r.before.residualBps / r.after.residualBps : 0;
  return callout({
    kind: 'key',
    title: 'Throttled, not closed',
    body: `${r.label} came through with **every bit intact** — its error rate is ${Math.round(r.after.ber * 100)}% and its per-symbol capacity is unchanged at ${round(r.after.residualBitsPerSymbol, 3)} bits. What fell is the rate: ${round(r.before.residualBps, 2)} → ${round(r.after.residualBps, 2)} bit/s, a factor of about ${round(factor, 1)}. Every other switch on this page attacks the SYMBOL and shows up as a rising error rate; this one attacks the CLOCK and does not. Read the verdict as what it says: a bitrate limit is a budget for a patient sender, not a barrier, and folding it in with "closed" would score a defence that slows an attacker as one that stops them.`,
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
    tableCaption('Effect of the active warden on each channel: residual capacity, error rate, observability and verdict'),
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
