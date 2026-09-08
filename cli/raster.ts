/**
 * Scanline polygon fill, in pure JavaScript.
 *
 * The `extract` pipeline already turns a glyph or an SVG into non-overlapping
 * polygons with real counters (see `geometry.ts`). Turning those into pixels is
 * the last thing standing between this package and an app-icon generator, and
 * the whole library of options for doing it — sharp, canvas, resvg, skia —
 * ships a native binary per platform. So: scanlines.
 *
 * Coverage is computed exactly along x and supersampled along y. For each
 * output row the rasteriser takes `SUPERSAMPLE` horizontal slices, intersects
 * each with every edge, walks the crossings accumulating a nonzero winding
 * number, and adds each covered span's *exact* overlap with each pixel column.
 * That is the same answer a 4x supersampled render downsampled with a box
 * filter would give along y, and a strictly better one along x, where the
 * analytic span makes a vertical edge land on an exact fraction rather than a
 * quantised one.
 *
 * Nonzero winding, not even-odd, because that is what `unionContours` emits:
 * a shell and its counters wound against each other. It is what keeps the hole
 * in an "O" and both holes in an "8" open.
 */
import type { Polygon } from './geometry';

/**
 * Vertical slices per output pixel row.
 *
 * The reference implementation this ports rendered at 4x and downsampled with
 * LANCZOS. 4 slices with exact horizontal coverage matches that on the axis
 * where it matters and beats it on the other; going higher costs a linear pass
 * over the edge list for no visible gain.
 */
export const SUPERSAMPLE = 4;

/**
 * Edges, flattened.
 *
 * The inner loop of a rasteriser runs once per edge per scanline slice — tens
 * of millions of times for a 1024px icon — so it holds no objects and
 * allocates nothing. `coords` packs x0, y0, x1, y1 per edge with y0 < y1 always,
 * and `dirs` carries the winding direction the original edge ran in.
 */
type Edges = { count: number; coords: Float64Array; dirs: Int8Array };

function edgesOf(polygons: Polygon[]): Edges {
  let count = 0;
  for (let p = 0; p < polygons.length; p += 1) {
    const polygon = polygons[p];
    for (let r = 0; r < polygon.length; r += 1) count += polygon[r].length - 1;
  }

  const coords = new Float64Array(count * 4);
  const dirs = new Int8Array(count);
  let n = 0;
  for (let p = 0; p < polygons.length; p += 1) {
    const polygon = polygons[p];
    for (let r = 0; r < polygon.length; r += 1) {
      const ring = polygon[r];
      for (let i = 0; i < ring.length - 1; i += 1) {
        const ax = ring[i][0];
        const ay = ring[i][1];
        const bx = ring[i + 1][0];
        const by = ring[i + 1][1];
        // A horizontal edge is crossed by no scanline; it only ever adds a
        // duplicate crossing at a vertex.
        if (ay === by) continue;
        const up = ay < by;
        coords[n * 4] = up ? ax : bx;
        coords[n * 4 + 1] = up ? ay : by;
        coords[n * 4 + 2] = up ? bx : ax;
        coords[n * 4 + 3] = up ? by : ay;
        dirs[n] = up ? 1 : -1;
        n += 1;
      }
    }
  }
  return { count: n, coords, dirs };
}

/** Add a span's exact per-column overlap to one row of coverage. */
function addSpan(
  coverage: Float64Array,
  rowStart: number,
  width: number,
  from: number,
  to: number,
  weight: number,
): void {
  const start = from < 0 ? 0 : from;
  const end = to > width ? width : to;
  if (end <= start) return;

  const first = Math.floor(start);
  const lastCell = Math.ceil(end) - 1;
  const last = lastCell > width - 1 ? width - 1 : lastCell;
  for (let x = first; x <= last; x += 1) {
    const right = end < x + 1 ? end : x + 1;
    const left = start > x ? start : x;
    if (right > left) coverage[rowStart + x] += (right - left) * weight;
  }
}

/**
 * Rasterise `polygons` (already in pixel coordinates, y down) into per-pixel
 * coverage in `[0, 1]`.
 */
export function coverageOf(
  polygons: Polygon[],
  width: number,
  height: number,
  supersample: number = SUPERSAMPLE,
): Float64Array {
  const coverage = new Float64Array(width * height);
  const { count, coords, dirs } = edgesOf(polygons);
  if (count === 0) return coverage;

  const weight = 1 / supersample;
  // Reused across every slice: a scanline can cross every edge at most once.
  const xs = new Float64Array(count);
  const ds = new Int8Array(count);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let slice = 0; slice < supersample; slice += 1) {
      const sy = y + (slice + 0.5) / supersample;

      let n = 0;
      for (let e = 0; e < count; e += 1) {
        const y0 = coords[e * 4 + 1];
        const y1 = coords[e * 4 + 3];
        // Half-open in y, so a vertex shared by two edges is counted once.
        if (sy < y0 || sy >= y1) continue;
        const x0 = coords[e * 4];
        const x1 = coords[e * 4 + 2];
        // Insertion sort as we go: a scanline crosses a letterform a handful
        // of times, and this beats allocating and sorting an array per slice.
        const x = x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0);
        const d = dirs[e];
        let j = n - 1;
        while (j >= 0 && xs[j] > x) {
          const tx = xs[j];
          const td = ds[j];
          xs[j + 1] = tx;
          ds[j + 1] = td;
          j -= 1;
        }
        xs[j + 1] = x;
        ds[j + 1] = d;
        n += 1;
      }
      if (n < 2) continue;

      let winding = 0;
      let spanStart = 0;
      for (let i = 0; i < n; i += 1) {
        const before = winding;
        winding += ds[i];
        if (before === 0 && winding !== 0) spanStart = xs[i];
        else if (before !== 0 && winding === 0) {
          addSpan(coverage, rowStart, width, spanStart, xs[i], weight);
        }
      }
    }
  }

  // Slivers of floating-point error above 1 would encode as alpha 256.
  for (let i = 0; i < coverage.length; i += 1) {
    if (coverage[i] > 1) coverage[i] = 1;
    else if (coverage[i] < 0) coverage[i] = 0;
  }
  return coverage;
}

export type Rgb = readonly [number, number, number];

/** Coverage -> straight-alpha RGBA, every pixel carrying `colour`. */
export function toRgba(coverage: Float64Array, colour: Rgb): Uint8Array {
  const data = new Uint8Array(coverage.length * 4);
  for (let i = 0; i < coverage.length; i += 1) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = Math.round(coverage[i] * 255);
  }
  return data;
}

/** Coverage -> opaque RGB, `colour` composited over `background`. */
export function toRgb(coverage: Float64Array, colour: Rgb, background: Rgb): Uint8Array {
  const data = new Uint8Array(coverage.length * 3);
  for (let i = 0; i < coverage.length; i += 1) {
    const a = coverage[i];
    for (let c = 0; c < 3; c += 1) {
      data[i * 3 + c] = Math.round(background[c] + (colour[c] - background[c]) * a);
    }
  }
  return data;
}

export type InkBox = {
  minX: number;
  minY: number;
  /** Exclusive. */
  maxX: number;
  /** Exclusive. */
  maxY: number;
};

/** Bounding box of every pixel with any coverage at all, or `null` if blank. */
export function inkBox(
  coverage: Float64Array,
  width: number,
  height: number,
): InkBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Anything that survives rounding to a nonzero alpha byte counts as ink;
      // anything below it is invisible and must not drag the centre around.
      if (Math.round(coverage[y * width + x] * 255) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

/**
 * Distance from `centre` to the furthest inked pixel corner.
 *
 * The furthest *corner*, not the furthest centre: a pixel that is painted at
 * all occupies its whole cell on screen, and the Android safe circle is a claim
 * about what survives a mask, not about pixel centres.
 */
export function maxInkRadius(
  coverage: Float64Array,
  width: number,
  height: number,
  centre: readonly [number, number],
): number {
  let furthest = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (Math.round(coverage[y * width + x] * 255) === 0) continue;
      const dx = Math.max(Math.abs(x - centre[0]), Math.abs(x + 1 - centre[0]));
      const dy = Math.max(Math.abs(y - centre[1]), Math.abs(y + 1 - centre[1]));
      const distance = Math.hypot(dx, dy);
      if (distance > furthest) furthest = distance;
    }
  }
  return furthest;
}
