/* ============================================================
   Geometry primitives and the mesh builder. A part is a box, optionally
   on an arbitrary basis, or a polygon extruded along X.
   ============================================================ */

/* ============================================================
   20 — Build the whole building out of parts.
   Every part is a box (optionally rotated about X, which is the axis the
   roof slopes around) or a prism extruded along X for the gable triangles.
   ============================================================ */

function boxPart(p, s, rx) { return { t: 'box', p, s, rx: rx || 0 }; }
function prismPart(pts, x0, x1) { return { t: 'prism', pts, x0, x1 }; }

/* A box on an arbitrary basis: b holds the world vectors of the local X, Y
   and Z axes. Used for members that run diagonally in more than one plane. */
function orientedBox(p, s, b) { return { t: 'box', p, s, rx: 0, b }; }

/* A member running from A to B in space, `depth` deep on the up side.
   Local Z follows the member, local Y is world-up squared off against it. */
function memberBox3(A, B, thick, depth) {
  const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const z = [d[0] / len, d[1] / len, d[2] / len];
  let up = [0, 1, 0];
  if (Math.abs(z[1]) > 0.98) up = [1, 0, 0];
  // x = up × z, then y = z × x, giving a right-handed frame
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const lx = Math.hypot(x[0], x[1], x[2]) || 1;
  x = [x[0] / lx, x[1] / lx, x[2] / lx];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const c = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  return orientedBox(c, [thick, depth, len], [x, y, z]);
}

/* A framing member laid out from two points on a reference edge in the Z–Y
   plane. `align` says which side of that edge the material sits on. */
function memberBox(a, b, x, thick, depth, align) {
  const dz = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dz, dy);
  const dirZ = dz / len, dirY = dy / len;
  const perpZ = -dirY, perpY = dirZ;            // rotate +90° in (z, y)
  const side = align === 'above' ? 0.5 : align === 'below' ? -0.5 : 0;
  const cz = (a[0] + b[0]) / 2 + perpZ * depth * side;
  const cy = (a[1] + b[1]) / 2 + perpY * depth * side;
  const rx = -Math.atan2(dirY, dirZ);
  return boxPart([x, cy, cz], [thick, depth, len], rx);
}

/* ---- geometry → triangles + edges ---- */
const CUBE_FACES = [
  { n: [ 1, 0, 0], v: [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]] },
  { n: [-1, 0, 0], v: [[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]] },
  { n: [ 0, 1, 0], v: [[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]] },
  { n: [ 0,-1, 0], v: [[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]] },
  { n: [ 0, 0, 1], v: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },
  { n: [ 0, 0,-1], v: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]] },
];
const CUBE_EDGES = [
  [0,1],[1,2],[2,3],[3,0], [4,5],[5,6],[6,7],[7,4], [0,4],[1,5],[2,6],[3,7],
];
const CUBE_CORNERS = [
  [-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],
  [-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],
];
function rotX(p, s, c) { return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }

/* One place that knows how a box's local space maps to the world, whether it
   carries a plain X rotation or a full basis. */
function boxXform(g) {
  if (g.b) {
    const [X, Y, Z] = g.b;
    const dir = (v) => [
      X[0] * v[0] + Y[0] * v[1] + Z[0] * v[2],
      X[1] * v[0] + Y[1] * v[1] + Z[1] * v[2],
      X[2] * v[0] + Y[2] * v[1] + Z[2] * v[2],
    ];
    return { dir, pt: (v) => { const d = dir(v); return [d[0] + g.p[0], d[1] + g.p[1], d[2] + g.p[2]]; } };
  }
  const s = Math.sin(g.rx), c = Math.cos(g.rx);
  const dir = (v) => rotX(v, s, c);
  return { dir, pt: (v) => { const d = rotX(v, s, c); return [d[0] + g.p[0], d[1] + g.p[1], d[2] + g.p[2]]; } };
}
class MeshBuilder {
  constructor() { this.v = []; this.l = []; }
  box(g, col) {
    const xf = boxXform(g);
    const [hx, hy, hz] = [g.s[0] / 2, g.s[1] / 2, g.s[2] / 2];
    for (const f of CUBE_FACES) {
      const n = xf.dir(f.n);
      const q = f.v.map((k) => xf.pt([k[0] * hx, k[1] * hy, k[2] * hz]));
      this.tri(q[0], q[1], q[2], n, col); this.tri(q[0], q[2], q[3], n, col);
    }
    const cs = CUBE_CORNERS.map((k) => xf.pt([k[0] * hx, k[1] * hy, k[2] * hz]));
    for (const [a, b] of CUBE_EDGES) this.l.push(...cs[a], ...cs[b]);
  }
  prism(g, col) {
    const pts = g.pts, N = pts.length;
    const at = (i, x) => [x, pts[i][1], pts[i][0]];
    for (const [x, nx] of [[g.x0, [-1, 0, 0]], [g.x1, [1, 0, 0]]]) {
      for (let i = 1; i < N - 1; i++) {
        if (nx[0] > 0) this.tri(at(0, x), at(i, x), at(i + 1, x), nx, col);
        else this.tri(at(0, x), at(i + 1, x), at(i, x), nx, col);
      }
    }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = at(i, g.x0), b = at(j, g.x0), c2 = at(j, g.x1), d = at(i, g.x1);
      const e1 = [0, b[1] - a[1], b[2] - a[2]];
      let n = [0, e1[2], -e1[1]];
      const ln = Math.hypot(n[1], n[2]) || 1; n = [0, n[1] / ln, n[2] / ln];
      this.tri(a, b, c2, n, col); this.tri(a, c2, d, n, col);
      this.l.push(...a, ...b); this.l.push(...d, ...c2); this.l.push(...a, ...d);
    }
  }
  tri(a, b, c, n, col) {
    for (const p of [a, b, c]) this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
}
function aabb(g) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const put = (p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } };
  if (g.t === 'box') {
    const xf = boxXform(g);
    for (const k of CUBE_CORNERS) {
      put(xf.pt([k[0] * g.s[0] / 2, k[1] * g.s[1] / 2, k[2] * g.s[2] / 2]));
    }
  } else {
    for (const pt of g.pts) { put([g.x0, pt[1], pt[0]]); put([g.x1, pt[1], pt[0]]); }
  }
  return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
}
