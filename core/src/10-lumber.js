/* ============================================================
   Dressed lumber, section properties, and the member picker every
   building leans on for headers, rafters, joists and beams.
   ============================================================ */


/* Nominal → actual dressed lumber, plus section properties used by
   the header sizer. Sx/Ix are per ply, dry-service S4S. */
const LUMBER = {
  /* 1x is furring, and it is here to be a girt. Sold as boards rather than
     stress-graded lumber, so nothing sizes a structural member out of it —
     girtCheck gives it a deliberately conservative Fb and says so. */
  '1x3':  { t: 0.75, d: 2.5, Sx: 0.781, Ix: 0.977, Cf: 1.5 },
  '1x4':  { t: 0.75, d: 3.5, Sx: 1.531, Ix: 2.679, Cf: 1.5 },
  '2x4':  { t: 1.5, d: 3.5,   Sx: 3.06,  Ix: 5.36,   Cf: 1.5  },
  '2x6':  { t: 1.5, d: 5.5,   Sx: 7.56,  Ix: 20.80,  Cf: 1.3  },
  '2x8':  { t: 1.5, d: 7.25,  Sx: 13.14, Ix: 47.63,  Cf: 1.2  },
  '2x10': { t: 1.5, d: 9.25,  Sx: 21.39, Ix: 98.93,  Cf: 1.1  },
  '2x12': { t: 1.5, d: 11.25, Sx: 31.64, Ix: 177.98, Cf: 1.0  },
  '4x6':  { t: 3.5, d: 5.5,   Sx: 17.65, Ix: 48.53,  Cf: 1.3  },
  '6x6':  { t: 5.5, d: 5.5,   Sx: 27.73, Ix: 76.26,  Cf: 1.0  },
};
/* How a girt sits on the wall, which is not the same question for every size.

   A 2x goes ON EDGE, pole-barn fashion: 3½" of projection, and 1½" of face
   for the siding screws to find. A 1x goes FLAT, because on edge it would
   present a ¾" edge to a screw line running the length of a 34-foot wall,
   and nobody hits that. Flat it gives 2½" or 3½" of target — better than the
   2x it replaces — and the wall gets 2¾" thinner a side.

   `face` is the vertical dimension, which is the screw target. `out` is the
   projection past the framing, which is what the siding stands off by and
   what the girt bends about under wind. */
function girtSection(size, flat) {
  const L = LUMBER[size];
  if (!L) return null;
  /* A building can lay them all flat — the shop does. Left unsaid, 1x goes
     flat because it has to and 2x goes on edge, which is how the tiny house
     was drawn. */
  const lay = flat == null ? /^1x/.test(size) : !!flat;
  return { ...L, size, flat: lay, face: lay ? L.d : L.t, out: lay ? L.t : L.d };
}

/* Wind on a girt is a components-and-cladding load, not the whole-building
   one: a girt at 24" o.c. spanning 24" has four square feet of tributary
   area, which is the small-area end of the GC_p curve and worse than the
   figure the racking check uses. Suction at a corner governs. */
function claddingPressure(spec, zone) {
  const Kz = spec.exposure === 'B' ? 0.70 : spec.exposure === 'D' ? 1.03 : 0.85;
  const qz = 0.00256 * spec.windSpeed * spec.windSpeed * Kz * 0.85;
  const GCp = zone === 'field' ? 1.1 : 1.4;      // ASCE 7 Fig 30.3-1, small area
  return qz * (GCp + 0.18) * 0.6;                // enclosed, then ASD
}

/* Does the girt carry that between the studs? Bending out of the wall plane,
   and deflection, which is what makes a metal panel ripple long before
   anything breaks. */
function girtCheck(spec, flat) {
  const g = girtSection(spec.girtSize, flat);
  if (!g) return null;
  const span = spec.studSpacing;                 // girts span stud to stud
  const p = claddingPressure(spec);
  const w = p * (spec.girtSpacing / 12);         // plf
  const M = w / 12 * span * span / 8;            // lb-in
  const S = g.face * g.out * g.out / 6;
  const I = g.face * g.out * g.out * g.out / 12;
  /* Boards have no published design values, so 1x is given a conservative
     500 psi against the 900 × C_f the graded sizes get. Both take C_D 1.6
     for wind and C_r 1.15 for a row of them; flat girts take the flat-use
     bump as well. */
  const Fb = (g.flat ? 500 * 1.1 : 900 * g.Cf) * 1.15 * 1.6;
  const E = g.flat ? 1.2e6 : 1.6e6;
  const defl = 5 * (w / 12) * span ** 4 / (384 * E * I);
  const limit = span / 180;
  const bend = M / (Fb * S), sag = defl / limit;
  return { ...g, span, p, w, M, S, I, Fb, E, fb: M / S, defl, limit,
    bend, sag, ratio: Math.max(bend, sag), ok: bend <= 1 && sag <= 1 };
}

const LVL = {
  '1.75x11.875': { t: 1.75, d: 11.875, Sx: 41.13, Ix: 244.2 },
  '1.75x14':     { t: 1.75, d: 14.0,   Sx: 57.17, Ix: 400.2 },
};

/* ---- header sizing ----
   Bending and deflection only; bearing and uplift get checked by eye at
   the framing stage. CD = 1.15 for snow-duration loading. */
const HEADER_LADDER = [
  { size: '2x6',  plies: 2, kind: 'sawn' },
  { size: '2x8',  plies: 2, kind: 'sawn' },
  { size: '2x10', plies: 2, kind: 'sawn' },
  { size: '2x12', plies: 2, kind: 'sawn' },
  { size: '2x10', plies: 3, kind: 'sawn' },
  { size: '2x12', plies: 3, kind: 'sawn' },
  { size: '1.75x11.875', plies: 2, kind: 'lvl' },
  { size: '1.75x11.875', plies: 3, kind: 'lvl' },
  { size: '1.75x14', plies: 3, kind: 'lvl' },
];
const RAFTER_LADDER = [
  { size: '2x6', plies: 1 }, { size: '2x8', plies: 1 },
  { size: '2x10', plies: 1 }, { size: '2x12', plies: 1 },
];

/* One candidate, worked out whether or not it passes. Split out of
   pickMember so a member somebody has NAMED can be reported with what it
   costs — being overruled by the ladder tells you nothing. */
function evalMember(opt, clearSpan, wPlf, defDiv, repetitive) {
  const isLvl = opt.kind === 'lvl';
  const sec = isLvl ? LVL[opt.size] : LUMBER[opt.size];
  if (!sec) return null;
  const L = clearSpan;
  const win = wPlf / 12;
  const M = win * L * L / 8;
  const defLimit = L / defDiv;
  const Sx = sec.Sx * opt.plies;
  const Ix = sec.Ix * opt.plies;
  const Cr = repetitive || opt.plies >= 3 ? 1.15 : 1.0;
  const Fb = isLvl ? 2600 * 1.15 : 900 * 1.15 * sec.Cf * Cr;
  const E = isLvl ? 2.0e6 : 1.6e6;
  const capM = Fb * Sx;
  const defl = 5 * win * Math.pow(L, 4) / (384 * E * Ix);
  return {
    size: opt.size, plies: opt.plies, kind: opt.kind || 'sawn',
    depth: sec.d, thickness: opt.plies * sec.t,
    M, capM, defl, defLimit, w: wPlf, ratio: M / capM,
    deflRatio: defLimit > 0 ? defl / defLimit : 0,
    ok: capM >= M && defl <= defLimit,
    governs: capM < M ? 'bending' : defl > defLimit ? 'deflection' : null,
    label: isLvl
      ? `(${opt.plies}) 1¾×${opt.size.endsWith('14') ? '14' : '11⅞'} LVL`
      : (opt.plies === 1 ? opt.size : `(${opt.plies}) ${opt.size}`),
  };
}

/* Shallowest member from a ladder that carries wPlf over clearSpan inches.
   Cr applies to repetitive members — rafters and joists at 24" o.c. or
   tighter, and built-up beams of three plies or more.

   `minDepth` rejects anything shallower than a stated depth, which is what a
   beam needs when something is hung off its face rather than sitting on top:
   a face-mount hanger has to land on a member at least as deep as the one it
   carries. */
function pickMember(clearSpan, wPlf, ladder, defDiv, repetitive, minDepth) {
  for (const opt of ladder) {
    const r = evalMember(opt, clearSpan, wPlf, defDiv, repetitive);
    if (!r) continue;
    if (minDepth && r.depth < minDepth - 0.001) continue;
    if (r.ok) return r;
  }
  return null;
}
/* ============================================================
   40 — Material takeoff and cut list, derived from the parts list so it
   can never drift from what the model is showing.
   ============================================================ */

const STOCK_LENGTHS = [96, 120, 144, 168, 192, 240];   // 8' through 20'
const MAX_STOCK = STOCK_LENGTHS[STOCK_LENGTHS.length - 1];
const SHEET_SF = 32;                                    // 4' × 8'
function bestStock(len) {
  let best = null;
  for (const S of STOCK_LENGTHS) {
    if (S < len - 0.02) continue;
    const per = Math.floor((S + 0.02) / len);
    const waste = S / per - len;
    if (!best || waste < best.waste - 0.02) best = { S, per, waste };
  }
  if (!best) {
    const per = 1, S = Math.ceil(len / 24) * 24;
    best = { S, per, waste: S - len, oversize: true };
  }
  return best;
}

/* Plates, girts and purlins run longer than any stick you can buy, so they
   get lapped. Split them into equal pieces that land at 16' or under. */
function splitRun(len) {
  if (len <= MAX_STOCK + 0.02) return [len];
  const n = Math.ceil(len / 192);
  return Array.from({ length: n }, () => len / n);
}

/* Fibre form tubes, in the diameters the yards actually stock. A pier is only
   ever one of these — asking for 22" gets you 24" and a puzzled look. */
const SONOTUBE = [8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48];

/* ---- structural steel ----------------------------------------------------
   Trailer frames are built from rectangular tube and light I sections. Weight
   is computed from the section rather than looked up, so a size nobody stocks
   still reports honestly: mild steel is 0.2836 lb/in³, and a rectangular tube
   of wall t measuring a × b outside has an area of 2t(a + b − 2t), ignoring
   the corner radii, which makes it read about 1% heavy. */
const STEEL_DENSITY = 0.2836;                 // lb per cubic inch

function tubeSection(a, b, t) {
  const d = Math.max(a, b), w = Math.min(a, b);
  const Ix = (w * d ** 3 - (w - 2 * t) * (d - 2 * t) ** 3) / 12;
  return { d, w, t, area: 2 * t * (a + b - 2 * t), Ix, Sx: Ix / (d / 2) };
}

/* A fabricated I: two flanges and a web, all of the same material. Trailer
   builders call these by the same a × b × t shorthand as the tube. */
function ibeamSection(flange, depth, t) {
  const Ix = 2 * (flange * t ** 3 / 12 + flange * t * ((depth - t) / 2) ** 2)
    + t * (depth - 2 * t) ** 3 / 12;
  return { d: depth, w: flange, t, area: 2 * flange * t + (depth - 2 * t) * t,
    Ix, Sx: Ix / (depth / 2) };
}

const STEEL = {
  'tube2x6x120':  { ...tubeSection(2, 6, 0.120), label: '2×6×.120 tube', Fy: 46 },
  'tube1.5x4x100': { ...tubeSection(1.5, 4, 0.100), label: '1½×4×.100 tube', Fy: 46 },
  'tube2x4x125':  { ...tubeSection(2, 4, 0.125), label: '2×4×.125 tube', Fy: 46 },
  'tube2x4x188':  { ...tubeSection(2, 4, 0.188), label: '2×4×³⁄₁₆ tube', Fy: 46 },
  /* Salvage off a travel trailer frame: a formed section rather than a rolled
     one, and of a grade nobody can now look up. 36 ksi is the honest floor. */
  'i1.5x6x120':   { ...ibeamSection(1.5, 6, 0.120), label: '1½×6×.120 I-beam', Fy: 36 },
};
for (const s of Object.values(STEEL)) s.lbft = s.area * STEEL_DENSITY * 12;

/* ---- deformed bar --------------------------------------------------------
   Slab and footing steel. Areas and weights are the nominal ASTM A615 values
   rather than computed ones — a deformed bar weighs slightly more than its
   nominal diameter suggests, because of the deformations, and the mill sells
   it by the nominal figure. Bars join STEEL after the loop above so those
   stated weights survive, which also puts them in the same purchase table:
   what you buy is still linear feet of a named size. */
const REBAR = {
  '#3': { d: 0.375, area: 0.11, lbft: 0.376 },
  '#4': { d: 0.500, area: 0.20, lbft: 0.668 },
  '#5': { d: 0.625, area: 0.31, lbft: 1.043 },
  '#6': { d: 0.750, area: 0.44, lbft: 1.502 },
};
for (const [size, b] of Object.entries(REBAR)) {
  b.size = size;
  b.label = `${size} rebar, grade 60`;
  b.Fy = 60;
  STEEL[`rebar${size}`] = b;
}
