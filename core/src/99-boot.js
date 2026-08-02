/* ============================================================
   Boot.
   ============================================================ */

/* ============================================================
   99 — Boot
   ============================================================ */

function boot() {
  const d = BUILDING.defaults();
  state.spec = d.spec;
  state.openings = d.openings;
  state.extra = d.extra || {};
  state.stage = BUILDING.stages.length - 1;
  document.title = BUILDING.title || BUILDING.name;
  buildHeading();
  buildTabs();

  const canvas = document.getElementById('cv');
  try {
    vp = new Viewport(canvas);
  } catch (err) {
    canvas.replaceWith(Object.assign(document.createElement('div'), {
      textContent: 'This view needs WebGL, which this browser has turned off. '
        + 'The Openings, Truss and Takeoff tabs still work.',
      style: 'padding:24px;color:var(--ink-2);font-size:13px',
    }));
    model = BUILDING.build(state.spec, state.openings, state.extra);
    take = takeoff(model, state.spec, state.prices);
    findings = BUILDING.audit(state.spec, state.openings, state.extra);
    renderPanels();
    wireChrome();
    return;
  }

  /* Precedence for what opens: a code in the address bar, then the library's
     flagged default, then the copy of that default baked in at build time —
     which is what the artifact host and a bare file get, since neither can
     reach the library. */
  const shared = layoutFromHash();
  if (shared) {
    state.spec = shared.spec; state.openings = shared.openings;
    state.extra = shared.extra || {};
    state.prices = shared.prices || {};
    openedFromLink = true;
  } else if (typeof BAKED_DEFAULT === 'string' && BAKED_DEFAULT) {
    try {
      const dl = decodeLayout(BAKED_DEFAULT);
      state.spec = dl.spec; state.openings = dl.openings; state.extra = dl.extra || {};
      state.prices = dl.prices || {};
    } catch (e) { /* keep BUILDING.defaults() */ }
  }

  applyTheme();
  setView('iso');
  rebuild();
  renderPanels();
  wireChrome();
  initInput();
  loadSharedLayouts();
  requestAnimationFrame(frame);
}
/* The heading, which doubles as a way to reach the other buildings.

   Each building is its own page, so switching is navigation — and the links
   only resolve where the site is laid out as ../<id>/. Served from a file or
   from the Artifact host they would go nowhere, so the switcher does not
   appear there and the heading stays a heading. */
function buildHeading() {
  const h1 = document.querySelector('.tb-id h1');
  const here = /^https?:$/.test(location.protocol)
    && new RegExp(`/${BUILDING.id}/?$`).test(location.pathname.replace(/index\.html$/, ''));
  const others = typeof BUILDINGS !== 'undefined' ? BUILDINGS : [];
  if (!here || others.length < 2) { h1.textContent = BUILDING.name; return; }

  const sel = el('select', 'tb-switch');
  sel.setAttribute('aria-label', 'Which building');
  sel.title = 'Switch building';
  for (const b of others) {
    const o = el('option', null, b.name);
    o.value = b.id;
    o.selected = b.id === BUILDING.id;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    if (sel.value !== BUILDING.id) location.href = `../${sel.value}/`;
  });
  h1.textContent = '';
  h1.append(sel);
}

function wireChrome() {
  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; renderPanels(); });
  }
  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => { if (vp) setView(b.dataset.view); });
  }
  const toggle = (id, key) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.setAttribute('aria-pressed', String(state[key]));
    b.addEventListener('click', () => {
      state[key] = !state[key];
      b.setAttribute('aria-pressed', String(state[key]));
      dirty = true;
    });
  };
  toggle('btnEdges', 'edges');
  toggle('btnStack', 'stack');

  // Cutaway cycles off → walls → walls + roof, so what it is doing stays visible
  const cut = document.getElementById('btnCutaway');
  const paintCut = () => {
    cut.textContent = CUTAWAY_LABEL[state.cutaway];
    cut.setAttribute('aria-pressed', String(state.cutaway > 0));
  };
  paintCut();
  cut.addEventListener('click', () => { state.cutaway = (state.cutaway + 1) % 3; paintCut(); dirty = true; });

  // Legend folds away
  const lt = document.getElementById('legendToggle');
  const legend = document.getElementById('legend');
  legend.dataset.open = String(state.legendOpen);
  lt.addEventListener('click', () => {
    state.legendOpen = !state.legendOpen;
    legend.dataset.open = String(state.legendOpen);
    lt.setAttribute('aria-expanded', String(state.legendOpen));
  });

  document.getElementById('roClose').addEventListener('click', () => {
    document.getElementById('readout').classList.remove('on');
    state.selected = null;
    renderPanels();
  });

  initInspectorResize();
}

/* Drag the divider, or collapse the whole panel. Keyboard works too. */
function initInspectorResize() {
  const main = document.querySelector('main');
  const grip = document.getElementById('grip');
  const collapse = document.getElementById('btnCollapse');
  const MIN = 260, MAX = 640;

  const apply = () => {
    document.documentElement.style.setProperty('--inspector', state.inspectorWidth + 'px');
    main.dataset.inspector = state.inspectorOpen ? 'open' : 'closed';
    collapse.setAttribute('aria-label', state.inspectorOpen ? 'Collapse the panel' : 'Show the panel');
    dirty = true;
  };
  apply();

  collapse.addEventListener('click', () => { state.inspectorOpen = !state.inspectorOpen; apply(); });

  let dragging = false;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true; grip.setPointerCapture(e.pointerId); e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = Math.round(window.innerWidth - e.clientX);
    state.inspectorWidth = Math.max(MIN, Math.min(MAX, w));
    if (!state.inspectorOpen) state.inspectorOpen = true;
    apply();
  });
  const stop = () => { dragging = false; };
  grip.addEventListener('pointerup', stop);
  grip.addEventListener('pointercancel', stop);
  grip.addEventListener('dblclick', () => { state.inspectorOpen = !state.inspectorOpen; apply(); });
  grip.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') { state.inspectorWidth = Math.min(MAX, state.inspectorWidth + step); apply(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { state.inspectorWidth = Math.max(MIN, state.inspectorWidth - step); apply(); e.preventDefault(); }
    if (e.key === 'Enter' || e.key === ' ') { state.inspectorOpen = !state.inspectorOpen; apply(); e.preventDefault(); }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
