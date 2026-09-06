# Changelog

All notable changes to Covert Channel Studio. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic-ish versioning.

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
