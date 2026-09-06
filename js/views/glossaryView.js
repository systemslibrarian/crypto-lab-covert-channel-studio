/**
 * views/glossaryView.js — searchable glossary.
 */

import { el, div, span, replace } from './dom.js';
import { sectionHeader } from './blocks.js';
import { GLOSSARY } from '../content/glossary.js';

export function renderGlossaryView(state) {
  const grid = div({ class: 'glossary-grid' });
  let query = '';

  const search = el('input', {
    type: 'search', class: 'msg-input mono glossary-search', placeholder: 'Filter terms…',
    attrs: { 'aria-label': 'Filter glossary terms', autocomplete: 'off', spellcheck: 'false' },
    on: { input: (e) => { query = e.target.value.toLowerCase(); renderGrid(); } },
  });

  const node = el('section', { class: 'section', id: 'sec-glossary' },
    sectionHeader({ title: 'Glossary', eyebrow: 'Reference', lede: 'Concise, technically precise definitions of the terms used throughout the exhibit.' }),
    div({ class: 'glossary-toolbar' }, search),
    grid);

  function renderGrid() {
    const items = GLOSSARY.filter((g) =>
      !query || g.term.toLowerCase().includes(query) || g.definition.toLowerCase().includes(query));
    replace(grid, ...(items.length ? items.map(item) : [div({ class: 'empty-note', text: 'No matching terms.' })]));
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
