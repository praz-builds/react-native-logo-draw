# Contributing

Thanks for looking. Bug reports with a reproducible path are the most useful
thing you can send.

## Setup

```sh
npm install
npm run build      # tsc for the component, esbuild for the CLI bundle
npm test
npm run typecheck
npm run lint
```

Node 18 or newer.

## Layout

```
src/        the component. Ships compiled. Zero dependencies, and it stays that way.
cli/        the two commands. Bundled into dist/cli.js, so their dependencies
            never reach anyone who installs the package.
              index.ts     argument parsing, dispatch, `extract`
              geometry.ts  flatten -> union -> simplify -> measure
              icons.ts     `icons`: the four Expo icon files and their rules
              raster.ts    scanline polygon fill, pure JS, no native module
              png.ts       PNG encode/decode on node:zlib, ~200 lines
__tests__/  jest, covering both.
example/    an Expo app. Not published.
```

## The two rules

1. **`dependencies` stays `{}`.** Anything the CLI needs goes in
   `devDependencies` and gets bundled by `scripts/build-cli.mjs`. Anything the
   component needs has to be `react-native` or `react-native-svg`.
2. **No Reanimated, no native code.** The point of the library is that it costs
   a consumer nothing they have not already paid for. `strokeDashoffset` cannot
   use the native driver, and that is a documented trade, not a bug to fix.
   This applies to the CLI too: `sharp`, `canvas`, `@resvg/resvg-js` and
   `skia-canvas` all ship platform-specific binaries, so `icons` rasterises and
   encodes PNGs itself rather than depending on one. If you find yourself
   wanting one of them, that is the wrong turn.

## Working on the extractor

`__tests__/fixtures/baloo2-extrabold-K.json` is the regression case: a "K" drawn
as four overlapping unmerged contours. If a change makes `4 contours -> 1 shape,
0 holes` stop being true, it broke the thing the CLI is for.

The strongest check is the self-verification the CLI already runs: extract a
glyph and confirm the reported mismatch is `0.00%`. A good change keeps that at
zero across a whole font, not just one letter.

```sh
npm run build
for c in A B K O Q R 8 % @; do
  node dist/cli.js extract --font path/to/Some.ttf --char "$c" --json > /dev/null
done
```

## Working on the icon generator

Every claim `icons` makes is measured on the encoded PNG, decoded back out —
never on the buffer it just built. If you add a rule, add its measurement, and
make the command *fail* when the measurement disagrees. A silently wrong icon is
the entire problem the command exists to solve.

The four rules under test in `__tests__/cli-icons.test.ts`: two-pass optical
centring, the Android safe circle, the monochrome notification silhouette, and
counters surviving the 48px downsample. Plus a PNG round-trip, because the
encoder is ours.

```sh
npm run build
node dist/cli.js icons --font path/to/Some.ttf --char K --bg '#FF6B1A' \
  --out-dir /tmp/icons
```

## Working on the component

The behaviours worth guarding, all covered by tests:

- the trace and the fill overlap (`__tests__/timeline.test.ts`)
- reduced motion settles instantly and schedules nothing, including the
  "platform has not answered yet" state
- unmount stops the animation, drops timers, and never calls `onComplete`
- `play()` / `reset()` through the ref

## Pull requests

Small and focused. Run `npm run typecheck && npm run lint && npm test` first.
If you change the CLI's geometry, say what you ran it against — the sweep in the
extractor section above, run over a whole font, is the bar.
