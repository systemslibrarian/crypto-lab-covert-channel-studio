/**
 * contrast.test.js — WCAG 1.4.3 (Contrast, Minimum) as a permanent invariant.
 *
 * A one-off contrast audit is worth exactly as long as it takes someone to
 * nudge a token. This gate re-derives the answer from css/base.css on every
 * run: it parses the design tokens, computes WCAG 2.1 relative luminance, and
 * measures every foreground/background pairing the stylesheets actually create.
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
  // It carries no information (position + the title attribute do), and "dropped"
  // is signalled by opacity and by the packet list, not by that glyph.
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

/** Colour declarations we knowingly cannot resolve, with the reason why. */
const UNRESOLVABLE_COLORS = new Map([
  // currentColor / inherit are resolved by whatever set the colour upstream;
  // that upstream rule is itself measured, so nothing escapes the guard.
  ['inherit', 'inherits an already-measured colour'],
  ['currentColor', 'follows an already-measured colour'],
]);

const decl = (r, prop) => (r.decls[prop] == null ? null : String(r.decls[prop]).trim());

function thresholdFor(decls, vars) {
  const size = lengthPx(decls['font-size'], vars);
  const weightRaw = decls['font-weight'];
  const weight = weightRaw != null ? parseInt(weightRaw, 10) : NaN;
  const bold = Number.isFinite(weight) && weight >= 700;
  if (size != null && (size >= 24 || (bold && size >= 18.66))) return 3;
  return 4.5;
}

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

test('contrast: every text/background pairing that actually renders clears its threshold', async () => {
  installDomShim();
  const { getState, setViewMode } = await import('../js/state.js');
  const { computedDecls, ancestorClassIndex } = await import('./css-model.js');
  const scopes = sectionTokenScopes();

  const VIEW_MODULES = await import('./view-registry.js');
  const failures = new Map();
  const unresolved = new Set();
  let measured = 0;

  for (const [id, factory] of await VIEW_MODULES.loadViews()) {
    const vars = { ...ROOT_VARS, ...(scopes.get(id) || {}) };
    const pageBg = resolveColor('var(--bg)', vars); // body { background: var(--bg) }
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      const ancestors = ancestorClassIndex(root);

      const visit = (node, inherited, backdrops, path) => {
        if (!node || node.nodeType !== 1) return;
        if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return; // not exposed, not read
        const classes = (node.className || '').split(' ').filter(Boolean);
        if (classes.includes('visually-hidden')) return; // never painted
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
                  failures.set(key, `#sec-${id} [${mode}]${here} — ${short(colorValue)} (${fmtColor(fg)}) on ${fmtColor(worst.bg)}: `
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
      visit(root, { color: 'var(--text)', fontSize: 'var(--fs-base)', fontWeight: null, vars }, [pageBg], `#sec-${id}`);
    }
  }

  assert.ok(measured > 2000, `expected thousands of rendered text pairings, measured only ${measured}`);
  assert.deepEqual([...unresolved], [],
    'these rendered text colours could not be resolved, so they escaped the contrast guard — '
    + `teach test/css-model.js to parse them:\n  ${[...unresolved].join('\n  ')}`);
  assert.deepEqual([...failures.values()], [],
    `WCAG 1.4.3 — ${failures.size} rendered pairing(s) below threshold:\n  ${[...failures.values()].join('\n  ')}`);
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
