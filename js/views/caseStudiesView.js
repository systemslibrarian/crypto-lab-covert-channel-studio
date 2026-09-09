/**
 * views/caseStudiesView.js — documented incidents mapped onto the lab's modules.
 *
 * Deliberately read-only: no controls, no simulation, no seed. Every other
 * analysis section computes something; this one only maps. That difference is
 * the point — it is where the exhibit stops modelling and starts pointing at
 * the record.
 */

import { el, div, span } from './dom.js';
import { sectionHeader, para, callout, inline } from './blocks.js';
import { CASE_STUDIES, CASE_GAPS, CASE_INTRO } from '../content/caseStudies.js';

/** Intent shapes the reading of a case, so it gets a visible, non-colour marker. */
function intentPill(intent) {
  const deliberate = intent === 'deliberate';
  const side = intent.startsWith('side channel');
  const cls = deliberate ? 'pill-covert' : side ? 'pill-mod' : 'pill-normal';
  const label = deliberate ? 'deliberate signalling' : side ? 'side channel, repurposed' : 'unintended by the user';
  return span({ class: `pill ${cls}`, attrs: { title: intent } }, label);
}

export function renderCaseStudiesView() {
  const node = el('section', { class: 'section', id: 'sec-cases' },
    sectionHeader({
      title: 'Case Studies',
      eyebrow: 'Analysis',
      lede: 'Every other section here models a mechanism. This one asks a harder question of five publicly documented cases: which carrier was it, which module models it, and **which named statistic in this lab would have spoken to it?**',
      outcomes: [
        'map a real reported incident onto a carrier and a **named detector**',
        'separate a **side channel** from a **covert channel**, and see one become the other',
        'explain why some of the most elegant channels in this exhibit have **no incident record at all**',
      ],
    }),
    callout({
      kind: 'key',
      title: 'Side channel or covert channel?',
      body: 'A **side channel** leaks because of how a system is built — nobody chose to send anything, and the information escapes as a by-product of doing the work. A **covert channel** is somebody deliberately modulating a mechanism in order to signal. The same physics can be either. Spectre below is exactly the moment one becomes the other: cache timing leaks on its own, and an attacker turns that leak into a transmitter. The printer entry is neither, and is the more uncomfortable case for it.',
    }),
    para(CASE_INTRO, 'section-lede'),
    callout({
      kind: 'warn',
      title: 'Mapping only',
      body: 'These entries give the carrier and what a defender could have measured. There are no indicators of compromise, no tooling, no configuration and no reproduction steps here — the same defensive framing as the rest of the exhibit. Sources are named so the primary reporting can be read directly.',
    }),
    div({ class: 'case-grid' }, ...CASE_STUDIES.map(caseCard)),
    callout({ kind: 'note', title: CASE_GAPS.title, body: CASE_GAPS.body }));

  return { node, refresh() {} };
}

function caseCard(c) {
  const nothingFires = c.wouldFire.length === 1 && c.wouldFire[0].startsWith('Nothing in this lab');
  return el('article', { class: `card case-card${nothingFires ? ' case-none' : ''}` },
    div({ class: 'case-head' },
      div({},
        el('h3', { class: 'card-title', text: c.name }),
        span({ class: 'case-when', text: c.when })),
      intentPill(c.intent)),

    el('dl', { class: 'kv-list' },
      el('dt', { text: 'Carrier' }), el('dd', {}, ...inline(c.carrier)),
      el('dt', { text: 'Pattern' }), el('dd', {}, ...inline(c.patternName)),
      el('dt', { text: 'Modelled by' }), el('dd', {},
        el('a', { class: 'case-link', href: `#${c.labModule.section}` }, c.labModule.label),
        span({ class: 'subtle', text: ' — open the module and run it' })),
      el('dt', { text: 'Source' }), el('dd', { class: 'case-source' }, c.source)),

    div({ class: 'case-fires' },
      el('h4', { class: 'case-sub', text: nothingFires ? 'What this lab would catch' : 'What would have fired here' }),
      el('ul', { class: 'block-list' }, ...c.wouldFire.map((w) => el('li', {}, ...inline(w))))),

    div({ class: 'case-caveat' },
      span({ class: 'case-caveat-tag', text: 'But' }),
      span({}, ...inline(c.caveat))));
}
