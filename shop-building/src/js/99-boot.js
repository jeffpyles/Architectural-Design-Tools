/* ============================================================
   99 — Boot
   ============================================================ */

function boot() {
  const canvas = document.getElementById('cv');
  try {
    vp = new Viewport(canvas);
  } catch (err) {
    canvas.replaceWith(Object.assign(document.createElement('div'), {
      textContent: 'This view needs WebGL, which this browser has turned off. '
        + 'The Openings, Truss and Takeoff tabs still work.',
      style: 'padding:24px;color:var(--ink-2);font-size:13px',
    }));
    model = buildModel(state.spec, state.openings);
    take = takeoff(model, state.spec);
    findings = auditBuilding(state.spec, state.openings);
    renderPanels();
    wireChrome();
    return;
  }

  const shared = layoutFromHash();
  if (shared) { state.spec = shared.spec; state.openings = shared.openings; }

  applyTheme();
  setView('iso');
  rebuild();
  renderPanels();
  wireChrome();
  initInput();
  loadSharedLayouts();
  requestAnimationFrame(frame);
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
