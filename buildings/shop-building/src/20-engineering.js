/* ============================================================
   Loads, member sizing, truss layout, racking, ventilation and the audit.
   Preliminary sizing for an ag-exempt build, not a stamped design.
   ============================================================ */


/* ---- loads ----
   ASCE-style flat roof snow, with a 20 psf minimum roof live load.
   Ct = 1.2 for an unheated building. */
function roofLoads(spec) {
  const Ct = spec.heated ? 1.0 : 1.2;
  const pf = 0.7 * Ct * spec.groundSnow;
  const live = Math.max(pf, 20);
  const tcDead = spec.roofing === 'comp' ? 12
    : spec.roofDeck === 'osb' ? 8 : 5.5;
  const bcDead = spec.ceilingDrywall ? 10 : 3;
  return { live, pf, tcDead, bcDead, total: live + tcDead + bcDead };
}

/* ---- lean-to ----
   Reach is set by headroom, not by the pitch. Drop the ledger height by the
   rafter depth and the beam depth, and whatever is left above the required
   clearance is what the slope has to spend: P = (H - dr - db - clear) / slope.
   Both depths depend on P, so it iterates. */
function leanToLoads(spec) {
  const r = roofLoads(spec);
  return { live: r.live, dead: r.tcDead, total: r.live + r.tcDead };
}

/* ASCE 7 leeward drift where a lower roof meets a taller wall. Snow blows off
   the main roof and piles against it, so the lean-to carries more than the
   flat ground-snow figure near the building. */
function leanToDrift(spec) {
  const pg = spec.groundSnow;
  const gamma = Math.min(0.13 * pg + 14, 30);
  const lu = spec.width / 12;
  const hd = Math.max(0, 0.43 * Math.cbrt(lu) * Math.pow(pg + 10, 0.25) - 1.5);
  return { gamma, hd, pd: hd * gamma, width: 4 * hd };
}
function leanToDesign(spec) {
  if (!spec.leanTo) return null;
  const wall = spec.leanToWall;
  const e = wallExtent(wall, spec);
  const run = wallRun(wall, spec);
  const H = spec.wallHeight;
  const slope = spec.pitch / 12;
  const angle = Math.atan(slope);
  const clear = spec.leanToClear;
  const posts = Math.max(2, Math.round(spec.leanToPosts));
  const beamSpan = run / (posts - 1);
  const loads = leanToLoads(spec);
  const drift = spec.leanToDrift ? leanToDrift(spec) : { hd: 0, pd: 0, width: 0, gamma: 0 };
  const fixed = spec.leanToProjection > 0;

  /* Bisect: the widest projection whose own members still leave the required
     clearance under the beam. Deeper members eat headroom, which shortens the
     reach, which lets the members get shallower — so search rather than guess. */
  const evalAt = (P) => {
    const Pft = Math.max(P, 1) / 12;
    const surcharge = drift.pd * Math.min(drift.width, Pft) / Pft;
    const psf = loads.total + surcharge;
    const rafter = pickMember(Math.max(P, 12), psf * spec.leanToSpacing / 12,
      RAFTER_LADDER, 180, true);
    const beam = pickMember(beamSpan, psf * (Pft / 2), HEADER_LADDER, 240, false);
    if (!rafter || !beam) return null;
    const dr = LUMBER[rafter.size].d / Math.cos(angle);
    const reach = (H - dr - beam.depth - clear) / slope;
    return { psf, rafter, beam, dr, reach, ok: reach >= P };
  };

  let found = null, P = 0;
  if (fixed) {
    P = spec.leanToProjection;
    found = evalAt(P);
  } else {
    let lo = 0, hi = Math.max(0, (H - clear) / slope);
    for (let i = 0; i < 44; i++) {
      const mid = (lo + hi) / 2;
      const r = evalAt(mid);
      if (r && r.ok) { found = r; P = mid; lo = mid; } else hi = mid;
    }
  }

  if (!found) {
    return { wall, run, posts, beamSpan, projection: 0, impossible: true,
      reason: fixed ? 'past dimension lumber at that projection' : 'no headroom left',
      clear, drift, psf: loads.total };
  }
  const rafter = found.rafter, beam = found.beam, psf = found.psf;

  P = Math.round(P * 16) / 16;
  const dr = LUMBER[rafter.size].d / Math.cos(angle);
  const ledgerTop = H;
  const rafterBotAtWall = H - dr;
  const beamTop = rafterBotAtWall - P * slope;
  const beamBot = beamTop - beam.depth;
  return {
    wall, run, posts, beamSpan, projection: P, fixed,
    rafter, beam, psf, drift, clear,
    ledgerTop, rafterBotAtWall, beamTop, beamBot,
    headroom: beamBot,
    rafterLen: P / Math.cos(angle),
    area: P * run / 144,
    count: Math.floor(run / spec.leanToSpacing) + 1,
    angle, slope,
  };
}
function sizeHeader(clearSpan, wall, spec) {
  const loads = roofLoads(spec);
  const bearing = WALLS[wall].bearing;
  // Bearing walls pick up half the truss span. Gable ends carry the wall
  // above the opening and a slice of the gable triangle — call it 40 plf.
  const trib = bearing ? spec.depth / 2 / 12 : 0;
  const w = bearing ? loads.total * trib : 40;   // plf
  const L = clearSpan;                            // inches
  const win = w / 12;                             // lb per inch
  const M = win * L * L / 8;                      // lb-in
  const defLimit = L / 240;

  const picked = pickMember(L, w, HEADER_LADDER, 240, false);
  if (!picked) {
    return { size: null, label: 'Needs an engineered beam — span is past dimension lumber',
      over: true, M, w };
  }
  const wallT = LUMBER[spec.studSize].d;
  return { ...picked, defLimit,
    spacers: Math.max(0, Math.round((wallT - picked.thickness) / 0.5)),
    label: picked.plies === 1 ? `(1) ${picked.size}` : picked.label };
}

/* ---- truss geometry ----
   Fink with a king post. The king post lands at midspan, which is also
   where the bottom chord splices — one gusset does both jobs, and two
   14' sticks make the 26' chord with no waste. */
function trussGeometry(spec) {
  const span = spec.depth;
  const half = span / 2;
  const slope = spec.pitch / 12;
  const rise = half * slope;
  const chord = LUMBER[spec.trussChord];
  const bcBot = spec.wallHeight + spec.heelHeight;
  const bcTop = bcBot + chord.d;
  const angle = Math.atan(slope);                 // 14.036° at 3/12
  const perp = chord.d / Math.cos(angle);         // vertical thickness of a sloped chord

  // Working lines: top edge of the bottom chord, bottom edge of the top chord.
  const y = (z) => bcTop + (z <= half ? z : span - z) * slope;

  const bcNodes = [span / 3, span * 2 / 3];
  const tcNodes = [half / 2, span - half / 2];
  const nodes = {
    heelL: [0, bcTop], heelR: [span, bcTop],
    peak: [half, bcTop + rise],
    bcL: [bcNodes[0], bcTop], bcR: [bcNodes[1], bcTop],
    bcMid: [half, bcTop],
    tcL: [tcNodes[0], y(tcNodes[0])], tcR: [tcNodes[1], y(tcNodes[1])],
  };

  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const deg = (a, b) => Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) / D2R;

  const overhangSloped = spec.eaveOverhang / Math.cos(angle);
  const tcLength = len(nodes.heelL, nodes.peak) + overhangSloped;

  const webs = [
    { id: 'w1', a: nodes.tcL, b: nodes.bcL, name: 'Web — outer left' },
    { id: 'w2', a: nodes.bcL, b: nodes.peak, name: 'Web — inner left' },
    { id: 'w3', a: nodes.bcR, b: nodes.peak, name: 'Web — inner right' },
    { id: 'w4', a: nodes.tcR, b: nodes.bcR, name: 'Web — outer right' },
    { id: 'kp', a: nodes.bcMid, b: nodes.peak, name: 'King post' },
  ].map((m) => ({ ...m, len: len(m.a, m.b), deg: deg(m.a, m.b) }));

  return {
    span, half, rise, slope, angle, chord, chordSize: spec.trussChord,
    bcBot, bcTop, perp, nodes, webs, y,
    tcLength, overhangSloped,
    tcRun: half + spec.eaveOverhang,
    peakY: bcTop + rise,
    overallHeight: bcTop + rise + perp,
    count: Math.floor(spec.width / spec.trussSpacing) + 1,
    // Two equal sticks spliced under the king post.
    bcPieces: [half, half],
    heelSpace: chord.d + spec.heelHeight,
  };
}

/* ---- opening helpers ----
   An opening carries the id of the stock unit it came from, but w and h can
   be overridden — a 9'-0" overhead door is the same door, resized. */
function stockFor(op) {
  const base = WINDOW_STOCK.find((x) => x.id === op.stock)
    || DOOR_STOCK.find((x) => x.id === op.stock)
    || { w: 36, h: 80, label: 'custom', id: 'custom' };
  const w = op.w != null ? op.w : base.w;
  const h = op.h != null ? op.h : base.h;
  const resized = Math.abs(w - base.w) > 0.01 || Math.abs(h - base.h) > 0.01;
  return {
    ...base, w, h, resized,
    label: resized ? `${fmtFt(w)} × ${fmtFt(h)}` : base.label,
  };
}
function wallRun(wall, spec) {
  return WALLS[wall].axis === 'x' ? spec.width : spec.depth;
}
function openingsOn(wall, openings) {
  return openings.filter((o) => o.wall === wall).sort((a, b) => a.off - b.off);
}

/* Full-height solid segments left between the openings on a wall line,
   clamped to the stretch that is actually framed (the gable walls run
   between the bearing walls, so they start one wall thickness in). */
function solidSegments(wall, openings, spec) {
  const e = wallExtent(wall, spec);
  const ops = openingsOn(wall, openings).map((o) => {
    const st = stockFor(o);
    return { a: o.off, b: o.off + st.w };
  });
  const segs = [];
  let cursor = e.u0;
  for (const o of ops) {
    if (o.a > cursor) segs.push({ a: cursor, b: Math.min(o.a, e.u1) });
    cursor = Math.max(cursor, o.b);
  }
  if (cursor < e.u1) segs.push({ a: cursor, b: e.u1 });
  return segs.filter((s) => s.b > s.a).map((s) => ({ ...s, w: s.b - s.a }));
}

/* Stretches of a wall where a horizontal member at height y, `thick` deep,
   passes clear of every opening. Used for the girt rows. */
function girtRuns(wall, openings, spec, y, thick) {
  const e = wallExtent(wall, spec);
  const blocks = openingsOn(wall, openings)
    .map((o) => ({ o, st: stockFor(o) }))
    .filter(({ o, st }) => (o.head - st.h) < y + thick && o.head > y)
    .map(({ o, st }) => ({ a: o.off, b: o.off + st.w }))
    .sort((p, q) => p.a - q.a);

  const segs = [];
  let cursor = e.u0;
  for (const bl of blocks) {
    const a = Math.min(Math.max(bl.a, e.u0), e.u1);
    if (a > cursor) segs.push({ a: cursor, b: a });
    cursor = Math.max(cursor, Math.min(bl.b, e.u1));
  }
  if (cursor < e.u1) segs.push({ a: cursor, b: e.u1 });
  return segs.filter((s) => s.b - s.a > 1);
}

/* ---- lateral demand ----
   Wind from the basic speed and exposure; seismic because western Oregon is
   Cascadia and a light building can go either way. Both come out ASD. */
function windPressure(spec) {
  const Kz = spec.exposure === 'B' ? 0.70 : spec.exposure === 'D' ? 1.03 : 0.85;
  const qz = 0.00256 * spec.windSpeed * spec.windSpeed * Kz * 0.85;  // Kd 0.85, Kzt 1.0
  return qz * 1.3 * 0.6;                    // windward + leeward, then ASD
}

/* Seismic weight: the roof, plus half the wall height, since the bottom half
   rides on the slab. Metal skin makes this a very light building. */
function seismicShear(spec) {
  const loads = roofLoads(spec);
  const wallPsf = 4 + (spec.wallDrywall ? 2.2 : 0) + (spec.siding === 'metal' ? 1.5 : 3);
  const roofW = (spec.width * spec.depth / 144) * (loads.tcDead + loads.bcDead);
  const perim = 2 * (spec.width + spec.depth) / 12;
  const wallW = perim * (spec.wallHeight / 12) * wallPsf;
  const W = roofW + wallW / 2;
  const R = 6.5, Ie = 1.0;
  const Cs = spec.seismicSDS / (R / Ie);
  return { W, Cs, V: Cs * W * 0.7 };        // 0.7 converts strength to ASD
}

/* ---- lateral capacity ----
   A rough demand/capacity check on racking, run per direction. It exists to
   show which way an opening layout is trending, not to replace an engineer. */
const SHEAR_ALLOW = {
  full:      240,  // 7/16" OSB, 8d @ 6"/12", blocked edges
  corners:   240,
  diaphragm: 120,  // through-fastened steel, screwed at every flat — see note
  strap:      60,  // steel strap X-brace, tension only — generous if anything
  none:        0,
};
/* Gypsum board is a recognised braced-wall material but a weak one, and it
   cannot be added to the panel capacity — you take the larger, not the sum. */
const GYPSUM_ALLOW = 75;      // ½" board, unblocked, nails at 7" o.c., wind only
const GYPSUM_ASPECT = 2.0;
const MIN_PANEL = 48;      // 4'-0", the narrowest run worth calling a panel
const MAX_ASPECT = 3.5;    // height : width

/* Which stretches of a wall actually resist racking. The model draws panels
   from this same list, so what you see is what gets counted. */
function bracedPanels(wall, openings, spec) {
  const e = wallExtent(wall, spec);
  const pw = spec.bracedPanelWidth;
  const out = [];
  for (const s of solidSegments(wall, openings, spec)) {
    if (spec.bracing === 'full' || spec.bracing === 'strap' || spec.bracing === 'diaphragm') {
      out.push({ a: s.a, w: s.w });
      continue;
    }
    if (spec.bracing !== 'corners') continue;
    const atStart = s.a <= e.u0 + 0.5;
    const atEnd = s.b >= e.u1 - 0.5;
    // A wall with no openings touches both corners and earns a panel at each.
    if (atStart && atEnd && s.w >= pw * 2) out.push({ a: s.a, w: pw }, { a: s.b - pw, w: pw });
    else if (atStart) out.push({ a: s.a, w: Math.min(s.w, pw) });
    else if (atEnd) out.push({ a: s.b - Math.min(s.w, pw), w: Math.min(s.w, pw) });
  }
  return out.filter((p) => p.w >= MIN_PANEL && spec.wallHeight / p.w <= MAX_ASPECT);
}
function bracingCheck(spec, openings) {
  const q = windPressure(spec);
  const seis = seismicShear(spec);
  const gableArea = spec.depth * (spec.depth / 2 * spec.pitch / 12) / 2 / 144;
  const allow = SHEAR_ALLOW[spec.bracing] ?? 0;

  const dirs = [
    { key: 'ew', name: 'East–west', lines: ['N', 'S'],
      area: (spec.depth * spec.wallHeight) / 144 + gableArea },
    { key: 'ns', name: 'North–south', lines: ['E', 'W'],
      area: (spec.width * spec.wallHeight) / 144 },
  ];

  return dirs.map((d) => {
    const wind = d.area * q / 2;                  // half the wall load reaches the roof
    // The base shear acts in full in whichever direction is being checked —
    // it is not shared between them.
    const quake = seis.V;
    const V = Math.max(wind, quake);
    const governs = wind >= quake ? 'wind' : 'seismic';
    const perLine = V / d.lines.length;           // lb at each resisting wall
    const lines = d.lines.map((wall) => {
      const segs = solidSegments(wall, openings, spec);
      const panels = bracedPanels(wall, openings, spec);
      const braced = panels.reduce((a, p) => a + p.w, 0);
      const capacity = braced / 12 * allow;
      // Drywall, reported separately because it may not be added to the above
      const gyp = spec.wallDrywall
        ? segs.filter((s) => s.w >= MIN_PANEL && spec.wallHeight / s.w <= GYPSUM_ASPECT)
          .reduce((a, s) => a + s.w, 0) / 12 * GYPSUM_ALLOW
        : 0;
      // The widest run is what to watch while dragging openings around: it
      // climbs long before the ratio does, and the ratio stays at zero until
      // it crosses the 4'-0" line.
      const widest = Math.max(0, ...segs.map((s) => s.w));
      return { wall, segs, panels, braced, capacity, gypsum: gyp, widest,
        demand: perLine, ratio: perLine > 0 ? capacity / perLine : 1,
        best: Math.max(capacity, gyp),
        required: allow > 0 ? perLine / allow * 12 : Infinity };
    });
    return { ...d, V, wind, quake, governs, q, lines, ok: lines.every((l) => l.ratio >= 1) };
  });
}

/* ---- attic ventilation ----
   1/150 of the ceiling area in net free area, halved between high and low.
   The 1/300 allowance needs a vapour retarder and a balanced split. */
function ventilation(spec) {
  const ceilSf = spec.width * spec.depth / 144;
  const ratio = spec.venting === 'ridge-soffit' ? 300 : 150;
  const nfaSf = ceilSf / ratio;
  const nfaIn = nfaSf * 144;
  const ridgeLf = spec.width / 12;
  return {
    ceilSf, ratio, nfaSf, nfaIn,
    high: nfaIn / 2, low: nfaIn / 2,
    ridgeLf, ridgeNeedLf: (nfaIn / 2) / 18,      // ~18 sq in per ft of ridge vent
    gableEach: nfaIn / 2 / 2,                    // two gable louvres share the intake
  };
}

/* ---- warnings ----
   Everything here is derived, so it re-evaluates the moment an opening moves. */
function auditBuilding(spec, openings) {
  const out = [];
  const add = (level, title, body) => out.push({ level, title, body });
  const tr = trussGeometry(spec);

  // Openings vs. framing reality
  for (const o of openings) {
    const st = stockFor(o);
    const run = wallRun(o.wall, spec);
    const end = o.off + st.w;
    const nameOf = `${WALLS[o.wall].label} ${st.label}`;
    if (o.off < 0 || end > run) {
      add('crit', `${nameOf} runs off the wall`,
        `The opening ends at ${fmtFt(end)} on a wall that is only ${fmtFt(run)} long.`);
    } else {
      if (o.off < 6) add('warn', `${nameOf} is tight to the corner`,
        `${fmtIn(o.off)} of wall left. A corner post plus a king stud wants about 7".`);
      if (run - end < 6) add('warn', `${nameOf} is tight to the far corner`,
        `${fmtIn(run - end)} of wall left. A corner post plus a king stud wants about 7".`);
    }
    // An overhead door needs room above the opening for the header, the
    // curve of the track and the opener. Standard lift wants roughly 14".
    if (o.kind === 'overhead') {
      const room = spec.wallHeight - o.head;
      if (room < 14) {
        add(room < 10 ? 'crit' : 'warn', `${nameOf} has no headroom for the track`,
          `${fmtIn(room)} between the door head and the top plate. Standard-lift hardware wants `
          + `about 14" plus the header. Either drop the door to ${fmtFt(spec.wallHeight - 16)} tall, `
          + `raise the walls, or order low-headroom track.`);
      }
    }

    const head = o.head;
    if (head > spec.wallHeight - 4.5) {
      add('crit', `${nameOf} head crowds the top plate`,
        `Head at ${fmtFt(head)} leaves ${fmtIn(spec.wallHeight - head)} for the header under a ${fmtFt(spec.wallHeight)} wall.`);
    }
    if (head - st.h < 0) add('crit', `${nameOf} sill is below the slab`, 'Raise the head height.');
  }

  // Overlaps
  for (const wall of Object.keys(WALLS)) {
    const ops = openingsOn(wall, openings);
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1], cur = ops[i];
      const gap = cur.off - (prev.off + stockFor(prev).w);
      if (gap < 0) {
        add('crit', `${WALLS[wall].label} wall openings overlap`,
          `${stockFor(prev).label} and ${stockFor(cur).label} overlap by ${fmtIn(-gap)}.`);
      } else if (gap < 3) {
        add('warn', `${WALLS[wall].label} wall openings nearly touch`,
          `${fmtIn(gap)} between them — not enough for two king studs. Gang them into one opening or move one.`);
      }
    }
  }

  // Headers
  for (const o of openings) {
    const st = stockFor(o);
    const h = sizeHeader(st.w, o.wall, spec);
    if (h.over) {
      add('crit', `${WALLS[o.wall].label} ${st.label} header is past dimension lumber`,
        'This opening needs an engineered beam.');
    } else if (WALLS[o.wall].bearing && h.plies >= 3) {
      add('info', `${WALLS[o.wall].label} ${st.label} header: ${h.label}`,
        `Bearing wall, ${fmtFt(spec.depth / 2)} of truss bearing on it. ${h.spacers > 0 ? `${h.spacers} × ½" plywood spacer to make ${fmtIn(LUMBER[spec.studSize].d)}.` : ''}`);
    }
  }

  // Lateral bracing
  for (const dir of bracingCheck(spec, openings)) {
    for (const line of dir.lines) {
      if (line.ratio < 1) {
        const widest = Math.max(0, ...solidSegments(line.wall, openings, spec).map((s) => s.w));
        const layoutBound = widest < MIN_PANEL;
        add(line.ratio < 0.5 ? 'crit' : 'warn',
          `${WALLS[line.wall].label} wall is short on bracing`,
          `${dir.name} wind puts about ${fmtN(line.demand)} lb on this wall line, against roughly `
          + `${fmtFt(line.required)} of panel needed. `
          + (layoutBound
            ? `The widest full-height run is ${fmtFt(widest)} and a panel has to be at least 4'-0" wide `
              + 'to count, so no sheathing choice fixes this — the openings have to move.'
            : `${fmtFt(line.braced)} counted. Widening the braced panels or sheathing the interior runs would close it.`));
      }
    }
  }

  // Skin-specific consequences
  if (spec.roofDeck !== 'osb' && !spec.roofPlaneBracing) {
    add('crit', 'No roof diaphragm and no roof-plane bracing',
      'With purlins instead of a deck, the trusses have nothing holding them plumb as a group. Diagonal bracing in the roof plane is not optional here.');
  }
  if (spec.roofing === 'comp' && spec.pitch < 4) {
    add('warn', `Asphalt shingle at ${spec.pitch}/12`,
      'Most shingle warranties below 4/12 require a doubled underlayment or full ice-and-water. Metal is the easier answer at this pitch.');
  }
  if (spec.roofing === 'metal' && spec.roofDeck !== 'osb' && !spec.dripStop) {
    add('warn', 'Bare metal over open framing will drip',
      'Panel underside hits dew point on cold nights. Specify a factory anti-condensation membrane, or plan on a vapor barrier and vented attic.');
  }
  if (spec.ceilingDrywall) {
    const v = ventilation(spec);
    const soffitRoom = tr.heelSpace - spec.ceilingInsulation;
    if (spec.venting === 'ridge-soffit' && soffitRoom < 1.5) {
      add('crit', 'Ridge-and-soffit venting will not fit',
        `A ${spec.heelHeight > 0 ? fmtIn(spec.heelHeight) + ' raised' : 'standard'} heel gives `
        + `${fmtIn(tr.heelSpace)} above the top plate and the insulation wants ${fmtIn(spec.ceilingInsulation)}. `
        + `Raise the heel to about ${fmtIn(spec.ceilingInsulation + 2 - LUMBER[spec.trussChord].d)} or vent the gables instead.`);
    }
    if (spec.venting === 'ridge-gable') {
      add('info', 'Ridge vent with gable intake',
        `Needs about ${fmtN(v.nfaIn)} sq in of net free area total — roughly `
        + `${fmtN(v.ridgeNeedLf, 1)} ft of ridge vent against the ${fmtN(v.ridgeLf)} ft you have, `
        + `and ${fmtN(v.gableEach)} sq in per gable louvre. `
        + 'Ridge plus gable is the usual answer at this pitch. It short-circuits a soffit intake, '
        + 'so if you ever add a raised heel and soffit vents, close the gable louvres then.');
    }
    if (spec.venting === 'none') {
      add('warn', 'Insulated ceiling with no attic ventilation',
        'Moisture from the shop will collect above the drywall. Vent it or make the lid airtight and unvented by design.');
    }
  }
  const lt = leanToDesign(spec);
  if (lt && lt.impossible) {
    add('crit', 'The lean-to does not fit', `On a ${fmtFt(spec.wallHeight)} wall with `
      + `${fmtFt(spec.leanToClear)} of clearance required, ${lt.reason}.`);
  } else if (lt) {
    if (lt.beamBot < spec.leanToClear - 0.5) {
      add('crit', 'Lean-to beam is below the clearance you asked for',
        `Beam bottom lands at ${fmtFt(lt.beamBot)} against ${fmtFt(spec.leanToClear)} required. `
        + 'Shorten the projection or raise the walls.');
    }
    if (lt.beamSpan > 168) {
      add('warn', `Lean-to beam spans ${fmtFt(lt.beamSpan)}`,
        `${lt.posts} posts over ${fmtFt(lt.run)} is a long span, and a deeper beam eats the `
        + `headroom that sets the reach. One more post would shorten it to `
        + `${fmtFt(lt.run / lt.posts)} and buy back projection.`);
    }
    add('info', 'Lean-to ledger carries the whole roof into the wall',
      `${fmtN(lt.psf * lt.projection / 2 / 12, 0)} lb per foot of wall. Lag or through-bolt into `
      + 'every stud, not into the siding or the girts, and flash the top under the rake trim.');
    if (lt.wall === 'W' || lt.wall === 'E') {
      add('info', 'The lean-to lands on a gable wall',
        'The ledger is under the top plate, so it clears the gable. It does add wind area '
        + 'on that side without adding any braced panel — worth a look at the Review bars.');
    }
  }

  if (spec.bracing === 'diaphragm') {
    add('warn', 'Steel skin counted as the diaphragm',
      'This is how post-frame buildings stand up, and it works — but only as a designed assembly. '
      + 'It needs a specified screw pattern (every flat, not every other), stitched side laps, '
      + 'a solid base girt to land the bottom row on, and the roof steel designed as a diaphragm too. '
      + 'The 120 plf used here is a placeholder until that schedule exists.');
  }
  if (spec.wallSkin === 'girts' && spec.insulation) {
    add('info', 'Batts need a face behind them',
      'With girts instead of sheathing, put a housewrap or a rigid air barrier on the studs so wind does not wash through the cavity.');
  }

  return out;
}
