/**
 * Does the extracted outline still fill the same pixels as the source?
 *
 * The union has to make a call about winding, nesting and self-crossings, and
 * on a strange enough input it can make the wrong one — silently, because the
 * output is still a perfectly valid path. So the CLI checks its own work: it
 * samples a grid, asks both the source contours and the emitted outline whether
 * each point is inside, and reports the disagreement.
 *
 * Cheap insurance. A wrong answer here is a logo that renders subtly wrong in
 * production and takes an afternoon to explain.
 */
import type { Point, Polygon, Ring } from './geometry';
import { boundsOf } from './geometry';

/** Nonzero winding number of `point` with respect to every ring given. */
export function windingNumber(point: Point, rings: Ring[]): number {
  let winding = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const side =
        (b[0] - a[0]) * (point[1] - a[1]) - (point[0] - a[0]) * (b[1] - a[1]);
      if (a[1] <= point[1]) {
        if (b[1] > point[1] && side > 0) winding += 1;
      } else if (b[1] <= point[1] && side < 0) winding -= 1;
    }
  }
  return winding;
}

export type Verification = {
  /** Fraction of sampled ink the outline gets wrong, 0–1. */
  mismatch: number;
  /** Grid edge used. */
  resolution: number;
};

export function verifyOutline(
  source: Ring[],
  outline: Polygon[],
  resolution: number,
): Verification {
  const rings = outline.flat();
  const { minX, minY, maxX, maxY } = boundsOf(source);
  // A margin keeps the samples off the outline itself, where both answers are
  // legitimately ambiguous.
  const padX = (maxX - minX) * 0.02 || 1;
  const padY = (maxY - minY) * 0.02 || 1;

  let inked = 0;
  let disagreed = 0;
  for (let i = 0; i < resolution; i += 1) {
    for (let j = 0; j < resolution; j += 1) {
      const point: Point = [
        minX - padX + ((i + 0.5) / resolution) * (maxX - minX + 2 * padX),
        minY - padY + ((j + 0.5) / resolution) * (maxY - minY + 2 * padY),
      ];
      const inSource = windingNumber(point, source) !== 0;
      const inOutline = windingNumber(point, rings) !== 0;
      if (inSource) inked += 1;
      if (inSource !== inOutline) disagreed += 1;
    }
  }

  return { mismatch: inked === 0 ? 0 : disagreed / inked, resolution };
}
