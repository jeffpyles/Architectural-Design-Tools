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
src/20-engineering.js   loads, header sizing, truss geometry, bracing, lean-to, foundation, audit
src/30-model.js         turns the spec into ~790 individual parts
src/40-panels.js        Openings, Review, Foundation and Truss panels
src/45-plans.js         the six drawing sheets
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
node tools/interact-check.mjs shop-building  # picking, dragging, every tab, every sheet
node tools/shoot.mjs '[{"name":"iso","stage":7}]'   # screenshots into build/
python3 tools/subset_fonts.py                 # only when the character set changes
```

`tools/check.mjs` is the one that matters. It rebuilds the model in plain Node, asserts
the truss geometry against hand calculations, verifies the wall segments tile, confirms
no girt crosses an opening, checks that every purchase length is a length you can
actually buy, solves the lean-to at both wall heights and every post count, reconciles
the foundation against itself, and re-runs the whole thing across nine spec permutations.

The foundation assertions are worth knowing about, because they are the ones that caught
a real error. They check the shape of each answer rather than its value: an edge is
always worse than mid-panel, thicker concrete is always less stressed, better soil always
needs less bearing width, a heavier wheel always wants more slab — and the post reactions
always sum to the load on them, which is exactly what a first pass got wrong. They also
assert that the building **cannot** change the slab stress and **cannot** change the
required footing width, because the panel says as much and a claim like that should fail
loudly if it stops being true.

Note for headless screenshots: launch Chromium with `--use-angle=swiftshader`. The plain
`--use-gl=swiftshader` path paints sibling DOM layers over the WebGL canvas at the wrong
offset, which looks like a rendering bug in the page and is not one.

## Loads

Site is outside Drain, Oregon, wooded on the west slope of the Coast Range foothills —
25 psf ground snow, 100 mph basic wind at **exposure B**, S_DS 0.75 g. Wind governs the
lateral design in both directions; seismic is checked and comes in well under it, because
a metal-skinned shop is light. All four are editable in the Structure tab.

## Foundation

The **Foundation** tab answers two questions that turn out to have nothing to do with
each other.

*What the building puts on the ground.* Not much: **567 plf** under the bearing walls,
which on 1,500 psf presumptive clay wants **4⁹⁄₁₆"** of bearing width. The 16" that gets
poured is set by frost depth and by detailing — somewhere to land a plate, a ½" bolt with
its edge distance, two bars in the bottom, and the fact that nobody digs a five-inch
trench. Doubling the snow load does not change the trench, and the check asserts that.

*What drives on the slab.* This is the number that matters, and the building has no say
in it. Westergaard — a wheel on an elastic plate over an elastic subgrade — for a
**2,500 lb** wheel at 80 psi, which is a loaded pickup or a small tractor. At 4,000 psi
concrete the working stress is 237 psi, and the answer depends on **where** the wheel is:

| | mid-panel | at a free edge |
|---|---|---|
| needs | 4" | 6" |

The deciding detail is not a load at all. The perimeter is not a free edge — the turndown
is poured monolithic with the slab and holds it up. The free edges are the contraction
joints inside, and there are five of them in a 2 × 3 panel layout. Dowel or key them and
a wheel crossing one is carried by both panels, so the interior case governs and 4" is
enough. Leave them as plain sawcuts and every joint is an edge, and it wants 6". That is
**two inches of concrete over 624 sf** riding on a detail that costs almost nothing.

The slab is drawn at 5", between the two, and the tab shows both cases so the trade is
visible rather than buried.

Everything else on the tab follows from those two: **#4 at 18" o.c. each way** for
shrinkage and temperature (0.0018 bh — every bar size that fits is listed, and the rule
picks the widest practical spacing rather than the biggest bar), 2 × #4 continuous in the
turndown, joints at 30 × the thickness, **22 × ½" anchor bolts** with the code minimum
governing over shear by a factor of three, and pads under the lean-to posts.

None of the slab steel makes the slab stronger. The thickness above assumes plain
concrete and has to work without it; the steel holds a crack tight *after* the crack
happens, which is why it only works at mid-depth on chairs. It is drawn there, inside the
pour, so the model hides it — the takeoff is where you see it.

### The lean-to post pads

The model already drew a pier under each post — 18" square, 36" deep, the same under all
three, at a size nobody had calculated. They are sized now, and the sizing is the part
worth reading:

- The posts carry **half** the lean-to. The other edge sits on a ledger bolted to the shop
  wall and goes down the building's own footing. `leanToDesign` already sizes the beam off
  that half, so `postFooting` uses the same number rather than inventing a second one.
- The posts do **not** share equally. The beam is sized as a simple span between posts, so
  it gets spliced over them: an interior post picks up half a span from each side, an end
  post half a span from one. With three posts the middle one takes twice what the ends do.

At 12' walls with the projection solved to its limit that is **1,872 lb** on an end post
and **3,743 lb** on the middle one — an 18" pad and a 24" pad, not one size for all three.
Fixed at a 10' projection it is 1,377 and 2,754 lb.

## Drawings

The **Plans** tab draws six sheets and prints them. They are not pictures of the model —
each one is a flat, dimensioned, annotated view at a real architectural scale, drawn from
the same model the viewport draws, so a plan cannot get out of step with the thing it is
a plan of.

| | | |
|---|---|---|
| **S1.0** | Foundation plan | slab edge, turndown, post pads, anchor bolts, contraction joints, apron, keynotes |
| **S1.1** | Foundation details | A — turndown at a bearing wall · B — lean-to post pad · C — slab at a contraction joint |
| **S2.0** | Framing plan | wall poché, openings with swings and sills, braced panels in red, opening schedule with every header |
| **S3.0** | Roof framing plan | every truss, ridge, purlins, roof-plane bracing bays, one-truss cut list |
| **A2.0** | Elevations | all four, openings tagged to the schedule |
| **E1.0** | Electrical plan | receptacles, switches, strip lights, sub-panel, with a legend drawn by the same routine as the symbols |

Print at **100%** — no "fit to page" — and a scale rule reads them. Paper is selectable
(letter, tabloid, A4, A3) and every sheet picks the largest architectural scale that
still fits it, so on letter the plans come out at 3/16" = 1'-0" and on tabloid at 1/4".

Two things make this trustworthy rather than decorative. The sheets read the model
directly wherever they can — the electrical plan draws the symbols off the parts in the
`elec` stage, so there is no second layout to drift. Where a sheet does need its own
layout function, `checks.mjs` asserts it against the parts it is a drawing of: every
anchor bolt drawn has a bolt under it, every pad drawn has a pad under it, every opening
tag is unique, and the plan extent holds everything it draws. Getting a plan out of step
with the model is the classic failure of a hand-drawn set; here it is a test.

The title block says **not for construction** on every page, because nothing here is
stamped.

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

## Still assumed rather than known

- **Frost depth.** 12" is the usual western Oregon figure; the building department sets it.
- **The soil.** 1,500 psf is the presumptive value the code allows with no report. Whether
  this clay is expansive changes the detailing rather than the width, and neither that nor
  the February water table is answerable from a desk. A test pit in the wet season settles
  both cheaply.
- **Cut, fill or native.** Engineered fill under a slab has to go in in lifts and be
  compacted to a tested density. Nothing here knows which the pad is.
- **Heating**, and therefore slab insulation, which is set to none. The edge is the part
  that matters and the part that cannot be added later: 2" of foam against the inside face
  of the turndown, two feet down, while the trench is open. Under-slab foam can wait.

## What it is not

Preliminary sizing for an ag-exempt building, not a stamped design. The 26' site-built
trusses in particular are a real structural element and want review before anyone cuts a
chord. If the steel skin gets counted as the diaphragm, that needs a fastening schedule
from someone who does post-frame work — the number in the tool is a placeholder.
