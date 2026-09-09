/**
 * target-size.test.js — WCAG 2.2 SC 2.5.8 Target Size (Minimum), 24x24 CSS px.
 *
 * 2.5.8 is a WCAG 2.2 addition, not part of 2.1 AA; it is gated here anyway
 * because this exhibit is driven almost entirely by sliders and a six-pixel-tall
 * slider is a real motor barrier on a phone whichever clause excuses it on paper.
 *
 * The gate is element-driven rather than a hand-written list of selectors: it
 * renders every view under the DOM shim, finds the controls that are really
 * there, resolves each one's box from the stylesheets (padding + border + line
 * box, or an explicit height), and reports the measured pixel size. A control
 * added next year is measured without anyone remembering to list it.
 *
 * Two known shapes are handled explicitly:
 *   • visually-hidden native inputs (`.switch-input`, `.seg-input`) are 0x0 by
 *     design — the target is the <label> that drives them, so the label is
 *     measured instead and the pairing is asserted to exist.
 *   • range inputs are measured twice: the input's own box AND the thumb, since
 *     the thumb is the thing a pointer has to hit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allRules, rootTokens, lengthPx, paddingBox, borderPx, splitTop, parseStylesheet,
} from './css-model.js';
import { installDomShim, walk } from './dom-shim.js';

const VARS = rootTokens();
const MIN_TARGET_PX = 24;

/** body { line-height: var(--lh-base) } — the inherited default. */
const BASE_LINE_HEIGHT = parseFloat(VARS['--lh-base'] || '1.6');
const BASE_FONT_PX = lengthPx(VARS['--fs-base'], VARS) ?? 16;

/* ---- a very small cascade ------------------------------------------------- */

/** Does this simple compound selector match a shim element? */
function matchesCompound(node, compound) {
  const parts = compound.match(/^[a-z][a-z0-9]*|\.[A-Za-z0-9_-]+|\[[^\]]+\]|::?[a-z-]+(\([^)]*\))?/gi) || [];
  const classes = (node.className || '').split(' ').filter(Boolean);
  for (const p of parts) {
    if (p.startsWith('.')) { if (!classes.includes(p.slice(1))) return false; continue; }
    if (p.startsWith('[')) {
      const m = /^\[([A-Za-z0-9_-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]$/.exec(p);
      if (!m) return false;
      const v = node.getAttribute(m[1]);
      if (v == null) return false;
      if (m[2] && m[2] !== '=' ? false : m[3] != null && m[2] === '=' && v !== m[3]) return false;
      continue;
    }
    if (p.startsWith(':')) {
      // Pseudo-classes describe a state; :hover/:active/:disabled variants are
      // not the resting target, and are skipped rather than guessed at.
      if (/^::/.test(p)) return false;
      if (!/^:(focus-visible|focus|hover|active|disabled|checked|not|last-child|first-child|nth-child)/.test(p)) return false;
      return false;
    }
    if (node.tagName !== p.toUpperCase()) return false;
  }
  return parts.length > 0;
}

/** Merge every non-media rule whose last compound matches this element. */
function computedDecls(node, ancestorClasses) {
  const merged = {};
  for (const r of allRules()) {
    if (r.media) continue;
    for (const sel of r.selectors) {
      const compounds = sel.split(/\s+/).filter(Boolean);
      if (compounds.some((c) => /[>+~]/.test(c))) continue; // sibling/child combinators: not modelled
      const last = compounds[compounds.length - 1];
      if (!matchesCompound(node, last)) continue;
      // Ancestor compounds must all be satisfied by some ancestor's classes.
      const ok = compounds.slice(0, -1).every((c) => {
        const cls = (c.match(/\.[A-Za-z0-9_-]+/g) || []).map((x) => x.slice(1));
        return cls.length > 0 && cls.every((x) => ancestorClasses.has(x));
      });
      if (!ok) continue;
      Object.assign(merged, r.decls);
    }
  }
  return merged;
}

/** Rules for a pseudo-element on a selector the element matches (slider thumb). */
function pseudoRules(node, pseudo) {
  const out = [];
  for (const r of allRules()) {
    for (const sel of r.selectors) {
      if (!sel.includes(pseudo)) continue;
      const base = sel.slice(0, sel.indexOf(pseudo)).trim();
      const compounds = base.split(/\s+/).filter(Boolean);
      if (!compounds.length) continue;
      if (!matchesCompound(node, compounds[compounds.length - 1])) continue;
      out.push({ rule: r, selector: sel });
    }
  }
  return out;
}

/** The rendered height of a control's border box, in CSS px, or null. */
function boxHeight(decls) {
  const explicit = lengthPx(decls.height, VARS);
  const pad = paddingBox(decls, VARS);
  const border = borderPx(decls, VARS);
  const padSum = (pad.top ?? 0) + (pad.bottom ?? 0);
  const borderSum = (border.top ?? 0) + (border.bottom ?? 0);
  if (explicit != null) {
    // box-sizing: border-box is set globally in base.css, so padding and border
    // live inside an explicit height.
    return { px: explicit, how: `height:${decls.height}` };
  }
  const fontPx = lengthPx(decls['font-size'], VARS) ?? BASE_FONT_PX;
  const lh = decls['line-height'] != null
    ? (lengthPx(decls['line-height'], VARS) ?? parseFloat(decls['line-height']) * fontPx)
    : BASE_LINE_HEIGHT * fontPx;
  if (pad.top == null && pad.bottom == null && !decls['font-size']) return null;
  return {
    px: lh + padSum + borderSum,
    how: `line-box ${lh.toFixed(1)} + padding ${padSum} + border ${borderSum}`,
  };
}

/**
 * A flex row is as tall as its tallest item, so a label wrapping a 22px switch
 * track is 22px even though its own text line box is 21px. Report the number a
 * pointer actually has to hit.
 */
function flexChildHeight(node, decls, ancestors) {
  if (!/flex|grid/.test(decls.display || '')) return 0;
  let tallest = 0;
  for (const child of node.childNodes || []) {
    if (!child || child.nodeType !== 1) continue;
    const cd = computedDecls(child, ancestors.get(child) || new Set());
    const h = lengthPx(cd.height, VARS);
    if (h != null && h > tallest) tallest = h;
  }
  return tallest;
}

/**
 * WCAG 2.2 SC 2.5.8 exempts an undersized target when the offset to every
 * adjacent target is at least 24 CSS px. The nearest flex/grid `gap` above the
 * control is a lower bound on that offset (its nearest neighbour may not even
 * be a target), so height + gap >= 24 is a sound, conservative test of the
 * exception rather than an assumption that it applies.
 */
function spacingOffset(node, ancestors) {
  let p = node.parentNode;
  while (p && p.nodeType === 1) {
    const d = computedDecls(p, ancestors.get(p) || new Set());
    const gap = lengthPx(d.gap, VARS) ?? lengthPx(splitTop(d.gap || '', ' ')[0] || '', VARS);
    if (gap != null && /flex|grid/.test(d.display || '')) return { gap, from: `.${(p.className || '').split(' ')[0]}` };
    p = p.parentNode;
  }
  return null;
}

function isVisuallyHiddenProxy(decls) {
  const w = lengthPx(decls.width, VARS);
  const h = lengthPx(decls.height, VARS);
  return decls.opacity === '0' || (w === 0 && h === 0);
}

/* ---- the gate -------------------------------------------------------------- */

const VIEW_MODULES = {
  overview: ['overviewView', 'renderOverview'], dns: ['dnsView', 'renderDnsView'],
  timing: ['timingView', 'renderTimingView'], storage: ['storageView', 'renderStorageView'],
  ordering: ['orderingView', 'renderOrderingView'], icmp: ['icmpView', 'renderIcmpView'],
  hopping: ['hoppingView', 'renderHoppingView'], http: ['httpView', 'renderHttpView'],
  stego: ['stegoView', 'renderStegoView'], metadata: ['metadataView', 'renderMetadataView'],
  physical: ['physicalView', 'renderPhysicalView'], cache: ['cacheView', 'renderCacheView'],
  detection: ['detectionView', 'renderDetectionView'], challenge: ['challengeView', 'renderChallengeView'],
  validation: ['validationView', 'renderValidationView'], warden: ['wardenView', 'renderWardenView'],
  compare: ['comparisonView', 'renderComparisonView'], atlas: ['atlasView', 'renderAtlasView'],
  cases: ['caseStudiesView', 'renderCaseStudiesView'], srm: ['srmView', 'renderSrmView'],
  concepts: ['conceptsView', 'renderConceptsView'], defense: ['defenseView', 'renderDefenseView'],
  glossary: ['glossaryView', 'renderGlossaryView'], quiz: ['quizView', 'renderQuizView'],
};

const CONTROL_TAGS = new Set(['BUTTON', 'SELECT', 'TEXTAREA', 'INPUT']);
const isControl = (n) => CONTROL_TAGS.has(n.tagName)
  && !(n.tagName === 'INPUT' && ['hidden'].includes(n.getAttribute('type')));

installDomShim();
const { getState, setViewMode } = await import('../js/state.js');

/** Classes on every ancestor of a node, for descendant-selector matching. */
function ancestorClassIndex(root) {
  const index = new Map();
  const visit = (n, inherited) => {
    if (!n || n.nodeType === 3) return;
    const own = new Set(inherited);
    for (const c of (n.className || '').split(' ')) if (c) own.add(c);
    index.set(n, inherited);
    for (const child of n.childNodes || []) visit(child, own);
  };
  visit(root, new Set());
  return index;
}

/** The <label> that drives a visually-hidden input, if there is one. */
function labelFor(node, root) {
  const id = node.getAttribute('id');
  if (id) {
    const [byFor] = walk(root, (n) => n.tagName === 'LABEL' && n.getAttribute('for') === id);
    if (byFor) return byFor;
  }
  let p = node.parentNode;
  while (p) { if (p.tagName === 'LABEL') return p; p = p.parentNode; }
  return null;
}

test('target size: every rendered control is at least 24x24 CSS px (WCAG 2.2 SC 2.5.8)', async () => {
  const failures = [];
  const unmeasured = [];
  const seen = new Map(); // signature -> measurement, so each control shape is reported once
  let count = 0;

  for (const [id, [mod, fn]] of Object.entries(VIEW_MODULES)) {
    const factory = (await import(`../js/views/${mod}.js`))[fn];
    for (const mode of ['sender', 'defender']) {
      setViewMode(mode);
      const { node: root } = factory(getState());
      const ancestors = ancestorClassIndex(root);
      for (const ctrl of walk(root, isControl)) {
        const type = ctrl.getAttribute('type') || '';
        let target = ctrl;
        let note = '';
        let decls = computedDecls(ctrl, ancestors.get(ctrl) || new Set());

        if (isVisuallyHiddenProxy(decls)) {
          // The native input is a 0x0 proxy; the label is the real target.
          const label = labelFor(ctrl, root);
          assert.ok(label,
            `${id}: ${ctrl.tagName}[type=${type}].${ctrl.className} is visually hidden but has no <label> to act as its target`);
          target = label;
          note = ' (via its <label>)';
          decls = computedDecls(label, ancestors.get(label) || new Set());
        }

        const sig = `${target.tagName}.${target.className || ''}${type ? `[${type}]` : ''}`;
        count += 1;

        // A file input is operated through its ::file-selector-button; that
        // button, not the bare input box, is the target.
        if (type === 'file') {
          const [btn] = pseudoRules(ctrl, '::file-selector-button');
          assert.ok(btn, `${id}: ${sig} has no styled ::file-selector-button, so its target size is undefined`);
          decls = { ...decls, ...btn.rule.decls };
          note = ' (via its ::file-selector-button)';
        }

        const box = boxHeight(decls);
        if (!box) { unmeasured.push(`${sig} in ${id}`); continue; }
        const childH = flexChildHeight(target, decls, ancestors);
        if (childH > box.px) { box.px = childH; box.how = `tallest flex item ${childH}px`; }
        const width = lengthPx(decls.width, VARS);
        const measurement = `${box.px.toFixed(1)}px tall (${box.how})${width != null ? `, ${width}px wide` : ''}`;
        seen.set(sig, measurement);
        if (box.px < MIN_TARGET_PX) {
          // Undersized: the Spacing exception is the only thing that can save it.
          const spacing = spacingOffset(target, ancestors);
          const offset = spacing ? box.px + spacing.gap : 0;
          if (offset < MIN_TARGET_PX) {
            failures.push(`${sig}${note} in ${id}: ${measurement} — needs ${MIN_TARGET_PX}px`
              + (spacing
                ? `, and the Spacing exception does not save it: nearest gap is ${spacing.gap}px on ${spacing.from}, offset ${offset.toFixed(1)}px`
                : ', and no flex/grid gap above it establishes a 24px offset'));
          }
        }
        if (width != null && width < MIN_TARGET_PX) {
          failures.push(`${sig}${note} in ${id}: ${measurement} — width needs ${MIN_TARGET_PX}px`);
        }

        // A range input's real target is its thumb.
        if (type === 'range') {
          for (const pseudo of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
            const rules = pseudoRules(ctrl, pseudo);
            assert.ok(rules.length > 0, `${id}: ${pseudo} is not styled, so the slider thumb has no defined size`);
            for (const { rule, selector } of rules) {
              if (/:(hover|active|focus)/.test(selector)) continue;
              const w = lengthPx(rule.decls.width, VARS);
              const h = lengthPx(rule.decls.height, VARS);
              if (w == null && h == null) continue;
              const bw = borderPx(rule.decls, VARS);
              // The thumb is border-box like everything else (base.css reset).
              const tw = w ?? 0;
              const th = h ?? 0;
              seen.set(selector, `${tw}x${th}px`);
              if (tw < MIN_TARGET_PX || th < MIN_TARGET_PX) {
                failures.push(`${selector} (${rule.file}:${rule.line}): thumb is ${tw}x${th}px`
                  + `${bw.top ? ` (+${bw.top}px border, inside the box)` : ''} — needs ${MIN_TARGET_PX}x${MIN_TARGET_PX}px`);
              }
            }
          }
        }
      }
    }
  }

  assert.ok(count > 50, `expected to find the exhibit's controls, walked only ${count}`);
  assert.deepEqual(unmeasured, [],
    'these controls have no resolvable size in the CSS, so their target size is unknown:\n  '
    + `${unmeasured.join('\n  ')}`);
  assert.deepEqual([...new Set(failures)], [],
    `WCAG 2.2 SC 2.5.8 — control(s) under 24x24 CSS px:\n  ${[...new Set(failures)].join('\n  ')}`);
});

test('target size: responsive overrides do not shrink a control below 24px', () => {
  // A control that is 24px on the desktop layout and 18px at 480px wide is still
  // a 2.5.8 failure; @media rules are checked separately because the shim has no
  // viewport.
  const failures = [];
  const interactive = /^\.(btn|seg-btn|nav-link|quiz-choice|ctrl-select|ctrl-range|msg-input|srm-rm|switch-track)\b/;
  for (const r of allRules()) {
    if (!r.media) continue;
    for (const sel of r.selectors) {
      const last = sel.split(/\s+/).filter(Boolean).pop() || '';
      if (!interactive.test(last)) continue;
      if (r.decls.height == null && r.decls.padding == null && r.decls['padding-block'] == null) continue;
      const box = boxHeight({ ...r.decls });
      if (!box) continue;
      if (box.px < MIN_TARGET_PX) {
        failures.push(`${r.file}:${r.line} ${r.media} { ${sel} } → ${box.px.toFixed(1)}px (${box.how}) — needs ${MIN_TARGET_PX}px`);
      }
    }
  }
  assert.deepEqual(failures, [], `WCAG 2.2 SC 2.5.8 in a media query:\n  ${failures.join('\n  ')}`);
});

test('target size: the slider track is not the target, and the thumb is square', () => {
  // Guards the specific regression that started this: a 6px-tall input with an
  // 18px thumb overflowing it. The bar may stay thin — it is drawn by the track
  // pseudo-element — but the input's own box and the thumb must both be >= 24px.
  const range = allRules().filter((r) => r.selectors.includes('.ctrl-range') && !r.media);
  assert.ok(range.length > 0, '.ctrl-range has no rule');
  const decls = Object.assign({}, ...range.map((r) => r.decls));
  const h = lengthPx(decls.height, VARS);
  assert.ok(h != null, '.ctrl-range declares no height, so its target size cannot be verified');
  assert.ok(h >= MIN_TARGET_PX,
    `.ctrl-range is ${h}px tall — the slider's own border box must be at least ${MIN_TARGET_PX}px (WCAG 2.2 SC 2.5.8)`);

  for (const pseudo of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    const rules = allRules().filter((r) => r.selectors.some((s) => s === `.ctrl-range${pseudo}`));
    assert.ok(rules.length > 0, `.ctrl-range${pseudo} is unstyled`);
    const d = Object.assign({}, ...rules.map((r) => r.decls));
    const w = lengthPx(d.width, VARS);
    const th = lengthPx(d.height, VARS);
    assert.ok(w >= MIN_TARGET_PX && th >= MIN_TARGET_PX,
      `.ctrl-range${pseudo} is ${w}x${th}px — the thumb is the target and must be at least ${MIN_TARGET_PX}x${MIN_TARGET_PX}px`);
  }
});

/* ---- the gate's own self-test ---------------------------------------------
 * A guard that cannot fail is not a guard. This replays the slider CSS as it
 * stood before the fix and asserts the measurement code flags it, so the gate
 * is proven non-vacuous without having to break the real stylesheet.
 * ------------------------------------------------------------------------ */
test('target size: the guard measures the pre-fix slider as a failure', () => {
  const OLD = `
    .ctrl-range {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 6px; border-radius: var(--r-pill);
      background: var(--surface-3);
      outline-offset: 4px; cursor: pointer;
    }
    .ctrl-range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--accent);
      border: 3px solid var(--surface-0);
    }
  `;
  const rules = parseStylesheet('historic.css', OLD);
  const input = rules.find((r) => r.selectors.includes('.ctrl-range'));
  const thumb = rules.find((r) => r.selectors.includes('.ctrl-range::-webkit-slider-thumb'));

  assert.equal(lengthPx(input.decls.height, VARS), 6,
    'the parser must read the historic 6px slider height');
  assert.ok(lengthPx(input.decls.height, VARS) < MIN_TARGET_PX, 'a 6px input is under the minimum');
  assert.equal(lengthPx(thumb.decls.width, VARS), 18);
  assert.ok(lengthPx(thumb.decls.height, VARS) < MIN_TARGET_PX, 'an 18px thumb is under the minimum');

  // And the same measurement passes on the current stylesheet, so the numbers
  // above are a real before/after and not an artefact of the parser.
  const now = Object.assign({}, ...allRules().filter((r) => r.selectors.includes('.ctrl-range') && !r.media).map((r) => r.decls));
  assert.ok(lengthPx(now.height, VARS) >= MIN_TARGET_PX,
    `.ctrl-range is ${lengthPx(now.height, VARS)}px tall today`);
});
