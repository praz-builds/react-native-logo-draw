/**
 * Bundle the CLI into a single file.
 *
 * The CLI needs opentype.js, polygon-clipping and svgpath. The component needs
 * nothing at all, and `dependencies: {}` is a promise this package makes to
 * everyone who installs it. Bundling the CLI's dependencies into dist/cli.js at
 * publish time is how both stay true: the code ships, the install graph does
 * not. This is the one build step heavier than `tsc`, and that is what it buys.
 */
import { build } from 'esbuild';
import { chmodSync, statSync } from 'node:fs';

const outfile = 'dist/cli.js';

await build({
  entryPoints: ['cli/index.ts'],
  outfile,
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // Bundling is redistribution, and the bundled libraries are MIT: their notices
  // have to travel with the copy. THIRD-PARTY-NOTICES.md is what actually
  // discharges that — it is complete, and it ships in `files`.
  //
  // 'eof' is kept anyway because it is nearly free (about 120 bytes) and it is
  // the only attribution that lives *inside* dist/cli.js. Do not mistake it for
  // the fix: esbuild can only keep comments that upstream marked `/*!`, `//!`,
  // `@license` or `@preserve`, and of the seven bundled bodies of code exactly
  // one does — the codepointat polyfill inlined in opentype.js. The other six,
  // opentype.js's own banner included, are plain comments and get minified away.
  legalComments: 'eof',
  banner: { js: '#!/usr/bin/env node' },
});

chmodSync(outfile, 0o755);
console.log(`${outfile} — ${(statSync(outfile).size / 1024).toFixed(0)} KB`);
