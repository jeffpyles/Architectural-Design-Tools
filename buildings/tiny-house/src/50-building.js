/* ============================================================
   The building's declaration: what it is, what it can be adjusted by, and
   which panels the shell should show. No DOM here — the headless checks
   read this file, so panel renderers are referenced lazily.
   ============================================================ */

const CONTROLS = [
  { g: 'Trailer', k: 'length', label: 'Frame length', type: 'len' },
  { g: 'Trailer', k: 'width', label: 'Frame width', type: 'len' },
  { g: 'Trailer', k: 'joistSpacing', label: 'Cross joist spacing', type: 'sel',
    opts: [[12, '12" o.c.'], [16, '16" o.c.'], [24, '24" o.c.']], num: true },
  { g: 'Trailer', k: 'wheelWellStart', label: 'Wheel well, in from the east end', type: 'len' },
  { g: 'Trailer', k: 'wheelWellLength', label: 'Wheel well length', type: 'len' },
  { g: 'Trailer', k: 'rearAxleToEnd', label: 'Rear axle, in from the east end', type: 'len' },
  { g: 'Trailer', k: 'wheelWellRise', label: 'Wheel well above the deck', type: 'len' },
  { g: 'Trailer', k: 'strut', label: 'Overhang tie', type: 'bool' },
  { g: 'Trailer', k: 'strutFrom', label: 'Tie lands in from the east end', type: 'len' },
  { g: 'Trailer', k: 'strutSection', label: 'Tie section', type: 'sel',
    opts: [['tube1.5x4x100', '1½×4×.100 — as built'], ['tube2x4x125', '2×4×.125'],
      ['tube2x4x188', '2×4×³⁄₁₆']] },
  { g: 'Trailer', k: 'tongueEnd', label: 'Tongue end', type: 'sel',
    opts: [['west', 'West'], ['east', 'East']] },
  { g: 'Trailer', k: 'tongueOverhang', label: 'Hitch beyond that end', type: 'len' },

  { g: 'Shell', k: 'wallHeight', label: 'Wall height above the frame', type: 'len' },
  { g: 'Shell', k: 'studMaterial', label: 'Stud material', type: 'sel',
    opts: assemblyOpts('studMaterial') },
  { g: 'Shell', k: 'studSize', label: 'Studs', type: 'sel',
    opts: [['2x4', '2x4'], ['2x6', '2x6']] },
  { g: 'Shell', k: 'studSpacing', label: 'Stud spacing', type: 'sel',
    opts: [[16, '16" o.c.'], [24, '24" o.c.']], num: true },
  { g: 'Shell', k: 'ridgeRise', label: 'Ridge above the side walls', type: 'len' },
  { g: 'Shell', k: 'eaveOverhang', label: 'Eave overhang', type: 'len' },
  { g: 'Shell', k: 'rakeOverhang', label: 'Rake overhang', type: 'len' },
  { g: 'Shell', k: 'roofDeck', label: 'Sheathe the roof', type: 'bool' },
  { g: 'Shell', k: 'deckHeight', label: 'Road to deck', type: 'len' },
  { g: 'Shell', k: 'roadEnvelope', label: 'Road height limit', type: 'len' },

  { g: 'Lofts', k: 'loftHeight', label: 'Loft deck above the frame', type: 'len' },
  { g: 'Lofts', k: 'eastLoft', label: 'Master loft, in from the east', type: 'len' },
  { g: 'Lofts', k: 'westLoft', label: 'Library loft, in from the west', type: 'len' },
  { g: 'Lofts', k: 'loftJoist', label: 'Loft joists', type: 'sel',
    opts: [['2x6', '2x6'], ['2x8', '2x8'], ['2x10', '2x10'], ['2x12', '2x12']] },

  { g: 'Skin & finish', k: 'roofing', label: 'Roofing', type: 'sel',
    opts: assemblyOpts('roofing') },
  { g: 'Skin & finish', k: 'siding', label: 'Siding', type: 'sel',
    opts: assemblyOpts('siding') },
  { g: 'Skin & finish', k: 'wallSkin', label: 'Wall system', type: 'sel',
    opts: assemblyOpts('wallSkin') },
  { g: 'Skin & finish', k: 'sheathingPanel', label: 'Exterior sheet', type: 'sel',
    opts: assemblyOpts('sheathing') },
  { g: 'Skin & finish', k: 'girtSpacing', label: 'Girt spacing', type: 'sel',
    opts: [[16, '16" o.c.'], [24, '24" o.c.'], [30, '30" o.c.']], num: true },
  { g: 'Skin & finish', k: 'wallInsulation', label: 'Wall insulation', type: 'sel',
    opts: [['batt', 'Batt'], ['none', 'None yet']] },
  { g: 'Skin & finish', k: 'ceilingInsulation', label: 'Lid insulation', type: 'len' },
  { g: 'Skin & finish', k: 'interiorFinish', label: 'Interior face', type: 'sel',
    opts: assemblyOpts('interior') },

  { g: 'Site & loads', k: 'groundSnow', label: 'Ground snow (psf)', type: 'num' },
  { g: 'Site & loads', k: 'windSpeed', label: 'Basic wind speed (mph)', type: 'num' },
  { g: 'Site & loads', k: 'exposure', label: 'Wind exposure', type: 'sel',
    opts: [['B', 'B — wooded or built up'], ['C', 'C — open country'], ['D', 'D — unobstructed']] },
];

const BUILDING = {
  id: 'tiny-house',
  name: 'Tiny House',
  title: "Tiny House on Wheels — 12' × 34'",
  codePrefix: 'THOW1-',

  /* The long dimension runs west to east, so the footprint is length by
     width rather than the shop's width by depth. */
  footprint: (spec) => [spec.length, spec.width],

  defaults: () => ({
    spec: { ...DEFAULT_SPEC },
    openings: DEFAULT_OPENINGS.map((o) => ({ ...o })),
  }),

  stages: STAGES,
  build: buildModel,
  audit: auditBuilding,

  controls: CONTROLS,
  controlsNote: 'The trailer is measured, not chosen — the frame is built. Everything above it is open, '
    + 'and every change here rebuilds the model, the weight and the review notes.',
  resetLabel: 'Back to the sketch',

  subtitle: (spec) => `${fmtFt(spec.width)} × ${fmtFt(spec.length)} on a steel frame, `
    + `ridge running east–west, tongue at the ${spec.tongueEnd} end`,

  titleFacts: (spec) => {
    const L = roofLoads(spec);
    const facts = [
      ['Trailer', `${fmtFt(spec.width)} × ${fmtFt(spec.length)}`],
      ['Floor', `${fmtN(spec.length * spec.width / 144)} sf`],
      ['Walls', fmtFt(spec.wallHeight)],
      ['Pitch', `${roofPitch(spec).toFixed(1)}/12`],
      ['Ridge', `${fmtFt(spec.wallHeight + spec.ridgeRise)} above the frame`],
      ['Studs', `${spec.studSize} @ ${fmtIn(spec.studSpacing)} o.c.`],
      ['Lofts', `${fmtFt(spec.eastLoft)} east · ${fmtFt(spec.westLoft)} west`],
      ['Snow', `${fmtN(L.snow)} psf`],
    ];
    return facts;
  },

  /* How a saved layout describes itself in a list, and what the written
     summary says past the openings. This building calls it racking rather
     than bracing, which is exactly why the shell has to ask instead of
     reaching for a function only one building has. */
  layoutFacts: (spec, openings) => {
    const lines = lateralCheck(spec, openings).flatMap((d) => d.lines);
    const worst = Math.min(...lines.map((l) => l.ratio));
    return {
      line: `${fmtFt(spec.wallHeight)} walls · ${openings.length} openings · `
        + `worst racking ${worst.toFixed(2)}`,
      tag: worst >= 1 ? 'racking ok' : `worst ${worst.toFixed(2)}`,
      level: worst >= 1 ? 'used' : 'over',
      summary: [['RACKING  (1.00 or better is passing)', lines.map((l) =>
        `${WALLS[l.wall].label.padEnd(5)} ${l.ratio.toFixed(2)}  `
        + `${fmtFt(l.braced)} of panel, needs ${l.required === Infinity ? '—' : fmtFt(l.required)}`
        + (l.braced === 0 ? `  (widest run only ${fmtFt(l.widest)})` : ''))]],
    };
  },

  readout: (o, spec) => {
    const st = stockFor(o);
    const ro = roughOf(o);
    const e = wallExtent(o.wall, spec);
    const hdr = sizeHeader(o, spec);
    return {
      title: `${WALLS[o.wall].label} wall — ${st.label}`,
      body: `${fmtFt(o.off)} from the ${WALLS[o.wall].from}  ·  `
        + `${fmtFt(e.u1 - (o.off + ro.w))} to the far corner  ·  `
        + `unit ${fmtIn(st.w)} × ${fmtIn(st.h)}, RO ${fmtIn(ro.w)} × ${fmtIn(ro.h)}  ·  `
        + `sill ${fmtIn(o.head - ro.h)}  ·  header ${hdr.label}`,
    };
  },

  panels: [
    { id: 'openings', label: 'Openings', render: () => renderOpenings() },
    { id: 'structure', label: 'Structure', render: () => renderControlsPanel() },
    { id: 'review', label: 'Review', render: () => renderReview() },
    { id: 'weight', label: 'Weight', render: () => renderWeight() },
    { id: 'compare', label: 'Compare', render: () => renderCompare(), lazy: true },
    { id: 'takeoff', label: 'Takeoff', render: () => renderTakeoff() },
    { id: 'layouts', label: 'Layouts', render: () => renderLayouts() },
  ],
};
