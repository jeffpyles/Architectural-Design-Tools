/* What is only true of the tiny house: the trailer under it, the framing
   that spans its twelve feet, and the weight sums that decide whether it can
   ever be moved. */

export const api = ['rafterDesign', 'ridgeDesign', 'loftDesign', 'roofLoads', 'roofPitch',
  'roofY', 'axleCheck', 'axleSizing', 'joistRuns', 'wallRun', 'roughOf', 'WINDOW_STOCK',
  'DOOR_STOCK', 'STEEL', 'sizeHeader', 'heightCheck', 'headroom', 'frameSection',
  'frameCheck', 'studCheck', 'girtRuns', 'LUMBER'];

export function run({ A, spec, openings, model, take, fail, log, permute }) {
  /* The steel, against published section weights. A 2×6×.120 HSS is about
     6.27 lb/ft and a 1½×4×.100 about 3.55; computing from the section
     ignores the corner radii and so reads a per cent or so heavy. */
  for (const [key, want] of [['tube2x6x120', 6.27], ['tube1.5x4x100', 3.55]]) {
    const got = A.STEEL[key].lbft;
    if (Math.abs(got - want) / want > 0.03) {
      fail(`${key} computes to ${got.toFixed(2)} lb/ft, published is ${want}`);
    }
  }
  log(`  ok  steel sections within 3% of published: `
    + Object.entries(A.STEEL).map(([k, s]) => `${s.label} ${s.lbft.toFixed(2)} lb/ft`).join(', '));

  /* Roof geometry. Nine inches over six feet is exactly 1.5 in twelve, and
     the ridge has to be the high point. */
  const pitch = A.roofPitch(spec);
  if (Math.abs(pitch - spec.ridgeRise / (spec.width / 2) * 12) > 1e-9) fail('pitch does not follow the rise');
  if (Math.abs(A.roofY(spec.width / 2, spec) - (spec.wallHeight + spec.ridgeRise)) > 1e-9) {
    fail('the ridge is not the high point of the roof');
  }
  for (const z of [0, spec.width]) {
    if (Math.abs(A.roofY(z, spec) - spec.wallHeight) > 1e-9) fail('the eave is not at the top of the wall');
  }
  log(`  ok  roof is ${pitch.toFixed(2)}/12, ridge ${A.fmtFt(spec.wallHeight + spec.ridgeRise)} above the frame`);

  /* Framing that has to carry something. */
  const rd = A.rafterDesign(spec), rg = A.ridgeDesign(spec), lf = A.loftDesign(spec);
  for (const [name, m] of [['rafter', rd], ['ridge', rg], ['loft joist', lf]]) {
    if (m.over) fail(`${name} ran off the ladder — nothing carries it`);
    else if (m.ratio > 1) fail(`${name} is over capacity at ${(m.ratio * 100).toFixed(0)}%`);
  }
  log(`  ${rd.label} rafters over ${A.fmtFt(rd.span)} (${(rd.ratio * 100).toFixed(0)}%), `
    + `${rg.label} ridge over ${A.fmtFt(rg.span)}, ${lf.label} loft joists over ${A.fmtFt(lf.span)}`);

  /* Every opening gets a header that carries it. */
  for (const o of openings) {
    const h = A.sizeHeader(o, spec);
    if (h.over) fail(`${A.stockFor(o).label} on the ${o.wall} wall found no header that works`);
  }
  log(`  ok  every opening has a header (${openings.length} of them)`);

  /* Solid segments are the complement of the openings, so the two have to
     add back up to the wall. Openings that overlap each other count once. */
  for (const w of ['N', 'S', 'E', 'W']) {
    const run = A.wallRun(w, spec);
    const segs = A.solidSegments(w, spec, openings);
    const solid = segs.reduce((a, [x, y]) => a + (y - x), 0);
    const cuts = openings.filter((o) => o.wall === w)
      .map((o) => [o.off - 1.5, o.off + A.roughOf(o).w + 1.5])
      .sort((a, b) => a[0] - b[0]);
    let hole = 0, at = -Infinity;
    for (const [a, b] of cuts) { hole += Math.max(0, Math.min(b, run) - Math.max(a, at, 0)); at = Math.max(at, b); }
    if (Math.abs(solid + hole - run) > 0.01) {
      fail(`${w} wall: ${solid.toFixed(1)}" solid plus ${hole.toFixed(1)}" of holes is not ${run}"`);
    }
    for (let i = 1; i < segs.length; i++) {
      if (segs[i][0] < segs[i - 1][1] - 0.01) fail(`${w} wall: segments overlap`);
    }
  }
  log('  ok  solid segments are exactly the complement of the openings');

  /* Nothing may be framed through a rough opening. This is the one that
     stacked openings — a window over a door — get wrong. */
  {
    let through = 0;
    const pieces = model.parts.filter((p) => p.stage === 'walls' && p.sys === 'framing'
      && /stud|cripple/.test(p.kind));
    for (const p of pieces) {
      const b = { mn: [p.geom.p[0] - p.geom.s[0] / 2, p.geom.p[1] - p.geom.s[1] / 2, p.geom.p[2] - p.geom.s[2] / 2],
        mx: [p.geom.p[0] + p.geom.s[0] / 2, p.geom.p[1] + p.geom.s[1] / 2, p.geom.p[2] + p.geom.s[2] / 2] };
      for (const o of openings) {
        const W = A.WALLS[o.wall];
        const ro = A.roughOf(o);
        const axis = W.axis === 'x' ? 0 : 2;
        const fixed = W.axis === 'x' ? 2 : 0;
        const wallAt = W.axis === 'x' ? (W.z === 0 ? 0 : spec.width) : (W.x === 0 ? 0 : spec.length);
        if (Math.abs((b.mn[fixed] + b.mx[fixed]) / 2 - wallAt) > 8) continue;   // different wall
        const uOverlap = b.mn[axis] < o.off + ro.w - 0.05 && b.mx[axis] > o.off + 0.05;
        const yOverlap = b.mn[1] < o.head - 0.05 && b.mx[1] > o.head - ro.h + 0.05;
        if (uOverlap && yOverlap) {
          through++;
          if (through < 4) fail(`a ${p.kind} runs through ${A.stockFor(o).label} on the ${o.wall} wall`);
        }
      }
    }
    if (!through) log(`  ok  no stud or cripple runs through an opening (${pieces.length} pieces)`);
  }

  /* Cross joists skip the wheel wells and nothing else. */
  const runs = A.joistRuns(spec);
  const skipped = runs.filter((r) => r.throughWell).length;
  if (!skipped) fail('no cross joist is skipped for the wheel wells');
  if (skipped > spec.wheelWellLength / spec.joistSpacing + 1) fail(`${skipped} joists skipped for a ${spec.wheelWellLength}" wheel well`);
  log(`  ok  ${runs.length - skipped} cross joists, ${skipped} skipped through the wheel wells`);

  /* Weight and the tow statics. The one thing that has to hold: put the whole
     weight on the two supports and it has to add back up. */
  const w = take.weight;
  const ax = A.axleCheck(spec, w);
  const sum = ax.tongueAtSketch + ax.onAxles;
  if (Math.abs(sum - w.total) > 1) fail(`tongue plus axle load is ${sum.toFixed(0)}, not ${w.total.toFixed(0)}`);
  const atWanted = A.axleCheck(spec, w).wanted;
  const check = w.total * (w.cg[0] - atWanted) / (ax.hitch - atWanted);
  if (Math.abs(check / w.total - 0.125) > 1e-6) fail('the solved axle position does not give 12½% on the hitch');
  log(`  ok  ${Math.round(w.total)} lb, ${Math.round(ax.tongueAtSketch)} lb on the hitch `
    + `(${(ax.fracAtSketch * 100).toFixed(1)}%), ${Math.round(ax.onAxles)} lb on the axles`);

  /* A shell this size has a weight per square foot that lands in a believable
     band. Both ends of it have been wrong once already. */
  const psf = w.total / (spec.length * spec.width / 144);
  if (psf < 25 || psf > 75) fail(`${psf.toFixed(1)} psf of floor is not a credible shell weight`);
  log(`  ok  ${psf.toFixed(1)} lb per square foot of floor`);

  /* The salvaged schedule: every window is either in a wall or on the shelf,
     and none is in two walls at once. */
  for (const s of A.WINDOW_STOCK) {
    const n = openings.filter((o) => o.stock === s.id).length;
    if (n > 1) fail(`${s.label} is placed ${n} times, and there is only one of it`);
  }
  const shelf = A.WINDOW_STOCK.filter((s) => !openings.some((o) => o.stock === s.id));
  log(`  ok  ${A.WINDOW_STOCK.length - shelf.length} windows placed, ${shelf.length} on the shelf`
    + (shelf.length ? ` (${shelf.map((s) => '#' + s.n).join(', ')})` : ''));

  /* The road height envelope has to add up out of its own parts, and the
     tallest-wall answer has to be the wall that exactly fills it. */
  {
    const h = A.heightCheck(spec);
    const sum = h.deck + h.wall + h.rise + h.roofBuild;
    if (Math.abs(sum - h.total) > 1e-9) fail(`height parts sum to ${sum}, total says ${h.total}`);
    if (Math.abs(h.over - (h.total - h.envelope)) > 1e-9) fail('over-height does not follow from the total');
    const atMax = A.heightCheck({ ...spec, wallHeight: h.maxWall });
    if (Math.abs(atMax.total - h.envelope) > 0.01) {
      fail(`the tallest wall that fits gives ${atMax.total}", not the ${h.envelope}" envelope`);
    }
    log(`  ok  ${A.fmtIn(h.total)} road to ridge cap against ${A.fmtFt(h.envelope)}`
      + ` (${h.over > 0 ? A.fmtIn(h.over) + ' over' : A.fmtIn(-h.over) + ' spare'}),`
      + ` tallest wall ${A.fmtIn(h.maxWall)}`);
    const hr = A.headroom(spec);
    if (hr.under <= 0 || hr.atRidge <= 0) fail('headroom came out non-positive');
    log(`  ok  ${A.fmtIn(hr.under)} under the loft, ${A.fmtIn(hr.atRidge)} in it at the ridge`);
  }

  /* The frame. Capacity has to follow from the sections, the cribbing spacing
     it reports has to be the one that exactly uses that capacity, and the tie
     has to be doing something — losing it must make the frame worse. */
  {
    const fr = A.frameCheck(spec, take.weight);
    const bySection = 2 * fr.rail.Sx * 0.6 * fr.rail.Fy + 2 * fr.beam.Sx * 0.6 * fr.beam.Fy;
    if (Math.abs(fr.capacity - bySection * 1000 / 12) > 1) fail('frame capacity does not follow from the sections');
    const M = fr.plf / 1000 * fr.maxCribbing ** 2 / 8;
    if (Math.abs(M - fr.capacityKipFt) > 0.01) fail('the reported cribbing spacing does not use exactly the capacity');
    for (const c of fr.cribbing) {
      if (c.ok !== (c.M <= fr.capacityKipFt + 1e-9)) fail(`cribbing at ${c.ft} ft is flagged wrong`);
    }
    /* The bare cantilever has to follow wL²/2, and the tie has to reduce it. */
    const bare = fr.plf / 1000 * fr.over ** 2 / 2;
    if (Math.abs(bare - fr.bare) > 0.01) fail('the bare overhang moment is not wL²/2');
    const noTie = A.frameCheck({ ...spec, strut: false }, take.weight);
    if (!(fr.M < noTie.M)) fail('the overhang tie does not reduce the moment');
    if (Math.abs(noTie.M - noTie.bare) > 1e-9) fail('with no tie the moment should be the bare cantilever');
    /* A prop can never do better than a rigid one, and never worse than none. */
    if (fr.M < fr.propped - 1e-9) fail('the tie is being credited with more than a rigid prop would give');
    if (fr.M > fr.bare + 1e-9) fail('the tie made the frame worse');
    /* Deepening the triangle must help; shallowing it must not. */
    const deep = A.frameCheck({ ...spec, wheelWellRise: spec.wheelWellRise + 12 }, take.weight);
    if (!(deep.M <= fr.M)) fail('a deeper tie triangle should not make the moment worse');
    log(`  ok  frame ${A.fmtN(fr.capacityKipFt, 1)} kip-ft capacity, `
      + `${A.fmtN(fr.over, 1)} ft overhang: ${A.fmtN(fr.bare, 1)} bare, `
      + `${A.fmtN(fr.M, 1)} with the tie (${fr.ratio.toFixed(1)}×), blocks at ${A.fmtN(fr.maxCribbing, 1)} ft`);
    log(`  ok  tie at ${(fr.strut.angle * 180 / Math.PI).toFixed(1)}° delivers `
      + `${A.fmtN(fr.strut.canProp, 2)} of ${A.fmtN(fr.strut.ideal, 2)} kip; `
      + `wants ${A.fmtIn(fr.strut.wantRise)} of rise or ${A.fmtN(fr.strut.wantArea, 2)} in²`);
  }

  /* Studs. Bracing the weak axis is what makes an eleven-foot 2x4 work, so
     taking it away has to make it fail. */
  {
    const st = A.studCheck(spec);
    if (st.ratio > 1) fail(`studs over capacity at ${(st.ratio * 100).toFixed(0)}%`);
    if (!st.braced) fail('the default wall should have both faces attached');
    const bare = A.studCheck({ ...spec, wallSkin: 'none', interiorFinish: 'none' });
    if (bare.ratio <= st.ratio) fail('unbracing the weak axis should make the stud worse, not better');
    log(`  ok  studs at ${(st.ratio * 100).toFixed(0)}% braced, `
      + `${(bare.ratio * 100).toFixed(0)}% if neither face is on`);
  }

  /* No girt may run across a rough opening — the same thing that had to be
     fixed on the shop, and for the same reason. */
  {
    let crossings = 0;
    const gt = A.LUMBER[spec.girtSize].t;
    for (const g of model.parts.filter((p) => p.sys === 'girt')) {
      for (const o of openings.filter((x) => x.wall === g.wall)) {
        const ro = A.roughOf(o);
        const v = o.head - ro.h < g.y + gt && o.head > g.y;
        const hOv = g.u0 < o.off + ro.w - 0.01 && g.u1 > o.off + 0.01;
        if (v && hOv) {
          crossings++;
          if (crossings < 4) fail(`a girt on the ${g.wall} wall at ${A.fmtFt(g.y)} crosses ${A.stockFor(o).label}`);
        }
      }
    }
    if (!crossings) log(`  ok  no girt crosses an opening (${model.parts.filter((p) => p.sys === 'girt').length} girt pieces)`);
  }

  /* Spec permutations must not throw or produce bad geometry. */
  permute({ studSize: '2x6', studSpacing: 24 });
  permute({ roofing: 'comp', siding: 'lap', interiorFinish: 'gyp' });
  permute({ wallSkin: 'sheathing', roofDeck: false, wallInsulation: 'none', ceilingInsulation: 0 });
  permute({ girtSpacing: 16, interiorFinish: 'ply' });
  permute({ ridgeRise: 24, eaveOverhang: 0, rakeOverhang: 0 });
  permute({ eastLoft: 0, westLoft: 0 }, 'no lofts');
  permute({ wallHeight: 108, loftHeight: 72 });
  permute({ tongueEnd: 'east' });
}
