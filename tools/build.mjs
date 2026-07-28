#!/usr/bin/env node
/* Build every building into a self-contained page.

   Each one is core/src/*.js plus buildings/<id>/src/*.js, concatenated into a
   single scope with core's boot last, then wrapped in core/page.html with the
   stylesheet and fonts inlined. Artifacts run under a strict CSP with no
   external hosts, so nothing may be fetched at runtime. */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const b64 = (...p) => readFileSync(join(root, ...p)).toString('base64');

const FONTS = {
  FONT_SHOULDERS_BOLD: 'shoulders-bold.woff2',
  FONT_INSTRUMENT_REGULAR: 'instrument-regular.woff2',
  FONT_INSTRUMENT_BOLD: 'instrument-bold.woff2',
  FONT_MONO_REGULAR: 'mono-regular.woff2',
};

export function listBuildings() {
  const dir = join(root, 'buildings');
  return readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isDirectory() && existsSync(join(dir, n, 'building.json')))
    .sort()
    .map((id) => ({ id, ...JSON.parse(readFileSync(join(dir, id, 'building.json'), 'utf8')) }));
}

/* core first, the building next, core's boot last — the boot needs BUILDING
   to exist, and BUILDING is declared by the building. */
export function sourcesFor(id) {
  const coreDir = join(root, 'core', 'src');
  const bDir = join(root, 'buildings', id, 'src');
  const core = readdirSync(coreDir).filter((f) => f.endsWith('.js')).sort();
  const boot = core.filter((f) => f.startsWith('99-'));
  const rest = core.filter((f) => !f.startsWith('99-'));
  const bld = readdirSync(bDir).filter((f) => f.endsWith('.js')).sort();
  return [
    ...rest.map((f) => ['core/src/' + f, join(coreDir, f)]),
    ...bld.map((f) => [`buildings/${id}/src/` + f, join(bDir, f)]),
    ...boot.map((f) => ['core/src/' + f, join(coreDir, f)]),
  ];
}

/* The layout flagged `"default": true` in layouts/<id>/, carried into the page
   so it also opens that way where the library cannot be fetched — the Artifact
   host and anyone who opens the file directly. */
function defaultCode(id) {
  const dir = join(root, 'layouts', id);
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (d.default && d.code) return d.code;
    } catch (e) { /* build-layout-index.mjs is where bad JSON gets reported */ }
  }
  return null;
}

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
  + '<rect width="32" height="32" rx="4" fill="%230f5187"/>'
  + '<path d="M6 18 16 9l10 9v7H6z" fill="none" stroke="%23fff" stroke-width="2.4"/>'
  + '</svg>');

function buildOne(b) {
  let css = read('core', 'style.css');
  for (const [token, file] of Object.entries(FONTS)) {
    css = css.replace(`{{${token}}}`, b64('core', 'assets', 'fonts', file));
  }
  const files = sourcesFor(b.id);
  const js = [`/* ---- baked-in default layout ---- */\nconst BAKED_DEFAULT = ${JSON.stringify(defaultCode(b.id))};`]
    .concat(files.map(([label, path]) => `/* ---- ${label} ---- */\n${readFileSync(path, 'utf8')}`))
    .join('\n\n');

  const body = read('core', 'page.html')
    .replace('{{CSS}}', () => css)
    .replace('{{JS}}', () => `(function () {\n'use strict';\n${js}\n})();`);

  /* Two outputs from the same body: index.html is a complete document for the
     web, shop.html is body-only for the Artifact host which supplies its own
     shell. Served bare, the body-only file has no charset and no viewport. */
  const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${b.title || b.name}</title>
<meta name="description" content="${b.blurb || ''}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${FAVICON}">
</head>
<body>${body}</body>
</html>
`;

  const out = join(root, 'buildings', b.id, 'dist');
  mkdirSync(out, { recursive: true });
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(out, 'index.html'), standalone);
  writeFileSync(join(out, 'page.html'), body);
  writeFileSync(join(root, 'build', `preview-${b.id}.html`), standalone);

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`${b.id}`);
  console.log(`  dist/index.html  ${kb(Buffer.byteLength(standalone))}  (standalone)`);
  console.log(`  dist/page.html   ${kb(Buffer.byteLength(body))}  (body only, for the artifact)`);
  console.log(`  css ${kb(Buffer.byteLength(css))} with fonts · js ${kb(Buffer.byteLength(js))} from ${files.length} files`);
  return standalone;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2];
  const list = listBuildings().filter((b) => !only || b.id === only);
  if (!list.length) {
    console.error(only ? `no building called "${only}"` : 'no buildings found');
    process.exit(1);
  }
  for (const b of list) buildOne(b);
}
