/**
 * Split a self-intersecting ring into simple closed loops.
 *
 * Outline formats let a single contour cross itself, and designers use it: a
 * bowl drawn as one "lasso" — round the outside, cross over, round the counter
 * — is one contour whose nonzero winding produces a hole. A boolean library
 * handed that ring has to guess, and the guess is usually the wrong one (the
 * counter fills in).
 *
 * So the ring is decomposed first. Each crossing pops the loop it closed off a
 * stack, which leaves a set of simple loops whose winding directions carry the
 * same information the crossings did — and simple loops are exactly what a
 * boolean library is good at.
 *
 * Cost
 * ----
 * The walk is O(n^2) in points, and "a flattened glyph contour" badly
 * understates n. `--samples` defaults to 48, so every curve in the source
 * becomes 48 points before the walk starts. An ordinary traced logo of 400
 * cubic segments arrives here as 19,201 points, which is 184 MILLION
 * segment-crossing tests, not the "few hundred thousand" this comment used to
 * claim — measured at 2.1s of pure walk inside a 3.7s command that has printed
 * nothing yet. The growth is quadratic, so 200,000 points is 2*10^10 tests and
 * the command may as well have hung. Nothing about that input is hostile; it is
 * just a detailed logo at the default flags.
 *
 * The saving grace is that almost no contour actually crosses itself. So the
 * ring is screened first by a sweep over x (`hasSelfIntersection`), and only a
 * ring that really does cross pays for the walk. That screen uses the identical
 * crossing predicate, so it cannot miss anything the walk would have found; a
 * false "maybe" merely falls through to the walk and produces the same answer.
 * Same 19,201-point logo, measured: 2.1s of walk becomes 19ms of sweep.
 *
 * A ring that both crosses itself and is enormous still has no cheap answer, so
 * there are caps — see MAX_RING_POINTS and MAX_SPLIT_POINTS. They fail with an
 * instruction rather than spinning.
 */
import type { Point, Ring } from './geometry';

/**
 * Refuse any contour larger than this outright.
 *
 * The screen is near-linear, but everything downstream (union, winding checks,
 * simplification) still walks these points several times, and a contour this
 * size is a mistake upstream — nothing traced by hand reaches it. Measured:
 * 200,000 points takes the screen well under a second, so this cap is not
 * protecting the screen. It is protecting the user from a command that would
 * take minutes to tell them their `--samples` is too high.
 */
export const MAX_RING_POINTS = 200_000;

/**
 * Refuse the quadratic walk above this.
 *
 * Measured on the built CLI, with a contour whose crossing is only discovered
 * at the very end — the worst case, because the stack stays full: 19,201 points
 * is about 2s of walk, and 30,001 points is about 5s inside a 7.5s command.
 * Quadratic growth makes 60,000 a 20s wait and 200,000 several minutes.
 *
 * 30,000 is where the wait stops being explainable. It is deliberately not
 * lower: a 400-curve source at the default `--samples 48` lands at 19,201, and
 * this cap must not reject work that succeeds today.
 */
export const MAX_SPLIT_POINTS = 30_000;

/** Parametric position along `p1->p2` where it crosses `p3->p4`, if it does. */
function crossing(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point,
): { t: number; point: Point } | null {
  const d1x = p2[0] - p1[0];
  const d1y = p2[1] - p1[1];
  const d2x = p4[0] - p3[0];
  const d2y = p4[1] - p3[1];
  const denominator = d1x * d2y - d1y * d2x;
  if (denominator === 0) return null; // parallel or collinear: no clean crossing

  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denominator;
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denominator;

  // Strictly interior on both segments. Shared endpoints are not crossings,
  // and treating them as such would spin the walk in place.
  const EPSILON = 1e-9;
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  if (u <= EPSILON || u >= 1 - EPSILON) return null;

  return { t, point: [p1[0] + t * d1x, p1[1] + t * d1y] };
}

/**
 * Does the closed ring `points` cross itself anywhere?
 *
 * A sweep over x. Segments are visited in order of their left edge; a segment
 * is compared only against those still open at that x, and an open segment is
 * dropped as soon as its right edge is behind the sweep. On the shapes this
 * tool sees — glyph outlines, traced logos, anything whose points are locally
 * ordered around a perimeter — the open set stays small, so the scan is
 * near-linear instead of all-pairs.
 *
 * The predicate is `crossing`, the same one the walk uses, so a `false` here is
 * a guarantee the walk would find nothing. Adjacent segments are compared too
 * and cost nothing: they meet at a shared endpoint, which `crossing` rejects
 * (t=1 / u=0), and if they were collinear the determinant is zero and it
 * rejects them again. So this answers exactly the question the walk asks.
 *
 * A contrived contour can still defeat the sweep — 200,000 long overlapping
 * horizontals all open at once is all-pairs again — so the comparisons are
 * budgeted. Running out returns `true`, meaning "cannot rule it out", which is
 * always safe: the caller falls through to the exact walk, which either splits
 * the ring correctly or refuses it with a message. The budget is a large
 * multiple of what real contours use; see the test that measures it.
 *
 * Exported for the tests, which need to prove the screen and the walk agree.
 */
export function hasSelfIntersection(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  let budget = 64 * n + 1_000_000;

  // Segment i runs points[i] -> points[(i + 1) % n]; the ring is closed.
  const minX = new Float64Array(n);
  const maxX = new Float64Array(n);
  const minY = new Float64Array(n);
  const maxY = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    minX[i] = a[0] < b[0] ? a[0] : b[0];
    maxX[i] = a[0] < b[0] ? b[0] : a[0];
    minY[i] = a[1] < b[1] ? a[1] : b[1];
    maxY[i] = a[1] < b[1] ? b[1] : a[1];
  }

  const order = new Int32Array(n);
  for (let i = 0; i < n; i += 1) order[i] = i;
  // Int32Array#sort with a comparator is a plain numeric sort, not the
  // stringifying one Array#sort defaults to.
  order.sort((a, b) => minX[a] - minX[b]);

  let open: number[] = [];
  for (let s = 0; s < n; s += 1) {
    const i = order[s];
    const left = minX[i];

    // Close everything whose right edge the sweep has passed. Compacting costs
    // the same order as the comparisons it saves, so it is done every step
    // rather than amortised behind a heap.
    if (open.length > 0) {
      const kept: number[] = [];
      for (let k = 0; k < open.length; k += 1) {
        if (maxX[open[k]] >= left) kept.push(open[k]);
      }
      open = kept;
    }

    const ai = points[i];
    const bi = points[(i + 1) % n];
    budget -= open.length;
    if (budget < 0) return true; // out of budget: cannot rule it out
    for (let k = 0; k < open.length; k += 1) {
      const j = open[k];
      // Cheap rejection before the divide.
      if (maxY[j] < minY[i] || minY[j] > maxY[i]) continue;
      if (crossing(ai, bi, points[j], points[(j + 1) % n])) return true;
    }
    open.push(i);
  }

  return false;
}

/**
 * Decompose `ring` into simple closed loops.
 *
 * The input may be open or closed; every loop that comes back is closed (first
 * point repeated at the end). A ring that does not cross itself comes back as
 * itself, so this is safe to run over everything.
 *
 * Throws with an actionable message if the ring is too large to process — see
 * MAX_RING_POINTS and MAX_SPLIT_POINTS.
 */
export function splitSelfIntersections(ring: Ring): Ring[] {
  const points = ring.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
  const count = points.length;
  if (count < 3) return [];

  if (count > MAX_RING_POINTS) {
    throw new Error(
      `a contour has ${count.toLocaleString('en-US')} points after flattening, ` +
        `over the ${MAX_RING_POINTS.toLocaleString('en-US')} limit. ` +
        'Lower --samples, or simplify the source before extracting.',
    );
  }

  // The overwhelmingly common case: the contour is simple, and the walk below
  // would only rebuild it point for point.
  if (!hasSelfIntersection(points)) {
    return [[...points, points[0]]];
  }

  if (count > MAX_SPLIT_POINTS) {
    throw new Error(
      `a self-intersecting contour has ${count.toLocaleString('en-US')} points ` +
        `after flattening, over the ${MAX_SPLIT_POINTS.toLocaleString('en-US')} limit ` +
        'for splitting one. Lower --samples, or simplify the source before extracting.',
    );
  }

  const loops: Ring[] = [];
  const stack: Point[] = [points[0]];
  let current: Point = points[0];
  let index = 1;
  // A crossing can only ever remove points from the stack, so the walk cannot
  // run forever; the cap is belt-and-braces against a pathological input.
  let guard = count * 4 + 64;

  while (index <= count && guard > 0) {
    guard -= 1;
    const next = points[index % count];

    let best: { t: number; at: number; point: Point } | null = null;
    // The last stack edge shares `current`, so it can never be a crossing.
    for (let k = 0; k < stack.length - 2; k += 1) {
      const hit = crossing(current, next, stack[k], stack[k + 1]);
      if (hit && (best === null || hit.t < best.t)) {
        best = { t: hit.t, at: k, point: hit.point };
      }
    }

    if (best) {
      // Everything walked since stack[at + 1] is now a closed loop of its own.
      loops.push([best.point, ...stack.slice(best.at + 1), best.point]);
      stack.length = best.at + 1;
      stack.push(best.point);
      current = best.point;
      continue; // the rest of this segment still has to be walked
    }

    stack.push(next);
    current = next;
    index += 1;
  }

  // The walk closes on itself, so the final stack entry duplicates the first.
  if (stack.length > 1) stack.pop();
  if (stack.length >= 3) loops.push([...stack, stack[0]]);

  return loops.filter((loop) => loop.length >= 4);
}
