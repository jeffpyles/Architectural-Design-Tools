/* ============================================================
   The panels particular to this building: where the salvaged windows go,
   what the framing came out at, and what the whole thing weighs.
   ============================================================ */

/* The audit and the weight panel both want a built model, and rebuild() has
   already made one. Rebuilding a 34-foot house twice a drag is noticeable,
   so the last one is kept. */
let _mCache = null;
function modelAndTakeoff(spec, openings) {
  const key = JSON.stringify([spec, openings]);
  if (!_mCache || _mCache.key !== key) {
    const m = buildModel(spec, openings);
    _mCache = { key, model: m, take: takeoff(m, spec) };
  }
  return _mCache;
}

/* ---- openings ---- */

function openingsScaffold() {
  const sec = $('#panel-openings');
  if (sec.firstChild) return;
  const list = el('div'); list.id = 'opList';
  const stock = el('div', 'stock'); stock.id = 'stockList';
  const addRow = el('div', 'btn-row'); addRow.id = 'addRow';
  sec.append(
    el('p', 'note', 'Drag an opening along its wall in the model, or type an offset. Offsets run to the '
      + 'near edge of the rough opening, from the corner named on each card.'),
    list,
    el('h3', null, 'The windows'), stock,
    el('h3', null, 'Put one in a wall'), addRow,
  );
}

function renderOpenings() {
  openingsScaffold();
  const box = $('#opList');
  box.textContent = '';
  for (const wall of ['S', 'N', 'E', 'W']) {
    const ops = openingsOn(wall, state.openings);
    if (!ops.length) continue;
    box.append(el('h3', null, `${WALLS[wall].label} wall`));
    for (const o of ops) {
      const st = stockFor(o);
      const ro = roughOf(o);
      const e = wallExtent(wall, state.spec);
      const card = el('div', 'op' + (state.selected === o.id ? ' sel' : ''));
      card.tabIndex = 0;
      card.addEventListener('click', () => { state.selected = o.id; showReadout(o); renderPanels(); });

      const head = el('div', 'op-head');
      head.append(el('span', 'op-name', st.label));
      if (st.measured === false) head.append(el('span', 'tag over', 'not measured'));
      card.append(head);
      card.append(wallPicker(o, st));

      const fields = el('div', 'op-fields');
      fields.append(
        numField('From the ' + WALLS[wall].from, o.off, (v) => moveOpening(o, v)),
        numField('Head height', o.head, (v) => { o.head = v; scheduleRebuild(); }),
      );
      card.append(fields);

      const hdr = sizeHeader(o, state.spec);
      const meta = el('div', 'op-meta');
      meta.textContent = `Unit ${fmtIn(st.w)} × ${fmtIn(st.h)} · RO ${fmtIn(ro.w)} × ${fmtIn(ro.h)} · `
        + `sill ${fmtIn(o.head - ro.h)} · ${fmtFt(e.u1 - (o.off + ro.w))} to the far corner · `
        + `header ${hdr.label}${hdr.nonbearing ? ' (non-bearing)' : ''}`;
      card.append(meta);

      const row = el('div', 'btn-row');
      const rm = el('button', 'btn danger', 'Take it out');
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.openings = state.openings.filter((x) => x !== o);
        if (state.selected === o.id) state.selected = null;
        scheduleRebuild();
      });
      row.append(rm);
      card.append(row);
      box.append(card);
    }
  }

  /* Every window on the list, and whether it is in a wall yet. */
  const inv = $('#stockList');
  inv.textContent = '';
  for (const s of WINDOW_STOCK) {
    const placed = state.openings.filter((o) => o.stock === s.id);
    const row = el('div', 'stock-row');
    const name = el('div');
    name.append(el('b', null, s.label));
    const sub = el('div', null, `${fmtIn(s.w)} × ${fmtIn(s.h)}`
      + (s.measured === false ? ' — scaled off the sketch, not measured' : '')
      + (s.opens ? ' · opens' : '') + (s.frosted ? ' · frosted' : ''));
    sub.style.cssText = 'font-size:11px;color:var(--ink-3);font-family:var(--f-body)';
    name.append(sub);
    row.append(name,
      el('span', null, placed.length ? WALLS[placed[0].wall].label : '—'),
      el('span', 'tag ' + (placed.length > 1 ? 'over' : placed.length ? 'used' : 'left'),
        placed.length > 1 ? `${placed.length} placed` : placed.length ? 'in' : 'on the shelf'));
    inv.append(row);
  }

  const add = $('#addRow');
  add.textContent = '';
  for (const s of [...WINDOW_STOCK, ...DOOR_STOCK]) {
    const isDoor = DOOR_STOCK.includes(s);
    const b = el('button', 'btn', isDoor ? `+ ${s.label}` : `+ #${s.n}`);
    b.title = `${s.label} — ${fmtIn(s.w)} × ${fmtIn(s.h)}`;
    b.addEventListener('click', () => {
      const wall = 'S';
      const e = wallExtent(wall, state.spec);
      state.openings.push({
        id: 'x' + Math.round(performance.now() * 1000).toString(36),
        wall, stock: s.id,
        ...(isDoor ? { kind: 'door' } : {}),
        off: Math.max(e.u0 + 12, (e.u0 + e.u1) / 2 - s.w / 2),
        head: isDoor ? s.h : 78,
      });
      scheduleRebuild();
    });
    add.append(b);
  }
}

/* Four radios, one per wall. Moving an opening keeps its head height and
   slides the offset to the nearest spot that fits on the new wall. */
function wallPicker(o, st) {
  const f = el('div', 'field');
  f.append(el('label', null, 'Wall'));
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', `Which wall the ${st.label} sits in`);
  for (const w of ['N', 'E', 'S', 'W']) {
    const lab = document.createElement('label');
    const i = document.createElement('input');
    i.type = 'radio'; i.name = `wall-${o.id}`; i.value = w;
    i.checked = o.wall === w;
    i.setAttribute('aria-label', WALLS[w].label);
    i.addEventListener('click', (e) => e.stopPropagation());
    i.addEventListener('change', () => {
      if (o.wall === w) return;
      o.wall = w;
      const e2 = wallExtent(w, state.spec);
      const ro = roughOf(o);
      o.off = Math.round(Math.max(e2.u0, Math.min(e2.u1 - ro.w, o.off)) * 2) / 2;
      scheduleRebuild();
    });
    lab.append(i, el('span', null, w));
    seg.append(lab);
  }
  f.append(seg);
  return f;
}

/* ---- review ---- */

function renderReview() {
  const p = $('#panel-review');
  p.textContent = '';
  const spec = state.spec;
  p.append(note('Preliminary sizing, and the things worth arguing about before anything gets cut.'));

  const crit = findings.filter((f) => f.level === 'crit');
  const warn = findings.filter((f) => f.level === 'warn');
  const info = findings.filter((f) => f.level === 'info');
  for (const [title, list] of [['Wants fixing', crit], ['Worth a look', warn], ['Notes', info]]) {
    if (!list.length) continue;
    p.append(el('h3', null, title));
    for (const f of list) {
      const d = el('div', 'finding ' + f.level);
      d.append(el('b', null, f.title), el('p', null, f.body));
      p.append(d);
    }
  }

  /* The height envelope, drawn as a stack, because what is spending it is the
     point and a table hides that. */
  const h = heightCheck(spec), hr = headroom(spec);
  p.append(el('h3', null, 'Road height'));
  const bar = el('div', 'stack-bar');
  const rows = [
    ['Deck above the road', h.deck],
    ['Side wall', h.wall],
    ['Ridge rise', h.rise],
    ['Rafter', h.rafterDepth],
    ['Deck and roofing', h.roofBuild - h.rafterDepth],
  ];
  for (const [k, v] of rows) {
    const seg = el('div');
    seg.style.cssText = `flex:${v} 0 0;min-width:2px`;
    seg.title = `${k} — ${fmtIn(v)}`;
    bar.append(seg);
  }
  p.append(bar);
  const kvH = el('dl', 'kv');
  for (const [k, v] of rows) kvH.append(el('dt', null, k), el('dd', null, fmtIn(v)));
  kvH.append(el('dt', null, 'Road to ridge cap'), el('dd', null, fmtIn(h.total)));
  kvH.append(el('dt', null, `Against ${fmtFt(h.envelope)}`),
    el('dd', null, h.over > 0 ? `${fmtIn(h.over)} over` : `${fmtIn(-h.over)} to spare`));
  kvH.append(el('dt', null, 'Tallest wall that fits'), el('dd', null, fmtIn(h.maxWall)));
  kvH.append(el('dt', null, 'Headroom under the loft'), el('dd', null, fmtIn(hr.under)));
  kvH.append(el('dt', null, 'In the loft'), el('dd', null, `${fmtIn(hr.atRidge)} at the ridge, ${fmtIn(hr.atWall)} at the wall`));
  p.append(kvH);

  p.append(el('h3', null, 'Framing'));
  const rd = model.rafter, rg = model.ridge, lf = model.loft, L = model.loads;
  const st = studCheck(spec);
  const kv = el('dl', 'kv');
  for (const [k, v] of [
    ['Roof pitch', `${roofPitch(spec).toFixed(1)}/12 — ${fmtIn(spec.ridgeRise)} over ${fmtFt(spec.width / 2)}`],
    ['Snow, flat roof', `${fmtN(L.snow)} psf`],
    ['Roof dead', `${fmtN(L.dead)} psf`],
    ['Rafters', `${rd.label} at ${fmtIn(spec.studSpacing)} o.c., ${fmtFt(rd.span)} sloping span`],
    ['Rafter capacity', `${fmtN(rd.ratio * 100)}% of allowable, ${fmtN(rd.defl, 3)}" of deflection`],
    ['Ridge beam', `${rg.label} over ${fmtFt(rg.span)} between the lofts`],
    ['Loft joists', `${lf.label} at 16" o.c. across ${fmtFt(lf.span)}, ${lf.live} psf live`],
    ['Studs', `${spec.studSize} at ${fmtIn(spec.studSpacing)} o.c., ${fmtIn(st.len)} long`],
    ['Stud capacity', `${(st.ratio * 100).toFixed(0)}% — ${fmtN(st.demand, 0)} lb against ${fmtN(st.allow, 0)} lb, l/d ${st.slenderness.toFixed(0)}`],
  ]) kv.append(el('dt', null, k), el('dd', null, v));
  p.append(kv);
}

/* ---- weight ---- */

function renderWeight() {
  const p = $('#panel-weight');
  p.textContent = '';
  const spec = state.spec;
  const tk = modelAndTakeoff(spec, state.openings).take;
  const w = tk.weight;
  const ax = axleCheck(spec, w);
  const sz = axleSizing(ax.onAxles, 2);

  p.append(note('Counted off the model, part by part. This is the shell only — framing, skin, glazing '
    + 'and the steel under it. No interior, no cabinets, no appliances, no water, nobody living in it. '
    + 'A finished tiny house usually lands near double its shell weight.'));

  const kv = el('dl', 'kv');
  for (const [k, v] of [
    ['Shell weight', `${fmtN(Math.round(w.total / 10) * 10)} lb`],
    ['Per square foot', `${fmtN(w.total / (spec.length * spec.width / 144), 1)} psf of floor`],
    ['CG, along', `${fmtFt(w.cg[0])} from the west end`],
    ['CG, across', `${fmtIn(Math.abs(w.cg[2] - spec.width / 2))} ${w.cg[2] < spec.width / 2 ? 'north' : 'south'} of centreline`],
    ['CG, height', `${fmtFt(w.cg[1])} above the frame`],
  ]) kv.append(el('dt', null, k), el('dd', null, v));
  p.append(kv);

  p.append(el('h3', null, 'Where the weight is'));
  p.append(table(['Material', 'Weight', 'Share'],
    w.byMat.filter((r) => r.lb > 5).map((r) => [
      (MATERIALS[r.mat] || { name: r.mat }).name,
      `${fmtN(Math.round(r.lb))} lb`,
      `${(r.lb / w.total * 100).toFixed(0)}%`,
    ]), [false, true, true]));

  /* The frame: the part of this that is genuinely load-bearing and genuinely
     salvage, and where the overhang tie earns its keep. */
  const fr = frameCheck(spec, w);
  const fin = frameCheck(spec, w, 1.9);
  p.append(el('h3', null, 'The frame'));
  const kvF = el('dl', 'kv');
  for (const [k, v] of [
    ['Section', `2 × ${fr.rail.label} + 2 × ${fr.beam.label}`],
    ['Section modulus', `${fmtN(fr.Sx, 2)} in³ about the strong axis`],
    ['Bending capacity', `${fmtN(fr.capacityKipFt, 1)} kip-ft at 0.6 Fy`],
    ['Rear overhang', `${fmtN(fr.over, 1)} ft past the rear axle`],
  ]) kvF.append(el('dt', null, k), el('dd', null, v));
  p.append(kvF);

  p.append(table(['Towed', 'No tie', 'As built', 'Against'],
    [['Shell', `${fmtN(fr.bare, 1)}`, `${fmtN(fr.M, 1)} kip-ft`, `${fr.ratio.toFixed(1)}×`],
      ['Finished', `${fmtN(fin.bare, 1)}`, `${fmtN(fin.M, 1)} kip-ft`, `${fin.ratio.toFixed(1)}×`]],
    [false, true, true, true]));

  if (fr.strut) {
    p.append(note(`The tie off the wheel-well arch is what makes those two columns different. `
      + `It props the overhang ${fmtFt(spec.strutFrom)} from the end, turning ${fmtN(fr.over, 1)} ft of `
      + `cantilever into ${fmtN(fr.strut.Lp, 1)} ft of propped span with a ${fmtN(fr.strut.a, 1)} ft tip. `
      + `But it is only ${fmtIn(fr.strut.rise)} deep over ${fmtFt(fr.strut.run)} — `
      + `${(fr.strut.angle * 180 / Math.PI).toFixed(1)}° — so every pound of lift costs about `
      + `${(1 / Math.sin(fr.strut.angle)).toFixed(0)} lb of tension in the tie.`));
    const kvS = el('dl', 'kv');
    for (const [k, v] of [
      ['Tie', `${fr.strut.section.label}, ${fmtN(fr.strut.allowT, 1)} kip allowable in tension`],
      ['Prop force it can deliver', `${fmtN(fr.strut.canProp, 2)} kip`],
      ['What a rigid prop would take', `${fmtN(fr.strut.ideal, 2)} kip shell · ${fmtN(fin.strut.ideal, 2)} kip finished`],
      ['Tension in it', `${fmtN(fr.strut.tension, 1)} kip shell · ${fmtN(fin.strut.tension, 1)} kip finished`],
      ['Thrust into the rails', `${fmtN(fin.strut.thrust, 1)} kip — ${fmtN(fin.strut.railStress, 1)} ksi `
        + `against ${fmtN(fin.strut.railAllow, 1)} allowable, ${(fin.strut.railRatio * 100).toFixed(0)}% on axial alone`],
      ['To prop it fully', `land it ${fmtIn(fin.strut.wantRise)} above the deck, or go to `
        + `${fmtN(fin.strut.wantArea, 2)} in² of tie`],
    ]) kvS.append(el('dt', null, k), el('dd', null, v));
    p.append(kvS);
  }

  p.append(note('All of it static. Trailer frames are normally checked against one and a half to '
    + 'three times the static load to cover what the road does, and none of that is in these numbers.'));

  p.append(el('h3', null, 'Parked'));
  p.append(note('Blocked, the frame only spans between its cribbing, so the demand is a choice rather '
    + 'than a problem. A flatbed move works for the same reason — the deck carries the frame the '
    + 'whole way instead of hanging it off two points.'));
  p.append(table(['Cribbing', 'Moment', 'Shell', 'Finished'],
    fr.cribbing.map((c, i) => [`every ${c.ft} ft`, `${fmtN(c.M, 1)} kip-ft`,
      c.ok ? 'ok' : 'over', fin.cribbing[i].ok ? 'ok' : 'over']),
    [false, true, true, true]));

  p.append(el('h3', null, 'If it ever moves'));
  p.append(note('No axles are under it and none are on order, so nothing here constrains a single '
    + 'decision today. It is carried along because the answer changes as the design does, and it is '
    + 'cheaper to know now than to find out with a house on it.'));
  const kv2 = el('dl', 'kv');
  for (const [k, v] of [
    ['Tongue', `${ax.end} end, hitch ${fmtFt(spec.tongueOverhang)} beyond it`],
    ['Axle group, as built', `${fmtFt(ax.fromTongue(ax.axleGroup))} from the ${ax.end} end`],
    ['Tongue weight there', `${fmtN(Math.round(ax.tongueAtSketch))} lb — ${(ax.fracAtSketch * 100).toFixed(0)}%`],
    ['For 12½% tongue', `axle group ${fmtFt(ax.fromTongue(ax.wanted))} from the ${ax.end} end`],
    ['Carried on the axles', `${fmtN(Math.round(ax.onAxles))} lb`],
    ['Tandem pair', `${fmtN(Math.round(sz.per))} lb each — ${fmtN(sz.rating)} lb axles${sz.short ? ', and still short' : ''}`],
  ]) kv2.append(el('dt', null, k), el('dd', null, v));
  p.append(kv2);
  p.append(note(`Ten to fifteen per cent on the hitch is the window a trailer tows straight in. `
    + `Below that it sways; above it, the tow vehicle runs out of rear axle. And at ${fmtFt(spec.width)} `
    + 'wide, any move is an oversize permit whatever sits under it.'));
}
