/* ============================================================
   Dressed lumber, section properties, and the member picker every
   building leans on for headers, rafters, joists and beams.
   ============================================================ */


/* Nominal → actual dressed lumber, plus section properties used by
   the header sizer. Sx/Ix are per ply, dry-service S4S. */
const LUMBER = {
  '2x4':  { t: 1.5, d: 3.5,   Sx: 3.06,  Ix: 5.36,   Cf: 1.5  },
  '2x6':  { t: 1.5, d: 5.5,   Sx: 7.56,  Ix: 20.80,  Cf: 1.3  },
  '2x8':  { t: 1.5, d: 7.25,  Sx: 13.14, Ix: 47.63,  Cf: 1.2  },
  '2x10': { t: 1.5, d: 9.25,  Sx: 21.39, Ix: 98.93,  Cf: 1.1  },
  '2x12': { t: 1.5, d: 11.25, Sx: 31.64, Ix: 177.98, Cf: 1.0  },
  '4x6':  { t: 3.5, d: 5.5,   Sx: 17.65, Ix: 48.53,  Cf: 1.3  },
  '6x6':  { t: 5.5, d: 5.5,   Sx: 27.73, Ix: 76.26,  Cf: 1.0  },
};
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

/* Shallowest member from a ladder that carries wPlf over clearSpan inches.
   Cr applies to repetitive members — rafters and joists at 24" o.c. or
   tighter, and built-up beams of three plies or more. */
function pickMember(clearSpan, wPlf, ladder, defDiv, repetitive) {
  const L = clearSpan;
  const win = wPlf / 12;
  const M = win * L * L / 8;
  const defLimit = L / defDiv;
  for (const opt of ladder) {
    const isLvl = opt.kind === 'lvl';
    const sec = isLvl ? LVL[opt.size] : LUMBER[opt.size];
    if (!sec) continue;
    const Sx = sec.Sx * opt.plies;
    const Ix = sec.Ix * opt.plies;
    const Cr = repetitive || opt.plies >= 3 ? 1.15 : 1.0;
    const Fb = isLvl ? 2600 * 1.15 : 900 * 1.15 * sec.Cf * Cr;
    const E = isLvl ? 2.0e6 : 1.6e6;
    const capM = Fb * Sx;
    const defl = 5 * win * Math.pow(L, 4) / (384 * E * Ix);
    if (capM >= M && defl <= defLimit) {
      return { size: opt.size, plies: opt.plies, kind: opt.kind || 'sawn',
        depth: sec.d, thickness: opt.plies * sec.t, M, capM, defl, defLimit,
        w: wPlf, ratio: M / capM,
        label: isLvl
          ? `(${opt.plies}) 1¾×${opt.size.endsWith('14') ? '14' : '11⅞'} LVL`
          : (opt.plies === 1 ? opt.size : `(${opt.plies}) ${opt.size}`) };
    }
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
