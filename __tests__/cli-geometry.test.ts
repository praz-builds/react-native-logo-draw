import { existsSync } from 'node:fs';
import {
  buildFromContours,
  signedArea,
  fitToBox,
  ringPerimeter,
  simplify,
  toPathData,
  unionContours,
  type Contour,
} from '../cli/geometry';
import { contoursFromCommands, contoursFromGlyph, type GlyphCommand } from '../cli/font';
import { contoursFromPathData, pathDataFrom } from '../cli/svg';
import {
  MAX_RING_POINTS,
  MAX_SPLIT_POINTS,
  hasSelfIntersection,
  splitSelfIntersections,
} from '../cli/selfintersect';
import balooK from './fixtures/baloo2-extrabold-K.json';

const square = (x: number, y: number, w: number, h: number): Contour => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

describe('the union step', () => {
  it('merges overlapping contours into one closed outline', () => {
    // Two squares crossing in a plus sign: four corners, one shape.
    const merged = unionContours([square(0, 4, 12, 4), square(4, 0, 4, 12)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toHaveLength(1); // outer ring only, no holes
    expect(ringPerimeter(merged[0][0])).toBeCloseTo(48, 6);
  });

  it('fills a contained ring wound the same way, as nonzero fill would', () => {
    const solid = unionContours([square(0, 0, 10, 10), square(3, 3, 4, 4)]);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toHaveLength(1);
    expect(ringPerimeter(solid[0][0])).toBeCloseTo(40, 6);
  });

  it('keeps a counter wound against its container, the way an "O" is drawn', () => {
    const counter = square(3, 3, 4, 4).slice().reverse();
    expect(Math.sign(signedArea(counter))).not.toBe(Math.sign(signedArea(square(0, 0, 10, 10))));

    const donut = unionContours([square(0, 0, 10, 10), counter]);
    expect(donut).toHaveLength(1);
    expect(donut[0]).toHaveLength(2); // outer ring plus one hole
    expect(ringPerimeter(donut[0][1])).toBeCloseTo(16, 6);
  });

  it('keeps a solid that sits inside a counter, the way a "B" bar does', () => {
    const counter = square(2, 2, 6, 6).slice().reverse();
    const bar = square(3, 4, 4, 2);
    const result = unionContours([square(0, 0, 10, 10), counter, bar]);

    // Largest-first application is what keeps the bar from being subtracted
    // away with the counter that contains it: a ring with a hole, and an
    // island floating in that hole.
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(2);
    expect(Math.abs(signedArea(result[0][1]))).toBeCloseTo(36, 6);
    expect(Math.abs(signedArea(result[1][0]))).toBeCloseTo(8, 6);
  });
});

describe('self-crossing contours', () => {
  it('splits a crossing into the loops it closes', () => {
    const bowtie: Contour = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    const loops = splitSelfIntersections(bowtie);
    expect(loops).toHaveLength(2);
    // Opposite windings, and together they still account for the whole thing.
    expect(Math.sign(signedArea(loops[0]))).not.toBe(Math.sign(signedArea(loops[1])));
    expect(loops.reduce((n, loop) => n + signedArea(loop), 0)).toBeCloseTo(
      signedArea(bowtie),
      6,
    );
  });

  it('paints both lobes of a crossing, the way nonzero fill does', () => {
    const bowtie: Contour = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    const result = buildFromContours([bowtie], {
      box: 100,
      fillPercent: 100,
      tolerance: 0,
      precision: 4,
      verify: 96,
    });
    // A lobe wound against the first one but sitting outside it is a second
    // shape, not a counter.
    expect(result.shapes).toBe(2);
    expect(result.verification?.mismatch).toBeLessThan(0.02);
  });

  it('leaves a simple ring exactly as it found it', () => {
    const loops = splitSelfIntersections(square(0, 0, 10, 10));
    expect(loops).toHaveLength(1);
    expect(ringPerimeter(loops[0])).toBeCloseTo(40, 6);
  });

  it('refuses to spin on a degenerate ring', () => {
    expect(splitSelfIntersections([[0, 0], [1, 1], [0, 0]])).toEqual([]);
  });
});

describe('fitting and simplifying', () => {
  it('centres the shape in the box at the requested fill', () => {
    const fitted = fitToBox([square(0, 0, 10, 10)], 100, 80);
    const xs = fitted[0].map(([x]) => x);
    const ys = fitted[0].map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(10, 6);
    expect(Math.max(...xs)).toBeCloseTo(90, 6);
    expect(Math.min(...ys)).toBeCloseTo(10, 6);
    expect(Math.max(...ys)).toBeCloseTo(90, 6);
  });

  it('keeps proportions on a non-square shape and margins the short axis', () => {
    const fitted = fitToBox([square(0, 0, 20, 10)], 100, 100);
    const xs = fitted[0].map(([x]) => x);
    const ys = fitted[0].map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(50, 6);
    expect(Math.min(...ys)).toBeCloseTo(25, 6);
  });

  it('drops flattening noise without moving the outline', () => {
    const noisy: Contour = [];
    for (let i = 0; i <= 100; i += 1) noisy.push([i, i % 2 === 0 ? 0 : 0.01]);
    const reduced = simplify(noisy, 0.1);
    expect(reduced).toHaveLength(2);
  });

  it('handles a ring far too long to recurse over', () => {
    const long: Array<[number, number]> = [];
    for (let i = 0; i < 20_000; i += 1) long.push([i, Math.sin(i / 500) * 10]);
    expect(() => simplify(long, 0.5)).not.toThrow();
  });
});

describe('path emission', () => {
  it('emits one closed subpath per ring, without the duplicated closing point', () => {
    const d = toPathData([[square(0, 0, 10, 10)]], 2);
    expect(d).toBe('M0,0L10,0L10,10L0,10Z');
  });

  it('rounds to the requested precision', () => {
    const d = toPathData([[square(0.123456, 0.987654, 1, 1)]], 1);
    expect(d.startsWith('M0.1,1L')).toBe(true);
  });
});

describe('SVG input', () => {
  it('pulls every path out of a document', () => {
    const svg = `<svg><path d="M0 0 L1 0"/><path d='M2 2 L3 2'/></svg>`;
    expect(pathDataFrom(svg)).toEqual(['M0 0 L1 0', 'M2 2 L3 2']);
  });

  it('accepts bare path data too', () => {
    expect(pathDataFrom('  M0 0 L1 1 Z ')).toEqual(['M0 0 L1 1 Z']);
  });

  it('resolves H and V shorthand against the current point', () => {
    const [contour] = contoursFromPathData(['M0 0 H10 V10 H0 Z'], 4);
    const merged = unionContours([contour]);
    expect(ringPerimeter(merged[0][0])).toBeCloseTo(40, 6);
  });

  it('unions a two-path icon the same way it unions a glyph', () => {
    const result = buildFromContours(
      contoursFromPathData(['M0 4 H12 V8 H0 Z', 'M4 0 H8 V12 H4 Z'], 8),
      { box: 100, fillPercent: 100, tolerance: 0, precision: 3, verify: 64 },
    );
    expect(result.shapes).toBe(1);
    expect(result.holes).toBe(0);
    expect(result.verification?.mismatch).toBeLessThan(0.01);
  });
});

/**
 * The acceptance test.
 *
 * Baloo 2 ExtraBold draws "K" as four overlapping unmerged contours. Filled it
 * renders perfectly, which is why nobody notices; stroke-traced it is four
 * disconnected rectangles with seams through the letter. If the union step ever
 * regresses, `sourceContours: 4 -> shapes: 1` is where it shows up first.
 */
describe('Baloo 2 ExtraBold "K"', () => {
  const contours = contoursFromCommands(balooK.commands as GlyphCommand[], 48);

  it('reads as four separate contours before the union', () => {
    expect(contours).toHaveLength(4);
  });

  it('unions into a single closed outline with no interior holes', () => {
    const result = buildFromContours(contours, {
      box: 100,
      fillPercent: 86,
      tolerance: 0.12,
      precision: 2,
    });

    expect(result.sourceContours).toBe(4);
    expect(result.shapes).toBe(1);
    expect(result.holes).toBe(0);
    // One subpath, and it closes.
    expect(result.path.match(/M/g)).toHaveLength(1);
    expect(result.path.endsWith('Z')).toBe(true);
    expect(result.viewBox).toBe('0 0 100 100');

    // The perimeter this exact glyph should produce at these settings.
    expect(result.length).toBeCloseTo(406.87, 1);
  });

  it('fills exactly the same area as the four contours it came from', () => {
    const result = buildFromContours(contours, {
      box: 100,
      fillPercent: 86,
      tolerance: 0.12,
      precision: 2,
      verify: 128,
    });
    expect(result.verification?.mismatch).toBeLessThan(0.005);
  });

  it('barely moves the perimeter when simplification is turned off', () => {
    const exact = buildFromContours(contours, {
      box: 100,
      fillPercent: 86,
      tolerance: 0,
      precision: 4,
    });
    // Simplification must remove points, not shape.
    expect(exact.length).toBeCloseTo(407.02, 1);
  });
});

/**
 * A closed ring sampled from a polar function. Not self-crossing unless the
 * radius is allowed to go negative, which is what `swing` past `radius` does.
 */
function polarRing(n: number, radius: number, swing: number, span = Math.PI * 2): Contour {
  const points: Contour = [];
  for (let i = 0; i < n; i += 1) {
    const a = (span * i) / n;
    const r = radius + swing * Math.cos(a);
    points.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  points.push([points[0][0], points[0][1]]);
  return points;
}

describe('the self-intersection screen', () => {
  const bowtie: Contour = [
    [0, 0],
    [10, 10],
    [10, 0],
    [0, 10],
    [0, 0],
  ];

  it('says no for shapes that do not cross, and yes for ones that do', () => {
    expect(hasSelfIntersection([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
    expect(hasSelfIntersection(polarRing(600, 30, 8).slice(0, -1))).toBe(false);
    expect(hasSelfIntersection(bowtie.slice(0, -1))).toBe(true);
    // A limaçon with an inner loop: the classic "lasso" a bowl is drawn as.
    expect(hasSelfIntersection(polarRing(600, 15, 32).slice(0, -1))).toBe(true);
  });

  it('is too small to matter below four points', () => {
    expect(hasSelfIntersection([])).toBe(false);
    expect(hasSelfIntersection([[0, 0], [1, 1], [2, 0]])).toBe(false);
  });

  /**
   * The screen exists to skip the walk, so it must never disagree with it. A
   * `false` has to mean the walk finds nothing — anything else is a wrong path
   * shipped silently.
   */
  it('never says no when the walk would have found a crossing', () => {
    const screenedSimple: string[] = [];
    const walkedSimple: string[] = [];
    let crossing = 0;
    for (let n = 6; n <= 90; n += 3) {
      for (let swing = 0; swing <= 40; swing += 5) {
        for (const span of [Math.PI * 2, Math.PI * 2 + 0.6]) {
          const label = `n=${n} swing=${swing} span=${span.toFixed(2)}`;
          const ring = polarRing(n, 20, swing, span);
          const points = ring.slice(0, -1);
          if (hasSelfIntersection(points)) {
            crossing += 1;
            continue;
          }
          screenedSimple.push(label);
          // The screen said no crossing. The walk must agree, which it does by
          // handing back exactly the ring it was given.
          const loops = splitSelfIntersections(ring);
          const untouched =
            loops.length === 1 &&
            JSON.stringify(loops[0]) === JSON.stringify([...points, points[0]]);
          if (untouched) walkedSimple.push(label);
        }
      }
    }
    expect(walkedSimple).toEqual(screenedSimple);
    // Both answers have to have occurred for this to have proved anything.
    expect(screenedSimple.length).toBeGreaterThan(20);
    expect(crossing).toBeGreaterThan(20);
  });

  it('leaves the split of a crossing contour exactly as it was', () => {
    const loops = splitSelfIntersections(bowtie);
    expect(loops).toHaveLength(2);
    expect(loops[0]).toEqual([
      [5, 5],
      [10, 10],
      [10, 0],
      [5, 5],
    ]);
  });

  /**
   * The screened path must be genuinely cheap, not merely correct — that is the
   * whole point of it. A 20,000-point simple ring is what a 400-curve logo
   * flattens to at the default --samples, and it used to be ~2s of walk.
   */
  it('screens a logo-sized simple contour in a fraction of a second', () => {
    const ring = polarRing(20_000, 30, 8);
    const started = Date.now();
    expect(splitSelfIntersections(ring)).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('the point caps', () => {
  it('refuses an absurd contour outright, and names the flag to change', () => {
    const ring = polarRing(MAX_RING_POINTS + 1, 30, 8);
    expect(() => splitSelfIntersections(ring)).toThrow(
      /200,001 points after flattening, over the 200,000 limit.*--samples/s,
    );
  });

  it('refuses to split a crossing contour that is too big to split', () => {
    // Past MAX_SPLIT_POINTS but well under MAX_RING_POINTS, and crossing.
    const ring = polarRing(MAX_SPLIT_POINTS + 1, 15, 32);
    expect(() => splitSelfIntersections(ring)).toThrow(
      /self-intersecting contour has 30,001 points.*30,000 limit.*--samples/s,
    );
  });

  it('lets a contour of the same size through when it does not cross', () => {
    const ring = polarRing(MAX_SPLIT_POINTS + 1, 30, 8);
    expect(splitSelfIntersections(ring)).toHaveLength(1);
  });
});

/**
 * The same check against the real font file, when one is available. Point
 * `LOGO_DRAW_TEST_FONT` at a .ttf whose "K" has overlapping contours.
 */
const fontPath = process.env.LOGO_DRAW_TEST_FONT;
const withFont = fontPath && existsSync(fontPath) ? describe : describe.skip;
withFont('against a real font file', () => {
  it('parses the glyph and unions it to one shape', () => {
    const result = buildFromContours(
      contoursFromGlyph(fontPath as string, 'K', { samples: 48 }),
      { box: 100, fillPercent: 86, tolerance: 0.12, precision: 2 },
    );
    expect(result.shapes).toBe(1);
    expect(result.holes).toBe(0);
    expect(result.length).toBeGreaterThan(0);
  });
});
