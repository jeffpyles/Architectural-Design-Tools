/* ============================================================
   The application shell: state, the viewport, and every panel that is the
   same whatever is being drawn. Anything building-specific arrives through
   the BUILDING object.
   ============================================================ */

/* ============================================================
   50 — Interface. State, interaction, and the five inspector panels.
   ============================================================ */

const state = {
  spec: null,        // filled from BUILDING.defaults() at boot
  openings: [],
  /* Anything else a building lets you edit. The shell never looks inside it —
     it carries it into build() and audit(), puts it in the share code through
     the building's own packer, and otherwise leaves it alone. */
  extra: {},
  /* Prices somebody typed over the shipped ones, keyed `group.option`. Core
     owns these rather than a building, because what a sheet of plywood costs
     is not a fact about a shop or a tiny house. */
  prices: {},
  stage: 0,
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
function note(txt) { return el('p', 'note', txt); }

/* ---- occlusion grouping so the cutaway can drop a wall per frame ----
   Girts and purlins stay out of this: they are framing, they read as an open
   lattice, and hiding them made the near side of the building look bare. */
const SKIN_SYS = new Set(['siding', 'sheathing', 'drywall', 'insulation',
  'trim', 'window', 'door', 'roofing', 'deck']);
const OCC_KEYS = ['core', 'N', 'S', 'E', 'W', 'roofN', 'roofS'];
/* fp is the footprint the building reports, [x, z] in inches. The cutaway
   sorts skin by which side of the middle it sits on, so it needs the middle
   and nothing else about the building. */
function occKey(p, fp) {
  if (!SKIN_SYS.has(p.sys)) return 'core';
  const b = aabb(p.geom);
  if (p.sys === 'roofing' || p.sys === 'deck') {
    return b.c[2] < fp[1] / 2 ? 'roofN' : 'roofS';
  }
  const sx = b.mx[0] - b.mn[0], sz = b.mx[2] - b.mn[2];
  if (Math.min(sx, sz) > 60) return 'core';         // lids and slabs, not wall skin
  if (sz < sx) return b.c[2] < fp[1] / 2 ? 'N' : 'S';
  return b.c[0] < fp[0] / 2 ? 'W' : 'E';
}

/* Every building reports its own footprint, so nothing in the shell has to
   guess which spec key holds which dimension. */
function footprint(spec) {
  return BUILDING.footprint ? BUILDING.footprint(spec) : [spec.width, spec.depth];
}

/* ---- rebuild ---- */
function rebuild() {
  model = BUILDING.build(state.spec, state.openings, state.extra);
  take = takeoff(model, state.spec, state.prices);
  findings = BUILDING.audit(state.spec, state.openings, state.extra);

  const fp = footprint(state.spec);
  const groups = new Map();
  for (const s of BUILDING.stages) for (const o of OCC_KEYS) groups.set(`${s.key}|${o}`, []);
  for (const p of model.parts) {
    const k = `${p.stage}|${occKey(p, fp)}`;
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
  for (let i = 0; i < BUILDING.stages.length; i++) {
    if (i > state.stage) continue;
    if (!state.stack && i !== state.stage && i !== 0) continue;
    const cur = i === state.stage;
    for (const o of OCC_KEYS) {
      if (hide.has(o)) continue;
      out.push({ key: `${BUILDING.stages[i].key}|${o}`, dim: cur ? 1 : 0.9, desat: cur ? 0 : 0.3 });
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
  const fp = footprint(state.spec);
  vp.cam.target = [fp[0] / 2, state.spec.wallHeight * 0.55, fp[1] / 2];
  dirty = true;
}

/* ---- picking ---- */
function wallPlanes() {
  const fp = footprint(state.spec);
  return [
    { wall: 'W', axis: 0, val: 0, n: [-1, 0, 0] },
    { wall: 'E', axis: 0, val: fp[0], n: [1, 0, 0] },
    { wall: 'N', axis: 2, val: 0, n: [0, 0, -1] },
    { wall: 'S', axis: 2, val: fp[1], n: [0, 0, 1] },
  ];
}
/* Every face you can put something on. Walls come from the footprint; a
   building with a ceiling worth hanging things from adds it. `both` skips the
   back-face cull, which a ceiling needs — you grab a light from above, looking
   down into the building, and from there the ray is going the wrong way. */
function pickPlanes() {
  const fp = footprint(state.spec);
  const ps = [
    { id: 'W', axis: 0, val: 0, n: [-1, 0, 0], uAxis: 2, vAxis: 1 },
    { id: 'E', axis: 0, val: fp[0], n: [1, 0, 0], uAxis: 2, vAxis: 1 },
    { id: 'N', axis: 2, val: 0, n: [0, 0, -1], uAxis: 0, vAxis: 1 },
    { id: 'S', axis: 2, val: fp[1], n: [0, 0, 1], uAxis: 0, vAxis: 1 },
  ];
  if (BUILDING.extraPlanes) for (const p of BUILDING.extraPlanes(state.spec)) ps.push(p);
  return ps;
}

/* Anything the building says can be dragged on one of those faces. Openings
   keep their own path below because they slide along a wall and nothing else;
   these are free on their plane, which is what an electrical box wants. */
function pickDraggable(px, py) {
  if (!BUILDING.draggables) return null;
  const items = BUILDING.draggables(state.spec);
  if (!items || !items.length) return null;
  const r = vp.ray(px, py);
  let best = null;
  for (const pl of pickPlanes()) {
    const dn = r.d[0] * pl.n[0] + r.d[1] * pl.n[1] + r.d[2] * pl.n[2];
    if (!pl.both && dn > -0.02) continue;
    if (Math.abs(r.d[pl.axis]) < 1e-6) continue;
    const t = (pl.val - r.o[pl.axis]) / r.d[pl.axis];
    if (t < 0) continue;
    const hit = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
    const u = hit[pl.uAxis], v = hit[pl.vAxis];
    for (const it of items) {
      if (it.plane !== pl.id) continue;
      /* A generous grab. A 4" box is a handful of pixels at a normal zoom and
         nobody can hit a handful of pixels; the openings it sits in front of
         are five feet across, so there is no contest to lose. */
      const hw = Math.max(it.hw, 5), hh = Math.max(it.hh, 5);
      if (Math.abs(u - it.u) <= hw && Math.abs(v - it.v) <= hh) {
        if (!best || t < best.t) best = { t, it, gu: u - it.u, gv: v - it.v };
      }
    }
  }
  return best;
}
function dragDraggableTo(d, px, py) {
  const r = vp.ray(px, py);
  const pl = pickPlanes().find((p) => p.id === d.it.plane);
  if (!pl || Math.abs(r.d[pl.axis]) < 1e-6) return;
  const t = (pl.val - r.o[pl.axis]) / r.d[pl.axis];
  if (t <= 0) return;
  const hit = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
  d.it.move(hit[pl.uAxis] - d.gu, hit[pl.vAxis] - d.gv);
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
    const live = e.button === 0 && !e.shiftKey;
    /* A box on a wall is a much tighter target than the opening behind it, so
       when both are under the pointer the small thing wins. */
    const item = live ? pickDraggable(e.clientX, e.clientY) : null;
    const hit = live && !item ? pickOpening(e.clientX, e.clientY) : null;
    if (item) {
      mode = 'item'; drag = item;
      state.selected = item.it.id;
      renderPanels();
      showItemReadout(item.it);
      revealSelected(item.it.panel);
    } else if (hit) {
      mode = 'opening'; drag = hit;
      state.selected = hit.o.id;
      renderPanels(); showReadout(hit.o);
      revealSelected('openings');
    } else {
      mode = (e.button === 1 || e.shiftKey || e.button === 2) ? 'pan' : 'orbit';
      cv.classList.add('dragging');
    }
  });

  cv.addEventListener('pointermove', (e) => {
    if (!mode) {
      const over = pickDraggable(e.clientX, e.clientY) || pickOpening(e.clientX, e.clientY);
      cv.classList.toggle('over-opening', !!over);
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
    } else if (mode === 'item') {
      dragDraggableTo(drag, e.clientX, e.clientY);
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
    if (!o) {
      /* Nudging works on anything selected, not just an opening — the arrow
         keys are how a box gets landed on a stud rather than near one. */
      const items = BUILDING.draggables ? BUILDING.draggables(state.spec) : [];
      const it = (items || []).find((x) => x.id === state.selected);
      if (!it) return;
      const k = e.shiftKey ? 6 : 0.5;
      if (e.key === 'ArrowLeft') { it.move(it.u - k, it.v); e.preventDefault(); }
      if (e.key === 'ArrowRight') { it.move(it.u + k, it.v); e.preventDefault(); }
      if (e.key === 'ArrowUp') { it.move(it.u, it.v + (it.plane === 'C' ? -k : k)); e.preventDefault(); }
      if (e.key === 'ArrowDown') { it.move(it.u, it.v + (it.plane === 'C' ? k : -k)); e.preventDefault(); }
      return;
    }
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
/* Clicking something in the model should put you in front of the card that
   edits it — otherwise you pick a window, and then go hunting for it in a
   list of fifteen. Switching tabs has to redraw before the card exists to
   scroll to, so this runs after renderPanels rather than inside it, and the
   scroll beats the per-panel scroll restore for the same reason. */
function revealSelected(panelId) {
  const id = panelId || 'openings';
  if (!BUILDING.panels.some((pn) => pn.id === id)) return;
  if (state.tab !== id) { state.tab = id; renderPanels(); }
  const sec = $(`#panel-${id}`);
  const card = sec && sec.querySelector('.sel');
  if (!card) return;
  if (card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* The floating readout over the viewport. What it says about an opening is
   the building's business — the shop wants its header and its girts, a house
   on a trailer wants the unit against the hole it has to fit. The shell only
   knows where to put it.

   This used to call sizeHeader() with the shop's argument list from inside
   the shared code, which threw on every pick and drag in any building whose
   sizeHeader took anything else. */
function showReadout(o) {
  const st = stockFor(o);
  const e = wallExtent(o.wall, state.spec);
  $('#readout').classList.add('on');
  const r = BUILDING.readout
    ? BUILDING.readout(o, state.spec)
    : {
      title: `${WALLS[o.wall].label} wall — ${st.label}`,
      body: `${fmtFt(o.off)} from ${WALLS[o.wall].from}  ·  `
        + `${fmtFt(e.u1 - (o.off + st.w))} to the far end  ·  `
        + `head ${fmtFt(o.head)}  ·  sill ${fmtFt(o.head - st.h)}`,
    };
  $('#roTitle').textContent = r.title;
  $('#roBody').textContent = r.body;
}

/* The same floating panel, for anything else the building lets you drag. */
function showItemReadout(it) {
  const r = it.readout ? it.readout() : { title: it.label || 'Item', body: '' };
  $('#readout').classList.add('on');
  $('#roTitle').textContent = r.title;
  $('#roBody').textContent = r.body;
}

/* ============================================================
   Panels
   ============================================================ */

function renderTitleFacts() {
  const facts = BUILDING.titleFacts(state.spec, model);
  const box = $('#tbFacts');
  box.textContent = '';
  for (const [k, v] of facts) {
    const d = el('div');
    d.append(el('dt', null, k), el('dd', null, v));
    box.append(d);
  }
  const sub = BUILDING.subtitle && BUILDING.subtitle(state.spec, model);
  if (sub) $('#tbSub').textContent = sub;
}

/* One control, as an element. Pulled out of the Structure tab so a panel can
   put the knob next to the number it moves rather than making you leave the
   numbers to find it. `idp` namespaces the element ids, because the same
   control can now appear in two panels at once and duplicate ids break the
   label-for association for everyone using a screen reader. */
function controlWidget(c, idp) {
  const id = `c${idp || ''}-${c.k}`;
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
    return row;
  }
  const f = el('div', 'field');
  f.style.marginBottom = '8px';
  const l = el('label', null, c.label); l.htmlFor = id;
  if (c.type === 'sel') {
    const sel = document.createElement('select');
    sel.id = id;
    for (const [v, t] of c.opts) {
      const o = document.createElement('option');
      o.value = String(v); o.textContent = t;
      if (String(state.spec[c.k]) === String(v)) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      state.spec[c.k] = c.num ? Number(sel.value) : sel.value;
      scheduleRebuild();
    });
    f.append(l, sel);
    return f;
  }
  const i = document.createElement('input');
  i.type = 'text'; i.id = id;
  i.value = c.type === 'len' ? fmtFt(state.spec[c.k]) : String(state.spec[c.k]);
  i.addEventListener('change', () => {
    const v = c.type === 'len' ? parseFeetInches(i.value) : parseFloat(i.value);
    if (v != null && Number.isFinite(v)) { state.spec[c.k] = v; scheduleRebuild(); }
    else i.value = c.type === 'len' ? fmtFt(state.spec[c.k]) : String(state.spec[c.k]);
  });
  f.append(l, i);
  return f;
}

/* Drop a named subset of the building's controls into any container, in the
   order the building declared them. */
function inlineControls(target, keys, idp) {
  const wrap = el('div', 'inline-controls');
  for (const k of keys) {
    const c = BUILDING.controls.find((x) => x.k === k);
    if (c) wrap.append(controlWidget(c, idp || 'i'));
  }
  target.append(wrap);
  return wrap;
}

/* The Structure tab is a generic driver over whatever controls the building
   declares — nothing here knows what a girt is. */
function renderControlsPanel() {
  const p = $('#panel-structure');
  p.textContent = '';
  if (BUILDING.controlsNote) p.append(note(BUILDING.controlsNote));
  let group = null;
  for (const c of BUILDING.controls) {
    if (c.g !== group) { group = c.g; p.append(el('h3', null, group)); }
    p.append(controlWidget(c));
  }
  const reset = el('button', 'btn', BUILDING.resetLabel || 'Back to the defaults');
  reset.style.marginTop = '14px';
  reset.addEventListener('click', () => {
    const d = BUILDING.defaults();
    state.spec = d.spec; state.openings = d.openings; state.extra = d.extra || {};
    state.selected = null;
    scheduleRebuild();
  });
  p.append(reset);
}

/* A plain text field. numField is a LENGTH field despite the name — it reads
   and writes feet and inches — so anything that is not a length wants this
   one, or a circuit number comes back as 0'-3". */
function textField(label, value, onChange, opts) {
  const o = opts || {};
  const f = el('div', 'field');
  const id = 'x' + Math.random().toString(36).slice(2, 8);
  const l = el('label', null, label); l.htmlFor = id;
  const i = document.createElement('input');
  i.type = 'text'; i.id = id; i.value = value == null ? '' : String(value);
  if (o.placeholder) i.placeholder = o.placeholder;
  i.addEventListener('click', (e) => e.stopPropagation());
  i.addEventListener('change', () => onChange(i.value));
  f.append(l, i);
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

/* ---- takeoff ---- */
function renderTakeoff() {
  const p = $('#panel-takeoff');
  p.textContent = '';
  p.append(note('Counted straight off the model. Lumber is rolled into the stock length that wastes least; '
    + 'add your own margin for crooked sticks.'));

  /* Every section below appears only if the model actually contains the
     stuff — a building on a steel frame has no concrete to order, and one
     on a slab has no steel. */
  if (take.steelRows.length) {
    p.append(el('h3', null, 'Steel'));
    p.append(table(['Section', 'Pieces', 'Length', 'Weight'],
      take.steelRows.map((r) => [r.label, String(r.qty), `${fmtN(r.lf)} lf`, `${fmtN(r.lb)} lb`]),
      [false, true, true, true]));
  }

  if (take.buyRows.length) {
    p.append(el('h3', null, 'Lumber to buy'));
    p.append(table(['Size', 'Length', 'Qty', 'Total lf'],
      take.buyRows.map((r) => [r.size, fmtFt(r.stock), String(r.qty), fmtN(r.lf)]),
      [false, true, true, true]));
  }

  const sheets = [];
  for (const s of take.sheetRows) sheets.push([s.kind, `${fmtN(s.sf)} sf`, String(s.sheets)]);
  if (take.gussets) sheets.push(['¾" CDX for gussets', `${take.gussets} pieces`, String(take.gussetSheets)]);
  if (take.drywallSheets) sheets.push(['Gypsum board', `${fmtN(take.dwSf)} sf`, String(take.drywallSheets)]);
  if (sheets.length) {
    p.append(el('h3', null, 'Sheet goods'));
    p.append(table(['Item', 'Area', 'Sheets'], sheets, [false, true, true]));
  }

  /* The names come off the parts themselves, so a building that roofs in
     something nobody has thought of yet still labels its own takeoff. */
  const skin = [];
  if (take.roofSf) skin.push([take.roofKind || 'Roofing', `${fmtN(take.roofSf)} sf`, `${fmtN(take.roofSquares, 1)} sq`]);
  if (take.sideSf) skin.push([take.sideKind || 'Siding', `${fmtN(take.sideSf)} sf`, `${fmtN(take.sideSquares, 1)} sq`]);
  if (skin.length) {
    p.append(el('h3', null, 'Skin'));
    p.append(table(['Item', 'Area', 'Squares'], skin, [false, true, true]));
  }

  if (take.concrete.cuYd > 0.005) {
    p.append(el('h3', null, 'Concrete'));
    const kv = el('dl', 'kv');
    for (const [k, v] of [
      ['Slab and turndown', `${fmtN(take.concrete.cuYd, 2)} cu yd`],
      ['Order with waste', `${fmtN(take.concrete.order, 1)} cu yd`],
      ['Slab area', `${fmtN(footprint(state.spec)[0] * footprint(state.spec)[1] / 144)} sf`],
    ]) kv.append(el('dt', null, k), el('dd', null, v));
    p.append(kv);
  }

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

/* ---- legend & stage rail ---- */
function renderLegend() {
  const seen = new Map();
  const visible = new Set();
  for (let i = 0; i <= state.stage; i++) visible.add(BUILDING.stages[i].key);
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
  state.stage = Math.max(0, Math.min(BUILDING.stages.length - 1, i));
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
  next.disabled = state.stage === BUILDING.stages.length - 1;
  next.addEventListener('click', () => gotoStage(state.stage + 1));
  opts.append(prev, next);
  rail.append(opts);

  // Full rail: one button per stage
  const track = el('div', 'rail-track');
  let active = null;
  BUILDING.stages.forEach((s, i) => {
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
  const cur = BUILDING.stages[state.stage];
  const compact = el('div', 'rail-compact');
  const label = el('div', 'rc-label');
  label.append(el('span', 'num', `${String(state.stage + 1).padStart(2, '0')} / ${String(BUILDING.stages.length).padStart(2, '0')}`));
  label.append(el('span', 'nm', cur.name));
  const dots = el('div', 'rc-dots');
  BUILDING.stages.forEach((s, i) => {
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
/* The inspector is built from BUILDING.panels, so a building decides which
   tabs exist and what goes in them. */
function buildTabs() {
  const tabs = $('.tabs');
  const host = $('#panelHost');
  tabs.textContent = ''; host.textContent = '';
  BUILDING.panels.forEach((pn, i) => {
    const b = el('button', null, pn.label);
    b.setAttribute('role', 'tab');
    b.dataset.tab = pn.id;
    b.setAttribute('aria-selected', String(i === 0));
    tabs.append(b);
    const sec = el('section', 'panel' + (i === 0 ? ' on' : ''));
    sec.id = 'panel-' + pn.id;
    sec.setAttribute('role', 'tabpanel');
    host.append(sec);
  });
  state.tab = BUILDING.panels[0].id;
}

function renderPanels() {
  renderTitleFacts();
  /* Each panel is its own scroller, and rebuilding one throws its scroll
     position away — unbearable when the control you just moved is halfway
     down it. Remember where each was and put it back. */
  const keep = new Map();
  for (const pn of BUILDING.panels) {
    const sec = $(`#panel-${pn.id}`);
    if (sec) keep.set(pn.id, sec.scrollTop);
  }
  for (const pn of BUILDING.panels) {
    const sec = $(`#panel-${pn.id}`);
    /* A panel that costs something to draw — a sheet of drawings — renders
       only while you are looking at it, and is marked stale otherwise, so
       switching to it can draw it then. */
    if (pn.lazy && pn.id !== state.tab) { if (sec) sec.dataset.stale = '1'; continue; }
    if (sec) delete sec.dataset.stale;
    pn.render();
    if (sec) sec.scrollTop = keep.get(pn.id) || 0;
  }
  renderLegend();
  renderStages();
  for (const b of document.querySelectorAll('.tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  }
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('on', p.id === 'panel-' + state.tab);
  }
}
