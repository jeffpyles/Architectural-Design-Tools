#!/usr/bin/env node
/* Collect layouts/*.json into layouts/index.json.
   Run at deploy time, so contributing a layout is one new file and there is
   no manifest to keep in step by hand. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'layouts');

const rows = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json').sort()) {
  let data;
  try { data = JSON.parse(readFileSync(join(dir, f), 'utf8')); }
  catch (e) { console.error(`skipped ${f}: not valid JSON`); continue; }
  if (!data.code || typeof data.code !== 'string') { console.error(`skipped ${f}: no code`); continue; }
  rows.push({ file: f, tool: data.tool || 'shop-building', name: data.name || f.replace(/\.json$/, ''),
    note: data.note || '', code: data.code });
}
writeFileSync(join(dir, 'index.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(`layouts/index.json — ${rows.length} layout(s)`);
