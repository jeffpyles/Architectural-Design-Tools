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

/* A section frame. Plans run +v DOWN the page; a section is talked about in
   heights above the slab, so this flips it — and it flips it inside the frame
   rather than in a local helper, so s.callout(), s.dimH() and everything else
   in the kit land where the drawing is rather than where a plan would put
   them. `vTop` is the height at the top edge of the view. */
function sectionFrame(s, x, y, scaleKey, uLo, uHi, vTop) {
  s.frame(x, y, scaleKey, [uLo, vTop, uHi, vTop], { flipY: true });
  return { X: s.mx, Y: s.my, L: s.mlen };
}

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

/* A detail mark: which detail, and which sheet it is drawn on. */
function detailMark(s, x, y, mark, sheet) {
  const r = 8.4;
  const cx = x + 22, cy = y - 22;
  s.line(x, y, cx - r * 0.7, cy + r * 0.7, LW.thin, { stroke: 'var(--ink-2)' });
  s.circle(x, y, 1.1, 0, { fill: 'var(--ink-2)' });
  s.circle(cx, cy, r, LW.medium, { fill: 'var(--surface)' });
  s.line(cx - r, cy, cx + r, cy, LW.thin, { stroke: 'var(--ink-3)' });
  s.text(cx, cy - 1.6, mark, { size: 6.5, weight: 700 });
  s.text(cx, cy + 6.4, sheet, { size: 5.2, fill: 'var(--ink-2)' });
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
  const { X: AX, Y: AY, L } = sectionFrame(s, area.x + 32, area.y + 20, keyA,
    -12, spec.turndownWidth + 18, 16);

  /* Earth outside, base under the slab, then the concrete — each hatch on the
     material it is actually hatching, so the stipple does not end up in the
     gravel and the diagonals in the pour. */
  const tw = spec.turndownWidth, td = spec.turndownDepth, st = spec.slabThickness;
  s.hatch(AX(-12), AY(-st), L(10), L(td), 'earth');
  s.hatch(AX(tw), AY(-st - spec.gravelDepth), L(26), L(td - st), 'earth');
  s.hatch(AX(tw), AY(-st), L(26), L(spec.gravelDepth), 'gravel');
  s.hatch(AX(-2), AY(0), L(tw + 28), L(st), 'concrete');
  s.hatch(AX(-2), AY(-st), L(tw + 2), L(td - st), 'concrete');
  s.poly([
    [AX(-2), AY(0)], [AX(tw + 26), AY(0)],
    [AX(tw + 26), AY(-st)], [AX(tw), AY(-st)],
    [AX(tw), AY(-td)], [AX(-2), AY(-td)],
  ], LW.cut);

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
    const { X: BX, Y: BY, L: BL } = sectionFrame(s, area.x + colW + 32, area.y + 20, keyB,
      -13, pf.worstPad.side + 13, 16);
    const side = pf.worstPad.side, th = pf.thickness, dep = pf.depth;

    s.hatch(BX(-13), BY(-2), BL(13), BL(dep + 4), 'earth');
    s.hatch(BX(side), BY(-2), BL(13), BL(dep + 4), 'earth');
    if (pf.form === 'tube') {
      /* One pour, full depth, bearing on its own end — there is no pad and no
         stem, which is the whole point of the tube. */
      s.hatch(BX(0), BY(0), BL(side), BL(dep), 'concrete');
      s.rect(BX(0), BY(0), BL(side), BL(dep), LW.cut);
      s.line(BX(0) + 1.4, BY(0), BX(0) + 1.4, BY(-dep), LW.thin, { stroke: 'var(--ink-3)' });
      s.line(BX(side) - 1.4, BY(0), BX(side) - 1.4, BY(-dep), LW.thin, { stroke: 'var(--ink-3)' });
      s.callout(side / 2, -dep * 0.45, 40, 16,
        `${fmtIn(side)} FIBRE FORM, ${fmtN(pf.worstPad.area, 2)} SF BEARING`, { size: 5.2 });
      s.callout(side / 2, -dep * 0.75, -34, 22, '4 × #4 VERTICAL, #3 TIES @ 12"', { size: 5.2 });
      for (const u of [4, side - 4]) {
        s.line(BX(u), BY(-3), BX(u), BY(-dep + 3), LW.medium);
      }
    } else {
      s.hatch(BX(0), BY(-(dep - th)), BL(side), BL(th), 'concrete');
      s.rect(BX(0), BY(-(dep - th)), BL(side), BL(th), LW.cut);
      /* the pier stem, from the top of the pad up to grade */
      const stemW = 12, sx = (side - stemW) / 2;
      if (dep - th > 0.5) {
        s.hatch(BX(sx), BY(0), BL(stemW), BL(dep - th), 'concrete');
        s.rect(BX(sx), BY(0), BL(stemW), BL(dep - th), LW.cut);
      }
      s.callout(side / 2, -(dep - th / 2), 40, 16,
        `${fmtIn(side)} SQ × ${fmtIn(th)}, ${fmtN(pf.worstPad.area, 2)} SF BEARING`,
        { size: 5.2 });
    }
    /* the post and its base */
    s.rect(BX(side / 2 - 2.75), BY(14), BL(5.5), BL(12.8), LW.heavy);
    s.hatch(BX(side / 2 - 2.75), BY(14), BL(5.5), BL(12.8), 'wood');
    s.rect(BX(side / 2 - 3.4), BY(1.2), BL(6.8), BL(1.2), LW.medium, { fill: 'var(--ink-2)' });
    s.line(BX(-13), BY(0), BX(0), BY(0), LW.medium, { stroke: 'var(--ink-2)' });
    s.line(BX(side), BY(0), BX(side + 13), BY(0), LW.medium, { stroke: 'var(--ink-2)' });

    s.dimLine(BX(0), BY(-dep) + 13, BX(side), BY(-dep) + 13, fmtIn(side));
    s.dimLine(BX(side) + 14, BY(0), BX(side) + 14, BY(-dep), fmtIn(dep));
    s.viewTitle(area.x + colW + 32, area.y + rowTop - 8,
      pf.form === 'tube' ? 'Lean-to post on a Sonotube' : 'Lean-to post pad', keyB, 'B');
  }

  /* ---- detail C: the joint the slab thickness turns on ----
     This is the whole finding on one drawing: a wheel at a plain sawcut is
     working on a free edge, and a dowel is what stops it being one. */
  {
    const st2 = spec.slabThickness;
    const cModelW = 60, cModelH = st2 + spec.gravelDepth + 22;
    const keyC = s.pickScale(cModelW, cModelH, area.w - 60, rowBot - 40, '3');
    const { X: CX, Y: CY, L: CL } = sectionFrame(s, area.x + 34, area.y + rowTop + 24, keyC,
      -6, 54, 14);

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

  /* Point at the jamb detail, which is the one that is a plan cut and so the
     one this sheet can carry a mark for. */
  {
    const typ = ops.filter((o) => o.kind === 'window')
      .sort((a, b) => stockFor(b).w - stockFor(a).w)[0];
    if (typ) {
      const e = wallExtent(typ.wall, spec);
      const at = e.axis === 'x'
        ? { x: typ.off, z: e.c0 + T / 2 } : { x: e.c0 + T / 2, z: typ.off };
      detailMark(s, X(at.x), Y(at.z), '2', 'A6.0');
    }
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
   S2.1 — Wall section

   Cut through a bearing wall from the bottom of the footing to the eave. The
   middle of the wall is broken out, which is what lets it be drawn at 3/4"
   instead of the quarter inch a full-height section fits into on letter
   paper — and nothing happens in the middle of a wall anyway.
   ================================================================ */
function drawWallSection(s) {
  const spec = state.spec;
  const area = sheetArea(s, { noteWidth: 168 });
  const tr = trussGeometry(spec);
  const T = LUMBER[spec.studSize].d;
  const H = spec.wallHeight;
  const eo = spec.eaveOverhang;
  const sk = spec.wallSkin === 'sheathing' ? 0.4375 : 0;   // exterior OSB
  const gt = spec.wallSkin === 'girts' ? LUMBER[spec.girtSize].t : 0;
  const outT = sk + gt + 0.5;                              // to the face of the siding

  /* Two windows onto the same section, at the same scale, with a break
     between. Model u runs across the wall, v UP from the top of the slab. */
  const uLo = -(eo + 14), uHi = T + 28;
  const baseV = [-(spec.turndownDepth + 6), 34];           // footing to 2'-10"
  const headV = [H - 34, H + tr.heelSpace + 26];           // 2'-10" of wall to the roof
  const uSpan = uHi - uLo;
  const vTotal = (baseV[1] - baseV[0]) + (headV[1] - headV[0]);
  const BREAK = 28;                                        // points between the two
  const key = s.pickScale(uSpan, vTotal, area.w - 70, area.h - BREAK - 34, '1.5');
  const f = SCALES.find((z) => z.k === key).f * PT;

  const x0 = area.x + 52;
  const headH = (headV[1] - headV[0]) * f;
  const baseH = (baseV[1] - baseV[0]) * f;
  const headTop = area.y + 12;
  const baseTop = headTop + headH + BREAK;

  /* One band of the section, clipped to its own slice so the wall runs off the
     edge of both rather than straight through the break. */
  const band = (pageTop, vTop, hPts) => {
    s.clipTo(area.x, pageTop - 1, area.w, hPts + 2);
    return sectionFrame(s, x0, pageTop, key, uLo, uHi, vTop);
  };

  /* ---------- the head ----------
     The wall's outside face of framing is u = 1, which is also where the truss
     bears, so truss coordinates and section coordinates line up: the chord
     working line runs z = u - 1 in from that face, rising inward toward a
     ridge that is off this drawing. */
  {
    const { X, Y, L } = band(headTop, headV[1], headH);
    const bcBot = tr.bcBot, bcTop = tr.bcTop;
    const eaveU = 1 - eo;
    const tcBot = (u) => bcTop + (u - 1) * tr.slope;        // top chord underside
    const tcTop = (u) => tcBot(u) + tr.perp;                // and its top face

    /* wall below, running off the bottom of the band */
    s.rect(X(1), Y(H - 3), L(T), L(H - 3 - headV[0] + 2), LW.medium);
    s.hatch(X(1), Y(H - 3), L(T), L(H - 3 - headV[0] + 2), 'wood');
    if (spec.insulation) s.hatch(X(1), Y(H - 3), L(T), L(H - 3 - headV[0] + 2), 'insul');

    /* double top plate, cut */
    s.rect(X(1), Y(H), L(T), L(3), LW.cut);
    s.hatch(X(1), Y(H), L(T), L(3), 'wood');
    s.line(X(1), Y(H - 1.5), X(1 + T), Y(H - 1.5), LW.light);

    /* bottom chord, cut, bearing on the plate and running inward */
    s.rect(X(1), Y(bcTop), L(uHi - 1), L(tr.chord.d), LW.cut);
    s.hatch(X(1), Y(bcTop), L(uHi - 1), L(tr.chord.d), 'wood');
    if (spec.heelHeight > 0) {
      s.rect(X(1), Y(bcBot), L(T), L(spec.heelHeight), LW.medium);
      s.callout(1 + T / 2, bcBot - spec.heelHeight / 2, 48, 16,
        `${fmtIn(spec.heelHeight)} RAISED HEEL`, { size: 5.2 });
    }

    /* top chord, a sloping band from the eave up and inward */
    s.poly([[X(eaveU), Y(tcBot(eaveU))], [X(uHi), Y(tcBot(uHi))],
      [X(uHi), Y(tcTop(uHi))], [X(eaveU), Y(tcTop(eaveU))]], LW.cut);
    s.hatch(X(eaveU), Y(tcTop(uHi)), L(uHi - eaveU), L(tcTop(uHi) - tcBot(eaveU)), 'wood');

    /* roof build-up on top of it */
    if (spec.roofDeck === 'osb') {
      s.line(X(eaveU), Y(tcTop(eaveU) + 0.44), X(uHi), Y(tcTop(uHi) + 0.44), LW.medium);
      s.line(X(eaveU), Y(tcTop(eaveU) + 1.1), X(uHi), Y(tcTop(uHi) + 1.1), LW.heavy);
    } else {
      for (let u = eaveU + 2; u < uHi; u += spec.purlinSpacing / 4) {
        s.rect(X(u), Y(tcTop(u) + 1.5), L(3.5), L(1.5), LW.light);
      }
      s.line(X(eaveU), Y(tcTop(eaveU) + 1.8), X(uHi), Y(tcTop(uHi) + 1.8), LW.heavy);
    }

    /* fascia hung off the chord ends, and the soffit line back to the wall */
    s.rect(X(eaveU - 1.5), Y(tcTop(eaveU)), L(1.5), L(7.25), LW.medium);
    s.line(X(eaveU), Y(tcBot(eaveU)), X(1 - outT), Y(tcBot(1)), LW.light,
      { stroke: 'var(--ink-3)', dash: '3 2' });

    /* girts or sheathing, then the siding face */
    if (gt) {
      for (let v = H - 4; v > headV[0]; v -= spec.girtSpacing) {
        s.rect(X(1 - gt), Y(v), L(gt), L(3.5), LW.light);
      }
    } else {
      s.rect(X(1 - sk), Y(H + 3), L(sk), L(H + 3 - headV[0]), LW.medium);
    }
    s.line(X(1 - outT), Y(tcBot(1)), X(1 - outT), Y(headV[0]), LW.heavy);

    /* the lid */
    if (spec.ceilingDrywall) {
      s.rect(X(1 + T), Y(bcBot), L(uHi - 1 - T), L(0.625), LW.medium);
      s.hatch(X(1 + T), Y(bcBot + spec.ceilingInsulation), L(uHi - 1 - T),
        L(spec.ceilingInsulation), 'insul');
      s.callout(uHi - 4, bcBot + spec.ceilingInsulation / 2, -18, 46,
        `${fmtIn(spec.ceilingInsulation)} BLOWN OVER A ⅝" CEILING`, { size: 5.2 });
    }

    /* Annotation is not part of the cut, so it comes out from under the clip —
       otherwise every leader that reaches for clear space gets its text
       trimmed off at the edge of the band. */
    s.layerOff();
    s.callout(1 + T / 2, H + 1.5, 46, 30, `DOUBLE ${spec.studSize} TOP PLATE`, { size: 5.2 });
    s.callout(1 + T + 8, bcTop - tr.chord.d / 2, 40, -14,
      `${tr.chordSize} BOTTOM CHORD — TRUSS BEARS ON THE PLATE`, { size: 5.2 });
    s.callout(eaveU + eo * 0.45, tcTop(eaveU + eo * 0.45) + 2, -8, -26,
      spec.roofing === 'metal'
        ? (spec.roofDeck === 'osb' ? '26 GA PANEL ON OSB DECK'
          : `26 GA PANEL ON ${spec.purlinSize} PURLINS @ ${fmtIn(spec.purlinSpacing)} O.C.`)
        : 'ASPHALT SHINGLE ON UNDERLAYMENT AND DECK',
      { size: 5.2 });

    s.dimLine(X(eaveU), Y(headV[1]) - 9, X(1), Y(headV[1]) - 9, fmtIn(eo));
    s.dimLine(X(uHi) + 16, Y(bcTop), X(uHi) + 16, Y(bcBot), fmtIn(tr.chord.d));
  }

  /* ---------- the break ---------- */
  s.layerOff();
  {
    const y = headTop + headH + BREAK / 2;
    const xa = x0 + (1 - uLo) * f - 16, xb = x0 + (1 + T - uLo) * f + 16;
    let d = `M${fx(xa)},${fx(y - 4)}`;
    const n = 7;
    for (let i = 1; i <= n; i++) {
      d += ` L${fx(xa + (xb - xa) * (i / n))},${fx(y + (i % 2 ? 4 : -4))}`;
    }
    s.path(d, LW.medium, { stroke: 'var(--ink-2)' });
    s.text(xb + 10, y + 2,
      `${fmtFt(headV[0] - baseV[1])} OF WALL NOT SHOWN`,
      { size: 5.4, anchor: 'start', fill: 'var(--ink-3)' });
  }

  /* ---------- the base ---------- */
  {
    const { X, Y, L } = band(baseTop, baseV[1], baseH);
    const st = spec.slabThickness, td = spec.turndownDepth, tw = spec.turndownWidth;

    s.hatch(X(uLo), Y(-st), L(-uLo), L(td), 'earth');
    s.hatch(X(tw), Y(-st), L(uHi - tw), L(spec.gravelDepth), 'gravel');
    /* Two rectangles rather than one, so the stipple lands on the concrete and
       not on the base under the slab. */
    s.hatch(X(0), Y(0), L(uHi), L(st), 'concrete');
    s.hatch(X(0), Y(-st), L(tw), L(td - st), 'concrete');
    s.poly([[X(0), Y(0)], [X(uHi), Y(0)], [X(uHi), Y(-st)], [X(tw), Y(-st)],
      [X(tw), Y(-td)], [X(0), Y(-td)]], LW.cut);
    s.path(`M${fx(X(uHi))},${fx(Y(-st) + 1.2)} L${fx(X(0))},${fx(Y(-st) + 1.2)} `
      + `L${fx(X(0))},${fx(Y(-td))}`, LW.medium, { stroke: 'var(--ink-2)', dash: '3 1.6' });

    /* plate, bolt, stud, skin */
    s.rect(X(1), Y(1.5), L(T), L(1.5), LW.cut);
    s.hatch(X(1), Y(1.5), L(T), L(1.5), 'wood');
    s.rect(X(1), Y(baseV[1]), L(T), L(baseV[1] - 1.5), LW.medium);
    s.hatch(X(1), Y(baseV[1]), L(T), L(baseV[1] - 1.5), 'wood');
    const bx = X(1 + T / 2);
    s.line(bx, Y(4), bx, Y(-7), LW.heavy);
    s.line(bx, Y(-7), bx + L(5), Y(-7), LW.heavy);
    s.rect(bx - 5, Y(1.7), 10, 2, LW.light, { fill: 'var(--ink-2)' });
    if (gt) {
      for (let v = baseV[1] - 4; v > 2; v -= spec.girtSpacing) {
        s.rect(X(1 - gt), Y(v), L(gt), L(3.5), LW.light);
      }
    } else {
      s.rect(X(1 - sk), Y(baseV[1]), L(sk), L(baseV[1]), LW.medium);
    }
    s.line(X(1 - outT), Y(baseV[1]), X(1 - outT), Y(-2), LW.heavy);
    if (spec.insulation) s.hatch(X(1), Y(baseV[1] - 4), L(T), L(baseV[1] - 8), 'insul');

    /* grade */
    s.line(X(uLo), Y(-st), X(0), Y(-st), LW.medium, { stroke: 'var(--ink-2)' });
    s.text(X(uLo), Y(-st) - 3, 'GRADE', { size: 5.2, anchor: 'start', fill: 'var(--ink-3)' });

    const sl2 = slabDesign(spec);
    for (let i = 0; i < sl2.turndownBars; i++) {
      s.circle(X(3 + i * (tw - 6)), Y(-td + 3), 1.6, LW.medium, { fill: 'var(--ink)' });
    }
    if (spec.slabReinf === 'rebar') {
      for (let u = 4; u < uHi; u += sl2.spacing) {
        s.circle(X(u), Y(-st / 2), 1.4, LW.medium, { fill: 'var(--ink)' });
      }
    }

    s.layerOff();
    s.dimLine(X(0) - 16, Y(0), X(0) - 16, Y(-td), fmtIn(td));
    s.dimLine(X(uHi) + 16, Y(0), X(uHi) + 16, Y(-st), fmtIn(st));
    s.dimLine(X(0), Y(-td) - 13, X(tw), Y(-td) - 13, fmtIn(tw));
    s.callout(1 + T / 2, 0.75, 54, -14, `${spec.studSize} PT PLATE ON SILL SEALER`,
      { size: 5.2 });
    s.callout(1 + T / 2, -7, 54, 22, '½" ANCHOR BOLT, 7" EMBED, PLATE WASHER', { size: 5.2 });
    s.callout(tw / 2, -td + 3, -34, 22,
      `${sl2.turndownBars} × ${sl2.turndownBar.size} CONTINUOUS`, { size: 5.2 });
    if (spec.slabReinf === 'rebar') {
      s.callout(uHi * 0.62, -st / 2, 24, -30,
        `${sl2.bar.size} @ ${fmtIn(sl2.spacing)} O.C. EACH WAY, ON CHAIRS`, { size: 5.2 });
    }
  }

  /* ---------- the column ---------- */
  s.layerOff();
  let cy = sheetNotes(s, area.noteX, area.y + 8, area.noteW, 'Assembly', [
    `${spec.studSize} studs at ${fmtIn(spec.studSpacing)} o.c., treated bottom plate on a sill `
    + `sealer, double top plate. Wall height ${fmtFt(H)} slab to top of plate.`,
    spec.wallSkin === 'girts'
      ? `${spec.girtSize} girts flat on the outside of the studs at ${fmtIn(spec.girtSpacing)} o.c., `
        + 'no structural sheathing except at the braced panels. Housewrap or a rigid air barrier '
        + 'on the studs, or the wind washes straight through the cavity.'
      : '7/16" OSB sheathing over the studs, housewrap, then the siding.',
    spec.roofDeck === 'osb'
      ? '7/16" OSB deck with H-clips at mid-span, underlayment, then the roofing.'
      : `${spec.purlinSize} purlins flat at ${fmtIn(spec.purlinSpacing)} o.c. on the top chords, `
        + 'panel screwed through to the purlins at every flat.',
    spec.insulation ? 'R-21 batt in the wall cavity.' : 'No wall insulation.',
    spec.ceilingDrywall
      ? `⅝" ceiling on the bottom chords with ${fmtIn(spec.ceilingInsulation)} of blown over it.`
      : 'No ceiling — the trusses are open to the shop.',
  ]);
  cy = sheetNotes(s, area.noteX, cy + 12, area.noteW, 'Heights', [
    `Top of slab is the datum for everything on these sheets — 0'-0".`,
    `Top plate ${fmtFt(H)}. Bottom chord ${fmtFt(tr.bcBot)}. `
    + `Peak ${fmtFt(tr.overallHeight)} above the slab.`,
    `Eave overhang ${fmtIn(eo)} horizontal; rake ${fmtIn(spec.rakeOverhang)}.`,
    `Footing bottom ${fmtIn(spec.turndownDepth)} below the slab, which is `
    + `${fmtIn(spec.frostDepth)} of frost cover below grade.`,
  ]);

  s.viewTitle(x0, area.bottom - 6, 'Wall section at a bearing wall', key, '1');
  s.scale = SCALES.find((z) => z.k === key);
}

/* ================================================================
   S2.2 — Building section

   The transverse cut: through both bearing walls, across the truss, with the
   lean-to if there is one. Where the wall section says how the assembly is put
   together, this says how big the room is.
   ================================================================ */
function drawBuildingSection(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { noteWidth: 156 });
  const tr = trussGeometry(spec);
  const T = LUMBER[spec.studSize].d;
  const D = spec.depth;                          // the truss spans this way
  const eo = spec.eaveOverhang;
  const L = wallLayers(spec);
  const lt = leanToDesign(spec);
  /* Only a lean-to on a wall this section actually cuts through shows up. */
  const ltHere = lt && !lt.impossible && (lt.wall === 'N' || lt.wall === 'S') ? lt : null;

  const reach = ltHere ? ltHere.projection + 18 : 0;
  const uLo = (ltHere && ltHere.wall === 'N' ? -reach : 0) - eo - 26;
  const uHi = D + (ltHere && ltHere.wall === 'S' ? reach : 0) + eo + 26;
  const vHi = tr.overallHeight + 26, vLo = -(spec.turndownDepth + 10);
  const key = s.pickScale(uHi - uLo, vHi - vLo, area.w - 40, area.h - 30);
  const f = SCALES.find((z) => z.k === key).f * PT;
  const x0 = area.x + (area.w - (uHi - uLo) * f) / 2;
  const y0 = area.y + 14 + Math.max(0, (area.h - 44 - (vHi - vLo) * f) / 2);
  const { X, Y } = sectionFrame(s, x0, y0, key, uLo, uHi, vHi);
  const Lp = (v) => s.mlen(v);

  /* ---- ground, slab, turndown ---- */
  const st = spec.slabThickness, td = spec.turndownDepth, tw = spec.turndownWidth;
  s.hatch(X(uLo), Y(-st), Lp(-uLo), Lp(td), 'earth');
  s.hatch(X(D), Y(-st), Lp(uHi - D), Lp(td), 'earth');
  s.hatch(X(tw), Y(-st), Lp(D - tw * 2), Lp(spec.gravelDepth), 'gravel');
  s.hatch(X(0), Y(0), Lp(D), Lp(st), 'concrete');
  s.hatch(X(0), Y(-st), Lp(tw), Lp(td - st), 'concrete');
  s.hatch(X(D - tw), Y(-st), Lp(tw), Lp(td - st), 'concrete');
  /* One outline: a slab with a leg down at each end, which is exactly what
     these ten edges are. */
  s.path(`M${fx(X(0))},${fx(Y(0))} L${fx(X(D))},${fx(Y(0))} L${fx(X(D))},${fx(Y(-st))} `
    + `L${fx(X(D))},${fx(Y(-st))} L${fx(X(D))},${fx(Y(-td))} L${fx(X(D - tw))},${fx(Y(-td))} `
    + `L${fx(X(D - tw))},${fx(Y(-st))} L${fx(X(tw))},${fx(Y(-st))} L${fx(X(tw))},${fx(Y(-td))} `
    + `L${fx(X(0))},${fx(Y(-td))} Z`, LW.cut);
  s.line(X(uLo), Y(-st), X(0), Y(-st), LW.medium, { stroke: 'var(--ink-2)' });
  s.line(X(D), Y(-st), X(uHi), Y(-st), LW.medium, { stroke: 'var(--ink-2)' });

  /* ---- the two bearing walls, cut ---- */
  for (const [u0, side] of [[0, 'N'], [D - T, 'S']]) {
    s.rect(X(u0), Y(spec.wallHeight), Lp(T), Lp(spec.wallHeight), LW.cut);
    s.hatch(X(u0), Y(spec.wallHeight), Lp(T), Lp(spec.wallHeight), 'wood');
    if (spec.insulation) s.hatch(X(u0), Y(spec.wallHeight), Lp(T), Lp(spec.wallHeight), 'insul');
    /* skin outside, drywall inside */
    const out = side === 'N' ? -1 : 1;
    const face = side === 'N' ? u0 : u0 + T;
    s.rect(X(face + out * L.out), Y(spec.wallHeight), Lp(L.out), Lp(spec.wallHeight), LW.medium);
    if (L.inner) {
      s.rect(X(face - out * L.inner), Y(spec.wallHeight), Lp(L.inner), Lp(spec.wallHeight),
        LW.light);
    }
    /* openings on this wall, seen beyond the cut */
    for (const o of openingsOn(side, ops)) {
      const so = stockFor(o);
      s.rect(X(u0), Y(o.head), Lp(T), Lp(so.h), LW.thin,
        { stroke: 'var(--ink-3)', dash: '4 2.5' });
    }
  }

  /* ---- the truss ---- */
  const chordBand = (a, b, depth) => s.poly([[X(a[0]), Y(a[1])], [X(b[0]), Y(b[1])],
    [X(b[0]), Y(b[1] - depth)], [X(a[0]), Y(a[1] - depth)]], LW.heavy);
  chordBand([0, tr.bcTop], [D, tr.bcTop], tr.chord.d);
  const eaveY = tr.bcTop - eo * tr.slope;
  chordBand([-eo, eaveY + tr.perp], [D / 2, tr.peakY + tr.perp], tr.perp);
  chordBand([D + eo, eaveY + tr.perp], [D / 2, tr.peakY + tr.perp], tr.perp);
  for (const w of tr.webs) s.line(X(w.a[0]), Y(w.a[1]), X(w.b[0]), Y(w.b[1]), LW.medium);
  /* the roof surface over it */
  const deck = spec.roofDeck === 'osb' ? 1.1 : 1.8;
  s.line(X(-eo), Y(eaveY + tr.perp + deck), X(D / 2), Y(tr.peakY + tr.perp + deck), LW.cut);
  s.line(X(D + eo), Y(eaveY + tr.perp + deck), X(D / 2), Y(tr.peakY + tr.perp + deck), LW.cut);
  for (const u of [-eo, D + eo]) {
    s.rect(X(u - (u < 0 ? 0 : 1.5)), Y(eaveY + tr.perp), Lp(1.5), Lp(7.25), LW.medium);
  }

  /* ---- the lid ---- */
  if (spec.ceilingDrywall) {
    s.rect(X(T), Y(tr.bcBot), Lp(D - T * 2), Lp(0.625), LW.medium);
    s.hatch(X(T), Y(tr.bcBot + spec.ceilingInsulation), Lp(D - T * 2),
      Lp(spec.ceilingInsulation), 'insul');
  }

  /* ---- the lean-to, if this cut runs through it ---- */
  if (ltHere) {
    const out = ltHere.wall === 'S' ? 1 : -1;
    const wallFace = ltHere.wall === 'S' ? D : 0;
    const at = (p) => wallFace + out * p;
    const P = ltHere.projection;
    const rd = LUMBER[ltHere.rafter.size].d / Math.cos(ltHere.angle);
    /* rafter, from the ledger down to the beam */
    const rr = ltHere.rafterRun == null ? P : ltHere.rafterRun;
    s.poly([[X(at(0)), Y(spec.wallHeight)], [X(at(rr)), Y(spec.wallHeight - rr * ltHere.slope)],
      [X(at(rr)), Y(spec.wallHeight - rr * ltHere.slope - rd)],
      [X(at(0)), Y(spec.wallHeight - rd)]], LW.heavy);
    /* beam and post */
    s.rect(X(at(P) - (out > 0 ? ltHere.beam.thickness : 0)), Y(ltHere.beamTop),
      Lp(ltHere.beam.thickness), Lp(ltHere.beam.depth), LW.cut);
    s.hatch(X(at(P) - (out > 0 ? ltHere.beam.thickness : 0)), Y(ltHere.beamTop),
      Lp(ltHere.beam.thickness), Lp(ltHere.beam.depth), 'wood');
    const px = at(P - ltHere.beam.thickness / 2);
    s.rect(X(px - 2.75), Y(ltHere.beamBot), Lp(5.5), Lp(ltHere.beamBot), LW.medium);
    /* the footing under it */
    const pf = postFooting(spec);
    if (pf) {
      if (pf.form === 'tube') {
        s.hatch(X(px - pf.worstPad.d / 2), Y(0), Lp(pf.worstPad.d), Lp(pf.depth), 'concrete');
        s.rect(X(px - pf.worstPad.d / 2), Y(0), Lp(pf.worstPad.d), Lp(pf.depth), LW.cut);
      } else {
        const sd = pf.worstPad.side;
        s.hatch(X(px - sd / 2), Y(-(pf.depth - pf.thickness)), Lp(sd), Lp(pf.thickness), 'concrete');
        s.rect(X(px - sd / 2), Y(-(pf.depth - pf.thickness)), Lp(sd), Lp(pf.thickness), LW.cut);
        s.rect(X(px - 6), Y(0), Lp(12), Lp(pf.depth - pf.thickness), LW.cut);
      }
    }
    /* roof over the rafters */
    s.line(X(at(0)), Y(spec.wallHeight + 1.8), X(at(P)), Y(spec.wallHeight - P * ltHere.slope + 1.8),
      LW.cut);
    s.dimLine(X(px), Y(ltHere.beamBot) + 14, X(px), Y(0) + 14, fmtFt(ltHere.beamBot));
    s.callout(at(P / 2), spec.wallHeight - (P / 2) * ltHere.slope - rd, 0, 40,
      `LEAN-TO — ${fmtFt(P)}, ${ltHere.rafter.label} AT ${fmtIn(spec.leanToSpacing)} O.C. `
      + `${ltHere.flush ? 'HUNG OFF THE BEAM FACE' : 'ON THE BEAM'}`,
      { size: 5.4, width: 120 });
  }

  /* ---- heights, which is what a building section is for ---- */
  const offA = 34 / f, offB = 58 / f;
  s.dimV(0, spec.wallHeight, -eo - offA, null, 0);
  /* A raised heel is the only thing that puts the bottom chord anywhere other
     than the top plate, so it is the only time that second string says
     anything the first one did not. */
  if (spec.heelHeight > 0) s.dimV(0, tr.bcBot, -eo - offB, null, 0);
  s.dimV(0, tr.overallHeight, D + eo + offA, null, D);
  s.dimH(0, D, -offA, null, 0);
  s.dimH(-eo, D + eo, -offB, null, -eo);
  s.line(X(D / 2), Y(vLo), X(D / 2), Y(vHi - 4), LW.thin,
    { stroke: 'var(--ink-3)', dash: '9 2.5 1.5 2.5' });
  s.text(X(D / 2), Y(vHi - 4) - 4, 'RIDGE', { size: 5.4, fill: 'var(--ink-3)' });

  s.callout(D * 0.5, tr.bcBot + 1, 0, -34,
    `${tr.count} TRUSSES AT ${fmtIn(spec.trussSpacing)} O.C. — SEE S3.1`,
    { size: 5.4, width: 120 });
  s.callout(D * 0.28, tr.bcBot - 8, -20, 34,
    spec.ceilingDrywall
      ? `${fmtFt(tr.bcBot)} CLEAR TO THE CEILING`
      : `${fmtFt(tr.bcBot)} CLEAR TO THE BOTTOM CHORD`,
    { size: 5.4, width: 120 });

  let cy = sheetNotes(s, area.noteX, area.y + 8, area.noteW, 'Heights', [
    `Top of slab is 0'-0" on every sheet. Top plate ${fmtFt(spec.wallHeight)}, `
    + `bottom chord ${fmtFt(tr.bcBot)}, peak ${fmtFt(tr.overallHeight)}.`,
    `Clear under the trusses is ${fmtFt(tr.bcBot)}. The tallest opening is `
    + `${fmtFt(Math.max(...ops.map((o) => o.head)))} to its head, which leaves `
    + `${fmtIn(spec.wallHeight - Math.max(...ops.map((o) => o.head)))} of wall above it.`,
    ltHere ? `Lean-to beam bottom ${fmtFt(ltHere.beamBot)} — clear enough for `
      + `${ltHere.beamBot >= 84 ? 'a vehicle' : 'walking under, not for driving under'}.`
      : (lt && !lt.impossible
        ? `The lean-to is on the ${WALLS[lt.wall].label.toLowerCase()} wall, which runs `
          + 'parallel to this cut, so it is not in this view. It is on the plans and the '
          + 'wall section.'
        : 'No lean-to.'),
  ]);
  cy = sheetNotes(s, area.noteX, cy + 12, area.noteW, 'What this cut shows', [
    'Looking north, cut across the middle of the building, so the trusses span left to '
    + 'right and the bearing walls are the two you can see.',
    'Openings on the cut walls are shown dashed — they are beyond the cut, not in it.',
    'The wall assembly itself is on S2.1; this sheet is about how big the room is.',
  ]);

  s.viewTitle(area.x + 10, area.bottom - 6, 'Building section', key, '1');
  s.scale = SCALES.find((z) => z.k === key);
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

/* One symbol routine for the plan and the legend, so a symbol on the drawing
   and the same symbol in the key cannot drift apart. */
function elecSymbol(s, x, y, d, over) {
  const key = (d.items || [])[0];
  const dev = EDEVICE[key];
  const col = over ? 'var(--keel)' : 'var(--ink)';
  const lw = over ? LW.heavy : LW.medium;
  if (!dev) {
    s.circle(x, y, 3.1, lw, { fill: 'var(--surface)', stroke: col });
    return;
  }
  if (dev.kind === 'fixture') {
    const long = key === 'hilight' ? 11 : 7;
    s.rect(x - long, y - 2, long * 2, 4, lw, { stroke: col });
    s.line(x - long, y, x + long, y, LW.thin, { stroke: 'var(--ink-3)' });
    return;
  }
  if (dev.kind === 'switch') {
    s.circle(x, y, 3.1, lw, { fill: 'var(--surface)', stroke: col });
    s.text(x, y + 2, key === 'sw3' ? '3' : key === 'dim' ? 'D' : 'S',
      { size: 5.2, weight: 700, fill: col });
    return;
  }
  if (dev.kind === 'data' || dev.kind === 'blank') {
    s.circle(x, y, 3.1, lw, { fill: 'var(--surface)', stroke: col });
    s.text(x, y + 2, dev.kind === 'data' ? 'T' : '—', { size: 5.2, fill: col });
    return;
  }
  /* A receptacle: the half circle with its prongs. Two circles for 240 V,
     because that is the one you do not want to plug the wrong thing into. */
  s.circle(x, y, 3.1, lw, { fill: 'var(--surface)', stroke: col });
  s.line(x - 3.1, y, x + 3.1, y, lw, { stroke: col });
  s.line(x - 1.4, y, x - 1.4, y - 2.6, LW.thin, { stroke: col });
  s.line(x + 1.4, y, x + 1.4, y - 2.6, LW.thin, { stroke: col });
  if (key === 'gfci') s.text(x, y + 6.4, 'GFCI', { size: 4, weight: 700, fill: col });
  if (dev.volts === 240) {
    s.circle(x, y, 4.6, LW.thin, { stroke: col });
    s.text(x, y + 8.4, '240 V', { size: 4, weight: 700, fill: col });
  }
}

/* ================================================================
   A6.0 — Door and window schedule, with the three details

   The schedule is what gets ordered from and the details are what gets built
   from, and they belong on one sheet because the head detail is only true if
   the header in the schedule is the header that gets cut.

   Every dimension here comes off the same spec the model uses, so changing the
   wall system in the Structure tab redraws the details rather than leaving a
   drawing of the old assembly on the sheet.
   ================================================================ */

/* The build-up outside and inside the studs, as a set of thicknesses. This is
   the thing the three details are all really about. */
function wallLayers(spec) {
  const T = LUMBER[spec.studSize].d;
  const sheathing = spec.wallSkin === 'sheathing' ? 0.4375 : 0;
  const girt = spec.wallSkin === 'girts' ? LUMBER[spec.girtSize].t : 0;
  const siding = spec.siding === 'metal' ? 0.5 : 0.75;
  const inner = spec.wallDrywall ? 0.5 : 0;
  const trim = 0.75;
  return { T, sheathing, girt, siding, inner, trim,
    /* Face of the framing out to whatever stands proudest — a 1x trim board
       stands out past a metal panel, and the detail has to hold it. */
    out: sheathing + girt + Math.max(siding, trim) };
}

function drawOpeningSchedule(s) {
  const spec = state.spec, ops = state.openings;
  const area = sheetArea(s, { notes: false });
  const L = wallLayers(spec);

  /* ---- the schedule, across the top ---- */
  const rows = ops.map((o) => {
    const st = stockFor(o);
    const h = sizeHeader(st.w, o.wall, spec);
    return [
      openingTag(o, ops),
      o.kind === 'window' ? 'Window' : o.kind === 'man' ? 'Man door' : 'Overhead',
      WALLS[o.wall].label,
      `${fmtIn(st.w)} × ${fmtIn(st.h)}`,
      fmtFt(o.head),
      fmtFt(o.head - st.h),
      h.over ? 'ENGINEERED' : h.label,
      st.id === 'custom' ? 'Not on hand — to buy'
        : st.resized ? 'Resized from stock' : (st.note ? 'From the sketch' : 'Stock unit'),
    ];
  });
  const schedH = schedule(s, area.x, area.y + 8, area.w, 'Door and window schedule',
    [{ h: 'Tag', w: 8 }, { h: 'Type', w: 14 }, { h: 'Wall', w: 12 },
      { h: 'Rough opening', w: 20, mono: true }, { h: 'Head', w: 12, mono: true },
      { h: 'Sill', w: 12, mono: true }, { h: 'Header', w: 20 }, { h: 'Notes', w: 22 }],
    rows) - area.y;

  s.text(area.x, area.y + schedH + 14,
    'Rough openings are holes, not units. Confirm every one against the unit in hand before '
    + 'the header is cut — the sketch listed these as openings and nothing has re-measured them.',
    { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });

  /* ---- the three details, across the bottom ---- */
  /* Detailed at the widest window, because that is the one with the deepest
     header; the schedule gives the header for each. */
  const typ = ops.filter((o) => o.kind === 'window')
    .sort((a, b) => stockFor(b).w - stockFor(a).w)[0] || ops[0];
  const tSt = typ ? stockFor(typ) : { w: 60, h: 36 };
  const hdr = typ ? sizeHeader(tSt.w, typ.wall, spec) : null;
  const hd = hdr && hdr.depth ? hdr.depth : 9.25;

  const dTop = area.y + schedH + 32;
  const dH = area.bottom - 22 - dTop;
  const colW = area.w / 3;
  const uLo = -(L.out + 4), uHi = L.T + L.inner + 5;
  const vRange = Math.max(hd + 16, 26);
  const key = s.pickScale(uHi - uLo, vRange, colW - 52, dH - 24, '3');
  const f = SCALES.find((z) => z.k === key).f * PT;
  /* However much wall the column has room for, so the skin runs off the top
     and bottom of each detail rather than stopping in mid-air. */
  const vSpan = (dH - 24) / f;

  const views = [
    { mark: '1', name: 'Head', which: 'head', focus: hd / 2 },
    { mark: '2', name: 'Jamb — plan cut', which: 'jamb', focus: 3 },
    { mark: '3', name: 'Sill', which: 'sill', focus: 0 },
  ];
  /* Everything is called out to the right, into a gutter wide enough to wrap
     into — a leader reaching left runs into the detail next door. */
  const gutter = colW - ((uHi - uLo) * f) - 30;
  views.forEach((v, i) => {
    const x = area.x + colW * i + 12;
    /* Each detail is a window on the same wall, so it gets clipped like one —
       otherwise the bands run into the title line under them. */
    s.clipTo(x - 6, dTop, colW - 12, dH - 20);
    const { X, Y } = sectionFrame(s, x, dTop, key, uLo, uHi, v.focus + vSpan / 2);
    headJambSill(s, spec, L, X, Y, v.which, { hd, uLo, uHi, vSpan, gutter });
    s.layerOff();
    s.viewTitle(x, dTop + dH - 2, v.name, key, v.mark);
  });

  s.text(area.x, area.bottom - 6,
    `Details typical at ${typ ? openingTag(typ, ops) : 'each window'}; `
    + `${spec.wallSkin === 'girts' ? `${spec.girtSize} girts and ` : 'OSB sheathing and '}`
    + `${spec.siding === 'metal' ? 'metal panel' : 'lap siding'}. `
    + 'Doors are the same head and jamb with a threshold in place of the sill.',
    { size: 5.9, anchor: 'start', fill: 'var(--ink-3)' });

  s.scale = SCALES.find((z) => z.k === key);
}

/* All three details are the same wall drawn three ways, so they are one
   function: the layers do not change, only what is cut through them. */
function headJambSill(s, spec, L, X, Y, which, o) {
  const T = L.T, uHi = o.uHi, uLo = o.uLo;
  const wood = (u, v, w, h) => {
    s.rect(X(u), Y(v), s.mlen(w), s.mlen(h), LW.cut);
    s.hatch(X(u), Y(v), s.mlen(w), s.mlen(h), 'wood');
  };
  /* The skin, drawn as continuous bands past whatever is cut. */
  const half = (o.vSpan || 40) / 2 + 6;
  void uLo;
  const skin = (v0, v1) => {
    v0 = Math.min(v0, -half); v1 = Math.max(v1, half);
    if (L.sheathing) s.rect(X(-L.sheathing), Y(v1), s.mlen(L.sheathing), s.mlen(v1 - v0), LW.medium);
    if (L.girt) {
      /* Girts run horizontally, so they are cut in the head and sill and seen
         in the jamb — drawn dashed where they are behind the cut. */
      s.rect(X(-L.sheathing - L.girt), Y(v1), s.mlen(L.girt), s.mlen(v1 - v0),
        which === 'jamb' ? LW.thin : LW.medium,
        which === 'jamb' ? { dash: '3 2', stroke: 'var(--ink-3)' } : null);
    }
    s.rect(X(-L.out), Y(v1), s.mlen(L.siding), s.mlen(v1 - v0), LW.heavy);
    if (L.inner) s.rect(X(T), Y(v1), s.mlen(L.inner), s.mlen(v1 - v0), LW.medium);
  };

  if (which === 'head') {
    const hd = o.hd;
    /* Cripples over the header, seen beyond the cut rather than cut through —
       lighter, because a section only draws heavy what the knife went through. */
    for (let v = hd + 3; v < hd + half; v += spec.studSpacing / 4) {
      s.rect(X(0), Y(v + 1.5), s.mlen(T), s.mlen(1.5), LW.light, { stroke: 'var(--ink-3)' });
    }
    /* header, sitting under the plate above and over the opening */
    wood(0, hd, T, hd);
    if (spec.studSize === '2x6') {
      /* Built-up headers come out thinner than the wall, so they get packed
         out — which is why the schedule reports the plies. */
      s.line(X(T - 1), Y(hd), X(T - 1), Y(0), LW.thin, { stroke: 'var(--ink-3)', dash: '2 2' });
    }
    skin(-half, hd + half);
    /* the unit head, below the header */
    s.rect(X(0.25), Y(0), s.mlen(2.5), s.mlen(1.5), LW.heavy, { fill: 'var(--surface-2)' });
    s.line(X(0.6), Y(-1.5), X(0.6), Y(-8), LW.heavy);      // the glass, going down
    /* head trim and the flashing over it, under the siding */
    s.rect(X(-L.sheathing - L.girt - L.trim), Y(1.5), s.mlen(L.trim), s.mlen(3.5), LW.medium);
    s.path(`M${fx(X(-L.sheathing))},${fx(Y(4.5))} L${fx(X(-L.sheathing))},${fx(Y(2.0))} `
      + `L${fx(X(-L.out - 1))},${fx(Y(2.0))} L${fx(X(-L.out - 1))},${fx(Y(1.2))}`,
      LW.heavy, { stroke: 'var(--keel)' });
    s.layerOff();
    const G = { size: 5.2, width: o.gutter };
    if (L.girt) {
      s.callout(-L.girt / 2, hd + 4, uLen(X, uHi, -L.girt / 2) + 18, -46,
        `${spec.girtSize} GIRT — BLOCK SOLID OVER THE HEADER`, G);
    }
    s.callout(-L.out + L.siding / 2, hd * 0.55, uLen(X, uHi, -L.out + L.siding / 2) + 18, -28,
      spec.siding === 'metal' ? 'METAL PANEL OVER THE TRIM' : 'LAP SIDING OVER THE TRIM', G);
    s.callout(-L.out + 0.4, 2.0, uLen(X, uHi, -L.out + 0.4) + 18, 44,
      'Z-FLASHING OVER THE TRIM AND BEHIND THE SIDING',
      { ...G, weight: 700, fill: 'var(--keel)' });
    s.callout(-L.sheathing - L.girt - L.trim / 2, 3.2,
      uLen(X, uHi, -L.sheathing - L.girt - L.trim / 2) + 18, 76,
      '1x4 TRIM, SEALED TO THE UNIT', G);
    s.callout(T / 2, hd / 2, 26, -8,
      `HEADER — SEE SCHEDULE${spec.studSize === '2x6' ? ', PACKED OUT TO THE WALL' : ''}`, G);
    s.callout(1.5, -3, 26, 20, 'UNIT HEAD, SHIMMED AND SEALED', G);
    s.dimLine(X(uHi) + 16, Y(hd), X(uHi) + 16, Y(0), fmtIn(hd));
  } else if (which === 'jamb') {
    /* A plan cut: v runs ALONG the wall, and up the page is outside. */
    wood(0, 10, T, 1.5);                                   // king stud
    wood(0, 8.5, T, 1.5);                                  // jack stud
    skin(-half, half);
    s.rect(X(0.25), Y(7), s.mlen(2.5), s.mlen(1.5), LW.heavy, { fill: 'var(--surface-2)' });
    s.line(X(0.6), Y(5.5), X(0.6), Y(-10), LW.heavy);
    s.rect(X(-L.sheathing - L.girt - L.trim), Y(8.5), s.mlen(L.trim), s.mlen(3.5), LW.medium);
    s.layerOff();
    const G = { size: 5.2, width: o.gutter };
    s.callout(T / 2, 9.25, 26, -30, 'KING STUD FULL HEIGHT', G);
    s.callout(T / 2, 7.75, 26, 0, 'JACK STUD UNDER THE HEADER', G);
    s.callout(-L.out + L.siding / 2, 2, uLen(X, uHi, -L.out + L.siding / 2) + 18, 30,
      'SEALANT AT THE TRIM, BOTH SIDES', G);
    if (L.girt) {
      s.callout(-L.sheathing - L.girt / 2, -6,
        uLen(X, uHi, -L.sheathing - L.girt / 2) + 18, 8,
        'GIRTS BEYOND — BLOCK SOLID AT THE JAMB', G);
    }
  } else {
    /* sill */
    wood(0, 0, T, 1.5);                                    // rough sill
    wood(0, -1.5, T, 9);                                   // cripples below
    skin(-half, half);
    s.rect(X(0.25), Y(2.6), s.mlen(2.5), s.mlen(1.1), LW.heavy, { fill: 'var(--surface-2)' });
    s.line(X(0.6), Y(8), X(0.6), Y(3.7), LW.heavy);
    /* the pan, sloped out, turned up at the back — the one thing a sill has
       to get right */
    s.path(`M${fx(X(T - 0.5))},${fx(Y(2.4))} L${fx(X(T - 0.5))},${fx(Y(0.9))} `
      + `L${fx(X(-L.sheathing))},${fx(Y(0.4))} L${fx(X(-L.out - 1))},${fx(Y(-0.4))}`,
      LW.heavy, { stroke: 'var(--keel)' });
    /* sill trim with a drip under it */
    s.rect(X(-L.sheathing - L.girt - L.trim), Y(0.4), s.mlen(L.trim + 0.6), s.mlen(3), LW.medium);
    s.line(X(-L.out - 1.35), Y(-2.6), X(-L.sheathing - L.girt), Y(-2.6), LW.medium);
    s.layerOff();
    const G = { size: 5.2, width: o.gutter };
    s.callout(-L.out + 0.4, 0.2, uLen(X, uHi, -L.out + 0.4) + 18, -34,
      'SLOPED SILL PAN, TURNED UP AT THE BACK AND THE ENDS',
      { ...G, weight: 700, fill: 'var(--keel)' });
    s.callout(T / 2, 0.75, 26, -4, 'ROUGH SILL', G);
    s.callout(T / 2, -5, 26, 18, `CRIPPLES AT ${fmtIn(spec.studSpacing)} O.C.`, G);
    s.callout(-L.out - 1.35, -2.6, uLen(X, uHi, -L.out - 1.35) + 18, 44,
      'DRIP CUT UNDER THE SILL TRIM', G);
  }
}

/* How far right of a model u the detail's right edge is, in points — so a
   leader from the outside face can reach past the whole cut before it turns. */
function uLen(X, uHi, u) { return X(uHi) - X(u); }

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

  /* One device list: the viewport, the Electrical tab, the box-fill check and
     this sheet all read it, so none of them can disagree with another. */
  const devs = currentDevices(spec);
  for (const d of devs) {
    const p = devicePos(d, spec);
    if (d.panel) {
      s.rect(X(p.x - 10), Y(p.z - 3), s.mlen(20), s.mlen(6), LW.heavy, { fill: 'var(--surface-2)' });
      s.callout(p.x, p.z, -34, -20, `${spec.service} A SUB-PANEL`, { size: 5.6, weight: 700 });
      continue;
    }
    const f = boxFill(d);
    const over = f && (!f.ok || !f.gangsOK);
    elecSymbol(s, X(p.x), Y(p.z), d, over);
    /* The circuit number beside it, because that is what the sheet is for. */
    if (d.ckt) {
      s.text(X(p.x) + 5.5, Y(p.z) - 4, String(d.ckt),
        { size: 4.8, anchor: 'start', fill: over ? 'var(--keel)' : 'var(--ink-3)', mono: true });
    }
  }
  /* Circuit runs, drawn as the light dashes an electrical plan uses so they do
     not read as walls. */
  for (const q of model.parts.filter((r) => r.stage === 'elec' && r.sys === 'wire')) {
    const b = aabb(q.geom);
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

  /* Legend and panel schedule, drawn with the same symbol routine so neither
     can drift from what is on the plan. */
  let ly = area.y + 8;
  s.text(area.noteX, ly, 'LEGEND', { size: 7, anchor: 'start', weight: 700, track: '0.06em' });
  s.line(area.noteX, ly + 2.8, area.noteX + area.noteW, ly + 2.8, LW.medium);
  ly += 16;
  const seen = [];
  for (const d of devs) {
    if (d.panel) continue;
    const key = (d.items || [])[0] || 'blank';
    if (seen.includes(key)) continue;
    seen.push(key);
    const cx = area.noteX + 8;
    let cy2 = ly;
    elecSymbol(s, cx, cy2, { wall: d.wall, items: [key] }, false);
    const text = `${(EDEVICE[key] || {}).label || key}`
      + (d.wall === 'C' ? '' : `, ${fmtIn(d.v)} above the slab`);
    for (const ln of wrapText(text, area.noteW - 24, 5.9)) {
      s.text(area.noteX + 20, cy2 + 2, ln, { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });
      cy2 += 7.2;
    }
    ly = cy2 + 6.5;
  }
  {
    const cx = area.noteX + 8;
    s.line(cx - 7, ly, cx + 7, ly, LW.thin, { stroke: 'var(--ink-3)', dash: '2 2.4' });
    s.text(area.noteX + 20, ly + 2, 'Circuit run — indicative, not a route',
      { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });
    ly += 14;
  }

  const cl = circuitLoads(devs, spec);
  const ckts = currentCircuits(spec);
  ly = schedule(s, area.noteX, ly + 6, area.noteW, 'Panel schedule',
    [{ h: 'Ckt', w: 8 }, { h: 'Serves', w: 30 }, { h: 'Load', w: 18, mono: true },
      { h: 'Bkr', w: 14, mono: true }, { h: 'Wire', w: 14 }],
    cl.rows.map((r) => [String(r.ckt),
      circuitName(r.ckt, ckts) || autoCircuitName(r.ckt, devs),
      `${fmtN(r.design)} VA`, r.general ? '20 A' : `${r.breaker} A`,
      r.general ? '12 AWG' : r.wire.replace(' AWG', '')]));

  sheetNotes(s, area.noteX, ly + 12, area.noteW, 'Electrical notes', [
    `${fmtN(cl.totalVA)} VA connected on a ${spec.service} A sub-panel. This is a layout and `
    + 'a tally, not a circuit design — an electrician decides what goes on what.',
    'Box fill is NEC 314.16 at 12 AWG: two allowances a yoke, one a conductor, one for all '
    + 'the grounds and one for the clamps. Boxes over the fill are marked on the plan.',
    'A 125 V, 15 or 20 A receptacle serving the floor area of a garage or an accessory '
    + 'building needs GFCI protection — devices or a breaker.',
    'Run everything in conduit on the surface, or inside the studs before the interior face '
    + 'goes on: with girts and no sheathing there is nowhere to hide a cable afterwards.',
    'Bond the metal siding and roofing. A sub-panel in a separate building takes a four-wire '
    + 'feeder with the grounds and neutrals separated, and its own ground rod.',
  ]);

  s.viewTitle(area.x + 12, area.bottom - 6, 'Electrical plan', s.scale.k, '1');
}

/* ================================================================
   S3.1 — Truss shop drawing

   The one sheet you build from rather than price from: the truss laid out at
   scale with every member length, every cut angle, the gussets drawn at the
   size they get cut, and the joints blown up big enough to nail from.
   ================================================================ */
function drawTrussShop(s) {
  const spec = state.spec;
  const tr = trussGeometry(spec);
  const area = sheetArea(s, { noteWidth: 156 });
  const d = tr.chord.d;

  /* ---- 1. the truss, elevation ---- */
  const rowTop = area.h * 0.52;
  const uLo = -spec.eaveOverhang - 10, uHi = tr.span + spec.eaveOverhang + 10;
  const eaveY = tr.bcTop - spec.eaveOverhang * tr.slope;
  const vLo = Math.min(tr.bcBot, eaveY) - 14, vHi = tr.peakY + tr.perp + 22;
  const key = s.pickScale(uHi - uLo, vHi - vLo, area.w - 40, rowTop - 34);
  const f = SCALES.find((z) => z.k === key).f * PT;
  const x0 = area.x + (area.w - (uHi - uLo) * f) / 2;
  const y0 = area.y + 14 + Math.max(0, (rowTop - 44 - (vHi - vLo) * f) / 2);
  const { X, Y } = sectionFrame(s, x0, y0, key, uLo, uHi, vHi);

  /* Chords as real members with depth, webs as single lines — which is how a
     truss drawing reads: the chords are what you cut to a line, the webs are
     what you cut to an angle. */
  /* Depth is measured vertically here, which is how a chord is cut and how
     trussGeometry reports it. */
  const memberBand = (a, b, depth, lw) => {
    s.poly([[X(a[0]), Y(a[1])], [X(b[0]), Y(b[1])],
      [X(b[0]), Y(b[1] - depth)], [X(a[0]), Y(a[1] - depth)]], lw || LW.heavy);
  };
  /* bottom chord */
  memberBand([0, tr.bcTop], [tr.span, tr.bcTop], d, LW.cut);
  /* top chords, both slopes, out to the eave */
  memberBand([-spec.eaveOverhang, eaveY + tr.perp], [tr.half, tr.peakY + tr.perp], tr.perp, LW.cut);
  memberBand([tr.span + spec.eaveOverhang, eaveY + tr.perp], [tr.half, tr.peakY + tr.perp],
    tr.perp, LW.cut);
  /* webs */
  for (const w of tr.webs) {
    s.line(X(w.a[0]), Y(w.a[1]), X(w.b[0]), Y(w.b[1]), LW.medium);
  }
  /* gussets, drawn where they go and at the size they get cut */
  const gus = gussetPlan(tr);
  for (const g2 of gus) {
    s.rect(X(g2.z - g2.w / 2), Y(g2.y + g2.h / 2), s.mlen(g2.w), s.mlen(g2.h),
      LW.thin, { stroke: 'var(--ink-3)', dash: '3 2' });
  }
  /* panel points, dimensioned along the bottom chord */
  const stops = [0, ...tr.webs.filter((w) => w.id !== 'kp').map((w) => w.a[1] === tr.bcTop ? w.a[0] : w.b[0]),
    tr.half, tr.span].filter((v, i, arr) => arr.indexOf(v) === i).sort((a, b) => a - b);
  s.dimChainH(stops, tr.bcBot - 26, tr.bcBot);
  s.dimH(0, tr.span, tr.bcBot - 40, null, tr.bcBot);
  s.dimV(tr.bcTop, tr.peakY + tr.perp, -spec.eaveOverhang - 8, fmtIn(tr.rise + tr.perp), tr.half);
  s.callout(tr.half * 0.5, tr.bcTop + (tr.half * 0.5) * tr.slope + tr.perp, 0, -22,
    `${spec.pitch}/12`, { size: 6.5, weight: 700 });

  /* joint marks, keyed to the details below */
  const joints = [
    { mark: 'A', z: 0, y: tr.bcTop, name: 'Heel' },
    { mark: 'B', z: tr.half, y: tr.peakY, name: 'Peak' },
    { mark: 'C', z: tr.span / 3, y: tr.bcTop, name: 'Panel point' },
  ];
  for (const j of joints) {
    const up = j.mark === 'B';
    const cy2 = Y(j.y) + (up ? -18 : 14);
    s.line(X(j.z), Y(j.y), X(j.z), cy2 + (up ? 6.4 : -6.4), LW.thin, { stroke: 'var(--ink-3)' });
    s.circle(X(j.z), cy2, 6.4, LW.medium, { fill: 'var(--surface)' });
    s.text(X(j.z), cy2 + 2.2, j.mark, { size: 6.5, weight: 700 });
  }
  s.viewTitle(area.x + 10, Y(vLo) + 16, 'Truss elevation', key, '1');

  /* ---- 2. the joints, big ---- */
  const dW = (area.w - 30) / 3;
  const dKey = s.pickScale(30, 26, dW - 24, area.h - rowTop - 44, '3');
  const dF = SCALES.find((z) => z.k === dKey).f * PT;
  joints.forEach((j, i) => {
    const jx = area.x + 12 + i * dW;
    const { X: JX, Y: JY } = sectionFrame(s, jx, area.y + rowTop + 12, dKey,
      j.z - 15, j.z + 15, j.y + 13);
    /* chords through the joint */
    if (j.mark === 'B') {
      s.poly([[JX(j.z - 15), JY(tr.bcTop + (tr.half - 15) * tr.slope + tr.perp)],
        [JX(j.z), JY(tr.peakY + tr.perp)],
        [JX(j.z), JY(tr.peakY)], [JX(j.z - 15), JY(tr.bcTop + (tr.half - 15) * tr.slope)]], LW.cut);
      s.poly([[JX(j.z + 15), JY(tr.bcTop + (tr.half - 15) * tr.slope + tr.perp)],
        [JX(j.z), JY(tr.peakY + tr.perp)],
        [JX(j.z), JY(tr.peakY)], [JX(j.z + 15), JY(tr.bcTop + (tr.half - 15) * tr.slope)]], LW.cut);
      s.line(JX(j.z), JY(tr.peakY), JX(j.z), JY(tr.peakY - 13), LW.medium);
    } else {
      s.poly([[JX(j.z - 15), JY(tr.bcTop)], [JX(j.z + 15), JY(tr.bcTop)],
        [JX(j.z + 15), JY(tr.bcTop - d)], [JX(j.z - 15), JY(tr.bcTop - d)]], LW.cut);
      if (j.mark === 'A') {
        const yTC = (u) => tr.bcTop + u * tr.slope;
        s.poly([[JX(j.z - 15), JY(yTC(-15) + tr.perp)], [JX(j.z + 15), JY(yTC(15) + tr.perp)],
          [JX(j.z + 15), JY(yTC(15))], [JX(j.z - 15), JY(yTC(-15))]], LW.cut);
        /* the bearing: top plate under the heel */
        s.rect(JX(j.z - 15), JY(tr.bcBot), s.mlen(30), s.mlen(3), LW.medium);
        s.hatch(JX(j.z - 15), JY(tr.bcBot), s.mlen(30), s.mlen(3), 'wood');
      } else {
        for (const w of tr.webs) {
          for (const end of [w.a, w.b]) {
            if (Math.abs(end[0] - j.z) > 0.5 || Math.abs(end[1] - j.y) > 0.5) continue;
            const far = end === w.a ? w.b : w.a;
            const ux = far[0] - end[0], uy = far[1] - end[1];
            const ln = Math.hypot(ux, uy) || 1;
            s.line(JX(j.z), JY(j.y), JX(j.z + ux / ln * 14), JY(j.y + uy / ln * 14), LW.heavy);
          }
        }
      }
    }
    /* the gusset over it */
    const g2 = gus.find((q) => Math.abs(q.z - j.z) < 0.5 && Math.abs(q.y - j.y) < 0.5) || gus[0];
    s.rect(JX(j.z - g2.w / 2), JY(j.y + g2.h / 2), s.mlen(g2.w), s.mlen(g2.h),
      LW.medium, { stroke: 'var(--keel)', dash: '4 2.5' });
    /* nailing, drawn at the pattern it gets nailed at */
    for (let a = -g2.w / 2 + 1.5; a < g2.w / 2 - 1; a += 3) {
      for (let b = -g2.h / 2 + 1.5; b < g2.h / 2 - 1; b += 3) {
        s.circle(JX(j.z + a), JY(j.y + b), 0.7, 0, { fill: 'var(--ink-3)' });
      }
    }
    s.text(jx + dW / 2 - 12, area.y + rowTop + 4,
      `¾" CDX GUSSET ${fmtIn(g2.w)} × ${fmtIn(g2.h)}, BOTH FACES`,
      { size: 5.4, fill: 'var(--ink-2)' });
    s.viewTitle(jx, area.y + rowTop + 24 + 26 * dF, `${j.name} joint`, dKey, j.mark);
  });

  /* ---- 3. the column ---- */
  let cy = schedule(s, area.noteX, area.y + 8, area.noteW, `One truss × ${tr.count}`,
    [{ h: 'Qty', w: 8 }, { h: 'Member', w: 30 }, { h: 'Length', w: 22, mono: true },
      { h: 'Cut', w: 20, mono: true }],
    trussShopRows(tr, spec));
  cy = sheetNotes(s, area.noteX, cy + 14, area.noteW, 'Shop notes', [
    `Build the first one flat on the slab against a full-size chalked layout, then use it `
    + `as the jig for the other ${tr.count - 1}. Check the jig every few trusses.`,
    'Crown every chord the same way and keep the crowns up.',
    '¾" CDX gussets both faces at all 8 joints — 16 pieces per truss, '
    + `${tr.count * 16} in total. Glue and nail 8d at 3" o.c. staggered, minimum 4 nails per `
    + 'member per face. The heel and the peak carry the most; be generous there.',
    `At ${spec.pitch}/12 with panel points at the third points the webs land on 3-4-5 `
    + `triangles — ${fmtN(tr.webs[0].deg, 2)}° at every diagonal, and the lengths come out to `
    + 'exact sixteenths.',
    `Overall height ${fmtFt(tr.overallHeight)} above the slab. Check that against the door `
    + 'header and the ceiling before the first chord is cut.',
    tr.span > 240
      ? `A ${fmtFt(tr.span)} site-built truss is a real structural element. Have this reviewed `
        + 'before any are set, or price engineered trusses — at this span the delivered price is '
        + 'often close.'
      : 'Have the design reviewed before any are set.',
  ]);

  s.scale = SCALES.find((z) => z.k === key);
}

/* Where the gussets go and how big they are. Sized off the members they have
   to reach across rather than picked out of the air: a gusset has to land at
   least four nails on every member at every joint. */
function gussetPlan(tr) {
  const d = tr.chord.d;
  return [
    { z: 0, y: tr.bcTop, w: Math.round(d * 2.6), h: Math.round(d * 2.2), name: 'Heel' },
    { z: tr.span, y: tr.bcTop, w: Math.round(d * 2.6), h: Math.round(d * 2.2), name: 'Heel' },
    { z: tr.half, y: tr.peakY, w: Math.round(d * 2.4), h: Math.round(d * 2.4), name: 'Peak' },
    { z: tr.span / 3, y: tr.bcTop, w: Math.round(d * 2.2), h: Math.round(d * 1.8), name: 'Panel point' },
    { z: tr.span * 2 / 3, y: tr.bcTop, w: Math.round(d * 2.2), h: Math.round(d * 1.8), name: 'Panel point' },
    { z: tr.half, y: tr.bcTop, w: Math.round(d * 2.2), h: Math.round(d * 1.8), name: 'Splice' },
    { z: tr.nodes.tcL[0], y: tr.nodes.tcL[1], w: Math.round(d * 2.0), h: Math.round(d * 1.8), name: 'Top chord' },
    { z: tr.nodes.tcR[0], y: tr.nodes.tcR[1], w: Math.round(d * 2.0), h: Math.round(d * 1.8), name: 'Top chord' },
  ];
}

function trussShopRows(tr, spec) {
  const rows = [
    ['2', `Top chord, ${tr.chordSize}`, fmtFt(tr.tcLength),
      `${fmtN(90 - tr.angle / D2R, 1)}° / ${fmtN(tr.angle / D2R, 1)}°`],
    ['2', `Bottom chord, ${tr.chordSize}`, fmtFt(tr.half), 'square'],
  ];
  /* Group by length. The mirrored webs come back from trussGeometry with
     supplementary angles — 33.7° on the left, 146.3° on the right — because
     the angle is measured off the +z axis and one of them runs the other way.
     Same stick, same cut, so fold them together. */
  const acute = (deg) => (deg > 90 ? 180 - deg : deg);
  const webs = new Map();
  for (const w of tr.webs) {
    const k = Math.round(w.len * 16) / 16;
    const e = webs.get(k) || { n: 0, deg: acute(w.deg) };
    e.n++;
    webs.set(k, e);
  }
  for (const [len, e] of [...webs.entries()].sort((a, b) => b[0] - a[0])) {
    rows.push([String(e.n), `Web, ${tr.chordSize}`, fmtFt(len),
      Math.abs(e.deg - 90) < 0.05 ? 'square' : `${fmtN(e.deg, 1)}° both`]);
  }
  const g = gussetPlan(tr);
  const byName = new Map();
  for (const q of g) {
    const k = `${q.w}×${q.h}`;
    byName.set(k, (byName.get(k) || 0) + 2);       // both faces
  }
  for (const [k, n] of byName) rows.push([String(n), `¾" CDX gusset`, k.replace('×', ' × ') + '"', '—']);
  void spec;
  return rows;
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
  { id: 'wallsec', number: 'S2.1', title: 'Wall section', draw: drawWallSection },
  { id: 'bldgsec', number: 'S2.2', title: 'Building section', draw: drawBuildingSection },
  { id: 'roof', number: 'S3.0', title: 'Roof framing plan', draw: drawRoofPlan },
  { id: 'truss', number: 'S3.1', title: 'Truss shop drawing', draw: drawTrussShop,
    scaleLabel: 'As noted' },
  { id: 'elev', number: 'A2.0', title: 'Elevations', draw: drawElevations },
  { id: 'sched', number: 'A6.0', title: 'Door & window schedule', draw: drawOpeningSchedule },
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
