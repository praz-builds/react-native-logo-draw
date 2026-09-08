# react-native-logo-draw

Animate any SVG path being drawn on — a pen traces the outline, then ink floods
it. One gesture, not two steps: the fill starts before the pen lands, so the
mark never sits as a hollow outline waiting for something to happen to it.

![A monogram, a ring and a spark drawing themselves on, then filling](https://raw.githubusercontent.com/praz-builds/react-native-logo-draw/main/docs/demo.gif)

[![CI](https://github.com/praz-builds/react-native-logo-draw/actions/workflows/ci.yml/badge.svg)](https://github.com/praz-builds/react-native-logo-draw/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/praz-builds/react-native-logo-draw)](./LICENSE)
[![runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](./package.json)

- 🪶 **Zero runtime dependencies.** `dependencies: {}`. Nothing reaches your
  bundle beyond `react-native-svg`, which you already have.
- 🚫 **No Reanimated, no worklets, no native module, no config plugin.** Built
  on React Native's own `Animated`.
- 📱 **iOS, Android and web**, from the same code.
- 🔧 **A CLI that does the hard part** — turns a font glyph or an SVG into a
  single traceable outline and measures the perimeter React Native cannot
  measure at runtime.
- 🧩 **Merges overlapping contours**, so letters from real display faces
  actually trace instead of coming apart into pieces.
- ♿ **Respects Reduce Motion** — settles instantly, schedules nothing.

## Install

> **Not on npm yet.** Until the first release, install from GitHub:
>
> ```sh
> npm install praz-builds/react-native-logo-draw react-native-svg
> ```

```sh
npm install react-native-logo-draw react-native-svg
# or: yarn add / pnpm add / bun add
```

`react-native-svg` is the only peer dependency. If you are on Expo, use
`npx expo install react-native-svg` so you get the version matched to your SDK.

## Use it

```tsx
import { LogoDraw } from 'react-native-logo-draw';

export function Splash() {
  return (
    <LogoDraw
      path="M24,8 L84,50 L24,92 L24,70 L54,50 L24,30 Z"
      length={268.82}
      viewBox="0 0 100 100"
      size={120}
      color="#101014"
      duration={1200}
      onComplete={() => console.log('drawn')}
    />
  );
}
```

That is the whole API surface for the common case. `path` and `length` come
from the CLI:

```sh
npx react-native-logo-draw extract --svg logo.svg --name BrandMark
```

```
2 source contour(s) -> union -> 1 shape(s), 1 hole(s), 96 points, perimeter 402.01
verified: the outline fills the same area as the source (96x96 grid).
```

```ts
export const BrandMark = {
  path: 'M5,50L5.4,55.6L6.6,61.1L…Z',
  length: 402.01,
  viewBox: '0 0 100 100',
} as const;
```

Commit that file and spread it into the component:

```tsx
<LogoDraw {...BrandMark} size={96} color="#E4572E" />
```

## What people use it for

### Animate a logo on a splash screen

The case it was built for. Draw the mark while your fonts and bundle load, then
hand off to the app. The mark is geometry, not a glyph, so it renders before any
font has finished loading.

### Animate an SVG path in React Native

Any path works — an icon, an illustration, a route line on a map, a chart
stroke. If you can express it as SVG path data, it can be drawn on.

### Animate a signature or handwriting

Give it a signature captured as a path and it replays as if being written. Note
this is playback, not capture — if you need users to *sign*, use
`react-native-signature-canvas` and animate the path it gives you.

### Reveal an icon on first run

Short `duration`, `autoPlay={false}`, and a `play()` call on the ref when the
element scrolls into view.

## The CLI

```sh
# from a font glyph
npx react-native-logo-draw extract --font Brand.ttf --char K

# from an SVG file
npx react-native-logo-draw extract --svg mark.svg --name BrandMark

# machine-readable, for a codegen step
npx react-native-logo-draw extract --svg mark.svg --json > src/brand/mark.json
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--font <file>` | — | `.ttf` / `.otf` / `.woff` to read the glyph from |
| `--char <c>` | — | The character to extract, with `--font` |
| `--svg <file>` | — | An SVG file, or a file holding bare path data |
| `--box <n>` | `100` | viewBox edge length |
| `--size <pct>` | `86` | Percentage of the box the mark fills; the rest is optical margin |
| `--samples <n>` | `48` | Curve flattening resolution, per segment |
| `--simplify <n>` | `0.12` | Simplify tolerance, in viewBox units |
| `--precision <n>` | `2` | Decimal places in the emitted path |
| `--verify <n>` | `96` | Self-check grid edge; `0` skips it |
| `--name <Ident>` | `LOGO` | Constant name in the TypeScript snippet |
| `--json` | off | Emit JSON instead of a TypeScript snippet |
| `--out <file>` | stdout | Write to a file |

Diagnostics go to stderr and the payload to stdout, so `--json > mark.json`
does what you expect.

Installing the component does **not** install the CLI's dependencies. The CLI
is shipped pre-bundled, so `dependencies: {}` stays literally true.

## Why this exists

The naive version of this effect is four lines: put a `strokeDasharray` on a
path, animate `strokeDashoffset` to zero. It works beautifully in a browser and
falls apart the moment you try it on a real logo in React Native. Three
reasons.

### 1. Display faces draw one letter as several overlapping contours

This is the interesting one. Open a bold display face and look at the "K". In
Baloo 2 ExtraBold it is **four separate, unmerged, overlapping contours** —
stem-top, stem-bottom, arm, leg. Filled with nonzero winding it renders
perfectly, which is exactly why nobody ever notices.

Stroke-trace it and you get four disconnected rectangles, with seams straight
through the letterform. Nothing is wrong with the font; the shape simply was
never a single outline.

So the CLI flattens every contour to a polygon, **boolean-unions them into one
closed outline**, lightly simplifies, and measures the result. Along the way it
handles the two cases that make this more than one call to a boolean library:

- **Counters.** An "O" has a hole, encoded as a contour wound against its
  container. Union everything naively and the counter fills in. The loops are
  applied largest-first instead — union the ones wound like the outermost loop,
  subtract the ones wound against it — which also keeps the bar of a "B" alive
  inside the counter that contains it.
- **Self-crossing contours.** A bowl drawn as one lasso — round the outside,
  cross over, round the counter — is a single contour whose *winding* makes the
  hole. Hand that to a boolean library and the counter fills in. Every contour
  is split into simple loops at its crossings first, which turns winding into
  geometry.

Because that is a lot of judgement to apply silently, the CLI checks its own
work: it samples a grid and compares the fill of the extracted outline against
the fill of the source contours. If they disagree, it says so instead of handing
you a subtly wrong path.

### 2. React Native has no `getTotalLength()`

The web has `SVGGeometryElement.getTotalLength()`. React Native's SVG surface
does not, on any platform, so the number the dash animation interpolates cannot
be measured from the rendered node. It has to be a constant that travels with
the path — which is why `length` is a required prop rather than something the
component works out, and why the CLI computes it for you. Re-run the CLI
whenever the path changes.

### 3. Outline-then-fill reads as two steps

A mark that draws its outline, pauses, and then fills looks like two animations
that happen to share a shape. Overlapping them is what makes it read as one
gesture. `fillStart` is a percentage of the trace, defaulting to `70`: the ink
is already spreading while the pen is still moving, and it keeps going for a
beat after the pen lands.

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `path` | `string` | — | **Required.** SVG path data. Multiple subpaths are fine — the pen walks them in order. |
| `length` | `number` | — | **Required.** Total perimeter in viewBox units. Cannot be measured at runtime; use the CLI. |
| `viewBox` | `string` | `'0 0 100 100'` | viewBox the path is authored against. |
| `size` | `number` | `96` | Rendered edge length in points, both axes. |
| `width` | `number` | `size` | Override the width for a non-square mark. |
| `height` | `number` | `size` | Override the height. |
| `duration` | `number` | `1200` | Milliseconds for the trace. `0` renders the finished mark immediately. |
| `fillStart` | `number` | `70` | Percent of `duration` at which the fill begins, `0`–`100`. `100` makes the fill wait for the pen. |
| `fillTail` | `number` | `150` | Milliseconds the fill keeps going after the pen lands. |
| `strokeWidth` | `number` | `3` | In viewBox units, so it scales with `size`. |
| `color` | `string` | `'#000000'` | Stroke colour, and the fill unless `fillColor` is set. |
| `fillColor` | `string` | `color` | Split them for an outline in a second tone. |
| `fillRule` | `'nonzero' \| 'evenodd'` | `'nonzero'` | Extracted paths are wound so the default is right. |
| `strokeLinecap` | `'butt' \| 'round' \| 'square'` | `'round'` | |
| `strokeLinejoin` | `'miter' \| 'round' \| 'bevel'` | `'round'` | |
| `loop` | `boolean` | `false` | Repeat forever. |
| `loopDelay` | `number` | `600` | Pause on the finished mark before tracing again. |
| `delay` | `number` | `0` | Hold the un-drawn mark before the first trace. |
| `autoPlay` | `boolean` | `true` | Set `false` to drive it entirely from the ref. |
| `easing` | `EasingFunction` | `Easing.inOut(Easing.quad)` | The pen accelerates away and decelerates into the last corner. |
| `fillEasing` | `EasingFunction` | `Easing.out(Easing.quad)` | Ink spreads fast then slows; it never eases in. |
| `onComplete` | `() => void` | — | Once per completed cycle, including immediately under reduced motion. |
| `accessibilityLabel` | `string` | — | Omit it and the mark is hidden from assistive tech as decorative. |
| `style` | `StyleProp<ViewStyle>` | — | Applied to the wrapping `View`. |
| `testID` | `string` | — | |

### Ref

```tsx
const mark = useRef<LogoDrawHandle>(null);

<LogoDraw {...BrandMark} autoPlay={false} ref={mark} />
<Button title="Draw" onPress={() => mark.current?.play()} />
```

- `play()` — restart from the beginning, cancelling anything in flight.
- `reset()` — return to the un-drawn state and stop.

### Also exported

```ts
import { useReduceMotion, resolveTimeline } from 'react-native-logo-draw';
```

`useReduceMotion()` returns `true`, `false`, or `null` while the platform has
not answered yet. `resolveTimeline()` is the pure timing arithmetic the
component uses, if you want to line something else up with the trace.

## Accessibility

Reduced motion is honoured properly, not approximately. When
`AccessibilityInfo.isReduceMotionEnabled()` reports `true`, the component
renders the finished mark immediately, fires `onComplete` immediately, and
schedules nothing at all — and it keeps listening, so flipping the setting takes
effect without a remount.

It also waits for the platform to answer before doing anything. Starting on the
assumption of "no preference" and cancelling a frame later is exactly the flash
of motion the setting exists to prevent.

Without an `accessibilityLabel` the mark is marked decorative and hidden from
screen readers, which is right for a logo sitting next to its own wordmark. Give
it a label and it is announced as an image. Either way it never takes focus.

## How it compares

| | this | hand-rolled | [react-native-svg-animations](https://github.com/73R3WY/react-native-svg-animations) | Lottie |
| --- | --- | --- | --- | --- |
| Draw-on a path | ✅ | ✅ | ✅ | ✅ |
| Computes path length for you | ✅ | ❌ by hand | ❌ you supply it | n/a |
| Merges overlapping font contours | ✅ | ❌ | ❌ | n/a |
| Fill overlapping the trace | ✅ | ~ | ❌ | ✅ |
| Runtime dependencies | **0** | 0 | 0 | a native module |
| Complex multi-layer motion | ❌ | ❌ | ❌ | ✅ **use Lottie** |
| Designer hands you the asset | ❌ SVG only | ❌ | ❌ | ✅ After Effects |
| Maintained | ✅ | — | last commit Jan 2024 | ✅ |

If you need a multi-layer animation with easing curves authored by a designer,
use [Lottie](https://github.com/lottie-react-native/lottie-react-native); this
does one effect and does not compete with that. If you need one logo to draw
itself and do not want a native module in your graph, this is the smaller tool.

## Limitations

**`length` cannot be measured at runtime.** See above. If the number is too
small the mark starts partly drawn; too large and it sits invisible for a beat.
Regenerate it whenever the path changes — a test that asserts the constant is a
cheap way to catch a stale one.

**The animation runs on the JS driver.** `strokeDashoffset` is not one of the
props React Native's native animation driver can write, so this is
`useNativeDriver: false` and there is no way around it short of a native module,
which this library deliberately does not have. In practice it is one
interpolated prop on one node, which is cheap — but it does share the JS thread
with your work, so do not kick one off in the same frame as a navigation
transition.

**The CLI ignores `transform` attributes** and does not convert `<rect>`,
`<circle>` or `<polygon>` elements. Flatten transforms and convert shapes to
paths in your editor first; every vector editor has a one-click "object to
path".

**Winding, not even-odd.** The union reads winding direction to tell a counter
from a solid, which is what fonts and essentially every exported SVG use. An
`evenodd` source whose holes are wound the same way as their outlines will come
out solid — and `--verify` will tell you.

## Example app

```sh
cd example
npm install
npx expo start
```

Four marks, all generated from `example/marks/*.svg` by the CLI in this repo.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Prasanna

The component ships no dependencies. The `extract` CLI compiles opentype.js,
polygon-clipping and svgpath (and what those two had already inlined) into
`dist/cli.js` at publish time — every one of those licences travels with the
tarball in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
