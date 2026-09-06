/**
 * seededRandom.js — a small, deterministic pseudo-random generator.
 *
 * Every experiment in the exhibit is seeded so that a given set of controls
 * reproduces exactly the same simulated traffic. This matters twice over:
 *   1. Learners can compare "before/after" a single control change fairly.
 *   2. The automated tests can assert on exact simulated output.
 *
 * The algorithm is mulberry32 — a well-known 32-bit generator that is fast,
 * has a long-enough period for a teaching demo, and is trivial to audit.
 * It is NOT cryptographically secure, and nothing here should be used for
 * security-sensitive randomness.
 *
 * Pure logic (no DOM).
 */

/**
 * Hash an arbitrary string/number seed into a 32-bit unsigned integer so that
 * human-friendly seeds ("HELLO", 42) produce well-distributed state.
 * @param {string|number} seed
 * @returns {number} uint32
 */
export function hashSeed(seed) {
  const str = String(seed);
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0;
}

/**
 * Create a seeded RNG object with convenience helpers.
 * @param {string|number} seed
 * @returns {{
 *   next: () => number,
 *   int: (minInclusive: number, maxInclusive: number) => number,
 *   float: (min: number, max: number) => number,
 *   bool: (p?: number) => boolean,
 *   gaussian: (mean?: number, stdDev?: number) => number,
 *   pick: <T>(arr: T[]) => T,
 *   shuffle: <T>(arr: T[]) => T[],
 *   state: () => number
 * }}
 */
export function createRng(seed) {
  let a = hashSeed(seed);

  // Core mulberry32 step -> float in [0, 1).
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Cache for Box-Muller's paired sample.
  let spare = null;

  return {
    next,

    int(minInclusive, maxInclusive) {
      const lo = Math.ceil(minInclusive);
      const hi = Math.floor(maxInclusive);
      if (hi < lo) return lo;
      return lo + Math.floor(next() * (hi - lo + 1));
    },

    float(min, max) {
      return min + next() * (max - min);
    },

    bool(p = 0.5) {
      return next() < p;
    },

    /** Standard-normal sample scaled to (mean, stdDev), via Box-Muller. */
    gaussian(mean = 0, stdDev = 1) {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mean + stdDev * v;
      }
      let u1 = 0;
      let u2 = 0;
      // Avoid log(0).
      do { u1 = next(); } while (u1 <= Number.EPSILON);
      u2 = next();
      const mag = Math.sqrt(-2.0 * Math.log(u1));
      spare = mag * Math.sin(2.0 * Math.PI * u2);
      return mean + stdDev * (mag * Math.cos(2.0 * Math.PI * u2));
    },

    pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    },

    /** Fisher-Yates using this generator; returns a new array. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },

    state() { return a >>> 0; },
  };
}
