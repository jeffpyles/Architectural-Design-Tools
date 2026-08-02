/* ============================================================
   The building's declaration: what it is, what it can be adjusted by, and
   which panels the shell should show. No DOM here — the headless checks
   read this file, so panel renderers are referenced lazily.
   ============================================================ */

const CONTROLS = [
  { g: 'Skin', k: 'wallSkin', label: 'Wall system', type: 'sel',
    opts: [['girts', 'Girts, no sheathing'], ['sheathing', 'Full OSB sheathing']] },
  { g: 'Skin', k: 'roofDeck', label: 'Roof substrate', type: 'sel',
    opts: [['purlins', 'Purlins, no deck'], ['osb', 'OSB deck']] },
  { g: 'Skin', k: 'roofing', label: 'Roofing', type: 'sel',
    opts: assemblyOpts('roofing') },
  { g: 'Skin', k: 'siding', label: 'Siding', type: 'sel',
    opts: assemblyOpts('siding') },
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

  { g: 'Lean-to', k: 'leanTo', label: 'Add a lean-to', type: 'bool' },
  { g: 'Lean-to', k: 'leanToWall', label: 'On which wall', type: 'sel',
    opts: [['W', 'West'], ['N', 'North'], ['E', 'East'], ['S', 'South']] },
  { g: 'Lean-to', k: 'leanToProjection', label: 'Projection (0 = as far as it goes)', type: 'len' },
  { g: 'Lean-to', k: 'leanToClear', label: 'Clear height under the beam', type: 'len' },
  { g: 'Lean-to', k: 'leanToPosts', label: 'Posts', type: 'sel',
    opts: [[2, '2 — ends only'], [3, '3 — ends and middle'], [4, '4'], [5, '5']], num: true },
  { g: 'Lean-to', k: 'leanToSpacing', label: 'Rafter spacing', type: 'sel',
    opts: [[12, '12" o.c.'], [16, '16" o.c.'], [19.2, '19.2" o.c.'], [24, '24" o.c.'],
      [32, '32" o.c.'], [48, '48" o.c.']], num: true },
  { g: 'Lean-to', k: 'leanToRafter', label: 'Rafters', type: 'sel',
    opts: [['auto', 'Size them for me'], ['2x6', '2x6'], ['2x8', '2x8'],
      ['2x10', '2x10'], ['2x12', '2x12']] },
  { g: 'Lean-to', k: 'leanToFraming', label: 'Rafters meet the beam', type: 'sel',
    opts: [['onTop', 'On top of it — simplest'],
      ['flush', 'Hung off its face — more headroom']] },
  { g: 'Lean-to', k: 'leanToDrift', label: 'Count drifted snow', type: 'bool' },

  { g: 'Foundation', k: 'soil', label: 'Bearing soil', type: 'sel',
    opts: [['clay', 'Clay — 1500 psf'], ['sand', 'Sand — 2000 psf'],
      ['gravel', 'Gravel — 3000 psf'], ['rock', 'Rock — 4000 psf']] },
  { g: 'Foundation', k: 'frostDepth', label: 'Frost depth below grade', type: 'len' },
  { g: 'Foundation', k: 'slabThickness', label: 'Slab thickness', type: 'len' },
  { g: 'Foundation', k: 'concreteFc', label: "Concrete f'c (psi)", type: 'sel',
    opts: [[3000, '3000 psi'], [3500, '3500 psi'], [4000, '4000 psi'], [4500, '4500 psi']], num: true },
  { g: 'Foundation', k: 'wheelLoad', label: 'Heaviest wheel on it (lb)', type: 'num' },
  { g: 'Foundation', k: 'tirePressure', label: 'Tyre pressure (psi)', type: 'num' },
  { g: 'Foundation', k: 'jointTransfer', label: 'Contraction joints', type: 'sel',
    opts: [['dowels', 'Doweled or keyed'], ['none', 'Plain sawcut']] },
  { g: 'Foundation', k: 'slabReinf', label: 'Slab reinforcement', type: 'sel',
    opts: [['rebar', 'Deformed bar'], ['mesh', 'Welded wire mesh'], ['fibre', 'Fibre only']] },
  { g: 'Foundation', k: 'slabBar', label: 'Bar size', type: 'sel',
    opts: [['auto', 'Size it for me'], ['#3', '#3'], ['#4', '#4'], ['#5', '#5'], ['#6', '#6']] },
  { g: 'Foundation', k: 'postForm', label: 'Lean-to post footings', type: 'sel',
    opts: [['square', 'Formed pad and pier'], ['tube', 'Sonotube pier']] },
  { g: 'Foundation', k: 'postPad', label: 'Pad size', type: 'sel',
    opts: [[0, 'Size them for me'], [12, '12" square'], [18, '18" square'], [24, '24" square'],
      [30, '30" square'], [36, '36" square'], [48, '48" square']], num: true },
  { g: 'Foundation', k: 'postTube', label: 'Sonotube diameter', type: 'sel',
    opts: [[0, 'Size them for me'], [8, '8"'], [10, '10"'], [12, '12"'], [14, '14"'],
      [16, '16"'], [18, '18"'], [20, '20"'], [24, '24"'], [30, '30"'], [36, '36"'],
      [42, '42"'], [48, '48"']], num: true },
  { g: 'Foundation', k: 'slabInsulation', label: 'Slab insulation', type: 'sel',
    opts: [['none', 'None'], ['edge', 'Edge only'], ['under', 'Edge and under']] },
  { g: 'Foundation', k: 'turndownWidth', label: 'Turndown width', type: 'len' },
  { g: 'Foundation', k: 'turndownDepth', label: 'Turndown depth', type: 'len' },
  { g: 'Foundation', k: 'gravelDepth', label: 'Compacted base', type: 'len' },

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

/* ============================================================
   What the shell needs to know about this building.
   ============================================================ */
const BUILDING = {
  id: 'shop-building',
  name: 'Shop Building',
  title: "Shop Building — 24' × 26'",
  codePrefix: 'SHOP1-',

  defaults: () => ({
    spec: { ...DEFAULT_SPEC },
    openings: DEFAULT_OPENINGS.map((o) => ({ ...o })),
    /* Empty means "use the rough-in the tool generates". It stays empty until
       somebody moves a box, which is what keeps a share code the length it
       has always been for anyone who never opened the Electrical tab. */
    extra: {},
  }),

  stages: STAGES,
  build: buildModel,
  audit: auditBuilding,

  controls: CONTROLS,
  controlsNote: 'The sketch left the roof covering and truss spacing open. '
    + 'Everything here rebuilds the model, the takeoff and the review notes.',
  resetLabel: 'Back to the sketch',

  subtitle: (spec) => `${fmtFt(spec.width)} × ${fmtFt(spec.depth)}, ridge east–west, `
    + 'gable ends facing the house',

  titleFacts: (spec) => {
    const tr = trussGeometry(spec);
    const lt = leanToDesign(spec);
    const facts = [
      ['Footprint', `${fmtFt(spec.width)} × ${fmtFt(spec.depth)}`],
      ['Floor', `${fmtN(spec.width * spec.depth / 144)} sf`],
      ['Walls', fmtFt(spec.wallHeight)],
      ['Pitch', `${spec.pitch}/12`],
      ['Ridge', `${fmtFt(tr.overallHeight)} above slab`],
      ['Trusses', `${tr.count} @ ${fmtIn(spec.trussSpacing)} o.c.`],
      ['Span', fmtFt(tr.span)],
      ['Roof', spec.roofing === 'metal'
        ? `Metal / ${spec.roofDeck === 'purlins' ? 'purlins' : 'OSB deck'}`
        : 'Shingle / OSB deck'],
      ['Walls skin', spec.wallSkin === 'girts' ? `Metal / ${spec.girtSize} girts` : 'Metal / OSB'],
    ];
    if (lt && !lt.impossible) facts.push(['Lean-to', `${fmtFt(lt.projection)} west`]);
    return facts;
  },

  /* How a saved layout describes itself in a list, and what the written
     summary says past the openings. Bracing is the number that decides
     whether a layout of this building is any good — and it is the shop's
     word for it, so the shell asks rather than assuming. */
  layoutFacts: (spec, openings) => {
    const lines = bracingCheck(spec, openings).flatMap((d) => d.lines);
    const worst = Math.min(...lines.map((l) => l.ratio));
    return {
      line: `${fmtFt(spec.wallHeight)} walls · ${openings.length} openings · `
        + `worst bracing ${worst.toFixed(2)}`,
      tag: worst >= 1 ? 'bracing ok' : `worst ${worst.toFixed(2)}`,
      level: worst >= 1 ? 'used' : 'over',
      summary: [['BRACING  (1.00 or better is passing)', lines.map((l) =>
        `${WALLS[l.wall].label.padEnd(5)} ${l.ratio.toFixed(2)}  `
        + `${fmtFt(l.braced)} of panel, needs ${l.required === Infinity ? '—' : fmtFt(l.required)}`
        + (l.braced === 0 ? `  (widest run only ${fmtFt(l.widest)})` : ''))]],
    };
  },

  /* The ceiling is a face you can put something on, so picking has to know
     about it. `both` because you grab a light from above, looking down. */
  extraPlanes: (spec) => [{
    id: 'C', axis: 1, val: trussGeometry(spec).bcBot, n: [0, -1, 0],
    uAxis: 0, vAxis: 2, both: true,
  }],

  /* Everything you can drag that is not an opening. */
  draggables: (spec) => currentDevices(spec).map((d) => {
    const box = EBOX[d.box] || { w: 4, h: 4 };
    return {
      id: d.id, plane: d.wall,
      u: d.u, v: d.v,
      hw: (d.panel ? 20 : box.w) / 2, hh: (d.panel ? 30 : box.h) / 2,
      label: deviceLabel(d),
      move: (u, v) => moveDevice(d, u, v),
      readout: () => deviceReadout(d, spec),
    };
  }),

  packExtra: (extra) => packElectrical(extra),
  unpackExtra: (x) => unpackElectrical(x),

  readout: (o, spec) => {
    const st = stockFor(o);
    const e = wallExtent(o.wall, spec);
    const hdr = sizeHeader(st.w, o.wall, spec);
    return {
      title: `${WALLS[o.wall].label} wall — ${st.label}`,
      body: `${fmtFt(o.off)} from ${WALLS[o.wall].from}  ·  `
        + `${fmtFt(e.u1 - (o.off + st.w))} to the far end  ·  head ${fmtFt(o.head)}  ·  `
        + `sill ${fmtFt(o.head - st.h)}  ·  header ${hdr.label}`,
    };
  },

  panels: [
    { id: 'openings', label: 'Openings', render: () => renderOpenings() },
    { id: 'structure', label: 'Structure', render: () => renderControlsPanel() },
    { id: 'review', label: 'Review', render: () => renderReview() },
    { id: 'electrical', label: 'Electrical', render: () => renderElectrical() },
    { id: 'foundation', label: 'Foundation', render: () => renderFoundation() },
    /* Lazy: six sheets of SVG is not something to redraw on every drag. */
    { id: 'plans', label: 'Plans', render: () => renderShopPlans(), lazy: true },
    { id: 'truss', label: 'Truss', render: () => renderTruss() },
    { id: 'compare', label: 'Compare', render: () => renderCompare(), lazy: true },
    { id: 'takeoff', label: 'Takeoff', render: () => renderTakeoff() },
    { id: 'layouts', label: 'Layouts', render: () => renderLayouts() },
  ],
};
