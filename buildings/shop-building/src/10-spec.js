/* ============================================================
   The shop building: what it is made of and where the openings start.
   ============================================================ */


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

  slabThickness: 5,
  turndownWidth: 16,
  turndownDepth: 24,
  gravelDepth: 6,

  /* ---- foundation ----
     Soil is clay to silty clay, which without a test means the presumptive
     table rather than a number anybody measured. Frost depth is the local
     figure and wants confirming; 12" is what western Oregon usually runs. */
  soil: 'clay',
  frostDepth: 12,
  concreteFc: 4000,
  slabReinf: 'rebar',            // rebar / mesh / fibre
  /* 'auto' lets the selection rule pick; naming a bar or a pad size overrides
     it, and the Review tab says so if the choice you named is short. Being
     able to size something by hand and be told what it costs is more use than
     being handed one answer, so both ends are open. */
  slabBar: 'auto',               // auto / #3 / #4 / #5 / #6
  postPad: 0,                    // inches square, 0 = size it
  /* Sawcut joints are free edges unless something carries load across them,
     and a wheel crossing a free edge is about twice as hard on the concrete
     as the same wheel in the middle of a panel. This is the decision that
     sets the thickness. */
  jointTransfer: 'dowels',       // dowels / none
  slabInsulation: 'none',        // none / edge / under — undecided, so nothing assumed
  /* What drives on it. A loaded pickup or a small tractor puts about 2,500 lb
     on one wheel; the slab is sized for that, not for the building. */
  wheelLoad: 2500,
  tirePressure: 80,

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

  /* Lean-to: a shed roof off one wall, ledger at the top plate, rafters down
     to a beam on posts. Projection 0 means solve for the furthest it can
     reach before the beam drops below leanToClear. */
  leanTo: false,
  leanToWall: 'W',
  leanToProjection: 0,
  leanToClear: 78,        // required clear height under the beam
  leanToPosts: 3,
  leanToSpacing: 24,      // rafter o.c.
  leanToDrift: true,      // count the snow that drifts off the taller roof

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
  exposure: 'B',          // wooded foothills; 'C' open | 'D' unobstructed
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
const WALLS = {
  N: { axis: 'x', z: 0,            bearing: true,  label: 'North',  from: 'NW corner' },
  S: { axis: 'x', z: 'depth',      bearing: true,  label: 'South',  from: 'SW corner' },
  W: { axis: 'z', x: 0,            bearing: false, label: 'West',   from: 'NW corner' },
  E: { axis: 'z', x: 'width',      bearing: false, label: 'East',   from: 'NE corner' },
};
