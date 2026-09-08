# Method Validation & Transparency

This document exists so that every statistical claim in Covert Channel Studio can be traced from
**published statistic → this implementation → chosen threshold → measured behaviour**, and so the
simplifications are visible rather than hidden. It complements two things already in the repo:

- **Known-answer tests** — `test/methods.test.js` (the statistics) and the per-detector tests.
- **The Detector Validation Lab** — `js/analysis/validation.js` + the in-app *Detector Validation
  Lab* section, which measures ROC/AUC and confusion matrices over hundreds of deterministic
  clean/covert cases.
- **The learned-detector experiment** — `js/analysis/learned.js` (§10), which fits a detector on the
  same features the hand-built one uses and measures what fitting buys, and what it costs under
  distribution shift.

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

Measured results across all nine detectors (deterministic; see `test/validation.test.js` for the
asserted ranges). FPR/FNR are at the **investigate** threshold of 34:

| Detector | AUC | Cases | FPR | FNR |
| --- | --- | --- | --- | --- |
| DNS | 1.000 | 66 | 0% | 28% |
| Timing | 0.992 | 32 | 0% | 20% |
| Storage (TTL toggle) | 1.000 | 18 | 0% | 0% |
| HTTP header order | 1.000 | 21 | 0% | 0% |
| ICMP echo | 0.897 | 26 | 0% | 27% |
| Protocol hopping | 1.000 | 29 | 29% | 0% |
| Image LSB | 0.750 | 12 | 50% | 0% |
| Air-gap optical | 0.917 | 32 | 42% | 10% |
| Shared cache | 0.700 | 22 | 50% | 0% |

### Read the AUC and the confusion matrix together — protocol hopping is why

The hopping row is the sharpest methodological point in the lab, and it is worth stopping on. Its
**AUC is a perfect 1.000**: every covert case scores above every clean case, so the ranking is
flawless. At the investigate threshold it still **false-positives on 29% of the clean set**.

Both numbers are correct, and they are not in tension — they answer different questions. AUC asks
*"is the ordering right?"* and is invariant to where you put the line. A confusion matrix asks *"what
happens at the line you actually deploy?"* A detector can order perfectly and still be unusable if
the clean cases pile up just under the covert ones.

The cause is specific and was put in the benchmark on purpose. The clean set contains **monitoring
agents that round-robin service checks against a single peer**. Their transition-matrix diagonal is
*exactly as empty as the covert channel's* — a rotation never repeats a protocol either — so the
strongest indicator fires on them at full strength. What separates them is transition entropy: a
fixed rotation uses only a handful of the 20 admissible transitions, while arbitrary payload uses
them all about equally. That second statistic recovers the ordering (hence AUC 1.000) but does not
pull the rotations far enough below the threshold to clear them.

The teaching move: a student who reports "AUC 1.000, therefore this detector is solved" has read half
the evidence. Ask them what the SOC's morning queue looks like.

Five honest limitations are built into the benchmark and reported rather than hidden:

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
  over keying on a signal that ordinary memory access already produces;
- the **ICMP** detector misses nearly all of one whole covert class, giving it a 27% false-negative
  rate. The benchmark deliberately includes the **Echo Identifier low-bit channel** among its covert
  cases, and no content, size, or repetition statistic can see it — one bit in a field with no
  reference distribution leaves nothing to measure. It is the same taught false negative as IP-ID
  parity in the storage module. Dropping those cases would have bought a markedly better AUC by
  concealing the detector's real blind spot, which is the opposite of what this document is for. The
  clean set likewise includes a **path-MTU diagnostic sweep**, which varies payload size deliberately
  while keeping the conventional fill — it trips the size statistic and nothing else, which is a real
  false-positive source rather than a strawman.

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

## 10. The learned detector: overfitting and distribution shift

`js/detectors/learnedDetector.js` + `js/analysis/learned.js` add a **fitted** detector alongside the
hand-built ones, for one reason: "statistics vs machine learning" is worth turning into a measurement
instead of an argument.

- **Model:** two-feature logistic regression, `P(covert | x) = σ(w·z + b)` over standardised features
  `z`. A linear boundary in two dimensions — chosen to be inspectable, not competitive.
- **Features — deliberately the same two the classical detector already computes:**
  `x₁` corrected conditional entropy of the inter-arrival series (§1), and `x₂` the coefficient of
  variation of the same series. This is the load-bearing design choice. The learned model has **no
  more information** than the hand-built one; the only difference is that the weighting of the two
  features is *fitted from labelled examples* rather than chosen by a person. Whatever it gains or
  loses, it gains or loses from fitting alone.
- **Undefined features:** CCE is `NaN` for short series (§1). A short window is not evidence of a
  covert channel, so an undefined value maps to a neutral mid-range constant rather than to something
  the model could learn to treat as a signal.

### Determinism

Every number is reproducible from a clean checkout, with no `Date` and no `Math.random`:

- weights initialised to **zero**, not randomly;
- **full-batch** gradient descent (no shuffling, no mini-batches) with a fixed learning rate and a
  fixed epoch count;
- all cases generated by the seeded generators in `js/channels/timing.js`;
- the train/test split is taken **on the seed index**, not at random, so it is reproducible *and*
  keeps every parameter setting represented on both sides of the split.

### Why standardisation is fitted on the training split only

Feature means and standard deviations are computed from the **training rows only** and then applied
unchanged to the test and shift sets. Fitting them across all the data would let information about
the held-out cases leak into the model's input scaling, inflating the held-out score and
under-reporting exactly the gap this experiment exists to show. It is a small mistake with a large
effect on the reported numbers, and a teaching implementation is the wrong place to make it quietly.

### The three sets

| Set | Construction | What it answers |
| --- | --- | --- |
| **Fit** | The rows the model was trained on (a 12-case subsample for the small model; the full training split for the other). | How well can the model separate what it has already seen? |
| **Test** | Held-out cases from the **same** generative processes — two-level timing channels across a jitter sweep, and exponential background traffic across several mean rates. | Does it generalise to new samples of a distribution it knows? |
| **Shift** | Cases from processes in **neither** training set: scheduled health-check pollers (clean, but metronomic) and narrow-separation timing channels (covert, but subtle). | Does it generalise to a distribution it has never seen — which is what deployment is? |

The **fit → test** gap is overfitting, made countable. Two models are fitted — one on a small
subsample, one on the full training split — so the gap can be watched shrink as the model loses its
ability to memorise. The **test → shift** drop is distribution shift, which more training data on the
same distribution does not fix.

The classical CCE + Cabuk detector (§1, §2) is scored on **the same three sets**. That is the fair
comparison: it was never fitted to anything, so it has nothing to shift away from — but it is also
stuck with whatever weighting a person guessed.

### Why AUC is comparable across the two but raw scores are not

A learned score and a classical score do not mean the same thing even though both are 0–100. This
model emits a probability that is calibrated on its training distribution **and nowhere else**; the
classical score never claimed to be a probability at all (§6). Comparing them by **AUC is fair**,
because AUC uses only the *ranking* of cases and is invariant to any monotone rescaling of either
score. Comparing them by their raw numbers, or by a shared threshold, would not be — and the UI says
so rather than putting the two scores on one axis.

### Measured results

Produced by `evaluateLearnedDetector()` in `js/analysis/learned.js`. Sets: **33 train · 33 held-out ·
24 shifted**.

| Detector | Fit | Held-out | Shifted | Fit − held-out | Weights (CCE, CV) |
| --- | --- | --- | --- | --- | --- |
| Fitted on 12 cases | 1.000 | 0.974 | **0.000** | 0.026 | 0.24, −5.74 |
| Fitted on 12 cases, L2-regularised | 1.000 | 0.978 | **0.000** | 0.022 | −0.11, −0.59 |
| Fitted on all 33 training cases | 0.993 | 0.978 | **0.000** | 0.015 | −1.23, −5.39 |
| Classical (CCE + Cabuk regularity) | 0.611 | 0.767 | **1.000** | — | not fitted |

> **Read the `Fit` column carefully — it does not mean the same thing across rows.** For a fitted
> model it is that model's own training data. For the classical detector it is simply its score on
> the same 12 cases, since it was never fitted to anything. Compare *down* the held-out and shifted
> columns, not *across* the fit column.

Three findings, in order of how uncomfortable they are:

**1. Fitting beats guessing — in-distribution, clearly.** The learned models reach 0.974–0.978 on
held-out cases against the hand-built detector's 0.767. Both had access to precisely the same two
numbers; the difference is entirely that one weighting was fitted from labelled data and the other
was chosen by a person. This is not a "machine learning is bad" story, and it should not be taught as
one. When the deployment distribution matches the training distribution, fitting the weights is the
better engineering decision, and the benchmark says so plainly.

**2. Under shift, the fitted models do not merely degrade — they invert.** Every learned model scores
**0.000** on the shift set: it ranks *every* covert case below *every* clean one. The classical
detector scores 1.000 on the same cases. The reason is specific and is the point of the whole section:

- The classical detector keys on a **structural** property — *are there two distinct timing levels?*
  A narrow-separation channel still has two levels, and a scheduled poller still has one, so the
  property survives the change of distribution intact.
- The fitted models leaned on a **correlational** one — *is the variability low?* In training, covert
  channels happened to be the low-variability class. In the shift set that association reverses: the
  metronomic poller has the lowest variability of anything in the lab and is perfectly clean, while a
  narrow-separation channel is comparatively noisy. The learned rule fires exactly backwards.

Note what is *not* the explanation. CCE — the structural feature — was available to every model. The
fit did not ignore it out of ignorance; in-distribution, CV simply separated the classes better, so
the optimiser weighted CV heavily (−5.74 against 0.24) and that was the correct choice *for the data
it was shown*. The failure is not a bug in the fit. It is what optimising for an available
distribution does when the deployed distribution is a different one.

**3. Regularisation does not rescue it.** The L2 model's weights are roughly ten times smaller
(−0.11, −0.59 against 0.24, −5.74) and its held-out AUC is a hair better — and its shift AUC is
**identical at 0.000**, because shrinking both weights preserved their *ratio*. Distribution shift is
not an overfitting problem that regularisation fixes. The model learned the wrong invariant, and a
smaller wrong invariant is still wrong. Reach for a feature that survives the shift, not a smaller
coefficient on one that does not.

The fit − held-out gaps (0.026 → 0.022 → 0.015) do behave exactly as textbook overfitting should:
they shrink as the training set grows and as regularisation is added. That gap is real, it is
measurable, and it is also **not the interesting failure here** — every model with a small
generalisation gap still inverted completely under shift. Watching the two phenomena come apart in
one table is the reason both are on it.

### Honest limits

This is a **toy**, and calling it anything else would undercut the point it is making:

- two features and a linear boundary — a real detector has orders of magnitude more of both;
- a few hundred synthetic cases, where labelled covert traffic is the scarcest resource in real
  detection work;
- the benchmark was built by the same person who built the channels, so the "covert" class is exactly
  the covert traffic this lab knows how to generate. That is a much friendlier world than a real one.

It exists to make overfitting and distribution shift visible on data a student can trace by hand. It
is not a claim that a logistic regression detects covert channels.

---

*Everything here is simulated in the browser. These methods are implemented for understanding and
detection, at teaching fidelity — not as production intrusion-detection logic.*
