/**
 * The browser gate: what only a real browser can tell us.
 *
 * test/a11y.test.js already renders all 24 views under a DOM shim and holds a
 * lot of structure — accessible names, focusable scrollers, heading outline,
 * live regions. It runs with zero dependencies and it stays. What it cannot do,
 * because there is no browser in it:
 *
 *   1. Prove the page BOOTS. index.html carries a strict `<meta>` CSP whose
 *      `script-src` is `'self'` plus one sha256 hash. test/csp.test.js proves
 *      the hash matches the file's bytes; only a browser proves the browser
 *      agrees. If it ever does not, the inline theme pin is silently refused
 *      and — worse — a mistake in that policy can refuse `js/app.js` itself,
 *      leaving a page that looks fine to every Node test and is blank to every
 *      visitor. Nothing in this repository could see that before.
 *   2. Run axe-core. The shim has no layout, no cascade and no accessibility
 *      tree, so colour contrast against the real stylesheets, ARIA validity,
 *      landmark structure and name-from-content are all out of its reach.
 *   3. Exercise the hash router by clicking, with the real event loop, and see
 *      whether an uncaught exception lands anywhere along the way.
 *
 * So: boot the real page, walk all 24 sections through the sidebar the way a
 * visitor does, and scan each rendered section with axe-core for WCAG 2.0 and
 * 2.1 A/AA — while watching the console and `pageerror` the whole time.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { VIEW_MODULES } from '../test/view-registry.js';

/** The section list is not restated here: it comes from the registry every
 *  Node gate already shares, so a new section is covered by this gate too the
 *  moment it is registered, and the nav/registry parity check below turns
 *  "registered but not navigable" into a failure. */
const SECTION_IDS = Object.keys(VIEW_MODULES);

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Collect everything the browser complains about. CSP refusals arrive as
 * console errors ("Refused to execute inline script because it violates..."),
 * never as exceptions, which is exactly why they go unnoticed.
 */
function watchForTrouble(page) {
  const trouble = [];
  page.on('console', (message) => {
    if (message.type() === 'error') trouble.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => trouble.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    trouble.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
  });
  return trouble;
}

/** Readable one-liners for whatever axe found. */
function describeViolations(label, violations) {
  return violations.map((violation) => [
    `${label}: ${violation.id} (${violation.impact}) — ${violation.help}`,
    ...violation.nodes.map((node) => `    ${node.target.join(' ')}`),
  ].join('\n')).join('\n');
}

/**
 * Scan the SETTLED sidebar, not a sidebar mid-transition.
 *
 * `.nav-link` transitions its background over --dur-fast, so for ~120ms after
 * a route change the link that was current still carries its 14%-accent fill
 * while its `.nav-index` has already snapped back to --text-faint. That pairing
 * measures 4.45:1 at the top of the fade — just under the 4.5:1 minimum — and
 * axe catches it or misses it depending on how fast the machine is. The state
 * is real but transient and belongs to no settled view, so waiting it out is
 * the difference between a gate and a coin toss. Only the sidebar's own
 * animations are awaited: the exhibit has long decorative ones (.sr-dot runs
 * 2.4s x3) that would otherwise dominate the run.
 */
async function navTransitionsSettled(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('#nav .nav-link')]
    .flatMap((link) => link.getAnimations())
    .every((animation) => animation.playState !== 'running'));
}

test('the exhibit boots in a real browser under its own Content-Security-Policy', async ({ page }) => {
  const trouble = watchForTrouble(page);

  await page.goto('/');

  // js/app.js is an ES module loaded by `<script type="module">`. If the CSP
  // refused it, or it threw, #nav stays empty and #main never gets a section.
  await expect(page.locator('#nav .nav-link').first()).toBeVisible();
  await expect(page.locator('#main .section')).toHaveCount(1);
  await expect(page.locator('#main #sec-overview')).toBeVisible();
  await expect(page.locator('#footer')).not.toBeEmpty();
  await expect(page.locator('#header-controls #seed-input')).toHaveValue('crypto-lab');

  // The hashed inline script is the ONLY thing that writes this key. Reading it
  // back is the one assertion available anywhere in this repository that says
  // a browser accepted the sha256 in the policy, not just that the hash in the
  // file matches the file.
  await expect.poll(() => page.evaluate(() => {
    try { return localStorage.getItem('theme'); } catch { return 'unreadable'; }
  })).toBe('dark');

  // Every registered view must be reachable from the sidebar, and the sidebar
  // must not offer anything that is not registered.
  const navIds = await page.locator('#nav .nav-link').evaluateAll(
    (links) => links.map((link) => link.dataset.section),
  );
  // Sorted: the sidebar groups sections for reading, the registry lists them
  // for loading, and the two orders are allowed to differ. Membership is not.
  expect([...navIds].sort()).toEqual([...SECTION_IDS].sort());

  expect(trouble, 'the page must boot with a clean console').toEqual([]);
});

test('every section passes axe-core WCAG 2.0/2.1 A+AA as the sidebar renders it', async ({ page }) => {
  const trouble = watchForTrouble(page);
  await page.goto('/');
  await expect(page.locator('#main #sec-overview')).toBeVisible();

  const failures = [];

  for (const id of SECTION_IDS) {
    // Click, rather than set location.hash: the click path is the one visitors
    // take, and it is the path that runs the store subscriber and the focus
    // move in app.js renderSection().
    await page.locator(`#nav .nav-link[data-section="${id}"]`).click();
    await expect(page.locator(`#main #sec-${id}`)).toBeVisible();

    // The route is what it claims to be, in the URL and in the sidebar.
    expect(new URL(page.url()).hash.replace(/^#/, '').split('?')[0], `hash after clicking ${id}`).toBe(id);
    await expect(
      page.locator('#nav .nav-link[aria-current="page"]'),
      `exactly one sidebar link is current on ${id}`,
    ).toHaveCount(1);
    await expect(page.locator(`#nav .nav-link[data-section="${id}"]`)).toHaveAttribute('aria-current', 'page');

    await navTransitionsSettled(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    if (results.violations.length) failures.push(describeViolations(id, results.violations));
  }

  expect(failures.join('\n'), `axe-core violations across ${SECTION_IDS.length} sections`).toBe('');
  expect(trouble, 'walking the whole exhibit must not log an error').toEqual([]);
});

test('the skip link is first in the focus order and lands focus on main', async ({ page }) => {
  const trouble = watchForTrouble(page);
  await page.goto('/');
  await expect(page.locator('#main #sec-overview')).toBeVisible();

  // SC 2.4.1. Two halves, because only a browser can answer either: the skip
  // link has to be the FIRST thing in the focus order (nothing in front of it
  // in document order is focusable), and activating it has to actually land
  // focus on #main — which depends on #main carrying tabindex="-1", something
  // no static check of the markup can confirm the browser honours.
  const firstFocusableClass = await page.evaluate(() => document.querySelector(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )?.className);
  expect(firstFocusableClass).toBe('skip-link');

  await page.locator('a.skip-link').focus();
  await expect(page.locator('a.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  expect(trouble).toEqual([]);
});

test('a shared URL restores the section, seed and view mode it encodes', async ({ page }) => {
  const trouble = watchForTrouble(page);

  // Hash routing is this lab's whole sharing mechanism, and boot() has to read
  // the hash BEFORE it builds the header, or the controls describe a different
  // simulation from the one being run. That ordering only exists at load time,
  // so this needs its own page rather than a hash change on an open one.
  await page.goto('/#warden?seed=gate-probe&mode=defender');

  await expect(page.locator('#main #sec-warden')).toBeVisible();
  await expect(page.locator('#nav .nav-link[data-section="warden"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#header-controls #seed-input')).toHaveValue('gate-probe');
  await expect(
    page.locator('#header-controls input[name="viewmode"][value="defender"]'),
  ).toBeChecked();

  // The round trip: the URL the lab rewrites must still carry the same state.
  expect(new URL(page.url()).hash).toBe('#warden?seed=gate-probe&mode=defender');

  expect(trouble).toEqual([]);
});
