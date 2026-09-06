/**
 * detectors/storageDetector.js — educational indicators for simulated storage.
 *
 * An honest lesson lives in this detector: some storage channels stand out and
 * some barely do.
 *   - A TTL that only ever toggles between 64 and 65 is glaring — real initial
 *     TTLs cluster at 64/128/255, so 65 is a red flag.
 *   - A parity-of-IP-ID or low-bit-of-sequence channel barely disturbs the
 *     field's distribution, because random data already has balanced parity.
 *     A simple histogram will call it "normal" — which is exactly why absence
 *     of a statistical signal is not proof the channel is absent.
 *
 * Pure logic (no DOM).
 */

import { oddEvenRatio, frequency, histogram, minMax, clamp } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';
import { FIELDS, extractBit } from '../channels/storage.js';

const COMMON_INITIAL_TTLS = new Set([64, 128, 255]);

/**
 * @param {Array<Object>} packets
 * @param {string} field  one of the keys in channels/storage.js FIELDS
 */
export function analyzeStorage(packets, field) {
  const info = FIELDS[field] || FIELDS['ipid-parity'];
  const prop = info.field;
  const delivered = packets.filter((p) => p.delivered !== false);
  const values = delivered.map((p) => p[prop]);
  const bits = delivered.map((p) => extractBit(p, field));
  const n = bits.length;

  const ones = bits.reduce((s, b) => s + b, 0);
  const p1 = n ? ones / n : 0;
  // With no packets there is no bias to speak of; guard the degenerate case so
  // an empty stream never reads as maximally skewed.
  const bitBias = n ? Math.abs(p1 - 0.5) * 2 : 0;
  const oe = oddEvenRatio(values);
  const distinct = new Set(values).size;
  const distinctRatio = n ? distinct / n : 0;

  const valueFreq = frequency(values);
  const valueCounts = [...valueFreq.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  const { min, max } = minMax(values);
  const binnedHistogram = histogram(values, { bins: 16 });

  const metrics = {
    field,
    fieldLabel: info.label,
    count: n,
    oddEven: oe,
    bitBias,
    p1,
    distinctValues: distinct,
    distinctRatio,
    valueRange: { min, max },
    valueCounts,
    binnedHistogram,
  };

  const contributions = [];
  const observations = [];

  if (field === 'ttl-toggle') {
    const uncommon = values.filter((v) => !COMMON_INITIAL_TTLS.has(v)).length;
    const uncommonFrac = n ? uncommon / n : 0;
    const tinyRange = n >= 2 && (max - min) <= 2 && distinct <= 2;
    const hasUncommon = uncommon > 0;
    // A per-packet toggle across two adjacent TTLs, at least one of them not a
    // standard initial TTL, is a strong structural anomaly on its own — the
    // exact 0/1 balance barely matters.
    const ttlVal = tinyRange && hasUncommon
      ? clamp(0.85 + uncommonFrac * 0.15, 0, 1)
      : clamp(uncommonFrac * 0.5, 0, 1);
    contributions.push({ value: ttlVal, weight: 1.0 });
    if (tinyRange && hasUncommon) {
      observations.push(observation(
        `TTL is confined to two adjacent values (${min} and ${max}) and toggles per packet.`,
        'Stacks start from a few well-known TTLs (64/128/255); an alternating 64/65 pattern is not something normal hosts or routing produces.',
        'A single unusual OS build could sit at a non-standard TTL — but it would be constant, not toggling bit-by-bit.',
        { weight: 1.0 },
      ));
    } else if (uncommonFrac > 0.2) {
      observations.push(observation(
        `TTL takes uncommon values (${(uncommonFrac * 100).toFixed(0)}% not in 64/128/255).`,
        'Operating systems start with a few well-known TTLs; other values are worth a look.',
        'An intervening router or unusual OS could shift a TTL for benign reasons.',
        { weight: 1.0 },
      ));
    } else {
      observations.push(observation(
        'TTL values all sit at standard initial values.',
        'Nothing about the TTL distribution is anomalous on this measure.',
        'A channel normalized away in transit (or never present) leaves no trace here — a normal-looking field does not prove no channel was attempted.',
        { triggered: false, weight: 0 },
      ));
    }
  } else {
    // Parity / low-bit channels: the distribution stays essentially uniform.
    // Only a strong skew registers, and only once there are enough packets for
    // the ratio to mean anything (short messages are naturally unbalanced).
    const biasVal = n >= 8 ? clamp((bitBias - 0.35) / 0.65, 0, 1) : 0;
    contributions.push({ value: biasVal, weight: 0.7 });
    if (n >= 8 && bitBias > 0.5) {
      observations.push(observation(
        `Extracted bit is skewed (${(p1 * 100).toFixed(0)}% ones).`,
        'A carrier field whose chosen bit is far from 50/50 hints at imposed structure.',
        'Short messages and text encodings are naturally unbalanced, so mild skew means little.',
        { weight: 0.7 },
      ));
    }
    observations.push(observation(
      `The ${info.label.toLowerCase()} distribution looks essentially normal (${distinct} distinct values across ${n} packets).`,
      'A well-chosen parity or low-bit channel barely perturbs the field it hides in.',
      'This is a deliberate false-negative lesson: a clean histogram does NOT prove no channel exists — detection here needs context, not just this statistic.',
      { triggered: false, weight: 0 },
    ));
  }

  const score = weightedScore(contributions.length ? contributions : [{ value: 0, weight: 1 }]);
  const anomalyLevel = levelFromScore(score);

  return { metrics, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
