/**
 * views/chromeView.js — the app chrome: the header's global controls, the
 * sidebar navigation, and the footer.
 *
 * These three used to be private functions inside app.js. They are here because
 * app.js calls boot() at import time and reads `location` / `history`, so no
 * gate could import it — which meant the exhibit's two most-visited components
 * were measured by nothing at all. Contrast, target size and the a11y
 * invariants are all asserted by rendering the views under a DOM shim, and the
 * chrome was simply not in the list. That is how a colour-only, sub-3:1
 * current-page indicator survived a whole accessibility pass.
 *
 * Each builder is a pure node factory: state and callbacks in, an array of
 * detached nodes out, no globals beyond `document`. app.js mounts them into the
 * containers index.html declares; test/view-registry.js builds them inside the
 * same wrappers so the gates measure them on the surfaces they really sit on.
 */

import { el, div, span } from './dom.js';
import { messageInput, segmented } from './controls.js';

/**
 * The three global header controls: hidden message, seed, view mode.
 * @param {{message:string, seed:string, viewMode:string, maxBytes:number,
 *          viewModes:{SENDER:string, DEFENDER:string},
 *          onMessage?:Function, onSeed?:Function, onViewMode?:Function}} opts
 * @returns {Node[]}
 */
export function headerControls({
  message, seed, viewMode, maxBytes, viewModes,
  onMessage, onSeed, onViewMode,
}) {
  return [
    messageInput({
      value: message, maxBytes, label: 'Hidden message',
      onInput: (v) => onMessage && onMessage(v),
    }),
    seedField(seed, onSeed),
    div({ class: 'ctrl viewmode-field' },
      el('label', { class: 'ctrl-label-inline', text: 'View mode' }),
      segmented({
        name: 'viewmode', label: 'View mode', value: viewMode,
        options: [
          { value: viewModes.SENDER, label: 'Sender / Receiver', icon: '⇄' },
          { value: viewModes.DEFENDER, label: 'Defender', icon: '◎' },
        ],
        onChange: (v) => onViewMode && onViewMode(v),
      })),
  ];
}

function seedField(seed, onSeed) {
  const id = 'seed-input';
  return div({ class: 'ctrl seed-field' },
    el('label', { for: id, text: 'Seed' }),
    el('input', {
      type: 'text', id, class: 'mono', value: seed,
      attrs: { autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Deterministic simulation seed' },
      // Store the raw value so the field never disagrees with the seed in use;
      // an empty seed is still a perfectly valid deterministic key.
      on: { input: (e) => onSeed && onSeed(e.target.value) },
    }));
}

/**
 * The sidebar's grouped section links, numbered in reading order.
 * `aria-current="page"` is set by app.js as the route changes, not here.
 * @param {{id:string,label:string,group:string,icon?:string}[]} sections
 * @param {Function} [onSelect] called with a section id
 * @returns {Node[]} one `.nav-group` per group
 */
export function navGroups(sections, onSelect) {
  const groups = [];
  const byGroup = new Map();
  for (const s of sections) {
    if (!byGroup.has(s.group)) { byGroup.set(s.group, []); groups.push(s.group); }
    byGroup.get(s.group).push(s);
  }
  let index = 0;
  return groups.map((g) => {
    const groupEl = div({ class: 'nav-group' }, el('p', { class: 'nav-group-title', text: g }));
    for (const s of byGroup.get(g)) {
      index += 1;
      const idx = index;
      groupEl.appendChild(el('button', {
        class: 'nav-link', type: 'button', dataset: { section: s.id },
        on: { click: () => onSelect && onSelect(s.id) },
      },
        span({ class: 'nav-index', text: String(idx).padStart(2, '0') }),
        s.icon ? span({ class: 'nav-icon', 'aria-hidden': 'true', text: s.icon }) : null,
        span({ text: s.label })));
    }
    return groupEl;
  });
}

/**
 * The footer: attribution line plus the standing "nothing is sent" note.
 * @param {string} version
 * @returns {Node[]}
 */
export function footerContent(version) {
  return [
    div({},
      span({ text: 'Covert Channel Studio · an educational Crypto-Lab exhibit. ' }),
      span({ class: 'mono', text: `v${version} · MIT licensed.` })),
    div({ class: 'foot-note' },
      span({ text: 'Everything here is simulated in your browser — no packets, DNS queries, or images are ever sent over the network.' })),
  ];
}
