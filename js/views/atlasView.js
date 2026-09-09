/**
 * views/atlasView.js — the Carrier Atlas: pattern taxonomy + carrier cards with
 * fidelity notes, including the families this lab only describes.
 */

import { el, div, span, tableCaption } from './dom.js';
import { sectionHeader, para, inline, callout } from './blocks.js';
import { TAXONOMY, CARRIERS, patternFor, noPatternLabel } from '../content/atlas.js';
import { setSection } from '../state.js';

export function renderAtlasView(state) {
  const built = CARRIERS.filter((c) => c.status === 'built');
  const concept = CARRIERS.filter((c) => c.status === 'concept');

  const node = el('section', { class: 'section', id: 'sec-atlas' },
    sectionHeader({
      title: 'Carrier Atlas', eyebrow: 'Analysis',
      lede: 'A map from each hands-on module to a named hiding pattern in the published eleven-pattern catalog — or to an explicit statement of why it has none, which several modules honestly do. Three different blanks are kept apart: payload-carrying and excluded by the survey’s own scope sentence, in scope but not one of the eleven, or not made of network PDUs at all. Plus the carriers this lab describes but never builds as tools. Learn the pattern, not just the trick, and learn where the pattern language stops.',
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
    el('h3', { class: 'card-title', text: 'The hiding-pattern taxonomy — eleven patterns, four with sub-patterns' }),
    para(TAXONOMY.intro, 'subtle'),
    scopeNote(),
    TAXONOMY.since ? para(TAXONOMY.since, 'block-note') : null,
    ...TAXONOMY.families.map((fam) =>
      div({ class: 'taxo-family' },
        el('h4', { class: 'taxo-fam-title' }, span({ text: fam.name }), span({ class: 'subtle', text: ` — ${fam.note}` })),
        div({ class: 'table-wrap', attrs: { tabindex: '0', role: 'region', 'aria-label': `Hiding-pattern taxonomy: ${fam.name}` } },
          el('table', { class: 'data-table' },
            tableCaption(`Hiding-pattern taxonomy: ${fam.name}`),
            el('thead', {}, el('tr', {},
              el('th', { scope: 'col', text: 'Pattern' }),
              el('th', { scope: 'col', text: 'Illustration (the paper’s own wording)' }),
              el('th', { scope: 'col', text: 'Demonstrated in this lab' }))),
            el('tbody', {}, ...fam.patterns.map(patternRow)))))),
    el('p', { class: 'atlas-cite subtle', text: `Reference: ${TAXONOMY.citation}` }));
}

/**
 * One catalog row. The hierarchy is stated in words — a sub-pattern row says
 * which parent it belongs to — rather than left to a reader who already knows
 * that P2.a sits under P2, which is the thing the table is meant to teach.
 * Nothing here depends on indentation or colour to be read correctly. A missing
 * Illustration line and a pattern this lab does not build both get spelled out
 * in words rather than left as an ambiguous blank cell.
 */
function patternRow(p) {
  return el('tr', {},
    // The pattern name identifies the row: a <th scope="row">, not a <td> whose
    // header-ness lived in a <strong> (1.3.1). Without it a reader hears the
    // illustration and the lab note with no way back to which pattern they
    // describe — the one thing this table exists to teach.
    el('th', { scope: 'row' },
      el('span', { text: `${p.code} ${p.name}` }),
      p.parent ? el('div', { class: 'subtle', text: `Sub-pattern of ${p.parent}` }) : null),
    el('td', { class: 'cellwrap-cell' },
      p.idea
        ? el('span', { class: 'cellwrap', text: `“${p.idea}”` })
        : el('span', { class: 'cellwrap subtle', text: 'Illustration line not quoted here — see the pattern catalog in the survey.' }),
      p.context ? el('div', { class: 'cellwrap subtle', text: `Context: ${p.context}` }) : null),
    el('td', { class: 'cellwrap-cell' },
      el('span', { class: 'cellwrap subtle', text: p.lab || 'Not demonstrated here.' })));
}

/**
 * The scope statement, quoted. This is why several carriers below carry no
 * pattern at all, so it sits with the table rather than in a footnote.
 */
function scopeNote() {
  const s = TAXONOMY.scope;
  if (!s) return null;
  return callout({
    kind: 'key',
    title: s.title,
    level: 4, // nested inside the taxonomy card, whose title is the <h3>
    blocks: [
      { note: `The survey draws its own boundary: “${s.quote}”` },
      s.body,
      s.caution ? { note: s.caution } : null,
    ].filter(Boolean),
  });
}

function carrierCard(c, isBuilt) {
  return el('div', { class: `card atlas-card ${isBuilt ? 'built' : 'concept'}` },
    div({ class: 'atlas-card-head' },
      el('h4', { class: 'atlas-card-title', text: c.name }),
      div({ class: 'atlas-badges' },
        span({ class: 'pill pill-normal', text: c.layer }),
        span({ class: `pill ${c.family === 'Timing' ? 'pill-mod' : c.family === 'Steganography' ? 'pill-covert' : 'pill-normal'}`, text: c.family }))),
    el('p', {}, ...inline(c.idea)),
    patternLine(c),
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

/**
 * The line the section lede has been promising: which of the eleven patterns
 * this carrier is, or — spelled out, no pill and no colour — the specific
 * reason it has none.
 *
 * There are three such reasons and they are NOT interchangeable. The survey's
 * scope sentence excludes PAYLOAD channels; it says nothing about protocol
 * switching, which the survey discusses at length and devotes §6.3 to a
 * countermeasure for. Rendering one flat "outside this catalog's scope" for
 * every blank made the hopping card contradict its own note two lines below it,
 * so the reason comes from the carrier's data instead.
 */
function patternLine(c) {
  const p = patternFor(c.pattern);
  const value = p
    ? `${p.code} ${p.name} — a ${p.familyShort ?? p.family} pattern`
    : noPatternLabel(c);
  return div({ class: 'atlas-pattern' },
    kvLine('Hiding pattern', value),
    c.patternNote ? el('p', { class: 'block-note' }, ...inline(c.patternNote)) : null);
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
