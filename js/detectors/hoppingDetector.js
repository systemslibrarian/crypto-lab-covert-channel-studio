/**
 * detectors/hoppingDetector.js — educational indicators for protocol hopping.
 *
 * Nothing in a hopping channel is anomalous per flow. Every packet is a valid
 * packet of a protocol the host legitimately speaks, so no per-packet inspector
 * — no signature, no field check, no entropy test on a payload — can see it.
 * The channel is only visible as a property of the SEQUENCE, which means the
 * detector has to work on a transition matrix.
 *
 * Two structural facts do the work:
 *
 *   1. The covert grammar forbids staying on the same protocol, so the DIAGONAL
 *      of the transition matrix is exactly empty. Real hosts are sticky — a
 *      browsing session is a long run of HTTPS — so their diagonal carries most
 *      of the mass. A near-zero diagonal is the strongest single indicator here,
 *      and unlike an entropy estimate it is robust on small samples.
 *
 *   2. Payload bits are arbitrary, so the successors are used about equally and
 *      the transition entropy sits near its ceiling. Real transitions are
 *      heavily skewed toward a few common pairs.
 *
 * The pivot matters as much as the statistics. Aggregated over a whole host,
 * the covert hops are diluted by ordinary traffic and the diagonal looks normal
 * again. Grouping by peer is what makes the channel reappear — so this detector
 * reports both the aggregate view and the most anomalous single destination,
 * and scores the pivot. That asymmetry (invisible in aggregate, obvious per
 * peer) is the lesson, not an implementation detail.
 *
 * Pure logic (no DOM).
 */

import { clamp, shannonEntropy, chiSquare, chiSquareUpperProbability, round } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';
import { PROTOCOL_KEYS, BITS_PER_HOP } from '../channels/hopping.js';

/** Below this many hops a transition matrix is not worth reading. */
const MIN_HOPS = 8;

const N = PROTOCOL_KEYS.length;
/** Transitions the covert grammar can produce: every off-diagonal cell. */
const ADMISSIBLE = N * (N - 1);

/**
 * Transition statistics for one ordered sequence of protocol keys.
 * @param {string[]} seq
 */
function transitionStats(seq) {
  const hops = Math.max(0, seq.length - 1);
  const pairs = [];
  let self = 0;
  let runs = 0;
  for (let i = 1; i < seq.length; i++) {
    pairs.push(`${seq[i - 1]}>${seq[i]}`);
    if (seq[i] === seq[i - 1]) self++; else runs++;
  }
  const entropy = shannonEntropy(pairs);
  // With few hops the entropy is bounded by log2(hops), not by log2(20): a
  // 12-hop sample cannot exhibit 20 distinct transitions however random it is.
  // Normalising against the achievable ceiling keeps short samples honest.
  const ceiling = hops > 1 ? Math.min(Math.log2(ADMISSIBLE), Math.log2(hops)) : 0;
  return {
    hops,
    selfTransitions: self,
    selfRatio: hops ? self / hops : 0,
    distinctTransitions: new Set(pairs).size,
    transitionEntropy: entropy,
    entropyCeiling: ceiling,
    normEntropy: ceiling > 0 ? clamp(entropy / ceiling, 0, 1) : 0,
    meanRunLength: runs ? seq.length / runs : seq.length,
    pairs,
  };
}

/** Pearson chi-square of the off-diagonal transition counts against uniform. */
function uniformityTest(pairs) {
  const counts = new Map();
  for (const p of pairs) {
    const [from, to] = p.split('>');
    if (from === to) continue; // the diagonal is tested separately, as mass
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return { chiSquare: 0, dof: 0, p: 1, offDiagonal: 0 };
  const expected = total / ADMISSIBLE;
  const observed = [];
  const expectedArr = [];
  for (const from of PROTOCOL_KEYS) {
    for (const to of PROTOCOL_KEYS) {
      if (from === to) continue;
      observed.push(counts.get(`${from}>${to}`) || 0);
      expectedArr.push(expected);
    }
  }
  const { chiSquare: chi, dof } = chiSquare(observed, expectedArr);
  return { chiSquare: chi, dof, p: chiSquareUpperProbability(chi, dof), offDiagonal: total };
}

/** Full 5×5 transition matrix (for display). */
function matrix(seq) {
  const grid = PROTOCOL_KEYS.map(() => PROTOCOL_KEYS.map(() => 0));
  for (let i = 1; i < seq.length; i++) {
    const a = PROTOCOL_KEYS.indexOf(seq[i - 1]);
    const b = PROTOCOL_KEYS.indexOf(seq[i]);
    if (a >= 0 && b >= 0) grid[a][b]++;
  }
  return grid;
}

/**
 * @param {Array<{protocol:string, dest?:string}>} flows  observed flows in arrival order
 */
export function analyzeHopping(flows) {
  const seq = flows.map((f) => f.protocol);
  const global = transitionStats(seq);
  const uniformity = uniformityTest(global.pairs);

  // ---- Pivot by peer ------------------------------------------------------
  // The analyst's move: stop looking at the host and look at each conversation.
  const byDest = new Map();
  for (const f of flows) {
    const d = f.dest || '(unknown)';
    if (!byDest.has(d)) byDest.set(d, []);
    byDest.get(d).push(f.protocol);
  }
  const peers = [...byDest.entries()]
    .map(([dest, s]) => ({ dest, ...transitionStats(s) }))
    .filter((p) => p.hops >= MIN_HOPS)
    // Most anomalous first: emptiest diagonal, then flattest transitions.
    .sort((a, b) => (a.selfRatio - b.selfRatio) || (b.normEntropy - a.normEntropy));

  const pivot = peers[0] || null;
  const focus = pivot || global;
  const enough = focus.hops >= MIN_HOPS;

  const metrics = {
    flowCount: flows.length,
    peerCount: byDest.size,
    global: {
      hops: global.hops,
      selfRatio: global.selfRatio,
      normEntropy: global.normEntropy,
      distinctTransitions: global.distinctTransitions,
      meanRunLength: global.meanRunLength,
    },
    pivot: pivot ? {
      dest: pivot.dest, hops: pivot.hops, selfRatio: pivot.selfRatio,
      normEntropy: pivot.normEntropy, distinctTransitions: pivot.distinctTransitions,
      meanRunLength: pivot.meanRunLength,
    } : null,
    peers,
    matrix: matrix(pivot ? byDest.get(pivot.dest) : seq),
    protocols: PROTOCOL_KEYS,
    chiSquare: uniformity.chiSquare,
    chiSquareDof: uniformity.dof,
    chiSquareP: uniformity.p,
    admissibleTransitions: ADMISSIBLE,
  };

  // ---- Contributions ------------------------------------------------------
  // A grammar that forbids repeats drives the diagonal to exactly zero; a
  // sticky host sits well above 0.25. Scale between those.
  const selfDeficit = enough ? clamp((0.25 - focus.selfRatio) / 0.25, 0, 1) : 0;
  // Arbitrary payload uses the successors evenly, pushing entropy to its ceiling.
  const flatness = enough ? clamp((focus.normEntropy - 0.55) / 0.35, 0, 1) : 0;
  // Every run is exactly one flow long when repeats are forbidden.
  const runShortness = enough ? clamp((1.6 - focus.meanRunLength) / 0.6, 0, 1) : 0;

  const contributions = [
    { value: selfDeficit, weight: 1.3 },
    { value: flatness, weight: 1.0 },
    { value: runShortness, weight: 0.5 },
  ];

  const observations = [];
  if (!enough) {
    observations.push(observation(
      `Only ${focus.hops} hop${focus.hops === 1 ? '' : 's'} observed on any single peer.`,
      'A transition matrix over five protocols has 20 admissible cells; a handful of hops cannot populate it meaningfully.',
      'Short observation windows are the normal case, not a sign of innocence — this is a limit of the measurement, not a finding.',
      { triggered: false },
    ));
  } else {
    const where = pivot ? `peer ${pivot.dest}` : 'this stream';
    if (selfDeficit > 0.4) {
      observations.push(observation(
        `Conversation with ${where} never repeats a protocol: ${focus.selfTransitions} of ${focus.hops} hops stay put (${Math.round(focus.selfRatio * 100)}%).`,
        'A protocol-hopping grammar has to change protocol on every hop to stay decodable, so its transition matrix has an empty diagonal. Ordinary hosts are sticky — sessions are long runs of one protocol.',
        'A monitoring agent that round-robins a fixed service check, or a scripted job that touches several services in a fixed cycle, also never repeats. Look at whether the ORDER varies or is a fixed rotation.',
        { weight: 1.3 },
      ));
    } else {
      observations.push(observation(
        `Protocol runs on ${where} average ${round(focus.meanRunLength, 2)} flows before switching (${Math.round(focus.selfRatio * 100)}% of hops stay put).`,
        'Repeated protocols are what ordinary traffic looks like; the diagonal carrying real mass is evidence against a hopping grammar.',
        'A hopping channel diluted with enough ordinary traffic to the same peer would also show a populated diagonal.',
        { triggered: false },
      ));
    }

    if (flatness > 0.3) {
      observations.push(observation(
        `Transition entropy is ${round(focus.transitionEntropy, 2)} bits/hop against a ${round(focus.entropyCeiling, 2)}-bit ceiling for this sample (${Math.round(focus.normEntropy * 100)}% of it), across ${focus.distinctTransitions} distinct transitions.`,
        'Arbitrary payload bits pick successors about equally, so the transition distribution flattens toward uniform. Real protocol sequences are dominated by a few common pairs.',
        'A short sample flattens on its own — with few hops nearly every transition is unique whatever the cause. The ceiling above is already adjusted for that; treat the percentage, not the raw entropy, as the comparable number.',
        { weight: 1.0 },
      ));
    }

    // An EXCULPATORY observation. A fixed rotation has the same empty diagonal
    // as a covert channel and is not one — the discriminator is that it reuses
    // only a handful of transitions where payload uses them all. Worth saying
    // out loud, because "never repeats a protocol" describes a cron job just as
    // well as it describes a covert state machine.
    if (selfDeficit > 0.4 && flatness < 0.2 && focus.distinctTransitions <= N + 2) {
      observations.push(observation(
        `Those hops reuse only ${focus.distinctTransitions} distinct transitions out of ${ADMISSIBLE} available — a fixed rotation rather than a free walk.`,
        'A channel carrying arbitrary payload uses the admissible transitions about equally. A repeating cycle uses a handful, over and over. The empty diagonal is the same in both cases; this is what tells them apart.',
        'A covert sender who deliberately restricted themselves to a small transition set would look like this too — and would pay for it in capacity, since a smaller successor set carries fewer bits per hop.',
        { weight: 0, triggered: false },
      ));
    }

    if (pivot && metrics.global.selfRatio > focus.selfRatio + 0.15) {
      observations.push(observation(
        `Aggregated over all ${metrics.peerCount} peers the diagonal looks ordinary (${Math.round(metrics.global.selfRatio * 100)}% self-transitions); split by peer, ${pivot.dest} sits at ${Math.round(pivot.selfRatio * 100)}%.`,
        'Mixing the covert walk into a host’s ordinary traffic hides it in the aggregate. The signal only survives if the analyst groups by conversation.',
        'Any host with one automated peer and many human-driven ones shows this split. It says where to look, not what was found.',
        { weight: 0 },
      ));
    }
  }

  const methods = [
    {
      key: 'diagonalMass', name: 'Transition-matrix diagonal mass',
      citation: 'Educational indicator (Markov transition analysis)',
      value: `${Math.round(focus.selfRatio * 100)}% self-transitions`,
      interpretation: 'A grammar that must change protocol every hop leaves the diagonal empty; sticky real traffic fills it. Robust on small samples because it is forced by the encoding, not estimated.',
    },
    {
      key: 'transitionEntropy', name: 'Transition entropy',
      citation: 'Shannon (1948), entropy of the transition distribution',
      value: `${round(focus.transitionEntropy, 2)} / ${round(focus.entropyCeiling, 2)} bits per hop`,
      interpretation: 'Normalised against the ceiling this sample size can actually reach, so a short window is not mistaken for randomness.',
    },
    {
      key: 'uniformity', name: 'Chi-square vs uniform transitions',
      citation: 'Pearson chi-square goodness of fit',
      value: uniformity.dof ? `χ²=${round(uniformity.chiSquare, 1)}, df=${uniformity.dof}, p=${round(uniformity.p, 3)}` : 'n/a',
      interpretation: `Tests the ${ADMISSIBLE} off-diagonal cells against equal use. A LARGE p (a poor reason to reject uniformity) is the suspicious direction here — the inversion of the usual reading.`,
    },
    {
      key: 'hopCapacity', name: 'Hop capacity',
      citation: `⌊log₂(n−1)⌋ over n = ${N} protocols`,
      value: `${BITS_PER_HOP} bits per hop`,
      interpretation: 'The ceiling the grammar allows: from each protocol there are n−1 admissible successors, so hop capacity grows only logarithmically with the protocol set.',
    },
  ];

  const score = weightedScore(contributions);
  return { metrics, methods, score, anomalyLevel: levelFromScore(score), observations, disclaimer: DISCLAIMER };
}
