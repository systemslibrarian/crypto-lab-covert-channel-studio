/**
 * app.js — bootstrap: builds the global controls, the section navigation, and
 * drives the build/refresh lifecycle as the store changes. Hash-based routing
 * keeps sections linkable. Everything runs client-side; no network is used.
 */

import {
  getState, subscribe, setSection, setMessage, setSeed, setViewMode,
  SECTIONS, VIEW_MODES, MAX_MESSAGE_BYTES, VERSION,
} from './state.js';
import { el, div, span, clear } from './views/dom.js';
import { messageInput, segmented, button } from './views/controls.js';

import { renderOverview } from './views/overviewView.js';
import { renderDnsView } from './views/dnsView.js';
import { renderTimingView } from './views/timingView.js';
import { renderStorageView } from './views/storageView.js';
import { renderOrderingView } from './views/orderingView.js';
import { renderIcmpView } from './views/icmpView.js';
import { renderHttpView } from './views/httpView.js';
import { renderStegoView } from './views/stegoView.js';
import { renderMetadataView } from './views/metadataView.js';
import { renderPhysicalView } from './views/physicalView.js';
import { renderCacheView } from './views/cacheView.js';
import { renderDetectionView } from './views/detectionView.js';
import { renderChallengeView } from './views/challengeView.js';
import { renderValidationView } from './views/validationView.js';
import { renderComparisonView } from './views/comparisonView.js';
import { renderAtlasView } from './views/atlasView.js';
import { renderSrmView } from './views/srmView.js';
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
  icmp: renderIcmpView,
  http: renderHttpView,
  stego: renderStegoView,
  metadata: renderMetadataView,
  physical: renderPhysicalView,
  cache: renderCacheView,
  detection: renderDetectionView,
  challenge: renderChallengeView,
  validation: renderValidationView,
  compare: renderComparisonView,
  atlas: renderAtlasView,
  srm: renderSrmView,
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
        s.icon ? span({ class: 'nav-icon', 'aria-hidden': 'true', text: s.icon }) : null,
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
    span({ class: 'mono', text: `v${VERSION} · MIT licensed.` })));
  footerEl.appendChild(div({ class: 'foot-note' },
    span({ text: 'Everything here is simulated in your browser — no packets, DNS queries, or images are ever sent over the network.' })));
}

/* ---- Routing & lifecycle -------------------------------------------------- */
// URLs look like `#dns?seed=crypto-lab&mode=defender` so a whole reproducible
// state is shareable. Seed and mode appear only when they differ from default.
function go(id) {
  if (!VALID.has(id)) id = 'overview';
  setSection(id); // onStateChange syncs the URL
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  const [sec, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  return {
    section: VALID.has(sec) ? sec : 'overview',
    seed: params.get('seed'),
    mode: params.get('mode'),
  };
}

function syncUrl() {
  try {
    const st = getState();
    const params = new URLSearchParams();
    if (st.seed && st.seed !== 'crypto-lab') params.set('seed', st.seed);
    if (st.viewMode === VIEW_MODES.DEFENDER) params.set('mode', 'defender');
    const qs = params.toString();
    const hash = `#${st.section}${qs ? `?${qs}` : ''}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  } catch { /* replaceState can throw in exotic contexts; ignore */ }
}

function applyHash() {
  const { section, seed, mode } = parseHash();
  if (seed != null && seed !== getState().seed) setSeed(seed);
  const wantDefender = mode === 'defender';
  if (mode != null && wantDefender !== (getState().viewMode === VIEW_MODES.DEFENDER)) {
    setViewMode(wantDefender ? VIEW_MODES.DEFENDER : VIEW_MODES.SENDER);
  }
  if (section !== current.id) setSection(section);
}

// Sections whose layout actually depends on the Sender/Defender view mode.
const VIEWMODE_SENSITIVE = new Set(['dns', 'icmp', 'timing', 'storage', 'ordering', 'http', 'stego', 'metadata', 'physical', 'cache']);

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
  } else if (reason === 'viewMode') {
    // Only rebuild sections that actually change with view mode; others (quiz,
    // glossary, …) keep their local UI state via a plain refresh.
    if (VIEWMODE_SENSITIVE.has(current.id)) renderSection(state.section, { scroll: false, focus: false });
    else if (current.refresh) current.refresh(state);
  } else if (reason === 'reset') {
    renderSection(state.section, { scroll: false, focus: false }); // reflect reset control values
  } else if (current.refresh) {
    // message / seed / param / middlebox / stego → refresh outputs only
    current.refresh(state);
  }
  syncUrl();
}

function boot() {
  // Apply any seed/mode from the incoming URL before building the header so the
  // controls reflect the shared state. No subscribers yet, so these don't render.
  const { section, seed, mode } = parseHash();
  if (seed != null) setSeed(seed);
  if (mode === 'defender') setViewMode(VIEW_MODES.DEFENDER);

  buildHeader();
  buildNav();
  buildFooter();
  subscribe(onStateChange);
  window.addEventListener('hashchange', applyHash);

  const start = VALID.has(section) ? section : 'overview';
  if (start === getState().section) renderSection(start);
  else setSection(start);
  syncUrl();
}

boot();
