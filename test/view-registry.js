/**
 * view-registry.js — the one list of "every section view", shared by the gates
 * that render the whole exhibit (a11y, contrast, target size).
 *
 * Not a test file: it defines no tests. Keeping the list in one place means a
 * new section is covered by every gate at once, and the assertion below means
 * forgetting to add it here is itself a test failure rather than silent gaps.
 */

/** section id → [module basename, exported factory name] */
export const VIEW_MODULES = {
  overview: ['overviewView', 'renderOverview'],
  dns: ['dnsView', 'renderDnsView'],
  timing: ['timingView', 'renderTimingView'],
  storage: ['storageView', 'renderStorageView'],
  ordering: ['orderingView', 'renderOrderingView'],
  icmp: ['icmpView', 'renderIcmpView'],
  hopping: ['hoppingView', 'renderHoppingView'],
  http: ['httpView', 'renderHttpView'],
  stego: ['stegoView', 'renderStegoView'],
  metadata: ['metadataView', 'renderMetadataView'],
  physical: ['physicalView', 'renderPhysicalView'],
  cache: ['cacheView', 'renderCacheView'],
  detection: ['detectionView', 'renderDetectionView'],
  challenge: ['challengeView', 'renderChallengeView'],
  validation: ['validationView', 'renderValidationView'],
  warden: ['wardenView', 'renderWardenView'],
  compare: ['comparisonView', 'renderComparisonView'],
  atlas: ['atlasView', 'renderAtlasView'],
  cases: ['caseStudiesView', 'renderCaseStudiesView'],
  srm: ['srmView', 'renderSrmView'],
  concepts: ['conceptsView', 'renderConceptsView'],
  defense: ['defenseView', 'renderDefenseView'],
  glossary: ['glossaryView', 'renderGlossaryView'],
  quiz: ['quizView', 'renderQuizView'],
};

/**
 * Import every view factory. The DOM shim must already be installed.
 * @returns {Promise<[string, Function][]>} [section id, factory]
 */
export async function loadViews() {
  const out = [];
  for (const [id, [mod, fn]] of Object.entries(VIEW_MODULES)) {
    const factory = (await import(`../js/views/${mod}.js`))[fn];
    if (typeof factory !== 'function') throw new Error(`js/views/${mod}.js does not export ${fn}`);
    out.push([id, factory]);
  }
  return out;
}

/* ---- the app chrome -------------------------------------------------------
 * The 24 section views are only the middle of the page. The header controls,
 * the sidebar links and the footer are built by js/views/chromeView.js and
 * mounted by js/app.js into containers index.html declares — so until this
 * existed, the two most-visited components in the exhibit were measured by no
 * gate at all. That is the systemic reason a colour-only, 1.27:1 current-page
 * indicator survived a full accessibility pass.
 *
 * The wrappers below reproduce the ancestry index.html gives each region, so
 * the gates measure the chrome on the surfaces it really sits on rather than
 * against the page background. `CHROME_INDEX_MARKERS` is what keeps that copy
 * honest: a gate asserts index.html still contains every one of them, so
 * renaming a wrapper in the HTML fails a test instead of quietly turning this
 * into a measurement of a page that no longer exists.
 * ------------------------------------------------------------------------ */

/** Substrings index.html must still contain for the skeleton below to be true. */
export const CHROME_INDEX_MARKERS = [
  '<header class="app-header">',
  '<div class="brand">',
  '<div class="brand-mark" aria-hidden="true">CC</div>',
  '<div class="brand-text">',
  '<div class="header-controls" id="header-controls"></div>',
  '<nav class="sidebar" id="nav" aria-label="Exhibit sections"></nav>',
  '<footer class="app-footer" id="footer"></footer>',
];

/**
 * Build the app chrome the same way app.js does, inside index.html's wrappers.
 * The DOM shim must already be installed.
 * @returns {Promise<[string, Function][]>} [region id, factory] — same shape as
 *   loadViews(), so a gate can concatenate the two lists.
 */
export async function loadChrome() {
  const { el, div } = await import('../js/views/dom.js');
  const { headerControls, navGroups, footerContent } = await import('../js/views/chromeView.js');
  const { SECTIONS, VIEW_MODES, MAX_MESSAGE_BYTES, VERSION } = await import('../js/state.js');
  const noop = () => {};

  return [
    ['chrome-header', (state) => ({
      node: el('header', { class: 'app-header' },
        // Static in index.html, reproduced here so its text is measured too.
        div({ class: 'brand' },
          div({ class: 'brand-mark', attrs: { 'aria-hidden': 'true' }, text: 'CC' }),
          div({ class: 'brand-text' },
            el('h1', { text: 'Covert Channel Studio' }),
            el('p', { text: 'Crypto-Lab · hidden communication in protocols, timing & media' }))),
        div({ class: 'header-controls' }, ...headerControls({
          message: state.message,
          seed: state.seed,
          viewMode: state.viewMode,
          maxBytes: MAX_MESSAGE_BYTES,
          viewModes: VIEW_MODES,
          onMessage: noop, onSeed: noop, onViewMode: noop,
        }))),
    })],
    ['chrome-nav', () => {
      const node = el('nav', { class: 'sidebar', attrs: { 'aria-label': 'Exhibit sections' } },
        ...navGroups(SECTIONS, noop));
      // app.js marks the active link as the route changes; the resting styles
      // are measured on the others.
      const [first] = node.childNodes[0].childNodes.filter((n) => n.className === 'nav-link');
      if (first) first.setAttribute('aria-current', 'page');
      return { node };
    }],
    ['chrome-footer', () => ({
      node: el('footer', { class: 'app-footer' }, ...footerContent(VERSION)),
    })],
  ];
}
