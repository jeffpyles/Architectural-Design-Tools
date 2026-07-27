# Reading the sketches

Two pencil sketches on engineer's graph paper: a plan and a west elevation. This is what
each mark was taken to mean, what had to be assumed, and what is still open.

## Orientation — the one thing worth double-checking

The plan is labelled `N` on top, `26'` down the right side, `24'` across the top, with
"House" written down the right margin and "ridge line parallel w/ house" on a line drawn
horizontally across the middle.

Read as: **24'-0" east–west, 26'-0" north–south.** The drawn rectangle measures about
600 × 645 px, and 24/26 = 0.923 against 600/645 = 0.930, so the proportions agree.

The ridge line is drawn across the 26' dimension at its midpoint, running east–west.
That makes the **east and west walls the gable ends** (26' wide) and the **north and
south walls the eave walls** (24' long, and therefore the bearing walls). Trusses span
26' north–south.

The elevation confirms it independently. Its drawn peak scales to roughly 3.5' of rise;
3/12 over a 13' half-span gives 3.25'. And its width-to-height ratio is about 2.36
against 26/12 = 2.17, closer than 24/12 = 2.00 would be. The sketches are self-consistent.

## Openings

| Wall | What the sketch shows | Modelled as |
|---|---|---|
| West (gable) | Window 1, Window 2, Window 1 north to south, all marked "high" | Heads aligned at 10'-0" |
| South (eave) | 10'w garage door toward the west end, then a window at "normal ht.", then a man door | Overhead 10'×10', window head 6'-6½", man door 3'0"×6'8" |
| East (gable) | Man door toward the north end, facing the house | 3'0"×6'8", head 6'-10½" |
| North (eave) | Nothing | Left solid — and it is the only wall line with real racking capacity |

The west elevation shows exactly the three windows the plan puts on the west wall:
`2.0 × 5.0`, `36½ × 5.0`, `2.0 × 5.0`. That match is what confirms the west wall is the
one drawn in elevation.

## Windows on hand

The sketch lists them H then W, and notes "(openings)" underneath — so these are rough
openings, not unit sizes, and no allowance was added.

| # | Height | Width | Qty | Used |
|---|---|---|---|---|
| 1 | 2'-0" | 5'-0" | 2 | Both, west wall, high |
| 2 | 36½" | 5'-0" | 2 | One west (high), one south (normal) |
| 3 | 28½" | 5'-6" | 1 | **Unassigned** |

Two readings needed confirming:

- `5.6` on window 3 was read as **5'-6"**, matching the `5.0` = 5'-0" convention used for
  the other two rather than 5.6 feet.
- Window 3 appears nowhere on either sketch. It is either a spare or intended for the
  north wall. Putting it on the north wall would cost bracing on the only wall line that
  currently has enough.

## Assumed, not drawn

| | Assumption | Why it matters |
|---|---|---|
| Ground snow | **25 psf**, unheated (Ct = 1.2) | Sizes every header and truss member |
| Wind | **100 mph** 3-second gust, exposure C → 14.4 psf ASD | Drives the racking check |
| Seismic | **S_DS 0.75 g**, R = 6.5 | Cascadia; checked and does not govern (see below) |
| Foundation | 4" slab, 16" × 24" monolithic turndown, 6" compacted base | Not mentioned on the sketches; the garage door implies a slab |
| Studs | 2x6 at 16" o.c., 139½" cut under a double top plate | 12'-0" is to the top of the double plate, per "12' walls" |
| Truss | Fink with a king post, 2x6 chords, ¾" plywood gussets both faces | The sketch is labelled "random guess on truss const." |
| Eave / rake | 16" and 12" | Not dimensioned anywhere |

## Truss geometry

Panel points at the third points of the bottom chord land the webs on 3-4-5 triangles:
every diagonal is **36.87°** and the lengths come out to exact half-inches.

| Member | Qty | Length | Cut |
|---|---|---|---|
| Top chord, 2x6 | 2 | 14'-9⁵⁄₁₆" | 3/12 plumb at the peak, 14.0° bevel at the heel |
| Bottom chord, 2x6 | 2 | 13'-0" | Square, spliced under the king post |
| Outer web, 2x6 | 2 | 2'-8½" | 36.9° both ends, parallel |
| Inner web, 2x6 | 2 | 5'-5" | 36.9° both ends, parallel |
| King post, 2x6 | 1 | 3'-3" | Square both ends |

The king post sits at midspan, which is also where the bottom chord splices — one gusset
does both jobs, and two 14' sticks make the 26' chord.

## Site: Drain, Oregon

Douglas County, Umpqua valley floor at roughly 300 ft. Wind governs the lateral design
in both directions, comfortably:

| Direction | Wind | Seismic | Governs |
|---|---|---|---|
| East–west | 2,555 lb | 1,154 lb | Wind, 2.2× |
| North–south | 2,077 lb | 1,154 lb | Wind, 1.8× |

Seismic is smaller because the building is light — metal skin, no masonry, 14,300 lb of
seismic weight all in. Worth having checked rather than assumed, given Cascadia.

These are the loads delivered to the roof plane, which then split between the two wall
lines that resist that direction. So the number each wall has to carry is half again:
1,278 lb east–west, 1,039 lb north–south. Both figures appear in the Review tab, and
the bars compare capacity against the per-wall number.

The base shear acts in full in whichever direction is being checked — it is not shared
between them. (An earlier version halved it, which understated seismic by 2×. Wind
governed either way, so no sizing changed.)

Exposure category is the one lever left on the wind number. **C** (open country) is
assumed. If the site is genuinely wooded or built up for a good distance in every
direction, **B** applies and the demand drops about 18%.

## The racking problem is a layout problem

Run every bracing option against the sketched opening layout and the south and west
walls read 0.00 in all of them:

| Bracing | N | S | E | W |
|---|---|---|---|---|
| OSB at the corners | 1.50 | **0.00** | 0.92 | **0.00** |
| OSB at every full-height run | 4.51 | **0.00** | 4.48 | **0.00** |
| Steel skin as diaphragm | 2.25 | **0.00** | 2.24 | **0.00** |
| Steel strap X-brace | 1.13 | **0.00** | 1.12 | **0.00** |

No sheathing choice moves those two walls, because a braced panel has to be at least
4'-0" wide and neither wall has a full-height run that wide. South: 2'-0", 2'-6", 6",
10". West: 3'-0½" four times. **Only moving openings fixes it.**

Ganging each wall's openings into one block, so the leftover solid wall lands in one
continuous run:

| Layout | N | S | E | W |
|---|---|---|---|---|
| As sketched | 1.50 | 0.00 | 0.92 | 0.00 |
| Ganged, 4'-0" corner panels | 1.50 | 0.75 | 0.92 | 0.92 |
| Ganged, 6'-0" corner panels | 2.25 | 0.81 | **1.39** | **1.39** |
| …south window moved off the south wall | 2.25 | **2.4** | 1.39 | 1.39 |

The west and east walls come right with wider corner panels alone. The south wall is
genuinely tight: 24'-0" of wall minus a 10' door, a 5' window and a 3' man door leaves
5'-10" total, and it needs 5'-4" in one unbroken run. Achievable, with nothing to spare.
Moving either the window or the man door off that wall settles it properly.

## Open questions

1. **Terrain around the site** — wooded/built up for a good distance (exposure B) or
   open (C)? Worth about 18% of the lateral demand. The house next door does *not*
   count: ASCE 7 does not allow a shielding reduction from a single adjacent building.
2. **Window 3** — spare, or somewhere on the north wall? The north wall is the only line
   with surplus capacity, so putting it there spends some of the margin.
3. **South wall layout** — move the window, move the man door, or narrow the overhead
   door to 9'? Any one of the three settles it.
4. **Attic ventilation.** Ridge vent plus gable louvres is the plan, which works at this
   pitch. Needs about 600 sq in of net free area: ~17 ft of ridge vent out of the 24 ft
   available, and ~150 sq in per gable louvre. Note that ridge and gable vents
   short-circuit a soffit intake, so if a raised heel and soffit vents ever get added,
   the gable louvres should be closed off at the same time.
5. **Exact opening positions.** The sketch has tick marks but no dimensions — which is
   what the drag-and-drop is for.
