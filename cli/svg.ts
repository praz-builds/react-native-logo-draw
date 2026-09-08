/**
 * SVG file -> flattened contours.
 *
 * Every `d` attribute in the file is collected and flattened into the same
 * coordinate space, so a multi-path icon unions into one traceable outline the
 * same way a multi-contour glyph does.
 *
 * Limitation, stated plainly: `transform` attributes are ignored, and shape
 * elements (`<rect>`, `<circle>`, `<polygon>`) are not converted. Flatten
 * transforms and convert shapes to paths in your editor first — every vector
 * editor has a one-click "object to path".
 */
import { readFileSync } from 'node:fs';
import svgpath from 'svgpath';
import { FlattenPen, type Contour, type Point } from './geometry';

const D_ATTRIBUTE = /\sd\s*=\s*("([^"]*)"|'([^']*)')/g;

/** Pull every path's `d` out of an SVG document, or accept bare path data. */
export function pathDataFrom(source: string): string[] {
  const trimmed = source.trim();
  if (!trimmed.startsWith('<')) return trimmed ? [trimmed] : [];

  const found: string[] = [];
  for (const match of trimmed.matchAll(D_ATTRIBUTE)) {
    const value = match[2] ?? match[3] ?? '';
    if (value.trim()) found.push(value.trim());
  }
  return found;
}

export function contoursFromPathData(data: string[], samples: number): Contour[] {
  const pen = new FlattenPen(samples);

  for (const d of data) {
    // Absolute coordinates, arcs converted to cubics, shorthands expanded:
    // after this the iterator only ever sees M / L / C / Q / Z.
    svgpath(d)
      .abs()
      .unarc()
      .unshort()
      .iterate((segment, _index, curX, curY) => {
        const [command, ...args] = segment as unknown as [string, ...number[]];
        switch (command) {
          case 'M':
            pen.moveTo([args[0], args[1]]);
            break;
          case 'L':
            pen.lineTo([args[0], args[1]]);
            break;
          case 'H':
            // .abs() keeps H/V shorthand; resolve it against the current point.
            pen.lineTo([args[0], curY]);
            break;
          case 'V':
            pen.lineTo([curX, args[0]]);
            break;
          case 'C':
            pen.cubicTo(
              [args[0], args[1]] as Point,
              [args[2], args[3]] as Point,
              [args[4], args[5]] as Point,
            );
            break;
          case 'Q':
            pen.quadraticTo([args[0], args[1]] as Point, [args[2], args[3]] as Point);
            break;
          case 'Z':
          case 'z':
            pen.closePath();
            break;
          default:
            break;
        }
      });
  }

  return pen.result();
}

export function contoursFromSvgFile(file: string, samples: number): Contour[] {
  const data = pathDataFrom(readFileSync(file, 'utf8'));
  if (data.length === 0) {
    throw new Error(
      `no <path d="..."> found in ${file} — convert shapes to paths in your editor first`,
    );
  }
  const contours = contoursFromPathData(data, samples);
  if (contours.length === 0) throw new Error(`${file} produced no closed contours`);
  return contours;
}
