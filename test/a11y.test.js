/**
 * a11y.test.js — a dependency-free accessibility gate.
 *
 * Renders every view (both view modes) under a minimal DOM shim and asserts the
 * invariants that are cheap to regress. This is what caught (and now prevents)
 * the empty-<label> regression on the challenge dropdown.
 *
 * What it holds:
 *   1. every interactive control has an accessible name          (4.1.2)
 *   2. every scroll container — the set is DERIVED FROM THE CSS, not listed
 *      here — is a focusable, labelled region                    (2.1.1, 1.3.1)
 *   3. pressing a button never destroys the focused element without moving
 *      focus somewhere                                           (2.4.3, 3.2.2)
 *   4. heading levels describe the real outline                  (1.3.1)
 *   5. status regions are polite, atomic, small, and survive re-render (4.1.3)
 *   6. the app chrome — header controls, sidebar nav, footer     (4.1.2, 2.1.1)
 *
 * (2) and (3) are the additions that close the gate's two historic blind spots:
 * the old region matcher named `table-wrap`/`timeline-wrap` literally, so
 * `.notebook-md` — a genuinely unreachable scroller — passed CI, and nothing
 * asserted anything about focus, so four self-destroying buttons were invisible
 * to a suite that ran on every commit. (6) closes the third: the gate rendered
 * the 24 section views and nothing else, so the header and the navigation — the
 * two components every visitor uses — were measured by no gate at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomShim, walk, hasClass } from './dom-shim.js';
import { allRules } from './css-model.js';
import { loadViews, loadChrome, CHROME_INDEX_MARKERS } from './view-registry.js';

installDomShim();

/* ---- focus instrumentation -------------------------------------------------
 * The shim gives every node a no-op focus(). Patch the factory so focus() is
 * observable, and give the document an activeElement — enough to answer "did
 * pressing this button leave focus nowhere?", which is the whole question in
 * SC 3.2.2 / 2.4.3 terms. Done here rather than in dom-shim.js so the other
 * gates that share the shim are unaffected.
 * ------------------------------------------------------------------------ */
document.activeElement = null;
for (const factory of ['createElement', 'createElementNS']) {
  const real = document[factory].bind(document);
  document[factory] = (...args) => {
    const node = real(...args);
    node.focus = () => { document.activeElement = node; };
    node.blur = () => { if (document.activeElement === node) document.activeElement = null; };
    return node;
  };
}

const { getState, setViewMode } = await import('../js/state.js');
const VIEWS = await loadViews();
const CHROME = await loadChrome();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- helpers -------------------------------------------------------------- */

/** Resolve an accessible name for a control, following the shim's DOM. */
function accessibleName(node, root) {
  const aria = node.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const id = node.getAttribute('id');
  if (id) {
    const labels = walk(root, (n) => n.tagName === 'LABEL' && n.getAttribute('for') === id);
    for (const l of labels) if ((l.textContent || '').trim()) return l.textContent.trim();
  }
  // ancestor <label> (wrapping pattern used by switches/segmented/file inputs)
  let p = node.parentNode;
  while (p) { if (p.tagName === 'LABEL' && (p.textContent || '').trim()) return p.textContent.trim(); p = p.parentNode; }
  if (node.tagName === 'BUTTON' && (node.textContent || '').trim()) return node.textContent.trim();
  return '';
}

/**
 * Every class the stylesheets turn into a scroll container.
 *
 * Derived rather than listed: add `overflow-x: auto` to a new component and this
 * gate immediately requires the markup to make it reachable, instead of waiting
 * for someone to remember to extend a hard-coded set. (`.notebook-md` reached
 * production precisely because that set was hard-coded.)
 */
function scrollerClasses() {
  const classes = new Set();
  for (const r of allRules()) {
    const scrolls = ['overflow', 'overflow-x', 'overflow-y']
      .some((p) => r.decls[p] && /^(auto|scroll)$/i.test(r.decls[p].trim()));
    if (!scrolls) continue;
    for (const sel of r.selectors) {
      const last = sel.split(/\s+/).filter(Boolean).pop() || '';
      for (const cls of last.match(/\.[A-Za-z0-9_-]+/g) || []) classes.add(cls.slice(1));
    }
  }
  return classes;
}
const SCROLLERS = scrollerClasses();

/** Is `node` still reachable from `root`? (the shim leaves parentNode dangling) */
function connected(root, node) {
  let found = false;
  walk(root, (n) => { if (n === node) found = true; return false; });
  return found;
}

const describe = (n) => `${n.tagName.toLowerCase()}${n.className ? `.${n.className.split(' ').join('.')}` : ''}`
  + `${n.getAttribute('type') ? `[${n.getAttribute('type')}]` : ''}`;

/**
 * Did pressing `btn` strand the reader? True when the button removed itself
 * from the tree and focus was not moved to something still in it — the browser
 * then drops focus to <body> and the reader restarts from the top of the page.
 */
function focusLost(root, btn) {
  if (connected(root, btn)) return false;          // still there: focus is intact
  const now = document.activeElement;
  return now === btn || now == null || !connected(root, now);
}

/** Fire a node's click listeners with an event object close enough to the real one. */
function press(btn) {
  const event = { target: btn, currentTarget: btn, type: 'click', preventDefault() {}, stopPropagation() {} };
  for (const fn of (btn._listeners && btn._listeners.click) || []) {
    try { fn(event); } catch { /* a handler that needs a real browser API; the DOM check still holds */ }
  }
}

/* ---- 1 + 2: names and scroll containers ----------------------------------- */

test('a11y: the scroller set is derived from the CSS and still finds the known ones', () => {
  for (const known of ['table-wrap', 'timeline-wrap', 'notebook-md', 'block-code']) {
    assert.ok(SCROLLERS.has(known),
      `${known} is no longer detected as a scroll container — the derivation in this file has gone stale `
      + `(found: ${[...SCROLLERS].sort().join(', ')})`);
  }
});

for (const [id, factory] of VIEWS) {
  test(`a11y: ${id} — controls have accessible names, regions are labelled (both modes)`, () => {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node } = factory(getState());

      // Every button, select, textarea, and named-role input has an accessible name.
      const controls = walk(node, (n) => ['BUTTON', 'SELECT', 'TEXTAREA'].includes(n.tagName)
        || (n.tagName === 'INPUT' && ['text', 'search', 'range', 'checkbox', 'radio', 'file'].includes(n.getAttribute('type'))));
      for (const c of controls) {
        const name = accessibleName(c, node);
        assert.ok(name.length > 0, `${id} [${mode}]: ${c.tagName}${c.getAttribute('type') ? '[' + c.getAttribute('type') + ']' : ''} has no accessible name`);
      }

      // Every scroll container must be reachable and named. A region a mouse can
      // scroll and a keyboard cannot is SC 2.1.1; a focusable region with no name
      // is SC 4.1.2.
      const regions = walk(node, (n) => [...SCROLLERS].some((c) => hasClass(n, c)));
      for (const r of regions) {
        const which = [...SCROLLERS].filter((c) => hasClass(r, c)).join('/');
        assert.equal(r.getAttribute('tabindex'), '0',
          `${id} [${mode}]: .${which} scrolls (overflow:auto in the CSS) but is not keyboard-focusable — needs tabindex="0". `
          + `A pointer can scroll it and a keyboard cannot (SC 2.1.1). Fix it where the element is built `
          + `(grep -rn "${which.split('/')[0]}" js/views/) with tabindex="0", role="region" and an aria-label, `
          + 'the same treatment .table-wrap already gets.');
        assert.equal(r.getAttribute('role'), 'region',
          `${id} [${mode}]: .${which} is a focusable scroll container but has no role=region`);
        assert.ok((r.getAttribute('aria-label') || '').length > 0,
          `${id} [${mode}]: .${which} is a focusable region with no aria-label`);
      }
    }
  });
}

/* ---- 3: focus preservation ------------------------------------------------- */

test('a11y: pressing a button never leaves focus nowhere (SC 2.4.3 / 3.2.2)', () => {
  const failures = [];
  let pressed = 0;

  for (const [id, factory] of VIEWS) {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      // Snapshot first: a press can rebuild the subtree, and the buttons found
      // afterwards are different objects.
      const buttons = walk(root, (n) => n.tagName === 'BUTTON');
      for (const btn of buttons) {
        if (!((btn._listeners && btn._listeners.click) || []).length) continue;
        pressed += 1;
        document.activeElement = btn;
        press(btn);
        if (focusLost(root, btn)) {
          failures.push(`${id} [${mode}]: pressing ${describe(btn)} ("${(btn.textContent || '').trim().slice(0, 40)}") `
            + 'removed it from the DOM without moving focus — the reader is dropped back to the top of the page');
        }
      }
    }
  }

  assert.ok(pressed > 20, `expected to press the exhibit's buttons, pressed only ${pressed}`);
  assert.deepEqual(failures, [],
    `${failures.length} button press(es) destroy the focused element without moving focus:\n  ${failures.join('\n  ')}`);
});

test('a11y: the focus gate itself catches a self-destroying button', () => {
  // Non-vacuity check. The pattern below is the one that shipped four times:
  // a button whose handler rebuilds the subtree the button is in, with nothing
  // to catch focus. If this stops being flagged, the gate above is asleep.
  const root = document.createElement('div');
  const panel = document.createElement('div');
  root.appendChild(panel);
  const selfDestroying = document.createElement('button');
  selfDestroying.textContent = 'Reveal the answer';
  panel.appendChild(selfDestroying);
  selfDestroying.addEventListener('click', () => { panel.removeChild(selfDestroying); });

  document.activeElement = selfDestroying;
  press(selfDestroying);
  assert.ok(focusLost(root, selfDestroying), 'the gate must flag a button that removes itself and moves no focus');

  // …and the fix must satisfy it: rebuild, then move focus into the new content.
  const root2 = document.createElement('div');
  const panel2 = document.createElement('div');
  root2.appendChild(panel2);
  const wellBehaved = document.createElement('button');
  panel2.appendChild(wellBehaved);
  const replacement = document.createElement('p');
  wellBehaved.addEventListener('click', () => {
    panel2.removeChild(wellBehaved);
    panel2.appendChild(replacement);
    replacement.focus();
  });
  document.activeElement = wellBehaved;
  press(wellBehaved);
  assert.ok(!focusLost(root2, wellBehaved), 'moving focus to the replacement must satisfy the gate');
});

/* ---- 6: the app chrome ------------------------------------------------------
 * The 24 section views are only the middle of the page. The header's global
 * controls, the sidebar's 24 links and the footer are built by
 * js/views/chromeView.js and were, until this test, measured by nothing — which
 * is the systemic reason a colour-only current-page indicator survived a full
 * accessibility pass. The gates render them through test/view-registry.js.
 * ------------------------------------------------------------------------- */

test('a11y: the chrome the gates render is the chrome index.html mounts', () => {
  // The registry reproduces index.html's wrappers so the chrome is measured on
  // the surfaces it really sits on. If the HTML is renamed and this copy is not,
  // three gates quietly start measuring a page that does not exist.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const marker of CHROME_INDEX_MARKERS) {
    assert.ok(html.includes(marker),
      `index.html no longer contains \`${marker}\` — test/view-registry.js builds the chrome inside that `
      + 'wrapper, so the contrast, target-size and a11y gates would be measuring the wrong ancestry. '
      + 'Update CHROME_INDEX_MARKERS and the skeleton beside it together.');
  }
});

test('a11y: chrome controls have accessible names, and the nav is a labelled landmark', () => {
  for (const mode of ['sender', 'defender']) {
    setViewMode(mode);
    for (const [id, factory] of CHROME) {
      const { node } = factory(getState());

      const controls = walk(node, (n) => ['BUTTON', 'SELECT', 'TEXTAREA'].includes(n.tagName)
        || (n.tagName === 'INPUT' && ['text', 'search', 'range', 'checkbox', 'radio', 'file'].includes(n.getAttribute('type'))));
      assert.ok(controls.length > 0 || id === 'chrome-footer',
        `${id} [${mode}]: renders no controls — has the chrome stopped being built here?`);
      for (const c of controls) {
        assert.ok(accessibleName(c, node).length > 0,
          `${id} [${mode}]: ${describe(c)} has no accessible name`);
      }

      // `.sidebar` is `overflow-y: auto`, so it is a scroll container — but the
      // rule the section views follow (tabindex + role=region + aria-label) is
      // the WRONG fix here twice over: role=region would replace the navigation
      // landmark role, and a container whose content is 24 focusable buttons is
      // already keyboard-reachable, because tabbing through them scrolls it.
      // What it does owe is a name for the landmark.
      for (const scroller of walk(node, (n) => [...SCROLLERS].some((c) => hasClass(n, c)))) {
        const focusable = walk(scroller, (n) => ['BUTTON', 'A', 'SELECT', 'TEXTAREA', 'INPUT'].includes(n.tagName)
          || n.getAttribute('tabindex') != null);
        assert.ok(focusable.length > 0,
          `${id} [${mode}]: .${(scroller.className || '').split(' ').join('.')} scrolls but holds nothing focusable — `
          + 'it needs the tabindex="0" / role="region" / aria-label treatment the section scrollers get (SC 2.1.1)');
        assert.ok((scroller.getAttribute('aria-label') || '').length > 0,
          `${id} [${mode}]: the scrollable ${scroller.tagName.toLowerCase()} has no aria-label (SC 4.1.2)`);
      }
    }
  }
});

test('a11y: every nav link names its section and carries no colour-only state', () => {
  setViewMode('sender');
  const [, navFactory] = CHROME.find(([id]) => id === 'chrome-nav');
  const { node } = navFactory(getState());
  const links = walk(node, (n) => hasClass(n, 'nav-link'));
  assert.ok(links.length >= 20, `expected the exhibit's section links, found ${links.length}`);
  for (const link of links) {
    assert.equal(link.tagName, 'BUTTON', 'a nav link must be a real control');
    assert.ok((link.textContent || '').trim().length > 0, 'a nav link with no text has no accessible name');
    assert.ok(link.dataset.section, 'a nav link with no data-section cannot be marked current by app.js');
  }
  // The current item is exposed programmatically, not by colour alone. The
  // visual half — an inset accent bar at 10.39:1 — is asserted by
  // test/contrast.test.js's 1.4.11 gate, which now renders the chrome.
  const current = links.filter((l) => l.getAttribute('aria-current') === 'page');
  assert.equal(current.length, 1,
    `expected exactly one aria-current="page" link in the rendered nav, found ${current.length}`);
});

/* ---- 4: heading order ------------------------------------------------------ */

test('a11y: heading levels describe the real outline (SC 1.3.1)', () => {
  const failures = [];
  for (const [id, factory] of VIEWS) {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      const headings = walk(root, (n) => /^H[1-6]$/.test(n.tagName || ''))
        .map((n) => ({ level: Number(n.tagName[1]), text: (n.textContent || '').trim().slice(0, 48) }));

      assert.ok(headings.length > 0, `${id} [${mode}]: the section renders no headings at all`);
      // index.html owns the page <h1>; a section starts at h2.
      assert.equal(headings[0].level, 2,
        `${id} [${mode}]: the section's first heading is h${headings[0].level} ("${headings[0].text}") — `
        + 'the page <h1> is in index.html, so a section must open with h2');
      assert.ok(!headings.some((h) => h.level === 1),
        `${id} [${mode}]: renders an <h1>; the page already has one in index.html`);

      let prev = headings[0].level;
      for (const h of headings.slice(1)) {
        if (h.level > prev + 1) {
          failures.push(`${id} [${mode}]: h${prev} → h${h.level} at "${h.text}" — a level is skipped, `
            + 'so the outline claims a tier of structure that is not there');
        }
        prev = h.level;
      }
    }
  }
  assert.deepEqual(failures, [], `heading-order problems:\n  ${failures.join('\n  ')}`);
});

/* ---- 5: status regions ----------------------------------------------------- */

/**
 * The live-region rules this exhibit has to follow, and why each one matters:
 *
 *  • polite, never assertive — these are results of a slider drag, not alerts.
 *  • small — a live region containing a table or a chart reads the whole thing
 *    aloud on every tick, which is worse than announcing nothing. This gate caps
 *    the subtree: no tables, charts, lists or controls inside a live region.
 *  • it must SURVIVE refresh() — replacing a live region's node de-registers it
 *    with the screen reader and it silently stops announcing. That is the
 *    failure mode this test exists to catch, because nothing about the rendered
 *    markup looks wrong afterwards.
 */
const LIVE = (n) => (n.getAttribute && n.getAttribute('aria-live')) != null;

test('a11y: status regions are polite, small, and announce something (SC 4.1.3)', () => {
  const seen = [];
  for (const [id, factory] of VIEWS) {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      for (const region of walk(root, LIVE)) {
        const politeness = region.getAttribute('aria-live');
        seen.push(`${id}/${mode}`);
        assert.equal(politeness, 'polite',
          `${id} [${mode}]: a live region is aria-live="${politeness}" — a result that follows a slider drag `
          + 'must not interrupt the reader; use polite');
        const role = region.getAttribute('role');
        assert.ok(role === 'status' || role === 'alert' || role == null,
          `${id} [${mode}]: live region has role="${role}", which does not match aria-live="polite"`);

        // Nothing heavy inside: this is what stops an over-eager region from
        // reading a whole panel on every tick.
        const heavy = walk(region, (n) => ['TABLE', 'SVG', 'UL', 'OL', 'CANVAS', 'BUTTON', 'INPUT', 'SELECT'].includes(n.tagName)
          || (n.getAttribute && n.getAttribute('role') === 'img'));
        assert.deepEqual(heavy.map(describe), [],
          `${id} [${mode}]: a live region contains ${heavy.map(describe).join(', ')} — `
          + 'it would be read aloud in full on every update. Announce one short sentence instead');

        const text = (region.textContent || '').trim();
        assert.ok(text.length <= 240,
          `${id} [${mode}]: a live region holds ${text.length} characters ("${text.slice(0, 60)}…") — `
          + 'keep it to the headline outcome');
      }
    }
  }
  assert.ok(seen.length >= 10,
    `expected the interactive sections to carry a status region; found ${seen.length} across all views`);
});

test('a11y: a status region survives refresh() so it keeps announcing (SC 4.1.3)', () => {
  const failures = [];
  const covered = [];
  for (const [id, factory] of VIEWS) {
    setViewMode('sender');
    const { node: root, refresh } = factory(getState());
    // Only regions the view actually writes to are at risk. One that is empty
    // at build time (the notebook's copy-outcome region, say) is created and
    // written by the same click, so rebuilding it costs nothing; one that
    // already holds the section's outcome sentence is being fed from refresh(),
    // and replacing that node de-registers it with the screen reader — the
    // section announces once and then goes silent, with nothing in the rendered
    // markup to show for it.
    const written = walk(root, LIVE).filter((n) => (n.textContent || '').trim());
    if (!written.length || typeof refresh !== 'function') continue;
    covered.push(id);
    refresh(getState()); // exactly what a slider or seed change does
    for (const region of written) {
      if (!connected(root, region)) {
        failures.push(`${id}: the live region holding "${(region.textContent || '').trim().slice(0, 50)}" was replaced by `
          + 'refresh() — build it beside the panels, not inside a subtree that replace() rebuilds');
      }
    }
  }
  assert.ok(covered.length >= 10,
    `expected the interactive sections to carry an outcome region that is written at build time; only ${covered.length} did`);
  assert.deepEqual(failures, [], `${failures.length} live region(s) do not survive re-render:\n  ${failures.join('\n  ')}`);
});

test('a11y: the status region debounces and never repeats itself (SC 4.1.3)', async () => {
  // The anti-chatter contract of js/views/widgets.js statusRegion(). Without it
  // the honest fix for "nothing is announced" becomes "everything is announced
  // on every pixel of a drag", which is worse than silence.
  const widgets = await import('../js/views/widgets.js');
  assert.equal(typeof widgets.statusRegion, 'function',
    'js/views/widgets.js no longer exports statusRegion() — this gate guards its announcement behaviour');
  const delay = (ms) => new Promise((r) => { setTimeout(r, ms); });

  const { node, announce } = widgets.statusRegion({ debounceMs: 10 });
  assert.equal(node.getAttribute('aria-live'), 'polite');
  assert.equal(node.getAttribute('aria-atomic'), 'true',
    'the region must be atomic, or a reader announces only the changed words out of context');

  announce('4 bit errors of 40');
  assert.equal(node.textContent, '4 bit errors of 40',
    'the first write seeds the region while the section is still detached, so it must be immediate');

  announce('5 bit errors of 40');
  assert.equal(node.textContent, '4 bit errors of 40', 'later writes must be debounced, not applied per event');
  await delay(40);
  assert.equal(node.textContent, '5 bit errors of 40', 'the settled value must be announced once the drag stops');

  // A → B → A inside the window must say nothing: the reader is already there.
  announce('6 bit errors of 40');
  announce('5 bit errors of 40');
  await delay(40);
  assert.equal(node.textContent, '5 bit errors of 40', 'an unchanged outcome must not be re-announced');
});
