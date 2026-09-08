/**
 * The geometry the CLI exists for: flatten, union, simplify, measure.
 *
 * Why the union step exists
 * -------------------------
 * Display faces routinely draw one letter as SEVERAL OVERLAPPING UNMERGED
 * CONTOURS. Baloo 2 ExtraBold's "K" is four of them: stem-top, stem-bottom,
 * arm, leg. Filled with nonzero winding that renders perfectly, which is
 * exactly why nobody ever notices. Stroke-traced, it renders as four
 * disconnected rectangles with seams straight through the letterform — useless
 * for a draw-on animation.
 *
 * So the contours are flattened to polygons, boolean-unioned into one closed
 * outline, and lightly simplified. What comes out is a single traceable
 * perimeter (plus genuine counters, for letters like "O" that really do have
 * holes).
 *
 * The perimeter is computed here because React Native has no
 * `SVGGeometryElement.getTotalLength()`; the dash animation needs the number as
 * a constant baked next to the path.
 */
import * as polygonClipping from 'polygon-clipping';
import { splitSelfIntersections } from './selfintersect';
import { verifyOutline, windingNumber, type Verification } from './verify';

export type Point = [number, number];
/** An open or closed sequence of points. */
export type Contour = Point[];
/** A closed ring: first and last point are equal. */
export type Ring = Point[];
/** One outer ring followed by zero or more hole rings. */
export type Polygon = Ring[];

type Clipping = {
  union: (...polys: Polygon[]) => Polygon[];
  difference: (...polys: Polygon[]) => Polygon[];
};

// polygon-clipping ships both a CJS namespace and a default export depending on
// how it is resolved; take whichever one actually has the operations.
const clipping: Clipping = (
  (polygonClipping as unknown as { union?: unknown }).union
    ? polygonClipping
    : (polygonClipping as unknown as { default: Clipping }).default
) as unknown as Clipping;

/* ── Flattening ─────────────────────────────────────────────────────────── */

export function quadraticAt(p0: Point, c: Point, p1: Point, u: number): Point {
  const v = 1 - u;
  return [
    v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0],
    v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1],
  ];
}

export function cubicAt(p0: Point, c1: Point, c2: Point, p1: Point, u: number): Point {
  const v = 1 - u;
  return [
    v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p1[0],
    v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p1[1],
  ];
}

/**
 * A pen that accumulates flattened contours.
 *
 * Curves are sampled at a fixed rate rather than adaptively: the simplify pass
 * downstream removes whatever that oversamples, and a fixed rate keeps the
 * output reproducible across runs and platforms.
 */
export class FlattenPen {
  private contours: Contour[] = [];
  private current: Contour = [];

  constructor(private readonly samples: number) {}

  moveTo(p: Point): void {
    this.flushContour();
    this.current = [p];
  }

  lineTo(p: Point): void {
    if (this.current.length === 0) this.current = [p];
    else this.current.push(p);
  }

  quadraticTo(c: Point, p: Point): void {
    const from = this.currentPoint();
    if (!from) return this.lineTo(p);
    for (let i = 1; i <= this.samples; i += 1) {
      this.current.push(quadraticAt(from, c, p, i / this.samples));
    }
  }

  cubicTo(c1: Point, c2: Point, p: Point): void {
    const from = this.currentPoint();
    if (!from) return this.lineTo(p);
    for (let i = 1; i <= this.samples; i += 1) {
      this.current.push(cubicAt(from, c1, c2, p, i / this.samples));
    }
  }

  closePath(): void {
    this.flushContour();
  }

  /** Every contour drawn so far, in draw order. */
  result(): Contour[] {
    this.flushContour();
    return this.contours;
  }

  private currentPoint(): Point | undefined {
    return this.current[this.current.length - 1];
  }

  private flushContour(): void {
    if (this.current.length > 2) this.contours.push(this.current);
    this.current = [];
  }
}

/* ── Transform ──────────────────────────────────────────────────────────── */

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(contours: Contour[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Scale contours to occupy `fillPercent` of a `box`-by-`box` viewBox, centred.
 *
 * The uniform scale is taken from the longer axis, so the shape keeps its
 * proportions and the leftover space becomes optical margin on the short one.
 */
export function fitToBox(
  contours: Contour[],
  box: number,
  fillPercent: number,
): Contour[] {
  const { minX, minY, maxX, maxY } = boundsOf(contours);
  const width = maxX - minX;
  const graphicHeight = maxY - minY;
  const longest = Math.max(width, graphicHeight);
  if (!Number.isFinite(longest) || longest <= 0) return contours;

  const scale = (box * (fillPercent / 100)) / longest;
  const dx = (box - width * scale) / 2 - minX * scale;
  const dy = (box - graphicHeight * scale) / 2 - minY * scale;
  return contours.map((contour) =>
    contour.map(([x, y]): Point => [x * scale + dx, y * scale + dy]),
  );
}

/* ── Union ──────────────────────────────────────────────────────────────── */

function closeRing(contour: Contour): Ring {
  const ring = contour.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

/** Twice the signed area of a closed ring. Sign tells you its winding. */
export function signedArea(ring: Ring): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return total / 2;
}

/**
 * Boolean-union every contour into non-overlapping polygons, keeping counters.
 *
 * This is the step that turns "four rectangles that happen to look like a K"
 * into one closed outline you can run a pen along.
 *
 * Two things make it more than one call to a boolean library.
 *
 * First, crossings. A contour is allowed to cross itself, and designers use
 * that: a bowl drawn as one lasso — round the outside, over the crossing,
 * round the counter — is a single contour whose *winding* produces the hole.
 * Hand that to a boolean library and the counter fills in. So every contour is
 * split into simple loops first, which turns winding into geometry.
 *
 * Second, holes. Outlines encode a counter as a loop wound against its
 * container, so the loops cannot all be unioned: that would swallow the middle
 * of an "O". Instead they are applied largest-first, unioning the ones wound
 * like the outermost loop and subtracting the ones wound against it. Largest
 * first is what makes nesting come out right — a "B" is outer, then its
 * counter, then the bar that sits inside that counter and has to survive it.
 *
 * That reasoning assumes nonzero fill, which is what fonts and essentially
 * every exported SVG use. Run `--verify` (on by default) and the CLI will tell
 * you if a particular source disagrees.
 */
function containedIn(ring: Ring, polygons: Polygon[]): boolean {
  // A point just inside the ring: the midpoint of its first edge is on the
  // ring itself, which is strictly inside anything that contains the ring.
  const a = ring[0];
  const b = ring[1];
  if (!a || !b) return false;
  const probe: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return windingNumber(probe, polygons.flat()) !== 0;
}

export function unionContours(contours: Contour[]): Polygon[] {
  const rings = contours
    .filter((contour) => contour.length > 2)
    .flatMap((contour) => splitSelfIntersections(closeRing(contour)));
  if (rings.length === 0) return [];

  const ordered = rings
    .map((ring) => ({ ring, area: signedArea(ring) }))
    .filter(({ area }) => area !== 0)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  if (ordered.length === 0) return [];

  const outerSign = Math.sign(ordered[0].area);
  let result: Polygon[] = [];

  for (const { ring, area } of ordered) {
    const loop: Polygon = [ring];
    if (Math.sign(area) === outerSign) {
      result =
        result.length === 0
          ? clipping.union(loop)
          : clipping.union(result as unknown as Polygon, loop);
    } else if (result.length === 0) {
      // Nothing to cut out of yet.
      continue;
    } else if (containedIn(ring, result)) {
      result = clipping.difference(result as unknown as Polygon, loop);
    } else {
      // Wound the other way but sitting outside everything so far: a separate
      // lobe of a self-crossing outline, not a counter. Nonzero fill paints it.
      result = clipping.union(result as unknown as Polygon, loop);
    }
  }

  return result;
}

/* ── Simplify ───────────────────────────────────────────────────────────── */

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker, iterative so a 3000-point ring cannot blow the stack. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (tolerance <= 0 || points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let farthest = -1;
    let maxDistance = tolerance;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/* ── Measure & emit ─────────────────────────────────────────────────────── */

/** Perimeter of one ring, assuming its first and last points coincide. */
export function ringPerimeter(ring: Ring): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    total += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
  }
  return total;
}

/** Perimeter of every ring in every polygon — the number the dash array needs. */
export function totalPerimeter(polygons: Polygon[]): number {
  let total = 0;
  for (const polygon of polygons) for (const ring of polygon) total += ringPerimeter(ring);
  return total;
}

/** Round to `precision` decimals, the same way the emitted path string does. */
export function roundTo(n: number, precision: number): number {
  return Number(n.toFixed(precision));
}

/** Snap every coordinate to the emitted precision, so measurement matches output. */
export function quantize(polygons: Polygon[], precision: number): Polygon[] {
  return polygons.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]): Point => [roundTo(x, precision), roundTo(y, precision)]),
    ),
  );
}

export function toPathData(polygons: Polygon[], precision: number): string {
  const round = (n: number): string => {
    const value = roundTo(n, precision);
    // A signed zero is noise in a path string.
    return Object.is(value, -0) ? '0' : String(value);
  };
  const subpaths: string[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      // The closing point is implied by Z; emitting it duplicates a vertex.
      const points = ring.slice(0, -1);
      if (points.length < 3) continue;
      subpaths.push(
        `M${points.map(([x, y]) => `${round(x)},${round(y)}`).join('L')}Z`,
      );
    }
  }
  return subpaths.join('');
}

export type ExtractResult = {
  path: string;
  length: number;
  viewBox: string;
  /** How many contours the source drew before the union merged them. */
  sourceContours: number;
  /** How many separate shapes survived the union. */
  shapes: number;
  /** How many counters (holes) the union found. */
  holes: number;
  /** Points in the emitted path. */
  points: number;
  /** Result of the self-check, or `null` when it was skipped. */
  verification: Verification | null;
};

export type BuildOptions = {
  box: number;
  fillPercent: number;
  tolerance: number;
  precision: number;
  /** Grid edge for the self-check. `0` skips it. */
  verify?: number;
};

/**
 * Flatten-fit-union-simplify-measure, in one pass.
 *
 * The perimeter is measured on the *simplified* rings, because those are the
 * rings that get stroked. Measuring the unsimplified ones would leave the dash
 * array a fraction long and the mark visibly unfinished at the end of the
 * trace.
 */
export function buildFromContours(
  contours: Contour[],
  { box, fillPercent, tolerance, precision, verify = 0 }: BuildOptions,
): ExtractResult {
  const fitted = fitToBox(contours, box, fillPercent);
  const merged = unionContours(fitted);
  const simplified: Polygon[] = merged.map((polygon) =>
    polygon.map((ring) => {
      const reduced = simplify(ring, tolerance);
      // Simplification must never open a ring.
      return closeRing(reduced);
    }),
  );
  // Measure the coordinates that actually get emitted, not the ones before
  // rounding — otherwise the dash array is a hair long and the trace never
  // quite lands.
  const emitted = quantize(simplified, precision);

  return {
    verification:
      verify > 0
        ? verifyOutline(
            fitted.map((contour) => closeRing(contour)),
            emitted,
            verify,
          )
        : null,
    path: toPathData(emitted, precision),
    length: roundTo(totalPerimeter(emitted), 2),
    viewBox: `0 0 ${box} ${box}`,
    sourceContours: contours.length,
    shapes: emitted.length,
    holes: emitted.reduce((n, polygon) => n + Math.max(0, polygon.length - 1), 0),
    points: emitted.reduce(
      (n, polygon) => n + polygon.reduce((m, ring) => m + ring.length - 1, 0),
      0,
    ),
  };
}
