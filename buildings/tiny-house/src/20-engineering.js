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
  /* The tandem's equalizer pivot is what the frame actually bears on, and it
     sits half the tandem spacing ahead of the rear axle. */
  const axleGroup = spec.length - spec.rearAxleToEnd - spec.tandemSpacing / 2;
  const tongueAt = (x) => weight.total * (xc - x) / (xh - x);
  const fromTongue = (x) => (west ? x : spec.length - x);
  return {
    west,
    hitch: xh,
    cg: xc,
    wanted: xa,                                       // where the axles want to be
    axleGroup,                                        // where they are on the built frame
    tongueAtSketch: tongueAt(axleGroup),
    fracAtSketch: tongueAt(axleGroup) / weight.total,
    target: frac,
    onAxles: weight.total - tongueAt(axleGroup),
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
    const shell = frameCheck(spec, w0);
    const fin = frameCheck(spec, w0, 1.9);

    if (shell.strut && shell.strut.limited) {
      add('info', `The overhang tie is doing most of the work, and is the thing to make bigger`,
        `Without it, ${fmtN(shell.over, 0)} ft of overhang puts ${fmtN(shell.bare, 1)} kip-ft into a frame `
        + `that holds ${fmtN(shell.capacityKipFt, 1)}. The tie props it at `
        + `${fmtFt(spec.strutFrom)} from the end and brings that to ${fmtN(shell.M, 1)}. `
        + `But at ${(shell.strut.angle * 180 / Math.PI).toFixed(1)}° it can only deliver `
        + `${fmtN(shell.strut.canProp, 1)} kip of the ${fmtN(shell.strut.ideal, 1)} a rigid prop would take — `
        + `a triangle that shallow costs about ${(1 / Math.sin(shell.strut.angle)).toFixed(0)} lb of tension `
        + `for every pound of lift. Landing it ${fmtIn(shell.strut.wantRise)} above the deck instead of `
        + `${fmtIn(spec.wheelWellRise)}, or going to ${fmtN(shell.strut.wantArea, 2)} in² of tie, props it fully.`);
    }

    if (fin.ratio > 1) {
      /* Is there a tie on the shelf that closes it? */
      let fix = null;
      for (const k of Object.keys(STEEL)) {
        if (k === spec.strutSection || !/^tube/.test(k)) continue;
        const t = frameCheck({ ...spec, strutSection: k }, w0, 1.9);
        if (t.ratio <= 1 && (!fix || STEEL[k].area < STEEL[fix].area)) fix = k;
      }
      add('crit', `Finished, the frame is ${fin.ratio.toFixed(2)}× short to tow`,
        `${fmtN(fin.M, 1)} kip-ft over the rear axle against ${fmtN(fin.capacityKipFt, 1)} available, at an `
        + `estimated ${fmtN(Math.round(fin.W / 100) * 100, 0)} lb finished. `
        + `Static only — road loads are normally taken at one and a half to three times static, which this `
        + `does not include. Shell weight alone comes out at ${shell.ratio.toFixed(2)}×.`
        + (fix ? ` Swapping the overhang tie to ${STEEL[fix].label} brings it to `
          + `${frameCheck({ ...spec, strutSection: fix }, w0, 1.9).ratio.toFixed(2)}× — two pieces of tube, `
          + 'and the only member that has to change.' : ''));
    } else if (shell.ratio <= 1) {
      add('info', `The frame carries the towed overhang as built`,
        `${fmtN(shell.M, 1)} kip-ft against ${fmtN(shell.capacityKipFt, 1)}. Static only.`);
    }

    add('info', `Standing still it is fine — block it every ${fmtN(Math.floor(shell.maxCribbing), 0)} ft or closer`,
      `Parked, the frame only spans between whatever it is cribbed on, so the demand is a choice. `
      + `At ${fmtN(shell.plf, 0)} lb a foot it runs out at ${fmtN(shell.maxCribbing, 1)} ft between supports `
      + `on the shell weight and ${fmtN(fin.maxCribbing, 1)} ft finished. Blocking it well is the whole `
      + 'answer, and it is the cheap answer. A flatbed move works for the same reason — the deck supports '
      + 'the frame the whole way rather than hanging it off two points.');
  }

  /* Lateral. Racking first, then the two things a building bolted to a slab
     never has to answer for. */
  {
    const model0 = buildModel(spec, openings);
    const w0 = takeoff(model0, spec).weight;

    const worst = lateralCheck(spec, openings)
      .flatMap((d) => d.lines.map((l) => ({ ...l, dir: d.name })))
      .sort((a, b) => a.ratio - b.ratio)[0];
    if (worst.ratio < 1) {
      add('crit', `${WALLS[worst.wall].label} wall is short on racking at ${worst.ratio.toFixed(2)}×`,
        `${fmtN(worst.capacity, 0)} lb of capacity against ${fmtN(worst.demand, 0)} lb of demand. `
        + (worst.piers.length
          ? `It needs ${fmtIn(worst.required)} of full-height sheathing and has ${fmtIn(worst.braced)}.`
          : `Nothing on it is wide enough to count — the widest unbroken run is ${fmtIn(worst.widest)} `
            + `against the ${fmtIn(worst.minW)} a pier needs at this wall height. Only moving the `
            + 'openings fixes that.'));
    } else {
      add('info', `Racking clears everywhere, worst line ${worst.ratio.toFixed(2)}×`,
        `${WALLS[worst.wall].label} wall, ${worst.dir.toLowerCase()}. Sheathing the whole interior face `
        + 'rather than just the corners is what buys this — every full-height run between the openings '
        + 'is a shear pier.');
    }

    const st = stabilityCheck(spec, w0);
    const stf = stabilityCheck(spec, w0, 1.9);
    if (st.slideRatio < 1 || st.otRatio < 1.5) {
      add('warn', `Nothing holds it down but its own weight`,
        `Broadside, ${fmtN(st.force, 0)} lb of wind against ${fmtN(st.friction, 0)} lb of friction on the `
        + `cribbing — ${st.slideRatio.toFixed(2)}× on sliding and ${st.otRatio.toFixed(2)}× on overturning, `
        + `at shell weight. Finished those become ${stf.slideRatio.toFixed(2)}× and `
        + `${stf.otRatio.toFixed(2)}×. The shell on its blocks is the worst this ever is, and it is the `
        + 'state it will sit in longest. Ground anchors or a strap over the frame answer both.');
    }

    const up = upliftCheck(spec);
    if (up.netField > 0) {
      add('warn', `The roof lifts — ${fmtN(up.netCorner, 1)} psf net at the corners`,
        `A ${roofPitch(spec).toFixed(1)}/12 roof never gets pressed on, only pulled. Against `
        + `${fmtN(up.dead, 1)} psf of roof that leaves ${fmtN(up.netField, 1)} psf in the field and `
        + `${fmtN(up.netCorner, 1)} at the corners — ${fmtN(up.perRafter, 0)} lb on a rafter and `
        + `${fmtN(up.perRafterCorner, 0)} lb at the ends. Every rafter wants a tie to the plate, and the `
        + 'walls want a continuous path down to the steel. Toe-nails do not do this.');
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
    add('warn', `Tongue weight comes out at ${(ax.fracAtSketch * 100).toFixed(0)}% with the axles where they are`,
      `Ten to fifteen per cent is the window a trailer tows straight in. Moving the axle group to `
      + `${fmtFt(ax.fromTongue(ax.wanted))} from the ${ax.end} end would put it at ${(ax.target * 100).toFixed(0)}%. `
      + 'None of this binds anything today — the axles are not bought and the house is not moving.');
  }
  if (sz.short) {
    add('warn', 'Past what a tandem pair will carry',
      `${fmtN(Math.round(sz.per))} lb an axle on the shell alone. This wants three axles, or a flatbed.`);
  }

  add('info', `The wheel wells stand ${fmtIn(spec.wheelWellRise)} above the floor`,
    `${fmtFt(spec.wheelWellLength)} long and ${fmtIn(spec.wheelWellWidth)} wide against each side wall, `
    + `${fmtFt(spec.rearAxleToEnd)} to ${fmtFt(spec.rearAxleToEnd + spec.wheelWellLength)} from the east end. `
    + 'That is bench height, so they are furniture whether or not anyone plans them that way — and the '
    + 'tie that saves the overhang is bolted to the top of them, so they are not movable.');

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

   Towed, the frame is a beam between the hitch and the tandem, with
   everything past the rear axle hanging off the end. That overhang is where
   the moment lives, and it goes as the square of its length.

   The diagonal off the wheel-well arch changes that completely. It props the
   overhang partway out, turning one long cantilever into a short propped span
   with a short tip — but it can only prop as hard as its own geometry lets
   it. A tie eight feet long and eleven inches deep is a very shallow triangle,
   and every pound of upward prop force costs about nine pounds of tension in
   the tie.

   Parked, none of this applies: the frame only spans between whatever it is
   blocked on, so the demand is a choice rather than a problem. */
function frameCheck(spec, weight, factor) {
  const sec = frameSection(spec);
  const W = weight.total * (factor || 1);
  const Lft = spec.length / 12;
  const w = W / Lft / 1000;                            // kip per foot
  const over = spec.rearAxleToEnd / 12;                // rear axle to the free end
  const bare = w * over * over / 2;                    // kip-ft, no prop

  const out = {
    ...sec, W, plf: w * 1000, over, bare,
    bareRatio: bare / (sec.capacity / 1000),
    capacityKipFt: sec.capacity / 1000,
    maxCribbing: Math.sqrt(8 * (sec.capacity / 1000) / w),
    cribbing: [4, 6, 8, 10, 12].map((ft) => {
      const M = w * ft * ft / 8;
      return { ft, M, ok: M <= sec.capacity / 1000 };
    }),
  };

  if (!spec.strut) { out.M = bare; out.ratio = out.bareRatio; return out; }

  /* Propped cantilever of span Lp with a free tip of length a beyond it. */
  const a = spec.strutFrom / 12;
  const Lp = over - a;
  const tipM = w * a * a / 2;
  const ideal = 3 * w * Lp / 8 + w * a + 3 * tipM / (2 * Lp);   // prop force a rigid prop takes
  const propped = w * Lp * Lp / 8 + tipM / 2;                   // moment at the axle if it were rigid

  /* What the tie can actually deliver. The rise is the arch top above the
     rail's own centre, and the run is the axle to the landing point. */
  const st = STEEL[spec.strutSection];
  const rise = spec.wheelWellRise + spec.frameDepth / 2;
  const run = Lp * 12;
  const angle = Math.atan2(rise, run);
  const allowT = 0.6 * st.Fy * st.area;                         // kip
  const canProp = allowT * Math.sin(angle);
  const R = Math.min(canProp, ideal);
  const M = Math.max(propped, bare - R * Lp);

  /* And what it would take to prop it properly, two ways. */
  const needSin = Math.min(1, ideal / allowT);
  const wantRise = run * Math.tan(Math.asin(needSin)) - spec.frameDepth / 2;
  const wantArea = ideal / Math.sin(angle) / (0.6 * st.Fy);

  /* A tie that shallow is mostly horizontal, and all of that goes into the
     rail as compression between the arch and the landing point. Which is the
     next thing to bind, and the reason a bigger tie is not free. */
  const tension = R / Math.sin(angle);
  const thrust = tension * Math.cos(angle);
  const railStress = thrust / (2 * sec.rail.area);      // shared by both rails
  const railAllow = 0.6 * sec.rail.Fy;

  Object.assign(out, {
    strut: { a, Lp, angle, rise, run, allowT, canProp, ideal, R, tension, section: st,
      limited: canProp < ideal - 1e-6, wantRise, wantArea,
      thrust, railStress, railAllow, railRatio: railStress / railAllow },
    propped, M, ratio: M / (sec.capacity / 1000),
  });
  return out;
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

/* ---- lateral --------------------------------------------------------------
   A house on a trailer resists wind differently from a building on a slab,
   and the difference is not the racking. Racking here is easy: the interior
   face is 7/16" OSB over every wall, so every full-height run between the
   openings is a shear panel. What is not easy is that nothing holds the
   building down. It sits on cribbing under its own weight. */

/* ASCE 7 velocity pressure, then windward plus leeward, then ASD. */
function windPressure(spec) {
  const Kz = spec.exposure === 'B' ? 0.70 : spec.exposure === 'D' ? 1.03 : 0.85;
  const qz = 0.00256 * spec.windSpeed * spec.windSpeed * Kz * 0.85;   // Kd 0.85, Kzt 1.0
  return qz * 1.3 * 0.6;
}

/* 7/16" OSB, 8d at 6" on the edges — the same sheet doing the bracing and
   the interior finish. Aspect ratio is the limit that matters on a wall this
   tall: SDPWS allows 3.5 to 1 for a blocked wood structural panel, which on a
   135" wall makes the narrowest useful pier about 39". The shop uses a flat
   4'-0" minimum instead because it is leaning on the prescriptive braced-wall
   tables; nothing about an 11'-3" wall is prescriptive. */
const OSB_ALLOW = 240;          // plf
const MAX_ASPECT = 3.5;

function shearPiers(wall, spec, openings) {
  const minW = (spec.wallHeight - spec.subfloor) / MAX_ASPECT;
  return solidSegments(wall, spec, openings)
    .map(([a, b]) => ({ a, w: b - a }))
    .filter((p) => p.w >= minW);
}

function lateralCheck(spec, openings) {
  const q = windPressure(spec);
  const H = (spec.wallHeight - spec.subfloor) / 12;      // ft of wall
  const gable = spec.width * spec.ridgeRise / 2 / 144;   // sf, one gable triangle

  const dirs = [
    /* Wind on the long walls is carried by the two gable ends, which are all
       of twelve feet each. This is the direction that decides it. */
    { key: 'ns', name: 'Across (wind on the long walls)',
      lines: ['E', 'W'], area: spec.length / 12 * H },
    { key: 'ew', name: 'Along (wind on the ends)',
      lines: ['N', 'S'], area: spec.width / 12 * H + gable },
  ];

  return dirs.map((d) => {
    const force = d.area * q;                            // lb on the wall
    const V = force / 2;                                 // half goes to the roof line
    const perLine = V / d.lines.length;
    const minW = (spec.wallHeight - spec.subfloor) / MAX_ASPECT;
    const lines = d.lines.map((wall) => {
      const segs = solidSegments(wall, spec, openings).map(([a, b]) => ({ a, w: b - a }));
      const piers = segs.filter((p) => p.w >= minW);
      const braced = piers.reduce((a, p) => a + p.w, 0);
      const capacity = braced / 12 * OSB_ALLOW;
      const widest = Math.max(0, ...segs.map((s) => s.w));
      return { wall, segs, piers, braced, capacity, widest, minW,
        demand: perLine, ratio: perLine > 0 ? capacity / perLine : 1,
        required: capacity > 0 ? perLine / OSB_ALLOW * 12 : Infinity };
    });
    return { ...d, q, force, V, perLine, minW, lines };
  });
}

/* Nothing bolts this to the ground, so the two failures a slab-on-grade
   building never has to think about are both live here: it can slide, and it
   can tip. Both are checked broadside, which is the worst way to be caught. */
function stabilityCheck(spec, weight, factor) {
  const q = windPressure(spec);
  const H = (spec.wallHeight - spec.subfloor) / 12;
  const W = weight.total * (factor || 1);
  const area = spec.length / 12 * H + spec.length / 12 * (spec.ridgeRise / 2 / 12);
  const force = area * q;
  /* The resultant sits at mid-wall, measured from the ground the cribbing
     stands on rather than from the floor. */
  const arm = spec.deckHeight / 12 + H / 2;
  const overturning = force * arm;
  const resisting = 0.6 * W * (spec.width / 12 / 2);     // 0.6 D against overturning
  const mu = 0.35;                                        // steel on timber cribbing
  const friction = mu * W;
  return {
    q, area, force, arm, overturning, resisting,
    otRatio: resisting / overturning,
    friction, slideRatio: friction / force,
    holdEach: Math.max(0, (overturning - resisting) / (spec.width / 12) / 2),
    W,
  };
}

/* A roof this flat lifts. At 1.5 in 12 the wind does not press on it at all —
   it pulls, and the dead load holding it down is a metal skin on 2x6 rafters. */
function upliftCheck(spec) {
  const Kz = spec.exposure === 'B' ? 0.70 : spec.exposure === 'D' ? 1.03 : 0.85;
  const qz = 0.00256 * spec.windSpeed * spec.windSpeed * Kz * 0.85;
  /* Components and cladding, low-slope roof: about -1.0 in the field and
     -1.8 at the corners, against an internal pressure of +0.18. */
  const field = qz * (1.0 + 0.18) * 0.6;
  const corner = qz * (1.8 + 0.18) * 0.6;
  const dead = roofLoads(spec).dead;
  const trib = spec.studSpacing / 12 * (spec.width / 2 / 12);   // sf per rafter
  return {
    field, corner, dead,
    netField: field - dead * 0.6,
    netCorner: corner - dead * 0.6,
    perRafter: (field - dead * 0.6) * trib,
    perRafterCorner: (corner - dead * 0.6) * trib,
    trib,
  };
}
