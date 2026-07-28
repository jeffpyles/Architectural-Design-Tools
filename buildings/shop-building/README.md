# Shop building — 24' × 26'

An interactive model of a shop building, built from two pencil sketches. It draws the
whole thing stud by stud, lets you slide the doors and windows along their walls, and
steps through the build from slab to drywall. Every number in the panels — headers,
truss cut list, racking check, lean-to reach, material takeoff — is derived from the
model, so nothing drifts out of sync with what you are looking at.

**Live:** https://jeffpyles.github.io/architectural-design-tools/shop-building/

## The building

24'-0" east–west × 26'-0" north–south, 12'-0" walls, 3/12 gable with the ridge running
east–west so the gable ends face the house. The trusses therefore span 26' north–south
and bear on the 24' north and south walls.

Default skin is the light, fast build: metal roof on purlins, metal siding on girts,
no structural sheathing except at the braced corners.

See [docs/sketch-notes.md](docs/sketch-notes.md) for how each mark on the sketches was
read, what was assumed, and what still needs an answer.

## Layout

This directory holds only what is particular to this building. The viewport, the stage
rail, the takeoff, the layout library and the rest of the shell live in
[`core/`](../../core/) and are shared — see
[docs/adding-a-building.md](../../docs/adding-a-building.md).

```
building.json           name, blurb and facts for the landing page
src/10-spec.js          dimensions, materials, window schedule, stages, walls
src/20-engineering.js   loads, header sizing, truss geometry, bracing, lean-to, audit
src/30-model.js         turns the spec into ~750 individual parts
src/40-panels.js        Openings, Review and Truss panels
src/50-building.js      the BUILDING object the shell reads — no DOM
docs/sketch-notes.md    how the sketches were read
dist/index.html         standalone page, what GitHub Pages serves
dist/page.html          the same body without the document shell, for the Artifact host
```

## Working on it

From the repository root:

```sh
node tools/build.mjs shop-building            # → dist/index.html and dist/page.html
node tools/check.mjs shop-building            # headless model + engineering assertions
node tools/viewport-check.mjs shop-building   # browser layout across window shapes
node tools/shoot.mjs '[{"name":"iso","stage":7}]'   # screenshots into build/
python3 tools/subset_fonts.py                 # only when the character set changes
```

`tools/check.mjs` is the one that matters. It rebuilds the model in plain Node, asserts
the truss geometry against hand calculations, verifies the wall segments tile, confirms
no girt crosses an opening, checks that every purchase length is a length you can
actually buy, solves the lean-to at both wall heights and every post count, and re-runs
the whole thing across five spec permutations.

Note for headless screenshots: launch Chromium with `--use-angle=swiftshader`. The plain
`--use-gl=swiftshader` path paints sibling DOM layers over the WebGL canvas at the wrong
offset, which looks like a rendering bug in the page and is not one.

## Loads

Site is outside Drain, Oregon, wooded on the west slope of the Coast Range foothills —
25 psf ground snow, 100 mph basic wind at **exposure B**, S_DS 0.75 g. Wind governs the
lateral design in both directions; seismic is checked and comes in well under it, because
a metal-skinned shop is light. All four are editable in the Structure tab.

## The racking problem

The south and west walls are short on bracing, and no choice of material fixes it. A
braced panel has to be 4'-0" wide, full height, unbroken — and with the openings where
the sketch puts them, neither wall has a run that long. Every option in **Racking
resistance**, from OSB everywhere to a steel diaphragm, leaves both walls at 0.00.

Only moving the openings changes it. The Review panel shows the widest unbroken run on
each wall against the 4'-0" a panel needs, so it is visible while dragging rather than
after.

## The lean-to

A 3/12 shed roof off the west wall reaches as far as headroom under the beam allows —
and the member depth that carries the longer reach is what eats the headroom, so the
solver bisects for the widest projection whose own rafter and beam still clear the
required height. Leeward drift is included, 26.2 psf over the first 6.1 ft.

With three posts: **8'-6⅛"** off 10' walls (beam capacity binds), **15'-8⅞"** off 12'
walls (headroom binds).

## Sharing a layout

The Layouts tab turns the whole building — spec and openings — into a ~350 character
`SHOP1-` code that survives an email and loads back exactly, and into a `?c=` link that
opens the same building directly. Layouts also save to the browser under a name.

Served from GitHub Pages, the tab additionally reads the shared library at
`../layouts/index.json` and offers to publish the current layout back through GitHub's
own new-file page, into `layouts/shop-building/`. Opened from a file or from the Artifact
host that fetch just fails and the section hides itself.

The page ships no layouts of its own. Everything on offer comes from the library, so
narrowing the design space is a matter of deleting files in `layouts/shop-building/`
rather than editing the tool.

## What it is not

Preliminary sizing for an ag-exempt building, not a stamped design. The 26' site-built
trusses in particular are a real structural element and want review before anyone cuts a
chord. If the steel skin gets counted as the diaphragm, that needs a fastening schedule
from someone who does post-frame work — the number in the tool is a placeholder.
