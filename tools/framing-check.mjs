/* Sanity pass over the framing plan, for every saved layout.

   The plan is a second reading of the model — it splices plates the model
   draws in one piece and re-sizes headers the model sized from roof load
   alone. Both are places where a plan can quietly stop describing the
   building, so the checks below are about conservation and shape: the
   pieces add up to the walls, nothing is cut longer than a stick, a splice
   lands on a stud, and a longer stick never costs more wood.

   usage: node tools/framing-check.mjs [layout.json ...] */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from './framing-plan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (m) => console.log(`  ok  ${m}`);
const near = (a, b, t = 0.02) => Math.abs(a - b) < t;

function layouts() {
  const given = process.argv.slice(2);
  if (given.length) return given;
  const dir = join(root, 'layouts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => readdirSync(join(dir, e.name))
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(dir, e.name, f)));
}

for (const path of layouts()) {
  const src = readFileSync(path, 'utf8');
  let P;
  try { P = F.plan(src); } catch (e) {
    if (e instanceof F.Unsupported) { console.log(`\n--  ${relative(root, path)}: ${e.message}`); continue; }
    fail(`${relative(root, path)} threw: ${e.message}`); continue;
  }
  const { A, spec, plates, hdrs, list, sticks, screws, stick, trim } = P;
  const name = `${P.file.name} (${P.file.tool})`;
  console.log(`\n${name} — ${relative(root, path)}`);
  const usable = stick - trim;

  /* 1. plates: the pieces are the run, and every break is on a stud */
  for (const r of plates) {
    const sum = r.segs.reduce((s, v) => s + v, 0);
    if (!near(sum, r.len)) fail(`${r.wall} ${r.course}: pieces total ${F.inches(sum)}, run is ${F.inches(r.len)}`);
    if (r.segs.some((v) => v > usable + 0.01))
      fail(`${r.wall} ${r.course}: a piece is longer than ${F.inches(usable)}`);
    if (r.segs.length > 1 && r.segs.some((v) => v < spec.studSpacing - 0.01))
      fail(`${r.wall} ${r.course}: a piece is shorter than one bay`);
    let at = r.inset;
    for (const v of r.segs.slice(0, -1)) {
      at += v;
      const off = ((at - 0.75) % spec.studSpacing + spec.studSpacing) % spec.studSpacing;
      if (!near(off, 0) && !near(off, spec.studSpacing))
        fail(`${r.wall} ${r.course}: splice at ${F.inches(at)} is not on a stud centre`);
    }
  }
  ok(`${plates.length} plate runs add up, break on a stud, and stay under ${F.inches(usable)}`);

  /* 2. the two top plates never break in the same bay */
  for (const wall of ['N', 'S', 'W', 'E']) {
    const cut = (c) => {
      const r = plates.find((r) => r.wall === wall && r.course === c);
      const out = []; let at = r.inset;
      for (const v of r.segs.slice(0, -1)) { at += v; out.push(at); }
      return out;
    };
    for (const a of cut('top plate, lower')) for (const b of cut('top plate, cap')) {
      if (Math.abs(a - b) < spec.studSpacing - 0.01)
        fail(`${wall}: top plates both break near ${F.inches(a)}`);
    }
  }
  ok('the cap breaks at least one bay clear of the plate under it');

  /* 3. nothing is over-packed, and every piece is in exactly one stick */
  let overfull = 0;
  for (const s of sticks) {
    const need = s.pieces.reduce((t, p) => t + p.len, 0) + (s.pieces.length - 1) * F.KERF;
    if (need > usable + 0.01) overfull++;
  }
  if (overfull) fail(`${overfull} sticks are cut past ${F.inches(usable)}`);
  const packed = sticks.reduce((t, s) => t + s.pieces.length, 0);
  if (packed !== list.length) fail(`${list.length} pieces went in, ${packed} came out`);
  const inLen = list.reduce((t, p) => t + p.len, 0);
  const outLen = sticks.reduce((t, s) => t + s.pieces.reduce((u, p) => u + p.len, 0), 0);
  if (!near(inLen, outLen, 0.1)) fail(`${F.inches(inLen)} of stock went in, ${F.inches(outLen)} came out`);
  ok(`${list.length} pieces into ${sticks.length} sticks, nothing lost or invented`);

  /* 4. the cut list is the walls — every 2x4 the model drew, and no more */
  const modelLen = P.pieces
    .filter((p) => p.size === spec.studSize && !/header/.test(p.kind) && !(/plate/.test(p.kind) && !/gable/.test(p.kind)))
    .reduce((t, p) => t + p.len, 0);
  const plateLen = plates.reduce((t, r) => t + r.len, 0);
  const hdrLen = hdrs.filter((h) => h.pick.size === spec.studSize)
    .reduce((t, h) => t + h.len * h.pick.plies, 0);
  if (!near(inLen, modelLen + plateLen + hdrLen, 0.1))
    fail(`cut list is ${F.inches(inLen)}; walls, plates and headers come to `
      + `${F.inches(modelLen + plateLen + hdrLen)}`);
  ok('the cut list is exactly the walls the model drew');

  /* 5. every header carries what is over it */
  for (const h of hdrs) {
    if (!h.bearing) continue;
    if (!(h.pick.ratio <= 1)) fail(`${h.o.name || h.st.label}: header is at ${h.pick.ratio.toFixed(2)} of bending`);
    if (!(h.pick.deflRatio <= 1)) fail(`${h.o.name || h.st.label}: header deflects past its limit`);
    if (h.pick.plies > 2) fail(`${h.o.name || h.st.label}: ${h.pick.plies} plies will not fit the wall`);
  }
  const lofted = hdrs.filter((h) => h.loft);
  const plain = hdrs.filter((h) => h.bearing && !h.loft);
  if (lofted.length && plain.length && !(Math.min(...lofted.map((h) => h.wPlf))
      > Math.max(...plain.map((h) => h.wPlf)) + 1))
    fail('a header under a loft is not carrying more than one that is not');
  ok(`${hdrs.length} headers carry their load${lofted.length ? `, ${lofted.length} of them the loft as well` : ''}`);

  /* 6. fasteners: every row counts something and says where it comes from */
  for (const r of screws) {
    if (!(r.total >= 0) || !Number.isFinite(r.total)) fail(`screw row "${r.what}" has no count`);
    if (!r.basis) fail(`screw row "${r.what}" does not say where it comes from`);
    if (r.total !== r.each * r.n) fail(`screw row "${r.what}" does not multiply out`);
  }
  const total = screws.reduce((t, r) => t + r.total, 0);
  if (total < list.length * 2) fail(`${total} screws for ${list.length} pieces is too few to hold it together`);
  ok(`${total} screws across ${screws.length} connections, each one traced to a rule`);

  /* 7. A longer stick is never more sticks — any way of cutting a short one
     is still a way of cutting a long one. Linear feet is NOT monotonic and
     must not be checked as if it were: a 129¾" stud drops 14¼" off a 12'
     and 38¼" off a 14', so longer stock can genuinely buy more wood. */
  let last = Infinity;
  const counts = [];
  for (const S of [144, 168, 192, 240]) {
    let p;
    try { p = F.plan(src, S); } catch { continue; }
    counts.push(`${S / 12}': ${p.sticks.length}`);
    if (p.sticks.length > last) fail(`${S / 12}' stock wants ${p.sticks.length} sticks where the shorter one wanted ${last}`);
    last = p.sticks.length;
  }
  ok(`a longer stick is never more sticks — ${counts.join(', ')}`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nall framing checks passed');
process.exit(fails ? 1 : 0);
