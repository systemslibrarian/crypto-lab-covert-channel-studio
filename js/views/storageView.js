/**
 * views/storageView.js — the covert storage channel module.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, para, calloutChip, inline } from './blocks.js';
import { panel, controlGroup, select, toggle, button, segmented } from './controls.js';
import { verticalBars } from './charts.js';
import { metricList, anomalyPanel, recoveredBox, modeBanner, statTiles } from './widgets.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { simulateStorageRun, FIELDS, MIDDLEBOX_IMPACT, extractBit } from '../channels/storage.js';
import { analyzeStorage } from '../detectors/storageDetector.js';
import { round } from '../utils/statistics.js';
import { bitsToText } from '../utils/bits.js';
import { setChannelParam, setMiddlebox, resetChannel, VIEW_MODES } from '../state.js';

export function renderStorageView(state) {
  const copy = COPY.storage;
  let reveal = state.viewMode === VIEW_MODES.SENDER;
  let cur = state;
  const center = div({ class: 'panel panel-center' });
  const right = div({ class: 'panel panel-right' });

  // The reveal toggle is built ONCE and lives outside the re-rendered area, so
  // toggling it (or changing any control) never destroys it and drops focus.
  const noteArea = div({});
  const tableArea = div({});
  const seg = segmented({
    name: 'storage-reveal', label: 'View', size: 'sm', value: reveal ? 'reveal' : 'normal',
    options: [{ value: 'normal', label: 'Normal view' }, { value: 'reveal', label: 'Reveal covert field' }],
    onChange: (v) => { reveal = v === 'reveal'; renderInner(); },
  });
  center.appendChild(el('div', { class: 'card' },
    div({ class: 'timing-topbar' },
      el('h3', { class: 'card-title', text: 'Simulated packet stream' }), seg),
    noteArea, tableArea));

  const node = el('section', { class: 'section', id: 'sec-storage' },
    sectionHeader({ ...copy, eyebrow: 'Storage' }),
    modeBanner(state.viewMode),
    div({ class: 'workbench' }, leftPanel(state), center, right));

  function renderInner() {
    const run = simulateStorageRun(cur.message, { field: cur.channels.storage.field, middlebox: cur.channels.storage.middlebox, seed: `${cur.seed}:storage` });
    const info = run.fieldInfo;
    replace(noteArea, reveal
      ? para(`Hidden bit is read from **${info.label}** — ${info.rule}. ${info.description}`, 'subtle')
      : para('Ordinary-looking TCP/IP metadata. Nothing here draws attention.', 'subtle'));
    replace(tableArea, packetTable(run.cleanPackets, run.field, reveal));
    replace(right, rightContent(cur, run));
  }
  function refresh(s) { cur = s; renderInner(); }
  refresh(state);
  return { node, refresh };
}

function leftPanel(state) {
  const s = state.channels.storage;
  const mb = s.middlebox;
  return panel('left',
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Encoding field' }),
      select({
        label: 'Carrier field', value: s.field,
        options: Object.values(FIELDS).map((f) => ({ value: f.key, label: `${f.label} (${f.rule})` })),
        onChange: (v) => setChannelParam('storage', 'field', v),
      })),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Middlebox on the path' }),
      controlGroup(null,
        toggle({ label: 'NAT (rewrites IP ID)', checked: mb.nat, onChange: (v) => setMiddlebox('nat', v) }),
        toggle({ label: 'Header normalization (TTL)', checked: mb.headerNormalization, onChange: (v) => setMiddlebox('headerNormalization', v) }),
        toggle({ label: 'Proxy (new sequence #)', checked: mb.proxy, onChange: (v) => setMiddlebox('proxy', v) }),
        toggle({ label: 'Firewall (drops packets)', checked: mb.firewall, onChange: (v) => setMiddlebox('firewall', v) }),
        toggle({ label: 'Reordering', checked: mb.reorder, onChange: (v) => setMiddlebox('reorder', v) }),
        button({ label: 'Reset controls', variant: 'ghost', icon: '↺', onClick: () => resetChannel('storage') }))),
    calloutChip(CALLOUTS.storage));
}

function packetTable(packets, field, reveal) {
  const prop = FIELDS[field].field;
  const shown = packets.slice(0, 32);
  const baseCols = ['#', 'Src', 'Dst', 'Proto', 'TTL', 'IP ID', 'Seq', 'Len'];
  const revealCols = reveal ? ['Bit', 'Byte', 'Char'] : [];
  const head = el('tr', {},
    ...baseCols.map((h) => el('th', { class: colClass(h, prop, reveal), text: h })),
    ...revealCols.map((h) => el('th', { text: h })));

  const bits = shown.map((p) => extractBit(p, field));
  const rows = shown.map((p, i) => {
    const covertVal = colValueFor(prop, p);
    const completeByte = (i + 1) % 8 === 0;
    let byteHex = ''; let ch = '';
    if (completeByte) {
      const groupBits = bits.slice(i - 7, i + 1);
      const text = bitsToText(groupBits, { lenient: true }) || '';
      ch = text || '·';
      const byteVal = parseInt(groupBits.join(''), 2);
      byteHex = '0x' + byteVal.toString(16).padStart(2, '0');
    }
    return el('tr', {},
      el('td', { class: 'mono', text: String(p.index) }),
      cell('Src', p.src, prop, reveal),
      cell('Dst', p.dst, prop, reveal),
      cell('Proto', p.protocol, prop, reveal),
      cell('TTL', String(p.ttl), prop, reveal, 'ttl'),
      cell('IP ID', String(p.ipId), prop, reveal, 'ipId'),
      cell('Seq', String(p.sequence), prop, reveal, 'sequence'),
      cell('Len', String(p.payloadLength), prop, reveal),
      reveal ? el('td', {}, span({ class: `bit-cell bit-${bits[i]}`, text: String(bits[i]) })) : null,
      reveal ? el('td', { class: 'mono', text: byteHex }) : null,
      reveal ? el('td', { class: 'mono', text: ch }) : null);
  });

  return div({ class: 'table-wrap', style: { maxHeight: '360px', overflowY: 'auto' },
    attrs: { tabindex: '0', role: 'region', 'aria-label': 'Simulated packet stream' } },
    el('table', { class: 'data-table' }, el('thead', {}, head), el('tbody', {}, ...rows)));
}

function colValueFor(prop, p) { return p[prop]; }
function colClass(header, prop, reveal) {
  return reveal && headerMatchesProp(header, prop) ? 'covert-col' : '';
}
function headerMatchesProp(header, prop) {
  const map = { TTL: 'ttl', 'IP ID': 'ipId', Seq: 'sequence' };
  return map[header] === prop;
}
function cell(header, value, prop, reveal, colName) {
  const isCovert = reveal && colName && colName === prop;
  return el('td', { class: `mono${isCovert ? ' covert-col' : ''}`, text: value });
}

function rightContent(state, run) {
  return state.viewMode === VIEW_MODES.DEFENDER ? defenderPanel(run) : senderPanel(run, state);
}

function senderPanel(run, state) {
  const success = run.bitErrors === 0;
  const activeMb = Object.entries(state.channels.storage.middlebox).filter(([, v]) => v).map(([k]) => k);
  const breakers = activeMb.filter((k) => (MIDDLEBOX_IMPACT[k]?.affects || []).includes(run.field));
  return div({},
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Receiver (after the path)' }),
      recoveredBox(run.processedDecode.text, { ok: success }),
      statTiles([
        { val: String(run.bitErrors), lab: 'bit errors', tone: run.bitErrors ? 'bad' : 'good' },
        { val: `${Math.round(run.bitErrorRate * 100)}%`, lab: 'error rate', tone: run.bitErrorRate ? 'bad' : 'good' },
      ])),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Middlebox impact' }),
      activeMb.length === 0
        ? para('No middlebox is active — the channel is intact end to end.', 'subtle')
        : div({},
            ...activeMb.map((k) => el('p', { class: 'mb-line' }, ...inline(
              `**${MIDDLEBOX_IMPACT[k].label}:** ${MIDDLEBOX_IMPACT[k].why}`)))),
      breakers.length
        ? el('p', { class: 'mb-break' }, ...inline(`This is why the message broke: **${breakers.map((k) => MIDDLEBOX_IMPACT[k].label).join(', ')}** rewrites or disrupts the ${run.fieldInfo.label} the channel depends on.`))
        : (activeMb.length ? para('None of the active middleboxes touch this field — the message still survives. Try one that does.', 'subtle') : null)));
}

function defenderPanel(run) {
  const det = analyzeStorage(run.processedPackets, run.field);
  const m = det.metrics;
  const counts = m.valueCounts.slice(0, 16).map((c) => ({ label: String(c.value), value: c.count, color: 'var(--covert)' }));
  return div({},
    el('div', { class: 'card accent' },
      el('h3', { class: 'card-title', text: 'Educational anomaly indicator' }),
      anomalyPanel(det)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: `${m.fieldLabel} distribution` }),
      counts.length ? verticalBars(counts, { height: 130, unit: 'pkts', ariaLabel: `Value distribution of the ${m.fieldLabel}` })
        : div({ class: 'empty-note', text: 'no packets' }),
      para(m.field === 'ttl-toggle'
        ? 'Only two adjacent TTLs appear — nothing like the 64/128/255 a real host mix shows.'
        : 'The distribution looks essentially uniform: a parity/low-bit channel barely disturbs it.', 'subtle')),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Field statistics' }),
      metricList([
        { name: 'Distinct values', value: `${m.distinctValues} / ${m.count}` },
        { name: 'Extracted-bit ones', value: `${Math.round(m.p1 * 100)}%` },
        { name: 'Bit bias', value: `${round(m.bitBias, 2)}`, hi: m.bitBias > 0.5 },
        { name: 'Even : odd', value: `${m.oddEven.even} : ${m.oddEven.odd}` },
      ])));
}
