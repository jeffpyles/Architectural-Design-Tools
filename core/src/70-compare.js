/* ============================================================
   The Compare panel: what each option in a group would do to this building.

   Not a table of catalog numbers — every row is a real rebuild. Swap the one
   spec key, build the whole model again, take it off, and report what came
   back. That costs a few milliseconds a row and it means the weight on this
   panel is the same number the Weight tab shows once you actually pick it,
   because it was produced the same way.

   It also means the constraints come along for free: switching to cedar on a
   girt wall makes the building's own audit produce a critical note, and the
   row says so rather than quietly showing a lighter wall that cannot be
   built.
   ============================================================ */

/* Which spec key each catalog group is selected by. A building that has no
   such key in its spec simply does not get that comparison — the shop has no
   interior face to choose, so it is not offered one. */
const COMPARE_GROUPS = [
  { group: 'siding', key: 'siding', label: 'Siding' },
  { group: 'roofing', key: 'roofing', label: 'Roofing' },
  { group: 'interior', key: 'interiorFinish', label: 'Interior face' },
  { group: 'sheathing', key: 'sheathingPanel', label: 'Exterior sheet' },
  { group: 'studMaterial', key: 'studMaterial', label: 'Stud material' },
];
function compareGroups(spec) {
  return COMPARE_GROUPS.filter((g) => spec[g.key] !== undefined && ASSEMBLY[g.group]);
}

/* One row per option, each a full rebuild. Cached on the spec, the openings
   and the prices, because this panel re-renders on every drag and rebuilding
   eight models a drag is felt. */
let _cmpCache = null;
function compareOptions(groupKey) {
  const g = COMPARE_GROUPS.find((x) => x.group === groupKey);
  if (!g) return null;
  const ck = JSON.stringify([groupKey, state.spec, state.openings, state.extra, state.prices]);
  if (_cmpCache && _cmpCache.key === ck) return _cmpCache.val;

  const critNow = new Set(
    BUILDING.audit(state.spec, state.openings, state.extra)
      .filter((f) => f.level === 'crit').map((f) => f.title));

  const rows = Object.keys(ASSEMBLY[groupKey]).map((id) => {
    const spec = { ...state.spec, [g.key]: id };
    let lb = 0, usd = 0, hr = 0, own = null, breaks = [];
    try {
      const m = BUILDING.build(spec, state.openings, state.extra);
      const t = takeoff(m, spec, state.prices);
      lb = t.weight.total; usd = t.cost.usd; hr = t.cost.hr;
      /* This option's own share of that total, so the big number can be the
         whole building — which is what makes the deltas honest, since a
         change here moves lumber and labour too — without anybody having to
         guess which of the two it is. */
      own = t.cost.rows.find((x) => x.key === `${groupKey}.${id}`) || null;
      breaks = BUILDING.audit(spec, state.openings, state.extra)
        .filter((f) => f.level === 'crit' && !critNow.has(f.title))
        .map((f) => f.title);
    } catch (e) {
      breaks = ['This option throws: ' + e.message];
    }
    const a = assembly(groupKey, id, state.prices);
    return { id, a, lb, usd, hr, own, breaks, current: state.spec[g.key] === id };
  });

  const cur = rows.find((r) => r.current) || rows[0];
  for (const r of rows) {
    r.dLb = r.lb - cur.lb;
    r.dUsd = r.usd - cur.usd;
    r.dHr = r.hr - cur.hr;
    /* Dollars per pound saved, which is the number that actually decides
       these — and it is only meaningful when one moves against the other. */
    r.perLb = r.dLb < -0.5 && r.dUsd > 0 ? r.dUsd / -r.dLb : null;
  }
  const val = { g, rows, cur };
  _cmpCache = { key: ck, val };
  return val;
}

let compareGroup = null;
function renderCompare() {
  const p = $('#panel-compare');
  if (!p) return;
  p.textContent = '';
  const groups = compareGroups(state.spec);
  if (!groups.length) { p.append(note('Nothing on this building is chosen from the catalog.')); return; }
  if (!compareGroup || !groups.some((x) => x.group === compareGroup)) compareGroup = groups[0].group;

  p.append(note('Every row here is a real rebuild of the whole building with that one thing '
    + 'swapped, so the weight is the number the Weight tab will show once you pick it.'));
  p.append(note('The three big numbers are the WHOLE BUILDING, not the layer — that is what '
    + 'makes the ± figures right, because changing a skin moves the lumber and the hours with '
    + 'it. Each row also says how much of the total that one layer is. Costs are material '
    + 'only; the bottom of the panel lists what is left out.'));

  /* Which decision to look at. */
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Which choice to compare');
  for (const g of groups) {
    const lab = document.createElement('label');
    const i = document.createElement('input');
    i.type = 'radio'; i.name = 'cmp-group'; i.value = g.group;
    i.checked = compareGroup === g.group;
    i.addEventListener('change', () => { compareGroup = g.group; renderCompare(); });
    lab.append(i, el('span', null, g.label));
    seg.append(lab);
  }
  p.append(seg);

  const data = compareOptions(compareGroup);
  if (!data) return;

  /* Lightest first, because that is the axis this building is short of.
     The current pick is marked wherever it lands rather than pinned to the
     top — seeing it sit sixth is the point. */
  const rows = [...data.rows].sort((a, b) => a.lb - b.lb);
  const list = el('div', 'cmp');
  for (const r of rows) {
    const row = el('div', 'cmp-row' + (r.current ? ' cur' : '') + (r.breaks.length ? ' bad' : ''));

    const head = el('div', 'cmp-head');
    head.append(el('b', null, r.a.label));
    if (r.current) head.append(el('span', 'tag used', 'current'));
    if (r.a.quoted) head.append(el('span', 'tag left', 'your price'));
    row.append(head);

    const nums = el('div', 'cmp-nums');
    const cell = (big, small, delta) => {
      const c = el('div', 'cmp-cell');
      c.append(el('b', null, big));
      c.append(el('span', null, small));
      if (delta) c.append(delta);
      return c;
    };
    const dTag = (v, unit, better) => {
      if (Math.abs(v) < 0.5) return el('span', 'cmp-d', 'same');
      const good = better === 'less' ? v < 0 : v > 0;
      return el('span', 'cmp-d ' + (good ? 'good' : 'bad'),
        `${v > 0 ? '+' : '−'}${unit === '$' ? '$' : ''}${fmtN(Math.abs(v), 0)}`
        + (unit === '$' ? '' : ' ' + unit));
    };
    nums.append(
      cell(`${fmtN(r.lb, 0)} lb`, 'whole building', r.current ? null : dTag(r.dLb, 'lb', 'less')),
      cell(`$${fmtN(r.usd, 0)}`, 'all material', r.current ? null : dTag(r.dUsd, '$', 'less')),
      cell(`${fmtN(r.hr, 0)} hr`, 'whole build', r.current ? null : dTag(r.dHr, 'hr', 'less')),
    );
    row.append(nums);

    /* And how much of those totals this one layer actually is. Without this
       line the $8,000 above reads as the price of the siding. */
    if (r.own && r.own.sf) {
      row.append(el('div', 'cmp-own',
        `this layer: ${fmtN(r.own.sf, 0)} sf × $${r.a.usd.toFixed(2)} = `
        + `$${fmtN(r.own.usd, 0)} and ${fmtN(r.own.hr, 1)} hr of it`));
    }

    /* The line that decides it, when there is one. */
    const facts = [];
    if (r.a.shear) facts.push(`${r.a.shear} plf at ${r.a.maxStud}" o.c.`);
    if (r.a.psf != null) facts.push(`${fmtN(r.a.psf, 2)} psf`);
    if (r.perLb) facts.push(`$${r.perLb.toFixed(2)} per lb saved`);
    if (facts.length) row.append(el('div', 'cmp-facts', facts.join('  ·  ')));

    if (r.a.note) row.append(el('div', 'cmp-note', r.a.note));
    for (const b of r.breaks) row.append(el('div', 'cmp-break', '⚠ ' + b));

    /* Type your own quote. It travels in the share code and every number
       above recomputes off it. */
    const pf = el('div', 'field');
    const unit = r.a.usdFt != null && r.a.usd == null ? 'per lineal foot' : 'per square foot';
    pf.append(el('label', null, `$ ${unit}`));
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'name-input';
    inp.value = r.a.usd.toFixed(2);
    inp.setAttribute('aria-label', `Price for ${r.a.label}, dollars ${unit}`);
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(/[^0-9.]/g, ''));
      const key = priceKey(compareGroup, r.id);
      if (isFinite(v) && v >= 0) state.prices[key] = v; else delete state.prices[key];
      scheduleRebuild();
    });
    pf.append(inp);
    if (r.a.quoted) {
      const undo = el('button', 'btn', 'Reset');
      undo.title = `Back to the shipped $${basePrice(compareGroup, r.id).toFixed(2)}`;
      undo.addEventListener('click', () => {
        delete state.prices[priceKey(compareGroup, r.id)];
        scheduleRebuild();
      });
      pf.append(undo);
    }
    row.append(pf);

    if (!r.current) {
      const pick = el('button', 'btn', 'Use this one');
      pick.addEventListener('click', () => {
        state.spec[data.g.key] = r.id;
        scheduleRebuild();
      });
      const br = el('div', 'btn-row');
      br.append(pick);
      row.append(br);
    }
    list.append(row);
  }
  p.append(list);

  /* What the dollars are and are not. */
  p.append(el('h3', null, 'About these numbers'));
  const c = take && take.cost;
  p.append(note(`Prices are ballpark for a US owner-builder as of ${PRICED}, material only. `
    + 'They go stale and they vary by region — type your own over any of them above and they '
    + 'will travel with the layout.'));
  p.append(note('Hours are one person working alone. Somebody who does this every day is two '
    + 'to three times faster.'));
  p.append(note('Not counted anywhere in these totals: '
    + (c ? c.notCosted : NOT_COSTED).join('; ') + '.'));
}
