/**
 * views/glossaryView.js — searchable glossary.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader } from './blocks.js';
import { statusRegion } from './widgets.js';
import { GLOSSARY } from '../content/glossary.js';

export function renderGlossaryView(state) {
  const grid = div({ class: 'glossary-grid' });
  let query = '';

  // Filtering rewrites the whole grid on every keystroke, and a result count
  // that changes without focus moving is a status message (SC 4.1.3). Built
  // here, BESIDE the grid — replace()ing a live region's node de-registers it —
  // and debounced by statusRegion(), so typing announces the settled result
  // rather than one count per character.
  const status = statusRegion();

  const search = el('input', {
    type: 'search', class: 'msg-input mono glossary-search', placeholder: 'Filter terms…',
    attrs: { 'aria-label': 'Filter glossary terms', autocomplete: 'off', spellcheck: 'false' },
    on: { input: (e) => { query = e.target.value.toLowerCase(); renderGrid(); } },
  });

  const node = el('section', { class: 'section', id: 'sec-glossary' },
    sectionHeader({ title: 'Glossary', eyebrow: 'Reference', lede: 'Concise, technically precise definitions of the terms used throughout the exhibit.' }),
    div({ class: 'glossary-toolbar' }, search),
    status.node,
    grid);

  function renderGrid() {
    const items = GLOSSARY
      .filter((g) => !query || g.term.toLowerCase().includes(query) || g.definition.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => a.term.localeCompare(b.term));
    replace(grid, ...(items.length ? items.map(item) : [div({ class: 'empty-note', text: 'No matching terms.' })]));
    if (!query) status.announce(`Showing all ${GLOSSARY.length} glossary terms.`);
    else if (!items.length) status.announce('No matching terms.');
    else status.announce(`${items.length} of ${GLOSSARY.length} terms match.`);
  }
  renderGrid();
  return { node, refresh() {} };
}

function item(g) {
  return div({ class: 'glossary-item' },
    div({ class: 'glossary-term', text: g.term }),
    div({ class: 'glossary-def', text: g.definition }),
    g.seeAlso && g.seeAlso.length
      ? div({ class: 'glossary-see' }, span({ text: 'See also: ' }), span({ text: g.seeAlso.join(', ') }))
      : null);
}
