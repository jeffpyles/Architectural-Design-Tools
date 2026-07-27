/* ============================================================
   00 — Units, spec, and the opening schedule
   Everything internal is INCHES. Feet only appear at the glass.
   ============================================================ */

const FT = 12;
const D2R = Math.PI / 180;

/* Nominal → actual dressed lumber, plus section properties used by
   the header sizer. Sx/Ix are per ply, dry-service S4S. */
const LUMBER = {
  '2x4':  { t: 1.5, d: 3.5,   Sx: 3.06,  Ix: 5.36,   Cf: 1.5  },
  '2x6':  { t: 1.5, d: 5.5,   Sx: 7.56,  Ix: 20.80,  Cf: 1.3  },
  '2x8':  { t: 1.5, d: 7.25,  Sx: 13.14, Ix: 47.63,  Cf: 1.2  },
  '2x10': { t: 1.5, d: 9.25,  Sx: 21.39, Ix: 98.93,  Cf: 1.1  },
  '2x12': { t: 1.5, d: 11.25, Sx: 31.64, Ix: 177.98, Cf: 1.0  },
  '4x6':  { t: 3.5, d: 5.5,   Sx: 17.65, Ix: 48.53,  Cf: 1.3  },
  '6x6':  { t: 5.5, d: 5.5,   Sx: 27.73, Ix: 76.26,  Cf: 1.0  },
};

/* Windows already sitting in his shop. Sizes are ROUGH OPENINGS —
   the sketch says "(openings)" under the list, so these are holes,
   not unit sizes. */
const WINDOW_STOCK = [
  { id: 'W1', label: "2'-0\" × 5'-0\"",  h: 24,   w: 60, qty: 2,
    note: 'Listed as 2.0 × 5.0 on the sketch' },
  { id: 'W2', label: '36½" × 5\'-0"',    h: 36.5, w: 60, qty: 2,
    note: 'Listed as 36½" × 5.0' },
  { id: 'W3', label: '28½" × 5\'-6"',    h: 28.5, w: 66, qty: 1,
    note: 'Listed as 28½" × 5.6 — read as 5\'-6" wide. Unassigned in the sketch.' },
];

const DOOR_STOCK = [
  { id: 'D1', label: "3'-0\" × 6'-8\" man door", w: 38, h: 82.5, kind: 'man' },
  { id: 'D2', label: "10'-0\" × 10'-0\" overhead", w: 120, h: 120, kind: 'overhead' },
];

/* --- The building itself -------------------------------------------------
   X runs west→east, Z runs north→south, Y is up from top of slab.
   Ridge runs east–west down the middle of the 26' dimension, so the trusses
   span north–south and bear on the N and S walls. */
const DEFAULT_SPEC = {
  width:  24 * FT,        // X — length of the N and S (eave, bearing) walls
  depth:  26 * FT,        // Z — length of the E and W (gable) walls = truss span
  wallHeight: 12 * FT,    // slab to top of the double top plate
  pitch: 3,               // rise per 12 of run

  studSize: '2x6',
  studSpacing: 16,
  trussSpacing: 24,
  trussChord: '2x6',
  heelHeight: 0,          // 0 = standard heel; raise it to get soffit airflow

  eaveOverhang: 16,       // horizontal, past the N and S walls
  rakeOverhang: 12,       // horizontal, past the E and W walls

  slabThickness: 4,
  turndownWidth: 16,
  turndownDepth: 24,
  gravelDepth: 6,

  /* Skin. The default is the light/fast build: metal both surfaces, no
     structural panel except at the braced corners. */
  roofDeck: 'purlins',    // 'purlins' | 'osb' | 'direct'
  purlinSize: '2x4',
  purlinSpacing: 24,
  roofing: 'metal',       // 'metal' | 'comp'

  wallSkin: 'girts',      // 'girts' | 'sheathing'
  girtSize: '2x4',
  girtSpacing: 24,
  siding: 'metal',        // 'metal' | 'lap' | 'bnb'

  /* With no full sheathing, racking resistance has to come from somewhere.
     'corners' = 4'-wide OSB braced panels each side of every corner.
     'diaphragm' = count the steel skin, post-frame style. */
  bracing: 'corners',     // 'corners' | 'full' | 'diaphragm' | 'strap' | 'none'
  bracedPanelWidth: 48,
  roofPlaneBracing: true, // diagonal bracing in the roof plane, no deck
  dripStop: true,         // factory anti-condensation membrane on the panel

  venting: 'ridge-gable', // 'ridge-gable' | 'ridge-soffit' | 'gable' | 'none'

  ceilingDrywall: true,
  wallDrywall: true,
  insulation: true,
  ceilingInsulation: 14,  // inches of blown

  /* Drain, Oregon — Douglas County, valley floor at roughly 300 ft.
     Snow and wind are western-Oregon-lowland values; seismic is Cascadia,
     which is why it gets checked alongside wind rather than ignored. */
  site: 'Drain, Oregon',
  groundSnow: 25,         // psf
  windSpeed: 100,         // mph, 3-second gust, Risk Category II
  exposure: 'C',          // 'B' wooded/obstructed | 'C' open | 'D' unobstructed
  seismicSDS: 0.75,       // g, design short-period acceleration
  heated: false,

  service: 100,           // amps, sub-panel fed from the house
};

/* Opening positions read off the plan sketch. `off` is measured from the
   NW corner along N/S walls (west→east) and from the N corner along E/W
   walls (north→south). Everything here is draggable. */
const DEFAULT_OPENINGS = [
  // West gable wall — three high windows, heads aligned at 10'-0"
  { id: 'w-1', wall: 'W', stock: 'W1', kind: 'window', off: 42,  head: 120 },
  { id: 'w-2', wall: 'W', stock: 'W2', kind: 'window', off: 126, head: 120 },
  { id: 'w-3', wall: 'W', stock: 'W1', kind: 'window', off: 210, head: 120 },

  // South eave wall — overhead door west, window, man door east
  { id: 's-1', wall: 'S', stock: 'D2', kind: 'overhead', off: 24,  head: 120 },
  { id: 's-2', wall: 'S', stock: 'W2', kind: 'window',   off: 174, head: 78.5 },
  { id: 's-3', wall: 'S', stock: 'D1', kind: 'man',      off: 240, head: 82.5 },

  // East gable wall — man door toward the north end, facing the house
  { id: 'e-1', wall: 'E', stock: 'D1', kind: 'man', off: 36, head: 82.5 },
];

/* Build sequence. These are a real sequence, so they carry numbers. */
const STAGES = [
  { key: 'site',    name: 'Site & Slab',        blurb: 'Gravel, turndown footing, 4" slab, anchor bolts' },
  { key: 'walls',   name: 'Wall Framing',       blurb: '2x6 walls, headers, corners, openings framed' },
  { key: 'trusses', name: 'Trusses & Roof Framing', blurb: 'Site-built trusses set, braced, overhangs' },
  { key: 'dryin',   name: 'Sheathing & Dry-in', blurb: 'Roof deck, wall sheathing, housewrap' },
  { key: 'roof',    name: 'Roofing',            blurb: 'Underlayment, panels or shingles, trim' },
  { key: 'skin',    name: 'Doors, Windows, Siding', blurb: 'Units set, siding hung, corner and rake trim' },
  { key: 'elec',    name: 'Electrical Rough-in', blurb: 'Sub-panel, circuits, boxes, lighting' },
  { key: 'finish',  name: 'Insulation & Drywall', blurb: 'Batts, blown lid, ½" walls, ⅝" ceiling' },
];

/* Material palette for the viewport. These are the only warm colors in the
   whole page — the chrome stays cool so the lumber reads. */
const MATERIALS = {
  gravel:   { c: [0.53, 0.51, 0.46], name: 'Compacted base' },
  concrete: { c: [0.72, 0.71, 0.68], name: 'Concrete' },
  fir:      { c: [0.85, 0.71, 0.51], name: 'DF framing lumber' },
  firDark:  { c: [0.74, 0.59, 0.40], name: 'Framing (plate / header)' },
  treated:  { c: [0.66, 0.72, 0.55], name: 'Pressure treated' },
  lvl:      { c: [0.78, 0.62, 0.38], name: 'Engineered header' },
  osb:      { c: [0.78, 0.61, 0.36], name: 'OSB sheathing' },
  plywood:  { c: [0.84, 0.71, 0.50], name: 'Plywood gusset' },
  wrap:     { c: [0.91, 0.92, 0.89], name: 'Housewrap' },
  metal:    { c: [0.62, 0.67, 0.70], name: 'Metal panel' },
  shingle:  { c: [0.30, 0.31, 0.32], name: 'Asphalt shingle' },
  trim:     { c: [0.90, 0.90, 0.88], name: 'Trim' },
  door:     { c: [0.47, 0.42, 0.37], name: 'Door' },
  ohdoor:   { c: [0.80, 0.81, 0.80], name: 'Overhead door' },
  glass:    { c: [0.55, 0.72, 0.80], name: 'Glazing' },
  drywall:  { c: [0.90, 0.89, 0.86], name: 'Gypsum board' },
  batt:     { c: [0.88, 0.72, 0.76], name: 'Fiberglass batt' },
  blown:    { c: [0.80, 0.77, 0.70], name: 'Blown insulation' },
  panel:    { c: [0.70, 0.73, 0.74], name: 'Panelboard' },
  conduit:  { c: [0.74, 0.77, 0.78], name: 'Conduit / cable' },
  box:      { c: [0.85, 0.65, 0.22], name: 'Device box' },
  fixture:  { c: [0.94, 0.93, 0.83], name: 'Light fixture' },
};

const WALLS = {
  N: { axis: 'x', z: 0,            bearing: true,  label: 'North',  from: 'NW corner' },
  S: { axis: 'x', z: 'depth',      bearing: true,  label: 'South',  from: 'SW corner' },
  W: { axis: 'z', x: 0,            bearing: false, label: 'West',   from: 'NW corner' },
  E: { axis: 'z', x: 'width',      bearing: false, label: 'East',   from: 'NE corner' },
};
