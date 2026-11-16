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

/* ---- where a control's accessible name actually comes from ------------------
 *
 * axe-core's `label` rule is satisfied by a non-empty `placeholder`. That is
 * faithful to the HTML accessible name computation — the placeholder really is
 * a last-resort step for a text input — but it is not a name anything should
 * ship on: the placeholder vanishes the moment the field has content, so the
 * name disappears exactly when a user needs to check what they are editing, and
 * it is drawn at hint-text weight and colour.
 *
 * The consequence for THIS gate is sharper than a style objection. Delete the
 * `<label>` from a field that also carries a placeholder and the axe scan above
 * stays green — the control still has *a* name, so `label` does not fire.
 * Nothing in the browser gate would notice the label had gone.
 *
 * So the rule below is deliberately STRICTER than axe. It does not ask "does
 * this control have a name?" — axe already asks that, and is kept for it. It
 * asks "does the name come from a mechanism that stays exposed once the field
 * is in use?", and accepts exactly four:
 *
 *     label[for="id"]     a <label> anywhere in the document pointing at it
 *     a wrapping <label>  the control nested inside its own <label>
 *     aria-label          an explicit name on the control
 *     aria-labelledby     an explicit name by reference, with real text behind it
 *
 * A `placeholder` alone FAILS. A `title` alone FAILS. Both are hints. A control
 * with a real label AND a placeholder PASSES — a hint beside a label is fine,
 * and the glossary filter is exactly that shape, asserted by name below.
 */

/**
 * What counts as a form control here.
 *
 * Four input types are excluded, and the exclusions are about what a name could
 * even mean for them:
 *
 *   [type="hidden"] — never rendered and never in the accessibility tree, so
 *                     there is nothing to name and nothing to announce.
 *   [type="submit"] — named by its `value`, and by a user-agent default
 *                     ("Submit") when `value` is absent, so it is never nameless.
 *   [type="button"] — named by its `value`, for the same reason.
 *   [type="image"]  — named by its `alt`, which IS a real labelling mechanism,
 *                     just not one of the four this rule lists.
 *
 * None of the four accepts a `placeholder` at all, which is the blind spot this
 * rule exists to close — so including them would only add noise. `reset` is the
 * one other button-shaped type; this exhibit has none, and if one is ever added
 * it belongs on this list for the same `value` reason.
 *
 * An <input> with no `type` attribute defaults to text and IS in scope: the
 * :not() chain matches it, because an absent attribute matches no [type=...].
 */
const NAME_SCOPE_SELECTOR = [
  'input:not([type="hidden" i]):not([type="submit" i]):not([type="button" i]):not([type="image" i])',
  'select',
  'textarea',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="textbox"]',
].join(', ');

/**
 * Runs IN THE PAGE. Reports, per control, every real labelling mechanism that
 * produced text for it — and, separately, the placeholder and title it has, so
 * a failure can say what the control was relying on instead.
 *
 * Self-contained on purpose: Playwright serialises this function into the page,
 * so it can close over nothing from this module.
 *
 * @param {{selector: string, rootSelector?: string}} opts
 */
function auditNameSources({ selector, rootSelector }) {
  const root = rootSelector ? document.querySelector(rootSelector) : document;
  if (!root) throw new Error(`audit root ${rootSelector} was not found in the page`);

  /**
   * The text a labelling element actually contributes to an accessible name.
   * `aria-hidden="true"` and `hidden` subtrees contribute nothing — the switch
   * and segmented controls wrap a decorative track and an icon inside their own
   * <label>, and counting those as the label text would let a label made only
   * of decoration pass. `skip` drops the control itself out of its wrapping
   * label, so a <select>'s option text can never masquerade as its label.
   */
  const nameText = (node, skip) => {
    if (!node) return '';
    let out = '';
    const visit = (n) => {
      if (n === skip) return;
      if (n.nodeType === Node.TEXT_NODE) { out += n.nodeValue; return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      if (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('hidden')) return;
      for (const child of n.childNodes) visit(child);
    };
    for (const child of node.childNodes) visit(child);
    return out.replace(/\s+/g, ' ').trim();
  };

  /** Enough to find the control again by hand. */
  const describe = (elm) => {
    const home = elm.closest('.section, header, nav, footer');
    const where = home ? (home.id || home.tagName.toLowerCase()) : 'document';
    const type = elm.getAttribute('type');
    const role = elm.getAttribute('role');
    const classes = String(elm.className || '').trim().split(/\s+/).filter(Boolean)
      .map((c) => `.${c}`).join('');
    return `${where} > ${elm.tagName.toLowerCase()}`
      + (type ? `[type="${type}"]` : '')
      + (role ? `[role="${role}"]` : '')
      + (elm.id ? `#${elm.id}` : '')
      + classes;
  };

  return [...root.querySelectorAll(selector)].map((elm) => {
    const sources = [];

    const id = elm.getAttribute('id');
    if (id) {
      // Document-wide, not within `root`: a label[for] does not have to be a
      // sibling, or even nearby.
      const texts = [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)]
        .map((l) => nameText(l, elm)).filter(Boolean);
      if (texts.length) sources.push(`label[for="${id}"] -> "${texts[0]}"`);
    }

    const wrapping = elm.closest('label');
    if (wrapping) {
      const text = nameText(wrapping, elm);
      if (text) sources.push(`wrapping <label> -> "${text}"`);
    }

    const ariaLabel = String(elm.getAttribute('aria-label') || '').trim();
    if (ariaLabel) sources.push(`aria-label -> "${ariaLabel}"`);

    const labelledby = String(elm.getAttribute('aria-labelledby') || '').trim();
    if (labelledby) {
      const text = labelledby.split(/\s+/).filter(Boolean)
        .map((ref) => document.getElementById(ref))
        .filter(Boolean)
        .map((target) => nameText(target) || String(target.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .join(' ');
      if (text) sources.push(`aria-labelledby="${labelledby}" -> "${text}"`);
    }

    return {
      where: describe(elm),
      sources,
      placeholder: String(elm.getAttribute('placeholder') || '').trim(),
      title: String(elm.getAttribute('title') || '').trim(),
    };
  });
}

/** Both halves of the Sender/Defender switch: eleven channel views rebuild on it. */
const VIEW_MODES = ['sender', 'defender'];

test('every form control is named by a label, aria-label or aria-labelledby — never by a placeholder', async ({ page }) => {
  const trouble = watchForTrouble(page);
  await page.goto('/');
  await expect(page.locator('#main #sec-overview')).toBeVisible();

  const failures = new Set();
  const distinct = new Set();
  let sightings = 0;
  let withPlaceholder = 0;
  let labelledAndPlaceholdered = 0;

  for (const mode of VIEW_MODES) {
    // Clicked, not poked into the store: the switch rebuilds eleven of the
    // channel views, so a control that exists in only one mode is on the page
    // only after this. The radio itself is 0x0 and opacity:0 (css/components.css
    // `.seg-input`), so the click goes to its `.seg-btn` label, the way a
    // visitor clicks it.
    await page.locator(`#header-controls input[name="viewmode"][value="${mode}"] + .seg-btn`).click();
    await expect(page.locator(`#header-controls input[name="viewmode"][value="${mode}"]`)).toBeChecked();

    for (const id of SECTION_IDS) {
      await page.locator(`#nav .nav-link[data-section="${id}"]`).click();
      await expect(page.locator(`#main #sec-${id}`)).toBeVisible();

      // The whole document, not just #main: the header's three global controls
      // and the sidebar are on every one of these surfaces too, and a label
      // deleted there would show on all 24.
      const records = await page.evaluate(auditNameSources, { selector: NAME_SCOPE_SELECTOR });
      expect(
        records.length,
        `${mode}/${id}: the audit found no form controls at all — NAME_SCOPE_SELECTOR has gone stale, `
        + 'or the section did not render',
      ).toBeGreaterThan(0);

      for (const record of records) {
        sightings += 1;
        distinct.add(record.where);
        if (record.placeholder) withPlaceholder += 1;
        if (record.placeholder && record.sources.length) labelledAndPlaceholdered += 1;
        if (record.sources.length) continue;

        const relying = record.placeholder
          ? `its only name would be placeholder="${record.placeholder}", which axe's \`label\` rule `
            + 'accepts as a last resort and this rule does not'
          : record.title
            ? `its only name would be title="${record.title}", which is a hint, not a label`
            : 'and it has no placeholder or title either, so it is simply nameless';
        failures.add(
          `[${mode}] ${record.where}: no accessible name from label[for], a wrapping <label>, `
          + `aria-label or aria-labelledby — ${relying}`,
        );
      }
    }
  }

  // Counts in the log, so a run that silently audited nothing cannot read as a
  // pass. The floor is well under the real figure and exists only to catch a
  // walk that collapsed, not to be kept in step with the exhibit.
  console.log(
    `[accessible-name-source] ${sightings} control sightings over ${SECTION_IDS.length} sections x `
    + `${VIEW_MODES.length} view modes; ${distinct.size} distinct controls; ${withPlaceholder} sightings `
    + `carried a placeholder, ${labelledAndPlaceholdered} of those also had a real label; `
    + `${failures.size} named by a placeholder or a title alone.`,
  );
  expect(distinct.size, 'the audit must actually reach the exhibit controls').toBeGreaterThan(20);
  expect(
    labelledAndPlaceholdered,
    'at least one control must carry a real label AND a placeholder, or the pass case is untested',
  ).toBeGreaterThan(0);

  expect([...failures].join('\n'), 'form controls named only by a placeholder or a title').toBe('');
  expect(trouble, 'auditing both view modes must not log an error').toEqual([]);
});

test('the name-source rule passes a label beside a placeholder and fails a placeholder or title alone', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#main #sec-overview')).toBeVisible();

  // 1. The production case, first, because it is the one that has to keep
  //    working. The glossary filter carries BOTH aria-label and placeholder
  //    (js/views/glossaryView.js) and must pass.
  await page.locator('#nav .nav-link[data-section="glossary"]').click();
  await expect(page.locator('#main #sec-glossary')).toBeVisible();
  const [glossary] = await page.evaluate(auditNameSources, { selector: '.glossary-search' });
  expect(glossary.placeholder, 'the glossary filter is this exhibit label-plus-placeholder case')
    .toBe('Filter terms…');
  expect(glossary.sources.join(' | '), 'a real label beside a placeholder must still pass')
    .toContain('aria-label -> "Filter glossary terms"');

  // 2. The rejections. These cannot be shown on production markup without
  //    breaking it, so three throwaway probes are built in the page, audited by
  //    the same function, and removed. No inline `style` attribute is set on
  //    them: this page's CSP is `style-src 'self'`, which refuses one.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'name-source-probe';

    const placeholderOnly = document.createElement('input');
    placeholderOnly.type = 'text';
    placeholderOnly.id = 'probe-placeholder-only';
    placeholderOnly.setAttribute('placeholder', 'Filter terms…');

    const titleOnly = document.createElement('input');
    titleOnly.type = 'text';
    titleOnly.id = 'probe-title-only';
    titleOnly.setAttribute('title', 'Filter terms');

    const labelAndPlaceholder = document.createElement('input');
    labelAndPlaceholder.type = 'text';
    labelAndPlaceholder.id = 'probe-label-and-placeholder';
    labelAndPlaceholder.setAttribute('placeholder', 'Filter terms…');
    const realLabel = document.createElement('label');
    realLabel.setAttribute('for', 'probe-label-and-placeholder');
    realLabel.textContent = 'Filter glossary terms';

    host.append(placeholderOnly, titleOnly, realLabel, labelAndPlaceholder);
    document.body.appendChild(host);
  });

  const probes = await page.evaluate(auditNameSources, {
    selector: NAME_SCOPE_SELECTOR, rootSelector: '#name-source-probe',
  });
  const byId = Object.fromEntries(probes.map((p) => [p.where.split('#')[1], p]));

  expect(Object.keys(byId).sort(), 'all three probes must be in scope').toEqual([
    'probe-label-and-placeholder', 'probe-placeholder-only', 'probe-title-only',
  ]);
  expect(byId['probe-placeholder-only'].sources, 'a placeholder alone is not a label').toEqual([]);
  expect(byId['probe-title-only'].sources, 'a title alone is not a label').toEqual([]);
  expect(byId['probe-label-and-placeholder'].sources, 'a label beside a placeholder is a label')
    .toEqual(['label[for="probe-label-and-placeholder"] -> "Filter glossary terms"']);

  // 3. And the reason this rule exists: axe, scanning the same three probes
  //    with its own `label` rule, finds nothing wrong with any of them. If this
  //    ever fails, axe has stopped accepting a placeholder-only or title-only
  //    name and the gap above may have closed upstream — re-read the rule
  //    before deleting anything.
  const axeOnProbes = await new AxeBuilder({ page })
    .include('#name-source-probe').withRules(['label']).analyze();
  expect(
    axeOnProbes.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    'axe label rule on a placeholder-only and a title-only control: the gap this rule covers',
  ).toEqual([]);
  console.log(
    `[accessible-name-source] probes: ${probes.length} audited; `
    + `axe \`label\` violations on the same three: ${axeOnProbes.violations.length}; `
    + `rule rejections: ${probes.filter((p) => !p.sources.length).length}.`,
  );

  await page.evaluate(() => document.getElementById('name-source-probe')?.remove());
});
