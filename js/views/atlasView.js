/**
 * views/atlasView.js — the Carrier Atlas: pattern taxonomy + carrier cards with
 * fidelity notes, including the families this lab only describes.
 */

import { el, div, span } from './dom.js';
import { sectionHeader, para, inline } from './blocks.js';
import { TAXONOMY, CARRIERS } from '../content/atlas.js';
import { setSection } from '../state.js';

export function renderAtlasView(state) {
  const built = CARRIERS.filter((c) => c.status === 'built');
  const concept = CARRIERS.filter((c) => c.status === 'concept');

  const node = el('section', { class: 'section', id: 'sec-atlas' },
    sectionHeader({
      title: 'Carrier Atlas', eyebrow: 'Analysis',
      lede: 'A map from each hands-on module to a named hiding pattern, plus honest coverage of the carriers this lab describes but never builds as tools. Learn the pattern, not just the trick.',
    }),
    taxonomyCard(),
    el('h3', { class: 'atlas-group-title', text: 'Carriers you can drive here' }),
    div({ class: 'atlas-grid' }, ...built.map((c) => carrierCard(c, true))),
    el('h3', { class: 'atlas-group-title', text: 'Carriers described, not built (fidelity: concept only)' }),
    para('These are covered as ideas with honest fidelity notes. Completeness for this lab means covering the concepts accurately — never shipping operational tooling.', 'subtle'),
    div({ class: 'atlas-grid' }, ...concept.map((c) => carrierCard(c, false))));

  return { node, refresh() {} };
}

function taxonomyCard() {
  return el('div', { class: 'card' },
    el('h3', { class: 'card-title', text: 'The hiding-pattern taxonomy' }),
    para(TAXONOMY.intro, 'subtle'),
    TAXONOMY.since ? para(TAXONOMY.since, 'block-note') : null,
    ...TAXONOMY.families.map((fam) =>
      div({ class: 'taxo-family' },
        el('h4', { class: 'taxo-fam-title' }, span({ text: fam.name }), span({ class: 'subtle', text: ` — ${fam.note}` })),
        div({ class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': `Hiding-pattern taxonomy: ${fam.name}` } },
          el('table', { class: 'data-table' },
            el('thead', {}, el('tr', {}, el('th', { text: 'Pattern' }), el('th', { text: 'Idea' }), el('th', { text: 'In this lab' }))),
            el('tbody', {}, ...fam.patterns.map((p) => el('tr', {},
              el('td', {}, el('strong', { text: p.name })),
              el('td', { class: 'cellwrap-cell' }, el('span', { class: 'cellwrap', text: p.idea })),
              el('td', { class: 'cellwrap-cell' }, el('span', { class: 'cellwrap subtle', text: p.lab }))))))))),
    el('p', { class: 'atlas-cite subtle', text: `Reference: ${TAXONOMY.citation}` }));
}

function carrierCard(c, isBuilt) {
  return el('div', { class: `card atlas-card ${isBuilt ? 'built' : 'concept'}` },
    div({ class: 'atlas-card-head' },
      el('h4', { class: 'atlas-card-title', text: c.name }),
      div({ class: 'atlas-badges' },
        span({ class: 'pill pill-normal', text: c.layer }),
        span({ class: `pill ${c.family === 'Timing' ? 'pill-mod' : c.family === 'Steganography' ? 'pill-covert' : 'pill-normal'}`, text: c.family }))),
    el('p', {}, ...inline(c.idea)),
    kvLine('What breaks it', c.breaks),
    kvLine('Defensive indicators', c.indicators),
    fidelityCard(c.fidelity),
    isBuilt && c.section
      ? el('button', { class: 'btn ghost atlas-open', type: 'button', on: { click: () => setSection(c.section) } }, span({ text: 'Open module →' }))
      : conceptFooter(c));
}

/** Described-only carriers keep their safety mark; some also point at a sibling
 *  exhibit that covers the family properly. The outbound link is a plain anchor
 *  — no fetch, so it stays within the page's connect-src 'none' policy. */
function conceptFooter(c) {
  const mark = span({ class: 'atlas-conceptmark', text: 'Concept only — nothing here is sent or executed' });
  if (!c.deepDive) return mark;
  return div({ class: 'atlas-concept-footer' },
    mark,
    c.deepDive.note ? el('p', { class: 'atlas-deepdive-note subtle', text: c.deepDive.note }) : null,
    el('a', {
      class: 'btn ghost atlas-open atlas-deepdive',
      href: c.deepDive.url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, span({ text: c.deepDive.label })));
}

function kvLine(label, value) {
  return div({ class: 'atlas-kv' },
    span({ class: 'atlas-kv-label', text: label }),
    span({ class: 'atlas-kv-value', text: value }));
}

function fidelityCard(f) {
  return div({ class: 'fidelity-card' },
    fidelityCol('Faithful', f.faithful, 'good'),
    fidelityCol('Simplified', f.simplified, 'warn'),
    fidelityCol('A real environment adds', f.realWorld, 'neutral'));
}
function fidelityCol(title, items, tone) {
  return div({ class: `fidelity-col fid-${tone}` },
    el('div', { class: 'fidelity-col-title', text: title }),
    el('ul', {}, ...items.map((it) => el('li', { text: it }))));
}
