/**
 * channels/stego.js — SIMPLE least-significant-bit image steganography.
 *
 * Steganography is related to covert channels but is not the same thing: here
 * the CARRIER (an image) still looks like ordinary content, and the hidden
 * payload rides in the least-significant bits of the pixel values, where the
 * eye cannot see a change of +/- 1 in a colour component.
 *
 * The functions operate on a plain "raster" object:
 *   { data: Uint8ClampedArray|Uint8Array, width: number, height: number }
 * which is structurally identical to a canvas ImageData, so the browser view
 * can pass ImageData straight in, while the Node tests can build a raster from
 * a bare typed array.
 *
 * Deliberately small payloads only. Pure logic (no DOM, no canvas).
 */

import { textToUtf8Bytes, tryUtf8BytesToText } from '../utils/utf8.js';

/** Bits reserved for the length header (max payload 65535 bytes, but we cap far lower). */
const HEADER_BITS = 16;

/** How many payload bytes a raster can hold (3 usable channels per pixel). */
export function capacityBytes(raster) {
  const usableChannels = raster.width * raster.height * 3;
  return Math.max(0, Math.floor((usableChannels - HEADER_BITS) / 8));
}

/** Map a usable-channel slot index to a data[] index (skips the alpha byte). */
function slotToDataIndex(slot) {
  const pixel = Math.floor(slot / 3);
  const channel = slot % 3; // 0=R, 1=G, 2=B (alpha skipped)
  return pixel * 4 + channel;
}

function cloneRaster(raster) {
  return {
    width: raster.width,
    height: raster.height,
    data: Uint8ClampedArray.from(raster.data),
  };
}

/**
 * Embed a toy text message into the LSBs of a raster.
 * @param {Object} raster  { data, width, height }
 * @param {string} message
 * @returns {{ raster:Object, usedBits:number, capacityBits:number, messageBytes:number }}
 */
export function embedMessage(raster, message) {
  const bytes = textToUtf8Bytes(message);
  const capBytes = capacityBytes(raster);
  if (bytes.length > capBytes) {
    throw new Error(`Message needs ${bytes.length} bytes; image holds ${capBytes}.`);
  }
  if (bytes.length > 0xffff) throw new Error('Message too long for 16-bit header.');

  const out = cloneRaster(raster);
  const bits = [];
  // 16-bit big-endian length header.
  for (let k = HEADER_BITS - 1; k >= 0; k--) bits.push((bytes.length >> k) & 1);
  // Payload bytes, MSB first.
  for (const byte of bytes) {
    for (let k = 7; k >= 0; k--) bits.push((byte >> k) & 1);
  }

  for (let slot = 0; slot < bits.length; slot++) {
    const idx = slotToDataIndex(slot);
    out.data[idx] = (out.data[idx] & 0xfe) | bits[slot];
  }

  return {
    raster: out,
    usedBits: bits.length,
    capacityBits: raster.width * raster.height * 3,
    messageBytes: bytes.length,
  };
}

/**
 * Extract a hidden message from a raster (reverse of {@link embedMessage}).
 * @param {Object} raster
 * @returns {{ text:string|null, bytes:Uint8Array, length:number, valid:boolean }}
 */
export function extractMessage(raster) {
  const usableChannels = raster.width * raster.height * 3;
  if (usableChannels < HEADER_BITS) {
    return { text: null, bytes: new Uint8Array(0), length: 0, valid: false };
  }
  // Read header.
  let length = 0;
  for (let slot = 0; slot < HEADER_BITS; slot++) {
    const bit = raster.data[slotToDataIndex(slot)] & 1;
    length = (length << 1) | bit;
  }
  const available = Math.floor((usableChannels - HEADER_BITS) / 8);
  const valid = length <= available;
  const readLen = Math.min(length, available);
  const bytes = new Uint8Array(readLen);
  for (let i = 0; i < readLen; i++) {
    let byte = 0;
    for (let k = 0; k < 8; k++) {
      const slot = HEADER_BITS + i * 8 + k;
      byte = (byte << 1) | (raster.data[slotToDataIndex(slot)] & 1);
    }
    bytes[i] = byte;
  }
  return { text: tryUtf8BytesToText(bytes), bytes, length, valid };
}

/**
 * Produce a raster that visualises one bit plane of one (or all) channels,
 * stretched to full black/white so the otherwise-invisible plane becomes
 * visible. The LSB plane of a stego image looks like noise where data was
 * written and structured where it was not.
 * @param {Object} raster
 * @param {number} [plane] 0=LSB .. 7=MSB
 * @param {'all'|'r'|'g'|'b'} [channel]
 * @returns {Object} raster
 */
export function bitPlane(raster, plane = 0, channel = 'all') {
  const out = cloneRaster(raster);
  const mask = 1 << plane;
  const chOffset = { r: 0, g: 1, b: 2 };
  for (let p = 0; p < raster.width * raster.height; p++) {
    const base = p * 4;
    let value;
    if (channel === 'all') {
      // Combine the plane across R,G,B: white if any set.
      const r = (raster.data[base] & mask) ? 1 : 0;
      const g = (raster.data[base + 1] & mask) ? 1 : 0;
      const b = (raster.data[base + 2] & mask) ? 1 : 0;
      value = (r || g || b) ? 255 : 0;
      out.data[base] = out.data[base + 1] = out.data[base + 2] = value;
    } else {
      const off = chOffset[channel] ?? 0;
      value = (raster.data[base + off] & mask) ? 255 : 0;
      out.data[base] = out.data[base + 1] = out.data[base + 2] = value;
    }
    out.data[base + 3] = 255;
  }
  return out;
}

/**
 * Amplified per-pixel difference between two rasters (must share dimensions).
 * @param {Object} a
 * @param {Object} b
 * @param {{ amplify?:number }} [opts]
 * @returns {Object} raster
 */
export function differenceImage(a, b, opts = {}) {
  const amplify = opts.amplify ?? 40;
  const out = cloneRaster(a);
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c] - b.data[i + c]) * amplify;
      out.data[i + c] = Math.min(255, d);
    }
    out.data[i + 3] = 255;
  }
  return out;
}

/**
 * Count how many pixel channels differ between two rasters (a quick way to show
 * "how many bits were touched").
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function changedChannels(a, b) {
  let n = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (i % 4 === 3) continue; // skip alpha
    if (a.data[i] !== b.data[i]) n++;
  }
  return n;
}

/**
 * Simulate a lossy transformation (e.g. re-compression) by quantising each
 * colour channel to the nearest multiple of `step`. Because LSB data lives in
 * the very bits quantisation discards, this reliably destroys the payload —
 * the point being that a channel must survive whatever transforms its carrier
 * undergoes.
 * @param {Object} raster
 * @param {{ step?:number }} [opts]
 * @returns {Object} raster
 */
export function simulateLossyDegradation(raster, opts = {}) {
  const step = Math.max(2, opts.step ?? 8);
  const out = cloneRaster(raster);
  for (let i = 0; i < out.data.length; i++) {
    if (i % 4 === 3) continue;
    out.data[i] = Math.min(255, Math.round(out.data[i] / step) * step);
  }
  return out;
}
