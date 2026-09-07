# Changelog

All notable changes to Covert Channel Studio. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic-ish versioning.

## [1.3.0] — 2026-09-07 — Physical-medium and shared-resource carriers

### Added
- **Air-Gap Optical Channel** (`#physical`) — with no network at all, the carrier becomes the medium.
  An LED is blinked as on/off keying and recovered by a matched filter against an explicit
  ambient-noise process, reporting measured bit-error rate against the Shannon capacity of the same
  channel. Separates the two impairments that behave differently: random noise, which averaging
  removes at a √N rate, and systematic *drift*, which it cannot. **The medium is modelled, not
  measured** — no LED, camera, or light sensor is involved, and the view says so. Backed by
  `test/physical.test.js`.
- **Shared-Cache Channel** (`#cache`) — two colluding processes signalling through cache-line
  presence: Flush+Reload, with Prime+Probe as the variant whose timing polarity is inverted.
  Recovered by a latency-histogram hit/miss classifier, with asymmetric eviction noise (a co-tenant
  can evict a line the sender placed, but cannot conjure one it never touched). This is the concrete
  instance of the resource the Shared-Resource Matrix describes abstractly, and the view links
  straight to it. **The cache is modelled, not measured** — nothing is flushed and no timer is read.
  Backed by `test/cache.test.js`.
- Both channels are registered like the other simulation-layer channels: Detection Console gauges,
  live capacity/reliability/observability trade-off curves, Detector Validation Lab benchmarks, and
  blind Detection Challenge scenarios (including an honest false-positive trap — a streaming scan
  over a large array misses about as often as it hits).
- **Carrier Atlas** gains a described-only entry for the **text/linguistic** carrier family
  (zero-width and variation-selector code points, Unicode Tags, whitespace/SNOW, homoglyphs, bidi
  controls), which links out to the sibling exhibit
  [Ghost-Ink](https://systemslibrarian.github.io/Ghost-Ink/) as the deep dive rather than duplicating
  it here. Atlas cards can now carry an outbound deep-dive link alongside the "concept only" mark.
- **Per-channel theming** — each channel section scopes its own `--accent` and carries a nav glyph.
  The glyph is `aria-hidden` and the section label remains the accessible name; colour stays
  decorative and is never the sole carrier of meaning.
- Shared math in `utils/statistics.js`: `binaryEntropy`, `qFunction` (Abramowitz & Stegun 7.1.26),
  `bscCapacityBits`, and `twoLevelSplit` (deterministic k=2 split reporting d′), the last shared by
  both new detectors so the defender measures levels the way the receiver recovers them.
- Verified citations for both carriers: Guri et al. — AirHopper (MALWARE 2014), BitWhisper
  (IEEE CSF 2015, DOI 10.1109/CSF.2015.26), Fansmitter (arXiv:1606.05915), LED-it-GO (DIMVA 2017,
  DOI 10.1007/978-3-319-60876-1_8), PowerHammer (arXiv:1804.04014); Yarom & Falkner — FLUSH+RELOAD
  (USENIX Security 2014); Osvik, Shamir & Tromer — Prime+Probe (CT-RSA 2006,
  DOI 10.1007/11605805_1).
- **VALIDATION.md §9** documents the matched filter, the Q-function error rate, BSC capacity, and the
  two-level split, plus two honesty notes asserted in tests: the optical module's predicted BER
  models the Gaussian term only (drift and sensor clipping push measurement above it), and the cache
  module's capacity uses the symmetric formula on an asymmetric channel.

### Changed
- The **Carrier Atlas** entry for cache/shared-resource timing moved from *described-only* to *built*,
  and its fidelity card now states that the cache is modelled rather than that a browser cannot
  mount a real Flush+Reload. Prose that listed cache-timing among the described-only carriers
  (README, Instructor Guide, answer key, Compare Channels) was updated to match, and now lists the
  text/linguistic family in its place.
- The shared-cache detector deliberately scores the lowest AUC in the Validation Lab (≈ 0.70). A
  bimodal latency histogram is *normal* — memory either hits or misses — so bimodality alone is not
  evidence. Access-class **balance** is the discriminator and it gates the shape indicators, which
  costs AUC against high-miss-rate workloads. That trade is documented rather than tuned away.

## [1.2.0] — 2026-09-06 — Scientific defensibility & teaching package

### Added
- **Detector Validation Lab** — runs every detector over hundreds of deterministic clean/covert
  cases (parameter sweeps × seeds) and reports ROC curves, AUC (rank-based), and confusion
  matrices with FPR/FNR/precision/recall at chosen thresholds. Makes the chain
  *published statistic → implementation → threshold → measured behaviour* explicit, and surfaces
  honest failure modes (a parity storage channel is near-undetectable; the chi-square attack
  false-positives on uniform-noise carriers). Backed by `test/validation.test.js`.
- **Instructor teaching package** — `INSTRUCTOR-GUIDE.md` (30/60/90-minute lesson plans, outcome
  map, grading rubrics, misconception corrections), `docs/student-worksheet.md`,
  `docs/answer-key.md`, and a matched pre/post `docs/assessment.md`.
- **Carrier Atlas** now references the 2025 unified cross-domain hiding-patterns taxonomy
  (Wendzel, Caviglione, Mazurczyk et al., ACM CSUR, DOI 10.1145/3729165) alongside the 2015
  network taxonomy.
- Packaging: `CITATION.cff`, `CONTRIBUTING.md`, this changelog, and a version marker in the UI footer.

### Fixed
- The `<meta>` CSP no longer lists `frame-ancestors` (browsers ignore it in meta; it needs an HTTP
  header). The limitation is documented in SECURITY.md.
- Filled verified DOIs for the Cabuk (2004) and Gianvecchio & Wang (2007) references.
- Corrected the "fictional Crypto-Lab" wording — Crypto-Lab is a real public collection.

## [1.1.0] — 2026-09-06 — "Gold" upgrade

### Added
- **Named, cited detector methods** with known-answer tests: corrected conditional entropy
  (Gianvecchio & Wang 2007), Cabuk regularity (2004), character-frequency divergence
  (Born & Gustafson 2010), the Westfeld–Pfitzmann chi-square attack, and permutation-capacity bounds.
- **Live capacity/reliability/observability instrument** computed from the actual seeded run, on
  every channel, with a sweep curve.
- **Blind, scored Detection Challenge** — observables only; commit a call, then reveal the ground
  truth; includes false-positive traps.
- **New carriers:** HTTP header-order channel and a library-records inference channel.
- **Carrier Atlas** (hiding-pattern map + conceptual carriers with fidelity cards) and an interactive
  **Shared-Resource Matrix** (Kemmerer's method).
- Shareable URL state (`#section?seed=…&mode=…`), an automated accessibility gate, per-module
  learning outcomes, and an exportable lab notebook.

## [1.0.0] — 2026-09-06 — Initial release

- Ten-section exhibit: Overview, DNS, Timing, Storage, Packet-Order, Image Steganography,
  Detection Console, Compare Channels, "What Makes a Channel Covert?", Defensive Takeaways, plus a
  glossary and quiz.
- Deterministic, DOM-free simulation core with a Node test suite; strict CSP; GitHub Pages deploy.
