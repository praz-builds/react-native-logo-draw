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
 * O(n^2) in the number of points, which for a flattened glyph contour is a few
 * hundred thousand comparisons: far below anything worth optimising for a
 * build-time tool.
 */
import type { Point, Ring } from './geometry';

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
 * Decompose `ring` into simple closed loops.
 *
 * The input may be open or closed; every loop that comes back is closed (first
 * point repeated at the end). A ring that does not cross itself comes back as
 * itself, so this is safe to run over everything.
 */
export function splitSelfIntersections(ring: Ring): Ring[] {
  const points = ring.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
  const count = points.length;
  if (count < 3) return [];

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
