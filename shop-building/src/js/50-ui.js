/* ============================================================
   50 — Interface. State, interaction, and the five inspector panels.
   ============================================================ */

const state = {
  spec: { ...DEFAULT_SPEC },
  openings: DEFAULT_OPENINGS.map((o) => ({ ...o })),
  stage: STAGES.length - 1,
  stack: true,
  cutaway: 2,
  edges: true,
  selected: null,
  tab: 'openings',
  legendOpen: true,
  inspectorWidth: 372,
  inspectorOpen: true,
};

let model = null, take = null, findings = [], vp = null;
let dirty = true, pendingRebuild = false;

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* ---- occlusion grouping so the cutaway can drop a wall per frame ----
   Girts and purlins stay out of this: they are framing, they read as an open
   lattice, and hiding them made the near side of the building look bare. */
const SKIN_SYS = new Set(['siding', 'sheathing', 'drywall', 'insulation',
  'trim', 'window', 'door', 'roofing', 'deck']);
const OCC_KEYS = ['core', 'N', 'S', 'E', 'W', 'roofN', 'roofS'];

function aabb(g) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const put = (p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } };
  if (g.t === 'box') {
    const xf = boxXform(g);
    for (const k of CUBE_CORNERS) {
      put(xf.pt([k[0] * g.s[0] / 2, k[1] * g.s[1] / 2, k[2] * g.s[2] / 2]));
    }
  } else {
    for (const pt of g.pts) { put([g.x0, pt[1], pt[0]]); put([g.x1, pt[1], pt[0]]); }
  }
  return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
}

function occKey(p, spec) {
  if (!SKIN_SYS.has(p.sys)) return 'core';
  const b = aabb(p.geom);
  if (p.sys === 'roofing' || p.sys === 'deck') {
    return b.c[2] < spec.depth / 2 ? 'roofN' : 'roofS';
  }
  const sx = b.mx[0] - b.mn[0], sz = b.mx[2] - b.mn[2];
  if (Math.min(sx, sz) > 60) return 'core';         // lids and slabs, not wall skin
  if (sz < sx) return b.c[2] < spec.depth / 2 ? 'N' : 'S';
  return b.c[0] < spec.width / 2 ? 'W' : 'E';
}

/* ---- rebuild ---- */
function rebuild() {
  model = buildModel(state.spec, state.openings);
  take = takeoff(model, state.spec);
  findings = auditBuilding(state.spec, state.openings);

  const groups = new Map();
  for (const s of STAGES) for (const o of OCC_KEYS) groups.set(`${s.key}|${o}`, []);
  for (const p of model.parts) {
    const k = `${p.stage}|${occKey(p, state.spec)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(p);
  }
  vp.load(groups);
  dirty = true;
}

function scheduleRebuild() {
  if (pendingRebuild) return;
  pendingRebuild = true;
  requestAnimationFrame(() => { pendingRebuild = false; rebuild(); renderPanels(); });
}

/* ---- draw ---- */
/* Cutaway: 0 off, 1 near walls, 2 near walls and the near roof plane. */
const CUTAWAY_LABEL = ['Cutaway: off', 'Cutaway: walls', 'Cutaway: walls + roof'];

function hiddenWalls() {
  if (!state.cutaway) return new Set();
  const { eye } = vp.matrices();
  const t = vp.cam.target;
  const h = new Set();
  h.add(eye[2] < t[2] ? 'N' : 'S');
  h.add(eye[0] < t[0] ? 'W' : 'E');
  if (state.cutaway >= 2) h.add(eye[2] < t[2] ? 'roofN' : 'roofS');
  return h;
}

function drawOrder() {
  const hide = hiddenWalls();
  const out = [];
  for (let i = 0; i < STAGES.length; i++) {
    if (i > state.stage) continue;
    if (!state.stack && i !== state.stage && STAGES[i].key !== 'site') continue;
    const cur = i === state.stage;
    for (const o of OCC_KEYS) {
      if (hide.has(o)) continue;
      out.push({ key: `${STAGES[i].key}|${o}`, dim: cur ? 1 : 0.9, desat: cur ? 0 : 0.3 });
    }
  }
  return out;
}

function frame() {
  if (dirty) {
    vp.draw(drawOrder(), { edges: state.edges });
    dirty = false;
  }
  requestAnimationFrame(frame);
}

/* ---- theme ---- */
function cssRGB(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const r = v.match(/rgba?\(([^)]+)\)/);
  if (r) { const a = r[1].split(',').map(Number); return [a[0] / 255, a[1] / 255, a[2] / 255]; }
  return [0.9, 0.9, 0.9];
}

function applyTheme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const attr = document.documentElement.getAttribute('data-theme');
  const isDark = attr ? attr === 'dark' : dark;
  vp.setTheme({
    fog: cssRGB('--sunk'),
    sky: isDark ? [0.34, 0.40, 0.44] : [0.86, 0.89, 0.91],
    ground: isDark ? [0.10, 0.12, 0.12] : [0.36, 0.34, 0.30],
    line: isDark ? [0.85, 0.92, 0.95, 0.22] : [0.06, 0.14, 0.13, 0.34],
  });
  dirty = true;
}

/* ---- camera ---- */
const VIEWS = {
  iso:  { az: -0.78, el: 0.42, dist: 900 },
  plan: { az: 0.0001, el: 1.5, dist: 900 },
  N:    { az: Math.PI, el: 0.10, dist: 820 },
  S:    { az: 0, el: 0.10, dist: 820 },
  E:    { az: Math.PI / 2, el: 0.10, dist: 860 },
  W:    { az: -Math.PI / 2, el: 0.10, dist: 860 },
};

function setView(k) {
  const v = VIEWS[k];
  vp.cam.az = v.az; vp.cam.el = v.el; vp.cam.dist = v.dist;
  vp.cam.target = [state.spec.width / 2, 70, state.spec.depth / 2];
  dirty = true;
}

/* ---- picking ---- */
function wallPlanes() {
  const s = state.spec;
  return [
    { wall: 'W', axis: 0, val: 0, n: [-1, 0, 0] },
    { wall: 'E', axis: 0, val: s.width, n: [1, 0, 0] },
    { wall: 'N', axis: 2, val: 0, n: [0, 0, -1] },
    { wall: 'S', axis: 2, val: s.depth, n: [0, 0, 1] },
  ];
}

function pickOpening(px, py) {
  const r = vp.ray(px, py);
  let best = null;
  for (const pl of wallPlanes()) {
    const dn = r.d[0] * pl.n[0] + r.d[2] * pl.n[2];
    if (dn > -0.02) continue;                        // back-facing wall
    const t = (pl.val - r.o[pl.axis]) / r.d[pl.axis];
    if (t < 0) continue;
    const hit = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
    const u = pl.axis === 0 ? hit[2] : hit[0];
    for (const o of state.openings) {
      if (o.wall !== pl.wall) continue;
      const st = stockFor(o);
      const sill = o.head - st.h;
      if (u >= o.off - 2 && u <= o.off + st.w + 2 && hit[1] >= sill - 2 && hit[1] <= o.head + 2) {
        if (!best || t < best.t) best = { t, o, u, grab: u - o.off };
      }
    }
  }
  return best;
}

/* ---- interaction ---- */
function initInput() {
  const cv = $('#cv');
  let mode = null, last = null, drag = null;

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY };
    const hit = (e.button === 0 && !e.shiftKey) ? pickOpening(e.clientX, e.clientY) : null;
    if (hit) {
      mode = 'opening'; drag = hit;
      state.selected = hit.o.id;
      renderPanels(); showReadout(hit.o);
    } else {
      mode = (e.button === 1 || e.shiftKey || e.button === 2) ? 'pan' : 'orbit';
      cv.classList.add('dragging');
    }
  });

  cv.addEventListener('pointermove', (e) => {
    if (!mode) {
      const hit = pickOpening(e.clientX, e.clientY);
      cv.classList.toggle('over-opening', !!hit);
      return;
    }
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };

    if (mode === 'orbit') {
      vp.cam.az -= dx * 0.006;
      vp.cam.el = Math.max(-0.15, Math.min(1.52, vp.cam.el + dy * 0.005));
      dirty = true;
    } else if (mode === 'pan') {
      const k = vp.cam.dist * 0.0016;
      const ca = Math.cos(vp.cam.az), sa = Math.sin(vp.cam.az);
      vp.cam.target[0] -= (dx * ca) * k;
      vp.cam.target[2] += (dx * sa) * k;
      vp.cam.target[1] += dy * k;
      dirty = true;
    } else if (mode === 'opening') {
      const r = vp.ray(e.clientX, e.clientY);
      const pl = wallPlanes().find((p) => p.wall === drag.o.wall);
      const t = (pl.val - r.o[pl.axis]) / r.d[pl.axis];
      if (t > 0) {
        const hit = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
        const u = pl.axis === 0 ? hit[2] : hit[0];
        moveOpening(drag.o, u - drag.grab);
      }
    }
  });

  const end = () => { mode = null; drag = null; cv.classList.remove('dragging'); };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    vp.cam.dist = Math.max(150, Math.min(3000, vp.cam.dist * (1 + Math.sign(e.deltaY) * 0.09)));
    dirty = true;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!state.selected) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const o = state.openings.find((x) => x.id === state.selected);
    if (!o) return;
    const step = e.shiftKey ? 12 : 1;
    if (e.key === 'ArrowLeft') { moveOpening(o, o.off - step); e.preventDefault(); }
    if (e.key === 'ArrowRight') { moveOpening(o, o.off + step); e.preventDefault(); }
    if (e.key === 'ArrowUp') { o.head += step; scheduleRebuild(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { o.head -= step; scheduleRebuild(); e.preventDefault(); }
  });

  window.addEventListener('resize', () => { dirty = true; });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function moveOpening(o, off) {
  const st = stockFor(o);
  const e = wallExtent(o.wall, state.spec);
  o.off = Math.round(Math.max(e.u0, Math.min(e.u1 - st.w, off)) * 2) / 2;
  showReadout(o);
  scheduleRebuild();
}

function showReadout(o) {
  const st = stockFor(o);
  const e = wallExtent(o.wall, state.spec);
  $('#readout').classList.add('on');
  $('#roTitle').textContent = `${WALLS[o.wall].label} wall — ${st.label}`;
  const hdr = sizeHeader(st.w, o.wall, state.spec);
  $('#roBody').textContent =
    `${fmtFt(o.off)} from ${WALLS[o.wall].from}  ·  ${fmtFt(e.u1 - (o.off + st.w))} to the far end  ·  `
    + `head ${fmtFt(o.head)}  ·  sill ${fmtFt(o.head - st.h)}  ·  header ${hdr.label}`;
}

/* ============================================================
   Panels
   ============================================================ */

function renderTitleFacts() {
  const s = state.spec, tr = model.tr;
  const facts = [
    ['Footprint', `${fmtFt(s.width)} × ${fmtFt(s.depth)}`],
    ['Floor', `${fmtN(s.width * s.depth / 144)} sf`],
    ['Walls', fmtFt(s.wallHeight)],
    ['Pitch', `${s.pitch}/12`],
    ['Ridge', `${fmtFt(tr.overallHeight)} above slab`],
    ['Trusses', `${tr.count} @ ${fmtIn(s.trussSpacing)} o.c.`],
    ['Span', fmtFt(tr.span)],
    ['Roof', s.roofing === 'metal' ? `Metal / ${s.roofDeck === 'purlins' ? 'purlins' : 'OSB deck'}` : 'Shingle / OSB deck'],
    ['Walls skin', s.wallSkin === 'girts' ? `Metal / ${s.girtSize} girts` : 'Metal / OSB'],
  ];
  const box = $('#tbFacts');
  box.textContent = '';
  for (const [k, v] of facts) {
    const d = el('div');
    d.append(el('dt', null, k), el('dd', null, v));
    box.append(d);
  }
  $('#tbSub').textContent = `${fmtFt(s.width)} × ${fmtFt(s.depth)}, ridge east–west, gable ends facing the house`;
}

function renderOpenings() {
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

function numField(label, value, onChange) {
  const f = el('div', 'field');
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  const l = el('label', null, label); l.htmlFor = id;
  const i = document.createElement('input');
  i.type = 'text'; i.id = id; i.value = fmtFt(value);
  i.addEventListener('click', (e) => e.stopPropagation());
  i.addEventListener('change', () => {
    const v = parseFeetInches(i.value);
    if (v != null) onChange(v); else i.value = fmtFt(value);
  });
  f.append(l, i);
  return f;
}

/* Accepts 12, 12", 1'-6", 1' 6 1/2", 18.5 — whatever gets typed on a jobsite. */
function parseFeetInches(str) {
  const s = String(str).trim().replace(/[”″]/g, '"').replace(/[’′]/g, "'");
  if (!s) return null;
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*[-\s]?\s*(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/);
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    const fr = m[3] ? parseInt(m[3], 10) / parseInt(m[4], 10) : 0;
    return ft * 12 + Math.sign(ft || 1) * (inch + fr);
  }
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/);
  if (m) {
    const inch = parseFloat(m[1]);
    const fr = m[2] ? parseInt(m[2], 10) / parseInt(m[3], 10) : 0;
    return inch + Math.sign(inch || 1) * fr;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/* ---- structure ---- */
const CONTROLS = [
  { g: 'Skin', k: 'wallSkin', label: 'Wall system', type: 'sel',
    opts: [['girts', 'Girts, no sheathing'], ['sheathing', 'Full OSB sheathing']] },
  { g: 'Skin', k: 'roofDeck', label: 'Roof substrate', type: 'sel',
    opts: [['purlins', 'Purlins, no deck'], ['osb', 'OSB deck']] },
  { g: 'Skin', k: 'roofing', label: 'Roofing', type: 'sel',
    opts: [['metal', 'Metal panel'], ['comp', 'Asphalt shingle']] },
  { g: 'Skin', k: 'siding', label: 'Siding', type: 'sel',
    opts: [['metal', 'Metal panel'], ['lap', 'Lap siding']] },
  { g: 'Skin', k: 'purlinSpacing', label: 'Purlin spacing', type: 'sel',
    opts: [[24, '24" o.c.'], [48, '48" o.c.']], num: true },
  { g: 'Skin', k: 'girtSpacing', label: 'Girt spacing', type: 'sel',
    opts: [[24, '24" o.c.'], [30, '30" o.c.']], num: true },

  { g: 'Structure', k: 'trussSpacing', label: 'Truss spacing', type: 'sel',
    opts: [[16, '16" o.c.'], [24, '24" o.c.'], [48, '48" o.c.']], num: true },
  { g: 'Structure', k: 'trussChord', label: 'Truss chords', type: 'sel',
    opts: [['2x6', '2x6'], ['2x8', '2x8']] },
  { g: 'Structure', k: 'studSpacing', label: 'Stud spacing', type: 'sel',
    opts: [[16, '16" o.c.'], [24, '24" o.c.']], num: true },
  { g: 'Structure', k: 'studSize', label: 'Studs', type: 'sel',
    opts: [['2x6', '2x6'], ['2x4', '2x4']] },
  { g: 'Structure', k: 'bracing', label: 'Racking resistance', type: 'sel',
    opts: [['corners', 'OSB at the corners only'], ['full', 'OSB at every full-height run'],
      ['diaphragm', 'Steel skin as diaphragm'], ['strap', 'Steel strap X-brace'],
      ['none', 'Nothing']] },
  { g: 'Structure', k: 'bracedPanelWidth', label: 'Corner panel width', type: 'len' },
  { g: 'Structure', k: 'wallHeight', label: 'Wall height', type: 'len' },
  { g: 'Structure', k: 'pitch', label: 'Roof pitch', type: 'sel',
    opts: [[3, '3/12'], [4, '4/12'], [5, '5/12']], num: true },
  { g: 'Structure', k: 'heelHeight', label: 'Raised heel', type: 'len' },
  { g: 'Structure', k: 'eaveOverhang', label: 'Eave overhang', type: 'len' },
  { g: 'Structure', k: 'rakeOverhang', label: 'Rake overhang', type: 'len' },

  { g: 'Site & loads', k: 'groundSnow', label: 'Ground snow (psf)', type: 'num' },
  { g: 'Site & loads', k: 'windSpeed', label: 'Basic wind speed (mph)', type: 'num' },
  { g: 'Site & loads', k: 'exposure', label: 'Wind exposure', type: 'sel',
    opts: [['B', 'B — wooded or built up'], ['C', 'C — open country'], ['D', 'D — unobstructed']] },
  { g: 'Site & loads', k: 'seismicSDS', label: 'Seismic S_DS (g)', type: 'num' },
  { g: 'Site & loads', k: 'venting', label: 'Attic ventilation', type: 'sel',
    opts: [['ridge-gable', 'Ridge vent + gable louvres'], ['ridge-soffit', 'Ridge + soffit'],
      ['gable', 'Gable louvres only'], ['none', 'Unvented']] },

  { g: 'Loads & finish', k: 'service', label: 'Sub-panel (amps)', type: 'num' },
  { g: 'Loads & finish', k: 'heated', label: 'Heated building', type: 'bool' },
  { g: 'Loads & finish', k: 'roofPlaneBracing', label: 'Roof-plane bracing', type: 'bool' },
  { g: 'Loads & finish', k: 'dripStop', label: 'Anti-condensation panel', type: 'bool' },
  { g: 'Loads & finish', k: 'insulation', label: 'Insulation', type: 'bool' },
  { g: 'Loads & finish', k: 'wallDrywall', label: 'Wall drywall', type: 'bool' },
  { g: 'Loads & finish', k: 'ceilingDrywall', label: 'Ceiling drywall', type: 'bool' },
];

function renderStructure() {
  const p = $('#panel-structure');
  p.textContent = '';
  p.append(note('The sketch left the roof covering and truss spacing open. '
    + 'Everything here rebuilds the model, the takeoff, and the review notes.'));
  let group = null;
  for (const c of CONTROLS) {
    if (c.g !== group) { group = c.g; p.append(el('h3', null, group)); }
    if (c.type === 'bool') {
      const row = el('div', 'toggle-row');
      row.append(el('span', null, c.label));
      const sw = el('label', 'switch');
      const i = document.createElement('input');
      i.type = 'checkbox'; i.checked = !!state.spec[c.k];
      i.setAttribute('aria-label', c.label);
      i.addEventListener('change', () => { state.spec[c.k] = i.checked; scheduleRebuild(); });
      sw.append(i, el('i'));
      row.append(sw);
      p.append(row);
    } else if (c.type === 'sel') {
      const f = el('div', 'field');
      f.style.marginBottom = '8px';
      const id = 'c-' + c.k;
      const l = el('label', null, c.label); l.htmlFor = id;
      const s = document.createElement('select');
      s.id = id;
      for (const [v, t] of c.opts) {
        const o = document.createElement('option');
        o.value = String(v); o.textContent = t;
        if (String(state.spec[c.k]) === String(v)) o.selected = true;
        s.append(o);
      }
      s.addEventListener('change', () => {
        state.spec[c.k] = c.num ? Number(s.value) : s.value;
        scheduleRebuild();
      });
      f.append(l, s);
      p.append(f);
    } else {
      const f = el('div', 'field');
      f.style.marginBottom = '8px';
      const id = 'c-' + c.k;
      const l = el('label', null, c.label); l.htmlFor = id;
      const i = document.createElement('input');
      i.type = 'text'; i.id = id;
      i.value = c.type === 'len' ? fmtFt(state.spec[c.k]) : String(state.spec[c.k]);
      i.addEventListener('change', () => {
        const v = c.type === 'len' ? parseFeetInches(i.value) : parseFloat(i.value);
        if (v != null && Number.isFinite(v)) { state.spec[c.k] = v; scheduleRebuild(); }
        else i.value = c.type === 'len' ? fmtFt(state.spec[c.k]) : String(state.spec[c.k]);
      });
      f.append(l, i);
      p.append(f);
    }
  }
  const reset = el('button', 'btn', 'Back to the sketch');
  reset.style.marginTop = '14px';
  reset.addEventListener('click', () => {
    state.spec = { ...DEFAULT_SPEC };
    state.openings = DEFAULT_OPENINGS.map((o) => ({ ...o }));
    state.selected = null;
    scheduleRebuild();
  });
  p.append(reset);
}

function note(txt) { return el('p', 'note', txt); }

/* ---- review ---- */
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

/* ---- takeoff ---- */
function renderTakeoff() {
  const p = $('#panel-takeoff');
  p.textContent = '';
  p.append(note('Counted straight off the model. Lumber is rolled into the stock length that wastes least; '
    + 'add your own margin for crooked sticks.'));

  p.append(el('h3', null, 'Lumber to buy'));
  const t1 = table(['Size', 'Length', 'Qty', 'Total lf'],
    take.buyRows.map((r) => [r.size, fmtFt(r.stock), String(r.qty), fmtN(r.lf)]),
    [false, true, true, true]);
  p.append(t1);

  p.append(el('h3', null, 'Sheet goods'));
  const sheets = [];
  for (const s of take.sheetRows) sheets.push([s.kind, `${fmtN(s.sf)} sf`, String(s.sheets)]);
  if (take.gussets) sheets.push(['¾" CDX for gussets', `${take.gussets} pieces`, String(take.gussetSheets)]);
  if (take.drywallSheets) sheets.push(['Gypsum board', `${fmtN(take.dwSf)} sf`, String(take.drywallSheets)]);
  p.append(table(['Item', 'Area', 'Sheets'], sheets, [false, true, true]));

  p.append(el('h3', null, 'Skin'));
  const skin = [
    [state.spec.roofing === 'metal' ? 'Metal roof panel' : 'Architectural shingle',
      `${fmtN(take.roofSf)} sf`, `${fmtN(take.roofSquares, 1)} sq`],
    [state.spec.siding === 'metal' ? 'Metal wall panel' : 'Lap siding',
      `${fmtN(take.sideSf)} sf`, `${fmtN(take.sideSquares, 1)} sq`],
  ];
  p.append(table(['Item', 'Area', 'Squares'], skin, [false, true, true]));

  p.append(el('h3', null, 'Concrete'));
  const kv = el('dl', 'kv');
  for (const [k, v] of [
    ['Slab and turndown', `${fmtN(take.concrete.cuYd, 2)} cu yd`],
    ['Order with waste', `${fmtN(take.concrete.order, 1)} cu yd`],
    ['Slab area', `${fmtN(state.spec.width * state.spec.depth / 144)} sf`],
  ]) kv.append(el('dt', null, k), el('dd', null, v));
  p.append(kv);

  if (take.battSf || take.blownSf) {
    p.append(el('h3', null, 'Insulation'));
    const kv2 = el('dl', 'kv');
    if (take.battSf) kv2.append(el('dt', null, 'R-21 wall batt'), el('dd', null, `${fmtN(take.battSf)} sf`));
    if (take.blownSf) kv2.append(el('dt', null, `Blown lid, ${fmtIn(state.spec.ceilingInsulation)}`),
      el('dd', null, `${fmtN(take.blownSf)} sf`));
    p.append(kv2);
  }

  p.append(el('h3', null, 'Cut list'));
  p.append(note('Every stick the model contains, longest first. Runs longer than 20\'-0" '
    + '— plates, girts, purlins — are split into equal lapped pieces.'));
  p.append(table(['Qty', 'Size', 'Length', 'Where'],
    take.cuts.map((c) => [String(c.qty), c.size, fmtFt(c.len),
      c.spliced ? `${c.uses} (lapped)` : c.uses]),
    [true, false, true, false]));
}

function table(head, rows, numCols) {
  const wrap = el('div', 'tbl-wrap');
  const t = el('table');
  const th = el('thead'); const hr = document.createElement('tr');
  head.forEach((h, i) => hr.append(el('th', numCols[i] ? 'n' : '', h)));
  th.append(hr); t.append(th);
  const tb = el('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    r.forEach((c, i) => tr.append(el('td', numCols[i] ? 'n' : '', c)));
    tb.append(tr);
  }
  t.append(tb); wrap.append(t);
  return wrap;
}

/* ---- legend & stage rail ---- */
function renderLegend() {
  const seen = new Map();
  const visible = new Set();
  for (let i = 0; i <= state.stage; i++) visible.add(STAGES[i].key);
  for (const p of model.parts) {
    if (!visible.has(p.stage)) continue;
    if (!seen.has(p.mat)) seen.set(p.mat, MATERIALS[p.mat]);
  }
  const box = $('#legendBody');
  box.textContent = '';
  for (const [k, m] of seen) {
    if (!m) continue;
    const d = el('div');
    const i = el('i');
    i.style.background = `rgb(${m.c.map((x) => Math.round(x * 255)).join(',')})`;
    d.append(i, el('span', null, m.name));
    box.append(d);
  }
}

function gotoStage(i) {
  state.stage = Math.max(0, Math.min(STAGES.length - 1, i));
  renderPanels();
  dirty = true;
}

function renderStages() {
  const rail = $('#stageRail');
  rail.textContent = '';

  const opts = el('div', 'rail-opts');
  const prev = el('button', 'btn', '←');
  prev.setAttribute('aria-label', 'Previous stage');
  prev.disabled = state.stage === 0;
  prev.addEventListener('click', () => gotoStage(state.stage - 1));
  const next = el('button', 'btn', '→');
  next.setAttribute('aria-label', 'Next stage');
  next.disabled = state.stage === STAGES.length - 1;
  next.addEventListener('click', () => gotoStage(state.stage + 1));
  opts.append(prev, next);
  rail.append(opts);

  // Full rail: one button per stage
  const track = el('div', 'rail-track');
  let active = null;
  STAGES.forEach((s, i) => {
    const b = el('button', 'stage' + (i < state.stage ? ' done' : ''));
    b.setAttribute('aria-pressed', String(i === state.stage));
    b.append(el('span', 'num', String(i + 1).padStart(2, '0')));
    b.append(el('span', 'nm', s.name));
    b.title = s.blurb;
    b.addEventListener('click', () => gotoStage(i));
    if (i === state.stage) active = b;
    track.append(b);
  });
  rail.append(track);

  // Compact stepper for windows too narrow to show eight buttons
  const cur = STAGES[state.stage];
  const compact = el('div', 'rail-compact');
  const label = el('div', 'rc-label');
  label.append(el('span', 'num', `${String(state.stage + 1).padStart(2, '0')} / ${String(STAGES.length).padStart(2, '0')}`));
  label.append(el('span', 'nm', cur.name));
  const dots = el('div', 'rc-dots');
  STAGES.forEach((s, i) => {
    const d = el('button', 'rc-dot' + (i === state.stage ? ' on' : i < state.stage ? ' done' : ''));
    d.setAttribute('aria-label', `${s.name} (stage ${i + 1})`);
    d.title = s.name;
    d.addEventListener('click', () => gotoStage(i));
    dots.append(d);
  });
  compact.append(label, dots);
  rail.append(compact);

  // Keep the active button in view when the track has to scroll
  if (active) {
    requestAnimationFrame(() => {
      if (track.scrollWidth > track.clientWidth + 1) {
        active.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
  }
}

function renderPanels() {
  renderTitleFacts();
  renderOpenings();
  renderStructure();
  renderReview();
  renderTruss();
  renderTakeoff();
  renderLayouts();
  renderLegend();
  renderStages();
  for (const b of document.querySelectorAll('.tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  }
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('on', p.id === 'panel-' + state.tab);
  }
}
