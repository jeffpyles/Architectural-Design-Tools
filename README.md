# Architectural Design Tools

Interactive building models. Each one draws a structure member by member, lets you slide
the doors and windows around, and recalculates the framing, the loads and the material
list as you go. The shop building also puts the result on paper: dimensioned plans,
sections and elevations at real architectural scales, printed straight from the same
model. Everything runs in the browser — no server, no dependencies at runtime.

**Live site:** https://jeffpyles.github.io/architectural-design-tools/

## Buildings

| | |
|---|---|
| [`buildings/shop-building/`](buildings/shop-building/) | A 24' × 26' stick-framed shop with a 3/12 gable, built from a pair of pencil sketches. 3D model, truss cut list, racking check, slab and footing design, lean-to solver, material takeoff, and six printable drawing sheets. |
| [`buildings/tiny-house/`](buildings/tiny-house/) | A 12' × 34' tiny house on a steel trailer frame, framed around a set of salvaged windows. 3D model, window schedule, weight and centre of gravity, tow statics, material takeoff. |

The shell — viewport, camera, stage rail, legend, takeoff, layout library, share codes —
is shared. A building supplies its own spec, engineering, model and panels through a
single `BUILDING` object, and adding one is a new directory under `buildings/` with
nothing else to register. See **[docs/adding-a-building.md](docs/adding-a-building.md)**.

```
core/                shell: units, lumber, geometry, WebGL, takeoff, layouts, chrome
buildings/<id>/      one building: spec, engineering, model, panels, BUILDING
layouts/<id>/        saved layouts for that building, one file each
tools/               build, checks, local server
```

## Layout library

`layouts/<building>/` holds layouts anyone can load from the live site. Each file is one
layout, and its directory says which building it belongs to:

```json
{
  "name": "Openings ganged",
  "note": "10' walls, 9' × 8' door, openings grouped. Clears every wall line.",
  "code": "SHOP1-…",
  "default": true
}
```

`"default": true` marks the layout a tool opens with. A `?c=` code in the address bar
always wins over it, as does anything already changed on the visit.

`tools/build-layout-index.mjs` collects them into `layouts/index.json` at deploy time, so
contributing is one new file with no manifest to keep in step. The tools carry no
built-in layouts, so this directory is the whole menu — deleting a file here removes it
from the tool.

### Adding one

From the tool: **Layouts → Publish on GitHub**. That opens GitHub's own new-file page
with the layout filled in, under the right building's directory. If you can write to this
repository it commits directly; if you cannot, GitHub walks you into a fork and a pull
request.

The page never holds a token. A static site has no way to keep a secret — anything it
could use to write here, every visitor could read out of the source and use to write here
too. Sending people through GitHub's own sign-in keeps the write path behind whatever
permissions this repository already has.

## Building locally

```sh
node tools/build.mjs                 # every building → buildings/<id>/dist/
node tools/build.mjs shop-building   # just the one
node tools/check.mjs shop-building   # headless model + engineering assertions
node tools/viewport-check.mjs shop-building   # browser layout, 28 window shapes
node tools/interact-check.mjs shop-building  # picking, dragging, every tab
node tools/weigh.mjs tiny-house      # every part, and how the takeoff weighed it

node tools/serve.mjs                 # assemble _site/ as CI does, serve on :8099
```

`tools/serve.mjs` is the one to use when touching anything to do with the layout library —
it reproduces the deployed directory layout, so the relative fetch for
`layouts/index.json` resolves the same way it will in production.

Each building emits two files. `dist/index.html` is a complete document for the web;
`dist/page.html` is body-only, for an Artifact host that supplies its own shell.

## Deployment

`.github/workflows/pages.yml` checks every building's model, builds each page, collects
the layout index, writes the landing page from the buildings' own `building.json` files,
asserts the layout in a real browser, and publishes to GitHub Pages on every push to
`main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

## What these are not

Preliminary sizing for owner-built structures. Good enough to lay a building out and
argue about where the doors go; not a substitute for an engineer's review of anything
that holds a roof up.
