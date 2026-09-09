/**
 * views/icmpView.js — the ICMP echo channel module.
 *
 * The module is built around a contrast: the same message goes out either in
 * the echo data area (loud, fast) or in one bit of the Echo Identifier (quiet,
 * slow), and the two defences on the left each kill exactly one of them.
 */

import { el, div, span, replace, tableCaption } from './dom.js';
import { sectionHeader, para, calloutChip, bitRibbon } from './blocks.js';
import { panel, controlGroup, slider, toggle, segmented, button } from './controls.js';
import {
  metricList, anomalyPanel, recoveredBox, modeBanner, statTiles,
  statusRegion, anomalyPhrase, recoveredPhrase, errorPhrase, simNote,
} from './widgets.js';
import { verticalBars } from './charts.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import {
  simulateIcmpRun, FIELDS, STANDARD_PAYLOAD_BYTES, TIMESTAMP_BYTES,
} from '../channels/icmp.js';
import { analyzeIcmp } from '../detectors/icmpDetector.js';
import { round } from '../utils/statistics.js';
import { getState, setChannelParam, resetChannel, VIEW_MODES } from '../state.js';

export function renderIcmpView(state) {
  const copy = COPY.icmp;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });
  // One status region, built here and never replace()d — see statusRegion().
  const status = statusRegion();
  // Two sliders whose `disabled` depends on ANOTHER control. leftPanel is built
  // once (so controls keep focus), so those flags were frozen at build time:
  // switching the clamp on left "Clamp size" permanently disabled, and switching
  // the carrier field away from the data area left "Message bytes per echo"
  // enabled. Keeping the input nodes lets refresh() update them in place —
  // without rebuilding the panel and dropping focus.
  const refs = { chunk: {}, clamp: {} };

  const node = el('section', { class: 'section', id: 'sec-icmp' },
    status.node,
    sectionHeader({ ...copy, eyebrow: 'Protocol payload' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state, refs), center, right));

  /** Reflect live state onto a control that was built with a stale snapshot. */
  function syncControl(ref, isDisabled, helpText) {
    if (!ref.input) return;
    ref.input.disabled = !!isDisabled;
    if (isDisabled) ref.input.setAttribute('disabled', '');
    else ref.input.removeAttribute('disabled');
    if (ref.node) ref.node.className = `ctrl${isDisabled ? ' is-disabled' : ''}`;
    if (ref.help && helpText) ref.help.textContent = helpText;
  }

  function refresh(s) {
    const p = s.channels.icmp;
    const run = simulateIcmpRun(s.message, runParams(s));
    syncControl(refs.chunk, p.field !== 'payload', chunkHelp(p.field === 'payload'));
    syncControl(refs.clamp, p.clampBytes == null, null);
    const toggleHelp = refs.clampToggleHelpRef && refs.clampToggleHelpRef.help;
    if (toggleHelp) toggleHelp.textContent = clampToggleHelp(p.chunkBytes);
    replace(center, centerContent(s, run));
    replace(right, rightContent(s, run));
    const damaged = run.clampedCount + run.droppedCount;
    status.announce(s.viewMode === VIEW_MODES.DEFENDER
      ? `${anomalyPhrase(analyzeIcmp(run.mixed))}.`
      : `${recoveredPhrase(run.recoveredText)}, ${errorPhrase(run.bitErrors, run.bits.length)}`
        + `${damaged ? `, ${damaged} echoes damaged` : ''}.`);
  }
  refresh(state);
  return { node, refresh };
}

function chunkHelp(isPayload) {
  return isPayload
    ? 'More bytes per echo means fewer, larger echoes: higher rate, larger size anomaly.'
    : 'Only applies to the data-area channel; the identifier channel carries one bit per echo.';
}

function clampToggleHelp(chunkBytes) {
  return `Truncates any data area longer than the clamp. Note it only bites once the payload EXCEEDS the clamp — with the ${TIMESTAMP_BYTES}-byte timestamp plus ${chunkBytes} message bytes, this echo carries ${TIMESTAMP_BYTES + chunkBytes} B.`;
}

function runParams(s) {
  return { ...s.channels.icmp, seed: `${s.seed}:icmp` };
}

/* ---- controls -------------------------------------------------------------- */
function leftPanel(state, refs = {}) {
  const p = state.channels.icmp;
  const isPayload = p.field === 'payload';
  const clampToggleRef = {};
  refs.clampToggleHelpRef = clampToggleRef;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Where the bits go' }),
      segmented({
        name: 'icmp-field', label: 'Carrier field', value: p.field,
        options: [
          { value: 'payload', label: 'Echo data area' },
          { value: 'id-lowbits', label: 'Identifier low bit' },
        ],
        onChange: (v) => setChannelParam('icmp', 'field', v),
      }),
      para(FIELDS[p.field].idea, 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Channel controls' }),
      controlGroup(null,
        slider({
          label: 'Message bytes per echo', min: 1, max: 32, value: p.chunkBytes, unit: 'B',
          disabled: !isPayload,
          help: chunkHelp(isPayload),
          ref: refs.chunk,
          onInput: (v) => setChannelParam('icmp', 'chunkBytes', v),
        }),
        toggle({
          label: `Pad out to the standard ${STANDARD_PAYLOAD_BYTES} bytes`,
          checked: p.padToStandard,
          help: 'Hides the SIZE anomaly by filling the rest with the ordinary pattern. The content statistic still sees it.',
          onChange: (v) => setChannelParam('icmp', 'padToStandard', v),
        }),
        slider({
          label: 'Ordinary pings mixed in', min: 0, max: 80, value: p.coverCount, unit: 'echoes',
          help: 'A normal ping session to another host, for the defender to sift through.',
          onInput: (v) => setChannelParam('icmp', 'coverCount', v),
        }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('icmp') }))),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'What the path does' }),
      para('Each of these kills one channel and leaves the other running. Try both, on both carriers.', 'subtle'),
      controlGroup(null,
        toggle({
          label: 'Normaliser clamps the payload',
          checked: p.clampBytes != null,
          help: clampToggleHelp(p.chunkBytes),
          ref: clampToggleRef,
          // getState(), not the build-time `p`: state is replaced immutably on
          // every change, so a captured snapshot would clamp at whatever the
          // slider read when the panel was built. This matters now that the
          // Clamp size slider is reachable at all.
          onChange: (v) => setChannelParam('icmp', 'clampBytes', v ? getState().channels.icmp.clampAt : null),
        }),
        slider({
          label: 'Clamp size', min: TIMESTAMP_BYTES, max: STANDARD_PAYLOAD_BYTES, value: p.clampAt, unit: 'B',
          disabled: p.clampBytes == null,
          ref: refs.clamp,
          help: `A conventional ping data area is ${STANDARD_PAYLOAD_BYTES} B, so a clamp at that size never bites on the small messages this lab sends — find the size where it starts to.`,
          onInput: (v) => {
            setChannelParam('icmp', 'clampAt', v);
            if (getState().channels.icmp.clampBytes != null) setChannelParam('icmp', 'clampBytes', v);
          },
        }),
        toggle({
          label: 'NAT rewrites the Echo Identifier',
          checked: p.rewriteId,
          help: 'RFC 5508 requires this so the NAT can match replies back to a session.',
          onChange: (v) => setChannelParam('icmp', 'rewriteId', v),
        }),
        slider({
          label: 'Echo loss', min: 0, max: 0.5, step: 0.01, value: p.lossProb,
          format: (v) => `${Math.round(v * 100)}%`,
          help: 'Rate limiting and filtering drop echoes; ICMP has no retransmission of its own.',
          onInput: (v) => setChannelParam('icmp', 'lossProb', v),
        }))),
    calloutChip(CALLOUTS.icmp));
}

/* ---- centre: the echo log --------------------------------------------------- */
function centerContent(state, run) {
  const shown = run.mixed.slice(0, 24);
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title' },
        span({ text: 'Simulated echo log ' }), simNote()),
      para(`Data areas are shown as hex. The first ${TIMESTAMP_BYTES} bytes are the timestamp every ping carries; what follows is either the conventional fill pattern or somebody's message.`, 'subtle'),
      echoTable(shown),
      run.mixed.length > shown.length
        ? para(`Showing the first ${shown.length} of ${run.mixed.length} echoes.`, 'subtle')
        : null),
    tradeoffInstrument('icmp', state.message, runParams(state)));
}

function echoTable(echoes) {
  const hex = (b) => b.toString(16).padStart(2, '0');
  const row = (e) => {
    const stamp = (e.data || []).slice(0, TIMESTAMP_BYTES).map(hex).join(' ');
    const rest = (e.data || []).slice(TIMESTAMP_BYTES);
    const restHex = rest.slice(0, 10).map(hex).join(' ') + (rest.length > 10 ? ' …' : '');
    return el('tr', { class: e.covert ? 'is-covert' : '' },
      el('td', { class: 'mono', text: String(e.seq) }),
      el('td', { class: 'mono', text: `0x${e.identifier.toString(16).padStart(4, '0')}` }),
      el('td', { class: 'mono', text: `${e.dataBytes} B` }),
      el('td', { class: 'mono', text: e.dest }),
      el('td', { class: 'mono icmp-data' },
        span({ class: 'icmp-stamp', text: stamp }),
        span({ text: ' ' }),
        span({ class: e.covert ? 'icmp-payload covert' : 'icmp-payload', text: restHex || '—' })),
      el('td', {},
        e.clamped ? span({ class: 'pill pill-lost', text: 'clamped' }) : null,
        e.idRewritten ? span({ class: 'pill pill-lost', text: 'id rewritten' }) : null,
        !e.clamped && !e.idRewritten
          ? span({ class: `pill ${e.covert ? 'pill-covert' : 'pill-normal'}`, text: e.covert ? 'covert' : 'ordinary' })
          : null));
  };
  return div({
    class: 'table-wrap',
    style: { maxHeight: '320px', overflowY: 'auto' },
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Simulated ICMP echo log: sequence, identifier, payload size, destination and data area' },
  }, el('table', { class: 'data-table' },
    tableCaption('Simulated ICMP echo log: sequence, identifier, payload size, destination and data area'),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', text: 'Seq' }),
      el('th', { scope: 'col', text: 'Identifier' }),
      el('th', { scope: 'col', text: 'Size' }),
      el('th', { scope: 'col', text: 'Destination' }),
      el('th', { scope: 'col', text: 'Data area (timestamp · rest)' }),
      el('th', { scope: 'col', text: 'Path' }))),
    el('tbody', {}, ...echoes.map(row))));
}

/* ---- right panel ------------------------------------------------------------ */
function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run);
}

function senderPanel(run) {
  const ok = run.bitErrors === 0;
  const field = FIELDS[run.field];
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Sent vs recovered' }),
      el('p', { class: 'subtle', text: 'Intended' }),
      bitRibbon(run.bits, { max: 64, ariaLabel: 'intended bits' }),
      el('p', { class: 'subtle', text: 'Recovered' }),
      bitRibbon(run.bits, { decoded: run.decodedBits, max: 64, ariaLabel: 'recovered bits' })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: `Receiver reads the ${field.label.toLowerCase()}` }),
      recoveredBox(run.recoveredText, { ok }),
      statTiles([
        { val: String(run.meta.bitsPerEcho), lab: 'bits/echo' },
        { val: String(run.cleanEchoes.length), lab: 'echoes' },
        { val: String(run.clampedCount + run.droppedCount), lab: 'echoes damaged', tone: (run.clampedCount + run.droppedCount) ? 'bad' : undefined },
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
      ]),
      pathNote(run)));
}

function pathNote(run) {
  if (run.field === 'payload' && run.clampBytes != null && run.clampedCount === 0) {
    const size = TIMESTAMP_BYTES + (run.meta.chunkBytes ?? 0);
    return para(`The clamp is on at ${run.clampBytes} B and changed nothing: this echo's data area is only ${size} B (${TIMESTAMP_BYTES}-byte timestamp + ${run.meta.chunkBytes} message bytes), so there was nothing past the clamp to remove. Pack more bytes per echo, or lower the clamp, to find the boundary. A defence that is switched on is not the same as a defence that is doing anything.`, 'subtle');
  }
  if (run.field === 'payload' && run.clampBytes != null && run.clampedCount > 0) {
    return para('The normaliser truncated the data area, so the bytes past the clamp were never delivered — the receiver marks them unrecovered rather than guessing.', 'subtle');
  }
  if (run.field === 'id-lowbits' && run.idRewritten) {
    return para('The NAT replaced the Echo Identifier with its own, so every bit the sender put there is gone. Note that this did nothing to the data area — the other channel would have sailed straight through.', 'subtle');
  }
  if (run.field === 'payload' && run.idRewritten) {
    return para('The NAT rewrote the identifier and the payload channel did not notice. Switch the carrier field to see the same defence become fatal.', 'subtle');
  }
  if (run.field === 'id-lowbits' && run.clampBytes != null) {
    return para('The size clamp trimmed nothing that mattered: this channel lives in a header field, not the data area. Switch the carrier field to see the same defence become fatal.', 'subtle');
  }
  return para(`${FIELDS[run.field].tell}`, 'subtle');
}

function defenderPanel(run) {
  const det = analyzeIcmp(run.mixed);
  const m = det.metrics;
  const focus = m.pivot || m.global;
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Payload-size distribution' }),
      verticalBars(m.sizeHistogram.map((b) => ({
        label: String(b.value), value: b.count,
        color: b.value === STANDARD_PAYLOAD_BYTES || b.value === 32 ? 'var(--accent-2)' : 'var(--covert)',
      })), { height: 120, ariaLabel: 'Distribution of ICMP payload sizes in bytes' }),
      para(`Conventional sizes are ${STANDARD_PAYLOAD_BYTES} bytes (Linux) and 32 (Windows); anything else is a choice somebody made.`, 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: m.pivot && m.peerCount > 1 ? `Echo statistics — ${m.pivot.dest}` : 'Echo statistics' }),
      metricList([
        { name: 'Matches the fill pattern', value: `${Math.round(focus.fillConformFraction * 100)}%`, hi: focus.fillConformFraction < 0.8 },
        { name: 'Unique data areas', value: `${Math.round(focus.distinctDataRatio * 100)}%`, hi: focus.distinctDataRatio > 0.6 },
        { name: 'Standard payload size', value: `${Math.round(focus.standardSizeFraction * 100)}%`, hi: focus.standardSizeFraction < 0.8 },
        { name: 'Distinct identifiers', value: String(focus.distinctIdentifiers), hi: focus.distinctIdentifiers > 1 },
        { name: 'Identifier low-bit balance', value: round(focus.idLowBitBalance, 2), hi: focus.distinctIdentifiers > 1 && focus.idLowBitBalance > 0.5 },
        { name: 'Sequence increments by 1', value: `${Math.round(focus.seqStepFraction * 100)}%` },
      ]),
      run.field === 'id-lowbits'
        ? para('The identifier channel barely registers, and that is the honest result. One bit in a field with no reference distribution leaves nothing for a content or size statistic to find — the same taught false negative as IP-ID parity in the storage module.', 'subtle')
        : para('Ordinary ping repeats one payload, one size, and one identifier for a whole session. Every one of those being violated at once is what makes a data-area tunnel catchable.', 'subtle')));
}
