#!/usr/bin/env node
/* Write index.html from the buildings' own building.json files, so adding a
   building is a directory and nothing else to remember. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBuildings } from './build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const buildings = listBuildings();
const cards = buildings.map((b) => `  <a class="tool" href="${esc(b.id)}/">
    <h3>${esc(b.name)}</h3>
    <p>${esc(b.blurb || '')}</p>
    <div class="facts">${(b.facts || []).map((f) => `<span>${esc(f)}</span>`).join('')}</div>
  </a>`).join('\n');

const tpl = readFileSync(join(root, 'core', 'landing.html'), 'utf8');
writeFileSync(join(root, 'index.html'), tpl.replace('{{TOOLS}}', cards));
console.log(`index.html — ${buildings.length} building(s): ${buildings.map((b) => b.id).join(', ')}`);
