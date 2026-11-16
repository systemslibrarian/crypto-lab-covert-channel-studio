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

/**
 * Make "Skip to main content" skip to the main content, and nothing else.
 *
 * `index.html` declares the skip link as `<a href="#main">`, and letting the
 * browser follow that href is what broke it: following a fragment WRITES
 * `location.hash`, which fires the `hashchange` listener below, and `main` is
 * not a registered section — so parseHash() falls back to 'overview' and
 * applyHash() routes there. A reader three sections deep pressed the skip link
 * and was returned to the Overview. Focus still landed on #main, which is why
 * the gate's SC 2.4.1 test passed throughout; the content under the focus had
 * simply been replaced.
 *
 * So the href stays (it is what makes the link a link, keyboard-operable and
 * announced as one, and it is the correct target if scripting never runs), and
 * the default action is replaced:
 *
 *   - preventDefault(), so no hash is written and the router is never woken.
 *     The router's handling of an unknown hash is deliberately left alone: it
 *     is correct for an unknown hash, and the skip link has no business
 *     producing one.
 *   - focus() on #main, which carries tabindex="-1" in index.html, with
 *     preventScroll so the browser's own scroll-into-view does not race the
 *     deliberate one below.
 *   - scrollIntoView(), which honours the `scroll-padding-top` of
 *     `--header-h + --sp-2` set on `html` in css/base.css, so #main lands below
 *     the sticky header instead of behind it (SC 2.4.11), and inherits that
 *     element's `scroll-behavior` — smooth normally, instantly under
 *     prefers-reduced-motion.
 */
function wireSkipLink() {
  const skipLink = document.querySelector('a.skip-link');
  if (!skipLink) return;
  skipLink.addEventListener('click', (event) => {
    event.preventDefault();
    mainEl.focus({ preventScroll: true });
    mainEl.scrollIntoView();
  });
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
  let headerIsStale = false;
  if (seed != null && seed !== getState().seed) { setSeed(seed); headerIsStale = true; }
  const wantDefender = mode === 'defender';
  if (mode != null && wantDefender !== (getState().viewMode === VIEW_MODES.DEFENDER)) {
    setViewMode(wantDefender ? VIEW_MODES.DEFENDER : VIEW_MODES.SENDER);
    headerIsStale = true;
  }
  // boot() reads the hash and THEN builds the header, so a fresh load always
  // shows the seed and mode it is actually running. A hash change on an open
  // page had no equivalent: `reason: 'seed'` falls through onStateChange() to
  // `current.refresh(state)`, which re-renders the section's output panels, and
  // `reason: 'viewMode'` re-renders the SECTION — neither touches the header.
  // The result was a Seed field reading `crypto-lab` while every simulation on
  // the page ran on the seed from the URL, and Sender/Defender radios showing
  // the wrong half in the wrong mode.
  //
  // Rebuilt HERE rather than in onStateChange on purpose. The store fires
  // `reason: 'seed'` on every keystroke in the seed field, so rebuilding there
  // would replace the input the visitor is typing into and take the caret with
  // it — which is the whole reason the header is built once and left alone. A
  // hash change is a navigation, not a keystroke: `history.replaceState()` in
  // syncUrl() raises no `hashchange`, so typing, clicking a nav link and
  // flipping the mode switch never reach this line. Only the back/forward
  // button, a followed link and an explicit `location.hash = …` do.
  if (headerIsStale) buildHeader();
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
  wireSkipLink();
  subscribe(onStateChange);
  window.addEventListener('hashchange', applyHash);

  const start = VALID.has(section) ? section : 'overview';
  if (start === getState().section) renderSection(start);
  else setSection(start);
  syncUrl();
}

boot();
