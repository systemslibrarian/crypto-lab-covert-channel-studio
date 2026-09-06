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
