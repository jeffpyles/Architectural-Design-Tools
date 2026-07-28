/* What is only true of the tiny house: the trailer under it, the framing
   that spans its twelve feet, and the weight sums that decide whether it can
   ever be moved. */

export const api = ['rafterDesign', 'ridgeDesign', 'loftDesign', 'roofLoads', 'roofPitch',
  'roofY', 'axleCheck', 'axleSizing', 'joistRuns', 'wallRun', 'roughOf', 'WINDOW_STOCK',
  'DOOR_STOCK', 'STEEL', 'sizeHeader'];

export function run({ A, spec, openings, model, take: t, fail, log, permute }) {
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
  const w = t.weight;
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

  /* Spec permutations must not throw or produce bad geometry. */
  permute({ studSize: '2x6', studSpacing: 24 });
  permute({ roofing: 'comp', siding: 'lap', interiorFinish: 'gyp' });
  permute({ sheathing: false, wallInsulation: 'none', ceilingInsulation: 0 });
  permute({ ridgeRise: 24, eaveOverhang: 0, rakeOverhang: 0 });
  permute({ eastLoft: 0, westLoft: 0 }, 'no lofts');
  permute({ wallHeight: 108, loftHeight: 72 });
  permute({ tongueEnd: 'east' });
}
