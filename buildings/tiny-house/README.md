# Tiny house on wheels — 12' × 34'

An interactive model of a tiny house on a steel trailer frame, built from a photograph of
a four-elevation window-placement sketch, a spreadsheet of salvaged window sizes, and a
SketchUp model of the trailer. It draws the frame, the studs, the lofts and the rafters,
puts each salvaged window roughly where the sketch puts it, and counts what the whole
thing weighs and where that weight sits.

**Live:** https://jeffpyles.github.io/architectural-design-tools/tiny-house/

**This is an early model.** Enough is still guessed that the "what is guessed" section
below matters, but three things are now settled and two of them change the design.

## The trailer

12'-0" × 34'-0", taken as given rather than checked:

- 2×6×.120 rectangular tube around the perimeter, on edge
- two 1½×6×.120 I-beams running the length at the third points
- 1½×4×.100 cross joists
- one wheel well a side, each covering a tandem pair
- a 1½×4×.100 diagonal each side, from the top of the wheel-well arch out to the rail 4'
  from the east end — not on the drawing, but on the trailer, and structurally the most
  important member in the overhang
- rear axle 12'-0" from the east end; wheel-well arch 17" above the deck
- no axles bought, and none expected for years

Section weights are computed from the geometry rather than looked up, so an odd size
still reports honestly. The tube weights land within a per cent of published HSS values.
The I-beams are **repurposed from a travel trailer frame** — formed sections, not rolled
— so the fabricated reading their `1½×6×.120` name invites is the right one: about
3.6 lb/ft each.

### What that frame will and will not do

**The beams alone:** two of them give 3.3 in³ and about **6.0 kip-ft**. That reconciles
with what they came off — a 28-foot travel trailer at 6,000 lb with a 7-foot rear
overhang wants 5.2 kip-ft. They were sized for exactly that and nothing more.

**Adding the 2×6 tube more than doubled it.** Two rails at 46 ksi give 12.2 kip-ft on
their own, so the frame now holds about **18.3 kip-ft — three times the beams alone.**

**Towed, with the overhang tie counted, it carries it.**

| | No tie | With the tie | Against 18.3 |
|---|---|---|---|
| Shell, 12,100 lb | 25.7 kip-ft | 4.3 kip-ft | 0.23× |
| Finished, ~23,000 lb | 48.8 kip-ft | 8.1 kip-ft | 0.45× |
| Heavy finish, ~30,000 lb | 64.2 kip-ft | 16.5 kip-ft | 0.90× |

**All of it static.** Trailer frames are normally checked against one and a half to three
times the static load for what the road does. At the expected finished weight a 2× road
factor puts it at 0.90 — at the line, not past it. At 30,000 lb it goes over.

### The overhang tie

The 1½×4×.100 diagonal from the wheel-well arch to the rail four feet from the end is
what makes those columns different. It props the cantilever partway out, turning 12 feet
of overhang into an 8-foot propped span with a 4-foot tip, and drops the moment about
sixfold.

The arch stands **17" above the deck**, which over the 8-foot run is **11.8°**. That is
shallow — every pound of lift still costs about five pounds of tension in the tie — but
it is enough: the tie develops the full prop force at shell weight and at a normal
finished weight, and only starts to limit above about 30,000 lb.

That angle is the whole game. At 8" of arch it would be 6.5°, the tie would top out at
3.3 kip of prop force, and the finished house would be 3× short. Nine inches of arch
height is the difference between towable and not.

If the finished weight climbs, the fix is the tie and only the tie: **2×4×.125 tube in
place of the 1½×4×.100** takes 30,000 lb from 0.90× to 0.55×. Its thrust into the rails
is 38 kip, which is 38% of allowable axial shared between them — not free, but not close
to governing either.

**Parked, none of it applies.** Blocked, the frame only spans between its cribbing, so
the demand is a choice: **crib it every 10 feet and it is comfortable at any weight this
house reaches.** Same reason a flatbed move works — the deck carries the frame the whole
way instead of hanging it off two points.

## What is guessed

| | |
|---|---|
| **Which end the tongue is on** | The sketch does not say. The statics do: the wheel wells sit east of the middle, and a trailer only tows with the hitch on the far side of its own centre of gravity from the axles. Hitch at the east end gives a *negative* tongue weight; at the west it comes out near 7%. So the model puts the tongue west. |
| **Wheel well position** | 17'-7" from the east end to its far face, 6'-8" long, read off the dimension string on the north elevation; scaling the same marks off the photograph gives 10'-0" and 7'-2". The **rear axle at 12'-0" from the east end** is measured, and is what the frame and tongue-weight sums use. |
| **#1, #2, #3 and #14** | Not in the spreadsheet at all. Sizes are scaled off the sketch and flagged **not measured** everywhere they appear. |
| **Which dimension is which** | The spreadsheet gives most windows as two numbers without saying which is width. The sketch settles it: #4 and #9/#10 are drawn wide, so they are landscape; the rest read as written. #12 and #13 say H and W explicitly. |
| **Rough openings** | Unit size plus ½" a side. Fine for a new window, optimistic for salvage — measure the frames. |
| ~~Wall build-up~~ | **Settled:** 2×4 at 24" o.c., metal siding on 2×4 girts, no exterior sheathing, batt between the studs, 7/16" OSB on the inside doing the bracing *and* the interior surface. |
| **Roof covering** | Standing seam, because nothing else works at this pitch — see below. |
| **Loft extents** | East 10'-4", west 5'-7", from the partition lines on the sketch. The heights come from the two horizontal lines on the gable elevations, which do not quite agree with each other; the model uses one number for both. |
| ~~Snow, wind, seismic~~ | **Settled:** near Drain, same as the shop. 25 psf ground snow, 100 mph basic wind at exposure B, S_DS 0.75. |
| **Where #12 goes** | Nowhere. It is on the schedule and not on any elevation, so it sits on the shelf. |

## The roof

Nine inches of rise over six feet is **1.5 in twelve**, and that is the single most
consequential number in the sketch. It rules out almost every covering:

- exposed-fastener corrugated metal wants 3/12, and 1/12 at the outside with sealed laps
- asphalt shingles stop at 2/12 and are a poor idea anywhere near it
- **mechanically seamed standing seam is rated to ¼:12** and is what the model assumes
- a single-ply membrane would also do it

Everything else on that roof — penetrations, the ridge, the eave edge — wants detailing
as though it were flat, because it very nearly is. If the intent was a covering rather
than a shape, raising the ridge is much cheaper now than later.

## The height envelope

Fourteen feet is what travels under a bridge, and every inch between the road and the
ridge cap counts against it. As drawn:

| | |
|---|---|
| Deck above the road | 18" |
| Side wall | 135" |
| Ridge rise | 9" |
| Rafter | 5½" |
| Roof deck and roofing | ~1" |
| **Road to ridge cap** | **168⁷⁄₁₆"** |
| Against | 168" |

**Seven sixteenths of an inch over.** The 135" is to the top of the wall plate with the
roof sitting on it, which is what puts the rafter into the stack. The tallest side wall
that fits, everything else unchanged, is **134⁹⁄₁₆"**. Trivially fixable — but the reason to care is what happens
next: the rafter depth is 5½" of that stack, so any change that makes the rafter deeper
comes straight out of the wall. Snow load, span, spacing and roof pitch all cash out here.

And the wall height is not free either way — it is buying headroom:

| | |
|---|---|
| Under the loft | 71¼" |
| In the loft, at the ridge | 58½" |
| In the loft, at the side wall | 49½" |

71¼" under the loft is under six feet. That, not the roof, is the real constraint on
dropping the side walls, and it is the same constraint the stair to the main loft has to
live inside.

## Wind

**Racking is comfortable, and sheathing the inside face is why.** The worst line is the
east gable at **1.63×** — 4,519 lb of broadside wind carried by two twelve-foot walls.
Everything else is better; the north wall runs at 11.5×. The shop's racking problem does
not repeat here because there every full-height run had to reach 4'-0" under the
prescriptive braced-wall tables, and here nothing is prescriptive: on a 135" wall the
limit is the 3½-to-1 aspect ratio, so a pier counts from **38⅜"** up.

**What is not comfortable is that nothing holds it down.** It sits on cribbing under its
own weight, which is a question a building bolted to a slab never has to answer:

| | Shell, 12,100 lb | Finished, ~23,000 lb |
|---|---|---|
| Sliding, friction ÷ wind | **0.91×** | 1.72× |
| Overturning, 0.6D ÷ wind | 1.32× | 2.50× |

Broadside wind is 4,671 lb against about 4,240 lb of friction on the blocks. **The
unfinished shell can slide**, and it is the state the building will sit in longest.
Ground anchors or a strap over the frame answer both rows.

**And the roof lifts.** At 1.5/12 the wind never presses on it — 6.7 psf net in the field
and 14.0 psf at the corners against a roof that weighs 6.8 psf. That is 80 lb on every
rafter and 168 lb at the ends. Every rafter wants a tie to the plate and the walls want a
continuous path down to the steel; toe-nails do not do this.

## The walls

2×4 at 24" o.c., 135" from the top of the frame. After the subfloor and the plates that
is a **129¾" stud** — cut from 12' stock with 14¼" of drop on every one, and past the
IRC's prescriptive tables, which stop at ten feet for a 2×4 bearing wall.

It works, at **58% of allowable**: l/d of 37, stability factor 0.19, about 1,010 lb a stud
against 1,740 allowable. But it only works because both faces are attached — girts outside
and OSB inside brace the thin way continuously. With neither face on, the same stud runs
at **305%**. Which is to say: a 129¾" 2×4 wall standing bare on the deck is very floppy,
and wants temporary bracing until it is skinned.

Putting the OSB on the *inside* is a good move. It braces the wall, it is the interior
surface, and it keeps the wall 3½" thick — one layer doing three jobs.

## Weight

About **12,100 lb** for the shell, or 29.7 lb per square foot of floor — steel, framing,
sheathing, skin, glazing, insulation and interior lining. No cabinets, no appliances, no
water, nobody in it. A finished tiny house usually lands near double its shell weight.

Tongue weight comes out at **14.1%** with the axles where they are, which is inside the
10–15% window a trailer tows straight in.

The Weight tab carries the centre of gravity, the tongue weight the axles would see where
the sketch puts them, and where they would have to move for 12½%. None of it constrains a
decision today — there are no axles and no plans to move. It is there because the answer
changes as the design does, and it is cheaper to know now than to find out with a house on
top.

At 12'-0" wide, any move is a permitted, pilot-car, daylight-hours job whatever ends up
underneath. Which is a good argument for designing it as a building and solving the move
if it ever comes up.

## Layout

```
building.json           name, blurb and facts for the landing page
src/10-spec.js          trailer, shell, window schedule, stages, walls
src/20-engineering.js   loads, member sizing, framing layout, weight and tow statics
src/30-model.js         turns the spec into every part
src/40-panels.js        Openings, Review and Weight panels
src/50-building.js      the BUILDING object the shell reads — no DOM
checks.mjs              the assertions that are only true of this building
```

From the repository root:

```sh
node tools/build.mjs tiny-house
node tools/check.mjs tiny-house
node tools/viewport-check.mjs tiny-house
node tools/shoot.mjs '[{"name":"iso","stage":7}]' tiny-house
```

## What it is not

Preliminary sizing for an owner-built structure, not a stamped design. The trailer is
taken as given and never checked — whether that frame carries this house is a question
for whoever built it or an engineer, not for this tool. The 12-foot rafter span and the
ridge beam are real structural members and want review before anything is cut.
