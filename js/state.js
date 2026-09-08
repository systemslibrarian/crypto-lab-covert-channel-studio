/**
 * state.js — a tiny central store with pub/sub.
 *
 * Holds the shared toy message, the deterministic seed, the active section, the
 * Sender/Receiver vs Defender view mode, and the per-channel control values.
 * Views subscribe and re-render when relevant state changes. No persistence,
 * no cookies, no network — the store lives only in memory for the session.
 */

import { MAX_MESSAGE_BYTES } from './utils/utf8.js';

export { MAX_MESSAGE_BYTES };

/** Displayed in the footer; keep in sync with package.json and CHANGELOG.md. */
export const VERSION = '1.3.0';

/** View modes (never labelled "attacker" — neutral, educational framing). */
export const VIEW_MODES = { SENDER: 'sender', DEFENDER: 'defender' };

/** Per-channel identity: `icon` is shown in the nav, and `css/views.css` scopes a
 *  matching `--accent` to each channel's `#sec-<id>`. Purely decorative — colour
 *  is never the only carrier of meaning anywhere in the exhibit. */
export const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Start' },
  { id: 'dns', label: 'DNS Channel', group: 'Channels', icon: '\u{1F310}' },
  { id: 'icmp', label: 'ICMP Echo Channel', group: 'Channels', icon: '\u{1F4E1}' },
  { id: 'timing', label: 'Timing Channel', group: 'Channels', icon: '\u{23F1}' },
  { id: 'storage', label: 'Storage Channel', group: 'Channels', icon: '\u{1F4E6}' },
  { id: 'ordering', label: 'Packet-Order Channel', group: 'Channels', icon: '\u{1F500}' },
  { id: 'http', label: 'HTTP Header Channel', group: 'Channels', icon: '\u{1F4E8}' },
  { id: 'hopping', label: 'Protocol-Hopping Channel', group: 'Channels', icon: '\u{1F503}' },
  { id: 'stego', label: 'Image Steganography', group: 'Channels', icon: '\u{1F5BC}' },
  { id: 'metadata', label: 'Library Records', group: 'Channels', icon: '\u{1F4DA}' },
  { id: 'physical', label: 'Air-Gap Optical Channel', group: 'Channels', icon: '\u{1F4A1}' },
  { id: 'cache', label: 'Shared-Cache Channel', group: 'Channels', icon: '\u{1F5C4}' },
  { id: 'detection', label: 'Detection Console', group: 'Analysis' },
  { id: 'challenge', label: 'Detection Challenge', group: 'Analysis' },
  { id: 'validation', label: 'Detector Validation Lab', group: 'Analysis' },
  { id: 'warden', label: 'Active Warden Lab', group: 'Analysis' },
  { id: 'compare', label: 'Compare Channels', group: 'Analysis' },
  { id: 'atlas', label: 'Carrier Atlas', group: 'Analysis' },
  { id: 'srm', label: 'Shared-Resource Matrix', group: 'Analysis' },
  { id: 'concepts', label: 'What Makes a Channel Covert?', group: 'Analysis' },
  { id: 'defense', label: 'Defensive Takeaways', group: 'Analysis' },
  { id: 'glossary', label: 'Glossary', group: 'Reference' },
  { id: 'quiz', label: 'Knowledge Check', group: 'Reference' },
];

const DEFAULT_STATE = {
  section: 'overview',
  viewMode: VIEW_MODES.SENDER,
  message: 'HELLO',
  seed: 'crypto-lab',
  channels: {
    dns: {
      labelLength: 12, requestCount: 18, coverCount: 24,
      intervalMs: 600, jitterMs: 0, lossProb: 0, cache: false,
    },
    timing: {
      shortMs: 100, longMs: 300, jitterMs: 0, noiseMs: 0, lossProb: 0, thresholdMs: 200,
    },
    storage: {
      field: 'ipid-parity',
      middlebox: { nat: false, headerNormalization: false, proxy: false, firewall: false, reorder: false },
    },
    ordering: { reorderProb: 0 },
    icmp: {
      field: 'payload', chunkBytes: 2, padToStandard: false,
      // `clampBytes` null means the normaliser is off; `clampAt` remembers the
      // size it clamps to, so toggling it off and on again keeps the setting.
      clampBytes: null, clampAt: 12, rewriteId: false, lossProb: 0, coverCount: 20,
    },
    hopping: { lossProb: 0, blocked: [], coverCount: 30 },
    http: { coverCount: 20, normalize: false },
    metadata: { minimize: false },
    physical: {
      onLux: 220, offLux: 40, ambientNoise: 0, ambientDrift: 0,
      samplesPerBit: 8, symbolMs: 20, thresholdLux: 130,
    },
    cache: {
      probe: 'flush-reload', hitCycles: 80, missCycles: 300,
      jitterCycles: 0, evictionProb: 0, repetitions: 1, thresholdCycles: 190,
    },
  },
  stego: { message: 'hi', carrier: 'sample', step: 8 },
};

let state = structuredClone(DEFAULT_STATE);
const listeners = new Set();

export function getState() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(meta) { for (const fn of [...listeners]) fn(state, meta); }

/** Shallow-merge a patch into the top-level state. */
export function setState(patch, meta = {}) {
  state = { ...state, ...patch };
  emit(meta);
}

export function setSection(section) {
  if (state.section === section) return;
  setState({ section }, { reason: 'section' });
}

export function setViewMode(viewMode) {
  setState({ viewMode }, { reason: 'viewMode' });
}

export function setMessage(message) {
  setState({ message }, { reason: 'message' });
}

export function setSeed(seed) {
  setState({ seed }, { reason: 'seed' });
}

/** Update one control value for a channel. */
export function setChannelParam(channel, key, value) {
  state = {
    ...state,
    channels: {
      ...state.channels,
      [channel]: { ...state.channels[channel], [key]: value },
    },
  };
  emit({ reason: 'param', channel, key });
}

/** Toggle one protocol in the hopping channel's egress allow-list. */
export function setHoppingBlocked(protocolKey, blocked) {
  const cur = state.channels.hopping.blocked;
  const next = blocked ? [...new Set([...cur, protocolKey])] : cur.filter((k) => k !== protocolKey);
  setChannelParam('hopping', 'blocked', next);
}

/** Toggle/set one middlebox flag on the storage channel. */
export function setMiddlebox(key, value) {
  const storage = state.channels.storage;
  state = {
    ...state,
    channels: {
      ...state.channels,
      storage: { ...storage, middlebox: { ...storage.middlebox, [key]: value } },
    },
  };
  emit({ reason: 'middlebox', key });
}

/** Update a stego sub-value. */
export function setStego(key, value) {
  state = { ...state, stego: { ...state.stego, [key]: value } };
  emit({ reason: 'stego', key });
}

/** Reset one channel's controls to defaults. */
export function resetChannel(channel) {
  state = {
    ...state,
    channels: { ...state.channels, [channel]: structuredClone(DEFAULT_STATE.channels[channel]) },
  };
  emit({ reason: 'reset', channel });
}

export function getChannelParams(channel) {
  return state.channels[channel];
}

/** Effective params for a channel run: merges the shared seed in. */
export function channelRunParams(channel) {
  return { ...state.channels[channel], seed: `${state.seed}:${channel}` };
}
