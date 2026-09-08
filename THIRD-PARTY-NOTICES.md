# Third-party notices

`react-native-logo-draw` itself is MIT — see [LICENSE](LICENSE) — and the React
Native component it exists for has no dependencies at all.

The CLI is different. `npx react-native-logo-draw extract` needs a font parser,
a boolean-geometry engine and an SVG path parser, and `dependencies: {}` is a
promise this package makes to everyone who installs it. So those libraries are
compiled into `dist/cli.js` at publish time rather than installed: the code
ships, the install graph does not.

Bundling is redistribution. Every licence below travels with that copy, which is
what this file is for. The list is not hand-maintained guesswork — it is
everything esbuild's `metafile` reports as an input to `dist/cli.js`, plus the
packages that two of those inputs had already inlined into their own published
bundles before we ever saw them.

**Not everything here is MIT.** `robust-predicates` is released under the
Unlicense (a public-domain dedication). It imposes no attribution requirement,
but it is recorded below so a licence scan of this package reports the truth.

Nothing here is copyleft, and nothing here places any obligation on you for
merely *using* this package. The obligations are ours, and they are discharged
by this file shipping inside the tarball.

To regenerate the list of what is actually bundled:

```sh
node -e "require('esbuild').build({entryPoints:['cli/index.ts'],bundle:true,\
  platform:'node',format:'cjs',metafile:true,write:false}).then(r=>\
  console.log(Object.keys(r.metafile.inputs).join('\n')))"
```

---

## opentype.js 1.3.4

- **Licence:** MIT
- **Copyright:** Copyright (c) 2020 Frederik De Bleser
- **Licence text taken verbatim from:** `node_modules/opentype.js/LICENSE`
- **Why it is bundled:** Read glyph outlines out of .ttf / .otf / .woff files (`--font`). The published bundle `dist/opentype.js` is what esbuild inlines, and it in turn inlines the two packages listed immediately below.

```
The MIT License (MIT)

Copyright (c) 2020 Frederik De Bleser

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## tiny-inflate 1.0.3

- **Licence:** MIT
- **Copyright:** Copyright (c) 2015-present Devon Govett
- **Licence text taken verbatim from:** `node_modules/tiny-inflate/LICENSE`
- **Why it is bundled:** Not a direct dependency. opentype.js 1.3.4 declares `tiny-inflate: ^1.0.3` and inlines it into its published `dist/opentype.js`, so this code is present in `dist/cli.js`. The version stated is the one this repository resolves; the copy inside opentype.js's bundle was frozen at its own publish time.

```
MIT License

Copyright (c) 2015-present Devon Govett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## string.prototype.codepointat 0.2.1

- **Licence:** MIT
- **Copyright:** Copyright Mathias Bynens <https://mathiasbynens.be/>
- **Licence text taken verbatim from:** `node_modules/string.prototype.codepointat/LICENSE-MIT.txt`
- **Why it is bundled:** Not a direct dependency. opentype.js 1.3.4 declares `string.prototype.codepointat: ^0.2.1` and inlines it into its published `dist/opentype.js`. This is the one notice esbuild carries into `dist/cli.js` on its own, because upstream marks it `/*! ... */`.

```
Copyright Mathias Bynens <https://mathiasbynens.be/>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## polygon-clipping 0.15.7

- **Licence:** MIT
- **Copyright:** Copyright (c) 2018 Mike Fogel <mike@fogel.ca>
  Copyright (c) 2016 Alexander Milevski <info@w8r.name>
- **Licence text taken verbatim from:** `node_modules/polygon-clipping/LICENSE.md`
- **Why it is bundled:** The boolean union/difference engine behind the `extract` command. Its published bundle `dist/polygon-clipping.cjs.js` inlines robust-predicates (below) and requires splaytree (below) at runtime, so both are bundled too.

```
The MIT License (MIT)

Copyright (c) 2018 Mike Fogel <mike@fogel.ca> - covers everything not specially attributed to others below.

Copyright (c) 2016 Alexander Milevski <info@w8r.name> - covers all portions originally part of github:w8r/martinez, from which this project was forked on Febuary 2, 2018.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## robust-predicates 3.0.3

- **Licence:** Unlicense (public domain dedication) — NOT MIT
- **Copyright:** Vladimir Agafonkin. The authors dedicate all copyright interest in the software to the public domain; there is no copyright line to reproduce.
- **Licence text taken verbatim from:** `node_modules/robust-predicates/LICENSE`
- **Why it is bundled:** Not a direct dependency, and the only bundled licence that is not MIT. polygon-clipping 0.15.7 declares `robust-predicates: ^3.0.2` and inlines its `orient2d` adaptive-precision predicate into its published bundle, so that code is in `dist/cli.js`. The Unlicense imposes no attribution condition; this entry is recorded for completeness and for downstream licence scanners.

```
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
```

---

## splaytree 3.2.3

- **Licence:** MIT
- **Copyright:** Copyright (c) 2019 Alexander Milevski <info@w8r.name>
- **Licence text taken verbatim from:** `node_modules/splaytree/Readme.md (the package ships no separate LICENSE file)`
- **Why it is bundled:** Not a direct dependency. polygon-clipping requires it for its sweep-line status structure, and esbuild follows that `require` into the bundle.

```
The MIT License (MIT)

Copyright (c) 2019 Alexander Milevski <info@w8r.name>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## svgpath 2.6.0

- **Licence:** MIT
- **Copyright:** Copyright (C) 2013-2015 by Vitaly Puzrin
- **Licence text taken verbatim from:** `node_modules/svgpath/LICENSE`
- **Why it is bundled:** Parses and normalises SVG path data (`--svg`), including arc-to-cubic conversion.

```
(The MIT License)

Copyright (C) 2013-2015 by Vitaly Puzrin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
