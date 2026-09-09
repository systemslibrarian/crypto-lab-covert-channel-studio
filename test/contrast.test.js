/**
 * contrast.test.js — WCAG 1.4.3 (Contrast, Minimum) as a permanent invariant.
 *
 * A one-off contrast audit is worth exactly as long as it takes someone to
 * nudge a token. This gate re-derives the answer from css/base.css on every
 * run: it parses the design tokens, computes WCAG 2.1 relative luminance, and
 * measures the foreground/background pairings that actually exist.
 *
 * "Actually exist" is meant literally. The main test renders every view under
 * the DOM shim and walks the result carrying colour, font size and background
 * down the tree the way the cascade does, so what is measured is the text a
 * reader really sees on the surface it really sits on — not a worst-case matrix
 * of every token against every other, which would invent failures for pairings
 * the exhibit never puts on screen. Static tests either side of it cover what a
 * render cannot reach: rules that pair colour and background in the stylesheet,
 * and the chrome surfaces.
 *
 * What it models that a manual audit tends to miss:
 *   • the fourteen per-section `#sec-* { --accent: … }` overrides, so "the
 *     accent colour" is checked as the fourteen different colours it really is;
 *   • `--bit-color` scopes, so the bit-cell text/background pair is measured
 *     once per bit value;
 *   • translucent `color-mix(… , transparent)` fills, composited over every
 *     panel surface they can land on rather than assumed opaque;
 *   • gradients, checked at every stop, because a glyph sits on all of them.
 *
 * Failures report the measured ratio and the file:line that produced it.
 *
 * Threshold policy (WCAG 2.1 AA):
 *   4.5:1 for text, 3:1 only where the rule itself declares large text
 *   (>=24px, or >=18.66px at font-weight >=700). Nothing is exempted by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allRules, rootTokens, sectionTokenScopes, resolveColor, backgroundColors,
  contrastRatio, over, lengthPx, fmtColor, splitTop,
} from './css-model.js';
import { installDomShim, walk } from './dom-shim.js';

const ROOT_VARS = rootTokens();

/* ---------------------------------------------------------------------------
 * Surface classification.
 *
 * PANEL surfaces are painted behind arbitrary prose: the page, the cards, the
 * insets. Any text token can land on them, so every text token is measured
 * against every one of them.
 *
 * CHROME surfaces are painted only behind control furniture. That claim is not
 * taken on trust — `surface-3 is control chrome only` below re-proves it from
 * the CSS on every run, and measures whatever text does sit on them.
 * ------------------------------------------------------------------------- */
const PANEL_SURFACES = ['--bg', '--surface-0', '--surface-1', '--surface-2', '--surface-inset'];
const CHROME_SURFACES = ['--surface-3'];

/**
 * Chrome backgrounds whose contents are exempt from 1.4.3 — either they paint
 * no text at all, or the only glyph on them is pure decoration (1.4.3 exempts
 * "text that is part of an inactive component… or that is pure decoration").
 * Each entry states the claim; the test below fails if a listed selector starts
 * painting text that carries meaning, which is the signal to remove it.
 */
const DECORATIVE_CHROME = new Map([
  ['.ctrl-range', 'the slider track — no text'],
  ['.ctrl-range::-moz-range-track', 'the slider track — no text'],
  ['.ctrl-range::-webkit-slider-runnable-track', 'the slider track — no text'],
  ['.switch-track', 'aria-hidden switch furniture — no text'],
  ['.switch-input:checked + .switch-track', 'aria-hidden switch furniture — no text'],
  // js/views/timingView.js renders a "≡" texture glyph inside the packet dot.
  // It carries no information: position and the `title` do, and the title now
  // says ", dropped" outright, so the dashed --danger ring is reinforcement
  // rather than the only carrier.
  ['.tl-packet.dropped', 'contains only the decorative ≡ texture glyph'],
]);

/* ---- scopes --------------------------------------------------------------- */

/**
 * Every custom-property scope in the stylesheets, as a variable table.
 * `:root` plus one entry per rule that redefines a token (`#sec-hopping`,
 * `.bit-1`, …). Colours are measured under all of them.
 */
function variableScopes() {
  const scopes = [{ name: ':root', vars: ROOT_VARS }];
  for (const r of allRules()) {
    const custom = Object.entries(r.decls).filter(([k]) => k.startsWith('--'));
    if (!custom.length) continue;
    if (r.selectors.includes(':root')) continue;
    scopes.push({ name: `${r.selector} (${r.file}:${r.line})`, vars: { ...ROOT_VARS, ...Object.fromEntries(custom) } });
  }
  return scopes;
}
const SCOPES = variableScopes();

const decl = (r, prop) => (r.decls[prop] == null ? null : String(r.decls[prop]).trim());

function thresholdFor(decls, vars) {
  const size = lengthPx(decls['font-size'], vars);
  const weightRaw = decls['font-weight'];
  const weight = weightRaw != null ? parseInt(weightRaw, 10) : NaN;
  const bold = Number.isFinite(weight) && weight >= 700;
  if (size != null && (size >= 24 || (bold && size >= 18.66))) return 3;
  return 4.5;
}

/** Where a rendered failure lives: a section id, or one of the chrome regions. */
const where = (id) => (id.startsWith('chrome-') ? id : `#sec-${id}`);

const fmt = (n) => n.toFixed(2);
/** Collapse a multi-line CSS value so a failure message stays one line. */
const short = (v) => {
  const flat = String(v).replace(/\s+/g, ' ').trim();
  return flat.length > 72 ? `${flat.slice(0, 69)}…` : flat;
};

/* ---- 1. the token table itself -------------------------------------------- */

test('contrast: the luminance maths matches WCAG worked examples', () => {
  // Anchors the arithmetic to values that can be checked by hand, so a bug in
  // the model cannot quietly turn this whole file green.
  const white = resolveColor('#ffffff', {});
  const black = resolveColor('#000000', {});
  assert.equal(Math.round(contrastRatio(white, black) * 100) / 100, 21);
  assert.equal(Math.round(contrastRatio(white, white) * 100) / 100, 1);
  // #767676 on white is the canonical 4.54:1 "just passes" grey.
  assert.ok(Math.abs(contrastRatio(resolveColor('#767676', {}), white) - 4.54) < 0.01);
  // color-mix keeps the colour and takes the percentage as alpha over transparent…
  const tint = resolveColor('color-mix(in srgb, #ffffff 40%, transparent)', {});
  assert.equal(Math.round(tint.a * 100), 40);
  // …and compositing that over black gives 40% grey.
  assert.equal(Math.round(over(tint, black).r), 102);
});

test('contrast: the guard measures the historic --text-faint as a failure', () => {
  // A guard that cannot fail is not a guard. The defect this file was written
  // for: --text-faint #728398 on --surface-2 #1a2330, used at --fs-xs for every
  // data-table column header in the exhibit. Both literals are inline so the
  // before-number stays true no matter what the tokens become.
  const historic = contrastRatio(resolveColor('#728398', {}), resolveColor('#1a2330', {}));
  assert.ok(Math.abs(historic - 4.08) < 0.01,
    `the maths must still measure the historic pairing at 4.08:1, got ${fmt(historic)}:1`);
  assert.ok(historic < 4.5, 'the historic pairing must be measured as a failure');

  // And the token in use today clears it, measured live.
  const now = resolveColor('var(--text-faint)', ROOT_VARS);
  const surface2 = resolveColor('var(--surface-2)', ROOT_VARS);
  const ratio = contrastRatio(now, surface2);
  assert.ok(ratio >= 4.5,
    `--text-faint (${ROOT_VARS['--text-faint']}) is ${fmt(ratio)}:1 on --surface-2 — below the 4.5:1 that small text needs`);
});

test('contrast: the colour tokens in css/base.css all parse', () => {
  const colourish = Object.entries(ROOT_VARS).filter(([, v]) => /^#|^rgb|^color-mix/.test(v.trim()));
  assert.ok(colourish.length >= 20, `expected the base token table, found ${colourish.length} colour tokens`);
  for (const [name, value] of colourish) {
    assert.ok(resolveColor(value, ROOT_VARS), `token ${name}: ${value} did not parse as a colour`);
  }
});

test('contrast: every surface token used as a background is classified', () => {
  const used = new Set();
  for (const r of allRules()) {
    for (const prop of ['background', 'background-color']) {
      const v = decl(r, prop);
      if (!v) continue;
      for (const m of v.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (/^--(bg|surface)/.test(m[1])) used.add(m[1]);
      }
    }
  }
  const classified = new Set([...PANEL_SURFACES, ...CHROME_SURFACES]);
  for (const token of used) {
    assert.ok(classified.has(token),
      `${token} is painted as a background but is classified neither PANEL (prose sits on it, 4.5:1 against every text token) `
      + 'nor CHROME (control furniture only). Add it to one of the two lists in test/contrast.test.js.');
  }
});

/* ---- 2. every pairing that actually renders -------------------------------- */

/**
 * Text that 1.4.3 does not apply to. Each entry is a claim about the markup,
 * and the test fails loudly if the element stops matching (it disappears from
 * the render, or starts carrying real content), rather than aging silently.
 */
const DECORATIVE_TEXT = [
  { cls: 'tl-packet', why: 'the "≡" texture glyph inside a timeline packet dot; the packet\'s data is in its title and position' },
];

/** Does this node paint text of its own (not merely wrap children that do)? */
function paintsText(node) {
  if (node._text && node._text.trim()) return true;
  return (node.childNodes || []).some((c) => c.nodeType === 3 && String(c.textContent || '').trim());
}

/** Elements the walk below prunes on purpose: not exposed, or never painted. */
const prunedFromWalk = (node) => (node.getAttribute && node.getAttribute('aria-hidden') === 'true')
  || (node.className || '').split(' ').includes('visually-hidden');

/**
 * How many elements a walk reaches under a given fragment policy, with the same
 * two prunes the gate applies. `splice: true` is what a real DOM does when a
 * DocumentFragment is appended; `splice: false` is the naive `nodeType !== 1`
 * stop that silently skipped 1.7% of the exhibit.
 */
function reachableElements(root, { splice }) {
  let n = 0;
  const go = (node) => {
    if (!node) return;
    if (node.nodeType === 11) {
      if (splice) for (const c of node.childNodes || []) go(c);
      return;
    }
    if (node.nodeType !== 1) return;
    if (prunedFromWalk(node)) return;
    n += 1;
    for (const c of node.childNodes || []) go(c);
  };
  go(root);
  return n;
}

/** Filled in by the rendered-pairing walk; asserted by the coverage test below. */
let walkStats = null;

test('contrast: every text/background pairing that actually renders clears its threshold', async () => {
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const { computedDecls, ancestorClassIndex } = await import('./css-model.js');
  const scopes = sectionTokenScopes();

  const VIEW_MODULES = await import('./view-registry.js');
  const failures = new Map();
  const unresolved = new Set();
  let measured = 0;
  let visited = 0;
  let reference = 0;

  for (const [id, factory] of [...await VIEW_MODULES.loadViews(), ...await VIEW_MODULES.loadChrome()]) {
    const vars = { ...ROOT_VARS, ...(scopes.get(id) || {}) };
    const pageBg = resolveColor('var(--bg)', vars); // body { background: var(--bg) }
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      const ancestors = ancestorClassIndex(root);

      const visit = (node, inherited, backdrops, path) => {
        if (!node) return;
        // A DocumentFragment (nodeType 11) paints nothing and inherits nothing:
        // a real DOM splices its children into the parent on append, so they
        // render with the parent's colour, font and backdrop. The shim keeps
        // them inside the fragment, so splice them here instead of stopping —
        // renderBlocks() returns a fragment, and returning at nodeType !== 1
        // left 352 elements (every .block-* built by renderBlocks, in the views
        // that append it directly) unmeasured. `visits every element a real DOM
        // would splice in` below pins the count.
        if (node.nodeType === 11) {
          for (const child of node.childNodes || []) visit(child, inherited, backdrops, path);
          return;
        }
        if (node.nodeType !== 1) return;
        if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return; // not exposed, not read
        const classes = (node.className || '').split(' ').filter(Boolean);
        if (classes.includes('visually-hidden')) return; // never painted
        visited += 1;
        const here = classes.length ? `${path} .${classes.join('.')}` : `${path} ${node.tagName.toLowerCase()}`;
        const decls = computedDecls(node, ancestors.get(node) || new Set());

        // Custom properties inherit, and this exhibit leans on that: .bit-1 sets
        // --bit-color and .bit-cell reads it. Carry them down the subtree.
        const own = Object.entries(decls).filter(([k]) => k.startsWith('--'));
        const vars = own.length ? { ...inherited.vars, ...Object.fromEntries(own) } : inherited.vars;

        // inherited text properties
        const colorValue = (decls.color && !/^(inherit|currentColor)$/i.test(decls.color))
          ? decls.color : inherited.color;
        const fontSize = decls['font-size'] ?? inherited.fontSize;
        const fontWeight = decls['font-weight'] ?? inherited.fontWeight;

        // this element's own background, composited over what it sits on
        let bgs = backdrops;
        const bgValue = decls.background ?? decls['background-color'];
        if (bgValue && !/^(none|transparent|inherit)$/i.test(bgValue.trim())) {
          const { colors } = backgroundColors(bgValue, vars);
          if (colors.length) {
            const next = [];
            for (const c of colors) {
              if (c.a >= 1) next.push(c);
              else for (const b of backdrops) next.push(over(c, b));
            }
            bgs = next;
          }
        }

        if (paintsText(node) && !DECORATIVE_TEXT.some((d) => classes.includes(d.cls))) {
          const fg = resolveColor(colorValue, vars);
          if (!fg) unresolved.add(`${colorValue} at ${here}`);
          else {
            const need = thresholdFor({ 'font-size': fontSize, 'font-weight': fontWeight }, vars);
            let worst = null;
            for (const bg of bgs) {
              const ratio = contrastRatio(over(fg, bg), bg);
              if (!worst || ratio < worst.ratio) worst = { ratio, bg };
            }
            if (worst) {
              measured += 1;
              if (worst.ratio < need) {
                const key = `${here}|${colorValue}|${fmtColor(worst.bg)}`;
                if (!failures.has(key)) {
                  failures.set(key, `${where(id)} [${mode}]${here} — ${short(colorValue)} (${fmtColor(fg)}) on ${fmtColor(worst.bg)}: `
                    + `${fmt(worst.ratio)}:1 (needs ${need}:1 at ${short(fontSize)}${fontWeight ? `/${fontWeight}` : ''})`);
                }
              }
            }
          }
        }
        for (const child of node.childNodes || []) {
          visit(child, { color: colorValue, fontSize, fontWeight, vars }, bgs, here);
        }
      };

      // body { color: var(--text); background: var(--bg); font-size: var(--fs-base) }
      visit(root, { color: 'var(--text)', fontSize: 'var(--fs-base)', fontWeight: null, vars }, [pageBg], where(id));
      reference += reachableElements(root, { splice: true });
    }
  }
  walkStats = { visited, reference };

  assert.ok(measured > 2000, `expected thousands of rendered text pairings, measured only ${measured}`);
  assert.deepEqual([...unresolved], [],
    'these rendered text colours could not be resolved, so they escaped the contrast guard — '
    + `teach test/css-model.js to parse them:\n  ${[...unresolved].join('\n  ')}`);
  assert.deepEqual([...failures.values()], [],
    `WCAG 1.4.3 — ${failures.size} rendered pairing(s) below threshold:\n  ${[...failures.values()].join('\n  ')}`);
});

/* ---- 2a. two ways the gate can be blind while staying green ---------------
 * Both of these have already happened once. A contrast gate that measures the
 * wrong surface, or that never reaches an element, reports success either way,
 * so the coverage is asserted as directly as the ratios are.
 * ------------------------------------------------------------------------ */

test('contrast: the rendered walk visits every element a real DOM would splice in', async () => {
  assert.ok(walkStats, 'the rendered-pairing walk did not run, so its coverage cannot be checked');
  assert.equal(walkStats.visited, walkStats.reference,
    `the walk measured ${walkStats.visited} elements where a fragment-splicing DOM contains ${walkStats.reference}. `
    + 'A DocumentFragment is nodeType 11: stopping at `nodeType !== 1` skips everything renderBlocks() built, '
    + 'and the gate then reports contrast for markup it never looked at.');

  // Non-vacuity: prove fragments really are in the rendered tree, so the
  // equality above is a fixed hole and not an empty coincidence.
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const { loadViews, loadChrome } = await import('./view-registry.js');
  let naive = 0;
  let spliced = 0;
  for (const [, factory] of await loadViews()) {
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      naive += reachableElements(root, { splice: false });
      spliced += reachableElements(root, { splice: true });
    }
  }
  assert.ok(spliced > naive,
    'no DocumentFragment appears in any rendered view, so this coverage check proves nothing — '
    + 'has renderBlocks() stopped returning a fragment?');
});

test('contrast: a <th> resolves the background it is really painted on', async () => {
  // The gate's original headline defect was --text-faint on the sticky
  // --surface-2 of `.data-table thead th`. That selector has a BARE `thead`
  // between two class compounds; while the cascade model indexed ancestors by
  // class only, the whole rule was dropped and every column header in the
  // exhibit was measured against the card behind it (--surface-1, which is
  // DARKER — so the gate over-reported contrast for light text and erred in the
  // unsafe direction). Assert the resolved surface, not just the ratio.
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const { computedDecls, ancestorClassIndex } = await import('./css-model.js');
  const { loadViews, loadChrome } = await import('./view-registry.js');
  const { walk } = await import('./dom-shim.js');

  const expected = fmtColor(resolveColor('var(--surface-2)', ROOT_VARS));
  let checked = 0;
  for (const [id, factory] of await loadViews()) {
    setViewMode('defender');
    const { node: root } = factory(getState());
    const ancestors = ancestorClassIndex(root);
    // Column headers only: a `<th scope="row">` lives in the <tbody> and is
    // deliberately NOT painted by the sticky-header rule.
    for (const head of walk(root, (n) => n.tagName === 'THEAD')) {
      for (const th of walk(head, (n) => n.tagName === 'TH')) {
        const decls = computedDecls(th, ancestors.get(th) || new Set());
        const bg = decls.background ?? decls['background-color'];
        const colour = bg ? resolveColor(bg, ROOT_VARS) : null;
        assert.equal(colour ? fmtColor(colour) : 'none', expected,
          `#sec-${id}: a <thead> <th> resolves its background as ${bg ?? 'nothing'}, not the --surface-2 that `
          + '`.data-table thead th` paints — the cascade model is dropping selectors with a bare-tag ancestor');
        checked += 1;
      }
    }
  }
  assert.ok(checked > 20, `expected the exhibit's table headers, found only ${checked}`);
});

/* ---- 3. same-rule foreground/background pairs ----------------------------- */

test('contrast: every rule that paints its own text and background clears its threshold', () => {
  const failures = [];
  const panels = PANEL_SURFACES.map((s) => resolveColor(`var(${s})`, ROOT_VARS));

  for (const r of allRules()) {
    const fgValue = decl(r, 'color');
    const bgValue = decl(r, 'background') || decl(r, 'background-color');
    if (!fgValue || !bgValue) continue;
    if (/^(inherit|currentColor)$/i.test(fgValue)) continue;

    // Measure under :root and under any scope this rule itself introduces
    // (e.g. .bit-cell defaults --bit-color, .bit-1 overrides it).
    const own = Object.entries(r.decls).filter(([k]) => k.startsWith('--'));
    const scopes = [{ name: ':root', vars: ROOT_VARS }];
    if (own.length) scopes.push({ name: r.selector, vars: { ...ROOT_VARS, ...Object.fromEntries(own) } });
    for (const other of SCOPES) {
      // a scope that redefines a token this rule reads, and that could plausibly
      // wrap it (the bit palette classes sit on the same element)
      if (other.name === ':root') continue;
      if (!/^\.bit-/.test(other.name)) continue;
      if (!/--bit-color/.test(`${fgValue}${bgValue}`)) continue;
      scopes.push(other);
    }

    const need = thresholdFor(r.decls, ROOT_VARS);
    for (const scope of scopes) {
      const fg = resolveColor(fgValue, scope.vars);
      const { colors } = backgroundColors(bgValue, scope.vars);
      if (!fg || !colors.length) continue;
      // Report the worst backdrop once per rule/scope rather than one line per
      // gradient stop × panel surface.
      let worst = null;
      for (const raw of colors) {
        // A translucent fill is measured over every panel surface it can sit on.
        const backdrops = raw.a >= 1 ? [raw] : panels.map((p) => over(raw, p));
        for (const bg of backdrops) {
          const ratio = contrastRatio(over(fg, bg), bg);
          if (!worst || ratio < worst.ratio) worst = { ratio, bg };
        }
      }
      if (worst && worst.ratio < need) {
        failures.push(`${r.file}:${r.line} ${r.selector} [${scope.name}] — `
          + `color ${short(fgValue)} on background ${short(bgValue)}: `
          + `${fmt(worst.ratio)}:1 (needs ${need}:1) `
          + `[${fmtColor(fg)} on ${fmtColor(worst.bg)}]`);
      }
    }
  }
  assert.deepEqual(failures, [], `WCAG 1.4.3 — ${failures.length} same-rule pairing(s) below threshold:\n  ${failures.join('\n  ')}`);
});

/* ---- 4. the CHROME claim, re-proved ---------------------------------------- */

/**
 * Selectors whose `color` could apply to the element a chrome rule paints:
 * the element's own compound (with pseudo-classes stripped, and each of its
 * classes alone, since `.tl-packet.dropped` inherits `.tl-packet`'s colour) and
 * every ancestor compound it could inherit from.
 */
function colorSourceSelectors(selector) {
  const compounds = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const out = new Set();
  for (const compound of compounds) {
    const base = compound.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
    out.add(compound);
    if (base) out.add(base);
    for (const cls of (base.match(/\.[A-Za-z0-9_-]+/g) || [])) out.add(cls);
  }
  return out;
}

test('contrast: surface-3 is control chrome only, and what sits on it is legible', () => {
  const failures = [];
  const measured = [];
  for (const r of allRules()) {
    const bgValue = decl(r, 'background') || decl(r, 'background-color');
    if (!bgValue) continue;
    const chrome = CHROME_SURFACES.find((t) => bgValue.includes(`var(${t})`));
    if (!chrome) continue;
    const bg = resolveColor(bgValue, ROOT_VARS);
    if (!bg) continue;

    // Every colour that could paint text on this chrome: its own, or one it
    // inherits from an ancestor / less-specific rule.
    const sources = colorSourceSelectors(r.selector);
    const candidates = new Map();
    for (const other of allRules()) {
      if (!other.decls.color || /^(inherit|currentColor)$/i.test(other.decls.color.trim())) continue;
      if (!other.selectors.some((s) => sources.has(s))) continue;
      candidates.set(other.decls.color.trim(), `${other.selector} (${other.file}:${other.line})`);
    }

    const exempt = DECORATIVE_CHROME.get(r.selector);
    if (!candidates.size) {
      if (!exempt) {
        failures.push(`${r.file}:${r.line} ${r.selector} paints ${chrome} but nothing defines the colour of text on it. `
          + 'If it renders no meaningful text, add it to DECORATIVE_CHROME with that justification; otherwise give it an explicit colour.');
      }
      continue;
    }
    if (exempt) continue; // documented as decoration; ratio is not required
    const need = thresholdFor(r.decls, ROOT_VARS);
    for (const [value, source] of candidates) {
      const fg = resolveColor(value, ROOT_VARS);
      if (!fg) continue;
      const ratio = contrastRatio(over(fg, bg), bg);
      measured.push(`${r.selector} ← ${value}: ${fmt(ratio)}:1`);
      if (ratio < need) {
        failures.push(`${r.file}:${r.line} ${r.selector} — ${value} (from ${source}) on ${chrome}: ${fmt(ratio)}:1 (needs ${need}:1)`);
      }
    }
  }
  assert.ok(measured.length > 0, 'expected at least one text-bearing chrome pairing to measure');
  assert.deepEqual(failures, [], `WCAG 1.4.3 on chrome surfaces:\n  ${failures.join('\n  ')}`);
});

/* ---- 5. section accents, checked where they actually render ---------------- */

/**
 * `.btn.primary` paints its label on the accent gradient. Whether that is
 * legible depends on WHICH section it renders in, because each section
 * redefines --accent. Rather than assume, render every view and measure the
 * accent-filled controls that really appear, under that section's own tokens.
 */
test('contrast: accent-filled controls stay legible under every section accent', async () => {
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const scopes = sectionTokenScopes();

  // Rules that paint text on an accent-derived fill, restricted to plain class
  // compounds so element matching is exact.
  const fillRules = allRules().filter((r) => {
    const bg = decl(r, 'background') || decl(r, 'background-color');
    return bg && decl(r, 'color') && /var\(--accent/.test(bg)
      && r.selectors.every((s) => /^\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(s));
  });
  assert.ok(fillRules.length > 0, 'expected at least one accent-filled, text-bearing control');

  const VIEWS = {
    dns: ['dnsView', 'renderDnsView'], timing: ['timingView', 'renderTimingView'],
    storage: ['storageView', 'renderStorageView'], ordering: ['orderingView', 'renderOrderingView'],
    icmp: ['icmpView', 'renderIcmpView'], hopping: ['hoppingView', 'renderHoppingView'],
    http: ['httpView', 'renderHttpView'], stego: ['stegoView', 'renderStegoView'],
    metadata: ['metadataView', 'renderMetadataView'], physical: ['physicalView', 'renderPhysicalView'],
    cache: ['cacheView', 'renderCacheView'], warden: ['wardenView', 'renderWardenView'],
    cases: ['caseStudiesView', 'renderCaseStudiesView'], challenge: ['challengeView', 'renderChallengeView'],
  };

  const failures = [];
  let measured = 0;
  for (const [id, [mod, fn]] of Object.entries(VIEWS)) {
    const factory = (await import(`../js/views/${mod}.js`))[fn];
    const vars = { ...ROOT_VARS, ...(scopes.get(id) || {}) };
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node } = factory(getState());
      for (const rule of fillRules) {
        for (const sel of rule.selectors) {
          const classes = sel.slice(1).split('.');
          const matches = walk(node, (n) => classes.every((c) => (n.className || '').split(' ').includes(c)));
          if (!matches.length) continue;
          const fg = resolveColor(rule.decls.color, vars);
          const { colors } = backgroundColors(rule.decls.background || rule.decls['background-color'], vars);
          const need = thresholdFor(rule.decls, vars);
          for (const bg of colors) {
            if (!fg) continue;
            measured += 1;
            const ratio = contrastRatio(over(fg, bg), bg);
            if (ratio < need) {
              failures.push(`${sel} renders in #sec-${id} [${mode}] — ${rule.decls.color} on ${fmtColor(bg)}: `
                + `${fmt(ratio)}:1 (needs ${need}:1). #sec-${id} redefines --accent (${vars['--accent']} / ${vars['--accent-deep']}).`);
            }
          }
        }
      }
    }
  }
  assert.ok(measured > 0, 'no accent-filled control was found in any section — has the matcher gone stale?');
  assert.deepEqual(failures, [], `WCAG 1.4.3 under section accent overrides:\n  ${failures.join('\n  ')}`);
});

/* ---- 6. non-text contrast: the boundary of a control ----------------------- */

/**
 * WCAG 1.4.11 Non-text Contrast holds "visual information required to identify
 * user interface components" to 3:1. This gate takes the narrow, unambiguous
 * half of that: IF a control draws a border, that border has to be visible
 * against the surfaces the control sits on.
 *
 * It deliberately does not try to judge a control whose only boundary is a
 * pseudo-element (the slider, whose bar is drawn by ::-webkit-slider-runnable-
 * track / ::-moz-range-track) — that needs a pseudo-element model and would
 * trade real coverage for guesses. It DOES cover the switch: its <input> is a
 * 0x0 proxy, so `.switch-track` is the only thing on screen that says a switch
 * is there, and a component's boundary is as much 1.4.11's business as its
 * state. What this catches in general is the common regression: reaching for
 * the decorative --border (1.35:1 on a card) or --border-strong (1.79:1) when
 * outlining something the user operates.
 */
test('contrast: a control that draws a border draws a visible one (SC 1.4.11)', async () => {
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const { computedDecls, ancestorClassIndex } = await import('./css-model.js');
  const { loadViews, loadChrome } = await import('./view-registry.js');
  const CONTROLS = new Set(['BUTTON', 'SELECT', 'TEXTAREA', 'INPUT']);
  // Furniture that IS the control on screen while the real input is a 0x0 proxy.
  const FURNITURE = new Set(['switch-track']);
  const isBoundary = (n) => CONTROLS.has(n.tagName)
    || (n.className || '').split(' ').some((c) => FURNITURE.has(c));
  const failures = new Map();
  let checked = 0;

  const borderColorValue = (decls) => {
    for (const prop of ['border-color', 'border', 'border-top', 'border-bottom']) {
      const v = decls[prop];
      if (!v) continue;
      for (const part of splitTopSpace(v)) {
        if (/^(solid|dashed|dotted|none|hidden|[\d.]+(px|rem|em))$/i.test(part)) continue;
        return part;
      }
    }
    return null;
  };

  // An inset box-shadow is an edge exactly as a border is, and this stylesheet
  // uses it as one deliberately: the segmented control's selected state and the
  // sidebar's current-page item both draw their indicator that way. A control
  // whose ring clears 3:1 has a visible boundary whatever its border does.
  const insetRingColor = (decls) => {
    const v = decls['box-shadow'];
    if (!v) return null;
    for (const shadow of splitTop(v, ',')) {
      if (!/\binset\b/i.test(shadow)) continue;
      for (const part of splitTopSpace(shadow.trim())) {
        if (/^inset$/i.test(part) || /^-?[\d.]+(px|rem|em)?$/i.test(part)) continue;
        return part;
      }
    }
    return null;
  };

  for (const [id, factory] of [...await loadViews(), ...await loadChrome()]) {
    const vars = { ...ROOT_VARS, ...(sectionTokenScopes().get(id) || {}) };
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      const ancestors = ancestorClassIndex(root);
      for (const ctrl of walk(root, isBoundary)) {
        const decls = computedDecls(ctrl, ancestors.get(ctrl) || new Set());
        const value = borderColorValue(decls);
        if (!value) continue;
        let colour = resolveColor(value, vars);
        let what = `border ${value}`;
        if (colour && colour.a === 0) {
          // A transparent border means the fill is the boundary (.srm-rm.on).
          const fill = decls.background || decls['background-color'];
          colour = fill ? resolveColor(fill, vars) : null;
          what = `transparent border, fill ${fill}`;
        }
        if (!colour) continue;
        const ringValue = insetRingColor(decls);
        const ring = ringValue ? resolveColor(ringValue, vars) : null;
        checked += 1;
        // Measure against what the control really sits on, not a worst case:
        // the nearest ancestor that paints an opaque background.
        for (const { value: bgValue, colour: backdrop } of backdropsOf(ctrl, ancestors, vars, computedDecls)) {
          const ratio = contrastRatio(over(colour, backdrop), backdrop);
          if (ratio >= 3) continue;
          if (ring && contrastRatio(over(ring, backdrop), backdrop) >= 3) continue; // the ring is the edge
          const key = `${ctrl.tagName}.${ctrl.className}|${fmtColor(backdrop)}`;
          failures.set(key, `${where(id)} ${ctrl.tagName.toLowerCase()}.${ctrl.className.split(' ').join('.')} — ${what} `
            + `is ${fmt(ratio)}:1 against the ${short(bgValue)} it sits on (needs 3:1)`
            + `${ringValue ? `, and its inset ring (${short(ringValue)}) does not carry it either` : ''}. `
            + 'Interactive boundaries use --border-control; --border and --border-strong are decorative '
            + 'and do not clear 3:1 on any surface.');
        }
      }
    }
  }
  assert.ok(checked > 20, `expected to measure the exhibit's bordered controls, measured only ${checked}`);
  assert.deepEqual([...failures.values()], [],
    `WCAG 1.4.11 — ${failures.size} control boundary/boundaries below 3:1:\n  ${[...failures.values()].join('\n  ')}`);
});

/**
 * The opaque colour(s) an element is drawn on: the nearest ancestor that paints
 * a background, reduced to its stops (a card is a gradient). Falls back to the
 * page background, which is what body paints.
 */
function backdropsOf(node, ancestors, vars, computedDecls) {
  let p = node.parentNode;
  while (p && p.nodeType === 1) {
    const d = computedDecls(p, ancestors.get(p) || new Set());
    const value = d.background || d['background-color'];
    if (value && !/^(none|transparent|inherit)$/i.test(value.trim())) {
      const { colors } = backgroundColors(value, vars);
      const opaque = colors.filter((c) => c.a >= 1);
      if (opaque.length) return opaque.map((colour) => ({ value, colour }));
    }
    p = p.parentNode;
  }
  return [{ value: 'var(--bg)', colour: resolveColor('var(--bg)', vars) }];
}

/** Split a shorthand value on spaces that are not inside parentheses. */
function splitTopSpace(v) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(v)) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
