/* ============================================================
   Material takeoff and cut list, counted off the parts list so it cannot
   drift from what the model is showing.
   ============================================================ */

/* Weight per cubic inch, for the buildings where what a thing weighs is a
   design driver rather than a curiosity. A part carrying an explicit `lbft`
   — hollow steel, mostly — is weighed off its length instead, because its
   bounding box is mostly air. */
const DENSITY = {
  concrete: 0.0868, gravel: 0.0637,
  fir: 0.0185, firDark: 0.0185, treated: 0.0197, lvl: 0.0260, plywood: 0.0206,
  osb: 0.0226,
  steel: 0.2836, steelDk: 0.2836, rubber: 0.0400, metal: 0.2836,
  shingle: 0.0400, trim: 0.0185, door: 0.0180, ohdoor: 0.0150,
  glass: 0.0900, drywall: 0.0272, batt: 0.00055, blown: 0.00075, foam: 0.00115,
  wrap: 0.0002, panel: 0.0500, conduit: 0.0300, box: 0.0300, fixture: 0.0100,
};

function partVolume(g) {
  if (!g) return 0;
  if (g.t === 'box') return g.s[0] * g.s[1] * g.s[2];
  if (g.t === 'cyl') return Math.PI * (g.d / 2) ** 2 * g.h;
  if (g.t === 'prism') {
    let a = 0;
    for (let i = 0, n = g.pts.length; i < n; i++) {
      const [z0, y0] = g.pts[i], [z1, y1] = g.pts[(i + 1) % n];
      a += z0 * y1 - z1 * y0;
    }
    return Math.abs(a / 2) * Math.abs(g.x1 - g.x0);
  }
  return 0;
}

/* Three ways to weigh a part, in the order they are trusted:

   `lb`   — somebody knows what it weighs. A tyre, an appliance.
   `lbft` — a section weight. Hollow steel, whose bounding box is mostly air.
   `psf`  — a sheet good. Skin, glazing and membranes are drawn at a
            thickness you can see rather than the thickness they are, so
            their volume is fiction and their area is not.

   Anything with none of those falls back to volume times density, which is
   right for solid timber and concrete and wrong for almost nothing else. */
function partWeight(p) {
  if (p.lb) return p.lb;
  if (p.lbft && p.len) return p.lbft * p.len / 12;
  if (p.psf && p.area) return p.psf * p.area;
  const d = DENSITY[p.mat];
  return d ? partVolume(p.geom) * d : 0;
}

/* How a part got weighed, so the heaviest few can be listed with their
   method. Reading that list is what catches a hollow thing weighed solid —
   it has happened twice now, and both times the number was enormous and
   nothing flagged it. */
function weighedBy(p) {
  if (p.lb) return 'stated';
  if (p.lbft && p.len) return 'section';
  if (p.psf && p.area) return 'per sf';
  return DENSITY[p.mat] ? 'volume × density' : 'not weighed';
}

function takeoff(model, spec) {
  const lumber = new Map();
  const sheets = new Map();
  let concreteCuIn = 0;
  const areas = new Map();
  let gussets = 0;
  const steel = new Map();

  /* Weight and where it sits, counted over every part before the
     material-specific branching below starts skipping things. */
  const byMat = new Map();
  let wTot = 0, mx = 0, my = 0, mz = 0;
  for (const p of model.parts) {
    const w = partWeight(p);
    if (!w) continue;
    byMat.set(p.mat, (byMat.get(p.mat) || 0) + w);
    const c = aabb(p.geom).c;
    wTot += w; mx += w * c[0]; my += w * c[1]; mz += w * c[2];
  }
  const weight = {
    total: wTot,
    cg: wTot ? [mx / wTot, my / wTot, mz / wTot] : [0, 0, 0],
    byMat: [...byMat.entries()].map(([mat, lb]) => ({ mat, lb })).sort((a, b) => b.lb - a.lb),
    heaviest: model.parts
      .map((p) => ({ kind: p.kind, lb: partWeight(p), how: weighedBy(p) }))
      .filter((r) => r.lb > 0)
      .sort((a, b) => b.lb - a.lb)
      .slice(0, 10),
  };

  for (const p of model.parts) {
    if (p.steel && p.len) {
      const e = steel.get(p.steel) || { key: p.steel, lf: 0, lb: 0, qty: 0 };
      e.lf += p.len / 12; e.lb += partWeight(p); e.qty++;
      steel.set(p.steel, e);
      continue;
    }
    if (p.mat === 'concrete') {
      const g = p.geom;
      concreteCuIn += partVolume(g);
      continue;
    }
    if (p.kind === '¾" plywood gusset') { gussets++; continue; }

    if (p.len && p.size && LUMBER[p.size]) {
      const pieces = splitRun(p.len);
      for (const cut of pieces) {
        const key = `${p.size}|${Math.round(cut * 16) / 16}`;
        const e = lumber.get(key)
          || { size: p.size, len: cut, qty: 0, uses: new Set(), spliced: pieces.length > 1 };
        e.qty++; e.uses.add(p.kind.replace(/^\d+x\d+\s*/, ''));
        if (pieces.length > 1) e.spliced = true;
        lumber.set(key, e);
      }
      continue;
    }
    if (p.area) {
      const k = p.kind;
      areas.set(k, (areas.get(k) || 0) + p.area);
    }
  }

  // Roll lumber up into purchase lengths
  const buy = new Map();
  const cuts = [];
  for (const e of [...lumber.values()].sort((a, b) => a.size.localeCompare(b.size) || b.len - a.len)) {
    const st = bestStock(e.len);
    const sticks = Math.ceil(e.qty / st.per);
    const k = `${e.size}|${st.S}`;
    buy.set(k, (buy.get(k) || 0) + sticks);
    cuts.push({ ...e, uses: [...e.uses].join(', '), stock: st.S, per: st.per, sticks });
  }

  const buyRows = [...buy.entries()].map(([k, qty]) => {
    const [size, S] = k.split('|');
    return { size, stock: +S, qty, lf: qty * (+S) / 12 };
  }).sort((a, b) => a.size.localeCompare(b.size) || a.stock - b.stock);

  // Sheet goods
  const sheetRows = [];
  for (const [kind, sf] of areas) {
    if (/OSB|deck|braced|sheathing/i.test(kind)) {
      sheetRows.push({ kind, sf, sheets: Math.ceil(sf / SHEET_SF * 1.08) });
    }
  }
  const dwSf = [...areas.entries()].filter(([k]) => /board/i.test(k)).reduce((a, [, v]) => a + v, 0);
  const ceilSf = areas.get('⅝" ceiling board') || 0;
  const wallSf = areas.get('½" wall board') || 0;

  const pick = (re) => [...areas.entries()].filter(([k]) => re.test(k));
  const roofing = pick(/roof panel|shingle|standing seam|membrane/i);
  const siding = pick(/wall panel|siding|shiplap|board.and.batten/i);
  const roofSf = roofing.reduce((a, [, v]) => a + v, 0);
  const sideSf = siding.reduce((a, [, v]) => a + v, 0);
  const biggest = (rows) => (rows.sort((a, b) => b[1] - a[1])[0] || [])[0];
  const battSf = [...areas.entries()].filter(([k]) => /batt/i.test(k)).reduce((a, [, v]) => a + v, 0);
  const blownSf = [...areas.entries()].filter(([k]) => /blown/i.test(k)).reduce((a, [, v]) => a + v, 0);

  const cuYd = concreteCuIn / 46656;

  const steelRows = [...steel.values()]
    .map((e) => ({ ...e, label: (STEEL[e.key] || {}).label || e.key }))
    .sort((a, b) => b.lb - a.lb);

  return {
    cuts, buyRows, sheetRows, gussets, weight, steelRows,
    concrete: { cuYd, order: Math.ceil(cuYd * 1.1 * 2) / 2 },
    roofSf, sideSf, ceilSf, wallSf, dwSf, battSf, blownSf,
    roofKind: biggest(roofing), sideKind: biggest(siding),
    gussetSheets: Math.ceil(gussets * (13 * 15 / 144) / SHEET_SF * 1.15),
    drywallSheets: Math.ceil((ceilSf / 48 + wallSf / 32) * 1.08),
    roofSquares: roofSf / 100,
    sideSquares: sideSf / 100,
  };
}
