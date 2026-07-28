#!/usr/bin/env node
/* Every distinct part in a building, how the takeoff weighed it, and — for
   anything falling back to volume × density — what that implies per square
   foot.

   This exists because the same bug has bitten twice: a thing that is mostly
   air drawn as a solid box, and weighed as one. A fender box became four
   tons; a wall of 26 ga steel became thirty pounds a square foot. Both were
   invisible in a total and obvious in this list.

   Nothing here asserts. A slab legitimately weighs what a slab weighs, and no
   rule separates that from a hollow thing weighed solid — but a person
   reading the "implied psf" column spots it immediately.

   usage: node tools/weigh.mjs <building-id> */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'shop-building';
const src = [
  ...readdirSync(join(root, 'core/src')).filter((f) => /^[0-8]/.test(f)).sort()
    .map((f) => join(root, 'core/src', f)),
  ...readdirSync(join(root, 'buildings', id, 'src')).filter((f) => f.endsWith('.js') && !/^40-/.test(f))
    .sort().map((f) => join(root, 'buildings', id, 'src', f)),
].map((f) => readFileSync(f, 'utf8')).join('\n');

const ctx = vm.createContext({ Math, console, performance, Intl, Number, JSON,
  TextEncoder, TextDecoder, btoa, atob, Date });
vm.runInContext(`${src};globalThis.__a = { buildModel, takeoff, DEFAULT_SPEC, DEFAULT_OPENINGS, `
  + 'partWeight, DENSITY, partVolume };', ctx);
const A = ctx.__a;

const spec = { ...A.DEFAULT_SPEC };
const model = A.buildModel(spec, A.DEFAULT_OPENINGS.map((o) => ({ ...o })));

const g = new Map();
for (const p of model.parts) {
  const how = p.lb ? 'stated' : (p.lbft && p.len) ? 'section'
    : (p.psf && p.area) ? 'per sf' : A.DENSITY[p.mat] ? 'VOLUME' : 'none';
  const k = `${how}|${p.kind}`;
  const e = g.get(k) || { how, kind: p.kind, n: 0, lb: 0, area: 0 };
  e.n++; e.lb += A.partWeight(p); e.area += p.area || 0;
  g.set(k, e);
}
const rows = [...g.values()].sort((a, b) => b.lb - a.lb);
const tot = rows.reduce((a, e) => a + e.lb, 0);

console.log(`\n${id} — ${Math.round(tot).toLocaleString()} lb over ${model.parts.length} parts\n`);
console.log('  how          n       lb      %   implied psf  part');
let flagged = 0;
for (const e of rows) {
  const psf = e.area ? e.lb / e.area : null;
  /* A sheet good weighed by volume and coming out over 3 psf is drawn thicker
     than it is. Real gypsum is 2.2, ¾" ply 2.3, 26 ga steel 0.9. */
  const bad = e.how === 'VOLUME' && psf && psf > 3;
  if (bad) flagged++;
  console.log(`  ${e.how.padEnd(8)}${String(e.n).padStart(5)} ${String(Math.round(e.lb)).padStart(8)} `
    + `${(e.lb / tot * 100).toFixed(1).padStart(6)}  ${(psf ? psf.toFixed(2) : '—').padStart(11)}  ${e.kind}`
    + (bad ? '   <-- drawn thicker than it is?' : ''));
}
console.log(flagged ? `\n${flagged} suspicious row(s)` : '\nnothing obviously mis-weighed');
