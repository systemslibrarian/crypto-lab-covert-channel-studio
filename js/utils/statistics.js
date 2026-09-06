/**
 * statistics.js — small, transparent statistics used by the defender panels.
 *
 * These are deliberately simple and readable. The exhibit repeatedly makes the
 * point that simple statistics are *indicators*, not verdicts, so the code that
 * computes them should be simple enough to read in one sitting.
 *
 * Pure logic (no DOM).
 */

/** @param {number[]} xs */
export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/** @param {number[]} xs */
export function mean(xs) {
  return xs.length ? sum(xs) / xs.length : 0;
}

/** @param {number[]} xs */
export function median(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Population variance. @param {number[]} xs */
export function variance(xs) {
  if (xs.length < 1) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) * (x - m);
  return acc / xs.length;
}

/** @param {number[]} xs */
export function stdDev(xs) {
  return Math.sqrt(variance(xs));
}

/**
 * Coefficient of variation (stdDev / mean). A low CV means the values are very
 * regular — a useful, if crude, "is this cadence suspiciously metronomic?"
 * indicator for inter-arrival times.
 * @param {number[]} xs
 * @returns {number}
 */
export function coefficientOfVariation(xs) {
  const m = mean(xs);
  if (m === 0) return 0;
  return stdDev(xs) / Math.abs(m);
}

/** @param {number[]} xs */
export function minMax(xs) {
  if (!xs.length) return { min: 0, max: 0 };
  let mn = xs[0];
  let mx = xs[0];
  for (const x of xs) { if (x < mn) mn = x; if (x > mx) mx = x; }
  return { min: mn, max: mx };
}

/**
 * Count occurrences of each distinct value.
 * @param {Array<string|number>} items
 * @returns {Map<string|number, number>}
 */
export function frequency(items) {
  const m = new Map();
  for (const it of items) m.set(it, (m.get(it) || 0) + 1);
  return m;
}

/**
 * Shannon entropy (bits per symbol) of a sequence of symbols, estimated from
 * observed frequencies. Range: 0 (all identical) up to log2(#distinct symbols).
 * @param {Array<string|number>} symbols
 * @returns {number} bits per symbol
 */
export function shannonEntropy(symbols) {
  const n = symbols.length;
  if (n === 0) return 0;
  const counts = frequency(symbols);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Shannon entropy of the characters in a string (bits per character).
 * @param {string} str
 * @returns {number}
 */
export function stringEntropy(str) {
  return shannonEntropy([...String(str)]);
}

/**
 * Normalised entropy in [0, 1]: observed entropy divided by the maximum
 * possible for the given alphabet size. Handy for a comparable "randomness"
 * meter regardless of alphabet.
 * @param {string} str
 * @param {number} [alphabetSize] defaults to the number of distinct chars seen
 * @returns {number}
 */
export function normalizedStringEntropy(str, alphabetSize) {
  const chars = [...String(str)];
  if (chars.length === 0) return 0;
  const distinct = alphabetSize ?? new Set(chars).size;
  if (distinct <= 1) return 0;
  return stringEntropy(str) / Math.log2(distinct);
}

/**
 * Build a histogram with fixed-width bins.
 * @param {number[]} values
 * @param {{ bins?: number, min?: number, max?: number }} [opts]
 * @returns {{ bins: Array<{ start: number, end: number, count: number }>, min: number, max: number, binWidth: number }}
 */
export function histogram(values, opts = {}) {
  const binCount = Math.max(1, opts.bins ?? 12);
  let { min, max } = opts;
  if (min === undefined || max === undefined) {
    const mm = minMax(values);
    min = min ?? mm.min;
    max = max ?? mm.max;
  }
  if (max <= min) max = min + 1;
  const binWidth = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    start: min + i * binWidth,
    end: min + (i + 1) * binWidth,
    count: 0,
  }));
  for (const v of values) {
    if (v < min || v > max) continue;
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1; // include the max edge
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return { bins, min, max, binWidth };
}

/**
 * Odd/even split for integer-valued fields (e.g. an IP ID parity channel).
 * @param {number[]} ints
 * @returns {{ odd: number, even: number, total: number, oddRatio: number }}
 */
export function oddEvenRatio(ints) {
  let odd = 0;
  let even = 0;
  for (const v of ints) {
    if (((v | 0) & 1) === 1) odd++; else even++;
  }
  const total = odd + even;
  return { odd, even, total, oddRatio: total ? odd / total : 0 };
}

/**
 * Fraction of distinct values in a sequence (unique / total). A value near 1
 * means "almost everything is unique" — e.g. a flood of never-repeated
 * subdomains.
 * @param {Array<string|number>} items
 * @returns {number}
 */
export function uniqueRatio(items) {
  if (!items.length) return 0;
  return new Set(items).size / items.length;
}

/**
 * A crude bimodality indicator in [0, 1] for a 1-D sample: fits the values to
 * the nearer of two cluster centres (the overall min-ish and max-ish regions),
 * and reports how cleanly the values separate into two tight groups. Higher
 * means "looks like two distinct levels" — the signature of a two-level timing
 * channel. This is intentionally simple and is described in the UI as an
 * indicator, not a detector.
 * @param {number[]} values
 * @returns {number}
 */
export function bimodalityScore(values) {
  if (values.length < 4) return 0;
  const { min, max } = minMax(values);
  if (max === min) return 0;
  // Seed two centres near the low and high ends, then run a few Lloyd (k=2)
  // iterations. Deterministic: no randomness.
  let c0 = min + (max - min) * 0.25;
  let c1 = min + (max - min) * 0.75;
  for (let iter = 0; iter < 12; iter++) {
    let s0 = 0; let n0 = 0; let s1 = 0; let n1 = 0;
    for (const v of values) {
      if (Math.abs(v - c0) <= Math.abs(v - c1)) { s0 += v; n0++; }
      else { s1 += v; n1++; }
    }
    const nc0 = n0 ? s0 / n0 : c0;
    const nc1 = n1 ? s1 / n1 : c1;
    if (nc0 === c0 && nc1 === c1) break;
    c0 = nc0; c1 = nc1;
  }
  // Within-cluster spread vs between-cluster distance. Tight clusters that are
  // far apart -> high score.
  let within = 0;
  for (const v of values) {
    within += Math.min(Math.abs(v - c0), Math.abs(v - c1));
  }
  within /= values.length;
  const between = Math.abs(c1 - c0);
  if (between === 0) return 0;
  const ratio = within / between; // small -> clearly bimodal
  // Calibrated so a unimodal spread (ratio ~0.25) scores ~0 and tight two-level
  // data approaches 1.
  return Math.max(0, Math.min(1, 1 - ratio / 0.25));
}

/** Clamp helper. */
export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Round to a fixed number of decimals, returning a Number (not a string).
 * @param {number} x
 * @param {number} [d]
 */
export function round(x, d = 2) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/* ============================================================================
   Published detection methods
   These implement (educational, deterministic versions of) statistics from the
   covert-channel detection literature so the Detection Console can name and
   cite what it computes instead of using vague "entropy-ish" scores.
   ========================================================================== */

/**
 * KL divergence D(P‖Q) in bits between an observed symbol distribution and a
 * baseline. Used to ask "how far does this label's character mix sit from
 * ordinary hostname text?" (cf. Born & Gustafson, "Detecting DNS Tunnels Using
 * Character Frequency Analysis", 2010).
 * @param {Map<string,number>|Object} observedCounts symbol -> count
 * @param {Object} baselineProbs symbol -> probability (need not be complete)
 * @param {number} [floor] minimum baseline probability to avoid log(1/0)
 * @returns {number} divergence in bits (>= 0)
 */
export function klDivergenceBits(observedCounts, baselineProbs, floor = 1e-4) {
  const entries = observedCounts instanceof Map ? [...observedCounts] : Object.entries(observedCounts);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  if (total === 0) return 0;
  let kl = 0;
  for (const [sym, c] of entries) {
    const p = c / total;
    if (p <= 0) continue;
    const q = Math.max(floor, baselineProbs[sym] ?? 0);
    kl += p * Math.log2(p / q);
  }
  return Math.max(0, kl);
}

/**
 * Cabuk et al. "regularity" of an inter-arrival series (IEEE S&P / ACM CCS 2004,
 * "IP Covert Timing Channels"). The series is split into windows; the standard
 * deviation of each window is taken; regularity is the standard deviation of the
 * pairwise relative differences of those window standard deviations. A crafted
 * timing channel keeps its per-window variability nearly constant, so its
 * regularity is LOW; bursty legitimate traffic gives a higher value.
 * @param {number[]} values inter-arrival times
 * @param {number} [windowSize]
 * @returns {number} regularity (>= 0; lower = more regular/artificial)
 */
export function cabukRegularity(values, windowSize = 10) {
  if (values.length < windowSize * 2) return NaN; // not enough windows to be meaningful
  const sigmas = [];
  for (let i = 0; i + windowSize <= values.length; i += windowSize) {
    sigmas.push(stdDev(values.slice(i, i + windowSize)));
  }
  const diffs = [];
  for (let i = 0; i < sigmas.length; i++) {
    for (let j = i + 1; j < sigmas.length; j++) {
      if (sigmas[i] > 0) diffs.push(Math.abs(sigmas[i] - sigmas[j]) / sigmas[i]);
    }
  }
  return diffs.length ? stdDev(diffs) : 0;
}

/** Quantile-bin a series into `bins` integer symbols (roughly equiprobable). */
function quantileBin(values, bins) {
  const n = values.length;
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const sym = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    sym[order[rank][1]] = Math.min(bins - 1, Math.floor((bins * rank) / n));
  }
  return sym;
}

/** Entropy (bits) of length-L symbol patterns, plus the fraction of length-L
 *  windows whose pattern occurs exactly once. */
function patternEntropy(sym, L) {
  const counts = new Map();
  const windows = sym.length - L + 1;
  if (windows <= 0) return { entropy: 0, uniqueFrac: 0, windows: 0 };
  for (let i = 0; i + L <= sym.length; i++) {
    const key = sym.slice(i, i + L).join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let H = 0;
  let uniques = 0;
  for (const c of counts.values()) {
    const p = c / windows;
    H -= p * Math.log2(p);
    if (c === 1) uniques++;
  }
  return { entropy: H, uniqueFrac: uniques / windows, windows };
}

/**
 * Corrected Conditional Entropy (CCE) of a series — the core of the
 * entropy-based timing-channel detector of Gianvecchio & Wang ("Detecting
 * Covert Timing Channels: An Entropy-Based Approach", ACM CCS 2007), following
 * Porta et al.'s corrected conditional entropy. The series is quantised into
 * `bins` symbols; for each pattern length L the conditional entropy is corrected
 * by a term proportional to the fraction of unique patterns, and the MINIMUM
 * over L is reported. Covert timing channels are more regular, so their CCE is
 * LOW; complex legitimate traffic scores higher.
 * @param {number[]} values
 * @param {{ bins?:number, maxLen?:number }} [opts]
 * @returns {{ cce:number, firstOrder:number, perLength:Array<Object> }}
 */
export function correctedConditionalEntropy(values, opts = {}) {
  const bins = opts.bins ?? 5;
  const maxLen = opts.maxLen ?? 5;
  if (values.length < bins * 4) return { cce: NaN, firstOrder: 0, perLength: [] };
  const sym = quantileBin(values, bins);
  const first = patternEntropy(sym, 1).entropy;
  let prevEN = 0;
  let minCCE = Infinity;
  const perLength = [];
  for (let L = 1; L <= maxLen; L++) {
    const { entropy: ENL, uniqueFrac } = patternEntropy(sym, L);
    const CE = ENL - prevEN;               // conditional entropy at length L
    const CCE = CE + uniqueFrac * first;   // Porta correction
    perLength.push({ L, EN: round(ENL, 3), CE: round(CE, 3), uniqueFrac: round(uniqueFrac, 3), CCE: round(CCE, 3) });
    if (CCE < minCCE) minCCE = CCE;
    prevEN = ENL;
  }
  return { cce: minCCE, firstOrder: first, perLength };
}

/**
 * Chi-square statistic of observed counts against expected counts.
 * @param {number[]} observed
 * @param {number[]} expected
 * @returns {{ chiSquare:number, dof:number }}
 */
export function chiSquare(observed, expected) {
  let chi = 0;
  let dof = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    if (e > 0) { chi += ((observed[i] - e) ** 2) / e; dof++; }
  }
  return { chiSquare: chi, dof: Math.max(0, dof - 1) };
}

/**
 * Upper-tail probability of the chi-square distribution, Q(x; k) = P(X > x),
 * via a regularised upper incomplete gamma function (Lanczos-free series /
 * continued fraction). Used by the LSB steganalysis "chi-square attack": when
 * pairs-of-values counts have been equalised by embedding, the chi-square value
 * is small and this probability is HIGH — an indicator of embedding
 * (Westfeld & Pfitzmann, "Attacks on Steganographic Systems", IH 1999).
 * @param {number} x chi-square statistic
 * @param {number} k degrees of freedom
 * @returns {number} probability in [0,1]
 */
export function chiSquareUpperProbability(x, k) {
  if (k <= 0) return 0;
  if (x <= 0) return 1;
  const a = k / 2;
  const xx = x / 2;
  // Regularised lower incomplete gamma P(a, xx); upper tail = 1 - P.
  const gln = logGamma(a);
  if (xx < a + 1) {
    // Series representation.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let i = 0; i < 500; i++) {
      ap += 1;
      del *= xx / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const P = sum * Math.exp(-xx + a * Math.log(xx) - gln);
    return Math.max(0, Math.min(1, 1 - P));
  }
  // Continued-fraction representation for the upper incomplete gamma directly.
  let b = xx + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const Q = Math.exp(-xx + a * Math.log(xx) - gln) * h;
  return Math.max(0, Math.min(1, Q));
}

/** Log-gamma via Lanczos approximation. */
function logGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Ordering-channel capacity ceiling: bits available in a permutation of n
 *  distinguishable events, ⌊log2(n!)⌋ (Shannon). */
export function permutationCapacityBits(n) {
  if (n < 2) return 0;
  let logFact = 0;
  for (let k = 2; k <= n; k++) logFact += Math.log2(k);
  return Math.floor(logFact);
}
