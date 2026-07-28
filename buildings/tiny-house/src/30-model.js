/* ============================================================
   Turn the spec into every individual part: the steel under it, the studs,
   the lofts, the rafters, the skin, and the salvaged windows in their holes.
   ============================================================ */

/* Where a wall runs and which way its offset is measured. Returns the two
   ends in the wall's own coordinate, plus the fixed coordinate it sits on. */
function wallExtent(wall, spec) {
  const W = WALLS[wall];
  if (W.axis === 'x') return { u0: 0, u1: spec.length, fixed: W.z === 0 ? 0 : spec.width };
  return { u0: 0, u1: spec.width, fixed: W.x === 0 ? 0 : spec.length };
}

/* A box in the wall's own frame: u runs along the wall, y up, t through it. */
function wallBox(wall, spec, u, y, t, du, dy, dt) {
  const e = wallExtent(wall, spec);
  const out = WALLS[wall].axis === 'x'
    ? { p: [u + du / 2, y + dy / 2, e.fixed + (e.fixed ? -t - dt / 2 : t + dt / 2)], s: [du, dy, dt] }
    : { p: [e.fixed + (e.fixed ? -t - dt / 2 : t + dt / 2), y + dy / 2, u + du / 2], s: [dt, dy, du] };
  return boxPart(out.p, out.s);
}

/* What a square foot of each sheet good actually weighs. The model draws
   them at a thickness you can see; these are the thickness they are. */
const PSF = {
  subfloor: 2.3, osb: 1.4, floorFoam: 0.7,
  roofing: { standing: 1.4, metal: 0.9, comp: 2.6 },
  siding: { metal: 0.9, lap: 2.0 },
  glazing: 5.5, door: 4.5, trim: 0.8,
  wallBatt: 0.35, lidBatt: 0.9,
  interior: { ply: 0.75, gyp: 2.2, osb: 1.4 },
};

/* The rectangles a sheet layer is left with once the openings are cut out
   of it. Slab the wall into vertical bands at every opening edge, work out
   which stretches of each band are blocked, and emit what is left — then
   merge neighbouring bands that survived at the same heights, so a plain
   wall stays one piece rather than a dozen.

   Bands rather than a simple left-to-right split, because openings stack:
   a window over a door leaves skin below the door, between the door head and
   the window sill, and above the window, all in the same band. */
function skinRects(wall, spec, openings, yBot, yTop) {
  const run = wallRun(wall, spec);
  const holes = openingsOn(wall, openings)
    .map((o) => {
      const ro = roughOf(o);
      return { u0: o.off, u1: o.off + ro.w, y0: o.head - ro.h, y1: o.head };
    })
    .filter((o) => o.y1 > yBot + 0.05 && o.y0 < yTop - 0.05 && o.u1 > 0 && o.u0 < run);

  const edges = new Set([0, run]);
  for (const o of holes) {
    edges.add(Math.max(0, o.u0));
    edges.add(Math.min(run, o.u1));
  }
  const cuts = [...edges].sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2;
    const blocked = holes.filter((o) => o.u0 < mid && o.u1 > mid)
      .map((o) => [Math.max(yBot, o.y0), Math.min(yTop, o.y1)])
      .sort((p, q) => p[0] - q[0]);
    let at = yBot;
    for (const [p0, p1] of blocked) {
      if (p0 > at + 0.05) out.push({ u0: a, u1: b, y0: at, y1: p0 });
      at = Math.max(at, p1);
    }
    if (at < yTop - 0.05) out.push({ u0: a, u1: b, y0: at, y1: yTop });
  }

  // Merge bands that run together at the same heights
  out.sort((p, q) => (p.y0 - q.y0) || (p.y1 - q.y1) || (p.u0 - q.u0));
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y0 - r.y0) < 0.01 && Math.abs(last.y1 - r.y1) < 0.01
      && Math.abs(last.u1 - r.u0) < 0.01) last.u1 = r.u1;
    else merged.push({ ...r });
  }
  return merged;
}

function buildModel(spec, openings) {
  const parts = [];
  let seq = 0;
  const add = (stage, sys, mat, kind, geom, extra) => {
    parts.push({ id: `p${seq++}`, stage, sys, mat, kind, geom, ...(extra || {}) });
  };

  const L = spec.length, W = spec.width, H = spec.wallHeight;
  const T = LUMBER[spec.studSize].d;                  // wall thickness
  const rail = STEEL[spec.railSection], beam = STEEL[spec.beamSection];
  const joist = STEEL[spec.joistSection];
  const D = spec.frameDepth;
  const steelPart = (sec, key, kind, geom, len) =>
    add('trailer', 'steel', sec === beam ? 'steelDk' : 'steel', kind, geom,
      { len, lbft: sec.lbft, steel: key });

  /* ---------- 1. Trailer ---------- */

  // Perimeter: two long rails and two end rails, 2×6 tube laid on edge
  steelPart(rail, spec.railSection, `${rail.label}, main rail`,
    boxPart([L / 2, -D / 2, rail.w / 2], [L, D, rail.w]), L);
  steelPart(rail, spec.railSection, `${rail.label}, main rail`,
    boxPart([L / 2, -D / 2, W - rail.w / 2], [L, D, rail.w]), L);
  for (const x of [rail.w / 2, L - rail.w / 2]) {
    steelPart(rail, spec.railSection, `${rail.label}, end rail`,
      boxPart([x, -D / 2, W / 2], [rail.w, D, W - rail.w * 2]), W - rail.w * 2);
  }

  // Two I-beams down the length at the third points
  for (const z of [W / 3, W * 2 / 3]) {
    steelPart(beam, spec.beamSection, `${beam.label}, main beam`,
      boxPart([L / 2, -D / 2, z], [L, beam.d, beam.w]), L);
  }

  // Cross joists, 4" tube hung between the rails and the beams
  const jy = -joist.d / 2;
  for (const r of joistRuns(spec)) {
    if (r.throughWell) continue;                      // the wheel wells take this bay
    steelPart(joist, spec.joistSection, `${joist.label}, cross joist`,
      boxPart([r.x, jy, W / 2], [joist.w, joist.d, W - rail.w * 2]), W - rail.w * 2);
  }

  // Wheel wells: a box each side, standing above the deck
  const wellX0 = L - spec.wheelWellStart - spec.wheelWellLength;
  const wellL = spec.wheelWellLength, wellW = spec.wheelWellWidth, wellR = spec.wheelWellRise;
  for (const z0 of [0, W - wellW]) {
    add('trailer', 'steel', 'steelDk', 'Wheel well box',
      boxPart([wellX0 + wellL / 2, wellR / 2 - D / 2, z0 + wellW / 2],
        [wellL, wellR + D, wellW]),
      /* Sheet steel around a hole, not a billet — the box it is drawn as is
         all air, so it carries its own weight rather than a density. */
      { lb: 70, note: `${fmtFt(wellL)} × ${fmtIn(wellW)}, ${fmtIn(wellR)} above the deck` });
    // A pair of tyres under each well, so the wheel line reads in the model
    for (const dx of [-wellL / 4, wellL / 4]) {
      add('trailer', 'wheel', 'rubber', 'Tyre, 15"',
        boxPart([wellX0 + wellL / 2 + dx, -D - 14, z0 + wellW / 2], [30, 28, 8]),
        { lb: 55, note: 'Placeholder — no axles bought' });
    }
  }

  /* The diagonal off each wheel-well arch. Not on the drawing, but on the
     trailer — and the reason the overhang is anywhere near towable. */
  if (spec.strut) {
    const st = STEEL[spec.strutSection];
    const xArch = L - spec.rearAxleToEnd;
    const xLand = L - spec.strutFrom;
    const yArch = spec.wheelWellRise;
    const yLand = -D / 2;
    for (const z of [rail.w / 2, W - rail.w / 2]) {
      add('trailer', 'steel', 'steel', `${st.label}, overhang tie`,
        memberBox3([xArch, yArch, z], [xLand, yLand, z], st.w, st.d),
        { len: Math.hypot(xLand - xArch, yArch - yLand), lbft: st.lbft, steel: spec.strutSection,
          note: `Arch top to the rail, ${fmtFt(spec.strutFrom)} from the east end` });
    }
  }

  /* ---------- 2. Floor ---------- */
  add('floor', 'insulation', 'foam', 'Rigid foam, floor',
    boxPart([L / 2, -joist.d / 2, W / 2], [L - rail.w * 2, joist.d, W - rail.w * 2]),
    { area: (L - rail.w * 2) * (W - rail.w * 2) / 144, psf: PSF.floorFoam });
  add('floor', 'deck', 'osb', '¾" subfloor',
    boxPart([L / 2, spec.subfloor / 2, W / 2], [L, spec.subfloor, W]),
    { area: L * W / 144, psf: PSF.subfloor });

  /* ---------- 3. Wall framing ---------- */
  const y0 = spec.subfloor;                           // walls sit on the subfloor
  const wallTop = H;                                  // top of the top plate
  const plateT = 1.5;

  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const run = e.u1 - e.u0;
    const gable = WALLS[wall].gable;

    // Plates. The gable ends butt between the long walls, so they run short.
    const u0 = gable ? T : 0;
    const plateRun = gable ? run - T * 2 : run;
    add('walls', 'framing', 'firDark', `${spec.studSize} bottom plate`,
      wallBox(wall, spec, u0, y0, 0, plateRun, plateT, T),
      { size: spec.studSize, len: plateRun });
    for (let i = 0; i < 2; i++) {
      add('walls', 'framing', 'firDark', `${spec.studSize} top plate`,
        wallBox(wall, spec, u0, wallTop - plateT * (i + 1), 0, plateRun, plateT, T),
        { size: spec.studSize, len: plateRun });
    }

    const studBot = y0 + plateT, studTop = wallTop - plateT * 2;

    /* Studs on the module across the whole wall, each one cut into whatever
       pieces the openings leave it. A window over a door gives a full stud
       below the door, nothing through it, a cripple between the door head
       and the window sill, and another above the window — which is what
       stacked openings actually want, and what a solid-or-not model of a
       wall cannot produce. */
    const blockers = openingsOn(wall, openings).map((o) => {
      const ro = roughOf(o);
      const hd = sizeHeader(o, spec);
      const hDepth = LUMBER[hd.size] ? LUMBER[hd.size].d : 5.5;
      return { o, u0: o.off - 3, u1: o.off + ro.w + 3,
        hole0: o.off, hole1: o.off + ro.w,
        y0: o.head - ro.h - 1.5, y1: o.head + hDepth };
    });

    /* What is left of a vertical piece at u once every opening it meets has
       taken its bite. Kings and jacks go through this too — a door's king
       stud is exactly what runs through the little window above it. */
    function freeRuns(u, a0, b0, skip) {
      let free = [[a0, b0]];
      for (const bl of blockers) {
        if (bl.o === skip) continue;
        if (bl.hole1 <= u + 0.01 || bl.hole0 >= u + 1.49) continue;
        const next = [];
        for (const [a, b] of free) {
          if (bl.y0 > a) next.push([a, Math.min(b, bl.y0)]);
          if (bl.y1 < b) next.push([Math.max(a, bl.y1), b]);
        }
        free = next.filter(([a, b]) => b - a > 0.01);
      }
      return free.filter(([a, b]) => b - a > 3);
    }

    const at = [0, run - 1.5];
    for (let u = spec.studSpacing; u < run - 1.6; u += spec.studSpacing) at.push(u);
    for (const u of [...new Set(at.map((v) => Math.round(v * 8) / 8))].sort((p, q) => p - q)) {
      const top = gable ? Math.min(studTop, roofY(u + 0.75, spec) - 5.5) : studTop;
      for (const [a, b] of freeRuns(u, studBot, top)) {
        const full = b - a > top - studBot - 0.01;
        add('walls', 'framing', 'fir', `${spec.studSize} ${full ? 'stud' : 'cripple'}`,
          wallBox(wall, spec, u, a, 0, 1.5, b - a, T),
          { size: spec.studSize, len: b - a });
      }
    }

    // Gable framing above the plate line: a raked top plate and short studs
    if (gable) {
      for (const side of [0, 1]) {
        const zA = side ? W / 2 : 0, zB = side ? W : W / 2;
        const yA = roofY(zA, spec), yB = roofY(zB, spec);
        add('roof', 'framing', 'firDark', `${spec.studSize} gable plate`,
          wallBox(wall, spec, Math.min(zA, zB), Math.min(yA, yB) - 1.5, 0,
            Math.abs(zB - zA), Math.abs(yB - yA) + 1.5, T),
          { size: spec.studSize, len: Math.hypot(zB - zA, yB - yA) });
      }
    }

    // Openings: header, king and jack studs, sill and cripples
    for (const o of openingsOn(wall, openings)) {
      const ro = roughOf(o);
      const hd = sizeHeader(o, spec);
      const sill = o.head - ro.h;
      const hDepth = LUMBER[hd.size] ? LUMBER[hd.size].d : 5.5;
      add('walls', 'framing', hd.n > 2 ? 'lvl' : 'firDark', `${hd.label} header`,
        wallBox(wall, spec, o.off - 1.5, o.head, 0, ro.w + 3, hDepth, T),
        { size: hd.size, len: ro.w + 3, note: `${WALLS[wall].label} ${stockFor(o).label}` });
      const kingTop = gable ? Math.min(studTop, roofY(o.off + ro.w / 2, spec) - 5.5) : studTop;
      for (const u of [o.off - 3, o.off + ro.w + 1.5]) {
        for (const [a, b] of freeRuns(u, studBot, Math.max(studBot + 4, kingTop), o)) {
          add('walls', 'framing', 'fir', `${spec.studSize} king stud`,
            wallBox(wall, spec, u, a, 0, 1.5, b - a, T),
            { size: spec.studSize, len: b - a });
        }
      }
      for (const u of [o.off - 1.5, o.off + ro.w]) {
        for (const [a, b] of freeRuns(u, studBot, o.head, o)) {
          add('walls', 'framing', 'fir', `${spec.studSize} jack stud`,
            wallBox(wall, spec, u, a, 0, 1.5, b - a, T),
            { size: spec.studSize, len: b - a });
        }
      }
      if (sill > studBot + 1.5) {
        add('walls', 'framing', 'firDark', `${spec.studSize} sill`,
          wallBox(wall, spec, o.off, sill - 1.5, 0, ro.w, 1.5, T),
          { size: spec.studSize, len: ro.w });
      }
    }
  }

  /* ---------- 4. Lofts ---------- */
  const lj = LUMBER[spec.loftJoist];
  const lofts = [
    { name: 'Master loft', x0: L - spec.eastLoft, x1: L },
    { name: 'Library loft', x0: 0, x1: spec.westLoft },
  ];
  for (const lf of lofts) {
    if (lf.x1 - lf.x0 < 12) continue;
    const y = spec.loftHeight;
    for (let x = lf.x0 + 0.75; x <= lf.x1 - 0.75; x += 16) {
      add('loft', 'framing', 'fir', `${spec.loftJoist} loft joist`,
        boxPart([x, y - 0.75 - lj.d / 2, W / 2], [1.5, lj.d, W - T * 2]),
        { size: spec.loftJoist, len: W - T * 2, note: lf.name });
    }
    add('loft', 'framing', 'firDark', `${spec.loftJoist} loft ledger`,
      boxPart([(lf.x0 + lf.x1) / 2, y - 0.75 - lj.d / 2, T / 2], [lf.x1 - lf.x0, lj.d, T]),
      { size: spec.loftJoist, len: lf.x1 - lf.x0, note: lf.name });
    add('loft', 'framing', 'firDark', `${spec.loftJoist} loft ledger`,
      boxPart([(lf.x0 + lf.x1) / 2, y - 0.75 - lj.d / 2, W - T / 2], [lf.x1 - lf.x0, lj.d, T]),
      { size: spec.loftJoist, len: lf.x1 - lf.x0, note: lf.name });
    add('loft', 'deck', 'osb', '¾" loft deck',
      boxPart([(lf.x0 + lf.x1) / 2, y - 0.375, W / 2], [lf.x1 - lf.x0, 0.75, W - T * 2]),
      { area: (lf.x1 - lf.x0) * (W - T * 2) / 144, psf: PSF.subfloor, note: lf.name });
  }

  /* ---------- 5. Roof framing ---------- */
  const rd = rafterDesign(spec);
  const rdEl = LUMBER[rd.size] || LUMBER['2x8'];
  const ridgeD = ridgeDesign(spec);
  const ridgeEl = LUMBER[ridgeD.size] || LUMBER['2x10'];

  add('roof', 'framing', 'firDark', `${ridgeD.label} ridge beam`,
    boxPart([L / 2, H + spec.ridgeRise - ridgeEl.d / 2, W / 2],
      [L + spec.rakeOverhang * 2, ridgeEl.d, ridgeEl.t * (ridgeD.n || 3)]),
    { size: ridgeD.size, len: L + spec.rakeOverhang * 2 });

  const rise = spec.ridgeRise, halfW = W / 2;
  const angle = Math.atan2(rise, halfW);
  for (let x = 0.75; x <= L - 0.75; x += spec.studSpacing) {
    for (const side of [-1, 1]) {
      // From the eave, past the wall, up to the ridge
      const zE = side < 0 ? -spec.eaveOverhang : W + spec.eaveOverhang;
      const zR = halfW;
      const yE = roofY(side < 0 ? 0 : W, spec) - Math.tan(angle) * spec.eaveOverhang;
      const yR = H + rise;
      const len = Math.hypot(zR - zE, yR - yE);
      add('roof', 'framing', 'fir', `${rd.size} rafter`,
        memberBox3([x, yE, zE], [x, yR, zR], 1.5, rdEl.d),
        { size: rd.size, len });
    }
  }

  /* ---------- 6. Sheathing and dry-in ---------- */

  /* Girts outside, because the metal hangs on them and there is no exterior
     sheathing. The bracing sheathing is on the inside face, and goes on with
     the interior finish. */
  if (spec.wallSkin === 'girts') {
    const gs = LUMBER[spec.girtSize];
    for (const wall of ['N', 'S', 'W', 'E']) {
      for (const g of girtRuns(wall, spec, openings)) {
        add('dryin', 'girt', 'fir', `${spec.girtSize} girt`,
          wallBox(wall, spec, g.u0, g.y, T, g.u1 - g.u0, gs.t, gs.d),
          { size: spec.girtSize, len: g.u1 - g.u0, wall, y: g.y, u0: g.u0, u1: g.u1 });
      }
    }
  } else {
    for (const wall of ['N', 'S', 'W', 'E']) {
      for (const r of skinRects(wall, spec, openings, y0, H)) {
        add('dryin', 'sheathing', 'osb', '7/16" OSB sheathing',
          wallBox(wall, spec, r.u0, r.y0, T, r.u1 - r.u0, r.y1 - r.y0, 0.4375),
          { area: (r.u1 - r.u0) * (r.y1 - r.y0) / 144, psf: PSF.osb });
      }
    }
  }
  if (spec.roofDeck) {
    for (const side of [-1, 1]) {
      const zMid = side < 0 ? (W / 2) / 2 : W - (W / 2) / 2;
      const slope = Math.hypot(halfW + spec.eaveOverhang, rise);
      add('dryin', 'deck', 'osb', '7/16" roof deck',
        boxPart([L / 2, roofY(zMid, spec) + rdEl.d + 0.22,
          side < 0 ? (halfW - spec.eaveOverhang) / 2 : W - (halfW - spec.eaveOverhang) / 2],
        [L + spec.rakeOverhang * 2, 0.4375, slope], side * angle),
        { area: (L + spec.rakeOverhang * 2) * slope / 144, psf: PSF.osb });
    }
  }

  /* ---------- 7. Skin, windows and doors ---------- */
  const roofKind = spec.roofing === 'standing' ? 'Standing seam roof panel'
    : spec.roofing === 'metal' ? 'Metal roof panel' : 'Architectural shingle';
  const roofMat = spec.roofing === 'comp' ? 'shingle' : 'metal';
  for (const side of [-1, 1]) {
    const zMid = side < 0 ? (W / 2) / 2 : W - (W / 2) / 2;
    const slope = Math.hypot(halfW + spec.eaveOverhang, rise);
    add('skin', 'roofing', roofMat, roofKind,
      boxPart([L / 2, roofY(zMid, spec) + rdEl.d + 0.75,
        side < 0 ? (halfW - spec.eaveOverhang) / 2 : W - (halfW - spec.eaveOverhang) / 2],
      [L + spec.rakeOverhang * 2, 0.5, slope], side * angle),
      { area: (L + spec.rakeOverhang * 2) * slope / 144, psf: PSF.roofing[spec.roofing] });
  }
  const sideKind = spec.siding === 'metal' ? 'Metal wall panel' : 'Lap siding';
  const skinT = spec.wallSkin === 'girts' ? LUMBER[spec.girtSize].d : 0.4375;
  for (const wall of ['N', 'S', 'W', 'E']) {
    for (const r of skinRects(wall, spec, openings, y0, H)) {
      add('skin', 'siding', 'metal', sideKind,
        wallBox(wall, spec, r.u0, r.y0, T + skinT, r.u1 - r.u0, r.y1 - r.y0, 0.5),
        { area: (r.u1 - r.u0) * (r.y1 - r.y0) / 144, psf: PSF.siding[spec.siding] });
    }
    /* The gable triangle above the plate, which has no openings in it. */
    if (WALLS[wall].gable) {
      const gx = WALLS[wall].x === 0 ? -T - skinT - 0.5 : L + T + skinT;
      add('skin', 'siding', 'metal', sideKind,
        prismPart([[0, H], [W, H], [W / 2, H + spec.ridgeRise]], gx, gx + 0.5),
        { area: W * spec.ridgeRise / 2 / 144, psf: PSF.siding[spec.siding] });
    }
  }

  for (const o of openings) {
    const st = stockFor(o);
    const ro = roughOf(o);
    const sill = o.head - ro.h;
    const door = o.kind === 'door';
    add('skin', door ? 'door' : 'window', door ? 'door' : 'glass',
      door ? st.label : `${st.label}${st.frosted ? ', frosted' : ''}`,
      wallBox(o.wall, spec, o.off, sill, T - 1, ro.w, ro.h, 2.5),
      { area: ro.w * ro.h / 144, psf: door ? PSF.door : PSF.glazing, opening: o.id,
        note: `${fmtIn(st.w)} × ${fmtIn(st.h)} unit · ${fmtIn(ro.w)} × ${fmtIn(ro.h)} rough` });
    add('skin', 'trim', 'trim', 'Window and door trim',
      wallBox(o.wall, spec, o.off - 2, sill - 2, T + skinT + 0.5, ro.w + 4, ro.h + 4, 0.75),
      { area: ((ro.w + 4) * (ro.h + 4) - ro.w * ro.h) / 144, psf: PSF.trim });
  }

  /* ---------- 8. Insulation and interior ---------- */
  if (spec.wallInsulation === 'batt') {
    for (const wall of ['N', 'S', 'W', 'E']) {
      for (const r of skinRects(wall, spec, openings, y0, H)) {
        add('finish', 'insulation', 'batt', `R-${spec.studSize === '2x6' ? 21 : 15} wall batt`,
          wallBox(wall, spec, r.u0, r.y0, 0.5, r.u1 - r.u0, r.y1 - r.y0, T - 1),
          { area: (r.u1 - r.u0) * (r.y1 - r.y0) / 144, psf: PSF.wallBatt });
      }
    }
  }
  if (spec.ceilingInsulation) {
    for (const side of [-1, 1]) {
      const zMid = side < 0 ? (W / 2) / 2 : W - (W / 2) / 2;
      add('finish', 'insulation', 'batt', `R-30 lid batt, ${fmtIn(spec.ceilingInsulation)}`,
        boxPart([L / 2, roofY(zMid, spec) - spec.ceilingInsulation / 2, side < 0 ? halfW / 2 : W - halfW / 2],
          [L - T * 2, spec.ceilingInsulation, halfW - T], side * angle),
        { area: L * halfW / 144, psf: PSF.lidBatt });
    }
  }
  const finishName = spec.interiorFinish === 'gyp' ? '½" wall board'
    : spec.interiorFinish === 'osb' ? '7/16" OSB, braced and finished'
    : '¼" plywood lining';
  const finishMat = spec.interiorFinish === 'gyp' ? 'drywall'
    : spec.interiorFinish === 'osb' ? 'osb' : 'plywood';
  for (const wall of ['N', 'S', 'W', 'E']) {
    for (const r of skinRects(wall, spec, openings, y0, H)) {
      add('finish', 'drywall', finishMat, finishName,
        wallBox(wall, spec, r.u0, r.y0, -0.5, r.u1 - r.u0, r.y1 - r.y0, 0.5),
        { area: (r.u1 - r.u0) * (r.y1 - r.y0) / 144, psf: PSF.interior[spec.interiorFinish] });
    }
  }

  return { parts, rafter: rd, ridge: ridgeD, loft: loftDesign(spec), loads: roofLoads(spec) };
}
