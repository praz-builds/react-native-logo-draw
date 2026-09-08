import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, formatSnippet, run } from '../cli/index';

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

  /**
   * Both of these are multipliers on work nobody sees happening. `--samples`
   * multiplies the point count every later stage walks; `--verify` is squared
   * into a sample grid. Unbounded, either one turns the command into a hang
   * that looks exactly like a crash.
   */
  it('caps the two flags that silently multiply the work', () => {
    expect(parseArgs(['--svg', 'a.svg', '--samples', '512']).samples).toBe(512);
    expect(() => parseArgs(['--svg', 'a.svg', '--samples', '513'])).toThrow(/--samples is 1-512/);
    expect(() => parseArgs(['--svg', 'a.svg', '--samples', '0'])).toThrow(/at least 1/);

    expect(parseArgs(['--svg', 'a.svg', '--verify', '1024']).verify).toBe(1024);
    expect(() => parseArgs(['--svg', 'a.svg', '--verify', '100000'])).toThrow(/--verify is 0-1024/);
    expect(() => parseArgs(['--svg', 'a.svg', '--verify', '-1'])).toThrow(/negative/);
  });

  it('does not overwrite unless asked', () => {
    expect(parseArgs(['--svg', 'a.svg']).force).toBe(false);
    expect(parseArgs(['--svg', 'a.svg', '--force']).force).toBe(true);
  });
});

/**
 * `--out` writes wherever it is pointed, and the obvious paths to point it at
 * — `logo.ts`, `src/brand.ts` — are files somebody already has. Clobbering one
 * with no warning, or following a symlink out of the directory the user is
 * looking at, are both losses they cannot undo.
 */
describe('--out', () => {
  const svg = '<svg viewBox="0 0 10 10"><path d="M0,0L10,0L10,10L0,10Z"/></svg>';

  function workspace(): { dir: string; source: string } {
    const dir = mkdtempSync(join(tmpdir(), 'logo-draw-out-'));
    const source = join(dir, 'mark.svg');
    writeFileSync(source, svg);
    return { dir, source };
  }

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

  it('writes a file that is not there yet', () => {
    const { dir, source } = workspace();
    const out = join(dir, 'logo.ts');
    expect(run(['extract', '--svg', source, '--out', out])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('export const LOGO');
  });

  it('refuses to clobber an existing file, and says how to mean it', () => {
    const { dir, source } = workspace();
    const out = join(dir, 'logo.ts');
    writeFileSync(out, 'PRECIOUS');
    expect(run(['extract', '--svg', source, '--out', out])).toBe(1);
    expect(readFileSync(out, 'utf8')).toBe('PRECIOUS');

    expect(run(['extract', '--svg', source, '--out', out, '--force'])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('export const LOGO');
  });

  it('refuses to write through a symlink, even with --force', () => {
    const { dir, source } = workspace();
    const target = join(dir, 'elsewhere.ts');
    writeFileSync(target, 'PRECIOUS');
    const link = join(dir, 'logo.ts');
    symlinkSync(target, link);

    expect(run(['extract', '--svg', source, '--out', link])).toBe(1);
    expect(run(['extract', '--svg', source, '--out', link, '--force'])).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('PRECIOUS');
  });

  it('refuses a dangling symlink too, rather than creating its target', () => {
    const { dir, source } = workspace();
    const link = join(dir, 'logo.ts');
    mkdirSync(join(dir, 'nested'));
    symlinkSync(join(dir, 'nested', 'nothing-here.ts'), link);
    expect(run(['extract', '--svg', source, '--out', link, '--force'])).toBe(1);
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
