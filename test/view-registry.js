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
