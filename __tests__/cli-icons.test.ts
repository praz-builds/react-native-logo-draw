/**
 * The `icons` command's contracts.
 *
 * Every one of these guards a failure that is INVISIBLE at build time: an icon
 * that is a pixel off-centre, a foreground Android will crop, a notification
 * icon that renders as a white blob, a counter that closed up in the
 * downsample. None of them throw on their own — they just ship.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../cli/index';
import {
  TARGETS,
  appJsonFragment,
  counterProbes,
  parseHex,
  parseIconArgs,
  placement,
  renderTarget,
  type Target,
} from '../cli/icons';
import { decodePng, encodePng } from '../cli/png';
import { coverageOf, inkBox } from '../cli/raster';
import { contoursFromPathData } from '../cli/svg';
import { unionContours, type Polygon } from '../cli/geometry';

/** An "O": a disc with a real hole, the two rings wound against each other. */
const RING_SVG =
  '<svg viewBox="0 0 100 100">' +
  '<path d="M0,50 A50,50 0 1,0 100,50 A50,50 0 1,0 0,50 Z"/>' +
  '<path d="M25,50 A25,25 0 1,1 75,50 A25,25 0 1,1 25,50 Z"/>' +
  '</svg>';

function ring(): Polygon[] {
  return unionContours(
    contoursFromPathData(
      [
        'M0,50 A50,50 0 1,0 100,50 A50,50 0 1,0 0,50 Z',
        'M25,50 A25,25 0 1,1 75,50 A25,25 0 1,1 25,50 Z',
      ],
      48,
    ),
  );
}

const WHITE = [255, 255, 255] as const;
const ORANGE = [255, 107, 26] as const;

function target(file: string): Target {
  const found = TARGETS.find((t) => t.file === file);
  if (!found) throw new Error(`no target ${file}`);
  return found;
}

/* ── Arguments ──────────────────────────────────────────────────────────── */

describe('icons arguments', () => {
  it('defaults to ./icons, white on the required background', () => {
    expect(parseIconArgs(['--svg', 'mark.svg', '--bg', '#FF6B1A'])).toMatchObject({
      svg: 'mark.svg',
      bg: [255, 107, 26],
      fg: [255, 255, 255],
      outDir: 'icons',
      samples: 48,
      force: false,
    });
  });

  it('rejects an ambiguous, incomplete or colourless request', () => {
    expect(() => parseIconArgs([])).toThrow(/--font/);
    expect(() => parseIconArgs(['--svg', 'a.svg', '--font', 'b.ttf', '--bg', '#000'])).toThrow(
      /not both/,
    );
    expect(() => parseIconArgs(['--font', 'b.ttf', '--bg', '#000'])).toThrow(/--char/);
    expect(() => parseIconArgs(['--svg', 'a.svg'])).toThrow(/--bg is required/);
    expect(() => parseIconArgs(['--svg', 'a.svg', '--bg'])).toThrow(/needs a value/);
    expect(() => parseIconArgs(['--svg', 'a.svg', '--bg', '#000', '--nope'])).toThrow(
      /unknown flag/,
    );
    expect(() =>
      parseIconArgs(['--svg', 'a.svg', '--bg', '#000', '--samples', '513']),
    ).toThrow(/--samples is 1-512/);
  });

  /**
   * A colour flag is the one place a typo produces a *plausible* icon: pass
   * `--bg orange` and a silent fallback would hand you black.
   */
  it('takes hex three ways and refuses everything else', () => {
    expect(parseHex('--bg', '#FF6B1A')).toEqual([255, 107, 26]);
    expect(parseHex('--bg', 'FF6B1A')).toEqual([255, 107, 26]);
    expect(parseHex('--bg', '#f60')).toEqual([255, 102, 0]);
    expect(() => parseHex('--bg', 'orange')).toThrow(/hex colour/);
    expect(() => parseHex('--bg', '#GGGGGG')).toThrow(/hex colour/);
    expect(() => parseHex('--bg', '#1234')).toThrow(/hex colour/);
    expect(() => parseHex('--bg', '')).toThrow(/hex colour/);
  });
});

/* ── PNG ────────────────────────────────────────────────────────────────── */

describe('the PNG encoder', () => {
  /**
   * The encoder picks a different row filter per row, so a round-trip that only
   * ever exercised one of them would prove nothing. A gradient with an alpha
   * ramp gives the heuristic a reason to choose all five.
   */
  it('round-trips every byte, RGB and RGBA', () => {
    for (const channels of [3, 4] as const) {
      const width = 37;
      const height = 23;
      const data = new Uint8Array(width * height * channels);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * channels;
          data[i] = (x * 7) % 256;
          data[i + 1] = (y * 11) % 256;
          data[i + 2] = (x * y) % 256;
          if (channels === 4) data[i + 3] = (x + y) % 256;
        }
      }
      const decoded = decodePng(encodePng({ width, height, channels, data }));
      expect(decoded.width).toBe(width);
      expect(decoded.height).toBe(height);
      expect(decoded.channels).toBe(channels);
      expect(Array.from(decoded.data)).toEqual(Array.from(data));
    }
  });

  it('writes a real PNG signature and rejects anything that is not one', () => {
    const png = encodePng({
      width: 1,
      height: 1,
      channels: 3,
      data: new Uint8Array([1, 2, 3]),
    });
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });

  it('notices corruption instead of decoding garbage', () => {
    const png = encodePng({
      width: 4,
      height: 4,
      channels: 4,
      data: new Uint8Array(64).fill(200),
    });
    const corrupted = Buffer.from(png);
    corrupted[20] ^= 0xff; // inside IHDR's payload
    expect(() => decodePng(corrupted)).toThrow(/CRC/);
  });

  it('refuses a raster whose data does not match its dimensions', () => {
    expect(() =>
      encodePng({ width: 4, height: 4, channels: 4, data: new Uint8Array(10) }),
    ).toThrow(/expected 64/);
  });
});

/* ── Rasteriser ─────────────────────────────────────────────────────────── */

describe('the rasteriser', () => {
  /**
   * The counter is the whole reason the union step exists upstream. If nonzero
   * winding is applied wrongly the hole in an "O" fills in — and a filled-in
   * "O" still looks like a plausible icon, which is what makes it dangerous.
   */
  it('keeps a counter open: the middle of an "O" is not painted', () => {
    const polygons = ring();
    const coverage = coverageOf(polygons, 100, 100);
    expect(coverage[50 * 100 + 50]).toBe(0); // dead centre, inside the hole
    expect(coverage[50 * 100 + 5]).toBeGreaterThan(0.9); // the left of the stroke
    expect(coverage[2 * 100 + 2]).toBe(0); // outside the disc entirely
  });

  it('antialiases rather than aliasing: an edge is a ramp, not a cliff', () => {
    // A rectangle whose right edge falls a quarter of the way into pixel 20.
    const rect: Polygon[] = [
      [
        [
          [5, 5],
          [20.25, 5],
          [20.25, 25],
          [5, 25],
          [5, 5],
        ],
      ],
    ];
    const coverage = coverageOf(rect, 40, 40);
    expect(coverage[10 * 40 + 19]).toBeCloseTo(1, 5);
    expect(coverage[10 * 40 + 20]).toBeCloseTo(0.25, 5);
    expect(coverage[10 * 40 + 21]).toBe(0);
  });

  it('finds a probe point inside every counter', () => {
    expect(counterProbes(ring())).toHaveLength(1);
  });
});

/* ── The four icons ─────────────────────────────────────────────────────── */

describe('the icon set', () => {
  const polygons = ring();
  const rendered = TARGETS.map((t) => ({
    target: t,
    ...renderTarget(polygons, t, { bg: ORANGE, fg: WHITE }),
  }));
  const byFile = new Map(rendered.map((r) => [r.target.file, r]));

  it('emits the four files Expo asks for, at the sizes it asks for', () => {
    expect(rendered.map((r) => [r.target.file, r.metrics.width, r.metrics.height])).toEqual([
      ['icon.png', 1024, 1024],
      ['icon-android-foreground.png', 1024, 1024],
      ['icon-notification.png', 96, 96],
      ['favicon.png', 48, 48],
    ]);
  });

  /**
   * Two-pass centring. Placing on a metric box leaves a mark visibly off; this
   * places on ink, then RE-MEASURES the rendered alpha and corrects. The
   * assertion is on the re-measured result, not on the intention.
   */
  it('lands the rendered ink centre on the canvas centre, within a pixel', () => {
    for (const { target: t, metrics } of rendered) {
      expect(metrics.centreOffset).toBeLessThanOrEqual(1);
      expect(metrics.inkCentre[0]).toBeCloseTo(t.size / 2, 0);
      expect(metrics.inkCentre[1]).toBeCloseTo(t.size / 2, 0);
    }
  });

  /**
   * The two-pass correction is not decoration. When the rasteriser loses an
   * extremity — a shallow tangent whose coverage rounds to alpha 0 on one side
   * — the painted ink box is not the geometric one, and pass 1 alone leaves the
   * mark off-centre. Here is a mark built to do exactly that.
   */
  it('actually corrects when the painted ink is not the geometry', () => {
    // A block with a long, vanishingly thin spike off its right side. The tip
    // of the spike covers far less than half a pixel, so it does not survive
    // rounding to an alpha byte, and the painted box is narrower on the right
    // than the geometry says.
    const spiked: Polygon[] = [
      [
        [
          [0, 0],
          [100, 0],
          [100, 40],
          [1000, 49.999],
          [1000, 50.001],
          [100, 60],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
    ];
    const t = target('icon.png');
    const first = placement(spiked, t);
    const naive = coverageOf(
      spiked.map((p) => p.map((r) => r.map(([x, y]): [number, number] => [
        x * first.scale + first.dx,
        y * first.scale + first.dy,
      ]))),
      t.size,
      t.size,
    );
    const box = inkBox(naive, t.size, t.size);
    expect(box).not.toBeNull();
    const naiveOffset = Math.abs((box!.minX + box!.maxX) / 2 - t.size / 2);
    expect(naiveOffset).toBeGreaterThan(1); // pass 1 alone would be off

    const { metrics } = renderTarget(spiked, t, { bg: ORANGE, fg: WHITE });
    expect(metrics.correction).toBeGreaterThan(1); // pass 2 moved it
    expect(metrics.centreOffset).toBeLessThanOrEqual(1); // and landed it
  });

  /**
   * Android's adaptive mask crops roughly the outer third. This is measured
   * from the pixels, not asserted from the scale factor that was applied.
   */
  it('keeps every inked pixel of the Android foreground inside the safe circle', () => {
    const { metrics } = byFile.get('icon-android-foreground.png')!;
    expect(metrics.safeRadius).toBeCloseTo(1024 * 0.33, 5);
    expect(metrics.inkRadius).toBeLessThanOrEqual(metrics.safeRadius!);
    // And it is not so conservative that the icon is a speck.
    expect(metrics.inkRadius).toBeGreaterThan(metrics.safeRadius! * 0.6);
  });

  it('leaves the other three unconstrained by a safe circle', () => {
    for (const file of ['icon.png', 'icon-notification.png', 'favicon.png']) {
      expect(byFile.get(file)!.metrics.safeRadius).toBeNull();
    }
  });

  /**
   * Android throws the colour away and keeps the alpha. A coloured
   * notification icon becomes a featureless white blob, so the command emits
   * white whatever --fg says — checked on the decoded pixels.
   */
  it('makes the notification icon a verifiably white silhouette, whatever --fg says', () => {
    const { png, metrics } = renderTarget(ring(), target('icon-notification.png'), {
      bg: ORANGE,
      fg: [17, 34, 51],
    });
    expect(metrics.monochrome).toBe(true);

    const { data, channels } = decodePng(png);
    expect(channels).toBe(4);
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      painted += 1;
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
    }
    expect(painted).toBeGreaterThan(500);
  });

  /**
   * iOS applies its own superellipse mask. A pre-rounded opaque icon shows its
   * own corners outside that mask, so the corners have to be background.
   */
  it('ships icon.png opaque and full-bleed, with its corners un-rounded', () => {
    const { png } = byFile.get('icon.png')!;
    const { channels, width, height, data } = decodePng(png);
    expect(channels).toBe(3); // no alpha channel at all
    const corner = (x: number, y: number): number[] =>
      Array.from(data.subarray((y * width + x) * 3, (y * width + x) * 3 + 3));
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]) {
      expect(corner(x, y)).toEqual([...ORANGE]);
    }
  });

  it('ships the two Android files with an alpha channel', () => {
    expect(byFile.get('icon-android-foreground.png')!.metrics.channels).toBe(4);
    expect(byFile.get('icon-notification.png')!.metrics.channels).toBe(4);
  });

  /**
   * 48px is small enough for a letterform's counter to close up. If it does,
   * the mark stops being that letter.
   */
  it('keeps the counter open all the way down to the 48px favicon', () => {
    for (const { metrics } of rendered) {
      expect(metrics.counters).toEqual({ total: 1, open: 1 });
    }
    const { png } = byFile.get('favicon.png')!;
    const { width, data } = decodePng(png);
    const centre = ((width / 2) * width + width / 2) * 3;
    expect(Array.from(data.subarray(centre, centre + 3))).toEqual([...ORANGE]);
  });
});

/* ── End to end ─────────────────────────────────────────────────────────── */

describe('icons end to end', () => {
  const silence = (): jest.SpyInstance[] => [
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true),
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true),
  ];

  let spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    spies = silence();
  });
  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
  });

  function workspace(): { dir: string; source: string; out: string } {
    const dir = mkdtempSync(join(tmpdir(), 'logo-draw-icons-'));
    const source = join(dir, 'mark.svg');
    writeFileSync(source, RING_SVG);
    return { dir, source, out: join(dir, 'out') };
  }

  it('writes four decodable PNGs and the app.json fragment', () => {
    const { source, out } = workspace();
    expect(run(['icons', '--svg', source, '--bg', '#FF6B1A', '--out-dir', out])).toBe(0);

    for (const t of TARGETS) {
      const decoded = decodePng(readFileSync(join(out, t.file)));
      expect([decoded.width, decoded.height]).toEqual([t.size, t.size]);
      expect(decoded.channels).toBe(t.opaque ? 3 : 4);
    }

    const fragment = JSON.parse(appJsonFragment(out, ORANGE));
    expect(fragment.expo.icon).toMatch(/icon\.png$/);
    expect(fragment.expo.android.adaptiveIcon.backgroundColor).toBe('#FF6B1A');
    expect(fragment.expo.android.adaptiveIcon.foregroundImage).toMatch(/foreground\.png$/);
    expect(fragment.expo.web.favicon).toMatch(/favicon\.png$/);
    expect(fragment.expo.plugins[0][0]).toBe('expo-notifications');
    expect(fragment.expo.plugins[0][1].color).toBe('#FF6B1A');
  });

  it('will not clobber an existing icon set without --force', () => {
    const { source, out } = workspace();
    expect(run(['icons', '--svg', source, '--bg', '#000', '--out-dir', out])).toBe(0);
    const before = readFileSync(join(out, 'icon.png'));

    expect(run(['icons', '--svg', source, '--bg', '#FFF', '--out-dir', out])).toBe(1);
    expect(readFileSync(join(out, 'icon.png')).equals(before)).toBe(true);

    expect(run(['icons', '--svg', source, '--bg', '#FFF', '--out-dir', out, '--force'])).toBe(0);
    expect(readFileSync(join(out, 'icon.png')).equals(before)).toBe(false);
  });

  it('reports a bad colour or a missing file as a failure, not a blank icon', () => {
    const { source, out } = workspace();
    expect(run(['icons', '--svg', source, '--bg', 'orange', '--out-dir', out])).toBe(1);
    expect(run(['icons', '--svg', join(out, 'nope.svg'), '--bg', '#000'])).toBe(1);
  });

  it('answers --help without doing any work', () => {
    expect(run(['icons', '--help'])).toBe(0);
  });
});
