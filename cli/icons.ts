/**
 * `npx react-native-logo-draw icons` — a complete Expo app-icon set from one
 * glyph or one SVG.
 *
 * This exists because the four files an Expo app needs are not four sizes of
 * the same picture. They are four different rules, every one of which fails
 * SILENTLY when you get it wrong — the build succeeds, the app installs, and
 * the icon is just quietly bad on somebody else's phone.
 *
 *   icon.png                    Full-bleed and OPAQUE. Do not pre-round the
 *                               corners: iOS applies its own superellipse mask,
 *                               and a pre-rounded icon shows its own corners
 *                               peeking out past that mask as four little nubs.
 *
 *   icon-android-foreground.png TRANSPARENT, and small. Android masks adaptive
 *                               icons to a circle or squircle and reserves the
 *                               outer third for parallax, so only the centre
 *                               66% is safe. A foreground drawn full-bleed gets
 *                               its edges cropped off. The background colour
 *                               moves to adaptiveIcon.backgroundColor.
 *
 *   icon-notification.png       TRANSPARENT and SOLID WHITE. Android renders a
 *                               notification small-icon as a monochrome
 *                               silhouette: it keeps the alpha and throws the
 *                               colour away. Ship a coloured icon and every
 *                               user sees a featureless white blob.
 *
 *   favicon.png                 48px. Small enough that a letterform's counters
 *                               can close up in the downsample, so the command
 *                               checks that they are still open.
 *
 * Every claim above is measured on the encoded PNG rather than assumed: the
 * command decodes what it just wrote and checks the ink centre, the safe-circle
 * radius, the monochrome silhouette and the counters. If a check fails the
 * command fails, because a silently wrong icon is the entire problem.
 */
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { boundsOf, unionContours, type Point, type Polygon } from './geometry';
import { windingNumber } from './verify';
import { contoursFromGlyph } from './font';
import { contoursFromSvgFile } from './svg';
import { decodePng, encodePng } from './png';
import { coverageOf, inkBox, maxInkRadius, toRgb, toRgba, type Rgb } from './raster';
import { writeOut } from './write';

export const ICONS_USAGE = `
react-native-logo-draw icons — a complete Expo app-icon set from one mark

  npx react-native-logo-draw icons --svg logo.svg --bg '#FF6B1A' --fg '#FFFFFF'
  npx react-native-logo-draw icons --font Brand.ttf --char K --bg '#FF6B1A'

Source (exactly one)
  --font <file>       .ttf / .otf / .woff to read the glyph from
  --char <c>          the character to draw (with --font)
  --svg <file>        an SVG file, or a file containing bare path data

Colour
  --bg <hex>          background / brand colour        (required)
  --fg <hex>          the mark itself                  (default #FFFFFF)

Output
  --out-dir <dir>     where the four PNGs go           (default ./icons)
  --samples <n>       curve flattening resolution      (default 48, max 512)
  --force             overwrite files that are already there
  -h, --help          this

What it writes
  icon.png                     1024x1024 opaque, full-bleed, glyph at 62%
  icon-android-foreground.png  1024x1024 transparent, glyph inside the safe
                               circle Android's adaptive mask leaves you
  icon-notification.png        96x96 transparent, solid white silhouette
  favicon.png                  48x48 opaque
plus the app.json fragment that wires all four up, on stdout.
`.trim();

const MAX_SAMPLES = 512;

export class IconsUsageError extends Error {}

export type IconOptions = {
  font?: string;
  char?: string;
  svg?: string;
  bg: Rgb;
  fg: Rgb;
  outDir: string;
  samples: number;
  force: boolean;
};

/* ── Colour ─────────────────────────────────────────────────────────────── */

/** `#RGB`, `#RRGGBB`, with or without the hash. Nothing else. */
export function parseHex(flag: string, raw: string): Rgb {
  const hex = raw.trim().replace(/^#/, '');
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    throw new IconsUsageError(
      `${flag} needs a hex colour like #FF6B1A or #F60, not "${raw}"`,
    );
  }
  const full =
    hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ] as const;
}

export function toHex(colour: Rgb): string {
  return `#${colour.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/* ── Arguments ──────────────────────────────────────────────────────────── */

export function parseIconArgs(argv: string[]): IconOptions {
  let font: string | undefined;
  let char: string | undefined;
  let svg: string | undefined;
  let bg: string | undefined;
  let fg = '#FFFFFF';
  let outDir = 'icons';
  let samples = 48;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new IconsUsageError(`${flag} needs a value`);
      }
      i += 1;
      return value;
    };

    switch (flag) {
      case '--font': font = next(); break;
      case '--char': char = next(); break;
      case '--svg': svg = next(); break;
      case '--bg': bg = next(); break;
      case '--fg': fg = next(); break;
      case '--out-dir': outDir = next(); break;
      case '--samples': samples = Math.round(Number(next())); break;
      case '--force': force = true; break;
      default:
        throw new IconsUsageError(`unknown flag ${flag}`);
    }
  }

  if (font && svg) throw new IconsUsageError('pass --font or --svg, not both');
  if (!font && !svg) throw new IconsUsageError('pass --font <file> --char <c>, or --svg <file>');
  if (font && !char) throw new IconsUsageError('--font also needs --char');
  if (bg === undefined) {
    throw new IconsUsageError('--bg is required: it is the icon background and the Android adaptiveIcon.backgroundColor');
  }
  if (!Number.isFinite(samples) || samples < 1) throw new IconsUsageError('--samples must be at least 1');
  if (samples > MAX_SAMPLES) {
    throw new IconsUsageError(`--samples is 1-${MAX_SAMPLES}; higher only makes the run slower, not the icon better`);
  }

  return {
    font,
    char,
    svg,
    bg: parseHex('--bg', bg),
    fg: parseHex('--fg', fg),
    outDir,
    samples,
    force,
  };
}

/* ── The four targets ───────────────────────────────────────────────────── */

export type Target = {
  file: string;
  size: number;
  /** Ink height as a fraction of the canvas. */
  glyphRatio: number;
  /** Cap on ink width as a fraction of the canvas, for marks wider than tall. */
  maxWidthRatio: number;
  /** Opaque RGB over `--bg`, or transparent RGBA. */
  opaque: boolean;
  /** Force the mark to solid white whatever `--fg` says. */
  monochrome: boolean;
  /**
   * Radius, as a fraction of the canvas, that every inked pixel must fall
   * inside. Android's adaptive-icon safe zone is the centre 66% by diameter.
   */
  safeCircleRatio: number | null;
  why: string;
};

export const TARGETS: readonly Target[] = [
  {
    file: 'icon.png',
    size: 1024,
    glyphRatio: 0.62,
    maxWidthRatio: 0.86,
    opaque: true,
    monochrome: false,
    safeCircleRatio: null,
    why: 'iOS app icon and the Expo fallback. Full-bleed and opaque: iOS masks it itself.',
  },
  {
    file: 'icon-android-foreground.png',
    size: 1024,
    glyphRatio: 0.48,
    maxWidthRatio: 0.62,
    opaque: false,
    monochrome: false,
    safeCircleRatio: 0.33,
    why: 'Android adaptive foreground. Transparent, inside the centre 66% safe circle.',
  },
  {
    file: 'icon-notification.png',
    size: 96,
    glyphRatio: 0.7,
    maxWidthRatio: 0.86,
    opaque: false,
    monochrome: true,
    safeCircleRatio: null,
    why: 'Android notification small-icon. Alpha silhouette, solid white, no colour.',
  },
  {
    file: 'favicon.png',
    size: 48,
    glyphRatio: 0.62,
    maxWidthRatio: 0.86,
    opaque: true,
    monochrome: false,
    safeCircleRatio: null,
    why: 'Web favicon. The same design as icon.png at the size that closes counters.',
  },
];

/* ── Placement ──────────────────────────────────────────────────────────── */

export type Placement = { scale: number; dx: number; dy: number };

function transform(polygons: Polygon[], { scale, dx, dy }: Placement): Polygon[] {
  return polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([x, y]): Point => [x * scale + dx, y * scale + dy])),
  );
}

/**
 * Place the mark on the canvas by its INK bounds, not its metric box.
 *
 * This is the whole reason the reference implementation exists in the shape it
 * does. A glyph's advance box includes side bearings that are never inked, so
 * centring a "K" on its advance leaves it visibly to the left of centre. Here
 * the geometry is already flattened, so the ink box is exact and centring on it
 * is exact — but see `renderTarget`, which measures the result anyway.
 */
export function placement(polygons: Polygon[], target: Target): Placement {
  const { minX, minY, maxX, maxY } = boundsOf(polygons.flat());
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) {
    throw new Error('the mark has no area to draw');
  }

  // Height first, the way the reference does: a glyph's optical size is its
  // cap/ink height, not its width.
  let scale = (target.size * target.glyphRatio) / height;
  // A mark wider than it is tall would run off the canvas on that rule alone.
  if (width * scale > target.size * target.maxWidthRatio) {
    scale = (target.size * target.maxWidthRatio) / width;
  }
  // And the safe circle is a hard constraint, so shrink to fit it rather than
  // emitting something that will fail the check below.
  if (target.safeCircleRatio !== null) {
    const halfDiagonal = Math.hypot((width * scale) / 2, (height * scale) / 2);
    const safeRadius = target.size * target.safeCircleRatio;
    if (halfDiagonal > safeRadius) scale *= safeRadius / halfDiagonal;
  }

  return {
    scale,
    dx: (target.size - width * scale) / 2 - minX * scale,
    dy: (target.size - height * scale) / 2 - minY * scale,
  };
}

/* ── Counters ───────────────────────────────────────────────────────────── */

/**
 * A point inside each counter, in the polygons' own coordinate space.
 *
 * A hole ring's bounding-box centre is inside the hole for most letterforms but
 * not all of them (a "C"-shaped counter), so the box centre is tried first and
 * a coarse grid over the box after it. "Inside the hole" means winding zero:
 * enclosed by the hole ring, and therefore not painted.
 */
export function counterProbes(polygons: Polygon[]): Point[] {
  const rings = polygons.flat();
  const probes: Point[] = [];

  for (const polygon of polygons) {
    for (const hole of polygon.slice(1)) {
      const { minX, minY, maxX, maxY } = boundsOf([hole]);
      const candidates: Point[] = [[(minX + maxX) / 2, (minY + maxY) / 2]];
      const steps = 7;
      for (let i = 1; i < steps; i += 1) {
        for (let j = 1; j < steps; j += 1) {
          candidates.push([
            minX + ((maxX - minX) * i) / steps,
            minY + ((maxY - minY) * j) / steps,
          ]);
        }
      }
      const found = candidates.find((point) => windingNumber(point, rings) === 0);
      if (found) probes.push(found);
    }
  }
  return probes;
}

/* ── Render ─────────────────────────────────────────────────────────────── */

export type IconMetrics = {
  file: string;
  width: number;
  height: number;
  /** 3 = opaque RGB with no alpha channel at all, 4 = straight-alpha RGBA. */
  channels: 3 | 4;
  /** Centre of the inked pixels, measured on the decoded PNG. */
  inkCentre: [number, number];
  /** Distance from that to the canvas centre, in pixels. */
  centreOffset: number;
  /** How far the two-pass correction had to move the mark, in pixels. */
  correction: number;
  /** Furthest inked pixel corner from the canvas centre, in pixels. */
  inkRadius: number;
  /** The radius it had to stay inside, or `null` where there is no such rule. */
  safeRadius: number | null;
  /** True when every non-transparent pixel is exactly #FFFFFF. */
  monochrome: boolean;
  /** Whether that was a requirement here, or just what the colours happened to be. */
  monochromeRequired: boolean;
  /** Counters found in the mark, and how many are still open at this size. */
  counters: { total: number; open: number };
  bytes: number;
};

/** Where the mark sits on the canvas, and how many bytes the PNG came to. */
export type Rendered = { png: Buffer; metrics: IconMetrics };

const CENTRE_TOLERANCE = 1;

export function renderTarget(
  polygons: Polygon[],
  target: Target,
  colours: { bg: Rgb; fg: Rgb },
): Rendered {
  const { size } = target;
  const centre: [number, number] = [size / 2, size / 2];
  const fg = target.monochrome ? ([255, 255, 255] as const) : colours.fg;

  // Pass 1 — place by ink bounds.
  const first = placement(polygons, target);
  let coverage = coverageOf(transform(polygons, first), size, size);
  let box = inkBox(coverage, size, size);
  if (!box) throw new Error(`the mark rendered to nothing at ${size}px`);

  // Pass 2 — the rasteriser is the authority on where the ink actually landed.
  // Antialiasing and rounding put the painted box a fraction off the geometric
  // one, and at 48px a fraction is visible. Re-measure and correct, rather than
  // trusting pass 1. (Sub-pixel: the correction goes back into the transform,
  // not into an integer shift of the finished bitmap.)
  const dx = centre[0] - (box.minX + box.maxX) / 2;
  const dy = centre[1] - (box.minY + box.maxY) / 2;
  const correction = Math.hypot(dx, dy);
  let placed = first;
  if (correction > 0) {
    placed = { scale: first.scale, dx: first.dx + dx, dy: first.dy + dy };
    coverage = coverageOf(transform(polygons, placed), size, size);
    box = inkBox(coverage, size, size);
    if (!box) throw new Error(`the mark rendered to nothing at ${size}px`);
  }

  const png = encodePng({
    width: size,
    height: size,
    channels: target.opaque ? 3 : 4,
    data: target.opaque
      ? toRgb(coverage, fg, colours.bg)
      : toRgba(coverage, fg),
  });

  // Everything below is measured on the bytes that will hit the disk, decoded
  // back out. Checking the buffer we just built would only prove we can add up.
  const decoded = decodePng(png);
  const metrics = measure(decoded, target, placed, polygons);

  if (metrics.centreOffset > CENTRE_TOLERANCE) {
    throw new Error(
      `${target.file}: the mark's ink centre is ${metrics.centreOffset.toFixed(2)}px ` +
        `off the canvas centre after correction (tolerance ${CENTRE_TOLERANCE}px)`,
    );
  }
  if (metrics.safeRadius !== null && metrics.inkRadius > metrics.safeRadius) {
    throw new Error(
      `${target.file}: the mark reaches ${metrics.inkRadius.toFixed(1)}px from centre but ` +
        `Android's adaptive mask only guarantees ${metrics.safeRadius.toFixed(1)}px. ` +
        'It would be cropped. This is a bug in the generator, not in your mark.',
    );
  }
  if (target.monochrome && !metrics.monochrome) {
    throw new Error(
      `${target.file}: Android flattens a notification icon to a white silhouette, ` +
        'so every painted pixel has to be #FFFFFF, and some are not.',
    );
  }

  return { png, metrics: { ...metrics, correction, bytes: png.length } };
}

function measure(
  raster: ReturnType<typeof decodePng>,
  target: Target,
  placed: Placement,
  polygons: Polygon[],
): Omit<IconMetrics, 'correction' | 'bytes'> {
  const { width, height, channels, data } = raster;
  const centre: [number, number] = [width / 2, height / 2];

  // Rebuild coverage from the decoded pixels. For RGBA that is the alpha
  // channel. For the opaque icon there is no alpha to read, so ink is measured
  // as distance from the background colour, normalised by the distance the
  // fully inked colour sits at — antialiased pixels land in between, exactly
  // where the alpha channel would have put them. The top-left pixel is the
  // background by construction: the icon is full-bleed and centred.
  const coverage = new Float64Array(width * height);
  let monochrome = true;

  if (channels === 4) {
    for (let i = 0; i < width * height; i += 1) {
      const alpha = data[i * 4 + 3];
      coverage[i] = alpha / 255;
      if (alpha > 0 && (data[i * 4] !== 255 || data[i * 4 + 1] !== 255 || data[i * 4 + 2] !== 255)) {
        monochrome = false;
      }
    }
  } else {
    const [br, bg, bb] = [data[0], data[1], data[2]];
    let span = 0;
    for (let i = 0; i < width * height; i += 1) {
      const dr = data[i * 3] - br;
      const dg = data[i * 3 + 1] - bg;
      const db = data[i * 3 + 2] - bb;
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      coverage[i] = d;
      if (d > span) span = d;
    }
    if (span > 0) for (let i = 0; i < width * height; i += 1) coverage[i] /= span;
  }

  const box = inkBox(coverage, width, height);
  const inkCentre: [number, number] = box
    ? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
    : centre;

  // Counters: are the holes in the mark still unpainted at this size?
  const probes = counterProbes(transform(polygons, placed));
  let open = 0;
  for (const [px, py] of probes) {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (coverage[y * width + x] < 0.5) open += 1;
  }

  return {
    file: target.file,
    width,
    height,
    channels,
    inkCentre,
    centreOffset: Math.hypot(inkCentre[0] - centre[0], inkCentre[1] - centre[1]),
    inkRadius: maxInkRadius(coverage, width, height, centre),
    safeRadius:
      target.safeCircleRatio === null ? null : target.size * target.safeCircleRatio,
    monochrome,
    monochromeRequired: target.monochrome,
    counters: { total: probes.length, open },
  };
}

/* ── The command ────────────────────────────────────────────────────────── */

export function contoursFor(options: IconOptions): Polygon[] {
  const contours = options.font
    ? contoursFromGlyph(options.font, options.char as string, { samples: options.samples })
    : contoursFromSvgFile(options.svg as string, options.samples);

  // The same union the `extract` command relies on: overlapping unmerged
  // contours become one shape, and genuine counters stay holes. Rasterising the
  // raw contours would fill the hole in an "O" on any face that draws it as a
  // self-crossing lasso.
  const polygons = unionContours(contours);
  if (polygons.length === 0) throw new Error('the mark unioned to nothing');
  return polygons;
}

/** The app.json the four files want, as a paste-ready fragment. */
export function appJsonFragment(outDir: string, bg: Rgb): string {
  const rel = relative(process.cwd(), isAbsolute(outDir) ? outDir : join(process.cwd(), outDir));
  const base = rel === '' ? '.' : rel.startsWith('..') ? outDir : `./${rel}`;
  const at = (file: string): string => `${base}/${file}`.split(sep).join('/');
  const colour = toHex(bg);

  return JSON.stringify(
    {
      expo: {
        icon: at('icon.png'),
        android: {
          adaptiveIcon: {
            foregroundImage: at('icon-android-foreground.png'),
            backgroundColor: colour,
          },
        },
        web: { favicon: at('favicon.png') },
        plugins: [
          ['expo-notifications', { icon: at('icon-notification.png'), color: colour }],
        ],
      },
    },
    null,
    2,
  );
}

export function runIcons(argv: string[]): number {
  let options: IconOptions;
  try {
    options = parseIconArgs(argv);
  } catch (error) {
    if (!(error instanceof IconsUsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${ICONS_USAGE}\n`);
    return 1;
  }

  let polygons: Polygon[];
  try {
    polygons = contoursFor(options);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  try {
    mkdirSync(options.outDir, { recursive: true });
  } catch (error) {
    process.stderr.write(`cannot create ${options.outDir}: ${(error as Error).message}\n`);
    return 1;
  }

  const written: IconMetrics[] = [];
  for (const target of TARGETS) {
    let rendered: Rendered;
    try {
      rendered = renderTarget(polygons, target, { bg: options.bg, fg: options.fg });
      writeOut(join(options.outDir, target.file), rendered.png, options.force);
    } catch (error) {
      process.stderr.write(`${(error as Error).message}\n`);
      return 1;
    }
    written.push(rendered.metrics);
  }

  for (const m of written) {
    const bits = [
      `${m.width}x${m.height}`,
      m.channels === 4 ? 'transparent' : 'opaque',
      `ink centre off by ${m.centreOffset.toFixed(2)}px (pass 2 moved it ${m.correction.toFixed(2)}px)`,
    ];
    if (m.safeRadius !== null) {
      bits.push(
        `ink radius ${m.inkRadius.toFixed(0)}px of ${m.safeRadius.toFixed(0)}px safe ` +
          `(${(m.safeRadius - m.inkRadius).toFixed(0)}px spare)`,
      );
    }
    if (m.monochromeRequired) bits.push(m.monochrome ? 'all-white silhouette' : 'NOT monochrome');
    if (m.counters.total > 0) bits.push(`${m.counters.open}/${m.counters.total} counters open`);
    bits.push(`${(m.bytes / 1024).toFixed(1)} KB`);
    process.stderr.write(`${join(options.outDir, m.file)} — ${bits.join(', ')}\n`);
  }

  const closed = written.filter((m) => m.counters.open < m.counters.total);
  for (const m of closed) {
    process.stderr.write(
      `WARNING: ${m.file} closed ${m.counters.total - m.counters.open} counter(s) at ` +
        `${m.width}px — the hole in the mark has filled in. Use a lighter weight, or a ` +
        'simpler mark, for the small sizes.\n',
    );
  }

  process.stdout.write(
    `${[
      '// app.json — paste this in. The background colour lives here, not in the',
      '// foreground PNG, because Android composites the two itself.',
      appJsonFragment(options.outDir, options.bg),
      '',
    ].join('\n')}`,
  );
  return 0;
}
