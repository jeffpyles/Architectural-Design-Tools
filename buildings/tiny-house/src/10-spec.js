/* ============================================================
   The tiny house: the trailer under it, what it is made of, and the
   salvaged windows waiting to go into it.

   Geometry runs west to east along the trailer: x = 0 at the west end,
   where the tongue is, x = length at the east end. z = 0 is the north
   wall, z = width the south. y = 0 is the top of the steel frame, which
   is where the subfloor lands and the walls start.
   ============================================================ */

/* The windows are all salvage, so the schedule is a list of things that
   already exist rather than a catalogue to order from. Sizes come off the
   spreadsheet; where the spreadsheet gives two numbers without saying which
   is which, the placement sketch settles it — #4 and #9/#10 are drawn wide,
   so they are landscape, and the rest read as written.

   #1, #2, #3 and #14 have no dimensions in the spreadsheet at all. Those
   four are scaled off the sketch and are marked `measured: false`. */
const WINDOW_STOCK = [
  { id: 'W1',  n: 1,  w: 42,    h: 33,     label: '#1 bigger square, framed', measured: false },
  { id: 'W2',  n: 2,  w: 25,    h: 27,     label: '#2 little square (Perkins)', measured: false },
  { id: 'W3',  n: 3,  w: 15,    h: 37,     label: '#3 vertical, single pane', measured: false },
  { id: 'W4',  n: 4,  w: 80.5,  h: 19.75,  label: '#4 frosted, shower', frosted: true },
  { id: 'W5',  n: 5,  w: 36.5,  h: 19.875, label: '#5 casement', opens: true },
  { id: 'W6',  n: 6,  w: 19.5,  h: 23.5,   label: '#6 casement, frosted', frosted: true, opens: true },
  { id: 'W7',  n: 7,  w: 23.5,  h: 35.5,   label: '#7 vertical', opens: true },
  { id: 'W8',  n: 8,  w: 29.5,  h: 59.5,   label: '#8 vertical', opens: true },
  { id: 'W9',  n: 9,  w: 59.5,  h: 23.5,   label: '#9 non-opening' },
  { id: 'W10', n: 10, w: 59.5,  h: 23.5,   label: '#10 non-opening' },
  { id: 'W11', n: 11, w: 35.5,  h: 41.5,   label: '#11 casement, kitchen', opens: true },
  { id: 'W12', n: 12, w: 59.25, h: 53.5,   label: '#12 almond' },
  { id: 'W13', n: 13, w: 47.75, h: 29.75,  label: '#13 almond' },
  { id: 'W14', n: 14, w: 30,    h: 32,     label: '#14 med square (Bring)', measured: false },
];

const DOOR_STOCK = [
  { id: 'D1', w: 32, h: 80, label: '32" × 6\'-8" entry' },
  { id: 'D2', w: 36, h: 84, label: '36" × 7\'-0" entry, arched light' },
];

const OPENING_STOCK = [...WINDOW_STOCK, ...DOOR_STOCK];

/* An opening carries the id of the salvaged unit going into it, but `w` and
   `h` on the opening itself win. That is how the four unmeasured windows get
   fixed: go out with a tape, type what the tape says, and the guess is gone.
   Typing both numbers is measuring it, so `measured` flips on its own.

   `stock: 'custom'` is an opening with no salvaged unit behind it — a hole
   sized from nothing, for a unit not on the list. */
function customBase(o) {
  return o.kind === 'door'
    ? { id: 'custom', w: 32, h: 80, label: 'custom door' }
    : { id: 'custom', w: 30, h: 30, label: 'custom window' };
}
function stockFor(o) {
  const base = OPENING_STOCK.find((s) => s.id === o.stock) || customBase(o);
  const w = o.w != null ? o.w : base.w;
  const h = o.h != null ? o.h : base.h;
  /* A custom opening was never any other size, so it is not a resized
     anything — it is only ever what it says. */
  const resized = base.id !== 'custom'
    && (Math.abs(w - base.w) > 0.01 || Math.abs(h - base.h) > 0.01);
  return {
    ...base, w, h, resized,
    measured: base.measured === false ? (o.w != null && o.h != null) : base.measured,
    /* A salvaged unit keeps its name even when the size is corrected — it is
       still #5, and the audit reads the number off the front of the label.
       A custom opening has no name but its size. */
    label: base.id === 'custom' ? `Custom ${fmtIn(w)} × ${fmtIn(h)}` : base.label,
  };
}
/* A unit is off the shelf only while it is in a wall at the size it actually
   is; resize an opening and it is a hole for something else. */
function stockPlaced(s, openings) {
  return openings.filter((o) => o.stock === s.id && !stockFor(o).resized);
}

/* Rough openings get shimmed around a salvaged unit, so the hole is the
   unit plus half an inch a side. */
const RO_SLOP = 1.0;
function roughOf(o) {
  const s = stockFor(o);
  return { w: s.w + RO_SLOP, h: s.h + RO_SLOP };
}

const DEFAULT_SPEC = {
  /* Trailer. The frame is what it is — these are measured, not chosen. */
  length: 408,                  // 34'-0" west to east
  width: 144,                   // 12'-0" north to south
  frameDepth: 6,                // 2×6×.120 perimeter tube, on edge
  railSection: 'tube2x6x120',
  beamSection: 'i1.5x6x120',    // two, running the length at the third points
  joistSection: 'tube1.5x4x100',
  joistSpacing: 16,
  wheelWellStart: 131,          // from the east end, to the near face
  wheelWellLength: 80,          // 6'-8" on the sketch
  wheelWellWidth: 13,
  wheelWellRise: 17,            // measured: the arch top stands this far above the deck

  /* Measured on the built frame rather than scaled off the sketch: the rear
     axle of the tandem sits twelve feet from the east end, and a diagonal
     runs from the top of the wheel-well arch out to the side rail four feet
     from that end. The diagonal is not on the drawing but it is on the
     trailer, and it turns out to matter more than anything else here. */
  rearAxleToEnd: 144,
  tandemSpacing: 35,
  strut: true,
  strutFrom: 48,                // where it lands, in from the east end
  strutSection: 'tube1.5x4x100',

  /* The sketch does not say which end the tongue is on, but the statics do:
     the wheel wells sit east of the middle, and a trailer only tows with the
     hitch on the far side of its own centre of gravity from the axles. Put
     the hitch at the east end and the tongue weight comes out negative. */
  tongueEnd: 'west',
  tongueOverhang: 48,           // hitch point beyond that end

  /* How high the deck sits, and how high the whole thing may be. Fourteen
     feet is what travels; everything above the road surface counts. */
  deckHeight: 18,
  roadEnvelope: 168,            // 14'-0"

  /* The house on top of it. */
  wallHeight: 135,              // top of frame to top of the top plate
  studSize: '2x4',
  studSpacing: 24,
  ridgeRise: 9,                 // above the side walls, so 1.5/12
  eaveOverhang: 6,
  rakeOverhang: 6,
  subfloor: 0.75,

  loftHeight: 80,               // top of the loft deck above the frame
  loftJoist: '2x8',
  eastLoft: 124,                // master loft, measured in from the east wall
  westLoft: 67,                 // library loft, measured in from the west wall

  roofing: 'standing',          // standing seam / metal / membrane
  siding: 'metal',
  /* Metal on girts outside, OSB inside. The sheathing that braces the walls
     is the interior face, which is also the interior surface — one layer
     doing three jobs, and the wall stays 3½" thick. */
  wallSkin: 'girts',
  girtSpacing: 24,
  girtSize: '2x4',
  roofDeck: true,
  wallInsulation: 'batt',
  ceilingInsulation: 9.25,

  /* Site and loads. Nothing here is confirmed — see the README. */
  groundSnow: 25,
  windSpeed: 100,
  exposure: 'B',
  seismicSDS: 0.75,
  interiorFinish: 'osb',
};

/* Openings as the sketch places them. Offsets on the north and south walls
   run from the WEST end; on the east and west walls from the NORTH corner.
   `head` is the top of the rough opening above the top of the frame.

   Everything here was scaled off the sketch photograph, so treat it as
   "about there" rather than as a dimension. #12 is in the schedule but does
   not appear anywhere on the sketch, so it stays on the shelf. */
const DEFAULT_OPENINGS = [
  // South wall — kitchen, entry, and the long frosted shower window
  { id: 'a', wall: 'S', stock: 'W14', off: 14,  head: 128 },
  { id: 'b', wall: 'S', stock: 'D1',  off: 25,  head: 81, kind: 'door' },
  { id: 'c', wall: 'S', stock: 'W9',  off: 79,  head: 125 },
  { id: 'd', wall: 'S', stock: 'W1',  off: 96,  head: 69 },
  { id: 'e', wall: 'S', stock: 'W11', off: 223, head: 78 },   // sill on the 36½" counter
  { id: 'f', wall: 'S', stock: 'W10', off: 253, head: 122 },
  { id: 'g', wall: 'S', stock: 'W4',  off: 303, head: 71 },

  // North wall — main entry with the arched light
  { id: 'h', wall: 'N', stock: 'W2',  off: 20,    head: 113 },
  { id: 'i', wall: 'N', stock: 'W3',  off: 24,    head: 70 },
  { id: 'j', wall: 'N', stock: 'D2',  off: 153,   head: 85, kind: 'door' },
  { id: 'k', wall: 'N', stock: 'W5',  off: 207.5, head: 81 },
  { id: 'l', wall: 'N', stock: 'W7',  off: 338.5, head: 113 },

  // Gable ends
  { id: 'm', wall: 'E', stock: 'W13', off: 47.5,  head: 124 },  // master loft
  { id: 'n', wall: 'E', stock: 'W6',  off: 65.25, head: 71 },   // bathroom
  { id: 'o', wall: 'W', stock: 'W8',  off: 58.75, head: 68 },   // library / office
];

const STAGES = [
  { key: 'trailer', name: 'Trailer',        blurb: 'Steel frame, cross joists, wheel wells' },
  { key: 'floor',   name: 'Floor',          blurb: 'Rigid foam between the joists, subfloor over' },
  { key: 'walls',   name: 'Wall Framing',   blurb: '135" walls, headers, corners, openings framed' },
  { key: 'loft',    name: 'Lofts',          blurb: 'Master loft east, library loft west' },
  { key: 'roof',    name: 'Roof Framing',   blurb: 'Ridge and rafters, 9" of rise over 12 feet' },
  { key: 'dryin',   name: 'Sheathing & Dry-in', blurb: 'Wall and roof sheathing, weather barrier' },
  { key: 'skin',    name: 'Windows, Doors, Skin', blurb: 'Salvaged units set, roofing and siding' },
  { key: 'finish',  name: 'Insulation & Interior', blurb: 'Wall and lid insulation, interior face' },
];

/* Which way each wall runs, and which corner an offset is measured from.
   North and south run along the trailer; east and west are the gable ends. */
const WALLS = {
  N: { axis: 'x', z: 0,        gable: false, label: 'North', from: 'west end' },
  S: { axis: 'x', z: 'width',  gable: false, label: 'South', from: 'west end' },
  W: { axis: 'z', x: 0,        gable: true,  label: 'West',  from: 'north corner' },
  E: { axis: 'z', x: 'length', gable: true,  label: 'East',  from: 'north corner' },
};
