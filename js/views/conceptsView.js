/**
 * views/conceptsView.js — "What Makes a Channel Covert?" + the LIVE trade-off
 * instrument (capacity/reliability/observability computed from the simulation).
 */

import { el, div, replace } from './dom.js';
import { sectionHeader, renderBlocks, para, callout } from './blocks.js';
import { segmented } from './controls.js';
import { tradeoffInstrument } from './tradeoffView.js';
import { COPY } from '../content/copy.js';

const CHANNELS = [
  { key: 'dns', label: 'DNS' },
  { key: 'icmp', label: 'ICMP' },
  { key: 'timing', label: 'Timing' },
  { key: 'storage', label: 'Storage' },
  { key: 'ordering', label: 'Ordering' },
  { key: 'hopping', label: 'Hopping' },
  { key: 'physical', label: 'Air gap' },
  { key: 'cache', label: 'Cache' },
];

const DEMO = 'HELLO WORLD';
function demoParams(channel) {
  const seed = `concepts:${channel}`;
  switch (channel) {
    case 'dns': return { labelLength: 12, requestCount: 24, intervalMs: 600, coverCount: 0, seed };
    case 'timing': return { jitterMs: 0, seed };
    case 'storage': return { field: 'ttl-toggle', seed };
    case 'ordering': return { reorderProb: 0, seed };
    case 'icmp': return { field: 'payload', chunkBytes: 2, coverCount: 20, seed };
    case 'hopping': return { lossProb: 0, blocked: [], coverCount: 30, seed };
    case 'physical': return { ambientNoise: 0, ambientDrift: 0, seed };
    case 'cache': return { probe: 'flush-reload', jitterCycles: 0, evictionProb: 0, seed };
    default: return { seed };
  }
}

let selected = 'timing';

export function renderConceptsView(state) {
  const area = div({});
  const seg = segmented({
    name: 'tradeoff-channel', label: 'Channel', value: selected,
    options: CHANNELS.map((c) => ({ value: c.key, label: c.label })),
    onChange: (v) => { selected = v; renderInstrument(); },
  });

  const node = el('section', { class: 'section', id: 'sec-concepts' },
    sectionHeader({ ...COPY.concepts, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' }, renderBlocks(COPY.concepts.blocks)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'The trade-off, measured live' }),
      para(`Each channel below encodes the same demo message (\`${DEMO}\`) with fixed illustrative settings, and the meters are computed from that actual seeded run — not from presets. Open a channel’s own module to move its knobs and watch its numbers shift there.`, 'subtle'),
      seg,
      area,
      callout({
        kind: 'note',
        level: 4, // nested inside the trade-off card, whose title is the <h3>
        title: 'Steganography and encrypted tunnels',
        body: 'Image LSB steganography has high capacity and is visually invisible, yet a single lossy re-compression wipes it out — high capacity, low reliability. An HTTPS/SSH tunnel is highly reliable and hides content, but stays recognisable *as* HTTPS/SSH, so it scores low on covertness-of-existence. Both are covered in their own modules.',
      })));

  function renderInstrument() {
    replace(area, tradeoffInstrument(selected, DEMO, demoParams(selected)));
  }
  renderInstrument();
  return { node, refresh() {} };
}
