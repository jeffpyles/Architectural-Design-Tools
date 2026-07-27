#!/usr/bin/env node
/* Concatenate src/ into a single self-contained page.
   Artifacts run under a strict CSP with no external hosts, so the fonts,
   the CSS and every line of JS have to live inside the file. */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const b64 = (...p) => readFileSync(join(root, ...p)).toString('base64');

const FONTS = {
  FONT_SHOULDERS_BOLD: 'shoulders-bold.woff2',
  FONT_INSTRUMENT_REGULAR: 'instrument-regular.woff2',
  FONT_INSTRUMENT_BOLD: 'instrument-bold.woff2',
  FONT_MONO_REGULAR: 'mono-regular.woff2',
};

let css = read('src', 'style.css');
for (const [token, file] of Object.entries(FONTS)) {
  css = css.replace(`{{${token}}}`, b64('assets', 'fonts', file));
}

const jsFiles = readdirSync(join(root, 'src', 'js')).filter((f) => f.endsWith('.js')).sort();
const js = jsFiles.map((f) => `/* ---- ${f} ---- */\n${read('src', 'js', f)}`).join('\n\n');

const page = read('src', 'page.html')
  .replace('{{CSS}}', () => css)
  .replace('{{JS}}', () => `(function () {\n'use strict';\n${js}\n})();`);

/* Two outputs from the same body:
   dist/shop.html   body only, for the Artifact host which supplies the shell
   dist/index.html  a complete document, for GitHub Pages or a local file
   Without the shell a phone renders at 980px and the page has no charset. */
const FAVICON = 'data:image/svg+xml,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + '<rect width="32" height="32" rx="4" fill="%230f5187"/>'
    + '<path d="M6 18 16 9l10 9v7H6z" fill="none" stroke="%23fff" stroke-width="2.4"/>'
    + '</svg>');

const standalone = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Shop Building — 24' × 26'</title>
<meta name="description" content="Interactive 3D model of a 24 by 26 foot shop: move the openings and read the framing, loads and material list off the model.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${FAVICON}">
</head>
<body>${body}</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'dist', 'shop.html'), page);
writeFileSync(join(root, 'dist', 'index.html'), standalone(page));

/* The browser tools load this, so a probe can never read a stale copy. */
writeFileSync(join(root, 'build', 'preview.html'), standalone(page));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`dist/shop.html   ${kb(Buffer.byteLength(page))}  (body only, for the artifact)`);
console.log(`dist/index.html  ${kb(Buffer.byteLength(standalone(page)))}  (standalone, for Pages)`);
console.log(`  css            ${kb(Buffer.byteLength(css))} (fonts inlined)`);
console.log(`  js             ${kb(Buffer.byteLength(js))} from ${jsFiles.length} files`);
