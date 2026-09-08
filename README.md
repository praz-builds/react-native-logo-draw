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
- 🖼️ **And generates your whole app-icon set** — iOS, the Android adaptive
  foreground, the Android notification silhouette and the favicon, each obeying
  the rule that silently ruins it. See [App icons](#app-icons-for-expo-npx-react-native-logo-draw-icons).
- 🧩 **Merges overlapping contours**, so letters from real display faces
  actually trace instead of coming apart into pieces.
- ♿ **Respects Reduce Motion** — settles instantly, schedules nothing.

## Using this with a coding agent

If you are pointing Claude Code, Codex, Cursor or similar at this package, read
[`AGENTS.md`](AGENTS.md) — it covers what to ask for before starting, and the two
mistakes that fail silently (hand-writing the path, and guessing `length`).

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

### Generate the app icons from the same mark

`npx react-native-logo-draw icons` writes `icon.png`, the Android adaptive
foreground, the Android notification silhouette and the favicon, and prints the
`app.json` fragment. [Details below](#app-icons-for-expo-npx-react-native-logo-draw-icons).

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
| `--samples <n>` | `48` | Curve flattening resolution, per segment (max `512`) |
| `--simplify <n>` | `0.12` | Simplify tolerance, in viewBox units |
| `--precision <n>` | `2` | Decimal places in the emitted path |
| `--verify <n>` | `96` | Self-check grid edge; `0` skips it (max `1024`) |
| `--name <Ident>` | `LOGO` | Constant name in the TypeScript snippet |
| `--json` | off | Emit JSON instead of a TypeScript snippet |
| `--out <file>` | stdout | Write to a file, if nothing is there already |
| `--force` | off | Let `--out` overwrite an existing file |

Diagnostics go to stderr and the payload to stdout, so `--json > mark.json`
does what you expect.

`--out` will not overwrite a file that already exists — pass `--force` when you
mean to — and it will not write through a symlink at all.

`--samples` multiplies: every curve in the source becomes that many points
before any geometry runs. A detailed logo at a high `--samples` can reach
hundreds of thousands of points, and the command will stop and tell you to lower
it rather than grinding away silently.

Installing the component does **not** install the CLI's dependencies. The CLI
is shipped pre-bundled, so `dependencies: {}` stays literally true.

## App icons for Expo: `npx react-native-logo-draw icons`

```sh
npx react-native-logo-draw icons --svg logo.svg --bg '#FF6B1A' --fg '#FFFFFF'
npx react-native-logo-draw icons --font Brand.ttf --char K --bg '#FF6B1A'
```

```
icons/icon.png — 1024x1024, opaque, ink centre off by 0.00px, 15.3 KB
icons/icon-android-foreground.png — 1024x1024, transparent, ink centre off by 0.00px,
  ink radius 317px of 338px safe (20px spare), 12.2 KB
icons/icon-notification.png — 96x96, transparent, all-white silhouette, 1.2 KB
icons/favicon.png — 48x48, opaque, 1/1 counters open, 0.7 KB
```

It writes four PNGs and prints the `app.json` fragment that wires them up. The
four files are not four sizes of one picture — they are four different rules,
and **every one of them fails silently**. The build succeeds, the app installs,
and the icon is quietly wrong on somebody else's phone. Those rules are the
reason this command exists.

### Why your Android adaptive icon is cropped, cut off, or zoomed in

Android does not show your foreground image as you drew it. It masks adaptive
icons to a circle, a squircle or a rounded square depending on the launcher, and
it reserves the outer third of the canvas for the parallax it plays when you
scroll the home screen. **Only the centre 66% by diameter is safe.** A
foreground drawn full-bleed loses its edges — which, on a logo, is usually the
part that made it a logo.

So `icon-android-foreground.png` is transparent, and the mark is scaled to about
48% of the canvas height so that every inked pixel falls inside that safe
circle. The command then *measures* it: it decodes the PNG it just wrote, finds
the furthest inked pixel from the centre, and fails if that distance exceeds the
safe radius. The number is in the output above — `317px of 338px safe`.

The background colour does not go in that PNG. It goes in
`android.adaptiveIcon.backgroundColor`, because Android composites the two
layers itself.

### Why your Android notification icon is a white blob or a white square

Android renders a notification small-icon as a **monochrome silhouette**. It
keeps your alpha channel and throws every colour away. Ship your normal app icon
there and users see a featureless white rectangle — the shape of your
background, not the shape of your logo.

So `icon-notification.png` is 96x96, transparent, and the mark is drawn in solid
white whatever `--fg` says. The command decodes the file and asserts that every
non-transparent pixel is exactly `#FFFFFF`.

The tint you see in the shade comes from the plugin's `color`, not from the PNG.

### Why your iOS icon has corners peeking out of the rounded mask

iOS applies its own superellipse mask to `icon.png`. If you pre-round the
corners yourself, your rounded square sits *inside* Apple's, and the four
corners of your artwork show up as little nubs against the wallpaper.

So `icon.png` is full-bleed and opaque: the background runs edge to edge, all
four corners are the background colour, and there is no alpha channel at all.
Let the platform do the rounding.

### Flags

| Flag | Default | What it does |
| --- | --- | --- |
| `--font <file>` | — | `.ttf` / `.otf` / `.woff` to read the glyph from |
| `--char <c>` | — | The character to draw, with `--font` |
| `--svg <file>` | — | An SVG file, or a file holding bare path data |
| `--bg <hex>` | **required** | Background colour, and `adaptiveIcon.backgroundColor` |
| `--fg <hex>` | `#FFFFFF` | The mark itself |
| `--out-dir <dir>` | `./icons` | Where the four PNGs go |
| `--samples <n>` | `48` | Curve flattening resolution, per segment (max `512`) |
| `--force` | off | Overwrite files that are already there |

### What it writes

| File | Size | Alpha | The rule |
| --- | --- | --- | --- |
| `icon.png` | 1024x1024 | none | Full-bleed, opaque, glyph at 62% of the height, corners **not** pre-rounded |
| `icon-android-foreground.png` | 1024x1024 | yes | Glyph at 48%, every pixel inside the centre 66% safe circle |
| `icon-notification.png` | 96x96 | yes | Glyph at 70%, solid `#FFFFFF`, nothing else |
| `favicon.png` | 48x48 | none | Same design as `icon.png`, with the counters checked |

and, on stdout:

```json
{
  "expo": {
    "icon": "./icons/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./icons/icon-android-foreground.png",
        "backgroundColor": "#FF6B1A"
      }
    },
    "web": { "favicon": "./icons/favicon.png" },
    "plugins": [
      ["expo-notifications", { "icon": "./icons/icon-notification.png", "color": "#FF6B1A" }]
    ]
  }
}
```

### Optical centring, measured twice

Centring a glyph on its advance box leaves it visibly off, because the side
bearings are not inked — this is the single most common way a hand-made icon
looks subtly wrong. The command places the mark on its **ink** bounds, then
re-measures the *rendered* alpha and corrects what is left. Both the correction
and the final offset are in the output, so "it is centred" is a number you can
read rather than a claim.

The 48px favicon gets one more check: counters. A letterform's holes — the hole
in an "O", both holes in an "8", the wedge in a "K" — can close up at that size,
and a closed counter stops the mark from being that letter. The command finds a
point inside each counter and confirms it is still background.

### No native module, and still `dependencies: {}`

Every obvious way to write a PNG from Node — `sharp`, `canvas`, `@resvg/resvg-js`,
`skia-canvas` — ships a platform-specific native binary. That would break both
halves of what this package promises: a clean install graph, and `npx` working
on whatever machine you happen to be on.

So it does not use one. The geometry is already flattened to polygons by the
same pipeline `extract` uses, including the boolean union that keeps counters
open. Those polygons are scanline-filled into a coverage buffer — exact
horizontal coverage, supersampled vertically, honouring nonzero winding — and
encoded with a PNG writer built on Node's own `node:zlib`. It is about two
hundred lines and no dependency at all.

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

**The `icons` command does not do art direction.** It centres one mark on a flat
background at four sizes, and checks the four rules that make that correct. A
brand that needs a gradient, a badge, or a different composition at small sizes
still needs a designer — export those from your editor and skip the command.

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
