/* ============================================================
   The panels that are particular to this building, and the BUILDING object
   that hands them to the shell.
   ============================================================ */


/* ---- structure ---- */

/* The shell hands each panel an empty section, so a panel owns its own
   scaffold now rather than finding it waiting in the page. Built once and
   reused: this re-renders on every drag. */
function openingsScaffold() {
  const sec = $('#panel-openings');
  if (sec.firstChild) return;
  const list = el('div'); list.id = 'opList';
  const stock = el('div', 'stock'); stock.id = 'stockList';
  const buyHead = el('h3', null, 'To find or buy'); buyHead.id = 'buyHead';
  const buy = el('div', 'stock'); buy.id = 'buyList';
  const add = el('div', 'btn-row'); add.id = 'addRow';
  sec.append(
    el('p', 'note', 'Drag an opening across its wall in the model, or type an offset. '
      + 'Offsets are measured to the near edge of the rough opening, from the corner named on each card.'),
    list,
    el('h3', null, 'Windows on hand'), stock,
    buyHead, buy,
    el('h3', null, 'Add an opening'), add,
  );
}

function renderOpenings() {
  openingsScaffold();
  const box = $('#opList');
  box.textContent = '';
  for (const wall of ['W', 'S', 'E', 'N']) {
    const ops = openingsOn(wall, state.openings);
    if (!ops.length) continue;
    box.append(el('h3', null, `${WALLS[wall].label} wall`));
    for (const o of ops) {
      const st = stockFor(o);
      const e = wallExtent(wall, state.spec);
      const card = el('div', 'op' + (state.selected === o.id ? ' sel' : ''));
      card.tabIndex = 0;
      card.addEventListener('click', () => { state.selected = o.id; showReadout(o); renderPanels(); });

      const head = el('div', 'op-head');
      head.append(el('span', 'op-name', st.label));
      if (st.resized) head.append(el('span', 'tag used', `${o.stock} resized`));
      card.append(head);
      if (o.name && st.stockLabel !== st.label) {
        const sub = el('div', null, st.stockLabel);
        sub.style.cssText = 'font-size:11px;color:var(--ink-3);margin:-2px 0 4px';
        card.append(sub);
      }

      card.append(wallPicker(o, st));

      const fields = el('div', 'op-fields');
      fields.append(
        textField('Call it', o.name || '', (v) => {
          if (v.trim()) o.name = v.trim(); else delete o.name;
          scheduleRebuild();
        }, { placeholder: st.stockLabel }),
        numField('From ' + WALLS[wall].from, o.off, (v) => moveOpening(o, v)),
        numField('Head height', o.head, (v) => { o.head = v; scheduleRebuild(); }),
        numField('Rough width', st.w, (v) => {
          o.w = Math.max(6, v);
          const e2 = wallExtent(o.wall, state.spec);
          o.off = Math.max(e2.u0, Math.min(e2.u1 - o.w, o.off));
          scheduleRebuild();
        }),
        numField('Rough height', st.h, (v) => { o.h = Math.max(6, v); scheduleRebuild(); }),
      );
      card.append(fields);

      const hdr = sizeHeader(st.w, wall, state.spec);
      const meta = el('div', 'op-meta');
      meta.textContent = `Sill ${fmtFt(o.head - st.h)} · RO ${fmtIn(st.w)} wide × ${fmtIn(st.h)} tall · `
        + `${fmtFt(e.u1 - (o.off + st.w))} to far corner · Header ${hdr.label}`;
      card.append(meta);

      const row = el('div', 'btn-row');
      const rm = el('button', 'btn danger', 'Remove');
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

  // Inventory against what the sketch says is on hand
  const inv = $('#stockList');
  inv.textContent = '';
  for (const s of WINDOW_STOCK) {
    // A resized opening no longer matches the unit sitting in his shop
    const used = state.openings.filter((o) => o.stock === s.id && !stockFor(o).resized).length;
    const rem = s.qty - used;
    const row = el('div', 'stock-row');
    const name = el('div');
    name.append(el('b', null, s.label));
    name.append(el('div', null, s.note));
    name.lastChild.style.cssText = 'font-size:11px;color:var(--ink-3);font-family:var(--f-body)';
    row.append(name, el('span', null, `${used} / ${s.qty}`),
      el('span', 'tag ' + (rem < 0 ? 'over' : rem === 0 ? 'used' : 'left'),
        rem < 0 ? `${-rem} short` : rem === 0 ? 'all used' : `${rem} spare`));
    inv.append(row);
  }

  /* Openings with nothing on the shelf behind them — a custom one never had
     a unit, a resized one gave its unit back. Both are things to order. */
  const buy = $('#buyList');
  buy.textContent = '';
  const wanting = state.openings
    .map((o) => ({ o, st: stockFor(o) }))
    .filter(({ st }) => st.id === 'custom' || st.resized);
  $('#buyHead').style.display = wanting.length ? '' : 'none';
  for (const { o, st } of wanting) {
    const row = el('div', 'stock-row' + (state.selected === o.id ? ' sel' : ''));
    row.addEventListener('click', () => { state.selected = o.id; showReadout(o); renderPanels(); });
    const name = el('div');
    name.append(el('b', null, st.label));
    const kind = o.kind === 'overhead' ? 'overhead door'
      : o.kind === 'man' ? 'man door' : 'window';
    const sub = el('div', null, `${fmtIn(st.w)} × ${fmtIn(st.h)} rough — ${kind}`
      + (st.resized ? `, cut off ${o.stock}` : ', not on the sketch'));
    sub.style.cssText = 'font-size:11px;color:var(--ink-3);font-family:var(--f-body)';
    name.append(sub);
    row.append(name,
      el('span', null, WALLS[o.wall].label),
      el('span', 'tag left', st.resized ? 'resized' : 'to buy'));
    buy.append(row);
  }

  const add = $('#addRow');
  add.textContent = '';
  for (const s of [...WINDOW_STOCK, ...DOOR_STOCK]) {
    const b = el('button', 'btn', s.id.startsWith('W') ? `+ ${s.label}` : `+ ${s.label.replace(/ .*/, '')} door`);
    b.title = s.label;
    const kind = s.id === 'D2' ? 'overhead' : s.id === 'D1' ? 'man' : 'window';
    b.addEventListener('click', () => addOpening({ stock: s.id, kind }));
    add.append(b);
  }
  /* Nothing on the shelf is the right hole: start from one and type its size
     on the card. */
  for (const [label, kind] of [
    ['+ Custom window', 'window'], ['+ Custom man door', 'man'], ['+ Custom overhead', 'overhead'],
  ]) {
    const b = el('button', 'btn', label);
    b.title = 'A rough opening with nothing on the shelf behind it — set its size on the card';
    b.addEventListener('click', () => addOpening({ stock: 'custom', kind }));
    add.append(b);
  }
}

/* Drop a new opening into the north wall, roughly centred, and select it so
   its card is the one already open. */
function addOpening({ stock, kind }) {
  const wall = 'N';
  const e = wallExtent(wall, state.spec);
  const o = {
    id: 'x' + Math.round(performance.now() * 1000).toString(36),
    wall, stock, kind, off: 0, head: 0,
  };
  const st = stockFor(o);
  if (stock === 'custom') { o.w = st.w; o.h = st.h; }
  o.off = Math.max(e.u0, Math.min(e.u1 - st.w, (e.u0 + e.u1) / 2 - st.w / 2));
  o.head = kind === 'window' ? 78.5 : st.h;
  state.openings.push(o);
  state.selected = o.id;
  scheduleRebuild();
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
      o.off = Math.round(Math.max(e2.u0, Math.min(e2.u1 - st.w, o.off)) * 2) / 2;
      state.selected = o.id;
      showReadout(o);
      scheduleRebuild();
    });
    lab.append(i, el('span', null, WALLS[w].label));
    seg.append(lab);
  }
  f.append(seg);
  return f;
}
function renderReview() {
  const p = $('#panel-review');
  p.textContent = '';
  const loads = model.loads;

  const s = state.spec;
  const seis = seismicShear(s);
  const dirs = bracingCheck(s, state.openings);

  p.append(el('h3', null, 'Design loads'));
  p.append(note(`${s.site} — ${s.groundSnow} psf ground snow, ${s.windSpeed} mph basic wind, `
    + `exposure ${s.exposure}, S_DS ${s.seismicSDS} g. Verify against the Douglas County / OSSC values before anything gets cut.`));
  const kv = el('dl', 'kv');
  for (const [k, v] of [
    ['Roof snow / live', `${fmtN(loads.live, 1)} psf`],
    ['Top chord dead', `${fmtN(loads.tcDead, 1)} psf`],
    ['Bottom chord dead', `${fmtN(loads.bcDead, 1)} psf`],
    ['Total on the truss', `${fmtN(loads.total, 1)} psf`],
    ['Per truss', `${fmtN(loads.total * s.depth / 12 * s.trussSpacing / 12)} lb`],
    ['Lateral wind pressure', `${fmtN(windPressure(s), 1)} psf`],
    ['Seismic weight', `${fmtN(seis.W)} lb`],
    ['Seismic base shear', `${fmtN(seis.V)} lb`],
  ]) { kv.append(el('dt', null, k), el('dd', null, v)); }
  p.append(kv);
  const hint = note('The psf figures come from the site and the roof build-up, so they hold '
    + 'still while you work. The pound figures below are the ones that respond to wall '
    + 'height, footprint and where the openings sit.');
  hint.style.marginTop = '8px';
  p.append(hint);

  p.append(el('h3', null, 'Racking resistance'));
  p.append(note('Each bar is capacity ÷ demand for one wall line. 1.00 is the target — '
    + 'at or above it the wall carries its share, below it does not. '
    + 'Only full-height solid runs of 4\'-0" or wider count toward capacity.'));

  for (const dir of dirs) {
    const perLine = dir.V / dir.lines.length;
    p.append(el('h3', null, `${dir.name} wind`));
    const sub = note(`${fmtN(dir.V)} lb reaches the roof and splits between two wall lines, `
      + `so ${fmtN(perLine)} lb lands on each. `
      + `Wind ${fmtN(dir.wind)} lb against seismic ${fmtN(dir.quake)} lb — ${dir.governs} governs.`);
    sub.style.marginTop = '-4px';
    p.append(sub);

    for (const line of dir.lines) {
      const wrap = el('div');
      wrap.style.margin = '0 0 11px';
      const top = el('div');
      top.style.cssText = 'display:flex;justify-content:space-between;font-size:12.5px;gap:8px;align-items:baseline';
      const ratio = el('span', null, `${fmtN(line.ratio, 2)} ×`);
      ratio.style.cssText = 'font-family:var(--f-mono);font-weight:700;font-variant-numeric:tabular-nums;'
        + `color:${line.ratio < 1 ? 'var(--keel)' : line.ratio < 1.3 ? 'var(--warn)' : 'var(--ok)'}`;
      top.append(el('span', null, `${WALLS[line.wall].label} wall`), ratio);
      const m = el('div', 'meter' + (line.ratio < 1 ? ' short' : line.ratio < 1.3 ? ' tight' : ''));
      const fill = el('i');
      fill.style.width = Math.max(2, Math.min(100, line.ratio / 1.5 * 100)) + '%';
      m.append(fill);
      const detail = el('div', null,
        `${fmtFt(line.braced)} of qualifying panel × ${SHEAR_ALLOW[state.spec.bracing]} plf `
        + `= ${fmtN(line.capacity)} lb, against ${fmtN(line.demand)} lb. `
        + `Needs ${line.required === Infinity ? 'a bracing method' : fmtFt(line.required)}.`);
      detail.style.cssText = 'font-size:11.5px;color:var(--ink-3);margin-top:4px';
      wrap.append(top, m, detail);

      // When nothing qualifies the ratio sits at zero however far you slide an
      // opening, so show the gap that is actually closing.
      if (line.braced === 0) {
        const gap = el('div');
        gap.style.cssText = 'margin-top:5px';
        const gt = el('div');
        gt.style.cssText = 'display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-2);gap:8px';
        gt.append(el('span', null, 'Widest unbroken run'),
          el('span', null, `${fmtFt(line.widest)} of ${fmtFt(MIN_PANEL)} needed to count`));
        gt.lastChild.style.cssText = 'font-family:var(--f-mono);font-variant-numeric:tabular-nums';
        const gm = el('div', 'meter tight');
        const gf = el('i');
        gf.style.width = Math.max(2, Math.min(100, line.widest / MIN_PANEL * 100)) + '%';
        gm.append(gf);
        gap.append(gt, gm);
        wrap.append(gap);
      }
      if (line.gypsum > 0) {
        const g = el('div', null,
          `Drywall alone would give ${fmtN(line.gypsum)} lb — reserve, not additive.`);
        g.style.cssText = 'font-size:11.5px;color:var(--ink-3);margin-top:2px';
        wrap.append(g);
      }
      p.append(wrap);
    }
  }

  if (s.wallDrywall) {
    p.append(el('h3', null, 'What the drywall is worth'));
    p.append(note('½" gypsum is a recognised braced-wall material, but at about 75 plf against '
      + '240 plf for OSB, and with a 2:1 aspect limit that needs 6\'-0" of width on a 12\' wall. '
      + 'You take the larger of the two, never the sum. Treat it as reserve.'));
    p.append(note('On the trusses it counts for more: a ceiling fastened to the bottom chords is '
      + 'continuous lateral restraint for those chords, so it can stand in for the 2x4 restraint rows. '
      + 'It does not replace the diagonal bracing that keeps the trusses plumb as a group, '
      + 'and it does nothing for the roof plane — and none of it exists on the day you set the trusses.'));
  }

  const lt = leanToDesign(s);
  if (lt) {
    p.append(el('h3', null, 'Lean-to'));
    inlineControls(p, ['leanToProjection', 'leanToClear', 'leanToPosts', 'leanToSpacing',
      'leanToRafter', 'leanToFraming'], 'r');
    if (lt.impossible) {
      p.append(note(`No lean-to fits on the ${WALLS[lt.wall].label.toLowerCase()} wall — ${lt.reason}. `
        + `A ${fmtFt(s.wallHeight)} wall leaves ${fmtFt(s.wallHeight - lt.clear)} above the required `
        + `${fmtFt(lt.clear)} clearance, and the rafter and beam have to fit inside that.`));
    } else {
      p.append(note(lt.fixed
        ? `Set to ${fmtFt(lt.projection)}. Reach is limited by headroom, not by the pitch: `
          + `every inch of wall height buys ${fmtN(12 / s.pitch, 0)} inches of projection.`
        : `The furthest it reaches before the beam drops below ${fmtFt(lt.clear)}. `
          + `Reach is limited by headroom, not by the pitch: every inch of wall height buys `
          + `${fmtN(12 / s.pitch, 0)} inches of projection.`));
      const kvl = el('dl', 'kv');
      for (const [k, v] of [
        ['Projection', fmtFt(lt.projection)],
        ['Covered area', `${fmtN(lt.area)} sf`],
        ['Ledger at', fmtFt(lt.ledgerTop)],
        ['Beam bottom', fmtFt(lt.beamBot)],
        ['Rafters', `${lt.count} × ${lt.rafter.label} at ${fmtIn(s.leanToSpacing)} o.c.`],
        ['Rafter length', fmtFt(lt.rafterLen)],
        ['Beam', `${lt.beam.label} over ${fmtFt(lt.beamSpan)}`],
        ['Posts', `${lt.posts} × 6x6, ${fmtFt(lt.beamBot)} tall`],
        ['Design load', `${fmtN(lt.psf, 1)} psf`],
        ['Hangs below the roof', fmtIn(lt.under)],
      ]) kvl.append(el('dt', null, k), el('dd', null, v));
      p.append(kvl);

      /* The framing choice, as a number rather than an argument. Compared at
         the same projection, because comparing at each one's own maximum
         hides the gain inside a bigger building. */
      {
        const other = leanToDesign({ ...s, leanToFraming: lt.flush ? 'onTop' : 'flush',
          leanToProjection: lt.projection });
        const gain = lt.otherUnder - lt.under;
        p.append(el('h4', null, lt.flush ? 'Rafters hung off the beam face'
          : 'Rafters sitting on top of the beam'));
        p.append(note(lt.flush
          ? `Sloped-seat hangers at every rafter. The rafter and the beam share one band `
            + `instead of stacking, so ${fmtIn(lt.under)} hangs below the roof line rather `
            + `than ${fmtIn(lt.otherUnder)}. That is ${fmtIn(gain)} of headroom at the same `
            + `projection — or, since reach is set by headroom, `
            + `${fmtFt(gain / lt.slope)} of extra reach at the same clear height. `
            + 'The costs: a hanger per rafter, and a beam at least as deep as the rafters.'
          : `The simple build — beam up, rafters across it. It stacks the two, so `
            + `${fmtIn(lt.under)} hangs below the roof line. Hanging them off the face `
            + `instead would put ${fmtIn(lt.otherUnder)} below it, `
            + `${fmtIn(-gain)} back, worth ${fmtFt(-gain / lt.slope)} of reach — `
            + 'at the price of a sloped-seat hanger at every rafter.'));
        if (other && !other.impossible) {
          const cmp = el('dl', 'kv');
          for (const [k, a, b] of [
            ['Headroom at this projection', lt.headroom, other.headroom],
            ['Beam', null, null],
          ]) {
            if (a == null) { cmp.append(el('dt', null, k), el('dd', null, `${lt.beam.label} vs ${other.beam.label}`)); continue; }
            cmp.append(el('dt', null, k), el('dd', null, `${fmtFt(a)} vs ${fmtFt(b)}`));
          }
          p.append(cmp);
        }
        if (lt.rafterNamed) {
          const bad = !lt.rafterOK;
          const w = note(`${lt.rafter.label} named rather than sized: `
            + `${fmtN(lt.rafter.ratio * 100)}% of bending and `
            + `${fmtN(lt.rafter.deflRatio * 100)}% of the L/180 deflection limit`
            + (bad ? ` — over, ${lt.rafter.governs} governs.` : '.'));
          if (bad) w.style.color = 'var(--keel)';
          p.append(w);
        }
      }
      if (s.leanToDrift && lt.drift.pd > 0) {
        p.append(note(`Includes drifted snow: ${fmtN(lt.drift.pd)} psf over the `
          + `${fmtN(lt.drift.width, 1)} ft nearest the wall, smeared across the span. `
          + 'Snow blows off the main roof and piles against the building, so the lean-to '
          + 'carries more than the flat ground-snow figure.'));
      }
    }
  }

  if (s.ceilingDrywall) {
    const v = ventilation(s);
    p.append(el('h3', null, 'Attic ventilation'));
    const kv2 = el('dl', 'kv');
    for (const [k, val] of [
      ['Ceiling area', `${fmtN(v.ceilSf)} sf`],
      [`Net free area at 1/${v.ratio}`, `${fmtN(v.nfaIn)} sq in`],
      ['Ridge vent needed', `${fmtN(v.ridgeNeedLf, 1)} ft of ${fmtN(v.ridgeLf)} ft`],
      ['Per gable louvre', `${fmtN(v.gableEach)} sq in`],
    ]) kv2.append(el('dt', null, k), el('dd', null, val));
    p.append(kv2);
  }

  p.append(el('h3', null, `Notes (${findings.length})`));
  if (!findings.length) p.append(note('Nothing flagged in the current layout.'));
  const rank = { crit: 0, warn: 1, info: 2 };
  for (const f of [...findings].sort((a, b) => rank[a.level] - rank[b.level])) {
    const d = el('div', 'finding ' + f.level);
    const body = el('div', 'body');
    body.append(el('h5', null, f.title), el('p', null, f.body));
    d.append(el('i'), body);
    p.append(d);
  }
}

/* ---- electrical ----
   The rough-in, as a list you can edit. Every row is one box: where it is,
   how big, what is in it and which circuit it lands on — and under each of
   them the box fill, because that is the number that decides whether what you
   have asked for actually goes in the box you have asked for. */
function renderElectrical() {
  const p = $('#panel-electrical');
  p.textContent = '';
  const spec = state.spec;
  const devs = currentDevices(spec);
  const owned = !!(state.extra && ((state.extra.devices && state.extra.devices.length)
    || (state.extra.circuits && state.extra.circuits.length)));

  p.append(note('Drag a box across its wall in the model, or set it here. Ceiling boxes '
    + 'drag on the ceiling plane — look down into the building to grab one. Arrow keys '
    + 'nudge the selected box a half inch, shift-arrow six inches.'));
  if (!owned) {
    p.append(note('This is the rough-in the tool generates: a perimeter circuit at bench '
      + 'height, three rows of lights, a switch at each man door. Change anything and it '
      + 'becomes yours — the generated one stops applying and the layout code starts '
      + 'carrying the boxes.'));
  }

  /* ---- circuits ---- */
  const ckts = currentCircuits(spec);
  const cl = circuitLoads(devs, spec);
  p.append(el('h3', null, `Circuits — ${ckts.length}`));
  p.append(note('Name them for what you go looking for at the panel. Deleting one moves '
    + 'its boxes to the lowest circuit left, and says how many it moved.'));
  for (const c of ckts) {
    const r = cl.rows.find((x) => x.ckt === c.n);
    const on = devs.filter((d) => !d.panel && (d.ckt || 1) === c.n).length;
    const row = el('div', 'ckt-row');
    row.append(el('span', 'ckt-n', String(c.n)));
    row.append(textField('', c.name, (v) => renameCircuit(spec, c.n, v),
      { placeholder: autoCircuitName(c.n, devs) }));
    const meta = el('span', 'ckt-meta');
    meta.textContent = r
      ? `${on} box${on === 1 ? '' : 'es'} · ${fmtN(r.design)} VA · ${fmtN(r.amps, 1)} A`
      : `${on} box${on === 1 ? '' : 'es'} · nothing on it`;
    if (r && (!r.ok || !r.outletsOK)) meta.style.color = 'var(--keel)';
    row.append(meta);
    const rm = el('button', 'btn danger', 'Delete');
    rm.disabled = ckts.length <= 1;
    rm.title = ckts.length <= 1 ? 'A box has to be on something' : `Delete circuit ${c.n}`;
    rm.addEventListener('click', () => {
      const res = removeCircuit(spec, c.n);
      if (res.ok && res.moved) {
        window.setTimeout(() => {
          const el2 = document.getElementById('cktMsg');
          if (el2) el2.textContent = `Moved ${res.moved} box${res.moved === 1 ? '' : 'es'} `
            + `to circuit ${res.to}.`;
        }, 0);
      }
    });
    row.append(rm);
    p.append(row);
  }
  const cktMsg = el('p', 'note'); cktMsg.id = 'cktMsg';
  p.append(cktMsg);
  const cktAdd = el('div', 'btn-row');
  const bAdd = el('button', 'btn', '+ Add a circuit');
  bAdd.addEventListener('click', () => addCircuit(spec));
  cktAdd.append(bAdd);
  p.append(cktAdd);

  /* ---- the panel schedule ---- */
  /* Four columns, because the loads are already spelled out above — this is
     the strip that goes on the panel door. */
  p.append(el('h3', null, 'Panel schedule'));
  p.append(table(['Ckt', 'Serves', 'Amps', 'Breaker'],
    cl.rows.map((r) => [
      String(r.ckt),
      `${circuitName(r.ckt, ckts) || autoCircuitName(r.ckt, devs)} — `
        + ([r.outlets ? `${r.outlets} outlet${r.outlets === 1 ? '' : 's'}` : null,
          r.fixtures ? `${r.fixtures} fixture${r.fixtures === 1 ? '' : 's'}` : null]
          .filter(Boolean).join(', ') || 'nothing on it'),
      `${fmtN(r.amps, 1)} A${r.ok && r.outletsOK ? '' : ' ✕'}`,
      r.general ? '20 A / 12' : `${r.breaker} A / ${r.gauge}`,
    ]), [true, false, true, true]));
  p.append(note(`${fmtN(cl.totalVA)} VA connected against a ${spec.service} A sub-panel — `
    + `${fmtN(cl.amps, 1)} A if everything ran at once, which it never does. Lighting is `
    + 'counted at 125% because a breaker is sized that way for anything that runs three '
    + 'hours. This is a tally, not a design: an electrician decides the circuits.'));

  /* ---- box fill, as a run of bars ---- */
  const fills = devs.map((d) => ({ d, f: boxFill(d) })).filter((x) => x.f);
  const over = fills.filter((x) => !x.f.ok || !x.f.gangsOK);
  p.append(el('h3', null, `Box fill — ${fills.length} boxes, ${over.length} over`));
  p.append(note('NEC 314.16: two conductor allowances for every yoke, one for every '
    + 'conductor coming in, one for all the grounds together and one for the clamps if '
    + 'the box has them. 2.25 cu in each at 12 AWG. The grounds and the clamps are the '
    + 'two everybody forgets.'));
  if (over.length) {
    for (const { d, f } of over) {
      const row = el('div', 'meter-row');
      const top = el('div', 'meter-top');
      const r = el('span', null, `${fmtN(f.need, 1)} / ${fmtN(f.have, 1)}`);
      r.style.cssText = 'font-family:var(--f-mono);font-weight:700;color:var(--keel)';
      top.append(el('span', null, `${deviceLabel(d)} — ${d.wall === 'C' ? 'ceiling' : WALLS[d.wall].label}`), r);
      const m = el('div', 'meter short');
      const fill = el('i');
      fill.style.width = `${Math.min(100, f.have / f.need * 100)}%`;
      m.append(fill);
      const sub = el('div', 'meter-sub');
      sub.textContent = f.smallest
        ? `A ${f.smallest.label.toLowerCase()} is the smallest that holds it.`
        : 'Nothing on the list holds it — split the run.';
      row.append(top, m, sub);
      p.append(row);
    }
  } else {
    const okLine = note(`Every box has room. The tightest is `
      + `${fmtN(Math.min(...fills.map((x) => x.f.spare)), 1)} cu in spare.`);
    okLine.style.color = 'var(--ok)';
    p.append(okLine);
  }

  /* ---- the boxes ---- */
  p.append(el('h3', null, 'Boxes'));
  const list = el('div');
  const walls = ['N', 'E', 'S', 'W', 'C'];
  for (const wall of walls) {
    const on = devs.filter((d) => d.wall === wall)
      .sort((a, b) => a.u - b.u);
    if (!on.length) continue;
    list.append(el('h4', null, wall === 'C' ? 'Ceiling' : `${WALLS[wall].label} wall`));
    for (const d of on) list.append(deviceCard(d, spec));
  }
  p.append(list);

  /* ---- adding ---- */
  p.append(el('h3', null, 'Add a box'));
  const add = el('div', 'btn-row');
  for (const [items, box, label] of [
    [['duplex'], '1g18', '+ Receptacle'],
    [['gfci'], '1g18', '+ GFCI'],
    [['sw1'], '1g18', '+ Switch'],
    [['duplex', 'duplex'], '2g32', '+ 2-gang'],
    [['r240'], '2g32', '+ 240 V'],
    [['light'], 'oct15', '+ Light'],
    [[], '1g18', '+ Empty box'],
  ]) {
    const b = el('button', 'btn', label);
    b.addEventListener('click', () => {
      const l = ownDevices(spec);
      const ceiling = items.includes('light');
      l.push({
        id: 'x' + Math.round(performance.now() * 1000).toString(36),
        wall: ceiling ? 'C' : 'N',
        u: ceiling ? spec.width / 2 : spec.width / 2,
        v: ceiling ? spec.depth / 2 : 48,
        box, items: items.slice(), feeds: 2,
        /* Onto whatever is selected if a box is selected, or the first
           circuit — never onto a circuit that does not exist. */
        ckt: (l.find((x) => x.id === state.selected) || {}).ckt
          || Math.min(...currentCircuits(spec).map((c) => c.n)),
      });
      state.selected = l[l.length - 1].id;
      scheduleRebuild();
    });
    add.append(b);
  }
  p.append(add);
  if (owned) {
    const back = el('button', 'btn danger', 'Back to the generated rough-in');
    back.style.marginTop = '12px';
    back.addEventListener('click', () => {
      state.extra.devices = null;
      state.extra.circuits = null;
      state.selected = null;
      scheduleRebuild();
    });
    p.append(back);
  }
}

function deviceCard(d, spec) {
  const f = boxFill(d);
  const card = el('div', 'op' + (state.selected === d.id ? ' sel' : ''));
  card.tabIndex = 0;
  card.addEventListener('click', () => {
    state.selected = d.id;
    showItemReadout({ id: d.id, readout: () => deviceReadout(d, spec) });
    renderPanels();
  });

  const head = el('div', 'op-head');
  head.append(el('span', 'op-name', deviceLabel(d)));
  if (f) {
    const tag = el('span', 'tag ' + (f.ok && f.gangsOK ? 'left' : 'over'),
      `${fmtN(f.need, 1)} / ${fmtN(f.have, 1)} cu in`);
    head.append(tag);
  }
  card.append(head);
  if (d.panel) {
    const m = el('div', 'op-meta');
    m.textContent = `${fmtFt(d.u)} from the ${WALLS[d.wall].from}, middle at ${fmtFt(d.v)}. `
      + 'Drag it like anything else.';
    card.append(m);
    return card;
  }

  const fields = el('div', 'op-fields');
  fields.append(
    numField(d.wall === 'C' ? 'From the west wall' : `From the ${WALLS[d.wall].from}`,
      d.u, (v) => moveDevice(d, v, d.v)),
    numField(d.wall === 'C' ? 'From the north wall' : 'Above the slab',
      d.v, (v) => moveDevice(d, d.u, v)),
  );
  card.append(fields);

  /* box, circuit, feeds */
  const row = el('div', 'op-fields');
  row.append(
    pickField('Box', d.box, Object.entries(EBOX)
      .filter(([, b]) => !!b.ceiling === (d.wall === 'C'))
      .map(([k, b]) => [k, b.label]),
    (v) => { editDevice(d, (x) => { x.box = v; }); }),
    pickField('Cables in', String(d.feeds || 2),
      [['1', '1 — end of run'], ['2', '2 — through'], ['3', '3 — junction'], ['4', '4']],
      (v) => { editDevice(d, (x) => { x.feeds = Number(v); }); }),
    /* A circuit is picked from the ones that exist, not typed. It used to be a
       numField, which is a LENGTH field despite the name — so circuit 3 read
       back as 0'-3". */
    pickField('Circuit', String(d.ckt || 1),
      currentCircuits(state.spec).map((c) => [String(c.n), `${c.n} — ${c.name}`]),
      (v) => { editDevice(d, (x) => { x.ckt = Number(v); }); }),
  );
  card.append(row);

  /* what is in it */
  const items = el('div', 'dev-items');
  (d.items || []).forEach((k, i) => {
    const line = el('div', 'dev-item');
    const sel = document.createElement('select');
    for (const [dk, dv] of Object.entries(EDEVICE)) {
      if ((dv.kind === 'fixture') !== (d.wall === 'C')) continue;
      const o = document.createElement('option');
      o.value = dk; o.textContent = dv.label;
      if (dk === k) o.selected = true;
      sel.append(o);
    }
    if (!sel.querySelector('option[selected]') && !sel.value) sel.value = k;
    sel.setAttribute('aria-label', `What is in the box, position ${i + 1}`);
    sel.addEventListener('change', () => editDevice(d, (x) => { x.items[i] = sel.value; }));
    const rm = el('button', 'btn danger', '×');
    rm.title = 'Take it out';
    rm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      editDevice(d, (x) => { x.items.splice(i, 1); });
    });
    line.append(sel, rm);
    items.append(line);
  });
  const addRow = el('div', 'btn-row');
  const more = el('button', 'btn', '+ Another device in this box');
  more.addEventListener('click', (ev) => {
    ev.stopPropagation();
    editDevice(d, (x) => { x.items.push(d.wall === 'C' ? 'light' : 'duplex'); });
  });
  const rmBox = el('button', 'btn danger', 'Remove the box');
  rmBox.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const l = ownDevices(state.spec);
    const i = l.findIndex((x) => x.id === d.id);
    if (i >= 0) l.splice(i, 1);
    if (state.selected === d.id) state.selected = null;
    scheduleRebuild();
  });
  addRow.append(more, rmBox);
  card.append(items, addRow);

  if (f) {
    const meta = el('div', 'op-meta');
    meta.textContent = `${f.conductors} conductors + 1 ground`
      + `${f.clamps ? ' + 1 clamps' : ''} + ${f.yokes * 2} for ${f.yokes} yoke`
      + `${f.yokes === 1 ? '' : 's'} = ${f.count} × 2.25 = ${fmtN(f.need, 1)} cu in. `
      + (f.ok && f.gangsOK
        ? `${fmtN(f.spare, 1)} cu in spare.`
        : (f.smallest ? `Smallest that holds it: ${f.smallest.label}.`
          : 'Nothing on the list holds it.'));
    if (!f.ok || !f.gangsOK) meta.style.color = 'var(--keel)';
    card.append(meta);
  }
  return card;
}

/* Editing anything about a box has to go through the owned copy, or the change
   lands on the generated list and disappears on the next rebuild. */
function editDevice(d, fn) {
  const l = ownDevices(state.spec);
  const live = l.find((x) => x.id === d.id);
  if (!live) return;
  if (!live.items) live.items = [];
  fn(live);
  state.selected = live.id;
  scheduleRebuild();
}

/* A labelled dropdown, the same shape numField makes for a number. */
function pickField(label, value, opts, onChange) {
  const f = el('div', 'field');
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const l = el('label', null, label); l.htmlFor = id;
  const sel = document.createElement('select');
  sel.id = id;
  for (const [v, t] of opts) {
    const o = document.createElement('option');
    o.value = String(v); o.textContent = t;
    if (String(value) === String(v)) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('change', () => onChange(sel.value));
  f.append(l, sel);
  return f;
}

/* ---- foundation ----
   Two questions that have nothing to do with each other, which is the point of
   putting them on one panel. The footing is asked what the building weighs and
   answers "not much" — it gets sized by frost and by detailing. The slab is
   asked the same thing and doesn't care: it gets sized by whatever drives on
   it, and the number that decides it is not a load but a detail, whether the
   joints carry shear across themselves. */
function renderFoundation() {
  const p = $('#panel-foundation');
  p.textContent = '';
  const s = state.spec;
  const fd = footingDesign(s);
  const sl = slabDesign(s);
  const pf = postFooting(s);
  const ab = anchorSchedule(s, state.openings);

  /* A ratio bar, the same shape the Review tab uses: capacity over demand,
     1.00 is the line.

     `muted` greys one out. A case that has been designed away — the free-edge
     wheel, once the joints are doweled — still belongs on screen, because
     seeing what the detail bought is the point. But a red bar next to a
     sentence saying it does not apply reads as a failure, and it isn't one. */
  const meter = (label, ratio, sub, cap, muted) => {
    const row = el('div', 'meter-row');
    const top = el('div', 'meter-top');
    const r = el('span', null, `${fmtN(Math.min(ratio, 99), 2)} ×`);
    const col = muted ? 'var(--ink-3)'
      : ratio < 1 ? 'var(--keel)' : ratio < 1.15 ? 'var(--warn)' : 'var(--ok)';
    r.style.cssText = 'font-family:var(--f-mono);font-weight:700;'
      + `font-variant-numeric:tabular-nums;color:${col}`;
    const lab = el('span', null, label);
    if (muted) lab.style.color = 'var(--ink-3)';
    top.append(lab, r);
    const m = el('div', 'meter' + (muted ? '' : ratio < 1 ? ' short' : ratio < 1.15 ? ' tight' : ''));
    const fill = el('i');
    fill.style.width = `${Math.max(2, Math.min(100, ratio / (cap || 2) * 100))}%`;
    if (muted) fill.style.background = 'var(--ink-3)';
    m.append(fill);
    const sb = el('div', 'meter-sub'); sb.textContent = sub;
    row.append(top, m, sb);
    p.append(row);
    return row;
  };

  p.append(note(`${fd.soil.label} at ${fmtN(fd.soil.q)} psf, which is the presumptive value the `
    + 'code lets you assume with no soils report — not a number anybody measured here. '
    + `Subgrade modulus ${fmtN(fd.soil.k)} pci with a compacted base over it, which is what the `
    + 'slab calculation needs. Every knob on this tab is here rather than in Structure, so you '
    + 'can watch what each one moves.'));
  inlineControls(p, ['soil', 'concreteFc'], 'f');

  /* ---- the perimeter ---- */
  p.append(el('h3', null, 'Perimeter turndown'));
  inlineControls(p, ['turndownWidth', 'turndownDepth', 'frostDepth', 'gravelDepth'], 'f');
  const kv = el('dl', 'kv');
  for (const [k, v] of [
    ['Under the bearing walls', `${fmtN(fd.lines.bearing.total)} plf`],
    ['— of that, roof', `${fmtN(fd.lines.bearing.roof)} plf`],
    ['— of that, wall', `${fmtN(fd.lines.bearing.wall)} plf`],
    ['Under the gable ends', `${fmtN(fd.lines.gable.total)} plf`],
    ['Width bearing asks for', fmtIn(fd.bearingWidth)],
    ['Width detailing asks for', fmtIn(fd.detailWidth)],
    ['Depth frost asks for', fmtIn(fd.frostDepth)],
    ['As drawn', `${fmtIn(fd.builtWidth)} × ${fmtIn(fd.builtDepth)}`],
  ]) kv.append(el('dt', null, k), el('dd', null, v));
  p.append(kv);

  meter('Width', fd.builtWidth / fd.width,
    `${fmtIn(fd.builtWidth)} poured against ${fmtIn(fd.width)} required — ${fd.governs} governs`, 2.5);
  meter('Depth', fd.builtDepth / fd.depth,
    `${fmtIn(fd.builtDepth)} against ${fmtIn(fd.depth)}: ${fmtIn(s.frostDepth)} of frost cover `
    + `below grade plus the ${fmtIn(s.slabThickness)} slab`, 1.6);
  meter('Bearing pressure', fd.soil.q / fd.peak,
    `${fmtN(fd.peak)} psf at the outside face against ${fmtN(fd.soil.q)} allowed. `
    + `The wall lands ${fmtIn(fd.ecc)} off the centre of the strip, so ${fmtN(fd.avg)} psf `
    + 'average understates it.', 4);

  p.append(note(`${fmtN(fd.lines.bearing.total)} plf is a light building. On ${fmtN(fd.soil.q)} psf `
    + `it wants ${fmtIn(fd.bearingWidth)} of bearing width — about a quarter of what gets poured. `
    + `The ${fmtIn(fd.builtWidth)} is there to land a plate on, to hold a ½" bolt with its edge `
    + 'distance, and to carry two bars in the bottom. Bearing is not the constraint, so a heavier '
    + 'roof or taller walls will not change this trench.'));

  /* ---- the slab ---- */
  p.append(el('h3', null, 'Slab'));
  inlineControls(p, ['slabThickness', 'wheelLoad', 'tirePressure', 'jointTransfer'], 'f');
  p.append(note(`Westergaard: a ${fmtN(s.wheelLoad)} lb wheel at ${s.tirePressure} psi on an elastic `
    + `plate over an elastic subgrade — a ${fmtN(sl.a, 2)}" contact radius. `
    + `${fmtN(sl.fc)} psi concrete ruptures at ${fmtN(sl.fr)} psi in bending, and at a factor of `
    + `${sl.FS} that leaves ${fmtN(sl.allow)} psi to work to. `
    + 'The building has nothing to do with this number.'));

  p.append(table(['Thickness', 'Mid-panel', 'At a free edge'],
    sl.rows.map((r) => {
      const mark = (v, ok) => `${fmtN(v)}${ok ? '' : ' ✕'}`;
      return [fmtIn(r.h) + (Math.abs(r.h - s.slabThickness) < 0.001 ? ' ←' : ''),
        mark(r.interior, r.intOK), mark(r.edge, r.edgeOK)];
    }), [false, true, true]));
  p.append(note(`Stress in psi against ${fmtN(sl.allow)} allowable; a ✕ is over, and ← is the `
    + 'thickness currently drawn. The two columns are the same wheel in two places: in the middle '
    + 'of a panel, where the concrete works in both directions, and at a free edge, where it can '
    + 'only work in one and the stress is roughly double.'));

  meter('As drawn, mid-panel', sl.allow / sl.at.interior,
    `${fmtIn(s.slabThickness)} slab, ${fmtN(sl.at.interior)} psi of ${fmtN(sl.allow)}`, 2.5);
  meter(sl.doweled ? 'Free edge — designed away' : 'As drawn, free edge',
    sl.allow / sl.at.edge,
    `${fmtN(sl.at.edge)} psi of ${fmtN(sl.allow)}`
    + (sl.doweled
      ? ' — what a wheel would do at a plain sawcut. Doweling the joints is what takes this case '
        + 'off the table, so it is shown grey rather than short.'
      : ' — and every sawcut joint is one of these'), 2.5, sl.doweled);

  const decide = el('dl', 'kv');
  for (const [k, v] of [
    ['If only the middle mattered', sl.interiorOnly ? fmtIn(sl.interiorOnly.h) : 'over 8"'],
    ['If every joint is a free edge', sl.edgeToo ? fmtIn(sl.edgeToo.h) : 'over 8"'],
    ['Joints as specified', sl.doweled ? 'doweled or keyed' : 'plain sawcut'],
    ['So the minimum is', sl.min ? fmtIn(sl.min.h) : 'more than 8"'],
    ['Drawn at', fmtIn(s.slabThickness)],
  ]) decide.append(el('dt', null, k), el('dd', null, v));
  p.append(decide);
  p.append(note(sl.interiorOnly && sl.edgeToo && sl.edgeToo.h > sl.interiorOnly.h
    ? `The whole decision is ${fmtIn(sl.edgeToo.h - sl.interiorOnly.h)} of concrete over `
      + `${fmtN(s.width * s.depth / 144)} sf, and it turns on a detail rather than a load: `
      + 'put smooth dowels or a key across each contraction joint and the joints stop being free '
      + 'edges. Dowels are cheaper. The perimeter is not a free edge either way — the turndown '
      + 'is poured monolithic with the slab and holds it up.'
    : 'At this wheel load the edge case and the interior case land on the same thickness, so the '
      + 'joint detail is not what decides it. Dowel them anyway: an undoweled joint faults over '
      + 'time whether or not the concrete cracks.'));

  /* ---- steel ---- */
  p.append(el('h3', null, 'Reinforcement'));
  inlineControls(p, ['slabReinf', 'slabBar'], 'f');
  if (s.slabReinf === 'rebar') {
    p.append(table(['Bar', 'Spacing', 'Provides', 'Steel'],
      sl.barAll.map((o) => [
        o.size + (o.size === sl.bar.size ? ' ←' : '') + (o.ok ? '' : ' ✕'),
        `${fmtIn(o.at)} o.c.`,
        `${fmtN(o.provided, 3)} in²/ft`,
        `${fmtN(o.psf, 2)} lb/sf`,
      ]), [false, true, true, true]));
    p.append(note(`← is what the model draws${sl.barChosen === 'named'
      ? `, named over the ${sl.auto.size} the rule picks` : ''}; a ✕ cannot make the area even at `
      + `${fmtIn(12)} o.c. ${fmtN(sl.asReq, 3)} in² per foot required — 0.0018 of a `
      + `${fmtIn(s.slabThickness)} section, grade 60, each way. Where more than one row works the `
      + 'choice is about placing rather than strength: wider spacing is fewer pieces to '
      + 'cut and tie, and a bar big enough to reach 18" in a slab this thin buys steel you have '
      + 'no use for. Subgrade drag wants about a tenth of this, so it is not what sets it.'));
    if (sl.barShort) {
      const w = note(`${sl.bar.size} at ${fmtIn(sl.spacing)} gives ${fmtN(sl.bar.provided, 3)} `
        + `against ${fmtN(sl.asReq, 3)} required, and ${fmtIn(sl.spacing)} is as close together as `
        + `${sl.bar.size} gets placed in a slab. ${sl.auto.size} at ${fmtIn(sl.auto.at)} is the `
        + 'smallest that makes it.');
      w.style.color = 'var(--keel)';
      p.append(w);
    }
  } else {
    p.append(note(s.slabReinf === 'mesh'
      ? 'Welded wire mesh. Order flat sheets, not rolls, and chair them: rolled mesh ends up on '
        + 'the subgrade under a boot and does nothing at all.'
      : 'Fibre only. That controls plastic shrinkage in the first day; it is not a substitute for '
        + 'steel holding a shrinkage crack closed a month later, and it does nothing at a joint.'));
  }
  p.append(note('None of this steel makes the slab thicker or stronger — the table above assumes '
    + 'plain concrete and has to work without it. What it does is hold a crack that has already '
    + 'happened tight enough to keep transferring load across itself. Which means it only works '
    + 'at mid-depth, on chairs. That is where the model draws it, inside the pour, so the '
    + 'viewport hides it: the Takeoff tab is where you see what to buy.'));
  if (s.slabReinf === 'rebar') {
    p.append(note(`${sl.turndownBars} × ${sl.turndownBar.size} continuous in the bottom of the `
      + 'turndown, lapped 40 diameters at every splice and bent round the corners. Crack control '
      + 'in a strip footing, not flexural steel — at this line load the strip is nowhere near bending.'));
  }

  p.append(el('h3', null, 'Contraction joints'));
  const jv = el('dl', 'kv');
  for (const [k, v] of [
    ['Maximum panel', `${fmtN(sl.joints.max, 1)} ft`],
    ['Layout', `${sl.joints.nx} × ${sl.joints.nz} panels`],
    ['Panel size', `${fmtN(sl.joints.panelX, 1)} × ${fmtN(sl.joints.panelZ, 1)} ft`],
    ['Depth of cut', `${fmtIn(s.slabThickness / 4)} — a quarter of the slab`],
  ]) jv.append(el('dt', null, k), el('dd', null, v));
  p.append(jv);
  p.append(note('Thirty times the thickness, panels as close to square as the footprint allows. '
    + 'Cut them the same day, as soon as the surface will carry a blade — a joint cut on day three '
    + 'is a joint the concrete has already chosen for itself somewhere else.'));

  /* ---- posts ---- */
  if (pf) {
    p.append(el('h3', null, pf.form === 'tube' ? 'Lean-to post footings' : 'Lean-to post pads'));
    p.append(note(`${pf.posts} posts over ${fmtFt(pf.span * (pf.posts - 1) * 12)} with the beam `
      + 'spliced over them as simple spans, so they do not share equally: an interior post picks up '
      + 'half a span from each side, an end post half a span from one. And they carry half the '
      + 'lean-to between them — the ledger bolted to the shop wall takes the other half straight '
      + "down the building's own footing."));
    const pv = el('dl', 'kv');
    for (const [k, v] of [
      ['On the beam', `${fmtN(pf.w)} plf`],
      ['Span between posts', `${fmtN(pf.span, 1)} ft`],
      ['End post', `${fmtN(pf.end)} lb`],
      ['Interior post', pf.posts > 2 ? `${fmtN(pf.interior)} lb` : 'none'],
      ['All posts together', `${fmtN(pf.total)} lb`],
      ['End footing', pf.form === 'tube' ? `${fmtIn(pf.endPad.d)} dia`
        : `${fmtIn(pf.endPad.side)} sq × ${fmtIn(pf.thickness)}`],
      ['Worst footing', pf.form === 'tube' ? `${fmtIn(pf.worstPad.d)} dia`
        : `${fmtIn(pf.worstPad.side)} sq × ${fmtIn(pf.thickness)}`],
      ['Bearing on', `${fmtN(pf.worstPad.area, 2)} sf`],
      ['Concrete weighs', `${fmtN(pf.worstPad.selfW)} lb`],
      ['Pressure under it', `${fmtN(pf.worstPad.pressure)} psf of ${fmtN(pf.soil.q)}`],
      ['Bottom', `${fmtIn(pf.depth)} below the slab`],
    ]) pv.append(el('dt', null, k), el('dd', null, v));
    p.append(pv);
    inlineControls(p, ['postForm', pf.form === 'tube' ? 'postTube' : 'postPad'], 'f');
    p.append(table([pf.form === 'tube' ? 'Tube' : 'Pad', 'Bearing on', 'Pressure', 'Concrete'],
      pf.padOptions.map((o) => [
        fmtIn(o.side) + (o.side === pf.worstPad.side ? ' ←' : '') + (o.ok ? '' : ' ✕'),
        `${fmtN(o.area, 2)} sf`,
        `${fmtN(o.pressure)} psf`,
        `${fmtN(o.cuYd, 2)} cu yd`,
      ]), [false, true, true, true]));
    p.append(note(`Under the worst post. ✕ is over ${fmtN(pf.soil.q)} psf; ← is what the model `
      + `draws${pf.padChosen === 'named' ? ', named rather than sized' : ''}. `
      + `The concrete column is all ${pf.posts} of them — the whole range costs about a yard, `
      + 'which is the argument for going a size up rather than sizing to the edge.'));
    {
      /* The two forms, side by side, because the trade is not obvious: a tube
         is quicker and needs more diameter; a pad spreads more for the same
         concrete and has to be formed. */
      const other = postFooting({ ...s, postForm: pf.form === 'tube' ? 'square' : 'tube' });
      const mine = pf.padOptions.find((o) => o.side === pf.worstPad.side) || {};
      const theirs = other && other.padOptions.find((o) => o.side === other.worstPad.side);
      p.append(note(pf.form === 'tube'
        ? `A Sonotube bears on its own end, so there is no spread — the footing is the pier. `
          + `${fmtIn(pf.worstPad.d)} of tube gives ${fmtN(pf.worstPad.area, 2)} sf against the `
          + `${fmtN(other.worstPad.area, 2)} sf a ${fmtIn(other.worstPad.side)} square pad gives, `
          + `at ${fmtN(mine.cuYd, 2)} cu yd of concrete against ${fmtN(theirs ? theirs.cuYd : 0, 2)}. `
          + 'What you buy with the extra diameter is an auger and an afternoon instead of forming. '
          + 'If the diameter starts getting silly, a bell-bottom form spreads the end without a '
          + 'formed pad — nothing here models one, so size it separately.'
        : `A formed pad spreads: ${fmtN(pf.worstPad.area, 2)} sf under a `
          + `${fmtIn(pf.worstPad.side)} square, against ${fmtN(other.worstPad.area, 2)} sf for the `
          + `${fmtIn(other.worstPad.d)} Sonotube that would be needed instead — for about the same `
          + 'concrete. The pad is the cheaper bearing and the tube is the quicker afternoon.'));
    }
    meter('Worst footing', pf.soil.q / pf.worstPad.pressure,
      (pf.form === 'tube'
        ? `${fmtIn(pf.worstPad.d)} tube, ${fmtIn(pf.depth)} deep: `
        : `${fmtIn(pf.worstPad.side)} square by ${fmtIn(pf.thickness)}: `)
      + `${fmtN(pf.worst)} lb of post plus ${fmtN(pf.worstPad.selfW)} lb of concrete over `
      + `${fmtN(pf.worstPad.area, 2)} sf is ${fmtN(pf.worstPad.pressure)} psf, `
      + `against ${fmtN(pf.soil.q)} allowed`, 2.5);
    p.append(note('The drift surcharge that sizes the beam is smeared across the whole projection, '
      + 'which is conservative for these: drifted snow piles against the shop wall, inside the '
      + 'half the ledger carries, so very little of it reaches a post.'));
  }

  /* ---- bolts ---- */
  p.append(el('h3', null, 'Anchor bolts'));
  const av = el('dl', 'kv');
  for (const [k, v] of [
    ['Worst wall line delivers', `${fmtN(ab.worst)} lb`],
    ['Per ½" bolt, 7" embed', `${fmtN(ab.per)} lb`],
    ['Bolts that shear asks for', String(ab.byShear)],
    ['Bolts the code asks for', String(ab.byCode)],
    ['Governs', ab.governs],
    ['Total round the building', String(ab.total)],
  ]) av.append(el('dt', null, k), el('dd', null, v));
  p.append(av);
  p.append(note(`One within 12" of every plate end and none more than ${fmtIn(ab.spacing)} apart. `
    + 'Plate washers, not cut washers: the washer is what stops the plate splitting off the bolt '
    + 'when the wall tries to slide. Set them wet — a drilled-in anchor is a repair, not a plan.'));

  /* ---- the pour ---- */
  p.append(el('h3', null, 'The pour'));
  const cv = el('dl', 'kv');
  for (const [k, v] of [
    ['Concrete in the model', `${fmtN(take.concrete.cuYd, 1)} cu yd`],
    ['Order with waste', `${fmtN(take.concrete.order, 1)} cu yd`],
    ['Compacted base', `${fmtN(s.width * s.depth / 144 * s.gravelDepth / 12 / 27, 1)} cu yd`],
    ['Vapour retarder', `${fmtN((s.width + 12) * (s.depth + 12) / 144)} sf`],
  ]) cv.append(el('dt', null, k), el('dd', null, v));
  p.append(cv);
  inlineControls(p, ['slabInsulation'], 'f');
  p.append(note(s.slabInsulation === 'none'
    ? 'No slab insulation, because the heating question is open. Nothing here assumes any. Worth '
      + 'knowing while the trench is still open: the edge is the part that matters and the part you '
      + 'cannot add afterwards. Two inches of foam against the inside face of the turndown, two feet '
      + 'down, is cheap now and a slab-edge demolition later. Under-slab foam can wait.'
    : s.slabInsulation === 'edge'
      ? 'Edge insulation only — 2" against the inside face of the turndown, down two feet. That is '
        + 'where most of the loss goes, and it is the part that has to happen before the pour.'
      : 'Edge and under. Foam under a slab has to be rated for the load: EPS at 25 psi or better, '
        + 'and the wheel loads above go through it into the subgrade.'));
  p.append(note('What is still assumed rather than known: the frost depth, which the building '
    + 'department sets rather than the weather; '
    + (s.soil === 'clay' ? 'whether this clay is expansive, which changes the detailing rather '
      + 'than the width; ' : '')
    + `whether ${fmtN(fd.soil.q)} psf is true of the actual dirt, which is what a test pit and a `
    + 'hand penetrometer settle for a couple of hundred dollars; whether the pad is on cut, fill '
    + 'or native ground, because engineered fill under a slab has to be placed in lifts and '
    + 'compacted to a tested density; and what the water table does in February. '
    + 'A hole dug in the wet season answers most of it.'));
}

/* ---- truss ---- */
function renderTruss() {
  const p = $('#panel-truss');
  p.textContent = '';
  const tr = model.tr, s = state.spec;

  p.append(note(`${tr.count} trusses at ${fmtIn(s.trussSpacing)} o.c. spanning ${fmtFt(tr.span)}. `
    + 'Fink with a king post: the king post lands at midspan, which is also where the bottom chord splices, '
    + 'so one gusset does both jobs and two equal sticks make the chord.'));

  // Scale drawing
  const W = 340, PAD = 26;
  const sc = (W - PAD * 2) / (tr.span + s.eaveOverhang * 2);
  const H = (tr.rise + tr.chord.d * 2 + 30) * sc + 46;
  const X = (z) => PAD + (z + s.eaveOverhang) * sc;
  const Y = (y) => H - 30 - (y - tr.bcTop + 6) * sc;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.style.cssText = 'display:block;margin:6px 0 14px;overflow:visible';

  const line = (a, b, w, col, dash) => {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', X(a[0])); l.setAttribute('y1', Y(a[1]));
    l.setAttribute('x2', X(b[0])); l.setAttribute('y2', Y(b[1]));
    l.setAttribute('stroke', col); l.setAttribute('stroke-width', w);
    l.setAttribute('stroke-linecap', 'round');
    if (dash) l.setAttribute('stroke-dasharray', dash);
    svg.append(l);
  };
  const text = (x, y, t, anchor, cls) => {
    const n = document.createElementNS(ns, 'text');
    n.setAttribute('x', x); n.setAttribute('y', y);
    n.setAttribute('text-anchor', anchor || 'middle');
    n.setAttribute('fill', cls === 'dim' ? 'var(--ink-3)' : 'var(--ink-2)');
    n.setAttribute('font-size', cls === 'dim' ? 9 : 8.5);
    n.setAttribute('font-family', cls === 'dim' ? 'var(--f-display)' : 'var(--f-mono)');
    n.textContent = t;
    svg.append(n);
  };

  const eaveY = tr.bcTop - s.eaveOverhang * tr.slope;
  line([0, tr.bcTop], [tr.span, tr.bcTop], 4, 'var(--chalk)');
  line([-s.eaveOverhang, eaveY], [tr.half, tr.peakY], 4, 'var(--chalk)');
  line([tr.span + s.eaveOverhang, eaveY], [tr.half, tr.peakY], 4, 'var(--chalk)');
  for (const w of tr.webs) line(w.a, w.b, 2.6, 'var(--keel)');
  for (const j of [tr.nodes.bcL, tr.nodes.bcR, tr.nodes.bcMid, tr.nodes.tcL, tr.nodes.tcR,
    tr.nodes.peak, tr.nodes.heelL, tr.nodes.heelR]) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', X(j[0])); c.setAttribute('cy', Y(j[1])); c.setAttribute('r', 3.4);
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'var(--ink-3)'); c.setAttribute('stroke-width', 1);
    svg.append(c);
  }
  // dimension line
  line([0, tr.bcTop - 14], [tr.span, tr.bcTop - 14], 1, 'var(--ink-3)');
  text(X(tr.half), Y(tr.bcTop - 14) + 13, `${fmtFt(tr.span)} SPAN`, 'middle', 'dim');
  text(X(tr.half), Y(tr.peakY) - 8, `${fmtIn(tr.rise)} RISE  ·  ${s.pitch}/12`, 'middle', 'dim');
  p.append(svg);

  // Cut list
  const rows = [
    { n: 2, name: `Top chord, ${tr.chordSize}`, len: tr.tcLength,
      cut: `Plumb cut ${fmtN(90 - tr.angle / D2R, 1)}° at the peak, ${fmtN(tr.angle / D2R, 1)}° bevel at the heel` },
    { n: 2, name: `Bottom chord, ${tr.chordSize}`, len: tr.half,
      cut: 'Square both ends, splice under the king post' },
  ];
  for (const w of tr.webs) {
    const done = rows.find((r) => Math.abs(r.len - w.len) < 0.02 && r.name.includes('Web'));
    if (done) { done.n += 1; continue; }
    rows.push({
      n: 1, name: `${w.name}, ${tr.chordSize}`, len: w.len,
      cut: w.id === 'kp' ? 'Square both ends' : `${fmtN(w.deg, 1)}° both ends, parallel`,
    });
  }

  p.append(el('h3', null, 'Cut list, one truss'));
  const t = el('table');
  const th = el('thead');
  const hr = document.createElement('tr');
  for (const [h, cls] of [['Qty', 'n'], ['Member', ''], ['Length', 'n']]) {
    const c = el('th', cls, h); hr.append(c);
  }
  th.append(hr); t.append(th);
  const tb = el('tbody');
  for (const r of rows) {
    const tr2 = document.createElement('tr');
    tr2.append(el('td', 'n', String(r.n)), el('td', null, r.name), el('td', 'n', fmtFt(r.len)));
    tb.append(tr2);
    const nr = document.createElement('tr');
    const td = el('td', null, r.cut);
    td.colSpan = 3;
    td.style.cssText = 'font-size:11.5px;color:var(--ink-3);padding-top:0;border-bottom:1px solid var(--rule-soft)';
    nr.append(td); tb.append(nr);
  }
  t.append(tb);
  const wrap = el('div', 'tbl-wrap'); wrap.append(t);
  p.append(wrap);

  p.append(el('h3', null, 'Gussets'));
  p.append(note(`¾" CDX plywood both faces at all 8 joints — ${8 * 2} pieces per truss, `
    + `${(tr.count - 2) * 16} for the ${tr.count - 2} interior trusses. `
    + 'Glue and nail 8d at 3" o.c. staggered, and keep at least 4 nails per member per face. '
    + 'The heel and peak gussets carry the most; size those generously.'));

  p.append(el('h3', null, 'Build notes'));
  const ul = document.createElement('ul');
  ul.style.cssText = 'margin:0;padding-left:18px;font-size:12.5px;color:var(--ink-2)';
  for (const b of [
    `At ${s.pitch}/12 with panel points at the third points, the webs land on 3-4-5 triangles — `
    + `${fmtN(tr.webs[0].deg, 2)}° at every diagonal, and the lengths come out to exact sixteenths.`,
    'Build the first one on the slab, check it against a chalked full-size layout, then use it as the jig for the rest.',
    'Crown every chord the same way and keep the crowns up.',
    `Overall height at the peak is ${fmtFt(tr.overallHeight)} above the slab; `
    + `check it against the door header and your ceiling before you cut the first chord.`,
    tr.span > 240
      ? `A ${fmtFt(tr.span)} site-built truss is a real structural element. Have these reviewed before you set them, `
        + 'or price out engineered trusses — at this span the delivered price is often close.'
      : 'Have the design reviewed before you set them.',
  ]) { const li = document.createElement('li'); li.textContent = b; li.style.marginBottom = '5px'; ul.append(li); }
  p.append(ul);
}
