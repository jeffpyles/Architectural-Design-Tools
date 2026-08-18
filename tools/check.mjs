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
  'layoutFile', 'readLayoutFile', 'layoutFacts',
  'ASSEMBLY', 'assembly', 'assemblyOpts', 'assemblyReview', 'panelShear', 'wallSheet',
  'priceKey', 'basePrice', 'packPrices', 'unpackPrices', 'PRICED', 'NOT_COSTED', 'isSheathed',
  'LUMBER_USD', 'CFS', 'buildCost', 'girtSection', 'girtCheck', 'claddingPressure',
  'LUMBER', 'windPressure', 'roofLoads',
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
    const nums = g.t === 'box' ? [...g.p, ...g.s, g.rx]
      : g.t === 'cyl' ? [...g.p, g.d, g.h]
        : [g.x0, g.x1, ...g.pts.flat()];
    if (nums.some((n) => !Number.isFinite(n))) out.push([p, 'non-finite', nums]);
    else if (nums.some((n) => Math.abs(n) > LIM)) out.push([p, 'out of range', nums]);
    else if (g.t === 'box' && g.s.some((n) => n <= 0)) out.push([p, 'zero/negative size', g.s]);
    else if (g.t === 'cyl' && (g.d <= 0 || g.h <= 0)) out.push([p, 'zero/negative cylinder', [g.d, g.h]]);
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
  /* Printed, not asserted. A slab legitimately dominates a building's weight
     and a fender box legitimately does not, and nothing here can tell them
     apart — but a person reading the list can, at a glance. */
  console.log('  heaviest parts:');
  for (const r of t.weight.heaviest) {
    console.log(`    ${String(Math.round(r.lb)).padStart(7)} lb  ${r.how.padEnd(16)} ${r.kind}`);
  }
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

/* 7b. A layout also travels as a file, and the file is what somebody still has
   in six months. Everything it claims about itself has to be true, everything
   we can be handed has to load, and the things that are not this building's
   have to be refused by name rather than by "unreadable". */
{
  const code = A.encodeLayout(spec, openings, {});
  const file = A.layoutFile('Test layout', 'a note', code, spec, openings, {});
  if (file.tool !== building) fail(`the file says its tool is "${file.tool}"`);
  if (file.code !== code) fail('the file does not carry the code it was given');
  if (!file.describes.length) fail('the file describes itself as nothing');
  const junk = JSON.stringify(file).match(/undefined|NaN|\[object/);
  if (junk) fail(`the layout file says "${junk[0]}"`);

  const forms = [
    ['our own file', JSON.stringify(file)],
    ['a library entry', JSON.stringify({ tool: building, name: 'x', note: '', code })],
    ['the published index', JSON.stringify([{ tool: 'another-building', code: 'X' },
      { tool: building, name: 'y', code }])],
    ['an index object', JSON.stringify({ layouts: [{ tool: building, code }] })],
    ['a bare code in a text file', `  ${code}\n`],
  ];
  for (const [what, text] of forms) {
    let got;
    try { got = A.readLayoutFile(text, 'layout.json'); }
    catch (e) { fail(`${what} would not load: ${e.message}`); continue; }
    if (got.code !== code) fail(`${what} came back as a different code`);
    const d = A.decodeLayout(got.code);
    if (d.openings.length !== openings.length) fail(`${what} lost openings on the way in`);
  }

  const refuses = (text) => {
    try { A.readLayoutFile(text, 'x.json'); return ''; } catch (e) { return e.message; }
  };
  const wrong = refuses(JSON.stringify({ tool: 'another-building', code }));
  if (!wrong) fail('a file from another building loaded anyway');
  else if (!wrong.includes('another-building')) fail(`the refusal does not name it: ${wrong}`);
  if (!refuses('   ')) fail('an empty file loaded anyway');
  if (!refuses('{"name":"no code in here"}')) fail('a file with no code in it loaded anyway');
  /* And the code itself: another building's prefix is a different message from
     a mangled one, because they want different things done about them. */
  const other = (() => { try { A.decodeLayout('XYZ9-abc'); return ''; } catch (e) { return e.message; } })();
  if (!/XYZ9/.test(other)) fail(`another tool's code is not named as one: ${other}`);
  console.log(`  ok  the layout file round-trips in ${forms.length} shapes and refuses four more`);
}

/* 7c. What a building says about its own layout. The shell used to work this
   out itself by calling bracingCheck, which only the shop has — so every
   tiny-house layout in a list quietly read "unreadable". */
{
  const f = A.layoutFacts(spec, openings, {});
  if (!f.line) fail('a layout describes itself as nothing');
  if (/undefined|NaN/.test(f.line + f.tag)) fail(`a layout describes itself as "${f.line}"`);
  if (!['used', 'over', 'left'].includes(f.level)) fail(`a layout tag has level "${f.level}"`);
  for (const [head, lines] of f.summary) {
    if (!head || !Array.isArray(lines) || !lines.length) fail(`summary section "${head}" is empty`);
  }
  const text = A.layoutSummary(spec, openings, {});
  const bad = text.match(/^.*(undefined|NaN|\[object).*$/m);
  if (bad) fail(`the written summary says "${bad[0].trim()}"`);
  if (!text.includes(A.encodeLayout(spec, openings, {}))) {
    fail('the written summary does not carry the code');
  }
  console.log(`  ok  layout reads "${f.line}"${f.tag ? ` — ${f.tag}` : ''}, `
    + `written summary ${text.split('\n').length} lines`);
}

/* 7d. The assembly catalog. Every row is read by the model, the takeoff, the
   racking check and the Compare panel, so an incomplete row is four wrong
   answers rather than one — and the whole reason the catalog exists is that
   the same option used to carry different numbers in different places. */
{
  let n = 0;
  for (const [group, rows] of Object.entries(A.ASSEMBLY)) {
    for (const [id, raw] of Object.entries(rows)) {
      n++;
      const where = `${group}.${id}`;
      const r = A.assembly(group, id);
      if (!r) { fail(`${where} does not resolve through assembly()`); continue; }
      if (!r.label) fail(`${where} has no label`);
      if (!r.note) fail(`${where} has no note — the Compare panel prints it`);
      for (const k of ['psf', 'usd', 'hr', 'R', 'shear', 'usdFt']) {
        const v = raw[k];
        if (v === undefined) continue;
        if (!isFinite(v) || v < 0) fail(`${where} has ${k} = ${v}`);
      }
      if (raw.usd === undefined && raw.usdFt === undefined) fail(`${where} has no price`);
      /* A shear value with no spacing it is rated at is a number nobody can
         use, and the spacing is what caught ⅜" ply on 24" studs. */
      if (raw.shear && !raw.maxStud) fail(`${where} claims ${raw.shear} plf at no stated spacing`);
      if (raw.maxStud && !raw.shear) fail(`${where} states a spacing but no shear`);
      if (r.quoted) fail(`${where} reads as quoted with no override set`);
    }
  }
  /* Options offered are options that exist. A control listing an id the
     catalog does not have puts the building into a state it cannot build. */
  for (const group of Object.keys(A.ASSEMBLY)) {
    for (const [id, label] of A.assemblyOpts(group)) {
      if (!A.assembly(group, id)) fail(`${group} offers "${id}", which is not in the catalog`);
      if (!label) fail(`${group}.${id} is offered with no label`);
    }
  }
  for (const c of (A.BUILDING.controls || [])) {
    const g = ({ siding: 'siding', roofing: 'roofing', interiorFinish: 'interior',
      sheathingPanel: 'sheathing', studMaterial: 'studMaterial' })[c.k];
    if (!g || !c.opts) continue;
    for (const [id] of c.opts) {
      if (!A.assembly(g, id)) fail(`the ${c.label} control offers "${id}", not in ${g}`);
    }
    if (spec[c.k] !== undefined && !A.assembly(g, spec[c.k])) {
      fail(`the default spec picks ${g}.${spec[c.k]}, which is not in the catalog`);
    }
  }
  console.log(`  ok  ${n} catalog rows, every one complete and offered only where it exists`);
}

/* 7e. Shear comes off the row, not off a constant. This is the bug the
   catalog was built to kill: a ¼" lining reporting ⁷⁄₁₆" OSB's capacity. */
{
  const cases = [
    ['interior', 'osb', 24, 240], ['interior', 'ply', 24, 0], ['interior', 'ply38', 16, 220],
    ['interior', 'ply38', 24, 0], ['interior', 'ply1532', 24, 280], ['interior', 'gyp', 24, 0],
    ['sheathing', 'osb716', 24, 240], ['sheathing', 'ply38', 24, 0],
  ];
  for (const [g, id, at, want] of cases) {
    const got = A.panelShear(g, id, at);
    if (got.plf !== want) fail(`${g}.${id} at ${at}" o.c. gives ${got.plf} plf, expected ${want}`);
    if (!got.why) fail(`${g}.${id} gives no reason for ${got.plf} plf`);
    if (!got.plf && !/not a rated|rated to/.test(got.why)) {
      fail(`${g}.${id} says zero without saying why: "${got.why}"`);
    }
  }
  /* A thicker sheet is never worth less, and no sheet is ever worth more
     than it is rated at. */
  const ladder = ['ply', 'ply38', 'osb', 'ply1532'];
  for (let i = 1; i < ladder.length; i++) {
    const a = A.assembly('interior', ladder[i - 1]), b = A.assembly('interior', ladder[i]);
    if (b.shear < a.shear) fail(`${b.label} carries less shear than ${a.label}`);
  }
  console.log('  ok  shear comes off the panel, and a panel over its rated spacing counts for nothing');
}

/* 7f. What will not go together has to say so. A tool that lets you compare
   a wall that cannot be built against one that can is worse than no tool. */
{
  const ctx = { pitch: 6, girtSpacing: 24 };
  const crits = (over, c) => A.assemblyReview({ ...spec, wallSkin: 'girts', ...over }, { ...ctx, ...c })
    .filter((f) => f.level === 'crit').map((f) => f.title);
  if (!crits({ siding: 'cedarShake' }).length) fail('cedar on a girt wall raised nothing');
  if (crits({ siding: 'cedarShake', wallSkin: 'sheathing', sheathingPanel: 'osb716' }).length) {
    fail('cedar on a sheathed wall is refused when it should not be');
  }
  /* And a wall sheathed in nothing is a girt wall, whatever the wall system
     says — two controls can say no sheathing and they have to agree. */
  if (!crits({ siding: 'cedarShake', wallSkin: 'sheathing', sheathingPanel: 'none' }).length) {
    fail('cedar on a wall sheathed in "none" was allowed');
  }
  if (A.isSheathed({ ...spec, wallSkin: 'girts', sheathingPanel: 'osb716' })) {
    fail('a girt wall reports as sheathed because a sheet is still named');
  }
  if (!crits({ roofing: 'comp' }, { pitch: 1.5 }).length) fail('shingles at 1.5/12 raised nothing');
  if (crits({ roofing: 'comp' }, { pitch: 6 }).length) fail('shingles at 6/12 were refused');
  if (!crits({ roofing: 'metal' }, { pitch: 1.5 }).length) fail('a lapped panel at 1.5/12 raised nothing');
  /* Every finding is well formed, whatever it is about. */
  for (const id of Object.keys(A.ASSEMBLY.siding)) {
    for (const f of A.assemblyReview({ ...spec, siding: id }, ctx)) {
      if (!f.title || !f.body) fail(`siding.${id} produced an empty finding`);
      if (!['crit', 'warn', 'info'].includes(f.level)) fail(`siding.${id} finding level "${f.level}"`);
      if (/undefined|NaN/.test(f.title + f.body)) fail(`siding.${id}: "${f.title}"`);
    }
  }
  console.log('  ok  cedar wants a substrate, a lapped roof wants a pitch, and both say so');
}

/* 7g. Cost is counted off the same parts the weight is, and moves the way a
   price does. If these two ever describe different buildings, every trade on
   the Compare panel is fiction. */
{
  const c = t.cost;
  if (!c) fail('the takeoff produced no cost');
  else {
    const summed = c.rows.reduce((a, r) => a + r.usd, 0);
    if (Math.abs(summed - c.usd) > 0.01) fail(`cost rows sum to ${summed}, total says ${c.usd}`);
    if (!(c.usd > 0) || !(c.hr > 0)) fail(`cost is $${c.usd} and ${c.hr} hours`);
    if (!c.notCosted.length) fail('nothing is listed as uncounted, which cannot be true');

    /* Every part that claims a catalog key has to resolve to one, and has to
       carry the area the price is charged against. */
    for (const p of model.parts) {
      if (!p.asm) continue;
      const [g, id] = p.asm.split('.');
      if (!A.assembly(g, id)) fail(`a ${p.kind} claims ${p.asm}, which is not in the catalog`);
      if (!p.area) fail(`a ${p.kind} claims ${p.asm} but has no area to price`);
      if (p.psf != null && Math.abs(p.psf - A.assembly(g, id).psf) > 0.001) {
        fail(`a ${p.kind} weighs ${p.psf} psf and its catalog row says ${A.assembly(g, id).psf}`);
      }
    }

    /* Every priced surface is its own area at its own price. This is the line
       the Compare panel prints under the totals — "890 sf × $2.40 = $2,137 of
       it" — and it exists because the three big numbers are the whole
       building, which read as the price of the siding until it was said. */
    for (const r of c.rows) {
      if (!r.sf) continue;
      const [g, id] = r.key.split('.');
      const a = A.assembly(g, id);
      if (!a) continue;
      if (Math.abs(r.usd - r.sf * a.usd) > 0.5) {
        fail(`${r.key} is ${r.sf.toFixed(0)} sf at $${a.usd.toFixed(2)} `
          + `but its row costs $${r.usd.toFixed(0)}`);
      }
      if (r.usd > c.usd) fail(`${r.key} costs more on its own than the whole building does`);
    }

    /* Doubling one price raises the total by exactly that row. */
    const priced = c.rows.filter((r) => r.sf > 0 && r.usd > 0)[0];
    if (priced) {
      const [g, id] = priced.key.split('.');
      const over = { [A.priceKey(g, id)]: A.basePrice(g, id) * 2 };
      const c2 = A.takeoff(model, spec, over).cost;
      if (Math.abs((c2.usd - c.usd) - priced.usd) > 0.5) {
        fail(`doubling ${priced.key} moved the total by ${(c2.usd - c.usd).toFixed(0)}, `
          + `not the ${priced.usd.toFixed(0)} that row costs`);
      }
      if (!c2.quoted) fail('a typed price is not reported as one');
    }

    /* Prices survive the share code, and only the ones somebody changed go
       into it. */
    if (A.packPrices({}) !== null) fail('an untouched price table packs to something');
    if (A.packPrices({ 'siding.metal': A.basePrice('siding', 'metal') }) !== null) {
      fail('a price equal to the shipped one still packs');
    }
    if (A.packPrices({ 'siding.nonsense': 4 }) !== null) fail('a price for nothing packs');
    const mine = { 'siding.metal': 3.33 };
    const codeP = A.encodeLayout(spec, openings, {}, mine);
    const backP = A.decodeLayout(codeP).prices;
    if (Math.abs((backP['siding.metal'] || 0) - 3.33) > 0.001) {
      fail(`a typed price came back as ${backP['siding.metal']}`);
    }
    const plain = A.encodeLayout(spec, openings, {});
    if (codeP.length <= plain.length) fail('prices went into the code without lengthening it');
    if (A.decodeLayout(plain).prices && Object.keys(A.decodeLayout(plain).prices).length) {
      fail('a code with no prices decoded some');
    }
    console.log(`  ok  $${Math.round(c.usd).toLocaleString()} of material and `
      + `${Math.round(c.hr)} hours over ${c.rows.length} rows, priced ${c.priced}, `
      + `and prices survive the code`);
  }
}

/* 7g2. The roof dead load has to follow the covering. It was a hardcoded
   branch in both buildings, so every covering added after it was written
   fell into the `else` — an aluminium standing seam roof at 0.5 psf was
   being designed as asphalt shingle at 2.8, and polycarbonate would have
   been too. The spread of dead loads across the coverings has to equal the
   spread of their catalog weights exactly, because nothing else moves. */
if (A.roofLoads && A.ASSEMBLY && A.ASSEMBLY.roofing) {
  const deadOf = (r) => {
    const L = A.roofLoads({ ...spec, roofing: r });
    return L.dead != null ? L.dead : L.tcDead;
  };
  const ids = Object.keys(A.ASSEMBLY.roofing);
  const dead = ids.map(deadOf), psf = ids.map((r) => A.ASSEMBLY.roofing[r].psf);
  const spread = (v) => Math.max(...v) - Math.min(...v);
  if (Math.abs(spread(dead) - spread(psf)) > 0.01) {
    fail(`roof dead load spans ${spread(dead).toFixed(2)} psf across the coverings `
      + `and their weights span ${spread(psf).toFixed(2)} — the load is not following them`);
  }
  const order = [...ids].sort((x, y) => A.ASSEMBLY.roofing[x].psf - A.ASSEMBLY.roofing[y].psf);
  for (let i = 1; i < order.length; i++) {
    if (deadOf(order[i]) < deadOf(order[i - 1]) - 1e-9) {
      fail(`${order[i]} is heavier than ${order[i - 1]} and loads the roof less`);
    }
  }
  console.log(`  ok  roof dead load tracks the covering, `
    + `${Math.min(...dead).toFixed(1)}–${Math.max(...dead).toFixed(1)} psf across ${ids.length}`);
}

/* 7g3. Polycarbonate is a light-transmitting plastic, and both facts have to
   reach the Review tab: you can see through it, and it moves five times as
   much as steel. Whether the first is a feature depends on what is behind
   it, which is the building's to say and not core's. */
if (A.ASSEMBLY.siding.poly) {
  const titles = (over, ctx) => A.assemblyReview({ ...spec, ...over },
    { pitch: 6, girtSpacing: 24, ...ctx }).map((f) => `${f.level}:${f.title}`);
  const warm = titles({ siding: 'poly' }, { conditioned: true });
  const cold = titles({ siding: 'poly' }, { conditioned: false });
  if (!warm.some((t) => /^warn:.*light-transmitting/.test(t))) {
    fail('a see-through wall on a heated building is not warned about');
  }
  if (!cold.some((t) => /^info:.*light-transmitting/.test(t))) {
    fail('a see-through wall on a greenhouse is not even mentioned');
  }
  if (cold.some((t) => /^warn:.*light-transmitting/.test(t))) {
    fail('a greenhouse is warned off its own glazing');
  }
  if (!warm.some((t) => /moves/.test(t))) fail('nothing says the plastic moves');
  /* Wider than it is rated to span still has to bite. */
  if (!titles({ siding: 'poly' }, { girtSpacing: 36 }).some((t) => /spanning further/.test(t))) {
    fail('polycarbonate at 36" girts is not flagged as over-spanned');
  }
  const asRoof = titles({ roofing: 'poly' }, { pitch: 0.5 });
  if (!asRoof.some((t) => /^crit:/.test(t))) fail('polycarbonate at 0.5/12 is allowed');
  if (titles({ roofing: 'poly' }, { pitch: 3 }).some((t) => /^crit:/.test(t))) {
    fail('polycarbonate at 3/12 is refused');
  }
  console.log('  ok  polycarbonate reports what it is: see-through, moving, and 24" span');
}

/* 7h. Girts, for the buildings that have them. A girt spans stud to stud
   carrying wind on the siding, and the thing that governs a thin one is
   deflection, not rupture — a metal panel ripples long before a board
   breaks. Nothing checked any of this until 1x furring became an option. */
if (A.girtSection && spec.girtSize) {
  /* Girts lie flat, every size, so the screw target is the wide face and the
     projection is the thickness. On edge a 1x would show a ¾" line to hit
     down a 34-foot wall, and a 2x4 would stand the siding off by 3½". */
  for (const size of Object.keys(A.LUMBER)) {
    const sec = A.girtSection(size);
    const square = Math.abs(A.LUMBER[size].t - A.LUMBER[size].d) < 0.01;
    if (!square && !(sec.face > sec.out)) fail(`${size} girts present less face than projection`);
    if (Math.abs(sec.face * sec.out - A.LUMBER[size].t * A.LUMBER[size].d) > 1e-9) {
      fail(`${size} changes cross-section on the way into a girt`);
    }
    /* Only for stock anybody would girt with — 4x6 and 6x6 are posts, and
       flat means nothing to a timber. */
    if (A.LUMBER[size].t <= 1.5 && sec.out > 1.75) {
      fail(`${size} girts stand ${sec.out}" proud, which is on edge`);
    }
  }
  const g = A.girtCheck(spec);
  if (!g) fail('this building has a girt size the check cannot read');
  else {
    if (!(g.p > 0) || !(g.M > 0) || !(g.S > 0)) fail('the girt check produced no load');
    /* C&C suction on a small area is worse than the whole-building figure the
       racking check uses — that is the point of computing it separately. */
    if (A.windPressure && !(g.p > A.windPressure(spec))) {
      fail(`cladding pressure ${g.p.toFixed(1)} is not above the MWFRS ${A.windPressure(spec).toFixed(1)}`);
    }
    if (!g.ok) fail(`the default girts do not carry the siding (${(g.ratio * 100).toFixed(0)}%)`);
    console.log(`  girts: ${g.size} ${g.flat ? 'flat' : 'on edge'}, ${A.fmtIn(g.out)} proud, `
      + `${A.fmtIn(g.face)} of face · ${A.fmtN(g.p, 1)} psf over ${A.fmtIn(g.span)} `
      + `→ bending ${(g.bend * 100).toFixed(0)}%, sag ${(g.sag * 100).toFixed(0)}% of L/180`);

    /* The shape of the answer: more wind, wider spacing or a longer span is
       always worse, and a deeper girt is always better. */
    const at = (over) => A.girtCheck({ ...spec, ...over }).ratio;
    if (!(at({ girtSpacing: spec.girtSpacing * 1.25 }) > g.ratio)) fail('spreading the girts did not load them more');
    if (!(at({ studSpacing: spec.studSpacing * 1.5 }) > g.ratio)) fail('a longer span did not load the girt more');
    if (!(at({ windSpeed: spec.windSpeed + 30 }) > g.ratio)) fail('more wind did not load the girt more');
    const sizes = Object.keys(A.LUMBER)
      .filter((k) => A.girtSection(k).out === A.girtSection(spec.girtSize).out);
    for (let i = 1; i < sizes.length; i++) {
      const a2 = A.girtCheck({ ...spec, girtSize: sizes[i - 1] });
      const b2 = A.girtCheck({ ...spec, girtSize: sizes[i] });
      if (A.LUMBER[sizes[i]].d > A.LUMBER[sizes[i - 1]].d && b2.ratio > a2.ratio) {
        fail(`${sizes[i]} is wider than ${sizes[i - 1]} and comes out worse`);
      }
    }
    /* And it has to be capable of failing, or it is decoration. */
    const silly = A.girtCheck({ ...spec, girtSize: '1x3', girtSpacing: 48,
      studSpacing: 48, windSpeed: 150 });
    if (silly.ok) fail('1x3 at 48" o.c. over a 48" span in 150 mph wind still passes');
  }

  /* What is drawn is what was checked: the girt in the model has the section
     the check used. The shop labelled its girts flat, placed its siding as if
     they were, and drew them on edge — so the siding ran 2" inside them. */
  const drawn = model.parts.filter((p) => p.sys === 'girt');
  if (drawn.length) {
    const sec = A.girtSection(spec.girtSize);
    for (const p of drawn.slice(0, 40)) {
      const s3 = [...p.geom.s].sort((x, y) => x - y);
      if (Math.abs(s3[0] - Math.min(sec.face, sec.out)) > 0.01
        || Math.abs(s3[1] - Math.max(sec.face, sec.out)) > 0.01) {
        fail(`a girt is drawn ${s3.slice(0, 2).map((v) => v.toFixed(3)).join(' × ')}, `
          + `and the check sized ${sec.face} × ${sec.out}`);
        break;
      }
    }
    console.log(`  ok  ${drawn.length} girts drawn at the section the check used`);
  }
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
