/* What is only true of the shop building: the site-built truss, the racking
   maths, the girts that have to dodge the openings, and the layout fixtures
   that used to ship in the page as presets. They live here now — they are
   regression material, not something a user should have to scroll past. */

export const api = ['trussGeometry', 'bracingCheck', 'sizeHeader', 'roofLoads',
  'leanToDesign', 'leanToDrift', 'seismicShear', 'windPressure'];

export function run({ A, spec, openings, model, take: t, fail, log, permute, flagged }) {
  /* Truss geometry, against hand calculations. */
  const tr = A.trussGeometry(spec);
  log(`truss: span ${A.fmtFt(tr.span)}, rise ${A.fmtIn(tr.rise)}, `
    + `TC ${A.fmtFt(tr.tcLength)}, count ${tr.count}, ridge ${A.fmtFt(tr.overallHeight)}`);
  if (Math.abs(tr.rise - 39) > 0.001) fail(`rise should be 39" at 3/12 over 26', got ${tr.rise}`);
  if (Math.abs(tr.webs[0].len - 32.5) > 0.001) fail(`outer web should be 32.5", got ${tr.webs[0].len}`);
  if (Math.abs(tr.webs[1].len - 65) > 0.001) fail(`inner web should be 65", got ${tr.webs[1].len}`);
  if (Math.abs(tr.webs[4].len - 39) > 0.001) fail(`king post should be 39", got ${tr.webs[4].len}`);
  if (Math.abs(tr.tcLength - 177.2919) > 0.01) fail(`top chord length drifted: ${tr.tcLength}`);
  if (tr.count !== 13) fail(`expected 13 trusses at 24" o.c. over 24', got ${tr.count}`);

  /* Header on the overhead door. */
  const oh = openings.find((o) => o.kind === 'overhead');
  const h = A.sizeHeader(A.stockFor(oh).w, 'S', spec);
  log(`10' overhead door header: ${h.label} (M/cap ${(h.ratio * 100).toFixed(0)}%, `
    + `defl ${h.defl.toFixed(3)}" vs ${h.defLimit.toFixed(3)}" allowed)`);
  if (h.over) fail('overhead door header ran off the ladder');
  if (h.ratio > 1) fail('header over capacity');

  /* Solid segments must tile the framed wall. */
  for (const w of ['N', 'S', 'E', 'W']) {
    const e = A.wallExtent(w, spec);
    const segs = A.solidSegments(w, openings, spec);
    const opW = openings.filter((o) => o.wall === w).reduce((a, o) => a + A.stockFor(o).w, 0);
    const total = segs.reduce((a, s) => a + s.w, 0);
    const expect = (e.u1 - e.u0) - opW;
    if (Math.abs(total - expect) > 0.01) fail(`${w} wall segments total ${total} but should be ${expect}`);
  }
  log('  ok  solid segments tile every wall');

  /* The racking numbers on screen must reconcile with each other. */
  const br = A.bracingCheck(spec, openings);
  for (const d of br) {
    for (const l of d.lines) {
      log(`  ${d.key} / ${l.wall}: braced ${A.fmtFt(l.braced)}, `
        + `needed ${l.required === Infinity ? '—' : A.fmtFt(l.required)}, ratio ${l.ratio.toFixed(2)}`);
    }
  }
  const sh = A.seismicShear(spec), qw = A.windPressure(spec);
  for (const d of br) {
    // The base shear acts in full in each direction; it is not split between them
    if (Math.abs(d.quake - sh.V) > 0.5) fail(`${d.key}: seismic shown as ${d.quake.toFixed(0)} but base shear is ${sh.V.toFixed(0)}`);
    if (Math.abs(d.wind - d.area * qw / 2) > 0.5) fail(`${d.key}: wind does not match area x q / 2`);
    if (Math.abs(d.V - Math.max(d.wind, d.quake)) > 0.5) fail(`${d.key}: governing load is not the larger of the two`);
    const sum = d.lines.reduce((a, l) => a + l.demand, 0);
    if (Math.abs(sum - d.V) > 0.5) fail(`${d.key}: per-line demands sum to ${sum.toFixed(0)}, not ${d.V.toFixed(0)}`);
    for (const l of d.lines) {
      const r = l.demand > 0 ? l.capacity / l.demand : 1;
      if (Math.abs(r - l.ratio) > 0.001) fail(`${d.key}/${l.wall}: ratio ${l.ratio} is not capacity/demand ${r}`);
      if (l.required !== Infinity && l.capacity > 0) {
        const need = l.demand / (l.capacity / (l.braced / 12)) * 12;
        if (Math.abs(need - l.required) > 0.5) fail(`${d.key}/${l.wall}: required length inconsistent`);
      }
    }
  }
  log('  ok  wind, seismic, per-line demand and ratios all reconcile');

  /* No girt may run across a rough opening. */
  {
    const gl = 1.5;
    let crossings = 0;
    for (const p of model.parts.filter((q) => q.sys === 'girt' && !q.atOpening)) {
      for (const o of openings.filter((x) => x.wall === p.wall)) {
        const st = A.stockFor(o), sill = o.head - st.h;
        const vOverlap = sill < p.y + gl && o.head > p.y;
        const hOverlap = p.u0 < o.off + st.w - 0.01 && p.u1 > o.off + 0.01;
        if (vOverlap && hOverlap) {
          crossings++;
          if (crossings < 4) {
            fail(`girt on the ${p.wall} wall at ${A.fmtFt(p.y)} runs `
              + `${A.fmtFt(p.u0)}–${A.fmtFt(p.u1)} across an opening at ${A.fmtFt(o.off)}`);
          }
        }
      }
    }
    if (!crossings) log(`  ok  no girt crosses an opening (${model.parts.filter((q) => q.sys === 'girt').length} girt pieces)`);
  }

  if (t.concrete.cuYd < 5 || t.concrete.cuYd > 40) fail(`concrete looks wrong: ${t.concrete.cuYd}`);
  log(`  ok  ${t.concrete.order} cu yd of concrete, ${t.gussets} gussets`);

  /* Spec permutations must not throw or produce bad geometry. */
  for (const p of [
    { roofDeck: 'osb', wallSkin: 'sheathing', bracing: 'full', roofing: 'comp' },
    { trussSpacing: 48, trussChord: '2x8' },
    { trussSpacing: 16, studSpacing: 24, studSize: '2x4' },
    { pitch: 5, heelHeight: 6, eaveOverhang: 24, rakeOverhang: 24 },
    { bracing: 'none', insulation: false, wallDrywall: false, ceilingDrywall: false },
  ]) permute(p);

  /* Lean-to: the solved projection must actually satisfy its own geometry,
     and one more step of it must not. */
  for (const H of [120, 144]) {
    for (const posts of [2, 3, 4]) {
      const s2 = { ...spec, wallHeight: H, leanTo: true, leanToPosts: posts };
      const lt = A.leanToDesign(s2);
      if (!lt || lt.impossible) { fail(`lean-to found nothing at ${H}" walls, ${posts} posts`); continue; }
      const slope = s2.pitch / 12;
      const expectBeamTop = lt.rafterBotAtWall - lt.projection * slope;
      if (Math.abs(lt.beamTop - expectBeamTop) > 0.01) fail(`lean-to beam top does not follow the slope at ${H}"`);
      if (Math.abs((lt.beamTop - lt.beam.depth) - lt.beamBot) > 0.01) fail(`lean-to beam bottom is not top minus depth at ${H}"`);
      if (lt.beamBot < lt.clear - 0.06) fail(`lean-to beam bottom ${lt.beamBot} is under the ${lt.clear} clearance at ${H}"`);
      const bigger = A.leanToDesign({ ...s2, leanToProjection: lt.projection + 6 });
      const stillOk = bigger && !bigger.impossible && bigger.beamBot >= lt.clear - 0.06
        && bigger.rafter && bigger.beam;
      if (stillOk) fail(`lean-to at ${H}" walls stopped at ${A.fmtFt(lt.projection)} but 6" more still works`);
      log(`  lean-to ${H / 12}' walls, ${posts} posts → ${A.fmtFt(lt.projection)}, `
        + `${lt.rafter.label} rafters, beam ${lt.beam.label} over ${A.fmtFt(lt.beamSpan)}, `
        + `bottom at ${A.fmtFt(lt.beamBot)}`);
    }
  }
  {
    const d = A.leanToDrift(spec);
    if (!(d.pd > 0 && d.width > 0)) fail('drift surcharge came out zero');
    log(`  ok  drift ${d.pd.toFixed(1)} psf over ${d.width.toFixed(1)} ft`);
    const withD = A.leanToDesign({ ...spec, leanTo: true });
    const noD = A.leanToDesign({ ...spec, leanTo: true, leanToDrift: false });
    if (withD.psf <= noD.psf) fail('counting drift did not raise the design load');
  }

  /* The racking fixtures: a layout that clears every wall line, and three
     that do not, each surviving its own share code unchanged. */
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
      build: () => ({ spec: { ...spec, leanTo: true }, openings: openings.map((o) => ({ ...o })) }) },
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
    log(`  ${fx.name.padEnd(22)} worst bracing ${worst.toFixed(2)}  `
      + `code ${code.length} chars  round-trip ${same ? 'ok' : 'MISMATCH'}`);
    if (!same) fail(`fixture "${fx.name}" did not survive the share code`);
    if (Math.abs(worst - worst2) > 0.001) fail(`fixture "${fx.name}" decoded to different numbers`);
    if (fx.expectPass && worst < 1) fail(`fixture "${fx.name}" should clear every wall line, worst ${worst.toFixed(2)}`);
    if (!fx.expectPass && worst >= 1) fail(`fixture "${fx.name}" was expected to fall short somewhere`);
  }

  /* The library default has to clear every wall line — it is what a stranger
     opening the page sees, so it should be a layout that works. */
  if (flagged) {
    const worst = Math.min(...A.bracingCheck(flagged.spec, flagged.openings).flatMap((x) => x.lines.map((l) => l.ratio)));
    log(`  default layout: worst bracing ${worst.toFixed(2)}`);
    if (worst < 1) fail(`the default layout does not clear every wall line (worst ${worst.toFixed(2)})`);
    if (flagged.spec.exposure !== spec.exposure) {
      fail(`default layout exposure ${flagged.spec.exposure} does not match the built-in ${spec.exposure}`);
    }
  }
}
