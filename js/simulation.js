/**
 * simulation.js — deterministic orchestration layer.
 *
 * Ties the channel encoders/decoders to the matching detectors and returns
 * normalised results, so the per-channel views and the unified Detection
 * Console can share one code path. Encoding logic lives in /channels and
 * /detectors; this file only wires them together. Pure logic (no DOM).
 */

import { textToUtf8Bytes } from './utils/utf8.js';
import { bytesToBits, formatBits } from './utils/bits.js';

import { simulateDnsRun } from './channels/dns.js';
import { simulateTimingFromText } from './channels/timing.js';
import { simulateStorageRun } from './channels/storage.js';
import { simulateOrderingRun } from './channels/ordering.js';
import { simulateHttpRun } from './channels/http.js';
import { simulatePhysicalRun } from './channels/physical.js';
import { simulateCacheRun } from './channels/cache.js';

import { analyzeDns } from './detectors/dnsDetector.js';
import { analyzeTiming } from './detectors/timingDetector.js';
import { analyzeStorage } from './detectors/storageDetector.js';
import { analyzeOrdering } from './detectors/orderingDetector.js';
import { analyzeHttp } from './detectors/httpDetector.js';
import { analyzePhysical } from './detectors/physicalDetector.js';
import { analyzeCache } from './detectors/cacheDetector.js';

export const CHANNELS = ['dns', 'timing', 'storage', 'ordering', 'http', 'physical', 'cache'];

/**
 * The text -> bytes -> bits pipeline shown in the Overview (and reused as a
 * header strip in each channel view).
 * @param {string} text
 */
export function buildMessagePipeline(text) {
  const bytes = textToUtf8Bytes(text);
  const bits = bytesToBits(bytes);
  return {
    text,
    bytes,
    bits,
    byteHex: [...bytes].map((b) => b.toString(16).padStart(2, '0')),
    byteDecimal: [...bytes],
    bitString: formatBits(bits, 8),
    charCount: [...text].length,
    byteCount: bytes.length,
    bitCount: bits.length,
  };
}

/**
 * Run one channel end-to-end and normalise the outcome. `params` are the
 * channel-specific control values from the UI.
 *
 * @param {'dns'|'timing'|'storage'|'ordering'|'http'|'physical'|'cache'} channel
 * @param {string} message
 * @param {Object} [params]
 * @returns {{ channel:string, message:string, raw:Object, detector:Object,
 *   decodedText:(string|null), bitErrors:number, bitErrorRate:number,
 *   summary:Object }}
 */
export function runChannel(channel, message, params = {}) {
  switch (channel) {
    case 'dns': return runDns(message, params);
    case 'timing': return runTiming(message, params);
    case 'storage': return runStorage(message, params);
    case 'ordering': return runOrdering(message, params);
    case 'http': return runHttp(message, params);
    case 'physical': return runPhysical(message, params);
    case 'cache': return runCache(message, params);
    default: throw new Error(`Unknown channel: ${channel}`);
  }
}

function runDns(message, params) {
  const raw = simulateDnsRun(message, params);
  // A defender sees the whole observed stream; run the indicator on it.
  const detector = analyzeDns(raw.mixed.filter((q) => q.forwarded !== false));
  return normalise('dns', message, raw, detector, {
    decodedText: raw.decoded.text,
    bitErrors: null,
    bitErrorRate: raw.decoded.complete ? 0 : null,
    summary: {
      queries: raw.covertQueries.length,
      cover: raw.coverQueries.length,
      bitsPerQuery: raw.meta.bitsPerQuery,
      complete: raw.decoded.complete,
    },
  });
}

function runTiming(message, params) {
  const raw = simulateTimingFromText(message, params);
  const detector = analyzeTiming(raw.observedGaps, { decoderConfidence: raw.confidence });
  return normalise('timing', message, raw, detector, {
    decodedText: raw.recoveredText,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: {
      bits: raw.bits.length,
      confidence: raw.confidence,
      lost: raw.lostCount,
    },
  });
}

function runStorage(message, params) {
  const raw = simulateStorageRun(message, params);
  const detector = analyzeStorage(raw.processedPackets, raw.field);
  return normalise('storage', message, raw, detector, {
    decodedText: raw.processedDecode.text,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: {
      field: raw.field,
      packets: raw.cleanPackets.length,
    },
  });
}

function runOrdering(message, params) {
  const raw = simulateOrderingRun(message, params);
  const detector = analyzeOrdering(raw.pairs);
  return normalise('ordering', message, raw, detector, {
    decodedText: raw.recoveredText,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: {
      pairs: raw.pairs.length,
      reorderProb: raw.reorderProb,
    },
  });
}

function runHttp(message, params) {
  const raw = simulateHttpRun(message, params);
  const observed = raw.normalize ? raw.processedRequests : raw.covertRequests;
  const detector = analyzeHttp(observed);
  return normalise('http', message, raw, detector, {
    decodedText: raw.decoded.text,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: { requests: raw.covertRequests.length, bitsPerRequest: raw.meta.bitsPerRequest },
  });
}

function runPhysical(message, params) {
  const raw = simulatePhysicalRun(message, params);
  // A defender sees the medium, not the payload: the matched-filter levels.
  const detector = analyzePhysical(raw.filteredLevels, { decoderConfidence: raw.confidence });
  return normalise('physical', message, raw, detector, {
    decodedText: raw.recoveredText,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: {
      bits: raw.bits.length,
      confidence: raw.confidence,
      snrDb: raw.snrDb,
      predictedBer: raw.predictedBer,
    },
  });
}

function runCache(message, params) {
  const raw = simulateCacheRun(message, params);
  const detector = analyzeCache(raw.latencies, {
    decoderConfidence: raw.confidence, probe: raw.probe,
  });
  return normalise('cache', message, raw, detector, {
    decodedText: raw.recoveredText,
    bitErrors: raw.bitErrors,
    bitErrorRate: raw.bitErrorRate,
    summary: {
      probe: raw.probe,
      bits: raw.bits.length,
      evicted: raw.evictedCount,
      predictedBer: raw.predictedBer,
    },
  });
}

function normalise(channel, message, raw, detector, extra) {
  return {
    channel,
    message,
    raw,
    detector,
    decodedText: extra.decodedText,
    bitErrors: extra.bitErrors,
    bitErrorRate: extra.bitErrorRate,
    summary: extra.summary,
  };
}
