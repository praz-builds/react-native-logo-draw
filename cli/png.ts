/**
 * A PNG encoder and decoder, in about two hundred lines and no dependencies.
 *
 * `npx react-native-logo-draw icons` has to write real PNG files, and every
 * obvious way to do that — sharp, canvas, @resvg/resvg-js, skia-canvas — ships
 * a platform-specific native binary. This package promises `dependencies: {}`
 * and "works everywhere `npx` works"; a prebuilt `.node` for one libc on one
 * architecture breaks both.
 *
 * It turns out not to be a trade-off worth making. PNG's baseline is small:
 * an 8-bit non-interlaced truecolour image is a signature, three chunks, a
 * CRC-32 and one call to `node:zlib`. That is the whole format below.
 *
 * The decoder exists for the same reason the `extract` command verifies its own
 * outline: so the command can check what it actually wrote, from the bytes on
 * disk rather than from the buffer it hoped it encoded.
 */
import { deflateSync, inflateSync } from 'node:zlib';

/** 8 bits per channel, no palette, no interlace: RGB or RGBA. */
export type Raster = {
  width: number;
  height: number;
  /** 3 for opaque RGB, 4 for straight-alpha RGBA. */
  channels: 3 | 4;
  /** Row-major, `width * height * channels` bytes. */
  data: Uint8Array;
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPE = { 3: 2, 4: 6 } as const;

/* ── CRC-32 ─────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, tail]);
}

/* ── Filtering ──────────────────────────────────────────────────────────── */

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filter one row five ways and keep the cheapest.
 *
 * The minimum-sum-of-absolute-differences heuristic is the one the PNG spec
 * itself suggests, and on a flat-colour icon it is the difference between a
 * file of a few kilobytes and one of a few hundred: a run of identical pixels
 * filters to a run of zero bytes, which deflate collapses to nothing.
 *
 * Two shortcuts keep the search from costing five passes over every row. A row
 * identical to the one above it filters to all zeros under Up, which nothing
 * can beat, so it is taken immediately — that is most of the rows of an icon,
 * which is mostly flat background. And every other candidate abandons as soon
 * as its running cost passes the best one so far, which on an icon is almost
 * at once.
 */
const FILTER_ORDER = [2, 1, 4, 0, 3] as const; // Up, Sub, Paeth, None, Average

function filterRow(
  data: Uint8Array,
  offset: number,
  stride: number,
  channels: number,
  first: boolean,
): Buffer {
  const previous = offset - stride;
  const row = Buffer.allocUnsafe(stride + 1);

  if (!first) {
    let identical = true;
    for (let i = 0; i < stride; i += 1) {
      if (data[offset + i] !== data[previous + i]) {
        identical = false;
        break;
      }
    }
    if (identical) {
      row.fill(0);
      row[0] = 2;
      return row;
    }
  }

  let bestType = 0;
  let bestCost = Infinity;
  const bytes = new Uint8Array(stride);
  const best = new Uint8Array(stride);

  for (let k = 0; k < FILTER_ORDER.length; k += 1) {
    const type = FILTER_ORDER[k];
    let cost = 0;
    let abandoned = false;
    for (let i = 0; i < stride; i += 1) {
      const raw = data[offset + i];
      const a = i >= channels ? data[offset + i - channels] : 0;
      const b = first ? 0 : data[previous + i];
      const c = first || i < channels ? 0 : data[previous + i - channels];
      let value: number;
      switch (type) {
        case 0: value = raw; break;
        case 1: value = raw - a; break;
        case 2: value = raw - b; break;
        case 3: value = raw - ((a + b) >> 1); break;
        default: value = raw - paeth(a, b, c); break;
      }
      const byte = value & 0xff;
      bytes[i] = byte;
      cost += byte < 128 ? byte : 256 - byte;
      if (cost >= bestCost) {
        abandoned = true;
        break;
      }
    }
    if (!abandoned) {
      bestCost = cost;
      bestType = type;
      best.set(bytes);
    }
  }

  row[0] = bestType;
  row.set(best, 1);
  return row;
}

/* ── Encode ─────────────────────────────────────────────────────────────── */

export function encodePng(raster: Raster): Buffer {
  const { width, height, channels, data } = raster;
  if (data.length !== width * height * channels) {
    throw new Error(
      `raster is ${data.length} bytes, expected ${width * height * channels}`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = COLOUR_TYPE[channels];
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * channels;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(filterRow(data, y * stride, stride, channels, y === 0));
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Decode ─────────────────────────────────────────────────────────────── */

/**
 * Read back what we wrote. Deliberately narrow: 8-bit, non-interlaced, RGB or
 * RGBA — exactly the subset `encodePng` produces. Anything else is rejected
 * rather than half-understood.
 */
export function decodePng(file: Buffer): Raster {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let offset = 8;
  let header: { width: number; height: number; channels: 3 | 4 } | null = null;
  const idat: Buffer[] = [];

  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const payload = file.subarray(offset + 8, offset + 8 + length);
    const stated = file.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([file.subarray(offset + 4, offset + 8), payload])) !== stated) {
      throw new Error(`${type} chunk failed its CRC`);
    }

    if (type === 'IHDR') {
      const depth = payload[8];
      const colour = payload[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colour !== 2 && colour !== 6) throw new Error(`unsupported colour type ${colour}`);
      if (payload[12] !== 0) throw new Error('interlaced PNGs are not supported');
      header = {
        width: payload.readUInt32BE(0),
        height: payload.readUInt32BE(4),
        channels: colour === 2 ? 3 : 4,
      };
    } else if (type === 'IDAT') {
      idat.push(payload);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (!header) throw new Error('PNG has no IHDR');
  const { width, height, channels } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) {
    throw new Error(`PNG data is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  }

  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    const up = to - stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? data[to + i - channels] : 0;
      const b = y > 0 ? data[up + i] : 0;
      const c = y > 0 && i >= channels ? data[up + i - channels] : 0;
      switch (type) {
        case 0: data[to + i] = raw[from + i]; break;
        case 1: data[to + i] = (raw[from + i] + a) & 0xff; break;
        case 2: data[to + i] = (raw[from + i] + b) & 0xff; break;
        case 3: data[to + i] = (raw[from + i] + ((a + b) >> 1)) & 0xff; break;
        case 4: data[to + i] = (raw[from + i] + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`unknown filter type ${type} on row ${y}`);
      }
    }
  }

  return { width, height, channels, data };
}
