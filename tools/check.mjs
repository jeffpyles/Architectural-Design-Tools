/* Headless sanity pass over a building's model.

   Everything here is true of any building: the geometry must be finite and
   inside a believable envelope, every stage must produce something, every
   purchase length must be one you can actually buy, and a layout must survive
   its own share code. Anything particular to one building lives in
   buildings/<id>/checks.mjs, which this runs afterwards.

   usage: node tools/check.mjs [building-id] */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const building = process.argv[2] || 'shop-building';

/* The same concatenation the build uses, minus the boot and the shell — this
   pass exercises the model and the engineering, not the DOM. */
const coreDir = join(root, 'core', 'src');
const bDir = join(root, 'buildings', building, 'src');
const paths = [
  ...readdirSync(coreDir).filter((f) => /^[0-8]/.test(f)).sort().map((f) => join(coreDir, f)),
  ...readdirSync(bDir).filter((f) => f.endsWith('.js') && !/^40-panels/.test(f)).sort().map((f) => join(bDir, f)),
];
const src = paths.map((f) => readFileSync(f, 'utf8')).join('\n');
console.log(`checking ${building}`);

const ctx = vm.createContext({ Math, console, performance, Intl, Number, JSON,
  TextEncoder, TextDecoder, btoa, atob, Date });

/* What every building declares, plus whatever its own checks ask for. A name
   that does not exist is left off rather than throwing, so one building's
   vocabulary is not a requirement on the next. */
const bChecksPath = join(bDir, '..', 'checks.mjs');
const bChecks = existsSync(bChecksPath) ? await import(pathToFileURL(bChecksPath)) : null;
const WANT = ['buildModel', 'takeoff', 'auditBuilding', 'DEFAULT_SPEC', 'DEFAULT_OPENINGS', 'STAGES',
  'BUILDING', 'encodeLayout', 'decodeLayout', 'layoutSummary', 'fmtFt', 'fmtIn', 'fmtN',
  'stockFor', 'wallExtent', 'WALLS', 'pickMember', 'openingsOn', 'solidSegments', 'partWeight',
  ...(bChecks && bChecks.api ? bChecks.api : [])];
vm.runInContext(`${src}
;globalThis.__api = {};
for (const n of ${JSON.stringify(WANT)}) {
  try { globalThis.__api[n] = eval(n); } catch (e) { /* this building does not have one */ }
}`, ctx);
const A = ctx.__api;

const spec = { ...A.DEFAULT_SPEC };
const openings = A.DEFAULT_OPENINGS.map((o) => ({ ...o }));
const model = A.buildModel(spec, openings);

let fails = 0;
const fail = (m) => { console.log('  FAIL ' + m); fails++; };
const log = (m) => console.log(m);

/* 1. Geometry is finite, positive and inside a sane envelope. The envelope
   scales with the building — a 34-foot trailer needs more room than a shop. */
const LIM = Math.max(2000, (A.BUILDING && A.BUILDING.footprint
  ? Math.max(...A.BUILDING.footprint(spec)) : Math.max(spec.width || 0, spec.depth || 0)) * 2.5);
function badParts(parts) {
  const out = [];
  for (const p of parts) {
    const g = p.geom;
    const nums = g.t === 'box' ? [...g.p, ...g.s, g.rx] : [g.x0, g.x1, ...g.pts.flat()];
    if (nums.some((n) => !Number.isFinite(n))) out.push([p, 'non-finite', nums]);
    else if (nums.some((n) => Math.abs(n) > LIM)) out.push([p, 'out of range', nums]);
    else if (g.t === 'box' && g.s.some((n) => n <= 0)) out.push([p, 'zero/negative size', g.s]);
  }
  return out;
}
const bad = badParts(model.parts);
console.log(`parts: ${model.parts.length}`);
if (bad.length) {
  for (const [p, why, nums] of bad.slice(0, 12)) {
    console.log(`  FAIL ${why}: [${p.stage}/${p.sys}] ${p.kind} → ${JSON.stringify(nums)}`);
  }
  fails += bad.length;
} else console.log(`  ok  all geometry finite, positive, within ±${LIM}`);

/* 2. Every stage in the rail has to put something on the screen, or the rail
   has a dead step in it. */
const byStage = {};
for (const p of model.parts) byStage[p.stage] = (byStage[p.stage] || 0) + 1;
console.log('  stages:', JSON.stringify(byStage));
for (const s of A.STAGES) if (!byStage[s.key]) fail(`stage "${s.key}" produced no parts`);
for (const k of Object.keys(byStage)) {
  if (!A.STAGES.some((s) => s.key === k)) fail(`parts are tagged "${k}", which is not a stage`);
}

/* 3. Openings all reference something in the schedule, and land on a wall. */
for (const o of openings) {
  if (!A.stockFor(o)) fail(`opening ${o.id} references unknown stock ${o.stock}`);
  if (!A.WALLS[o.wall]) fail(`opening ${o.id} is on wall "${o.wall}", which does not exist`);
}

/* 4. Takeoff: real stock lengths, and nothing counted twice. */
const t = A.takeoff(model, spec);
const sticks = t.buyRows.reduce((a, r) => a + r.qty, 0);
console.log(`takeoff: ${sticks} sticks`
  + (t.steelRows.length ? `, ${t.steelRows.reduce((a, r) => a + r.lf, 0).toFixed(0)} lf steel` : '')
  + `, ${t.roofSquares.toFixed(1)} sq roof, ${t.sideSquares.toFixed(1)} sq siding`
  + (t.weight.total ? `, ${Math.round(t.weight.total)} lb` : ''));
if (!t.buyRows.length && !t.steelRows.length) fail('takeoff produced neither lumber nor steel');
const STOCK = [96, 120, 144, 168, 192, 240];
for (const r of t.buyRows) {
  if (!STOCK.includes(r.stock)) fail(`${r.size} listed at a stock length you cannot buy: ${A.fmtFt(r.stock)}`);
}
console.log('  ok  every purchase length is a real stock length');

/* 5. Weight, where the model carries any. The centre of gravity has to sit
   inside the thing it belongs to. */
if (t.weight.total > 0) {
  const fp = A.BUILDING.footprint ? A.BUILDING.footprint(spec) : [spec.width, spec.depth];
  const [cx, cy, cz] = t.weight.cg;
  if (cx < 0 || cx > fp[0] || cz < 0 || cz > fp[1]) {
    fail(`centre of gravity at (${cx.toFixed(0)}, ${cz.toFixed(0)}) is outside the footprint`);
  }
  if (cy < 0 || cy > spec.wallHeight * 1.5) fail(`centre of gravity is ${cy.toFixed(0)}" up, which is not credible`);
  const sum = t.weight.byMat.reduce((a, r) => a + r.lb, 0);
  if (Math.abs(sum - t.weight.total) > 1) fail('weight by material does not sum to the total');
  console.log(`  ok  weight sums, CG at ${A.fmtFt(cx)} along and ${A.fmtFt(cy)} up`);
}

/* 6. The audit runs clean of exceptions. */
const notes = A.auditBuilding(spec, openings);
console.log(`audit: ${notes.length} notes (${notes.filter((n) => n.level === 'crit').length} critical)`);
for (const n of notes) console.log(`   [${n.level}] ${n.title}`);
for (const n of notes) {
  if (!n.title || !n.body) fail(`an audit note is missing its title or body: ${JSON.stringify(n).slice(0, 80)}`);
  if (!['crit', 'warn', 'info'].includes(n.level)) fail(`audit note has level "${n.level}"`);
}

/* 7. Share codes round-trip. */
{
  const code = A.encodeLayout(spec, openings);
  const back = A.decodeLayout(code);
  const same = JSON.stringify(back.spec) === JSON.stringify(spec)
    && back.openings.length === openings.length
    && back.openings.every((o, i) => o.wall === openings[i].wall
      && Math.abs(o.off - openings[i].off) < 0.001 && o.stock === openings[i].stock);
  console.log(`  ${same ? 'ok  ' : 'FAIL'} default layout survives a ${code.length}-character share code`);
  if (!same) fails++;
  const badCode = (() => { try { A.decodeLayout('not-a-code'); return false; } catch (e) { return true; } })();
  if (!badCode) fail('a bad layout code should be rejected');
  else console.log('  ok  bad codes are rejected');
}

/* 8. Whatever the library flags as the default is what the page opens with,
   so it had better decode and had better not be broken. */
{
  const dir = join(root, 'layouts', building);
  let flagged = null;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json')) {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (d.default) flagged = flagged ? 'MULTIPLE' : d;
    }
  }
  if (flagged === 'MULTIPLE') fail('more than one layout is flagged default');
  else if (!flagged) console.log('  --  no layout flagged default; the page opens with the built-in spec');
  else {
    const d = A.decodeLayout(flagged.code);
    const crit = A.auditBuilding(d.spec, d.openings).filter((n) => n.level === 'crit');
    console.log(`  default layout "${flagged.name}": ${crit.length ? crit.length + ' critical' : 'no critical notes'}`);
    if (crit.length) fail(`the default layout carries a critical note: ${crit[0].title}`);
    ctx.__flagged = d;
  }
}

/* 9. Anything only true of this building. */
if (bChecks && bChecks.run) {
  bChecks.run({
    A, ctx, spec, openings, model, take: t, fail, log, root, LIM, badParts,
    flagged: ctx.__flagged || null,
    /* Rebuild under a changed spec and assert it neither throws nor produces
       nonsense — the shape most permutation checks want. */
    permute(patch, label) {
      const s2 = { ...spec, ...patch };
      try {
        const m2 = A.buildModel(s2, openings);
        const b2 = badParts(m2.parts);
        A.takeoff(m2, s2); A.auditBuilding(s2, openings);
        console.log(`  ok  ${label || JSON.stringify(patch)} → ${m2.parts.length} parts`);
        if (b2.length) {
          fail(`${JSON.stringify(patch)} produced ${b2.length} bad parts`);
          console.log('      e.g.', b2[0][0].kind, JSON.stringify(b2[0][0].geom));
        }
        return m2;
      } catch (e) {
        fail(`${JSON.stringify(patch)} threw: ${e.message}`);
        return null;
      }
    },
  });
} else {
  console.log('  --  no building-specific checks');
}

console.log(fails ? `\n${fails} FAILURES` : '\nall checks passed');
process.exit(fails ? 1 : 0);
