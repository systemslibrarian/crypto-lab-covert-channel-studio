/**
 * views/defenseView.js — Defensive Takeaways + Further reading (references).
 */

import { el, div, span } from './dom.js';
import { sectionHeader, renderBlocks, calloutChip } from './blocks.js';
import { COPY, CALLOUTS } from '../content/copy.js';
import { REFERENCES } from '../content/references.js';

export function renderDefenseView(state) {
  const node = el('section', { class: 'section', id: 'sec-defense' },
    sectionHeader({ ...COPY.defense, eyebrow: 'Analysis' }),
    div({ class: 'prose-wide' },
      renderBlocks(COPY.defense.blocks),
      calloutChip(CALLOUTS.defender)),
    el('div', { class: 'card' },
      el('h3', { class: 'card-title', text: 'Further reading' }),
      div({ class: 'refs' }, ...REFERENCES.map(refGroup))));
  return { node, refresh() {} };
}

function refGroup(group) {
  return div({ class: 'ref-group' },
    el('h4', { class: 'ref-cat', text: group.category }),
    el('ul', { class: 'ref-list' }, ...group.items.map(refItem)));
}

function refItem(it) {
  const cite = [it.authors, it.year ? `(${it.year})` : null, it.venue].filter(Boolean).join(' · ');
  return el('li', { class: 'ref-item' },
    it.url
      ? el('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', class: 'ref-title', text: it.title })
      : el('span', { class: 'ref-title', text: it.title }),
    cite ? el('div', { class: 'ref-cite', text: cite }) : null,
    it.note ? el('div', { class: 'ref-note', text: it.note }) : null);
}
