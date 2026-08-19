/* Wall framing plan for a saved layout: elevations, a cut list against one
   stock length, and a fastener count.

   Everything here is derived from the model the tool already builds, so the
   plan cannot disagree with the drawing on screen. The two things it works
   out for itself are how a run longer than a stick gets spliced, and what
   the headers carry — the model sizes those from roof load alone, and a
   header with a loft ledger over it carries the loft as well.

   usage: node tools/framing-plan.mjs <layout.json> [--stock 144] [--out f.html] */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- the building's own scope, headless ---------------------------------- */
const API = ['buildModel', 'decodeLayout', 'readLayoutFile', 'auditBuilding', 'LUMBER', 'WALLS',
  'wallRun', 'openingsOn', 'roughOf', 'sizeHeader', 'stockFor', 'roofY', 'girtRuns',
  'girtSection', 'pickMember', 'roofLoads', 'evalMember', 'loftDesign', 'fmtIn', 'fmtFt'];
function loadScope(building) {
  const dirs = [join(root, 'core', 'src'), join(root, 'buildings', building, 'src')];
  const files = dirs.flatMap((d, i) => readdirSync(d)
    .filter((f) => (i ? f.endsWith('.js') && !/^40-panels/.test(f) : /^[0-8]/.test(f)))
    .sort().map((f) => join(d, f)));
  const ctx = vm.createContext({ Math, console, performance, Intl, Number, JSON,
    TextEncoder, TextDecoder, btoa, atob, Date });
  vm.runInContext(`${files.map((f) => readFileSync(f, 'utf8')).join('\n')}
;globalThis.__api = {};
for (const n of ${JSON.stringify(API)}) { try { globalThis.__api[n] = eval(n); } catch (e) {} }`, ctx);
  return ctx.__api;
}

/* ---- formatting ---------------------------------------------------------- */
const FRAC = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [0.375, '⅜'], [0.5, '½'],
  [0.625, '⅝'], [0.75, '¾'], [0.875, '⅞']];
function inches(v) {
  const neg = v < 0; v = Math.abs(v);
  const whole = Math.floor(v + 1e-6);
  let frac = v - whole;
  let best = FRAC[0];
  for (const f of FRAC) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (Math.abs(1 - frac) < Math.abs(best[0] - frac)) return `${neg ? '-' : ''}${whole + 1}"`;
  return `${neg ? '-' : ''}${whole || (best[1] ? '' : 0)}${best[1]}"`;
}
function feet(v) {
  const ft = Math.floor(v / 12); const rest = v - ft * 12;
  return rest < 0.01 ? `${ft}'-0"` : `${ft}'-${inches(rest)}`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- 1. every framing piece, in its own wall's coordinates --------------- */
function wallPieces(A, model, spec) {
  const T = A.LUMBER[spec.studSize].d;
  const out = [];
  const src = model.parts.filter((p) => p.sys === 'framing'
    && (p.stage === 'walls' || (p.stage === 'roof' && /gable plate/.test(p.kind))));
  for (const p of src) {
    const [xc, yc, zc] = p.geom.p; const [sx, sy, sz] = p.geom.s;
    const alongX = Math.abs(sz - T) < 1e-6 && Math.abs(sx - T) > 1e-6;
    const alongZ = Math.abs(sx - T) < 1e-6 && Math.abs(sz - T) > 1e-6;
    if (!alongX && !alongZ) throw new Error(`cannot place ${p.kind} ${JSON.stringify(p.geom.s)}`);
    const wall = alongX ? (zc < spec.width / 2 ? 'N' : 'S') : (xc < spec.length / 2 ? 'W' : 'E');
    const u = alongX ? [xc - sx / 2, xc + sx / 2] : [zc - sz / 2, zc + sz / 2];
    out.push({ id: p.id, kind: p.kind, size: p.size, wall,
      u0: +u[0].toFixed(4), u1: +u[1].toFixed(4),
      y0: +(yc - sy / 2).toFixed(4), y1: +(yc + sy / 2).toFixed(4),
      len: p.len, note: p.note });
  }
  return out;
}

/* ---- 2. splicing a plate longer than one stick --------------------------- */
/* A splice lands on a stud centre, never within 24" of the course below it,
   and never leaves a tail shorter than one bay. Studs run at studSpacing
   from the end of the wall, so a centre is k·spacing + ¾" less whatever the
   plate is inset by at a gable end. */
function splitAtStuds(len, inset, spacing, shift, stick) {
  if (len <= stick + 0.01) return [len];
  const centre = (k) => k * spacing + 0.75 - inset;
  const segs = []; let at = 0; let first = true;
  while (len - at > stick + 0.01) {
    const cands = [];
    for (let j = 1; centre(j) <= at + stick + 0.01; j++) if (centre(j) >= at + spacing - 0.01) cands.push(j);
    if (!cands.length) throw new Error('nowhere to splice this plate');
    let k = cands[first ? Math.max(0, cands.length - 1 - shift) : cands.length - 1];
    first = false;
    /* never strand a last piece shorter than one bay */
    while (k > cands[0] && len - centre(k) <= stick + 0.01 && len - centre(k) < spacing - 0.01) k--;
    segs.push(+(centre(k) - at).toFixed(4));
    at = centre(k);
  }
  segs.push(+(len - at).toFixed(4));
  return segs;
}

function plateRuns(A, spec, stick, trim = 0.5) {
  const T = A.LUMBER[spec.studSize].d;
  const out = [];
  for (const wall of ['N', 'S', 'W', 'E']) {
    const gable = A.WALLS[wall].gable;
    const inset = gable ? T : 0;
    const len = A.wallRun(wall, spec) - (gable ? T * 2 : 0);
    /* the cap has to break clear of the plate under it, so it starts a bay back */
    [['bottom plate', 0], ['top plate, lower', 0], ['top plate, cap', 1]].forEach(([course, shift]) => {
      out.push({ wall, course, len, inset,
        segs: splitAtStuds(len, inset, spec.studSpacing, shift, stick - trim) });
    });
  }
  return out;
}

/* ---- 3. what the headers actually carry ---------------------------------- */
/* The model sizes a header from roof load. Where a loft ledger runs over an
   opening the header carries the loft too, and that is the case the model
   misses — so work the openings out here from both, and say which is which. */
const WALL_LADDER = [                       // two plies is all a 3½" wall holds
  { size: '2x4', plies: 2, kind: 'sawn' }, { size: '2x6', plies: 2, kind: 'sawn' },
  { size: '2x8', plies: 2, kind: 'sawn' }, { size: '2x10', plies: 2, kind: 'sawn' },
  { size: '2x12', plies: 2, kind: 'sawn' },
];
function headerSchedule(A, spec, openings) {
  const zones = loftZones(A, spec);
  const ledgerBot = zones.length ? zones[0].y : Infinity;
  const rl = A.roofLoads(spec);
  const trib = spec.width / 2 / 12;                       // feet of roof or loft each wall takes
  const roofPlf = rl.total * trib;
  const loftD = 10, loftL = 40;                           // psf, IRC library loft
  const out = [];
  for (const o of openings) {
    const ro = A.roughOf(o); const st = A.stockFor(o);
    const bearing = A.WALLS[o.wall].axis === 'x';
    const tool = A.sizeHeader(o, spec);
    const hDepth = A.LUMBER[tool.size] ? A.LUMBER[tool.size].d : 5.5;
    let loft = null;
    if (bearing) {
      for (const z of zones) {
        if (o.off + ro.w <= z.a || o.off >= z.b) continue;
        if (z.y < o.head - 0.01) continue;                 // ledger passes below the head
        loft = { name: z.name, clash: z.y < o.head + hDepth - 0.01 };
      }
    }
    /* ASCE 7 ASD. With a loft over it, D + 0.75L + 0.75S governs a header
       that would otherwise be sized on D + S alone. */
    const dead = (rl.dead + (loft ? loftD : 0)) * trib;
    const snow = rl.snow * trib;
    const live = loft ? loftL * trib : 0;
    const wPlf = bearing
      ? Math.max(dead + live, dead + snow, dead + 0.75 * live + 0.75 * snow)
      : 0;
    const pick = bearing
      ? (A.pickMember(ro.w, wPlf, WALL_LADDER, 240)
        || { label: 'past this ladder', size: '2x12', plies: 2, ratio: Infinity, over: true })
      : { label: `(2) ${spec.studSize}`, size: spec.studSize, plies: 2, ratio: 0, nonbearing: true };
    out.push({ o, ro, st, bearing, loft, tool, pick, wPlf, roofPlf,
      len: +(ro.w + 3).toFixed(3),
      sill: +(o.head - ro.h).toFixed(3) });
  }
  return out.sort((a, b) => a.o.wall.localeCompare(b.o.wall) || a.o.off - b.o.off);
}

/* Where a loft ledger runs along a wall, if this building has lofts at all.
   A building without them simply gets an empty list, and every header is
   sized on the roof. */
function loftZones(A, spec) {
  const lj = spec.loftJoist && A.LUMBER[spec.loftJoist];
  if (!lj || spec.loftHeight == null || spec.length == null) return [];
  const y = spec.loftHeight - 0.75 - lj.d;
  return [{ a: spec.length - spec.eastLoft, b: spec.length, name: 'Master loft', y, d: lj.d },
    { a: 0, b: spec.westLoft, name: 'Library loft', y, d: lj.d }]
    .filter((z) => z.b - z.a >= 12);
}

/* ---- 4. the cut list ----------------------------------------------------- */
const KERF = 0.125;
function pieceList(A, pieces, plates, hdrs, spec) {
  const want = [];
  const skip = new Set();
  /* the model's header parts are replaced by this plan's schedule */
  for (const p of pieces) {
    if (/header/.test(p.kind)) { skip.add(p.id); continue; }
    if (/plate/.test(p.kind) && !/gable/.test(p.kind)) continue;
    if (p.size !== spec.studSize) continue;
    want.push({ len: p.len, kind: p.kind, wall: p.wall, u0: p.u0, y0: p.y0 });
  }
  for (const r of plates) for (const s of r.segs)
    want.push({ len: s, kind: r.course, wall: r.wall, plate: true });
  for (const h of hdrs) if (h.pick.size === spec.studSize)
    for (let i = 0; i < h.pick.plies; i++)
      want.push({ len: h.len, kind: 'header ply', wall: h.o.wall, u0: h.o.off - 1.5 });
  return want.sort((a, b) => b.len - a.len);
}
function pack(pieces, stick) {
  const sticks = [];
  for (const p of pieces) {
    if (p.len > stick + 0.01) throw new Error(`${inches(p.len)} will not come from a ${stick}" stick`);
    let home = sticks.find((s) => s.left >= p.len + (s.pieces.length ? KERF : 0) - 1e-9);
    if (!home) { home = { pieces: [], left: stick }; sticks.push(home); }
    home.left -= p.len + (home.pieces.length ? KERF : 0);
    home.pieces.push(p);
  }
  for (const s of sticks) s.left = +s.left.toFixed(3);
  return sticks;
}

/* ---- 5. fasteners -------------------------------------------------------- */
/* One 3" structural screw stands in for one 16d common, which is what the
   IRC fastening schedule is written in. Everything below names the row it
   comes from, so the count can be argued with. */
function screwSchedule(A, pieces, plates, hdrs, spec) {
  const rows = [];
  const P = pieces.filter((p) => p.size === spec.studSize && !/header/.test(p.kind));
  const vertical = P.filter((p) => p.y1 - p.y0 > p.u1 - p.u0);
  const kinds = (re) => vertical.filter((p) => re.test(p.kind));
  const studs = kinds(/stud$|cripple/).filter((p) => !/jack/.test(p.kind));
  const jacks = kinds(/jack/);
  const sills = P.filter((p) => /sill/.test(p.kind));
  const add = (what, each, n, basis) => rows.push({ what, each, n, total: each * n, basis });

  add('Stud, king and cripple ends', 2, studs.length * 2,
    'IRC R602.3(1) 4 — stud to plate, 2-16d end nail. Both ends of every piece.');
  add('Jack stud, foot', 2, jacks.length,
    'IRC R602.3(1) 4 — bearing on the plate, end nailed.');
  add('Jack to king stud', 1, jacks.reduce((s, p) => s + Math.max(2, Math.ceil((p.y1 - p.y0) / 24)), 0),
    'IRC R602.3(1) 6 — built-up stud, 16d at 24" o.c., minimum two.');
  add('Header ply to ply', 1, hdrs.filter((h) => h.pick.plies > 1)
    .reduce((s, h) => s + 2 * Math.max(2, Math.ceil(h.len / 16)), 0),
    'IRC R602.3(1) 5 — built-up header, 16d at 16" o.c. along each edge.');
  add('Header end into king', 3, hdrs.length * 2,
    'IRC R602.3(1) 7 — header to king stud, 4-16d toenail; 3 screws a side.');
  add('Rough sill ends', 2, sills.length * 2,
    'Toenailed into the jack each side.');
  add('Sill down into its cripples', 2, kinds(/cripple/).filter((p) =>
    sills.some((s) => Math.abs(p.y1 - s.y0) < 0.02 && p.u0 >= s.u0 - 0.02 && p.u1 <= s.u1 + 0.02)).length,
  'Through the rough sill into the cripple under it.');
  add('Raked gable plate', 3, pieces.filter((p) => /gable plate/.test(p.kind)).length * 2,
    'Each end of the raked plate into the wall plate and the ridge end.');
  add('Double top plate', 1, plates.filter((r) => /cap/.test(r.course))
    .reduce((s, r) => s + Math.ceil(r.len / 24), 0),
  'IRC R602.3(1) 12 — face nail at 24" o.c. the length of the wall.');
  add('Plate splices', 8, plates.reduce((s, r) => s + r.segs.length - 1, 0),
    'IRC R602.3.2 — 8-16d each side of a lapped top-plate joint.');
  add('Corner posts and channels', 1, 4 * Math.ceil((spec.wallHeight - 4.5) / 24) * 2,
    'IRC R602.3(1) 6 — built-up stud at 24" o.c., two plies at each of four corners.');
  return rows;
}

/* ---- 6. elevations ------------------------------------------------------- */
/* One hue, seven steps of value, so a photocopy still tells them apart. */
const FILL = {
  'bottom plate': '#bd8434', 'top plate': '#bd8434', 'gable plate': '#bd8434',
  stud: '#dfc396', cripple: '#f2e6d0', 'king stud': '#a4652c', 'jack stud': '#854d22',
  sill: '#cfa267', header: '#5e3417',
};
const fillFor = (kind) => {
  for (const k of ['gable plate', 'bottom plate', 'top plate', 'king stud', 'jack stud',
    'cripple', 'header', 'sill', 'stud']) if (kind.includes(k)) return FILL[k];
  return '#d8b98a';
};
function elevation(A, wall, pieces, hdrs, spec, plates) {
  const run = A.wallRun(wall, spec);
  const gable = A.WALLS[wall].gable;
  const top = gable ? spec.wallHeight + spec.ridgeRise : spec.wallHeight;
  const title = `${A.WALLS[wall].label} wall — ${feet(run)} overall, `
    + `measured from the ${A.WALLS[wall].from}`;
  const M = { l: 26, r: 26, t: 22, b: 84 };
  M.r = Math.max(M.r, title.length * 3.7 - run + 10);    // the title has to fit the sheet
  const W = run + M.l + M.r; const H = top + M.t + M.b;
  const p = [];
  const rect = (x, y, w, h, fill, stroke = '#5a4426', sw = 0.4, extra = '') =>
    p.push(`<rect x="${(M.l + x).toFixed(2)}" y="${(M.t + top - y - h).toFixed(2)}" `
      + `width="${Math.max(w, 0.2).toFixed(2)}" height="${Math.max(h, 0.2).toFixed(2)}" `
      + `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`);
  const text = (x, y, s, size = 5, anchor = 'middle', cls = 'lbl') =>
    p.push(`<text class="${cls}" x="${(M.l + x).toFixed(2)}" y="${(M.t + top - y).toFixed(2)}" `
      + `font-size="${size}" text-anchor="${anchor}">${esc(s)}</text>`);

  /* the pieces the model made, minus the headers this plan re-sized */
  for (const q of pieces.filter((q) => q.wall === wall)) {
    if (/header/.test(q.kind)) continue;
    if (/plate/.test(q.kind)) continue;               // plates and rakes drawn below
    rect(q.u0, q.y0, q.u1 - q.u0, q.y1 - q.y0, fillFor(q.kind));
  }
  /* The raked plate is held as a bounding box, which as an elevation would
     read as a solid gable. Draw the member the box stands for. */
  if (gable) {
    for (const [a, b] of [[0, run / 2], [run / 2, run]]) {
      const yA = A.roofY(a, spec); const yB = A.roofY(b, spec);
      p.push(`<polygon points="${[[a, yA], [b, yB], [b, yB - 1.5], [a, yA - 1.5]]
        .map(([u, y]) => `${(M.l + u).toFixed(2)},${(M.t + top - y).toFixed(2)}`).join(' ')}" `
        + `fill="${FILL['gable plate']}" stroke="#5a4426" stroke-width="0.4"/>`);
    }
  }
  /* plates, drawn as the pieces they are cut into so the splices show */
  const T = A.LUMBER[spec.studSize].d;
  const inset = gable ? T : 0;
  for (const r of plates.filter((r) => r.wall === wall)) {
    const y = /bottom/.test(r.course) ? spec.subfloor
      : /lower/.test(r.course) ? spec.wallHeight - 3 : spec.wallHeight - 1.5;
    let at = inset;
    for (const s of r.segs) {
      rect(at, y, s, 1.5, FILL['bottom plate']);
      at += s;
      if (at < inset + r.len - 0.01)                        // a splice, drawn as one
        p.push(`<line x1="${(M.l + at).toFixed(2)}" y1="${(M.t + top - y).toFixed(2)}" `
          + `x2="${(M.l + at).toFixed(2)}" y2="${(M.t + top - y - 1.5).toFixed(2)}" `
          + `stroke="#3d2a12" stroke-width="1.1"/>`);
    }
  }
  /* where a loft ledger crosses this wall — the reason two headers grew */
  if (!gable) {
    for (const z of loftZones(A, spec)) {
      p.push(`<rect x="${(M.l + z.a).toFixed(2)}" y="${(M.t + top - z.y - z.d).toFixed(2)}" `
        + `width="${(z.b - z.a).toFixed(2)}" height="${z.d.toFixed(2)}" fill="none" `
        + `stroke="#1f4e79" stroke-width="0.8" stroke-dasharray="5 3"/>`);
      const west = z.a < spec.length - z.b;   // label toward the end it starts from
      text(west ? z.a + 2 : z.b - 2, z.y + z.d + 2.5, `${z.name} ledger, ${inches(z.y)} up`,
        5, west ? 'start' : 'end', 'lbl dim');
    }
  }
  /* headers as scheduled here */
  for (const h of hdrs.filter((h) => h.o.wall === wall)) {
    const d = A.LUMBER[h.pick.size].d;
    rect(h.o.off - 1.5, h.o.head, h.len, d, FILL.header);
  }
  /* rough openings */
  for (const h of hdrs.filter((h) => h.o.wall === wall)) {
    const { off } = h.o;
    p.push(`<rect x="${(M.l + off).toFixed(2)}" y="${(M.t + top - h.o.head).toFixed(2)}" `
      + `width="${h.ro.w.toFixed(2)}" height="${h.ro.h.toFixed(2)}" fill="rgba(255,255,255,.55)" `
      + `stroke="#1f4e79" stroke-width="0.7" stroke-dasharray="3 2"/>`);
    text(off + h.ro.w / 2, h.o.head - h.ro.h / 2 - 1, `${inches(h.ro.w)} × ${inches(h.ro.h)}`, 5.5);
    const room = Math.floor(h.ro.w / 2.6);                 // characters the hole will hold
    const name = (h.o.name || h.st.label);
    text(off + h.ro.w / 2, h.o.head - h.ro.h / 2 - 7.5,
      name.length > room ? name.slice(0, Math.max(3, room - 1)) + '…' : name, 5, 'middle', 'lbl dim');
  }
  /* wall outline */
  p.push(`<polyline points="${outline(A, wall, spec, M, top)}" fill="none" stroke="#1f2937" stroke-width="0.8"/>`);
  /* dimension line: opening edges off the near corner */
  const marks = [0, ...hdrs.filter((h) => h.o.wall === wall)
    .flatMap((h) => [h.o.off, h.o.off + h.ro.w]), run].sort((a, b) => a - b);
  const yD = -20;
  p.push(`<line x1="${M.l}" y1="${(M.t + top - yD).toFixed(2)}" x2="${(M.l + run).toFixed(2)}" `
    + `y2="${(M.t + top - yD).toFixed(2)}" stroke="#1f4e79" stroke-width="0.5"/>`);
  for (let i = 0; i < marks.length; i++) {
    p.push(`<line x1="${(M.l + marks[i]).toFixed(2)}" y1="${(M.t + top - yD + 3).toFixed(2)}" `
      + `x2="${(M.l + marks[i]).toFixed(2)}" y2="${(M.t + top - yD - 3).toFixed(2)}" `
      + `stroke="#1f4e79" stroke-width="0.5"/>`);
    if (i) {
      const mid = (marks[i] + marks[i - 1]) / 2; const d = marks[i] - marks[i - 1];
      /* a tight run drops to a second line so the strings do not collide */
      if (d > 8) text(mid, yD - (d < 26 && i % 2 ? 12.5 : 5.5), inches(d), 5.5, 'middle', 'lbl dim');
    }
  }
  text(0, yD - 25, title, 7, 'start', 'lbl ttl');
  /* stud module ticks along the top */
  for (let u = 0; u <= run - 1.5; u += spec.studSpacing)
    text(u + 0.75, top + 4, feet(u), 5, 'middle', 'lbl dim');
  /* ¼" = 1'-0" at 96 dpi, the same on every sheet so they compare */
  return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" `
    + `aria-label="${esc(A.WALLS[wall].label)} wall framing elevation" `
    + `width="${Math.round(W * 2)}" height="${Math.round(H * 2)}">${p.join('')}</svg>`;
}
function outline(A, wall, spec, M, top) {
  const run = A.wallRun(wall, spec);
  const pts = [];
  const at = (u, y) => pts.push(`${(M.l + u).toFixed(2)},${(M.t + top - y).toFixed(2)}`);
  at(0, 0);
  if (A.WALLS[wall].gable) {
    at(0, A.roofY(0, spec)); at(run / 2, A.roofY(run / 2, spec)); at(run, A.roofY(run, spec));
  } else { at(0, spec.wallHeight); at(run, spec.wallHeight); }
  at(run, 0); at(0, 0);
  return pts.join(' ');
}

/* The legend is built from this, not beside it — a second colour table is
   exactly how the drawing and its key drift apart. */
const LEGEND = [['bottom plate', 'Plate'], ['stud', 'Stud'], ['king stud', 'King'],
  ['jack stud', 'Jack'], ['cripple', 'Cripple'], ['sill', 'Rough sill'], ['header', 'Header']]
  .map(([k, label]) => [FILL[k], label]);

export { loadScope, wallPieces, plateRuns, headerSchedule, pieceList, pack,
  screwSchedule, elevation, splitAtStuds, inches, feet, esc, WALL_LADDER, KERF,
  FILL, LEGEND };


/* ---- 8. the run ---------------------------------------------------------- */
function argv() {
  const a = process.argv.slice(2);
  const out = { stock: 144, trim: 0.5 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--stock') out.stock = Number(a[++i]);
    else if (a[i] === '--trim') out.trim = Number(a[++i]);
    else if (a[i] === '--out') out.out = a[++i];
    else out.layout = a[i];
  }
  return out;
}

/* What a building has to be able to answer before a framing plan can be
   drawn from it. Saying which name is missing beats a null dereference six
   frames down. */
const NEEDS = ['buildModel', 'decodeLayout', 'wallRun', 'WALLS', 'LUMBER', 'roughOf',
  'sizeHeader', 'stockFor', 'roofY', 'pickMember', 'roofLoads'];

export class Unsupported extends Error {}

export function plan(layoutJson, stick = 144, trim = 0.5) {
  const file = JSON.parse(layoutJson);
  const A = loadScope(file.tool);
  const missing = NEEDS.filter((n) => typeof A[n] !== 'function' && typeof A[n] !== 'object');
  if (missing.length) {
    throw new Unsupported(`${file.tool} does not have ${missing.join(', ')} — `
      + 'the framing plan only knows how to read a building that does');
  }
  const read = A.readLayoutFile(layoutJson);
  if (read.error) throw new Error(read.error);
  const { spec, openings } = A.decodeLayout(read.code);
  const model = A.buildModel(spec, openings);

  const pieces = wallPieces(A, model, spec);
  const plates = plateRuns(A, spec, stick, trim);
  const hdrs = headerSchedule(A, spec, openings);
  const list = pieceList(A, pieces, plates, hdrs, spec);
  const sticks = pack(list, stick - trim);
  const screws = screwSchedule(A, pieces, plates, hdrs, spec);
  return { A, file, read, spec, openings, model, pieces, plates, hdrs, list, sticks,
    screws, stick, trim };
}

/* Sticks that get cut the same way, so the list is something you can work
   from rather than 128 near-identical lines. */
function patterns(sticks, stick) {
  const seen = new Map();
  for (const s of sticks) {
    const key = s.pieces.map((p) => p.len.toFixed(3)).join('|');
    if (!seen.has(key)) {
      seen.set(key, { count: 0, cuts: s.pieces.map((p) => p.len), drop: s.left,
        what: [...new Set(s.pieces.map((p) => p.kind))].join(', ') });
    }
    seen.get(key).count++;
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || b.cuts[0] - a.cuts[0]);
}
function byRole(list) {
  const seen = new Map();
  for (const p of list) {
    const k = p.kind;
    if (!seen.has(k)) seen.set(k, { kind: k, count: 0, set: new Set() });
    const r = seen.get(k); r.count++; r.set.add(+p.len.toFixed(3));
  }
  return [...seen.values()]
    .map((r) => ({ kind: r.kind, count: r.count,
      lens: [...r.set].sort((a, b) => b - a).slice(0, 6).map(inches)
        .concat(r.set.size > 6 ? [`+${r.set.size - 6} more`] : []) }))
    .sort((a, b) => b.count - a.count);
}

function findingsFor(A, spec, hdrs) {
  const out = [];
  const lofted = hdrs.filter((h) => h.loft);
  const clash = lofted.filter((h) => h.loft.clash);
  const upsized = hdrs.filter((h) => h.pick.size !== spec.studSize);
  const dropped = hdrs.filter((h) => h.bearing && h.pick.label !== h.tool.label
    && h.pick.size === spec.studSize);
  if (lofted.length) {
    out.push({ level: 'crit', head: 'The tool is not putting loft load on these headers',
      text: `<b>${lofted.map((h) => esc(h.o.name || h.st.label)).join('</b>, <b>')}</b> `
        + `${lofted.length === 1 ? 'has' : 'each have'} a loft ledger running over the top, so `
        + `${lofted.length === 1 ? 'its' : 'their'} header carries the loft as well as the roof. `
        + `<code>sizeHeader</code> only ever asks <code>roofLoads</code>, so on screen `
        + `${lofted.length === 1 ? 'it is' : 'they are'} sized for `
        + `${Math.round(hdrs[0].roofPlf)} plf when the real number is `
        + `${Math.round(Math.max(...lofted.map((h) => h.wPlf)))} plf. `
        + `The schedule on sheet A5 is sized for the real number — that is the one to build to.` });
  }
  if (clash.length) {
    out.push({ level: 'warn', head: 'Ledger and header want the same inches',
      text: `Over the <b>${esc(clash[0].o.name || clash[0].st.label)}</b> the loft ledger lands `
        + `inside the depth of the header rather than on top of it. Drop the head of that `
        + `opening, or let the header double as the ledger for that stretch and hang the joists `
        + `off its face — but do not notch either one to make them fit.` });
  }
  if (dropped.length) {
    out.push({ level: 'good', head: `${dropped.length} headers come down to (2) ${spec.studSize}`,
      text: `Every bearing header on the tool's ladder starts at (2)&nbsp;2x6, because three plies of `
        + `2x4 will not fit a ${inches(A.LUMBER[spec.studSize].d)} wall and the ladder skips `
        + `straight past a size it cannot double up. Run the numbers and (2)&nbsp;${spec.studSize} `
        + `carries ${dropped.length} of the ${hdrs.filter((h) => h.bearing).length} bearing openings, `
        + `the worst of them at ${Math.max(...dropped.map((h) => h.pick.ratio)).toFixed(2)} of `
        + `capacity. That is what keeps this list to one stock size.` });
  }
  if (upsized.length) {
    out.push({ level: 'warn', head: `${upsized.length} header${upsized.length > 1 ? 's are' : ' is'} not a 2x4`,
      text: upsized.map((h) => `<b>${esc(h.o.name || h.st.label)}</b> needs `
        + `${esc(h.pick.label)} at ${esc(inches(h.len))}`).join('; ')
        + `. Everything else on the wall comes out of ${esc(feet(144))} 2x4.` });
  }
  const loft = A.loftDesign && A.loftDesign(spec);
  if (loft && A.LUMBER[spec.loftJoist] && A.LUMBER[spec.loftJoist].d < loft.depth - 0.01) {
    out.push({ level: 'crit', head: `The lofts are framed in ${esc(spec.loftJoist)} and want ${esc(loft.label)}`,
      text: `Not a wall problem, but it is upstream of one. A ${esc(spec.loftJoist)} spanning the `
        + `${esc(feet(spec.width))} across the trailer at 40 psf is roughly `
        + `${(loft.M / (900 * 1.15 * A.LUMBER[spec.loftJoist].Cf * 1.15 * A.LUMBER[spec.loftJoist].Sx)).toFixed(1)}&times; `
        + `its bending capacity. The tool works out that it wants ${esc(loft.label)} and then draws `
        + `whatever the spec says without comparing the two. Worth settling before the walls go up, `
        + `because it decides how the ledgers land.` });
  }
  return out;
}

async function main() {
  const a = argv();
  if (!a.layout) {
    console.error('usage: node tools/framing-plan.mjs <layout.json> [--stock 144] [--out plan.html]');
    process.exit(1);
  }
  const src = readFileSync(a.layout, 'utf8');
  const P = plan(src, a.stock, a.trim);
  const { A, spec, hdrs, plates, list, sticks, screws, stick } = P;
  const { page } = await import('./framing-plan-page.mjs');

  const used = list.reduce((s, p) => s + p.len, 0);
  const studLen = spec.wallHeight - (spec.subfloor || 0) - 4.5;   // plate, plate, plate
  const screwTotal = screws.reduce((s, r) => s + r.total, 0);
  const screwBuy = Math.ceil(screwTotal * 1.1 / 50) * 50;
  const other = hdrs.filter((h) => h.pick.size !== spec.studSize);

  /* What the one-stock-length rule actually costs, since it is the whole
     premise of the list. Stick count falls with length; linear feet does not,
     because a stud that drops 14¼" off a 12' drops 38¼" off a 14'. */
  const alternatives = [144, 168, 192, 240].map((S) => {
    try {
      const p = plan(src, S, a.trim);
      const u = p.list.reduce((t, q) => t + q.len, 0);
      return { stock: S, sticks: p.sticks.length, ft: Math.round(p.sticks.length * S / 12),
        yield: 100 * u / (p.sticks.length * (S - a.trim)) };
    } catch { return null; }
  }).filter(Boolean);

  const elevations = ['N', 'S', 'W', 'E'].map((w) => ({
    wall: w, label: A.WALLS[w].label, from: A.WALLS[w].from,
    note: `${feet(A.wallRun(w, spec))} × ${feet(spec.wallHeight)}`,
    svg: elevation(A, w, P.pieces, hdrs, spec, plates),
  }));

  const shopping = [
    { item: `2x4 × ${feet(stick)}, kiln dried`, qty: `${sticks.length} pcs`,
      note: `${Math.round(used / 12)} linear feet of it ends up in the wall; the rest is drop.` },
    ...other.map((h) => ({ item: `${h.pick.size} × 8', for the ${h.o.name || h.st.label} header`,
      qty: `${h.pick.plies} pcs`, note: `Cut to ${inches(h.len)}, ${h.pick.plies} plies.` })),
    { item: '½" plywood, header spacers', qty: '1 sheet',
      note: `Ripped into ${hdrs.length} strips so each built-up header packs out to ${inches(A.LUMBER[spec.studSize].d)}.` },
    { item: '3" structural screws', qty: `${screwBuy} pcs`,
      note: 'Code-listed structural screws, not deck or drywall screws.' },
  ];

  const html = page({
    meta: {
      title: `${P.file.toolName} Wall Framing`,
      h1: `${P.file.toolName} — wall framing`,
      sub: `${feet(spec.length)} × ${feet(spec.width)} on the trailer, `
        + `${feet(spec.wallHeight)} walls, ${spec.studSize} at ${inches(spec.studSpacing)} o.c., `
        + `${hdrs.length} openings.`,
      layout: P.file.name, saved: (P.file.saved || '').slice(0, 10),
      source: basename(a.layout),
    },
    spec, stick, trim: P.trim, studLen, hdrs, plates, screws, screwTotal,
    screwBuy: `${screwBuy}`,
    screwBoxes: `About ${Math.ceil(screwBuy / 100)} boxes of 100, or ${(screwBuy / 500).toFixed(1)} of the 500 pails.`,
    elevations,
    alternatives,
    patterns: patterns(sticks, stick),
    byRole: byRole(list),
    findings: findingsFor(A, spec, hdrs),
    shopping,
    figures: [
      { n: String(sticks.length), k: `12' 2x4`, d: `${Math.round(used / 12)} ft used of ${sticks.length * stick / 12} ft bought — ${(100 * used / (sticks.length * stick)).toFixed(0)}% yield.` },
      { n: String(list.length), k: 'pieces to cut', d: `${patterns(sticks, stick).length} different ways to cut a stick.` },
      { n: screwBuy.toLocaleString('en-US'), k: '3" screws', d: `${screwTotal.toLocaleString('en-US')} at code minimum, plus 10%.` },
      { n: other.length ? String(other.length) : '0', k: 'not a 2x4', d: other.length ? other.map((h) => `${h.pick.label} over the ${h.o.name || h.st.label}.`).join(' ') : 'The whole wall comes out of one stock size.' },
    ],
  });

  const out = a.out || a.layout.replace(/\.json$/, '') + '-framing.html';
  writeFileSync(out, html);
  console.log(`${P.file.name} → ${out}`);
  console.log(`  ${sticks.length} sticks of ${feet(stick)} 2x4, ${list.length} pieces, `
    + `${(100 * used / (sticks.length * stick)).toFixed(1)}% yield`);
  console.log(`  ${screwTotal} screws at code minimum, buy ${screwBuy}`);
  for (const h of other) console.log(`  plus ${h.pick.label} @ ${inches(h.len)} over the ${h.o.name || h.st.label}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
