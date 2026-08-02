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
src/40-panels.js        Openings, Review, Electrical, Foundation and Truss panels
src/45-plans.js         the ten drawing sheets
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

They can be **formed pads** or **Sonotubes**, and the trade is worth seeing rather than
assuming. A tube bears on its own end, so there is no spread — the footing *is* the pier,
and a round one bears on π/4 of what the same nominal square does:

| | bearing | pressure | concrete, all 3 |
|---|---|---|---|
| 24" square pad + pier | 4.00 sf | 1,086 psf | 0.50 cu yd |
| 24" Sonotube, full depth | 3.14 sf | 1,416 psf | 0.52 cu yd |

Same concrete, less bearing — what the extra diameter buys is an auger and an afternoon
instead of forming. If the diameter starts getting silly, a bell-bottom form spreads the
end without a formed pad; nothing here models one, so it would want sizing separately.

## Drawings

The **Plans** tab draws ten sheets and prints them, whole set or one at a time. They are not pictures of the model —
each one is a flat, dimensioned, annotated view at a real architectural scale, drawn from
the same model the viewport draws, so a plan cannot get out of step with the thing it is
a plan of.

| | | |
|---|---|---|
| **S1.0** | Foundation plan | slab edge, turndown, post footings, anchor bolts, contraction joints, apron, keynotes |
| **S1.1** | Foundation details | A — turndown at a bearing wall · B — lean-to post footing · C — slab at a contraction joint |
| **S2.0** | Framing plan | wall poché, openings with swings and sills, braced panels in red, opening schedule with every header |
| **S2.1** | Wall section | footing to eave in one cut, broken through the middle of the wall so it draws at 1/2" instead of 1/4" |
| **S2.2** | Building section | the transverse cut: both bearing walls, the truss across them, the lean-to if it is on a wall this cut runs through |
| **S3.0** | Roof framing plan | every truss, ridge, purlins, roof-plane bracing bays |
| **S3.1** | Truss shop drawing | the truss at scale, every member length and cut angle, gussets drawn at cut size, heel/peak/panel-point joints blown up to nail from |
| **A2.0** | Elevations | all four, openings tagged to the schedule |
| **A6.0** | Door & window schedule | every opening with its rough opening, head, sill and header, plus head, jamb and sill details drawn from the wall build-up you have selected |
| **E1.0** | Electrical plan | every box in the rough-in with its circuit number, a legend drawn by the same routine as the symbols, and the panel schedule |

The schedule and the details share a sheet on purpose: the head detail is only true if
the header in the schedule is the header that gets cut, and both come off the same
`sizeHeader` call. The three details are drawn from `wallLayers(spec)`, so switching from
girts to sheathing or from metal panel to lap siding redraws them rather than leaving a
drawing of the old assembly on the sheet — and a check asserts the drawn extent holds its
own trim in all four combinations, which is the bug that first put a 1x4 outside the edge
of the detail.

Print at **100%** — no "fit to page" — and a scale rule reads them. Each sheet has its
own **Print this sheet** button, because most of the time you are walking out to the job
with one drawing rather than the set. Paper is selectable
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

## Electrical rough-in

The **Electrical** tab is the rough-in as a list you can edit. Drag a box across its wall
in the model, or set it in the panel; ceiling boxes drag on the ceiling plane, so look
down into the building to grab one. Arrow keys nudge the selected box a half inch,
shift-arrow six.

Each box carries a size, how many cables come into it, which circuit it is on, and what
is in it — receptacles, GFCIs, switches, three-ways, dimmers, 240 V, data, blanks,
fixtures.

**Circuits** are things you make and name, not numbers you type into every box and hope
match. Add one, call it what you will go looking for at the panel — *welder*,
*compressor* — and pick it from a list on each box. Deleting one moves its boxes to the
lowest circuit left and tells you how many it moved; the last one cannot be deleted,
because a box has to be on something. Unnamed circuits get a name off what is on them:
lights make a **Lighting** circuit, a lone outlet a **Dedicated outlet**, a 14-50 a
**240 V**. Two calculations follow, and neither of them designs anything:

**Box fill**, NEC 314.16, counted the way the section counts: one allowance for every
conductor coming in, one for all the equipment grounds together, one for the clamps if
the box has them, and **two for every yoke**. 2.25 cu in each at 12 AWG. The grounds and
the clamps are the two everybody forgets, and two yokes in a one-gang box is the mistake
that ends with a box cut out of finished drywall. Every box shows its fill against its
volume, and anything over says what the smallest box that holds it is.

**Circuit loading**, NEC 210 and 220: 180 VA per general-purpose receptacle outlet,
fixtures at their wattage, lighting counted at 125% because that is how a breaker is
sized for anything running three hours. A general-purpose 120 V circuit is 20 A on 12
AWG and stays that way — if what you have put on one needs more, the tool says so rather
than silently upsizing the wire, because the answer is another circuit. Thirteen outlets
is what a 20 A circuit is worth at 180 VA each, and that is checked too.

The tool starts you with a rough-in — a perimeter circuit at bench height, three rows of
lights, a switch beside each man door, the opener on its own so a stuck door does not
take the lights out. It stays generated until you touch something, at which point it
becomes yours and the layout code starts carrying the boxes (about 350 characters →
about 1,300). There is a button to hand it back.

One device list feeds the viewport, the panel, the box-fill check, the review notes and
E1.0, so none of them can disagree with another.

## The racking problem

The south and west walls are short on bracing, and no choice of material fixes it. A
braced panel has to be 4'-0" wide, full height, unbroken — and with the openings where
the sketch puts them, neither wall has a run that long. Every option in **Racking
resistance**, from OSB everywhere to a steel diaphragm, leaves both walls at 0.00.

Only moving the openings — or changing their size — changes it. The Review panel shows
the widest unbroken run on each wall against the 4'-0" a panel needs, so it is visible
while dragging rather than after.

## Openings

Every opening card carries a **rough width** and **rough height** you can type into. The
sizes in `10-spec.js` are what the sketch lists; the numbers on the card are what the
hole actually is, and they win. Change one and the header re-sizes from the new span,
the cripples and girts re-lay themselves around it, the elevations and the A6.0 schedule
redraw, and the braced runs on that wall grow or shrink accordingly.

The window list is a count of units sitting in the shop, so an opening resized away from
its stock size stops being one of them: the inventory hands the unit back and the card
tags it *resized*. That is deliberate — a 10' overhead door cut down to 9' is a different
door to buy, not the same one moved.

**+ Custom window**, **+ Custom man door** and **+ Custom overhead** make an opening with
nothing on the shelf behind it, sized only by what you type. It gets a tag, a header, a
row in the schedule reading *Not on hand — to buy*, and travels in the share code like
any other opening.

## Comparing skins

The **Compare** tab holds every siding and roofing option against each other on this
building — weight, material cost, and hours for one person working alone. Every row is a
real rebuild with that one thing swapped, so the weight is the number the Weight tab will
show once you pick it.

Against the default (26 ga metal on girts, metal roof, 127,514 lb):

| siding | weight | cost |
|---|---|---|
| Aluminium ribbed panel | −453 lb | +$2,295 |
| Aluminium lap siding | −704 lb | +$874 — **needs sheathing** |
| Lap siding | +1,186 lb | +$437 |
| Cedar shakes | +967 lb | +$6,119 |

Weight is mostly a curiosity on a slab — the shop is 127,000 lb and 40,000 of that is the
compacted base under it. Cost and hours are the columns that matter here, and the one that
decides most of it is labour: cedar shakes are 6.5 hours per hundred square feet against
1.6 for a metal panel, which on this building is three extra weeks of weekends.

The tab refuses to let you pretend two things. Anything coursed or flat — cedar, the
stamped aluminium shake, aluminium lap — needs ⅜" of nailable sheathing behind it, and
this wall is girts. And a lapped roof panel or a shingle wants 3/12 or steeper, which the
3/12 default only just clears; drop the pitch and the row goes red.

Prices are ballpark as of August 2026, material only, and you can type your own over any
of them — they travel with the layout.


## The lean-to

A 3/12 shed roof off the west wall reaches as far as headroom under the beam allows —
and the member depth that carries the longer reach is what eats the headroom, so the
solver bisects for the widest projection whose own rafter and beam still clear the
required height. Leeward drift is included, 26.2 psf over the first 6.1 ft.

### How the rafters meet the beam

Sitting them **on top** is the simple build: beam up, rafters across it, done. It also
stacks the two, so what hangs below the roof line is the rafter depth *plus* the beam
depth.

Hanging them off the **face** — sloped-seat face-mount hangers, rafter top flush with the
beam top — puts the two in one band, so what hangs below is whichever is *deeper*, not
the sum. Off 12' walls that is 18¹³⁄₁₆" down to 11⅝", and since reach is set by headroom
the saving comes back as projection:

| | on top | hung off the face |
|---|---|---|
| Reach at 12' walls, 3 posts | 15'-8⅞" | **18'-1⅝"** |
| Below the roof line | 18¹³⁄₁₆" | 11⅝" |

The costs are real and both are enforced: a hanger at every rafter, and the beam has to
be at least as deep as the rafter for a face-mount hanger to land on — `pickMember` takes
a `minDepth` for exactly that, and a check asserts no flush beam ever comes out shallower
than its rafters.

### Rafter size and spacing

`leanToRafter` takes `auto` or a size, and spacing runs 12" to 48". Naming a size that
cannot carry it does not get overruled — it reports what it costs, because the trade is
not a structural question:

| Rafters | Reach | Headroom |
|---|---|---|
| 2x6 | 9'-6" | 8'-8¼" |
| 2x8 | 12'-7⅞" | 7'-10¹³⁄₁₆" |
| 2x10 | 16'-0⅛" | 7'-2⁷⁄₁₆" |
| 2x12 | 18'-1⅝" | 6'-6" |

Deeper rafters buy reach and spend headroom. Which of those you want is up to you.

## Saving and sharing a layout

A layout is the whole building — spec, openings, and the electrical rough-in. The
Layouts tab names it once and saves it four ways: **a file** on this computer, **this
browser**, **the shared library** on GitHub, and **a code** to paste.

The file is the one to reach for. It is JSON holding the code plus the building id, the
name, the date and a dozen lines of plain description, so a folder of them is readable
without loading any of them. Drop one back on the panel, or pick it with the button —
and a file saved from the tiny house is refused by name rather than half-loaded.

The `SHOP1-` code is still there for a quick paste, and the `?c=` link still opens the
building directly. But the code was designed when a layout was a dozen numbers; it now
carries the openings and the electrical rough-in and runs past 1,400 characters, so the
panel states its length and says plainly when a file would travel better. Pasting copes
with the wrapping mail will do to it — `decodeLayout` strips whitespace — but a
1,400-character line is not something to make somebody hand-carry.

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
