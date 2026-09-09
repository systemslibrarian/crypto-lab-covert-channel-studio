/**
 * views/comparisonView.js — the Compare Channels table.
 */

import { el, div, span, tableCaption } from './dom.js';
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
          tableCaption('Channel comparison table'),
          el('thead', {}, el('tr', {}, ...COMPARISON_COLUMNS.map((c) => el('th', { scope: 'col', text: c.label })))),
          el('tbody', {}, ...COMPARISON_ROWS.map(rowEl))))));
  return { node, refresh() {} };
}

function rowEl(row) {
  return el('tr', {}, ...COMPARISON_COLUMNS.map((c) => {
    const val = row[c.key] ?? '';
    if (c.key === 'channel') {
      // The channel name identifies the row, so it is a row header — not a <td>
      // whose header-ness is carried by <strong> and first-column position
      // (1.3.1). Nine columns of "Low / High / medium" are unreadable cell by
      // cell without it, and at ≤768px the table is panned and the bold name
      // scrolls off screen entirely.
      // The inline style restores what `.compare-table td` gave this cell; that
      // rule is td-only, and the CSS is another agent's file this pass.
      return el('th', { scope: 'row', style: { whiteSpace: 'normal', verticalAlign: 'top', minWidth: '110px' } },
        el('div', { class: 'cellwrap', style: { display: 'block', maxWidth: '220px' } },
          el('span', { text: val }),
          row.note ? el('div', { class: 'compare-note', text: row.note }) : null));
    }
    if (c.key === 'kind') return el('td', {}, span({ class: 'pill pill-normal', text: val }));
    return el('td', { class: 'cellwrap-cell' }, el('span', { class: 'cellwrap', text: val }));
  }));
}
