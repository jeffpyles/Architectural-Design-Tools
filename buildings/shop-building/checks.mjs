/* What is only true of the shop building: the site-built truss, the racking
   maths, the girts that have to dodge the openings, and the layout fixtures
   that used to ship in the page as presets. They live here now — they are
   regression material, not something a user should have to scroll past. */

export const api = ['trussGeometry', 'bracingCheck', 'sizeHeader', 'roofLoads',
  'leanToDesign', 'leanToDrift', 'seismicShear', 'windPressure',
  'SOIL', 'REBAR', 'wallLineLoads', 'footingDesign', 'slabDesign', 'postFooting',
  'anchorSchedule'];

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

  /* ---- foundation ----
     Everything here is closed-form, so it can be checked against itself: the
     pieces have to agree with each other, and the sensitivities have to point
     the right way. What none of this can check is whether the presumptive
     bearing value is true of the actual dirt. */
  {
    const fd = A.footingDesign(spec);
    log(`footing: ${fd.soil.label} ${fd.soil.q} psf · `
      + `${fd.lines.bearing.total.toFixed(0)} plf under the bearing walls · `
      + `bearing wants ${A.fmtIn(fd.bearingWidth)}, detailing ${A.fmtIn(fd.detailWidth)} → `
      + `${A.fmtIn(fd.width)} (${fd.governs})`);

    const byHand = fd.lines.bearing.total / fd.soil.q * 12;
    if (Math.abs(fd.bearingWidth - byHand) > 0.001) {
      fail(`bearing width ${fd.bearingWidth} is not plf/q: ${byHand}`);
    }
    if (fd.width < fd.bearingWidth - 0.001 || fd.width < fd.detailWidth - 0.001) {
      fail('required width is under one of the two things that set it');
    }
    const should = fd.bearingWidth >= fd.detailWidth ? 'bearing' : 'detailing and frost';
    if (fd.governs !== should) fail(`governs says "${fd.governs}" but the numbers say "${should}"`);
    if (fd.peak < fd.avg - 0.001) fail('peak pressure came out under the average');
    if (fd.frostDepth !== spec.frostDepth + spec.slabThickness) {
      fail('frost depth is not measured from grade through the slab');
    }
    /* The gable ends carry no roof, so they must ask for less. */
    if (fd.lines.gable.total >= fd.lines.bearing.total) {
      fail('gable wall line load came out at or above the bearing wall');
    }
    /* Better soil narrows the trench; a heavier roof does not, because bearing
       is not what governs. This is the whole finding, so assert it. */
    const onRock = A.footingDesign({ ...spec, soil: 'rock' });
    if (!(onRock.bearingWidth < fd.bearingWidth)) fail('rock did not need less bearing width than clay');
    const heavier = A.footingDesign({ ...spec, groundSnow: spec.groundSnow * 2, roofing: 'comp' });
    if (heavier.width !== fd.width) {
      fail(`doubling the snow changed the required footing width ${fd.width} → ${heavier.width}, `
        + 'so bearing has started to govern and the panel copy is wrong');
    }
    if (!(heavier.lines.bearing.total > fd.lines.bearing.total)) {
      fail('doubling the snow did not raise the line load');
    }
    /* Soft soil, tall walls and deep snow together should push it over. */
    const soft = A.footingDesign({ ...spec, soil: 'clay', groundSnow: 120, wallHeight: 192 });
    if (soft.governs !== 'bearing') fail('nothing makes bearing govern, so that branch is dead code');
  }

  {
    const sl = A.slabDesign(spec);
    log(`slab: ${sl.fc} psi, ${sl.fr.toFixed(0)} psi rupture, ${sl.allow.toFixed(0)} allowable at FS ${sl.FS} · `
      + `${spec.wheelLoad} lb wheel on a ${sl.a.toFixed(2)}" radius · `
      + `interior needs ${sl.interiorOnly ? A.fmtIn(sl.interiorOnly.h) : '>8"'}, `
      + `free edge ${sl.edgeToo ? A.fmtIn(sl.edgeToo.h) : '>8"'} → `
      + `${sl.doweled ? 'doweled' : 'sawcut'}, so ${sl.min ? A.fmtIn(sl.min.h) : '>8"'}`);

    /* Westergaard, checked for the shape of the answer rather than the value:
       an edge is always worse than the middle, and thicker is always better. */
    for (const r of sl.rows) {
      if (!(r.edge > r.interior)) fail(`at ${r.h}" the free edge came out no worse than mid-panel`);
      if (!(r.l > 0 && r.b > 0)) fail(`at ${r.h}" the radius of relative stiffness is not positive`);
    }
    for (let i = 1; i < sl.rows.length; i++) {
      if (sl.rows[i].interior >= sl.rows[i - 1].interior) fail('stress did not fall with thickness');
    }
    /* min must be the first row that passes the governing case. */
    const first = sl.rows.find((r) => (sl.doweled ? r.intOK : r.intOK && r.edgeOK));
    if (sl.min !== first) fail('the minimum thickness is not the first row that passes');
    if (sl.thickOK !== (sl.at.interior <= sl.allow && (sl.doweled || sl.at.edge <= sl.allow))) {
      fail('thickOK disagrees with the stresses it is derived from');
    }
    /* Undoweled joints must never be the cheaper answer. */
    const plain = A.slabDesign({ ...spec, jointTransfer: 'none' });
    if (plain.min && sl.min && plain.min.h < sl.min.h) fail('sawcut joints came out thinner than doweled');
    /* A heavier wheel must want more concrete somewhere in the range. */
    const heavy = A.slabDesign({ ...spec, wheelLoad: 9000 });
    if (heavy.min && sl.min && heavy.min.h <= sl.min.h) fail('a 9000 lb wheel wanted no more slab');
    /* And the building must not be able to change it. */
    const taller = A.slabDesign({ ...spec, wallHeight: 192, groundSnow: 120 });
    if (taller.at.interior !== sl.at.interior) fail('the building changed the slab stress');

    /* Reinforcement: every option has to satisfy the requirement it was
       chosen from, and the one picked has to be one of them. */
    if (Math.abs(sl.asReq - 0.0018 * 12 * spec.slabThickness) > 1e-9) fail('As required drifted off 0.0018 bh');
    for (const o of sl.barOptions) {
      if (o.provided < sl.asReq - 1e-9) fail(`${o.size} at ${o.at}" provides ${o.provided} under ${sl.asReq}`);
      if (o.at < 12 || o.at > 18) fail(`${o.size} landed at ${o.at}" o.c., outside 12–18`);
      if (o.at % 2) fail(`${o.size} at ${o.at}" is not a 2" increment`);
    }
    if (!sl.barOptions.some((o) => o.size === sl.bar.size)) fail('the specified bar is not among the options');
    if (sl.bar.provided < sl.asReq) fail('the specified bar provides less than required');
    /* The point of the selection rule: widest practical spacing, not biggest
       bar. #5 also fits at 18" and must lose to #4 on weight. */
    const bigger = sl.barOptions.filter((o) => o.at === sl.bar.at && o.psf < sl.bar.psf);
    if (bigger.length) fail(`${bigger[0].size} spaces as wide as ${sl.bar.size} and weighs less`);
    if (sl.bar.excess > 0.6) fail(`the specified ${sl.bar.size} over-supplies by ${(sl.bar.excess * 100).toFixed(0)}%`);
    log(`  slab steel: ${sl.bar.size} at ${A.fmtIn(sl.bar.at)} o.c. gives ${sl.bar.provided.toFixed(3)} `
      + `of ${sl.asReq.toFixed(3)} in²/ft, ${sl.bar.psf.toFixed(2)} lb/sf · `
      + `also fit: ${sl.barOptions.filter((o) => o.size !== sl.bar.size).map((o) => `${o.size}@${o.at}"`).join(', ')}`);

    /* Joints. Panels inside the maximum, and square enough to behave. */
    if (sl.joints.panelX > sl.joints.max + 0.001 || sl.joints.panelZ > sl.joints.max + 0.001) {
      fail(`panels ${sl.joints.panelX} × ${sl.joints.panelZ} exceed the ${sl.joints.max} ft maximum`);
    }
    const ratio = Math.max(sl.joints.panelX, sl.joints.panelZ) / Math.min(sl.joints.panelX, sl.joints.panelZ);
    if (ratio > 1.5) fail(`joint panels are ${ratio.toFixed(2)}:1, too far from square`);
    log(`  joints: ${sl.joints.nx} × ${sl.joints.nz} panels of `
      + `${sl.joints.panelX.toFixed(1)} × ${sl.joints.panelZ.toFixed(1)} ft, max ${sl.joints.max.toFixed(1)} ft`);

    /* The bar in the model has to be the bar in the calculation. */
    const bars = model.parts.filter((p) => p.sys === 'rebar');
    const slabBars = bars.filter((p) => p.kind.includes('slab'));
    if (!slabBars.length) fail('no slab steel in the model');
    for (const b of slabBars) {
      if (b.steel !== sl.bar.key) fail(`a slab bar is ${b.steel}, not the specified ${sl.bar.key}`);
      if (!b.len || !b.lbft) fail('a slab bar has no length or section weight, so it weighs nothing');
    }
    const nx = Math.max(2, Math.floor((spec.depth - 6) / sl.spacing) + 1);
    const nz = Math.max(2, Math.floor((spec.width - 6) / sl.spacing) + 1);
    if (slabBars.length !== nx + nz) {
      fail(`${slabBars.length} slab bars for a ${sl.spacing}" mat that wants ${nx + nz}`);
    }
    const row = t.steelRows.find((r) => r.key === sl.bar.key);
    if (!row) fail('slab steel never reached the purchase table');
    else log(`  ok  ${bars.length} bars in the model, ${row.lf.toFixed(0)} lf of `
      + `${sl.bar.size} at ${row.lb.toFixed(0)} lb in the takeoff`);
    /* Fibre draws no bar, and must not silently keep the old mat. */
    const fibre = A.buildModel({ ...spec, slabReinf: 'fibre' }, openings);
    if (fibre.parts.some((p) => p.sys === 'rebar')) fail('fibre-only still drew rebar');
  }

  {
    const pf = A.postFooting({ ...spec, leanTo: true });
    if (!pf) fail('no post footing under a lean-to');
    else {
      log(`post pads: ${pf.posts} posts, ${pf.w.toFixed(0)} plf on the beam over `
        + `${pf.span.toFixed(1)} ft spans · end ${pf.end.toFixed(0)} lb → `
        + `${A.fmtIn(pf.endPad.side)}, interior ${pf.interior.toFixed(0)} lb → `
        + `${A.fmtIn(pf.worstPad.side)} at ${pf.worstPad.pressure.toFixed(0)} psf of ${pf.soil.q}`);
      /* The reactions have to add up to the load, which is what catches both
         of the mistakes this calculation had in it: counting the whole
         lean-to instead of the half the posts carry, and dividing the total
         by the post count instead of tributing it. */
      const sum = pf.end * 2 + pf.interior * Math.max(0, pf.posts - 2);
      if (Math.abs(sum - pf.total) > 0.5) {
        fail(`post reactions sum to ${sum.toFixed(0)} but the total on them is ${pf.total.toFixed(0)}`);
      }
      if (pf.posts > 2 && Math.abs(pf.interior - pf.end * 2) > 0.5) {
        fail('an interior post should take twice an end post on equal simple spans');
      }
      /* The posts carry half; leanToDesign sizes the beam off the same half. */
      const lt = A.leanToDesign({ ...spec, leanTo: true });
      if (Math.abs(pf.w - lt.psf * (lt.projection / 12) / 2) > 0.5) {
        fail('the beam load is not psf x projection / 2 — the posts are carrying the wrong share');
      }
      if (Math.abs(pf.total - pf.w * lt.run / 12) > 0.5) fail('the total is not the load over the run');
      if (pf.worstPad.pressure > pf.soil.q) fail('the worst pad is over the allowable bearing');
      if (pf.worstPad.side < pf.endPad.side) fail('the pad under the heavier post came out smaller');
      if (pf.worstPad.side % 6) fail(`pad side ${pf.worstPad.side}" is not a 6" increment`);
      if (pf.depth < spec.frostDepth) fail('the pad does not reach the frost line');
      /* Softer soil needs a bigger pad. */
      const onSand = A.postFooting({ ...spec, leanTo: true, soil: 'gravel' });
      if (!(onSand.worstPad.side <= pf.worstPad.side)) fail('gravel wanted a bigger pad than clay');

      /* And what the model draws has to be what was sized. */
      const m2 = A.buildModel({ ...spec, leanTo: true }, openings);
      const pads = m2.parts.filter((p) => p.kind.startsWith('Lean-to pad'));
      if (pads.length !== pf.posts) fail(`${pads.length} pads drawn for ${pf.posts} posts`);
      const sides = pads.map((p) => Math.round(p.geom.s[0])).sort((a, b) => a - b);
      const want = [...Array(pf.posts)].map((_, i) => (i === 0 || i === pf.posts - 1
        ? pf.endPad.side : pf.worstPad.side)).sort((a, b) => a - b);
      if (sides.join() !== want.join()) fail(`pads drawn ${sides.join('/')}" against ${want.join('/')}" sized`);
      log(`  ok  ${pads.length} pads drawn at ${sides.join('", ')}"`);
    }
    if (A.postFooting({ ...spec, leanTo: false })) fail('post footings without a lean-to');
  }

  {
    const ab = A.anchorSchedule(spec, openings);
    log(`anchors: worst line ${ab.worst.toFixed(0)} lb → ${ab.byShear} by shear, `
      + `${ab.byCode} by code on the longest wall → ${ab.total} total (${ab.governs})`);
    const should = ab.byShear > ab.byCode ? 'shear' : 'the code minimum';
    if (ab.governs !== should) fail(`anchors say "${ab.governs}" but the counts say "${should}"`);
    if (ab.total < 8) fail(`${ab.total} anchor bolts round a building is not enough to be right`);
    const drawn = model.parts.filter((p) => p.kind.startsWith('Anchor bolt')).length;
    if (drawn !== ab.total) fail(`${drawn} bolts drawn against ${ab.total} scheduled`);
    /* A wall line that has to carry more must not need fewer bolts. */
    const windy = A.anchorSchedule({ ...spec, windSpeed: spec.windSpeed * 2 }, openings);
    if (windy.byShear < ab.byShear) fail('doubling the wind speed asked for fewer bolts');
  }

  for (const p of [
    { soil: 'rock', frostDepth: 24, slabThickness: 6, concreteFc: 3000 },
    { soil: 'sand', jointTransfer: 'none', slabReinf: 'mesh', slabThickness: 4 },
    { wheelLoad: 12000, tirePressure: 110, slabThickness: 8, slabInsulation: 'under' },
    { slabReinf: 'fibre', turndownWidth: 12, turndownDepth: 18, gravelDepth: 4 },
  ]) permute(p);

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
