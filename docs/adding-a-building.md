# Adding a building

Everything a building needs lives in one directory. The shell — viewport, camera,
stage rail, legend, takeoff, layout library, share codes — is shared and knows
nothing about any particular structure. It talks to a building through a single
object called `BUILDING`.

```
buildings/<id>/
  building.json          name, blurb and facts for the landing page
  src/10-spec.js         the defaults: dimensions, materials, openings, stages
  src/20-engineering.js  loads, member sizing, the checks worth failing on
  src/30-model.js        spec + openings → a flat list of parts
  src/40-panels.js       the panels particular to this building
  src/45-plans.js        printable drawing sheets, if it has any
  src/50-building.js     the BUILDING object (no DOM — the headless check reads it)
  checks.mjs             assertions only true of this building (optional)
  docs/                  sketches, notes, anything worth keeping
layouts/<id>/*.json      saved layouts, one file each
```

Add the directory and it appears: `tools/build.mjs` finds it, the landing page
lists it, CI checks and deploys it. There is no manifest to edit.

## `building.json`

```json
{
  "name": "Shop Building",
  "title": "Shop Building — 24' × 26'",
  "blurb": "One or two sentences for the landing-page card.",
  "facts": ["3D model", "truss cut list", "bracing check"],
  "status": "in use",
  "codePrefix": "SHOP1-"
}
```

`codePrefix` namespaces the share codes and the browser store, so a code from one
building will not silently load into another. Pick something short and distinct.

## The `BUILDING` object

Declared in `src/50-building.js`. Everything the shell asks of a building:

| key | what it is |
|---|---|
| `id` | must match the directory name |
| `name`, `title`, `codePrefix` | as above |
| `defaults()` | `{ spec, openings, extra }` — fresh copies, called on reset and to diff share codes |
| `stages` | `[{ key, name, blurb }]` — the build stages in the bottom rail |
| `build(spec, openings, extra)` | returns `{ parts, … }` — see below |
| `audit(spec, openings, extra)` | returns `[{ level, title, body }]` for the Review panel |
| `controls` | the fields in the Structure panel — see below |
| `controlsNote`, `resetLabel` | wording around those controls |
| `subtitle(spec)` | the line under the heading |
| `titleFacts(spec)` | `[[term, value]]` for the dimensions rail |
| `panels` | `[{ id, label, render }]` — the inspector tabs, in order |
| `footprint(spec)` | `[x, z]` in inches. Optional; defaults to `[spec.width, spec.depth]`. The shell uses it to aim the camera and to sort the cutaway, and nothing else. |
| `readout(o, spec)` | `{ title, body }` for the floating panel over the viewport when an opening is picked. Optional; the default states the offset, the head and the sill. |
| `extraPlanes(spec)` | more faces things can sit on, beyond the four walls — a ceiling, say. Optional. |
| `draggables(spec)` | `[{ id, plane, u, v, hw, hh, move(u, v), readout() }]` — anything besides an opening you can grab in the model. Optional. |
| `packExtra` / `unpackExtra` | how `state.extra` goes into a share code and comes back. Optional; without them the code carries only the spec and the openings. |

`50-building.js` must not touch the DOM at load time. `tools/check.mjs` runs the
model and the engineering in a bare VM with no `document`, so panel renderers are
referenced lazily (`render: () => renderOpenings()`) rather than called.

### Controls

Each entry is `{ g, k, label, type }` where `g` groups it under a heading and `k`
is the key it writes into `spec`:

- `sel` — a dropdown; needs `opts: [[value, label], …]`, plus `num: true` if the
  values are numbers
- `len` — a length, typed as `8'` or `8' 6"` or `102`, stored in inches
- `num` — a plain number
- `bool` — a checkbox

### Panels

The shell hands each panel an empty `<section id="panel-<id>">` and calls
`render()` whenever the model changes. A panel owns everything inside it,
scaffold included — nothing waits in the page shell. Panels that re-render on
every drag should build their scaffold once and refill it (see
`openingsScaffold`).

Four renderers come from the core and can be dropped into any building's panel
list unchanged: `renderControlsPanel`, `renderTakeoff`, `renderLayouts`, and the
legend and stage rail, which are not panels but are drawn on every render.

## Units and conventions

Everything internal is **inches**; feet only appear at the glass, through `fmtFt`
and `fmtIn`. The model is right-handed with **+Y up**, and `rx` rotates about X
because that is the axis a gable roof slopes around.

`build` returns `{ parts, … }` — anything else on the object is yours to use in
your own panels. A part is:

```js
{ id: 'p42',
  stage: 'walls',                 // which stage it appears in
  sys: 'framing',                 // system: picks its colour, decides the cutaway
  mat: 'lumber',                  // key into MATERIALS
  kind: '2x6 stud',               // what it is called in the takeoff and cut list
  geom: boxPart(centre, size),    // or prismPart / orientedBox / memberBox
  len, note, … }                  // optional extras
```

Geometry comes in three shapes: `box` (optionally rotated about X or on an arbitrary
basis), `prism` (a polygon extruded along X, for gable triangles) and `cyl` (a vertical
cylinder, for a pier). Adding a fourth means touching four places — `MeshBuilder`,
`aabb`, `partVolume` and the render dispatch — and `tools/check.mjs` will want to know
how to sanity-check its numbers.

`geom` positions are **centres**, not corners. Add parts through a small local
helper so the shape stays uniform:

```js
const add = (stage, sys, mat, kind, geom, extra) =>
  parts.push({ id: `p${seq++}`, stage, sys, mat, kind, geom, ...(extra || {}) });
```

### Weighing a part

For buildings where weight is a design driver rather than a curiosity, the takeoff
counts it four ways, in the order it trusts them:

| field | for |
|---|---|
| `lb` | somebody knows what it weighs — a tyre, an appliance |
| `lbft` + `len` | a section weight, for hollow steel whose bounding box is mostly air |
| `psf` + `area` | a sheet good. Skin, glazing and membranes are drawn at a thickness you can *see* rather than the thickness they are, so their volume is fiction and their area is not |
| nothing | volume × `DENSITY[mat]`, which is right for solid timber and concrete and wrong for nearly everything else |

Getting this wrong is quiet and large. It has happened twice: a fender box drawn as a
box and weighed as one became four tons, and a wall of 26 ga steel came out at thirty
pounds a square foot. Both were invisible in a total.

`node tools/weigh.mjs <id>` lists every part with how it was weighed and, for anything
falling back to volume × density, what that implies per square foot. Run it after adding
parts. Nothing asserts — a slab legitimately weighs what a slab weighs — but the implied
psf column gives a mis-weighed sheet away at a glance.

Parts carrying `steel` (a key into `STEEL`) and `len` also roll up into a steel
purchase table. `STEEL` holds tube and I sections computed from their geometry, and the
`REBAR` sizes, which carry their nominal ASTM weights instead — what you buy either way
is linear feet of a named size, so they share the table.

## Drawings

A building can also put working drawings on paper. `core/src/60-draw.js` is a small
drafting kit — page, scale, line weights, dimension strings, hatches, leaders,
keynotes, schedules, a title block — and a building declares a list of sheets:

```js
const PLANS = [
  { id: 'fdn', number: 'S1.0', title: 'Foundation plan', draw: drawFoundationPlan },
  …
];
{ id: 'plans', label: 'Plans', render: () => renderPlans('plans', PLANS, info), lazy: true }
```

Everything in the kit works in **points on the page**, 72 to the inch, because that is
the only unit in which a line weight means anything. `s.frame(x, y, scaleKey, modelBox)`
connects the two: after it, `s.mx()` and `s.my()` map model inches onto the page at a
real architectural scale, and `s.pickScale(w, h, availW, availH)` returns the largest
scale from the list that still fits — a drawing at a scale nobody owns a rule for is
worse than a smaller drawing.

Set the frame rather than wrapping it in local helpers. A section wants heights measured
*up* from a datum while a plan runs *down* the page, and the temptation is a local
`Y = (v) => s.my(-v)`; do that and every `s.callout()`, `s.dimV()` and leader in the kit
lands somewhere else on the sheet, because they all go through `s.my()`. Pass
`{ flipY: true }` and let the frame own the direction.

Each sheet gets its own **Print this sheet** button beside its caption, and the panel
gets one for the set. Printing one sheet is a class on the container, not a rebuild —
`printSheets(holder)`.

`s.callout()` takes a `width` and wraps to it. Use it — an unwrapped note beside a
detail is a line of type running off the edge of the sheet, and at 5-point type it takes
a screenshot to notice.

`s.clipTo(x, y, w, h)` cuts everything drawn after it to a window, which is what lets a
section be *broken*: two bands of the same drawing, each showing its own slice, with the
wall running off the edge of both rather than through the gap. Annotation should come out
from under the clip — a leader that reaches for clear space gets its text trimmed off
otherwise.

Sheets should read the model rather than restate it. Where a sheet does need its own
little layout function — where the anchor bolts go, where the posts land — check it
against the parts it is a drawing of in `checks.mjs`. That is the one thing a set of
drawings has always got wrong, and here it is a five-line assertion.

`lazy: true` on a panel means it only renders while it is the open tab. Use it for
anything expensive; six sheets of SVG is not something to redraw on every drag.

**Printing.** `window.print()` is wired to lift `#sheets` out to a container hanging
straight off `<body>`, because a nested scroller does not paginate — hiding its siblings
with `visibility` leaves their boxes in the flow and you get a stack of blank pages. The
`@page` size is written from the chosen paper, margins are zero, and each sheet is set to
its true page size, so printing at 100% gives a drawing a scale rule reads correctly.
`tools/interact-check.mjs` asserts every sheet has content, a stated scale and its title
block; the print path itself is checked by taking a PDF and counting the pages.

## Editing something that is not an opening

Openings are built into the shell because every building has them. Anything *else* a
building lets you edit lives in `state.extra`, which the shell carries around and never
looks inside: it passes it to `build(spec, openings, extra)` and `audit(spec, openings,
extra)`, hands it to the building's own packer for the share code, and otherwise leaves
it alone.

Three things make a collection editable:

```js
extraPlanes: (spec) => [{ id: 'C', axis: 1, val: ceilingY, n: [0, -1, 0],
                          uAxis: 0, vAxis: 2, both: true }],
draggables: (spec) => devices.map((d) => ({
  id: d.id, plane: d.wall, u: d.u, v: d.v, hw: 2, hh: 2,
  move: (u, v) => moveDevice(d, u, v),
  readout: () => ({ title: …, body: … }),
})),
packExtra: (extra) => extra.devices ? pack(extra.devices) : null,
unpackExtra: (x) => ({ devices: unpack(x) }),
```

`plane` names one of the wall ids or something `extraPlanes` added. `both: true` skips
the back-face cull, which a ceiling needs — you grab a light from above, and from there
the ray is going the wrong way. The shell tries draggables before openings, because a
4" box is a much tighter target than the five-foot window behind it.

Two things worth copying from the shop's electrical rough-in. **Generate a default and
only materialise it when somebody edits**: `packExtra` returning `null` keeps the share
code the length it has always been for everyone who never opened that tab. And **route
every edit through the owned copy** — a change written to the generated list lands
nowhere and vanishes on the next rebuild, which is a bug that looks like a rendering
problem.

## Controls inside a panel

`inlineControls(target, ['slabThickness', 'jointTransfer'])` drops named controls from
`BUILDING.controls` into any panel, so a knob can sit next to the number it moves instead
of in the Structure tab. They are the same widgets — changing one there changes it
everywhere.

## What the core already gives you

- `pickMember` over `LUMBER` and `LVL` — sizes a header, rafter, joist or beam
  against span, load and deflection
- `bestStock` / `splitRun` — buys real stock lengths and splices long runs
- `takeoff` — counts the parts list into sticks, sheets, concrete and fasteners
- `MeshBuilder`, `boxPart`, `prismPart`, `orientedBox` — boxes, extruded polygons,
  and boxes on an arbitrary basis
- `Viewport` — the WebGL renderer, camera, picking and edge pass
- share codes, the browser store and the published library, all keyed off
  `BUILDING.id` and `BUILDING.codePrefix`
- `Sheet`, `renderPlans`, `titleBlock`, `schedule`, `keynoteList`, `sheetNotes` — the
  drafting kit above

## Checking it

```sh
node tools/build.mjs <id>            # → buildings/<id>/dist/
node tools/check.mjs <id>            # headless model + engineering assertions
node tools/viewport-check.mjs <id>   # browser layout, 28 window shapes
node tools/interact-check.mjs <id>   # picking, dragging, every tab
node tools/weigh.mjs <id>            # every part, and how the takeoff weighed it
node tools/serve.mjs                 # assemble _site/ as CI does, serve on :8099
```

`tools/check.mjs` runs without a DOM, which means **it never loads `40-panels.js`**. A
panel that throws — a duplicate `const`, a call with the wrong argument list — is
invisible to it. `viewport-check` and `interact-check` are the only things standing under
that file, so when you touch a panel, run them.

`tools/check.mjs` asserts what is true of **every** building: finite geometry inside a
believable envelope, every stage producing parts, openings that reference real stock and
real walls, purchase lengths you can actually buy, weight that sums with its centre of
gravity inside the footprint, audit notes that are well formed, share codes that
round-trip, and a flagged default layout that carries no critical note.

Anything only true of *your* building goes in `buildings/<id>/checks.mjs`:

```js
export const api = ['trussGeometry', 'bracingCheck'];   // extra names to lift out of the VM

export function run({ A, spec, openings, model, take, fail, log, permute, flagged }) {
  const tr = A.trussGeometry(spec);
  if (Math.abs(tr.rise - 39) > 0.001) fail(`rise should be 39", got ${tr.rise}`);
  permute({ studSize: '2x6', studSpacing: 24 });        // rebuild and assert it survives
}
```

`A` holds everything lifted out of the page's scope. `permute(patch, label)` rebuilds
under a changed spec and checks it neither throws nor produces nonsense. Extend this
file; a check that cannot fail is not worth the runtime.

Serve rather than opening the file directly whenever the layout library is
involved: `fetch('../layouts/index.json')` needs the deployed directory shape.
