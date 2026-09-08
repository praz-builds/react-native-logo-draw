/**
 * `npx react-native-logo-draw extract` — a font glyph or an SVG file turned
 * into the `{ path, length, viewBox }` triple `<LogoDraw />` needs.
 *
 * Diagnostics go to stderr, the copy-pasteable payload to stdout, so
 * `... --json > logo.json` does the obvious thing.
 */
import { writeFileSync } from 'node:fs';
import { buildFromContours, type ExtractResult } from './geometry';
import { contoursFromGlyph } from './font';
import { contoursFromSvgFile } from './svg';

const USAGE = `
react-native-logo-draw extract — turn a glyph or an SVG into a traceable path

  npx react-native-logo-draw extract --font Brand.ttf --char K
  npx react-native-logo-draw extract --svg mark.svg --name BrandMark
  npx react-native-logo-draw extract --svg mark.svg --json > mark.json

Source (exactly one)
  --font <file>       .ttf / .otf / .woff to read the glyph from
  --char <c>          the character to extract (with --font)
  --svg <file>        an SVG file, or a file containing bare path data

Shape
  --box <n>           viewBox edge length            (default 100)
  --size <pct>        percentage of the box the mark
                      fills, the rest is optical margin (default 86)
  --samples <n>       curve flattening resolution    (default 48)
  --simplify <n>      simplify tolerance, in viewBox units (default 0.12)
  --precision <n>     decimal places in the path     (default 2)
  --verify <n>        self-check grid edge, 0 to skip (default 96)

Output
  --name <Ident>      constant name in the TS snippet (default LOGO)
  --json              emit JSON instead of a TS snippet
  --out <file>        write to a file instead of stdout
  -h, --help          this

Why the union step exists
  Display faces often draw one letter as several overlapping unmerged
  contours. Filled, that renders perfectly. Stroke-traced, it draws as several
  disconnected shapes with seams through the letterform. This command flattens
  the contours, boolean-unions them into a single closed outline, simplifies
  it, and measures the perimeter React Native cannot measure at runtime.
`.trim();

type Options = {
  font?: string;
  char?: string;
  svg?: string;
  box: number;
  size: number;
  samples: number;
  simplify: number;
  precision: number;
  verify: number;
  name: string;
  json: boolean;
  out?: string;
};

class UsageError extends Error {}

function number(flag: string, raw: string | undefined): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value)) {
    throw new UsageError(`${flag} needs a number`);
  }
  return value;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    box: 100,
    size: 86,
    samples: 48,
    simplify: 0.12,
    precision: 2,
    verify: 96,
    name: 'LOGO',
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${flag} needs a value`);
      }
      i += 1;
      return value;
    };

    switch (flag) {
      case '--font': options.font = next(); break;
      case '--char': options.char = next(); break;
      case '--svg': options.svg = next(); break;
      case '--box': options.box = number(flag, next()); break;
      case '--size': options.size = number(flag, next()); break;
      case '--samples': options.samples = Math.round(number(flag, next())); break;
      case '--simplify': options.simplify = number(flag, next()); break;
      case '--precision': options.precision = Math.round(number(flag, next())); break;
      case '--verify': options.verify = Math.round(number(flag, next())); break;
      case '--name': options.name = next(); break;
      case '--out': options.out = next(); break;
      case '--json': options.json = true; break;
      default:
        throw new UsageError(`unknown flag ${flag}`);
    }
  }

  if (options.font && options.svg) throw new UsageError('pass --font or --svg, not both');
  if (!options.font && !options.svg) throw new UsageError('pass --font <file> --char <c>, or --svg <file>');
  if (options.font && !options.char) throw new UsageError('--font also needs --char');
  if (options.box <= 0) throw new UsageError('--box must be positive');
  if (options.size <= 0 || options.size > 100) throw new UsageError('--size is a percentage in (0, 100]');
  if (options.samples < 1) throw new UsageError('--samples must be at least 1');
  if (options.simplify < 0) throw new UsageError('--simplify cannot be negative');
  if (options.precision < 0 || options.precision > 10) throw new UsageError('--precision is 0–10');
  if (options.verify < 0) throw new UsageError('--verify cannot be negative');
  if (!/^[A-Za-z_$][\w$]*$/.test(options.name)) throw new UsageError('--name must be a valid identifier');

  return options;
}

export function extract(options: Options): ExtractResult {
  const contours = options.font
    ? contoursFromGlyph(options.font, options.char as string, { samples: options.samples })
    : contoursFromSvgFile(options.svg as string, options.samples);

  return buildFromContours(contours, {
    box: options.box,
    fillPercent: options.size,
    tolerance: options.simplify,
    precision: options.precision,
    verify: options.verify,
  });
}

export function formatSnippet(result: ExtractResult, name: string): string {
  return [
    '/**',
    ` * Generated by \`npx react-native-logo-draw extract\`.`,
    ` * ${result.sourceContours} source contour(s) -> ${result.shapes} shape(s), ${result.holes} hole(s), ${result.points} points.`,
    ' *',
    ' * `length` is the traced perimeter in viewBox units. React Native has no',
    ' * getTotalLength(), so it has to travel with the path. Re-run the command',
    ' * if you change the path.',
    ' */',
    `export const ${name} = {`,
    `  path: '${result.path}',`,
    `  length: ${result.length},`,
    `  viewBox: '${result.viewBox}',`,
    '} as const;',
    '',
  ].join('\n');
}

export function run(argv: string[]): number {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const [command, ...rest] = argv;
  if (command !== 'extract') {
    process.stderr.write(`unknown command "${command}"\n\n${USAGE}\n`);
    return 1;
  }

  let options: Options;
  try {
    options = parseArgs(rest);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 1;
  }

  let result: ExtractResult;
  try {
    result = extract(options);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  process.stderr.write(
    `${result.sourceContours} source contour(s) -> union -> ` +
      `${result.shapes} shape(s), ${result.holes} hole(s), ${result.points} points, ` +
      `perimeter ${result.length}\n`,
  );
  const verification = result.verification;
  if (verification) {
    const percent = verification.mismatch * 100;
    if (percent < 0.5) {
      process.stderr.write(
        `verified: the outline fills the same area as the source (${verification.resolution}x${verification.resolution} grid).\n`,
      );
    } else {
      process.stderr.write(
        `WARNING: the outline disagrees with the source fill over ${percent.toFixed(1)}% of its ink.\n` +
          '  Usually this means the source uses even-odd fill, or has contours that overlap\n' +
          '  in a way winding cannot describe. Check the result before shipping it.\n',
      );
    }
  }
  if (result.shapes > 1) {
    process.stderr.write(
      'note: the union left more than one shape, so the pen jumps between them mid-trace.\n',
    );
  }

  const payload = options.json
    ? `${JSON.stringify(
        { path: result.path, length: result.length, viewBox: result.viewBox },
        null,
        2,
      )}\n`
    : formatSnippet(result, options.name);

  if (options.out) {
    writeFileSync(options.out, payload);
    process.stderr.write(`wrote ${options.out}\n`);
  } else {
    process.stdout.write(payload);
  }
  return 0;
}

/* istanbul ignore next -- entry point */
if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}
