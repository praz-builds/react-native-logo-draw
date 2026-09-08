# docs

## `demo.gif`

The README's hero image: the monogram, the ring and the spark drawing
themselves on, looping.

It is **rendered, not screen-captured** — `render-demo.py` reads the same path
data the example app imports from `../example/marks.ts`, and reimplements the
component's timeline exactly: `resolveTimeline()`'s arithmetic from
`src/timeline.ts`, `Easing.inOut(Easing.quad)` on the trace,
`Easing.out(Easing.quad)` on the fill, and SVG's own rule that a dash pattern
restarts at each subpath (which is why the ring's two contours reveal at the
same time rather than one after the other).

Screen capture was tried first and abandoned: the animation is 1.2s and the
capture tooling tops out near 2fps, which cannot sample it. A render is the
honest option here precisely *because* it is derived from the shipped timing
constants rather than eyeballed — if the component's timing changes and this is
not re-run, the two diverge, so re-run it.

```sh
python3 -m venv /tmp/gif && /tmp/gif/bin/pip install pillow
/tmp/gif/bin/python docs/render-demo.py
```
