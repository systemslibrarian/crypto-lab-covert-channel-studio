# Method Validation & Transparency

This document exists so that every statistical claim in Covert Channel Studio can be traced from
**published statistic → this implementation → chosen threshold → measured behaviour**, and so the
simplifications are visible rather than hidden. It complements two things already in the repo:

- **Known-answer tests** — `test/methods.test.js` (the statistics) and the per-detector tests.
- **The Detector Validation Lab** — `js/analysis/validation.js` + the in-app *Detector Validation
  Lab* section, which measures ROC/AUC and confusion matrices over hundreds of deterministic
  clean/covert cases.

A recurring, load-bearing caveat: **an anomaly score is not a probability of a covert channel.**
Scores order cases; thresholds are a teaching choice; benign traffic can trip the same wires.

---

## 1. Corrected conditional entropy (timing)

- **Source:** Gianvecchio & Wang, *"Detecting Covert Timing Channels: An Entropy-Based Approach,"*
  ACM CCS 2007 (DOI [10.1145/1315245.1315284](https://doi.org/10.1145/1315245.1315284)), using the
  corrected conditional entropy (CCE) of Porta et al.
- **Idea:** covert timing channels are far more *regular* than human/application traffic, so their
  conditional entropy — corrected for the finite-sample bias that makes long patterns look
  spuriously unique — is low.
- **Implementation** (`utils/statistics.js › correctedConditionalEntropy`): quantile-bin the
  inter-arrival series into `bins` symbols; for each pattern length `L`, compute the Shannon entropy
  `EN(L)` of length-`L` patterns, the conditional entropy `CE(L) = EN(L) − EN(L−1)`, and the
  corrected value `CCE(L) = CE(L) + perc(L)·EN(1)`, where `perc(L)` is the fraction of length-`L`
  windows whose pattern occurs exactly once. Report `min_L CCE(L)`.
- **Parameters:** `bins = 5`, `maxLen = 5`. Requires at least `bins × 4` samples (else returns `NaN`).
- **Deviations / simplifications:** the original uses adaptive/entropy-based binning; we use simple
  equiprobable **quantile** binning for legibility. We report the minimum CCE rather than the full
  CCE-vs-`L` curve (though the per-length values are exposed in `metrics.ccePerLength`).
- **Threshold:** the detector maps CCE to a score contribution `clamp(1 − CCE/1.5, 0, 1)` (weight 1.0).
- **Known answers** (`test/methods.test.js`): a perfect two-level series gives CCE ≈ 0.16; a
  deterministic pseudo-random series gives CCE ≈ 2.27 (asserted `regular < 1` and `complex >
  regular + 1`).
- **Failure modes:** enough jitter smears the two levels and raises CCE, so a heavily-jittered
  channel becomes *subtle* (low score) — see the Validation Lab's covert-timing cases at high jitter.

## 2. Cabuk regularity (timing)

- **Source:** Cabuk, Brodley & Shields, *"IP Covert Timing Channels: Design and Detection,"* ACM CCS
  2004 (DOI [10.1145/1030083.1030108](https://doi.org/10.1145/1030083.1030108)).
- **Idea:** a crafted channel keeps its per-window variability nearly constant; bursty legitimate
  traffic does not.
- **Implementation** (`utils/statistics.js › cabukRegularity`): split the series into windows of
  size `w`; take each window's standard deviation `σᵢ`; regularity is the standard deviation of the
  pairwise relative differences `|σᵢ − σⱼ| / σᵢ`. **Lower = more regular.**
- **Parameters:** `w = 10`; needs at least two windows (`< 2w` samples ⇒ `NaN`).
- **Threshold:** score contribution `clamp(1 − regularity/0.2, 0, 1)` (weight 0.9).
- **Known answers:** a constant-variability series ⇒ 0; a series whose spread changes ⇒ strictly
  larger (asserted).
- **Failure modes:** a fixed-rate application stream can look equally regular over a short window (a
  benign false positive; the Validation Lab's clean "health-check poller" case exercises this).

## 3. Character-frequency divergence (DNS)

- **Source:** Born & Gustafson, *"Detecting DNS Tunnels Using Character Frequency Analysis,"* 2010.
- **Idea:** encoded/encrypted DNS labels use a near-uniform character mix nothing like
  human-readable hostnames.
- **Implementation** (`utils/statistics.js › klDivergenceBits`, `detectors/dnsDetector.js`):
  KL divergence `D(P‖Q)` in bits between the observed label-character distribution `P` and a
  hostname baseline `Q` (English letter frequencies), with unlisted symbols floored at `10⁻⁴` so the
  digits of a base32 tunnel register as very unlikely.
- **Deviations:** Born & Gustafson use per-character frequency *features* fed to a classifier; we use
  a single KL-divergence scalar against a fixed baseline — simpler and transparent, not identical.
- **Threshold:** score contribution `clamp((KL − 1.2)/(4 − 1.2), 0, 1)` (weight 1.0); an observation
  fires above 2.2 bits.
- **Measured:** base32 covert labels ≈ 7.4 bits; dictionary cover labels ≈ 0.4–1.0 bits.
- **Failure modes:** hashed asset names and some CDN hostnames are also high-divergence — combine
  with volume and cadence.

## 4. Chi-square "pairs of values" attack (image steganography)

- **Source:** Westfeld & Pfitzmann, *"Attacks on Steganographic Systems,"* Information Hiding 1999.
- **Idea:** LSB embedding of near-random data equalises the counts of each adjacent value pair
  `(2i, 2i+1)`.
- **Implementation** (`detectors/stegoDetector.js`, `utils/statistics.js › chiSquareUpperProbability`):
  for each pair, expected `= (h[2i]+h[2i+1])/2`; the chi-square statistic sums `(observed − expected)²
  / expected`; the probability of embedding is the upper-tail chi-square `Q(χ², k)`, computed via a
  regularised incomplete gamma function. Applied per grid block; the worst block's `p(embed)` is the
  signal. Empty blocks return `p = 0` (no data is not evidence).
- **Threshold:** contributes directly as `clamp(p, 0, 1)`; the score is `max(chi, contrast)` with a
  small bonus when both agree.
- **Known answers:** `Q(3.841, 1) ≈ 0.05` and `Q(11.070, 5) ≈ 0.05` (textbook critical values,
  asserted in `test/methods.test.js`); equalised counts ⇒ `Q ≈ 1`, skewed ⇒ `Q ≈ 0`.
- **Failure modes (measured):** the attack **false-positives on high-entropy carriers** — uniform
  image noise equalises value pairs the same way embedding does. This is why the image-LSB detector
  has the lowest AUC (≈ 0.75) in the Validation Lab; it is reported honestly, not tuned away. It is
  also weaker than transform-domain steganalysis (e.g. J-UNIWARD / rich models) against modern stego.

## 5. Permutation capacity (ordering, HTTP)

- **Source:** Shannon — a permutation of `n` distinguishable events carries `⌊log₂(n!)⌋` bits.
- **Implementation** (`utils/statistics.js › permutationCapacityBits`): exact sum of `log₂ k`.
- **Known answers:** `n=2 → 1`, `n=3 → 2`, `n=5 → 6`, `n=10 → 21` (asserted).
- **Use:** the HTTP header channel achieves this bound (`⌊log₂ 6!⌋ = 9` bits/request); the packet-
  ordering toy encoder deliberately sits *below* it (1 bit/pair), which the capacity breakdown shows
  as `theoretical ≫ raw`.

## 6. Anomaly scoring and thresholds

- Each detector combines weighted indicator contributions into a 0–100 score
  (`detectors/anomaly.js › weightedScore`) and bands it: **< 34 low, 34–66 moderate, ≥ 67 high**.
- These thresholds are a **teaching choice**, not tuned operating points. The Validation Lab shows
  the confusion matrix at 34 (investigate) vs 67 (high confidence) so the FPR/FNR trade is visible.
- The score is explicitly **not** calibrated to a probability.

## 7. Capacity as three measurements

`js/analysis/tradeoff.js` reports capacity as three explicit numbers rather than one, aligned with
the bandwidth-estimation mindset of NIST SP 800-53 **SC-31 (Covert Channel Analysis)** and NCSC-TG-030:

- **Theoretical** — the structural maximum for the carrier (`bits/event × event rate`; the
  `⌊log₂ n!⌋` ceiling for ordering).
- **Raw throughput** — what *this* encoder emits.
- **Effective goodput** — `raw × (1 − BER)`: bits/second recovered correctly after jitter, loss, or
  middlebox normalisation.

The invariant `theoretical ≥ raw ≥ goodput` holds by construction; ordering is the case where
`theoretical ≫ raw` (the toy encoder trades capacity for simplicity), and normalisation/heavy jitter
is where `goodput ≪ raw`.

## 8. The Validation Lab benchmark

`js/analysis/validation.js` builds, for each detector, hundreds of **deterministic** clean and covert
cases (parameter sweeps × seeds, no `Date`/`Math.random`) and computes:

- **AUC** — rank-based (Mann-Whitney): the probability a random covert case outscores a random clean
  case. AUC measures *ordering quality only*, on this synthetic benchmark — it says nothing about a
  real deployment's distribution.
- **ROC** — TPR vs FPR as the decision threshold sweeps.
- **Confusion matrix** + FPR/FNR/precision/recall at thresholds 34 and 67.

Representative measured AUCs (deterministic; see `test/validation.test.js` for the asserted ranges):
DNS ≈ 1.00, Timing ≈ 0.99, Storage (TTL toggle) ≈ 1.00, HTTP ≈ 1.00, Air-gap optical ≈ 0.92,
Image-LSB ≈ 0.75, Shared cache ≈ 0.70. Four honest limitations are built into the benchmark and
reported rather than hidden:

- a **parity IP-ID / low-bit-sequence** storage channel barely disturbs its field, so no simple
  histogram separates it — a taught false negative (the benchmark validates the *detectable* TTL
  toggle);
- the **chi-square attack false-positives on noisy carriers**, which is exactly why image-LSB scores
  lowest;
- the **air-gap optical** detector loses covert cases at high ambient noise — but so does the
  receiver, so those are cases where the channel has already failed (detectability and usability
  collapse together);
- the **shared-cache** detector scores lowest of all, deliberately. Its clean set includes
  high-miss-rate workloads (a streaming scan over an array larger than the cache), which use the
  fast and slow access classes about as evenly as a covert channel does. Since balance is the
  discriminator (see §9), those are genuine false positives. Accepting the lower AUC was preferred
  over keying on a signal that ordinary memory access already produces.

## 9. Two-level recovery, matched filtering, and BSC capacity (air-gap optical, shared cache)

Both physical-medium modules are **models of their medium** — no hardware, cache, or timer is
involved — but the signal processing over that model is ordinary and checkable.

- **Matched filter** (`channels/physical.js`, `channels/cache.js`): for a rectangular symbol the
  matched filter is the mean over the symbol's samples, so averaging `N` independent noise samples
  scales the noise standard deviation by `1/√N`. Asserted by known-answer tests that show the
  predicted error rate falling as `samplesPerBit` / `repetitions` rise.
- **Error rate** (`utils/statistics.js › qFunction`): `Q(x) = ½·erfc(x/√2)` via Abramowitz & Stegun
  7.1.26 (|error| < 1.5×10⁻⁷). With the threshold anywhere between the two levels the two error
  directions are computed separately and averaged over equiprobable bits.
- **Capacity** (`utils/statistics.js › bscCapacityBits`): `C = 1 − H₂(p)` bits per channel use
  (Shannon 1948). Known answers: `p=0 → 1`, `p=0.5 → 0`. The optical module additionally reports the
  soft-decision AWGN bound `½·log₂(1+SNR)`; the gap between the two is the cost of hard thresholding.
- **Two-level split** (`utils/statistics.js › twoLevelSplit`): deterministic k=2 Lloyd iterations
  from fixed seed centres, reporting `d′ = separation / pooled within-class SD`. Shared by both
  detectors so the defender measures the levels the same way the receiver recovers them.

Two honesty notes are asserted in the tests rather than left implicit:

- the optical module's **predicted BER models the Gaussian term only**. Measured BER can exceed it,
  for two documented reasons: *drift* is a systematic offset that averaging cannot remove, and a
  sensor reading floors at darkness, so heavy noise clips and biases readings upward. The gap
  between the predicted and measured curves is a teaching point, not an error.
- the cache module's noise is **asymmetric** — a co-tenant can evict a line the sender placed, but
  cannot conjure one it never touched — so errors land almost entirely on one symbol. Its capacity
  figure therefore uses the symmetric (BSC) formula on the *average* error rate: exact when eviction
  is off, mildly pessimistic otherwise. This approximation is stated in the module and in the UI.

---

*Everything here is simulated in the browser. These methods are implemented for understanding and
detection, at teaching fidelity — not as production intrusion-detection logic.*
