# Architectural Design Tools

Interactive building models. Each tool draws a structure member by member, lets you
move the openings around, and recalculates the framing, the loads and the material list
as you go. Everything runs in the browser — no server, no dependencies at runtime.

**Live site:** https://jeffpyles.github.io/architectural-design-tools/

## Tools

| | |
|---|---|
| [`shop-building/`](shop-building/) | A 24' × 26' stick-framed shop with a 3/12 gable, built from a pair of pencil sketches. 3D model, truss cut list, racking check, material takeoff, eight build stages. |

## Layout library

`layouts/` holds building layouts that anyone can load from the live site. Each file is
one layout:

```json
{
  "tool": "shop-building",
  "name": "Openings ganged",
  "note": "10' walls, 9' × 8' door, openings grouped. Clears every wall line.",
  "code": "SHOP1-…"
}
```

`tools/build-layout-index.mjs` collects them into `layouts/index.json` at deploy time,
so contributing is one new file with no manifest to keep in step.

### Adding one

From the tool: **Layouts → Publish on GitHub**. That opens GitHub's own new-file page
with the layout filled in. If you can write to this repository it commits directly; if
you cannot, GitHub walks you into a fork and a pull request.

The page never holds a token. A static site has no way to keep a secret — anything it
could use to write here, every visitor could read out of the source and use to write
here too. Sending people through GitHub's own sign-in keeps the write path behind
whatever permissions this repository already has.

## Building locally

```sh
cd shop-building && node build.mjs   # → dist/index.html and dist/shop.html
node tools/check.mjs                 # headless model + engineering assertions
node tools/viewport-check.mjs        # browser layout check across window shapes

cd .. && node tools/serve.mjs        # assemble _site/ as CI does, serve on :8099
```

`tools/serve.mjs` is the one to use when touching anything to do with the layout
library — it reproduces the deployed directory layout, so the relative fetch for
`layouts/index.json` resolves the same way it will in production.

## Deployment

`.github/workflows/pages.yml` runs the model checks, builds each tool, collects the
layout index, and publishes to GitHub Pages on every push to `main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

## What these are not

Preliminary sizing for owner-built structures. Good enough to lay a building out and
argue about where the doors go; not a substitute for an engineer's review of anything
that holds a roof up.
