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
| `defaults()` | `{ spec, openings }` — fresh copies, called on reset and to diff share codes |
| `stages` | `[{ key, name, blurb }]` — the build stages in the bottom rail |
| `build(spec, openings)` | returns `{ parts, … }` — see below |
| `audit(spec, openings)` | returns `[{ level, title, body }]` for the Review panel |
| `controls` | the fields in the Structure panel — see below |
| `controlsNote`, `resetLabel` | wording around those controls |
| `subtitle(spec)` | the line under the heading |
| `titleFacts(spec)` | `[[term, value]]` for the dimensions rail |
| `panels` | `[{ id, label, render }]` — the inspector tabs, in order |
| `footprint(spec)` | `[x, z]` in inches. Optional; defaults to `[spec.width, spec.depth]`. The shell uses it to aim the camera and to sort the cutaway, and nothing else. |

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

Getting this wrong is quiet and large: a 0.5"-thick sheet of "metal panel" weighed by
volume turned a 34-foot wall into four tons of steel.

Parts carrying `steel` (a key into `STEEL`) and `len` also roll up into a steel
purchase table.

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

## Checking it

```sh
node tools/build.mjs <id>            # → buildings/<id>/dist/
node tools/check.mjs <id>            # headless model + engineering assertions
node tools/viewport-check.mjs <id>   # browser layout, 28 window shapes
node tools/serve.mjs                 # assemble _site/ as CI does, serve on :8099
```

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
