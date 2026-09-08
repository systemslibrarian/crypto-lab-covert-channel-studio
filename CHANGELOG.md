# Changelog

All notable changes to Covert Channel Studio. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic-ish versioning.

## [1.4.0] — 2026-09-08 — Sequence carriers, the active warden, and a learned detector

### Added
- **Protocol-Hopping Channel** (`#hopping`) — the choice of protocol *is* the message. A covert state
  machine walks an ordered five-protocol set (HTTPS, DNS, NTP, SMTP, SSH) by the rule
  `to = (from + 1 + symbol) mod n`; from each protocol there are `n − 1` admissible successors, so
  `⌊log₂(n − 1)⌋ = 2` bits ride on every hop and no successor is wasted. This is the first module in
  the lab where **no packet is anomalous at all** — every flow is a valid flow of a protocol the host
  legitimately speaks, and the channel exists only as a property of the *sequence*, so per-packet
  inspection is structurally blind to it. Backed by `js/channels/hopping.js`,
  `js/detectors/hoppingDetector.js`, `js/views/hoppingView.js`.
- The hopping detector reads a **transition matrix** rather than any field. The grammar has to change
  protocol on every hop to stay decodable, so its diagonal is forced empty, while real hosts are
  sticky (a browsing session is a long run of HTTPS). Two further teaching results are measured, not
  asserted:
  - **Dilution does not work, but only if you pivot.** The covert score holds at 97 (HIGH) whether
    cover traffic is 0 or 100 flows, while the *whole-host* self-transition ratio climbs from 0% to
    44%. Aggregated over a host the channel disappears; grouped by peer it is obvious. The defender
    panel shows both views side by side so the gap is something you look at rather than a claim.
  - **Loss desynchronises.** 2% flow loss drives the bit-error rate to roughly a coin flip. The state
    machine resynchronises immediately (its state is read straight off the carrier) but the bit
    *indexing* has no framing, so every symbol after a dropped flow lands one position early.
  Capacity grows only logarithmically with the protocol set, which is why hopping is a signalling
  channel and not an exfiltration channel.
- An honest false positive is built into the hopping benchmark: a **monitoring agent that round-robins
  a fixed rotation** has an equally empty diagonal and scores 64 (MODERATE). It is separated from the
  real channel only by transition entropy (0.54 vs 0.87 of the achievable ceiling) — which is exactly
  what justifies carrying a second statistic instead of keying on the diagonal alone.
- **ICMP Echo Channel** (`#icmp`) — the carrier students ask for by name, built as a **pair** of
  deliberately mismatched channels: the echo data area (loud, `chunkBytes × 8` bits per echo) and the
  low bit of the 16-bit Echo Identifier (quiet, one bit per echo). Backed by `js/channels/icmp.js`,
  `js/detectors/icmpDetector.js`, `js/views/icmpView.js`.
  - **They die to orthogonal defences.** A size clamp or payload scrub erases the data-area channel
    and leaves the identifier untouched; a NAT rewriting the Echo Identifier — which RFC 5508 requires
    so replies can be demultiplexed — erases the identifier channel and leaves the payload untouched.
    **No single normaliser closes ICMP**, and the module is built so a student can verify that by
    flipping two switches.
  - **Payload entropy is the wrong statistic.** The conventional ping fill is an incrementing run of
    distinct bytes, so its Shannon entropy is already near-maximal — higher than plenty of real
    message data. What separates them is that the fill is *predictable* and *identical in every echo*,
    which is a structural test, not an entropy test. A clean case of a plausible statistic measuring
    the wrong property.
  - Measured indicator scores: payload at `chunkBytes = 2` → **89 (HIGH)**; the same payload padded
    out to the conventional 56 bytes → **40 (MODERATE)** (padding hides the size tell, content still
    betrays it); identifier low bit → **9 (LOW)**; ordinary ping → **1 (LOW)**. The identifier result
    is a deliberate **taught false negative**, mirroring the IP-ID parity channel in the storage
    module: one bit in a field with no reference distribution leaves nothing for a content or size
    statistic to find.
  - Every address comes from the RFC 5737 documentation ranges, which are reserved for documentation
    and are not routable. Nothing is crafted, sent, or received; an "echo" is a plain object.
- **Active Warden Lab** (`#warden`) — a section about **disruption** rather than detection. Seven
  normaliser actions (header scrubbing, HTTP header canonicalisation, packet resequencing, traffic
  shaping, ICMP normalisation, a protocol egress allow-list, and a DNS label policy) are each applied
  to the *actual simulation* and every channel is re-run, so the verdicts are measured rather than
  looked up. Backed by `js/analysis/warden.js`, `js/views/wardenView.js`. With all seven enabled the
  measured outcome is **6 closed, 1 residual, 2 out of path**, and each action closes exactly its own
  target:
  - **Storage-style channels die cleanly.** They depend on one specific value reaching the far end,
    and removing that guarantee is precisely a normaliser's job.
  - **The timing channel does not die.** Shaping at 140 ms of jitter leaves a 26% bit-error rate —
    still 0.17 bits/symbol, about 0.86 bit/s of **residual Shannon capacity**. It is also the only
    defence on the page with an ongoing cost: suppressing harder means buffering harder and adding
    latency for everyone, and it still does not reach zero.
  - **Two channels are structurally out of path.** The air-gap optical and shared-cache rows never
    move, whatever is switched on. A normaliser rewrites packets on a network path, and neither of
    those carriers is on one — the strongest argument in the exhibit against treating normalisation
    as a complete answer.
- The warden lab surfaces a fourth point explicitly: **normalisation is disruption, not detection.**
  Four channels are closed *while their anomaly score falls* — storage 91 → 0, hopping 97 → 0,
  HTTP 82 → 0, ICMP 62 → 22 — leaving the defender with a network where the attempt failed and no
  record that anyone made it. Both columns are shown for that reason.
- Warden capacity is reported as **residual Shannon capacity**, `C = 1 − H₂(BER)` bits per symbol,
  rather than as surviving goodput: the honest question is how much information could still cross
  with ideal coding, not how many bits happen to arrive intact. It is clamped to zero at or above
  `BER = 0.5`, because the plain BSC formula credits a fully-inverted channel with full capacity —
  correct for a flip channel, wrong here, where past a coin flip a receiver cannot distinguish an
  inverted channel from a destroyed one.
- **A learned detector, next to the classical ones** (`js/detectors/learnedDetector.js`,
  `js/analysis/learned.js`) — a two-feature logistic regression that uses the **same two features** as
  the hand-built timing detector (corrected conditional entropy, and coefficient of variation). The
  point of that choice is that nothing here has more information than the classical detector does;
  the only difference is that the weighting is *fitted* rather than chosen by a person, so any gain
  or loss is a consequence of fitting alone. It measures the two things a fitted model does that a
  hand-built one cannot:
  - **Overfitting**, as the countable gap between fit AUC and held-out AUC on cases from the same
    distribution, with a small-training-set model and a full-training-set model side by side.
  - **Distribution shift**, against a set drawn from generative processes neither model was trained
    on: scheduled health-check pollers (clean but metronomic) and narrow-separation timing channels
    (covert but subtle). The classical detector is scored on identical sets, which is the fair
    comparison — it was never fitted to anything, so it has nothing to shift away from.
  Fully deterministic: zero-initialised weights, full-batch gradient descent with a fixed learning
  rate and epoch count, and standardisation statistics fitted on the **training split only** (fitting
  them on all the data leaks the test set — a mistake worth not making in a teaching implementation).
  Documented in **VALIDATION.md §10**, with the honest caveat that it is a toy: two features, a linear
  boundary, a few hundred synthetic cases, and a benchmark built by the same person who built the
  channels. It exists to make overfitting and distribution shift visible, not to suggest that a
  logistic regression detects covert channels.
- **Both new detectors are in the Validation Lab benchmark**, not just calibrated on example cases.
  Measured: ICMP echo **AUC 0.897** (FPR 0%, **FNR 27%**) and protocol hopping **AUC 1.000** (**FPR
  29%**, FNR 0%) at the investigate threshold. Both numbers were paid for deliberately:
  - The ICMP benchmark **keeps the Echo Identifier low-bit channel in its covert set** even though
    the detector misses nearly all of it. Dropping those cases would have bought a much better AUC by
    concealing a real blind spot. Its clean set likewise includes a path-MTU diagnostic sweep, which
    trips the size statistic and nothing else — a genuine false-positive source rather than a
    strawman.
  - The hopping row is the sharpest methodological point in the release: **a perfect AUC and a 29%
    false-positive rate at the same time.** Every covert case ranks above every clean one, and the
    detector still flags nearly a third of the clean set — because that set contains monitoring
    agents whose transition-matrix diagonal is exactly as empty as the covert channel's. AUC asks
    whether the *ordering* is right; the confusion matrix asks what happens at the threshold you
    actually deploy. Documented in VALIDATION.md §8.
- Measured findings from the learned-detector experiment, stated in VALIDATION.md §10 rather than
  summarised away:
  - **Fitting beats guessing in-distribution.** The learned models reach 0.974–0.978 held-out AUC
    against the hand-built detector's 0.767, on exactly the same two features. This is not an
    "ML is bad" result and is not written up as one.
  - **Under shift, the fitted models invert completely** — AUC **0.000**, ranking every covert case
    below every clean one, while the classical detector scores 1.000 on the same cases. The reason is
    nameable: the classical detector keys on a *structural* property (two distinct timing levels)
    that survives the shift, while the fit leaned on a *correlational* one (low variability) that
    reverses. CCE was available to every model; in-distribution, CV simply separated better, so that
    is what the optimiser chose.
  - **Regularisation does not rescue it.** The L2 model's weights are ~10× smaller and its shift AUC
    is identical, because shrinking both preserved their ratio. Shift is not an overfitting problem;
    a smaller wrong invariant is still wrong.
- `channels/timing.js › generatePollerGaps` — a scheduled health-check poller (fixed interval, small
  scheduling jitter), the classic false-positive trap for every timing detector. Kept **separate**
  from `generateNormalGaps` on purpose: the Validation Lab benchmark is a published set of numbers,
  so the new generator feeds the distribution-shift experiment rather than silently changing it.
- Both new channels register like every other simulation-layer channel: Detection Console gauges,
  live capacity/reliability/observability trade-off curves, and a place in the Concepts trade-off
  selector.

### Changed
- The **Carrier Atlas** entries for **ICMP tunneling** and **protocol hopping / switching** move from
  *described-only* to **built**, with fidelity cards rewritten accordingly. Prose that listed either
  among the carriers this lab only describes (README, Instructor Guide, answer key, Compare Channels)
  was updated to match. The described-only list is now VoIP/RTP, Wi-Fi / link layer, history /
  object-reuse channels, and the text/linguistic family.
- The **ICMP trade-off sweep is deliberately flat**, and that is the finding rather than a defect:
  burying the tunnel in more ordinary ping traffic does not move the indicator at all, because the
  detector groups by destination before it measures anything. Dilution defeats an aggregate, not an
  analyst who pivots.

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
- **Model-boundary disclosure gate** (`test/disclosure.test.js`) — renders each modelled channel in
  both view modes and asserts the boundary callout reaches the **DOM**, deriving the expected strings
  from the copy itself. Added because that disclosure first shipped invisible: `sectionHeader()`
  renders only title/lede/outcomes, not `copy.blocks`, so the callout existed in the content layer
  and never reached the page while every other test stayed green. The gate is mutation-checked
  (removing the `renderBlocks()` call turns it red with a diagnostic naming the fix, while the a11y
  gate stays green). The DOM shim moved to `test/dom-shim.js` so both gates share one copy; its
  `renderedText()` deliberately descends DocumentFragments, since a naive `textContent` read is
  precisely what made a missing disclosure look like a present one.
- **VALIDATION.md §9** documents the matched filter, the Q-function error rate, BSC capacity, and the
  two-level split, plus two honesty notes asserted in tests: the optical module's predicted BER
  models the Gaussian term only (drift and sensor clipping push measurement above it), and the cache
  module's capacity uses the symmetric formula on an asymmetric channel.

### Fixed
- BitWhisper's third author is now cited **as published** — "Yisroel Mirski", the byline on both the
  IEEE record and the authors' own arXiv deposit (1503.07919). He romanises it "Mirsky" today, and
  the entry previously carried that later spelling. Correcting the record explicitly: an earlier
  commit message described the venue spelling as an *IEEE typo*. That was wrong — "Mirski" is what
  the 2015 paper was published under, and no venue erred. `references.js` now documents the
  cite-as-published convention at the top of the file, so the byline is not "corrected" back.

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
