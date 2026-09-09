/**
 * detectors/icmpDetector.js — educational indicators for the ICMP echo channel.
 *
 * ICMP is the rare case where per-packet inspection genuinely works, because
 * ordinary ping traffic is astonishingly uniform: one session keeps ONE Echo
 * Identifier, numbers its sequence 1, 2, 3…, sends the same number of data
 * bytes every time, and fills the data area after its timestamp with the same
 * fixed incrementing pattern in every single echo. A tunnel breaks all four.
 *
 * A note on why the obvious statistic is the wrong one: payload ENTROPY does
 * not separate these. The conventional ping fill is an incrementing run of
 * distinct bytes, so its Shannon entropy is near the maximum for its length —
 * higher than plenty of real message data. What actually distinguishes it is
 * that it is PREDICTABLE and IDENTICAL across echoes, which is a structural
 * test, not an entropy test. Reaching for entropy here is a good example of a
 * plausible statistic that measures the wrong property.
 *
 * As in the protocol-hopping module, the analysis pivots per destination: a few
 * covert echoes inside a busy ping stream vanish in the aggregate and reappear
 * the moment traffic is grouped by conversation.
 *
 * The identifier channel is expected to score LOW. That is a TAUGHT FALSE
 * NEGATIVE, matching the IP-ID parity channel in the storage module: a single
 * bit in a field with no reference distribution leaves nothing for a content or
 * size statistic to find.
 *
 * Pure logic (no DOM).
 */

import { clamp, round, uniqueRatio } from '../utils/statistics.js';
import { levelFromScore, weightedScore, observation, DISCLAIMER } from './anomaly.js';
import { STANDARD_PAYLOAD_BYTES, TIMESTAMP_BYTES, standardFill } from '../channels/icmp.js';

/** Sizes a conventional ping actually sends: Linux 56, Windows 32. */
const STANDARD_SIZES = new Set([STANDARD_PAYLOAD_BYTES, 32]);
/** Below this many echoes, per-echo ratios are too noisy to weigh. */
const MIN_ECHOES = 4;

/** Does this echo's data area, after the timestamp, look like the fixed fill? */
function conformsToFill(echo) {
  const region = (echo.data || []).slice(TIMESTAMP_BYTES);
  if (!region.length) return false;
  const expected = standardFill(region.length);
  for (let i = 0; i < region.length; i++) if (region[i] !== expected[i]) return false;
  return true;
}

/** The data area after the timestamp, as a comparable key. */
function dataKey(echo) {
  return (echo.data || []).slice(TIMESTAMP_BYTES).join(',');
}

/** Statistics for one group of echoes (a whole stream, or one destination). */
function echoStats(echoes) {
  const count = echoes.length;
  if (!count) {
    return {
      count: 0, avgDataBytes: 0, distinctSizes: 0, standardSizeFraction: 1,
      fillConformFraction: 1, distinctDataRatio: 0, distinctIdentifiers: 0,
      idLowBitBalance: 0, seqStepFraction: 1, nonConforming: 0,
    };
  }
  const sizes = echoes.map((e) => e.dataBytes ?? (e.data || []).length);
  const conforming = echoes.filter(conformsToFill).length;
  const ids = echoes.map((e) => e.identifier);
  const lowBits = ids.map((v) => v & 1);
  const ones = lowBits.filter((b) => b === 1).length;
  const p1 = ones / count;

  let steps = 0;
  for (let i = 1; i < echoes.length; i++) {
    if (echoes[i].seq === echoes[i - 1].seq + 1) steps++;
  }

  return {
    count,
    avgDataBytes: sizes.reduce((a, b) => a + b, 0) / count,
    distinctSizes: new Set(sizes).size,
    standardSizeFraction: sizes.filter((s) => STANDARD_SIZES.has(s)).length / count,
    fillConformFraction: conforming / count,
    nonConforming: count - conforming,
    distinctDataRatio: uniqueRatio(echoes.map(dataKey)),
    distinctIdentifiers: new Set(ids).size,
    // 1.0 = the low bit is a coin flip across the session; 0 = it never moves.
    idLowBitBalance: 1 - Math.abs(2 * p1 - 1),
    seqStepFraction: echoes.length > 1 ? steps / (echoes.length - 1) : 1,
  };
}

/**
 * @param {Array<Object>} echoes  observed echoes in arrival order
 */
export function analyzeIcmp(echoes) {
  const global = echoStats(echoes);

  // ---- Pivot by peer ------------------------------------------------------
  const byDest = new Map();
  for (const e of echoes) {
    const d = e.dest || '(unknown)';
    if (!byDest.has(d)) byDest.set(d, []);
    byDest.get(d).push(e);
  }
  const peers = [...byDest.entries()]
    .map(([dest, group]) => ({ dest, ...echoStats(group) }))
    // Most anomalous first: least conforming fill, then least standard sizing.
    .sort((a, b) => (a.fillConformFraction - b.fillConformFraction)
      || (a.standardSizeFraction - b.standardSizeFraction));

  const pivot = peers[0] || null;
  const focus = pivot || global;
  const enoughForRatios = focus.count >= MIN_ECHOES;

  const metrics = {
    echoCount: echoes.length,
    peerCount: byDest.size,
    global,
    pivot,
    peers,
    standardBytes: STANDARD_PAYLOAD_BYTES,
    sizeHistogram: [...new Map(
      echoes.map((e) => e.dataBytes ?? (e.data || []).length)
        .reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map()),
    ).entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value),
  };

  // ---- Contributions ------------------------------------------------------
  const nonConform = 1 - focus.fillConformFraction;
  const distinctData = enoughForRatios ? focus.distinctDataRatio : 0;
  const sizeAnomaly = 1 - focus.standardSizeFraction;
  const idChurn = focus.distinctIdentifiers > 1 ? focus.idLowBitBalance : 0;

  const contributions = [
    { value: nonConform, weight: 1.3 },
    { value: distinctData, weight: 0.9 },
    { value: sizeAnomaly, weight: 0.7 },
    { value: idChurn, weight: 0.35 },
  ];

  const observations = [];
  const where = pivot && metrics.peerCount > 1 ? `to ${pivot.dest}` : 'in this stream';

  if (nonConform > 0.2) {
    observations.push(observation(
      `${focus.nonConforming} of ${focus.count} echoes ${where} carry a data area that is not the standard fill pattern.`,
      'Every conventional ping writes the same fixed incrementing bytes after its timestamp, and repeats them unchanged in every echo. Data that differs from that pattern is data somebody put there.',
      'A non-standard ping utility, an MTU or path probe, or a monitoring tool that stamps its own marker into the payload all produce data areas that do not match the conventional fill.',
      { weight: 1.3 },
    ));
  } else {
    observations.push(observation(
      `Every echo ${where} carries the conventional fill pattern (${focus.count} echo${focus.count === 1 ? '' : 's'}).`,
      'The data area matches what an ordinary ping sends, so no content statistic has anything to work with here.',
      'A channel hiding in a header field rather than the data area — the Echo Identifier, for instance — leaves the payload looking exactly like this.',
      { triggered: false },
    ));
  }

  if (sizeAnomaly > 0.2) {
    observations.push(observation(
      `Data areas average ${round(focus.avgDataBytes, 1)} bytes across ${focus.distinctSizes} distinct size${focus.distinctSizes === 1 ? '' : 's'}; the conventional sizes are ${STANDARD_PAYLOAD_BYTES} (Linux) and 32 (Windows).`,
      'Ping sends a fixed payload size for a whole session, so a varying or unusual size is a choice somebody made. This is a CONFORMANCE test, not a size-modulation test: it fires on any departure from the conventional sizes, including the constant non-standard size this module produces when it chunks a message. A channel that encoded its bits IN the size would be a different thing again — pattern P1, Size Modulation — and this module does not build one.',
      'Path-MTU discovery and diagnostic sweeps vary ping size deliberately, and some appliances health-check with their own size.',
      { weight: 0.7 },
    ));
  }

  if (enoughForRatios && distinctData > 0.6) {
    observations.push(observation(
      `${Math.round(distinctData * 100)}% of the data areas ${where} are unique.`,
      'A real ping session sends the same bytes over and over. Every echo carrying different content is the shape of a payload being streamed.',
      'A diagnostic tool that embeds a per-probe timestamp or counter deeper in the payload would also vary every echo.',
      { weight: 0.9 },
    ));
  }

  if (idChurn > 0.5) {
    observations.push(observation(
      `The Echo Identifier takes ${focus.distinctIdentifiers} values ${where}, and its low bit is near balanced (${round(focus.idLowBitBalance, 2)}).`,
      'One ping session normally holds one identifier for its whole run, so a low bit that behaves like a coin flip is at least odd.',
      'Two concurrent ping processes, a NAT remapping the identifier, or several short sessions in the window produce exactly this. This is a WEAK indicator and is scored as one — a single-bit identifier channel is close to invisible by design.',
      { weight: 0.35 },
    ));
  }

  if (metrics.peerCount > 1 && pivot && global.fillConformFraction > focus.fillConformFraction + 0.15) {
    observations.push(observation(
      `Across all ${metrics.peerCount} peers ${Math.round(global.fillConformFraction * 100)}% of echoes look conventional; for ${pivot.dest} alone it is ${Math.round(pivot.fillConformFraction * 100)}%.`,
      'A handful of loaded echoes inside a busy ping stream average away. Grouping by destination is what brings them back.',
      'Any host with one unusual ping peer shows this split; it says where to look, not what was found.',
      { weight: 0 },
    ));
  }

  const methods = [
    {
      key: 'fillConformance', name: 'Fill-pattern conformance',
      citation: 'Educational indicator (RFC 792 echo data is opaque; implementations use a fixed fill)',
      value: `${Math.round(focus.fillConformFraction * 100)}% conform`,
      interpretation: 'A structural test, not an entropy test. The conventional fill is an incrementing run of distinct bytes, so its entropy is already near maximal — entropy cannot separate it from payload, but predictability can.',
    },
    {
      key: 'sizeConformance', name: 'Payload-size conformance',
      citation: 'Educational indicator (conventional ping payload sizes: 56 bytes on Linux, 32 on Windows)',
      value: `${round(focus.avgDataBytes, 1)} B avg, ${focus.distinctSizes} distinct`,
      interpretation: 'Measures how far the payload sizes sit from the conventional ping sizes, so it fires on an unconventional CONSTANT size as readily as on a varying one — which is what this module produces, since its size is set by how much message was chunked in rather than by anything being encoded. Do not confuse it with pattern P1, Size Modulation, whose illustration in the survey reads "the covert channel uses the size of a header element or of a PDU to encode the hidden message". That is the contrast case: this lab builds no size-encoded channel, and switching padding on removes the size tell here without costing a single bit.',
    },
    {
      key: 'payloadRepetition', name: 'Data-area repetition',
      citation: 'Educational indicator',
      value: enoughForRatios ? `${Math.round(focus.distinctDataRatio * 100)}% unique` : `n/a (<${MIN_ECHOES} echoes)`,
      interpretation: 'Ordinary ping repeats one payload; a tunnel cannot. Suppressed below a handful of echoes, where a unique-ratio means nothing.',
    },
    {
      key: 'identifierStability', name: 'Echo Identifier stability',
      citation: 'RFC 792 (identifier/sequence semantics); RFC 5508 (NAT rewrites the identifier)',
      value: `${focus.distinctIdentifiers} identifier${focus.distinctIdentifiers === 1 ? '' : 's'}, low-bit balance ${round(focus.idLowBitBalance, 2)}`,
      interpretation: 'Weak by construction. A one-bit identifier channel is the ICMP twin of IP-ID parity — near-undetectable by any simple statistic, and destroyed for free by any NAT on the path.',
    },
  ];

  const score = weightedScore(contributions);
  return { metrics, methods, score, anomalyLevel: levelFromScore(score), observations, disclaimer: DISCLAIMER };
}
