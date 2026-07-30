/* ============================================================
   A small drafting kit: enough of a drawing board to put a real sheet on
   paper. Scale, a title block, dimension strings, hatches, leaders, symbols.

   Everything here works in POINTS on the page — 72 to the inch — because that
   is the only unit where a line weight means something. Model coordinates are
   inches, as they are everywhere else, and a Sheet knows the one number that
   connects them: the drawing scale.

   Why not print the WebGL view? Because a plan is not a picture. It is a
   flattened, annotated, dimensioned statement of where things go, drawn at a
   stated scale so somebody can measure it. The 3D model is for deciding; this
   is for building from.
   ============================================================ */

const PT = 72;                                    // points per inch of paper
const SVG_NS = 'http://www.w3.org/2000/svg';

/* Architectural scales, as page inches per model inch. */
const SCALES = [
  { k: '1/16', label: '1/16" = 1\'-0"', f: 1 / 192 },
  { k: '1/8', label: '1/8" = 1\'-0"', f: 1 / 96 },
  { k: '3/16', label: '3/16" = 1\'-0"', f: 1 / 64 },
  { k: '1/4', label: '1/4" = 1\'-0"', f: 1 / 48 },
  { k: '3/8', label: '3/8" = 1\'-0"', f: 1 / 32 },
  { k: '1/2', label: '1/2" = 1\'-0"', f: 1 / 24 },
  { k: '3/4', label: '3/4" = 1\'-0"', f: 1 / 16 },
  { k: '1', label: '1" = 1\'-0"', f: 1 / 12 },
  { k: '1.5', label: '1½" = 1\'-0"', f: 1 / 8 },
  { k: '3', label: '3" = 1\'-0"', f: 1 / 4 },
];

/* Line weights, in points. A drawing reads by weight before it reads by
   anything else: what is cut heaviest, what is seen lighter, what is beyond
   or below lighter still. */
const LW = { cut: 1.5, heavy: 1.1, medium: 0.7, light: 0.45, thin: 0.3, dim: 0.35 };

const PAGES = {
  letter: { w: 11, h: 8.5, label: 'Letter, landscape' },
  tabloid: { w: 17, h: 11, label: 'Tabloid, landscape' },
  a4: { w: 11.69, h: 8.27, label: 'A4, landscape' },
  a3: { w: 16.54, h: 11.69, label: 'A3, landscape' },
};

/* ------------------------------------------------------------------ */

function Sheet(opts) {
  const page = PAGES[opts.page || 'letter'];
  const W = page.w * PT, H = page.h * PT;
  const margin = (opts.margin == null ? 0.4 : opts.margin) * PT;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${fx(W)} ${fx(H)}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('class', 'sheet');
  svg.setAttribute('role', 'img');
  if (opts.title) svg.setAttribute('aria-label', opts.title);

  const root = g(svg);
  const s = {
    svg, page, W, H, margin, root,
    id: opts.id, title: opts.title, number: opts.number,
    scale: null, origin: [0, 0],
    keynotes: [], sheetNotes: opts.notes || [],
  };

  /* --- primitives, all in points on the page --- */
  const add = (name, attrs, parent) => {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) n.setAttribute(k, typeof v === 'number' ? fx(v) : v);
    }
    (parent || s.layer || root).append(n);
    return n;
  };
  s.add = add;
  s.g = (cls) => { const n = g(s.layer || root); if (cls) n.setAttribute('class', cls); return n; };
  s.layerOn = (n) => { s.layer = n; };
  s.layerOff = () => { s.layer = null; };

  s.line = (x1, y1, x2, y2, w, o) => add('line', {
    x1, y1, x2, y2, stroke: (o && o.stroke) || 'var(--ink)',
    'stroke-width': w || LW.medium,
    'stroke-dasharray': o && o.dash, 'stroke-linecap': (o && o.cap) || 'butt',
  });
  s.rect = (x, y, w, h, lw, o) => add('rect', {
    x, y, width: w, height: h,
    fill: (o && o.fill) || 'none', stroke: (o && o.stroke) || 'var(--ink)',
    'stroke-width': lw == null ? LW.medium : lw, 'stroke-dasharray': o && o.dash,
  });
  s.circle = (x, y, r, lw, o) => add('circle', {
    cx: x, cy: y, r, fill: (o && o.fill) || 'none',
    stroke: (o && o.stroke) || 'var(--ink)', 'stroke-width': lw == null ? LW.light : lw,
  });
  s.poly = (pts, lw, o) => add('polygon', {
    points: pts.map((p) => `${fx(p[0])},${fx(p[1])}`).join(' '),
    fill: (o && o.fill) || 'none', stroke: (o && o.stroke) || 'var(--ink)',
    'stroke-width': lw == null ? LW.medium : lw, 'stroke-dasharray': o && o.dash,
  });
  s.path = (d, lw, o) => add('path', {
    d, fill: (o && o.fill) || 'none', stroke: (o && o.stroke) || 'var(--ink)',
    'stroke-width': lw == null ? LW.medium : lw, 'stroke-dasharray': o && o.dash,
  });
  /* Text sizes are in points, so 7 is 7-point type and reads on paper. */
  s.text = (x, y, str, o) => {
    const n = add('text', {
      x, y, 'text-anchor': (o && o.anchor) || 'middle',
      'dominant-baseline': (o && o.baseline) || 'alphabetic',
      fill: (o && o.fill) || 'var(--ink)',
      'font-size': (o && o.size) || 6.5,
      'font-family': (o && o.mono) ? 'var(--f-mono)' : 'var(--f-display)',
      'font-weight': (o && o.weight) || 400,
      'letter-spacing': (o && o.track) || null,
      transform: (o && o.rotate) ? `rotate(${fx(o.rotate)} ${fx(x)} ${fx(y)})` : null,
    });
    n.textContent = str;
    return n;
  };

  /* --- model space ---
     `at(x0, y0, w, h, scale)` claims a rectangle of the page for a drawing at
     a stated scale and sets the transform for it. Model +X runs right; model
     +Z (depth) runs DOWN the page, which is what plan north-up means. */
  s.frame = (x0, y0, scaleKey, model, opts2) => {
    const sc = SCALES.find((z) => z.k === scaleKey) || SCALES[3];
    s.scale = sc;
    const f = sc.f * PT;                       // points per model inch
    const flip = (opts2 && opts2.flipY) ? -1 : 1;
    s.mx = (v) => x0 + (v - model[0]) * f;
    s.my = (v) => flip === 1 ? y0 + (v - model[1]) * f : y0 - (v - model[1]) * f;
    s.mlen = (v) => v * f;
    s.drawn = { x0, y0, w: (model[2] - model[0]) * f, h: (model[3] - model[1]) * f, f };
    return s;
  };

  /* The largest real architectural scale at which a model-inches box still
     fits a page-points box. A drawing at a scale nobody has a rule for is
     worse than a smaller drawing, so it picks from the list rather than
     solving for a fit. */
  s.pickScale = (modelW, modelH, availW, availH, max) => {
    const cap = max ? SCALES.findIndex((z) => z.k === max) : SCALES.length - 1;
    for (let i = cap; i >= 0; i--) {
      const f = SCALES[i].f * PT;
      if (modelW * f <= availW && modelH * f <= availH) return SCALES[i].k;
    }
    return SCALES[0].k;
  };

  /* --- dimension strings ---
     A tick, an extension line, and the number above the line. Architectural
     ticks rather than arrowheads, because that is what a building drawing
     uses and because a 45° tick is legible at 6 point where an arrow is not. */
  const TICK = 3.2;
  s.dimLine = (x1, y1, x2, y2, label, o) => {
    const w = LW.dim, col = 'var(--ink-2)';
    s.line(x1, y1, x2, y2, w, { stroke: col });
    const a = Math.atan2(y2 - y1, x2 - x1);
    const tx = Math.cos(a + Math.PI / 4) * TICK, ty = Math.sin(a + Math.PI / 4) * TICK;
    s.line(x1 - tx, y1 - ty, x1 + tx, y1 + ty, w, { stroke: col });
    s.line(x2 - tx, y2 - ty, x2 + tx, y2 + ty, w, { stroke: col });
    if (label) {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const deg = a / Math.PI * 180;
      const rot = deg > 90 || deg < -90 ? deg + 180 : deg;
      const off = (o && o.below) ? 6.5 : -2.6;
      s.text(cx, cy + off, label, { size: 6, mono: true, rotate: rot, fill: col,
        anchor: 'middle' });
    }
  };
  /* Horizontal string in model X between two model X values, offset from a
     model Y. `ext` draws the witness lines back to the thing measured. */
  s.dimH = (u0, u1, atY, label, extTo) => {
    const y = s.my(atY);
    if (extTo != null) {
      const ye = s.my(extTo);
      for (const u of [u0, u1]) s.line(s.mx(u), ye, s.mx(u), y + Math.sign(y - ye) * 2.5, LW.thin, { stroke: 'var(--ink-3)' });
    }
    s.dimLine(s.mx(u0), y, s.mx(u1), y, label == null ? fmtFt(u1 - u0) : label);
  };
  s.dimV = (v0, v1, atX, label, extTo) => {
    const x = s.mx(atX);
    if (extTo != null) {
      const xe = s.mx(extTo);
      for (const v of [v0, v1]) s.line(xe, s.my(v), x + Math.sign(x - xe) * 2.5, s.my(v), LW.thin, { stroke: 'var(--ink-3)' });
    }
    s.dimLine(x, s.my(v0), x, s.my(v1), label == null ? fmtFt(v1 - v0) : label);
  };
  /* A string of them, from a run of model coordinates. */
  s.dimChainH = (stops, atY, extTo) => {
    for (let i = 1; i < stops.length; i++) s.dimH(stops[i - 1], stops[i], atY, null, extTo);
  };
  s.dimChainV = (stops, atX, extTo) => {
    for (let i = 1; i < stops.length; i++) s.dimV(stops[i - 1], stops[i], atX, null, extTo);
  };

  /* --- leaders and keynotes ---
     A keynote is a numbered hexagon on the drawing and a numbered line in a
     list, which is how you say something long about something small. */
  s.keynote = (text) => {
    const n = s.keynotes.indexOf(text);
    if (n >= 0) return n + 1;
    s.keynotes.push(text);
    return s.keynotes.length;
  };
  s.tagAt = (px, py, n) => {
    const r = 6.2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 - 90) * Math.PI / 180;
      pts.push([px + Math.cos(a) * r, py + Math.sin(a) * r]);
    }
    s.poly(pts, LW.light, { fill: 'var(--surface)' });
    s.text(px, py + 2.2, String(n), { size: 6.5, weight: 700 });
  };
  /* Point at something, elbow, then the tag. */
  s.leader = (mxv, myv, dx, dy, text) => {
    const x0 = s.mx(mxv), y0 = s.my(myv);
    const x1 = x0 + dx, y1 = y0 + dy;
    const x2 = x1 + Math.sign(dx || 1) * 9;
    s.line(x0, y0, x1, y1, LW.thin, { stroke: 'var(--ink-2)' });
    s.line(x1, y1, x2, y1, LW.thin, { stroke: 'var(--ink-2)' });
    s.circle(x0, y0, 1.1, 0, { fill: 'var(--ink-2)' });
    s.tagAt(x2 + Math.sign(dx || 1) * 6.6, y1, s.keynote(text));
  };
  /* Or just say it, where it is short enough to fit. `width` wraps it, which
     is the difference between a note beside a detail and a line of type
     running off the edge of the sheet. */
  s.callout = (mxv, myv, dx, dy, text, o) => {
    const opt = o || {};
    const x0 = s.mx(mxv), y0 = s.my(myv);
    const x1 = x0 + dx, y1 = y0 + dy;
    s.line(x0, y0, x1, y1, LW.thin, { stroke: 'var(--ink-2)' });
    s.circle(x0, y0, 1.1, 0, { fill: 'var(--ink-2)' });
    const right = dx >= 0;
    s.line(x1, y1, x1 + (right ? 8 : -8), y1, LW.thin, { stroke: 'var(--ink-2)' });
    const size = opt.size || 5.8;
    const lines = opt.width ? wrapText(text, opt.width, size) : [text];
    /* Centre the block on the elbow, so a two-line note does not drift down
       away from the thing it is pointing at. */
    const top = y1 + 2 - (lines.length - 1) * (size * 1.28) / 2;
    lines.forEach((ln, i) => s.text(x1 + (right ? 10 : -10), top + i * size * 1.28, ln,
      { anchor: right ? 'start' : 'end', fill: 'var(--ink-2)', ...opt, size }));
  };

  /* A window on the page. Everything drawn while it is on is cut to it, which
     is what lets a section be broken: two bands of the same drawing, each
     showing only its own slice, with the wall running off the edge of both
     rather than through the gap. */
  s.clipTo = (x, y, w, h) => {
    const id = `c${Math.random().toString(36).slice(2, 8)}`;
    const cp = document.createElementNS(SVG_NS, 'clipPath');
    cp.setAttribute('id', id);
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', fx(x)); r.setAttribute('y', fx(y));
    r.setAttribute('width', fx(w)); r.setAttribute('height', fx(h));
    cp.append(r);
    svg.append(cp);
    const grp = g(root);
    grp.setAttribute('clip-path', `url(#${id})`);
    s.layer = grp;
    return grp;
  };

  /* --- hatches ---
     Drawn as real lines rather than a <pattern>, because a pattern scales with
     the element and these have to stay at a paper spacing. */
  s.hatch = (x, y, w, h, kind) => {
    const clipId = `h${Math.random().toString(36).slice(2, 8)}`;
    const cp = document.createElementNS(SVG_NS, 'clipPath');
    cp.setAttribute('id', clipId);
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', fx(x)); r.setAttribute('y', fx(y));
    r.setAttribute('width', fx(w)); r.setAttribute('height', fx(h));
    cp.append(r);
    svg.append(cp);
    const grp = g(s.layer || root);
    grp.setAttribute('clip-path', `url(#${clipId})`);
    const put = (x1, y1, x2, y2, lw) => {
      const n = document.createElementNS(SVG_NS, 'line');
      n.setAttribute('x1', fx(x1)); n.setAttribute('y1', fx(y1));
      n.setAttribute('x2', fx(x2)); n.setAttribute('y2', fx(y2));
      n.setAttribute('stroke', 'var(--ink-3)');
      n.setAttribute('stroke-width', fx(lw || LW.thin));
      grp.append(n);
    };
    if (kind === 'earth') {
      /* Undisturbed earth: broken diagonals. */
      for (let i = -h; i < w; i += 5) {
        put(x + i, y + h, x + i + h, y, LW.thin);
        put(x + i + 2.2, y + h, x + i + 2.2 + h * 0.35, y + h * 0.65, LW.thin);
      }
    } else if (kind === 'gravel') {
      for (let yy = y + 2; yy < y + h; yy += 3.4) {
        for (let xx = x + ((yy / 3.4 | 0) % 2 ? 2 : 4); xx < x + w; xx += 5) {
          put(xx, yy, xx + 1.6, yy - 1.1, 0.45);
          put(xx + 1.6, yy - 1.1, xx + 2.6, yy + 0.2, 0.45);
        }
      }
    } else if (kind === 'concrete') {
      /* Sand-and-aggregate: stipple with the odd triangle. */
      let seed = 7;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const n = Math.max(8, Math.round(w * h / 26));
      for (let i = 0; i < n; i++) {
        const px = x + rnd() * w, py = y + rnd() * h;
        if (i % 4 === 0) {
          put(px, py, px + 1.7, py + 0.5, 0.5);
          put(px + 1.7, py + 0.5, px + 0.7, py + 1.5, 0.5);
          put(px + 0.7, py + 1.5, px, py, 0.5);
        } else {
          put(px, py, px + 0.5, py + 0.5, 0.55);
        }
      }
    } else if (kind === 'wood') {
      for (let i = -h; i < w; i += 3.2) put(x + i, y + h, x + i + h, y, 0.3);
    } else if (kind === 'insul') {
      for (let yy = y + 1.6; yy < y + h; yy += 3.2) {
        let d = '';
        for (let xx = x; xx < x + w; xx += 3) d += `${d ? 'L' : 'M'}${fx(xx)},${fx(yy)}L${fx(xx + 1.5)},${fx(yy + 1.5)}`;
        const n = document.createElementNS(SVG_NS, 'path');
        n.setAttribute('d', d); n.setAttribute('fill', 'none');
        n.setAttribute('stroke', 'var(--ink-3)'); n.setAttribute('stroke-width', 0.35);
        grp.append(n);
      }
    }
    return grp;
  };

  /* --- drawing title, under each view --- */
  s.viewTitle = (x, y, name, scaleKey, mark) => {
    const sc = SCALES.find((z) => z.k === scaleKey);
    const t = s.text(x, y, name.toUpperCase(),
      { size: 8, anchor: 'start', weight: 700, track: '0.06em' });
    const wGuess = name.length * 4.6 + 12;
    if (mark) {
      s.circle(x - 9, y - 2.6, 6.4, LW.medium);
      s.text(x - 9, y - 0.4, mark, { size: 6.5, weight: 700 });
    }
    s.line(x, y + 2.6, x + wGuess, y + 2.6, LW.heavy);
    if (sc) s.text(x + wGuess + 6, y, sc.label, { size: 6, anchor: 'start', fill: 'var(--ink-3)' });
    return t;
  };

  /* --- north arrow --- */
  s.north = (x, y, r) => {
    r = r || 13;
    s.circle(x, y, r, LW.light, { stroke: 'var(--ink-3)' });
    s.poly([[x, y - r + 1.5], [x + r * 0.32, y + r * 0.45], [x, y + r * 0.15],
      [x - r * 0.32, y + r * 0.45]], LW.light, { fill: 'var(--ink)' });
    s.text(x, y - r - 3, 'N', { size: 7, weight: 700 });
  };

  return s;
}

/* Rounded to a thousandth of a point: enough for a 2400 dpi imagesetter and
   short enough that a sheet is not half megabytes of decimals. */
function fx(v) { return Math.round(v * 1000) / 1000; }
function g(parent) {
  const n = document.createElementNS(SVG_NS, 'g');
  parent.append(n);
  return n;
}

/* ---- the title block ----
   Bottom strip: who, what, which sheet, at what scale, and the line that
   matters most — that this is not a construction document. */
function titleBlock(s, info) {
  const h = 46, y = s.H - s.margin - h, x = s.margin, w = s.W - s.margin * 2;
  s.layerOff();
  s.rect(x, y, w, h, LW.heavy);
  const colX = [x, x + w * 0.44, x + w * 0.62, x + w * 0.78, x + w * 0.90, x + w];
  for (let i = 1; i < colX.length - 1; i++) s.line(colX[i], y, colX[i], y + h, LW.light);

  const cell = (i, label, value, o) => {
    const cx = colX[i] + 6;
    s.text(cx, y + 12, label.toUpperCase(),
      { size: 5.2, anchor: 'start', fill: 'var(--ink-3)', track: '0.08em' });
    s.text(cx, y + 26, value,
      { size: (o && o.size) || 8.5, anchor: 'start', weight: (o && o.weight) || 400,
        mono: o && o.mono });
  };
  s.text(x + 6, y + 14, info.project.toUpperCase(),
    { size: 10, anchor: 'start', weight: 700, track: '0.04em' });
  s.text(x + 6, y + 26, info.subtitle, { size: 6.6, anchor: 'start', fill: 'var(--ink-2)' });
  s.text(x + 6, y + 39, info.warning, { size: 6, anchor: 'start', fill: 'var(--keel)' });
  cell(1, 'Sheet', info.title, { size: 8.5, weight: 700 });
  cell(2, 'Scale', info.scale, { mono: true });
  cell(3, 'Issued', info.date, { mono: true });
  cell(4, 'Sheet no.', info.number, { size: 11, weight: 700, mono: true });
  return { top: y };
}

/* ---- a numbered keynote list, drawn wherever there is room ---- */
function keynoteList(s, x, y, w, heading) {
  if (!s.keynotes.length) return y;
  s.text(x, y, (heading || 'Keynotes').toUpperCase(),
    { size: 7, anchor: 'start', weight: 700, track: '0.06em' });
  s.line(x, y + 2.8, x + w, y + 2.8, LW.medium);
  let cy = y + 15;
  s.keynotes.forEach((t, i) => {
    s.tagAt(x + 6.5, cy - 2.2, i + 1);
    for (const ln of wrapText(t, w - 18, 5.9)) {
      s.text(x + 16, cy, ln, { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });
      cy += 7.4;
    }
    cy += 3.4;
  });
  return cy;
}

/* Rough wrap: the metric is the average width of the display face at this
   size, which is close enough for a note column and needs no layout pass. */
function wrapText(str, width, size) {
  const per = size * 0.485;
  const max = Math.max(8, Math.floor(width / per));
  const out = [];
  let line = '';
  for (const word of String(str).split(/\s+/)) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length <= max) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/* A block of prose on a sheet — general notes, a schedule preamble. */
function sheetNotes(s, x, y, w, heading, lines) {
  s.text(x, y, heading.toUpperCase(), { size: 7, anchor: 'start', weight: 700, track: '0.06em' });
  s.line(x, y + 2.8, x + w, y + 2.8, LW.medium);
  let cy = y + 14;
  lines.forEach((t, i) => {
    const num = `${i + 1}.`;
    s.text(x, cy, num, { size: 5.9, anchor: 'start', fill: 'var(--ink-3)', mono: true });
    for (const ln of wrapText(t, w - 14, 5.9)) {
      s.text(x + 13, cy, ln, { size: 5.9, anchor: 'start', fill: 'var(--ink-2)' });
      cy += 7.4;
    }
    cy += 3;
  });
  return cy;
}

/* A schedule: a small table drawn on the sheet rather than in the page. */
function schedule(s, x, y, w, heading, cols, rows) {
  s.text(x, y, heading.toUpperCase(), { size: 7, anchor: 'start', weight: 700, track: '0.06em' });
  let cy = y + 5;
  const rowH = 11.5;
  const widths = cols.map((c) => c.w);
  const total = widths.reduce((a, b) => a + b, 0);
  const px = widths.map((v) => v / total * w);
  const xs = px.reduce((a, v) => (a.push(a[a.length - 1] + v), a), [x]);

  s.rect(x, cy, w, rowH, LW.medium, { fill: 'var(--surface-2)' });
  cols.forEach((c, i) => s.text(xs[i] + 4, cy + 8, c.h.toUpperCase(),
    { size: 5.4, anchor: 'start', weight: 700, track: '0.05em', fill: 'var(--ink-2)' }));
  cy += rowH;
  for (const r of rows) {
    s.line(x, cy + rowH, x + w, cy + rowH, LW.thin, { stroke: 'var(--rule)' });
    r.forEach((v, i) => s.text(xs[i] + 4, cy + 8, String(v),
      { size: 6, anchor: 'start', mono: cols[i].mono }));
    cy += rowH;
  }
  s.rect(x, y + 5, w, cy - y - 5, LW.medium);
  for (let i = 1; i < xs.length - 1; i++) s.line(xs[i], y + 5, xs[i], cy, LW.thin, { stroke: 'var(--rule)' });
  return cy;
}

/* ---- the Plans panel ----
   Generic: a building declares PLANS as a list of sheet builders and this
   draws them, one page each, with a print button. */
/* Printing.

   The sheets are drawn inside a panel that is a scroller inside a grid inside
   the app, and a nested scroller does not paginate: hiding its siblings with
   `visibility` leaves their boxes in the flow and you get a stack of blank
   pages. So the sheets are lifted out to a container hanging straight off
   <body> for the duration of the print and put back afterwards. One listener,
   registered once. */
let printWired = false;
function wirePrint() {
  if (printWired) return;
  printWired = true;
  let home = null, marker = null;
  const lift = () => {
    const sheets = document.getElementById('sheets');
    if (!sheets) return;
    let rootEl = document.getElementById('printRoot');
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = 'printRoot';
      document.body.append(rootEl);
    }
    home = sheets.parentNode;
    marker = document.createComment('sheets');
    home.insertBefore(marker, sheets);
    rootEl.append(sheets);
    document.documentElement.classList.add('printing');
  };
  const drop = () => {
    document.documentElement.classList.remove('printing');
    const sheets = document.getElementById('sheets');
    if (sheets && marker && marker.parentNode) {
      marker.parentNode.insertBefore(sheets, marker);
      marker.remove();
      marker = null; home = null;
    }
  };
  window.addEventListener('beforeprint', lift);
  window.addEventListener('afterprint', drop);
  /* Safari and anything driving the printer through the media query rather
     than the events get the same treatment. */
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    const onChange = (e) => (e.matches ? lift() : drop());
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
}

function renderPlans(panelId, sheets, info) {
  const p = $('#panel-' + panelId);
  p.textContent = '';
  wirePrint();
  const page = PAGES[state.plansPage || 'letter'];

  /* @page cannot be set from a stylesheet that does not know the paper, so it
     is written here. Margin zero because the sheet draws its own — the border
     round a drawing is part of the drawing. */
  let ps = document.getElementById('pageStyle');
  if (!ps) {
    ps = document.createElement('style');
    ps.id = 'pageStyle';
    document.head.append(ps);
  }
  ps.textContent = `@page { size: ${page.w}in ${page.h}in; margin: 0 }`;

  p.append(note('Sheets drawn to scale from the model, not pictures of it. Print at 100% — '
    + `no "fit to page" — on ${page.label.toLowerCase()}, and a scale rule will read them. `
    + 'Everything on them follows whatever the model currently says, so a sheet is never out of '
    + 'step with the tool that made it.'));

  const bar = el('div', 'btn-row');
  const printer = el('button', 'btn', 'Print all sheets');
  printer.addEventListener('click', () => window.print());
  bar.append(printer);

  const pageSel = el('div', 'field');
  pageSel.style.cssText = 'margin:0;min-width:150px';
  const lab = el('label', null, 'Paper'); lab.htmlFor = 'plansPage';
  const sel = document.createElement('select');
  sel.id = 'plansPage';
  for (const [k, v] of Object.entries(PAGES)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = v.label;
    if ((state.plansPage || 'letter') === k) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => { state.plansPage = sel.value; renderPanels(); });
  pageSel.append(lab, sel);
  bar.append(pageSel);
  p.append(bar);

  const wrap = el('div', 'sheets');
  wrap.id = 'sheets';
  for (const def of sheets) {
    const s = Sheet({ page: state.plansPage || 'letter', id: def.id, title: def.title,
      number: def.number });
    s.svg.style.setProperty('--sheet-w', `${page.w}in`);
    s.svg.style.setProperty('--sheet-h', `${page.h}in`);
    let ok = true;
    try {
      def.draw(s);
    } catch (e) {
      ok = false;
      s.text(s.W / 2, s.H / 2, `${def.number} could not be drawn: ${e.message}`,
        { size: 9, fill: 'var(--keel)' });
    }
    if (ok) {
      titleBlock(s, {
        project: info.project, subtitle: info.subtitle(state.spec),
        warning: info.warning, title: def.title,
        scale: def.scaleLabel || (s.scale ? s.scale.label : 'As noted'),
        date: info.date, number: def.number,
      });
    }
    const holder = el('div', 'sheet-holder');
    holder.style.aspectRatio = `${s.page.w} / ${s.page.h}`;
    holder.style.setProperty('--sheet-w', `${page.w}in`);
    holder.style.setProperty('--sheet-h', `${page.h}in`);
    holder.append(s.svg);
    const cap = el('div', 'sheet-cap');
    cap.append(el('b', null, def.number), document.createTextNode('  ' + def.title));
    wrap.append(cap, holder);
  }
  p.append(wrap);
}
