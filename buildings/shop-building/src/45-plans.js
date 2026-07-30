/* ============================================================
   Working drawings.

   These are not renderings. Each sheet is a flat, dimensioned, annotated
   statement at a stated architectural scale, drawn from the same model the
   viewport draws — so a plan cannot get out of step with the thing it is a
   plan of, which is the failure mode of every set of drawings ever made by
   hand alongside a model.

   What they are for: pricing, ordering, laying out on the ground, and
   arguing with. What they are not: a permit set. Nothing here is stamped,
   and the title block says so on every page.
   ============================================================ */

/* Room on the page once the margin, the title block and the sheet's own
   title line are taken out. `notes` reserves a column down the right for
   keynotes, a schedule or a legend. */
function sheetArea(s, opts) {
  const o = opts || {};
  const pad = s.margin;
  const tb = 46 + 12;                      // title block plus its gap
  const noteW = o.notes === false ? 0 : (o.noteWidth || 150);
  const gap = noteW ? 18 : 0;
  return {
    x: pad, y: pad,
    w: s.W - pad * 2 - noteW - gap,
    h: s.H - pad * 2 - tb - 16,            // 16 leaves room for the view title
    noteX: s.W - pad - noteW, noteW,
    bottom: s.H - pad - tb,
  };
}

/* Everything a plan of this building has to hold, in model inches: the
   building, whatever hangs off it, and a margin for the dimension strings.
   A lean-to reaches ten feet past a wall, and a plan that crops it is worse
   than a plan at a smaller scale. */
function planExtent(spec, bleed) {
  const b = bleed == null ? 44 : bleed;
  let x0 = 0, z0 = 0, x1 = spec.width, z1 = spec.depth;
  const lt = leanToDesign(spec);
  if (lt && !lt.impossible) {
    const e = wallExtent(lt.wall, spec);
    const reach = e.out + e.dir * (lt.projection + 12);
    if (e.axis === 'x') { z0 = Math.min(z0, reach); z1 = Math.max(z1, reach); }
    else { x0 = Math.min(x0, reach); x1 = Math.max(x1, reach); }
  }
  /* The apron at an overhead door, and the eave line if it is a roof plan. */
  return [x0 - b, z0 - b, x1 + b, z1 + b];
}

/* Put a plan in that area at the biggest scale that will hold `box`, and keep
   model (0, 0) as the origin so every sheet dimensions from the same corner. */
function planFrame(s, area, spec, bleed, maxScale, box) {
  const bx = box || planExtent(spec, bleed);
  const mw = bx[2] - bx[0], mh = bx[3] - bx[1];
  const key = s.pickScale(mw, mh, area.w, area.h, maxScale);
  const f = (SCALES.find((z) => z.k === key).f) * PT;
  const x0 = area.x + (area.w - mw * f) / 2 - bx[0] * f;
  const y0 = area.y + (area.h - mh * f) / 2 - bx[1] * f;
  return s.frame(x0, y0, key, [0, 0, spec.width, spec.depth]);
}

const PLAN_WARNING = 'Preliminary. Not for construction — no engineer has reviewed this.';

/* ================================================================
   S1.0 — Foundation plan
   ================================================================ */
function drawFoundationPlan(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { noteWidth: 150 });
  planFrame(s, area, spec, 40);
  /* Keynote leaders want somewhere to go that is not on top of a pad, so the
     lean-to side decides which way they point. */
  const ltWall = (leanToDesign(spec) || {}).wall;

  const W = spec.width, D = spec.depth;
  const tw = spec.turndownWidth;
  const fd = footingDesign(spec);
  const sl = slabDesign(spec);
  const pf = postFooting(spec);
  const ab = anchorSchedule(spec, ops);
  const X = s.mx, Y = s.my;

  /* --- the pads first, so the slab lines sit over them --- */
  if (pf) {
    for (const p of leanToPostPlan(spec)) {
      const half = (p.end ? pf.endPad.side : pf.worstPad.side) / 2;
      s.rect(X(p.x - half), Y(p.z - half), s.mlen(half * 2), s.mlen(half * 2),
        LW.medium, { dash: '4 2.5' });
      s.line(X(p.x) - 4, Y(p.z), X(p.x) + 4, Y(p.z), LW.thin, { stroke: 'var(--ink-3)' });
      s.line(X(p.x), Y(p.z) - 4, X(p.x), Y(p.z) + 4, LW.thin, { stroke: 'var(--ink-3)' });
    }
  }

  /* --- apron, drawn before the slab so its edge reads as an addition --- */
  for (const o of ops) {
    if (o.kind !== 'overhead') continue;
    const st = stockFor(o), e = wallExtent(o.wall, spec);
    if (e.axis !== 'x') continue;
    const a = 48;
    const z0 = e.out === 0 ? -a : D;
    s.rect(X(o.off - 12), Y(z0), s.mlen(st.w + 24), s.mlen(a), LW.light);
    s.text((X(o.off) + X(o.off + st.w)) / 2, Y(z0 + a / 2) + 2, `4'-0" APRON`,
      { size: 5.4, fill: 'var(--ink-3)' });
  }

  /* --- slab edge and the inside face of the turndown --- */
  s.rect(X(0), Y(0), s.mlen(W), s.mlen(D), LW.cut);
  s.rect(X(tw), Y(tw), s.mlen(W - tw * 2), s.mlen(D - tw * 2), LW.light,
    { stroke: 'var(--ink-2)' });

  /* --- contraction joints, drawn the way they get cut --- */
  const jx = [], jz = [];
  for (let i = 1; i < sl.joints.nx; i++) jx.push(W * i / sl.joints.nx);
  for (let i = 1; i < sl.joints.nz; i++) jz.push(D * i / sl.joints.nz);
  for (const x of jx) s.line(X(x), Y(0), X(x), Y(D), LW.medium, { dash: '9 2.5 1.5 2.5' });
  for (const z of jz) s.line(X(0), Y(z), X(W), Y(z), LW.medium, { dash: '9 2.5 1.5 2.5' });
  if (jx.length) {
    s.callout(jx[0], D * 0.22, 26, -14,
      `SAWCUT ${fmtIn(spec.slabThickness / 4)} DEEP`, { size: 5.4 });
  }

  /* --- anchor bolts --- */
  for (const p of anchorBoltPlan(spec)) {
    s.circle(X(p.x), Y(p.z), 1.9, LW.light, { fill: 'var(--surface)' });
  }

  /* --- dimensions ---
     Overall both ways, then the joint layout, then the pads off the wall. */
  const off = 30 / s.drawn.f;              // 30 points out, in model inches
  s.dimH(0, W, -off * 2.1, null, 0);
  s.dimChainH([0, ...jx, W], -off * 1.15, 0);
  s.dimV(0, D, -off * 2.1, null, 0);
  s.dimChainV([0, ...jz, D], -off * 1.15, 0);
  if (pf) {
    const posts = leanToPostPlan(spec);
    /* Only the ones that run the same way as the post line, and only the two
       numbers anybody sets them out from: the spacing along, and how far the
       line stands off the wall. */
    if (posts.length && posts[0].x < 0) {
      const line = Math.min(...posts.map((p) => p.x)) - off * 0.9;
      s.dimChainV(posts.map((p) => p.z), line, posts[0].x);
      s.dimH(posts[0].x, 0, D + off * 0.7, null, D);
    }
  }

  /* --- keynotes --- */
  s.leader(ltWall === 'W' ? W - tw / 2 : tw / 2, D * 0.62, ltWall === 'W' ? 34 : -34, 16,
    `${fmtIn(spec.turndownWidth)} × ${fmtIn(spec.turndownDepth)} monolithic turndown, `
    + `${sl.turndownBars} × ${sl.turndownBar.size} continuous, lapped 40 diameters, `
    + `bent round every corner. Bottom ${fmtIn(fd.depth)} below top of slab.`);
  s.leader(W * 0.52, D * 0.5, 40, -26,
    `${fmtIn(spec.slabThickness)} slab, ${fmtN(spec.concreteFc)} psi`
    + (spec.slabReinf === 'rebar'
      ? `, ${sl.bar.size} at ${fmtIn(sl.spacing)} o.c. each way on chairs at mid-depth`
      : spec.slabReinf === 'mesh' ? ', welded wire mesh in flat sheets, chaired at mid-depth'
        : ', macro fibre, no bar')
    + `. Over ${fmtIn(spec.gravelDepth)} compacted base and a 10 mil vapour retarder, `
    + 'laps taped and turned up at the perimeter.');
  if (jx.length || jz.length) {
    s.keynote(`Contraction joints ${sl.joints.nx} × ${sl.joints.nz}, panels `
      + `${fmtN(sl.joints.panelX, 1)} × ${fmtN(sl.joints.panelZ, 1)} ft. Cut the same day, `
      + `${fmtIn(spec.slabThickness / 4)} deep. `
      + (sl.doweled
        ? 'Smooth ½" dowels at 12" o.c. across every joint, greased or sleeved one side.'
        : 'PLAIN SAWCUT — no load transfer. Every joint is a free edge; see the review notes.'));
  }
  s.keynote(`${ab.total} × ½" anchor bolts, 7" embedment, within 12" of every plate end and `
    + `at ${fmtIn(ab.spacing)} maximum between. Plate washers, set wet.`);
  if (pf) {
    s.keynote(`Lean-to post pads: ${fmtIn(pf.endPad.side)} square at the ends, `
      + `${fmtIn(pf.worstPad.side)} square at the interior posts, ${fmtIn(pf.thickness)} thick, `
      + `bottom at ${fmtIn(pf.depth)} below top of slab. Shown dashed — below grade.`);
  }
  s.keynote(`Bearing on ${fd.soil.label.toLowerCase()}, ${fmtN(fd.soil.q)} psf presumptive. `
    + 'Verify at the bottom of the excavation before any concrete is ordered.');

  /* --- the section mark, pointing at the detail on the next sheet --- */
  sectionMark(s, X(W * 0.30), Y(0), 'A', 'S1.1', 'up');

  /* --- the right-hand column --- */
  s.north(area.noteX + area.noteW - 16, area.y + 16);
  let cy = keynoteList(s, area.noteX, area.y + 46, area.noteW);
  cy = sheetNotes(s, area.noteX, cy + 14, area.noteW, 'Foundation notes', [
    `Strip topsoil and any organic material. Base is ${fmtIn(spec.gravelDepth)} of ¾" minus `
    + 'compacted in lifts no deeper than 4", each lift compacted before the next.',
    'Excavation to be inspected before steel is placed. If the bottom is soft, wet or filled, '
    + 'stop and get a look at it — nothing on this sheet is worth more than the dirt under it.',
    `Concrete ${fmtN(spec.concreteFc)} psi at 28 days, 4"–5" slump, air entrained. `
    + 'No water added at the truck.',
    'Reinforcement grade 60, 3" clear to earth, 2" clear at formed faces, 2" from the top of '
    + 'the slab for slab steel.',
    'Set anchor bolts wet, to a string line off the plate layout. A drilled-in anchor is a repair.',
  ]);

  s.viewTitle(area.x + 12, area.bottom - 6, 'Foundation plan', s.scale.k, '1');
}

/* Where the anchor bolts land, so the plan and the model agree without either
   asking the other. Same walk the model does. */
function anchorBoltPlan(spec) {
  const T = LUMBER[spec.studSize].d;
  const out = [];
  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const run = e.u1 - e.u0;
    const n = Math.max(2, Math.ceil(run / 72) + 1);
    for (let i = 0; i < n; i++) {
      const u = e.u0 + 6 + (run - 12) * (i / (n - 1));
      const v = e.c0 + T / 2;
      out.push(e.axis === 'x' ? { x: u, z: v } : { x: v, z: u });
    }
  }
  return out;
}

/* And where the lean-to posts land. */
function leanToPostPlan(spec) {
  const lt = leanToDesign(spec);
  if (!lt || lt.impossible) return [];
  const e = wallExtent(lt.wall, spec);
  const out = [];
  for (let i = 0; i < lt.posts; i++) {
    const u = 2.75 + (lt.run - 5.5) * (i / (lt.posts - 1));
    const v = e.out + e.dir * (lt.projection - lt.beam.thickness / 2);
    out.push({ ...(e.axis === 'x' ? { x: u, z: v } : { x: v, z: u }),
      end: i === 0 || i === lt.posts - 1 });
  }
  return out;
}

/* A section cut mark: the circle with the sheet it is drawn on, and the arrow
   that says which way you are looking. */
function sectionMark(s, x, y, mark, sheet, dir) {
  const r = 9;
  const d = dir === 'up' ? -1 : 1;
  s.circle(x, y + d * -r * 1.6, r, LW.medium, { fill: 'var(--surface)' });
  s.line(x, y + d * -r * 1.6, x + r, y + d * -r * 1.6, LW.thin, { stroke: 'var(--ink-3)' });
  s.text(x, y + d * -r * 1.6 - 1, mark, { size: 7, weight: 700, anchor: 'middle' });
  s.text(x, y + d * -r * 1.6 + 7, sheet, { size: 5.2, anchor: 'middle', fill: 'var(--ink-2)' });
  /* The tail and the head of the cut. */
  s.line(x, y, x, y + d * -r * 0.6, LW.heavy);
  s.poly([[x - 3, y + d * 6], [x + 3, y + d * 6], [x, y + d * 0.5]], LW.light,
    { fill: 'var(--ink)' });
}

/* ================================================================
   S1.1 — Foundation details, cut through the things that matter
   ================================================================ */
function drawFoundationDetails(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { noteWidth: 150 });
  const fd = footingDesign(spec);
  const sl = slabDesign(spec);
  const pf = postFooting(spec);
  const T = LUMBER[spec.studSize].d;

  /* Two rows of details: the two sections through the foundation on top, the
     joint that decides the slab thickness underneath. */
  const rowTop = area.h * 0.58, rowBot = area.h - rowTop;
  const colW = area.w * 0.54;

  /* ---- detail A: the wall, the slab and the turndown ---- */
  const modelW = spec.turndownWidth + 30, modelH = spec.turndownDepth + 22;
  const keyA = s.pickScale(modelW, modelH, colW - 44, rowTop - 34, '1.5');
  const fA = SCALES.find((z) => z.k === keyA).f * PT;
  /* The frame runs +v DOWN the page, as every plan here does. A section wants
     to be talked about in heights above the slab, so AY() takes an upward
     value and hands the frame the downward one. */
  s.frame(area.x + 32, area.y + 20, keyA,
    [-12, -16, spec.turndownWidth + 18, spec.turndownDepth + 6]);
  const AX = (u) => s.mx(u);
  const AY = (v) => s.my(-v);
  const L = (v) => s.mlen(v);

  /* earth, then base, then concrete */
  s.hatch(AX(-12), AY(-4), L(12), L(spec.turndownDepth + 6), 'earth');
  s.hatch(AX(spec.turndownWidth), AY(-4), L(14), L(spec.turndownDepth + 6), 'earth');
  s.hatch(AX(-12), AY(-spec.slabThickness), L(spec.turndownWidth + 26), L(spec.gravelDepth), 'gravel');

  /* the concrete: slab plus turndown, as one poured shape */
  const tw = spec.turndownWidth, td = spec.turndownDepth, st = spec.slabThickness;
  const concrete = [
    [AX(-2), AY(0)], [AX(tw + 26), AY(0)],
    [AX(tw + 26), AY(-st)], [AX(tw), AY(-st)],
    [AX(tw), AY(-td)], [AX(-2), AY(-td)],
  ];
  s.hatch(AX(-2), AY(0), L(tw + 28), L(td), 'concrete');
  s.poly(concrete, LW.cut);

  /* vapour retarder under the slab, turned up at the edge */
  s.path(`M${AX(tw + 26)},${AY(-st) + 1.2} L${AX(-2)},${AY(-st) + 1.2} L${AX(-2)},${AY(-td)}`,
    LW.medium, { stroke: 'var(--ink-2)', dash: '3 1.6' });

  /* slab steel, cut */
  if (spec.slabReinf === 'rebar') {
    for (let u = 4; u < tw + 24; u += sl.spacing) {
      s.circle(AX(u), AY(-st / 2), 1.5, LW.medium, { fill: 'var(--ink)' });
    }
  }
  /* turndown bars, cut */
  for (let i = 0; i < sl.turndownBars; i++) {
    s.circle(AX(3 + i * (tw - 6)), AY(-td + 3), 1.7, LW.medium, { fill: 'var(--ink)' });
  }

  /* plate, stud, girt or sheathing */
  const wallU = 1;
  s.rect(AX(wallU), AY(1.5), L(T), L(1.5), LW.heavy);
  s.hatch(AX(wallU), AY(1.5), L(T), L(1.5), 'wood');
  s.rect(AX(wallU), AY(1.5 + 13), L(T), L(13), LW.medium);
  s.line(AX(wallU), AY(14.5), AX(wallU + T), AY(14.5), 0.4,
    { stroke: 'var(--ink-3)', dash: '2 2' });

  /* anchor bolt */
  const bx = AX(wallU + T / 2);
  s.line(bx, AY(3.4), bx, AY(-7), LW.heavy);
  s.line(bx, AY(-7), bx + 5, AY(-7), LW.heavy);
  s.rect(bx - 5, AY(1.7), 10, 2, LW.light, { fill: 'var(--ink-2)' });

  /* grade line, and the slab datum */
  s.line(AX(tw + 12), AY(-st), AX(tw + 26), AY(-st), LW.medium, { stroke: 'var(--ink-2)' });
  s.line(AX(-12), AY(-st), AX(-2), AY(-st), LW.medium, { stroke: 'var(--ink-2)' });
  s.text(AX(-12), AY(-st) - 3, 'GRADE', { size: 5.2, anchor: 'start', fill: 'var(--ink-3)' });

  /* dimensions on the detail */
  const dOff = 26 / fA;
  s.dimLine(AX(-2) - 14, AY(0), AX(-2) - 14, AY(-td), fmtIn(td));
  s.dimLine(AX(tw + 26) + 14, AY(0), AX(tw + 26) + 14, AY(-st), fmtIn(st));
  s.dimLine(AX(-2), AY(-td) - 12, AX(tw), AY(-td) - 12, fmtIn(tw));

  s.viewTitle(area.x + 32, area.y + rowTop - 8, 'Turndown at a bearing wall', keyA, 'A');

  /* ---- detail B: a post pad ---- */
  if (pf) {
    const bModelW = pf.worstPad.side + 26, bModelH = pf.depth + 26;
    const keyB = s.pickScale(bModelW, bModelH, area.w - colW - 44, rowTop - 34, '1');
    s.frame(area.x + colW + 32, area.y + 20, keyB,
      [-13, -16, pf.worstPad.side + 13, pf.depth + 10]);
    const BX = (u) => s.mx(u), BY = (v) => s.my(-v), BL = (v) => s.mlen(v);
    const side = pf.worstPad.side, th = pf.thickness, dep = pf.depth;

    s.hatch(BX(-13), BY(-2), BL(13), BL(dep + 4), 'earth');
    s.hatch(BX(side), BY(-2), BL(13), BL(dep + 4), 'earth');
    s.hatch(BX(0), BY(-(dep - th)), BL(side), BL(th), 'concrete');
    s.rect(BX(0), BY(-(dep - th)), BL(side), BL(th), LW.cut);
    /* the pier stem, from the top of the pad up to grade */
    const stemW = 12, sx = (side - stemW) / 2;
    if (dep - th > 0.5) {
      s.hatch(BX(sx), BY(0), BL(stemW), BL(dep - th), 'concrete');
      s.rect(BX(sx), BY(0), BL(stemW), BL(dep - th), LW.cut);
    }
    /* the post and its base */
    s.rect(BX(side / 2 - 2.75), BY(14), BL(5.5), BL(12.8), LW.heavy);
    s.hatch(BX(side / 2 - 2.75), BY(14), BL(5.5), BL(12.8), 'wood');
    s.rect(BX(side / 2 - 3.4), BY(1.2), BL(6.8), BL(1.2), LW.medium, { fill: 'var(--ink-2)' });
    s.line(BX(-13), BY(0), BX(0), BY(0), LW.medium, { stroke: 'var(--ink-2)' });
    s.line(BX(side), BY(0), BX(side + 13), BY(0), LW.medium, { stroke: 'var(--ink-2)' });

    s.dimLine(BX(0), BY(-dep) + 13, BX(side), BY(-dep) + 13, fmtIn(side));
    s.dimLine(BX(side) + 14, BY(0), BX(side) + 14, BY(-dep), fmtIn(dep));
    s.viewTitle(area.x + colW + 32, area.y + rowTop - 8, 'Lean-to post pad', keyB, 'B');
  }

  /* ---- detail C: the joint the slab thickness turns on ----
     This is the whole finding on one drawing: a wheel at a plain sawcut is
     working on a free edge, and a dowel is what stops it being one. */
  {
    const st2 = spec.slabThickness;
    const cModelW = 60, cModelH = st2 + spec.gravelDepth + 22;
    const keyC = s.pickScale(cModelW, cModelH, area.w - 60, rowBot - 40, '3');
    s.frame(area.x + 34, area.y + rowTop + 24, keyC,
      [-6, -14, 54, st2 + spec.gravelDepth + 8]);
    const CX = (u) => s.mx(u), CY = (v) => s.my(-v), CL = (v) => s.mlen(v);

    s.hatch(CX(-6), CY(0), CL(60), CL(spec.gravelDepth), 'gravel');
    s.hatch(CX(-6), CY(st2), CL(60), CL(st2), 'concrete');
    s.rect(CX(-6), CY(st2), CL(60), CL(st2), LW.cut);
    s.line(CX(-6), CY(0) + 1.2, CX(54), CY(0) + 1.2, LW.medium,
      { stroke: 'var(--ink-2)', dash: '3 1.6' });

    /* the sawcut and the crack it chooses */
    const cut = st2 / 4;
    const jx2 = 24;
    s.rect(CX(jx2 - 0.6), CY(st2), CL(1.2), CL(cut), LW.heavy, { fill: 'var(--ink-2)' });
    s.path(`M${fx(CX(jx2))},${fx(CY(st2 - cut))} L${fx(CX(jx2 + 0.9))},${fx(CY(st2 * 0.5))} `
      + `L${fx(CX(jx2 - 0.6))},${fx(CY(st2 * 0.25))} L${fx(CX(jx2 + 0.2))},${fx(CY(0))}`,
      LW.medium, { stroke: 'var(--ink-2)', dash: '2 1.6' });

    if (slabDesign(spec).doweled) {
      const dy = CY(st2 / 2);
      s.line(CX(jx2 - 9), dy, CX(jx2 + 9), dy, LW.cut);
      s.rect(CX(jx2), dy - 2.4, CL(9), 4.8, LW.thin, { stroke: 'var(--ink-3)' });
      s.callout(jx2 + 9, st2 / 2, 40, 22,
        '½" SMOOTH DOWEL × 18" @ 12" O.C., SLEEVED ONE SIDE', { size: 5.4, weight: 700 });
    } else {
      s.callout(jx2, st2 / 2, 40, 22, 'NO LOAD TRANSFER — A FREE EDGE BOTH SIDES',
        { size: 5.4, weight: 700, fill: 'var(--keel)' });
    }
    s.callout(jx2, st2, -30, -18, `SAWCUT ${fmtIn(cut)} DEEP, SAME DAY`, { size: 5.4 });
    s.callout(jx2 + 0.6, st2 * 0.4, 22, -26, 'THE CRACK THE CUT CHOOSES', { size: 5.2 });
    s.dimLine(CX(-6) - 13, CY(st2), CX(-6) - 13, CY(0), fmtIn(st2));
    s.dimLine(CX(-6) - 13, CY(0), CX(-6) - 13, CY(-spec.gravelDepth), fmtIn(spec.gravelDepth));
    s.viewTitle(area.x + 34, CY(-spec.gravelDepth - 8) + 26,
      'Slab at a contraction joint', keyC, 'C');
  }

  /* ---- the column ---- */
  let cy = sheetNotes(s, area.noteX, area.y + 8, area.noteW, 'What sets these', [
    `Turndown width ${fmtIn(fd.builtWidth)} against ${fmtIn(fd.bearingWidth)} that bearing asks `
    + `for — ${fd.governs} governs. ${fmtN(fd.lines.bearing.total)} plf on `
    + `${fmtN(fd.soil.q)} psf is not what makes this trench.`,
    `Depth ${fmtIn(fd.builtDepth)} against ${fmtIn(fd.depth)} required: ${fmtIn(spec.frostDepth)} `
    + `of frost cover below grade plus the ${fmtIn(spec.slabThickness)} slab.`,
    `Slab ${fmtIn(spec.slabThickness)}: a ${fmtN(spec.wheelLoad)} lb wheel needs `
    + `${sl.interiorOnly ? fmtIn(sl.interiorOnly.h) : 'more than 8"'} mid-panel and `
    + `${sl.edgeToo ? fmtIn(sl.edgeToo.h) : 'more than 8"'} at a free edge. `
    + (sl.doweled ? 'Joints doweled, so the interior case governs.'
      : 'Joints are plain sawcuts, so the edge case governs.'),
    pf ? `Post pads ${fmtIn(pf.worstPad.side)} square: ${fmtN(pf.worst)} lb plus the pad itself `
      + `is ${fmtN(pf.worstPad.pressure)} psf on ${fmtN(pf.soil.q)} allowable.`
      : 'No lean-to, so no post pads.',
  ]);
  cy = sheetNotes(s, area.noteX, cy + 12, area.noteW, 'At the door', [
    'Thicken the slab under the overhead door track and keep the apron separate from the slab '
    + 'with a full-depth expansion joint — the apron moves with the weather and the slab does not.',
    `Drop the slab ${fmtIn(1.5)} at the door for a threshold, or hold the apron down and slope `
    + 'away 1/8" per foot for the first 10 feet.',
  ]);

  s.scale = null;                            // two scales on one sheet
}

/* ================================================================
   S2.0 — Framing plan
   ================================================================ */
function drawFramingPlan(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { noteWidth: 158 });
  /* No lean-to on this sheet, so it does not get to shrink the scale. */
  planFrame(s, area, spec, 40, null,
    [-40, -40, spec.width + 40, spec.depth + 40]);
  const T = LUMBER[spec.studSize].d;
  const W = spec.width, D = spec.depth;
  const X = s.mx, Y = s.my;

  /* Wall lines: two lines and a poché, which is how a plan says "cut here". */
  const walls = [
    { a: [0, 0], b: [W, T] }, { a: [0, D - T], b: [W, D] },
    { a: [0, T], b: [T, D - T] }, { a: [W - T, T], b: [W, D - T] },
  ];
  /* Poché. Below about 2 points of drawn thickness a hatch is a smudge, so a
     wall that thin is filled solid instead — which is what a small-scale plan
     does anyway. */
  const thin = s.mlen(T) < 2.4;
  for (const w of walls) {
    const px = X(w.a[0]), py = Y(w.a[1]);
    const pw = s.mlen(w.b[0] - w.a[0]), ph = s.mlen(w.b[1] - w.a[1]);
    if (thin) s.rect(px, py, pw, ph, LW.cut, { fill: 'var(--ink)' });
    else { s.hatch(px, py, pw, ph, 'wood'); s.rect(px, py, pw, ph, LW.cut); }
  }

  /* Openings: break the wall and draw the leaf or the sill. */
  for (const o of ops) {
    const st = stockFor(o), e = wallExtent(o.wall, spec);
    const along = (u) => (e.axis === 'x' ? { x: u, z: e.c0 } : { x: e.c0, z: u });
    const p0 = along(o.off), p1 = along(o.off + st.w);
    const across = e.axis === 'x' ? [0, T] : [T, 0];
    /* clear the wall through the opening */
    s.rect(X(Math.min(p0.x, p1.x)), Y(Math.min(p0.z, p1.z)),
      s.mlen(e.axis === 'x' ? st.w : across[0]), s.mlen(e.axis === 'x' ? across[1] : st.w),
      0, { fill: 'var(--surface)' });
    /* jambs */
    const jamb = (p) => (e.axis === 'x'
      ? s.line(X(p.x), Y(e.c0), X(p.x), Y(e.c0 + T), LW.medium)
      : s.line(X(e.c0), Y(p.z), X(e.c0 + T), Y(p.z), LW.medium));
    jamb(p0); jamb(p1);
    if (o.kind === 'window') {
      /* the glass line */
      const g1 = e.axis === 'x'
        ? [X(p0.x), Y(e.c0 + T / 2), X(p1.x), Y(e.c0 + T / 2)]
        : [X(e.c0 + T / 2), Y(p0.z), X(e.c0 + T / 2), Y(p1.z)];
      s.line(g1[0], g1[1], g1[2], g1[3], LW.light);
    } else if (o.kind === 'man') {
      /* leaf and swing */
      const cx = X(p0.x), cy = Y(p0.z);
      const r = s.mlen(st.w);
      const inward = e.dir > 0 ? -1 : 1;
      if (e.axis === 'x') {
        s.line(cx, cy + (e.dir > 0 ? 0 : s.mlen(T)), cx, cy + inward * r + (e.dir > 0 ? 0 : s.mlen(T)), LW.medium);
        s.path(`M${fx(cx + r)},${fx(cy + (e.dir > 0 ? 0 : s.mlen(T)))} A${fx(r)},${fx(r)} 0 0 ${inward < 0 ? 0 : 1} ${fx(cx)},${fx(cy + inward * r + (e.dir > 0 ? 0 : s.mlen(T)))}`,
          LW.thin, { stroke: 'var(--ink-3)' });
      } else {
        s.line(cx + (e.dir > 0 ? 0 : s.mlen(T)), cy, cx + inward * r + (e.dir > 0 ? 0 : s.mlen(T)), cy, LW.medium);
      }
    } else {
      /* overhead: the panel line and the track */
      const t1 = e.axis === 'x'
        ? [X(p0.x), Y(e.c0 + T / 2), X(p1.x), Y(e.c0 + T / 2)]
        : [X(e.c0 + T / 2), Y(p0.z), X(e.c0 + T / 2), Y(p1.z)];
      s.line(t1[0], t1[1], t1[2], t1[3], LW.heavy);
      const inward = -e.dir;
      const trackLen = s.mlen(st.h * 0.9);
      if (e.axis === 'x') {
        for (const px of [X(p0.x + 2), X(p1.x - 2)]) {
          s.line(px, Y(e.c0 + T / 2), px, Y(e.c0 + T / 2) + inward * trackLen, LW.thin,
            { stroke: 'var(--ink-3)', dash: '4 2' });
        }
      }
    }
    /* the tag */
    const mid = e.axis === 'x' ? { x: o.off + st.w / 2, z: e.c0 + T / 2 } : { x: e.c0 + T / 2, z: o.off + st.w / 2 };
    const outX = e.axis === 'x' ? 0 : e.dir * 26;
    const outZ = e.axis === 'x' ? e.dir * 26 : 0;
    s.callout(mid.x, mid.z, outX, outZ, openingTag(o), { size: 5.6, weight: 700 });
  }

  /* Stud direction and spacing, said once per wall rather than drawn 60 times
     — a plan that draws every stud is unreadable and nobody counts them off it. */
  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    const mid = (e.u0 + e.u1) / 2;
    const at = e.axis === 'x' ? { x: mid, z: e.c0 + T / 2 } : { x: e.c0 + T / 2, z: mid };
    const rot = e.axis === 'x' ? 0 : -90;
    s.text(X(at.x), Y(at.z) + 2, `${spec.studSize} @ ${fmtIn(spec.studSpacing)} O.C.`,
      { size: 5, fill: 'var(--ink-3)', rotate: rot });
  }

  /* Braced panels — the thing this building is actually short of. */
  for (const dir of bracingCheck(spec, ops)) {
    for (const line of dir.lines) {
      for (const pan of (line.panels || [])) {
        const e = wallExtent(line.wall, spec);
        const a = e.axis === 'x' ? { x: pan.a, z: e.c0 } : { x: e.c0, z: pan.a };
        s.rect(X(a.x), Y(a.z),
          s.mlen(e.axis === 'x' ? pan.w : T), s.mlen(e.axis === 'x' ? T : pan.w),
          LW.heavy, { stroke: 'var(--keel)' });
      }
    }
  }

  /* Dimensions: overall, then to every opening on each wall. */
  const off = 30 / s.drawn.f;
  s.dimH(0, W, -off * 2.2, null, 0);
  s.dimV(0, D, -off * 2.2, null, 0);
  for (const wall of ['N', 'S']) {
    const e = wallExtent(wall, spec);
    const stops = [0];
    for (const o of openingsOn(wall, ops)) { stops.push(o.off, o.off + stockFor(o).w); }
    stops.push(W);
    if (stops.length > 2) s.dimChainH(stops, wall === 'N' ? -off * 1.15 : D + off * 1.15, e.c0);
  }
  for (const wall of ['W', 'E']) {
    const e = wallExtent(wall, spec);
    const stops = [0];
    for (const o of openingsOn(wall, ops)) { stops.push(o.off, o.off + stockFor(o).w); }
    stops.push(D);
    if (stops.length > 2) s.dimChainV(stops, wall === 'W' ? -off * 1.15 : W + off * 1.15, e.c0);
  }

  /* The schedule is the point of this sheet. */
  const rows = ops.map((o) => {
    const st = stockFor(o), h = sizeHeader(st.w, o.wall, spec);
    return [openingTag(o), WALLS[o.wall].label[0], `${fmtIn(st.w)}×${fmtIn(st.h)}`,
      fmtFt(o.head), h.over ? 'ENGINEERED' : h.label];
  });
  let cy = schedule(s, area.noteX, area.y + 8, area.noteW, 'Opening schedule',
    [{ h: 'Tag', w: 12 }, { h: 'Wall', w: 10 }, { h: 'Rough op.', w: 26, mono: true },
      { h: 'Head', w: 16, mono: true }, { h: 'Header', w: 30 }], rows);
  cy = sheetNotes(s, area.noteX, cy + 16, area.noteW, 'Framing notes', [
    `Walls ${spec.studSize} at ${fmtIn(spec.studSpacing)} o.c. on a treated bottom plate, `
    + 'double top plate lapped at every corner and intersection.',
    'Rough openings are the holes, not the units. Confirm each against the unit before cutting '
    + 'the header.',
    'King stud full height each side of every opening, jack studs under the header, cripples '
    + 'over and under at the wall spacing.',
    spec.bracing === 'corners'
      ? `Braced panels shown heavy: ${fmtFt(spec.bracedPanelWidth)} of ${'7/16'}" OSB each side of `
        + 'every corner, edge nailed 8d at 6" and 12" in the field.'
      : 'Racking resistance: see the Review tab — the method chosen there sets what the wall '
        + 'sheathing has to be.',
  ]);
  s.viewTitle(area.x + 12, area.bottom - 6, 'Framing plan', s.scale.k, '1');
}

/* Openings get a tag on the drawing and a row in the schedule, so the drawing
   stays legible and the sizes stay in one place. Numbered per kind in the
   order they appear, which keeps the tag stable while nothing is added and
   readable when it is — a hash would be stable and unreadable. */
function openingTag(o, list) {
  const ops = list || state.openings;
  const pre = o.kind === 'window' ? 'W' : o.kind === 'man' ? 'D' : 'OH';
  const same = ops.filter((x) => x.kind === o.kind);
  const i = same.indexOf(o);
  return pre + (i < 0 ? '?' : i + 1);
}

/* ================================================================
   S3.0 — Roof framing plan
   ================================================================ */
function drawRoofPlan(s) {
  const spec = state.spec, ops = state.openings;
  const tr = trussGeometry(spec);
  const area = sheetArea(s, { noteWidth: 160 });
  const eo = spec.eaveOverhang, ro = spec.rakeOverhang;
  planFrame(s, area, spec, 34, null,
    [-ro - 34, -eo - 34, spec.width + ro + 34, spec.depth + eo + 34]);
  const X = s.mx, Y = s.my, W = spec.width, D = spec.depth;

  /* roof edge and the walls under it */
  s.rect(X(-ro), Y(-eo), s.mlen(W + ro * 2), s.mlen(D + eo * 2), LW.heavy);
  s.rect(X(0), Y(0), s.mlen(W), s.mlen(D), LW.thin, { stroke: 'var(--ink-3)', dash: '5 3' });

  /* the ridge */
  s.line(X(-ro), Y(D / 2), X(W + ro), Y(D / 2), LW.cut);
  s.text(X(W * 0.12), Y(D / 2) - 3.4, 'RIDGE', { size: 5.4, fill: 'var(--ink-2)' });

  /* every truss, because on a roof plan you do count them */
  for (let i = 0; i < tr.count; i++) {
    const x = Math.min(i * spec.trussSpacing, W - 1.5);
    const end = i === 0 || i === tr.count - 1;
    s.line(X(x), Y(-eo), X(x), Y(D + eo), end ? LW.medium : LW.light,
      { stroke: end ? 'var(--ink)' : 'var(--ink-2)' });
  }
  s.callout(spec.trussSpacing * 2, D * 0.24, 34, -22,
    `${tr.count} TRUSSES @ ${fmtIn(spec.trussSpacing)} O.C.`, { size: 5.6, weight: 700 });

  /* purlins or deck */
  if (spec.roofDeck === 'purlins') {
    for (let z = -eo + spec.purlinSpacing; z < D + eo; z += spec.purlinSpacing) {
      if (Math.abs(z - D / 2) < 2) continue;
      s.line(X(-ro), Y(z), X(W + ro), Y(z), 0.28, { stroke: 'var(--ink-3)' });
    }
    s.callout(W * 0.72, spec.purlinSpacing * 1.5, 26, -20,
      `${spec.purlinSize} PURLINS @ ${fmtIn(spec.purlinSpacing)} O.C.`, { size: 5.4 });
  } else {
    s.callout(W * 0.72, D * 0.26, 26, -20, '7/16" OSB DECK, H-CLIPS AT MID-SPAN', { size: 5.4 });
  }

  /* roof-plane bracing, which is the note the Review tab is loudest about */
  if (spec.roofPlaneBracing || spec.roofDeck !== 'osb') {
    /* An X in a bay at each end of each roof plane, drawn inside the bay
       rather than across the whole roof — a diagonal that runs off the edge
       of the building is not a brace anybody can build. */
    const bay = Math.min(spec.trussSpacing * 2, W / 3);
    const col = spec.roofPlaneBracing ? 'var(--ink)' : 'var(--keel)';
    for (const [z0, z1] of [[0, D / 2], [D / 2, D]]) {
      for (const x0 of [6, W - 6 - bay]) {
        const x1 = x0 + bay;
        s.line(X(x0), Y(z0), X(x1), Y(z1), LW.medium, { stroke: col, dash: '6 3' });
        s.line(X(x0), Y(z1), X(x1), Y(z0), LW.medium, { stroke: col, dash: '6 3' });
      }
    }
    s.callout(6 + bay / 2, D * 0.25, -34, -20,
      spec.roofPlaneBracing ? 'ROOF-PLANE X-BRACING, EACH END OF EACH PLANE'
        : 'ROOF-PLANE BRACING REQUIRED — NOT SPECIFIED',
      { size: 5.2, weight: 700, fill: spec.roofPlaneBracing ? 'var(--ink-2)' : 'var(--keel)' });
  }

  /* slope arrows */
  for (const [z0, z1] of [[D / 2 - 12, -eo + 12], [D / 2 + 12, D + eo - 12]]) {
    const x = W * 0.86;
    s.line(X(x), Y(z0), X(x), Y(z1), LW.thin, { stroke: 'var(--ink-2)' });
    const d = Math.sign(z1 - z0);
    s.poly([[X(x) - 2.6, Y(z1) - d * 5], [X(x) + 2.6, Y(z1) - d * 5], [X(x), Y(z1)]], 0,
      { fill: 'var(--ink-2)' });
    s.text(X(x) + 5, (Y(z0) + Y(z1)) / 2, `${spec.pitch}/12`,
      { size: 5.4, anchor: 'start', fill: 'var(--ink-2)' });
  }

  const off = 30 / s.drawn.f;
  s.dimH(-ro, W + ro, -eo - off * 1.6, null, -eo);
  s.dimH(0, W, -eo - off * 0.7, null, 0);
  s.dimV(-eo, D + eo, -ro - off * 1.6, null, -ro);
  s.dimV(0, D, -ro - off * 0.7, null, 0);

  let cy = schedule(s, area.noteX, area.y + 8, area.noteW, 'One truss',
    [{ h: 'Qty', w: 8 }, { h: 'Member', w: 34 }, { h: 'Length', w: 20, mono: true }],
    trussCutRows(tr));
  cy = sheetNotes(s, area.noteX, cy + 16, area.noteW, 'Roof notes', [
    `${tr.count} trusses at ${fmtIn(spec.trussSpacing)} o.c., ${fmtFt(tr.span)} span, `
    + `${spec.pitch}/12, ${fmtFt(tr.overallHeight)} to the peak above the slab.`,
    '¾" CDX gussets both faces at all 8 joints, glued and nailed 8d at 3" o.c. staggered, '
    + 'minimum 4 nails per member per face.',
    'Build the first truss on the slab against a full-size chalked layout, then use it as the jig.',
    spec.roofDeck === 'osb'
      ? 'The deck is the diaphragm. Block and nail the panel edges at the ends of the building.'
      : 'With purlins and no deck there is no diaphragm, so the roof-plane bracing shown is what '
        + 'holds the trusses plumb as a group. It is not optional.',
    `Overhangs ${fmtIn(spec.eaveOverhang)} at the eave, ${fmtIn(spec.rakeOverhang)} at the rake, `
    + 'measured horizontally.',
  ]);
  s.viewTitle(area.x + 12, area.bottom - 6, 'Roof framing plan', s.scale.k, '1');
}

function trussCutRows(tr) {
  const rows = [
    ['2', `Top chord, ${tr.chordSize}`, fmtFt(tr.tcLength)],
    ['2', `Bottom chord, ${tr.chordSize}`, fmtFt(tr.half)],
  ];
  const webs = new Map();
  for (const w of tr.webs) {
    const k = Math.round(w.len * 16) / 16;
    webs.set(k, (webs.get(k) || 0) + 1);
  }
  for (const [len, n] of [...webs.entries()].sort((a, b) => b[0] - a[0])) {
    rows.push([String(n), `Web, ${tr.chordSize}`, fmtFt(len)]);
  }
  return rows;
}

/* ================================================================
   E1.0 — Electrical plan
   ================================================================ */
function drawElectricalPlan(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { noteWidth: 158 });
  planFrame(s, area, spec, 36, null,
    [-36, -36, spec.width + 36, spec.depth + 36]);
  const T = LUMBER[spec.studSize].d;
  const W = spec.width, D = spec.depth;
  const X = s.mx, Y = s.my;

  /* Background: the walls, light, because the subject is what is on them. */
  const walls = [
    [0, 0, W, T], [0, D - T, W, D], [0, T, T, D - T], [W - T, T, W, D - T],
  ];
  for (const w of walls) {
    s.rect(X(w[0]), Y(w[1]), s.mlen(w[2] - w[0]), s.mlen(w[3] - w[1]), LW.light,
      { stroke: 'var(--ink-3)' });
  }
  for (const o of ops) {
    const st = stockFor(o), e = wallExtent(o.wall, spec);
    if (e.axis === 'x') {
      s.rect(X(o.off), Y(e.c0), s.mlen(st.w), s.mlen(T), 0, { fill: 'var(--surface)' });
      s.line(X(o.off), Y(e.c0), X(o.off), Y(e.c0 + T), LW.thin, { stroke: 'var(--ink-3)' });
      s.line(X(o.off + st.w), Y(e.c0), X(o.off + st.w), Y(e.c0 + T), LW.thin, { stroke: 'var(--ink-3)' });
    } else {
      s.rect(X(e.c0), Y(o.off), s.mlen(T), s.mlen(st.w), 0, { fill: 'var(--surface)' });
      s.line(X(e.c0), Y(o.off), X(e.c0 + T), Y(o.off), LW.thin, { stroke: 'var(--ink-3)' });
      s.line(X(e.c0), Y(o.off + st.w), X(e.c0 + T), Y(o.off + st.w), LW.thin, { stroke: 'var(--ink-3)' });
    }
  }
  s.rect(X(0), Y(0), s.mlen(W), s.mlen(D), LW.medium);

  /* Everything electrical is already in the model, so the plan reads it off
     rather than inventing a second layout that could disagree. */
  const parts = model.parts.filter((p) => p.stage === 'elec');
  const at = (p) => { const c = aabb(p.geom).c; return { x: c[0], z: c[2], y: c[1] }; };

  for (const p of parts) {
    const c = at(p);
    if (p.sys === 'fixture') {
      const b = aabb(p.geom);
      const lw = b.mx[0] - b.mn[0], ld = b.mx[2] - b.mn[2];
      s.rect(X(b.mn[0]), Y(c.z - 2), s.mlen(lw), s.mlen(4), LW.medium);
      s.line(X(b.mn[0]), Y(c.z), X(b.mx[0]), Y(c.z), LW.thin, { stroke: 'var(--ink-3)' });
    } else if (p.sys === 'panel') {
      s.rect(X(c.x - 10), Y(c.z - 3), s.mlen(20), s.mlen(6), LW.heavy, { fill: 'var(--surface-2)' });
      s.callout(c.x, c.z, -30, -18, `${spec.service} A SUB-PANEL`, { size: 5.6, weight: 700 });
    } else if (p.sys === 'device') {
      if (p.kind === 'Switch') {
        s.circle(X(c.x), Y(c.z), 3.1, LW.medium, { fill: 'var(--surface)' });
        s.text(X(c.x), Y(c.z) + 2, 'S', { size: 5.4, weight: 700 });
      } else {
        /* Duplex receptacle: the half circle with two prongs. */
        s.circle(X(c.x), Y(c.z), 3.1, LW.medium, { fill: 'var(--surface)' });
        s.line(X(c.x) - 3.1, Y(c.z), X(c.x) + 3.1, Y(c.z), LW.medium);
        s.line(X(c.x) - 1.4, Y(c.z), X(c.x) - 1.4, Y(c.z) - 2.6, LW.thin);
        s.line(X(c.x) + 1.4, Y(c.z), X(c.x) + 1.4, Y(c.z) - 2.6, LW.thin);
      }
    }
  }
  /* Circuit runs, drawn as the arcs an electrical plan uses so they do not
     read as walls. */
  for (const p of parts.filter((q) => q.sys === 'wire')) {
    const b = aabb(p.geom);
    const horiz = (b.mx[0] - b.mn[0]) > (b.mx[2] - b.mn[2]);
    if (horiz) {
      s.line(X(b.mn[0]), Y((b.mn[2] + b.mx[2]) / 2), X(b.mx[0]), Y((b.mn[2] + b.mx[2]) / 2),
        LW.thin, { stroke: 'var(--ink-3)', dash: '2 2.4' });
    } else {
      s.line(X((b.mn[0] + b.mx[0]) / 2), Y(b.mn[2]), X((b.mn[0] + b.mx[0]) / 2), Y(b.mx[2]),
        LW.thin, { stroke: 'var(--ink-3)', dash: '2 2.4' });
    }
  }

  const off = 30 / s.drawn.f;
  s.dimH(0, W, -off * 1.5, null, 0);
  s.dimV(0, D, -off * 1.5, null, 0);

  /* Legend, drawn with the same symbol routine so it cannot drift. */
  let ly = area.y + 8;
  s.text(area.noteX, ly, 'LEGEND',
    { size: 7, anchor: 'start', weight: 700, track: '0.06em' });
  s.line(area.noteX, ly + 2.8, area.noteX + area.noteW, ly + 2.8, LW.medium);
  ly += 16;
  const legend = [
    ['recep', `20 A duplex receptacle, ${fmtIn(48)} above the slab`],
    ['switch', `Single-pole switch, ${fmtIn(46)} above the slab`],
    ['light', "4' LED strip light on the bottom chords"],
    ['panel', `${spec.service} A sub-panel, fed from the house`],
    ['run', 'Circuit run — routing is the electrician\'s, not this drawing\'s'],
  ];
  for (const [kind, text] of legend) {
    const cx = area.noteX + 8;
    let cy2 = ly;
    if (kind === 'recep') {
      s.circle(cx, cy2, 3.1, LW.medium, { fill: 'var(--surface)' });
      s.line(cx - 3.1, cy2, cx + 3.1, cy2, LW.medium);
      s.line(cx - 1.4, cy2, cx - 1.4, cy2 - 2.6, LW.thin);
      s.line(cx + 1.4, cy2, cx + 1.4, cy2 - 2.6, LW.thin);
    } else if (kind === 'switch') {
      s.circle(cx, cy2, 3.1, LW.medium, { fill: 'var(--surface)' });
      s.text(cx, cy2 + 2, 'S', { size: 5.4, weight: 700 });
    } else if (kind === 'light') {
      s.rect(cx - 7, cy2 - 2, 14, 4, LW.medium);
      s.line(cx - 7, cy2, cx + 7, cy2, LW.thin, { stroke: 'var(--ink-3)' });
    } else if (kind === 'panel') {
      s.rect(cx - 7, cy2 - 3, 14, 6, LW.heavy, { fill: 'var(--surface-2)' });
    } else {
      s.line(cx - 7, cy2, cx + 7, cy2, LW.thin, { stroke: 'var(--ink-3)', dash: '2 2.4' });
    }
    for (const ln of wrapText(text, area.noteW - 24, 5.9)) {
      s.text(area.noteX + 20, cy2 + 2, ln, { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });
      cy2 += 7.2;
    }
    ly = cy2 + 6.5;
  }

  const counts = {
    recep: parts.filter((p) => p.kind.includes('receptacle')).length,
    sw: parts.filter((p) => p.kind === 'Switch').length,
    light: parts.filter((p) => p.sys === 'fixture').length,
  };
  sheetNotes(s, area.noteX, ly + 8, area.noteW, 'Electrical notes', [
    `${counts.recep} receptacles, ${counts.sw} switches, ${counts.light} strip lights off a `
    + `${spec.service} A sub-panel. This is a layout, not a circuit design — an electrician `
    + 'decides how many circuits and what goes on each.',
    'Receptacles at 48" work above a bench; that is a choice, not a rule. Anything at 48" in a '
    + 'shop wants to be 20 A on 12 AWG.',
    'A garage or shop receptacle serving a floor area needs GFCI protection, and the opener '
    + 'receptacle in the ceiling is one of them.',
    'Run everything surface in conduit or keep it inside the studs before the interior face goes '
    + 'on — with girts and no sheathing there is nowhere to hide a cable afterwards.',
    'Bond the metal siding and roofing, and drive a ground rod for the sub-panel: a sub-panel in '
    + 'a separate building takes a four-wire feeder with grounds and neutrals separated.',
  ]);

  s.viewTitle(area.x + 12, area.bottom - 6, 'Electrical plan', s.scale.k, '1');
}

/* ================================================================
   A2.0 — Elevations
   ================================================================ */
function drawElevations(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { notes: false });
  const tr = trussGeometry(spec);
  const H = tr.overallHeight;
  /* Four elevations in a 2 × 2. */
  const cellW = area.w / 2 - 22, cellH = area.h / 2 - 30;
  const longest = Math.max(spec.width, spec.depth) + spec.rakeOverhang * 2 + 24;
  const key = s.pickScale(longest, H + 30, cellW, cellH);
  const f = SCALES.find((z) => z.k === key).f * PT;

  const views = [
    { wall: 'S', name: 'South elevation', run: spec.width },
    { wall: 'N', name: 'North elevation', run: spec.width },
    { wall: 'W', name: 'West elevation', run: spec.depth },
    { wall: 'E', name: 'East elevation', run: spec.depth },
  ];
  views.forEach((v, i) => {
    const col = i % 2, row = (i / 2) | 0;
    const x0 = area.x + col * (area.w / 2) + 26;
    const y0 = area.y + row * (area.h / 2) + cellH - 6;
    s.frame(x0, y0, key, [0, 0, v.run, H], { flipY: true });
    const X = s.mx, Y = s.my;
    const gable = v.wall === 'E' || v.wall === 'W';
    const over = gable ? spec.eaveOverhang : spec.rakeOverhang;

    /* ground */
    s.line(X(-over - 14), Y(0), X(v.run + over + 14), Y(0), LW.cut);
    s.line(X(-over - 14), Y(-4), X(v.run + over + 14), Y(-4), LW.thin,
      { stroke: 'var(--ink-3)' });
    /* wall box */
    s.rect(X(0), Y(spec.wallHeight), s.mlen(v.run), s.mlen(spec.wallHeight), LW.medium);
    /* roof */
    if (gable) {
      /* the gable triangle, seen square on */
      s.poly([[X(-over), Y(spec.wallHeight - over * tr.slope)],
        [X(v.run / 2), Y(tr.peakY + tr.perp)],
        [X(v.run + over), Y(spec.wallHeight - over * tr.slope)]], LW.cut);
    } else {
      /* the eave side: a flat band of roof beyond, with the ridge behind */
      s.line(X(-over), Y(spec.wallHeight), X(v.run + over), Y(spec.wallHeight), LW.cut);
      s.line(X(-over), Y(tr.peakY + tr.perp), X(v.run + over), Y(tr.peakY + tr.perp), LW.medium);
      s.line(X(-over), Y(spec.wallHeight), X(-over), Y(tr.peakY + tr.perp), LW.thin,
        { stroke: 'var(--ink-3)', dash: '4 2' });
      s.line(X(v.run + over), Y(spec.wallHeight), X(v.run + over), Y(tr.peakY + tr.perp),
        LW.thin, { stroke: 'var(--ink-3)', dash: '4 2' });
    }
    /* openings */
    for (const o of openingsOn(v.wall, ops)) {
      const st = stockFor(o);
      const sill = o.head - st.h;
      /* Elevations look at the wall from outside, so the near corner is on the
         left for N and E and on the right for S and W — mirror accordingly. */
      const mirror = v.wall === 'N' || v.wall === 'E';
      const u = mirror ? v.run - o.off - st.w : o.off;
      s.rect(X(u), Y(o.head), s.mlen(st.w), s.mlen(st.h), LW.medium);
      if (o.kind === 'window') {
        s.line(X(u + 1.5), Y(o.head - 1.5), X(u + st.w - 1.5), Y(o.head - 1.5), LW.thin,
          { stroke: 'var(--ink-3)' });
      } else if (o.kind === 'overhead') {
        for (let y = sill + 21; y < o.head - 2; y += 21) {
          s.line(X(u), Y(y), X(u + st.w), Y(y), LW.thin, { stroke: 'var(--ink-3)' });
        }
      }
      s.text(X(u + st.w / 2), Y(sill) - 4, openingTag(o),
        { size: 5, fill: 'var(--ink-3)' });
    }
    /* heights */
    s.dimV(0, spec.wallHeight, -over - 20 / f, null, 0);
    s.dimV(0, tr.peakY + tr.perp, v.run + over + 20 / f, null, v.run);
    s.viewTitle(x0, y0 + 26, v.name, key, String(i + 1));
  });
  s.scale = SCALES.find((z) => z.k === key);
}

/* ================================================================ */
const PLANS = [
  { id: 'fdn', number: 'S1.0', title: 'Foundation plan', draw: drawFoundationPlan },
  { id: 'fdn-det', number: 'S1.1', title: 'Foundation details', draw: drawFoundationDetails,
    scaleLabel: 'As noted' },
  { id: 'framing', number: 'S2.0', title: 'Framing plan', draw: drawFramingPlan },
  { id: 'roof', number: 'S3.0', title: 'Roof framing plan', draw: drawRoofPlan },
  { id: 'elev', number: 'A2.0', title: 'Elevations', draw: drawElevations },
  { id: 'elec', number: 'E1.0', title: 'Electrical plan', draw: drawElectricalPlan },
];

function renderShopPlans() {
  renderPlans('plans', PLANS, {
    project: 'Shop building',
    subtitle: (spec) => `${fmtFt(spec.width)} × ${fmtFt(spec.depth)}, `
      + `${fmtFt(spec.wallHeight)} walls, ${spec.pitch}/12 · Drain, Oregon`,
    warning: PLAN_WARNING,
    date: 'Current model',
  });
}
