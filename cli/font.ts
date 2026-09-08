/**
 * Font glyph -> flattened contours.
 *
 * opentype.js is used for one reason beyond convenience: TrueType stores runs
 * of consecutive off-curve points with the on-curve points between them
 * *implied*, and a reader that treats such a run as a single higher-order
 * bezier gets a subtly wrong outline. opentype.js expands the implied points
 * correctly, which is why the perimeter this CLI reports is trustworthy.
 */
import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { FlattenPen, type Contour, type Point } from './geometry';

export type GlyphOptions = {
  /** Curve flattening resolution, per segment. */
  samples: number;
};

/** One command of an opentype.js path: the subset we can draw. */
export type GlyphCommand = {
  type: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
};

/**
 * Flatten opentype.js path commands into contours.
 *
 * Exported so tests can run the real pipeline against a captured glyph without
 * shipping a font file.
 */
export function contoursFromCommands(
  commands: readonly GlyphCommand[],
  samples: number,
): Contour[] {
  const pen = new FlattenPen(samples);
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        pen.moveTo([command.x as number, command.y as number]);
        break;
      case 'L':
        pen.lineTo([command.x as number, command.y as number]);
        break;
      case 'Q':
        pen.quadraticTo(
          [command.x1, command.y1] as Point,
          [command.x, command.y] as Point,
        );
        break;
      case 'C':
        pen.cubicTo(
          [command.x1, command.y1] as Point,
          [command.x2, command.y2] as Point,
          [command.x, command.y] as Point,
        );
        break;
      case 'Z':
        pen.closePath();
        break;
      default:
        break;
    }
  }
  return pen.result();
}

export function contoursFromGlyph(
  fontPath: string,
  character: string,
  { samples }: GlyphOptions,
): Contour[] {
  const buffer = readFileSync(fontPath);
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );

  const codePoint = [...character][0];
  if (codePoint === undefined) throw new Error('--char needs a character');

  const glyph = font.charToGlyph(codePoint);
  if (!glyph || glyph.index === 0) {
    throw new Error(
      `"${codePoint}" is not in ${fontPath} (the font mapped it to .notdef)`,
    );
  }

  // Draw at unitsPerEm so coordinates stay in font units; getPath already
  // flips Y into SVG's downward axis for us.
  const path = glyph.getPath(0, 0, font.unitsPerEm);

  const contours = contoursFromCommands(path.commands as GlyphCommand[], samples);
  if (contours.length === 0) {
    throw new Error(`"${codePoint}" has no outline in ${fontPath} (a blank glyph?)`);
  }
  return contours;
}
