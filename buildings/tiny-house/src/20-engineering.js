/* ============================================================
   Loads, member sizing, and the weight sums that actually govern a house
   on a trailer. Preliminary sizing for an owner-built structure, not a
   stamped design — and the trailer itself is taken as given, not checked.
   ============================================================ */

/* ---- geometry helpers ---------------------------------------------------- */

/* The clear run of a wall between the corners. North and south run the length
   of the trailer; the gable ends run its width. */
function wallRun(wall, spec) {
  return WALLS[wall].axis === 'x' ? spec.length : spec.width;
}
function openingsOn(wall, openings) {
  return openings.filter((o) => o.wall === wall).sort((a, b) => a.off - b.off);
}

/* Roof height above the top of the frame at a given position across the
   trailer. The ridge runs the length at mid-width, so this is a tent. */
function roofY(z, spec) {
  const half = spec.width / 2;
  return spec.wallHeight + spec.ridgeRise * (1 - Math.abs(z - half) / half);
}
function roofPitch(spec) {
  return (spec.ridgeRise / (spec.width / 2)) * 12;    // rise in twelve
}

/* ---- loads --------------------------------------------------------------- */

/* A nearly flat roof sheds nothing, so the snow sits where it lands: ASCE 7
   flat-roof snow with the exposure and thermal factors a heated, sheltered
   little building earns, and no slope reduction at all below 15°. */
function roofLoads(spec) {
  const pf = 0.7 * 0.9 * 1.1 * 1.0 * spec.groundSnow;
  const snow = Math.max(pf, 20);                      // minimum roof live load
  const deadPsf = (spec.roofing === 'standing' ? 1.6 : spec.roofing === 'metal' ? 1.2 : 2.8)
    + (spec.sheathing ? 1.5 : 0) + 3.0                // framing
    + (spec.ceilingInsulation ? 1.2 : 0) + 1.0;       // insulation and interior face
  return { snow, dead: deadPsf, total: snow + deadPsf, pf };
}

/* Rafters span the full 12 feet from wall to ridge — there is no interior
   bearing line in a house this narrow, so the ridge is a beam, not a board. */
function rafterDesign(spec) {
  const L = roofLoads(spec);
  const runInches = spec.width / 2 + spec.eaveOverhang;
  const slope = Math.hypot(spec.width / 2, spec.ridgeRise) / (spec.width / 2);
  const wPlf = L.total * (spec.studSpacing / 12);    // psf across the tributary width
  const span = runInches * slope;
  const pick = pickMember(span, wPlf, RAFTER_LADDER, 240, true)
    || { label: 'nothing on the ladder carries it', size: '2x12', over: true, ratio: Infinity, defl: 0 };
  return { ...pick, span, load: L, spacing: spec.studSpacing };
}

/* The ridge carries half of each rafter over whatever it can be posted at.
   With lofts at both ends there are natural places to land a post, so the
   worst span is the clear run between them. */
function ridgeDesign(spec) {
  const L = roofLoads(spec);
  const clear = spec.length - spec.eastLoft - spec.westLoft;
  const wPlf = L.total * (spec.width / 2 / 12);      // half a roof either side
  const pick = pickMember(clear, wPlf, HEADER_LADDER, 240)
    || { label: 'nothing on the ladder carries it', size: '2x12', plies: 3, over: true, ratio: Infinity };
  return { ...pick, n: pick.plies || 3, span: clear, load: L };
}

/* Loft joists run across the trailer, so they span the full width. A sleeping
   loft is 30 psf live in the IRC; a library is 40 and worth designing for,
   since it is what the west loft is called on the sketch. */
function loftDesign(spec) {
  const live = 40, dead = 10;
  const wPlf = (live + dead) * (16 / 12);
  const pick = pickMember(spec.width, wPlf, RAFTER_LADDER, 360, true)
    || { label: 'nothing on the ladder carries it', size: '2x12', over: true, ratio: Infinity };
  return { ...pick, span: spec.width, live, dead };
}

/* Headers over the openings. Only the north and south walls carry roof load —
   the gable ends carry their own sheathing and nothing else. */
function sizeHeader(o, spec) {
  const st = stockFor(o);
  const ro = roughOf(o);
  const bearing = WALLS[o.wall].axis === 'x';
  if (!bearing) {
    return { label: `(2) ${spec.studSize}`, size: spec.studSize, n: 2, span: ro.w, nonbearing: true };
  }
  const L = roofLoads(spec);
  const wPlf = L.total * (spec.width / 2 / 12);
  const pick = pickMember(ro.w, wPlf, HEADER_LADDER, 240)
    || { label: 'nothing on the ladder carries it', size: '2x12', plies: 3, over: true, ratio: Infinity };
  return { ...pick, n: pick.plies || 2, span: ro.w };
}

/* ---- framing layout ------------------------------------------------------ */

/* The unbroken pieces of a wall, in order, with the openings cut out. Used
   for the framing and for the check that nothing has been slid off the end. */
function solidSegments(wall, spec, openings) {
  const run = wallRun(wall, spec);
  const cuts = openingsOn(wall, openings).map((o) => {
    const ro = roughOf(o);
    return [o.off - 1.5, o.off + ro.w + 1.5];         // king studs eat the edges
  });
  const segs = [];
  let at = 0;
  for (const [a, b] of cuts.sort((p, q) => p[0] - q[0])) {
    if (a > at) segs.push([at, Math.min(a, run)]);
    at = Math.max(at, b);
  }
  if (at < run) segs.push([at, run]);
  return segs.filter(([a, b]) => b - a > 0.01);
}

/* Horizontal girts on the outside face, carrying the metal. Each course is
   broken into the runs that miss the openings, so a girt never crosses a
   hole — and the runs move when the openings do. */
function girtRuns(wall, spec, openings) {
  const run = wallRun(wall, spec);
  const g = LUMBER[spec.girtSize].t;
  const out = [];
  const gable = WALLS[wall].gable;
  for (let y = spec.subfloor + spec.girtSpacing; y < spec.wallHeight - 3; y += spec.girtSpacing) {
    if (gable && y > roofY(0, spec) - 3) break;
    const blocked = openingsOn(wall, openings)
      .filter((o) => { const ro = roughOf(o); return o.head > y && o.head - ro.h < y + g; })
      .map((o) => [o.off - 1.5, o.off + roughOf(o).w + 1.5])
      .sort((a, b) => a[0] - b[0]);
    let at = 0;
    for (const [a, b] of blocked) {
      if (a > at) out.push({ y, u0: at, u1: Math.min(a, run) });
      at = Math.max(at, b);
    }
    if (at < run) out.push({ y, u0: at, u1: run });
  }
  return out.filter((r) => r.u1 - r.u0 > 3);
}

/* Cross joists in the trailer, skipping the run the wheel wells occupy. */
function joistRuns(spec) {
  const wellW = spec.length - spec.wheelWellStart - spec.wheelWellLength;
  const wellE = spec.length - spec.wheelWellStart;
  const out = [];
  for (let x = spec.joistSpacing; x < spec.length - 1; x += spec.joistSpacing) {
    out.push({ x, throughWell: x > wellW && x < wellE });
  }
  return out;
}

/* ---- weight -------------------------------------------------------------- */

/* Where the axles would have to sit to put a given share of the weight on
   the hitch. Nothing here constrains the design — no axles are under it and
   it is not going anywhere soon — but the numbers decide whether it ever
   can move, so they are worth carrying along.

   Statics with two supports: the hitch at x_h and the axle group at x_a,
   the whole weight acting at x_c. Moments about the axle give the tongue
   weight directly. */
function axleCheck(spec, weight, target) {
  const frac = target == null ? 0.125 : target;
  const west = spec.tongueEnd !== 'east';
  const xh = west ? -spec.tongueOverhang : spec.length + spec.tongueOverhang;
  const xc = weight.cg[0];
  const xa = (xc - frac * xh) / (1 - frac);
  const sketchAxle = spec.length - spec.wheelWellStart - spec.wheelWellLength / 2;
  const tongueAt = (x) => weight.total * (xc - x) / (xh - x);
  const fromTongue = (x) => (west ? x : spec.length - x);
  return {
    west,
    hitch: xh,
    cg: xc,
    wanted: xa,                                       // where the axles want to be
    sketchAxle,                                       // where the sketch puts them
    tongueAtSketch: tongueAt(sketchAxle),
    fracAtSketch: tongueAt(sketchAxle) / weight.total,
    target: frac,
    onAxles: weight.total - tongueAt(sketchAxle),
    fromTongue,
    end: west ? 'west' : 'east',
    farEnd: west ? 'east' : 'west',
  };
}

/* What you would have to buy. Trailer axles come in round numbers, and a
   tandem pair has to carry everything the hitch does not. */
const AXLE_RATINGS = [3500, 5200, 6000, 7000, 8000, 10000, 12000];
function axleSizing(onAxles, pairs) {
  const per = onAxles / (pairs || 2);
  const rating = AXLE_RATINGS.find((r) => r >= per * 1.1) || AXLE_RATINGS[AXLE_RATINGS.length - 1];
  return { per, rating, short: per * 1.1 > AXLE_RATINGS[AXLE_RATINGS.length - 1] };
}

/* ---- ventilation and audit ----------------------------------------------- */

function auditBuilding(spec, openings) {
  const out = [];
  const add = (level, title, body) => out.push({ level, title, body });

  /* Openings that have wandered off the wall, or into each other. */
  for (const o of openings) {
    const st = stockFor(o);
    const ro = roughOf(o);
    const run = wallRun(o.wall, spec);
    const name = `${WALLS[o.wall].label} ${st.label}`;
    if (o.off < 0 || o.off + ro.w > run) {
      add('crit', `${name} runs off the wall`,
        `The rough opening reaches ${fmtIn(o.off + ro.w)} along a wall that is ${fmtFt(run)} long.`);
    }
    if (o.head > spec.wallHeight - 3) {
      add('crit', `${name} has no room for a header`,
        `Head at ${fmtIn(o.head)} leaves ${fmtIn(spec.wallHeight - o.head)} to the top plate. `
        + 'A header and its top plate want three inches at the very least.');
    }
    if (o.head - ro.h < 0) {
      add('crit', `${name} runs below the floor`,
        `Sill would sit ${fmtIn(ro.h - o.head)} under the subfloor.`);
    }
    /* On a gable end the wall is not full height everywhere. */
    if (WALLS[o.wall].gable) {
      const yl = roofY(o.off, spec), yr = roofY(o.off + ro.w, spec);
      if (o.head > Math.min(yl, yr) - 3) {
        add('crit', `${name} runs into the roof`,
          `Head at ${fmtIn(o.head)}; the rafter is down to ${fmtIn(Math.min(yl, yr))} at that end of the opening.`);
      }
    }
  }
  for (const wall of ['N', 'S', 'E', 'W']) {
    const ops = openingsOn(wall, openings);
    for (let i = 1; i < ops.length; i++) {
      const a = ops[i - 1], b = ops[i];
      const ra = roughOf(a), rb = roughOf(b);
      const overlapX = a.off + ra.w + 3 > b.off;
      const overlapY = !(a.head - ra.h > b.head + 3 || b.head - rb.h > a.head + 3);
      if (overlapX && overlapY) {
        add('crit', `${WALLS[wall].label}: two openings collide`,
          `${stockFor(a).label} and ${stockFor(b).label} overlap. They need three inches between the rough `
          + 'openings for a pair of king studs, or they become one opening with one header.');
      }
    }
  }

  /* Windows nobody has measured yet. */
  const guessed = openings.map(stockFor).filter((s) => s.measured === false);
  if (guessed.length) {
    add('warn', `${guessed.length} window${guessed.length > 1 ? 's are' : ' is'} not measured`,
      `${guessed.map((s) => s.label.replace(/ .*/, '')).join(', ')} — the spreadsheet gives no size for `
      + 'these, so the model is using dimensions scaled off the sketch. Every framing number that '
      + 'depends on them is provisional.');
  }
  const spare = WINDOW_STOCK.filter((s) => !openings.some((o) => o.stock === s.id));
  if (spare.length) {
    add('info', `${spare.length} window${spare.length > 1 ? 's' : ''} still on the shelf`,
      spare.map((s) => `${s.label} (${fmtIn(s.w)} × ${fmtIn(s.h)})`).join(' · '));
  }

  /* The roof. Nine inches of rise over twelve feet is flatter than most
     coverings will take. */
  const pitch = roofPitch(spec);
  if (pitch < 3 && spec.roofing === 'metal') {
    add('crit', `${pitch.toFixed(1)}/12 is too flat for lapped metal panel`,
      'Exposed-fastener corrugated panel wants 3/12, and 1/12 at the very best with sealed laps. '
      + 'At this pitch the roof has to be mechanically seamed standing seam or a single-ply membrane.');
  } else if (pitch < 2 && spec.roofing === 'comp') {
    add('crit', `${pitch.toFixed(1)}/12 is too flat for shingles`,
      'Asphalt shingles stop at 2/12 with a doubled underlayment, and are a bad idea anywhere near it.');
  } else if (pitch < 3) {
    add('info', `Roof is ${pitch.toFixed(1)}/12`,
      'Mechanically seamed standing seam is rated to ¼:12, so the covering is fine. Everything else — '
      + 'penetrations, the ridge, the eave edge — wants detailing as though it were a flat roof.');
  }

  /* The road height envelope. This is the constraint the ridge is pinned by,
     and the rafter depth spends it as surely as the wall does. */
  {
    const h = heightCheck(spec);
    const hr = headroom(spec);
    if (h.over > 0.01) {
      add('crit', `${fmtIn(h.over)} over the ${fmtFt(h.envelope)} road height`,
        `${fmtIn(h.deck)} of deck, ${fmtFt(h.wall)} of wall, ${fmtIn(h.rise)} of ridge and `
        + `${fmtIn(h.roofBuild)} of roof build-up (${fmtIn(h.rafterDepth)} of that is the rafter) `
        + `comes to ${fmtIn(h.total)}. The tallest side wall that fits is ${fmtIn(h.maxWall)}.`);
    } else {
      add('info', `${fmtIn(-h.over)} of road height left`,
        `${fmtIn(h.total)} from the road to the ridge cap, against ${fmtFt(h.envelope)}. `
        + `A deeper rafter comes straight out of this — every inch of it costs an inch of wall.`);
    }
    add('info', `${fmtIn(hr.under)} of headroom under the loft`,
      `And ${fmtIn(hr.atRidge)} in the loft at the ridge, ${fmtIn(hr.atWall)} at the wall. `
      + 'Dropping the side walls buys road height and costs both of these — which is the trade '
      + 'the stair to the main loft has to live inside.');
  }

  /* The frame. Repurposed travel-trailer beams were sized for a travel
     trailer, and this is not one. */
  {
    const model0 = buildModel(spec, openings);
    const w0 = takeoff(model0, spec).weight;
    const fr = frameCheck(spec, w0);
    if (fr.towedRatio > 1) {
      add('crit', `The frame is ${fr.towedRatio.toFixed(1)}× short in bending to tow this`,
        `Two ${fr.rail.label} rails and two ${fr.beam.label} beams give about `
        + `${fmtN(fr.capacity / 1000, 1)} kip-ft. Towed, with ${fmtN(fr.overhang, 1)} ft hanging past the `
        + `axles, the shell alone wants ${fmtN(fr.towed / 1000, 1)} kip-ft, and a finished house `
        + `close to double. Those beams came off a travel trailer and are sized for one.`);
      add('info', `Standing still it is fine — block it every ${fmtN(Math.floor(fr.maxCribbing), 0)} ft or closer`,
        `Parked, the frame only spans between whatever it is cribbed on, so the demand is a choice. `
        + `At ${fmtN(fr.plf, 0)} lb a foot the frame runs out at ${fmtN(fr.maxCribbing, 1)} ft between `
        + `supports on the shell weight, and roughly ${fmtN(fr.maxCribbing / Math.sqrt(1.9), 1)} ft finished. `
        + 'Blocking it well is the whole answer, and it is the cheap answer. A flatbed move works for '
        + 'the same reason — the deck supports the frame the whole way.');
    }
  }

  /* Slender studs. */
  {
    const st = studCheck(spec);
    if (st.ratio > 1) {
      add('crit', `${spec.studSize} studs are over capacity at ${(st.ratio * 100).toFixed(0)}%`,
        `${fmtIn(st.len)} long at ${fmtIn(spec.studSpacing)} o.c. carries ${fmtN(st.demand, 0)} lb `
        + `against ${fmtN(st.allow, 0)} lb allowable.`);
    } else {
      add('info', `${spec.studSize} studs run at ${(st.ratio * 100).toFixed(0)}% of allowable`,
        `${fmtIn(st.len)} long, l/d of ${st.slenderness.toFixed(0)}, stability factor ${st.CP.toFixed(2)}. `
        + `${fmtN(st.demand, 0)} lb a stud against ${fmtN(st.allow, 0)} lb. `
        + (st.braced
          ? 'That only works because both faces are attached — girts outside and sheathing inside '
            + 'brace the thin way continuously. Before the skin goes on, this wall is very floppy.'
          : 'With neither face attached the thin way is unbraced, and it does not work at all.'));
    }
    if (st.overPrescriptive) {
      add('warn', `${fmtIn(st.len)} is past the prescriptive tables`,
        `The IRC stops at ten feet for a ${spec.studSize} bearing wall. The numbers above say it works, `
        + 'but nothing about this wall is a look-up any more.');
    }
  }

  /* Wall height against what you can buy. */
  const stud = spec.wallHeight - spec.subfloor - 1.5 - 3.0;
  const stock = STOCK_LENGTHS.find((s) => s >= stud);
  if (stock) {
    add('info', `Studs are ${fmtIn(stud)}`,
      `Cut from ${fmtFt(stock)} stock, which leaves ${fmtIn(stock - stud)} of drop on every one. `
      + `A ${fmtFt(spec.wallHeight)} wall is past the length anyone stocks pre-cut.`);
  } else {
    add('crit', `Studs are ${fmtIn(stud)} — longer than stock`,
      'The wall is taller than the longest stick on the rack; it needs a splice or a different framing plan.');
  }

  /* Weight. This is the number that decides whether it can ever move. */
  const model = buildModel(spec, openings);
  const tk = takeoff(model, spec);
  const w = tk.weight;
  const ax = axleCheck(spec, w);
  const sz = axleSizing(ax.onAxles, 2);
  add('info', `Shell weighs ${fmtN(Math.round(w.total / 10) * 10)} lb`,
    `Structure, skin and glazing only — no interior, no cabinets, no fixtures, no tanks, nobody in it. `
    + `Finished and lived in, expect roughly double. Centre of gravity ${fmtFt(w.cg[0])} from the west end `
    + `and ${fmtIn(Math.abs(w.cg[2] - spec.width / 2))} ${w.cg[2] < spec.width / 2 ? 'north' : 'south'} of centreline.`);

  if (ax.fracAtSketch < 0.08 || ax.fracAtSketch > 0.18) {
    add('warn', `Tongue weight would be ${(ax.fracAtSketch * 100).toFixed(0)}% where the sketch puts the axles`,
      `Ten to fifteen per cent is the window a trailer tows straight in. Moving the axle group to `
      + `${fmtFt(ax.fromTongue(ax.wanted))} from the ${ax.end} end would put it at ${(ax.target * 100).toFixed(0)}%. `
      + 'None of this binds anything today — the axles are not bought and the house is not moving.');
  }
  if (sz.short) {
    add('warn', 'Past what a tandem pair will carry',
      `${fmtN(Math.round(sz.per))} lb an axle on the shell alone. This wants three axles, or a flatbed.`);
  }

  add('info', `${fmtFt(spec.width)} wide is an oversize move`,
    'Eight foot six is the widest that travels without a permit. At twelve feet this is a permitted, '
    + 'pilot-car, daylight-hours move whatever the axles under it turn out to be — which is an argument '
    + 'for designing it as a building and solving the move later.');

  return out;
}

/* ---- the height envelope ------------------------------------------------- */

/* Fourteen feet is what travels under a bridge, and everything between the
   road and the highest thing on the roof counts against it. The rafter depth
   is part of that, so a deeper rafter costs wall height — which makes this
   the constraint that ties the roof to the loft headroom. */
function heightCheck(spec) {
  const rd = rafterDesign(spec);
  const rafterDepth = (LUMBER[rd.size] || LUMBER['2x8']).d;
  const roofBuild = rafterDepth + (spec.roofDeck ? 0.4375 : 0)
    + (spec.roofing === 'comp' ? 0.75 : 0.5);
  const ridge = spec.wallHeight + spec.ridgeRise;
  const total = spec.deckHeight + ridge + roofBuild;
  return {
    deck: spec.deckHeight, wall: spec.wallHeight, rise: spec.ridgeRise,
    rafterDepth, roofBuild, ridge, total,
    envelope: spec.roadEnvelope,
    over: total - spec.roadEnvelope,
    /* The tallest side wall that still fits, everything else unchanged. */
    maxWall: spec.roadEnvelope - spec.deckHeight - spec.ridgeRise - roofBuild,
  };
}

/* Headroom under the loft, and in it. Both are what the wall height is
   actually being spent on. */
function headroom(spec) {
  const lj = LUMBER[spec.loftJoist] || LUMBER['2x8'];
  const rd = rafterDesign(spec);
  const rafterDepth = (LUMBER[rd.size] || LUMBER['2x8']).d;
  const under = spec.loftHeight - spec.subfloor - lj.d - 0.75;
  const atRidge = spec.wallHeight + spec.ridgeRise - rafterDepth - spec.loftHeight;
  const atWall = spec.wallHeight - rafterDepth - spec.loftHeight;
  return { under, atRidge, atWall, joist: lj.d };
}

/* ---- the frame ----------------------------------------------------------- */

/* What the trailer will carry in bending. Two perimeter rails and two beams
   act together about the same axis; the cross joists do not, since they run
   the other way.

   The steel is allowed 0.6 Fy, and the salvaged beams are taken at 36 ksi
   because nobody can now look up what they were. */
function frameSection(spec) {
  const rail = STEEL[spec.railSection], beam = STEEL[spec.beamSection];
  const Sx = 2 * rail.Sx + 2 * beam.Sx;
  const capacity = (2 * rail.Sx * 0.6 * rail.Fy + 2 * beam.Sx * 0.6 * beam.Fy) * 1000 / 12;
  return { Sx, capacity, rail, beam };   // capacity in lb-ft
}

/* Two conditions, and they are nothing like each other.

   Towed, the frame is a beam between the hitch and the axle group, with
   everything past the axles hanging off the end — and that overhang is
   where the moment lives.

   Parked, it is a beam over whatever it is blocked on, so the demand is set
   by how far apart the cribbing is. That is a choice, which makes it the
   answer rather than the problem. */
function frameCheck(spec, weight) {
  const sec = frameSection(spec);
  const w = weight.total / (spec.length / 12);          // plf, spread over the deck
  const ax = axleCheck(spec, weight);
  const axleFt = ax.fromTongue(ax.sketchAxle) / 12;
  const overhang = spec.length / 12 - axleFt;
  const towed = w * overhang * overhang / 2;
  const spacingFor = (M) => Math.sqrt(8 * M / w);       // simple span, wL²/8
  return {
    ...sec,
    plf: w,
    towed,
    towedRatio: towed / sec.capacity,
    overhang,
    maxCribbing: spacingFor(sec.capacity),
    cribbing: [4, 6, 8, 10, 12].map((ft) => ({ ft, M: w * ft * ft / 8, ok: w * ft * ft / 8 <= sec.capacity })),
  };
}

/* ---- the studs ----------------------------------------------------------- */

/* A 2x4 nearly eleven feet long is a slender column. It only works because
   both faces are attached — girts outside, sheathing inside — which braces
   the weak axis continuously and leaves the 3½" dimension to buckle about.
   NDS column stability, with the snow duration factor. */
function studCheck(spec) {
  const sec = LUMBER[spec.studSize];
  const len = spec.wallHeight - spec.subfloor - 1.5 - 3.0;
  const braced = spec.wallSkin === 'girts' || spec.interiorFinish !== 'none';
  const d = braced ? sec.d : sec.t;                     // unbraced weak axis if neither face is on
  const le = len / d;
  const Fc = 1350, Emin = 580000;
  const Fstar = Fc * 1.15 * (spec.studSize === '2x4' ? 1.15 : 1.1);
  const FcE = 0.822 * Emin / (le * le);
  const c = 0.8, F = FcE / Fstar;
  const q = (1 + F) / (2 * c);
  const CP = q - Math.sqrt(Math.max(0, q * q - F / c));
  const cap = Fstar * CP * sec.t * sec.d;

  const L = roofLoads(spec);
  const trib = spec.width / 2 / 12 * (spec.studSpacing / 12);
  const roof = L.total * trib;
  const loft = 50 * trib;                               // where a loft lands on the wall
  const self = 90;
  return {
    len, slenderness: le, braced, CP, allow: cap,
    roof, loft, self, demand: roof + loft + self,
    ratio: (roof + loft + self) / cap,
    /* The IRC's prescriptive table stops at ten feet for a 2x4 bearing wall. */
    overPrescriptive: len > 120,
  };
}
