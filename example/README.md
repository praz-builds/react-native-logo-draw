# Example app

```sh
npm install
npx expo start
```

Press `i`, `a` or `w` for iOS, Android or web — the component works the same on
all three.

`marks.ts` is generated, not written:

```sh
# from the repo root, after `npm run build`
node dist/cli.js extract --svg example/marks/monogram.svg --name Monogram
```

The SVG sources live in `marks/`. `monogram.svg` is deliberately drawn as four
overlapping rectangles, which is the case the CLI's union step exists for — try
stroking it without the union and you get four rectangles with seams through the
letter.
