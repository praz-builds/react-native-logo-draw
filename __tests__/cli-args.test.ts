import { parseArgs, formatSnippet } from '../cli/index';

describe('argument parsing', () => {
  it('defaults to a 100-unit box at 86% fill', () => {
    const options = parseArgs(['--svg', 'mark.svg']);
    expect(options).toMatchObject({
      svg: 'mark.svg',
      box: 100,
      size: 86,
      samples: 48,
      simplify: 0.12,
      precision: 2,
      name: 'LOGO',
      json: false,
    });
  });

  it('reads a glyph source', () => {
    expect(parseArgs(['--font', 'Brand.ttf', '--char', 'K'])).toMatchObject({
      font: 'Brand.ttf',
      char: 'K',
    });
  });

  it('rejects an ambiguous or incomplete source', () => {
    expect(() => parseArgs([])).toThrow(/--font/);
    expect(() => parseArgs(['--font', 'a.ttf'])).toThrow(/--char/);
    expect(() => parseArgs(['--font', 'a.ttf', '--svg', 'b.svg'])).toThrow(/not both/);
  });

  it('rejects values that would produce nonsense geometry', () => {
    expect(() => parseArgs(['--svg', 'a.svg', '--box', '0'])).toThrow(/positive/);
    expect(() => parseArgs(['--svg', 'a.svg', '--size', '140'])).toThrow(/percentage/);
    expect(() => parseArgs(['--svg', 'a.svg', '--simplify', '-1'])).toThrow(/negative/);
    expect(() => parseArgs(['--svg', 'a.svg', '--precision', '99'])).toThrow(/0–10/);
    expect(() => parseArgs(['--svg', 'a.svg', '--name', '1bad'])).toThrow(/identifier/);
    expect(() => parseArgs(['--svg', 'a.svg', '--box', 'wide'])).toThrow(/number/);
    expect(() => parseArgs(['--svg'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--nope'])).toThrow(/unknown flag/);
  });
});

describe('snippet output', () => {
  it('is valid TypeScript you can paste straight in', () => {
    const snippet = formatSnippet(
      {
        path: 'M0,0L1,0L1,1Z',
        length: 3.41,
        viewBox: '0 0 100 100',
        sourceContours: 4,
        shapes: 1,
        holes: 0,
        points: 3,
        verification: null,
      },
      'BrandMark',
    );
    expect(snippet).toContain('export const BrandMark = {');
    expect(snippet).toContain("path: 'M0,0L1,0L1,1Z',");
    expect(snippet).toContain('length: 3.41,');
    expect(snippet).toContain('} as const;');
  });
});
