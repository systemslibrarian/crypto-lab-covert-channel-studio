/**
 * detectors/httpDetector.js — educational indicators for the HTTP header-order
 * channel. A given client library emits a STABLE header order, so passive
 * fingerprinting expects one dominant ordering per client. Data hidden in header
 * order forces the ordering to vary request-to-request — high order entropy and
 * a near-1 unique-ordering ratio.
 *
 * Pure logic (no DOM).
 */

import { shannonEntropy, uniqueRatio, frequency, clamp, round } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';
import { REORDERABLE } from '../channels/http.js';

const MAX_ORDER_ENTROPY = Math.log2((() => { let f = 1; for (let i = 2; i <= REORDERABLE.length; i++) f *= i; return f; })());

export function analyzeHttp(requests) {
  const orders = requests.map((r) => r.headers.map((h) => h.name).filter((n) => REORDERABLE.includes(n)).join('>'));
  const n = orders.length;
  const uniqueOrderRatio = uniqueRatio(orders);
  const orderEntropy = shannonEntropy(orders);
  const normOrderEntropy = MAX_ORDER_ENTROPY ? orderEntropy / MAX_ORDER_ENTROPY : 0;
  const freq = frequency(orders);
  const modalCount = freq.size ? Math.max(...freq.values()) : 0;
  const modalFraction = n ? modalCount / n : 0;

  const metrics = {
    requestCount: n,
    distinctOrders: freq.size,
    uniqueOrderRatio,
    orderEntropy,
    normOrderEntropy,
    modalFraction,
  };

  const methods = [
    {
      key: 'orderEntropy', name: 'Header-order entropy',
      citation: 'Passive HTTP client fingerprinting',
      value: `${round(normOrderEntropy, 2)} / 1.0`,
      interpretation: 'A real client uses one stable header order; near-random order across requests is the tell.',
    },
    {
      key: 'modal', name: 'Dominant-order fraction',
      citation: 'Educational indicator',
      value: `${Math.round(modalFraction * 100)}%`,
      interpretation: 'Legitimate clients repeat one ordering almost every request; a covert sender rarely does.',
    },
  ];

  const contributions = [
    { value: clamp(normOrderEntropy / 0.5, 0, 1), weight: 1.0 },
    { value: n >= 4 ? clamp((uniqueOrderRatio - 0.4) / 0.6, 0, 1) : 0, weight: 0.7 },
  ];
  const observations = [];

  if (normOrderEntropy > 0.3) {
    observations.push(observation(
      `Request header order varies a lot (normalised entropy ${round(normOrderEntropy, 2)}).`,
      'A given client library keeps a fixed header order; varying it every request is how order-based hiding looks.',
      'A/B tests, proxies merging several clients, or mixed client versions can also vary header order.',
      { weight: 1.0 },
    ));
  } else {
    observations.push(observation(
      `Header order is stable (${Math.round(modalFraction * 100)}% share one ordering).`,
      'This is what a single well-behaved client looks like.',
      'A normalising proxy also forces one order — a stable order does not prove the channel was never attempted upstream.',
      { triggered: false },
    ));
  }

  const score = weightedScore(contributions);
  return { metrics, methods, score, anomalyLevel: levelFromScore(score), observations, disclaimer: DISCLAIMER };
}
