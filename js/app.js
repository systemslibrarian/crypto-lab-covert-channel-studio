/**
 * app.js — bootstrap: builds the global controls, the section navigation, and
 * drives the build/refresh lifecycle as the store changes. Hash-based routing
 * keeps sections linkable. Everything runs client-side; no network is used.
 */

import {
  getState, subscribe, setSection, setMessage, setSeed, setViewMode,
  SECTIONS, VIEW_MODES, MAX_MESSAGE_BYTES, VERSION,
} from './state.js';
import { append, clear } from './views/dom.js';
import { headerControls, navGroups, footerContent } from './views/chromeView.js';

import { renderOverview } from './views/overviewView.js';
import { renderDnsView } from './views/dnsView.js';
import { renderTimingView } from './views/timingView.js';
import { renderStorageView } from './views/storageView.js';
import { renderOrderingView } from './views/orderingView.js';
import { renderIcmpView } from './views/icmpView.js';
import { renderHoppingView } from './views/hoppingView.js';
import { renderHttpView } from './views/httpView.js';
import { renderStegoView } from './views/stegoView.js';
import { renderMetadataView } from './views/metadataView.js';
import { renderPhysicalView } from './views/physicalView.js';
import { renderCacheView } from './views/cacheView.js';
import { renderDetectionView } from './views/detectionView.js';
import { renderChallengeView } from './views/challengeView.js';
import { renderValidationView } from './views/validationView.js';
import { renderWardenView } from './views/wardenView.js';
import { renderComparisonView } from './views/comparisonView.js';
import { renderAtlasView } from './views/atlasView.js';
import { renderCaseStudiesView } from './views/caseStudiesView.js';
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
  hopping: renderHoppingView,
  http: renderHttpView,
  stego: renderStegoView,
  metadata: renderMetadataView,
  physical: renderPhysicalView,
  cache: renderCacheView,
  detection: renderDetectionView,
  challenge: renderChallengeView,
  validation: renderValidationView,
  warden: renderWardenView,
  compare: renderComparisonView,
  atlas: renderAtlasView,
  cases: renderCaseStudiesView,
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

/* ---- Global chrome: header controls, navigation, footer --------------------
 * The markup lives in js/views/chromeView.js so the accessibility gates can
 * build it without booting the app; this file owns the wiring to the store and
 * the router.
 * ------------------------------------------------------------------------ */
function buildHeader() {
  const state = getState();
  clear(headerEl);
  append(headerEl, headerControls({
    message: state.message,
    seed: state.seed,
    viewMode: state.viewMode,
    maxBytes: MAX_MESSAGE_BYTES,
    viewModes: VIEW_MODES,
    onMessage: (v) => setMessage(v),
    onSeed: (v) => setSeed(v),
    onViewMode: (v) => setViewMode(v),
  }));
}

function buildNav() {
  clear(navEl);
  append(navEl, navGroups(SECTIONS, go));
}

function buildFooter() {
  clear(footerEl);
  append(footerEl, footerContent(VERSION));
}

function updateNav(activeId) {
  for (const link of navEl.querySelectorAll('.nav-link')) {
    if (link.dataset.section === activeId) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
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
const VIEWMODE_SENSITIVE = new Set(['dns', 'icmp', 'timing', 'storage', 'ordering', 'http', 'hopping', 'stego', 'metadata', 'physical', 'cache']);

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
