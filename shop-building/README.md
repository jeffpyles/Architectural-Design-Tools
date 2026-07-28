# Shop building — 24' × 26'

An interactive model of a shop building, built from two pencil sketches. It draws the
whole thing stud by stud, lets you slide the doors and windows along their walls, and
steps through the build from slab to drywall. Every number in the panels — headers,
truss cut list, racking check, material takeoff — is derived from the model, so nothing
drifts out of sync with what you are looking at.

The output is a single self-contained HTML file. No build server, no CDN, no
dependencies at runtime: it opens on a phone as readily as on a laptop.

## The building

24'-0" east–west × 26'-0" north–south, 12'-0" walls, 3/12 gable with the ridge running
east–west so the gable ends face the house. The trusses therefore span 26' north–south
and bear on the 24' north and south walls.

Default skin is the light, fast build: metal roof on purlins, metal siding on girts,
no structural sheathing except at the braced corners.

See [docs/sketch-notes.md](docs/sketch-notes.md) for how each mark on the sketches was
read, what was assumed, and what still needs an answer.

## Layout

```
src/page.html        page shell, with {{CSS}} and {{JS}} slots
src/style.css        design tokens and layout; font faces get inlined at build
src/js/00-params.js  spec, window schedule, stages, materials
src/js/10-engineering.js  loads, header sizing, truss geometry, bracing check, audit
src/js/20-model.js   turns the spec into ~720 individual parts
src/js/30-render.js  small WebGL renderer, no dependencies
src/js/40-takeoff.js material list and cut list, counted off the parts
src/js/50-ui.js      state, interaction, the six inspector panels
src/js/99-boot.js    startup
src/js/60-layouts.js share codes, browser-saved layouts, the repo library
assets/fonts/        subset woff2, committed so CI can build without fontTools
tools/check.mjs      headless model + engineering assertions
tools/viewport-check.mjs  browser layout assertions across window shapes and zoom
tools/               font subsetting, screenshots
dist/index.html      standalone page, what GitHub Pages serves
dist/shop.html       the same body without the document shell, for the Artifact host
```

## Working on it

```sh
python3 tools/subset_fonts.py   # only when the character set changes; output is committed
node build.mjs                  # → dist/index.html and dist/shop.html
node tools/check.mjs            # headless model + engineering assertions
node tools/shoot.mjs '[{"name":"iso","stage":7}]'   # screenshots into build/
```

`tools/check.mjs` is the one that matters. It rebuilds the model in plain Node, asserts
the truss geometry against hand calculations, verifies the wall segments tile, confirms
every purchase length is a length you can actually buy, and re-runs the whole thing
across five spec permutations.

Note for headless screenshots: launch Chromium with `--use-angle=swiftshader`. The plain
`--use-gl=swiftshader` path paints sibling DOM layers over the WebGL canvas at the wrong
offset, which looks like a rendering bug in the page and is not one.

## Loads

Site is Drain, Oregon — 25 psf ground snow, 100 mph basic wind at exposure C, S_DS 0.75 g.
Wind governs the lateral design in both directions; seismic is checked and comes in at
about a quarter of the wind demand, because a metal-skinned shop is light. All four are
editable in the Structure tab.

## Sharing a layout

The Layouts tab turns the whole building — spec and openings — into a ~350 character
`SHOP1-` code that survives an email and loads back exactly, and into a `?c=` link that
opens the same building directly. Layouts also save to the browser under a name.

Served from GitHub Pages, the tab additionally reads the shared library at
`../layouts/index.json` and offers to publish the current layout back through GitHub's
own new-file page. Opened from a file or from the Artifact host that fetch just fails
and the section hides itself.

The page ships no layouts of its own. Everything on offer comes from the library, so
narrowing the design space is a matter of deleting files in `layouts/` rather than
editing the tool. Opened somewhere the library cannot be reached, the tab says so and
points at the live site.

The layouts that used to ship as presets now live in `tools/check.mjs` as fixtures.
They were always regression material — encoder round-trip, and a known-good layout that
has to clear every wall line — rather than something a user should scroll past.

## What it is not

Preliminary sizing for an ag-exempt building, not a stamped design. The 26' site-built
trusses in particular are a real structural element and want review before anyone cuts a
chord. If the steel skin gets counted as the diaphragm, that needs a fastening schedule
from someone who does post-frame work — the number in the tool is a placeholder.
