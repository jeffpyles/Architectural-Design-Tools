/* ============================================================
   Material takeoff and cut list, counted off the parts list so it cannot
   drift from what the model is showing.
   ============================================================ */

function takeoff(model, spec) {
  const lumber = new Map();
  const sheets = new Map();
  let concreteCuIn = 0;
  const areas = new Map();
  let gussets = 0;

  for (const p of model.parts) {
    if (p.mat === 'concrete') {
      const g = p.geom;
      if (g.t === 'box') concreteCuIn += g.s[0] * g.s[1] * g.s[2];
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

  const roofSf = [...areas.entries()].filter(([k]) => /roof panel|shingle/i.test(k))
    .reduce((a, [, v]) => a + v, 0);
  const sideSf = [...areas.entries()].filter(([k]) => /wall panel|lap siding/i.test(k))
    .reduce((a, [, v]) => a + v, 0);
  const battSf = [...areas.entries()].filter(([k]) => /batt/i.test(k)).reduce((a, [, v]) => a + v, 0);
  const blownSf = [...areas.entries()].filter(([k]) => /blown/i.test(k)).reduce((a, [, v]) => a + v, 0);

  const cuYd = concreteCuIn / 46656;

  return {
    cuts, buyRows, sheetRows, gussets,
    concrete: { cuYd, order: Math.ceil(cuYd * 1.1 * 2) / 2 },
    roofSf, sideSf, ceilSf, wallSf, dwSf, battSf, blownSf,
    gussetSheets: Math.ceil(gussets * (13 * 15 / 144) / SHEET_SF * 1.15),
    drywallSheets: Math.ceil((ceilSf / 48 + wallSf / 32) * 1.08),
    roofSquares: roofSf / 100,
    sideSquares: sideSf / 100,
  };
}
