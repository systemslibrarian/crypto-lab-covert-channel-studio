# Contributing to Covert Channel Studio

Thanks for your interest. This is an **educational, defensive** security lab, and contributions
are welcome — but the project has hard boundaries that keep it a teaching tool rather than a
tool. Please read this before opening a pull request.

## The non-negotiable safety boundary

This project is a **100% client-side simulation**. Every packet, DNS query, resolver, timing
event, and image is a plain JavaScript object rendered in the browser. Contributions that would
make it deployable are **out of scope and will be rejected**, including:

- raw sockets, packet crafting/injection, or any real network transmission;
- live DNS/ICMP tunneling, exfiltration, command-and-control, or remote destinations;
- anything framed as "how to attack," a "stealth optimizer," or ranking channels by evasiveness;
- claims that any channel is "undetectable," "invisible," or "untraceable."

New carriers are welcome **as deterministic in-memory models** with honest fidelity notes. The
project's positioning is *theory → simulation → measurement → detection → mitigation → evidence*,
not "the most channels."

## Development

No build step and no runtime dependencies — it is vanilla ES modules served as static files.

```bash
git clone https://github.com/systemslibrarian/crypto-lab-covert-channel-studio.git
cd crypto-lab-covert-channel-studio
python3 -m http.server 8080   # or: npm run serve   — then open http://localhost:8080
npm test                       # or: node --test     — the full deterministic suite
```

`file://` will not work (ES modules need http(s)).

## What CI enforces

Every push runs `node --test`. Your change should keep the suite green. The suite includes:

- **Logic + known-answer tests** for the utilities, channels, detectors, and the published
  statistical methods (`test/methods.test.js`, `test/validation.test.js`). If you add or change a
  detector, add a known-answer or validation test for it.
- **An accessibility gate** (`test/a11y.test.js`) that renders every view in both view modes and
  fails if any control lacks an accessible name or any scrollable region is not a focusable,
  labelled region. New views must pass it.

## Code conventions

- **No dependencies.** Standard library / browser APIs only. Vendor nothing unless discussed.
- **Keep simulation logic DOM-free.** `js/channels`, `js/detectors`, `js/analysis`, and `js/utils`
  must run under Node with no DOM so they stay unit-testable; only `js/views` touches the DOM.
- **Determinism.** All randomness goes through the seeded PRNG (`js/utils/seededRandom.js`). Do
  not use `Date.now()` or `Math.random()` in simulation or detector code.
- **Security hygiene.** No `innerHTML` with dynamic data (build DOM with `views/dom.js`), no `eval`,
  no inline event handlers or inline styles in HTML, no external network requests. The strict CSP
  must keep passing.
- **Honesty over polish.** Detectors are *educational indicators, not verdicts*. Every detector
  observation states what was observed, why it may matter, and what else could cause it. Do not
  tune a detector to look good on the Validation Lab benchmark; report the honest result.

## Reporting issues

Functional or content bugs: open a GitHub issue. Security-sensitive reports: use the repository's
**Security → Report a vulnerability** (private advisories). See [SECURITY.md](SECURITY.md).
