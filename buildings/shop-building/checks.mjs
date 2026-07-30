/* What is only true of the shop building: the site-built truss, the racking
   maths, the girts that have to dodge the openings, and the layout fixtures
   that used to ship in the page as presets. They live here now — they are
   regression material, not something a user should have to scroll past. */

export const api = ['WIRE', 'clearOnWall', 'EBOX', 'EDEVICE', 'boxFill', 'circuitLoads', 'electricalReview',
  'defaultDevices', 'deviceList', 'devicePos', 'deviceLabel', 'packDevices', 'unpackDevices',
  'wallLayers', 'LUMBER', 'partVolume', 'buildModel', 'aabb',
  'cylinderPart', 'SONOTUBE', 'evalMember', 'leanToUnder', 'gussetPlan', 'anchorBoltPlan', 'leanToPostPlan', 'planExtent', 'openingTag', 'PLANS',
  'auditBuilding', 'trussGeometry', 'bracingCheck', 'sizeHeader', 'roofLoads',
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
  /* ---- how the rafters meet the beam ----
     Hanging them off the face rather than stacking them on top is worth
     exactly the shallower of the two members, and the whole reason to do it is
     that reach is set by headroom. Both halves of that get asserted, because
     the second one is the claim the panel makes. */
  {
    const base = { ...spec, wallHeight: 144, leanTo: true };
    const onTop = A.leanToDesign({ ...base, leanToFraming: 'onTop' });
    const flush = A.leanToDesign({ ...base, leanToFraming: 'flush' });
    log(`framing: on top → ${A.fmtFt(onTop.projection)}, ${onTop.rafter.label} on `
      + `${onTop.beam.label}, ${A.fmtIn(onTop.under)} below the roof line · `
      + `flush → ${A.fmtFt(flush.projection)}, ${flush.rafter.label} into `
      + `${flush.beam.label}, ${A.fmtIn(flush.under)}`);
    if (!(flush.projection > onTop.projection)) {
      fail(`flush framing reached ${flush.projection}, no further than ${onTop.projection} on top`);
    }
    if (!(flush.under < onTop.under)) fail('flush framing did not reduce what hangs below');
    /* The formula itself, both ways round. */
    for (const lt of [onTop, flush]) {
      const dr = A.LUMBER[lt.rafter.size].d / Math.cos(lt.angle);
      const want = A.leanToUnder(dr, lt.beam.depth, lt.flush);
      if (Math.abs(lt.under - want) > 0.001) fail(`${lt.flush ? 'flush' : 'on top'}: under is ${lt.under}, not ${want}`);
      if (Math.abs(lt.headroom - (144 - lt.projection * lt.slope - lt.under)) > 0.06) {
        fail(`${lt.flush ? 'flush' : 'on top'}: headroom does not follow H - P·slope - under`);
      }
      if (lt.headroom < lt.clear - 0.06) fail('a solved lean-to came in under its own clearance');
    }
    /* At the SAME projection, the gain has to show up as headroom. */
    const P = onTop.projection;
    const a2 = A.leanToDesign({ ...base, leanToFraming: 'onTop', leanToProjection: P });
    const b2 = A.leanToDesign({ ...base, leanToFraming: 'flush', leanToProjection: P });
    if (!(b2.headroom > a2.headroom + 1)) {
      fail(`at ${P}" the flush detail gave ${b2.headroom} against ${a2.headroom} on top`);
    }
    /* A face-mount hanger has to land on a beam at least as deep as the rafter. */
    for (const raf of ['2x6', '2x8', '2x10', '2x12']) {
      const lt = A.leanToDesign({ ...base, leanToFraming: 'flush', leanToRafter: raf });
      if (lt.beam.depth < A.LUMBER[raf].d - 0.001) {
        fail(`flush with ${raf} rafters picked a ${lt.beam.label} — shallower than the rafter`);
      }
    }
    /* And the model has to draw what was decided: rafters stopping at the
       beam face, with a hanger at each. */
    for (const framing of ['onTop', 'flush']) {
      const sp = { ...base, leanToFraming: framing };
      const lt = A.leanToDesign(sp);
      const parts = A.buildModel(sp, openings).parts;
      const raf = parts.filter((q) => q.kind.includes('lean-to rafter'));
      const hangers = parts.filter((q) => q.kind === 'Sloped-seat rafter hanger');
      if (!raf.length) fail(`${framing}: no lean-to rafters in the model`);
      if (framing === 'flush') {
        if (hangers.length !== raf.length) fail(`${raf.length} rafters, ${hangers.length} hangers`);
        if (!(lt.rafterRun < lt.projection - 0.5)) fail('flush rafters still run the full projection');
      } else if (hangers.length) {
        fail('hangers drawn where the rafters sit on top of the beam');
      }
    }
  }

  /* ---- naming a rafter ---- */
  {
    const base = { ...spec, wallHeight: 144, leanTo: true, leanToFraming: 'flush' };
    let last = 0;
    for (const raf of ['2x6', '2x8', '2x10', '2x12']) {
      const lt = A.leanToDesign({ ...base, leanToRafter: raf });
      if (lt.rafter.size !== raf) fail(`naming ${raf} rafters got ${lt.rafter.size}`);
      if (!lt.rafterNamed) fail(`naming ${raf} did not read as named`);
      /* Deeper rafters reach further and cost headroom — the trade the panel
         claims, asserted rather than asserted-to. */
      if (lt.projection <= last) fail(`${raf} reached no further than the size below it`);
      last = lt.projection;
      log(`  ${raf} rafters → ${A.fmtFt(lt.projection)}, headroom ${A.fmtFt(lt.headroom)}, `
        + `${(lt.rafter.ratio * 100).toFixed(0)}% of bending`);
    }
    /* A size that cannot carry it must be reported, not silently swapped. */
    const over = A.leanToDesign({ ...base, leanToRafter: '2x6', leanToProjection: 240 });
    if (over.rafter.size !== '2x6') fail('a named rafter got swapped out when it failed');
    if (over.rafterOK) fail('a 2x6 spanning 20 ft came back as adequate');
    const notes = A.auditBuilding({ ...base, leanToRafter: '2x6', leanToProjection: 240 }, openings);
    if (!notes.some((n) => n.level === 'crit' && /rafters are over/.test(n.title))) {
      fail('an overloaded named rafter produced no critical note');
    }
    /* Tighter spacing has to lighten each rafter. */
    const wide = A.leanToDesign({ ...base, leanToSpacing: 48, leanToRafter: '2x10' });
    const tight = A.leanToDesign({ ...base, leanToSpacing: 12, leanToRafter: '2x10' });
    if (!(tight.projection > wide.projection)) fail('halving the spacing did not buy any reach');
  }

  /* ---- round footings ---- */
  {
    const base = { ...spec, leanTo: true };
    const sq = A.postFooting({ ...base, postForm: 'square' });
    const tube = A.postFooting({ ...base, postForm: 'tube' });
    log(`footings: ${A.fmtIn(sq.worstPad.side)} square, ${sq.worstPad.area.toFixed(2)} sf, `
      + `${sq.worstPad.pressure.toFixed(0)} psf · ${A.fmtIn(tube.worstPad.d)} tube, `
      + `${tube.worstPad.area.toFixed(2)} sf, ${tube.worstPad.pressure.toFixed(0)} psf`);
    if (tube.form !== 'tube' || sq.form !== 'square') fail('the footing form did not take');
    if (!A.SONOTUBE.includes(tube.worstPad.d)) {
      fail(`${tube.worstPad.d}" is not a diameter anybody forms`);
    }
    for (const p of [sq, tube]) {
      if (p.worstPad.pressure > p.soil.q) fail(`${p.form}: sized itself over the allowable`);
      if (!(p.worstPad.area > 0)) fail(`${p.form}: no bearing area`);
      /* Pressure is gross — post plus concrete over the bearing area. */
      const want = (p.worst + p.worstPad.selfW) / p.worstPad.area;
      if (Math.abs(p.worstPad.pressure - want) > 0.5) fail(`${p.form}: pressure is not (P + pad)/area`);
      for (let i = 1; i < p.padOptions.length; i++) {
        if (p.padOptions[i].pressure >= p.padOptions[i - 1].pressure) {
          fail(`${p.form}: a bigger footing did not lower the pressure`);
        }
      }
    }
    /* A round footing of the same nominal size bears on less than a square
       one — π/4 of it — which is the trade the panel describes. */
    const t24 = tube.padOptions.find((o) => o.side === 24);
    const s24 = sq.padOptions.find((o) => o.side === 24);
    if (t24 && s24 && !(Math.abs(t24.area / s24.area - Math.PI / 4) < 0.001)) {
      fail(`a 24" tube bears on ${t24.area} sf against ${s24.area} for the square — not π/4`);
    }
    /* Naming a diameter overrides, and an inadequate one is reported. */
    for (const dia of [12, 24, 36]) {
      const o = A.postFooting({ ...base, postForm: 'tube', postTube: dia });
      if (o.worstPad.d !== dia) fail(`naming a ${dia}" tube got ${o.worstPad.d}`);
      if (o.padChosen !== 'named') fail(`naming a ${dia}" tube did not read as named`);
    }
    if (A.postFooting({ ...base, postForm: 'tube', postTube: 8 }).padOK) {
      fail('an 8" tube passed under thousands of pounds on clay');
    }
    /* The model draws a cylinder, and it holds together as one. */
    const m = A.buildModel({ ...base, postForm: 'tube' }, openings);
    const piers = m.parts.filter((q) => q.kind.startsWith('Sonotube pier'));
    if (piers.length !== tube.posts) fail(`${piers.length} tubes drawn for ${tube.posts} posts`);
    for (const q of piers) {
      if (q.geom.t !== 'cyl') fail('a Sonotube pier is not drawn as a cylinder');
      if (Math.abs(q.geom.h - tube.depth) > 0.01) fail('a tube is not the depth it was sized to');
      const b = A.aabb(q.geom);
      if (Math.abs((b.mx[0] - b.mn[0]) - q.geom.d) > 0.01) fail('a cylinder bounding box is not its diameter');
    }
    /* Volume, so the concrete order is right. */
    const one = piers[0];
    const want = Math.PI * (one.geom.d / 2) ** 2 * one.geom.h;
    if (Math.abs(A.partVolume(one.geom) - want) > 0.01) fail('cylinder volume is not πr²h');
    if (m.parts.some((q) => q.kind.startsWith('Lean-to pad'))) fail('square pads drawn alongside tubes');
  }

  /* ---- the truss shop drawing ---- */
  {
    const tr = A.trussGeometry(spec);
    const g = A.gussetPlan(tr);
    if (g.length !== 8) fail(`${g.length} gussets planned for an 8-joint truss`);
    for (const q of g) {
      if (!(q.w > tr.chord.d && q.h > tr.chord.d)) {
        fail(`a ${q.w} × ${q.h} gusset is smaller than the ${tr.chord.d}" chord it joins`);
      }
      const near = Object.values(tr.nodes).some((n) => Math.abs(n[0] - q.z) < 0.5)
        || Math.abs(q.z - tr.half) < 0.5;
      if (!near) fail(`a gusset at z=${q.z} is not at any truss node`);
    }
    log(`  ok  ${g.length} gussets, ${g[0].w}" × ${g[0].h}" at the heel`);
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

    /* Naming a bar overrides the rule, including a bar that cannot make the
       area — the point is to be told what the choice costs, not overruled. */
    for (const size of ['#3', '#4', '#5', '#6']) {
      const o = A.slabDesign({ ...spec, slabBar: size });
      if (o.bar.size !== size) fail(`naming ${size} got ${o.bar.size}`);
      if (o.barChosen !== 'named') fail(`naming ${size} did not read as named`);
      if (o.barShort !== !o.bar.ok) fail(`${size}: barShort disagrees with the bar's own ok`);
      if (o.spacing < 12 || o.spacing > 18) fail(`${size} named landed at ${o.spacing}" o.c.`);
      /* Whatever is named, the model has to draw that and the takeoff count it. */
      const m = A.buildModel({ ...spec, slabBar: size }, openings);
      const b = m.parts.find((q) => q.sys === 'rebar' && q.kind.includes('slab'));
      if (!b || b.steel !== `rebar${size}`) fail(`naming ${size} still drew ${b && b.steel}`);
    }
    if (A.slabDesign({ ...spec, slabBar: 'auto' }).bar.size !== sl.auto.size) {
      fail('auto did not come back to the rule');
    }
    /* A bar too small to make the area on a thick slab has to be caught, not
       quietly re-spaced to something nobody places. */
    {
      const thin = A.slabDesign({ ...spec, slabThickness: 8, slabBar: '#3' });
      if (!thin.barShort) fail('#3 on an 8" slab was not flagged short');
      if (thin.spacing !== 12) fail(`a short bar reported ${thin.spacing}" rather than the 12" floor`);
      const notes = A.auditBuilding({ ...spec, slabThickness: 8, slabBar: '#3' }, openings);
      if (!notes.some((n) => n.level === 'crit' && /does not make the shrinkage steel/.test(n.title))) {
        fail('a short named bar produced no critical note');
      }
    }

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
      /* A named pad size overrides the sizing, and an inadequate one is
         reported rather than silently grown. */
      for (const side of [12, 24, 48]) {
        const o = A.postFooting({ ...spec, leanTo: true, postPad: side });
        if (o.worstPad.side !== side || o.endPad.side !== side) fail(`naming ${side}" pads got something else`);
        if (o.padChosen !== 'named') fail(`naming ${side}" did not read as named`);
        if (o.padOK !== (o.worstPad.pressure <= o.soil.q)) fail(`${side}": padOK disagrees with the pressure`);
        const m = A.buildModel({ ...spec, leanTo: true, postPad: side }, openings);
        const drawn = m.parts.filter((q) => q.kind.startsWith('Lean-to pad'));
        if (drawn.some((q) => Math.abs(q.geom.s[0] - side) > 0.01)) fail(`naming ${side}" drew a different pad`);
      }
      {
        const tiny = A.postFooting({ ...spec, leanTo: true, postPad: 12 });
        if (tiny.padOK) fail('12" pads passed under 3,700 lb on clay, which they should not');
        const notes = A.auditBuilding({ ...spec, leanTo: true, postPad: 12 }, openings);
        if (!notes.some((n) => n.level === 'crit' && /over the bearing/.test(n.title))) {
          fail('an overloaded named pad produced no critical note');
        }
      }
      /* Pressure has to fall as the pad grows, or the table is nonsense. */
      for (let i = 1; i < pf.padOptions.length; i++) {
        if (pf.padOptions[i].pressure >= pf.padOptions[i - 1].pressure) {
          fail('a bigger pad did not lower the pressure');
        }
      }
      if (A.postFooting({ ...spec, leanTo: true, postPad: 0 }).padChosen !== 'auto') {
        fail('a zero pad size did not come back to the sizing');
      }

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
    { slabBar: '#6', postPad: 36, leanTo: true },
    { slabBar: '#3', slabThickness: 8, postPad: 12, leanTo: true },
    { leanTo: true, leanToFraming: 'flush', leanToRafter: '2x12', leanToSpacing: 12 },
    { leanTo: true, postForm: 'tube', postTube: 30, leanToFraming: 'flush' },
    { leanTo: true, leanToWall: 'S', service: 200, wallDrywall: false },
  ]) permute(p);

  /* ---- the drawings ----
     A sheet is only worth printing if it says the same thing as the model. The
     drawings work off their own little layout functions rather than digging
     through the parts list, which is faster and readable but is exactly the
     kind of second implementation that drifts — so it gets checked against the
     parts it is a drawing of. */
  {
    const bolts = A.anchorBoltPlan(spec);
    const drawn = model.parts.filter((p) => p.kind.startsWith('Anchor bolt'))
      .map((p) => A.aabb(p.geom).c);
    if (bolts.length !== drawn.length) {
      fail(`the foundation plan draws ${bolts.length} anchor bolts, the model has ${drawn.length}`);
    }
    for (const b of bolts) {
      const near = drawn.some((c) => Math.abs(c[0] - b.x) < 0.75 && Math.abs(c[2] - b.z) < 0.75);
      if (!near) fail(`a bolt is drawn at ${b.x.toFixed(1)}, ${b.z.toFixed(1)} with none there`);
    }

    const s2 = { ...spec, leanTo: true };
    const posts = A.leanToPostPlan(s2);
    const pads = A.buildModel(s2, openings).parts.filter((p) => p.kind.startsWith('Lean-to pad'))
      .map((p) => A.aabb(p.geom).c);
    if (posts.length !== pads.length) {
      fail(`the plan draws ${posts.length} post pads, the model builds ${pads.length}`);
    }
    for (const p of posts) {
      const near = pads.some((c) => Math.abs(c[0] - p.x) < 0.75 && Math.abs(c[2] - p.z) < 0.75);
      if (!near) fail(`a pad is drawn at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} with none there`);
    }
    if (A.leanToPostPlan({ ...spec, leanTo: false }).length) fail('posts drawn with no lean-to');
    log(`  ok  ${bolts.length} bolts and ${posts.length} pads drawn where the model puts them`);

    /* The plan has to hold everything it draws, or the sheet crops it. */
    const ext = A.planExtent(s2, 0);
    for (const p of posts) {
      if (p.x < ext[0] || p.x > ext[2] || p.z < ext[1] || p.z > ext[3]) {
        fail(`post at ${p.x.toFixed(0)}, ${p.z.toFixed(0)} falls outside the plan extent`);
      }
    }
    if (ext[2] - ext[0] < spec.width || ext[3] - ext[1] < spec.depth) {
      fail('the plan extent does not even hold the building');
    }

    /* Tags are what tie the drawing to the schedule, so they have to be
       unique — two openings sharing one tag is a wrong header on site. */
    const tags = openings.map((o) => A.openingTag(o, openings));
    if (new Set(tags).size !== tags.length) fail(`duplicate opening tags: ${tags.join(', ')}`);
    if (tags.some((t) => /\?/.test(t))) fail(`an opening got no tag: ${tags.join(', ')}`);
    log(`  ok  opening tags ${tags.join(', ')}`);

    /* The schedule is what gets ordered from, so every row has to be a row
       somebody can order against: a real tag, a real opening, a real header. */
    for (const o of openings) {
      const st = A.stockFor(o);
      const h = A.sizeHeader(st.w, o.wall, spec);
      if (!(st.w > 0 && st.h > 0)) fail(`${A.openingTag(o, openings)} has no rough opening`);
      if (o.head - st.h < -0.01) fail(`${A.openingTag(o, openings)} has a sill below the slab`);
      if (!h.over && !(h.depth > 0)) fail(`${A.openingTag(o, openings)} has a header with no depth`);
    }

    /* The three details are drawn from the wall build-up, so the build-up has
       to be a real one — and it has to hold its own trim, which is the bug
       that put a 1x4 outside the edge of the detail. */
    for (const skin of ['girts', 'sheathing']) {
      for (const side of ['metal', 'lap']) {
        const L = A.wallLayers({ ...spec, wallSkin: skin, siding: side });
        if (L.T !== A.LUMBER[spec.studSize].d) fail(`${skin}/${side}: wall thickness is wrong`);
        if (skin === 'girts' ? !L.girt : !L.sheathing) fail(`${skin}: the wall system did not take`);
        if (skin === 'girts' ? L.sheathing : L.girt) fail(`${skin}: both wall systems came back`);
        if (L.out < L.sheathing + L.girt + L.trim - 1e-9) {
          fail(`${skin}/${side}: the trim stands out past the drawn extent`);
        }
        if (L.out < L.sheathing + L.girt + L.siding - 1e-9) {
          fail(`${skin}/${side}: the siding stands out past the drawn extent`);
        }
      }
    }
    log('  ok  the wall build-up holds its own trim in all four skin combinations');

    /* Sheet numbers are how you ask for a sheet, so those have to be unique too. */
    const nums = A.PLANS.map((d) => d.number);
    if (new Set(nums).size !== nums.length) fail(`duplicate sheet numbers: ${nums.join(', ')}`);
    for (const d of A.PLANS) {
      if (typeof d.draw !== 'function') fail(`sheet ${d.number} has no draw()`);
      if (!d.title) fail(`sheet ${d.number} has no title`);
    }
    log(`  ok  ${A.PLANS.length} sheets: ${nums.join(', ')}`);
  }

  /* ---- electrical rough-in ----
     Box fill is the calculation an owner-builder gets wrong, so it gets
     checked the way it is written: against the section, term by term. */
  {
    const devs = A.deviceList(spec, openings, null);
    log(`electrical: ${devs.length} boxes`);
    if (devs.length < 8) fail(`only ${devs.length} devices in the generated rough-in`);
    if (devs.filter((d) => d.panel).length !== 1) fail('there is not exactly one sub-panel');

    for (const d of devs) {
      const p = A.devicePos(d, spec);
      if (![p.x, p.y, p.z].every(Number.isFinite)) fail(`${A.deviceLabel(d)} has no position`);
      if (d.wall === 'C') {
        if (p.x < 0 || p.x > spec.width || p.z < 0 || p.z > spec.depth) {
          fail(`a ceiling box is outside the building at ${p.x}, ${p.z}`);
        }
      } else {
        const e = A.wallExtent(d.wall, spec);
        if (d.u < e.u0 - 1 || d.u > e.u1 + 1) fail(`a box on the ${d.wall} wall is off the end`);
        if (d.v < 0 || d.v > spec.wallHeight) fail(`a box is at ${d.v}" on a ${spec.wallHeight}" wall`);
      }
      /* Nothing may sit inside an opening — that is a box in mid-air. */
      if (d.wall !== 'C' && !d.panel) {
        for (const o of openings.filter((x) => x.wall === d.wall)) {
          const st = A.stockFor(o);
          const inU = d.u > o.off && d.u < o.off + st.w;
          const inV = d.v > o.head - st.h && d.v < o.head;
          if (inU && inV) fail(`${A.deviceLabel(d)} sits inside the ${A.openingTag(o, openings)} opening`);
        }
      }
    }

    /* NEC 314.16(B), counted out by hand for the case the tool starts with:
       a 1-gang box, one duplex, a cable in and a cable out, no clamps. */
    {
      const d = { wall: 'N', u: 36, v: 48, box: '1g18', items: ['duplex'], feeds: 2 };
      const f = A.boxFill(d);
      const want = (2 * 2 + 1 + 0 + 2) * 2.25;         // 4 conductors, 1 ground, 1 yoke
      if (Math.abs(f.need - want) > 1e-9) fail(`1-gang duplex fill is ${f.need}, not ${want}`);
      if (!f.ok) fail('a duplex in an 18 cu in box came out over the fill');
      /* Same box with clamps has to cost one more allowance. */
      const g = A.boxFill({ ...d, box: 'sq21' });
      if (Math.abs(g.need - (want + 2.25)) > 1e-9) fail('a clamped box did not cost an allowance');
      /* A three-way switch carries travellers, which is another conductor. */
      const h = A.boxFill({ ...d, items: ['sw3'] });
      if (Math.abs(h.need - (want + 2.25)) > 1e-9) fail('a 3-way did not count its traveller');
      /* Every extra yoke is two more. */
      const two = A.boxFill({ ...d, box: '2g32', items: ['duplex', 'duplex'] });
      if (Math.abs(two.need - (want + 4.5)) > 1e-9) fail('a second yoke did not cost two allowances');
      if (two.ok !== (two.need <= 32)) fail('ok disagrees with the numbers it comes from');
      log(`  ok  fill: 1-gang duplex ${f.need.toFixed(2)} of ${f.have}, `
        + `2-gang two duplex ${two.need.toFixed(2)} of ${two.have}`);
    }
    /* More yokes than gangs is a different failure from too little volume, and
       has to read as one. */
    {
      const f = A.boxFill({ wall: 'N', u: 36, v: 48, box: '1g22',
        items: ['sw1', 'sw1', 'sw1'], feeds: 3 });
      if (f.gangsOK) fail('three switches passed a 1-gang box');
      if (!f.smallest || f.smallest.gangs < 3) fail('the suggested box has too few gangs');
    }
    /* Anything the tool generates has to fit the box the tool chose. */
    for (const d of devs) {
      const f = A.boxFill(d);
      if (!f) continue;
      if (!f.ok || !f.gangsOK) {
        fail(`the generated rough-in put ${A.deviceLabel(d)} in a box it does not fit: `
          + `${f.need.toFixed(1)} of ${f.have}`);
      }
    }

    /* Circuits: the load has to be the sum of what is on them, lighting at
       125%, and the breaker has to hold it. */
    const cl = A.circuitLoads(devs, spec);
    for (const r of cl.rows) {
      const onIt = devs.filter((d) => (d.ckt || 1) === r.ckt);
      const raw = onIt.reduce((a, d) => a
        + (d.items || []).reduce((b, k) => b + ((A.EDEVICE[k] || {}).va || 0), 0), 0);
      if (Math.abs(r.va - raw) > 0.01) fail(`circuit ${r.ckt} totals ${r.va}, not ${raw}`);
      if (r.cont > 0 && Math.abs(r.design - (r.va - r.cont + r.cont * 1.25)) > 0.01) {
        fail(`circuit ${r.ckt} did not count its continuous load at 125%`);
      }
      if (!r.ok) fail(`the generated rough-in overloads circuit ${r.ckt}`);
      if (r.overStandard) fail(`the generated rough-in needs more than 20 A on circuit ${r.ckt}`);
      if (A.WIRE[r.gauge].amps !== r.breaker) fail(`circuit ${r.ckt}: wire and breaker disagree`);
    }
    log(`  ok  ${cl.rows.length} circuits, ${cl.totalVA.toFixed(0)} VA connected on `
      + `${spec.service} A`);
    /* Loading one circuit to breaking point has to be caught. */
    {
      /* Twenty duplex outlets on one circuit: 3,600 VA, 30 A, over on both
         the amps and the outlet count. At 180 VA an outlet those two limits
         land in the same place, which is why the code picked that figure. */
      const many = Array.from({ length: 20 }, (_, i) => ({
        id: `m${i}`, wall: 'N', u: 12 + i * 12, v: 48, box: '1g18',
        items: ['duplex'], ckt: 1, feeds: 2,
      }));
      const one = A.circuitLoads(many, spec).rows[0];
      if (one.ok) fail(`${one.amps.toFixed(1)} A on a 20 A circuit still passed`);
      if (!one.overStandard) fail('20 outlets on one circuit did not read as over a 20 A run');
      if (one.outletsOK) fail(`${one.outlets} outlets on one 20 A circuit read as fine`);
      const notes = A.electricalReview(spec, openings, many);
      if (!notes.some((n) => n.level === 'crit' && /20 A circuit holds/.test(n.title))) {
        fail('an overloaded circuit produced no critical note');
      }
      /* Thirteen is the most a 20 A circuit is worth at 180 VA each. */
      const okRow = A.circuitLoads(many.slice(0, 13), spec).rows[0];
      if (!okRow.ok || !okRow.outletsOK) {
        fail(`13 outlets on a 20 A circuit came out as ${okRow.amps.toFixed(1)} A and failed`);
      }
      /* A 240 V circuit legitimately wants a bigger breaker and must not be
         flagged for it. */
      const big = A.circuitLoads([{ wall: 'N', u: 24, v: 48, box: '2g32',
        items: ['r250'], ckt: 9, feeds: 1 }], spec);
      if (big.rows[0].overStandard) fail('a 240 V range circuit was flagged for being over 20 A');
      if (big.rows[0].breaker < 50) fail(`a 12 kVA 240 V load sized to a ${big.rows[0].breaker} A breaker`);
    }
    /* And so does a box somebody has overfilled. */
    {
      const stuffed = devs.map((d) => (d.panel || d.wall === 'C' ? d
        : { ...d, box: '1g18', items: ['duplex', 'duplex', 'duplex'], feeds: 3 }));
      const notes = A.electricalReview(spec, openings, stuffed);
      if (!notes.some((n) => n.level === 'crit')) fail('overstuffed boxes produced no critical note');
    }

    /* The share code has to carry a box back exactly, or a layout somebody
       emails is a different building. */
    {
      const packed = A.packDevices(devs);
      const back = A.unpackDevices(packed);
      if (back.length !== devs.length) fail(`${devs.length} boxes packed, ${back.length} came back`);
      for (let i = 0; i < devs.length; i++) {
        const a = devs[i], b = back[i];
        if (a.wall !== b.wall) fail(`box ${i} came back on the ${b.wall} wall, not the ${a.wall}`);
        if (Math.abs(a.u - b.u) > 0.26 || Math.abs(a.v - b.v) > 0.26) {
          fail(`box ${i} moved ${(a.u - b.u).toFixed(2)}, ${(a.v - b.v).toFixed(2)} in the code`);
        }
        if ((a.items || []).join() !== (b.items || []).join()) {
          fail(`box ${i} came back holding ${b.items} instead of ${a.items}`);
        }
        if (!a.panel && a.box !== b.box) fail(`box ${i} changed size in the code`);
        if ((a.ckt || 0) !== (b.ckt || 0)) fail(`box ${i} changed circuit in the code`);
      }
      log(`  ok  ${devs.length} boxes survive the share code`);
    }

    /* And the model has to draw what the list says. */
    {
      const drawn = model.parts.filter((q) => q.stage === 'elec' && q.sys === 'device'
        && q.kind.endsWith(' box'));
      if (drawn.length !== devs.filter((d) => !d.panel).length) {
        fail(`${drawn.length} boxes drawn for ${devs.filter((d) => !d.panel).length} in the list`);
      }
      const edited = devs.map((d) => (d.panel ? d : { ...d, box: 'sq30' }));
      const m2 = A.buildModel(spec, openings, { devices: edited });
      const big = m2.parts.filter((q) => q.kind.startsWith('4" square × 2⅛"'));
      if (!big.length) fail('changing every box size changed nothing in the model');
    }
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
