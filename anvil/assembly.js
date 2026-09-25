// assembly.js — Anvil assembly documents: insert parts as components, mate them (Coincident / Concentric), solve.
// Plain script (no modules): defines the global `Assembly`. Loaded after csg.js and kernel.js; no DOM, no three.js.
//
// An assembly model is plain JSON (see README "Assemblies"):
//   { type: 'assembly', name, units, features: [], components: [Component], mates: [Mate], nextId }
// A component places a part (a Design Library example, a part script or an embedded part model) with a rigid transform
// world = R · local + position (R row-major 3x3). Mates reference geometry on components in component-local coords;
// `rebuild` builds each part once (cached by source), solves the mates and writes the solved transforms back.
var Assembly = (function () {
  'use strict';

  var IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var TOL_OK = 1e-6;       // a mate whose residual stays above this is reported as not satisfied
  var TOL_DONE = 1e-9;     // a mate below this counts as already satisfied (no greedy move, solver not started)

  // ------------------------------------------------------------------ small vector / matrix helpers (double precision)
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-300 ? scale(a, 1 / l) : [0, 0, 0]; }
  function arr(v) { return [v.x, v.y, v.z]; }
  function copy3(a) { return [+a[0], +a[1], +a[2]]; }

  function matVec(R, v) {
    return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  }
  function matTVec(R, v) { // R^T · v
    return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  }
  function matMul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  // Rotation matrix for a rotation vector w (axis · angle), Rodrigues' formula.
  function rotVec(w) {
    var th = len(w);
    if (th < 1e-300) return IDENTITY.slice();
    var k = scale(w, 1 / th), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
    var x = k[0], y = k[1], z = k[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  // Nearest proper rotation to a 3x3 (Gram-Schmidt on the rows): a script's rounded rotation becomes orthonormal again.
  function orthonormalize(R) {
    var r0 = norm([R[0], R[1], R[2]]), r1 = [R[3], R[4], R[5]];
    r1 = norm(sub(r1, scale(r0, dot(r0, r1))));
    if (len(r0) < 0.5 || len(r1) < 0.5) return IDENTITY.slice();
    var r2 = cross(r0, r1);
    return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
  }

  function tf(T) { // normalised transform (tolerates a missing / partial transform)
    T = T || {};
    return { position: T.position ? copy3(T.position) : [0, 0, 0], rotation: T.rotation && T.rotation.length === 9 ? T.rotation.map(Number) : IDENTITY.slice() };
  }
  function transformPoint(T, p) { T = tf(T); return add(matVec(T.rotation, p), T.position); }
  function inverseTransformPoint(T, p) { T = tf(T); return matTVec(T.rotation, sub(p, T.position)); }
  function transformDir(T, d) { T = tf(T); return matVec(T.rotation, d); }

  // ------------------------------------------------------------------ model helpers
  function isAssembly(model) { return !!(model && model.type === 'assembly'); }

  function newAssembly(name) {
    return { type: 'assembly', name: name || 'Assem1', units: 'mm', features: [], components: [], mates: [], nextId: 1 };
  }

  function examplesList() { return (typeof AnvilExamples !== 'undefined' && AnvilExamples) ? AnvilExamples : []; }

  function isAssemblyScript(code) { return /\b(a|asm)\.(insert|mate|coincident|concentric)\s*\(/.test(String(code || '')); }

  // A fresh part model JSON for a component source. Throws for an unknown / unusable source.
  function partModel(source) {
    if (typeof source === 'string') source = { example: source };
    if (!source || typeof source !== 'object') throw new Error('Component source must be { example }, { script } or { model }');
    var m;
    if (source.example != null) {
      var ex = null;
      examplesList().forEach(function (e) { if (!ex && e && e.name === source.example) ex = e; });
      if (!ex) throw new Error('Unknown Design Library part "' + source.example + '"');
      if (ex.kind === 'assembly' || ex.assembly || ex.type === 'assembly' || isAssemblyScript(ex.code)) throw new Error('"' + source.example + '" is an assembly and cannot be inserted as a part');
      m = Kernel.newModel();
      Kernel.runScript(m, ex.code);
      return m;
    }
    if (source.script != null) {
      m = Kernel.newModel();
      Kernel.runScript(m, String(source.script));
      return m;
    }
    if (source.model) {
      if (isAssembly(source.model)) throw new Error('An assembly cannot be inserted as a part');
      return JSON.parse(JSON.stringify(source.model));
    }
    throw new Error('Component source must be { example }, { script } or { model }');
  }

  function findComponent(model, idOrName) {
    if (idOrName == null || !model || !model.components) return null;
    var list = model.components, i;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findComponent(model, +idOrName);
    return null;
  }
  function findMate(model, idOrName) {
    if (idOrName == null || !model || !model.mates) return null;
    var list = model.mates, i;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findMate(model, +idOrName);
    return null;
  }
  function componentIndex(model, id) {
    for (var i = 0; i < model.components.length; i++) if (model.components[i].id === id) return i;
    return -1;
  }

  function nextNumber(names, base) { // 1 + the largest n among names 'base<n>' / 'baseN'
    var max = 0;
    names.forEach(function (nm) {
      if (typeof nm !== 'string' || nm.indexOf(base) !== 0) return;
      var n = parseInt(nm.slice(base.length).replace(/^</, ''), 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function ensureLists(model) {
    if (!model.components) model.components = [];
    if (!model.mates) model.mates = [];
    if (!model.features) model.features = [];
    if (!(model.nextId > 0)) {
      var max = 0;
      model.components.concat(model.mates).forEach(function (o) { if (o.id > max) max = o.id; });
      model.nextId = max + 1;
    }
  }

  // insert(model, source, opts) -> the new component. source may be an example name string.
  function insert(model, source, opts) {
    opts = opts || {};
    ensureLists(model);
    if (typeof source === 'string') source = { example: source };
    source = JSON.parse(JSON.stringify(source || {}));
    var base = 'Part';
    try { base = partModel(source).name || 'Part'; } catch (e) { /* rebuild reports the error on the component */ }
    var name = opts.name || (base + '<' + nextNumber(model.components.map(function (c) { return c.name; }), base) + '>');
    var fixed = model.components.length === 0 ? opts.fixed !== false : opts.fixed === true;
    var pos = opts.position || opts.at;
    var comp = {
      id: model.nextId++, name: name, source: source, fixed: fixed,
      transform: { position: pos ? copy3(pos) : [0, 0, 0], rotation: opts.rotation ? orthonormalize(opts.rotation.map(Number)) : IDENTITY.slice() }
    };
    model.components.push(comp);
    return comp;
  }

  var MATE_BASE = { coincident: 'Coincident', concentric: 'Concentric' };

  function normRef(model, ref) {
    var r = JSON.parse(JSON.stringify(ref || {}));
    if (r.component != null && typeof r.component !== 'number') {
      var c = findComponent(model, r.component);
      if (c) r.component = c.id;
    }
    return r;
  }

  // addMate(model, type, a, b, opts) -> the new mate
  function addMate(model, type, a, b, opts) {
    opts = opts || {};
    ensureLists(model);
    type = String(type || '').toLowerCase();
    var base = MATE_BASE[type] || 'Mate';
    var m = {
      id: model.nextId++,
      name: opts.name || (base + nextNumber(model.mates.map(function (x) { return x.name; }), base)),
      type: type, a: normRef(model, a), b: normRef(model, b)
    };
    if (opts.alignment) m.alignment = opts.alignment;
    if (opts.suppressed) m.suppressed = true;
    model.mates.push(m);
    return m;
  }

  function refUses(ref, id) { return ref && ref.component != null && ref.component === id; }
  function removeComponent(model, id) {
    var c = findComponent(model, id);
    if (!c) return false;
    model.components.splice(model.components.indexOf(c), 1);
    model.mates = model.mates.filter(function (m) { return !refUses(m.a, c.id) && !refUses(m.b, c.id); });
    return true;
  }
  function removeMate(model, id) {
    var m = findMate(model, id);
    if (!m) return false;
    model.mates.splice(model.mates.indexOf(m), 1);
    return true;
  }
  function setFixed(model, id, fixed) {
    var c = findComponent(model, id);
    if (c) c.fixed = !!fixed;
    return c;
  }

  // ------------------------------------------------------------------ part geometry: meshes, patches, cylinders
  // Each part build gets a local mesh plus "patches": the polygons of one planar mesh face split into connected pieces
  // (two coplanar hole facets of patterned holes are one mesh face but two patches). Cylinder detection works on patches.
  function vkey(p) { return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5); }

  function partGeom(build) {
    if (!build || !build.body) return null;
    if (build.__asmGeom) return build.__asmGeom;
    var mesh = Kernel.meshFromBody(build.body);
    var patches = [], vertPatches = {};
    mesh.faces.forEach(function (f, fi) {
      // union-find over the face's polygons by shared vertex
      var polys = f.polys, parent = polys.map(function (_, i) { return i; }), owner = {};
      function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      polys.forEach(function (p, i) {
        p.vertices.forEach(function (v) {
          var k = vkey(arr(v.pos));
          if (owner[k] == null) owner[k] = i; else { var a = find(owner[k]), b = find(i); if (a !== b) parent[a] = b; }
        });
      });
      var byRoot = {};
      polys.forEach(function (p, i) {
        var r = find(i);
        if (!byRoot[r]) { byRoot[r] = { face: fi, normal: f.normal, w: f.w, polys: [], keys: {} }; patches.push(byRoot[r]); }
        byRoot[r].polys.push(p);
      });
    });
    patches.forEach(function (pt, pi) {
      pt.index = pi;
      pt.polys.forEach(function (p) {
        p.vertices.forEach(function (v) {
          var k = vkey(arr(v.pos));
          pt.keys[k] = true;
          (vertPatches[k] = vertPatches[k] || []);
          if (vertPatches[k].indexOf(pi) < 0) vertPatches[k].push(pi);
        });
      });
    });
    patches.forEach(function (pt) {
      var nb = {};
      Object.keys(pt.keys).forEach(function (k) { vertPatches[k].forEach(function (q) { if (q !== pt.index) nb[q] = true; }); });
      pt.neighbors = Object.keys(nb).map(Number);
    });
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    build.body.polygons.forEach(function (p) {
      p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    });
    if (!(min[0] <= max[0])) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var geom = { mesh: mesh, patches: patches, cyl: {}, center: scale(add(min, max), 0.5), size: Math.max(1e-9, len(sub(max, min))) };
    try { Object.defineProperty(build, '__asmGeom', { value: geom, enumerable: false, configurable: true, writable: true }); } catch (e) { /* frozen build: recompute next time */ }
    return geom;
  }

  // distance from p to a convex polygon
  function polyDistance(poly, p) {
    var vs = poly.vertices.map(function (v) { return arr(v.pos); });
    var n = arr(poly.plane.normal), d = dot(n, p) - poly.plane.w;
    var q = sub(p, scale(n, d)), inside = true;
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i], b = vs[(i + 1) % vs.length];
      if (dot(cross(sub(b, a), sub(q, a)), n) < -1e-12) { inside = false; break; }
    }
    if (inside) return Math.abs(d);
    var best = Infinity;
    for (i = 0; i < vs.length; i++) {
      var A = vs[i], B = vs[(i + 1) % vs.length], ab = sub(B, A), L2 = dot(ab, ab);
      var t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, A), ab) / L2)) : 0;
      var dd = len(sub(p, add(A, scale(ab, t))));
      if (dd < best) best = dd;
    }
    return best;
  }
  function patchDistance(pt, p) {
    var best = Infinity;
    for (var i = 0; i < pt.polys.length; i++) { var d = polyDistance(pt.polys[i], p); if (d < best) best = d; }
    return best;
  }
  function patchesByDistance(geom, p) {
    return geom.patches.map(function (pt) { return { pt: pt, d: patchDistance(pt, p) }; }).sort(function (a, b) { return a.d - b.d; });
  }

  // Jacobi eigen-decomposition of a symmetric n x n matrix (array of rows) -> { values, vectors (columns as arrays) }
  function eigSym(A) {
    var n = A.length, a = A.map(function (r) { return r.slice(); }), V = [], i, j, k;
    for (i = 0; i < n; i++) { V.push([]); for (j = 0; j < n; j++) V[i].push(i === j ? 1 : 0); }
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0, tot = 0;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) { tot += a[i][j] * a[i][j]; if (i !== j) off += a[i][j] * a[i][j]; }
      if (off <= 1e-30 * Math.max(tot, 1e-300)) break;
      for (var p = 0; p < n - 1; p++) {
        for (var q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-300) continue;
          var th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          var c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (k = 0; k < n; k++) { // rotate columns p, q
            var akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
          }
          for (k = 0; k < n; k++) { // rotate rows p, q
            var apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
          }
          for (k = 0; k < n; k++) {
            var vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    var values = [], vectors = [];
    for (i = 0; i < n; i++) { values.push(a[i][i]); vectors.push(V.map(function (row) { return row[i]; })); }
    return { values: values, vectors: vectors };
  }

  // Canonical axis direction: the sign that makes the largest-magnitude component positive (ties: x, then y, then z).
  function canonicalDir(d) {
    var best = 0;
    for (var k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[best]) + 1e-9) best = k;
    return d[best] < 0 ? scale(d, -1) : d.slice();
  }

  // Grow a faceted cylindrical surface from a seed patch -> { point, dir, radius, patches } (local coords) or null.
  // Neighbouring facets of a cylinder have normals perpendicular to one common axis and turn by a small angle
  // (circles use >= 16 segments, revolves 48 steps); box sides (90°) and hex flats (60°) are not cylinders.
  var MAX_TURN = Math.cos(40 * Math.PI / 180), MIN_TURN = Math.cos(0.2 * Math.PI / 180);
  function cylinderFromPatch(geom, seed) {
    if (geom.cyl[seed.index] !== undefined) return geom.cyl[seed.index];
    var P = geom.patches, n0 = seed.normal, axis = null;
    seed.neighbors.forEach(function (qi) {
      if (axis) return;
      var c = dot(n0, P[qi].normal);
      if (c < MIN_TURN && c > MAX_TURN) axis = norm(cross(n0, P[qi].normal));
    });
    var result = null;
    if (axis) {
      var inRegion = {}, region = [seed], queue = [seed];
      inRegion[seed.index] = true;
      while (queue.length) {
        var r = queue.shift();
        r.neighbors.forEach(function (qi) {
          if (inRegion[qi]) return;
          var q = P[qi];
          if (Math.abs(dot(q.normal, axis)) > 2e-3) return;
          if (dot(q.normal, r.normal) < MAX_TURN) return;
          inRegion[qi] = true; region.push(q); queue.push(q);
        });
      }
      // at least three distinct facet directions
      var dirs = [];
      region.forEach(function (q) { if (!dirs.some(function (d) { return dot(d, q.normal) > MIN_TURN; })) dirs.push(q.normal); });
      if (dirs.length >= 3) result = fitCylinder(region, axis);
    }
    region = null;
    // every patch of the region maps to the same cylinder
    if (result) result.patches.forEach(function (q) { geom.cyl[q.index] = result; });
    else geom.cyl[seed.index] = null;
    return result;
  }

  // Least-squares cylinder through facet planes: axis = direction least represented in the facet normals (smallest
  // eigenvector of Σ n nᵀ); centre c and signed radius k from n_i · c + k = w_i (k > 0 for a boss, < 0 for a hole).
  function fitCylinder(region, axis0) {
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    region.forEach(function (q) { for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] += q.normal[i] * q.normal[j]; });
    var eg = eigSym(M), lo = 0;
    for (var i = 1; i < 3; i++) if (eg.values[i] < eg.values[lo]) lo = i;
    var axis = norm(eg.vectors[lo]);
    if (dot(axis, axis0) < 0) axis = scale(axis, -1);
    var e1 = norm(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(axis, e1);
    // normal equations for unknowns (a, b, k): n·(a e1 + b e2) + k = w
    var N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rhs = [0, 0, 0];
    region.forEach(function (q) {
      var row = [dot(q.normal, e1), dot(q.normal, e2), 1];
      for (var r = 0; r < 3; r++) { rhs[r] += row[r] * q.w; for (var c = 0; c < 3; c++) N[r][c] += row[r] * row[c]; }
    });
    var sol = solveLinear(N, rhs);
    if (!sol) return null;
    var point = add(scale(e1, sol[0]), scale(e2, sol[1]));
    return { point: point, dir: canonicalDir(axis), radius: Math.abs(sol[2]), patches: region };
  }

  // Gaussian elimination with partial pivoting; A is n x n (array of rows), destroyed copy. -> x | null
  function solveLinear(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      if (!(Math.abs(M[piv][i]) > 1e-300)) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        if (f === 0) continue;
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // The cylinder through / nearest a local point: the nearest patch that belongs to a cylindrical surface.
  function findCylinder(geom, p) {
    var list = patchesByDistance(geom, p);
    for (var i = 0; i < list.length; i++) {
      var c = cylinderFromPatch(geom, list[i].pt);
      if (c) return c;
    }
    return null;
  }

  // ------------------------------------------------------------------ references
  var STD_PLANE_NORMALS = { front: [0, 0, 1], top: [0, 1, 0], right: [1, 0, 0] };
  var AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function fmtPt(p) { return '[' + p.map(function (x) { return +(+x).toFixed(4); }).join(', ') + ']'; }

  // Resolve a ref in its component's LOCAL frame -> { kind, point, normal|dir, comp (component or null), refKind }
  function localRef(model, partBuilds, ref) {
    if (!ref || typeof ref !== 'object') throw new Error('Missing mate reference');
    var comp = null, geom = null;
    if (ref.component != null) {
      comp = findComponent(model, ref.component);
      if (!comp) throw new Error('Unknown component ' + JSON.stringify(ref.component));
    }
    function needGeom() {
      var b = partBuilds && partBuilds[comp.id];
      geom = partGeom(b);
      if (!geom) throw new Error(comp.name + ' has no geometry');
      return geom;
    }
    var out = { comp: comp };
    if (ref.plane != null) {
      var n = STD_PLANE_NORMALS[String(ref.plane).toLowerCase()];
      if (!n) throw new Error('Unknown plane "' + ref.plane + '"');
      out.kind = 'plane'; out.refKind = 'plane'; out.point = [0, 0, 0]; out.normal = n.slice();
    } else if (ref.axis != null) {
      var d = AXIS_DIRS[String(ref.axis).toLowerCase()];
      if (!d) throw new Error('Unknown axis "' + ref.axis + '"');
      out.kind = 'axis'; out.refKind = 'axis'; out.point = [0, 0, 0]; out.dir = d.slice();
    } else if (ref.face) {
      if (!comp) throw new Error('A face reference needs a component');
      var p = copy3(ref.face), g = needGeom(), best = patchesByDistance(g, p)[0];
      var tol = Math.max(1e-4, 1e-5 * g.size);
      if (!best || best.d > tol) throw new Error('No face at ' + fmtPt(p) + ' on ' + comp.name);
      var nn = best.pt.normal;
      out.kind = 'plane'; out.refKind = 'face'; out.normal = nn.slice();
      out.point = sub(p, scale(nn, dot(nn, p) - best.pt.w)); // projected onto the face plane
    } else if (ref.cylinder) {
      if (!comp) throw new Error('A cylindrical face reference needs a component');
      var pc = copy3(ref.cylinder), cy = findCylinder(needGeom(), pc);
      if (!cy) throw new Error('No cylindrical face near ' + fmtPt(pc) + ' on ' + comp.name);
      out.kind = 'axis'; out.refKind = 'cylinder'; out.dir = cy.dir.slice();
      out.point = add(cy.point, scale(cy.dir, dot(sub(pc, cy.point), cy.dir))); // axis point nearest the given point
      out.radius = cy.radius;
    } else throw new Error('A mate reference needs face, plane, cylinder or axis');
    return out;
  }

  function worldOf(lr, T) {
    if (!lr.comp) return { kind: lr.kind, point: lr.point.slice(), normal: lr.normal && lr.normal.slice(), dir: lr.dir && lr.dir.slice() };
    var o = { kind: lr.kind, point: transformPoint(T, lr.point) };
    if (lr.normal) o.normal = transformDir(T, lr.normal);
    if (lr.dir) o.dir = transformDir(T, lr.dir);
    return o;
  }

  function resolveRef(model, partBuilds, ref, transforms) {
    var lr = localRef(model, partBuilds, ref);
    var T = lr.comp ? ((transforms && transforms[lr.comp.id]) || lr.comp.transform) : null;
    var w = worldOf(lr, T);
    return w.kind === 'plane' ? { kind: 'plane', point: w.point, normal: w.normal } : { kind: 'axis', point: w.point, dir: w.dir };
  }

  // ------------------------------------------------------------------ mate residuals
  function defaultAlignment(m) {
    if (m.type === 'coincident') return (m.a && m.a.face && m.b && m.b.face) ? 'anti-aligned' : 'aligned';
    return 'aligned';
  }
  function alignSign(m) { return (m.alignment || defaultAlignment(m)) === 'anti-aligned' ? -1 : 1; }

  // Residual vector of a prepared mate given world refs A, B. Coincident: nA − s·nB (3) and the plane gap (1).
  // Concentric: dA − s·dB (3) and B's axis point offset perpendicular to A's axis (3).
  function mateResidual(pm, A, B) {
    var s = pm.sign;
    if (pm.type === 'coincident') {
      var dn = sub(A.normal, scale(B.normal, s));
      var gap = 0.5 * (dot(sub(B.point, A.point), A.normal) + s * dot(sub(B.point, A.point), B.normal));
      return [dn[0], dn[1], dn[2], gap];
    }
    var dd = sub(A.dir, scale(B.dir, s)), v = sub(B.point, A.point);
    var perp = sub(v, scale(A.dir, dot(v, A.dir)));
    return [dd[0], dd[1], dd[2], perp[0], perp[1], perp[2]];
  }
  function vnorm(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return Math.sqrt(s); }

  // ------------------------------------------------------------------ solver
  // Unknowns: 6 per floating component, an incremental move about a pivot c (the part's centre in world):
  //   R' = E(w) R,  p' = E(w)(p − c) + c + d.
  function perturb(T, pivot, x, o) {
    var E = rotVec([x[o + 3], x[o + 4], x[o + 5]]);
    return { rotation: matMul(E, T.rotation), position: add(add(matVec(E, sub(T.position, pivot)), pivot), [x[o], x[o + 1], x[o + 2]]) };
  }

  function solve(model, partBuilds) {
    ensureLists(model);
    var comps = model.components, transforms = {}, pivots = {}, mateOut = {};
    comps.forEach(function (c) { transforms[c.id] = tf(c.transform); });
    function movable(comp) { return !!(comp && !comp.fixed); }
    function pivotOf(comp) {
      var g = partGeom(partBuilds && partBuilds[comp.id]);
      return transformPoint(transforms[comp.id], g ? g.center : [0, 0, 0]);
    }

    // prepare mates: resolve local refs, check kinds
    var prepared = [];
    model.mates.forEach(function (m) {
      if (m.suppressed) { mateOut[m.id] = { ok: true, residual: 0, error: null, suppressed: true }; return; }
      var pm = { mate: m, id: m.id, type: m.type, sign: alignSign(m) };
      try {
        if (m.type !== 'coincident' && m.type !== 'concentric') throw new Error('Unknown mate type "' + m.type + '"');
        pm.A = localRef(model, partBuilds, m.a);
        pm.B = localRef(model, partBuilds, m.b);
        if (m.type === 'coincident' && (pm.A.kind !== 'plane' || pm.B.kind !== 'plane')) throw new Error('Coincident needs two planar faces or planes');
        if (m.type === 'concentric' && (pm.A.kind !== 'axis' || pm.B.kind !== 'axis')) throw new Error('Concentric needs two cylindrical faces or axes');
      } catch (e) {
        mateOut[m.id] = { ok: false, residual: null, error: e.message || String(e) };
        return;
      }
      pm.ca = pm.A.comp; pm.cb = pm.B.comp;
      pm.rigid = (pm.ca && pm.cb && pm.ca === pm.cb) || (!movable(pm.ca) && !movable(pm.cb));
      prepared.push(pm);
    });

    function residualOf(pm, T) {
      T = T || transforms;
      return mateResidual(pm, worldOf(pm.A, pm.ca ? T[pm.ca.id] : null), worldOf(pm.B, pm.cb ? T[pm.cb.id] : null));
    }

    // ---- greedy placement of one mate: rotate then translate the component being brought to the other side
    var locks = {}, grounded = {};
    comps.forEach(function (c) { locks[c.id] = { axis: null, point: null, full: false, trans: [] }; if (c.fixed) grounded[c.id] = true; });
    function lockTrans(L, d) {
      d = d.slice();
      L.trans.forEach(function (t) { d = sub(d, scale(t, dot(d, t))); });
      if (len(d) > 1e-6 && L.trans.length < 3) L.trans.push(norm(d));
    }
    function rotateAbout(id, R, pivot) {
      var T = transforms[id];
      transforms[id] = { rotation: matMul(R, T.rotation), position: add(matVec(R, sub(T.position, pivot)), pivot) };
    }
    function greedy(pm) {
      var aMov = movable(pm.ca), bMov = movable(pm.cb), moveB;
      if (pm.rigid) return;
      if (!aMov) moveB = true;
      else if (!bMov) moveB = false;
      else if (grounded[pm.ca.id] && !grounded[pm.cb.id]) moveB = true;
      else if (grounded[pm.cb.id] && !grounded[pm.ca.id]) moveB = false;
      else moveB = true;
      var C = moveB ? pm.cb : pm.ca, mine = moveB ? pm.B : pm.A, other = moveB ? pm.A : pm.B;
      var oc = moveB ? pm.ca : pm.cb, L = locks[C.id];
      if (L.full && L.trans.length === 3) { /* fully placed by earlier mates: leave it to the solver */ }
      else if (vnorm(residualOf(pm)) > TOL_DONE) {
        var O = worldOf(other, oc ? transforms[oc.id] : null);
        var M = worldOf(mine, transforms[C.id]);
        var u = M.normal || M.dir, t = scale(O.normal || O.dir, pm.sign);
        // rotation: bring my direction onto the target direction
        if (!L.full) {
          var R = null, pivot = M.point;
          if (!L.axis) {
            var ax = cross(u, t), s = len(ax), c = dot(u, t);
            if (s > 1e-12) R = rotVec(scale(ax, Math.atan2(s, c) / s));
            else if (c < 0) { var perp = norm(cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); R = rotVec(scale(perp, Math.PI)); }
          } else {
            var a = L.axis, up = sub(u, scale(a, dot(u, a))), tp = sub(t, scale(a, dot(t, a)));
            if (len(up) > 1e-9 && len(tp) > 1e-9) {
              var ang = Math.atan2(dot(a, cross(up, tp)), dot(up, tp));
              if (Math.abs(ang) > 1e-15) R = rotVec(scale(a, ang));
            }
            pivot = L.point;
          }
          if (R) rotateAbout(C.id, R, pivot);
          M = worldOf(mine, transforms[C.id]);
        }
        // translation: close the gap, keeping directions earlier mates locked
        var delta;
        if (pm.type === 'coincident') delta = scale(O.normal, dot(sub(O.point, M.point), O.normal));
        else { var v = sub(O.point, M.point); delta = sub(v, scale(O.dir, dot(v, O.dir))); }
        L.trans.forEach(function (tr) { delta = sub(delta, scale(tr, dot(delta, tr))); });
        transforms[C.id].position = add(transforms[C.id].position, delta);
      }
      // record what this mate locks on the moved component
      var Mw = worldOf(mine, transforms[C.id]), dir = Mw.normal || Mw.dir;
      if (!L.axis) { L.axis = dir.slice(); L.point = Mw.point.slice(); }
      else if (len(cross(L.axis, dir)) > 1e-6) L.full = true;
      if (pm.type === 'coincident') lockTrans(L, dir);
      else { var e1 = norm(cross(dir, Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); lockTrans(L, e1); lockTrans(L, cross(dir, e1)); }
      if (!oc || grounded[oc.id]) grounded[C.id] = true;
    }

    // ---- Levenberg–Marquardt over the active mates (numeric Jacobian)
    function unknowns(active) {
      var ids = [], seen = {};
      active.forEach(function (pm) {
        [pm.ca, pm.cb].forEach(function (c) { if (movable(c) && !seen[c.id]) { seen[c.id] = true; ids.push(c.id); } });
      });
      return ids;
    }
    function evalAll(active, T) {
      var r = [];
      active.forEach(function (pm) { var q = residualOf(pm, T); for (var i = 0; i < q.length; i++) r.push(q[i]); });
      return r;
    }
    function applyX(ids, piv, x) {
      var T = {};
      comps.forEach(function (c) { T[c.id] = transforms[c.id]; });
      ids.forEach(function (id, j) { T[id] = perturb(transforms[id], piv[id], x, 6 * j); });
      return T;
    }
    function jacobian(active, ids, piv) {
      var n = ids.length * 6, x = [], cols = [], h = 1e-6, k;
      for (k = 0; k < n; k++) x.push(0);
      for (k = 0; k < n; k++) {
        x[k] = h; var rp = evalAll(active, applyX(ids, piv, x));
        x[k] = -h; var rm = evalAll(active, applyX(ids, piv, x));
        x[k] = 0;
        cols.push(rp.map(function (v, i) { return (v - rm[i]) / (2 * h); }));
      }
      return cols; // cols[k][row]
    }
    function cost(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return s; }
    function lm(active) {
      var ids = unknowns(active);
      if (!ids.length) return;
      var lambda = 1e-3;
      for (var iter = 0; iter < 200; iter++) {
        var r = evalAll(active, transforms), f = cost(r);
        if (f < 1e-26) return;
        var piv = {};
        ids.forEach(function (id) { piv[id] = pivotOf(findComponent(model, id)); });
        var J = jacobian(active, ids, piv), n = J.length, i, j, k;
        var JtJ = [], g = [], maxd = 0;
        for (i = 0; i < n; i++) {
          JtJ.push([]);
          var gi = 0;
          for (k = 0; k < r.length; k++) gi += J[i][k] * r[k];
          g.push(-gi);
          for (j = 0; j < n; j++) { var s = 0; for (k = 0; k < r.length; k++) s += J[i][k] * J[j][k]; JtJ[i].push(s); }
          if (JtJ[i][i] > maxd) maxd = JtJ[i][i];
        }
        var improved = false;
        while (lambda < 1e14) {
          var A = JtJ.map(function (row, ii) { var rr = row.slice(); rr[ii] += lambda * (row[ii] + 1e-9 * Math.max(maxd, 1e-12)); return rr; });
          var dx = solveLinear(A, g);
          if (dx) {
            var Tn = applyX(ids, piv, dx), fn = cost(evalAll(active, Tn));
            if (fn < f) {
              ids.forEach(function (id) { transforms[id] = Tn[id]; });
              lambda = Math.max(lambda * 0.2, 1e-15);
              improved = true;
              if (f - fn < 1e-16 * f && fn > 1e-20) return; // stalled at a non-zero minimum
              break;
            }
          }
          lambda *= 10;
        }
        if (!improved) return;
      }
    }

    // ---- incremental solve: add mates one at a time; a mate that cannot be met with the earlier ones is rejected
    var active = [];
    prepared.forEach(function (pm) {
      if (pm.rigid) {
        var res = vnorm(residualOf(pm));
        mateOut[pm.id] = res <= TOL_OK ? { ok: true, residual: res, error: null }
          : { ok: false, residual: res, error: (pm.ca && pm.ca === pm.cb) ? 'Both references are on ' + pm.ca.name + ' and do not coincide'
            : 'Mate cannot be satisfied: both references are fixed' };
        return;
      }
      var snapT = {}, snapLocks = JSON.stringify(locks), snapG = JSON.stringify(grounded);
      comps.forEach(function (c) { snapT[c.id] = transforms[c.id]; });
      greedy(pm);
      var trial = active.concat([pm]);
      lm(trial);
      var worst = 0;
      trial.forEach(function (q) { worst = Math.max(worst, vnorm(residualOf(q))); });
      if (worst <= TOL_OK) { active = trial; return; }
      // reject: restore the placement before this mate
      comps.forEach(function (c) { transforms[c.id] = snapT[c.id]; });
      locks = JSON.parse(snapLocks); grounded = JSON.parse(snapG);
      mateOut[pm.id] = { ok: false, residual: vnorm(residualOf(pm)), error: 'Mate cannot be satisfied (over-defined or conflicting)' };
    });
    // final polish over all accepted mates
    lm(active);
    active.forEach(function (pm) {
      var res = vnorm(residualOf(pm));
      mateOut[pm.id] = res <= TOL_OK ? { ok: true, residual: res, error: null } : { ok: false, residual: res, error: 'Mate cannot be satisfied (over-defined or conflicting)' };
    });

    // ---- degrees of freedom: motions of each component left free by the accepted mates (null space of J projected
    // onto the component's 6 unknowns), so a part mated to an under-defined part is under-defined too
    var dofs = {};
    comps.forEach(function (c) { dofs[c.id] = c.fixed ? 0 : 6; });
    var ids = unknowns(active);
    if (ids.length) {
      var piv = {};
      ids.forEach(function (id) { piv[id] = pivotOf(findComponent(model, id)); });
      var J = jacobian(active, ids, piv), n = J.length, JtJ = [], i, j, k, maxe = 0;
      for (i = 0; i < n; i++) { JtJ.push([]); for (j = 0; j < n; j++) { var s = 0; for (k = 0; k < J[i].length; k++) s += J[i][k] * J[j][k]; JtJ[i].push(s); } }
      var eg = eigSym(JtJ);
      eg.values.forEach(function (v) { if (v > maxe) maxe = v; });
      var nullVecs = [];
      eg.values.forEach(function (v, ii) { if (v <= 1e-10 * Math.max(maxe, 1e-30)) nullVecs.push(eg.vectors[ii]); });
      ids.forEach(function (id, jj) {
        if (!nullVecs.length) { dofs[id] = 0; return; }
        var P = [];
        for (var a = 0; a < 6; a++) {
          P.push([]);
          for (var b = 0; b < 6; b++) {
            var s2 = 0;
            nullVecs.forEach(function (v) { s2 += v[6 * jj + a] * v[6 * jj + b]; });
            P[a].push(s2);
          }
        }
        dofs[id] = eigSym(P).values.filter(function (v) { return v > 1e-7; }).length;
      });
    }
    var compOut = comps.map(function (c, idx) {
      return { id: c.id, name: c.name, index: idx, fixed: !!c.fixed, dof: dofs[c.id], underDefined: dofs[c.id] > 0, error: null };
    });
    return { transforms: transforms, mates: mateOut, components: compOut };
  }

  // ------------------------------------------------------------------ rebuild
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function buildPart(source) {
    var entry = { model: null, build: null, error: null };
    try {
      entry.model = partModel(source);
      entry.build = Kernel.rebuild(entry.model);
      if (!entry.build || !entry.build.body || !entry.build.body.polygons.length) entry.error = 'Part has no solid body';
      else {
        var errs = entry.build.errors && Object.keys(entry.build.errors);
        if (errs && errs.length) entry.warning = 'Part has rebuild errors: ' + entry.build.errors[errs[0]];
      }
    } catch (e) {
      entry.error = e.message || String(e);
    }
    return entry;
  }

  function rebuild(model, cache) {
    var t0 = now();
    ensureLists(model);
    cache = cache || {};
    var newCache = {}, partBuilds = {}, errors = {}, warnings = {}, entries = {};
    model.components.forEach(function (c) {
      var key = JSON.stringify(c.source);
      var entry = newCache[key] || cache[key] || buildPart(c.source);
      newCache[key] = entry;
      entries[c.id] = entry;
      if (entry.build) partBuilds[c.id] = entry.build;
      if (entry.error) errors[c.id] = entry.error;
      else if (entry.warning) warnings[c.id] = entry.warning;
    });
    var sol;
    try { sol = solve(model, partBuilds); } catch (e) {
      sol = { transforms: {}, mates: {}, components: model.components.map(function (c, i) { return { id: c.id, name: c.name, index: i, fixed: !!c.fixed, dof: c.fixed ? 0 : 6, underDefined: !c.fixed, error: null }; }) };
      model.components.forEach(function (c) { sol.transforms[c.id] = tf(c.transform); });
      errors.solver = 'Mate solver failed: ' + (e.message || e);
    }
    // write the solved transforms back (the model keeps solved positions)
    model.components.forEach(function (c) {
      var T = sol.transforms[c.id];
      if (T) c.transform = { position: T.position.slice(), rotation: T.rotation.slice() };
    });
    Object.keys(sol.mates).forEach(function (id) { if (sol.mates[id].error) errors[id] = sol.mates[id].error; });
    sol.components.forEach(function (co) { co.error = errors[co.id] || null; });
    // world-space bodies, one per component (an empty CSG keeps indices aligned when a part failed)
    var bodies = model.components.map(function (c) {
      var b = partBuilds[c.id] && partBuilds[c.id].body;
      if (!b || entries[c.id].error) return CSG.fromPolygons([]);
      var T = tf(c.transform), R = T.rotation, P = T.position;
      return b.transform(function (v) {
        return new CSG.Vector(R[0] * v.x + R[1] * v.y + R[2] * v.z + P[0], R[3] * v.x + R[4] * v.y + R[5] * v.z + P[1], R[6] * v.x + R[7] * v.y + R[8] * v.z + P[2]);
      }, false);
    });
    var body = bodies.length ? Kernel.combineBodies(bodies) : null;
    return {
      assembly: true, body: body, bodies: bodies,
      bodyFeatures: model.components.map(function (c) { return c.id; }),
      bodyNames: model.components.map(function (c) { return c.name; }),
      components: sol.components, mates: sol.mates, errors: errors, warnings: warnings,
      partBuilds: partBuilds, cache: newCache, equations: {}, equationErrors: {}, time: now() - t0
    };
  }

  // ------------------------------------------------------------------ picking
  function r6(x) { var r = Math.round(x * 1e6) / 1e6; return Math.abs(r) < 1e-9 ? 0 : r; }

  function refFromPick(model, build, faceIndex, worldPoint, mesh) {
    if (!model || !build || !worldPoint) return null;
    var face = mesh && mesh.faces ? mesh.faces[faceIndex] : null;
    var idx = face ? (face.body || 0) : -1;
    var comp = model.components[idx];
    if (!comp) return null;
    var T = tf(comp.transform), p = inverseTransformPoint(T, worldPoint);
    var geom = partGeom(build.partBuilds && build.partBuilds[comp.id]);
    var lp = p.map(r6);
    if (!geom) return { component: comp.id, face: lp };
    var ln = face ? matTVec(T.rotation, face.normal) : null;
    // the local patch under the pick: nearest, preferring one with the picked face's normal
    var list = patchesByDistance(geom, p), best = null;
    for (var i = 0; i < list.length && i < 12; i++) {
      if (!ln || dot(list[i].pt.normal, ln) > 1 - 1e-6) { best = list[i].pt; break; }
    }
    if (!best && list.length) best = list[0].pt;
    if (best && cylinderFromPatch(geom, best)) return { component: comp.id, cylinder: lp };
    return { component: comp.id, face: lp };
  }

  // ------------------------------------------------------------------ mass properties
  function massProps(model, build) {
    var comps = [], vol = 0, area = 0, mass = 0, mc = [0, 0, 0];
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    var entries = build && build.cache ? build.cache : {};
    model.components.forEach(function (c, i) {
      var pb = build && build.partBuilds && build.partBuilds[c.id];
      var e = entries[JSON.stringify(c.source)];
      var density = (e && e.model && e.model.density > 0) ? e.model.density : 7850;
      var geom = partGeom(pb);
      if (!geom || (e && e.error)) { comps.push({ id: c.id, name: c.name, index: i, volume: 0, mass: 0, density: density, centroid: [0, 0, 0] }); return; }
      var mp = Kernel.massProps(geom.mesh, density), T = tf(c.transform);
      var cen = transformPoint(T, mp.centroid), m = mp.volume * density;
      vol += mp.volume; area += mp.area; mass += m;
      mc = add(mc, scale(cen, m));
      comps.push({ id: c.id, name: c.name, index: i, volume: mp.volume, mass: m, density: density, centroid: cen });
      var wb = build.bodies && build.bodies[i];
      if (wb) wb.polygons.forEach(function (p) {
        p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
      });
    });
    if (!(min[0] <= max[0])) { min = [0, 0, 0]; max = [0, 0, 0]; }
    return { volume: vol, area: area, mass: mass, centroid: mass > 0 ? scale(mc, 1 / mass) : [0, 0, 0], bbox: { min: min, max: max }, components: comps };
  }

  // ------------------------------------------------------------------ script API
  function Builder(model) { this.model = model; ensureLists(model); }
  function compId(model, c) {
    if (c == null) return null;
    var comp = findComponent(model, c);
    if (!comp) throw new Error('Unknown component ' + JSON.stringify(c));
    return comp.id;
  }
  function builderRef(model, ref) {
    var r = JSON.parse(JSON.stringify(ref || {}));
    if (r.component != null) r.component = compId(model, r.component);
    return r;
  }
  Builder.prototype.name = function (s) { this.model.name = String(s); return this; };
  Builder.prototype.units = function (u) { this.model.units = String(u); return this; };
  Builder.prototype.insert = function (source, opts) { return insert(this.model, source, opts).id; };
  Builder.prototype.mate = function (type, a, b, opts) {
    return addMate(this.model, type, builderRef(this.model, a), builderRef(this.model, b), opts).id;
  };
  Builder.prototype.coincident = function (a, b, opts) { return this.mate('coincident', a, b, opts); };
  Builder.prototype.concentric = function (a, b, opts) { return this.mate('concentric', a, b, opts); };
  Builder.prototype.fix = function (c) { setFixed(this.model, compId(this.model, c), true); return this; };
  Builder.prototype.float = function (c) { setFixed(this.model, compId(this.model, c), false); return this; };

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('a', 'asm', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  function numList(a) { return '[' + a.map(function (x) { return String(r6(+x)); }).join(', ') + ']'; }
  function isIdentity(R) { for (var i = 0; i < 9; i++) if (Math.abs(r6(R[i]) - IDENTITY[i]) > 0) return false; return true; }
  function sourceText(src) {
    if (src.example != null) return '{ example: ' + JSON.stringify(src.example) + ' }';
    if (src.script != null) return '{ script: ' + JSON.stringify(src.script) + ' }';
    return '{ model: ' + JSON.stringify(src.model) + ' }';
  }
  function refText(ref, varOf) {
    var parts = [];
    if (ref.component != null) parts.push('component: ' + (varOf[ref.component] || JSON.stringify(ref.component)));
    ['face', 'cylinder'].forEach(function (k) { if (ref[k]) parts.push(k + ': ' + numList(ref[k])); });
    ['plane', 'axis'].forEach(function (k) { if (ref[k] != null) parts.push(k + ': ' + JSON.stringify(ref[k])); });
    return '{ ' + parts.join(', ') + ' }';
  }

  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil (assembly)', 'a.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units || 'mm') + ');'];
    var varOf = {};
    (model.components || []).forEach(function (c, i) {
      var v = 'c' + c.id;
      varOf[c.id] = v;
      var T = tf(c.transform), opts = ['name: ' + JSON.stringify(c.name)];
      if (c.fixed) opts.push('fixed: true');
      else if (i === 0) opts.push('fixed: false');
      if (T.position.some(function (x) { return r6(x) !== 0; })) opts.push('position: ' + numList(T.position));
      if (!isIdentity(T.rotation)) opts.push('rotation: ' + numList(T.rotation));
      out.push('var ' + v + ' = a.insert(' + sourceText(c.source || {}) + ', { ' + opts.join(', ') + ' });');
    });
    (model.mates || []).forEach(function (m) {
      var opts = ['name: ' + JSON.stringify(m.name)];
      if (m.alignment && m.alignment !== defaultAlignment(m)) opts.push('alignment: ' + JSON.stringify(m.alignment));
      if (m.suppressed) opts.push('suppressed: true');
      out.push('a.mate(' + JSON.stringify(m.type) + ', ' + refText(m.a, varOf) + ', ' + refText(m.b, varOf) + ', { ' + opts.join(', ') + ' });');
    });
    return out.join('\n') + '\n';
  }

  return {
    IDENTITY: IDENTITY,
    isAssembly: isAssembly, newAssembly: newAssembly, partModel: partModel,
    insert: insert, addMate: addMate, removeComponent: removeComponent, removeMate: removeMate,
    findComponent: findComponent, findMate: findMate, setFixed: setFixed, componentIndex: componentIndex,
    rebuild: rebuild, solve: solve, resolveRef: resolveRef, refFromPick: refFromPick, massProps: massProps,
    transformPoint: transformPoint, inverseTransformPoint: inverseTransformPoint, transformDir: transformDir,
    Builder: Builder, runScript: runScript, isAssemblyScript: isAssemblyScript, generateScript: generateScript,
    defaultAlignment: defaultAlignment, findCylinder: function (build, p) { var g = partGeom(build); return g ? findCylinder(g, p) : null; }
  };
})();
