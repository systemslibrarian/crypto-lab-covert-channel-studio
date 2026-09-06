/**
 * detectors/dnsDetector.js — educational indicators for simulated DNS traffic.
 *
 * A defender rarely knows the hidden message. Instead they measure the SHAPE of
 * the query stream: how long the labels are, how random they look, how many are
 * unique, whether everything points at one parent domain, and how metronomic
 * the cadence is. Any one of these is innocent on its own; together they raise
 * or lower an educational anomaly score.
 *
 * Pure logic (no DOM).
 */

import {
  mean, stdDev, coefficientOfVariation, uniqueRatio,
  normalizedStringEntropy, frequency, clamp, klDivergenceBits, round,
} from '../utils/statistics.js';

/**
 * Approximate character distribution of ordinary hostnames (English letter
 * frequencies). Anything not listed is floored inside klDivergenceBits, so the
 * digits and rare symbols that pack a tunnel's base32 labels register as very
 * unlikely — the basis of character-frequency DNS-tunnel detection
 * (Born & Gustafson, 2010).
 */
const HOSTNAME_CHAR_BASELINE = {
  e: 0.127, t: 0.091, a: 0.082, o: 0.075, i: 0.070, n: 0.067, s: 0.063, h: 0.061,
  r: 0.060, d: 0.043, l: 0.040, c: 0.028, u: 0.028, m: 0.024, w: 0.024, f: 0.022,
  g: 0.020, y: 0.020, p: 0.019, b: 0.015, v: 0.0098, k: 0.0077, j: 0.0015,
  x: 0.0015, q: 0.00095, z: 0.00074,
};
import {
  levelFromScore, weightedScore, observation, DISCLAIMER,
} from './anomaly.js';

/**
 * @param {Array<Object>} queries  simulated query objects with { label, fqdn, parent, timeMs }
 * @returns {{ metrics:Object, score:number, anomalyLevel:string, observations:Array, disclaimer:string }}
 */
export function analyzeDns(queries) {
  const n = queries.length;
  const labels = queries.map((q) => (q.label || '').replace(/\./g, ''));
  const fqdns = queries.map((q) => q.fqdn);
  const parents = queries.map((q) => q.parent || (q.fqdn || '').split('.').slice(-2).join('.'));
  const lengths = labels.map((l) => l.length);

  // --- Metrics -------------------------------------------------------------
  const uniqueSubdomainCount = new Set(fqdns).size;
  const uniqueSubRatio = uniqueRatio(fqdns);
  const avgLabelLength = mean(lengths);
  const maxLabelLength = lengths.length ? Math.max(...lengths) : 0;
  const perLabelEntropy = labels.map((l) => normalizedStringEntropy(l, 36));
  const avgLabelEntropy = mean(perLabelEntropy);

  // Character distribution across all labels.
  const allChars = labels.join('').split('');
  const charFreq = frequency(allChars);
  const charDistribution = [...charFreq.entries()]
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count);

  // Cadence.
  const times = queries.map((q) => q.timeMs).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const spanMs = times.length ? times[times.length - 1] - times[0] : 0;
  // Rate from the (n-1) intervals that span the window, not n, to avoid a
  // fencepost that inflates small samples.
  const requestsPerMinute = spanMs > 0 ? ((n - 1) / (spanMs / 60000)) : 0;
  const interArrivalCV = coefficientOfVariation(gaps);
  const interArrivalStd = stdDev(gaps);

  // Repeated-parent ratio: how concentrated on a single parent domain.
  const parentFreq = frequency(parents);
  const maxParentCount = parentFreq.size ? Math.max(...parentFreq.values()) : 0;
  const repeatedParentRatio = n ? maxParentCount / n : 0;

  // Character-frequency divergence of all label characters vs a hostname
  // baseline (Born & Gustafson, 2010). Encoded labels sit far from English text.
  const charDivergence = klDivergenceBits(charFreq, HOSTNAME_CHAR_BASELINE);

  const metrics = {
    queryCount: n,
    uniqueSubdomainCount,
    uniqueSubRatio,
    avgLabelLength,
    maxLabelLength,
    avgLabelEntropy,
    charDistribution,
    charDivergence,
    requestsPerMinute,
    interArrivalCV,
    interArrivalStd,
    repeatedParentRatio,
  };

  const methods = [
    {
      key: 'charDivergence', name: 'Character-frequency divergence',
      citation: 'Born & Gustafson, 2010',
      value: `${round(charDivergence, 2)} bits`,
      interpretation: 'KL divergence of the labels’ character mix from ordinary hostname text. Encoded/encrypted labels diverge sharply.',
    },
    {
      key: 'entropy', name: 'Mean label entropy',
      citation: 'Educational indicator',
      value: `${round(avgLabelEntropy, 2)} / 1.0`,
      interpretation: 'Normalised Shannon entropy per label; near-random data approaches 1.0.',
    },
    {
      key: 'unique', name: 'Unique-QNAME ratio',
      citation: 'Educational indicator',
      value: `${Math.round(uniqueSubRatio * 100)}%`,
      interpretation: 'Tunnels emit fresh names constantly, so almost nothing repeats and caching never helps.',
    },
  ];

  // --- Scored indicators ---------------------------------------------------
  const contributions = [];
  const observations = [];

  const divVal = clamp((charDivergence - 1.2) / (4 - 1.2), 0, 1);
  contributions.push({ value: divVal, weight: 1.0 });
  if (charDivergence > 2.2) {
    observations.push(observation(
      `Label characters diverge sharply from hostname text (${round(charDivergence, 1)} bits KL).`,
      'Base32/base64 or encrypted payloads use a near-uniform character mix nothing like English hostnames (Born & Gustafson, 2010).',
      'Hashed asset names and some CDN hostnames are also high-divergence; combine with volume and cadence.',
      { weight: 1.0 },
    ));
  }

  const entropyVal = clamp(avgLabelEntropy, 0, 1);
  contributions.push({ value: entropyVal, weight: 0.8 });
  if (avgLabelEntropy > 0.72) {
    observations.push(observation(
      `Average label entropy is high (${avgLabelEntropy.toFixed(2)} of 1.0).`,
      'Encoded or encrypted data looks near-random; ordinary hostnames are far more predictable.',
      'CDN and cloud providers legitimately use long random-looking hostnames and hashed asset names.',
      { weight: 1.0 },
    ));
  }

  const lenVal = clamp((avgLabelLength - 8) / (24 - 8), 0, 1);
  contributions.push({ value: lenVal, weight: 0.9 });
  if (avgLabelLength > 14) {
    observations.push(observation(
      `Labels are long on average (${avgLabelLength.toFixed(1)} chars; max ${maxLabelLength}).`,
      'Packing data into labels forces them longer than typical human-readable names.',
      'Some services legitimately use long tokenised subdomains (e.g. per-session or per-asset names).',
      { weight: 0.9 },
    ));
  }

  const uniqueVal = n >= 8 ? clamp((uniqueSubRatio - 0.5) / 0.5, 0, 1) : 0;
  contributions.push({ value: uniqueVal, weight: 0.8 });
  if (n >= 8 && uniqueSubRatio > 0.85) {
    observations.push(observation(
      `Almost every query is a unique subdomain (${(uniqueSubRatio * 100).toFixed(0)}%).`,
      'A tunnel emits fresh labels constantly, so caching never helps and repeats are rare.',
      'Analytics, telemetry, and some CDNs also generate many one-off names.',
      { weight: 0.8 },
    ));
  }

  const parentVal = n >= 8 ? clamp((repeatedParentRatio - 0.5) / 0.5, 0, 1) : 0;
  contributions.push({ value: parentVal, weight: 0.6 });
  if (n >= 8 && repeatedParentRatio > 0.8) {
    observations.push(observation(
      `Most queries share one parent domain (${(repeatedParentRatio * 100).toFixed(0)}%).`,
      'A tunnel funnels all of its unique labels under a single controlled domain.',
      'Heavy use of one legitimate provider (e.g. a single SaaS vendor) looks similar.',
      { weight: 0.6 },
    ));
  }

  const cadenceVal = gaps.length >= 4 ? clamp(1 - interArrivalCV / 0.5, 0, 1) : 0;
  contributions.push({ value: cadenceVal, weight: 0.6 });
  if (gaps.length >= 4 && interArrivalCV < 0.15) {
    observations.push(observation(
      `Query cadence is very regular (CV ${interArrivalCV.toFixed(2)}).`,
      'Machine-driven beaconing produces metronomic timing that human browsing does not.',
      'Scheduled tasks, health checks, and NTP-like polling are also periodic and benign.',
      { weight: 0.6 },
    ));
  }

  const rateVal = n >= 8 ? clamp(requestsPerMinute / 120, 0, 1) : 0;
  contributions.push({ value: rateVal, weight: 0.4 });
  if (n >= 8 && requestsPerMinute > 90) {
    observations.push(observation(
      `Query rate is elevated (${requestsPerMinute.toFixed(0)}/min).`,
      'High-throughput tunnels need many queries to move even a little data.',
      'A busy user or a chatty application can also produce bursts of DNS lookups.',
      { weight: 0.4 },
    ));
  }

  const score = weightedScore(contributions);
  const anomalyLevel = levelFromScore(score);

  if (observations.length === 0) {
    observations.push(observation(
      'No individual indicator crossed its teaching threshold.',
      'The stream looks like ordinary name resolution on these measures.',
      'A low-and-slow channel can still hide beneath these thresholds — absence of evidence is not evidence of absence.',
      { triggered: false },
    ));
  }

  return { metrics, methods, score, anomalyLevel, observations, disclaimer: DISCLAIMER };
}
