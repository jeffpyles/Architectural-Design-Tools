/* ============================================================
   What each assembly choice weighs, costs, takes to build, and does
   structurally.

   One row per option, and every number about that option lives in the row.
   That is the whole point: the weight in the takeoff, the dollars on the
   Compare tab and the shear the racking check is allowed to count all come
   off the same line, so they cannot drift apart. The bug that prompted this
   was exactly that drift — the racking check used a hardcoded OSB allowable
   no matter which interior panel you picked, so a ¼" lining reported the
   capacity of ⁷⁄₁₆" OSB.

   Units, once:
     psf      lb per square foot of finished surface
     usd      material dollars per square foot — MATERIAL ONLY, no labour,
              no trim, no fasteners. Add 25–40% for accessories.
     hr       labour hours, at an owner-builder pace working alone — per
              100 sf for a surface, per 100 lineal feet of member for
              framing. A crew that does this every day is two to three times
              faster; that is not who this tool is for.
     R        what the layer itself adds. Small for skins, and included so
              the wall R sums honestly rather than nearly.
     shear    plf, wood structural panel, blocked, 8d at 6" o.c. edges.
              0 means it is not a shear panel and must not be counted as one.
     maxStud  the widest framing spacing that shear value is rated at.
     spans    the widest bare framing spacing the skin will hang on. null
              means it needs continuous sheathing behind it.
     nailable minimum substrate thickness this skin must be fastened into,
              inches. 0 = fastens to framing or girts directly.
     minPitch rise per 12 this covering is rated down to.

   Prices are ballpark for a US owner-builder, and they go stale. PRICED
   says when; the Costs panel lets anybody type their own quote over the
   top, and those travel in the share code. Do not treat the defaults as
   more than a starting point — OSB alone ran from $9 a sheet to over $50
   inside eighteen months in 2020–21.
   ============================================================ */

const PRICED = 'August 2026';

/* Roofing. Pitch is what rules this list out, not taste: below 3/12 a
   lapped panel and a shingle both leak, and standing seam has to be
   mechanically double-locked rather than snapped. */
const ROOFING = {
  standing:   { label: 'Standing seam, 24 ga steel', psf: 1.40, usd: 4.50, hr: 2.4, R: 0,
    minPitch: 0.25, seam: 'mech', mat: 'metal',
    note: 'The default. Heavier and cheaper than aluminium, and stiff enough not to oil-can.' },
  standing26: { label: 'Standing seam, 26 ga steel', psf: 1.10, usd: 3.50, hr: 2.3, R: 0,
    minPitch: 0.25, seam: 'mech', mat: 'metal',
    note: 'Lighter and cheaper than 24 ga, but it oil-cans more and some double-lock '
      + 'profiles are 24 ga minimum. Ask the supplier before specifying it.' },
  standingAl: { label: 'Standing seam, .032 aluminium', psf: 0.50, usd: 9.00, hr: 2.4, R: 0,
    minPitch: 0.25, seam: 'mech', mat: 'metal',
    note: 'Two-thirds lighter than 24 ga steel and about twice the price. Moves twice as '
      + 'much with temperature, so the clips have to float.' },
  metal:      { label: 'Lapped metal panel', psf: 0.90, usd: 2.40, hr: 1.6, R: 0,
    minPitch: 3, seam: 'lap', mat: 'metal',
    note: 'Cheapest metal there is, and it wants 3/12 or steeper.' },
  comp:       { label: 'Architectural shingle', psf: 2.60, usd: 1.60, hr: 2.8, R: 0.44,
    minPitch: 2, seam: 'lap', mat: 'shingle',
    note: 'The heaviest covering on the list, and not rated below 2/12 even doubled up.' },
};

/* Siding. `spans` is the constraint people trip over: a ribbed panel bridges
   girts on its own, and anything flat, lapped or coursed does not. */
const SIDING = {
  metal:       { label: 'Metal panel, 26 ga steel', psf: 0.90, usd: 2.40, hr: 1.6, R: 0,
    spans: 24, nailable: 0, mat: 'metal',
    note: 'The default. Ribbed, so it spans girts with no sheathing behind it.' },
  metal24:     { label: 'Metal panel, 24 ga steel', psf: 1.15, usd: 3.10, hr: 1.7, R: 0,
    spans: 30, nailable: 0, mat: 'metal',
    note: 'Stiffer than 26 ga — worth it if the girts go wider.' },
  alum:        { label: 'Ribbed panel, .032 aluminium', psf: 0.50, usd: 4.50, hr: 1.6, R: 0,
    spans: 24, nailable: 0, mat: 'metal',
    note: 'Half the weight of 26 ga steel for about twice the money. Needs aluminium or '
      + 'stainless fasteners — plain steel screws will corrode it off the wall.' },
  alumShake:   { label: 'Aluminium shake profile', psf: 0.50, usd: 7.00, hr: 3.5, R: 0,
    spans: null, nailable: 0.375, mat: 'metal',
    note: 'Stamped and interlocking: the cedar look at aluminium weight. Wants a solid '
      + 'nailable face behind it.' },
  alumLap:     { label: 'Aluminium lap siding, .019', psf: 0.27, usd: 3.20, hr: 2.4, R: 0,
    spans: null, nailable: 0.375, mat: 'metal',
    note: 'The lightest skin on the list by some way. Dents if you look at it.' },
  lap:         { label: 'Lap siding', psf: 2.00, usd: 2.80, hr: 3.2, R: 0.40,
    spans: 16, nailable: 0, mat: 'trim',
    note: 'Fibre cement or wood. Heavy, and it wants framing or furring at 16".' },
  cedarShingle:{ label: 'Cedar shingles, sawn', psf: 1.15, usd: 6.50, hr: 6.0, R: 0.60,
    spans: null, nailable: 0.375, mat: 'trim',
    note: '18" shingles at 7½" exposure: 2.4 sf of material per sf of wall. Needs ⅜" of '
      + 'nailable sheathing at least, and a rainscreen behind it in a wet climate.' },
  cedarShake:  { label: 'Cedar shakes, hand-split', psf: 1.80, usd: 8.00, hr: 6.5, R: 0.75,
    spans: null, nailable: 0.375, mat: 'trim',
    note: 'Medium ½" butt at 10" exposure. Half a ton heavier than metal on a house this '
      + 'size, and the slowest thing here to hang.' },
};

/* The interior face. On the tiny house this is also the entire shear wall,
   which is why `shear` and `maxStud` are on the row and why picking a lining
   has to cost you the racking rather than quietly not. */
const INTERIOR = {
  osb:     { label: '⁷⁄₁₆" OSB — braces and finishes', psf: 1.40, usd: 0.55, hr: 2.0, R: 0.55,
    shear: 240, maxStud: 24, mat: 'osb',
    note: 'The default: one layer bracing the wall and finishing it.' },
  ply1532: { label: '¹⁵⁄₃₂" plywood — braces and finishes', psf: 1.42, usd: 1.20, hr: 2.0, R: 0.59,
    shear: 280, maxStud: 24, mat: 'plywood',
    note: 'Same weight as ⁷⁄₁₆" OSB, more shear, better screw holding, and it does not '
      + 'swell at a wet edge. Worth the money in something that lives on the road.' },
  ply38:   { label: '⅜" plywood — braces and finishes', psf: 1.10, usd: 1.00, hr: 2.0, R: 0.47,
    shear: 220, maxStud: 16, mat: 'plywood',
    note: 'Lighter, and only 8% less shear — but it is rated at 16" o.c. framing, so it '
      + 'costs you the studs it saves in sheet.' },
  ply:     { label: '¼" plywood lining', psf: 0.75, usd: 0.75, hr: 1.6, R: 0.31,
    shear: 0, maxStud: 0, mat: 'plywood',
    note: 'A surface, not a shear panel, and it will not hold a cabinet screw. Fine where '
      + 'something else is doing the bracing.' },
  gyp:     { label: '½" gypsum board', psf: 2.20, usd: 0.45, hr: 6.5, R: 0.45,
    shear: 0, maxStud: 0, mat: 'drywall',
    note: 'Cheapest by the sheet and dearest by the hour once it is taped. It cracks at '
      + 'every joint in anything that flexes.' },
  none:    { label: 'Nothing yet', psf: 0, usd: 0, hr: 0, R: 0, shear: 0, maxStud: 0, mat: null,
    note: 'Framing left open.' },
};

/* What the outside of the wall is built of, behind the skin. Nothing is
   priced here: girts are lumber and the lumber path already buys them, and
   sheathing is priced as the sheet it is, below. Double-counting a girt was
   the first thing this table got wrong. */
const WALLSKIN = {
  girts:     { label: 'Girts, no exterior sheathing', psf: 0, usd: 0, hr: 0, R: 0,
    sheet: null, nailable: 0,
    note: 'Cheapest and lightest, and it gives the wall no exterior shear at all — so '
      + 'whatever is on the inside face has to do all of it, and cannot be thinned.' },
  sheathing: { label: 'Exterior sheathing', psf: 0, usd: 0, hr: 0, R: 0,
    sheet: 'osb716', nailable: 0.4375,
    note: 'Adds shear on the outside face and a nailable surface for anything coursed — '
      + 'which is what cedar and the stamped profiles need.' },
};

/* Structural sheet, wherever it is used: exterior sheathing, roof deck,
   subfloor. Shear is only claimable where it is fastened as a shear panel. */
const SHEATHING = {
  osb716:  { label: '⁷⁄₁₆" OSB sheathing', psf: 1.40, usd: 0.55, hr: 2.0, R: 0.55,
    shear: 240, maxStud: 24, mat: 'osb', nail: 0.4375,
    note: 'The commodity floor. Nothing structural is cheaper per square foot.' },
  ply1532: { label: '¹⁵⁄₃₂" plywood sheathing', psf: 1.42, usd: 1.20, hr: 2.0, R: 0.59,
    shear: 280, maxStud: 24, mat: 'plywood', nail: 0.46875,
    note: 'Same weight, more shear, holds a screw better and does not swell at a cut edge.' },
  ply38:   { label: '⅜" plywood sheathing', psf: 1.10, usd: 1.00, hr: 2.0, R: 0.47,
    shear: 220, maxStud: 16, mat: 'plywood', nail: 0.375,
    note: 'Rated at 16" o.c. framing, so it costs in studs what it saves in sheet.' },
  ply34:   { label: '¾" plywood deck', psf: 2.30, usd: 1.85, hr: 2.2, R: 0.93,
    shear: 340, maxStud: 24, mat: 'plywood', nail: 0.75,
    note: 'Subfloor and loft deck weight. Over joists at 16" o.c. ⅝" would do.' },
  none:    { label: 'None — girts only', psf: 0, usd: 0, hr: 0, R: 0,
    shear: 0, maxStud: 0, mat: null, nail: 0,
    note: 'No exterior sheathing. Lightest and cheapest, and it leaves the outside face '
      + 'with no shear and nothing to nail a coursed siding to.' },
};

/* Stud material. Steel is 10–25% lighter than a 2x4 at the same capacity —
   much less than people expect — and the wall does better than the studs
   suggest, because track beats a doubled top plate and hat channel beats a
   2x4 girt. What kills it in a heated building is the last column. */
const STUDMAT = {
  wood:  { label: 'Wood', usdFt: 0.65, hr: 4.5, mat: 'fir',
    /* Fraction of the cavity R that survives the framing, at 16"/24" o.c. */
    cavity: { 16: 0.80, 24: 0.87 },
    note: 'Dimensional lumber. The framing itself costs you 13–20% of the cavity R.' },
  steel: { label: 'Cold-formed steel', usdFt: 1.30, hr: 6.0, mat: 'steel',
    cavity: { 16: 0.46, 24: 0.55 },
    note: 'Straight, light and fireproof — and it conducts about 400× better than wood, '
      + 'so the studs short-circuit the batt. R-15 between steel studs at 24" o.c. nets '
      + 'about R-8. Fixing that needs continuous exterior foam, which costs back every '
      + 'pound you saved.' },
};

/* Cold-formed sections, against the 2x4 they replace. Weights are computed
   from the developed width so an odd gauge still reports honestly. */
const CFS = {
  '350S162-33': { label: '3½" × 20 ga', web: 3.5, flange: 1.625, lip: 0.5, mil: 33 },
  '350S162-43': { label: '3½" × 18 ga', web: 3.5, flange: 1.625, lip: 0.5, mil: 43 },
  '600S162-33': { label: '6" × 20 ga',  web: 6.0, flange: 1.625, lip: 0.5, mil: 33 },
  '600S162-43': { label: '6" × 18 ga',  web: 6.0, flange: 1.625, lip: 0.5, mil: 43 },
};
for (const s of Object.values(CFS)) {
  s.t = s.mil / 1000;
  s.developed = s.web + 2 * s.flange + 2 * s.lip;
  s.area = s.developed * s.t;
  s.lbft = s.area * 12 * STEEL_DENSITY;
}

const ASSEMBLY = {
  roofing: ROOFING, siding: SIDING, interior: INTERIOR,
  wallSkin: WALLSKIN, sheathing: SHEATHING, studMaterial: STUDMAT,
};

/* Dimensional lumber, dollars per lineal foot of purchased stock. Boards
   cost more per foot than studs do, which is most of why 1x framing is a bad
   trade — it saves a quarter of the wood and spends more money on it. */
const LUMBER_USD = {
  '1x3': 0.70, '1x4': 0.85, '1x6': 1.30,
  '2x4': 0.65, '2x6': 1.00, '2x8': 1.45, '2x10': 2.00, '2x12': 2.70,
  '4x4': 2.20, '4x6': 3.60, '6x6': 5.60,
};
const CONCRETE_USD = 185;        // per cubic yard delivered, short-load fees not counted

/* What this does NOT price, said once so the totals are not mistaken for an
   estimate. The Costs panel repeats it and so does the README. */
const NOT_COSTED = ['fasteners, trim, flashing and sealant', 'windows and doors',
  'the trailer or the foundation', 'electrical, plumbing and mechanical',
  'insulation', 'interior fit-out, cabinets and appliances',
  'tools, delivery, permits and waste'];

/* ---- prices you can override ----
   Keyed `group.option`, e.g. `siding.alum`. The shell keeps the overrides in
   state.prices and the share code carries only the ones that differ, so a
   layout from somebody who never opened the Costs panel is the length it
   always was. */
function priceKey(group, id) { return `${group}.${id}`; }
function basePrice(group, id) {
  const row = ASSEMBLY[group] && ASSEMBLY[group][id];
  if (!row) return 0;
  return row.usd != null ? row.usd : (row.usdFt || 0);
}
function priceOf(group, id, prices) {
  const over = prices && prices[priceKey(group, id)];
  return over != null && isFinite(over) ? over : basePrice(group, id);
}
/* Only what somebody actually changed, and only if it is a real number that
   differs from the shipped figure. */
function packPrices(prices) {
  if (!prices) return null;
  const out = {};
  for (const [k, v] of Object.entries(prices)) {
    const [g, id] = k.split('.');
    if (!ASSEMBLY[g] || !ASSEMBLY[g][id]) continue;
    if (!isFinite(v) || v < 0) continue;
    if (Math.abs(v - basePrice(g, id)) < 0.005) continue;
    out[k] = Math.round(v * 100) / 100;
  }
  return Object.keys(out).length ? out : null;
}
function unpackPrices(x) {
  const out = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x)) {
    const [g, id] = k.split('.');
    if (ASSEMBLY[g] && ASSEMBLY[g][id] && isFinite(v) && v >= 0) out[k] = Number(v);
  }
  return out;
}

/* A row, with its price resolved and a flag saying whether that price is the
   shipped one or somebody's own quote. Everything that reads the catalog goes
   through here so nothing gets the default by accident. */
function assembly(group, id, prices) {
  const row = (ASSEMBLY[group] || {})[id];
  if (!row) return null;
  const usd = priceOf(group, id, prices);
  return { ...row, id, group, usd, quoted: Math.abs(usd - basePrice(group, id)) >= 0.005 };
}
/* Every option in a group, as `[value, label]` pairs for a dropdown. */
function assemblyOpts(group) {
  return Object.entries(ASSEMBLY[group] || {}).map(([k, v]) => [k, v.label]);
}

/* Which structural sheet a wall is sheathed with, or 'none'. Two controls
   can say no sheathing — the wall system set to girts, or the sheet set to
   none — and they have to agree, so girts wins and the Exterior sheet
   control reads honestly instead of naming a sheet that is not there. */
function wallSheet(spec) {
  if (spec && spec.wallSkin === 'girts') return 'none';
  const id = spec && spec.sheathingPanel;
  return ASSEMBLY.sheathing[id] ? id : 'osb716';
}
function isSheathed(spec) { return wallSheet(spec) !== 'none'; }

/* ---- what will not go together ----
   Every building can pick any row out of the catalog, and some of those
   picks do not build. Cedar cannot be nailed to a girt; a flat panel drums
   and oil-cans without something continuous behind it; a lapped roof panel
   leaks below 3/12. The tool is no use if it lets you compare a wall that
   cannot exist against one that can, so it says so.

   `ctx` is the little the building has to hand over: its roof pitch and how
   far apart the girts are. Whether the wall is sheathed is not among them —
   that follows from the spec, and asking the caller was how a check ended up
   claiming a girt wall was sheathed. */
function assemblyReview(spec, ctx) {
  const out = [];
  const add = (level, title, body) => out.push({ level, title, body });
  const sd = assembly('siding', spec.siding);
  const rf = assembly('roofing', spec.roofing);
  const sheet = assembly('sheathing', wallSheet(spec));
  const behind = sheet ? (sheet.nail || 0) : 0;
  const sheathed = behind > 0;

  if (sd) {
    /* Something coursed or flat, with nothing continuous to fasten to. */
    if (sd.nailable > 0 && behind < sd.nailable) {
      add('crit', `${sd.label} has nothing to fasten to`,
        `It needs at least ${fmtIn(sd.nailable)} of nailable sheathing behind it and the wall `
        + (sheathed ? `is sheathed in ${sheet.label}.`
          : 'has no exterior sheathing at all.')
        + ' Sheathe the wall, or fur it out horizontally at the exposure — which is girts by '
        + 'another name, so it buys back the weight the thinner skin saved.');
    } else if (sd.spans && ctx.girtSpacing > sd.spans && !sheathed) {
      add('warn', `${sd.label} is spanning further than it wants to`,
        `Rated across ${fmtIn(sd.spans)} and the girts are at ${fmtIn(ctx.girtSpacing)}. It will `
        + 'oil-can between them, and in a gust it drums. Close the girts up or go a gauge heavier.');
    }
    if (/alum/i.test(sd.id)) {
      add('info', 'Aluminium against steel is a battery',
        'Aluminium siding fastened with plated steel screws, or run down onto a steel frame, '
        + 'corrodes at every contact. Aluminium or stainless fasteners with EPDM washers, and an '
        + 'isolation membrane wherever the panel meets steel or treated lumber. It also moves '
        + 'about twice as much as steel with temperature — half an inch over 34 feet through a '
        + '100°F swing — so the holes want slotting.');
    }
  }

  if (rf && ctx.pitch != null) {
    if (ctx.pitch < rf.minPitch - 0.001) {
      add('crit', `${rf.label} is not rated at ${fmtN(ctx.pitch, 1)}/12`,
        `It wants ${fmtN(rf.minPitch, 2)}/12 or steeper. Below that it is not a question of `
        + 'warranty — water stands in the laps and finds its way back up them.');
    } else if (rf.seam === 'mech' && ctx.pitch < 3) {
      add('info', 'That roof has to be mechanically seamed, not snapped',
        `At ${fmtN(ctx.pitch, 1)}/12 a snap-lock profile is out — most are rated to 3/12. Double-lock `
        + 'mechanical seam with sealant in the seam is what works down here, which means a seaming '
        + 'machine on site and a price nearer the top of the range than the bottom.');
    }
  }

  const sm = assembly('studMaterial', spec.studMaterial || 'wood');
  if (sm && sm.id === 'steel') {
    add('warn', 'Steel studs halve the wall insulation',
      sm.note + ' The weight and the cost are on the Compare tab; this is the part that is not '
      + 'on it.');
  }
  return out;
}

/* What the wall's inside face is allowed to be counted for, in shear. This
   is the function the racking checks were missing: they used a fixed OSB
   allowable no matter what was selected, so a ¼" lining — which is not a
   shear panel at all — reported the capacity of ⁷⁄₁₆" OSB.

   Returns the allowable and why it is what it is, because "0" on its own in
   a review note is not an explanation. */
function panelShear(group, id, studSpacing) {
  const a = assembly(group, id);
  if (!a) return { plf: 0, why: 'nothing selected' };
  if (!a.shear) return { plf: 0, why: `${a.label} is not a rated shear panel` };
  if (studSpacing && a.maxStud && studSpacing > a.maxStud + 0.001) {
    return { plf: 0, spaced: true, maxStud: a.maxStud,
      why: `${a.label} is rated to ${a.maxStud}" o.c. framing, and the studs are `
        + `at ${studSpacing}"` };
  }
  return { plf: a.shear, why: `${a.label}, blocked, 8d at 6" o.c. edges` };
}
