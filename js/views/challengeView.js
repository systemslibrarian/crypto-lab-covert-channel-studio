/**
 * views/challengeView.js — the blind, scored Detection Challenge.
 * The analyst sees only observables and commits to a call before the ground
 * truth (and the detector's own read) is revealed.
 */

import { el, div, span, replace, formatClock } from './dom.js';
import { sectionHeader, para, inline } from './blocks.js';
import { button, select } from './controls.js';
import { verticalBars } from './charts.js';
import { statTiles, observationList } from './widgets.js';
import { anomalyGauge } from './charts.js';
import { histogram, mean, minMax, round } from '../utils/statistics.js';
import { generateChallengeSet, scoreCall, INDICATORS } from '../analysis/challenge.js';

let nonce = 0;
let answers = {}; // caseId -> { call, indicator }

export function renderChallengeView(state) {
  const tally = div({ class: 'challenge-tally' });
  const listArea = div({ class: 'challenge-list' });
  let currentSet = [];
  let cur = state;

  const node = el('section', { class: 'section', id: 'sec-challenge' },
    sectionHeader({
      title: 'Detection Challenge', eyebrow: 'Analysis',
      lede: 'You are the analyst. Each case shows only what a monitor would see — no message, no bits, no “this is the covert one.” Read the traffic, commit to a call, then reveal the ground truth and how you did.',
      outcomes: [
        'make a clean / suspicious / covert call from **observables alone**',
        'name the indicator you would investigate',
        'weigh false positives (benign-but-busy traffic) against misses (subtle channels)',
      ],
    }),
    div({ class: 'challenge-bar' },
      button({ label: 'New case set', variant: 'primary', icon: '⟳', onClick: () => { nonce++; answers = {}; build(); } }),
      span({ class: 'subtle', text: 'Deterministic from the seed — the same seed always gives the same set.' })),
    tally,
    listArea);

  function build() {
    currentSet = generateChallengeSet(`${cur.seed}#${nonce}`, 6);
    renderTally();
    replace(listArea, ...currentSet.map((c) => caseCard(c)));
  }

  function renderTally() {
    let caught = 0; let missed = 0; let fp = 0; let cleanOk = 0; let answered = 0;
    for (const c of currentSet) {
      const a = answers[c.id];
      if (!a) continue;
      answered++;
      const s = scoreCall(a.call, c.reveal.truth);
      if (s.outcome === 'caught') caught++;
      else if (s.outcome === 'missed') missed++;
      else if (s.outcome === 'false-positive') fp++;
      else cleanOk++;
    }
    replace(tally,
      statTiles([
        { val: `${answered}/${currentSet.length}`, lab: 'answered' },
        { val: String(caught), lab: 'covert caught', tone: caught ? 'good' : undefined },
        { val: String(missed), lab: 'missed', tone: missed ? 'bad' : undefined },
        { val: String(fp), lab: 'false alarms', tone: fp ? 'bad' : undefined },
        { val: String(cleanOk), lab: 'clean cleared', tone: cleanOk ? 'good' : undefined },
      ]));
  }

  function caseCard(c) {
    const a = answers[c.id];
    const answered = !!a;
    return el('div', { class: 'card challenge-case' },
      div({ class: 'challenge-head' },
        el('h3', { class: 'card-title', text: `Case ${c.index + 1} · ${channelLabel(c.channel)} · ${c.title}` }),
        span({ class: 'sim-note', text: '' })),
      observablePanel(c.observables),
      answered ? revealPanel(c, a) : answerPanel(c));
  }

  function answerPanel(c) {
    let indicator = INDICATORS[c.channel][0];
    return div({ class: 'challenge-answer' },
      div({ class: 'challenge-q' }, span({ text: 'What’s the tell? ' }),
        select({ label: '', ariaLabel: 'What’s the tell?', value: indicator, options: INDICATORS[c.channel].map((x) => ({ value: x, label: x })), onChange: (v) => { indicator = v; } })),
      div({ class: 'challenge-calls' },
        callButton(c, 'clean', 'Clean', () => commit(c, 'clean', indicator)),
        callButton(c, 'suspicious', 'Suspicious', () => commit(c, 'suspicious', indicator)),
        callButton(c, 'covert', 'Covert-likely', () => commit(c, 'covert', indicator))));
  }

  function commit(c, call, indicator) {
    answers[c.id] = { call, indicator };
    // Re-render only this card + the tally.
    const idx = currentSet.findIndex((x) => x.id === c.id);
    const cards = listArea.childNodes;
    if (cards[idx]) replace(cards[idx], ...caseCard(c).childNodes);
    renderTally();
  }

  build();
  return {
    node,
    refresh(s) {
      // Editing the global seed regenerates the case set (answers reset);
      // other changes (message, params) don't affect the challenge.
      const seedChanged = s.seed !== cur.seed;
      cur = s;
      if (seedChanged) { answers = {}; build(); }
    },
  };
}

function callButton(c, key, label, onClick) {
  const tone = key === 'clean' ? 'ok' : key === 'covert' ? 'danger' : '';
  return button({ label, variant: tone, onClick });
}

function revealPanel(c, a) {
  const s = scoreCall(a.call, c.reveal.truth);
  const outcomeText = {
    caught: 'Caught it', missed: 'Missed it', 'false-positive': 'False alarm',
    'correct-clean': 'Correctly cleared', 'over-cautious': 'Over-cautious (but safe)',
  }[s.outcome];
  const namedMatch = indicatorMatches(a.indicator, c.reveal.firedIndicators);
  return div({ class: `challenge-reveal ${s.correct ? 'ok' : 'bad'}` },
    div({ class: 'reveal-verdict' },
      span({ class: `pill ${c.reveal.truth === 'covert' ? 'pill-high' : 'pill-ok'}`, text: c.reveal.truth === 'covert' ? 'Ground truth: COVERT' : 'Ground truth: CLEAN' }),
      span({ class: `pill ${s.correct ? 'pill-ok' : 'pill-high'}`, text: `Your call: ${a.call} — ${outcomeText}` })),
    c.reveal.decoded ? para(`Hidden message recovered: **${c.reveal.decoded}**`, 'subtle') : null,
    c.reveal.note ? para(`Teaching note: ${c.reveal.note}.`, 'subtle') : null,
    el('div', { class: 'reveal-detector' },
      el('h4', { class: 'card-title', text: 'What the educational detector saw' }),
      anomalyGauge(c.reveal.score, c.reveal.level, {}),
      c.reveal.firedIndicators.length
        ? div({ class: 'reveal-fired' }, span({ class: 'subtle', text: 'Indicators that fired: ' }),
            ...c.reveal.firedIndicators.map((f) => span({ class: 'pill pill-mod', text: shorten(f) })))
        : para('No indicator crossed its threshold — an honest low signal.', 'subtle'),
      div({ class: 'reveal-named' },
        ...inline(`You named **${a.indicator}** — ${namedMatch ? '**a tell that fired here.** ✓' : 'not the strongest signal in this case.'}`))));
}

/* ---- observable panels ---------------------------------------------------- */
function observablePanel(obs) {
  if (obs.type === 'dns') return dnsPanel(obs);
  if (obs.type === 'timing') return timingPanel(obs);
  if (obs.type === 'storage') return storagePanel(obs);
  if (obs.type === 'series') return seriesPanel(obs);
  if (obs.type === 'flows') return flowsPanel(obs);
  if (obs.type === 'icmp') return icmpPanel(obs);
  return null;
}

/** Protocol flows. Deliberately a plain log: finding the transition structure
 *  — and thinking to group by peer — is the exercise. */
function flowsPanel(obs) {
  const head = el('tr', {}, ...['Time', 'Protocol', 'Destination'].map((h) => el('th', { text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: formatClock(r.time) }),
    el('td', { class: 'mono', text: r.protocol.toUpperCase() }),
    el('td', { class: 'mono', text: r.dest })));
  const peers = new Set(obs.rows.map((r) => r.dest)).size;
  return div({},
    para(`${obs.count} outbound flows observed across ${peers} peer${peers === 1 ? '' : 's'}. No single flow is unusual — read the sequence, and consider reading it per destination.`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Outbound protocol flow log for this case' } },
      el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows))));
}

/** ICMP echoes. The head of each data area is shown after the timestamp. */
function icmpPanel(obs) {
  const head = el('tr', {}, ...['Seq', 'Identifier', 'Size', 'Destination', 'Data after timestamp'].map((h) => el('th', { text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: String(r.seq) }),
    el('td', { class: 'mono', text: `0x${r.identifier.toString(16).padStart(4, '0')}` }),
    el('td', { class: 'mono', text: `${r.bytes} B` }),
    el('td', { class: 'mono', text: r.dest }),
    el('td', { class: 'mono', text: r.head || '—' })));
  const sizes = new Set(obs.rows.map((r) => r.bytes)).size;
  return div({},
    para(`${obs.count} echo requests observed, ${sizes} distinct payload size${sizes === 1 ? '' : 's'}. A conventional ping repeats one size, one identifier, and the same fill bytes every time — an incrementing run starting 10 11 12 13.`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'ICMP echo log for this case' } },
      el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows))));
}

function dnsPanel(obs) {
  const head = el('tr', {}, ...['Time', 'Client', 'Query', 'Type', 'Len'].map((h) => el('th', { text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: formatClock(r.time) }),
    el('td', { class: 'mono', text: r.client }),
    el('td', { class: 'mono', attrs: { title: r.fqdn }, text: r.fqdn.length > 34 ? r.fqdn.slice(0, 31) + '…' : r.fqdn }),
    el('td', { class: 'mono', text: r.qtype }),
    el('td', { class: 'mono', text: String(r.len) })));
  return div({},
    para(`${obs.count} DNS queries observed.`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'DNS query log for this case' } },
      el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows))));
}

function timingPanel(obs) {
  const gaps = obs.gaps;
  const h = histogram(gaps, { bins: 16 });
  const bars = h.bins.map((b) => ({ label: '', value: b.count, title: `${b.count} gaps in [${b.start.toFixed(0)}–${b.end.toFixed(0)}] ms` }));
  const { min, max } = minMax(gaps);
  return div({},
    para(`${obs.count} inter-arrival gaps observed. Read the shape: one broad hump, or two tight spikes?`, 'subtle'),
    verticalBars(bars, { height: 130, color: 'var(--accent)', ariaLabel: 'Inter-arrival time histogram for this case' }),
    statTiles([
      { val: `${round(mean(gaps), 0)}ms`, lab: 'mean gap' },
      { val: `${min}–${max}`, lab: 'range (ms)' },
      { val: String(new Set(gaps.map((g) => Math.round(g / 20))).size), lab: 'coarse levels' },
    ]));
}

function seriesPanel(obs) {
  const v = obs.values;
  const h = histogram(v, { bins: 16 });
  const bars = h.bins.map((b) => ({ label: '', value: b.count, title: `${b.count} readings in [${b.start.toFixed(0)}–${b.end.toFixed(0)}] ${obs.unit}` }));
  const { min, max } = minMax(v);
  const mid = (min + max) / 2;
  const upper = v.filter((x) => x >= mid).length;
  return div({},
    para(`${obs.count} ${obs.label} observed. Read the shape: one hump, or two groups — and if two, are they used equally?`, 'subtle'),
    verticalBars(bars, { height: 130, color: 'var(--accent)', ariaLabel: `Histogram of ${obs.label} for this case` }),
    statTiles([
      { val: `${round(mean(v), 0)}`, lab: `mean (${obs.unit})` },
      { val: `${min}–${max}`, lab: `range (${obs.unit})` },
      { val: `${Math.round((upper / Math.max(1, v.length)) * 100)}%`, lab: 'in upper half' },
    ]));
}

function storagePanel(obs) {
  const head = el('tr', {}, ...['#', 'TTL', 'IP ID', 'Seq', 'Len'].map((h) => el('th', { text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: String(r.index) }),
    el('td', { class: 'mono', text: String(r.ttl) }),
    el('td', { class: 'mono', text: String(r.ipId) }),
    el('td', { class: 'mono', text: String(r.sequence) }),
    el('td', { class: 'mono', text: String(r.len) })));
  return div({},
    para(`${obs.count} packets observed. Any field taking only a couple of unusual values?`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Packet header fields for this case' } },
      el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows))));
}

/* ---- helpers -------------------------------------------------------------- */
function channelLabel(ch) {
  return {
    dns: 'DNS', timing: 'Timing', storage: 'Storage', physical: 'Air-gap optical',
    cache: 'Shared cache', hopping: 'Protocol hopping', icmp: 'ICMP echo',
  }[ch] || ch;
}
function shorten(s) { return s.length > 46 ? s.slice(0, 43) + '…' : s; }

const INDICATOR_KEYWORDS = {
  'Long / high-entropy labels': ['label', 'entropy', 'long'],
  'Character mix unlike hostnames': ['character', 'diverge', 'hostname'],
  'Almost no repeated names': ['unique', 'repeat'],
  'High query volume': ['rate', 'volume', 'per min'],
  'Metronomic cadence': ['cadence', 'regular'],
  'Two tight timing levels': ['cluster', 'two', 'level'],
  'Very low entropy (predictable)': ['entropy', 'predictable', 'conditional'],
  'Metronomic regularity': ['regular', 'cabuk'],
  'A field stuck on two odd values': ['ttl', 'adjacent', 'two'],
  'Tiny value support': ['support', 'distinct', 'uncommon'],
  'Skewed bit pattern': ['skew', 'bias'],
  'Never repeats a protocol': ['never repeats', 'stay put', 'self-transition'],
  'Transitions spread evenly': ['transition entropy', 'ceiling', 'distinct transitions'],
  'One peer unlike the others': ['peer', 'aggregated', 'split by'],
  'A fixed repeating rotation': ['fixed rotation', 'reuse only'],
  'Payload is not the standard fill': ['fill pattern', 'not the standard'],
  'Unusual or varying payload size': ['data areas average', 'distinct size', 'conventional sizes'],
  'Every echo carries different data': ['unique', 'data areas'],
  'More than one Echo Identifier': ['identifier'],
};
function indicatorMatches(named, fired) {
  const kws = INDICATOR_KEYWORDS[named];
  if (!kws) return false;
  const hay = fired.join(' ').toLowerCase();
  return kws.some((k) => hay.includes(k));
}
