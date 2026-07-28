#!/usr/bin/env node
/* Collect layouts/*.json into layouts/index.json.
   Run at deploy time, so contributing a layout is one new file and there is
   no manifest to keep in step by hand. */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'layouts');

/* layouts/<building>/*.json — one directory per building, so the tool a layout
   belongs to is its location rather than something to remember to type. */
const rows = [];
for (const building of readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort()) {
  const bdir = join(dir, building);
  for (const f of readdirSync(bdir).filter((n) => n.endsWith('.json')).sort()) {
    let data;
    try { data = JSON.parse(readFileSync(join(bdir, f), 'utf8')); }
    catch (e) { console.error(`skipped ${building}/${f}: not valid JSON`); continue; }
    if (!data.code || typeof data.code !== 'string') { console.error(`skipped ${building}/${f}: no code`); continue; }
    rows.push({ file: `${building}/${f}`, tool: building, name: data.name || f.replace(/\.json$/, ''),
      note: data.note || '', code: data.code, ...(data.default ? { default: true } : {}) });
  }
}
writeFileSync(join(dir, 'index.json'), JSON.stringify(rows, null, 2) + '\n');
const byTool = rows.reduce((a, r) => ({ ...a, [r.tool]: (a[r.tool] || 0) + 1 }), {});
console.log(`layouts/index.json — ${rows.length} layout(s): `
  + Object.entries(byTool).map(([k, v]) => `${k} ${v}`).join(', '));
