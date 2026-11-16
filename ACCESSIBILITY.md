# Accessibility notes

Covert Channel Studio is audited against **WCAG 2.1 AA**, with SC 2.5.8 Target Size
(WCAG 2.2) held to as a quality bar rather than a conformance claim. Most of what the
exhibit knows about its own accessibility lives in executable gates rather than in prose;
this file exists for the part that cannot be gated — what has been **measured, understood,
and deliberately not changed**, and why.

New in this file as of 2026-11-16. Before it, the only accessibility records were the
summary in [README.md](README.md#accessibility) and the release notes in
[CHANGELOG.md](CHANGELOG.md); neither is the right place for a standing, measured finding
that is being carried rather than fixed.

## What is gated, and where

| Gate | What it holds |
| --- | --- |
| `test/a11y.test.js` | Accessible names, focusable and labelled scroll containers, heading outline, live regions — every view in both view modes, under the DOM shim |
| `test/contrast.test.js` | Every text/background pairing the stylesheets can produce, against 4.5:1 / 3:1 as the text size and weight require |
| `test/target-size.test.js` | SC 2.5.8 pointer target sizes |
| `test/disclosure.test.js` | Disclosure widgets' exposed state |
| `e2e/a11y.spec.js` | The real browser: axe-core WCAG 2.0/2.1 A+AA over all 24 sections, the skip link's focus order, and every form control's accessible name coming from a real labelling mechanism rather than a `placeholder` |

All of those measure **settled** states. The finding below is the one place where a state
that is neither settled nor designed can be measured at all.

## Carried finding: SC 1.4.3, one transient frame in the sidebar route-change transition

**Status:** measured, non-conformant for about one display frame, deliberately not changed.
Re-audited 2026-11-16.

### The pairing

| | |
| --- | --- |
| **Foreground** | `--text-faint` `#7c8da2` = `rgb(124, 141, 162)` (`css/base.css:42`) |
| **Element** | `span.nav-index` — the two-digit section number inside a sidebar link: `#nav .nav-link[data-section="…"] > .nav-index` (`css/layout.css:102-105`), in the link that has just **stopped** being the current route |
| **Background** | the current-state fill `color-mix(in srgb, var(--accent) 14%, transparent)` — `#2dd4bf` at `alpha 0.14` (`css/layout.css:96-101`) — still painted on that link, composited over the sidebar backdrop (`--bg` `#0a0e14` plus the two fixed radial gradients in `body::before`, `css/base.css:171-181`). Measured painted pixel: `rgb(16, 45, 49)` |
| **Text size / weight** | 11.52px (`--fs-xs`, 0.72rem), `font-weight: 400` |
| **Large text?** | **No.** WCAG large-scale text is ≥24px, or ≥18.66px at bold (≥700). This is 11.52px at 400, so the applicable threshold is **4.5:1**, not 3:1 |
| **Measured worst ratio** | **4.2925:1** |

### Where in the animation

It is a CSS **transition**, not an `@keyframes` animation, so it has transition progress
rather than keyframe percentages:

```css
/* css/layout.css:81 */
transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
/* --dur-fast: 120ms;  --ease: cubic-bezier(.2, .7, .2, 1)   (css/base.css:112-113) */
```

- **Worst frame: progress 0%**, i.e. `currentTime` 0ms of the 120ms transition.
- The cause is a mismatch, not a colour: `.nav-link` transitions its background, but
  `.nav-index` has its own `color` declaration and no transition of its own, so when
  `aria-current="page"` is removed the number **snaps** from `--accent` to `--text-faint`
  in the same frame in which the 14% fill is still at full strength. Neither settled state
  has this problem: 8.0276:1 while current, 5.5401:1 once the fill has gone.
- **Below 4.5:1 for the first ~6ms of the 120ms transition** — progress 0% to about 4.6%.
  Last sample below: 5.5ms at 4.4940:1. First sample above: 6.0ms at 4.5390:1. A bisection
  on the frozen transition put the crossing at ≈5.0ms; an analytic model of the same alpha
  ramp under `cubic-bezier(.2, .7, .2, 1)` put it at 5.72ms.
- **In painted frames, that is one frame.** A `requestAnimationFrame` trace of a real,
  unpaused route change shows the commit frame painted at `currentTime` 0.00 (4.2925:1) and
  the next painted frame already at `currentTime` 16.61ms, where the ratio is 5.21:1. So the
  worst value is on screen for a single refresh interval — about **16.7ms at 60Hz**.
- Under `prefers-reduced-motion: reduce` the frame **does not exist**: `css/base.css:263-271`
  forces `transition-duration: 0.001ms !important`, and the animation list on the link losing
  `aria-current` comes back empty. Nobody with that preference set can be shown this frame.

### A correction to the earlier figure

The 2026-11-15 pass recorded this as **4.45:1**, and the comment in `e2e/a11y.spec.js`
repeated it. That figure is reproducible only by compositing the 14% fill over the bare
`--bg` token. The pixel actually painted behind the number also carries `body::before`'s two
radial gradients, which lighten the backdrop from `rgb(10, 14, 20)` to `rgb(12, 18, 26)` and
take the ratio **down** to 4.2925:1. The finding is real and slightly worse than recorded.

### How it was sampled

A single probe at one instant says nothing about an animation, so:

1. **79 frozen samples across the whole transition.** The real CSS transition was paused
   through the Web Animations API and stepped by `currentTime` — every 0.25ms from 0 to 5ms,
   then every 2ms to 120ms. The foreground came from `getComputedStyle` (no element in the
   sidebar carries `opacity`, so text is painted at its computed colour); the background came
   from a **real screenshot pixel** sampled 3px to the left of the number's box, because the
   backdrop is not a flat token and compositing against one would have been wrong.
2. **A 24-step bisection** on the same frozen transition, to locate the 4.5:1 crossing.
3. **12,001 analytic samples** at 0.01ms resolution, compositing the alpha ramp under the
   real cubic-bezier over the measured backdrop pixel, as a cross-check on (1) and (2).
4. **A `requestAnimationFrame` trace** of a real, unpaused route change, to find out how many
   frames a browser actually *paints* below the threshold.
5. **The other three layers of the same component**, 40 frozen samples each: the link's own
   label (`--text` → `--text-dim`, 13.12px/400) never drops below **9.2699:1**; the link
   *gaining* `aria-current` never drops below **8.0276:1** in either text layer. The sidebar
   is outside `#sec-*`, so the per-channel `--accent` overrides never apply to it and the
   teal root accent is the only fill involved.
6. Early readings were discarded twice, and both reasons are worth recording: a `page.click()`
   leaves the pointer on the link, so `.nav-link:hover { background: var(--surface-1) }` was
   being measured instead of the fill; and Playwright's `screenshot({ animations: 'disabled' })`
   *finishes* running transitions, so every "mid-transition" screenshot was really the end
   state. Route changes are now triggered programmatically with the pointer parked off the
   sidebar, and screenshots are taken with `animations: 'allow'`.

### Why it was not changed

No single token change and no single keyframe change fixes this without changing something
the design is deliberately holding.

**There is no keyframe to change.** The frame is produced by a `transition`. The exhibit's
only three `@keyframes` — `srtravel` (`.sr-dot`, animates `left`, decorative and
`aria-hidden`), `tlpop` (`.tl-packet`) and `bitpop` (`.bit-cell`) — are not involved in this
pairing at all.

**The one token that could move is `--text-faint`, and moving it changes the lightness of every
one of its 46 references across the stylesheets.** To bring the 0% frame to 4.5:1, `--text-faint`
needs **+6.36% relative luminance** — `#7c8da2` → `#8091a6`, `+4` per channel, ΔL\* 1.54.
That token is referenced 46 times (21 in `css/components.css`, 21 in `css/views.css`, 4 in
`css/layout.css`, plus its one definition in `css/base.css`): every `.ctrl-help`, all 24 sidebar group titles, `.msg-counter`, the chart
axis labels, `.stat-tile .st-lab`, `.foot-note`, the brand sub-line, `.empty-note`,
`.glossary-see`, and the rest. **Every one of those is a settled surface that already
passes.** The specific design property that would change is the de-emphasis level of
`--text-faint` — the bottom step of the exhibit's three-step text hierarchy — and with it the
gap to `--text-dim`, which closes from 16.06 to 14.53 L\*.

**And it would land on 0.02 of a point.** `#8091a6` measures 4.5214:1 on the worst frame.
`css/components.css:422-426` already rejects a thinner-than-comfortable margin in this exact
token, in writing: *"0.16 of a point is not a margin worth shipping."* 0.02 is an eighth of
the margin this project has already declined. Buying a real margin costs more lightness still
— 4.7:1 needs `#8495aa`, +12.95% luminance and ΔL\* 3.06 — which is a visible shift across
all 46 usages.

**Re-lightening this token is a remedy the project has already considered and rejected,
twice.** `--text-faint` was lightened once, from `#728398` to `#7c8da2`, in 1.5.1.
`css/views.css:390-395` then records the hatch in the transition matrix as needing more than
*"the token has margin to give, even after the token was lightened"*, and
`css/components.css:422-426` records the same for sticky table headers. In both places the
chosen fix was to scope `--text-dim` onto the affected element, which is also what
`.ook-sym.lit .ook-lux`, `.hop-dest`, `.transition-matrix .tm-cell.diag` and
`.data-table tr.is-covert .ent-bar .subtle` do.

**That established remedy is the one thing that is visibly wrong here.** Scoping
`.nav-link .nav-index` to `--text-dim` would measure 7.1824:1 on the worst frame, but it
lifts all 24 sidebar section numbers by **16.06 L\***, to exactly the lightness of the labels
beside them — the numbers stop being subordinate to the section names and the index/label
hierarchy in the exhibit's most-used component disappears. That is a visible redesign of the
sidebar, which is more than a one-frame transient is worth.

So the frame is carried, and the browser gate waits it out rather than measuring it — see
`navTransitionsSettled()` in `e2e/a11y.spec.js`, which exists for exactly this reason:
axe-core would otherwise catch or miss this frame depending on how fast the machine is,
turning the gate into a coin toss.

### What would change this decision

Any of these, and the finding should be re-opened rather than re-carried:

- `--text-faint` gets lightened for an unrelated reason, making the fix free.
- `.nav-index` acquires a `color` transition, or the current-state fill stops being
  `--accent` at 14%, either of which removes the mismatch at its source.
- `--dur-fast` grows, or the easing's early slope flattens, which would widen the
  sub-threshold window beyond one painted frame.
- A measurement shows more than one painted frame below 4.5:1 on a real display.

## Non-findings, recorded so they are not re-audited

- **`tlpop` (320ms) and `bitpop` (120ms)** ramp `opacity` from 0 to 1 on elements that carry
  text, so they pass through every ratio from 1:1 upward. They are entrance reveals of content
  that was not previously on screen, not a change of presentation of text already being read,
  and they are not the source of any specific sub-threshold reading. `prefers-reduced-motion`
  removes them.
- **`.sr-dot` / `srtravel`** animates `left` only, carries no text, and is `aria-hidden`. It
  runs three passes rather than `infinite` so SC 2.2.2 does not have to be argued.
