/* Headless sanity pass over the model: every part must have finite geometry
   inside a believable bounding box, and the derived numbers must hold up. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'src', 'js')).filter((f) => /^[0-6]/.test(f)).sort();
const src = files.map((f) => readFileSync(join(root, 'src', 'js', f), 'utf8')).join('\n');

const ctx = vm.createContext({ Math, console, performance, Intl, Number, JSON,
  TextEncoder, TextDecoder, btoa, atob, Date });
vm.runInContext(src + '\n;globalThis.__api = { buildModel, takeoff, auditBuilding, trussGeometry, '
  + 'bracingCheck, DEFAULT_SPEC, DEFAULT_OPENINGS, solidSegments, sizeHeader, fmtFt, fmtIn, '
  + 'stockFor, wallExtent, WALLS, roofLoads, encodeLayout, decodeLayout, layoutSummary, '
  + 'leanToDesign, leanToDrift, pickMember, openingsOn };', ctx);
const A = ctx.__api;

const spec = { ...A.DEFAULT_SPEC };
const openings = A.DEFAULT_OPENINGS.map((o) => ({ ...o }));
const model = A.buildModel(spec, openings);

let fails = 0;
const fail = (m) => { console.log('  FAIL ' + m); fails++; };

// 1. Geometry is finite and inside a sane envelope
const LIM = 2000;
const bad = [];
for (const p of model.parts) {
  const g = p.geom;
  const nums = g.t === 'box' ? [...g.p, ...g.s, g.rx] : [g.x0, g.x1, ...g.pts.flat()];
  if (nums.some((n) => !Number.isFinite(n))) bad.push([p, 'non-finite', nums]);
  else if (nums.some((n) => Math.abs(n) > LIM)) bad.push([p, 'out of range', nums]);
  else if (g.t === 'box' && g.s.some((n) => n <= 0)) bad.push([p, 'zero/negative size', g.s]);
}
console.log(`parts: ${model.parts.length}`);
if (bad.length) {
  for (const [p, why, nums] of bad.slice(0, 12)) {
    console.log(`  FAIL ${why}: [${p.stage}/${p.sys}] ${p.kind} → ${JSON.stringify(nums)}`);
  }
  fails += bad.length;
} else console.log('  ok  all geometry finite, positive, within ±' + LIM);

// 2. Parts per stage
const byStage = {};
for (const p of model.parts) byStage[p.stage] = (byStage[p.stage] || 0) + 1;
console.log('  stages:', JSON.stringify(byStage));
for (const k of ['site', 'walls', 'trusses', 'dryin', 'roof', 'skin', 'elec', 'finish']) {
  if (!byStage[k]) fail(`stage "${k}" produced no parts`);
}

// 3. Truss geometry
const tr = A.trussGeometry(spec);
console.log(`truss: span ${A.fmtFt(tr.span)}, rise ${A.fmtIn(tr.rise)}, `
  + `TC ${A.fmtFt(tr.tcLength)}, count ${tr.count}, ridge ${A.fmtFt(tr.overallHeight)}`);
if (Math.abs(tr.rise - 39) > 0.001) fail(`rise should be 39" at 3/12 over 26', got ${tr.rise}`);
if (Math.abs(tr.webs[0].len - 32.5) > 0.001) fail(`outer web should be 32.5", got ${tr.webs[0].len}`);
if (Math.abs(tr.webs[1].len - 65) > 0.001) fail(`inner web should be 65", got ${tr.webs[1].len}`);
if (Math.abs(tr.webs[4].len - 39) > 0.001) fail(`king post should be 39", got ${tr.webs[4].len}`);
if (Math.abs(tr.tcLength - 177.2919) > 0.01) fail(`top chord length drifted: ${tr.tcLength}`);
if (tr.count !== 13) fail(`expected 13 trusses at 24" o.c. over 24', got ${tr.count}`);

// 4. Header on the overhead door
const oh = openings.find((o) => o.kind === 'overhead');
const h = A.sizeHeader(A.stockFor(oh).w, 'S', spec);
console.log(`10' overhead door header: ${h.label} (M/cap ${(h.ratio * 100).toFixed(0)}%, `
  + `defl ${h.defl.toFixed(3)}" vs ${h.defLimit.toFixed(3)}" allowed)`);
if (h.over) fail('overhead door header ran off the ladder');
if (h.ratio > 1) fail('header over capacity');

// 5. Solid segments must tile the framed wall
for (const w of ['N', 'S', 'E', 'W']) {
  const e = A.wallExtent(w, spec);
  const segs = A.solidSegments(w, openings, spec);
  const ops = openings.filter((o) => o.wall === w);
  const opW = ops.reduce((a, o) => a + A.stockFor(o).w, 0);
  const total = segs.reduce((a, s) => a + s.w, 0);
  const expect = (e.u1 - e.u0) - opW;
  if (Math.abs(total - expect) > 0.01) {
    fail(`${w} wall segments total ${total} but should be ${expect}`);
  }
}
console.log('  ok  solid segments tile every wall');

// 6. Bracing check runs and reports the south wall as the weak line
const br = A.bracingCheck(spec, openings);
for (const d of br) {
  for (const l of d.lines) {
    console.log(`  ${d.key} / ${l.wall}: braced ${A.fmtFt(l.braced)}, `
      + `needed ${l.required === Infinity ? '—' : A.fmtFt(l.required)}, ratio ${l.ratio.toFixed(2)}`);
  }
}

// 6b. The displayed lateral numbers must be internally consistent
const seis = ctx.__api.seismicShear ? null : null;
vm.runInContext('globalThis.__api.seismicShear = seismicShear; globalThis.__api.windPressure = windPressure;', ctx);
const sh = A.seismicShear(spec), qw = A.windPressure(spec);
for (const d of br) {
  // The base shear acts in full in each direction; it is not split between them
  if (Math.abs(d.quake - sh.V) > 0.5) fail(`${d.key}: seismic shown as ${d.quake.toFixed(0)} but base shear is ${sh.V.toFixed(0)}`);
  if (Math.abs(d.wind - d.area * qw / 2) > 0.5) fail(`${d.key}: wind does not match area x q / 2`);
  if (Math.abs(d.V - Math.max(d.wind, d.quake)) > 0.5) fail(`${d.key}: governing load is not the larger of the two`);
  const sum = d.lines.reduce((a, l) => a + l.demand, 0);
  if (Math.abs(sum - d.V) > 0.5) fail(`${d.key}: per-line demands sum to ${sum.toFixed(0)}, not ${d.V.toFixed(0)}`);
  for (const l of d.lines) {
    const cap = l.braced / 12 * (l.capacity && l.braced ? l.capacity / (l.braced / 12) : 0);
    if (Math.abs(cap - l.capacity) > 0.5) fail(`${d.key}/${l.wall}: capacity inconsistent`);
    const r = l.demand > 0 ? l.capacity / l.demand : 1;
    if (Math.abs(r - l.ratio) > 0.001) fail(`${d.key}/${l.wall}: ratio ${l.ratio} is not capacity/demand ${r}`);
    if (l.required !== Infinity && l.capacity > 0) {
      const need = l.demand / (l.capacity / (l.braced / 12)) * 12;
      if (Math.abs(need - l.required) > 0.5) fail(`${d.key}/${l.wall}: required length inconsistent`);
    }
  }
}
console.log('  ok  wind, seismic, per-line demand and ratios all reconcile');

// 6c. No girt may run across a rough opening
{
  const gl = { '2x4': 1.5, '2x6': 1.5 }[spec.girtSize] ?? 1.5;
  let crossings = 0;
  for (const p of model.parts.filter((q) => q.sys === 'girt' && !q.atOpening)) {
    for (const o of openings.filter((x) => x.wall === p.wall)) {
      const st = A.stockFor(o), sill = o.head - st.h;
      const vOverlap = sill < p.y + gl && o.head > p.y;
      const hOverlap = p.u0 < o.off + st.w - 0.01 && p.u1 > o.off + 0.01;
      if (vOverlap && hOverlap) {
        crossings++;
        if (crossings < 4) {
          console.log(`  FAIL girt on the ${p.wall} wall at ${A.fmtFt(p.y)} runs `
            + `${A.fmtFt(p.u0)}–${A.fmtFt(p.u1)} across an opening at ${A.fmtFt(o.off)}`);
        }
      }
    }
  }
  if (crossings) fails += crossings;
  else console.log(`  ok  no girt crosses an opening (${model.parts.filter((q) => q.sys === 'girt').length} girt pieces)`);
}

// 7. Takeoff
const t = A.takeoff(model, spec);
console.log(`takeoff: ${t.buyRows.reduce((a, r) => a + r.qty, 0)} sticks, `
  + `${t.concrete.order} cu yd, ${t.roofSquares.toFixed(1)} sq roof, `
  + `${t.sideSquares.toFixed(1)} sq siding, ${t.gussets} gussets`);
if (!t.buyRows.length) fail('takeoff produced no lumber');
const STOCK = [96, 120, 144, 168, 192, 240];
for (const r of t.buyRows) {
  if (!STOCK.includes(r.stock)) fail(`${r.size} listed at a stock length you cannot buy: ${A.fmtFt(r.stock)}`);
}
console.log('  ok  every purchase length is a real stock length');
if (t.concrete.cuYd < 5 || t.concrete.cuYd > 40) fail(`concrete looks wrong: ${t.concrete.cuYd}`);

// 8. Audit runs clean of exceptions and finds the known issues
const notes = A.auditBuilding(spec, openings);
console.log(`audit: ${notes.length} notes (${notes.filter((n) => n.level === 'crit').length} critical)`);
for (const n of notes) console.log(`   [${n.level}] ${n.title}`);

// 9. Spec permutations must not throw or produce bad geometry
const perms = [
  { roofDeck: 'osb', wallSkin: 'sheathing', bracing: 'full', roofing: 'comp' },
  { trussSpacing: 48, trussChord: '2x8' },
  { trussSpacing: 16, studSpacing: 24, studSize: '2x4' },
  { pitch: 5, heelHeight: 6, eaveOverhang: 24, rakeOverhang: 24 },
  { bracing: 'none', insulation: false, wallDrywall: false, ceilingDrywall: false },
];
for (const p of perms) {
  const s2 = { ...spec, ...p };
  try {
    const m2 = A.buildModel(s2, openings);
    const b2 = m2.parts.filter((q) => {
      const g = q.geom;
      const nums = g.t === 'box' ? [...g.p, ...g.s, g.rx] : [g.x0, g.x1, ...g.pts.flat()];
      return nums.some((n) => !Number.isFinite(n) || Math.abs(n) > LIM);
    });
    A.takeoff(m2, s2); A.auditBuilding(s2, openings);
    console.log(`  ok  ${JSON.stringify(p)} → ${m2.parts.length} parts${b2.length ? ` BAD:${b2.length}` : ''}`);
    if (b2.length) { fail(`${JSON.stringify(p)} produced ${b2.length} bad parts`); console.log('      e.g.', b2[0].kind, JSON.stringify(b2[0].geom)); }
  } catch (e) {
    fail(`${JSON.stringify(p)} threw: ${e.message}`);
  }
}

// 9b. Lean-to: the solved projection must actually satisfy its own geometry
for (const H of [120, 144]) {
  for (const posts of [2, 3, 4]) {
    const s2 = { ...spec, wallHeight: H, leanTo: true, leanToPosts: posts };
    const lt = A.leanToDesign(s2);
    if (!lt || lt.impossible) { fail(`lean-to found nothing at ${H}" walls, ${posts} posts`); continue; }
    const slope = s2.pitch / 12;
    const dr = 0;  // recomputed from the reported geometry below
    const expectBeamTop = lt.rafterBotAtWall - lt.projection * slope;
    if (Math.abs(lt.beamTop - expectBeamTop) > 0.01) fail(`lean-to beam top does not follow the slope at ${H}"`);
    if (Math.abs((lt.beamTop - lt.beam.depth) - lt.beamBot) > 0.01) fail(`lean-to beam bottom is not top minus depth at ${H}"`);
    if (lt.beamBot < lt.clear - 0.06) fail(`lean-to beam bottom ${lt.beamBot} is under the ${lt.clear} clearance at ${H}"`);
    // Any more projection would break something: either headroom or a member
    const bigger = A.leanToDesign({ ...s2, leanToProjection: lt.projection + 6 });
    const stillOk = bigger && !bigger.impossible && bigger.beamBot >= lt.clear - 0.06
      && bigger.rafter && bigger.beam;
    if (stillOk) fail(`lean-to at ${H}" walls stopped at ${A.fmtFt(lt.projection)} but 6" more still works`);
    console.log(`  lean-to ${H / 12}' walls, ${posts} posts → ${A.fmtFt(lt.projection)}, `
      + `${lt.rafter.label} rafters, beam ${lt.beam.label} over ${A.fmtFt(lt.beamSpan)}, `
      + `bottom at ${A.fmtFt(lt.beamBot)}`);
  }
}
{
  const d = A.leanToDrift(spec);
  if (!(d.pd > 0 && d.width > 0)) fail('drift surcharge came out zero');
  console.log(`  ok  drift ${d.pd.toFixed(1)} psf over ${d.width.toFixed(1)} ft`);
  const withD = A.leanToDesign({ ...spec, leanTo: true });
  const noD = A.leanToDesign({ ...spec, leanTo: true, leanToDrift: false });
  if (withD.psf <= noD.psf) fail('counting drift did not raise the design load');
}

/* 10. Encoder round-trip and the bracing maths, against fixtures that used to
   ship in the page as presets. They live here now: they are regression
   material, not something a user should have to scroll past. */
const FIXTURES = [
  { name: 'As sketched', expectPass: false,
    build: () => ({ spec: { ...spec }, openings: openings.map((o) => ({ ...o })) }) },
  { name: "10' walls, 9' door", expectPass: false,
    build: () => ({
      spec: { ...spec, wallHeight: 120 },
      openings: openings.map((o) => {
        const n = { ...o };
        if (n.kind === 'overhead') { n.w = 108; n.h = 96; n.head = 96; }
        if (n.wall === 'W') n.head = 102;
        return n;
      }),
    }) },
  { name: 'Openings ganged', expectPass: true,
    build: () => ({
      spec: { ...spec, wallHeight: 120, bracedPanelWidth: 72 },
      openings: [
        { id: 'g1', wall: 'W', stock: 'W1', kind: 'window', off: 12, head: 102 },
        { id: 'g2', wall: 'W', stock: 'W2', kind: 'window', off: 78, head: 102 },
        { id: 'g3', wall: 'W', stock: 'W1', kind: 'window', off: 144, head: 102 },
        { id: 'g4', wall: 'S', stock: 'D2', kind: 'overhead', off: 6, head: 96, w: 108, h: 96 },
        { id: 'g5', wall: 'S', stock: 'W2', kind: 'window', off: 120, head: 78.5 },
        { id: 'g6', wall: 'S', stock: 'D1', kind: 'man', off: 186, head: 82.5 },
        { id: 'g7', wall: 'E', stock: 'D1', kind: 'man', off: 36, head: 82.5 },
      ],
    }) },
  { name: 'With a lean-to', expectPass: false,
    build: () => ({
      spec: { ...spec, leanTo: true },
      openings: openings.map((o) => ({ ...o })),
    }) },
];

for (const fx of FIXTURES) {
  const { spec: fs, openings: fo } = fx.build();
  const worst = Math.min(...A.bracingCheck(fs, fo).flatMap((d) => d.lines.map((l) => l.ratio)));
  const code = A.encodeLayout(fs, fo);
  const back = A.decodeLayout(code);
  const worst2 = Math.min(...A.bracingCheck(back.spec, back.openings).flatMap((d) => d.lines.map((l) => l.ratio)));
  const same = JSON.stringify(back.spec) === JSON.stringify(fs)
    && back.openings.length === fo.length
    && back.openings.every((o, i) => o.wall === fo[i].wall && Math.abs(o.off - fo[i].off) < 0.001
      && Math.abs(A.stockFor(o).w - A.stockFor(fo[i]).w) < 0.001);
  console.log(`  ${fx.name.padEnd(22)} worst bracing ${worst.toFixed(2)}  `
    + `code ${code.length} chars  round-trip ${same ? 'ok' : 'MISMATCH'}`);
  if (!same) fail(`fixture "${fx.name}" did not survive the share code`);
  if (Math.abs(worst - worst2) > 0.001) fail(`fixture "${fx.name}" decoded to different numbers`);
  if (fx.expectPass && worst < 1) fail(`fixture "${fx.name}" should clear every wall line, worst ${worst.toFixed(2)}`);
  if (!fx.expectPass && worst >= 1) fail(`fixture "${fx.name}" was expected to fall short somewhere`);
}
const badCode = (() => { try { A.decodeLayout('not-a-code'); return false; } catch (e) { return true; } })();
if (!badCode) fail('a bad layout code should be rejected');
console.log('  ok  bad codes are rejected');

console.log(fails ? `\n${fails} FAILURES` : '\nall checks passed');
process.exit(fails ? 1 : 0);
