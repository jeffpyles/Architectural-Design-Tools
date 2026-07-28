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
  const add = el('div', 'btn-row'); add.id = 'addRow';
  sec.append(
    el('p', 'note', 'Drag an opening across its wall in the model, or type an offset. '
      + 'Offsets are measured to the near edge of the rough opening, from the corner named on each card.'),
    list,
    el('h3', null, 'Windows on hand'), stock,
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
      card.append(head);

      card.append(wallPicker(o, st));

      const fields = el('div', 'op-fields');
      fields.append(
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

  const add = $('#addRow');
  add.textContent = '';
  for (const s of [...WINDOW_STOCK, ...DOOR_STOCK]) {
    const b = el('button', 'btn', s.id.startsWith('W') ? `+ ${s.label}` : `+ ${s.label.replace(/ .*/, '')} door`);
    b.title = s.label;
    b.addEventListener('click', () => {
      const kind = s.id === 'D2' ? 'overhead' : s.id === 'D1' ? 'man' : 'window';
      const wall = 'N';
      const e = wallExtent(wall, state.spec);
      state.openings.push({
        id: 'x' + Math.round(performance.now() * 1000).toString(36),
        wall, stock: s.id, kind,
        off: Math.max(e.u0 + 12, (e.u0 + e.u1) / 2 - s.w / 2),
        head: kind === 'window' ? 78.5 : s.h,
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
      ]) kvl.append(el('dt', null, k), el('dd', null, v));
      p.append(kvl);
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
