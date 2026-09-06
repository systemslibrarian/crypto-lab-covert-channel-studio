/**
 * views/conceptsView.js — "What Makes a Channel Covert?" + the trade-off triangle.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader, renderBlocks, para } from './blocks.js';
import { segmented } from './controls.js';
import { horizontalMeter } from './charts.js';
import { COPY } from '../content/copy.js';

const PROFILES = [
  { key: 'dns', label: 'DNS tunnel', capacity: 0.7, reliability: 0.6, observability: 0.85,
    note: 'Good capacity and workable reliability, but long high-entropy labels make it one of the more observable channels.' },
  { key: 'timing', label: 'Timing', capacity: 0.2, reliability: 0.3, observability: 0.45,
    note: 'Very low throughput and fragile to jitter, but subtle — the message is only in the gaps.' },
  { key: 'storage-parity', label: 'IP-ID parity', capacity: 0.5, reliability: 0.45, observability: 0.3,
    note: 'Barely disturbs field statistics (low observability), but a NAT rewriting the IP ID destroys it.' },
  { key: 'storage-ttl', label: 'TTL toggle', capacity: 0.5, reliability: 0.5, observability: 0.85,
    note: 'Same capacity as parity, but toggling 64/65 is glaring — high observability for no extra benefit.' },
  { key: 'stego', label: 'Image LSB', capacity: 0.9, reliability: 0.35, observability: 0.3,
    note: 'Lots of room and visually invisible, yet a single lossy re-compression wipes the payload out.' },
];

let selected = 'dns';

export function renderConceptsView(state) {
  // The profile selector is built once and persists; only the meters and note
  // re-render when the profile changes, so keyboard focus is never dropped.
  const metersArea = div({ class: 'tri-meters' });
  const noteArea = div({});
  const seg = segmented({
    name: 'tradeoff', label: 'Channel profile', value: selected,
    options: PROFILES.map((x) => ({ value: x.key, label: x.label })),
    onChange: (v) => { selected = v; renderMeters(); },
  });
  const triangle = el('div', { class: 'card' },
    el('h3', { class: 'card-title', text: 'Capacity · Reliability · Observability' }),
    seg, metersArea, noteArea);

  const node = el('section', { class: 'section', id: 'sec-concepts' },
    sectionHeader({ ...COPY.concepts, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' }, renderBlocks(COPY.concepts.blocks)),
    triangle);

  function renderMeters() {
    const p = PROFILES.find((x) => x.key === selected) || PROFILES[0];
    replace(metersArea,
      horizontalMeter(p.capacity, { label: 'Capacity (how much it carries)', color: 'var(--accent)', valueText: pct(p.capacity) }),
      horizontalMeter(p.reliability, { label: 'Reliability (survives the network)', color: 'var(--accent-2)', valueText: pct(p.reliability) }),
      horizontalMeter(p.observability, { label: 'Observability (how visible to a defender)', color: 'var(--covert)', valueText: pct(p.observability) }));
    replace(noteArea,
      para(p.note, 'subtle'),
      para('These profiles are illustrative, not measured — the point is that pushing one corner moves the others.', 'block-note'));
  }
  renderMeters();
  return { node, refresh() {} };
}

function pct(v) { return `${Math.round(v * 100)}%`; }
