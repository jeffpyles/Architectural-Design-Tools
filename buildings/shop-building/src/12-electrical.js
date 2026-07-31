/* ============================================================
   Electrical rough-in: the boxes, what goes in them, and where they are.

   The rough-in is the part you cannot change afterwards. Once the interior
   face goes on, a box in the wrong place is a hole in the drywall and a box
   that is too small is a box you have to cut out. So this is editable the way
   the openings are: drag one across a wall, change what is in it, and the box
   fill and the circuit loads follow.

   Nothing here designs the circuits. It counts what is on them, says what the
   code minimum box is, and flags what is over — which is the part an owner
   can get wrong on their own and an electrician will charge to undo.
   ============================================================ */

/* ---- boxes ----
   `cuin` is the marked volume: NEC Table 314.16(A) for steel boxes, the number
   moulded into the back for plastic ones. `clamps` says the box has internal
   cable clamps, which cost one conductor's worth of volume however many cables
   come in. Plastic new-work boxes have none. */
const EBOX = {
  '1g18':  { label: '1-gang, 18 cu in',       cuin: 18.0, gangs: 1, clamps: false, w: 2.9, h: 4.0, d: 3.5 },
  '1g22':  { label: '1-gang deep, 22½ cu in', cuin: 22.5, gangs: 1, clamps: false, w: 2.9, h: 4.0, d: 3.75 },
  '2g32':  { label: '2-gang, 32 cu in',       cuin: 32.0, gangs: 2, clamps: false, w: 4.6, h: 4.0, d: 3.5 },
  '3g46':  { label: '3-gang, 46 cu in',       cuin: 46.0, gangs: 3, clamps: false, w: 6.6, h: 4.0, d: 3.5 },
  '4g62':  { label: '4-gang, 62 cu in',       cuin: 62.0, gangs: 4, clamps: false, w: 8.6, h: 4.0, d: 3.5 },
  'sq21':  { label: '4" square × 1½"',        cuin: 21.0, gangs: 2, clamps: true,  w: 4.0, h: 4.0, d: 1.5 },
  'sq30':  { label: '4" square × 2⅛"',        cuin: 30.3, gangs: 2, clamps: true,  w: 4.0, h: 4.0, d: 2.125 },
  'sq42':  { label: '4¹¹⁄₁₆" square × 2⅛"',   cuin: 42.0, gangs: 2, clamps: true,  w: 4.7, h: 4.7, d: 2.125 },
  'oct15': { label: '4" octagon × 1½"',       cuin: 15.5, gangs: 1, clamps: true,  w: 4.0, h: 4.0, d: 1.5, ceiling: true },
  'oct21': { label: '4" octagon × 2⅛"',       cuin: 21.5, gangs: 1, clamps: true,  w: 4.0, h: 4.0, d: 2.125, ceiling: true },
  'wp1g':  { label: 'Weatherproof 1-gang',    cuin: 18.0, gangs: 1, clamps: true,  w: 3.4, h: 4.6, d: 2.5, wet: true },
};

/* ---- what goes in them ----
   `yokes` is what the fill calculation counts: two conductor allowances per
   yoke, whatever the device is. `va` is what the circuit calculation counts —
   180 VA per general-purpose receptacle outlet is the NEC 220.14(I) figure for
   a non-dwelling, and a switch draws nothing. */
const EDEVICE = {
  duplex: { label: '20 A duplex',          yokes: 1, va: 180, volts: 120, wires: 0, kind: 'recep' },
  gfci:   { label: '20 A GFCI duplex',     yokes: 1, va: 180, volts: 120, wires: 0, kind: 'recep' },
  d15:    { label: '15 A duplex',          yokes: 1, va: 180, volts: 120, wires: 0, kind: 'recep' },
  r240:   { label: '20 A 240 V (NEMA 6-20)', yokes: 1, va: 3840, volts: 240, wires: 1, kind: 'recep' },
  r250:   { label: '50 A 240 V (NEMA 14-50)', yokes: 2, va: 12000, volts: 240, wires: 2, kind: 'recep' },
  sw1:    { label: 'Single-pole switch',   yokes: 1, va: 0, volts: 120, wires: 0, kind: 'switch' },
  sw3:    { label: '3-way switch',         yokes: 1, va: 0, volts: 120, wires: 1, kind: 'switch' },
  dim:    { label: 'Dimmer',               yokes: 1, va: 0, volts: 120, wires: 0, kind: 'switch' },
  data:   { label: 'Data / low voltage',   yokes: 1, va: 0, volts: 0,   wires: 0, kind: 'data' },
  blank:  { label: 'Blank plate',          yokes: 0, va: 0, volts: 0,   wires: 0, kind: 'blank' },
  light:  { label: "4' LED strip, 40 W",   yokes: 0, va: 40, volts: 120, wires: 0, kind: 'fixture' },
  hilight: { label: "8' LED high bay, 110 W", yokes: 0, va: 110, volts: 120, wires: 0, kind: 'fixture' },
};

/* Heights that mean something in a shop, so the panel can offer them by name
   rather than making you remember the number. */
const EHEIGHTS = [
  [48, `48" — above a bench`],
  [42, `42" — above a counter`],
  [46, `46" — switch height`],
  [18, `18" — low, under a bench`],
  [84, `84" — above a door`],
  [120, `120" — high, for a reel or a heater`],
];

/* Where a device sits in the world, and which way it faces. Walls carry `u`
   along the wall and `v` up from the slab; the ceiling carries `u` as x and
   `v` as z, because a ceiling box is located on a plan and a wall box is
   located on an elevation. */
function devicePlanes(spec) {
  const T = LUMBER[spec.studSize].d;
  const tr = trussGeometry(spec);
  const out = [];
  for (const wall of ['N', 'S', 'E', 'W']) {
    const e = wallExtent(wall, spec);
    out.push({ wall, axis: e.axis, e, T, kind: 'wall' });
  }
  out.push({ wall: 'C', kind: 'ceiling', y: tr.bcBot, T });
  return out;
}

function devicePos(d, spec) {
  const T = LUMBER[spec.studSize].d;
  if (d.wall === 'C') {
    const tr = trussGeometry(spec);
    return { x: d.u, y: tr.bcBot - 1.5, z: d.v, face: 'down' };
  }
  const e = wallExtent(d.wall, spec);
  /* Boxes sit proud of the stud face by the thickness of whatever finishes
     over them, which is why they have adjustable ears. */
  const v = e.c0 + (e.dir < 0 ? T - 1 : 1);
  return e.axis === 'x'
    ? { x: d.u, y: d.v, z: v, face: d.wall }
    : { x: v, y: d.v, z: d.u, face: d.wall };
}

/* ---- the rough-in the tool starts you with ----
   A perimeter receptacle circuit at bench height, lights on the bottom chords
   with a switch at each man door, and the opener. It is a starting point, not
   a design — the point of the panel is that you take it over. */
function defaultDevices(spec, openings) {
  const out = [];
  let n = 0;
  const put = (d) => { out.push({ id: `e${n++}`, feeds: 2, ...d }); return out[out.length - 1]; };
  const W = spec.width, D = spec.depth;
  const tr = trussGeometry(spec);

  /* the sub-panel, on the east wall by the man door — shortest feeder home */
  put({ wall: 'E', u: 96, v: 54, box: 'panel', items: [], ckt: 0, panel: true });

  /* perimeter receptacles at bench height, skipping anything behind an opening */
  const RECEP_V = 48;
  let ckt = 1, onCkt = 0;
  for (const wall of ['N', 'S', 'W', 'E']) {
    const e = wallExtent(wall, spec);
    for (let u = e.u0 + 36; u < e.u1 - 24; u += 96) {
      const blocked = openingsOn(wall, openings).some((o) => {
        const st = stockFor(o);
        return u > o.off - 8 && u < o.off + st.w + 8 && (o.head - st.h) < RECEP_V + 8;
      });
      if (blocked) continue;
      /* Thirteen 180 VA outlets is a 20 A circuit's worth, so start another. */
      if (onCkt >= 10) { ckt++; onCkt = 0; }
      onCkt++;
      put({ wall, u, v: RECEP_V, box: '1g18', items: ['duplex'], ckt });
    }
  }

  /* lights on the bottom chords, three rows */
  const lightCkt = ckt + 1;
  for (const z of [D / 4, D / 2, D * 3 / 4]) {
    for (let x = 60; x < W - 24; x += 72) {
      put({ wall: 'C', u: x, v: z, box: 'oct15', items: ['light'], ckt: lightCkt });
    }
  }
  /* A switch beside every man door — the door you walk in through, not a
     window. Nudged clear of anything else on that wall, because a box drawn
     inside an opening is a box floating in the daylight. */
  for (const o of openings) {
    if (o.kind !== 'man') continue;
    const st = stockFor(o);
    const e = wallExtent(o.wall, spec);
    const u = clearOnWall(o.wall, [o.off + st.w + 8, o.off - 10], 46, spec, openings, e);
    if (u != null) put({ wall: o.wall, u, v: 46, box: '1g18', items: ['sw3'], ckt: lightCkt });
  }
  /* the opener, on its own so a stuck door does not take the lights out */
  put({ wall: 'C', u: W / 2, v: D - 120, box: 'oct15', items: ['duplex'],
    ckt: lightCkt + 1, feeds: 1 });
  void tr;
  return out;
}

/* The first of the offered spots that is on the wall and not inside an
   opening. Returns null if none of them are, which is better than putting a
   box in a window. */
function clearOnWall(wall, tries, v, spec, openings, e) {
  const ext = e || wallExtent(wall, spec);
  for (const u of tries) {
    if (u < ext.u0 + 3 || u > ext.u1 - 3) continue;
    const hit = openingsOn(wall, openings).some((o) => {
      const st = stockFor(o);
      return u > o.off - 3 && u < o.off + st.w + 3 && v > o.head - st.h - 3 && v < o.head + 3;
    });
    if (!hit) return u;
  }
  return null;
}

/* ---- circuits ----
   A circuit is a thing you name and a thing boxes belong to, not a number
   somebody types into every box and hopes matches. What it is called is worth
   carrying: "welder" and "compressor" are the two people go looking for at the
   panel, and neither is obvious from a load figure. */
function autoCircuitName(n, devs) {
  const on = devs.filter((d) => !d.panel && (d.ckt || 1) === n);
  const items = on.flatMap((d) => (d.items || []).map((k) => EDEVICE[k])).filter(Boolean);
  if (!items.length) return 'Spare';
  if (items.some((i) => i.volts === 240)) return '240 V';
  const fixtures = items.filter((i) => i.kind === 'fixture').length;
  const receps = items.filter((i) => i.kind === 'recep').length;
  if (fixtures > receps) return 'Lighting';
  if (receps === 1) return 'Dedicated outlet';
  return 'Receptacles';
}
function defaultCircuits(devs) {
  const ns = [...new Set(devs.filter((d) => !d.panel).map((d) => d.ckt || 1))]
    .sort((a, b) => a - b);
  return (ns.length ? ns : [1]).map((n) => ({ n, name: autoCircuitName(n, devs) }));
}
function circuitList(devs, override) {
  if (override && override.length) return override.slice().sort((a, b) => a.n - b.n);
  return defaultCircuits(devs);
}
function currentCircuits(spec) {
  return circuitList(currentDevices(spec), state.extra && state.extra.circuits);
}
function ownCircuits(spec) {
  if (!state.extra) state.extra = {};
  if (!state.extra.circuits || !state.extra.circuits.length) {
    state.extra.circuits = defaultCircuits(currentDevices(spec)).map((c) => ({ ...c }));
  }
  return state.extra.circuits;
}
function addCircuit(spec, name) {
  const list = ownCircuits(spec);
  ownDevices(spec);                         // adding one takes the list over too
  const n = Math.max(0, ...list.map((c) => c.n)) + 1;
  list.push({ n, name: name || 'Spare' });
  scheduleRebuild();
  return n;
}
/* Deleting a circuit has to say where its boxes went, and the honest answer is
   the lowest circuit that is left. Refusing to delete the last one is the only
   way a box always has somewhere to be. */
function removeCircuit(spec, n) {
  const list = ownCircuits(spec);
  if (list.length <= 1) return { ok: false, moved: 0, to: n };
  const i = list.findIndex((c) => c.n === n);
  if (i < 0) return { ok: false, moved: 0, to: n };
  list.splice(i, 1);
  const to = Math.min(...list.map((c) => c.n));
  let moved = 0;
  for (const d of ownDevices(spec)) {
    if (!d.panel && (d.ckt || 1) === n) { d.ckt = to; moved++; }
  }
  scheduleRebuild();
  return { ok: true, moved, to };
}
function renameCircuit(spec, n, name) {
  const c = ownCircuits(spec).find((x) => x.n === n);
  if (c) { c.name = name.slice(0, 40); scheduleRebuild(); }
}
function circuitName(n, circuits) {
  const c = (circuits || []).find((x) => x.n === n);
  return c ? c.name : '';
}

/* The list in play: whatever has been edited, or the rough-in above. Keeping
   the generated one until somebody touches it is what stops every share code
   carrying thirty boxes that nobody chose. */
function deviceList(spec, openings, override) {
  return override && override.length ? override : defaultDevices(spec, openings);
}

function deviceLabel(d) {
  if (d.panel) return 'Sub-panel';
  if (!d.items || !d.items.length) return 'Empty box';
  const counts = new Map();
  for (const it of d.items) counts.set(it, (counts.get(it) || 0) + 1);
  return [...counts.entries()]
    .map(([k, c]) => (c > 1 ? `${c} × ` : '') + ((EDEVICE[k] || {}).label || k))
    .join(' + ');
}

/* ---- editing ----
   The list only becomes real when somebody touches it. Until then the tool is
   showing its own rough-in and there is nothing to carry in a share code. */
function currentDevices(spec) {
  return deviceList(spec, state.openings, state.extra && state.extra.devices);
}
function ownDevices(spec) {
  if (!state.extra) state.extra = {};
  if (!state.extra.devices || !state.extra.devices.length) {
    state.extra.devices = deviceList(spec, state.openings, null).map((d) => ({ ...d,
      items: (d.items || []).slice() }));
  }
  return state.extra.devices;
}
function moveDevice(d, u, v) {
  const spec = state.spec;
  const list = ownDevices(spec);
  const live = list.find((x) => x.id === d.id) || d;
  if (live.wall === 'C') {
    live.u = clampTo(u, 6, spec.width - 6);
    live.v = clampTo(v, 6, spec.depth - 6);
  } else {
    const e = wallExtent(live.wall, spec);
    const box = EBOX[live.box] || { w: 4, h: 4 };
    live.u = clampTo(u, e.u0 + box.w / 2, e.u1 - box.w / 2);
    live.v = clampTo(v, box.h / 2 + 1, spec.wallHeight - box.h / 2 - 4);
  }
  live.u = Math.round(live.u * 4) / 4;
  live.v = Math.round(live.v * 4) / 4;
  state.selected = live.id;
  if (typeof showItemReadout === 'function') {
    showItemReadout({ id: live.id, readout: () => deviceReadout(live, spec) });
  }
  scheduleRebuild();
}
function clampTo(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function deviceReadout(d, spec) {
  if (d.panel) {
    return { title: `${spec.service} A sub-panel`,
      body: `${WALLS[d.wall].label} wall  ·  ${fmtFt(d.u)} from the ${WALLS[d.wall].from}  ·  `
        + `${fmtFt(d.v)} to the middle of the can` };
  }
  const f = boxFill(d);
  const where = d.wall === 'C'
    ? `Ceiling  ·  ${fmtFt(d.u)} from the west wall  ·  ${fmtFt(d.v)} from the north wall`
    : `${WALLS[d.wall].label} wall  ·  ${fmtFt(d.u)} from the ${WALLS[d.wall].from}  ·  `
      + `${fmtFt(d.v)} above the slab`;
  return {
    title: deviceLabel(d),
    body: `${where}  ·  ${f.box.label}  ·  `
      + `fill ${fmtN(f.need, 1)} of ${fmtN(f.have, 1)} cu in${f.ok ? '' : ' — OVER'}  ·  `
      + `circuit ${d.ckt || 1}`,
  };
}

/* ---- the share code ----
   Packed positionally and rounded to a quarter inch, because a code that
   carries thirty boxes has to stay short enough to paste into an email. */
const DEV_KEYS = Object.keys(EDEVICE);
/* The whole electrical layer in one value. Kept as an object rather than a
   bare array so the next thing that needs carrying has somewhere to go — and
   an array still decodes, because that is what the first codes carried. */
function packElectrical(extra) {
  const devs = extra && extra.devices;
  const ckts = extra && extra.circuits;
  if ((!devs || !devs.length) && (!ckts || !ckts.length)) return null;
  const out = {};
  if (devs && devs.length) out.d = packDevices(devs);
  if (ckts && ckts.length) out.c = ckts.map((c) => [c.n, c.name || '']);
  return out;
}
function unpackElectrical(x) {
  if (Array.isArray(x)) return { devices: unpackDevices(x) };
  if (!x || typeof x !== 'object') return {};
  return {
    devices: x.d ? unpackDevices(x.d) : null,
    circuits: Array.isArray(x.c) ? x.c.map((a) => ({ n: a[0], name: a[1] || '' })) : null,
  };
}

function packDevices(list) {
  return list.map((d) => [
    d.wall, Math.round(d.u * 4) / 4, Math.round(d.v * 4) / 4,
    d.panel ? '' : d.box,
    (d.items || []).map((k) => DEV_KEYS.indexOf(k)).filter((i) => i >= 0).join('.'),
    d.ckt || 0, d.feeds || 2,
  ]);
}
function unpackDevices(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map((a, i) => ({
    id: `d${i}`, wall: a[0], u: a[1], v: a[2],
    ...(a[3] ? { box: a[3] } : { panel: true, box: 'panel' }),
    items: String(a[4] || '').split('.').filter((x) => x !== '')
      .map((n) => DEV_KEYS[Number(n)]).filter(Boolean),
    ckt: a[5] || 0, feeds: a[6] || 2,
  }));
}
