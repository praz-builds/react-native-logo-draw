# Working with this package

You are a coding agent. Someone has asked you to make their logo draw itself on in a
React Native app, and pointed you here.

This file is the contract. `README.md` is the human-facing documentation; this is what
you need in order to not get it wrong.

---

## Ask before you build

You need four things, and three of them you cannot invent. Ask in one message rather
than interviewing the person one question at a time.

1. **The mark itself.** Either an `.svg` file, or a font file plus the character
   (`Brand.ttf` + `K`). If they offer a PNG or a JPEG, say you need a vector: this
   effect traces an outline, and a raster has none. Point them at exporting an SVG
   from Figma/Illustrator, or `potrace` for a clean high-contrast image. Do not try to
   trace a raster yourself.
2. **The colour.** Usually their brand accent. Ask whether the stroke and fill are the
   same colour — two-tone (dark outline, coloured fill) is a deliberate look, not a
   mistake, and `fillColor` exists for it.
3. **Where it appears.** A launch/splash screen, a loading state, an empty state, or on
   an event. This decides `loop` and `duration`, and they are not interchangeable:
   - **A wait of unknown length** (generating, uploading, fetching) → `loop`. The
     repeating draw is the progress signal. Do not use a one-shot here; a mark that
     draws once and then sits still reads as a hung app.
   - **A wait of known, short length** (fonts loading, a splash held for 800ms) →
     one-shot, `duration` at or under the wait. If the animation is longer than the
     wait, the user sees it cut off mid-stroke, which looks broken rather than polished.
   - **On an event** → `autoPlay={false}` plus `play()` on the ref.
4. **Whether the background is light or dark**, if they want the mark to invert.

If they cannot answer 3, default to `loop` for anything inside a loading state and
one-shot everywhere else, and say which you chose.

---

## The workflow

### Step 1 — generate the path with the CLI. Always.

```sh
npx react-native-logo-draw extract --svg logo.svg --name Logo
npx react-native-logo-draw extract --font Brand.ttf --char K --name Logo
```

**Never hand-write the `path` or `length`.** This is the single most important rule in
this file, and both halves of it fail silently:

- **Do not author `d` yourself, and do not lift it unchanged out of the source SVG.**
  Real logos and display typefaces routinely draw one shape as *several overlapping
  unmerged contours*. Filled with nonzero winding that renders perfectly — which is
  exactly why nobody notices — but stroke-traced it comes apart into disconnected
  pieces with seams straight through the mark. The CLI boolean-unions the contours into
  one traceable outline, splits self-crossing "lasso" contours at their crossings, and
  preserves counters (the hole in an `O`, both holes in an `8`). You will not reproduce
  that by inspection.
- **Do not guess `length`.** React Native has no `getTotalLength()`, so the perimeter
  cannot be measured at runtime and is a required prop. A wrong number does not throw;
  it produces a trace that finishes early or never finishes, and it looks like a bug in
  the library rather than a bad constant.

The CLI verifies its own output by default: it samples a grid and compares the fill of
the extracted outline against the source. If it prints a mismatch warning, **do not
ignore it** — try `--simplify 0` first, which resolves most of them (the default
Douglas-Peucker tolerance is the usual culprit, not the union).

### Step 2 — commit the generated constants

Put the CLI output in a checked-in file, with a comment saying it was generated and how
to regenerate it. Do not compute it at build time and do not fetch it at runtime.

```ts
// Generated: npx react-native-logo-draw extract --svg logo.svg --name Logo
export const Logo = {
  path: 'M11.78,7L32.8,7…',
  length: 449.68,
  viewBox: '0 0 100 100',
} as const;
```

### Step 3 — render it

```tsx
import { LogoDraw } from 'react-native-logo-draw';
import { Logo } from './logo';

<LogoDraw {...Logo} size={96} color="#FF6B1A" loop />
```

`react-native-svg` is a peer dependency and must be installed. On Expo use
`npx expo install react-native-svg` so the version matches the SDK.

---

## App icons are a separate command

If they also want an app icon — and if they are branding a launch screen, they usually
do — that is `icons`, not `extract`:

```sh
npx react-native-logo-draw icons --svg logo.svg --bg '#FF6B1A' --out-dir ./assets
npx react-native-logo-draw icons --font Brand.ttf --char K --bg '#FF6B1A' --out-dir ./assets
```

It emits four files and prints the `app.json` fragment to paste. Ask for the background
colour explicitly; `--bg` is required precisely because it is not guessable.

**Do not generate these by hand, and do not reuse one square PNG for all four slots.**
That is the default mistake and it produces three silent bugs, none of which fail a
build:

| File | The rule it exists to satisfy |
| --- | --- |
| `icon.png` | Full-bleed, **not** pre-rounded. iOS applies its own superellipse mask; rounding it yourself leaves the original corners visible outside the mask. |
| `icon-android-foreground.png` | Transparent, mark inset inside the centre **66%** safe circle. Android crops adaptive icons to a circle and eats roughly a third — a full-bleed foreground gets clipped. The colour moves to `adaptiveIcon.backgroundColor`. |
| `icon-notification.png` | **Solid white on transparent.** Android renders notification small-icons as a flat silhouette, so any colour becomes a white blob or a white square. `--fg` is deliberately ignored for this file. |
| `favicon.png` | 48px, where a letterform's counters close up if the mark is scaled naively. |

The command measures rather than assumes: it reports the ink-centre offset, the ink
radius against the safe-circle radius, and warns if a counter closes at favicon size.
If it warns, do not ship it — pick a simpler mark for the icon.

If the person already has icons and only wants the animation, skip this entirely.

## Things that will bite you

- **Reduced motion is handled for you.** The component reads
  `AccessibilityInfo.isReduceMotionEnabled()`, renders the finished mark instantly, and
  fires `onComplete` immediately. Do not add your own reduced-motion branch around it,
  and do not "fix" the fact that nothing animates in that state.
- **`strokeDashoffset` cannot use the native driver.** This is a React Native
  limitation, not an oversight. The animation runs on the JS thread. It is one
  interpolated prop on one node, which is cheap, but if the JS thread is blocked — say,
  by the very work the loading screen is covering — the animation will stutter. If the
  surrounding screen does heavy synchronous work, that is the thing to fix.
- **A mark on a coloured ground needs an explicit `color`.** There is no automatic
  contrast handling. On a brand-coloured splash, pass the light colour explicitly.
- **`size` is the box, not the glyph.** The path is normalised into a 100×100 viewBox at
  ~86% fill, so there is already optical margin. Do not add more padding around it and
  then wonder why the mark looks small.
- **If you change the source SVG, re-run the CLI.** The committed `length` belongs to
  the committed `path`. Editing one without the other is the failure mode this whole
  design exists to prevent.

---

## Before you say you are done

- The app builds and the mark renders — not just that types pass. Run it.
- The mark is not clipped: no counter has filled in, no piece is detached.
- On a wait of unknown length, it is looping.
- If the CLI printed a verification warning, it has been resolved rather than ignored.

---

## What this package does not do

- It does not animate multi-layer, multi-colour, designer-authored motion. That is
  [Lottie](https://github.com/lottie-react-native/lottie-react-native), and for that job
  Lottie is the right answer — say so rather than forcing this.
- It does not capture signatures. It replays a path someone already has. For capture,
  `react-native-signature-canvas`, then animate the path it gives you.
- It does not rasterise, resize, or host anything.
