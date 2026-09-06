/**
 * app.js — bootstrap: builds the global controls, the section navigation, and
 * drives the build/refresh lifecycle as the store changes. Hash-based routing
 * keeps sections linkable. Everything runs client-side; no network is used.
 */

import {
  getState, subscribe, setSection, setMessage, setSeed, setViewMode,
  SECTIONS, VIEW_MODES, MAX_MESSAGE_BYTES,
} from './state.js';
import { el, div, span, clear } from './views/dom.js';
import { messageInput, segmented, button } from './views/controls.js';

import { renderOverview } from './views/overviewView.js';
import { renderDnsView } from './views/dnsView.js';
import { renderTimingView } from './views/timingView.js';
import { renderStorageView } from './views/storageView.js';
import { renderOrderingView } from './views/orderingView.js';
import { renderStegoView } from './views/stegoView.js';
import { renderDetectionView } from './views/detectionView.js';
import { renderComparisonView } from './views/comparisonView.js';
import { renderConceptsView } from './views/conceptsView.js';
import { renderDefenseView } from './views/defenseView.js';
import { renderGlossaryView } from './views/glossaryView.js';
import { renderQuizView } from './views/quizView.js';

const VIEWS = {
  overview: renderOverview,
  dns: renderDnsView,
  timing: renderTimingView,
  storage: renderStorageView,
  ordering: renderOrderingView,
  stego: renderStegoView,
  detection: renderDetectionView,
  compare: renderComparisonView,
  concepts: renderConceptsView,
  defense: renderDefenseView,
  glossary: renderGlossaryView,
  quiz: renderQuizView,
};

const VALID = new Set(SECTIONS.map((s) => s.id));
let current = { id: null, refresh: null };

const mainEl = document.getElementById('main');
const navEl = document.getElementById('nav');
const headerEl = document.getElementById('header-controls');
const footerEl = document.getElementById('footer');

/* ---- Global header controls ----------------------------------------------- */
function buildHeader() {
  const state = getState();
  clear(headerEl);
  headerEl.appendChild(messageInput({
    value: state.message, maxBytes: MAX_MESSAGE_BYTES, label: 'Hidden message',
    onInput: (v) => setMessage(v),
  }));
  headerEl.appendChild(seedField(state.seed));
  headerEl.appendChild(div({ class: 'ctrl viewmode-field' },
    el('label', { class: 'ctrl-label-inline', text: 'View mode' }),
    segmented({
      name: 'viewmode', label: 'View mode', value: state.viewMode,
      options: [
        { value: VIEW_MODES.SENDER, label: 'Sender / Receiver', icon: '⇄' },
        { value: VIEW_MODES.DEFENDER, label: 'Defender', icon: '◎' },
      ],
      onChange: (v) => setViewMode(v),
    })));
}

function seedField(seed) {
  const id = 'seed-input';
  return div({ class: 'ctrl seed-field' },
    el('label', { for: id, text: 'Seed' }),
    el('input', {
      type: 'text', id, class: 'mono', value: seed,
      attrs: { autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Deterministic simulation seed' },
      // Store the raw value so the field never disagrees with the seed in use;
      // an empty seed is still a perfectly valid deterministic key.
      on: { input: (e) => setSeed(e.target.value) },
    }));
}

/* ---- Navigation ----------------------------------------------------------- */
function buildNav() {
  clear(navEl);
  const groups = [];
  const byGroup = new Map();
  for (const s of SECTIONS) {
    if (!byGroup.has(s.group)) { byGroup.set(s.group, []); groups.push(s.group); }
    byGroup.get(s.group).push(s);
  }
  let index = 0;
  for (const g of groups) {
    const groupEl = div({ class: 'nav-group' }, el('p', { class: 'nav-group-title', text: g }));
    for (const s of byGroup.get(g)) {
      index += 1;
      const idx = index;
      groupEl.appendChild(el('button', {
        class: 'nav-link', type: 'button', dataset: { section: s.id },
        on: { click: () => go(s.id) },
      },
        span({ class: 'nav-index', text: String(idx).padStart(2, '0') }),
        span({ text: s.label })));
    }
    navEl.appendChild(groupEl);
  }
}

function updateNav(activeId) {
  for (const link of navEl.querySelectorAll('.nav-link')) {
    if (link.dataset.section === activeId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/* ---- Footer --------------------------------------------------------------- */
function buildFooter() {
  clear(footerEl);
  footerEl.appendChild(div({},
    span({ text: 'Covert Channel Studio · an educational Crypto-Lab exhibit. ' }),
    span({ class: 'mono', text: 'MIT licensed.' })));
  footerEl.appendChild(div({ class: 'foot-note' },
    span({ text: 'Everything here is simulated in your browser — no packets, DNS queries, or images are ever sent over the network.' })));
}

/* ---- Routing & lifecycle -------------------------------------------------- */
function go(id) {
  if (!VALID.has(id)) id = 'overview';
  if (location.hash !== `#${id}`) location.hash = id;
  setSection(id);
}

// Sections whose layout actually depends on the Sender/Defender view mode.
const VIEWMODE_SENSITIVE = new Set(['dns', 'timing', 'storage', 'ordering', 'stego']);

function renderSection(id, opts = {}) {
  const scroll = opts.scroll !== false;
  const focus = opts.focus !== false;
  const factory = VIEWS[id] || VIEWS.overview;
  const { node, refresh } = factory(getState());
  clear(mainEl);
  mainEl.appendChild(node);
  current = { id, refresh };
  updateNav(id);
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  // Move focus into the new section so screen-reader users are taken to the
  // fresh content on navigation (not on in-place rebuilds).
  if (focus) mainEl.focus({ preventScroll: !scroll });
}

function onStateChange(state, meta = {}) {
  const reason = meta.reason;
  if (reason === 'section') {
    if (state.section !== current.id) renderSection(state.section);
    return;
  }
  if (reason === 'viewMode') {
    // Only rebuild sections that actually change with view mode; others (quiz,
    // glossary, …) keep their local UI state via a plain refresh.
    if (VIEWMODE_SENSITIVE.has(current.id)) renderSection(state.section, { scroll: false, focus: false });
    else if (current.refresh) current.refresh(state);
    return;
  }
  if (reason === 'reset') {
    renderSection(state.section, { scroll: false, focus: false }); // reflect reset control values
    return;
  }
  // message / seed / param / middlebox / stego → refresh outputs only
  if (current.refresh) current.refresh(state);
}

function initialSection() {
  const hash = (location.hash || '').replace(/^#/, '');
  return VALID.has(hash) ? hash : 'overview';
}

function boot() {
  buildHeader();
  buildNav();
  buildFooter();
  subscribe(onStateChange);
  window.addEventListener('hashchange', () => {
    const id = initialSection();
    if (id !== current.id) setSection(id);
  });
  const start = initialSection();
  if (start === getState().section) renderSection(start); // no emit will fire; render directly
  else setSection(start); // emits 'section' → onStateChange renders exactly once
}

boot();
