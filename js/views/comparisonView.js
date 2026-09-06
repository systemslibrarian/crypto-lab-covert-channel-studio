/**
 * views/comparisonView.js — the Compare Channels table.
 */

import { el, div, span } from './dom.js';
import { sectionHeader, renderBlocks } from './blocks.js';
import { COPY } from '../content/copy.js';
import { COMPARISON_COLUMNS, COMPARISON_ROWS } from '../content/comparison.js';

export function renderComparisonView(state) {
  const node = el('section', { class: 'section', id: 'sec-compare' },
    sectionHeader({ ...COPY.compare, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' }, renderBlocks(COPY.compare.blocks)),
    el('div', { class: 'card' },
      div({ class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Channel comparison table' } },
        el('table', { class: 'data-table compare-table' },
          el('thead', {}, el('tr', {}, ...COMPARISON_COLUMNS.map((c) => el('th', { text: c.label })))),
          el('tbody', {}, ...COMPARISON_ROWS.map(rowEl))))));
  return { node, refresh() {} };
}

function rowEl(row) {
  return el('tr', {}, ...COMPARISON_COLUMNS.map((c) => {
    const val = row[c.key] ?? '';
    if (c.key === 'channel') {
      return el('td', {},
        el('div', { class: 'cellwrap' },
          el('strong', { text: val }),
          row.note ? el('div', { class: 'compare-note', text: row.note }) : null));
    }
    if (c.key === 'kind') return el('td', {}, span({ class: 'pill pill-normal', text: val }));
    return el('td', { class: 'cellwrap-cell' }, el('span', { class: 'cellwrap', text: val }));
  }));
}
