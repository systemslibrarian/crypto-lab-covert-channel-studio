/**
 * views/srmView.js — Kemmerer's Shared Resource Matrix as a playable exercise.
 *
 * Mark which subject can Reference (R) or Modify (M) each shared attribute. A
 * potential covert channel exists for an attribute when a HIGH subject can
 * Modify it and a LOW subject can Reference it — information flows High → Low
 * through a resource neither was meant to communicate through. Storage vs timing
 * follows the attribute's nature.
 *
 * Reference: R. A. Kemmerer, "Shared Resource Matrix Methodology", ACM TOCS, 1983.
 */

import { el, div, span, replace, tableCaption } from './dom.js';
import { sectionHeader, para, callout, inline } from './blocks.js';
import { button } from './controls.js';
import { statusRegion } from './widgets.js';

const SUBJECTS = [
  { id: 'high', label: 'Secret task', level: 'High' },
  { id: 'low', label: 'Public task', level: 'Low' },
];

const ATTRIBUTES = [
  { id: 'lock', label: 'Shared file lock (held / free)', kind: 'storage' },
  { id: 'diskfull', label: '“Disk full” flag', kind: 'storage' },
  { id: 'table', label: 'Rows in a shared table', kind: 'storage' },
  { id: 'latency', label: 'Server response latency', kind: 'timing' },
  { id: 'queue', label: 'Shared print-queue length', kind: 'storage' },
];

// A starting scenario. Two attributes already form a channel (lock, latency);
// the learner can toggle cells and watch channels appear and disappear.
const INITIAL = {
  // A storage channel: High holds/frees the lock, Low tests it.
  'lock:high': { R: false, M: true }, 'lock:low': { R: true, M: false },
  // Both read it, only Low modifies -> a Low->High flow, not a secret leak.
  'diskfull:high': { R: true, M: false }, 'diskfull:low': { R: true, M: true },
  // High modifies, but Low cannot read it -> no channel here.
  'table:high': { R: true, M: true }, 'table:low': { R: false, M: true },
  // A timing channel: High hogs the CPU, Low measures latency.
  'latency:high': { R: false, M: true }, 'latency:low': { R: true, M: false },
  // Both read, only Low modifies -> no High->Low leak.
  'queue:high': { R: true, M: false }, 'queue:low': { R: true, M: true },
};

let matrix = null;

function key(a, s) { return `${a}:${s}`; }
function cell(a, s) { return matrix[key(a, s)] || (matrix[key(a, s)] = { R: false, M: false }); }

export function renderSrmView(state) {
  matrix = structuredClone(INITIAL);
  const matrixArea = div({});
  const findingsArea = div({});
  const status = statusRegion();

  const node = el('section', { class: 'section', id: 'sec-srm' },
    status.node,
    sectionHeader({
      title: 'Shared-Resource Matrix', eyebrow: 'Analysis',
      lede: 'How trusted-system evaluators actually hunt covert channels. Mark which task can Reference (R) or Modify (M) each shared attribute; the matrix flags any attribute a High task can modify and a Low task can read.',
    }),
    div({ class: 'prose-wide' },
      para('A potential covert channel exists when information can flow **High → Low** through a shared attribute: the secret task **modifies** it, the public task **reads** it. Toggle cells below and watch channels appear and disappear — then decide whether each is a **storage** or **timing** channel.', undefined)),
    el('div', { class: 'card' }, matrixArea),
    findingsArea,
    callout({ kind: 'note', title: 'Why this is the real method', body: 'The Shared Resource Matrix (Kemmerer, 1983) underpins covert-channel analysis in evaluated systems and lives on in guidance like NCSC-TG-030 and NIST SP 800-53 control SC-31 (Covert Channel Analysis). Finding the channel is step one; estimating its bandwidth and deciding whether to close, audit, or accept it is step two.' }));

  /**
   * The matrix is built ONCE and updated in place.
   *
   * It used to be rebuilt on every toggle, which removed all twenty R/M buttons
   * — including the one the user had just activated — so focus fell to <body>
   * and the next Tab restarted at the top of the document (2.4.3). This section
   * is nothing but repeated toggling, so that cost a full return trip through
   * thirty-odd tab stops per cell. Nothing about a cell toggle requires new
   * nodes: only the row's channel flag, the row class, and the findings list
   * derive from it.
   */
  const rowRefs = new Map();

  function render() {
    for (const a of ATTRIBUTES) {
      const ref = rowRefs.get(a.id);
      if (!ref) continue;
      const chan = channelFor(a);
      ref.tr.className = chan ? 'srm-channel-row' : '';
      ref.flag.textContent = chan ? ' ⚠ channel' : '';
    }
    replace(findingsArea, findings());
    const n = ATTRIBUTES.filter(channelFor).length;
    status.announce(n === 0
      ? 'No potential channels in the current matrix.'
      : `${n} potential channel${n === 1 ? '' : 's'} found: ${ATTRIBUTES.filter(channelFor).map((a) => a.label).join(', ')}.`);
  }

  function matrixTable() {
    const head = el('tr', {},
      el('th', { scope: 'col', text: 'Shared attribute' }),
      ...SUBJECTS.map((s) => el('th', { scope: 'col' }, span({ text: s.label }), span({ class: 'srm-level', text: ` (${s.level})` }))),
      el('th', { scope: 'col', text: 'Kind' }));
    const rows = ATTRIBUTES.map((a) => {
      const chan = channelFor(a);
      // The ⚠ flag node is permanent; only its text changes, so the row header
      // (and every button in the row) survives a toggle.
      const flag = span({ class: 'srm-flag', text: chan ? ' ⚠ channel' : '' });
      const tr = el('tr', { class: chan ? 'srm-channel-row' : '' },
        // The attribute names the row — a header cell, not a styled <td> (1.3.1).
        el('th', { scope: 'row' }, span({ text: a.label }), flag),
        ...SUBJECTS.map((s) => el('td', { class: 'srm-cell' }, rmToggle(a, s, render))),
        el('td', {}, span({ class: `pill ${a.kind === 'timing' ? 'pill-mod' : 'pill-normal'}`, text: a.kind })));
      rowRefs.set(a.id, { tr, flag });
      return tr;
    });
    return div({ class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Shared-resource matrix' } },
      el('table', { class: 'data-table srm-table' },
        tableCaption('Shared-resource matrix: which task can reference or modify each shared attribute'),
        el('thead', {}, head), el('tbody', {}, ...rows)));
  }

  function findings() {
    const chans = ATTRIBUTES.map((a) => ({ a, c: channelFor(a) })).filter((x) => x.c);
    if (chans.length === 0) {
      return el('div', { class: 'card' }, para('No potential channels in the current matrix. Give the Secret task a **Modify** and the Public task a **Read** on the same attribute to open one.', 'subtle'));
    }
    return el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: `${chans.length} potential channel${chans.length === 1 ? '' : 's'} found` }),
      ...chans.map(({ a, c }) => div({ class: 'srm-finding' },
        el('div', { class: 'srm-finding-head' },
          span({ class: 'srm-finding-name', text: a.label }),
          span({ class: `pill ${a.kind === 'timing' ? 'pill-mod' : 'pill-normal'}`, text: `${a.kind} channel` })),
        el('p', {}, ...inline(`**Secret task modifies** this attribute and the **Public task reads** it — a High → Low flow. ${bandwidthNote(a)}`)))));
  }

  replace(matrixArea, matrixTable());
  render();
  return { node, refresh() {} };
}

/** Channel criterion: High modifies AND Low references the same attribute. */
function channelFor(a) {
  const highM = cell(a.id, 'high').M;
  const lowR = cell(a.id, 'low').R;
  return highM && lowR;
}

function bandwidthNote(a) {
  return a.kind === 'timing'
    ? 'Illustrative capacity is low and noisy — one bit per observable timing difference, easily swamped by scheduling.'
    : 'Illustrative capacity is up to one bit per modify → read cycle; the faster the resource can flip, the higher the rate.';
}

function rmToggle(a, s, onChange) {
  const c = cell(a.id, s.id);
  const mk = (flag, label) => {
    // The button updates ITSELF (class + aria-pressed) and then asks the section
    // to recompute what derives from it. It is never replaced, so it keeps focus.
    const btn = el('button', {
      class: `srm-rm${c[flag] ? ' on' : ''}`, type: 'button',
      attrs: { 'aria-pressed': c[flag] ? 'true' : 'false', 'aria-label': `${label} — ${a.label} — ${s.label}` },
      on: {
        click: () => {
          c[flag] = !c[flag];
          btn.className = `srm-rm${c[flag] ? ' on' : ''}`;
          btn.setAttribute('aria-pressed', c[flag] ? 'true' : 'false');
          onChange();
        },
      },
    }, label);
    return btn;
  };
  return div({ class: 'srm-rm-pair' }, mk('R', 'R'), mk('M', 'M'));
}
