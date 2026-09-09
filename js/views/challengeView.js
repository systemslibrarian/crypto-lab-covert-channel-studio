/**
 * views/challengeView.js — the blind, scored Detection Challenge.
 * The analyst sees only observables and commits to a call before the ground
 * truth (and the detector's own read) is revealed.
 */

import { el, div, span, replace, formatClock, tableCaption } from './dom.js';
import { sectionHeader, para, inline } from './blocks.js';
import { button, select } from './controls.js';
import { verticalBars } from './charts.js';
import { statTiles, observationList, statusRegion, simNote } from './widgets.js';
import { anomalyGauge } from './charts.js';
import { histogram, mean, minMax, round } from '../utils/statistics.js';
import { generateChallengeSet, scoreCall, INDICATORS } from '../analysis/challenge.js';

let nonce = 0;
let answers = {}; // caseId -> { call, indicator }

export function renderChallengeView(state) {
  const tally = div({ class: 'challenge-tally' });
  const listArea = div({ class: 'challenge-list' });
  const status = statusRegion();
  let currentSet = [];
  let cur = state;

  const node = el('section', { class: 'section', id: 'sec-challenge' },
    status.node,
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
      button({ label: 'New case set', variant: 'primary', icon: '⟳', onClick: () => { nonce++; answers = {}; build({ announce: true }); } }),
      // 3.2.2: editing the global Seed regenerates the set and discards every
      // committed answer. That is not a change of context in the WCAG sense, so
      // it is not a failure — but destroying the reader's work on a setting
      // change is exactly what the criterion is about, so it is advised here,
      // before use, and announced when it happens.
      span({ class: 'subtle', text: 'Deterministic from the seed — the same seed always gives the same set. Editing the Seed field generates a new set and clears your answers.' })),
    tally,
    listArea);

  function build(opts = {}) {
    currentSet = generateChallengeSet(`${cur.seed}#${nonce}`, 6);
    renderTally();
    replace(listArea, ...currentSet.map((c) => caseCard(c)));
    if (opts.announce) status.announce(`New case set generated: ${currentSet.length} cases, answers cleared.`);
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

  /** `refs`, when passed, is filled with the reveal node so commit() can focus it. */
  function caseCard(c, refs) {
    const a = answers[c.id];
    const answered = !!a;
    const reveal = answered ? revealPanel(c, a, progressText()) : null;
    if (refs) refs.reveal = reveal;
    return el('div', { class: 'card challenge-case' },
      div({ class: 'challenge-head' },
        el('h3', { class: 'card-title', text: `Case ${c.index + 1} · ${channelLabel(c.channel)} · ${c.title}` }),
        simNote()),
      observablePanel(c.observables),
      answered ? reveal : answerPanel(c));
  }

  function progressText() {
    const answered = currentSet.filter((x) => answers[x.id]).length;
    return `${answered} of ${currentSet.length} answered`;
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

  /**
   * Committing a call replaces the card, which destroys the button that was
   * just pressed — focus fell to <body> and the next Tab restarted at the top of
   * the document (2.4.3), while the reveal that appeared in its place said
   * nothing at all (4.1.3: "information about the results of an action"
   * presented without focus and with no status role).
   *
   * The fix is the one quizView already uses for its answers: the reveal is a
   * role="status" node that also RECEIVES focus. The focus move is the
   * load-bearing half — a live region inserted together with its text is not
   * reliably announced, because the region has to pre-exist the mutation — and
   * it puts the reader on the content they need to read next instead of at the
   * top of the page. Deliberately NOT live: listArea and the tally.
   */
  function commit(c, call, indicator) {
    answers[c.id] = { call, indicator };
    // Re-render only this card + the tally.
    const idx = currentSet.findIndex((x) => x.id === c.id);
    const cards = listArea.childNodes;
    const refs = {};
    const fresh = caseCard(c, refs);
    if (cards[idx]) replace(cards[idx], ...fresh.childNodes);
    renderTally();
    if (refs.reveal && typeof refs.reveal.focus === 'function') refs.reveal.focus();
  }

  build();
  return {
    node,
    refresh(s) {
      // Editing the global seed regenerates the case set (answers reset);
      // other changes (message, params) don't affect the challenge.
      const seedChanged = s.seed !== cur.seed;
      cur = s;
      if (seedChanged) { answers = {}; build({ announce: true }); }
    },
  };
}

function callButton(c, key, label, onClick) {
  const tone = key === 'clean' ? 'ok' : key === 'covert' ? 'danger' : '';
  return button({ label, variant: tone, onClick });
}

function revealPanel(c, a, progress) {
  const s = scoreCall(a.call, c.reveal.truth);
  const outcomeText = {
    caught: 'Caught it', missed: 'Missed it', 'false-positive': 'False alarm',
    'correct-clean': 'Correctly cleared', 'over-cautious': 'Over-cautious (but safe)',
  }[s.outcome];
  const namedMatch = indicatorMatches(a.indicator, c.reveal.firedIndicators);
  // A plain-text summary FIRST, so the announcement (and the reader focused
  // here) leads with the outcome rather than with a row of pills.
  const summary = [
    `${outcomeText}.`,
    `Ground truth: ${c.reveal.truth === 'covert' ? 'covert' : 'clean'}.`,
    `Your call: ${a.call}.`,
    `You named ${a.indicator} — ${namedMatch ? 'a tell that fired here' : 'not the strongest signal in this case'}.`,
    progress ? `${progress}.` : null,
  ].filter(Boolean).join(' ');
  // tabindex on the PANEL (commit() focuses it, which is what reliably reads the
  // result); role=status on the one-sentence SUMMARY only. Putting the status
  // role on the whole panel — pills, gauge, teaching note, fired indicators —
  // would have it read in full on insertion and then again on focus. The
  // summary alone is the status message: the result of the action, in a
  // sentence.
  return div({
    class: `challenge-reveal ${s.correct ? 'ok' : 'bad'}`,
    attrs: { tabindex: '-1' },
  },
    el('p', { class: 'visually-hidden', attrs: { role: 'status', 'aria-live': 'polite' }, text: summary }),
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
  const head = el('tr', {}, ...['Time', 'Protocol', 'Destination'].map((h) => el('th', { scope: 'col', text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: formatClock(r.time) }),
    el('td', { class: 'mono', text: r.protocol.toUpperCase() }),
    el('td', { class: 'mono', text: r.dest })));
  const peers = new Set(obs.rows.map((r) => r.dest)).size;
  return div({},
    para(`${obs.count} outbound flows observed across ${peers} peer${peers === 1 ? '' : 's'}. No single flow is unusual — read the sequence, and consider reading it per destination.`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Outbound protocol flow log for this case' } },
      el('table', { class: 'data-table' }, tableCaption('Outbound protocol flow log for this case'), el('thead', {}, head), el('tbody', {}, ...rows))));
}

/** ICMP echoes. The head of each data area is shown after the timestamp. */
function icmpPanel(obs) {
  const head = el('tr', {}, ...['Seq', 'Identifier', 'Size', 'Destination', 'Data after timestamp'].map((h) => el('th', { scope: 'col', text: h })));
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
      el('table', { class: 'data-table' }, tableCaption('ICMP echo log for this case'), el('thead', {}, head), el('tbody', {}, ...rows))));
}

function dnsPanel(obs) {
  const head = el('tr', {}, ...['Time', 'Client', 'Query', 'Type', 'Len'].map((h) => el('th', { scope: 'col', text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: formatClock(r.time) }),
    el('td', { class: 'mono', text: r.client }),
    el('td', { class: 'mono', attrs: { title: r.fqdn } }, truncatedName(r.fqdn, 34, 31)),
    el('td', { class: 'mono', text: r.qtype }),
    el('td', { class: 'mono', text: String(r.len) })));
  return div({},
    para(`${obs.count} DNS queries observed.`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'DNS query log for this case' } },
      el('table', { class: 'data-table' }, tableCaption('DNS query log for this case'), el('thead', {}, head), el('tbody', {}, ...rows))));
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
  const head = el('tr', {}, ...['#', 'TTL', 'IP ID', 'Seq', 'Len'].map((h) => el('th', { scope: 'col', text: h })));
  const rows = obs.rows.map((r) => el('tr', {},
    el('td', { class: 'mono', text: String(r.index) }),
    el('td', { class: 'mono', text: String(r.ttl) }),
    el('td', { class: 'mono', text: String(r.ipId) }),
    el('td', { class: 'mono', text: String(r.sequence) }),
    el('td', { class: 'mono', text: String(r.len) })));
  return div({},
    para(`${obs.count} packets observed. Any field taking only a couple of unusual values?`, 'subtle'),
    div({ class: 'table-wrap', style: { maxHeight: '260px', overflowY: 'auto' }, attrs: { tabindex: '0', role: 'region', 'aria-label': 'Packet header fields for this case' } },
      el('table', { class: 'data-table' }, tableCaption('Packet header fields for this case'), el('thead', {}, head), el('tbody', {}, ...rows))));
}

/* ---- helpers -------------------------------------------------------------- */
function channelLabel(ch) {
  return {
    dns: 'DNS', timing: 'Timing', storage: 'Storage', physical: 'Air-gap optical',
    cache: 'Shared cache', hopping: 'Protocol hopping', icmp: 'ICMP echo',
  }[ch] || ch;
}
function shorten(s) { return s.length > 46 ? s.slice(0, 43) + '…' : s; }

/**
 * A visually truncated name whose FULL value is still in the accessibility tree.
 * The `title` attribute is a mouse-only affordance — browsers do not surface it
 * on focus, touch has no hover, and on a <td> that already has text it becomes
 * an accessible *description* most screen readers skip by default. So the
 * ellipsised form is hidden from AT and the whole name is exposed beside it.
 */
function truncatedName(name, limit, cut) {
  if (name.length <= limit) return span({ text: name });
  return span({},
    span({ 'aria-hidden': 'true', text: `${name.slice(0, cut)}…` }),
    span({ class: 'visually-hidden', text: name }));
}

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
