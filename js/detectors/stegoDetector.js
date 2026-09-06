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

import { median, clamp } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';

/** Binary entropy of a Bernoulli(p) source, in bits (0..1). */
function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
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

  // Block sweep: grid of blocks, LSB entropy per block.
  const grid = Math.max(2, Math.min(opts.blocks ?? 12, Math.floor(Math.min(width, height) / 2) || 2));
  const bw = Math.ceil(width / grid);
  const bh = Math.ceil(height / grid);
  const blocks = [];
  for (let by = 0; by < grid; by++) {
    for (let bx = 0; bx < grid; bx++) {
      let ones = 0;
      let count = 0;
      for (let y = by * bh; y < Math.min((by + 1) * bh, height); y++) {
        for (let x = bx * bw; x < Math.min((bx + 1) * bw, width); x++) {
          const base = (y * width + x) * 4;
          ones += (data[base] & 1) + (data[base + 1] & 1) + (data[base + 2] & 1);
          count += 3;
        }
      }
      const ratio = count ? ones / count : 0;
      blocks.push({ bx, by, setRatio: ratio, entropy: binaryEntropy(ratio), count });
    }
  }

  const entropies = blocks.map((b) => b.entropy);
  const medianEntropy = median(entropies);
  let hottest = blocks[0];
  for (const b of blocks) if (b.entropy > hottest.entropy) hottest = b;
  const contrast = clamp(hottest.entropy - medianEntropy, 0, 1);

  const metrics = {
    globalSetRatio,
    globalLsbEntropy,
    blocks,
    grid,
    medianBlockEntropy: medianEntropy,
    hottestBlock: { bx: hottest.bx, by: hottest.by, entropy: hottest.entropy, setRatio: hottest.setRatio },
    blockContrast: contrast,
  };

  // The signal is CONTRAST: a block whose LSB plane is much more random than the
  // rest of the image. In a smooth carrier the embedded region jumps out; in a
  // uniformly noisy photo there is little contrast and this indicator stays low
  // (an honest false-negative case).
  const meaningful = hottest.entropy > 0.25;
  const contributions = [
    { value: meaningful ? clamp(contrast / 0.35, 0, 1) : 0, weight: 1.0 },
  ];
  const observations = [];

  if (meaningful && contrast > 0.15) {
    observations.push(observation(
      `Block (${hottest.bx}, ${hottest.by}) has a far more random LSB plane (entropy ${hottest.entropy.toFixed(2)}) than the image median (${medianEntropy.toFixed(2)}).`,
      'Embedding data forces that region\'s least-significant bits toward noise while smooth neighbours stay near-constant.',
      'Naturally noisy or high-detail regions (foliage, sensor grain) can also have random-looking LSBs, so location matters.',
      { weight: 1.0 },
    ));
  } else {
    observations.push(observation(
      `LSB randomness is uniform across the image (block-entropy contrast ${contrast.toFixed(2)}).`,
      'No single region stands out as over-random on this simple measure.',
      'A small payload hidden in a naturally noisy photo can stay below this indicator entirely — a real limit of simple steganalysis.',
      { triggered: false },
    ));
  }

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  return { metrics, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
