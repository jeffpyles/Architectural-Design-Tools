/* ============================================================
   A small WebGL renderer. No dependencies: the artifact CSP blocks every
   external script, and axis-aligned framing does not need an engine.
   ============================================================ */

/* ============================================================
   30 — A small WebGL renderer. No dependencies: the artifact CSP blocks
   every external script, and axis-aligned framing lumber does not need
   a general-purpose engine.
   ============================================================ */

/* ---- 4×4 matrix helpers (column-major, like GL wants) ---- */
const M4 = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
          + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  lookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
    ]);
  },
  invert(m) {
    const o = new Float32Array(16);
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
          a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
          b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
          b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
          b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return M4.ident();
    det = 1 / det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
    o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
    o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
    o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
    o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
  },
  xform(m, v) {
    const w = m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15];
    return [
      (m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12]) / w,
      (m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13]) / w,
      (m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]) / w,
    ];
  },
};
const VERT_SRC = `
attribute vec3 aPos; attribute vec3 aNorm; attribute vec3 aCol;
uniform mat4 uProj, uView;
varying vec3 vNorm; varying vec3 vCol; varying vec3 vWorld;
void main() {
  vNorm = aNorm; vCol = aCol; vWorld = aPos;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;
const FRAG_SRC = `
precision mediump float;
varying vec3 vNorm; varying vec3 vCol; varying vec3 vWorld;
uniform vec3 uSun, uSky, uGround, uFog;
uniform float uDim, uDesat, uFogK;
void main() {
  vec3 n = normalize(vNorm);
  float d = max(dot(n, normalize(uSun)), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGround, uSky, hemi);
  vec3 base = vCol;
  float g = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(base, vec3(g), uDesat);
  /* A shadow floor, because the unlit faces used to crush to near black and
     take the framing detail with them — which is most of what there is to
     look at here. The floor lifts them; the shoulder keeps the sunlit faces
     from clipping now that everything sits higher.

     0.36 is where this stops. Past about 0.42 the near studs stop separating
     from the sheathing behind them and the whole model goes flat — brighter,
     and harder to read, which is the opposite of the point. */
  vec3 c = base * (0.36 + amb * 0.66 + d * 0.70);
  c *= uDim;
  c = c / (1.0 + max(c - 0.95, 0.0) * 0.9);
  float depth = gl_FragCoord.z / gl_FragCoord.w;
  c = mix(c, uFog, clamp(depth * uFogK, 0.0, 0.55));
  gl_FragColor = vec4(c, 1.0);
}`;
const LINE_VERT = `
attribute vec3 aPos; uniform mat4 uProj, uView;
void main() { gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
const LINE_FRAG = `
precision mediump float; uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;
function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.prog = compile(gl, VERT_SRC, FRAG_SRC);
    this.lineProg = compile(gl, LINE_VERT, LINE_FRAG);
    this.buffers = new Map();
    this.cam = { az: -0.75, el: 0.42, dist: 900, target: [144, 70, 156] };
    this.theme = { sky: [0.85,0.88,0.9], ground: [0.35,0.34,0.32], fog: [0.93,0.94,0.93], line: [0.1,0.14,0.13,0.35] };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  setTheme(t) { this.theme = { ...this.theme, ...t }; }

  /* Group parts into one buffer per draw group so a stage can be dimmed or
     dropped without rebuilding anything. */
  load(groups) {
    const gl = this.gl;
    for (const b of this.buffers.values()) { gl.deleteBuffer(b.tri); gl.deleteBuffer(b.line); }
    this.buffers.clear();
    for (const [key, parts] of groups) {
      const mb = new MeshBuilder();
      for (const p of parts) {
        const col = MATERIALS[p.mat] ? MATERIALS[p.mat].c : [0.7, 0.7, 0.7];
        if (p.geom.t === 'box') mb.box(p.geom, col); else mb.prism(p.geom, col);
      }
      const tri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.v), gl.STATIC_DRAW);
      const line = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, line);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.l), gl.STATIC_DRAW);
      this.buffers.set(key, { tri, line, nTri: mb.v.length / 9, nLine: mb.l.length / 3 });
    }
  }

  matrices() {
    const { az, el, dist, target } = this.cam;
    const eye = [
      target[0] + dist * Math.cos(el) * Math.sin(az),
      target[1] + dist * Math.sin(el),
      target[2] + dist * Math.cos(el) * Math.cos(az),
    ];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth * dpr, h = this.canvas.clientHeight * dpr;
    const proj = M4.perspective(38 * D2R, w / Math.max(h, 1), 10, 6000);
    const view = M4.lookAt(eye, target, [0, 1, 0]);
    return { proj, view, eye };
  }

  draw(order, opts) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const bg = this.theme.fog;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { proj, view } = this.matrices();

    gl.useProgram(this.prog);
    const P = this.prog;
    gl.uniformMatrix4fv(gl.getUniformLocation(P, 'uProj'), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(P, 'uView'), false, view);
    gl.uniform3fv(gl.getUniformLocation(P, 'uSun'), new Float32Array([0.45, 0.82, 0.36]));
    gl.uniform3fv(gl.getUniformLocation(P, 'uSky'), new Float32Array(this.theme.sky));
    gl.uniform3fv(gl.getUniformLocation(P, 'uGround'), new Float32Array(this.theme.ground));
    gl.uniform3fv(gl.getUniformLocation(P, 'uFog'), new Float32Array(this.theme.fog));
    gl.uniform1f(gl.getUniformLocation(P, 'uFogK'), opts.fogK ?? 0.00028);
    const uDim = gl.getUniformLocation(P, 'uDim');
    const uDesat = gl.getUniformLocation(P, 'uDesat');

    const aPos = gl.getAttribLocation(P, 'aPos');
    const aNorm = gl.getAttribLocation(P, 'aNorm');
    const aCol = gl.getAttribLocation(P, 'aCol');
    this.useAttribs([aPos, aNorm, aCol]);

    for (const item of order) {
      const b = this.buffers.get(item.key);
      if (!b || !b.nTri) continue;
      gl.uniform1f(uDim, item.dim ?? 1);
      gl.uniform1f(uDesat, item.desat ?? 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.tri);
      const stride = 9 * 4;
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, stride, 24);
      gl.drawArrays(gl.TRIANGLES, 0, b.nTri);
    }

    if (opts.edges) {
      gl.useProgram(this.lineProg);
      const L = this.lineProg;
      gl.uniformMatrix4fv(gl.getUniformLocation(L, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(L, 'uView'), false, view);
      const uColor = gl.getUniformLocation(L, 'uColor');
      const lPos = gl.getAttribLocation(L, 'aPos');
      // The line program has one attribute. Any array still enabled from the
      // triangle pass would be fetched against a shorter buffer.
      this.useAttribs([lPos]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const item of order) {
        const b = this.buffers.get(item.key);
        if (!b || !b.nLine) continue;
        const a = (item.dim ?? 1) < 0.95 ? this.theme.line[3] * 0.4 : this.theme.line[3];
        gl.uniform4f(uColor, this.theme.line[0], this.theme.line[1], this.theme.line[2], a);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.line);
        gl.vertexAttribPointer(lPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, b.nLine);
      }
      gl.disable(gl.BLEND);
    }
  }

  /* Enable exactly the attribute arrays the current program uses and leave
     every other one off, so nothing is fetched against a stale buffer. */
  useAttribs(want) {
    const gl = this.gl;
    if (this.maxAttribs == null) this.maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const set = new Set(want.filter((i) => i >= 0));
    for (let i = 0; i < this.maxAttribs; i++) {
      if (set.has(i)) gl.enableVertexAttribArray(i);
      else gl.disableVertexAttribArray(i);
    }
  }

  /* Screen point → world ray, for picking openings off the wall planes. */
  ray(px, py) {
    const { proj, view, eye } = this.matrices();
    const r = this.canvas.getBoundingClientRect();
    const x = ((px - r.left) / r.width) * 2 - 1;
    const y = -(((py - r.top) / r.height) * 2 - 1);
    const inv = M4.invert(M4.mul(proj, view));
    const a = M4.xform(inv, [x, y, -1]);
    const b = M4.xform(inv, [x, y, 1]);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return { o: eye, d: [d[0] / l, d[1] / l, d[2] / l] };
  }

  project(p) {
    const { proj, view } = this.matrices();
    const c = M4.xform(M4.mul(proj, view), p);
    const r = this.canvas.getBoundingClientRect();
    return { x: (c[0] * 0.5 + 0.5) * r.width, y: (-c[1] * 0.5 + 0.5) * r.height, z: c[2] };
  }
}
