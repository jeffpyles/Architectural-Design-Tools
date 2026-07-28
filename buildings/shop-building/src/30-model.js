/* ============================================================
   Turn the spec into every individual part of the building.
   ============================================================ */

function wallExtent(wall, spec) {
  const t = LUMBER[spec.studSize].d;
  switch (wall) {
    case 'N': return { u0: 0, u1: spec.width, axis: 'x', c0: 0, c1: t, out: 0, dir: -1 };
    case 'S': return { u0: 0, u1: spec.width, axis: 'x', c0: spec.depth - t, c1: spec.depth, out: spec.depth, dir: 1 };
    case 'W': return { u0: t, u1: spec.depth - t, axis: 'z', c0: 0, c1: t, out: 0, dir: -1 };
    case 'E': return { u0: t, u1: spec.depth - t, axis: 'z', c0: spec.width - t, c1: spec.width, out: spec.width, dir: 1 };
  }
}

/* Place a member in wall-local coordinates: u along the wall, v across its
   thickness, y up. Returns a world-space box. */
function wallBox(wall, spec, u, uLen, y, yLen, v, vLen) {
  const e = wallExtent(wall, spec);
  const cu = u + uLen / 2, cy = y + yLen / 2, cv = e.c0 + v + vLen / 2;
  return e.axis === 'x'
    ? boxPart([cu, cy, cv], [uLen, yLen, vLen])
    : boxPart([cv, cy, cu], [vLen, yLen, uLen]);
}

/* ---------------------------------------------------------------- */

function buildModel(spec, openings) {
  const parts = [];
  let seq = 0;
  const add = (stage, sys, mat, kind, geom, extra) => {
    parts.push({ id: `p${seq++}`, stage, sys, mat, kind, geom, ...(extra || {}) });
  };

  const T = LUMBER[spec.studSize].d;          // wall thickness, 5.5"
  const tr = trussGeometry(spec);
  const W = spec.width, D = spec.depth, H = spec.wallHeight;
  const loads = roofLoads(spec);

  /* ---------- 1. Site & slab ---------- */
  const over = 12;   // gravel runs past the turndown
  add('site', 'site', 'gravel', 'Compacted base',
    boxPart([W / 2, -spec.slabThickness - spec.gravelDepth / 2, D / 2],
      [W + over * 2, spec.gravelDepth, D + over * 2]));

  add('site', 'slab', 'concrete', 'Slab, 4"',
    boxPart([W / 2, -spec.slabThickness / 2, D / 2], [W, spec.slabThickness, D]),
    { note: `${fmtN(W * D / 144)} sf` });

  // Thickened perimeter, poured monolithic with the slab
  const td = spec.turndownDepth, tw = spec.turndownWidth;
  const yT = -spec.slabThickness - (td - spec.slabThickness) / 2;
  const hT = td - spec.slabThickness;
  add('site', 'slab', 'concrete', 'Turndown footing', boxPart([W / 2, yT, tw / 2], [W, hT, tw]));
  add('site', 'slab', 'concrete', 'Turndown footing', boxPart([W / 2, yT, D - tw / 2], [W, hT, tw]));
  add('site', 'slab', 'concrete', 'Turndown footing', boxPart([tw / 2, yT, D / 2], [tw, hT, D - tw * 2]));
  add('site', 'slab', 'concrete', 'Turndown footing', boxPart([W - tw / 2, yT, D / 2], [tw, hT, D - tw * 2]));

  // Apron at the overhead door
  for (const o of openings) {
    if (o.kind !== 'overhead') continue;
    const st = stockFor(o); const e = wallExtent(o.wall, spec);
    const apron = 48;
    if (e.axis === 'x') {
      add('site', 'slab', 'concrete', 'Door apron',
        boxPart([o.off + st.w / 2, -spec.slabThickness / 2, e.out + e.dir * apron / 2],
          [st.w + 24, spec.slabThickness, apron]));
    }
  }

  // Anchor bolts, 6' o.c. and within 12" of every plate end
  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const run = e.u1 - e.u0;
    const n = Math.max(2, Math.ceil(run / 72) + 1);
    for (let i = 0; i < n; i++) {
      const u = e.u0 + 6 + (run - 12) * (i / (n - 1));
      add('site', 'slab', 'metal', 'Anchor bolt ½"',
        wallBox(wall, spec, u - 0.3, 0.6, -8, 16, T / 2 - 0.3, 0.6));
    }
  }

  /* ---------- 2. Wall framing ---------- */
  const spacing = spec.studSpacing;
  const studLen = H - 1.5 - 3;                 // under a double top plate

  const openingFraming = [];                   // reused by the skin stage

  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const run = e.u1 - e.u0;
    const ops = openingsOn(wall, openings).map((o) => ({ o, st: stockFor(o) }));

    // Plates. Bottom is treated, sitting on the slab.
    add('walls', 'plate', 'treated', `${spec.studSize} PT bottom plate`,
      wallBox(wall, spec, e.u0, run, 0, 1.5, 0, T), { len: run, size: spec.studSize });
    add('walls', 'plate', 'firDark', `${spec.studSize} top plate`,
      wallBox(wall, spec, e.u0, run, H - 3, 1.5, 0, T), { len: run, size: spec.studSize });
    add('walls', 'plate', 'firDark', `${spec.studSize} top plate (2nd)`,
      wallBox(wall, spec, e.u0, run, H - 1.5, 1.5, 0, T), { len: run, size: spec.studSize });

    // Which stretches of wall are blocked by an opening (including its framing)
    const blocked = ops.map(({ o, st }) => {
      const nj = st.w > 72 ? 2 : 1;
      return { a: o.off - 1.5 * (nj + 1), b: o.off + st.w + 1.5 * (nj + 1) };
    });
    const isBlocked = (u) => blocked.some((b) => u + 1.5 > b.a && u < b.b);

    // Full-height studs on layout
    const first = e.u0;
    for (let u = first; u <= e.u1 - 1.5 + 0.01; u = (u === first ? first + spacing - 0.75 : u + spacing)) {
      const uu = Math.min(u, e.u1 - 1.5);
      if (isBlocked(uu)) continue;
      add('walls', 'stud', 'fir', `${spec.studSize} stud`,
        wallBox(wall, spec, uu, 1.5, 1.5, studLen, 0, T), { len: studLen, size: spec.studSize });
    }
    // Make sure both ends of the wall get a stud
    for (const uu of [e.u0, e.u1 - 1.5]) {
      if (!isBlocked(uu)) {
        add('walls', 'stud', 'fir', `${spec.studSize} stud (end)`,
          wallBox(wall, spec, uu, 1.5, 1.5, studLen, 0, T), { len: studLen, size: spec.studSize });
      }
    }

    // Corner posts — an extra stud turned in on the bearing walls
    if (wall === 'N' || wall === 'S') {
      for (const uu of [e.u0 + 1.5, e.u1 - 3]) {
        add('walls', 'stud', 'fir', `${spec.studSize} corner stud`,
          wallBox(wall, spec, uu, 1.5, 1.5, studLen, 0, T), { len: studLen, size: spec.studSize });
      }
    }

    // Opening framing
    for (const { o, st } of ops) {
      const nj = st.w > 72 ? 2 : 1;
      const hdr = sizeHeader(st.w, wall, spec);
      const hdrDepth = hdr.over ? 14 : hdr.depth;
      const hdrThick = hdr.over ? T : hdr.thickness;
      const sill = o.head - st.h;
      const jackTop = o.head;
      const hdrBot = o.head;

      openingFraming.push({ o, st, hdr, nj, sill });

      // King studs outside the jacks
      for (const s of [-1, 1]) {
        const u = s < 0 ? o.off - 1.5 * (nj + 1) : o.off + st.w + 1.5 * nj;
        add('walls', 'king', 'fir', `${spec.studSize} king stud`,
          wallBox(wall, spec, u, 1.5, 1.5, studLen, 0, T), { len: studLen, size: spec.studSize });
      }
      // Jack studs carrying the header
      for (const s of [-1, 1]) {
        for (let j = 0; j < nj; j++) {
          const u = s < 0 ? o.off - 1.5 * (j + 1) : o.off + st.w + 1.5 * j;
          add('walls', 'jack', 'firDark', `${spec.studSize} jack stud`,
            wallBox(wall, spec, u, 1.5, 1.5, jackTop - 1.5, 0, T),
            { len: jackTop - 1.5, size: spec.studSize });
        }
      }
      // Header
      const hdrLen = st.w + 2 * 1.5 * nj;
      add('walls', 'header', hdr.kind === 'lvl' ? 'lvl' : 'firDark',
        `Header ${hdr.label}`,
        wallBox(wall, spec, o.off - 1.5 * nj, hdrLen, hdrBot, hdrDepth, (T - hdrThick) / 2, hdrThick),
        { len: hdrLen, size: hdr.label, span: st.w });

      // Cripples over the header
      const cripTop = H - 3;
      if (cripTop - (hdrBot + hdrDepth) > 1) {
        const cLen = cripTop - (hdrBot + hdrDepth);
        for (let u = o.off; u < o.off + st.w - 1.5; u += spacing) {
          add('walls', 'cripple', 'fir', `${spec.studSize} cripple`,
            wallBox(wall, spec, u, 1.5, hdrBot + hdrDepth, cLen, 0, T),
            { len: cLen, size: spec.studSize });
        }
      }

      // Sill and cripples below, for windows
      if (o.kind === 'window' && sill > 3) {
        add('walls', 'sill', 'firDark', `${spec.studSize} sill (2 ply)`,
          wallBox(wall, spec, o.off, st.w, sill - 3, 3, 0, T), { len: st.w, size: spec.studSize });
        const cLen = sill - 3 - 1.5;
        for (let u = o.off; u < o.off + st.w - 1.5; u += spacing) {
          add('walls', 'cripple', 'fir', `${spec.studSize} cripple (under sill)`,
            wallBox(wall, spec, u, 1.5, 1.5, cLen, 0, T), { len: cLen, size: spec.studSize });
        }
      }
    }
  }

  /* ---------- 3. Trusses & roof framing ---------- */
  const n = tr.count;
  const trussX = [];
  for (let i = 0; i < n; i++) {
    let x = i * spec.trussSpacing;
    if (i === 0) x = 0.75;
    if (i === n - 1) x = W - 0.75;
    trussX.push(x);
  }

  const cd = tr.chord.d, ct = tr.chord.t;
  for (let i = 0; i < n; i++) {
    const x = trussX[i];
    const isGable = i === 0 || i === n - 1;
    const label = isGable ? 'Gable end truss' : `Truss ${i + 1} of ${n}`;

    // Bottom chord, two sticks spliced under the king post
    for (const [z0, z1] of [[0, tr.half], [tr.half, D]]) {
      add('trusses', 'truss', 'fir', `${tr.chordSize} bottom chord`,
        memberBox([z0, tr.bcTop], [z1, tr.bcTop], x, ct, cd, 'below'),
        { len: z1 - z0, size: tr.chordSize, truss: i, group: label });
    }
    // Top chords, run out past the wall for the eave
    for (const s of [-1, 1]) {
      const zHeel = s < 0 ? -spec.eaveOverhang : D + spec.eaveOverhang;
      const yHeel = tr.bcTop - spec.eaveOverhang * tr.slope;
      add('trusses', 'truss', 'fir', `${tr.chordSize} top chord`,
        memberBox([zHeel, yHeel], [tr.half, tr.peakY], x, ct, cd, 'above'),
        { len: tr.tcLength, size: tr.chordSize, truss: i, group: label });
    }

    if (isGable) {
      // Vertical studs instead of webs, so the gable wall has something to skin
      for (let z = spacing; z < D; z += spacing) {
        const yTop = tr.y(z);
        if (yTop - tr.bcTop < 3) continue;
        add('trusses', 'truss', 'fir', `${spec.studSize} gable stud`,
          memberBox([z, tr.bcTop], [z, yTop], x, ct, cd, 'center'),
          { len: yTop - tr.bcTop, size: spec.studSize, truss: i, group: label });
      }
    } else {
      for (const wmem of tr.webs) {
        add('trusses', 'truss', 'fir', `${tr.chordSize} ${wmem.name.toLowerCase()}`,
          memberBox(wmem.a, wmem.b, x, ct, cd, 'center'),
          { len: wmem.len, size: tr.chordSize, truss: i, group: label });
      }
      // ¾" plywood gussets, both faces of every joint
      const joints = [tr.nodes.heelL, tr.nodes.heelR, tr.nodes.peak,
        tr.nodes.bcL, tr.nodes.bcR, tr.nodes.bcMid, tr.nodes.tcL, tr.nodes.tcR];
      for (const j of joints) {
        for (const s of [-1, 1]) {
          add('trusses', 'gusset', 'plywood', '¾" plywood gusset',
            boxPart([x + s * (ct / 2 + 0.375), j[1] + 1, j[0]], [0.75, 13, 15]),
            { truss: i, group: label });
        }
      }
    }
  }

  // Permanent bracing. With no roof deck this is what holds the trusses plumb
  // as a group — the job a sheathed deck would otherwise do.
  if (spec.roofPlaneBracing) {
    // Diagonals in each roof plane, corner to corner, under the top chords
    const roofY = (z) => tr.y(z) - 1;
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? 8 : D - 8, z1 = s < 0 ? tr.half - 8 : tr.half + 8;
      for (const dir of [-1, 1]) {
        const A = [dir < 0 ? 6 : W - 6, roofY(z0), z0];
        const B = [dir < 0 ? W - 6 : 6, roofY(z1), z1];
        add('trusses', 'bracing', 'firDark', '2x4 roof-plane diagonal brace',
          memberBox3(A, B, 1.5, 3.5),
          { len: Math.hypot(W - 12, z1 - z0, roofY(z1) - roofY(z0)), size: '2x4' });
      }
    }
    // Continuous lateral restraint on the king posts
    add('trusses', 'bracing', 'firDark', '2x4 continuous lateral web brace',
      boxPart([W / 2, tr.bcTop + tr.rise / 2, tr.half], [W, 3.5, 1.5]), { len: W, size: '2x4' });
    // Bottom chord restraint, with a diagonal to carry it to the walls
    for (const z of [D / 4, D * 3 / 4]) {
      add('trusses', 'bracing', 'firDark', '2x4 bottom chord restraint',
        boxPart([W / 2, tr.bcBot - 1.75, z], [W, 3.5, 1.5]), { len: W, size: '2x4' });
    }
    for (const dir of [-1, 1]) {
      add('trusses', 'bracing', 'firDark', '2x4 bottom chord diagonal',
        memberBox3([6, tr.bcBot - 1.75, dir < 0 ? D / 4 : D * 3 / 4],
          [W - 6, tr.bcBot - 1.75, dir < 0 ? D * 3 / 4 : D / 4], 1.5, 3.5),
        { len: Math.hypot(W - 12, D / 2), size: '2x4' });
    }
  }

  // Rake ladder / outriggers past the gable ends, and fascia all round
  for (const s of [-1, 1]) {
    const x = s < 0 ? -spec.rakeOverhang / 2 : W + spec.rakeOverhang / 2;
    for (const side of [-1, 1]) {
      const zA = side < 0 ? -spec.eaveOverhang : D + spec.eaveOverhang;
      add('trusses', 'bracing', 'fir', '2x4 rake outrigger',
        memberBox([zA, tr.bcTop - spec.eaveOverhang * tr.slope + cd],
          [tr.half, tr.peakY + cd], x, spec.rakeOverhang, 1.5, 'below'),
        { len: tr.tcLength, size: '2x4' });
    }
  }
  for (const s of [-1, 1]) {
    const z = s < 0 ? -spec.eaveOverhang - 0.75 : D + spec.eaveOverhang + 0.75;
    const y = tr.bcTop - spec.eaveOverhang * tr.slope + cd / 2;
    add('trusses', 'trim', 'firDark', '2x6 sub-fascia',
      boxPart([W / 2, y, z], [W + spec.rakeOverhang * 2, cd, 1.5]),
      { len: W + spec.rakeOverhang * 2, size: '2x6' });
  }

  /* ---------- 3b. Lean-to ----------
     Ledger at the wall top, rafters down to a beam on posts. Drawn on the
     outboard side of whichever wall it is attached to. */
  const lt = leanToDesign(spec);
  if (lt && !lt.impossible) {
    const e = wallExtent(lt.wall, spec);
    const out = e.dir;                       // -1 west/north, +1 east/south
    const face = e.out;                      // the wall's outside coordinate
    const rd = LUMBER[lt.rafter.size].d;
    const P = lt.projection;

    // A point `d` out from the wall at height y, at position u along the wall
    const at = (d, y, u) => (e.axis === 'x'
      ? [u, y, face + out * d]
      : [face + out * d, y, u]);

    // Ledger, lagged into the wall studs
    add('trusses', 'leanto', 'firDark', `${lt.rafter.size} ledger`,
      wallBox(lt.wall, spec, e.u0, e.u1 - e.u0, H - rd, rd, T, 1.5),
      { len: e.u1 - e.u0, size: lt.rafter.size });

    // Rafters
    const yWall = H - rd / 2 / Math.cos(lt.angle);
    for (let u = 0; u <= lt.run - 1.5 + 0.01; u += spec.leanToSpacing) {
      const uu = Math.min(u, lt.run - 1.5);
      add('trusses', 'leanto', 'fir', `${lt.rafter.size} lean-to rafter`,
        memberBox3(at(0, yWall, uu + 0.75), at(P, yWall - P * lt.slope, uu + 0.75), 1.5, rd),
        { len: lt.rafterLen, size: lt.rafter.size });
    }

    // Beam at the outer edge, carried on posts
    const beamMid = lt.beamTop - lt.beam.depth / 2;
    add('trusses', 'leanto', lt.beam.kind === 'lvl' ? 'lvl' : 'firDark',
      `Lean-to beam ${lt.beam.label}`,
      (e.axis === 'x'
        ? boxPart([lt.run / 2, beamMid, face + out * (P - lt.beam.thickness / 2)],
          [lt.run, lt.beam.depth, lt.beam.thickness])
        : boxPart([face + out * (P - lt.beam.thickness / 2), beamMid, lt.run / 2],
          [lt.beam.thickness, lt.beam.depth, lt.run])),
      { len: lt.run, size: lt.beam.label });

    // Posts and their piers
    for (let i = 0; i < lt.posts; i++) {
      const u = 2.75 + (lt.run - 5.5) * (i / (lt.posts - 1));
      const pc = at(P - lt.beam.thickness / 2, lt.beamBot / 2, u);
      add('trusses', 'leanto', 'firDark', '6x6 post',
        boxPart([pc[0], lt.beamBot / 2, pc[2]], [5.5, lt.beamBot, 5.5]),
        { len: lt.beamBot, size: '6x6' });
      add('site', 'slab', 'concrete', 'Lean-to pier',
        boxPart([pc[0], -18, pc[2]], [18, 36, 18]));
    }

    // Purlins and the roof panel, on the rafters
    const nP = Math.max(2, Math.floor(lt.rafterLen / spec.purlinSpacing) + 1);
    for (let i = 0; i <= nP; i++) {
      const along = Math.min(i * spec.purlinSpacing, lt.rafterLen - 1.75);
      const d = along * Math.cos(lt.angle);
      const y = H - rd / Math.cos(lt.angle) - d * lt.slope + 1.75;
      add('dryin', 'leanto', 'fir', `${spec.purlinSize} lean-to purlin`,
        (e.axis === 'x'
          ? boxPart([lt.run / 2, y, face + out * d], [lt.run, 1.5, 3.5])
          : boxPart([face + out * d, y, lt.run / 2], [3.5, 1.5, lt.run])),
        { len: lt.run, size: spec.purlinSize });
    }
    const yTop = H - rd / Math.cos(lt.angle) + 3.9;
    add('roof', 'leanto', spec.roofing === 'metal' ? 'metal' : 'shingle',
      spec.roofing === 'metal' ? 'Lean-to metal panel' : 'Lean-to shingle',
      memberBox3(at(-2, yTop + 0.5, lt.run / 2),
        at(P + 4, yTop - (P + 4) * lt.slope, lt.run / 2), lt.run, 0.7),
      { area: (P + 6) * lt.run / 144,
        psf: spec.roofing === 'metal' ? 0.9 : 2.6 });
  }

  /* ---------- 4. Dry-in: purlins or deck, girts or sheathing ---------- */
  const roofTopOffset = tr.perp;                 // vertical thickness of the sloped chord
  const roofRunSloped = (tr.half + spec.eaveOverhang) / Math.cos(tr.angle);

  if (spec.roofDeck === 'purlins') {
    const pl = LUMBER[spec.purlinSize];
    const flat = spec.trussSpacing <= 24;        // flat is plenty at 24" spans
    const pt = flat ? pl.d : pl.t, pd = flat ? pl.t : pl.d;
    const nP = Math.floor(roofRunSloped / spec.purlinSpacing) + 1;
    for (const s of [-1, 1]) {
      for (let i = 0; i <= nP; i++) {
        const along = Math.min(i * spec.purlinSpacing, roofRunSloped - 1.75);
        const zEave = s < 0 ? -spec.eaveOverhang : D + spec.eaveOverhang;
        const dz = -s * along * Math.cos(tr.angle);
        const z = zEave + dz;
        const y = tr.bcTop - spec.eaveOverhang * tr.slope + roofTopOffset + along * Math.sin(tr.angle);
        add('dryin', 'purlin', 'fir', `${spec.purlinSize} purlin${flat ? ' (flat)' : ''}`,
          boxPart([W / 2, y + pd / 2, z], [W + spec.rakeOverhang * 2, pd, pt], s * tr.angle),
          { len: W + spec.rakeOverhang * 2, size: spec.purlinSize });
      }
    }
  } else {
    for (const s of [-1, 1]) {
      const midAlong = roofRunSloped / 2;
      const zEave = s < 0 ? -spec.eaveOverhang : D + spec.eaveOverhang;
      const z = zEave - s * midAlong * Math.cos(tr.angle);
      const y = tr.bcTop - spec.eaveOverhang * tr.slope + roofTopOffset
        + midAlong * Math.sin(tr.angle) + 0.22;
      add('dryin', 'deck', 'osb', '7/16" OSB roof deck',
        boxPart([W / 2, y, z], [W + spec.rakeOverhang * 2, 0.4375, roofRunSloped], s * tr.angle),
        { area: (W + spec.rakeOverhang * 2) * roofRunSloped / 144 });
    }
  }

  // Braced panels — the racking resistance that the missing sheathing used to
  // provide. Drawn from the same list the review panel counts.
  const bracedRuns = [];
  for (const wall of ['N', 'S', 'W', 'E']) {
    for (const pn of bracedPanels(wall, openings, spec)) {
      bracedRuns.push({ wall, ...pn });
      if (spec.bracing === 'strap') {
        // A tension-only X across the bay, let into the stud faces
        const e = wallExtent(wall, spec);
        const v = e.c0 + (e.dir < 0 ? T - 0.1 : 0.1);
        const pos = (u, y) => (e.axis === 'x' ? [u, y, v] : [v, y, u]);
        for (const s of [-1, 1]) {
          const A = pos(s < 0 ? pn.a : pn.a + pn.w, 1.5);
          const B = pos(s < 0 ? pn.a + pn.w : pn.a, H - 3);
          add('dryin', 'bracing', 'metal', '20 ga steel strap X-brace',
            memberBox3(A, B, 0.05, 1.5),
            { len: Math.hypot(pn.w, H - 4.5), note: `${WALLS[wall].label} wall`,
              lbft: 1.25 * 0.036 * 0.2836 * 12 });
        }
      } else if (spec.bracing !== 'none') {
        add('dryin', 'sheathing', 'osb', '7/16" OSB braced panel',
          wallBox(wall, spec, pn.a, pn.w, 0, H, T, 0.4375),
          { area: pn.w * H / 144, note: `${WALLS[wall].label} wall` });
      }
    }
  }

  // Girts (or full wall sheathing) — the siding needs something to screw to.
  // A girt stops at the rough opening it runs into and picks up on the far
  // side, and every opening gets one at its head and sill so the trim and
  // the cut edge of the panel have backing.
  if (spec.wallSkin === 'girts') {
    const gl = LUMBER[spec.girtSize];
    const rows = [];
    for (let y = spec.girtSpacing; y < H - 6; y += spec.girtSpacing) rows.push(y);
    rows.push(H - 5);
    for (const wall of ['N', 'S', 'W', 'E']) {
      const e = wallExtent(wall, spec);
      for (const y of rows) {
        for (const sg of girtRuns(wall, openings, spec, y, gl.t)) {
          add('dryin', 'girt', 'fir', `${spec.girtSize} girt (flat)`,
            wallBox(wall, spec, sg.a, sg.b - sg.a, y, gl.t, T + 0.4375, gl.d),
            { len: sg.b - sg.a, size: spec.girtSize, wall, u0: sg.a, u1: sg.b, y });
        }
      }
      for (const o of openingsOn(wall, openings)) {
        const st = stockFor(o);
        const a = Math.max(e.u0, o.off - 1.5), b = Math.min(e.u1, o.off + st.w + 1.5);
        if (b - a < 2) continue;
        const sill = o.head - st.h;
        const at = [o.head];                       // head girt, always
        if (sill > 8) at.push(sill - gl.t);        // sill girt, unless it sits on the slab
        for (const y of at) {
          add('dryin', 'girt', 'fir', `${spec.girtSize} girt at opening`,
            wallBox(wall, spec, a, b - a, y, gl.t, T + 0.4375, gl.d),
            { len: b - a, size: spec.girtSize, wall, u0: a, u1: b, y, atOpening: true });
        }
      }
    }
  } else {
    for (const wall of ['N', 'S', 'W', 'E']) {
      const e = wallExtent(wall, spec);
      add('dryin', 'sheathing', 'osb', '7/16" OSB wall sheathing',
        wallBox(wall, spec, e.u0, e.u1 - e.u0, 0, H, T, 0.4375),
        { area: (e.u1 - e.u0) * H / 144 });
    }
  }

  // Gable end infill above the top plate
  for (const s of [-1, 1]) {
    const x = s < 0 ? -0.4375 : W;
    const gableSf = D * (tr.peakY + tr.perp - H) / 2 / 144;
    add('dryin', 'sheathing', spec.wallSkin === 'girts' ? 'wrap' : 'osb',
      spec.wallSkin === 'girts' ? 'Housewrap, gable end' : '7/16" OSB wall sheathing',
      prismPart([[0, H], [D, H], [tr.half + 0.01, tr.peakY + tr.perp]], x, x + 0.4375),
      { area: gableSf });
  }

  /* ---------- 5. Roofing ---------- */
  const panelW = 36;
  const roofW = W + spec.rakeOverhang * 2;
  const nPanels = Math.ceil(roofW / panelW);
  const roofMat = spec.roofing === 'metal' ? 'metal' : 'shingle';
  const roofPsf = spec.roofing === 'metal' ? 0.9 : 2.6;
  for (const s of [-1, 1]) {
    const midAlong = roofRunSloped / 2;
    const zEave = s < 0 ? -spec.eaveOverhang : D + spec.eaveOverhang;
    const deckT = spec.roofDeck === 'osb' ? 0.4375 : 0;
    const purlinT = spec.roofDeck === 'purlins'
      ? (spec.trussSpacing <= 24 ? LUMBER[spec.purlinSize].t : LUMBER[spec.purlinSize].d) : 0;
    const z = zEave - s * midAlong * Math.cos(tr.angle);
    const y = tr.bcTop - spec.eaveOverhang * tr.slope + roofTopOffset + deckT + purlinT
      + midAlong * Math.sin(tr.angle) + 0.35;
    for (let i = 0; i < nPanels; i++) {
      const pw = Math.min(panelW, roofW - i * panelW);
      const cx = -spec.rakeOverhang + i * panelW + pw / 2;
      add('roof', 'roofing', roofMat,
        spec.roofing === 'metal' ? '26 ga metal roof panel' : 'Architectural shingle',
        boxPart([cx, y, z], [pw - 0.5, 0.7, roofRunSloped], s * tr.angle),
        { area: pw * roofRunSloped / 144, psf: roofPsf });
    }
  }
  const vented = spec.venting === 'ridge-gable' || spec.venting === 'ridge-soffit';
  add('roof', 'roofing', roofMat,
    vented ? 'Vented ridge cap' : (spec.roofing === 'metal' ? 'Ridge cap' : 'Hip & ridge'),
    boxPart([W / 2, tr.peakY + tr.perp + (vented ? 2.6 : 1.6), tr.half], [roofW, vented ? 3.4 : 2.4, 14]),
    { len: roofW, lb: roofW / 12 * 1.6 });

  // Gable louvres, sized off the net free area the ventilation check asks for
  if (spec.venting === 'ridge-gable' || spec.venting === 'gable') {
    const v = ventilation(spec);
    const lw = Math.max(16, Math.min(36, Math.sqrt(v.gableEach / 0.6 * 1.5)));
    const lh = Math.max(12, (v.gableEach / 0.6) / lw);
    for (const s of [-1, 1]) {
      const x = s < 0 ? -1.6 : W + 0.6;
      const yTop = tr.peakY + tr.perp;
      add('roof', 'trim', 'trim', `Gable louvre, ${fmtIn(lw)} × ${fmtIn(lh)}`,
        boxPart([x + (s < 0 ? 0 : 1), yTop - lh / 2 - 5, tr.half], [2, lh, lw]),
        { note: `${fmtN(v.gableEach)} sq in net free area` });
    }
  }
  for (const s of [-1, 1]) {
    const z = s < 0 ? -spec.eaveOverhang - 1.2 : D + spec.eaveOverhang + 1.2;
    add('roof', 'trim', 'trim', 'Eave trim',
      boxPart([W / 2, tr.bcTop - spec.eaveOverhang * tr.slope + cd / 2, z], [roofW, cd + 1, 1]),
      { len: roofW });
  }

  /* ---------- 6. Siding, doors, windows ---------- */
  /* What a square foot of each covering actually weighs. The model draws
     panel at 0.7" so it reads on screen; 26 ga steel is 0.018". */
  const sidePsf = spec.siding === 'metal' ? 0.9 : 2.0;
  const skinOut = spec.wallSkin === 'girts' ? 0.4375 + LUMBER[spec.girtSize].t : 0.4375;
  const sidingT = spec.siding === 'metal' ? 0.75 : 0.5;

  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const ops = openingsOn(wall, openings).map((o) => ({ o, st: stockFor(o) }));
    const segs = solidSegments(wall, openings, spec);
    // Siding below the plate, broken around the openings
    for (const sg of segs) {
      add('skin', 'siding', spec.siding === 'metal' ? 'metal' : 'trim',
        spec.siding === 'metal' ? 'Metal wall panel' : 'Lap siding',
        wallBox(wall, spec, sg.a, sg.w, 0, H, T + skinOut, sidingT),
        { area: sg.w * H / 144, psf: sidePsf });
    }
    // Head and sill strips over the openings
    const sidingName = spec.siding === 'metal' ? 'Metal wall panel' : 'Lap siding';
    for (const { o, st } of ops) {
      if (H - o.head > 1) {
        add('skin', 'siding', spec.siding === 'metal' ? 'metal' : 'trim', sidingName,
          wallBox(wall, spec, o.off, st.w, o.head, H - o.head, T + skinOut, sidingT),
          { area: st.w * (H - o.head) / 144, psf: sidePsf });
      }
      const sill = o.head - st.h;
      if (sill > 1) {
        add('skin', 'siding', spec.siding === 'metal' ? 'metal' : 'trim', sidingName,
          wallBox(wall, spec, o.off, st.w, 0, sill, T + skinOut, sidingT),
          { area: st.w * sill / 144, psf: sidePsf });
      }
    }
    // Gable infill above the plate
    if (wall === 'W' || wall === 'E') {
      const gx = wall === 'W' ? -skinOut - sidingT : W + skinOut;
      add('skin', 'siding', spec.siding === 'metal' ? 'metal' : 'trim', sidingName,
        prismPart([[0, H], [D, H], [tr.half + 0.01, tr.peakY + tr.perp]], gx, gx + sidingT),
        { area: D * (tr.peakY + tr.perp - H) / 2 / 144, psf: sidePsf });
    }
    // Corner trim
    for (const uu of [e.u0, e.u1 - 3]) {
      add('skin', 'trim', 'trim', 'Corner trim',
        wallBox(wall, spec, uu, 3, 0, H, T + skinOut, sidingT + 0.2));
    }
  }

  // The units themselves
  for (const { o, st } of openings.map((o) => ({ o, st: stockFor(o) }))) {
    const sill = o.head - st.h;
    const inset = T + skinOut - 2;
    if (o.kind === 'window') {
      add('skin', 'window', 'trim', `Window ${st.label}`,
        wallBox(o.wall, spec, o.off, st.w, sill, st.h, inset, 1.5),
        { pick: o.id, note: st.label });
      add('skin', 'window', 'glass', 'Glazing',
        wallBox(o.wall, spec, o.off + 2, st.w - 4, sill + 2, st.h - 4, inset + 0.4, 0.8),
        { pick: o.id });
    } else if (o.kind === 'overhead') {
      add('skin', 'door', 'ohdoor', `Overhead door ${fmtFt(st.w)} × ${fmtFt(st.h)}`,
        wallBox(o.wall, spec, o.off, st.w, 0, st.h, T - 2.5, 2),
        { pick: o.id, note: st.label });
    } else {
      add('skin', 'door', 'door', `Man door ${st.label}`,
        wallBox(o.wall, spec, o.off + 1, st.w - 2, 0, st.h - 1.5, inset, 1.75),
        { pick: o.id, note: st.label });
    }
    /* Drawn as a slab over the whole opening so it reads as a surround, but
       it is a 4" band around the edge — weighed as one rather than as the
       slab it is drawn as. */
    add('skin', 'trim', 'trim', 'Opening trim',
      wallBox(o.wall, spec, o.off - 2.5, st.w + 5, Math.max(0, sill - 2.5), st.h + 5, T + skinOut, sidingT + 0.25),
      { pick: o.id, lb: 2 * ((st.w + 5) + (st.h + 5)) * 4 * 0.75 * 0.0185 });
  }

  /* ---------- 7. Electrical ---------- */
  // Sub-panel goes on the east wall by the man door — shortest feeder to the house
  const panelU = 96, panelY = 54;
  add('elec', 'panel', 'panel', `${spec.service} A sub-panel`,
    wallBox('E', spec, panelU, 20, panelY, 30, T - 4, 4), { note: 'Fed from the house' });
  add('elec', 'wire', 'conduit', 'Feeder to house',
    wallBox('E', spec, panelU + 8, 2, panelY + 30, H - panelY - 33, T - 3, 2));

  // Perimeter receptacle circuit at 48" — shop height, above a bench
  const recepY = 48;
  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    add('elec', 'wire', 'conduit', '12/2 home run',
      wallBox(wall, spec, e.u0, e.u1 - e.u0, recepY + 2, 1, 1.5, 1),
      { len: e.u1 - e.u0 });
    for (let u = e.u0 + 36; u < e.u1 - 24; u += 96) {
      const blocked = openingsOn(wall, openings).some((o) => {
        const st = stockFor(o);
        return u > o.off - 6 && u < o.off + st.w + 6 && (o.head - st.h) < recepY + 6;
      });
      if (blocked) continue;
      add('elec', 'device', 'box', '20 A receptacle',
        wallBox(wall, spec, u, 4, recepY, 4.5, 1.5, 2.5), { note: `${WALLS[wall].label} wall` });
    }
  }

  // Lights on the bottom chords, switches at each door
  const rows = [D / 4, D / 2, D * 3 / 4];
  for (const z of rows) {
    add('elec', 'wire', 'conduit', '12/2 lighting run',
      boxPart([W / 2, tr.bcBot - 1, z], [W - 12, 1, 1]), { len: W - 12 });
    for (let x = 36; x < W - 24; x += 72) {
      add('elec', 'fixture', 'fixture', '4\' LED strip light',
        boxPart([x + 24, tr.bcBot - 3, z], [48, 3, 5]));
    }
  }
  for (const o of openings) {
    if (o.kind === 'overhead') continue;
    const st = stockFor(o);
    const e = wallExtent(o.wall, spec);
    const u = o.off + st.w + 6 < e.u1 ? o.off + st.w + 6 : o.off - 10;
    add('elec', 'device', 'box', 'Switch', wallBox(o.wall, spec, u, 4, 46, 4.5, 1.5, 2.5));
  }
  add('elec', 'device', 'box', 'Opener receptacle (ceiling)',
    boxPart([W / 2, tr.bcBot - 2, D - 120], [4, 4, 4]));

  /* ---------- 8. Insulation & drywall ---------- */
  if (spec.insulation) {
    for (const wall of ['N', 'S', 'W', 'E']) {
      const e = wallExtent(wall, spec);
      for (const sg of solidSegments(wall, openings, spec)) {
        const a = Math.max(sg.a, e.u0), b = Math.min(sg.b, e.u1);
        if (b - a < 6) continue;
        add('finish', 'insulation', 'batt', `R-21 batt, ${spec.studSize} cavity`,
          wallBox(wall, spec, a + 1.5, b - a - 3, 1.5, H - 4.5, 0.5, T - 1),
          { area: (b - a) * H / 144 });
      }
    }
    add('finish', 'insulation', 'blown', `R-49 blown, ${fmtIn(spec.ceilingInsulation)} deep`,
      boxPart([W / 2, tr.bcTop + spec.ceilingInsulation / 2, D / 2],
        [W - 12, spec.ceilingInsulation, D - 12]),
      { area: (W - 12) * (D - 12) / 144 });
  }
  if (spec.ceilingDrywall) {
    add('finish', 'drywall', 'drywall', '⅝" ceiling board',
      boxPart([W / 2, tr.bcBot - 0.3125, D / 2], [W - 11, 0.625, D - 11]),
      { area: (W - 11) * (D - 11) / 144 });
  }
  if (spec.wallDrywall) {
    for (const wall of ['N', 'S', 'W', 'E']) {
      const e = wallExtent(wall, spec);
      for (const sg of solidSegments(wall, openings, spec)) {
        const a = Math.max(sg.a, e.u0), b = Math.min(sg.b, e.u1);
        if (b - a < 6) continue;
        // Three 4' courses stack exactly on a 12' wall
        for (let c = 0; c < 3; c++) {
          add('finish', 'drywall', 'drywall', '½" wall board',
            wallBox(wall, spec, a, b - a, c * 48, 48, -0.5, 0.5),
            { area: (b - a) * 48 / 144 });
        }
      }
    }
  }

  return { parts, tr, loads, openingFraming, trussX, bracedRuns };
}
