/**
 * detectors/stegoDetector.js — educational indicators for LSB steganography.
 *
 * The strongest tell in this exhibit is visual (the LSB bit-plane image), but a
 * defender can also sweep the image in blocks and notice a region whose
 * least-significant-bit plane is far more random than its neighbours — the
 * signature of embedded data in an otherwise smooth carrier.
 *
 * This is a teaching indicator, not steganalysis you would trust in production:
 * a small payload in a naturally noisy photograph can hide beneath it.
 *
 * Pure logic (no DOM; operates on a { data, width, height } raster).
 */

import { median, clamp, chiSquareUpperProbability, round } from '../utils/statistics.js';
import { levelFromScore, observation, DISCLAIMER } from './anomaly.js';

/** Binary entropy of a Bernoulli(p) source, in bits (0..1). */
function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/**
 * Westfeld & Pfitzmann chi-square "pairs of values" attack (IH 1999). LSB
 * embedding of near-random data equalises the counts of each adjacent value
 * pair (2i, 2i+1). We measure how close the observed histogram is to that
 * equalised expectation; a small chi-square (well-equalised) yields a HIGH
 * probability-of-embedding via the upper-tail chi-square distribution.
 * @param {Int32Array|number[]} hist256 histogram of byte values 0..255
 * @returns {{ chiSquare:number, dof:number, pEmbed:number }}
 */
function chiSquarePairsAttack(hist256) {
  let chi = 0;
  let terms = 0;
  for (let i = 0; i < 128; i++) {
    const a = hist256[2 * i];
    const b = hist256[2 * i + 1];
    const expected = (a + b) / 2;
    if (expected > 0) { chi += ((a - expected) ** 2) / expected; terms++; }
  }
  const dof = Math.max(1, terms - 1);
  // No value pairs observed = no data = no evidence of embedding (NOT certainty).
  const pEmbed = terms === 0 ? 0 : chiSquareUpperProbability(chi, dof);
  return { chiSquare: chi, dof, pEmbed };
}

/**
 * @param {Object} raster { data, width, height }
 * @param {{ blocks?:number }} [opts]
 */
export function analyzeStego(raster, opts = {}) {
  const { data, width, height } = raster;
  const totalChannels = width * height * 3;

  // Global LSB statistics.
  let globalOnes = 0;
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    globalOnes += data[i] & 1;
  }
  const globalSetRatio = totalChannels ? globalOnes / totalChannels : 0;
  const globalLsbEntropy = binaryEntropy(globalSetRatio);

  // Block sweep: LSB entropy AND the chi-square attack per block.
  const grid = Math.max(2, Math.min(opts.blocks ?? 12, Math.floor(Math.min(width, height) / 2) || 2));
  const bw = Math.ceil(width / grid);
  const bh = Math.ceil(height / grid);
  const blocks = [];
  const globalHist = new Int32Array(256);
  for (let by = 0; by < grid; by++) {
    for (let bx = 0; bx < grid; bx++) {
      let ones = 0;
      let count = 0;
      const hist = new Int32Array(256);
      for (let y = by * bh; y < Math.min((by + 1) * bh, height); y++) {
        for (let x = bx * bw; x < Math.min((bx + 1) * bw, width); x++) {
          const base = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = data[base + c];
            ones += v & 1;
            hist[v]++;
            globalHist[v]++;
          }
          count += 3;
        }
      }
      const ratio = count ? ones / count : 0;
      const attack = chiSquarePairsAttack(hist);
      blocks.push({ bx, by, setRatio: ratio, entropy: binaryEntropy(ratio), count, pEmbed: attack.pEmbed });
    }
  }

  // Grid tiling can leave trailing empty blocks (ceil() overshoots the image).
  // Exclude them: an all-zero block has entropy 0 and would drag the median
  // down (inflating contrast) and — before the pEmbed guard — falsely win the
  // chi-square selection. Analyse only cells that actually contain pixels.
  const active = blocks.filter((b) => b.count > 0);
  const pool = active.length ? active : blocks;

  const entropies = pool.map((b) => b.entropy);
  const medianEntropy = median(entropies);
  let hottest = pool[0];
  for (const b of pool) if (b.entropy > hottest.entropy) hottest = b;
  const contrast = clamp(hottest.entropy - medianEntropy, 0, 1);

  // Chi-square attack: whole-image and the most-suspicious real block.
  const globalAttack = chiSquarePairsAttack(globalHist);
  let chiBlock = pool[0];
  for (const b of pool) if (b.pEmbed > chiBlock.pEmbed) chiBlock = b;

  const metrics = {
    globalSetRatio,
    globalLsbEntropy,
    blocks,
    grid,
    medianBlockEntropy: medianEntropy,
    hottestBlock: { bx: hottest.bx, by: hottest.by, entropy: hottest.entropy, setRatio: hottest.setRatio },
    blockContrast: contrast,
    chiSquareGlobalP: globalAttack.pEmbed,
    chiSquareMaxBlock: { bx: chiBlock.bx, by: chiBlock.by, pEmbed: chiBlock.pEmbed },
  };

  const methods = [
    {
      key: 'chiSquare', name: 'Chi-square pairs-of-values attack',
      citation: 'Westfeld & Pfitzmann, IH 1999',
      value: `p(embed) ≤ ${round(chiBlock.pEmbed, 2)} in worst block`,
      interpretation: 'LSB embedding equalises adjacent value pairs; a high probability in some region indicates embedded data.',
    },
    {
      key: 'blockContrast', name: 'LSB block-entropy contrast',
      citation: 'Educational indicator',
      value: round(contrast, 2),
      interpretation: 'A region whose least-significant bits are far more random than its neighbours stands out against a smooth carrier.',
    },
  ];

  // Signals: (1) chi-square probability of embedding in the worst block
  // (sensitive to LARGE embedding fractions), and (2) LSB entropy contrast
  // (sensitive to a small payload localised in a smooth carrier). EITHER firing
  // is suspicious, so the score takes the stronger of the two with a small boost
  // when both agree — an average would let a zero drag a real signal down. In a
  // uniformly noisy photo neither fires (an honest false-negative case).
  const meaningful = hottest.entropy > 0.25;
  const contrastSignal = meaningful ? clamp(contrast / 0.35, 0, 1) : 0;
  const chiSignal = clamp(chiBlock.pEmbed, 0, 1);
  const combined = clamp(Math.max(contrastSignal, chiSignal) + 0.15 * Math.min(contrastSignal, chiSignal), 0, 1);
  const observations = [];

  if (chiBlock.pEmbed > 0.5) {
    observations.push(observation(
      `Chi-square attack flags block (${chiBlock.bx}, ${chiBlock.by}): probability of embedding ≈ ${round(chiBlock.pEmbed, 2)}.`,
      'The value pairs in that region are equalised the way LSB embedding of near-random data leaves them (Westfeld & Pfitzmann, 1999).',
      'Dithering and some image processing can also equalise value pairs; the attack is strongest on sequential LSB embedding.',
      { weight: 1.0 },
    ));
  }

  if (meaningful && contrast > 0.15) {
    observations.push(observation(
      `Block (${hottest.bx}, ${hottest.by}) has a far more random LSB plane (entropy ${hottest.entropy.toFixed(2)}) than the image median (${medianEntropy.toFixed(2)}).`,
      'Embedding data forces that region\'s least-significant bits toward noise while smooth neighbours stay near-constant.',
      'Naturally noisy or high-detail regions (foliage, sensor grain) can also have random-looking LSBs, so location matters.',
      { weight: 0.8 },
    ));
  }

  if (observations.length === 0) {
    observations.push(observation(
      `Neither the chi-square attack nor the LSB-contrast sweep flags a region (worst-block p ≈ ${round(chiBlock.pEmbed, 2)}, contrast ${contrast.toFixed(2)}).`,
      'On these measures the image looks like an ordinary carrier.',
      'A small payload hidden in a naturally noisy photo can stay below both indicators — a real limit of simple steganalysis.',
      { triggered: false },
    ));
  }

  const score = Math.round(combined * 100);
  const anomalyLevel = levelFromScore(score);

  return { metrics, methods, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
