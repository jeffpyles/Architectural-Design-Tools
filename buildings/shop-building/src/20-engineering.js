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
  /* Covering off the catalog, so it moves when the covering does. It used to
     be two hardcoded numbers that only knew comp from everything else, which
     meant 26 ga, aluminium standing seam and polycarbonate all weighed the
     same as 24 ga steel. The rest is deck, purlins and the truss's own top
     chord, which do not change with the covering. */
  const rf = assembly('roofing', spec.roofing) || assembly('roofing', 'metal');
  const tcDead = rf.psf + (spec.roofDeck === 'osb' ? 1.5 : 0) + 4.6;
  const bcDead = spec.ceilingDrywall ? 10 : 3;
  return { live, pf, tcDead, bcDead, total: live + tcDead + bcDead };
}

/* ---- lean-to ----
   Reach is set by headroom, not by the pitch. Drop the ledger height by
   whatever the rafter and the beam together hang below the roof line, and what
   is left above the required clearance is all the slope has to spend:
   P = (H - under - clear) / slope. How much `under` is depends on how the two
   members meet — see leanToUnder — and both depths depend on P, so it iterates. */
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
/* How the rafters meet the beam, and what it is worth.

   Sitting the rafters ON the beam is the simplest thing to build: the beam
   goes up, the rafters lie across it, done. It also stacks the two members,
   so what hangs below the roof line is the rafter depth PLUS the beam depth.

   Hanging them off the FACE of the beam — sloped-seat face-mount hangers,
   rafter top flush with the beam top — puts the two in the same vertical
   band. What hangs below is then whichever is deeper, not the sum. On a 3/12
   shed that is the rafter depth back, about 9½" for a 2x10, and since reach
   is set by headroom every inch buys four inches of projection.

   The costs are real: a hanger at every rafter, and the beam has to be at
   least as deep as the rafter for the hanger to land on. */
function leanToUnder(rafterDepthVert, beamDepth, flush) {
  return flush ? Math.max(rafterDepthVert, beamDepth) : rafterDepthVert + beamDepth;
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
  const flush = spec.leanToFraming === 'flush';
  const named = spec.leanToRafter && spec.leanToRafter !== 'auto' ? spec.leanToRafter : null;

  /* Bisect: the widest projection whose own members still leave the required
     clearance under the beam. Deeper members eat headroom, which shortens the
     reach, which lets the members get shallower — so search rather than guess. */
  const evalAt = (P) => {
    const Pft = Math.max(P, 1) / 12;
    const surcharge = drift.pd * Math.min(drift.width, Pft) / Pft;
    const psf = loads.total + surcharge;
    const wRaf = psf * spec.leanToSpacing / 12;
    /* A named rafter is used whatever it works out to; the panel and the
       review say what it costs. */
    const rafter = named
      ? evalMember({ size: named, plies: 1 }, Math.max(P, 12), wRaf, 180, true)
      : pickMember(Math.max(P, 12), wRaf, RAFTER_LADDER, 180, true);
    if (!rafter) return null;
    const dr = LUMBER[rafter.size].d / Math.cos(angle);
    const beam = pickMember(beamSpan, psf * (Pft / 2), HEADER_LADDER, 240, false,
      flush ? LUMBER[rafter.size].d : 0);
    if (!beam) return null;
    const under = leanToUnder(dr, beam.depth, flush);
    const reach = (H - under - clear) / slope;
    return { psf, rafter, beam, dr, under, reach, ok: reach >= P && rafter.ok };
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
    /* A named rafter that never passes still has to produce a drawing and a
       reason, rather than reading as "no lean-to fits". */
    if (!found && named) { P = 0; found = evalAt(1); }
  }

  if (!found) {
    return { wall, run, posts, beamSpan, projection: 0, impossible: true,
      reason: fixed ? 'past dimension lumber at that projection' : 'no headroom left',
      clear, drift, psf: loads.total, flush };
  }
  const rafter = found.rafter, beam = found.beam, psf = found.psf;

  P = Math.round(P * 16) / 16;
  const dr = LUMBER[rafter.size].d / Math.cos(angle);
  const under = leanToUnder(dr, beam.depth, flush);
  const ledgerTop = H;
  const rafterBotAtWall = H - dr;
  /* On top of the beam the rafter's underside is the beam's top. Flush, the
     rafter's TOP is the beam's top and they share the band. */
  const beamTop = flush ? H - P * slope : rafterBotAtWall - P * slope;
  const beamBot = beamTop - beam.depth;
  const rafterBotAtBeam = H - P * slope - dr;
  /* Flush framing stops the rafter at the beam's near face. */
  const rafterRun = flush ? Math.max(0, P - beam.thickness) : P;
  return {
    wall, run, posts, beamSpan, projection: P, fixed, flush, under,
    rafter, beam, psf, drift, clear,
    rafterNamed: !!named, rafterOK: rafter.ok !== false,
    ledgerTop, rafterBotAtWall, beamTop, beamBot, rafterBotAtBeam,
    headroom: flush ? Math.min(beamBot, rafterBotAtBeam) : beamBot,
    rafterRun,
    rafterLen: rafterRun / Math.cos(angle),
    area: P * run / 144,
    count: Math.floor(run / spec.leanToSpacing) + 1,
    angle, slope,
    /* What the other way of framing it would give, so the trade is a number
       rather than an argument. */
    otherUnder: leanToUnder(dr, beam.depth, !flush),
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
   be overridden — a 9'-0" overhead door is the same door, resized.

   `stock: 'custom'` is an opening with nothing on the shelf behind it: a hole
   sized from scratch, for a unit that gets bought rather than found. */
function customBase(op) {
  if (op.kind === 'overhead') return { id: 'custom', w: 108, h: 96, kind: 'overhead' };
  if (op.kind === 'man') return { id: 'custom', w: 38, h: 82.5, kind: 'man' };
  return { id: 'custom', w: 36, h: 36 };
}
function stockFor(op) {
  const base = WINDOW_STOCK.find((x) => x.id === op.stock)
    || DOOR_STOCK.find((x) => x.id === op.stock)
    || customBase(op);
  const w = op.w != null ? op.w : base.w;
  const h = op.h != null ? op.h : base.h;
  const resized = base.id !== 'custom'
    && (Math.abs(w - base.w) > 0.01 || Math.abs(h - base.h) > 0.01);
  const auto = base.id === 'custom' || resized ? `${fmtFt(w)} × ${fmtFt(h)}` : base.label;
  return {
    ...base, w, h, resized,
    /* The catalogue name, for the inventory and the schedule, and the name on
       screen, which somebody can type over. */
    stockLabel: auto,
    label: op.name || auto,
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
function auditBuilding(spec, openings, extra) {
  const out = [];
  const add = (level, title, body) => out.push({ level, title, body });
  const tr = trussGeometry(spec);

  /* The girts, which nothing checked until furring became an option. They
     span stud to stud and carry the wind on the siding, and what governs a
     thin one is deflection — a metal panel ripples long before a board
     breaks. */
  {
    const g = girtCheck(spec);
    if (g) {
      if (!g.ok) {
        add('crit', `${spec.girtSize} girts will not carry the siding`,
          `${fmtN(g.p, 1)} psf of corner suction over a ${fmtIn(g.span)} span at `
          + `${fmtIn(spec.girtSpacing)} o.c. gives ${fmtN(g.fb, 0)} psi against `
          + `${fmtN(g.Fb, 0)} allowable (${(g.bend * 100).toFixed(0)}% used) and `
          + `${g.defl.toFixed(3)}" of sag against the ${g.limit.toFixed(3)}" L/180 allows `
          + `(${(g.sag * 100).toFixed(0)}%). `
          + (g.sag > g.bend
            ? 'Deflection governs, and what you would see is the panel rippling between '
              + 'the studs. Close the girts up, or go a size deeper.'
            : 'Go a size deeper, or bring the girts closer together.'));
      } else {
        add('info', `${spec.girtSize} girts flat, ${(g.ratio * 100).toFixed(0)}% used`,
          `${fmtN(g.p, 1)} psf of corner suction over a ${fmtIn(g.span)} span: bending `
          + `${(g.bend * 100).toFixed(0)}%, sag ${g.defl.toFixed(3)}" of the `
          + `${g.limit.toFixed(3)}" L/180 allows. They stand ${fmtIn(g.out)} off the framing `
          + `and give ${fmtIn(g.face)} of face for the siding screws.`
          + (g.flat ? ' 1x is sold as boards rather than graded lumber, so this is run at a '
            + 'conservative 500 psi — buy furring that is straight and reasonably clear.' : ''));
      }
    }
  }


  /* Anything in the catalog that will not go together. Core owns these
     because they are facts about the material, not about this building. */
  for (const f of assemblyReview(spec, {
    pitch: spec.pitch, girtSpacing: spec.girtSpacing,
    conditioned: !!spec.insulation,
    cavity: spec.wallSkin === 'girts' ? girtSection(spec.girtSize).out : 0,
  })) out.push(f);

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
    if (lt.flush) {
      add('info', 'Rafters hung off the beam face',
        `Sloped-seat face-mount hangers at every rafter, ${lt.rafter.label} into a `
        + `${lt.beam.label}. The two members share one band instead of stacking, so what `
        + `hangs below the roof line is ${fmtIn(lt.under)} rather than ${fmtIn(lt.otherUnder)} — `
        + `${fmtIn(lt.otherUnder - lt.under)} back, which at ${spec.pitch}/12 is worth `
        + `${fmtFt((lt.otherUnder - lt.under) / (spec.pitch / 12))} of reach. `
        + 'The beam has to be at least as deep as the rafter for the hanger to land on, '
        + 'which is why it sizes up as the rafters do.');
    }
    if (lt.rafterNamed && !lt.rafterOK) {
      add('crit', `${lt.rafter.label} lean-to rafters are over at ${fmtFt(lt.projection)}`,
        `${fmtN(lt.rafter.ratio * 100)}% of bending capacity and `
        + `${fmtN(lt.rafter.deflRatio * 100)}% of the L/180 deflection limit — `
        + `${lt.rafter.governs} governs. This is a named size, not what the sizing chose. `
        + 'Go deeper, tighten the spacing, or shorten the projection.');
    } else if (lt.rafterNamed) {
      const auto = leanToDesign({ ...spec, leanToRafter: 'auto' });
      if (auto && !auto.impossible && auto.rafter.size !== lt.rafter.size) {
        add('info', `${lt.rafter.label} rafters named over ${auto.rafter.label}`,
          `At ${fmtIn(spec.leanToSpacing)} o.c. they carry it. Against the sizing's `
          + `${auto.rafter.label} the reach goes ${fmtFt(auto.projection)} → `
          + `${fmtFt(lt.projection)} and the headroom ${fmtFt(auto.headroom)} → `
          + `${fmtFt(lt.headroom)} — deeper rafters buy reach and spend headroom, `
          + 'and which of those you want is not a structural question.');
      }
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

  /* ---- foundation ---- */
  const fd = footingDesign(spec);
  const sl = slabDesign(spec);

  if (!fd.widthOK) {
    add('crit', `Turndown is ${fmtIn(fd.width - fd.builtWidth)} narrower than it needs`,
      `${fmtIn(fd.builtWidth)} built against ${fmtIn(fd.width)} required — `
      + (fd.governs === 'bearing'
        ? `${fmtN(fd.lines.bearing.total)} plf on ${fmtN(fd.soil.q)} psf soil.`
        : 'not from load, but from having somewhere to land a plate, a bolt and two bars.'));
  }
  if (!fd.depthOK) {
    add('crit', `Turndown is ${fmtIn(fd.depth - fd.builtDepth)} shallower than the frost line`,
      `${fmtIn(fd.builtDepth)} built. Frost at ${fmtIn(spec.frostDepth)} below grade plus the `
      + `${fmtIn(spec.slabThickness)} slab puts the bottom of the footing at ${fmtIn(fd.depth)}.`);
  }
  if (!fd.peakOK) {
    add('warn', 'Bearing pressure peaks over the presumptive value',
      `The wall lands ${fmtIn(fd.ecc)} off the centre of the strip, so pressure is not uniform: `
      + `${fmtN(fd.avg)} psf average but ${fmtN(fd.peak)} psf at the outside face against `
      + `${fmtN(fd.soil.q)} allowed. Centre the wall on the turndown or widen it outboard.`);
  }
  if (fd.governs !== 'bearing') {
    add('info', 'The footing is not sized by the building',
      `${fmtN(fd.lines.bearing.total)} plf under the bearing walls needs `
      + `${fmtIn(fd.bearingWidth)} of width on ${fmtN(fd.soil.q)} psf ${fd.soil.label.toLowerCase()}. `
      + `The ${fmtIn(fd.builtWidth)} that gets poured is set by frost depth and by detailing — `
      + 'nobody digs a five-inch trench. Load is not the constraint here and making the building '
      + 'heavier will not change the footing.');
  }

  if (!sl.thickOK) {
    add('crit', `Slab is thin for a ${fmtN(spec.wheelLoad)} lb wheel`,
      `${fmtIn(spec.slabThickness)} gives ${fmtN(sl.at.interior)} psi in the middle of a panel and `
      + `${fmtN(sl.at.edge)} psi at a free edge, against ${fmtN(sl.allow)} psi allowable `
      + `(${fmtN(sl.fr)} psi rupture at a factor of ${sl.FS}). `
      + `${sl.min ? `Needs ${fmtIn(sl.min.h)}.` : 'No thickness in the table works — reduce the wheel load or dowel the joints.'}`);
  }
  if (spec.jointTransfer !== 'dowels') {
    add('warn', 'Plain sawcut joints are free edges',
      `Every contraction joint without load transfer is an edge, and a wheel crossing an edge `
      + `stresses the concrete about twice as hard as the same wheel mid-panel — `
      + `${fmtN(sl.at.edge)} psi against ${fmtN(sl.at.interior)} psi here. `
      + `That is what takes the slab from ${sl.interiorOnly ? fmtIn(sl.interiorOnly.h) : '—'} to `
      + `${sl.edgeToo ? fmtIn(sl.edgeToo.h) : 'more than 8"'}. `
      + 'Smooth dowels or a keyed joint at each cut is cheaper than the extra inch and a half of concrete.');
  } else {
    add('info', `Doweled joints buy back ${sl.interiorOnly && sl.edgeToo ? fmtIn(sl.edgeToo.h - sl.interiorOnly.h) : 'thickness'}`,
      `With load transfer at every cut, the interior case governs and `
      + `${sl.interiorOnly ? fmtIn(sl.interiorOnly.h) : 'the table minimum'} is enough. `
      + 'Smooth ½" dowels at 12" o.c., greased or sleeved on one side so the joint can still shrink — '
      + 'bond them both sides and the joint cannot open, which puts the crack somewhere you did not choose.');
  }
  if (sl.barShort && spec.slabReinf === 'rebar') {
    add('crit', `${sl.bar.size} at ${fmtIn(sl.spacing)} does not make the shrinkage steel`,
      `${fmtN(sl.bar.provided, 3)} in² per foot against ${fmtN(sl.asReq, 3)} required for a `
      + `${fmtIn(spec.slabThickness)} slab, and ${fmtIn(sl.spacing)} is as close together as `
      + `${sl.bar.size} gets placed. ${sl.auto.size} at ${fmtIn(sl.auto.at)} is the smallest bar `
      + 'that makes it. This is a named override, not what the rule chose.');
  } else if (sl.barChosen === 'named' && sl.bar.size !== sl.auto.size) {
    add('info', `${sl.bar.size} named over the ${sl.auto.size} the rule picks`,
      `Both make the ${fmtN(sl.asReq, 3)} in² per foot. ${sl.bar.size} at ${fmtIn(sl.bar.at)} `
      + `puts ${fmtN(sl.bar.psf, 2)} lb of steel in every square foot against `
      + `${fmtN(sl.auto.psf, 2)} — ${sl.bar.psf > sl.auto.psf ? 'more' : 'less'} steel, and `
      + `${sl.bar.at < sl.auto.at ? 'more' : 'fewer'} pieces to cut and tie.`);
  }
  add('info', `Slab steel: ${sl.bar.size} at ${fmtIn(sl.spacing)} o.c. each way`,
    `${fmtN(sl.asReq, 3)} in² per foot required for shrinkage and temperature `
    + `(0.0018 of a ${fmtIn(spec.slabThickness)} section); this gives ${fmtN(sl.bar.provided, 3)}. `
    + `Alternatives that also work: ${sl.barOptions.filter((o) => o.size !== sl.bar.size)
      .map((o) => `${o.size} at ${fmtIn(o.at)}`).join(', ')}. `
    + 'None of it makes the slab stronger — the thickness above assumes plain concrete. '
    + 'It holds a crack tight after the crack happens. Support it on chairs at mid-depth; '
    + 'steel pulled up by a boot as the pour goes past does nothing.');
  add('info', `Contraction joints: ${sl.joints.nx} × ${sl.joints.nz} panels`,
    `${fmtN(sl.joints.panelX, 1)} × ${fmtN(sl.joints.panelZ, 1)} ft, inside the `
    + `${fmtN(sl.joints.max, 1)} ft maximum for a ${fmtIn(spec.slabThickness)} slab `
    + '(30 times the thickness, panels as square as they come). '
    + 'Cut them the same day, as soon as the surface will take a blade.');
  if (spec.slabReinf !== 'rebar') {
    add('warn', spec.slabReinf === 'mesh' ? 'Welded wire mesh instead of bar'
      : 'Fibre instead of bar',
      spec.slabReinf === 'mesh'
        ? 'Sheet mesh works if it stays at mid-depth. Rolled mesh does not — it ends up on the '
          + 'subgrade under a boot and contributes nothing. If it is going to be mesh, order flat sheets and chair them.'
        : 'Macro fibre controls plastic shrinkage cracking in the first day and does not replace '
          + 'the steel that holds a shrinkage crack closed a month later. It also does nothing at a joint. '
          + 'Fine as an addition, not as the substitute.');
  }

  const pf = postFooting(spec);
  if (pf) {
    if (!pf.padOK) {
      add('crit',
        `${fmtIn(pf.worstPad.side)} post ${pf.form === 'tube' ? 'tubes' : 'pads'} are over the bearing`,
        `${fmtN(pf.worstPad.pressure)} psf under the worst post against ${fmtN(pf.soil.q)} allowed. `
        + `${fmtIn((pf.padOptions.find((o) => o.ok) || {}).side || 48)} is the smallest that `
        + 'works on this soil. This is a named override, not what the sizing chose.');
    }
    if (pf.form === 'tube') {
      const sq = postFooting({ ...spec, postForm: 'square' });
      add('info', `Sonotube piers: ${fmtIn(pf.worstPad.d)} diameter`,
        `A tube bears on its own end, so the footing has no spread — the whole thing is the `
        + `pier. ${fmtIn(pf.worstPad.d)} gives ${fmtN(pf.worstPad.area, 2)} sf and `
        + `${fmtN(pf.worstPad.pressure)} psf on ${fmtN(pf.soil.q)} allowable, against `
        + `${fmtN(sq.worstPad.pressure)} psf under a ${fmtIn(sq.worstPad.side)} square pad. `
        + 'Faster — auger, drop the tube, fill — and no forming. If the diameter is getting '
        + 'silly, a bell-bottom form on the end of the tube spreads it without a formed pad; '
        + 'nothing here models one, so it would want sizing separately.');
    }
    add(!pf.padOK ? 'warn' : 'info',
      pf.form === 'tube'
        ? `Lean-to post footings: ${fmtIn(pf.worstPad.d)} Sonotube`
        : `Lean-to post pads: ${fmtIn(pf.worstPad.side)} square`,
      `${pf.posts} posts over ${fmtFt(lt.run)} with the beam spliced over them, so they do not share `
      + `equally — ${fmtN(pf.interior)} lb on an interior post against ${fmtN(pf.end)} lb on an end one. `
      + (pf.form === 'tube'
        ? `${fmtIn(pf.worstPad.d)} diameter full depth gives `
        : `${fmtIn(pf.worstPad.side)} square by ${fmtIn(pf.thickness)} thick gives `)
      + `${fmtN(pf.worstPad.pressure)} psf on ${fmtN(pf.soil.q)} allowable. `
      + `Bottom at ${fmtIn(pf.depth)} below grade for frost. `
      + `The posts carry half the lean-to; the ledger on the shop wall takes the other half `
      + `down the building's own footing.`);
  }

  const ab = anchorSchedule(spec, openings);
  add('info', `Anchor bolts: ${ab.total} × ½", ${ab.governs} governs`,
    `The worst wall line delivers ${fmtN(ab.worst)} lb of shear, which is `
    + `${ab.byShear} bolt${ab.byShear === 1 ? '' : 's'} at ${fmtN(ab.per)} lb each. `
    + `The code minimum — one within 12" of every plate end and none more than `
    + `${fmtIn(ab.spacing)} apart — asks for ${ab.byCode} on the longest wall. `
    + 'Seven-inch embedment, and a plate washer rather than a cut washer: the washer is what '
    + 'stops the plate splitting off the bolt when the wall tries to slide.');

  if (spec.soil === 'clay') {
    add('info', 'Clay, assumed rather than tested',
      `${fmtN(fd.soil.q)} psf is the presumptive value the code lets you use with no soils report. `
      + 'Two things it does not cover: whether this clay is expansive, which changes the '
      + 'detailing rather than the width, and what the water table does in February. '
      + 'A hole in the wet season and a look at what comes out of it answers both cheaply. '
      + `Confirm the frost depth too — ${fmtIn(spec.frostDepth)} is the usual western Oregon figure, `
      + 'but it is the building department that sets it.');
  }
  if (spec.slabInsulation === 'none') {
    add('info', 'No slab insulation, because heating is undecided',
      'Nothing here assumes any. Worth knowing while the trench is open: edge insulation is the '
      + 'part that matters and the part you cannot add later. Two inches of foam against the inside '
      + 'face of the turndown, two feet down, is a few hundred dollars now and a slab-edge '
      + 'demolition later. Under-slab foam is the decision that can wait until you know.');
  }

  /* ---- electrical ---- */
  for (const n of electricalReview(spec, openings, deviceList(spec, openings, extra && extra.devices))) {
    out.push(n);
  }

  return out;
}

/* ============================================================
   Foundation.

   The surprise here is how little of it the building governs. The bearing
   walls put 567 plf on the ground, which at the worst presumptive soil needs
   four and a half inches of footing width — a quarter of what gets built.
   The perimeter is set by frost depth, by having somewhere to put an anchor
   bolt and a rebar, and by the fact that nobody digs a four-inch trench.

   What the building does not govern at all is the slab. That is set by
   whatever drives on it.
   ============================================================ */

/* Presumptive bearing, IBC Table 1806.2 — what you may assume with no test.
   `k` is the modulus of subgrade reaction the slab calc needs, taken with a
   compacted granular base over the top of it. */
const SOIL = {
  rock:   { q: 4000, k: 300, label: 'Rock or weathered bedrock' },
  gravel: { q: 3000, k: 200, label: 'Sand and gravel' },
  sand:   { q: 2000, k: 150, label: 'Sandy soil' },
  clay:   { q: 1500, k: 120, label: 'Clay or silty clay' },
};

/* Line load at the base of each wall. Only the walls the trusses bear on
   carry roof; the gable ends carry themselves. */
function wallLineLoads(spec) {
  const L = roofLoads(spec);
  const tr = trussGeometry(spec);
  const wallPsf = 4 + (spec.wallDrywall ? 2.2 : 0) + (spec.siding === 'metal' ? 1.5 : 3);
  const wall = wallPsf * spec.wallHeight / 12;
  const roof = L.total * (tr.span / 12 / 2);
  return {
    bearing: { walls: ['N', 'S'], roof, wall, total: roof + wall },
    gable: { walls: ['E', 'W'], roof: 0, wall, gableExtra: 30, total: wall + 30 },
    wallPsf,
  };
}

/* The perimeter turndown. Reports what bearing asks for and what actually
   decides it, because they are not the same thing and the difference is the
   whole point. */
function footingDesign(spec) {
  const soil = SOIL[spec.soil] || SOIL.clay;
  const ll = wallLineLoads(spec);
  const T = LUMBER[spec.studSize].d;

  const forBearing = (plf) => plf / soil.q * 12;      // inches of width
  /* Wide enough to set a plate on, hold a ½" bolt with its edge distance, and
     carry two bars in the bottom. Twelve inches is the practical floor. */
  const forDetail = Math.max(12, T + 6);
  /* Deep enough to get below the frost line. Frost depth is measured from
     finished grade, and grade is taken here as level with the underside of the
     slab — about right for a shop where the floor sits a few inches above the
     dirt, and the one number in this function a site visit would replace. */
  const forFrost = spec.frostDepth + spec.slabThickness;

  const width = Math.max(forBearing(ll.bearing.total), forDetail);
  const depth = Math.max(forFrost, 18);

  /* The wall bears near the outside face, so the load is eccentric on the
     strip. The slab ties the inside edge, which is what keeps this from
     being an overturning problem — but the pressure still peaks outboard. */
  const e = spec.turndownWidth / 2 - (T / 2 + 1);
  const B = spec.turndownWidth / 12;
  const P = ll.bearing.total;
  const avg = P / B;
  const peak = e <= spec.turndownWidth / 6
    ? avg * (1 + 6 * (e / 12) / B)
    : 2 * P / (3 * (B / 2 - e / 12));

  return {
    soil, lines: ll,
    bearingWidth: forBearing(ll.bearing.total),
    gableWidth: forBearing(ll.gable.total),
    detailWidth: forDetail,
    frostDepth: forFrost,
    width, depth,
    governs: forBearing(ll.bearing.total) >= forDetail ? 'bearing' : 'detailing and frost',
    builtWidth: spec.turndownWidth,
    builtDepth: spec.turndownDepth,
    widthOK: spec.turndownWidth >= width - 0.01,
    depthOK: spec.turndownDepth >= depth - 0.01,
    ecc: e, avg, peak, peakOK: peak <= soil.q,
  };
}

/* ---- the slab ----
   Westergaard, which is the closed form everyone's thickness chart comes
   from: a wheel on an elastic plate on an elastic subgrade. Interior loading
   first, then the same wheel at a free edge, which is what a truck does
   every time it comes through the door and is roughly twice as hard on the
   concrete. */
function slabDesign(spec) {
  const soil = SOIL[spec.soil] || SOIL.clay;
  const fc = spec.concreteFc;
  const Ec = 57000 * Math.sqrt(fc);
  const fr = 7.5 * Math.sqrt(fc);                     // modulus of rupture
  const nu = 0.15;
  const P = spec.wheelLoad;
  const a = Math.sqrt(P / (Math.PI * spec.tirePressure));   // contact radius

  const stress = (h) => {
    const l = Math.pow(Ec * h ** 3 / (12 * (1 - nu * nu) * soil.k), 0.25);
    const b = a < 1.724 * h
      ? Math.sqrt(1.6 * a * a + h * h) - 0.675 * h
      : a;
    const interior = 0.316 * P / (h * h) * (4 * Math.log10(l / b) + 1.069);
    const edge = 0.803 * P / (h * h) * (4 * Math.log10(l / a) + 0.666 * (a / l) - 0.034);
    return { h, l, b, interior, edge };
  };

  /* PCA works to a factor of 1.7 to 2 on the modulus of rupture. */
  const FS = 2.0;
  const allow = fr / FS;

  const thicknesses = [4, 4.5, 5, 5.5, 6, 7, 8];
  const rows = thicknesses.map((h) => {
    const st = stress(h);
    return { ...st, intOK: st.interior <= allow, edgeOK: st.edge <= allow };
  });

  /* Which case governs is a detailing decision, not a load one.

     The perimeter is not a free edge — the turndown is poured monolithic with
     the slab and supports it. The free edges are the contraction joints
     inside, and a 24 by 26 slab needs several. Dowel them, or key them, and a
     wheel crossing one is carried by both panels and the interior number is
     the one to meet. Leave them as plain sawcuts and every joint is an edge. */
  const doweled = spec.jointTransfer === 'dowels';
  const interiorOnly = rows.find((r) => r.intOK);
  const edgeToo = rows.find((r) => r.intOK && r.edgeOK);
  const min = doweled ? interiorOnly : edgeToo;

  const at = stress(spec.slabThickness);

  /* ---- shrinkage and temperature steel ----
     Grade 60, 0.0018 of the gross section. Subgrade drag gives about a tenth
     of this, so it is not what decides it. None of this steel makes the slab
     stronger — Westergaard above assumes plain concrete and the thickness has
     to work without it. What it does is hold a crack that has already
     happened tight enough to keep transferring load across itself.

     Every bar below satisfies the requirement, so the choice is a placing
     decision, not a structural one. Wider spacing means fewer pieces to cut
     and tie; a bar big enough to reach 18" in a slab this thin overshoots the
     area badly and costs more steel by weight. So: the widest practical
     spacing that is not grossly over-supplied, which lands on #4 at 18" for
     anything from 4" to 6" — the answer every slab this size gets built with. */
  const asReq = 0.0018 * 12 * spec.slabThickness;
  const MAX_SPACING = 18;   // as far apart as bar goes in a slab this thin
  const MIN_SPACING = 12;   // closer than this and it is a mat, not a slab
  const barAt = (size) => {
    const b = REBAR[size];
    /* Round down to a 2" increment so it chalks out on a tape, and never
       report a spacing tighter than anybody would place. */
    const spacing = Math.max(MIN_SPACING,
      Math.min(MAX_SPACING, Math.floor(b.area / asReq * 12 / 2) * 2));
    const provided = b.area * 12 / spacing;
    return { size, key: `rebar${size}`, area: b.area, lbft: b.lbft,
      at: spacing, provided, excess: provided / asReq - 1,
      ok: provided >= asReq - 1e-9,
      /* Two ways, so a foot of slab carries 2 × 12/spacing feet of bar. */
      psf: 2 * (12 / spacing) * b.lbft };
  };
  const all = ['#3', '#4', '#5', '#6'].map(barAt);
  const options = all.filter((o) => o.ok);
  const sane = options.filter((o) => o.excess <= 0.6);
  const auto = (sane.length ? sane : options).sort((a, b) => b.at - a.at || a.psf - b.psf)[0]
    || all[all.length - 1];
  /* A named bar wins over the rule, including a bar that does not make the
     area — being told what your choice costs beats being overruled by it. */
  const named = spec.slabBar && spec.slabBar !== 'auto'
    ? all.find((o) => o.size === spec.slabBar) : null;
  const bar = named || auto;
  const barChosen = named ? 'named' : 'auto';
  const barShort = !bar.ok;
  const spacing = bar.at;

  /* Two bars continuous in the bottom of the turndown, lapped 40 diameters at
     the corners and at every splice. This is crack control in a strip footing
     rather than flexural steel — at 567 plf on clay the strip is not close to
     bending. */
  const turndownBar = REBAR['#4'];
  const turndownBars = 2;

  /* Joints at 24 to 36 times the thickness, panels as square as they come. */
  const maxJoint = Math.min(15, spec.slabThickness * 30 / 12);
  const nx = Math.ceil(spec.width / 12 / maxJoint);
  const nz = Math.ceil(spec.depth / 12 / maxJoint);

  return {
    soil, fc, Ec, fr, allow, FS, a, rows, min, at,
    thickness: spec.slabThickness,
    thickOK: at.interior <= allow && (doweled ? true : at.edge <= allow),
    doweled, interiorOnly, edgeToo,
    asReq, bar, auto, barOptions: options, barAll: all, barChosen, barShort, spacing,
    turndownBar, turndownBars,
    joints: { max: maxJoint, nx, nz,
      panelX: spec.width / 12 / nx, panelZ: spec.depth / 12 / nz },
  };
}

/* What holds the lean-to posts up. The model already drew a pier under each
   one — 18" square, 36" deep, the same under all three, at a size nobody had
   calculated. This works out what each post actually delivers.

   Two things are easy to get wrong here and both inflate the answer.

   The posts carry half the lean-to, not all of it: the other edge sits on a
   ledger bolted to the shop wall, and that half goes down the shop's own
   footing. leanToDesign already sizes the beam for psf × projection ÷ 2 —
   this uses the same number rather than a new one.

   And the posts do not share equally. The beam is sized as a simple span
   between posts, so it gets spliced over them: an interior post picks up half
   a span from each side and an end post picks up half a span from one. With
   three posts the middle one takes twice what the ends do, and it is the
   middle one the pad has to suit. */
function postFooting(spec) {
  const lt = leanToDesign(spec);
  if (!lt || lt.impossible) return null;
  const soil = SOIL[spec.soil] || SOIL.clay;

  const Pft = lt.projection / 12;
  const w = lt.psf * (Pft / 2);                       // plf on the beam
  const span = lt.beamSpan / 12;                      // ft between posts
  const end = w * span / 2;
  const interior = w * span;
  const worst = lt.posts > 2 ? interior : end;
  const total = w * (lt.run / 12);

  /* The pad carries its own weight as well as the post, and a bigger pad
     weighs more, so this iterates rather than dividing once. Pressure is
     reported gross — post plus pad — because that is the figure the
     presumptive value is meant to be compared against. */
  const THICK = 12;
  /* Measured down from the top of the slab, the same datum the turndown uses,
     so the two dig to the same line. */
  const depthBelow = Math.max(spec.frostDepth + spec.slabThickness, 18);
  const pad = (load) => {
    let side = 12;
    for (let i = 0; i < 40; i++) {
      const selfW = (side / 12) ** 2 * (THICK / 12) * 150;      // 150 pcf
      const need = Math.sqrt((load + selfW) / soil.q) * 12;
      if (need <= side + 0.01) break;
      side = Math.ceil(need / 6) * 6;
    }
    const sf = (side / 12) ** 2;
    const selfW = sf * (THICK / 12) * 150;
    return { side, selfW, pressure: (load + selfW) / sf, net: load / sf,
      area: sf, form: 'square' };
  };

  /* A named pad size overrides both, and gets checked rather than trusted. */
  const fix = (load, side) => {
    const sf = (side / 12) ** 2;
    const selfW = sf * (THICK / 12) * 150;
    return { side, selfW, pressure: (load + selfW) / sf, net: load / sf,
      area: sf, form: 'square' };
  };

  /* ---- the round option ----
     A Sonotube pier bears on its own end, so it has no spread: the whole
     footing is the tube. That makes it fast — no forming, no pad, dig with an
     auger and fill — and hungry for diameter, because area goes as d² and
     1,500 psf clay is not much to bear on. It also goes the full depth, so it
     is more concrete than a pad and a stem for the same bearing.

     The bell-bottom forms that clip on the end of a tube are the usual answer
     to that and are not modelled here: this is the plain tube, and the panel
     says so. */
  const tubeAt = (load, d) => {
    const sf = Math.PI * (d / 12) ** 2 / 4;
    const selfW = sf * (depthBelow / 12) * 150;
    return { side: d, d, selfW, pressure: (load + selfW) / sf, net: load / sf,
      area: sf, form: 'tube' };
  };
  const sizeTube = (load) => {
    for (const d of SONOTUBE) if (tubeAt(load, d).pressure <= soil.q) return tubeAt(load, d);
    return tubeAt(load, SONOTUBE[SONOTUBE.length - 1]);
  };

  const isTube = spec.postForm === 'tube';
  const namedSq = spec.postPad > 0 ? Math.round(spec.postPad) : 0;
  const namedTube = spec.postTube > 0 ? Math.round(spec.postTube) : 0;
  const named = isTube ? namedTube : namedSq;
  const one = (load) => (isTube
    ? (namedTube ? tubeAt(load, namedTube) : sizeTube(load))
    : (namedSq ? fix(load, namedSq) : pad(load)));
  const endPad = one(end), worstPad = one(worst);

  /* Every size worth offering, and what it does — the point of naming one is
     to see the trade, not to be handed a number. */
  const padOptions = (isTube ? SONOTUBE : [12, 18, 24, 30, 36, 42, 48]).map((side) => {
    const r = isTube ? tubeAt(worst, side) : fix(worst, side);
    const vol = isTube
      ? r.area * (depthBelow / 12)
      : (side / 12) ** 2 * (THICK / 12) + (12 / 12) ** 2 * Math.max(0, depthBelow - THICK) / 12;
    return { ...r, ok: r.pressure <= soil.q, cuYd: vol / 27 * lt.posts };
  });
  return {
    form: isTube ? 'tube' : 'square',
    padChosen: named ? 'named' : 'auto', padOptions,
    padOK: worstPad.pressure <= soil.q,
    soil, posts: lt.posts, span, w, total,
    end, interior, worst,
    endPad, worstPad,
    side: worstPad.side, thickness: THICK,
    depth: depthBelow,
    pressure: worstPad.pressure,
    /* leanToDesign smears the drift surcharge across the whole projection to
       size the beam, which is conservative for the beam and for these — the
       drift piles up against the shop wall, inside the half the ledger
       carries, so very little of it ever reaches a post. */
    psf: lt.psf,
  };
}

/* Anchor bolts. The shear the walls actually deliver, against what a ½" bolt
   in the concrete will take — and then the code minimum, which almost always
   wins on a building this light. */
function anchorSchedule(spec, openings) {
  const per = 1050;                                   // ½" bolt, 3000 psi, 7" embed, ASD shear
  const dirs = bracingCheck(spec, openings);
  const worst = Math.max(...dirs.map((d) => d.V / d.lines.length));
  const byShear = Math.ceil(worst / per);
  /* One within 12" of each plate end, none more than 6 ft apart. */
  const byCode = (run) => Math.max(2, Math.ceil(run / 72) + 1);
  const longest = Math.max(spec.width, spec.depth);
  return {
    per, worst, byShear,
    byCode: byCode(longest),
    spacing: 72,
    governs: byShear > byCode(longest) ? 'shear' : 'the code minimum',
    total: byCode(spec.width) * 2 + byCode(spec.depth) * 2,
  };
}

/* ============================================================
   Electrical.

   Two calculations worth having and neither of them designs anything. Box fill
   says whether what you have put in a box fits in it, which is NEC 314.16 and
   is the thing an owner-builder gets wrong. Circuit loading says what is on
   each circuit against what the breaker will hold, which is NEC 210 and 220
   and is the thing that shows up as a nuisance trip two years later.

   An electrician still decides the circuits. This counts them.
   ============================================================ */

/* 12 AWG is the shop default: 20 A circuits, 2.25 cubic inches per conductor
   allowance out of NEC Table 314.16(B). */
const WIRE_ALLOW = 2.25;
const WIRE = { 12: { amps: 20, label: '12 AWG' }, 10: { amps: 30, label: '10 AWG' },
  8: { amps: 40, label: '8 AWG' }, 6: { amps: 55, label: '6 AWG' } };

/* NEC 314.16(B), counted the way the section counts:
   — every conductor entering and terminating in the box: one each
   — all the equipment grounds together: one, total
   — internal cable clamps: one, total, however many
   — every yoke or strap: two
   The grounds and the clamps are the two everybody forgets. */
function boxFill(d) {
  const box = EBOX[d.box];
  if (!box || d.panel) return null;
  const cables = Math.max(1, d.feeds || 2);
  const items = (d.items || []).map((k) => EDEVICE[k]).filter(Boolean);
  const yokes = items.reduce((a, i) => a + i.yokes, 0);
  const extra = items.reduce((a, i) => a + (i.wires || 0), 0);
  const conductors = cables * 2 + extra;
  const grounds = 1;
  const clamps = box.clamps ? 1 : 0;
  const count = conductors + grounds + clamps + yokes * 2;
  const need = count * WIRE_ALLOW;
  /* The smallest box on the list that holds it and has the gangs for it. */
  const fits = Object.entries(EBOX)
    .filter(([, b]) => b.cuin >= need - 1e-9 && b.gangs >= Math.max(1, yokes)
      && (!!b.ceiling === (d.wall === 'C')))
    .sort((a, b) => a[1].cuin - b[1].cuin)[0];
  return {
    box, cables, yokes, extra, conductors, grounds, clamps, count, need,
    have: box.cuin, ok: need <= box.cuin + 1e-9,
    spare: box.cuin - need,
    gangsOK: yokes <= box.gangs,
    smallest: fits ? { key: fits[0], ...fits[1] } : null,
  };
}

/* What is on each circuit, and whether the breaker holds it. Continuous loads
   — lighting, mostly — are counted at 125% because NEC 210.20(A) sizes the
   breaker for them that way, which is the same thing as saying a 20 A circuit
   carries 16 A of anything that runs for three hours. */
function circuitLoads(devs, spec) {
  const by = new Map();
  for (const d of devs) {
    if (d.panel) continue;
    for (const key of d.items || []) {
      const dev = EDEVICE[key];
      if (!dev || !dev.va) continue;
      const n = d.ckt || 1;
      const e = by.get(n) || { ckt: n, va: 0, cont: 0, volts: 120, outlets: 0, fixtures: 0 };
      e.va += dev.va;
      if (dev.kind === 'fixture') { e.cont += dev.va; e.fixtures++; } else e.outlets++;
      if (dev.volts === 240) e.volts = 240;
      by.set(n, e);
    }
  }
  const rows = [...by.values()].sort((a, b) => a.ckt - b.ckt).map((e) => {
    const design = e.va - e.cont + e.cont * 1.25;
    const amps = design / e.volts;
    const gauge = [12, 10, 8, 6].find((g) => WIRE[g].amps >= amps) || 6;
    const breaker = WIRE[gauge].amps;
    /* A general-purpose 120 V circuit in a shop is 20 A on 12 AWG, and if
       what you have put on one needs more than that, the answer is another
       circuit rather than a bigger wire. Upsizing silently would turn a
       layout mistake into an expensive-looking design decision. */
    const general = e.volts === 120;
    return { ...e, design, amps, gauge, breaker, wire: WIRE[gauge].label,
      general, overStandard: general && breaker > 20,
      /* "ok" means it holds on the circuit it is supposed to be, which for a
         general-purpose 120 V run is 20 A and not whatever wire would carry
         the load. */
      ok: general ? amps <= 20 : amps <= breaker,
      use: amps / (general ? 20 : breaker),
      /* Thirteen 180 VA outlets is a 20 A circuit's worth. No 80% derate on
         top: the 180 VA in NEC 220.14(I) is already the load allowance, and a
         receptacle outlet is not a continuous load. */
      outletsOK: e.outlets <= Math.floor((general ? 20 : breaker) * e.volts / 180) };
  });
  const totalVA = rows.reduce((a, r) => a + r.design, 0);
  return {
    rows, totalVA,
    /* A sub-panel feeder is sized on the calculated load, and a shop is a
       non-continuous mix, so this is the honest connected figure rather than
       a demand-factored one. */
    amps: totalVA / 240,
    service: spec.service,
    serviceOK: totalVA / 240 <= spec.service * 0.8,
  };
}

function electricalReview(spec, openings, devs) {
  const out = [];
  const list = devs || deviceList(spec, openings, null);
  const over = [];
  for (const d of list) {
    const f = boxFill(d);
    if (!f) continue;
    if (!f.ok || !f.gangsOK) over.push({ d, f });
  }
  for (const { d, f } of over.slice(0, 6)) {
    out.push({ level: 'crit',
      title: !f.gangsOK
        ? `${deviceLabel(d)} will not fit a ${f.box.gangs}-gang box`
        : `${deviceLabel(d)} is over the box fill`,
      body: !f.gangsOK
        ? `${f.yokes} yokes in a ${f.box.gangs}-gang ${f.box.label.toLowerCase()}. `
          + `${f.smallest ? `A ${f.smallest.label.toLowerCase()} takes them.` : 'Split it into two boxes.'}`
        : `${fmtN(f.need, 1)} cu in of allowance in a ${fmtN(f.have, 1)} cu in box: `
          + `${f.conductors} conductors, ${f.grounds} for the grounds, `
          + `${f.clamps ? '1 for the clamps, ' : ''}${f.yokes * 2} for ${f.yokes} yoke`
          + `${f.yokes === 1 ? '' : 's'}. `
          + `${f.smallest ? `A ${f.smallest.label.toLowerCase()} is the smallest that holds it.`
            : 'Nothing on the list holds it — split the run.'}`,
    });
  }
  if (over.length > 6) {
    out.push({ level: 'warn', title: `${over.length - 6} more boxes are over the fill`,
      body: 'Same story as the ones above — see the Electrical tab for the whole list.' });
  }

  const cl = circuitLoads(list, spec);
  for (const r of cl.rows) {
    if (r.overStandard) {
      out.push({ level: 'crit', title: `Circuit ${r.ckt} is over what a 20 A circuit holds`,
        body: `${fmtN(r.design)} VA design load is ${fmtN(r.amps, 1)} A, and a general-purpose `
          + `120 V circuit in a shop is 20 A on 12 AWG. Carrying it would take a `
          + `${r.breaker} A breaker and ${r.wire}, which is not what a receptacle circuit is. `
          + 'Split it across another circuit.' });
    } else if (!r.outletsOK) {
      out.push({ level: 'warn', title: `Circuit ${r.ckt} has ${r.outlets} outlets on it`,
        body: `At 180 VA an outlet, ${Math.floor((r.general ? 20 : r.breaker) * r.volts / 180)} `
          + `is what a ${r.general ? 20 : r.breaker} A circuit is worth. It does not fail the calculation, because the `
          + 'calculation assumes they are not all in use — but it is the circuit that trips '
          + 'the day two things get plugged in at once.' });
    }
  }
  if (!cl.serviceOK) {
    out.push({ level: 'warn', title: 'The sub-panel is smaller than what is on it',
      body: `${fmtN(cl.totalVA)} VA connected is ${fmtN(cl.amps, 1)} A against a `
        + `${spec.service} A panel. Connected load is not calculated load — a shop never runs `
        + 'everything at once — but it is worth a demand calculation before the feeder is sized.' });
  }
  /* The two things a shop gets cited for. */
  const wet = list.filter((d) => !d.panel && (d.items || []).some((k) => (EDEVICE[k] || {}).kind === 'recep'));
  const gfci = wet.filter((d) => (d.items || []).includes('gfci')).length;
  if (wet.length && gfci === 0) {
    out.push({ level: 'warn', title: 'No GFCI anywhere in the shop',
      body: `${wet.length} receptacle outlets and not one of them GFCI protected. A 125 V, `
        + '15 or 20 A receptacle serving a garage or an accessory building floor area needs it — '
        + 'either GFCI devices or a GFCI breaker at the head of the circuit.' });
  }
  return out;
}
