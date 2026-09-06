# Covert Channel Studio

> Hidden communication in protocols, timing, and media.

Covert Channel Studio is a polished, browser-based **educational security lab** — part of the fictional **Crypto-Lab** collection of exhibits. It teaches how covert channels work, how they differ from ordinary tunneling and steganography, and — just as importantly — how defenders detect them. Everything in the lab is a **100% client-side simulation**: every packet, DNS query, resolver, and timing event is a plain JavaScript object rendered in your browser. Nothing ever touches a real network.

## Table of contents

- [Purpose & educational scope](#purpose--educational-scope)
- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Channel taxonomy](#channel-taxonomy)
- [Safety boundaries](#safety-boundaries)
- [What this project intentionally does not do](#what-this-project-intentionally-does-not-do)
- [How to run locally](#how-to-run-locally)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Running the tests](#running-the-tests)
- [Accessibility](#accessibility)
- [Browser support](#browser-support)
- [Limitations](#limitations)
- [References](#references)
- [License](#license)

## Purpose & educational scope

The central thesis of the exhibit:

> **A covert channel communicates information through a mechanism that was not intended to carry that information.**

The hidden information does not always live in a packet payload. It can live in a field value, in an ordering, in a protocol's structure, or simply in *when* something happens. The lab is built around a five-way taxonomy, and it deliberately does **not** treat every tunnel as a covert channel:

1. **Covert storage channels** — information encoded in a *value* (e.g., unused or loosely-checked header fields).
2. **Covert timing channels** — information encoded in *when* events occur (inter-arrival gaps, presence/absence in a time slot).
3. **Protocol-shaped tunneling** — a legitimate protocol abused as a carrier (e.g., data smuggled through DNS query names).
4. **Steganography** — information hidden *inside other content* (e.g., least-significant bits of image pixels).
5. **Ordinary encrypted tunnels** (SSH/HTTPS) — these hide *content*, but the traffic is usually readily identifiable as SSH or HTTPS. They are better described as tunneling than as covert signaling. **Hiding content is not the same as hiding the existence or purpose of communication.**

The exhibit teaches both the **sender/receiver** perspective and the **defender/analyst** perspective, and emphasizes the fundamental tradeoff triangle: **capacity vs. reliability vs. observability**. A channel can be subtle without being undetectable — pushing more bits through faster always leaves a bigger statistical footprint.

## Features

Ten interactive exhibit sections, plus a glossary and a quiz:

- **Overview** — the thesis, the taxonomy, and a map of the lab.
- **DNS Channel** — how a hierarchical name-lookup protocol can be abused as a carrier; encodes toy messages into simulated query names under the reserved `.test` documentation TLD.
- **Timing Channel** — encoding bits in inter-event gaps; shows how jitter and noise degrade reliability, and how timing statistics expose the pattern.
- **Storage Channel** — hiding bits in simulated protocol field values; illustrates why "unused" fields are a classic audit target.
- **Packet-Order Channel** — information carried by the *ordering* of otherwise-innocent events, with the combinatorics of how many bits an ordering can hold.
- **Image Steganography** — LSB embedding in a small generated cover image, with a visual diff so you can see exactly what changed.
- **Detection Console** — the defender's bench: run simple statistical detectors (entropy, frequency, timing regularity, ordering anomalies) against simulated traffic and see indicators light up.
- **Compare Channels** — side-by-side comparison ranked by educational clarity, reliability in simulation, defensive teaching value, and complexity — never by "stealth."
- **What Makes a Channel Covert?** — the conceptual core: intent of the mechanism, the storage/timing distinction, and why an encrypted tunnel is usually not a covert channel.
- **Defensive Takeaways** — practical lessons for analysts: what to log, what to baseline, and why simple statistics are indicators rather than verdicts.
- **Glossary** — plain-language definitions of every term used in the lab.
- **Quiz** — self-check questions tied to each section.

Cross-cutting features:

- **Sender/receiver vs. defender view modes** — every channel exhibit can be viewed from both sides of the exchange.
- **Seeded, reproducible simulations** — a deterministic seeded PRNG means every run can be replayed exactly, which makes the statistics teachable.
- **Tradeoff triangle** — capacity, reliability, and observability are surfaced throughout, so the cost of every encoding choice is visible.
- **Toy messages only** — messages are capped at 24 UTF-8 bytes; the point is understanding, not throughput.

## Screenshots

Run the lab locally (see below) and drop your own captures into `docs/screenshots/`
to illustrate this section. Good candidates:

- **Overview** — the text → bytes → bits pipeline and the "same bits, five carriers" preview.
- **Timing Channel** — the arrival timeline with the "the message is in *when* they arrived" reveal.
- **DNS Channel** — the simulated query log alongside the defender's anomaly panel.
- **Detection Console** — the at-a-glance anomaly gauges across all channels.

## Architecture

A fully static site: vanilla JavaScript ES modules, no framework, no build step, no backend.

```
/
  index.html          — single-page app, all sections
  package.json        — type:module; scripts: test (node --test), serve (python http.server)
  .nojekyll           — so GitHub Pages serves the js/ folder as-is
  LICENSE (MIT), README.md, SECURITY.md
  /css   base.css (tokens/reset), layout.css, components.css, views.css
  /js
    app.js            — bootstrap + hash routing between sections
    state.js          — central seeded app state + pub/sub
    simulation.js     — deterministic orchestrator (encode -> channel -> decode -> detect)
    /channels  dns.js, timing.js, storage.js, ordering.js, stego.js
    /detectors anomaly.js, dnsDetector.js, timingDetector.js, storageDetector.js,
               orderingDetector.js, stegoDetector.js
    /views     overviewView, dnsView, timingView, storageView, orderingView, stegoView,
               detectionView, comparisonView, conceptsView, defenseView, glossaryView,
               quizView (plus shared helpers: dom.js, blocks.js, charts.js,
               controls.js, widgets.js)
    /content   glossary.js, quiz.js, comparison.js, references.js, copy.js
    /utils     utf8.js, bits.js, seededRandom.js, statistics.js
  /assets  sample-cover-image.png (small, generated locally)
  /test    node --test suites for utf8/bits/seededRandom/statistics,
           each channel, the detectors, and the simulation orchestrator
```

Design principles:

- **Pure logic, separate views.** Channel encoders/decoders (`js/channels/`), detectors (`js/detectors/`), and utilities (`js/utils/`) are pure, DOM-free modules. They take plain data in and return plain data out. Views (`js/views/`) are the only code that touches the DOM.
- **Deterministic orchestration.** `simulation.js` runs the full pipeline — encode → channel → decode → detect — driven by a seeded PRNG, so results are reproducible.
- **Unit-tested under Node.** Because the logic modules never touch the DOM, they run unchanged under `node --test` with no browser, no mocks, and no build step.
- **Strict CSP, zero exfiltration surface.** A `<meta>` Content-Security-Policy tag; no external network requests, no analytics, no cookies.

## Channel taxonomy

| Category | Where the hidden bits live | Example in the lab | Is it a covert channel? |
| --- | --- | --- | --- |
| Storage channel | In a *value* — a field not meant to carry data | Simulated header field bits | Yes — classic covert storage channel |
| Timing channel | In *when* events occur | Inter-event gap encoding | Yes — classic covert timing channel |
| Protocol-shaped tunneling | Inside a legitimate protocol's structure | Data in simulated DNS query names | Carrier abuse; covert only insofar as it blends in |
| Steganography | Inside *other content* | Image LSB embedding | Hidden data in media; related but distinct discipline |
| Encrypted tunnel (SSH/HTTPS) | Content is encrypted, but the tunnel itself is visible | Discussed conceptually | Usually **no** — it hides content, not existence or purpose |

The key distinction the lab hammers on: **hiding content is not the same as hiding the existence or purpose of communication.** An HTTPS session hides what you said; it does not hide that you said something, to whom, or (often) roughly what kind of thing it was.

## Safety boundaries

This is a controlled, entirely client-side simulation built for understanding and detection, not operation:

- Every "packet," "query," "resolver," "server," and "timing event" is a plain JavaScript object rendered in the browser.
- Simulated domains use the reserved documentation TLD `.test` (e.g., `example.test`), which cannot resolve on the public Internet.
- The site makes **no network requests at all** beyond loading its own static files, enforced by a strict Content-Security-Policy.
- Messages are toy-sized (max 24 UTF-8 bytes) and exist only in browser memory.
- The lab never claims any channel is "undetectable" or "invisible" — a core teaching point is that every channel has an observable footprint, and comparisons are ranked by educational value, never by stealth.

## What this project intentionally does not do

This project **does not transmit covert network traffic and does not provide an operational tunnel of any kind.** It is a simulation for education and defense. The following are deliberately, permanently out of scope:

- No raw sockets, packet crafting, or packet injection.
- No live DNS tunneling — no real DNS queries encode any data, ever.
- No ICMP tunneling or any real ICMP traffic.
- No command-and-control (C2) functionality of any kind.
- No data exfiltration capability — nothing leaves the browser.
- No remote destinations, endpoints, listeners, or receiver servers.
- No real network transmission between a sender and a receiver — "sender" and "receiver" are two panels rendering the same in-memory objects.
- No evasion tooling, no "stealth mode," and no guidance on defeating monitoring.

If you want to study covert channels operationally, do so only in an isolated lab environment you own, under an authorization that covers it. This project will not help you do it on a real network — by design.

## How to run locally

```bash
git clone https://github.com/<your-username>/crypto-lab-covert-channel-studio.git
cd crypto-lab-covert-channel-studio
python3 -m http.server 8080     # or: npm run serve
```

Then open <http://localhost:8080>.

> **Note:** opening `index.html` directly via `file://` will **not** work. The app uses native ES modules, which browsers only load over `http(s)`. Any static file server works; no build step is required.

## Deploying to GitHub Pages

The site is fully static — no build step and no server-side code — so it publishes as-is.

### Option A — GitHub Actions (recommended, automatic)

This repo ships a workflow at `.github/workflows/deploy-pages.yml` that runs the test
suite and then deploys the whole site on every push to `main`.

1. Push the repository to GitHub (`main` branch).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**. (The workflow also
   attempts to enable Pages automatically on its first run.)
3. Push any commit to `main`. The **Deploy to GitHub Pages** workflow builds nothing,
   runs `node --test`, and publishes the site. The live URL appears in the workflow's
   *deploy* job summary.

### Option B — Deploy from a branch (zero config)

In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`.
The included `.nojekyll` file tells Pages to skip Jekyll so every file (including the
`js/` modules) is served exactly as-is.

### Notes

- A project site is served from `https://<user>.github.io/<repo>/`. All asset and module
  paths in this project are **relative**, so it works correctly under that subpath with no
  `<base>` tag or configuration.
- A friendly `404.html` is included for mistyped URLs; navigation within the exhibit uses
  in-page `#` fragments, so normal use never leaves `index.html`.

## Running the tests

```bash
npm test          # or: node --test
```

Tests use the Node.js built-in test runner (`node --test`). They cover the utilities (`utf8`, `bits`, `seededRandom`, `statistics`) and every channel and detector pair. Because the simulation logic is DOM-free and seeded, the tests are **deterministic** — no browser, no flakiness, no network.

## Accessibility

- Semantic HTML with proper landmarks and heading structure.
- Full keyboard navigation with visible focus indicators.
- `prefers-reduced-motion` respected — animations and timing visualizations degrade gracefully.
- Sender/receiver and defender view modes are reachable and operable without a pointer.

## Browser support

Modern evergreen desktop browsers (current Chrome, Firefox, Edge, Safari). The app relies on native ES modules and modern CSS; no transpilation or polyfills are provided.

## Limitations

Be honest about what this is:

- **It is a simulation.** Real networks add noise, middleboxes, retransmission, and adversarial monitoring that no browser demo reproduces.
- **Simple statistics are indicators, not verdicts.** The detection console uses entropy, frequency, and regularity measures as teaching instruments. Real detection pipelines combine many signals, baselines, and context; a lit indicator here means "worth a look," never "proven covert channel."
- **Toy messages only.** The 24-byte cap keeps every example small enough to trace bit-by-bit; nothing here says anything about real-world channel capacity.

## References

A curated, annotated reference list also appears in-app (see the References panel). Two anchor works ground the material:

- Butler W. Lampson, *A Note on the Confinement Problem* (1973) — the paper that introduced covert channels as a formal concern.
- The NCSC covert channel analysis guidance (the "Light Pink Book" of the Rainbow Series) — the classic treatment of identifying and measuring storage and timing channels in evaluated systems.

## License

MIT — see [LICENSE](LICENSE).
