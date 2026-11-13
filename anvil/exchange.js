// exchange.js — Anvil's neutral-format exchange: OBJ, 3MF and STEP AP214 export; STEP, STL, OBJ and 3MF import.
// Plain script (no modules): defines the global `Exchange`. Loaded after csg.js and kernel.js (and in worker.js); no DOM,
// no three.js. `Assembly` is used only when an assembly document is exported, and looked up at call time.
//
// Exports work on "document parts": a part document is one part (its separate solid bodies), an assembly is one part per
// distinct component source plus one instance (component) per placement. Every body is first turned into a watertight
// triangle mesh (bodyMesh: vertices welded, T-junctions left by the CSG booleans split, each polygon fanned) so that
// OBJ, 3MF and STEP all describe closed, manifold shells.
//   exportOBJ(model, build?, opts?)  -> OBJ text: one `o` group per body (per component body in an assembly), `vn` per
//                                       planar face, `usemtl` per colour (exportMTL gives the matching .mtl text)
//   export3MF(model, build?, opts?)  -> Uint8Array of a 3MF package (stored zip): 3D/3dmodel.model in the model's units,
//                                       one mesh object per body, assemblies as build items with transforms
//   exportSTEP(model, build?, opts?) -> STEP AP214 text: one MANIFOLD_SOLID_BREP per body (CLOSED_SHELL of ADVANCED_FACEs
//                                       on PLANEs and, for true curves, CYLINDRICAL / CONICAL / SPHERICAL / TOROIDAL
//                                       surfaces, B_SPLINE_SURFACE_WITH_KNOTS for a body that is one loft through 3+
//                                       sections; LINE, CIRCLE and B-spline EDGE_CURVEs), products named after the parts,
//                                       assemblies as NEXT_ASSEMBLY_USAGE_OCCURRENCEs with placements
// Imports turn a file into solids ({ name, positions: [x, y, z, …], triangles: [i, j, k, …], curves? }, outward, in the
// target model's units; `curves` holds the analytic surface records of a STEP file's curved faces, see curvesOf):
//   importSTEP(text, opts?), importSTL(data, opts?), importOBJ(text, opts?), import3MF(bytes, opts?)
//   importFile(fileName, data, opts?) -> { format, name, file, units, solids, warnings, stats } by extension (or content);
//   opts.units: the target model's 'mm' | 'in' (default mm; 'auto' keeps a STEP / 3MF file's inches), opts.sourceUnits:
//   what an STL / OBJ (unitless) is in ('mm' default, 'in', 'cm', 'm')
// An imported file becomes an `import` feature ("Imported1") in the FeatureManager: see importFeature and the kernel hook
// at the end of this file.
var Exchange = (function () {
  'use strict';
  var K = Kernel;
  var VERSION = '1';

  // ------------------------------------------------------------------ small vector helpers (double precision)
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-300 ? scale(a, 1 / l) : [0, 0, 0]; }
  var IDENTITY = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] };
  function tf(T) {
    T = T || {};
    return { rotation: T.rotation && T.rotation.length === 9 ? T.rotation.map(Number) : IDENTITY.rotation.slice(), position: T.position ? T.position.map(Number) : [0, 0, 0] };
  }
  function tfPoint(T, p) { var R = T.rotation, P = T.position; return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + P[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + P[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + P[2]]; }
  function tfDir(T, d) { var R = T.rotation; return [R[0] * d[0] + R[1] * d[1] + R[2] * d[2], R[3] * d[0] + R[4] * d[1] + R[5] * d[2], R[6] * d[0] + R[7] * d[1] + R[8] * d[2]]; }
  function tfCompose(A, B) { // A ∘ B: first B, then A
    var R = [], a = A.rotation, b = B.rotation;
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) R.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
    return { rotation: R, position: tfPoint(A, B.position) };
  }
  function tfInverse(T) {
    var R = T.rotation, Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    var q = { rotation: Rt, position: [0, 0, 0] };
    q.position = scale(tfPoint(q, T.position), -1);
    return q;
  }
  function isIdentity(T) {
    for (var i = 0; i < 9; i++) if (Math.abs(T.rotation[i] - IDENTITY.rotation[i]) > 1e-12) return false;
    return Math.abs(T.position[0]) + Math.abs(T.position[1]) + Math.abs(T.position[2]) < 1e-12;
  }

  // Number text: 15 significant digits for STEP (exact round trip of doubles that came from short decimals), 12 for the
  // mesh formats; values within 1e-12 of zero are written as 0.
  function numText(x, digits) {
    x = +x;
    if (!isFinite(x) || Math.abs(x) < 1e-12) return '0';
    return String(Number(x.toPrecision(digits || 12)));
  }
  function stepReal(x) {
    var s = numText(x, 15), e = s.indexOf('e');
    if (e >= 0) {
      var m = s.slice(0, e), ex = s.slice(e + 1);
      if (m.indexOf('.') < 0) m += '.';
      return m + 'E' + (ex.charAt(0) === '+' ? ex.slice(1) : ex);
    }
    return s.indexOf('.') < 0 ? s + '.' : s;
  }
  function stepString(s) {
    // Part 21 strings: quotes doubled, backslashes doubled, non-ASCII as \X2\hhhh\X0\
    var out = '';
    String(s == null ? '' : s).split('').forEach(function (ch) {
      var c = ch.charCodeAt(0);
      if (ch === '\'') out += '\'\'';
      else if (ch === '\\') out += '\\\\';
      else if (c < 32 || c > 126) out += '\\X2\\' + ('000' + c.toString(16).toUpperCase()).slice(-4) + '\\X0\\';
      else out += ch;
    });
    return '\'' + out + '\'';
  }
  function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function safeName(s) { return String(s || 'part').replace(/[^\w\-]+/g, '_'); }

  // colour '#rrggbb' (or '#rgb') -> [r, g, b] in 0..1, or null
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    var m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(c.trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function colorHex(rgb) {
    return '#' + rgb.map(function (v) { var n = Math.max(0, Math.min(255, Math.round(v * 255))); return ('0' + n.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  // a part's display colour: its library material's appearance (materials.js) when it has one, else the part colour
  function hasMaterials() { return typeof Materials !== 'undefined' && Materials && Materials.bodyMaterial; }
  function partColor(model) {
    if (!model) return null;
    var lib = hasMaterials() && model.material ? Materials.find(model.material) : null;
    var c = model.color || (lib && lib.color);
    // (BW) an old part's default grey (or no colour) exports as the current neutral default (Materials.displayColor)
    if (typeof Materials !== 'undefined' && Materials && Materials.displayColor) c = Materials.displayColor(c);
    return parseColor(c) ? c : null;
  }
  // bodyMat(model, build, i) -> { name, color } of body i: its own material (model.bodyMaterials, by the feature that
  // made the body), else the part's material (model.material), else just the part colour; name null without a material
  function bodyMat(model, build, i) {
    if (hasMaterials()) {
      var bm = Materials.bodyMaterial(model, build, i);
      return { name: bm.name || null, color: parseColor(bm.color) ? bm.color : partColor(model) };
    }
    return { name: typeof model.material === 'string' ? model.material : null, color: partColor(model) };
  }

  // ------------------------------------------------------------------ watertight body meshes
  // bodyMesh(csg | { polygons }) -> { positions: [x,y,z,…], triangles: [i,j,k,…], faces: [{ normal, w, tris: [t…] }],
  //   openEdges, volume }
  // Vertices are welded on a 1e-6 grid; a polygon edge that has another vertex lying on it (a T-junction left by a CSG
  // split in the neighbouring face) is split there, so each edge is shared by exactly two triangles in a closed body.
  // Polygons with collinear vertices are fanned from their centroid (no zero-area triangles); others from vertex 0.
  // `faces` groups the triangles by plane (the planar faces a B-rep export writes).
  var WELD = 1e6;
  function wkey(x, y, z) { return Math.round(x * WELD) + ',' + Math.round(y * WELD) + ',' + Math.round(z * WELD); }
  function bodyMesh(body) {
    var pos = [], vmap = new Map(), polys = [], wq = [];
    // rfHV: the weld grid cell (wkey's three rounded numbers) is looked up under a small-integer hash, the bucket
    // compared number by number (wq[i] = vertex i's cell): the same vertices as the wkey strings, far cheaper
    function vid(x, y, z) {
      var rx = Math.round(x * WELD), ry = Math.round(y * WELD), rz = Math.round(z * WELD);
      var h = (Math.imul(rx | 0, 73856093) ^ Math.imul(ry | 0, 19349663) ^ Math.imul(rz | 0, 83492791) ^ Math.imul((rx / 4294967296) | 0, 2654435761) ^ Math.imul((ry / 4294967296) | 0, 40503) ^ Math.imul((rz / 4294967296) | 0, 2246822519)) & 0x3fffffff;
      var l = vmap.get(h), i;
      if (l) for (var j = 0; j < l.length; j++) { i = l[j]; if (wq[i * 3] === rx && wq[i * 3 + 1] === ry && wq[i * 3 + 2] === rz) return i; }
      i = pos.length / 3; pos.push(x, y, z); wq.push(rx, ry, rz);
      if (l) l.push(i); else vmap.set(h, [i]);
      return i;
    }
    (body && body.polygons || []).forEach(function (p, pi) {
      var idx = [];
      p.vertices.forEach(function (v) {
        var i = vid(v.pos.x, v.pos.y, v.pos.z);
        if (idx[idx.length - 1] !== i) idx.push(i);
      });
      while (idx.length > 1 && idx[0] === idx[idx.length - 1]) idx.pop();
      if (idx.length >= 3) {
        var q = { idx: idx, n: [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z], w: p.plane.w, src: pi };
        if (p.surf) q.srf = p.surf; // analytic surface record (true curves): carried to mesh.triSurf
        polys.push(q);
      }
    });
    splitTJunctions(pos, polys);
    dropSpikes(polys);
    fillSliverLoops(pos, polys);
    return fanPolygons(pos, polys);
  }
  // rfGH (the 968 hole grid): where chords of two holes lie within the BSP's 1e-5 of one plane, a face's corner lands up
  // to ~2e-5 from the wall's: a hair-thin wedge 2.5e-2 long is left open at that corner, on the top and on the bottom.
  // No vertex needs to move: a small closed loop of open edges no wider than SLIVER is simply closed with a face of its
  // own. Volume and area change by the sliver's (1e-7 of a square unit); bigger holes in a mesh stay open, as they must.
  var SLIVER = 5e-5;
  function fillSliverLoops(pos, polys) {
    var open = openEdgeList(polys);
    if (!open.length || open.length > 200) return;
    var from = {}, used = {};
    open.forEach(function (e) { (from[e.a] = from[e.a] || []).push(e); });
    function P(i) { return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; }
    open.forEach(function (e0) {
      if (used[e0.a + '>' + e0.b]) return;
      var loop = [e0.a], at = e0.b;
      while (at !== e0.a && loop.length <= 6 && from[at] && from[at].length === 1) { loop.push(at); at = from[at][0].b; }
      if (at !== e0.a || loop.length < 3 || loop.length > 6) return;
      // width: the farthest corner from the line through the two farthest corners
      var far = 0, A = P(loop[0]), B = A, wid = 0;
      loop.forEach(function (a) { loop.forEach(function (b) { var d = len(sub(P(a), P(b))); if (d > far) { far = d; A = P(a); B = P(b); } }); });
      if (far < 1e-12) return;
      var u = scale(sub(B, A), 1 / far);
      loop.forEach(function (a) { var w = sub(P(a), A); wid = Math.max(wid, len(sub(w, scale(u, dot(w, u))))); });
      if (wid > SLIVER) return;
      var idx = loop.slice().reverse(), area = [0, 0, 0];
      for (var i = 1; i + 1 < idx.length; i++) area = add(area, cross(sub(P(idx[i]), P(idx[0])), sub(P(idx[i + 1]), P(idx[0]))));
      var al = len(area);
      if (al < 1e-30) return;
      var n = scale(area, 1 / al);
      polys.push({ idx: idx, n: n, w: dot(n, P(idx[0])) });
      loop.forEach(function (v, k) { used[v + '>' + loop[(k + 1) % loop.length]] = true; });
    });
  }
  // rfGH (the false "zero-thickness" on 648 / 800 hole grids): two split points of one corner can land just over the
  // weld apart (P, P' 1.5e-6 here). P is a real T-junction on one edge of a thin polygon ending at P', but it also lies
  // within tol of that polygon's other edge at P', so splitTJunctions puts it into both and the outline goes … P, P', P
  // …: there and back along a zero-area spike. The centroid fan then uses edges four times, which reads as a solid
  // touching itself. a, b, a is one edge in both directions in one polygon, so taking it out leaves every other edge's
  // pairing as it was (the rest of the mesh keeps P–P' through the polygons that really have it).
  function dropSpikes(polys) {
    polys.forEach(function (p) {
      var idx = p.idx, again = idx.length >= 4;
      while (again) {
        again = false;
        for (var i = 0; i < idx.length && idx.length >= 4; i++) {
          var n = idx.length, a = (i + n - 1) % n, c = (i + 1) % n;
          if (idx[a] !== idx[c]) continue;
          var hi = Math.max(i, c), lo = Math.min(i, c);   // i and the vertex after it: the far end of the spike and its twin
          idx.splice(hi, 1); idx.splice(lo, 1);
          again = true;
          break;
        }
      }
    });
  }
  // rfHV: directed edges as compressed rows (out[a] = dst[off[a] .. off[a + 1])), built from parallel from / to lists.
  // Replaces string-keyed "a>b" maps, which took most of bodyMesh's time on big perforated panels (1M triangles).
  // -> { nv, off, dst, has(a, b) }
  function dirRows(from, to, m) {
    var nv = 0, i;
    for (i = 0; i < m; i++) { if (from[i] >= nv) nv = from[i] + 1; if (to[i] >= nv) nv = to[i] + 1; }
    var off = new Int32Array(nv + 1), dst = new Int32Array(m);
    for (i = 0; i < m; i++) off[from[i] + 1]++;
    for (i = 0; i < nv; i++) off[i + 1] += off[i];
    var fill = off.slice(0, nv);
    for (i = 0; i < m; i++) dst[fill[from[i]]++] = to[i];
    return { nv: nv, off: off, dst: dst, has: function (a, b) {
      if (a >= nv) return false;
      for (var j = off[a], e = off[a + 1]; j < e; j++) if (dst[j] === b) return true;
      return false;
    } };
  }
  function polyRows(polys) {
    var m = 0;
    polys.forEach(function (p) { m += p.idx.length; });
    var from = new Int32Array(m), to = new Int32Array(m), k = 0;
    polys.forEach(function (p) { var idx = p.idx, n = idx.length; for (var i = 0; i < n; i++, k++) { from[k] = idx[i]; to[k] = idx[(i + 1) % n]; } });
    return dirRows(from, to, m);
  }
  // directed edge set -> the edges without a reverse twin, and the vertices they touch
  function openEdgeList(polys) {
    var D = polyRows(polys), open = [];
    polys.forEach(function (p, pi) {
      var idx = p.idx, n = idx.length;
      for (var i = 0; i < n; i++) { var a = idx[i], b = idx[(i + 1) % n]; if (!D.has(b, a)) open.push({ p: pi, i: i, a: a, b: b }); }
    });
    return open;
  }
  // rfHV: a uniform grid over splitTJunctions' candidate vertices (cand[k], sorted by x). query(A, B, tol) -> how many
  // k it wrote to .buf (ascending, so in the x-sorted order the band scan visits them): every candidate in the cells the
  // edge's box ±2 tol touches; -1 when that box spans too many cells (a long edge: the caller scans its x band as
  // before). Every vertex the band scan can accept lies within tol of the edge, so inside that box: the result is
  // unchanged. The band alone went quadratic on a panel whose holes line up in columns (each edge of a column scanned
  // the whole column: 6 s of bodyMesh's 8.5 s at 1000 holes).
  function candGrid(pos, cand, open) {
    if (cand.length < 256) return null;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], lens = new Float64Array(open.length), i, c;
    cand.forEach(function (v) { for (var q = 0; q < 3; q++) { var x = pos[v * 3 + q]; if (x < lo[q]) lo[q] = x; if (x > hi[q]) hi[q] = x; } });
    open.forEach(function (e, j) { lens[j] = Math.hypot(pos[e.b * 3] - pos[e.a * 3], pos[e.b * 3 + 1] - pos[e.a * 3 + 1], pos[e.b * 3 + 2] - pos[e.a * 3 + 2]); });
    lens.sort();   // cells half the median open edge (the mean is dragged up by a few long edges)
    var span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], diag = Math.hypot(span[0], span[1], span[2]);
    if (!(diag > 0)) return null;
    var cs = Math.max(lens[lens.length >> 1] / 2, diag * 1e-6);
    var N = [0, 0, 0];
    for (var guard = 0; guard < 60; guard++, cs *= 2) {
      for (c = 0; c < 3; c++) N[c] = Math.floor(span[c] / cs) + 1;
      if (N[0] * N[1] * N[2] <= 4 * cand.length + 64) break;
    }
    // compressed cells: start[cell] .. start[cell + 1] in ks, filled in k order (so each cell's list is ascending)
    var N0 = N[0], N1 = N[1], N2 = N[2], lo0 = lo[0], lo1 = lo[1], lo2 = lo[2], nc = N0 * N1 * N2;
    function cell(x, l0, n) { var f = Math.floor((x - l0) / cs); return f < 0 ? 0 : f >= n ? n - 1 : f; }
    var cellOf = new Int32Array(cand.length), start = new Int32Array(nc + 1), ks = new Int32Array(cand.length);
    for (i = 0; i < cand.length; i++) {
      var v = cand[i];
      cellOf[i] = cell(pos[v * 3], lo0, N0) + N0 * (cell(pos[v * 3 + 1], lo1, N1) + N1 * cell(pos[v * 3 + 2], lo2, N2));
      start[cellOf[i] + 1]++;
    }
    for (i = 0; i < nc; i++) start[i + 1] += start[i];
    var fill = start.slice(0, nc);
    for (i = 0; i < cand.length; i++) ks[fill[cellOf[i]]++] = i;
    var buf = new Int32Array(64);
    function query(ax, ay, az, bx, by, bz, tol) {
      var t2 = 2 * tol;
      var x0 = cell(Math.min(ax, bx) - t2, lo0, N0), x1 = cell(Math.max(ax, bx) + t2, lo0, N0);
      var y0 = cell(Math.min(ay, by) - t2, lo1, N1), y1 = cell(Math.max(ay, by) + t2, lo1, N1);
      var z0 = cell(Math.min(az, bz) - t2, lo2, N2), z1 = cell(Math.max(az, bz) + t2, lo2, N2);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 512) return -1;
      var n = 0, hit = 0;
      for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var cc = x + N0 * (y + N1 * z), s0 = start[cc], s1 = start[cc + 1];
        if (s0 === s1) continue;
        hit++;
        if (n + s1 - s0 > buf.length) { var nb = new Int32Array(Math.max(buf.length * 2, n + s1 - s0)); nb.set(buf); buf = nb; query.buf = buf; }
        for (var j = s0; j < s1; j++) buf[n++] = ks[j];
      }
      if (hit > 1) buf.subarray(0, n).sort();
      return n;
    }
    query.buf = buf;
    return query;
  }
  function splitTJunctions(pos, polys, tol0) {
    tol0 = tol0 || 1e-6;
    for (var pass = 0; pass < 3; pass++) {
      var open = openEdgeList(polys);
      if (!open.length) return;
      // candidate vertices: endpoints of open edges, sorted by x for a range search
      var seen = {}, cand = [];
      open.forEach(function (e) { [e.a, e.b].forEach(function (v) { if (!seen[v]) { seen[v] = true; cand.push(v); } }); });
      cand.sort(function (u, v) { return pos[u * 3] - pos[v * 3]; });
      var xs = cand.map(function (v) { return pos[v * 3]; });
      var any = false;   // e.ins: [{ t, v }] (rfHV: on the open edge itself, was an object of "poly:edge" keys)
      var grid = candGrid(pos, cand, open);
      // rfHV: the vector arithmetic written out (same operations, same order: bit-identical t and distances)
      open.forEach(function (e) {
        var A0 = pos[e.a * 3], A1 = pos[e.a * 3 + 1], A2 = pos[e.a * 3 + 2], B0 = pos[e.b * 3], B1 = pos[e.b * 3 + 1], B2 = pos[e.b * 3 + 2];
        var d0 = B0 - A0, d1 = B1 - A1, d2 = B2 - A2, L = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
        if (L < 1e-12) return;
        var iL = 1 / L, u0 = d0 * iL, u1 = d1 * iL, u2 = d2 * iL, tol = tol0 + L * 1e-9;
        var lo = Math.min(A0, B0) - tol, hi = Math.max(A0, B0) + tol;
        var kn = grid ? grid(A0, A1, A2, B0, B1, B2, tol) : -1, ks = kn >= 0 ? grid.buf : null, s = ks ? 0 : lowerBound(xs, lo);
        if (!ks) kn = cand.length;
        for (var kk = s; kk < kn; kk++) {
          var k = ks ? ks[kk] : kk;
          if (xs[k] < lo) continue;
          if (xs[k] > hi) { if (ks) continue; break; }
          var v = cand[k];
          if (v === e.a || v === e.b) continue;
          var w0 = pos[v * 3] - A0, w1 = pos[v * 3 + 1] - A1, w2 = pos[v * 3 + 2] - A2, t = w0 * u0 + w1 * u1 + w2 * u2;
          if (t <= tol || t >= L - tol) continue;
          var p0 = w0 - u0 * t, p1 = w1 - u1 * t, p2 = w2 - u2 * t;
          if (Math.sqrt(p0 * p0 + p1 * p1 + p2 * p2) > tol) continue;
          (e.ins || (e.ins = [])).push({ t: t, v: v });
          any = true;
        }
      });
      if (!any) return;
      // apply from the last edge of a polygon backwards so indices stay valid (open runs by polygon, then edge)
      for (var oi = open.length - 1; oi >= 0; oi--) {
        var oe = open[oi];
        if (!oe.ins) continue;
        var p = polys[oe.p], i = oe.i;
        var list = oe.ins.sort(function (x, y) { return x.t - y.t; }), vs = [];
        list.forEach(function (it) { if (vs[vs.length - 1] !== it.v) vs.push(it.v); });
        Array.prototype.splice.apply(p.idx, [i + 1, 0].concat(vs));
        p.split = true;
      }
    }
  }
  function lowerBound(arr, x) { var lo = 0, hi = arr.length; while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }
  // rfGH (the 800 hole grid): two polygons meeting on a run a, c, b that is straight to within the weld may each fan a
  // triangle a, b, c from the same three vertices, one wound each way: a fold of no width whose long side, a mere fan
  // diagonal, counts four uses. Both go: their three edges cancel in pairs, so no edge opens, and their volumes cancel.
  // Only triangles of polygons a T-junction split can do this. -> the triangle list; faces and the per-triangle lists
  // (triSurf, triPoly) renumbered
  function dropFoldedPairs(tris, splitT, faces, perTri) {
    if (splitT.length < 2) return tris;
    // rfHV: seen[lo] = the live triangles [s, u, t, …] whose lowest vertex is lo (was a Map of "lo_s_u" strings)
    var seen = [], dead = null;
    splitT.forEach(function (t) {
      var a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2], lo = Math.min(a, b, c), s, u;
      if (lo === a) { s = b; u = c; } else if (lo === b) { s = c; u = a; } else { s = a; u = b; }
      var l = seen[lo] || (seen[lo] = []), j;
      for (j = 0; j < l.length; j += 3) if (l[j] === u && l[j + 1] === s) break;   // the twin, wound the other way
      if (j < l.length) { (dead = dead || {})[t] = true; dead[l[j + 2]] = true; l.splice(j, 3); return; }
      for (j = 0; j < l.length; j += 3) if (l[j] === s && l[j + 1] === u) break;   // the same triangle again: replaces it
      if (j < l.length) l[j + 2] = t; else l.push(s, u, t);
    });
    if (!dead) return tris;
    var out = [], map = new Int32Array(tris.length / 3), n = 0;
    for (var t = 0; t * 3 < tris.length; t++) {
      if (dead[t]) { map[t] = -1; continue; }
      map[t] = n;
      perTri.forEach(function (list) { list[n] = list[t]; });
      n++;
      out.push(tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]);
    }
    perTri.forEach(function (list) { list.length = n; });
    for (var f = faces.length - 1; f >= 0; f--) {
      faces[f].tris = faces[f].tris.map(function (q) { return map[q]; }).filter(function (q) { return q >= 0; });
      if (!faces[f].tris.length) faces.splice(f, 1);
    }
    return out;
  }
  // A polygon's `srf` (a surface record or tag) is copied to every triangle made from it: mesh.triSurf[t] (null for
  // untagged polygons); triSurf is only present when some polygon has one.
  function fanPolygons(pos, polys) {
    var tris = [], faces = [], fmap = {}, vol = 0, splitT = [], triPoly = [];
    var triSurf = polys.some(function (p) { return p.srf != null; }) ? [] : null;
    function P(i) { return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; }
    polys.forEach(function (p) {
      var idx = p.idx, n = idx.length, collinear = false;
      // rfHV: the collinear test and the volume below are len(cross(sub(b, a), sub(c, b))) etc. written out, the same
      // operations in the same order (bit-identical), without allocating arrays per corner
      if (n > 3) for (var i = 0; i < n && !collinear; i++) {
        var ia = idx[(i + n - 1) % n] * 3, ib = idx[i] * 3, ic = idx[(i + 1) % n] * 3;
        var u0 = pos[ib] - pos[ia], u1 = pos[ib + 1] - pos[ia + 1], u2 = pos[ib + 2] - pos[ia + 2];
        var v0 = pos[ic] - pos[ib], v1 = pos[ic + 1] - pos[ib + 1], v2 = pos[ic + 2] - pos[ib + 2];
        var w0 = u1 * v2 - u2 * v1, w1 = u2 * v0 - u0 * v2, w2 = u0 * v1 - u1 * v0;
        var cr = Math.sqrt(w0 * w0 + w1 * w1 + w2 * w2), ref = Math.sqrt(u0 * u0 + u1 * u1 + u2 * u2) * Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2);
        if (cr <= ref * 1e-9) collinear = true;
      }
      var fk = Math.round(p.n[0] * 1e6) + ',' + Math.round(p.n[1] * 1e6) + ',' + Math.round(p.n[2] * 1e6) + ',' + Math.round(p.w * 1e5);
      var face = fmap[fk];
      if (!face) { face = fmap[fk] = { normal: p.n.slice(), w: p.w, tris: [] }; faces.push(face); }
      function tri(a, b, c) {
        var t = tris.length / 3;
        tris.push(a, b, c); face.tris.push(t);
        if (p.split) splitT.push(t);
        triPoly.push(p.src != null ? p.src : -1);
        if (triSurf) triSurf.push(p.srf != null ? p.srf : null);
        var A = a * 3, B = b * 3, C = c * 3, b0 = pos[B], b1 = pos[B + 1], b2 = pos[B + 2], c0 = pos[C], c1 = pos[C + 1], c2 = pos[C + 2];
        vol += (pos[A] * (b1 * c2 - b2 * c1) + pos[A + 1] * (b2 * c0 - b0 * c2) + pos[A + 2] * (b0 * c1 - b1 * c0)) / 6;
      }
      if (n === 3) tri(idx[0], idx[1], idx[2]);
      else if (!collinear) for (var j = 1; j + 1 < n; j++) tri(idx[0], idx[j], idx[j + 1]);
      else {
        var cx = 0, cy = 0, cz = 0;
        idx.forEach(function (v) { cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2]; });
        var ci = pos.length / 3;
        pos.push(cx / n, cy / n, cz / n);
        for (var k = 0; k < n; k++) tri(ci, idx[k], idx[(k + 1) % n]);
      }
    });
    tris = dropFoldedPairs(tris, splitT, faces, triSurf ? [triPoly, triSurf] : [triPoly]);
    // open edges of the triangle mesh (0 for a closed body)
    var open = triOpenCount(tris);
    var res = { positions: pos, triangles: tris, faces: faces, openEdges: open, volume: vol, triPoly: triPoly };   // triPoly[t]: the body polygon of triangle t
    if (triSurf) res.triSurf = triSurf;
    return res;
  }
  // the distinct directed edges of a triangle list with no reverse twin (0 for a closed body)
  function triOpenCount(tris) {
    var m = tris.length, from = new Int32Array(m), to = new Int32Array(m), open = 0;
    for (var t = 0; t < m; t += 3) for (var e = 0; e < 3; e++) { from[t + e] = tris[t + e]; to[t + e] = tris[t + (e + 1) % 3]; }
    var D = dirRows(from, to, m), off = D.off, dst = D.dst;
    for (var a = 0; a < D.nv; a++) {
      for (var j = off[a]; j < off[a + 1]; j++) {
        var b = dst[j], dup = false;
        for (var q = off[a]; q < j && !dup; q++) dup = dst[q] === b;
        if (!dup && !D.has(b, a)) open++;
      }
    }
    return open;
  }
  function meshBounds(mesh, T) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], p = mesh.positions;
    var used = {};
    for (var t = 0; t < mesh.triangles.length; t++) used[mesh.triangles[t]] = true;
    Object.keys(used).forEach(function (k) {
      var i = +k, q = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
      if (T) q = tfPoint(T, q);
      for (var a = 0; a < 3; a++) { if (q[a] < min[a]) min[a] = q[a]; if (q[a] > max[a]) max[a] = q[a]; }
    });
    return { min: min, max: max };
  }

  // ------------------------------------------------------------------ document parts
  // docParts(model, build?) -> { name, units, assembly, parts: [{ name, color, bodies: [{ name, mesh }] }],
  //   instances: [{ part, name, transform }] }
  // A part document is one part placed once at the identity; an assembly has one part per distinct component source
  // (the BOM's identity) and one instance per component, in the solved transforms.
  function docParts(model, build) {
    var asm = model && model.type === 'assembly';
    if (!asm) {
      build = build || K.rebuild(model);
      var bodies = build.bodies && build.bodies.length ? build.bodies : (build.body && build.body.polygons.length ? [build.body] : []);
      var infos = K.bodyInfo({ bodies: bodies, bodyFeatures: build.bodyFeatures || [] }, model), used = {};
      var list = bodies.map(function (b, i) {
        var nm = bodies.length === 1 ? (model.name || 'Part1') : (infos[i] && infos[i].name) || ('Body' + (i + 1));
        if (used[nm]) { var n = 2; while (used[nm + '-' + n]) n++; nm = nm + '-' + n; }
        used[nm] = true;
        return { name: nm, mesh: bodyMesh(b), material: bodyMat(model, { bodies: bodies, bodyFeatures: build.bodyFeatures || [] }, i), src: { body: b, model: model, build: build } };
      });
      return { name: model.name || 'Part1', units: model.units === 'in' ? 'in' : 'mm', assembly: false,
        parts: [{ name: model.name || 'Part1', color: partColor(model), bodies: list }],
        instances: [{ part: 0, name: model.name || 'Part1', transform: tf(null) }] };
    }
    if (typeof Assembly === 'undefined') throw new Error('Assemblies need assembly.js');
    build = build && build.partBuilds ? build : Assembly.rebuild(model);
    var parts = [], byKey = {}, subs = [], subByKey = {};
    // An opposite-hand instance (Mirror Components, det R < 0) cannot be placed by a rigid transform (a STEP
    // AXIS2_PLACEMENT_3D is always right-handed): it gets its own left-hand part, the source mesh reflected in its local
    // YZ plane (F = diag(-1, 1, 1)), placed by the proper rotation R·F — world = R·F·(F·p) + P = R·p + P.
    function det3(R) { return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]); }
    function reflectX(b) { return b.transform(function (v) { return new CSG.Vector(-v.x, v.y, v.z); }, true); }
    function composeTf(A, B) { var R = A.rotation, Q = B.rotation, C = [], i, j; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) C.push(R[i * 3] * Q[j] + R[i * 3 + 1] * Q[3 + j] + R[i * 3 + 2] * Q[6 + j]); return { rotation: C, position: tfPoint(A, B.position) }; }
    // walk(assembly model, its build) -> { top: [{ part | sub, name, transform }] (this level), flat: [{ part, name,
    // transform }] (every part below, placed in this level's frame) }. A sub-assembly component (its part build is an
    // assembly build, see assembly.js) becomes one `subs` entry per distinct source (a Flexible one per instance, since
    // its inner layout is its own), placed like a part; the flat list composes the transforms down to the parts.
    function walk(m, b, prefix) {
      var top = [], flat = [];
      (m.components || []).forEach(function (c) {
        var pb = b.partBuilds && b.partBuilds[c.id], st = (b.components || []).filter(function (x) { return x.id === c.id; })[0];
        if (!pb || !pb.body || !pb.body.polygons.length || (st && (st.error || st.suppressed))) return;
        var T = tf(c.transform), mirrored = det3(T.rotation) < 0;
        if (pb.assembly && pb.model) {
          var sk = JSON.stringify(c.source) + (pb.flexible ? '#flexible:' + prefix + c.id : '');
          if (subByKey[sk] == null) {
            var w = walk(pb.model, pb, prefix + c.id + '/');
            subByKey[sk] = subs.length;
            subs.push({ name: (pb.model.name || 'SubAssem') + (pb.flexible ? ' (' + c.name + ', flexible)' : ''), instances: w.top, flat: w.flat });
          }
          var sub = subs[subByKey[sk]];
          if (!mirrored) top.push({ sub: subByKey[sk], name: c.name, transform: T });
          sub.flat.forEach(function (inst) {
            var fi = { part: inst.part, name: c.name + '/' + inst.name, transform: composeTf(T, inst.transform) };
            flat.push(fi);
            if (mirrored) top.push(fi);   // a mirrored sub-assembly is written as its parts
          });
          return;
        }
        var key = JSON.stringify(c.source) + (mirrored ? '#opposite-hand' : '');
        if (byKey[key] == null) {
          var pm = null;
          try { pm = Assembly.partModel(c.source); } catch (e) { pm = null; }
          var nm = pm && pm.name && pm.name !== 'Part1' ? pm.name : (c.source && (c.source.file || c.source.example)) || (pm && pm.name) || c.name;
          if (mirrored) nm += ' (opposite hand)';
          var pbodies = pb.bodies && pb.bodies.length ? pb.bodies : [pb.body];
          byKey[key] = parts.length;
          var pbuild = { bodies: pbodies, bodyFeatures: pb.bodyFeatures || [] };
          parts.push({ name: nm, color: partColor(pm), bodies: pbodies.map(function (bb, i) { return { name: pbodies.length === 1 ? nm : nm + '-Body' + (i + 1), mesh: bodyMesh(mirrored ? reflectX(bb) : bb), material: pm ? bodyMat(pm, pbuild, i) : { name: null, color: null }, src: pm && !mirrored ? { body: bb, model: pm, build: pb } : null }; }) });
        }
        if (mirrored) { var R = T.rotation; T = { rotation: [-R[0], R[1], R[2], -R[3], R[4], R[5], -R[6], R[7], R[8]], position: T.position }; }
        var inst = { part: byKey[key], name: c.name, transform: T };
        top.push(inst); flat.push(inst);
      });
      return { top: top, flat: flat };
    }
    var root = walk(model, build, ''), instances = root.flat;
    // sub-assemblies (children before the assemblies that use them): STEP writes each as its own product with
    // NEXT_ASSEMBLY_USAGE_OCCURRENCEs, 3MF as a components object; `instances` stays the flat list of placed parts
    if (subs.length) return { name: model.name || 'Assem1', units: model.units === 'in' ? 'in' : 'mm', assembly: true, parts: parts, instances: instances, top: root.top, subs: subs };
    return { name: model.name || 'Assem1', units: model.units === 'in' ? 'in' : 'mm', assembly: true, parts: parts, instances: instances };
  }

  // ------------------------------------------------------------------ materials of a document
  // materialTable(doc) -> { list: [{ id, name, color }], of(partIndex, body) -> entry | null }: one entry per distinct
  // (material name, colour) over every body; `id` is the OBJ / MTL name (the material's name, else the part's), `name`
  // the display name (the material, else the part). Bodies without a colour have no entry.
  function materialTable(doc) {
    var list = [], byKey = {}, used = {};
    function entry(part, body) {
      var m = body.material || { name: null, color: part.color }, c = m.color || part.color;
      if (!parseColor(c)) return null;
      var key = (m.name || '') + '|' + colorHex(parseColor(c)) + '|' + (m.name ? '' : part.name);
      if (byKey[key]) return byKey[key];
      var id = safeName(m.name || part.name).replace(/^_+|_+$/g, '') || 'material', k = 2;
      if (used[id]) { while (used[id + '_' + k]) k++; id = id + '_' + k; }
      used[id] = true;
      var e = byKey[key] = { id: id, name: m.name || part.name, material: m.name || null, color: c };
      list.push(e);
      return e;
    }
    doc.parts.forEach(function (part) { part.bodies.forEach(function (b) { b.mat = entry(part, b); }); });
    return { list: list, of: function (pi, body) { return body.mat || null; } };
  }

  // ------------------------------------------------------------------ OBJ export
  function exportOBJ(model, build, opts) {
    opts = opts || {};
    var doc = docParts(model, build);
    var mats = materialTable(doc), colored = mats.list.length > 0;
    var mtl = opts.mtl === false ? null : (opts.mtlName || safeName(doc.name) + '.mtl');
    var out = ['# ' + doc.name + ' — exported by Anvil (OBJ, units ' + doc.units + ')', '# ' + doc.instances.length + ' instance(s), ' + doc.parts.length + ' part(s)'];
    if (colored && mtl) out.push('mtllib ' + mtl);
    var vBase = 0, nBase = 0, usedNames = {};
    doc.instances.forEach(function (inst) {
      var part = doc.parts[inst.part], T = inst.transform;
      part.bodies.forEach(function (b) {
        var nm = safeName(doc.assembly ? inst.name + (part.bodies.length > 1 ? '_' + b.name : '') : b.name);
        if (usedNames[nm]) { var k = 2; while (usedNames[nm + '_' + k]) k++; nm = nm + '_' + k; }
        usedNames[nm] = true;
        out.push('o ' + nm, 'g ' + nm);
        if (colored && mtl && b.mat) out.push('usemtl ' + b.mat.id);
        var m = b.mesh, p = m.positions, nv = p.length / 3;
        for (var i = 0; i < nv; i++) {
          var q = tfPoint(T, [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
          out.push('v ' + numText(q[0]) + ' ' + numText(q[1]) + ' ' + numText(q[2]));
        }
        m.faces.forEach(function (f) { var n = norm(tfDir(T, f.normal)); out.push('vn ' + numText(n[0]) + ' ' + numText(n[1]) + ' ' + numText(n[2])); });
        m.faces.forEach(function (f, fi) {
          var ni = nBase + fi + 1;
          f.tris.forEach(function (t) {
            var a = m.triangles[t * 3] + vBase + 1, b2 = m.triangles[t * 3 + 1] + vBase + 1, c = m.triangles[t * 3 + 2] + vBase + 1;
            out.push('f ' + a + '//' + ni + ' ' + b2 + '//' + ni + ' ' + c + '//' + ni);
          });
        });
        vBase += nv; nBase += m.faces.length;
      });
    });
    return out.join('\n') + '\n';
  }
  function exportMTL(model, build) {
    var doc = docParts(model, build), out = ['# ' + doc.name + ' — materials exported by Anvil'];
    materialTable(doc).list.forEach(function (e) {
      var c = parseColor(e.color);
      out.push('', 'newmtl ' + e.id);
      if (e.material) out.push('# material: ' + e.material);
      out.push('Ka 0 0 0', 'Kd ' + c.map(function (v) { return numText(v, 6); }).join(' '), 'Ks 0.25 0.25 0.25', 'Ns 40', 'd 1', 'illum 2');
    });
    return out.join('\n') + '\n';
  }

  // ------------------------------------------------------------------ zip (stored) for 3MF packages
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(out);
  }
  function fromUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  // zip(files: [{ name, data: Uint8Array | string }]) -> Uint8Array (method 0, stored)
  function zip(files, date) {
    date = date || new Date(2026, 0, 1);
    var dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    var dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    var chunks = [], central = [], offset = 0;
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(head), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += head.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      var rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      chunks.push(new Uint8Array(rec), c.name);
      cdSize += rec.length + c.name.length;
    });
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = 0;
    chunks.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }
  // unzip(bytes) -> { name: Uint8Array } for stored entries; deflated entries are listed in `.deflated`
  function unzip(bytes) {
    bytes = toBytes(bytes);
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = {}, deflated = [];
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip package (no end of central directory).');
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged zip central directory.');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = fromUtf8(bytes.subarray(p + 46, p + 46 + nlen));
      var dataAt = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      if (method === 0) out[name] = bytes.subarray(dataAt, dataAt + csize);
      else deflated.push(name);
      p += 46 + nlen + xlen + clen;
    }
    out.deflated = deflated;
    return out;
  }
  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') { var b = new Uint8Array(data.length); for (var i = 0; i < data.length; i++) b[i] = data.charCodeAt(i) & 0xFF; return b; }
    var tag = Object.prototype.toString.call(data);
    if (tag === '[object ArrayBuffer]') return new Uint8Array(data);
    if (data && data.buffer && Object.prototype.toString.call(data.buffer) === '[object ArrayBuffer]') return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
    throw new Error('Expected bytes (ArrayBuffer or Uint8Array)');
  }

  // ------------------------------------------------------------------ 3MF export
  // 3MF matrix (row vector times 4x3): "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32"; our world = R · p + P
  function matrix3mf(T) {
    var R = T.rotation, P = T.position;
    return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8], P[0], P[1], P[2]].map(function (x) { return numText(x); }).join(' ');
  }
  function export3MF(model, build, opts) {
    opts = opts || {};
    var doc = docParts(model, build);
    var unit = doc.units === 'in' ? 'inch' : 'millimeter';
    var x = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<model unit="' + unit + '" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
      ' <metadata name="Title">' + xmlEsc(doc.name) + '</metadata>',
      ' <metadata name="Application">Anvil</metadata>',
      ' <resources>'];
    var nextId = 1, matId = null, mats = materialTable(doc);
    if (mats.list.length) {
      matId = nextId++;
      x.push('  <basematerials id="' + matId + '">');
      mats.list.forEach(function (e, i) { e.index = i; x.push('   <base name="' + xmlEsc(e.name) + '" displaycolor="' + colorHex(parseColor(e.color)) + 'FF"/>'); });
      x.push('  </basematerials>');
    }
    // one mesh object per body of every part; a part of an assembly also gets a components object that groups them
    var subObjectIds = [];
    var partObjects = doc.parts.map(function (part, pi) {
      var bodyIds = part.bodies.map(function (b) {
        var id = nextId++, m = b.mesh, p = m.positions, mat = b.mat ? ' pid="' + matId + '" pindex="' + b.mat.index + '"' : '';
        x.push('  <object id="' + id + '" type="model" name="' + xmlEsc(b.name) + '"' + mat + '>', '   <mesh>', '    <vertices>');
        for (var i = 0; i < p.length; i += 3) x.push('     <vertex x="' + numText(p[i]) + '" y="' + numText(p[i + 1]) + '" z="' + numText(p[i + 2]) + '"/>');
        x.push('    </vertices>', '    <triangles>');
        for (var t = 0; t < m.triangles.length; t += 3) x.push('     <triangle v1="' + m.triangles[t] + '" v2="' + m.triangles[t + 1] + '" v3="' + m.triangles[t + 2] + '"/>');
        x.push('    </triangles>', '   </mesh>', '  </object>');
        return id;
      });
      if (!doc.assembly) return { bodies: bodyIds };
      var gid = nextId++;
      x.push('  <object id="' + gid + '" type="model" name="' + xmlEsc(part.name) + '">', '   <components>');
      bodyIds.forEach(function (id) { x.push('    <component objectid="' + id + '"/>'); });
      x.push('   </components>', '  </object>');
      return { bodies: bodyIds, group: gid };
    });
    // sub-assemblies: a components object each (children first), holding its parts / sub-assemblies with transforms
    var subObjects = (doc.subs || []).map(function (sb) {
      var id = nextId++;
      x.push('  <object id="' + id + '" type="model" name="' + xmlEsc(sb.name) + '">', '   <components>');
      sb.instances.forEach(function (inst) {
        var T = inst.transform, oid = inst.sub != null ? subObjectIds[inst.sub] : partObjects[inst.part].group;
        x.push('    <component objectid="' + oid + '"' + (isIdentity(T) ? '' : ' transform="' + matrix3mf(T) + '"') + '/>');
      });
      x.push('   </components>', '  </object>');
      subObjectIds.push(id);
      return id;
    });
    x.push(' </resources>', ' <build>');
    if (!doc.assembly) partObjects[0].bodies.forEach(function (id) { x.push('  <item objectid="' + id + '"/>'); });
    else (doc.top || doc.instances).forEach(function (inst) {
      var T = inst.transform, oid = inst.sub != null ? subObjects[inst.sub] : partObjects[inst.part].group;
      x.push('  <item objectid="' + oid + '"' + (isIdentity(T) ? '' : ' transform="' + matrix3mf(T) + '"') + ' partnumber="' + xmlEsc(inst.name) + '"/>');
    });
    x.push(' </build>', '</model>');
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n' },
      { name: '3D/3dmodel.model', data: x.join('\n') + '\n' }
    ];
    return zip(files, opts.date);
  }

  // ------------------------------------------------------------------ 3MF import
  function xmlAttrs(tag) {
    var a = {}, re = /([\w:]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(tag))) a[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return a;
  }
  function import3MF(bytes, opts) {
    opts = opts || {};
    var files = unzip(bytes), warnings = [];
    var mname = Object.keys(files).filter(function (n) { return /\.model$/i.test(n); })[0];
    if (!mname) {
      if (files.deflated.length) throw new Error('This 3MF package is compressed (deflate); Anvil reads stored (uncompressed) 3MF packages only.');
      throw new Error('No 3D model part in this 3MF package.');
    }
    var xml = fromUtf8(files[mname]);
    var um = /<model\b[^>]*\bunit="(\w+)"/.exec(xml), unit = um ? um[1] : 'millimeter';
    var toMM = { micron: 1e-3, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }[unit] || 1;
    var objects = {}, re = /<object\b([^>]*)>([\s\S]*?)<\/object>/g, m;
    while ((m = re.exec(xml))) {
      var at = xmlAttrs(m[1]), body = m[2], o = { id: at.id, name: at.name || ('Object' + at.id), positions: [], triangles: [], components: [] };
      var vr = /<vertex\b([^>]*)\/?>/g, v;
      while ((v = vr.exec(body))) { var va = xmlAttrs(v[1]); o.positions.push(+va.x, +va.y, +va.z); }
      var tr = /<triangle\b([^>]*)\/?>/g, t;
      while ((t = tr.exec(body))) { var ta = xmlAttrs(t[1]); o.triangles.push(+ta.v1, +ta.v2, +ta.v3); }
      var cr = /<component\b([^>]*)\/?>/g, c;
      while ((c = cr.exec(body))) { var ca = xmlAttrs(c[1]); o.components.push({ id: ca.objectid, transform: parse3mfMatrix(ca.transform) }); }
      objects[o.id] = o;
    }
    var solids = [];
    function place(id, T, label, depth) {
      var o = objects[id];
      if (!o || depth > 16) return;
      if (o.triangles.length) {
        var pos = [];
        for (var i = 0; i < o.positions.length; i += 3) { var q = tfPoint(T, [o.positions[i], o.positions[i + 1], o.positions[i + 2]]); pos.push(q[0], q[1], q[2]); }
        solids.push({ name: label || o.name, positions: pos, triangles: o.triangles.slice() });
      }
      o.components.forEach(function (c) { place(c.id, tfCompose(T, c.transform), o.components.length > 1 || !label ? (objects[c.id] && objects[c.id].name) : label, depth + 1); });
    }
    var ir = /<item\b([^>]*)\/?>/g, it;
    while ((it = ir.exec(xml))) { var ia = xmlAttrs(it[1]); place(ia.objectid, parse3mfMatrix(ia.transform), ia.partnumber || null, 0); }
    return finishImport('3mf', opts, solids, toMM, warnings);
  }
  function parse3mfMatrix(s) {
    if (!s) return tf(null);
    var m = s.trim().split(/\s+/).map(Number);
    if (m.length !== 12) return tf(null);
    return { rotation: [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]], position: [m[9], m[10], m[11]] };
  }

  // ------------------------------------------------------------------ STEP AP214 export
  // Each planar face of a body is an ADVANCED_FACE on a PLANE, bounded by EDGE_LOOPs of EDGE_CURVEs shared with the
  // neighbouring faces; each body is a MANIFOLD_SOLID_BREP over a CLOSED_SHELL. Split points that only two faces share
  // (collinear, left by CSG splits) are dropped, so edges come out whole. A body without analytic surface records
  // (all planar) is written by writeBrep below exactly as before true curves; one with them by writeBrepAnalytic
  // (curved faces on their true surfaces, see "STEP export of true curved faces").
  function faceLoops(mesh) {
    var tri = mesh.triangles, faces = [];
    mesh.faces.forEach(function (f) {
      var dir = {};
      f.tris.forEach(function (t) { for (var e = 0; e < 3; e++) { var a = tri[t * 3 + e], b = tri[t * 3 + (e + 1) % 3]; dir[a + '>' + b] = (dir[a + '>' + b] || 0) + 1; } });
      var next = {}, count = 0;
      Object.keys(dir).forEach(function (k) {
        var ab = k.split('>'), a = +ab[0], b = +ab[1];
        var twin = dir[b + '>' + a] || 0;
        for (var r = 0; r < dir[k] - twin; r++) { (next[a] = next[a] || []).push(b); count++; }
      });
      var loops = [];
      Object.keys(next).forEach(function (s) {
        s = +s;
        while (next[s] && next[s].length) {
          var loop = [s], cur = next[s].pop(), guard = 0;
          while (cur !== s && guard++ < 1e6) {
            loop.push(cur);
            if (!next[cur] || !next[cur].length) break;
            cur = next[cur].pop();
          }
          if (loop.length >= 3) loops.push(loop);
        }
      });
      if (loops.length) faces.push({ normal: norm(f.normal), w: f.w, loops: loops });
    });
    // drop split points: a vertex used by exactly two loop occurrences in the whole body, collinear in both
    var P = function (i) { return [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]; };
    var uses = {};
    faces.forEach(function (f) { f.loops.forEach(function (l) { l.forEach(function (v) { uses[v] = (uses[v] || 0) + 1; }); }); });
    faces.forEach(function (f) {
      f.loops = f.loops.map(function (l) {
        var changed = true;
        while (changed && l.length > 3) {
          changed = false;
          for (var i = 0; i < l.length && l.length > 3; i++) {
            var v = l[i];
            if (uses[v] !== 2) continue;
            var a = P(l[(i + l.length - 1) % l.length]), b = P(v), c = P(l[(i + 1) % l.length]);
            var d1 = sub(b, a), d2 = sub(c, b);
            if (len(cross(d1, d2)) <= len(d1) * len(d2) * 1e-9 && dot(d1, d2) > 0) { l.splice(i, 1); changed = true; i--; }
          }
        }
        return l;
      });
    });
    // split each plane group into faces: every counter-clockwise loop (seen along the normal) is an outer bound, every
    // clockwise loop a hole of the smallest outer loop that contains it
    var out = [];
    faces.forEach(function (f) {
      var fr = frameFor(f.normal);
      var l2 = f.loops.map(function (l) { return l.map(function (v) { var q = P(v); return [dot(q, fr.u), dot(q, fr.v)]; }); });
      var outers = [], holes = [];
      f.loops.forEach(function (l, i) { var A = area2(l2[i]); (A >= 0 ? outers : holes).push({ loop: l, pts: l2[i], area: Math.abs(A), holes: [] }); });
      holes.forEach(function (h) {
        var best = null, pt = h.pts[0];
        // a point just inside the hole's first edge is more robust than a vertex, which may touch the outer boundary
        if (h.pts.length > 1) pt = [(h.pts[0][0] + h.pts[1][0]) / 2, (h.pts[0][1] + h.pts[1][1]) / 2];
        outers.forEach(function (o) { if (pointInPoly2(pt, o.pts) && (!best || o.area < best.area)) best = o; });
        (best || outers[0] || { holes: [] }).holes.push(h);
      });
      outers.forEach(function (o) { out.push({ normal: f.normal, w: f.w, outer: o.loop, holes: o.holes.map(function (h) { return h.loop; }) }); });
    });
    return out;
  }
  function frameFor(n) {
    var a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var u = norm(cross(a, n)), v = cross(n, u);
    return { u: u, v: v, n: n };
  }
  function area2(pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function pointInPoly2(p, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function StepWriter() { this.n = 0; this.lines = []; }
  StepWriter.prototype.add = function (text) { this.n++; this.lines.push('#' + this.n + '=' + text + ';'); return '#' + this.n; };
  function stepList(items) { return '(' + items.join(',') + ')'; }
  function stepVec(v) { return stepList(v.map(stepReal)); }

  function writeBrep(W, mesh, name, T) {
    if (!T && mesh.triSurf) return writeBrepAnalytic(W, mesh, name);
    T = T || null;
    var P = function (i) { var q = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]; return T ? tfPoint(T, q) : q; };
    var vp = {}, edges = {};
    function vertex(i) { return vp[i] || (vp[i] = W.add('VERTEX_POINT(\'\',' + W.add('CARTESIAN_POINT(\'\',' + stepVec(P(i)) + ')') + ')')); }
    function edge(a, b) {
      var k = a < b ? a + '_' + b : b + '_' + a, e = edges[k];
      if (!e) {
        var pa = P(a), pb = P(b), d = sub(pb, pa), L = len(d);
        var line = W.add('LINE(\'\',' + W.add('CARTESIAN_POINT(\'\',' + stepVec(pa) + ')') + ',' + W.add('VECTOR(\'\',' + W.add('DIRECTION(\'\',' + stepVec(norm(d)) + ')') + ',' + stepReal(L) + ')') + ')');
        e = edges[k] = { a: a, id: W.add('EDGE_CURVE(\'\',' + vertex(a) + ',' + vertex(b) + ',' + line + ',.T.)') };
      }
      return W.add('ORIENTED_EDGE(\'\',*,*,' + e.id + ',' + (e.a === a ? '.T.' : '.F.') + ')');
    }
    function loop(l) {
      var oes = [];
      for (var i = 0; i < l.length; i++) oes.push(edge(l[i], l[(i + 1) % l.length]));
      return W.add('EDGE_LOOP(\'\',' + stepList(oes) + ')');
    }
    var faceIds = faceLoops(mesh).map(function (f) {
      var n = T ? norm(tfDir(T, f.normal)) : f.normal, fr = frameFor(n);
      var bounds = [W.add('FACE_OUTER_BOUND(\'\',' + loop(f.outer) + ',.T.)')].concat(f.holes.map(function (h) { return W.add('FACE_BOUND(\'\',' + loop(h) + ',.T.)'); }));
      var ax = W.add('AXIS2_PLACEMENT_3D(\'\',' + W.add('CARTESIAN_POINT(\'\',' + stepVec(P(f.outer[0])) + ')') + ',' + W.add('DIRECTION(\'\',' + stepVec(n) + ')') + ',' + W.add('DIRECTION(\'\',' + stepVec(fr.u) + ')') + ')');
      return W.add('ADVANCED_FACE(\'\',' + stepList(bounds) + ',' + W.add('PLANE(\'\',' + ax + ')') + ',.T.)');
    });
    return W.add('MANIFOLD_SOLID_BREP(' + stepString(name) + ',' + W.add('CLOSED_SHELL(\'\',' + stepList(faceIds) + ')') + ')');
  }

  // ------------------------------------------------------------------ STEP export of true curved faces
  // A body whose polygons carry analytic surface records (kernel.js "analytic surface records") is written with its
  // curved faces on their true surfaces: one ADVANCED_FACE per connected patch of a cylinder, cone, sphere or torus
  // (CYLINDRICAL_ / CONICAL_ / SPHERICAL_ / TOROIDAL_SURFACE), bounded by EDGE_CURVEs on CIRCLEs where the patch meets
  // a face perpendicular to its axis (caps, hole rims and bottoms, steps) and on LINEs along its rulings. The planar
  // faces use the same CIRCLE edges in their loops. Patch shapes, as OpenCascade writes them:
  //   band   between two full circles (a boss, a hole, a sphere or torus zone): one EDGE_LOOP circle, seam, circle,
  //          seam (the seam a LINE, or a meridian CIRCLE arc on spheres and tori, used twice by the face)
  //   cap    one full circle and an apex or pole (a cone to its tip, a hemisphere): circle, seam, seam
  //   closed a whole sphere (VERTEX_LOOP at its pole) or torus (its two seam circles, each used twice)
  //   plain  cylinders and cones that do not wrap around the axis (partial revolves, fillets): their own loops of
  //          arcs and rulings
  // Seams and the vertex of a full circle sit at the circle's angle 0: its reference direction is the world x axis
  // (else y) projected into its plane, so every circle of one axis shares it. A patch whose boundary is not made of
  // such circles and rulings (a cylinder cut by an oblique plane, crossing holes) keeps its planar facets.
  function canonDir(d) { var s = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1; return scale(d, s); }
  function xdirOf(n) {
    var ws = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (var i = 0; i < 3; i++) { var t = sub(ws[i], scale(n, dot(ws[i], n))); if (len(t) > 1e-6) return norm(t); }
    return [1, 0, 0];
  }
  function qk(v) { return Math.round(v * 1e5); }
  function circleOf(center, normal, radius) {
    var n = canonDir(norm(normal));
    return { center: center, normal: n, radius: radius, xdir: xdirOf(n), key: center.map(qk).join(',') + '|' + n.map(qk).join(',') + '|' + qk(radius) };
  }
  // axial coordinate z, distance rho from the axis and radial vector v of a point, for a surface record
  function axial(S, X) { var rel = sub(X, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)); return { z: z, rho: len(v), v: v }; }
  // radii of the surface's circles at axial level z
  function latRadii(S, z) {
    if (S.t === 'cyl') return [S.r];
    if (S.t === 'cone') return [S.r + S.k * z];
    var h = S.r * S.r - z * z;
    if (h < -1e-9 * S.r * S.r) return [];
    h = Math.sqrt(Math.max(0, h));
    if (S.t === 'sph') return [h];
    return [Math.abs(S.R) + h, Math.abs(S.R) - h];
  }
  // classifyEdge(S, A, B, tol) -> { t: 'c', c: circle, lat } | { t: 'l' } | null: the mesh edge AB as a chord of a
  // circle of the surface (a latitude circle, or a meridian arc of a sphere / torus), a segment of a ruling, or neither
  function classifyEdge(S, A, B, tol) {
    var a = axial(S, A), b = axial(S, B);
    if (Math.abs(a.z - b.z) < tol) {
      var z = (a.z + b.z) / 2, rs = latRadii(S, z);
      for (var i = 0; i < rs.length; i++) if (rs[i] > tol && Math.abs(a.rho - rs[i]) < tol && Math.abs(b.rho - rs[i]) < tol) return { t: 'c', c: circleOf(add(S.o, scale(S.d, z)), S.d, rs[i]), lat: true };
    }
    if (S.t === 'cyl') {
      if (Math.abs(a.rho - S.r) < tol && Math.abs(b.rho - S.r) < tol && len(cross(sub(B, A), S.d)) < tol) return { t: 'l' };
      return null;
    }
    if (S.t === 'cone') {
      if (Math.abs(a.rho - (S.r + S.k * a.z)) > tol || Math.abs(b.rho - (S.r + S.k * b.z)) > tol) return null;
      if (a.rho > tol && b.rho > tol && (dot(a.v, b.v) <= 0 || len(cross(scale(a.v, 1 / a.rho), scale(b.v, 1 / b.rho))) * Math.max(a.rho, b.rho) > tol)) return null;
      return { t: 'l' };
    }
    // spheres and tori: an arc in a meridian half-plane
    var e = norm(a.rho >= b.rho ? a.v : b.v), m = cross(e, S.d);
    if (Math.abs(dot(sub(A, S.o), m)) > tol || Math.abs(dot(sub(B, S.o), m)) > tol) return null;
    if ((a.rho > tol && dot(a.v, e) <= 0) || (b.rho > tol && dot(b.v, e) <= 0)) return null;
    var C = S.t === 'tor' ? add(S.o, scale(e, Math.abs(S.R))) : S.o;
    if (Math.abs(len(sub(A, C)) - S.r) > tol || Math.abs(len(sub(B, C)) - S.r) > tol) return null;
    return { t: 'c', c: circleOf(C, m, S.r), lat: false };
  }
  // stepout-2: a mesh edge AB of a cylinder patch whose neighbour across it is the planar face pf, cut obliquely (a
  // mitred bend end, a tube cut at an angle): a chord of the ELLIPSE where pf's plane meets the cylinder, or null.
  // A and B lie on the plane; on the cylinder or inside it by at most a chord's sagitta (a faceted bend cut by a
  // plane puts every other point on a facet's chord: those points are not written, the run's ends are checked).
  // The ellipse: centre on the axis, x = the axis projected into the plane (semi-axis r / |n·d|), y = n × x (r), so
  // its parameter t is the cylinder's angle measured from x.
  function ellipseOf(S, pn, w) {
    var n = canonDir(norm(pn)), cs = dot(n, S.d), t = (w * (dot(pn, n) > 0 ? 1 : -1) - dot(n, S.o)) / cs;
    var C = add(S.o, scale(S.d, t)), X = norm(sub(S.d, scale(n, cs)));
    var a = S.r / Math.abs(cs);
    return { center: C, normal: n, xdir: X, a: a, b: S.r, key: 'e' + C.map(qk).join(',') + '|' + n.map(qk).join(',') + '|' + qk(S.r) + '|' + qk(a) };
  }
  function ellipseEdge(S, A, B, pf, tol) {
    if (S.t !== 'cyl' || !pf || !pf.normal) return null;
    var pn = norm(pf.normal), cs = Math.abs(dot(pn, S.d));
    if (cs < 1e-6 || cs > 1 - 1e-9) return null;
    if (Math.abs(dot(pn, A) - pf.w) > tol || Math.abs(dot(pn, B) - pf.w) > tol) return null;
    var ra = axial(S, A).rho, rb = axial(S, B).rho, sag = 0.05 * S.r;
    if (ra > S.r + tol || rb > S.r + tol || ra < S.r - sag || rb < S.r - sag) return null;
    if (Math.abs(ra - S.r) > tol && Math.abs(rb - S.r) > tol) return null;   // a chord has one end on the surface at least
    return { t: 'e', e: ellipseOf(S, pn, pf.w) };
  }
  // the parameter of a point on (or next to) an ellipse
  function ellipseParam(E, p) { var v = sub(p, E.center); return Math.atan2(dot(v, cross(E.normal, E.xdir)) / E.b, dot(v, E.xdir) / E.a); }

  // the loops (vertex lists) of a set of triangles: directed edges without a reverse twin in the set, chained
  // rfHV: the directed edges are counted per start vertex (compressed rows over the set's own vertices, filled in
  // triangle order) instead of in an "a>b" string map: next[a] gets its b's in the order the old map first met a>b,
  // and loops start at the vertices in ascending order (the old integer object keys): the same loops, same order.
  var tlLocal = null;   // global vertex -> local number, -1 when unused (kept between calls: one face at a time)
  function trisLoops(tri, tris) {
    var m = tris.length * 3, maxV = 0, i, e;
    for (i = 0; i < tris.length; i++) for (e = 0; e < 3; e++) if (tri[tris[i] * 3 + e] > maxV) maxV = tri[tris[i] * 3 + e];
    if (!tlLocal || tlLocal.length <= maxV) { tlLocal = new Int32Array(maxV + 1 + (maxV >> 1)); tlLocal.fill(-1); }
    var loc = tlLocal, verts = [], from = new Int32Array(m), to = new Int32Array(m), k = 0;
    function id(v) { var l = loc[v]; if (l < 0) { l = loc[v] = verts.length; verts.push(v); } return l; }
    for (i = 0; i < tris.length; i++) for (e = 0; e < 3; e++, k++) { from[k] = id(tri[tris[i] * 3 + e]); to[k] = id(tri[tris[i] * 3 + (e + 1) % 3]); }
    var nl = verts.length, off = new Int32Array(nl + 1), dst = new Int32Array(m);
    for (k = 0; k < m; k++) off[from[k] + 1]++;
    for (i = 0; i < nl; i++) off[i + 1] += off[i];
    var fill = off.slice(0, nl);
    for (k = 0; k < m; k++) dst[fill[from[k]]++] = to[k];
    for (i = 0; i < nl; i++) loc[verts[i]] = -1;
    var next = {}, starts = [], loops = [];
    for (var la = 0; la < nl; la++) {
      for (var j = off[la]; j < off[la + 1]; j++) {
        var lb = dst[j], dup = false, cnt = 0, twin = 0, q;
        for (q = off[la]; q < j && !dup; q++) dup = dst[q] === lb;
        if (dup) continue;
        for (q = j; q < off[la + 1]; q++) if (dst[q] === lb) cnt++;
        for (q = off[lb]; q < off[lb + 1]; q++) if (dst[q] === la) twin++;
        var a = verts[la], bb = verts[lb];
        for (var r = 0; r < cnt - twin; r++) { if (!next[a]) { next[a] = []; starts.push(a); } next[a].push(bb); }
      }
    }
    starts.sort(function (x, y) { return x - y; }).forEach(function (s) {
      while (next[s] && next[s].length) {
        var loop = [s], cur = next[s].pop(), guard = 0;
        while (cur !== s && guard++ < 1e6) {
          loop.push(cur);
          if (!next[cur] || !next[cur].length) break;
          cur = next[cur].pop();
        }
        if (loop.length >= 3) loops.push(loop);
      }
    });
    return loops;
  }

  // rfHV: a map keyed by two vertex numbers (rows[a] = [b, value, …]); replaces "a>b" / "a_b" string keys in the STEP
  // writer (get returns undefined when absent, as the object lookups did; set overwrites)
  function PairMap() { this.rows = []; }
  PairMap.prototype.get = function (a, b) { var r = this.rows[a]; if (r) for (var i = 0; i < r.length; i += 2) if (r[i] === b) return r[i + 1]; return undefined; };
  PairMap.prototype.set = function (a, b, v) { var r = this.rows[a] || (this.rows[a] = []); for (var i = 0; i < r.length; i += 2) if (r[i] === b) { r[i + 1] = v; return; } r.push(b, v); };
  function writeBrepAnalytic(W, mesh, name) {
    var pos = mesh.positions, tri = mesh.triangles, nT = tri.length / 3, nF = mesh.faces.length;
    function P(i) { return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; }
    var ext = 1;
    for (var q = 0; q < pos.length; q++) ext = Math.max(ext, Math.abs(pos[q]));
    var tol = 1e-7 * ext;
    var triPlane = new Int32Array(nT);
    mesh.faces.forEach(function (f, fi) { f.tris.forEach(function (t) { triPlane[t] = fi; }); });
    // distinct surfaces (one per analytic surface key), and each triangle's
    var recs = [], recIndex = new Map(), triRec = new Int32Array(nT), lastF = null, lastI = -1;
    for (var t = 0; t < nT; t++) {
      var F = mesh.triSurf[t];
      if (!F) { triRec[t] = -1; continue; }
      if (F !== lastF) { lastF = F; lastI = recIndex.get(F); if (lastI == null) { lastI = recs.length; recs.push(F); recIndex.set(F, lastI); } }
      triRec[t] = lastI;
    }
    var sGroups = K.curveSurfaces(recs.map(function (F) { return { surf: F }; })), recSurf = [];
    sGroups.forEach(function (g, gi) { g.polys.forEach(function (fp) { var ri = recIndex.get(fp.surf); recSurf[ri == null ? -1 : ri] = gi; }); });
    var surfaces = sGroups.map(function (g) { return g.surf; });
    // connected patches of each surface: union-find over triangles of one surface sharing an edge
    var par = new Int32Array(nT), edgeTris = new PairMap();
    for (t = 0; t < nT; t++) par[t] = t;
    function root(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    for (t = 0; t < nT; t++) {
      if (triRec[t] < 0) continue;
      for (var e = 0; e < 3; e++) {
        var a = tri[t * 3 + e], b = tri[t * 3 + (e + 1) % 3], ea = a < b ? a : b, eb = a < b ? b : a, o = edgeTris.get(ea, eb);
        if (o == null) edgeTris.set(ea, eb, t);
        else if (recSurf[triRec[o]] === recSurf[triRec[t]]) { var ra = root(o), rb = root(t); if (ra !== rb) par[ra] = rb; }
      }
    }
    var comps = [], compOf = new Int32Array(nT), byRoot = {};
    for (t = 0; t < nT; t++) {
      if (triRec[t] < 0) { compOf[t] = -1; continue; }
      var r0 = root(t);
      if (byRoot[r0] == null) { byRoot[r0] = comps.length; comps.push({ surf: surfaces[recSurf[triRec[t]]], tris: [] }); }
      compOf[t] = byRoot[r0];
      comps[byRoot[r0]].tris.push(t);
    }
    comps.forEach(function (c) {
      var S = c.surf;
      c.ok = (S.t === 'cyl' || S.t === 'cone' || S.t === 'sph' || S.t === 'tor') && S.r > tol && (S.t !== 'tor' || Math.abs(S.R) > S.r + tol) && (S.t !== 'cone' || Math.abs(S.k) > 1e-9);
    });
    var snaps = [];
    snapToCylinders();
    // lane stepout3: walls of holes folded through a bend (Unfold, cut, Fold: wrapCut lays the hole's points on the bend's
    // facets' chords, each wall a strip of triangles along two radial lines, from a point on the inner bend to the same
    // angle and height on the outer one, Fold's mid-thickness point between). Each strip becomes a face of its own: the
    // ruled surface of radial lines between two rails, each rail a rational cubic on its cylinder (railOf: exact on the
    // cylinder, so the bend is written whole). The hole's points move onto the true cylinders, in the file only. In (angle,
    // height) a rail is the chord plus an odd bump of 1e-10, so the hole's area there, its volume and its developed size
    // are the polygon's: the solid the Fold meant (Anvil's reader and OpenCascade read it to 1e-12).
    var nW = nF + comps.length, walls = [], wallOf = new Int32Array(nT).fill(-1), wallHome = {};
    radialWalls();
    function radialWalls() {
      var dirTri = new PairMap(), vTris = [], t, e;
      for (t = 0; t < nT; t++) for (e = 0; e < 3; e++) { var v0 = tri[t * 3 + e]; dirTri.set(v0, tri[t * 3 + (e + 1) % 3], t); (vTris[v0] = vTris[v0] || []).push(t); }
      function third(t1, a, b) { for (var k = 0; k < 3; k++) { var v = tri[t1 * 3 + k]; if (v !== a && v !== b) return v; } return -1; }
      function cylComp(ci) { var c = comps[ci]; return ci >= 0 && c.ok && c.surf.t === 'cyl' ? c.surf : null; }
      function onCyl(S, v) { var rho = axial(S, P(v)).rho; return rho <= S.r + tol && rho >= S.r - 0.05 * S.r; }
      function coaxial(S, S2) { return S !== S2 && len(cross(S.d, S2.d)) < 1e-9 && axial(S, S2.o).rho < tol && Math.abs(S.r - S2.r) > tol; }
      function aligned(S, u, v) {
        var A = axial(S, P(u)), B = axial(S, P(v));
        return Math.abs(A.z - B.z) <= tol && A.rho > tol && B.rho > tol && dot(A.v, B.v) > 0 && len(cross(scale(A.v, 1 / A.rho), scale(B.v, 1 / B.rho))) <= 1e-7;
      }
      // the outer comp across the edge u→v (a triangle of a coaxial cylinder of another radius), or -1
      function compAcross(u, v) { var t1 = dirTri.get(v, u); return t1 == null ? -1 : compOf[t1]; }
      var cand = [], taken = {};
      comps.forEach(function (c, ci) {
        var S = cylComp(ci);
        if (!S) return;
        c.tris.forEach(function (t0) {
          for (var k = 0; k < 3; k++) {
            var a = tri[t0 * 3 + k], b = tri[t0 * 3 + (k + 1) % 3], t1 = dirTri.get(b, a);
            if (t1 == null || triRec[t1] >= 0 || taken[t1] || classifyEdge(S, P(a), P(b), tol)) continue;
            if (!onCyl(S, a) || !onCyl(S, b) || aligned(S, a, b)) continue;
            // only where the hole's points lie on the facets' chords: a bend end whose points are all on the cylinder
            // (a mitred tray's tapered end, its points on the zone lines) is written by its planes' ELLIPSES as before
            if (Math.abs(axial(S, P(a)).rho - S.r) <= tol && Math.abs(axial(S, P(b)).rho - S.r) <= tol) continue;
            // walk the strip of plain triangles across the sheet: the front edge (p on a's radial line, q on b's) moves on
            // by the third point of the triangle beyond it, which must lie on one of the two lines, until the triangle
            // beyond is a coaxial cylinder's (the wall may have points between: Fold's mid-thickness layer)
            var p = a, q = b, from = [b, a], tris = [], la = [a], lb = [b], co = -1, S2 = null, steps = 0, ok2 = true;
            while (ok2) {
              var t2 = dirTri.get(from[0], from[1]);
              if (t2 == null || ++steps > 32) { ok2 = false; break; }
              if (triRec[t2] >= 0) {
                co = compOf[t2]; S2 = cylComp(co);
                if (co === ci || !S2 || !coaxial(S, S2) || !onCyl(S2, p) || !onCyl(S2, q)) ok2 = false;
                break;
              }
              var x = third(t2, p, q);
              if (x < 0 || taken[t2] || tris.indexOf(t2) >= 0) { ok2 = false; break; }
              tris.push(t2);
              // the new front edge as it runs in t2 (x→q or p→x), crossed the other way
              if (x !== p && aligned(S, p, x)) { la.push(x); p = x; from = [x, q]; }
              else if (x !== q && aligned(S, q, x)) { lb.push(x); q = x; from = [p, x]; }
              else { ok2 = false; break; }
              // t2's own direction for the front edge: from is reversed when t2 runs it the other way
              var inT = false;
              for (var k2 = 0; k2 < 3; k2++) if (tri[t2 * 3 + k2] === from[0] && tri[t2 * 3 + (k2 + 1) % 3] === from[1]) inT = true;
              from = inT ? [from[1], from[0]] : from;
            }
            if (!ok2 || !S2 || tris.length < 2) continue;
            tris.forEach(function (t3) { taken[t3] = true; });
            cand.push({ tris: tris, a: a, b: b, pa: p, pb: q, la: la, lb: lb, ci: ci, co: co, S: S, S2: S2, live: true });
          }
        });
      });
      if (!cand.length) return;
      // where each point goes: onto its cylinder, keeping its angle and height (a partner takes its inner point's)
      function foot(S, X, r) { var ax = axial(S, X); return add(add(S.o, scale(S.d, ax.z)), scale(ax.v, r / ax.rho)); }
      // [vertex, place] for every point of wall w: the inner line at S.r, the outer at S2.r, points between at their own
      // distance, all at the inner end's angle and height
      function places(w) {
        var out = [];
        [[w.la, w.a], [w.lb, w.b]].forEach(function (L) {
          L[0].forEach(function (v, k) { out.push([v, foot(w.S, P(L[1]), k === 0 ? w.S.r : k === L[0].length - 1 ? w.S2.r : axial(w.S, P(v)).rho)]); });
        });
        return out;
      }
      var ok = false;
      while (!ok) {
        ok = true;
        var target = {}, allowed = {};
        cand.forEach(function (w) {
          if (!w.live) return;
          w.tris.forEach(function (t1) { allowed[t1] = true; });
          comps[w.ci].tris.forEach(function (t1) { allowed[t1] = true; });
          comps[w.co].tris.forEach(function (t1) { allowed[t1] = true; });
        });
        cand.forEach(function (w) {
          if (!w.live) return;
          places(w).forEach(function (s) {
            var v = s[0], X = s[1];
            if (target[v] && len(sub(target[v], X)) > tol) { w.live = false; ok = false; }
            target[v] = X;
          });
        });
        cand.forEach(function (w) {
          if (!w.live) return;
          places(w).forEach(function (s) {
            var v = s[0];
            if (!w.live || len(sub(s[1], P(v))) <= tol) return;
            if (vTris[v].some(function (t1) { return !allowed[t1]; })) { w.live = false; ok = false; }
          });
        });
      }
      var moveTo = {};
      cand.forEach(function (w) {
        if (!w.live) return;
        w.tris.forEach(function (t1) { wallOf[t1] = walls.length; });
        walls.push(w);
        places(w).forEach(function (s) { moveTo[s[0]] = s[1]; });
      });
      if (walls.length && pos === mesh.positions) pos = Float64Array.from(pos);
      Object.keys(moveTo).forEach(function (k) {
        var v = +k, X = moveTo[k];
        wallHome[v] = P(v);
        pos[v * 3] = X[0]; pos[v * 3 + 1] = X[1]; pos[v * 3 + 2] = X[2];
      });
    }

    var groups, loopsOf, owner, ecls, shape;
    // lane mitreplane (rfKC): a vertex where a cut crosses a faceted bend (a relief slot's floor and side, a neighbour's
    // bend start) is where the cut's planes meet the bend's CHORD, inside its cylinder by up to the sagitta, so the bend
    // failed the on-surface test and was written as facets (step audit item 2). Such a vertex is moved, in the file
    // only, along the line its planes fix (two planes that are not parallel, one plane and the ruling of another
    // cylinder it lies on, or one plane along the axis) to where that line meets the cylinder: the point the true cut and the true bend share, the
    // solid curveCorrection's exact volume describes. A vertex its planes fix completely, or with no such line, stays.
    function snapToCylinders() {
      var faceCurved = mesh.faces.map(function (f) { for (var k = 0; k < f.tris.length; k++) if (triRec[f.tris[k]] >= 0) return true; return false; });
      var vTris = {}, cand = {};
      for (var t2 = 0; t2 < nT; t2++) for (var e2 = 0; e2 < 3; e2++) { var v0 = tri[t2 * 3 + e2]; (vTris[v0] = vTris[v0] || []).push(t2); }
      comps.forEach(function (c) {
        var S = c.surf;
        if (!c.ok || S.t !== 'cyl') return;
        c.tris.forEach(function (t3) { for (var e3 = 0; e3 < 3; e3++) { var v1 = tri[t3 * 3 + e3], off = Math.abs(axial(S, P(v1)).rho - S.r); if (off > tol && off <= 0.05 * S.r) cand[v1] = true; } });
      });
      var moved = null;
      Object.keys(cand).forEach(function (vk) {
        var v = +vk, X = P(v), planes = [], onCyl = [], offCyl = [], seen = {};
        vTris[v].forEach(function (t4) {
          if (triRec[t4] < 0) { var fi = triPlane[t4]; if (!faceCurved[fi] && !seen['f' + fi]) { seen['f' + fi] = 1; planes.push(mesh.faces[fi]); } return; }
          var si = recSurf[triRec[t4]];
          if (seen['s' + si]) return;
          seen['s' + si] = 1;
          var S2 = surfaces[si];
          if (!S2 || S2.t !== 'cyl') { offCyl.push(null); return; }
          (Math.abs(axial(S2, X).rho - S2.r) <= tol ? onCyl : offCyl).push(S2);
        });
        if (offCyl.length !== 1 || !offCyl[0]) return;
        var S = offCyl[0], ns = [];
        for (var i = 0; i < planes.length; i++) {
          var n = norm(planes[i].normal);
          if (Math.abs(dot(n, X) - planes[i].w) > tol) return;
          if (!ns.some(function (m) { return len(cross(m, n)) < 1e-9; })) ns.push(n);
        }
        var L = null, w0 = sub(X, S.o), wp = sub(w0, scale(S.d, dot(w0, S.d)));
        if (ns.length === 2) L = norm(cross(ns[0], ns[1]));
        else if (ns.length === 1) {
          onCyl.forEach(function (S3) { if (!L && Math.abs(dot(ns[0], S3.d)) < 1e-9) L = S3.d.slice(); });
          // else radially, in the plane: a split point on a chord of the plane's cut (a ruling of a plane along the axis,
          // the circle of a cap square to it) whose neighbours moved onto the cylinder
          if (!L && onCyl.length === 0) { var rp = sub(wp, scale(ns[0], dot(ns[0], wp))); if (len(rp) > 0.5 * S.r) L = norm(rp); }
        }
        if (!L || len(cross(L, S.d)) < 1e-6) return;
        var Lp = sub(L, scale(S.d, dot(L, S.d)));
        var qa = dot(Lp, Lp), qb = 2 * dot(wp, Lp), qc = dot(wp, wp) - S.r * S.r, disc = qb * qb - 4 * qa * qc;
        if (!(disc >= 0)) return;
        var r1 = (-qb + Math.sqrt(disc)) / (2 * qa), r2 = (-qb - Math.sqrt(disc)) / (2 * qa), lam = Math.abs(r1) < Math.abs(r2) ? r1 : r2;
        if (Math.abs(lam) > 0.05 * S.r) return;
        var Y = add(X, scale(L, lam));
        if (planes.some(function (pf) { return Math.abs(dot(norm(pf.normal), Y) - pf.w) > tol; })) return;
        if (onCyl.some(function (S4) { return Math.abs(axial(S4, Y).rho - S4.r) > tol; })) return;
        if (!moved) { moved = true; pos = Float64Array.from(pos); }
        pos[v * 3] = Y[0]; pos[v * 3 + 1] = Y[1]; pos[v * 3 + 2] = Y[2];
        var sn = { v: v, X: X, comps: [], all: [] };
        vTris[v].forEach(function (t5) {
          var ci = compOf[t5];
          if (ci < 0 || sn.all.indexOf(ci) >= 0) return;
          sn.all.push(ci);
          if (comps[ci].surf === S) sn.comps.push(ci);
        });
        snaps.push(sn);
      });
    }
    function eget(a, b) { return a < b ? ecls.get(a, b) : ecls.get(b, a); }
    var PEDGE = { t: 'p' };   // lane stepreal2: a chord between two points of a cylinder, written as it is
    // (within 2e-5 of the radius: another CAD system's intersection curves are approximations, 2e-6 r off on a shop
    // file; a split point on a facet's chord is 1e-4 r off or more unless it sits at the chord's very end)
    function onCylS(S, X) { return Math.abs(axial(S, X).rho - S.r) <= Math.max(tol, 2e-5 * S.r); }
    // stepout-2: a mesh face that is a true plane (no triangle of it carries a curved surface's record)
    function truePlane(fi) { var ts = groups[fi]; for (var k = 0; k < ts.length; k++) if (triRec[ts[k]] >= 0) return false; return ts.length > 0; }
    function build() {
      // faces: analytic patches (group nF + comp) and planes (group = the mesh face index)
      groups = [];
      for (var g = 0; g < nW + walls.length; g++) groups.push([]);
      for (var t2 = 0; t2 < nT; t2++) groups[wallOf[t2] >= 0 && walls[wallOf[t2]].live ? nW + wallOf[t2] : compOf[t2] >= 0 && comps[compOf[t2]].ok ? nF + compOf[t2] : triPlane[t2]].push(t2);
      loopsOf = groups.map(function (ts) { return ts.length ? trisLoops(tri, ts) : []; });
      // drop split points: a vertex used by exactly two loop occurrences in the whole body, collinear in both
      var uses = {};
      loopsOf.forEach(function (ls) { ls.forEach(function (l) { l.forEach(function (v) { uses[v] = (uses[v] || 0) + 1; }); }); });
      loopsOf = loopsOf.map(function (ls) {
        return ls.map(function (l) {
          var changed = true;
          while (changed && l.length > 3) {
            changed = false;
            for (var i = 0; i < l.length && l.length > 3; i++) {
              var v = l[i];
              if (uses[v] !== 2) continue;
              var A = P(l[(i + l.length - 1) % l.length]), B = P(v), C = P(l[(i + 1) % l.length]);
              var d1 = sub(B, A), d2 = sub(C, B);
              if (len(cross(d1, d2)) <= len(d1) * len(d2) * 1e-9 && dot(d1, d2) > 0) { l.splice(i, 1); changed = true; i--; }
            }
          }
          return l;
        });
      });
      owner = new PairMap();
      loopsOf.forEach(function (ls, g) { ls.forEach(function (l) { for (var i = 0; i < l.length; i++) owner.set(l[i], l[(i + 1) % l.length], g); }); });
      ecls = new PairMap();
      shape = {};
      var failed = false;
      comps.forEach(function (c, ci) {
        if (!c.ok) return;
        var g = nF + ci, S = c.surf, bad = false;
        loopsOf[g].forEach(function (l) {
          for (var i = 0; i < l.length && !bad; i++) {
            var a = l[i], b = l[(i + 1) % l.length], A = P(a), B = P(b), cl = classifyEdge(S, A, B, tol), nb = owner.get(b, a);
            // lane stepreal2: two points of a hole's rim at one height on the bend make a chord of a latitude circle,
            // but the face beside it is the hole's wall, not that circle's plane: the edge is the wall's cut (an
            // ellipse, or the chord, below), not the circle's arc (it sent the bend back to facets)
            if (cl && cl.t === 'c' && nb != null && nb < nF) {
              var pf0 = mesh.faces[nb], pn0 = norm(pf0.normal);
              if (Math.abs(Math.abs(dot(pn0, cl.c.normal)) - 1) > 1e-9 || Math.abs(dot(pn0, cl.c.center) - pf0.w) > 100 * tol) cl = null;
            }
            // stepout-2: an oblique plane's cut is an ELLIPSE, where a true plane is beside (not the facets of a
            // curved face that fell back to facets: their planes are not the cut)
            if (!cl && nb != null && nb < nF && truePlane(nb)) { cl = ellipseEdge(S, A, B, mesh.faces[nb], tol); if (cl) c.oblique = true; }
            // lane stepout3: the edge of a radial wall (a hole folded through the bend) is that wall's rail, whatever it is
            if (nb != null && nb >= nW) { cl = { t: 'w', S: S }; ecls.set(a < b ? a : b, a < b ? b : a, cl); continue; }
            // lane stepreal2: any other edge of a cylinder patch whose two ends lie on the cylinder (a hole's wall
            // crossing a bend: the curve where two cylinders meet; an imported part's faces cut by B-spline curves) is
            // written as what the mesh holds, the chord (runs of them one degree 1 B-spline, see openEdge), where the
            // face beside it is a plane, facets, or another cylinder with both ends on it that has no name for the edge
            // either. The patch then keeps its CYLINDRICAL_SURFACE (was: one such edge sent the whole patch, and with it
            // the bend, back to planar facets: the imported part's bends came back without their surfaces, 0.03 – 0.07 %
            // of the volume off). Anvil's reader takes such a face back (cylPatch) with the same points.
            if (!cl && nb != null && S.t === 'cyl' && onCylS(S, A) && onCylS(S, B)) {
              var oS = nb >= nF ? comps[nb - nF].surf : null;
              if (!oS || (oS.t === 'cyl' && onCylS(oS, A) && onCylS(oS, B) && !classifyEdge(oS, A, B, tol))) { cl = PEDGE; c.poly = true; ecls.set(a < b ? a : b, a < b ? b : a, cl); continue; }
            }
            if (!cl || nb == null) { bad = true; break; }
            if (nb >= nF) {
              var c2 = classifyEdge(comps[nb - nF].surf, A, B, tol);
              if (!c2 || c2.t !== cl.t || (cl.t === 'c' && c2.c.key !== cl.c.key)) bad = true;
            } else if (cl.t === 'c') {
              var pf = mesh.faces[nb], pn = norm(pf.normal);
              // (lane stepreal2: 100 tol on the offset. The chord's ends are the plane's own vertices, so with the normals
              // parallel the circle is in the plane; a mesh face's w is one polygon's, 7e-7 off on an imported part, and
              // that one edge sent a hole's wall back to facets)
              if (Math.abs(Math.abs(dot(pn, cl.c.normal)) - 1) > 1e-9 || Math.abs(dot(pn, cl.c.center) - pf.w) > 100 * tol) bad = true;
            }
            ecls.set(a < b ? a : b, a < b ? b : a, cl);
          }
        });
        // stepout-2: an ELLIPSE run's end points are vertices of the file, so they must lie on the cylinder (its inner
        // points may sit on the facets' chords, where a plane cut a faceted bend: they are not written)
        if (!bad) loopsOf[g].forEach(function (l) {
          var n = l.length;
          function run(i, j, k) { var x = eget(l[j % n], l[k % n]), y = eget(l[i % n], l[j % n]); return x && y && x.t === 'e' && y.t === 'e' && x.e.key === y.e.key && owner.get(l[k % n], l[j % n]) === owner.get(l[j % n], l[i % n]); }
          for (var i = 0; i < n && !bad; i++) {
            var c0 = eget(l[i], l[(i + 1) % n]);
            if (!c0 || c0.t !== 'e') continue;
            if (!run(i + n - 1, i, i + 1) && !onCylS(S, P(l[i]))) bad = true;   // (lane stepreal2: onCylS, an imported curve's end is 2e-6 r off)
            if (!run(i, i + 1, i + 2) && !onCylS(S, P(l[(i + 1) % n]))) bad = true;
          }
        });
        var sh = bad ? null : patchShape(c, loopsOf[g]);
        // lane mitreplane (rfKC): a patch made exact by snapToCylinders is written only in the form Anvil's reader
        // takes back (curvedFace: one loop, two runs of rulings, the rest arcs at two levels or ellipse runs); a bend
        // notched by a relief slot (an L in (angle, t): three runs of rulings), or a band with holes (the Mug's body where
        // the faceted handle meets it) keeps its facets
        // (lane stepin2: the reader's cylPatch now takes any cylinder patch whose loops stay on one side of the axis, the
        // 'plain' shape: an L-shaped patch a relief notched, a bend with a hole or slot through it; so those are written
        // whole too. Was: one loop of two ruling runs only)
        if (sh && c.snapped && (sh.kind !== 'plain' || S.t !== 'cyl')) sh = null;
        if (!sh) { c.ok = false; failed = true; } else shape[g] = sh;
      });
      // stepout-2: a bend is written whole or not at all. An obliquely cut cylinder (ELLIPSE edges) whose coaxial
      // partner of another radius (the other side of the sheet) keeps its facets goes back to facets too: one exact
      // side of a faceted bend adds that side's curve correction alone (the read-back volume gets worse than all
      // facets), and SolidWorks' Insert Bends needs both cylinders anyway
      comps.forEach(function (c) {
        if (!c.ok || !(c.oblique || c.snapped || c.poly)) return;   // (lane mitreplane: or made exact by snapToCylinders)
        var S = c.surf;
        for (var k = 0; k < comps.length; k++) {
          var o = comps[k], S2 = o.surf;
          if (o === c || o.ok || !S2 || S2.t !== 'cyl' || Math.abs(S2.r - S.r) <= tol) continue;
          if (len(cross(S.d, S2.d)) < 1e-9 && axial(S, S2.o).rho < tol) { c.ok = false; failed = true; return; }
        }
      });
      return !failed;
    }
    // the shape of an analytic patch from its loops: band / cap / closed / plain, or null (keep the facets)
    function patchShape(c, loops) {
      var S = c.surf, nC = canonDir(S.d), xd = xdirOf(nC), yd = cross(nC, xd), closed = [], other = [];
      loops.forEach(function (l) {
        var first = eget(l[0], l[1]), nb0 = owner.get(l[1], l[0]), all = first && first.t === 'c' && first.lat;
        for (var i = 1; i < l.length && all; i++) {
          var cl = eget(l[i], l[(i + 1) % l.length]);
          if (!cl || cl.t !== 'c' || cl.c.key !== first.c.key || owner.get(l[(i + 1) % l.length], l[i]) !== nb0) all = false;
        }
        (all ? closed : other).push({ loop: l, circle: all ? first.c : null });
      });
      var onAxis = null;
      c.tris.forEach(function (t2) { for (var e2 = 0; e2 < 3; e2++) { var v = tri[t2 * 3 + e2]; if (!onAxis && axial(S, P(v)).rho < tol) onAxis = P(v); } });
      if (!closed.length && !other.length) return S.t === 'sph' || S.t === 'tor' ? { kind: 'closed' } : null;
      if (!closed.length) {
        if (S.t !== 'cyl' && S.t !== 'cone' && S.t !== 'tor' && S.t !== 'sph') return null;
        // rfFF: a sphere patch bounded by arcs (a fillet's spherical corner) is written on a sphere whose axis is square
        // to the patch's mean direction m and whose seam (x direction) is opposite m, so the patch keeps clear of the
        // poles and the seam; a torus patch (a fillet along part of a circle) keeps its own axis
        var SA = S;
        if (S.t === 'sph') {
          var m = [0, 0, 0];
          c.tris.forEach(function (t2) { m = add(m, sub(scale(add(add(P(tri[t2 * 3]), P(tri[t2 * 3 + 1])), P(tri[t2 * 3 + 2])), 1 / 3), S.o)); });
          if (len(m) < tol) return null;
          m = norm(m);
          var w = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
          c.axis = norm(cross(m, w)); c.xdir = scale(m, -1);
          SA = { t: 'sph', o: S.o, d: c.axis, r: S.r };
          xd = c.xdir; yd = cross(c.axis, xd);
        }
        // every loop must stay on one side of the axis (winding number 0)
        for (var k = 0; k < other.length; k++) {
          var l = other[k].loop, sum = 0, prev = null, first2 = null;
          for (var i = 0; i < l.length; i++) {
            var ax = axial(SA, P(l[i]));
            if (ax.rho < tol) return null;
            var ang = Math.atan2(dot(ax.v, yd), dot(ax.v, xd));
            if (prev == null) first2 = ang; else sum += wrapAngle(ang - prev);
            prev = ang;
          }
          sum += wrapAngle(first2 - prev);
          if (Math.abs(sum) > Math.PI) return null;
        }
        return { kind: 'plain' };
      }
      if (other.length) return null;
      if (closed.length === 2 && closed[0].circle.key !== closed[1].circle.key) return { kind: 'band', loops: closed };
      if (closed.length === 1 && onAxis && (S.t === 'cone' || S.t === 'sph')) {
        var apex = S.t === 'cone' ? add(S.o, scale(S.d, -S.r / S.k)) : add(S.o, scale(nC, dot(sub(onAxis, S.o), nC) > 0 ? S.r : -S.r));
        return { kind: 'cap', loops: closed, apex: apex };
      }
      return null;
    }
    // lane mitreplane: a vertex moved onto a cylinder whose patch falls back to facets anyway goes back where it was (its
    // facets' planes hold it there) and everything is built again from the start, as if it had never moved, until no
    // patch with a moved vertex fails
    var ok0 = comps.map(function (c) { return c.ok; }), live = snaps.slice();
    for (var round = 0; ; round++) {
      comps.forEach(function (c, ci) { c.ok = ok0[ci]; c.oblique = false; c.snapped = false; c.poly = false; });
      live.forEach(function (sn) { sn.all.forEach(function (ci) { comps[ci].snapped = true; }); });
      for (var iter = 0; iter < comps.length + 2 && !build(); iter++) { /* a patch fell back to facets: rebuild the topology */ }
      var undo = live.filter(function (sn) { return sn.comps.some(function (ci) { return !comps[ci].ok; }); });
      // lane stepout3: a radial wall whose bend fell back to facets goes back to its triangles, its points where they were
      var wUndo = walls.filter(function (w) { return w.live && (!comps[w.ci].ok || !comps[w.co].ok); });
      if (wUndo.length || (round >= 3 && walls.some(function (w) { return w.live; }))) {
        (round >= 3 ? walls : wUndo).forEach(function (w) { w.live = false; });
        var still = {};
        walls.forEach(function (w) { if (w.live) w.la.concat(w.lb).forEach(function (v) { still[v] = true; }); });
        Object.keys(wallHome).forEach(function (k) { if (!still[k]) { var X = wallHome[k]; pos[k * 3] = X[0]; pos[k * 3 + 1] = X[1]; pos[k * 3 + 2] = X[2]; delete wallHome[k]; } });
        if (!undo.length) continue;
      }
      if (!undo.length) break;
      if (round >= 3) undo = live;   // (still failing: no moved vertex at all)
      undo.forEach(function (sn) { pos[sn.v * 3] = sn.X[0]; pos[sn.v * 3 + 1] = sn.X[1]; pos[sn.v * 3 + 2] = sn.X[2]; });
      live = live.filter(function (sn) { return undo.indexOf(sn) < 0; });
    }

    // ---- writing
    var vp = {}, cv = {}, cg = {}, chains = {};
    function pt(p) { return W.add('CARTESIAN_POINT(\'\',' + stepVec(p) + ')'); }
    function dirE(d) { return W.add('DIRECTION(\'\',' + stepVec(d) + ')'); }
    function axisE(o, z, x) { return W.add('AXIS2_PLACEMENT_3D(\'\',' + pt(o) + ',' + dirE(z) + ',' + dirE(x) + ')'); }
    function vertex(i) { return vp[i] || (vp[i] = W.add('VERTEX_POINT(\'\',' + pt(P(i)) + ')')); }
    function vertexAt(key, p) { return cv[key] || (cv[key] = W.add('VERTEX_POINT(\'\',' + pt(p) + ')')); }
    function circleVertex(c) { return vertexAt('c' + c.key, add(c.center, scale(c.xdir, c.radius))); }
    function circleE(c) { return cg[c.key] || (cg[c.key] = W.add('CIRCLE(\'\',' + axisE(c.center, c.normal, c.xdir) + ',' + stepReal(c.radius) + ')')); }
    function ellipseE(E) { return cg[E.key] || (cg[E.key] = W.add('ELLIPSE(\'\',' + axisE(E.center, E.normal, E.xdir) + ',' + stepReal(E.a) + ',' + stepReal(E.b) + ')')); }
    function lineE(A, B) { var d = sub(B, A); return W.add('LINE(\'\',' + pt(A) + ',' + W.add('VECTOR(\'\',' + dirE(norm(d)) + ',' + stepReal(len(d)) + ')') + ')'); }
    function oe(id, fwd) { return W.add('ORIENTED_EDGE(\'\',*,*,' + id + ',' + (fwd ? '.T.' : '.F.') + ')'); }
    function ccw(c, A, B) { return dot(cross(sub(A, c.center), sub(B, c.center)), c.normal) > 0; }
    // the oriented edges of one loop: runs of chords of one circle between the same two faces become one EDGE_CURVE
    function loopEdges(l, g) {
      var n = l.length, cls = [], nbs = [], i;
      for (i = 0; i < n; i++) { cls.push(eget(l[i], l[(i + 1) % n]) || { t: 'l' }); nbs.push(owner.get(l[(i + 1) % n], l[i])); }
      function same(i1, i2) {
        if (nbs[i1] !== nbs[i2]) return false;
        if (cls[i1].t === 'e' && cls[i2].t === 'e') return cls[i1].e.key === cls[i2].e.key;   // stepout-2
        if (cls[i1].t === 'p' && cls[i2].t === 'p') return true;   // lane stepreal2: a run of chords between the same two faces
        return cls[i1].t === 'c' && cls[i2].t === 'c' && cls[i1].c.key === cls[i2].c.key;
      }
      var breaks = [];
      for (i = 0; i < n; i++) if (!same((i + n - 1) % n, i)) breaks.push(i);
      // lane stepreal2: a closed run of chords (a hole's rim on a bend, one wall all round): two edges, split at the loop's
      // lowest and highest vertex numbers so the face on the other side, which walks it the other way, splits it alike
      if (!breaks.length && cls[0].t === 'p') { var lo = 0, hi = 0; for (i = 1; i < n; i++) { if (l[i] < l[lo]) lo = i; if (l[i] > l[hi]) hi = i; } breaks = lo < hi ? [lo, hi] : [hi, lo]; }
      if (!breaks.length) return [closedCircleEdge(cls[0].c, P(l[0]), P(l[1]))];
      var out = [];
      for (var k = 0; k < breaks.length; k++) {
        var s = breaks[k], e = breaks[(k + 1) % breaks.length], vs = [];
        if (e <= s) e += n;
        for (var j = s; j <= e; j++) vs.push(l[j % n]);
        out.push(openEdge(vs, cls[s]));
      }
      return out;
    }
    function openEdge(vs, cl) {
      var fk = vs.join(','), rk = vs.slice().reverse().join(','), key = fk < rk ? fk : rk, ch = chains[key];
      if (ch) return oe(ch.id, ch.fk === fk);
      var A = P(vs[0]), B = P(vs[1]), geom, sense = '.T.';
      if (cl.t === 'c') { geom = circleE(cl.c); sense = ccw(cl.c, A, B) ? '.T.' : '.F.'; }
      else if (cl.t === 'e') { geom = ellipseE(cl.e); sense = wrapAngle(ellipseParam(cl.e, B) - ellipseParam(cl.e, A)) > 0 ? '.T.' : '.F.'; }
      else if (cl.t === 'w') { var rl = railOf(cl.S, A, B); geom = rationalCurve(rl.poles, rl.w); }   // lane stepout3
      else if (cl.t === 'p' && vs.length > 2) geom = polylineCurve(vs.map(P));   // lane stepreal2
      else geom = lineE(A, P(vs[vs.length - 1]));
      ch = chains[key] = { id: W.add('EDGE_CURVE(\'\',' + vertex(vs[0]) + ',' + vertex(vs[vs.length - 1]) + ',' + geom + ',' + sense + ')'), fk: fk };
      return oe(ch.id, true);
    }
    function closedCircleEdge(c, A, B) {
      var dirCCW = ccw(c, A, B), key = 'C' + c.key, ch = chains[key];
      if (ch) return oe(ch.id, ch.ccw === dirCCW);
      var V = circleVertex(c);
      ch = chains[key] = { id: W.add('EDGE_CURVE(\'\',' + V + ',' + V + ',' + circleE(c) + ',' + (dirCCW ? '.T.' : '.F.') + ')'), ccw: dirCCW };
      return oe(ch.id, true);
    }
    function edgeLoop(oes) { return W.add('EDGE_LOOP(\'\',' + stepList(oes) + ')'); }
    // lane stepout3: a radial wall's rail from A to B on cylinder S (both on it): the circle's arc between their angles as
    // a rational cubic (the quadratic arc, weight cos(Δ/2) on the corner of the tangents, raised to degree 3), so it is
    // exact on the cylinder; the height of its two inner poles is free, set so the height runs with the angle (the
    // middle pair symmetric about the half way height, matched at a quarter: off a straight line in (angle, height) by
    // O(Δz·Δ⁴), 1e-10 on a hole's edge, where the quadratic's own bump was 2e-6 and left a vertex in the flat). The odd
    // symmetry keeps the (angle, height) area of every edge that of its chord. Straight along a ruling when Δ = 0.
    function railOf(S, A, B) {
      var a = axial(S, A), b = axial(S, B), ua = scale(a.v, 1 / a.rho), ub = scale(b.v, 1 / b.rho);
      var D = Math.atan2(dot(cross(ua, ub), S.d), dot(ua, ub)), w = Math.abs(D) < 1e-12 ? 1 : Math.cos(D / 2), r = (a.rho + b.rho) / 2;
      var um = Math.abs(D) < 1e-12 ? ua : norm(add(ua, ub)), m1 = scale(um, r / w), w1 = (1 + 2 * w) / 3, h = (b.z - a.z) / 2, zm = (a.z + b.z) / 2;
      var phi = Math.abs(D) < 1e-12 ? -0.25 : 2 * Math.atan(Math.tan(D / 4) * -0.5) / D;   // the angle's fraction at t = 1/4
      var c = (-(28 + 36 * w1) * 2 * h * phi - 26 * h) / (18 * w1);
      function pole(rad, z) { return add(add(S.o, scale(S.d, z)), rad); }
      var q1 = scale(add(scale(ua, a.rho), scale(m1, 2 * w)), 1 / (1 + 2 * w)), q2 = scale(add(scale(ub, b.rho), scale(m1, 2 * w)), 1 / (1 + 2 * w));
      return { poles: [A, pole(q1, zm - c), pole(q2, zm + c), B], w: Math.abs(w1 - 1) < 1e-15 ? 1 : w1 };
    }
    // lane stepreal2: the chords through pts as one curve: a degree 1 B-spline, a knot at every point
    function polylineCurve(pts) {
      var n = pts.length, mults = [], knots = [];
      for (var i = 0; i < n; i++) { mults.push(i === 0 || i === n - 1 ? 2 : 1); knots.push(stepReal(i)); }
      return W.add('B_SPLINE_CURVE_WITH_KNOTS(\'\',1,' + stepList(pts.map(pt)) + ',.POLYLINE_FORM.,.F.,.F.,(' + mults.join(',') + '),(' + knots.join(',') + '),.UNSPECIFIED.)');
    }
    function rationalCurve(poles, w) {
      var ps = stepList(poles.map(pt));
      if (w === 1) return W.add('B_SPLINE_CURVE_WITH_KNOTS(\'\',3,' + ps + ',.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.)');
      return W.add('(BOUNDED_CURVE()B_SPLINE_CURVE(3,' + ps + ',.UNSPECIFIED.,.F.,.F.)B_SPLINE_CURVE_WITH_KNOTS((4,4),(0.,1.),.UNSPECIFIED.)CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE((1.,' + stepReal(w) + ',' + stepReal(w) + ',1.))REPRESENTATION_ITEM(\'\'))');
    }
    // the wall face of radial strip wq: degree 3 along the rails (inner a → b, outer its partners), 1 across, the
    // rails' weights: every line across is radial
    function wallFace(wq, loop, g) {
      var ri = railOf(wq.S, P(wq.a), P(wq.b)), ro = railOf(wq.S, P(wq.pa), P(wq.pb)), wt = ri.w, ws = stepReal(wt);
      var rows = [0, 1, 2, 3].map(function (k) { return '(' + pt(ri.poles[k]) + ',' + pt(ro.poles[k]) + ')'; });
      var surf = wt === 1 ? W.add('B_SPLINE_SURFACE_WITH_KNOTS(\'\',3,1,(' + rows.join(',') + '),.UNSPECIFIED.,.F.,.F.,.F.,(4,4),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.)')
        : W.add('(BOUNDED_SURFACE()B_SPLINE_SURFACE(3,1,(' + rows.join(',') + '),.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS((4,4),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.)GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE(((1.,1.),(' + ws + ',' + ws + '),(' + ws + ',' + ws + '),(1.,1.)))REPRESENTATION_ITEM(\'\')SURFACE())');
      // same_sense: dPdu × dPdv (along the rail × outward across) against the triangles' outward normal
      var nb = cross(sub(ri.poles[3], ri.poles[0]), sub(scale(add(ro.poles[1], ro.poles[2]), 0.5), scale(add(ri.poles[1], ri.poles[2]), 0.5))), nt = [0, 0, 0];
      wq.tris.forEach(function (t2) { var A = P(tri[t2 * 3]); nt = add(nt, cross(sub(P(tri[t2 * 3 + 1]), A), sub(P(tri[t2 * 3 + 2]), A))); });
      return W.add('ADVANCED_FACE(\'\',(' + W.add('FACE_OUTER_BOUND(\'\',' + edgeLoop(loopEdges(loop, g)) + ',.T.)') + '),' + surf + ',' + (dot(nb, nt) > 0 ? '.T.' : '.F.') + ')');
    }

    // the seam of a band or cap from V1 (on circle c1) to the point p2: a ruling LINE, or a meridian arc of a sphere /
    // torus, the one that crosses the patch
    function seamEdge(c, S, V1ref, p1, V2ref, p2) {
      if (S.t === 'cyl' || S.t === 'cone') return W.add('EDGE_CURVE(\'\',' + V1ref + ',' + V2ref + ',' + lineE(p1, p2) + ',.T.)');
      var nC = canonDir(S.d), xd = xdirOf(nC), Cr = S.t === 'tor' ? Math.abs(S.R) : 0, C = add(S.o, scale(xd, Cr));
      function beta(p) { var ax = axial(S, p), z = dot(sub(p, S.o), nC); return Math.atan2(z, ax.rho - Cr); }
      var b1 = beta(p1), b2 = beta(p2), span = mod2pi(b2 - b1), inside = 0, total = 0;
      c.tris.forEach(function (t2) {
        var cen = scale(add(add(P(tri[t2 * 3]), P(tri[t2 * 3 + 1])), P(tri[t2 * 3 + 2])), 1 / 3);
        total++;
        if (mod2pi(beta(cen) - b1) < span) inside++;
      });
      var circ = circleOf(C, cross(xd, nC), S.r);
      circ.normal = cross(xd, nC); circ.xdir = xd; circ.key += '|seam';
      return W.add('EDGE_CURVE(\'\',' + V1ref + ',' + V2ref + ',' + W.add('CIRCLE(\'\',' + axisE(C, circ.normal, xd) + ',' + stepReal(S.r) + ')') + ',' + (inside * 2 >= total ? '.T.' : '.F.') + ')');
    }
    function surfaceE(c) {
      var S = c.surf, nC = c.axis || canonDir(S.d), xd = c.xdir || xdirOf(nC);   // rfFF: a sphere patch's own axis (patchShape)
      // same_sense: the true surface normal against the facets' outward normal, on the largest triangle
      var best = -1, bt = c.tris[0];
      c.tris.forEach(function (t2) { var A = P(tri[t2 * 3]), ar = len(cross(sub(P(tri[t2 * 3 + 1]), A), sub(P(tri[t2 * 3 + 2]), A))); if (ar > best) { best = ar; bt = t2; } });
      var X = scale(add(add(P(tri[bt * 3]), P(tri[bt * 3 + 1])), P(tri[bt * 3 + 2])), 1 / 3), nt = norm(mesh.faces[triPlane[bt]].normal);
      var ax = axial(S, X), er = norm(ax.v), grad;
      if (S.t === 'cyl') grad = er;
      else if (S.t === 'cone') grad = sub(er, scale(S.d, S.k));
      else if (S.t === 'sph') grad = sub(X, S.o);
      else grad = sub(X, add(S.o, add(scale(S.d, ax.z), scale(er, Math.abs(S.R)))));
      var sense = dot(nt, grad) > 0 ? '.T.' : '.F.', ref;
      if (S.t === 'cyl') ref = W.add('CYLINDRICAL_SURFACE(\'\',' + axisE(S.o, nC, xd) + ',' + stepReal(S.r) + ')');
      else if (S.t === 'cone') {
        var zs = 0, nz = 0;
        c.tris.forEach(function (t2) { for (var e2 = 0; e2 < 3; e2++) { zs += axial(S, P(tri[t2 * 3 + e2])).z; nz++; } });
        var zr = zs / nz, cd = S.k > 0 ? S.d : scale(S.d, -1);
        ref = W.add('CONICAL_SURFACE(\'\',' + axisE(add(S.o, scale(S.d, zr)), cd, xdirOf(cd)) + ',' + stepReal(S.r + S.k * zr) + ',' + stepReal(Math.atan(Math.abs(S.k))) + ')');
      } else if (S.t === 'sph') ref = W.add('SPHERICAL_SURFACE(\'\',' + axisE(S.o, nC, xd) + ',' + stepReal(S.r) + ')');
      else ref = W.add('TOROIDAL_SURFACE(\'\',' + axisE(S.o, nC, xd) + ',' + stepReal(Math.abs(S.R)) + ',' + stepReal(S.r) + ')');
      return { ref: ref, sense: sense };
    }
    function firstEdge(l) { return [P(l[0]), P(l[1])]; }

    var faceIds = [];
    groups.forEach(function (ts, g) {
      if (!ts.length || (g < nF && !loopsOf[g].length)) return;
      if (g >= nW) { if (loopsOf[g].length === 1) faceIds.push(wallFace(walls[g - nW], loopsOf[g][0], g)); return; }   // lane stepout3
      if (g < nF) {
        // a planar face: every counter-clockwise loop (seen along the normal) is an outer bound, every clockwise loop a
        // hole of the smallest outer loop that contains it
        var f = mesh.faces[g], n = norm(f.normal), fr = frameFor(n);
        var ls = loopsOf[g], l2 = ls.map(function (l) { return l.map(function (v) { var p = P(v); return [dot(p, fr.u), dot(p, fr.v)]; }); });
        var outers = [], holes = [];
        ls.forEach(function (l, i) { var A = area2(l2[i]); (A >= 0 ? outers : holes).push({ loop: l, pts: l2[i], area: Math.abs(A), holes: [] }); });
        holes.forEach(function (h) {
          var bestO = null, p0 = h.pts.length > 1 ? [(h.pts[0][0] + h.pts[1][0]) / 2, (h.pts[0][1] + h.pts[1][1]) / 2] : h.pts[0];
          outers.forEach(function (o2) { if (pointInPoly2(p0, o2.pts) && (!bestO || o2.area < bestO.area)) bestO = o2; });
          (bestO || outers[0] || { holes: [] }).holes.push(h);
        });
        outers.forEach(function (o2) {
          var bounds = [W.add('FACE_OUTER_BOUND(\'\',' + edgeLoop(loopEdges(o2.loop, g)) + ',.T.)')].concat(o2.holes.map(function (h) { return W.add('FACE_BOUND(\'\',' + edgeLoop(loopEdges(h.loop, g)) + ',.T.)'); }));
          var ax2 = axisE(P(o2.loop[0]), n, fr.u);
          faceIds.push(W.add('ADVANCED_FACE(\'\',' + stepList(bounds) + ',' + W.add('PLANE(\'\',' + ax2 + ')') + ',.T.)'));
        });
        return;
      }
      var c = comps[g - nF], S = c.surf, sh = shape[g], bounds = [], sf;
      if (sh.kind === 'plain') {
        sf = surfaceE(c);
        loopsOf[g].forEach(function (l) { bounds.push(W.add('FACE_BOUND(\'\',' + edgeLoop(loopEdges(l, g)) + ',.T.)')); });
      } else if (sh.kind === 'band') {
        var L1 = sh.loops[0], L2 = sh.loops[1], e1 = loopEdges(L1.loop, g)[0], e2 = loopEdges(L2.loop, g)[0];
        var p1 = add(L1.circle.center, scale(L1.circle.xdir, L1.circle.radius)), p2 = add(L2.circle.center, scale(L2.circle.xdir, L2.circle.radius));
        var seam = seamEdge(c, S, circleVertex(L1.circle), p1, circleVertex(L2.circle), p2);
        sf = surfaceE(c);
        bounds.push(W.add('FACE_BOUND(\'\',' + edgeLoop([e1, oe(seam, true), e2, oe(seam, false)]) + ',.T.)'));
      } else if (sh.kind === 'cap') {
        var L = sh.loops[0], ec = loopEdges(L.loop, g)[0], pc = add(L.circle.center, scale(L.circle.xdir, L.circle.radius));
        var sc = seamEdge(c, S, circleVertex(L.circle), pc, vertexAt('apex' + g, sh.apex), sh.apex);
        sf = surfaceE(c);
        bounds.push(W.add('FACE_BOUND(\'\',' + edgeLoop([ec, oe(sc, true), oe(sc, false)]) + ',.T.)'));
      } else if (S.t === 'sph') {
        sf = surfaceE(c);
        bounds.push(W.add('FACE_BOUND(\'\',' + W.add('VERTEX_LOOP(\'\',' + vertexAt('pole' + g, sub(S.o, scale(canonDir(S.d), S.r))) + ')') + ',.T.)'));
      } else {
        // a whole torus: the outer circle and the tube circle at angle 0, each used twice
        var nT2 = canonDir(S.d), xT = xdirOf(nT2), Rt = Math.abs(S.R), V = vertexAt('tor' + g, add(S.o, scale(xT, Rt + S.r)));
        var u = W.add('EDGE_CURVE(\'\',' + V + ',' + V + ',' + W.add('CIRCLE(\'\',' + axisE(S.o, nT2, xT) + ',' + stepReal(Rt + S.r) + ')') + ',.T.)');
        var v = W.add('EDGE_CURVE(\'\',' + V + ',' + V + ',' + W.add('CIRCLE(\'\',' + axisE(add(S.o, scale(xT, Rt)), cross(xT, nT2), xT) + ',' + stepReal(S.r) + ')') + ',.T.)');
        sf = surfaceE(c);
        bounds.push(W.add('FACE_BOUND(\'\',' + edgeLoop([oe(u, false), oe(v, false), oe(u, true), oe(v, true)]) + ',.T.)'));
      }
      faceIds.push(W.add('ADVANCED_FACE(\'\',' + stepList(bounds) + ',' + sf.ref + ',' + sf.sense + ')'));
    });
    return W.add('MANIFOLD_SOLID_BREP(' + stepString(name) + ',' + W.add('CLOSED_SHELL(\'\',' + stepList(faceIds) + ')') + ')');
  }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function mod2pi(a) { a = a % (2 * Math.PI); return a < 0 ? a + 2 * Math.PI : a; }

  // ------------------------------------------------------------------ B-spline curves and faces (rfGO)
  // A loft through three or more sections is bicubic (kernel-features.js loftPatches), so a body that is nothing but that
  // loft is written from its patches: one B_SPLINE_SURFACE_WITH_KNOTS face per piece, B_SPLINE_CURVE_WITH_KNOTS edges, two
  // PLANE caps (what occt-kernel.js loftTool sews). Any other body, a loft a later feature cut or joined included, keeps
  // the facets. The reader takes the same faces: a surface bounded by four B-spline edges along its own sides. Its chords
  // are moved off the curve by a twelfth of their second difference (Euler-Maclaurin: the trapezoid sum of the moved
  // samples is the integral to O(h^4)), so a tessellation of SPLINE_SEGS chords per knot span keeps the volume.
  var SPLINE_SEGS = 24;
  function bsFlat(knots, mults) { var U = []; knots.forEach(function (k, i) { for (var m = 0; m < +mults[i]; m++) U.push(+k); }); return U; }
  // lane realfiles: the knot vector a B-spline's form implies (QUASI_UNIFORM_*: clamped, even inside; UNIFORM_*: even,
  // unclamped; BEZIER_*: one span) for n poles of degree p
  function bsImplicit(t) { var m = /^(QUASI_UNIFORM|UNIFORM|BEZIER)_(CURVE|SURFACE)$/.exec(t || ''); return m ? m[1] : null; }
  function bsImplicitParts(P, what) { return P['QUASI_UNIFORM_' + what] ? 'QUASI_UNIFORM' : P['UNIFORM_' + what] ? 'UNIFORM' : P['BEZIER_' + what] ? 'BEZIER' : null; }
  function bsKnotsOf(kind, n, p) {
    var U = [], k;
    if (kind === 'UNIFORM') { for (k = 0; k < n + p + 1; k++) U.push(k - p); return U; }
    if (kind === 'BEZIER') { for (k = 0; k < n + p + 1; k++) U.push(k <= p ? 0 : 1); return U; }
    for (k = 0; k <= p; k++) U.push(0);
    for (k = 1; k < n - p; k++) U.push(k);
    for (k = 0; k <= p; k++) U.push(Math.max(1, n - p));
    return U;
  }
  // lane realfiles: one point of a B-spline surface ({ du, dv, poles, U, V, W } as bsSurfOf gives it) at (u, v)
  function bsSurfPoint(d, u, v) {
    var bu = bsBasis(d.du, d.U, u), bv = bsBasis(d.dv, d.V, v), p = [0, 0, 0], ws = 0;
    for (var i = 0; i <= d.du; i++) for (var j = 0; j <= d.dv; j++) {
      var q = d.poles[bu.s - d.du + i][bv.s - d.dv + j], w = bu.N[i] * bv.N[j];
      if (d.W) w *= d.W[bu.s - d.du + i][bv.s - d.dv + j];
      p[0] += w * q[0]; p[1] += w * q[1]; p[2] += w * q[2]; ws += w;
    }
    return d.W ? scale(p, 1 / ws) : p;
  }
  function bsCurvePoint(deg, poles, U, W, t) {
    var b = bsBasis(deg, U, t), p = [0, 0, 0], ws = 0;
    for (var i = 0; i <= deg; i++) { var q = poles[b.s - deg + i], w = b.N[i] * (W ? W[b.s - deg + i] : 1); p[0] += w * q[0]; p[1] += w * q[1]; p[2] += w * q[2]; ws += w; }
    return W ? scale(p, 1 / ws) : p;
  }
  // lane realfiles: paramPatch(loops, outerI, A) -> { V: [{ p, u, v }], T: [[i, j, k]] } or null. A face on any surface
  // with a parametrisation A = { uv(p) -> [u, v, pole?] | null, at(u, v) -> p, pu, pv (periods, 0 = none), hs, ht
  // (largest parameter step of a triangle edge; Infinity = straight that way), su, sv (scales making (u·su, v·sv)
  // roughly lengths, for the ear clipping) }. Every loop (3D points, the edges' own: watertight with the faces beside
  // it) is unrolled into (u, v) by continuity (a seam the loop runs up and back down unrolls to a rectangle; a pole, where
  // u is not defined, becomes a segment from the u before it to the u after it), ear clipped, then every interior edge
  // longer than one step is halved, longest first along its propagation path, its new point on the surface. A loop
  // winding round a period (a band with no seam edge) is not taken.
  // lane realfiles: delaunayFlips(T, P) flips, in place, every interior edge of the counter-clockwise triangles T (index
  // triples into the 2D points P) whose far vertex lies inside the other triangle's circumcircle (Lawson), so a fan the
  // ear clipping left becomes well shaped; edges with one triangle (the loops) never move
  function delaunayFlips(T, P, flatOnly) {   // flatOnly (lane stepreal2): only the flips that remove triangles of no area
    var em = new Map(), stack = [], guard = 0, sc = 0, M = P.length + 1;   // lane MO: number keys (a·M + b): string keys were most of an import's time
    function onEdge(a, b, c) {   // c on the segment a-b, strictly between its ends
      var ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, t = (c[0] - a[0]) * ex + (c[1] - a[1]) * ey;
      return L2 > 0 && Math.abs(ex * (c[1] - a[1]) - ey * (c[0] - a[0])) <= 1e-12 * L2 && t > 1e-9 * L2 && t < (1 - 1e-9) * L2;
    }
    P.forEach(function (p) { sc = Math.max(sc, Math.abs(p[0]), Math.abs(p[1])); });
    var eps = 1e-12 * Math.pow(sc || 1, 4);
    function ek(a, b) { return a < b ? a * M + b : b * M + a; }
    function link(ti, on) { var t = T[ti]; for (var e = 0; e < 3; e++) { var k = ek(t[e], t[(e + 1) % 3]), l = em.get(k); if (!l) em.set(k, l = []); if (on) l.push(ti); else l.splice(l.indexOf(ti), 1); if (on) stack.push(k); } }
    function inCircle(a, b, c, d) {
      var ax = a[0] - d[0], ay = a[1] - d[1], bx = b[0] - d[0], by = b[1] - d[1], cx = c[0] - d[0], cy = c[1] - d[1];
      return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > eps;
    }
    function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    function rot(t, a) { var i = t.indexOf(a); return [t[i], t[(i + 1) % 3], t[(i + 2) % 3]]; }
    for (var ti = 0; ti < T.length; ti++) link(ti, true);
    while (stack.length && guard++ < 2000000) {
      var key = stack.pop(), l = em.get(key);
      if (!l || l.length !== 2) continue;
      var ab = [Math.floor(key / M), key % M], t1 = rot(T[l[0]], ab[0]), i1 = l[0], i2 = l[1];
      if (t1[1] !== ab[1]) { t1 = rot(T[l[1]], ab[0]); i1 = l[1]; i2 = l[0]; }
      if (t1[1] !== ab[1]) continue;
      var a = t1[0], b = t1[1], c = t1[2], t2 = rot(T[i2], b);
      if (t2[1] !== a) continue;
      var d = t2[2];
      // lane stepreal2: a triangle of no area whose third point lies inside this edge (a boundary point the ear
      // clipping could only reach that way) always gives the edge up: left in, the refinement halved the edge at a
      // point that is the boundary's own, two triangles deep
      if (!onEdge(P[a], P[b], P[c]) && !onEdge(P[a], P[b], P[d]) && (flatOnly || !inCircle(P[a], P[b], P[c], P[d]))) continue;
      // the quad a, d, b, c must be convex for c-d to replace a-b
      if (!(orient(P[d], P[b], P[c]) > 0 && orient(P[a], P[d], P[c]) > 0)) continue;
      link(i1, false); link(i2, false);
      T[i1] = [a, d, c]; T[i2] = [d, b, c];
      link(i1, true); link(i2, true);
    }
  }
  // lane MO: gridInsert(V, T, rings, A) adds to the triangulation T (index triples into V, { p, u, v }) the points
  // (i·hs, j·ht) of the parameter grid that lie strictly inside one of its triangles and at least half a step (in step
  // units) from every boundary segment of rings, each splitting the triangle that holds it in three (orientation kept);
  // the caller's flips then make it Delaunay. New points lie on the surface (A.at).
  function gridInsert(V, T, rings, A) {
    var hs = A.hs, ht = A.ht, n0 = T.length, cells = {}, CL = 0.5;
    function Q(i) { return [V[i].u / hs, V[i].v / ht]; }
    function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    var nCells = 0;
    for (var r = 0; r < rings.length; r++) {
      var ix = rings[r];
      for (var i = 0; i < ix.length; i++) {
        var a = Q(ix[i]), b = Q(ix[(i + 1) % ix.length]);
        var x0 = Math.floor(Math.min(a[0], b[0]) - CL), x1 = Math.floor(Math.max(a[0], b[0]) + CL), y0 = Math.floor(Math.min(a[1], b[1]) - CL), y1 = Math.floor(Math.max(a[1], b[1]) + CL);
        nCells += (x1 - x0 + 1) * (y1 - y0 + 1);
        if (nCells > 400000) return;
        for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) (cells[cx + ',' + cy] || (cells[cx + ',' + cy] = [])).push([a, b]);
      }
    }
    function clear(p) {
      var l = cells[Math.floor(p[0]) + ',' + Math.floor(p[1])];
      if (!l) return true;
      for (var k = 0; k < l.length; k++) {
        var a = l[k][0], b = l[k][1], ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, t = L2 > 0 ? ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        var dx = p[0] - a[0] - t * ex, dy = p[1] - a[1] - t * ey;
        if (dx * dx + dy * dy < CL * CL) return false;
      }
      return true;
    }
    function inside(t3, P, p) {   // strictly inside, a hair (1e-7 step) clear of every side
      var a = P[t3[0]], b = P[t3[1]], c = P[t3[2]], ar = orient(a, b, c);
      if (!(Math.abs(ar) > 1e-14)) return false;
      var sg = ar > 0 ? 1 : -1, s = [[a, b], [b, c], [c, a]];
      for (var k = 0; k < 3; k++) {
        var e = s[k], d = orient(e[0], e[1], p) * sg, L = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
        if (!(d > 1e-7 * L)) return false;
      }
      return true;
    }
    var P = V.map(function (x) { return [x.u / hs, x.v / ht]; }), added = 0;
    for (var ti = 0; ti < n0; ti++) {
      var t0 = T[ti], A0 = P[t0[0]], B0 = P[t0[1]], C0 = P[t0[2]];
      var gx0 = Math.ceil(Math.min(A0[0], B0[0], C0[0])), gx1 = Math.floor(Math.max(A0[0], B0[0], C0[0])), gy0 = Math.ceil(Math.min(A0[1], B0[1], C0[1])), gy1 = Math.floor(Math.max(A0[1], B0[1], C0[1]));
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 200000) return;
      var sub = [ti];
      for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) {
        var p = [gx, gy];
        if (!inside(t0, P, p) || !clear(p)) continue;
        var at = -1;
        for (var k = sub.length - 1; k >= 0 && at < 0; k--) if (inside(T[sub[k]], P, p)) at = sub[k];
        if (at < 0) continue;   // on a side of a triangle already split: left to the refinement
        if (++added > 200000) return;
        var m = V.length, u = gx * hs, v = gy * ht;
        V.push({ p: A.at(u, v), u: u, v: v }); P.push(p);
        var t3 = T[at];
        T[at] = [t3[0], t3[1], m];
        T.push([t3[1], t3[2], m]); sub.push(T.length - 1);
        T.push([t3[2], t3[0], m]); sub.push(T.length - 1);
      }
    }
  }
  function paramPatch(loops, outerI, A) {
    var V = [], rings = [], mean0 = null, bands = [];
    function wrapP(d, P) { return P ? d - P * Math.round(d / P) : d; }
    for (var k = 0; k < loops.length; k++) {
      var pts = loops[k], n = pts.length;
      if (n < 3) return null;
      var raw = pts.map(function (p) { return A.uv(p); });
      if (raw.some(function (q) { return !q || !isFinite(q[0]) || !isFinite(q[1]); })) return null;
      var first = -1;
      for (var i = 0; i < n && first < 0; i++) if (!raw[i][2] && raw[(i + n - 1) % n][2]) first = i;   // just past a pole: the loop winds there
      for (i = 0; i < n && first < 0; i++) if (!raw[i][2]) first = i;
      if (first < 0) return null;
      var uw = new Array(n), prev = null, pole = false, accU = 0, accV = 0;
      for (var j = 0; j <= n; j++) {
        var ii = (first + j) % n, q = raw[ii];
        if (q[2]) { pole = true; continue; }
        if (prev) {
          var du = wrapP(q[0] - prev.r[0], A.pu), dv = wrapP(q[1] - prev.r[1], A.pv);
          if (!pole && ((A.pu && Math.abs(du) > A.pu / 4) || (A.pv && Math.abs(dv) > A.pv / 4))) return null;
          if (j === n) { accU += du; accV += dv; break; }
          uw[ii] = [prev.w[0] + du, prev.w[1] + dv]; accU += du; accV += dv;
        } else uw[ii] = [q[0], q[1]];
        prev = { r: q, w: uw[ii] }; pole = false;
      }
      // a loop through a pole may wind once round u (a cap: the circle, up the seam to the pole and back: the pole is
      // the segment closing it)
      var poled = raw.some(function (q2) { return q2[2]; });
      if (poled && A.pu && Math.abs(Math.abs(accU) - A.pu) <= 1e-6 * A.pu) accU = 0;
      var windU = A.pu && Math.abs(accU) > 1e-6 * A.pu, windV = A.pv && Math.abs(accV) > 1e-6 * A.pv;
      if (windU || windV) {
        // a band: a loop winding once round one period (a partial revolve's torus between two meridian circles, a
        // cylinder between two closed curves with no seam edge); two such loops are joined below
        if ((windU && windV) || poled || Math.abs(Math.abs(windU ? accU : accV) - (windU ? A.pu : A.pv)) > 1e-6 * (windU ? A.pu : A.pv)) return null;
        var line = [];
        for (j = 0; j < n; j++) { var at0 = (first + j) % n; line.push({ p: pts[at0], u: uw[at0][0], v: uw[at0][1] }); }
        line.push({ p: pts[first], u: uw[first][0] + accU, v: uw[first][1] + accV });   // the start again, one period on
        if ((windU ? accU : accV) < 0) line.reverse();
        bands.push({ dir: windU ? 0 : 1, line: line });
        continue;
      }
      var ring = [];
      for (j = 0; j < n; j++) {
        var at = (first + j) % n;
        if (uw[at]) { ring.push({ p: pts[at], u: uw[at][0], v: uw[at][1] }); continue; }
        var b4 = null, af = null;
        for (var s = 1; s < n && !b4; s++) b4 = uw[(at - s + n) % n];
        for (s = 1; s < n && !af; s++) af = uw[(at + s) % n];
        // the pole's segment carries a point every step (all the pole itself): the triangles along it then reach it
        // a step apart, as rows do; one long segment left a fan of triangles that is a line in space (area lost)
        var npole = Math.max(1, Math.ceil(Math.abs(af[0] - b4[0]) / A.hs - 1e-9));
        for (var pk = 0; pk <= npole; pk++) if (pk === 0 || Math.abs(af[0] - b4[0]) > 1e-12) ring.push({ p: pts[at], u: b4[0] + (af[0] - b4[0]) * pk / npole, v: raw[at][1] });
      }
      var mu = 0, mv = 0;
      ring.forEach(function (x) { mu += x.u; mv += x.v; });
      mu /= ring.length; mv /= ring.length;
      if (mean0 == null) mean0 = [mu, mv];
      else {
        var shU = A.pu ? A.pu * Math.round((mean0[0] - mu) / A.pu) : 0, shV = A.pv ? A.pv * Math.round((mean0[1] - mv) / A.pv) : 0;
        ring.forEach(function (x) { x.u += shU; x.v += shV; });
      }
      var idx = [];
      ring.forEach(function (x) { idx.push(V.length); V.push(x); });
      rings.push(idx);
    }
    if (bands.length) {
      // two band loops winding the same way: cut the band along the period at the first one's start; the ring runs up
      // one loop (one period on), across, back down the other, across: the cut's two copies stay unsplit (boundary
      // edges in (u, v)), so the triangles either side of it meet point for point
      if (bands.length !== 2 || bands[0].dir !== bands[1].dir) return null;
      var dI = bands[0].dir, Pd = dI ? A.pv : A.pu, key = dI ? 'v' : 'u', oth = dI ? 'u' : 'v';
      var L1 = bands[0].line, L2 = bands[1].line, s0 = L1[0][key], sh2 = Pd * Math.round((s0 - L2[0][key]) / Pd);
      L2.forEach(function (x) { x[key] += sh2; });
      if (rings.length) {   // holes beside the band: into its period window
        var mo = 0; L1.forEach(function (x) { mo += x[oth]; });
        rings.forEach(function (ix) { var m2 = 0; ix.forEach(function (q) { m2 += V[q][key]; }); m2 /= ix.length; var sh3 = Pd * Math.floor((m2 - s0) / Pd); ix.forEach(function (q) { V[q][key] -= sh3; }); });
      }
      // the cut runs on the surface: points every step along it, the same parameters on both copies (one period apart:
      // the same points in space)
      var bring = [], a0 = L1[0], b0 = L2[0], cutPts = [];
      var m = Math.ceil(Math.max(Math.abs(b0.u - a0.u) / A.hs, Math.abs(b0.v - a0.v) / A.ht) - 1e-9);
      for (var c2 = 1; c2 < m; c2++) { var u2 = a0.u + (b0.u - a0.u) * c2 / m, v2 = a0.v + (b0.v - a0.v) * c2 / m; cutPts.push({ p: A.at(u2, v2), u: u2, v: v2 }); }
      L1.forEach(function (x) { bring.push(V.length); V.push(x); });
      cutPts.forEach(function (x) { var y = { p: x.p, u: x.u, v: x.v }; y[key] += Pd; bring.push(V.length); V.push(y); });   // the top copy
      L2.slice().reverse().forEach(function (x) { bring.push(V.length); V.push(x); });
      cutPts.slice().reverse().forEach(function (x) { bring.push(V.length); V.push(x); });
      rings.unshift(bring);
      outerI = 0;
    }
    function sOf(x) { return [x.u * A.su, x.v * A.sv]; }
    var P2 = V.map(sOf);
    function area(ix) { var s2 = 0; for (var i2 = 0; i2 < ix.length; i2++) { var a = P2[ix[i2]], b = P2[ix[(i2 + 1) % ix.length]]; s2 += a[0] * b[1] - b[0] * a[1]; } return s2 / 2; }
    var oi = outerI;
    if (oi == null || oi < 0 || oi >= rings.length) { var big = -1; rings.forEach(function (ix, k2) { var a = Math.abs(area(ix)); if (a > big) { big = a; oi = k2; } }); }
    rings = rings.map(function (ix, k2) { return (k2 === oi) !== (area(ix) > 0) ? ix.slice().reverse() : ix; });
    var tl = earcut(P2, rings[oi], rings.filter(function (ix, k2) { return k2 !== oi; })), T3 = [];
    for (var t = 0; t + 2 < tl.length; t += 3) T3.push([tl[t], tl[t + 1], tl[t + 2]]);
    if (!T3.length) return null;
    var ea = 0;
    T3.forEach(function (t3) { ea += (P2[t3[1]][0] - P2[t3[0]][0]) * (P2[t3[2]][1] - P2[t3[0]][1]) - (P2[t3[2]][0] - P2[t3[0]][0]) * (P2[t3[1]][1] - P2[t3[0]][1]); });
    var want = rings.reduce(function (s2, ix) { return s2 + area(ix); }, 0);
    if (!(Math.abs(ea / 2 - want) <= 1e-6 * Math.max(Math.abs(want), 1e-12))) return null;   // the ear clipping failed
    // fans of the ear clipping made well shaped first, in the refinement's own measure (one step = 1 each way; a straight
    // direction scaled as lengths), so the refinement then adds few points
    var hsF = isFinite(A.hs) ? A.hs : A.ht * A.sv / A.su, htF = isFinite(A.ht) ? A.ht : A.hs * A.su / A.sv;
    // lane MO: curved both ways (sphere, torus, B-spline): the points of the canonical grid (one step each way, as the
    // kernel's own rows) that lie inside the patch and half a step clear of its boundary go in first, each into the ear
    // clipping's triangle that holds it, and the flips below make the whole Delaunay in step units; the refinement then
    // only fills what the grid left (it alone made 2.5 to 13 triangles a step², the grid makes 2)
    if (isFinite(A.hs) && isFinite(A.ht)) gridInsert(V, T3, rings, A);
    delaunayFlips(T3, isFinite(hsF) && isFinite(htF) ? V.map(function (x) { return [x.u / hsF, x.v / htF]; }) : P2);
    var em = {};
    function ek(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
    // an edge is halved when it spans more than SPLIT steps: halves of an edge just over one step would double the
    // density each way (bisection makes edges of 1 and 1/2), so edges end between 0.7 and 1.4 steps, a step on average
    var SPLIT = 1.4;
    function span(a, b) { return Math.max(Math.abs(V[a].u - V[b].u) / A.hs, Math.abs(V[a].v - V[b].v) / A.ht); }
    function addT(ti) { var t3 = T3[ti]; for (var e = 0; e < 3; e++) { var key = ek(t3[e], t3[(e + 1) % 3]); (em[key] || (em[key] = [])).push(ti); } }
    function remT(ti) { var t3 = T3[ti]; for (var e = 0; e < 3; e++) { var l = em[ek(t3[e], t3[(e + 1) % 3])], at2 = l.indexOf(ti); if (at2 >= 0) l.splice(at2, 1); } }
    function longest(ti) { var t3 = T3[ti], best = 0; for (var e = 1; e < 3; e++) if (span(t3[e], t3[(e + 1) % 3]) > span(t3[best], t3[(best + 1) % 3])) best = e; return [t3[best], t3[(best + 1) % 3]]; }
    var queue;
    function splitEdge(a, b) {
      var u = (V[a].u + V[b].u) / 2, v = (V[a].v + V[b].v) / 2, m = V.length, ts = em[ek(a, b)].slice();
      V.push({ p: A.at(u, v), u: u, v: v });
      ts.forEach(function (ti) {
        var t3 = T3[ti], e = 0;
        while (e < 3 && !((t3[e] === a && t3[(e + 1) % 3] === b) || (t3[e] === b && t3[(e + 1) % 3] === a))) e++;
        var i3 = t3[e], j3 = t3[(e + 1) % 3], c = t3[(e + 2) % 3];
        remT(ti);
        T3[ti] = [i3, m, c]; addT(ti);
        T3.push([m, j3, c]); addT(T3.length - 1);
        queue.push(ti, T3.length - 1);
      });
    }
    T3.forEach(function (t3, ti) { addT(ti); });
    queue = T3.map(function (t3, ti) { return ti; });
    var guard = 0;
    while (queue.length && guard < 400000) {
      var ti0 = queue.pop(), e0 = longest(ti0);
      if (span(e0[0], e0[1]) <= SPLIT) continue;
      var cur = ti0, edge = e0;
      for (var walk = 0; walk < 1000; walk++) {
        guard++;
        var nbs = em[ek(edge[0], edge[1])], nb = nbs.length === 2 ? (nbs[0] === cur ? nbs[1] : nbs[0]) : -1;
        if (nb < 0) { edge = null; break; }   // a boundary edge: kept (the edges' own points)
        var en = longest(nb);
        if (span(en[0], en[1]) <= span(edge[0], edge[1]) * (1 + 1e-12)) break;
        cur = nb; edge = en;
      }
      if (!edge) continue;
      splitEdge(edge[0], edge[1]);
      queue.push(ti0);
    }
    if (guard >= 400000) return null;
    return { V: V, T: T3 };
  }
  function bsBasis(deg, U, t) {
    var last = U.length - deg - 2, s = deg;
    while (s < last && !(t < U[s + 1])) s++;
    var N = [1], L = [], R = [];
    for (var j = 1; j <= deg; j++) {
      L[j] = t - U[s + 1 - j]; R[j] = U[s + j] - t;
      var saved = 0;
      for (var r = 0; r < j; r++) { var tmp = N[r] / (R[r + 1] + L[j - r]); N[r] = saved + R[r + 1] * tmp; saved = L[j - r] * tmp; }
      N[j] = saved;
    }
    return { s: s, N: N };
  }
  function bsParams(U, deg) {
    var out = [], end = U.length - deg - 1;
    for (var i = deg; i < end; i++) if (U[i + 1] > U[i]) for (var s = 0; s < SPLINE_SEGS; s++) out.push(U[i] + (U[i + 1] - U[i]) * s / SPLINE_SEGS);
    out.push(U[end]);
    return out;
  }
  // W (lane importbend): the weights of a rational curve / surface (RATIONAL_B_SPLINE_CURVE / _SURFACE), else null
  function bsCurvePoints(deg, poles, U, W) {
    return bsParams(U, deg).map(function (t) {
      var b = bsBasis(deg, U, t), p = [0, 0, 0], ws = 0;
      for (var k = 0; k <= deg; k++) {
        var q = poles[b.s - deg + k], c = W ? b.N[k] * W[b.s - deg + k] : b.N[k];
        p[0] += c * q[0]; p[1] += c * q[1]; p[2] += c * q[2]; ws += c;
      }
      return W ? scale(p, 1 / ws) : p;
    });
  }
  // G[i][j]: i along u (the first index of the poles), j along v
  function bsSurfaceGrid(du, dv, poles, U, V, W) {
    var bv = bsParams(V, dv).map(function (t) { return bsBasis(dv, V, t); });
    return bsParams(U, du).map(function (t) {
      var bu = bsBasis(du, U, t);
      return bv.map(function (b) {
        var p = [0, 0, 0], ws = 0;
        for (var i = 0; i <= du; i++) for (var j = 0; j <= dv; j++) {
          var q = poles[bu.s - du + i][b.s - dv + j], w = bu.N[i] * b.N[j];
          if (W) w *= W[bu.s - du + i][b.s - dv + j];
          p[0] += w * q[0]; p[1] += w * q[1]; p[2] += w * q[2]; ws += w;
        }
        return W ? scale(p, 1 / ws) : p;
      });
    });
  }
  // the area-true move of sample i of n + 1, none at a corner of the path. The ends stay put, so the samples next to them
  // take 1/8: the end's own 1/24 of the second difference (Gregory's end correction; 1/12 alone is 1e-4 short on a circle)
  function areaTrueMove(a, p, b, i, n) {
    var d1 = sub(p, a), d2 = sub(b, p), l = len(d1) * len(d2);
    return l > 0 && dot(d1, d2) > 0.85 * l ? scale(sub(add(a, b), scale(p, 2)), i === 1 || i === n - 1 ? -1 / 8 : -1 / 12) : [0, 0, 0];
  }
  function areaTruePath(pts) { var n = pts.length - 1; return pts.map(function (p, i) { return i === 0 || i === n ? p : add(p, areaTrueMove(pts[i - 1], p, pts[i + 1], i, n)); }); }
  function areaTrueGrid(G, bottom, right, top, left) {
    var nu = G.length - 1, nv = G[0].length - 1;
    return G.map(function (col, i) {
      return col.map(function (p, j) {
        if (j === 0) return bottom[i];
        if (j === nv) return top[i];
        if (i === 0) return left[j];
        if (i === nu) return right[j];
        return add(add(p, areaTrueMove(G[i - 1][j], p, G[i + 1][j], i, nu)), areaTrueMove(col[j - 1], p, col[j + 1], j, nv));
      });
    });
  }
  // emit(a, b, c) counter-clockwise in (u, v); the diagonals alternate, so a twisted cell's error cancels in the next
  function gridTris(Q, emit) {
    for (var i = 0; i + 1 < Q.length; i++) for (var j = 0; j + 1 < Q[0].length; j++) {
      var a = Q[i][j], b = Q[i + 1][j], c = Q[i + 1][j + 1], d = Q[i][j + 1];
      if ((i + j) % 2) { emit(a, b, c); emit(a, c, d); } else { emit(a, b, d); emit(b, c, d); }
    }
  }
  function columnOf(G, j) { return G.map(function (c) { return c[j]; }); }
  // lane importbend: bsSurfClassify(G) -> { plane: n } | { cyl: { t: 'cyl', o, d, r }, flip } | null for a grid of
  // surface points G[i][j] (bsSurfaceGrid): all on one plane (n along the surface's dPdu x dPdv), or straight along one
  // parameter with every point at r from one axis (flip: dPdu x dPdv points at the axis). Within 1e-9 of the size, so
  // only a surface that IS a plane or a cylinder (rational for the cylinder) is read as one.
  function bsSurfClassify(G) {
    var nu = G.length - 1, nv = G[0].length - 1, all = [], a = G[0][0], ext = 0;
    G.forEach(function (c) { c.forEach(function (p) { all.push(p); ext = Math.max(ext, len(sub(p, a))); }); });
    if (!(ext > 0) || nu < 1 || nv < 1) return null;
    var tol = 1e-9 * Math.max(ext, len(a), 1), im = nu >> 1, jm = nv >> 1;
    var sn = cross(sub(G[Math.min(nu, im + 1)][jm], G[Math.max(0, im - 1)][jm]), sub(G[im][Math.min(nv, jm + 1)], G[im][Math.max(0, jm - 1)]));
    var far = a, fl = 0, best = null, bl = 0;
    all.forEach(function (p) { var l = len(sub(p, a)); if (l > fl) { fl = l; far = p; } });
    all.forEach(function (p) { var x = cross(sub(far, a), sub(p, a)), l = len(x); if (l > bl) { bl = l; best = x; } });
    if (best && bl > 1e-12 * fl * fl) {
      var pn = norm(best);
      if (all.every(function (p) { return Math.abs(dot(sub(p, a), pn)) <= tol; })) { pn = dot(pn, sn) < 0 ? scale(pn, -1) : pn; return { plane: pn, w: dot(pn, a), tol: tol }; }
    }
    for (var dir = 0; dir < 2; dir++) {
      var lines = dir === 0 ? G : G[0].map(function (q, j) { return columnOf(G, j); }), d = null, ok = true;
      lines.forEach(function (L) {
        if (!ok) return;
        var ch = sub(L[L.length - 1], L[0]), lc = len(ch);
        if (!(lc > 1e-6 * ext)) { ok = false; return; }
        var u = scale(ch, 1 / lc);
        if (!L.every(function (p) { var v = sub(p, L[0]); return len(sub(v, scale(u, dot(v, u)))) <= tol; })) { ok = false; return; }
        if (!d) d = u; else if (Math.abs(dot(d, u)) < 1 - 1e-12) ok = false;
      });
      if (!ok || !d) continue;
      var s0 = lines[0][0], sec = lines.map(function (L) { var p = L[0]; return sub(p, scale(d, dot(sub(p, s0), d))); });
      var f = bsFitCurve(sec), C = f && f.circle;
      if (!C || Math.abs(Math.abs(dot(C.n, d)) - 1) > 1e-9) continue;
      if (!all.every(function (p) { var v = sub(p, C.c); return Math.abs(len(sub(v, scale(d, dot(v, d)))) - C.r) <= tol; })) continue;
      var mv = sub(G[im][jm], C.c), radial = sub(mv, scale(d, dot(mv, d)));
      return { cyl: { t: 'cyl', o: C.c, d: d, r: C.r }, flip: dot(sn, radial) < 0 };
    }
    return null;
  }
  // lane importbend: the samples of a B-spline edge's curve cut to its vertices p1 .. p2 (a curve may run past them, a
  // closed one start elsewhere); the end samples become the vertices
  function bsTrim(raw, p1, p2) {
    var n = raw.length;
    function near(p) { var k = 0, d = Infinity; raw.forEach(function (q, i) { var e = len(sub(q, p)); if (e < d) { d = e; k = i; } }); return k; }
    var closed = len(sub(raw[0], raw[n - 1])) <= 1e-9 * (1 + len(raw[0])), i1 = near(p1), i2 = near(p2), out = raw;
    if (closed && len(sub(p1, p2)) <= 1e-9 * (1 + len(p1))) { if (i1 !== 0 && i1 !== n - 1) out = raw.slice(i1).concat(raw.slice(1, i1 + 1)); }
    else if (i1 === n - 1 && closed) out = raw.slice(0, i2 + 1);   // the closed curve's start is p1
    else if (i2 === 0 && closed) out = raw.slice(i1);
    else if (i1 < i2) out = raw.slice(i1, i2 + 1);
    else if (closed && i1 > i2) out = raw.slice(i1).concat(raw.slice(1, i2 + 1));
    out = out.slice();
    if (out.length < 2) out = [p1, p2];
    out[0] = p1; out[out.length - 1] = p2;
    return out;
  }
  // bsFitCurve(raw) -> { line: true } | { circle: { c, n, r } } (n: the curve runs counter-clockwise about it) | null:
  // a B-spline edge that is exactly a straight line or a circular arc (a rational B-spline circle), within 1e-9 of its size
  function bsFitCurve(raw) {
    var n = raw.length, a = raw[0], z = raw[n - 1], ext = 0;
    raw.forEach(function (p) { ext = Math.max(ext, len(sub(p, a))); });
    if (!(ext > 0)) return null;
    var tol = 1e-9 * Math.max(ext, len(a), 1), ch = sub(z, a), lc = len(ch);
    if (lc > 1e-6 * ext && raw.every(function (p) { var v = sub(p, a); return len(sub(v, scale(ch, dot(v, ch) / (lc * lc)))) <= tol; })) return { line: true };
    if (n < 3) return null;
    var closed = lc <= 1e-9 * Math.max(ext, 1), b = raw[closed ? Math.round(n / 3) : Math.floor(n / 2)], c = closed ? raw[Math.round(2 * n / 3)] : z;
    var ab = sub(b, a), ac = sub(c, a), nr = cross(ab, ac), l2 = dot(nr, nr);
    if (!(l2 > 1e-24 * ext * ext * ext * ext)) return null;
    var C = add(a, scale(add(scale(cross(nr, ab), dot(ac, ac)), scale(cross(ac, nr), dot(ab, ab))), 1 / (2 * l2))), N = norm(nr), r = len(sub(a, C)), turn = 0;
    if (!raw.every(function (p) { var v = sub(p, C); return Math.abs(dot(v, N)) <= tol && Math.abs(len(v) - r) <= tol; })) return null;
    for (var k = 0; k + 1 < n; k++) turn += dot(cross(sub(raw[k], C), sub(raw[k + 1], C)), N);
    return { circle: { c: C, n: turn < 0 ? scale(N, -1) : N, r: r } };
  }
  // the closed shell of a loft's patches: signed volume (+ when dPdu x dPdv points outward) and bounds
  function loftShellInfo(faces) {
    var o = faces[0].poles[0][0], v = 0, low = [], high = [], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    function tet(a, b, c) { v += dot(sub(a, o), cross(sub(b, o), sub(c, o))) / 6; }
    faces.forEach(function (pa) {
      var G = bsSurfaceGrid(3, pa.degV, pa.poles, bsFlat(pa.uKnots, pa.uMults), bsFlat(pa.vKnots, pa.vMults)), nv = G[0].length - 1;
      var bottom = areaTruePath(columnOf(G, 0)), top = areaTruePath(columnOf(G, nv));
      gridTris(areaTrueGrid(G, bottom, areaTruePath(G[G.length - 1]), top, areaTruePath(G[0])), tet);
      low = low.concat(bottom.slice(0, -1)); high = high.concat(top.slice(0, -1));
      G.forEach(function (c) { c.forEach(function (p) { for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }); });
    });
    for (var i = 1; i + 1 < high.length; i++) tet(high[0], high[i], high[i + 1]);
    for (i = 1; i + 1 < low.length; i++) tet(low[0], low[i + 1], low[i]);
    return { volume: v, lo: lo, hi: hi };
  }
  // splineLoftOf(src, mesh) -> { faces, sense } when the body is exactly one loft's patches, else null
  function splineLoftOf(src, mesh) {
    if (!src || !src.body.polygons.length || !K._.loftPatches) return null;
    var polys = src.body.polygons, id = polys[0].shared, i;
    for (i = 0; i < polys.length; i++) if (polys[i].shared !== id) return null;
    try {
      var m = K.resolvedModel(src.model).model, f = K.findFeature(m, id);
      if (!f || f.type !== 'loft' || f.cut || !f.sketches || f.sketches.length < 3) return null;
      var planes = (src.build && src.build.planes) || {};
      var pa = K._.loftPatches(f.sketches.map(function (sid) {
        var s = K.findFeature(m, sid), pl = K.resolvePlane(s.plane, m, planes), prof = s.profile || K.sketchProfile(s);
        var o = prof.loops.filter(function (l) { return !l.hole; })[0];
        return { plane: pl, loop: o, prof: prof, pts: o.pts.map(function (p) { return K.to3D(pl, p[0], p[1]); }) };
      }));
      if (!pa || pa.ruled) return null;
      // rfHL: a loft through full circles is ONE closed side face (as SolidWorks and occt-kernel.js loftTool make it):
      // writeLoftBrep then has one rim edge per cap (closed, one vertex) and one seam edge the face uses both ways
      var faces = pa.faces;
      if (pa.smooth && K._.joinLoftPatches) { var one = K._.joinLoftPatches(faces); if (one) faces = [one]; }
      var n = faces.length, info = loftShellInfo(faces), vol = src.body.volume(), diag = len(sub(info.hi, info.lo));
      if (Math.abs(Math.abs(info.volume) - vol) > 1e-4 * vol) return null;
      for (var k = 0; k < 3; k++) {
        var mn = Infinity, mx = -Infinity;
        for (i = k; i < mesh.positions.length; i += 3) { mn = Math.min(mn, mesh.positions[i]); mx = Math.max(mx, mesh.positions[i]); }
        if (Math.abs(mn - info.lo[k]) > 1e-3 * diag || Math.abs(mx - info.hi[k]) > 1e-3 * diag) return null;
      }
      // neighbours must share their side exactly, and no piece may shrink to a point on a cap
      for (var j = 0; j < n; j++) {
        var A = faces[j], B = faces[(j + 1) % n], a = A.poles[A.poles.length - 1], b = B.poles[0], nv = a.length - 1;
        if (b.length !== a.length) return null;
        for (i = 0; i <= nv; i++) if (len(sub(a[i], b[i])) > 1e-9 * diag) return null;
        if (len(sub(A.poles[0][0], a[0])) + len(sub(A.poles[1][0], a[0])) < 1e-9 * diag || len(sub(A.poles[0][nv], a[nv])) + len(sub(A.poles[1][nv], a[nv])) < 1e-9 * diag) return null;
      }
      return { faces: faces, sense: info.volume > 0 };
    } catch (e) { return null; }
  }
  function writeLoftBrep(W, L, name) {
    var faces = L.faces, n = faces.length, sense = L.sense, vp = {};
    function pt(p) { return W.add('CARTESIAN_POINT(\'\',' + stepVec(p) + ')'); }
    function ints(xs) { return stepList(xs.map(String)); }
    function vertex(j, end) {   // the corner of piece j on the first (0) or last (1) section
      var k = j + '_' + end, row = faces[j].poles[0];
      return vp[k] || (vp[k] = W.add('VERTEX_POINT(\'\',' + pt(row[end ? row.length - 1 : 0]) + ')'));
    }
    function curve(poles, knots, mults) { return W.add('B_SPLINE_CURVE_WITH_KNOTS(\'\',3,' + stepList(poles.map(pt)) + ',.UNSPECIFIED.,.F.,.F.,' + ints(mults) + ',' + stepList(knots.map(stepReal)) + ',.UNSPECIFIED.)'); }
    function edge(V1, V2, geom) { return W.add('EDGE_CURVE(\'\',' + V1 + ',' + V2 + ',' + geom + ',.T.)'); }
    function oe(id, fwd) { return W.add('ORIENTED_EDGE(\'\',*,*,' + id + ',' + (fwd ? '.T.' : '.F.') + ')'); }
    function rimEdge(j, end) {
      var pa = faces[j], k = end ? pa.poles[0].length - 1 : 0;
      return edge(vertex(j, end), vertex((j + 1) % n, end), curve(pa.poles.map(function (c) { return c[k]; }), pa.uKnots, pa.uMults));
    }
    var sideE = faces.map(function (pa, j) { return edge(vertex(j, 0), vertex(j, 1), curve(pa.poles[0], pa.vKnots, pa.vMults)); });
    var rimE = [faces.map(function (pa, j) { return rimEdge(j, 0); }), faces.map(function (pa, j) { return rimEdge(j, 1); })];
    var faceIds = faces.map(function (pa, j) {
      var nx = (j + 1) % n, loop = sense ? [oe(rimE[0][j], true), oe(sideE[nx], true), oe(rimE[1][j], false), oe(sideE[j], false)]
        : [oe(sideE[j], true), oe(rimE[1][j], true), oe(sideE[nx], false), oe(rimE[0][j], false)];
      var surf = W.add('B_SPLINE_SURFACE_WITH_KNOTS(\'\',3,' + pa.degV + ',' + stepList(pa.poles.map(function (c) { return stepList(c.map(pt)); })) + ',.UNSPECIFIED.,.F.,.F.,.F.,' + ints(pa.uMults) + ',' + ints(pa.vMults) + ',' + stepList(pa.uKnots.map(stepReal)) + ',' + stepList(pa.vKnots.map(stepReal)) + ',.UNSPECIFIED.)');
      return W.add('ADVANCED_FACE(\'\',(' + W.add('FACE_BOUND(\'\',' + W.add('EDGE_LOOP(\'\',' + stepList(loop) + ')') + ',.T.)') + '),' + surf + ',' + (sense ? '.T.' : '.F.') + ')');
    });
    // a cap runs its rim against the side faces; its plane's normal comes from the way round the loop then goes
    [0, 1].forEach(function (end) {
      var fwd = sense === (end === 1), order = faces.map(function (pa, j) { return fwd ? j : n - 1 - j; }), ring = [];
      faces.forEach(function (pa) { var k = end ? pa.poles[0].length - 1 : 0; for (var a = 0; a + 1 < pa.poles.length; a++) ring.push(pa.poles[a][k]); });
      if (!fwd) ring.reverse();
      var nrm = [0, 0, 0];
      ring.forEach(function (p, i) { nrm = add(nrm, cross(sub(p, ring[0]), sub(ring[(i + 1) % ring.length], ring[0]))); });
      nrm = norm(nrm);
      var ax = W.add('AXIS2_PLACEMENT_3D(\'\',' + pt(ring[0]) + ',' + W.add('DIRECTION(\'\',' + stepVec(nrm) + ')') + ',' + W.add('DIRECTION(\'\',' + stepVec(frameFor(nrm).u) + ')') + ')');
      var loop = W.add('EDGE_LOOP(\'\',' + stepList(order.map(function (j) { return oe(rimE[end][j], fwd); })) + ')');
      faceIds.push(W.add('ADVANCED_FACE(\'\',(' + W.add('FACE_OUTER_BOUND(\'\',' + loop + ',.T.)') + '),' + W.add('PLANE(\'\',' + ax + ')') + ',.T.)'));
    });
    return W.add('MANIFOLD_SOLID_BREP(' + stepString(name) + ',' + W.add('CLOSED_SHELL(\'\',' + stepList(faceIds) + ')') + ')');
  }

  function exportSTEP(model, build, opts) {
    opts = opts || {};
    // a part built by OpenCascade (Tools ▸ OpenCascade kernel, ui-occt.js) exports its own B-rep: every face exact,
    // B-spline faces included (opts.faceted: Anvil's writer anyway)
    if (build && build.occt && build.occt.step && !opts.faceted && !(model && model.type === 'assembly')) return build.occt.step;
    var doc = docParts(model, build), W = new StepWriter();
    var fileName = opts.fileName || safeName(doc.name) + '.step';
    // Part 21's time stamp is local time without a zone (as SolidWorks writes it); toISOString was UTC
    var tm = opts.time || new Date(), p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = tm.getFullYear() + '-' + p2(tm.getMonth() + 1) + '-' + p2(tm.getDate()) + 'T' + p2(tm.getHours()) + ':' + p2(tm.getMinutes()) + ':' + p2(tm.getSeconds());
    var appCtx = W.add('APPLICATION_CONTEXT(\'core data for automotive mechanical design processes\')');
    W.add('APPLICATION_PROTOCOL_DEFINITION(\'international standard\',\'automotive_design\',2000,' + appCtx + ')');
    var prodCtx = W.add('PRODUCT_CONTEXT(\'\',' + appCtx + ',\'mechanical\')');
    var pdCtx = W.add('PRODUCT_DEFINITION_CONTEXT(\'part definition\',' + appCtx + ',\'design\')');
    var lenUnit;
    if (doc.units === 'in') {
      var mm = W.add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
      var dim = W.add('DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)');
      lenUnit = W.add('(CONVERSION_BASED_UNIT(\'INCH\',' + W.add('LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),' + mm + ')') + ')LENGTH_UNIT()NAMED_UNIT(' + dim + '))');
    } else lenUnit = W.add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
    var angUnit = W.add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
    var solUnit = W.add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
    var unc = W.add('UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),' + lenUnit + ',\'distance_accuracy_value\',\'confusion accuracy\')');
    var ctx = W.add('(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((' + unc + '))GLOBAL_UNIT_ASSIGNED_CONTEXT((' + lenUnit + ',' + angUnit + ',' + solUnit + '))REPRESENTATION_CONTEXT(\'\',\'\'))');
    function axis(T) {
      T = T || tf(null);
      var R = T.rotation;
      return W.add('AXIS2_PLACEMENT_3D(\'\',' + W.add('CARTESIAN_POINT(\'\',' + stepVec(T.position) + ')') + ',' + W.add('DIRECTION(\'\',' + stepVec([R[2], R[5], R[8]]) + ')') + ',' + W.add('DIRECTION(\'\',' + stepVec([R[0], R[3], R[6]]) + ')') + ')');
    }
    function product(name, category) {
      var p = W.add('PRODUCT(' + stepString(name) + ',' + stepString(name) + ',\'\',(' + prodCtx + '))');
      W.add('PRODUCT_RELATED_PRODUCT_CATEGORY(' + stepString(category) + ',$,(' + p + '))');
      var pdf = W.add('PRODUCT_DEFINITION_FORMATION(\'\',\'\',' + p + ')');
      var pd = W.add('PRODUCT_DEFINITION(\'design\',\'\',' + pdf + ',' + pdCtx + ')');
      var pds = W.add('PRODUCT_DEFINITION_SHAPE(\'\',\'\',' + pd + ')');
      return { product: p, pd: pd, pds: pds };
    }
    var styled = [];
    function styleSolid(solid, color) {
      var c = parseColor(color);
      if (!c) return;
      var rgb = W.add('COLOUR_RGB(\'\',' + c.map(stepReal).join(',') + ')');
      var fas = W.add('FILL_AREA_STYLE(\'\',(' + W.add('FILL_AREA_STYLE_COLOUR(\'\',' + rgb + ')') + '))');
      var sss = W.add('SURFACE_SIDE_STYLE(\'\',(' + W.add('SURFACE_STYLE_FILL_AREA(' + fas + ')') + '))');
      var psa = W.add('PRESENTATION_STYLE_ASSIGNMENT((' + W.add('SURFACE_STYLE_USAGE(.BOTH.,' + sss + ')') + '))');
      styled.push(W.add('STYLED_ITEM(\'color\',(' + psa + '),' + solid + ')'));
    }
    // a part: product + ADVANCED_BREP_SHAPE_REPRESENTATION holding its origin and one solid per body
    function writePart(part) {
      var pr = product(part.name, 'part');
      var origin = axis(null);
      var solids = part.bodies.map(function (b) {
        var lp = splineLoftOf(b.src, b.mesh), s = lp ? writeLoftBrep(W, lp, b.name) : writeBrep(W, b.mesh, b.name);
        styleSolid(s, (b.material && b.material.color) || part.color);
        return s;
      });
      var rep = W.add('ADVANCED_BREP_SHAPE_REPRESENTATION(' + stepString(part.name) + ',' + stepList([origin].concat(solids)) + ',' + ctx + ')');
      W.add('SHAPE_DEFINITION_REPRESENTATION(' + pr.pds + ',' + rep + ')');
      pr.rep = rep; pr.origin = origin;
      return pr;
    }
    if (!doc.assembly) writePart(doc.parts[0]);
    else {
      var parts = doc.parts.map(writePart), subProducts = [], nauoCount = 0;
      // an assembly product: its placements and one NEXT_ASSEMBLY_USAGE_OCCURRENCE per component (a part or a
      // sub-assembly product written before it)
      var writeAssembly = function (name, list) {
        var root = product(name, 'assembly');
        var rootOrigin = axis(null);
        var placements = list.map(function (inst) { return axis(inst.transform); });
        var rootRep = W.add('SHAPE_REPRESENTATION(' + stepString(name) + ',' + stepList([rootOrigin].concat(placements)) + ',' + ctx + ')');
        W.add('SHAPE_DEFINITION_REPRESENTATION(' + root.pds + ',' + rootRep + ')');
        list.forEach(function (inst, i) {
          var part = inst.sub != null ? subProducts[inst.sub] : parts[inst.part];
          var nauo = W.add('NEXT_ASSEMBLY_USAGE_OCCURRENCE(' + stepString('NAUO' + (++nauoCount)) + ',' + stepString(inst.name) + ',\'\',' + root.pd + ',' + part.pd + ',$)');
          var pds = W.add('PRODUCT_DEFINITION_SHAPE(\'Placement\',\'Placement of an item\',' + nauo + ')');
          var idt = W.add('ITEM_DEFINED_TRANSFORMATION(\'\',\'\',' + part.origin + ',' + placements[i] + ')');
          var rr = W.add('(REPRESENTATION_RELATIONSHIP(\'\',\'\',' + part.rep + ',' + rootRep + ')REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(' + idt + ')SHAPE_REPRESENTATION_RELATIONSHIP())');
          W.add('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(' + rr + ',' + pds + ')');
        });
        root.rep = rootRep; root.origin = rootOrigin;
        return root;
      };
      (doc.subs || []).forEach(function (sb) { subProducts.push(writeAssembly(sb.name, sb.instances)); });
      writeAssembly(doc.name, doc.top || doc.instances);
    }
    if (styled.length) W.add('MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION(\'\',' + stepList(styled) + ',' + ctx + ')');
    return ['ISO-10303-21;', 'HEADER;',
      'FILE_DESCRIPTION((' + stepString(doc.name + ' — Anvil model') + '),\'2;1\');',
      'FILE_NAME(' + stepString(fileName) + ',' + stepString(stamp) + ',(\'\'),(\'\'),\'Anvil exchange.js ' + VERSION + '\',\'Anvil\',\'\');',
      'FILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));', 'ENDSEC;', 'DATA;']
      .concat(W.lines, ['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n';
  }

  // ------------------------------------------------------------------ Part 21 reader
  // parseStep(text) -> { header: { schema, name }, ents: { id: { t: TYPE, a: [args] } | { t: null, parts: { TYPE: args } } } }
  // Values: numbers, strings, { r: id } references, { e: ENUM } enumerations, null ($), '*', lists (arrays) and typed
  // values { t: TYPE, a: [args] } such as LENGTH_MEASURE(1.E-06).
  function parseStep(text) {
    text = String(text);
    if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error('Not a STEP file (no ISO-10303-21 header).');
    var s = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    var hdr = {}, sm = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(s), nm = /FILE_NAME\s*\(\s*'([^']*)'/i.exec(s);
    hdr.schema = sm ? sm[1] : ''; hdr.name = nm ? nm[1] : '';
    var dataAt = s.search(/\bDATA\s*(\([^)]*\))?\s*;/i);
    if (dataAt < 0) throw new Error('STEP file has no DATA section.');
    var i = s.indexOf(';', dataAt) + 1, n = s.length, ents = {};
    function ws() { while (i < n && /\s/.test(s.charAt(i))) i++; }
    function value() {
      ws();
      var c = s.charAt(i);
      if (c === '#') { var m = /^#(\d+)/.exec(s.slice(i, i + 24)); i += m[0].length; return { r: +m[1] }; }
      if (c === '\'') {
        var out = ''; i++;
        while (i < n) {
          var ch = s.charAt(i);
          if (ch === '\'') { if (s.charAt(i + 1) === '\'') { out += '\''; i += 2; continue; } i++; break; }
          out += ch; i++;
        }
        return decodeStepString(out);
      }
      if (c === '.') { var e = s.indexOf('.', i + 1); var en = s.slice(i + 1, e); i = e + 1; return { e: en }; }
      if (c === '$') { i++; return null; }
      if (c === '*') { i++; return '*'; }
      if (c === '(') return list();
      if (c === '"') { var q = s.indexOf('"', i + 1); var bin = s.slice(i + 1, q); i = q + 1; return bin; }
      var num = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i, i + 40));
      if (num) { i += num[0].length; return parseFloat(num[0]); }
      var id = /^[A-Za-z_][\w-]*/.exec(s.slice(i, i + 200));
      if (id) { i += id[0].length; ws(); var args = s.charAt(i) === '(' ? list() : []; return { t: id[0].toUpperCase(), a: args }; }
      throw new Error('STEP parse error near "' + s.slice(i, i + 40) + '"');
    }
    function list() {
      var out = [];
      i++; ws();
      if (s.charAt(i) === ')') { i++; return out; }
      for (;;) {
        out.push(value()); ws();
        var c = s.charAt(i);
        if (c === ',') { i++; continue; }
        if (c === ')') { i++; return out; }
        throw new Error('STEP parse error: expected , or ) near "' + s.slice(i, i + 40) + '"');
      }
    }
    for (;;) {
      ws();
      if (i >= n) break;
      if (/^ENDSEC/i.test(s.slice(i, i + 6))) break;
      var m = /^#(\d+)\s*=\s*/.exec(s.slice(i, i + 40));
      if (!m) { var semi = s.indexOf(';', i); if (semi < 0) break; i = semi + 1; continue; }
      i += m[0].length;
      var id = +m[1];
      if (s.charAt(i) === '(') {
        // complex entity: (TYPE1(...) TYPE2(...) ...)
        i++;
        var parts = {};
        for (;;) {
          ws();
          if (s.charAt(i) === ')') { i++; break; }
          var v = value();
          if (v && v.t) parts[v.t] = v.a;
        }
        ents[id] = { t: null, parts: parts };
      } else {
        var v2 = value();
        ents[id] = { t: v2.t, a: v2.a };
      }
      ws();
      if (s.charAt(i) === ';') i++;
    }
    return { header: hdr, ents: ents };
  }
  function decodeStepString(s) {
    return s.replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/gi, function (_, hex) {
      var out = '';
      for (var k = 0; k < hex.length; k += 4) out += String.fromCharCode(parseInt(hex.slice(k, k + 4), 16));
      return out;
    }).replace(/\\X\\([0-9A-F]{2})/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/\\\\/g, '\\');
  }

  // ------------------------------------------------------------------ STEP import
  function importSTEP(text, opts) {
    opts = opts || {};
    var st = parseStep(text), E = st.ents, warnings = [];
    function ent(ref) { return ref && ref.r != null ? E[ref.r] : null; }
    function has(e, type) { return e && (e.t === type || (e.parts && e.parts[type])); }
    function args(e, type) { return e ? (e.t === type ? e.a : e.parts && e.parts[type]) : null; }
    function point(ref) { var e = ent(ref); var a = args(e, 'CARTESIAN_POINT'); if (!a) return null; var c = a[1] || []; return [+c[0] || 0, +c[1] || 0, +(c[2] || 0)]; }
    function direction(ref, dflt) { var e = ent(ref); var a = args(e, 'DIRECTION'); if (!a) return dflt; var c = a[1] || []; return norm([+c[0] || 0, +c[1] || 0, +(c[2] || 0)]); }
    function placement(ref) { // AXIS2_PLACEMENT_3D -> transform local -> parent
      var e = ent(ref), a = args(e, 'AXIS2_PLACEMENT_3D');
      if (!a) return tf(null);
      var o = point(a[1]) || [0, 0, 0], z = direction(a[2], [0, 0, 1]), x = direction(a[3], null);
      if (!x || len(cross(z, x)) < 1e-9) x = frameFor(z).u;
      x = norm(sub(x, scale(z, dot(x, z))));
      var y = cross(z, x);
      return { rotation: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], position: o };
    }

    // ---- units: the first length unit found (SI with prefix, or a conversion based INCH / FOOT)
    // the length unit the geometric context assigns (GLOBAL_UNIT_ASSIGNED_CONTEXT), else the first one in the file
    var toMM = null, unitIds = [];
    Object.keys(E).forEach(function (id) { var g = args(E[id], 'GLOBAL_UNIT_ASSIGNED_CONTEXT'); if (g && g[0]) g[0].forEach(function (r) { if (r && r.r != null) unitIds.push(String(r.r)); }); });
    unitIds.concat(Object.keys(E)).forEach(function (id) {
      if (toMM != null) return;
      var e = E[id];
      if (!has(e, 'LENGTH_UNIT')) return;
      var si = args(e, 'SI_UNIT');
      if (si) {
        var pre = si[0] && si[0].e ? si[0].e.toUpperCase() : '';
        toMM = { MILLI: 1, CENTI: 10, DECI: 100, '': 1000, KILO: 1e6, MICRO: 1e-3, NANO: 1e-6 }[pre];
        if (toMM == null) toMM = 1;
        return;
      }
      var cb = args(e, 'CONVERSION_BASED_UNIT');
      if (cb) {
        var name = String(cb[0] || '').toUpperCase();
        if (/INCH/.test(name)) toMM = 25.4;
        else if (/FOOT|FEET/.test(name)) toMM = 304.8;
        else if (/MIL(?!LI)/.test(name)) toMM = 0.0254;
        else {
          var mw = ent(cb[1]), ma = mw && (mw.a || args(mw, 'LENGTH_MEASURE_WITH_UNIT') || args(mw, 'MEASURE_WITH_UNIT'));
          var val = ma && ma[0] && ma[0].a ? +ma[0].a[0] : NaN, base = ma && ent(ma[1]), bsi = base && args(base, 'SI_UNIT');
          if (isFinite(val) && bsi) toMM = val * ({ MILLI: 1, CENTI: 10, '': 1000 }[bsi[0] && bsi[0].e ? bsi[0].e : ''] || 1);
        }
      }
    });
    if (toMM == null) { toMM = 1; warnings.push('No length unit in the file; millimetres assumed.'); }

    // ---- faces -> triangles
    // Edges are discretized once per EDGE_CURVE (cached), so the two faces that share an edge get the same points: a
    // LINE is its two vertices, a POLYLINE its points, a CIRCLE (arc or full circle) its vertices plus the points of the
    // circle's canonical grid between them (Kernel.segsForRadius segments per turn, from angle 0 at the world x axis
    // (else y) projected into the circle's plane), so arcs of one circle agree wherever they are split.
    // Planar faces are ear clipped; faces on cylinders, cones, spheres and tori are tessellated in rows of latitude
    // circles (curvedFace) and their triangles carry the surface records kernel.js uses for exact mass properties.
    var nonPlanar = {}, faceCount = 0, angleUnit = 1, noHeightFaces = 0;
    Object.keys(E).forEach(function (id) {
      var e = E[id], cb = has(e, 'PLANE_ANGLE_UNIT') && args(e, 'CONVERSION_BASED_UNIT');
      if (cb && /DEG/i.test(String(cb[0]))) angleUnit = Math.PI / 180;
    });
    function vertexPoint(ref) { var v = ent(ref), va = v && args(v, 'VERTEX_POINT'); return va ? point(va[1]) : null; }
    var edgeCache = {}, keepSpline = {};
    function edgeInfo(ref) {
      var id = ref && ref.r;
      if (id == null) return null;
      if (edgeCache[id]) return edgeCache[id];
      var ec = ent(ref), ea = ec && args(ec, 'EDGE_CURVE');
      if (!ea) return null;
      var p1 = vertexPoint(ea[1]), p2 = vertexPoint(ea[2]), geom = ent(ea[3]), same = !(ea[4] && ea[4].e === 'F'), bc;
      // SURFACE_CURVE / SEAM_CURVE / INTERSECTION_CURVE wrap the 3D curve they lie on
      while (geom && (geom.t === 'SURFACE_CURVE' || geom.t === 'SEAM_CURVE' || geom.t === 'INTERSECTION_CURVE' || geom.t === 'BOUNDED_SURFACE_CURVE')) geom = ent(geom.a[1]);
      var info = { id: id, start: p1, end: p2, kind: 'other', type: geom ? geom.t || 'complex' : 'none', pts: [] };
      if (!p1 || !p2) { info.pts = [p1 || p2].filter(Boolean); return (edgeCache[id] = info); }
      if (!geom || geom.t === 'LINE') { info.kind = 'line'; info.pts = [p1, p2]; }
      else if (geom.t === 'POLYLINE') {
        var mid = (geom.a[1] || []).map(point).filter(Boolean);
        if (!same) mid.reverse();
        info.kind = 'poly'; info.pts = [p1].concat(mid.slice(1, -1), [p2]);
      } else if (geom.t === 'CIRCLE' && +geom.a[2] > 0) {
        var T = placement(geom.a[1]);
        info.kind = 'circle';
        info.circle = { c: T.position, n: [T.rotation[2], T.rotation[5], T.rotation[8]], r: +geom.a[2] };
        var cp = circlePoints(info.circle, p1, p2, same, toMM);
        info.pts = cp.pts; info.mid = cp.mid; info.full = cp.full;
      } else if (geom.t === 'ELLIPSE' && +geom.a[2] > 0 && +geom.a[3] > 0) {   // stepout-2: a plane's oblique cut of a cylinder
        var TE = placement(geom.a[1]);
        info.kind = 'ellipse';
        info.ellipse = { center: TE.position, normal: [TE.rotation[2], TE.rotation[5], TE.rotation[8]], xdir: [TE.rotation[0], TE.rotation[3], TE.rotation[6]], a: +geom.a[2], b: +geom.a[3] };
        var ep = ellipsePoints(info.ellipse, p1, p2, same, toMM);
        info.pts = ep.pts; info.full = ep.full;
      } else if ((bc = bsCurveOf(geom)) && bc.deg >= 1 && bc.poles.length > bc.deg && bc.poles.every(Boolean)) {
        // rfGO: info.raw on the curve, info.pts area-true. Lane importbend: rational curves (a circle written as a
        // RATIONAL_B_SPLINE_CURVE), a curve running past its vertices (trimmed to them), and a B-spline that is a
        // straight line or a circle read as that LINE / CIRCLE (other CAD systems write every edge as a B-spline), so
        // the faces either side tessellate it as they would the true curve
        var raw = bsCurvePoints(bc.deg, bc.poles, bc.U, bc.W);
        if (!same) raw.reverse();
        raw = bsTrim(raw, p1, p2);
        if (keepSpline[id]) {   // a free-form face's side: as before (degree 1 a chord)
          if (bc.deg > 1) { info.kind = 'bspline'; info.raw = raw; info.pts = areaTruePath(raw); } else { info.kind = bc.poles.length === 2 ? 'line' : 'other'; info.pts = [p1, p2]; }
          return (edgeCache[id] = info);
        }
        var fit = bsFitCurve(raw, bc);
        if (fit && fit.line) { info.kind = 'line'; info.pts = [p1, p2]; info.fromSpline = true; }
        else if (fit && fit.circle) {
          info.kind = 'circle'; info.circle = fit.circle; info.fromSpline = true;
          var cps = circlePoints(fit.circle, p1, p2, true, toMM);
          info.pts = cps.pts; info.mid = cps.mid; info.full = cps.full;
        } else if (bc.deg === 1) { info.kind = 'poly'; info.pts = raw.filter(function (p, k) { return k === 0 || k === raw.length - 1 || len(sub(p, raw[k - 1])) > 0; }); }
        else { info.kind = 'bspline'; info.raw = raw; info.pts = areaTruePath(raw); }
      } else info.pts = [p1, p2];
      return (edgeCache[id] = info);
    }
    // lane importbend: B-spline curves and surfaces as plain data, the simple entity or the complex (rational) one
    function bsCurveOf(g) {
      if (!g) return null;
      if (g.t === 'B_SPLINE_CURVE_WITH_KNOTS') return { deg: +g.a[1], poles: (g.a[2] || []).map(point), U: bsFlat(g.a[7], g.a[6]), W: null };
      // lane realfiles: QUASI_UNIFORM / UNIFORM / BEZIER curves (Mastercam writes them) carry no knots: the form gives them
      var ik = bsImplicit(g.t), P = g.parts;
      if (ik) return { deg: +g.a[1], poles: (g.a[2] || []).map(point), U: bsKnotsOf(ik, (g.a[2] || []).length, +g.a[1]), W: null };
      var c = P && P.B_SPLINE_CURVE, kn = P && P.B_SPLINE_CURVE_WITH_KNOTS, rw = P && P.RATIONAL_B_SPLINE_CURVE, ikc = P && bsImplicitParts(P, 'CURVE');
      if (!c || !(kn || ikc)) return null;
      return { deg: +c[0], poles: (c[1] || []).map(point), U: kn ? bsFlat(kn[1], kn[0]) : bsKnotsOf(ikc, (c[1] || []).length, +c[0]), W: rw && rw[0] ? rw[0].map(Number) : null };
    }
    function bsSurfOf(g) {
      if (!g) return null;
      var pts = function (rows) { return (rows || []).map(function (row) { return row.map(point); }); };
      if (g.t === 'B_SPLINE_SURFACE_WITH_KNOTS') return { du: +g.a[1], dv: +g.a[2], poles: pts(g.a[3]), U: bsFlat(g.a[10], g.a[8]), V: bsFlat(g.a[11], g.a[9]), W: null };
      var ik = bsImplicit(g.t), P = g.parts;
      if (ik) { var pp = pts(g.a[3]); return pp.length && pp[0].length ? { du: +g.a[1], dv: +g.a[2], poles: pp, U: bsKnotsOf(ik, pp.length, +g.a[1]), V: bsKnotsOf(ik, pp[0].length, +g.a[2]), W: null } : null; }
      var c = P && P.B_SPLINE_SURFACE, kn = P && P.B_SPLINE_SURFACE_WITH_KNOTS, rw = P && P.RATIONAL_B_SPLINE_SURFACE, iks = P && bsImplicitParts(P, 'SURFACE');
      if (!c || !(kn || iks)) return null;
      var cp = pts(c[2]);
      if (!kn && !(cp.length && cp[0].length)) return null;
      return { du: +c[0], dv: +c[1], poles: cp, U: kn ? bsFlat(kn[2], kn[0]) : bsKnotsOf(iks, cp.length, +c[0]), V: kn ? bsFlat(kn[3], kn[1]) : bsKnotsOf(iks, cp[0].length, +c[1]), W: rw && rw[0] ? rw[0].map(function (r) { return r.map(Number); }) : null };
    }
    // the oriented edges of an EDGE_LOOP: [{ info, fwd }]
    function loopEdgeList(l) {
      var list = [];
      (l.a[1] || []).forEach(function (oeRef) {
        var oe = ent(oeRef), oa = oe && args(oe, 'ORIENTED_EDGE');
        if (!oa) return;
        var info = edgeInfo(oa[3]);
        if (info) list.push({ info: info, fwd: !(oa[4] && oa[4].e === 'F') });
      });
      return list;
    }
    function orientedPts(x) { return x.fwd ? x.info.pts : x.info.pts.slice().reverse(); }
    function loopPoints(ref) {
      var e = ent(ref);
      if (!e) return null;
      if (e.t === 'POLY_LOOP') return (e.a[1] || []).map(point).filter(Boolean);
      if (e.t === 'EDGE_LOOP') {
        var pts = [];
        loopEdgeList(e).forEach(function (x) {
          if (x.info.kind === 'other') { var ct = 'curve ' + x.info.type; nonPlanar[ct] = (nonPlanar[ct] || 0) + 1; }
          var q = orientedPts(x);
          pts = pts.concat(q.slice(0, Math.max(1, q.length - 1)));
        });
        return pts;
      }
      return null; // VERTEX_LOOP and others: no area
    }
    function surfRecord(surf) {
      var a = surf.a, T = placement(a[1]), o = T.position, d = [T.rotation[2], T.rotation[5], T.rotation[8]];
      if (surf.t === 'CYLINDRICAL_SURFACE') return { t: 'cyl', o: o, d: d, r: +a[2] };
      if (surf.t === 'CONICAL_SURFACE') return { t: 'cone', o: o, d: d, r: +a[2], k: Math.tan(+a[3] * angleUnit) };
      if (surf.t === 'SPHERICAL_SURFACE') return { t: 'sph', o: o, d: d, r: +a[2] };
      if (surf.t === 'TOROIDAL_SURFACE') return { t: 'tor', o: o, d: d, R: +a[2], r: +a[3] };
      return null;
    }
    function faceTriangles(faceRef, out) {
      var f = ent(faceRef);
      if (!f) return;
      var fa = args(f, 'ADVANCED_FACE') || args(f, 'FACE_SURFACE') || args(f, 'FACE');
      if (!fa) return;
      faceCount++;
      var normal = null;
      if (fa.length >= 3 && fa[2]) {
        var surf = ent(fa[2]);
        if (surf && surf.t === 'PLANE') {
          var T = placement(surf.a[1]);
          normal = [T.rotation[2], T.rotation[5], T.rotation[8]];
          if (fa[3] && fa[3].e === 'F') normal = scale(normal, -1);
        } else if (surf) {
          // lane importbend: a B-spline surface that is exactly a plane or a cylinder (as other CAD systems write every
          // face) is read as that surface: its normal from the B-spline's own (u, v) sense
          var sense = !(fa[3] && fa[3].e === 'F'), bk = bsSurfKind(fa[2].r, surf);
          if (bk && bk.plane) { normal = sense ? bk.plane : scale(bk.plane, -1); var bplane = bk; }
          else {
            if (surf.t === 'B_SPLINE_SURFACE_WITH_KNOTS' && splineFace(fa, surf, sense, out)) return;
            var S = bk && bk.cyl ? bk.cyl : surf.t ? surfRecord(surf) : null;
            if (S && curvedFace(fa, S, bk && bk.cyl ? sense === !bk.flip : sense, out)) return;
            if (!S && ruledFace(fa, surf, out)) return;
            if (!S && freeFace(fa, surf, sense, out)) return;   // lane realfiles
            var key = (surf.t || 'complex surface') + (S ? ' (trimmed by curves other than circles and rulings)' : '');
            nonPlanar[key] = (nonPlanar[key] || 0) + 1;
            return;
          }
        }
      }
      var loops = [], outerIdx = -1;
      (fa[1] || []).forEach(function (bRef) {
        var b = ent(bRef), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND'));
        if (!ba) return;
        var pts = loopPoints(ba[1]);
        if (!pts || pts.length < 3) return;
        pts = dedupeRing(pts);
        if (pts.length < 3) return;
        if (ba[2] && ba[2].e === 'F') pts.reverse();
        if (has(b, 'FACE_OUTER_BOUND')) outerIdx = loops.length;
        loops.push(pts);
      });
      if (!loops.length) return;
      if (outerIdx < 0) {
        var best = -1;
        loops.forEach(function (l, k) { var a = len(newell(l)); if (a > best) { best = a; outerIdx = k; } });
      }
      // lane importbend: a B-spline plane's bounds must lie on it (else the face is not that plane: refused by name)
      if (bplane && !loops.every(function (l) { return l.every(function (p) { return Math.abs(dot(p, bplane.plane) - bplane.w) <= Math.max(bplane.tol, 1e-6 * (1 + len(p))); }); })) {
        var bkey = surf.t || 'complex surface';
        nonPlanar[bkey] = (nonPlanar[bkey] || 0) + 1;
        return;
      }
      if (!normal) normal = norm(newell(loops[outerIdx]));
      if (len(normal) < 0.5) return;
      var t0 = out.tris.length;
      triangulateFace(loops, outerIdx, normal, out);
      for (var t = t0; t < out.tris.length; t += 3) out.recs.push(null);
    }
    // lane importbend: what a B-spline surface is ({ plane: n } | { cyl: S, flip } | null), once per surface entity
    var surfKinds = {};
    function bsSurfKind(id, surf) {
      if (surfKinds[id] !== undefined) return surfKinds[id];
      var d = bsSurfOf(surf), res = null;
      if (d && d.poles.length && d.poles.every(function (row) { return row.length && row.every(Boolean); })) res = bsSurfClassify(bsSurfaceGrid(d.du, d.dv, d.poles, d.U, d.V, d.W));
      return (surfKinds[id] = res);
    }
    // the edges of free-form B-spline faces (a loft's patches: splineFace matches their sides against the surface's own
    // B-spline sides) stay B-splines even where one is straight or a circle
    Object.keys(E).forEach(function (id) {
      var fa = args(E[id], 'ADVANCED_FACE'), sf = fa && fa[2] && ent(fa[2]);
      if (!sf || sf.t === 'PLANE' || !bsSurfOf(sf) || bsSurfKind(fa[2].r, sf)) return;
      (fa[1] || []).forEach(function (bRef) {
        var b = ent(bRef), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
        if (l && l.t === 'EDGE_LOOP') (l.a[1] || []).forEach(function (oeRef) { var oa = args(ent(oeRef), 'ORIENTED_EDGE'); if (oa && oa[3]) keepSpline[oa[3].r] = true; });
      });
    });
    // the B-spline edges of faces on cylinders, cones, spheres and tori (true or B-spline) are tessellated at their
    // curve's own points, on the surface (the area-true move is for faces bounded by B-splines on both sides)
    Object.keys(E).forEach(function (id) {
      var fa = args(E[id], 'ADVANCED_FACE'), sf = fa && fa[2] && ent(fa[2]);
      if (!sf || sf.t === 'PLANE') return;
      var curved = sf.t ? /^(CYLINDRICAL|CONICAL|SPHERICAL|TOROIDAL)_SURFACE$/.test(sf.t) : false;
      if (!curved) { var k = bsSurfKind(fa[2].r, sf); curved = !!(k && k.cyl); }
      if (!curved) return;
      (fa[1] || []).forEach(function (bRef) {
        var b = ent(bRef), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
        if (l && l.t === 'EDGE_LOOP') loopEdgeList(l).forEach(function (x) { if (x.info.kind === 'bspline') x.info.pts = cylSubsample(x.info, sf.t === 'CYLINDRICAL_SURFACE' ? surfRecord(sf) : k && k.cyl); });
      });
    });
    // lane stepout3: a B-spline edge lying exactly on a cylinder (Anvil's rails round a hole through a bend: 24 samples
    // a span made every short edge 25 points and the hole 20 k triangles) keeps, per span, every k-th sample (k a divisor
    // of 24, the most whose step stays inside the cylinder's own angular step); a span's samples are symmetric, so
    // the (angle, height) area of an edge whose bump is odd (railOf) is unchanged
    function cylSubsample(info, S) {
      var raw = info.raw, n = raw.length - 1;
      if (info.cylSub) return info.cylSub;
      if (!S || S.t !== 'cyl' || n % SPLINE_SEGS || !(S.r > 0)) return raw;
      var tolC = 1e-10 * Math.max(1, S.r), ths = [];
      for (var i = 0; i <= n; i++) {
        var ax = axial(S, raw[i]);
        if (Math.abs(ax.rho - S.r) > tolC) return raw;
        ths.push(ax.v);
      }
      var stepA = 2 * Math.PI / K.segsForRadius(S.r * (toMM || 1)), out = [raw[0]];
      for (var s0 = 0; s0 < n; s0 += SPLINE_SEGS) {
        var dmax = 0;
        for (i = s0; i < s0 + SPLINE_SEGS; i++) dmax = Math.max(dmax, Math.acos(Math.max(-1, Math.min(1, dot(ths[i], ths[i + 1]) / (len(ths[i]) * len(ths[i + 1]))))));
        var kk = [24, 12, 8, 6, 4, 3, 2, 1].filter(function (k) { return k * dmax <= stepA; })[0] || 1;
        for (i = s0 + kk; i <= s0 + SPLINE_SEGS; i += kk) out.push(raw[i]);
      }
      return (info.cylSub = out);
    }
    // lane importbend: a ruled B-spline face (degree 1 one way: a twisted bend end, a relief wall) bounded by two
    // straight edges and two rails: the rails' points zipped by arc length, triangles turning with the face's loop
    function ruledFace(fa, surf, out) {
      var d = bsSurfOf(surf), bs = fa[1] || [];
      if (!d || (d.du !== 1 && d.dv !== 1) || bs.length !== 1) return false;
      var b = ent(bs[0]), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
      if (!l || l.t !== 'EDGE_LOOP') return false;
      var list = loopEdgeList(l), n, lines = [];
      // lane stepout3: a straight side split in two (a radial wall's line where a point between the sheet's faces is
      // shared with a face beside it) is one side
      for (var mg = 0; mg < list.length && list.length > 2; mg++) {
        var x0 = list[mg], x1 = list[(mg + 1) % list.length];
        if (x0.info.kind !== 'line' || x1.info.kind !== 'line') continue;
        var q0 = orientedPts(x0), q1 = orientedPts(x1), u0 = sub(q0[q0.length - 1], q0[0]), u1 = sub(q1[q1.length - 1], q1[0]);
        if (len(cross(u0, u1)) > 1e-9 * len(u0) * len(u1) || dot(u0, u1) <= 0) continue;
        list.splice(mg, 1, { info: { kind: 'line', pts: [q0[0], q1[q1.length - 1]] }, fwd: true });
        list.splice((mg + 1) % (list.length), 1);
        mg = -1;
      }
      n = list.length;
      list.forEach(function (x, k) { if (x.info.kind === 'line') lines.push(k); });
      if (lines.length !== 2 && n === 4) {
        // four edges, not two of them straight: the rails are the longer opposite pair
        var el = list.map(function (x) { var q = x.info.pts, s = 0; for (var k = 1; k < q.length; k++) s += len(sub(q[k], q[k - 1])); return s; });
        lines = el[0] + el[2] >= el[1] + el[3] ? [1, 3] : [0, 2];
        // lane realfiles: the sides taken for rulings keep only their ends, so they must be two points: a B-spline side
        // sampled along (SolidWorks' slot ends: rail, rail, ruling, a short curve; a nearly straight cubic) would leave
        // its points unmatched on the face beside it (open edges): freeFace takes such a face
        if (list[lines[0]].info.pts.length > 2 || list[lines[1]].info.pts.length > 2) return false;
      }
      if (lines.length !== 2 || lines[1] - lines[0] < 2 || n - (lines[1] - lines[0]) < 2) return false;
      function chain(from, to) {
        var pts = [];
        for (var k = from; k !== to; k = (k + 1) % n) { var q = orientedPts(list[k]); pts = pts.length ? pts.concat(q.slice(1)) : q.slice(); }
        return pts;
      }
      function fracs(P) { var acc = [0], t = 0; for (var k = 1; k < P.length; k++) { t += len(sub(P[k], P[k - 1])); acc.push(t); } return acc.map(function (a) { return t > 0 ? a / t : 0; }); }
      var A = chain(lines[0] + 1, lines[1]), B = chain((lines[1] + 1) % n, lines[0]).reverse(), fa1 = fracs(A), fb = fracs(B), i = 0, j = 0, flip = ba[2] && ba[2].e === 'F';
      // lane stepout3: rails that are the surface's own sides, sampled at the same parameters (Anvil's radial walls of a
      // hole through a bend), are joined point to point: every line across is then the surface's ruling (by arc length
      // the outer rail's points slid round from the inner's and the wall twisted: 4e-9 of the part's volume)
      if (A.length === B.length && A.length > 2) {
        var G = bsSurfaceGrid(d.du, d.dv, d.poles, d.U, d.V, d.W), ext = 0, side = function (k) { return d.du === 1 ? G[k] : columnOf(G, k); };
        G.forEach(function (c) { c.forEach(function (p) { ext = Math.max(ext, len(p)); }); });
        var s0 = side(0), s1 = side(d.du === 1 ? G.length - 1 : G[0].length - 1), tolG = 1e-9 * Math.max(1, ext);
        // the indices of P2's points along side Q (a rail may keep every k-th sample: cylSubsample), or null
        var at = function (P2, Q) { var out = [], i0 = 0; for (var k = 0; k < P2.length; k++) { while (i0 < Q.length && len(sub(P2[k], Q[i0])) > tolG) i0++; if (i0 >= Q.length) return null; out.push(i0); } return out; };
        var idx = function (P2) { var r = []; [s0, s1].forEach(function (Q) { [Q, Q.slice().reverse()].forEach(function (Q2, rev) { var x = at(P2, Q2); if (x) r.push(rev + ':' + x.join()); }); }); return r; };
        var ia = idx(A), ib = idx(B);
        if (ia.some(function (x) { return ib.indexOf(x) >= 0; })) { fa1 = A.map(function (p, k) { return k / (A.length - 1); }); fb = fa1.map(function (x) { return x + 1e-12; }); fb[fb.length - 1] = 1; }
      }
      function tri(p, q, r) {
        if (flip) { var t = q; q = r; r = t; }
        var base = out.pos.length / 3;
        out.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
        out.tris.push(base, base + 1, base + 2);
        out.recs.push(null);
      }
      while (i < A.length - 1 || j < B.length - 1) {
        if (j >= B.length - 1 || (i < A.length - 1 && fa1[i + 1] <= fb[j + 1])) { tri(A[i], A[i + 1], B[j]); i++; }
        else { tri(A[i], B[j + 1], B[j]); j++; }
      }
      return true;
    }
    // rfGO: a B-spline face bounded by four B-spline edges along the surface's own sides, in rows through the edges' points
    function splineFace(fa, surf, sameSense, out) {
      var a = surf.a, bs = fa[1] || [], b = bs.length === 1 ? ent(bs[0]) : null, ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
      if (!l || l.t !== 'EDGE_LOOP') return false;
      var list = loopEdgeList(l);
      if (list.length !== 4 || list.some(function (x) { return x.info.kind !== 'bspline'; })) return false;
      var G = bsSurfaceGrid(+a[1], +a[2], (a[3] || []).map(function (row) { return row.map(point); }), bsFlat(a[10], a[8]), bsFlat(a[11], a[9]));
      var nu = G.length - 1, nv = G[0].length - 1, ext = 0;
      G.forEach(function (c) { c.forEach(function (p) { ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); }); });
      // the grid's boundary, round in (u, v): which way the file's loop goes depends on its orientation, so try every start
      var want = [columnOf(G, 0), G[nu], columnOf(G, nv).reverse(), G[0].slice().reverse()], tol = 1e-6 * Math.max(ext, 1e-9);
      function fits(q, w) {
        if (q.length !== w.length) return false;
        for (var i = 0; i < q.length; i++) if (len(sub(q[i], w[i])) > tol) return false;
        return true;
      }
      function along(x, fwd, key) { var q = x.info[key]; return fwd ? q : q.slice().reverse(); }
      for (var dir = 1; dir >= -1; dir -= 2) for (var r = 0; r < 4; r++) {
        var got = [], ok = true;
        for (var k = 0; k < 4 && ok; k++) {
          var x = list[(r + dir * k + 8) % 4], fwd = x.fwd === (dir > 0);
          if (fits(along(x, fwd, 'raw'), want[k])) got.push(along(x, fwd, 'pts')); else ok = false;
        }
        if (!ok) continue;
        // lane MO: the grid's inner points moved out by what the facets miss of the surface (freeVolumeFix: 1e-4 → 1e-7 on
        // a loft) instead of the area-true moves along the rows
        var d0 = bsSurfOf(surf), tsU = bsParams(d0.U, d0.du), tsV = bsParams(d0.V, d0.dv), Qg;
        if (tsU.length === nu + 1 && tsV.length === nv + 1) {
          var bnd = [got[0], got[1], got[2].slice().reverse(), got[3].slice().reverse()], RV = [], RT = [];
          G.forEach(function (col, i) {
            col.forEach(function (p, j) {
              var q = j === 0 ? bnd[0][i] : j === nv ? bnd[2][i] : i === 0 ? bnd[3][j] : i === nu ? bnd[1][j] : p;
              RV.push({ p: q, u: tsU[i], v: tsV[j] });
            });
          });
          var at = function (i, j) { return i * (nv + 1) + j; };
          gridTris(G.map(function (col, i) { return col.map(function (p, j) { return at(i, j); }); }), function (a, b, c) { RT.push([a, b, c]); });
          freeVolumeFix({ V: RV, T: RT }, { at: function (u, v) { return bsSurfPoint(d0, u, v); } }, !sameSense);
          Qg = G.map(function (col, i) { return col.map(function (p, j) { return RV[at(i, j)].p; }); });
        } else Qg = areaTrueGrid(G, got[0], got[1], got[2].slice().reverse(), got[3].slice().reverse());
        gridTris(Qg, function (A, B, C) {
          var base = out.pos.length / 3, P = sameSense ? B : C, Q = sameSense ? C : B;
          out.pos.push(A[0], A[1], A[2], P[0], P[1], P[2], Q[0], Q[1], Q[2]);
          out.tris.push(base, base + 1, base + 2);
          out.recs.push(null);
        });
        return true;
      }
      return false;
    }
    // lane realfiles: freeFace(faceArgs, surf, sameSense, out) -> true when a free-form face no shape above takes was
    // tessellated: a B-spline surface (any knots, rational or not, quasi-uniform) or a SURFACE_OF_LINEAR_EXTRUSION of a
    // B-spline curve, trimmed by any edges. Boundary points are projected into the surface's (u, v) (nearest sample, then
    // Newton), paramPatch triangulates, new points lie on the surface; the steps keep a chord within the canonical grid's
    // angle for the local radius of curvature. No surface record (as splineFace).
    function freeFace(fa, surf, sameSense, out) {
      var A = null, d = bsSurfOf(surf);
      if (d && d.poles.length && d.poles.every(function (row) { return row.length && row.every(Boolean); }) && d.U.length === d.poles.length + d.du + 1 && d.V.length === d.poles[0].length + d.dv + 1) A = bsAdaptor(d);
      else if (surf.t === 'SURFACE_OF_LINEAR_EXTRUSION') A = extrusionAdaptor(surf);
      if (!A) return false;
      var lp = [], outerI = -1, ok = true;
      (fa[1] || []).forEach(function (bRef) {
        var b = ent(bRef), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
        if (!l || l.t !== 'EDGE_LOOP') { ok = false; return; }
        var pts = [];
        loopEdgeList(l).forEach(function (x) { if (x.info.kind === 'other') ok = false; var q = orientedPts(x); pts = pts.concat(q.slice(0, Math.max(1, q.length - 1))); });
        pts = dedupeRing(pts);
        if (has(b, 'FACE_OUTER_BOUND')) outerI = lp.length;
        lp.push(pts);
      });
      if (!ok || !lp.length) return false;
      var res = paramPatch(lp, outerI, A);
      if (!res) return false;
      // lane stepreal2: the triangles all turn one way in (u, v), so one answer serves them all: the area-weighted vote
      // of the surface normal (asked triangle by triangle, slivers along a boundary answered the other way: edges with
      // both uses in one direction, an open body)
      var vote = 0;
      res.T.forEach(function (t3) {
        var a = res.V[t3[0]], b = res.V[t3[1]], c = res.V[t3[2]], n3 = cross(sub(b.p, a.p), sub(c.p, a.p)), ns = A.normal((a.u + b.u + c.u) / 3, (a.v + b.v + c.v) / 3), ln = len(ns);
        if (ln > 0) vote += dot(n3, ns) / ln;
      });
      var flipAll = (vote > 0) !== sameSense;
      freeVolumeFix(res, A, flipAll);
      res.T.forEach(function (t3) {
        var a = res.V[t3[0]], b = res.V[t3[1]], c = res.V[t3[2]];
        if (flipAll) { var tmp = b; b = c; c = tmp; }
        var base = out.pos.length / 3;
        out.pos.push(a.p[0], a.p[1], a.p[2], b.p[0], b.p[1], b.p[2], c.p[0], c.p[1], c.p[2]);
        out.tris.push(base, base + 1, base + 2);
        out.recs.push(null);
      });
      return true;
    }
    // lane MO: freeVolumeFix(res, A, flip): the facets of a free-form face carry no surface record, so their volume is
    // the polygon's (0.01 – 0.03 % over or under on real parts). Each triangle misses the bump between it and the
    // surface: with the heights h of the surface over its three edge midpoints (the surface at the edge's middle
    // parameters, measured along the outward facet normal) that is area · (h1 + h2 + h3) / 3 (exact for a quadratic
    // bump). The face's interior points (none is shared with another face, so the body stays closed) move out along
    // their normal by what the triangles round them miss, shared among the triangles' interior corners:
    // δ = Σ V / Σ (area · n_v·n_t / 3). Boundary points stay on the surface; a triangle with no interior corner keeps
    // its bump. The mesh then lies within a sagitta of the surface, its volume to the fourth order of the step.
    function freeVolumeFix(res, A, flip) {
      var V = res.V, T = res.T, use = {}, nT = [], aT = [], vol = [], i, k;
      function ek(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
      T.forEach(function (t3) { for (k = 0; k < 3; k++) { var key = ek(t3[k], t3[(k + 1) % 3]); use[key] = (use[key] || 0) + 1; } });
      var fixed = new Array(V.length);
      Object.keys(use).forEach(function (key) { if (use[key] === 1) { var ab = key.split(','); fixed[+ab[0]] = fixed[+ab[1]] = true; } });
      var num = new Array(V.length), den = new Array(V.length), nv = new Array(V.length), mid = {};
      // the height of the surface over the chord's midpoint m along n: the surface point on the line m + t n (Newton in
      // (u, v) from the middle parameters; the middle parameters alone sit off that line by a first-order amount
      // across the edge, where the bump rises: 1e-5 too much on a loft)
      function hOf(a, b, n) { return hAt(scale(add(V[a].p, V[b].p), 0.5), (V[a].u + V[b].u) / 2, (V[a].v + V[b].v) / 2, Math.max(Math.abs(V[a].u - V[b].u), Math.abs(V[a].v - V[b].v)), n); }
      function hAt(m, u, v, span, n) {
        var eu = span * 1e-4 || 1e-9, P = A.at(u, v);
        for (var it = 0; it < 4; it++) {
          var r = sub(P, m), rt = sub(r, scale(n, dot(r, n)));
          if (!(len(rt) > 1e-12 * (1 + len(m)))) break;
          var Su = scale(sub(A.at(u + eu, v), A.at(u - eu, v)), 1 / (2 * eu)), Sv = scale(sub(A.at(u, v + eu), A.at(u, v - eu)), 1 / (2 * eu));
          Su = sub(Su, scale(n, dot(Su, n))); Sv = sub(Sv, scale(n, dot(Sv, n)));
          var a11 = dot(Su, Su), a12 = dot(Su, Sv), a22 = dot(Sv, Sv), b1 = -dot(Su, rt), b2 = -dot(Sv, rt), det = a11 * a22 - a12 * a12;
          if (!(det > 1e-30 * (a11 * a22 + 1e-300))) break;
          u += (a22 * b1 - a12 * b2) / det; v += (a11 * b2 - a12 * b1) / det;
          P = A.at(u, v);
        }
        return dot(sub(P, m), n);
      }
      T.forEach(function (t3, ti) {
        var a = V[t3[0]].p, b = V[t3[1]].p, c = V[t3[2]].p, n = cross(sub(b, a), sub(c, a)), l = len(n);
        if (flip) n = scale(n, -1);
        if (!(l > 0)) { nT.push(null); aT.push(0); vol.push(0); return; }
        n = scale(n, 1 / l);
        var ar = l / 2, h = hOf(t3[0], t3[1], n) + hOf(t3[1], t3[2], n) + hOf(t3[2], t3[0], n);
        nT.push(n); aT.push(ar); vol.push(ar * h / 3);
        for (k = 0; k < 3; k++) { var q = t3[k]; nv[q] = nv[q] ? add(nv[q], scale(n, ar)) : scale(n, ar); }
      });
      T.forEach(function (t3, ti) {
        if (!nT[ti]) return;
        var free = t3.filter(function (q) { return !fixed[q]; });
        free.forEach(function (q) { num[q] = (num[q] || 0) + vol[ti] / free.length; });
        t3.forEach(function (q) { if (!fixed[q] && nv[q]) den[q] = (den[q] || 0) + aT[ti] * dot(norm(nv[q]), nT[ti]) / 3; });
      });
      for (i = 0; i < V.length; i++) {
        if (fixed[i] || !nv[i] || !(den[i] > 0) || !num[i]) continue;
        V[i] = { p: add(V[i].p, scale(norm(nv[i]), num[i] / den[i])), u: V[i].u, v: V[i].v };
      }
    }
    // (u, v) of p on at(u, v) from a start: Gauss-Newton with central differences; lo / hi bound u and v (null: free)
    function projectUV(at, p, u, v, lo, hi, hu, hv) {
      for (var it = 0; it < 40; it++) {
        var P = at(u, v), r = sub(p, P), Su = scale(sub(at(u + hu, v), at(u - hu, v)), 1 / (2 * hu)), Sv = scale(sub(at(u, v + hv), at(u, v - hv)), 1 / (2 * hv));
        var a = dot(Su, Su), b = dot(Su, Sv), c = dot(Sv, Sv), e = dot(Su, r), f = dot(Sv, r), det = a * c - b * b;
        if (!(det > 1e-30 * (a * c + 1e-300))) break;
        var du = (c * e - b * f) / det, dv = (a * f - b * e) / det;
        u += du; v += dv;
        if (lo && lo[0] != null) u = Math.max(lo[0], Math.min(hi[0], u));
        if (lo && lo[1] != null) v = Math.max(lo[1], Math.min(hi[1], v));
        if (Math.abs(du) <= hu * 1e-6 && Math.abs(dv) <= hv * 1e-6) break;
      }
      return [u, v];
    }
    // the largest parameter step along a row of samples (params ts, points ps) whose chord stays inside the canonical
    // grid's angle at the local radius of curvature (Infinity for a straight row)
    function rowStep(ts, ps) {
      var best = Infinity;
      for (var i = 1; i + 1 < ps.length; i++) {
        var d1 = sub(ps[i], ps[i - 1]), d2 = sub(ps[i + 1], ps[i]), l1 = len(d1), l2 = len(d2);
        if (!(l1 > 0) || !(l2 > 0)) continue;
        var th = Math.acos(Math.max(-1, Math.min(1, dot(d1, d2) / (l1 * l2))));
        if (!(th > 1e-9)) continue;
        var Rc = (l1 + l2) / 2 / th, al = 2 * Math.PI / K.segsForRadius(Rc * (toMM || 1));
        best = Math.min(best, (ts[i + 1] - ts[i - 1]) / 2 * al / th);
      }
      return best;
    }
    function bsAdaptor(d) {
      var nu = d.poles.length, nv = d.poles[0].length, u0 = d.U[d.du], u1 = d.U[nu], v0 = d.V[d.dv], v1 = d.V[nv];
      if (!(u1 > u0) || !(v1 > v0)) return null;
      function sameRow(a, b) { for (var k = 0; k < a.length; k++) if (len(sub(a[k], b[k])) > 1e-9 * (1 + len(a[k]))) return false; return true; }
      var cu = sameRow(d.poles[0], d.poles[nu - 1]), cv = sameRow(columnOf(d.poles, 0), columnOf(d.poles, nv - 1));
      function at(u, v) {
        if (cu) u = u0 + mod(u - u0, u1 - u0); else u = Math.max(u0, Math.min(u1, u));
        if (cv) v = v0 + mod(v - v0, v1 - v0); else v = Math.max(v0, Math.min(v1, v));
        return bsSurfPoint(d, u, v);
      }
      function mod(x, P) { x = x % P; return x < 0 ? x + P : x; }
      var tsU = bsParams(d.U, d.du), tsV = bsParams(d.V, d.dv), G = tsU.map(function (u) { return tsV.map(function (v) { return bsSurfPoint(d, u, v); }); });
      var hs = Infinity, ht = Infinity, size = 0, lo = G[0][0].slice(), hi = G[0][0].slice();
      G.forEach(function (col) { col.forEach(function (p) { for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }); });
      size = len(sub(hi, lo)) || 1;
      for (var j = 0; j < tsV.length; j++) hs = Math.min(hs, rowStep(tsU, columnOf(G, j)));
      for (var i = 0; i < tsU.length; i++) ht = Math.min(ht, rowStep(tsV, G[i]));
      // a step no finer than an eighth of the grid's (24 samples a knot span)
      hs = Math.max(hs, (u1 - u0) / Math.max(1, tsU.length - 1) / 8); ht = Math.max(ht, (v1 - v0) / Math.max(1, tsV.length - 1) / 8);
      // seeds: every third grid sample
      var seeds = [];
      for (i = 0; i < tsU.length; i += 3) for (j = 0; j < tsV.length; j += 3) seeds.push([tsU[i], tsV[j], G[i][j]]);
      var hu = 1e-7 * (u1 - u0), hv = 1e-7 * (v1 - v0), far = 1e-3 * size;
      return {
        at: at, pu: cu ? u1 - u0 : 0, pv: cv ? v1 - v0 : 0, hs: hs, ht: ht,
        su: size / (u1 - u0), sv: size / (v1 - v0),
        uv: function (p) {
          var bs = null, bd = Infinity;
          seeds.forEach(function (s) { var dd = len(sub(s[2], p)); if (dd < bd) { bd = dd; bs = s; } });
          var q = projectUV(at, p, bs[0], bs[1], [cu ? null : u0, cv ? null : v0], [u1, v1], hu, hv);
          return len(sub(at(q[0], q[1]), p)) <= far ? [q[0], q[1]] : null;
        },
        normal: function (u, v) { return cross(sub(at(u + hu * 10, v), at(u - hu * 10, v)), sub(at(u, v + hv * 10), at(u, v - hv * 10))); }
      };
    }
    // lane stepreal2: a SURFACE_OF_LINEAR_EXTRUSION of an ELLIPSE or a CIRCLE (OpenCascade writes an elliptic cylinder
    // that way): u the curve's own angle (one period), w along the direction
    function conicExtrusion(g, D) {
      var T = placement(g.a[1]), o = T.position, X = [T.rotation[0], T.rotation[3], T.rotation[6]], Y = [T.rotation[1], T.rotation[4], T.rotation[7]];
      var a = +g.a[2], b = g.t === 'CIRCLE' ? a : +g.a[3];
      if (!(a > 0) || !(b > 0) || Math.abs(dot(cross(X, Y), D)) < 1e-9) return null;
      function c(u) { return add(o, add(scale(X, a * Math.cos(u)), scale(Y, b * Math.sin(u)))); }
      function at(u, w) { return add(c(u), scale(D, w)); }
      var n = K.segsForRadius(Math.max(a, b) * (toMM || 1)), ts = [], ps = [];
      for (var i = 0; i <= n; i++) { ts.push(2 * Math.PI * i / n); ps.push(c(ts[i])); }
      // the step where the ellipse turns fastest (its ends of the long axis: radius b² / a there)
      var size = 2 * Math.max(a, b), hu = 1e-7, hw = 1e-7 * size, far = 1e-3 * size, rmin = Math.min(a * a / b, b * b / a);
      var hs = 2 * Math.PI / K.segsForRadius(rmin * (toMM || 1)) * rmin / Math.max(a, b) * (1 + 1e-6);
      return {
        at: at, pu: 2 * Math.PI, pv: 0, hs: Math.max(hs, 2 * Math.PI / 512), ht: Infinity, su: size / (2 * Math.PI), sv: 1,
        uv: function (p) {
          var bs = 0, bd = Infinity;
          for (var k = 0; k < n; k++) { var w = sub(p, ps[k]), dd = len(sub(w, scale(D, dot(w, D)))); if (dd < bd) { bd = dd; bs = k; } }
          var q2 = projectUV(at, p, ts[bs], dot(sub(p, ps[bs]), D), null, null, hu, hw);
          return len(sub(at(q2[0], q2[1]), p)) <= far ? q2 : null;
        },
        normal: function (u) { return cross(add(scale(X, -a * Math.sin(u)), scale(Y, b * Math.cos(u))), D); }
      };
    }
    function extrusionAdaptor(surf) {
      var g0 = ent(surf.a[1]), bc = bsCurveOf(g0), va = args(ent(surf.a[2]), 'VECTOR'), D = va ? direction(va[1], null) : null;
      if (D && g0 && (g0.t === 'ELLIPSE' || g0.t === 'CIRCLE')) return conicExtrusion(g0, D);
      if (!bc || !D || !(bc.poles.length > bc.deg) || !bc.poles.every(Boolean) || bc.U.length !== bc.poles.length + bc.deg + 1) return null;
      var u0 = bc.U[bc.deg], u1 = bc.U[bc.poles.length];
      if (!(u1 > u0)) return null;
      function c(u) { return bsCurvePoint(bc.deg, bc.poles, bc.U, bc.W, Math.max(u0, Math.min(u1, u))); }
      function at(u, w) { return add(c(u), scale(D, w)); }
      var ts = bsParams(bc.U, bc.deg), ps = ts.map(c), lo = ps[0].slice(), hi = ps[0].slice();
      ps.forEach(function (p) { for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } });
      var size = len(sub(hi, lo)) || 1, hu = 1e-7 * (u1 - u0), hw = 1e-7 * size, far = 1e-3 * size;
      var hs = Math.max(rowStep(ts, ps), (u1 - u0) / Math.max(1, ts.length - 1) / 8);
      return {
        at: at, pu: 0, pv: 0, hs: hs, ht: Infinity, su: size / (u1 - u0), sv: 1,
        uv: function (p) {
          var bs = 0, bd = Infinity;
          ps.forEach(function (q, k) { var w = sub(p, q), pr = sub(w, scale(D, dot(w, D))), dd = len(pr); if (dd < bd) { bd = dd; bs = k; } });
          var q2 = projectUV(at, p, ts[bs], dot(sub(p, ps[bs]), D), [u0, null], [u1, null], hu, hw);
          return len(sub(at(q2[0], q2[1]), p)) <= far ? q2 : null;
        },
        normal: function (u, w) { return cross(sub(c(u + hu * 10), c(u - hu * 10)), D); }
      };
    }
    // curvedFace(faceArgs, S, sameSense, out) -> true when the face was tessellated. Supported: bands between two full
    // latitude circles (cylinder, cone, sphere, torus), caps from one circle to a cone's apex or a sphere's pole,
    // whole spheres and tori, and cylinder / cone patches bounded by two latitude arcs and two rulings. Seam edges (an
    // EDGE_CURVE the face uses twice) only say which way round a sphere or torus band goes.
    function curvedFace(fa, S, sameSense, out) {
      var loops = [], vloops = [], uses = {}, ok = true, outerI = -1, lflip = [];
      (fa[1] || []).forEach(function (bRef) {
        var b = ent(bRef), ba = b && (args(b, 'FACE_OUTER_BOUND') || args(b, 'FACE_BOUND')), l = ba && ent(ba[1]);
        if (!l) { ok = false; return; }
        if (l.t === 'VERTEX_LOOP') { var vpt = vertexPoint(l.a[1]); if (vpt) vloops.push(vpt); return; }
        if (l.t !== 'EDGE_LOOP') { ok = false; return; }
        if (has(b, 'FACE_OUTER_BOUND')) outerI = loops.length;   // lane stepin2 (cylPatch)
        var list = loopEdgeList(l);
        list.forEach(function (x) { uses[x.info.id] = (uses[x.info.id] || 0) + 1; });
        loops.push(list);
        lflip.push(!!(ba[2] && ba[2].e === "F"));   // lane realfiles (surfPatch: which side of a lone circle a cap lies)
      });
      if (!ok || !(S.r > 0) || len(S.d) < 0.5) return false;
      // lane MO: a sphere face bounded by one whole circle at any tilt (a ball on a shaft that does not run along the
      // sphere's own axis; OpenCascade adds a VERTEX_LOOP at the pole inside the face): re-framed about the circle's
      // own axis, the circle is a latitude and the face the cap beyond it (the records' columns run from the centre,
      // so the frame changes nothing in massProps)
      if (S.t === 'sph' && loops.length === 1 && loops[0].length === 1 && loops[0][0].info.kind === 'circle' && loops[0][0].info.full) {
        var c0 = loops[0][0].info.circle, n0 = norm(c0.n), off0 = sub(c0.c, S.o), tl0 = 1e-6 * Math.max(1, S.r, len(S.o));
        if (len(sub(off0, scale(n0, dot(off0, n0)))) < tl0 && Math.abs(Math.hypot(c0.r, dot(off0, n0)) - S.r) < tl0 &&
            vloops.every(function (p) { return Math.abs(len(sub(p, S.o)) - S.r) < tl0; }) && Math.abs(dot(n0, norm(S.d))) < 1 - 1e-12) {
          var S2 = {};
          for (var sk in S) if (Object.prototype.hasOwnProperty.call(S, sk)) S2[sk] = S[sk];
          S2.d = n0; S = S2; vloops = [];
        }
      }
      var Cr = S.t === 'tor' ? S.R : 0, ext = Math.max(1, S.r, Math.abs(Cr), len(S.o)), tol = 1e-6 * ext;
      if (S.t === 'tor' && !(Cr > S.r)) return false;
      var nc = canonDir(S.d), xc = xdirOf(nc), yc = cross(nc, xc);
      function ax(p) { var rel = sub(p, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)); return { z: z, rho: len(v), ang: Math.atan2(dot(v, yc), dot(v, xc)) }; }
      function onSurface(p) {
        var a = ax(p);
        if (S.t === 'cyl') return Math.abs(a.rho - S.r) < tol;
        if (S.t === 'cone') return Math.abs(a.rho - (S.r + S.k * a.z)) < tol;
        return Math.abs(Math.hypot(a.rho - Cr, a.z) - S.r) < tol;
      }
      var seams = [], lats = [], rulings = [], ells = [];
      // rfFF2: a fillet's spherical corner (Anvil's own export, OpenCascade's rounded box): one loop of three quarter
      // great circles in mutually perpendicular planes
      var octTris = S.t === 'sph' && loops.length === 1 && !vloops.length && loops[0].length === 3 ? sphereOctant(loops[0]) : null;
      // -> triangles [A, B, C, record] of a sphere octant, or null: re-framed about the axis from the pole (where the
      // second and third arcs meet) through the centre, the first arc is the equator and the others meridians; rows of
      // constant latitude through the meridians' own points, columns at the equator's points, so every quad is a
      // revolved chord (exact massProps with P / Q) and the boundary points are the edges' (watertight with neighbours)
      function sphereOctant(L) {
        if (!L.every(function (x) { return x.info.kind === 'circle' && !x.info.full && len(sub(x.info.circle.c, S.o)) < tol && Math.abs(x.info.circle.r - S.r) < tol; })) return null;
        var ns = L.map(function (x) { return norm(x.info.circle.n); });
        if (Math.abs(dot(ns[0], ns[1])) > 1e-6 || Math.abs(dot(ns[0], ns[2])) > 1e-6 || Math.abs(dot(ns[1], ns[2])) > 1e-6) return null;
        var Eq = orientedPts(L[0]), M1 = orientedPts(L[1]), M2 = orientedPts(L[2]).slice().reverse(), pole = M1[M1.length - 1];
        if (M1.length !== M2.length || M1.length < 2 || len(sub(M2[M2.length - 1], pole)) > tol || len(sub(Eq[0], M2[0])) > tol || len(sub(Eq[Eq.length - 1], M1[0])) > tol) return null;
        var d = norm(sub(S.o, pole)), Sp = { t: 'sph', o: S.o, d: d, r: S.r };
        function zOf(p) { return dot(sub(p, S.o), d); }
        for (var i = 0; i < M1.length; i++) if (Math.abs(zOf(M1[i]) - zOf(M2[i])) > tol) return null;
        var e0 = norm(sub(Eq[0], add(S.o, scale(d, zOf(Eq[0]))))), e1 = cross(d, e0), phis = [], acc = 0, prev = 0;
        Eq.forEach(function (p, j) { var v = sub(p, S.o), a = Math.atan2(dot(v, e1), dot(v, e0)); if (j) acc += wrapAngle(a - prev); prev = a; phis.push(acc); });
        var rows = [];
        for (i = 0; i < M1.length; i++) {
          var z = zOf(M2[i]), rho = i === M1.length - 1 ? 0 : Math.sqrt(Math.max(0, S.r * S.r - z * z)), c = add(S.o, scale(d, z)), row;
          if (i === 0) row = Eq.slice();
          else if (i === M1.length - 1) row = [pole];
          else row = phis.map(function (ph, j) { return j === 0 ? M2[i] : j === phis.length - 1 ? M1[i] : add(c, scale(add(scale(e0, Math.cos(ph)), scale(e1, Math.sin(ph))), rho)); });
          rows.push({ pts: row, rho: rho, z: z });
        }
        var res = [];
        for (i = 0; i + 1 < rows.length; i++) {
          var A = rows[i], B = rows[i + 1], R = { s: Sp, P: [A.rho, A.z], Q: [B.rho, B.z] };
          for (var j = 0; j + 1 < A.pts.length; j++) {
            if (B.pts.length === 1) { res.push([A.pts[j], A.pts[j + 1], B.pts[0], R]); continue; }
            res.push([A.pts[j], A.pts[j + 1], B.pts[j + 1], R], [A.pts[j], B.pts[j + 1], B.pts[j], R]);
          }
        }
        return res;
      }
      var odd = false;
      for (var li = 0; !octTris && li < loops.length; li++) for (var xi = 0; xi < loops[li].length; xi++) {
        var x = loops[li][xi], info = x.info;
        if (uses[info.id] > 1) { if (seams.indexOf(info) < 0) seams.push(info); continue; }
        if (info.kind === 'circle' && Math.abs(Math.abs(dot(norm(info.circle.n), S.d)) - 1) < 1e-9 && ax(info.circle.c).rho < tol && onSurface(info.start)) {
          lats.push({ x: x, loop: li, idx: xi, z: ax(info.circle.c).z, rho: info.circle.r });
          continue;
        }
        if (info.kind === 'line' && (S.t === 'cyl' || S.t === 'cone') && onSurface(info.start) && onSurface(info.end)) {
          var a1 = ax(info.start), a2 = ax(info.end);
          if (a1.rho < tol || a2.rho < tol || Math.abs(wrapAngle(a1.ang - a2.ang)) * Math.max(a1.rho, a2.rho) < tol) { rulings.push({ x: x, loop: li, idx: xi }); continue; }
        }
        // stepout-2: an oblique plane's cut of the cylinder (a mitred bend end): the ellipse's centre on the axis, its
        // minor semi-axis the radius and square to the axis
        if (info.kind === 'ellipse' && S.t === 'cyl' && !info.full && onSurface(info.start) && onSurface(info.end)) {
          var EL = info.ellipse, ey = cross(norm(EL.normal), EL.xdir);
          if (ax(EL.center).rho < tol && Math.abs(EL.b - S.r) < tol && Math.abs(dot(ey, S.d)) < 1e-9) { ells.push(x); continue; }
        }
        // lane importbend: a B-spline edge on the cylinder (another CAD system's oblique or relief cut, OpenCascade's
        // approximated intersection curves): a side like an ellipse, its own points on the surface
        if (info.kind === 'bspline' && S.t === 'cyl' && info.pts.every(onSurface)) { ells.push(x); continue; }
        odd = true;   // lane realfiles: an edge none of the shapes below takes: the general patch (surfPatch)
      }
      // latitude levels
      var levels = [];
      lats.forEach(function (L) {
        var lv = null;
        levels.forEach(function (q) { if (Math.abs(q.z - L.z) < tol && Math.abs(q.rho - L.rho) < tol) lv = q; });
        if (!lv) { lv = { z: L.z, rho: L.rho, items: [] }; levels.push(lv); }
        lv.items.push(L);
      });
      var full = levels.filter(function (q) { return q.items.length === 1 && q.items[0].x.info.full; });
      function ring(q) { // a full circle's points as a row, sorted by angle
        var pts = q.items[0].x.info.pts.slice(0, -1);
        return pts.map(function (p) { return { p: p, a: mod2pi(ax(p).ang) }; }).sort(function (u, v) { return u.a - v.a; });
      }
      var recs = { cyl: null }, tris = [];
      function rec(P, Q) { if (S.t === 'cyl' || S.t === 'cone') return recs.cyl || (recs.cyl = { s: S }); return { s: S, P: P, Q: Q }; }
      // zipper two rows of points ({ p, a }, angles increasing); cyclic rows wrap around
      function zip(A, B, cyclic, r) {
        if (cyclic) {
          A = A.concat([{ p: A[0].p, a: A[0].a + 2 * Math.PI }]);
          B = B.concat([{ p: B[0].p, a: B[0].a + 2 * Math.PI }]);
        }
        var i = 0, j = 0;
        while (i < A.length - 1 || j < B.length - 1) {
          if (j >= B.length - 1 || (i < A.length - 1 && A[i + 1].a <= B[j + 1].a)) { tris.push([A[i].p, A[i + 1].p, B[j].p, r]); i++; }
          else { tris.push([A[i].p, B[j + 1].p, B[j].p, r]); j++; }
        }
      }
      function pointRow(p) { return [{ p: p, a: 0 }]; }
      // a latitude row of a sphere / torus at meridian angle beta (a pole is one point)
      function betaRow(beta) {
        var rho = Cr + S.r * Math.cos(beta), z = S.r * Math.sin(beta), c = add(S.o, scale(S.d, z));
        if (rho < tol) return { row: pointRow(c), rho: 0, z: z };
        var n = K.segsForRadius(rho * toMM), row = [];
        for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; row.push({ p: add(c, scale(add(scale(xc, Math.cos(a)), scale(yc, Math.sin(a))), rho)), a: a }); }
        return { row: row, rho: rho, z: z };
      }
      function betaOf(p) { var a = ax(p); return Math.atan2(a.z, a.rho - Cr); }
      // rows of a sphere / torus from meridian angle b1 to b2 (dir +1 / -1); first / last rows given (null: computed)
      function betaRows(b1, b2, dir, first, last) {
        var span = dir > 0 ? mod2pi(b2 - b1) : mod2pi(b1 - b2);
        if (span < 1e-12) span = 2 * Math.PI;
        var nv = K.segsForRadius(S.r * toMM), step = 2 * Math.PI / nv, rows = [first || betaRow(b1)];
        var k = dir > 0 ? Math.floor(b1 / step) + 1 : Math.ceil(b1 / step) - 1;
        for (; ; k += dir) {
          var b = k * step, off = dir > 0 ? b - b1 : b1 - b;
          if (off >= span - 0.3 * step) break;
          if (off > 0.3 * step) rows.push(betaRow(b));
        }
        rows.push(last || betaRow(b2));
        return rows;
      }
      function zipRows(rows, cyclicRows) {
        var n = rows.length;
        for (var j = 0; j < (cyclicRows ? n : n - 1); j++) {
          var A = rows[j], B = rows[(j + 1) % n];
          zip(A.row, B.row, true, rec([A.rho, A.z], [B.rho, B.z]));
        }
      }
      function circleRow(q) { return { row: ring(q), rho: q.rho, z: q.z }; }
      // the runs of consecutive rulings round a loop
      function rulingRuns(L) {
        var isR = L.map(function (x) { return rulings.some(function (r) { return r.x === x; }); }), runs = 0;
        for (var i = 0; i < L.length; i++) if (isR[i] && !isR[(i + 1) % L.length]) runs++;
        return runs;
      }
      // lane stepin2: a cylinder patch of any other shape (a hole or slot through a bend: an inner loop; a bend notched
      // by a neighbour's relief: an L in (angle, z), three runs of rulings; sides of any curves lying on it): every loop
      // unrolled to (u = r·angle, v = z), ear clipped there, then every interior edge longer than one segment of the
      // circle's canonical grid (segsForRadius) halved, its new point on the surface, until none is; the boundary keeps
      // the edges' own points (watertight with the faces beside it). Each triangle carries the cylinder record, so
      // massProps stays exact and Insert Bends sees the bend. A loop that winds round the axis (a band) is not taken.
      function cylPatch() {
        if (S.t !== 'cyl' || vloops.length || !loops.length) return false;
        var V = [], rings = [], mean0 = null, r = S.r;
        for (var k = 0; k < loops.length; k++) {
          var pts = [];
          loops[k].forEach(function (x) { var q = orientedPts(x); pts = pts.concat(q.slice(0, Math.max(1, q.length - 1))); });
          pts = dedupeRing(pts);
          if (pts.length < 3) return false;
          var acc = 0, prev = null, a0 = null, uv = [];
          for (var q2 = 0; q2 < pts.length; q2++) {
            var A2 = ax(pts[q2]);
            if (prev != null) { var st = wrapAngle(A2.ang - prev); if (Math.abs(st) > Math.PI / 2) return false; acc += st; } else a0 = A2.ang;
            prev = A2.ang; uv.push([a0 + acc, A2.z]);
          }
          if (Math.abs(acc + wrapAngle(a0 - prev)) > 1e-6) return false;   // winds round the axis
          var mean = 0;
          uv.forEach(function (p) { mean += p[0]; });
          mean /= uv.length;
          if (mean0 == null) mean0 = mean;
          else { var sh = 2 * Math.PI * Math.round((mean0 - mean) / (2 * Math.PI)); uv.forEach(function (p) { p[0] += sh; }); }
          var idx = [];
          uv.forEach(function (p, j) { idx.push(V.length); V.push({ p: pts[j], u: p[0] * r, v: p[1] }); });
          rings.push(idx);
        }
        function area(ix) { var s = 0; for (var i = 0; i < ix.length; i++) { var a = V[ix[i]], b = V[ix[(i + 1) % ix.length]]; s += a.u * b.v - b.u * a.v; } return s / 2; }
        var oi = outerI;
        if (oi < 0) { var big = -1; rings.forEach(function (ix, k2) { var a = Math.abs(area(ix)); if (a > big) { big = a; oi = k2; } }); }
        rings = rings.map(function (ix, k2) { return (k2 === oi) !== (area(ix) > 0) ? ix.slice().reverse() : ix; });
        var P2 = V.map(function (x) { return [x.u, x.v]; }), tl = earcut(P2, rings[oi], rings.filter(function (ix, k2) { return k2 !== oi; }));
        var T3 = [];
        for (var t = 0; t + 2 < tl.length; t += 3) T3.push([tl[t], tl[t + 1], tl[t + 2]]);
        if (!T3.length) return false;
        var ea = 0;
        T3.forEach(function (t3) { ea += (P2[t3[1]][0] - P2[t3[0]][0]) * (P2[t3[2]][1] - P2[t3[0]][1]) - (P2[t3[2]][0] - P2[t3[0]][0]) * (P2[t3[1]][1] - P2[t3[0]][1]); });
        var want = rings.reduce(function (s, ix) { return s + area(ix); }, 0);
        if (!(Math.abs(ea / 2 - want) <= 1e-6 * Math.max(Math.abs(want), 1e-12))) return false;   // the ear clipping failed
        // lane stepreal2: no triangle of no area goes into the refinement; lane MO: and the fans of the ear clipping made
        // Delaunay in true lengths first (a side between two circles became a zipper; the fans' long diagonals made the
        // refinement fill a pin's side with 2448 triangles for the 64 of two rings zipped)
        delaunayFlips(T3, P2);
        var stepU = 2 * Math.PI / K.segsForRadius(r * toMM) * r * (1 + 1e-6);
        // longest-edge (in u) bisection along the longest-edge propagation path: the edge split is the longest of both
        // its triangles, so the third vertices lie within its u range and every new edge spans at most half of it
        var em = {};
        function ek(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
        function span(a, b) { return Math.abs(V[a].u - V[b].u); }
        function addT(ti) { var t3 = T3[ti]; for (var e = 0; e < 3; e++) { var key = ek(t3[e], t3[(e + 1) % 3]); (em[key] || (em[key] = [])).push(ti); } }
        function remT(ti) { var t3 = T3[ti]; for (var e = 0; e < 3; e++) { var l = em[ek(t3[e], t3[(e + 1) % 3])], at = l.indexOf(ti); if (at >= 0) l.splice(at, 1); } }
        function longest(ti) { var t3 = T3[ti], best = 0; for (var e = 1; e < 3; e++) if (span(t3[e], t3[(e + 1) % 3]) > span(t3[best], t3[(best + 1) % 3])) best = e; return [t3[best], t3[(best + 1) % 3]]; }
        function splitEdge(a, b) {
          var u = (V[a].u + V[b].u) / 2, v = (V[a].v + V[b].v) / 2, an = u / r, m = V.length, ts = em[ek(a, b)].slice();
          V.push({ p: add(add(S.o, scale(S.d, v)), scale(add(scale(xc, Math.cos(an)), scale(yc, Math.sin(an))), r)), u: u, v: v });
          ts.forEach(function (ti) {
            var t3 = T3[ti], e = 0;
            while (e < 3 && !((t3[e] === a && t3[(e + 1) % 3] === b) || (t3[e] === b && t3[(e + 1) % 3] === a))) e++;
            var i = t3[e], j = t3[(e + 1) % 3], c = t3[(e + 2) % 3];
            remT(ti);
            T3[ti] = [i, m, c]; addT(ti);
            T3.push([m, j, c]); addT(T3.length - 1);
            queue.push(ti, T3.length - 1);
          });
        }
        T3.forEach(function (t3, ti) { addT(ti); });
        var queue = T3.map(function (t3, ti) { return ti; }), guard = 0;
        while (queue.length && guard < 200000) {
          var ti0 = queue.pop(), e0 = longest(ti0);
          if (span(e0[0], e0[1]) <= stepU) continue;
          var cur = ti0, edge = e0;
          for (var walk = 0; walk < 1000; walk++) {
            guard++;
            var nbs = em[ek(edge[0], edge[1])], nb = nbs.length === 2 ? (nbs[0] === cur ? nbs[1] : nbs[0]) : -1;
            if (nb < 0) { edge = null; break; }   // a boundary edge: kept (the edges' own points)
            var en = longest(nb);
            if (span(en[0], en[1]) <= span(edge[0], edge[1]) * (1 + 1e-12)) break;
            cur = nb; edge = en;
          }
          if (!edge) continue;
          splitEdge(edge[0], edge[1]);
          queue.push(ti0);
        }
        // lane stepreal2: they all turn one way in (u, v), so one answer orients them all (as surfPatch): asked one by
        // one, a triangle of no area (a point kept on a straight side) answered at random, its edges then ran the same
        // way as its neighbours': an open body
        var voteC = 0;
        T3.forEach(function (t3) { var A0 = V[t3[0]].p, B0 = V[t3[1]].p, C0 = V[t3[2]].p; voteC += dot(cross(sub(B0, A0), sub(C0, A0)), norm(gOf(scale(add(add(A0, B0), C0), 1 / 3)))); });
        var flipC = (voteC > 0) !== sameSense;
        T3.forEach(function (t3) { tris.push([V[t3[0]].p, V[t3[1]].p, V[t3[2]].p, rec(), flipC]); });
        return true;
      }
      // lane realfiles: any other patch of a cylinder, cone, sphere or torus (a fillet's corner bounded by meridians, a
      // cone or a band cut by B-spline intersection curves, a cylinder side whose loop runs up and down a seam, a cone
      // reaching its apex): paramPatch in (angle, height) or (angle, meridian angle), the steps the canonical grid's
      // (segsForRadius of the largest radius on the face; the tube's for a sphere / torus). Cylinder and cone triangles
      // carry the surface record (exact massProps), sphere and torus triangles the surface only (no profile chord).
      function surfPatch() {
        if (vloops.length || !loops.length) return false;
        var round = S.t === 'sph' || S.t === 'tor', lp = [], rmax = 0;
        for (var k = 0; k < loops.length; k++) {
          var pts = [];
          loops[k].forEach(function (x) { var q = orientedPts(x); pts = pts.concat(q.slice(0, Math.max(1, q.length - 1))); });
          pts = dedupeRing(pts);
          if (pts.length < 3) return false;
          pts.forEach(function (p) { rmax = Math.max(rmax, ax(p).rho); });
          lp.push(pts);
        }
        // a boundary far off the surface is not this face's (1e-4 of its size: intersection curves are approximate)
        var far = 1e-4 * ext;
        if (lp.some(function (pts) { return pts.some(function (p) { var a = ax(p); return Math.abs(S.t === 'cyl' ? a.rho - S.r : S.t === 'cone' ? (a.rho - (S.r + S.k * a.z)) / Math.sqrt(1 + S.k * S.k) : Math.hypot(a.rho - Cr, a.z) - S.r) > far; }); })) return false;
        if (!(rmax > 0)) return false;
        var A = {
          uv: function (p) { var a = ax(p), v = round ? Math.atan2(a.z, a.rho - Cr) : a.z; return [a.ang, v, a.rho < tol]; },
          at: function (u, v) {
            var rho = round ? Cr + S.r * Math.cos(v) : S.r + (S.k || 0) * v, z = round ? S.r * Math.sin(v) : v;
            return add(add(S.o, scale(S.d, z)), scale(add(scale(xc, Math.cos(u)), scale(yc, Math.sin(u))), rho));
          },
          pu: 2 * Math.PI, pv: S.t === 'tor' ? 2 * Math.PI : 0,
          hs: 2 * Math.PI / K.segsForRadius(rmax * toMM) * (1 + 1e-6), ht: round ? 2 * Math.PI / K.segsForRadius(S.r * toMM) * (1 + 1e-6) : Infinity,
          su: rmax, sv: round ? S.r : 1
        };
        // a cap of a sphere or cone bounded by one circle alone (no seam, no vertex loop: SolidWorks' dome, a countersink
        // to its point): the loop closes through the pole on the face's side, the side its normal and the loop's sense
        // give (the face lies left of its boundary seen from outside)
        if (lp.length === 1 && (S.t === 'sph' || (S.t === 'cone' && Math.abs(S.k) > 1e-12))) {
          var L0 = lp[0], acc = 0, nL = L0.length;
          for (var q = 0; q < nL; q++) acc += wrapAngle(ax(L0[(q + 1) % nL]).ang - ax(L0[q]).ang);
          if (Math.abs(Math.abs(acc) - 2 * Math.PI) < 1e-6 && L0.every(function (p) { return ax(p).rho >= tol; })) {
            var pole, mer = [];
            if (S.t === 'cone') pole = add(S.o, scale(S.d, -S.r / S.k));
            else {
              var P0 = lflip[0] ? L0[1] : L0[0], P1 = lflip[0] ? L0[0] : L0[1], nOut = scale(norm(sub(P0, S.o)), sameSense ? 1 : -1);
              pole = add(S.o, scale(S.d, dot(cross(nOut, sub(P1, P0)), S.d) > 0 ? S.r : -S.r));
              // lane stepreal2: the cut from the circle's first point to the pole runs on the sphere: a point every step
              // along that meridian, the same points up one side and down the other. With one chord from the circle to
              // the pole, the two triangles beside the cut were flat from rim to pole: a notch up to 0.29 r deep
              var a0 = ax(L0[0]), v0 = Math.atan2(a0.z, a0.rho), vp = dot(sub(pole, S.o), S.d) > 0 ? Math.PI / 2 : -Math.PI / 2, nm = Math.ceil(Math.abs(vp - v0) / A.ht - 1e-9);
              for (var mi = 1; mi < nm; mi++) mer.push(A.at(a0.ang, v0 + (vp - v0) * mi / nm));
            }
            lp[0] = L0.concat([L0[0]], mer, [pole], mer.slice().reverse());
          }
        }
        var res = paramPatch(lp, outerI, A);
        if (!res) return false;
        var rg = round ? { s: S, g: 1 } : rec();   // lane stepreal2: g = corners on the surface, exact by the columns from its centre (kernel-curves.js curveDensity)
        // they all turn one way in (u, v): the area-weighted vote of the surface normal decides for all of them
        var vote = 0;
        res.T.forEach(function (t3) { var A0 = res.V[t3[0]].p, B0 = res.V[t3[1]].p, C0 = res.V[t3[2]].p; vote += dot(cross(sub(B0, A0), sub(C0, A0)), norm(gOf(scale(add(add(A0, B0), C0), 1 / 3)))); });
        var flip = (vote > 0) !== sameSense;
        res.T.forEach(function (t3) { tris.push([res.V[t3[0]].p, res.V[t3[1]].p, res.V[t3[2]].p, rg, flip]); });
        return true;
      }
      // lane stepreal2: a cylinder face whose only boundary is one whole latitude circle (SolidWorks writes a hole or a
      // boss of no height that way: the circle is a plane's inner loop and nothing else uses it) has no height; what
      // closes the solid there is the flat disc inside the circle, facing the way the loop turns (a face lies left of
      // its boundary seen from outside), so the plane round it runs on across the "hole". Planar triangles, no record.
      function noHeight() {
        var pts = [];
        loops[0].forEach(function (x) { var q = orientedPts(x); pts = pts.concat(q.slice(0, Math.max(1, q.length - 1))); });
        pts = dedupeRing(pts);
        if (pts.length < 3) return false;
        var wind = 0;
        for (var q2 = 0; q2 < pts.length; q2++) wind += wrapAngle(ax(pts[(q2 + 1) % pts.length]).ang - ax(pts[q2]).ang);
        if (Math.abs(Math.abs(wind) - 2 * Math.PI) > 1e-6) return false;
        if (lflip[0]) pts.reverse();
        var nd = norm(newell(pts)), t0 = out.tris.length;
        if (len(nd) < 0.5) return false;
        triangulateFace([pts], 0, nd, out);
        for (var t = t0; t < out.tris.length; t += 3) out.recs.push(null);
        noHeightFaces++;
        return true;
      }
      var seamMid = seams.length && seams[0].kind === 'circle' ? seams[0].mid : null, general = false;
      if (odd) general = true;
      else if (octTris) tris = octTris;   // rfFF2
      else if (S.t === 'cyl' && levels.length === 1 && loops.length === 1 && !vloops.length && !rulings.length && !ells.length && !seams.length && lats.length === loops[0].length && noHeight()) return true;
      else if (S.t === 'cyl' || S.t === 'cone') {
        if (levels.length === 2 && full.length === 2 && !rulings.length) zip(ring(levels[0]), ring(levels[1]), true, rec());
        else if (S.t === 'cone' && levels.length === 1 && full.length === 1 && !rulings.length && Math.abs(S.k) > 1e-12) zip(ring(levels[0]), pointRow(add(S.o, scale(S.d, -S.r / S.k))), true, rec());
        else if ((levels.length === 2 || (ells.length && !full.length)) && loops.length === 1 && rulingRuns(loops[0]) === 2 && (function () {
          // a patch between two arcs and two rulings: the loop is arcs at one level, a ruling, arcs at the other, a ruling
          // (stepout: a ruling may come split in collinear pieces where other faces meet it, as Anvil writes a fillet
          // whose side is met by a chamfer's end: each run of rulings is one side) (lane stepin2: false = not that
          // shape after all, cylPatch below tries it)
          var L = loops[0], n = L.length, start = -1;
          for (var s = 0; s < n && start < 0; s++) if (rulings.some(function (r) { return r.idx === s; }) && !rulings.some(function (r) { return r.idx === (s + 1) % n; })) start = (s + 1) % n;
          if (start < 0) return false;
          var rowsPts = [[], []], side = 0;
          for (var m = 0; m < n; m++) {
            var xx = L[(start + m) % n];
            if (rulings.some(function (r) { return r.x === xx; })) { if (m > 0 && rowsPts[side].length) side = 1; continue; }
            var q = orientedPts(xx);
            rowsPts[side] = rowsPts[side].concat(rowsPts[side].length ? q.slice(1) : q);
          }
          if (!rowsPts[0].length || !rowsPts[1].length) return false;
          var A = rowsPts[0], B = rowsPts[1].slice().reverse();
          function unwrap(pts) {
            var out2 = [], prev = null, acc = 0;
            pts.forEach(function (p) { var a = ax(p).ang; if (prev != null) acc += wrapAngle(a - prev); prev = a; out2.push({ p: p, a: acc }); });
            return out2;
          }
          var ua = unwrap(A), ub = unwrap(B), sg = ua[ua.length - 1].a >= 0 ? 1 : -1;
          var off2 = wrapAngle(ax(B[0]).ang - ax(A[0]).ang);
          ua.forEach(function (u) { u.a *= sg; }); ub.forEach(function (u) { u.a = (u.a + off2) * sg; });
          // stepout-2: each side must run one way round the axis (sides of ellipse arcs are not latitude rows)
          function monotone(us) { for (var mi = 1; mi < us.length; mi++) if (us[mi].a < us[mi - 1].a - 1e-9) return false; return true; }
          if (ells.length && (!monotone(ua) || !monotone(ub))) return false;
          zip(ua, ub, false, rec());
          return true;
        })()) { /* zipped */ } else general = true;
      } else {
        var circles = levels.map(circleRow);
        if (!levels.length && !rulings.length) {
          if (S.t === 'sph') zipRows(betaRows(-Math.PI / 2, Math.PI / 2, 1));
          else {
            var nv2 = K.segsForRadius(S.r * toMM), trows = [];
            for (var j2 = 0; j2 < nv2; j2++) trows.push(betaRow(2 * Math.PI * j2 / nv2));
            zipRows(trows, true);
          }
        } else if (levels.length === 2 && full.length === 2 && seamMid) {
          var b1 = betaOf(circles[0].row[0].p), b2 = betaOf(circles[1].row[0].p), bm = betaOf(seamMid);
          var dir = mod2pi(bm - b1) < mod2pi(b2 - b1) ? 1 : -1;
          zipRows(betaRows(b1, b2, dir, circles[0], circles[1]));
        } else if (S.t === 'sph' && levels.length === 1 && full.length === 1 && seams.length === 1) {
          var sm = seams[0], far = Math.abs(betaOf(sm.start) - betaOf(circles[0].row[0].p)) > Math.abs(betaOf(sm.end) - betaOf(circles[0].row[0].p)) ? sm.start : sm.end;
          var bp = ax(far).z > 0 ? Math.PI / 2 : -Math.PI / 2, bc = betaOf(circles[0].row[0].p);
          zipRows(betaRows(bc, bp, bp > bc ? 1 : -1, circles[0], null));
        } else general = true;   // lane realfiles (surfPatch)
      }
      if (general && !cylPatch() && !surfPatch()) return false;   // lane stepin2, lane realfiles
      // orient every triangle outward (along the surface normal, or against it for a face with same_sense .F.); a
      // surfPatch triangle carries its answer in t[4] (they all turn one way in (u, v): the largest decides for all)
      function gOf(X) {
        var a = ax(X), rel = sub(X, S.o), er = norm(sub(rel, scale(S.d, a.z)));
        if (S.t === 'cyl') return er;
        if (S.t === 'cone') return sub(er, scale(S.d, S.k));
        if (S.t === 'sph') return rel;
        return sub(rel, add(scale(S.d, a.z), scale(er, Cr)));
      }
      tris.forEach(function (t) {
        var A = t[0], B = t[1], C = t[2], nrm = cross(sub(B, A), sub(C, A));
        if (len(nrm) < 1e-14 * ext * ext) return;
        if (t[4] != null ? t[4] : (dot(nrm, gOf(scale(add(add(A, B), C), 1 / 3))) > 0) !== sameSense) { var tmp = B; B = C; C = tmp; }
        var base = out.pos.length / 3;
        out.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
        out.tris.push(base, base + 1, base + 2);
        out.recs.push(t[3]);
      });
      return true;
    }
    function newell(pts) {
      var n = [0, 0, 0];
      for (var k = 0; k < pts.length; k++) {
        var a = pts[k], b = pts[(k + 1) % pts.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      return scale(n, 0.5);
    }
    function shellFaces(shellRef) {
      var sh = ent(shellRef);
      if (!sh) return [];
      var a = args(sh, 'CLOSED_SHELL') || args(sh, 'OPEN_SHELL');
      if (a) return a[1] || [];
      var oa = args(sh, 'ORIENTED_CLOSED_SHELL');
      if (oa) return shellFaces(oa[2]);
      return [];
    }

    // ---- solids and the representations that hold them
    var solidIds = [], shellsUsed = {};
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      if (has(e, 'MANIFOLD_SOLID_BREP') || has(e, 'FACETED_BREP') || has(e, 'BREP_WITH_VOIDS')) solidIds.push(+id);
    });
    // lane importbend: a BREP_WITH_VOIDS' void shells (ORIENTED_CLOSED_SHELL of a CLOSED_SHELL) are its own, not loose
    // shells to import as solids of their own (that made a part with sealed voids 0.6 % heavy)
    function useShell(ref) { if (!ref || ref.r == null) return; shellsUsed[ref.r] = true; var oa = args(E[ref.r], 'ORIENTED_CLOSED_SHELL'); if (oa && oa[2]) useShell(oa[2]); }
    solidIds.forEach(function (id) {
      var a = args(E[id], 'MANIFOLD_SOLID_BREP') || args(E[id], 'FACETED_BREP') || args(E[id], 'BREP_WITH_VOIDS'), bw = args(E[id], 'BREP_WITH_VOIDS');
      if (a) useShell(a[1]);
      if (bw) (bw[2] || []).forEach(useShell);
    });
    // shells that no solid wraps (a SHELL_BASED_SURFACE_MODEL, or a bare CLOSED_SHELL) are imported as solids too
    Object.keys(E).forEach(function (id) { var e = E[id]; if (e.t === 'CLOSED_SHELL' && !shellsUsed[id]) { var used = false; Object.keys(E).forEach(function (j) { var ej = E[j]; if (ej.t === 'SHELL_BASED_SURFACE_MODEL' && (ej.a[1] || []).some(function (r) { return r.r === +id; })) used = true; }); solidIds.push(+id); } });
    if (!solidIds.length) {
      // lane stepreal2: say what the file does hold (a wireframe export: curves in a GEOMETRIC_SET; surface bodies: open
      // shells), so the user knows the refusal is the file's, not a fault
      var nCurve = 0, nFace = 0;
      Object.keys(E).forEach(function (id) {
        var e = E[id];
        if (e.t === 'GEOMETRIC_SET' || e.t === 'GEOMETRIC_CURVE_SET') nCurve += (e.a[1] || []).filter(function (r) { var g = ent(r); return g && g.t !== 'CARTESIAN_POINT'; }).length;
        if (e.t === 'OPEN_SHELL') nFace += (e.a[1] || []).length;
      });
      throw new Error('No solid bodies in this STEP file' + (nFace ? ': it holds only surfaces (' + nFace + ' face' + (nFace === 1 ? '' : 's') + ' that do not close a volume)' : nCurve ? ': it holds only wireframe geometry (' + nCurve + ' curve' + (nCurve === 1 ? '' : 's') + ', no faces)' : ' (no MANIFOLD_SOLID_BREP, FACETED_BREP or CLOSED_SHELL)') + '. Anvil opens solids: export the part from the source CAD as a solid body' + (nCurve && !nFace ? ', or save the curves as a DXF and open that as a sketch.' : '.'));
    }

    var reps = {}; // representation id -> items
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      var a = e.t && /REPRESENTATION$/.test(e.t) && Array.isArray(e.a[1]) && e.a[1].length >= 0 && e.a[2] && e.a[2].r != null ? e.a : null;
      if (!a && e.parts) Object.keys(e.parts).forEach(function (t) { if (/SHAPE_REPRESENTATION$/.test(t) || t === 'REPRESENTATION') { var pa = e.parts[t]; if (pa && Array.isArray(pa[1])) a = pa; } });
      if (a) reps[id] = (a[1] || []).map(function (r) { return r && r.r; });
    });
    // union-find over representations linked without a transform; up-edges (child -> parent, transform) otherwise
    var parent = {};
    function find(x) { while (parent[x] != null && parent[x] !== x) x = parent[x]; return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
    Object.keys(reps).forEach(function (id) { parent[id] = +id; });
    var ups = [];
    // lane realfiles: which side of a placing relationship is the assembly. Writers differ (Anvil and OpenCascade put
    // the component first, SolidWorks the assembly first); the CONTEXT_DEPENDENT_SHAPE_REPRESENTATION names the
    // NEXT_ASSEMBLY_USAGE_OCCURRENCE (relating = the assembly), and SHAPE_DEFINITION_REPRESENTATIONs give each product
    // definition's representation. Without that link the component is taken to be first, as before.
    var pdRep = {}, parentFirst = {};
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      if (e.t !== 'SHAPE_DEFINITION_REPRESENTATION' || !e.a[0] || !e.a[1]) return;
      var pds = ent(e.a[0]);
      if (pds && pds.t === 'PRODUCT_DEFINITION_SHAPE' && pds.a[2] && pds.a[2].r != null) pdRep[pds.a[2].r] = e.a[1].r;
    });
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      if (e.t !== 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION' || !e.a[0] || !e.a[1]) return;
      var rel = ent(e.a[0]), rra = rel && (args(rel, 'REPRESENTATION_RELATIONSHIP') || args(rel, 'SHAPE_REPRESENTATION_RELATIONSHIP'));
      var pds = ent(e.a[1]), na = pds && pds.a && ent(pds.a[2]), naa = na && args(na, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE');
      if (!rra || !rra[2] || !rra[3] || !naa || !naa[3] || !naa[4]) return;
      var par = pdRep[naa[3].r], chi = pdRep[naa[4].r];
      if (par == null || chi == null) return;
      if (rra[2].r === par && rra[3].r === chi) parentFirst[e.a[0].r] = true;
    });
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      var rr = args(e, 'REPRESENTATION_RELATIONSHIP') || args(e, 'SHAPE_REPRESENTATION_RELATIONSHIP');
      if (!rr || !rr[2] || !rr[3]) return;
      var r1 = rr[2].r, r2 = rr[3].r, wt = args(e, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION');
      if (reps[r1] == null || reps[r2] == null) return;
      if (wt && wt[0]) {
        var idt = ent(wt[0]), ia = idt && args(idt, 'ITEM_DEFINED_TRANSFORMATION'), pf = !!parentFirst[id];
        // transform_item_1 lies in rep_1, transform_item_2 in rep_2: the component's item maps onto the assembly's
        var T = ia ? (pf ? tfCompose(placement(ia[2]), tfInverse(placement(ia[3]))) : tfCompose(placement(ia[3]), tfInverse(placement(ia[2])))) : tf(null);
        ups.push(pf ? { child: r2, parent: r1, T: T } : { child: r1, parent: r2, T: T });
      } else union(r1, r2);
    });
    // MAPPED_ITEM (REPRESENTATION_MAP) instancing
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      if (e.t !== 'MAPPED_ITEM') return;
      var map = ent(e.a[1]), ma = map && args(map, 'REPRESENTATION_MAP');
      if (!ma) return;
      Object.keys(reps).forEach(function (rid) {
        if (reps[rid].indexOf(+id) >= 0 && reps[ma[1].r] != null) ups.push({ child: ma[1].r, parent: +rid, T: tfCompose(placement(e.a[2]), tfInverse(placement(ma[0]))) });
      });
    });
    var upOf = {};
    ups.forEach(function (u) { var c = find(u.child); (upOf[c] = upOf[c] || []).push({ parent: find(u.parent), T: u.T }); });
    // product name per representation class (SHAPE_DEFINITION_REPRESENTATION -> PRODUCT_DEFINITION_SHAPE -> ... PRODUCT)
    var repName = {};
    Object.keys(E).forEach(function (id) {
      var e = E[id];
      if (e.t !== 'SHAPE_DEFINITION_REPRESENTATION') return;
      var pds = ent(e.a[0]), pd = pds && pds.t === 'PRODUCT_DEFINITION_SHAPE' ? ent(pds.a[2]) : null;
      var pa = pd && args(pd, 'PRODUCT_DEFINITION'), pdf = pa && ent(pa[2]);
      var pfa = pdf && (args(pdf, 'PRODUCT_DEFINITION_FORMATION') || args(pdf, 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE'));
      var prod = pfa && ent(pfa[2]);
      if (prod && prod.t === 'PRODUCT' && e.a[1] && reps[e.a[1].r] != null) repName[find(e.a[1].r)] = prod.a[1] || prod.a[0];
    });
    // every world placement of a representation class: paths up to classes with no parent
    function placements(cls, depth, seen) {
      var list = upOf[cls];
      if (!list || !list.length || depth > 32) return [tf(null)];
      var out = [];
      list.forEach(function (u) {
        if (seen[u.parent]) return;
        seen[u.parent] = true;
        placements(u.parent, depth + 1, seen).forEach(function (P) { if (out.length < 10000) out.push(tfCompose(P, u.T)); });
        delete seen[u.parent];
      });
      return out.length ? out : [tf(null)];
    }

    var solids = [];
    solidIds.forEach(function (sid) {
      var e = E[sid], shells = [];
      var a = args(e, 'MANIFOLD_SOLID_BREP') || args(e, 'FACETED_BREP');
      var bw = args(e, 'BREP_WITH_VOIDS');
      if (a) shells.push(a[1]);
      if (bw) { if (!a) shells.push(bw[1]); (bw[2] || []).forEach(function (v) { shells.push(v); }); }
      if (e.t === 'CLOSED_SHELL') shells.push({ r: sid });
      var name = (a && a[0]) || (bw && bw[0]) || '';
      // opts.trace (an array): one { face, surf, out, from, to } per face read, its triangles out.tris[from .. to) (for
      // finding which face leaves an edge open; nothing reads it here)
      var shellTris = shells.map(function (sh) {
        var out = { pos: [], tris: [], recs: [] };
        shellFaces(sh).forEach(function (fr) {
          var t0 = out.tris.length;
          faceTriangles(fr, out);
          if (opts.trace) { var tf0 = ent(fr), ta = tf0 && (args(tf0, 'ADVANCED_FACE') || args(tf0, 'FACE_SURFACE')), ts = ta && ta[2] && ent(ta[2]); opts.trace.push({ face: fr && fr.r, surf: ts ? ts.t || 'complex' : '', out: out, from: t0, to: out.tris.length }); }
        });
        return out;
      });
      // representations holding this solid
      var holders = Object.keys(reps).filter(function (rid) { return reps[rid].indexOf(sid) >= 0; }).map(function (rid) { return find(+rid); });
      if (!holders.length) holders = [null];
      var seenCls = {};
      holders.forEach(function (cls) {
        if (cls != null && seenCls[cls]) return;
        if (cls != null) seenCls[cls] = true;
        var Ts = cls != null ? placements(cls, 0, {}) : [tf(null)];
        var label = name && !/^(NONE|SOLID)?$/i.test(name) ? name : (cls != null && repName[cls]) || ('Solid' + (solids.length + 1));
        Ts.forEach(function (T, k) {
          var sol = { name: Ts.length > 1 ? label + '<' + (k + 1) + '>' : label, positions: [], triangles: [], recs: [] }, memo = [];
          shellTris.forEach(function (sh, si) {
            sh.recs.forEach(function (F) { sol.recs.push(F ? mapRecord(F, memo, function (p) { return tfPoint(T, p); }, function (d) { return tfDir(T, d); }, 1) : null); });
            var base = sol.positions.length / 3, t0 = sol.triangles.length;
            for (var q = 0; q < sh.pos.length; q += 3) { var p = tfPoint(T, [sh.pos[q], sh.pos[q + 1], sh.pos[q + 2]]); sol.positions.push(p[0], p[1], p[2]); }
            for (var t = 0; t < sh.tris.length; t++) sol.triangles.push(sh.tris[t] + base);
            // the outer shell points out, void shells in
            var v = signedVolume(sol.positions, sol.triangles.slice(t0));
            if ((si === 0 && v < 0) || (si > 0 && v > 0)) flipRange(sol.triangles, t0);
          });
          if (!sol.recs.some(Boolean)) delete sol.recs;
          if (sol.triangles.length) solids.push(sol);
        });
      });
    });
    var surfs = Object.keys(nonPlanar).filter(function (k) { return k.indexOf('curve ') !== 0; });
    var curves = Object.keys(nonPlanar).filter(function (k) { return k.indexOf('curve ') === 0; });
    function listOf(keys) { return keys.map(function (k) { return nonPlanar[k] + ' ' + k.replace(/^curve /, ''); }).join(', '); }
    if (surfs.length) throw new Error('This STEP file has curved faces (' + listOf(surfs) + (curves.length ? '; curved edges: ' + listOf(curves) : '') + '). Anvil imports planar-face and faceted B-reps, and cylinders, cones, spheres and tori bounded by circles and straight rulings; export it from the source CAD as a faceted / tessellated STEP, or as STL or 3MF.');
    if (curves.length) warnings.push('Curved edges (' + listOf(curves) + ') on planar faces were taken as straight lines.');
    if (noHeightFaces) warnings.push(noHeightFaces + ' cylinder face' + (noHeightFaces === 1 ? '' : 's') + ' with no height (bounded by one circle alone) ' + (noHeightFaces === 1 ? 'was' : 'were') + ' read as the flat disc inside the circle.');
    if (!solids.length) throw new Error('No faces could be read from the STEP solids.');
    var res = finishImport('step', opts, solids, toMM, warnings);
    res.stats.faces = faceCount;
    res.header = st.header;
    return res;
  }
  // circlePoints({ c, n, r }, p1, p2, sameSense, toMM) -> { pts, mid, full }: an EDGE_CURVE on a CIRCLE from vertex p1 to
  // p2 (counter-clockwise about n when sameSense) as p1, the circle's canonical grid points strictly between, p2. The
  // grid: Kernel.segsForRadius(r in mm) points from angle 0 at the circle's reference direction (xdirOf the
  // sign-normalised normal), so every face and edge on one circle agrees. `mid` is the arc's midpoint.
  function circlePoints(C, p1, p2, sameSense, toMM) {
    var nc = canonDir(norm(C.n)), xc = xdirOf(nc), yc = cross(nc, xc), ccw = sameSense === (dot(C.n, nc) > 0);
    function ang(p) { var v = sub(p, C.c); return Math.atan2(dot(v, yc), dot(v, xc)); }
    function at(a) { return add(C.c, scale(add(scale(xc, Math.cos(a)), scale(yc, Math.sin(a))), C.r)); }
    var N = K.segsForRadius(C.r * (toMM || 1)), step = 2 * Math.PI / N, a1 = ang(p1);
    var full = len(sub(p1, p2)) <= 1e-9 * Math.max(1, C.r), sweep = 2 * Math.PI;
    if (!full) { var a2 = ang(p2); sweep = ccw ? mod2pi(a2 - a1) : mod2pi(a1 - a2); if (sweep < 1e-12) sweep = 2 * Math.PI; }
    // (lane stepreal2: eps 1e-4 of a step, was 1e-9. A vertex that is a grid point to within rounding of the file's
    // numbers (2e-10 on a hole's rail across a bend) got the grid point beside it as well: two points 2e-10 apart on
    // every face of that edge, triangles of no area the refinement then split onto one another)
    var pts = [p1], eps = 1e-4, k;
    if (ccw) for (k = Math.floor(a1 / step + eps) + 1; k * step < a1 + sweep - eps; k++) pts.push(at(k * step));
    else for (k = Math.ceil(a1 / step - eps) - 1; k * step > a1 - sweep + eps; k--) pts.push(at(k * step));
    pts.push(p2);
    return { pts: pts, full: full, mid: at(ccw ? a1 + sweep / 2 : a1 - sweep / 2) };
  }
  // stepout-2: ellipsePoints(E, p1, p2, sameSense, toMM) -> { pts, full }: an EDGE_CURVE on an ELLIPSE from p1 to p2
  // (increasing parameter when sameSense) as p1, the points at the grid of Kernel.segsForRadius(b in mm) parameters
  // strictly between, p2. For a cylinder's oblique cut (b = r, x = the axis projected into the plane) the parameter is
  // the cylinder's angle, so the points are where the cut meets evenly spaced rulings.
  function ellipsePoints(E, p1, p2, sameSense, toMM) {
    var y = cross(E.normal, E.xdir);
    function par(p) { var v = sub(p, E.center); return Math.atan2(dot(v, y) / E.b, dot(v, E.xdir) / E.a); }
    function at(t) { return add(E.center, add(scale(E.xdir, E.a * Math.cos(t)), scale(y, E.b * Math.sin(t)))); }
    var N = K.segsForRadius(E.b * (toMM || 1)), step = 2 * Math.PI / N, t1 = par(p1);
    var full = len(sub(p1, p2)) <= 1e-9 * Math.max(1, E.a), sweep = 2 * Math.PI;
    if (!full) { var t2 = par(p2); sweep = sameSense ? mod2pi(t2 - t1) : mod2pi(t1 - t2); if (sweep < 1e-12) sweep = 2 * Math.PI; }
    var pts = [p1], eps = 1e-4, k;   // (lane stepreal2: as circlePoints)
    if (sameSense) for (k = Math.floor(t1 / step + eps) + 1; k * step < t1 + sweep - eps; k++) pts.push(at(k * step));
    else for (k = Math.ceil(t1 / step - eps) - 1; k * step > t1 - sweep + eps; k--) pts.push(at(k * step));
    pts.push(p2);
    return { pts: pts, full: full };
  }
  function dedupeRing(pts) {
    var out = [];
    pts.forEach(function (p) { var q = out[out.length - 1]; if (!q || len(sub(p, q)) > 1e-12) out.push(p); });
    while (out.length > 1 && len(sub(out[0], out[out.length - 1])) <= 1e-12) out.pop();
    return out;
  }
  function signedVolume(pos, tris) {
    var v = 0;
    for (var t = 0; t < tris.length; t += 3) {
      var a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
    }
    return v;
  }
  function flipRange(tris, from) { for (var t = from; t < tris.length; t += 3) { var x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; } }

  // triangulateFace(loops3d, outerIdx, normal, out{pos,tris}): ear clipping with hole bridges, in the plane's frame;
  // the outer loop is made counter-clockwise about `normal` and holes clockwise
  function triangulateFace(loops, outerIdx, normal, out) {
    var fr = frameFor(normal), base = out.pos.length / 3;
    var all = [], rings = [];
    loops.forEach(function (l, k) {
      var r2 = l.map(function (p) { return [dot(p, fr.u), dot(p, fr.v)]; }), A = area2(r2);
      if ((k === outerIdx) !== (A > 0)) { l = l.slice().reverse(); r2 = r2.slice().reverse(); }
      var idx = [];
      l.forEach(function (p, j) { idx.push(all.length); all.push({ p3: p, p2: r2[j] }); });
      rings.push(idx);
    });
    all.forEach(function (v) { out.pos.push(v.p3[0], v.p3[1], v.p3[2]); });
    var holes = rings.filter(function (r, k) { return k !== outerIdx; });
    var tri = earcut(all.map(function (v) { return v.p2; }), rings[outerIdx], holes);
    for (var t = 0; t < tri.length; t++) out.tris.push(tri[t] + base);
  }
  // earcut(pts2, outer: [idx], holes: [[idx]]) -> [i, j, k, …] counter-clockwise triangles
  // lane realfiles: when the clipping sticks (no ear left in a ring that is more than collinear runs: ties on the
  // axis-aligned geometry of a part with many holes bridged holes to the wrong vertices), it is run again on the points
  // turned by an angle no drawing uses; the turned run is kept when it does not stick
  function earcut(P, outer, holes) {
    var st = {}, tri = earcutOnce(P, outer, holes, st);
    if (!st.stuck) return tri;
    var c = Math.cos(0.6180339887), s = Math.sin(0.6180339887), st2 = {};
    var tri2 = earcutOnce(P.map(function (p) { return p ? [p[0] * c - p[1] * s, p[0] * s + p[1] * c] : p; }), outer, holes, st2);
    return st2.stuck ? tri : tri2;
  }
  function earcutOnce(P, outer, holes, st) {
    var ring = outer.slice();
    if (!holes.length && ring.length === 3) return ring.slice();
    var pending = holes.slice().sort(function (a, b) { return maxX(b) - maxX(a); });
    while (pending.length) {
      var h = pending.shift(), m = h[0];
      h.forEach(function (i) { if (P[i][0] > P[m][0] || (P[i][0] === P[m][0] && P[i][1] < P[m][1])) m = i; });
      // bridge to the nearest ring vertex that sees M: locally inside at that vertex, and crossing no ring edge and no
      // edge of a hole still waiting
      var M = P[m], order = ring.map(function (r, k) { return k; }).sort(function (a, b) { return dist2(P[ring[a]], M) - dist2(P[ring[b]], M); });
      var bi = order[0];
      for (var oi = 0; oi < order.length; oi++) {
        var k = order[oi], V = P[ring[k]];
        if (!locallyInside(P[ring[(k + ring.length - 1) % ring.length]], V, P[ring[(k + 1) % ring.length]], M)) continue;
        if (crossesRing(ring, V, M) || pending.some(function (ph) { return crossesRing(ph, V, M); }) || crossesRing(h, V, M)) continue;
        bi = k; break;
      }
      var hs = h.indexOf(m), hr = h.slice(hs).concat(h.slice(0, hs));
      ring = ring.slice(0, bi + 1).concat(hr, [hr[0], ring[bi]], ring.slice(bi + 1));
    }
    function crossesRing(r, A, B) {
      for (var q = 0; q < r.length; q++) if (segCross(A, B, P[r[q]], P[r[(q + 1) % r.length]])) return true;
      return false;
    }
    // lane stepreal2: an ear is first looked for that no other vertex lies in OR within a hair outside (1e-9 of the
    // ear's longest side): a run of samples on one straight side (a latitude circle in a cylinder's (angle, height),
    // the samples of an edge along a face's own parameter line) lies on the far side of an ear to within rounding, and
    // an ear cut across it left the run as a ring of no area (its points then dropped, or zero-area triangles the
    // refinement split onto one another). Only when no such ear is left does the plain rule (inside or on) apply.
    var tris = [], guard = 0, strict = true;
    while (ring.length > 3 && guard++ < 200000) {
      var n = ring.length, clipped = false;
      for (var i = 0; i < n; i++) {
        var ia = ring[(i + n - 1) % n], ib = ring[i], ic = ring[(i + 1) % n];
        var A = P[ia], B = P[ib], Cc = P[ic];
        if (cross2(A, B, Cc) <= 1e-14 * (1 + Math.abs(A[0]) + Math.abs(A[1]))) continue;
        var ok = true, lAB = 0, lBC = 0, lCA = 0;
        if (strict) { lAB = Math.sqrt(dist2(A, B)); lBC = Math.sqrt(dist2(B, Cc)); lCA = Math.sqrt(dist2(Cc, A)); var band = 1e-9 * Math.max(lAB, lBC, lCA); lAB *= band; lBC *= band; lCA *= band; }
        for (var j = 0; j < n && ok; j++) {
          var r = ring[j];
          if (r === ia || r === ib || r === ic) continue;
          var Q = P[r];
          if (same(Q, A) || same(Q, B) || same(Q, Cc)) continue;
          if (strict ? nearTri(Q, A, B, Cc, lAB, lBC, lCA) : inTri(Q, A, B, Cc)) ok = false;
        }
        if (!ok) continue;
        tris.push(ia, ib, ic);
        ring.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped && strict) { strict = false; continue; }
      strict = true;
      if (!clipped) { // degenerate leftovers (collinear runs): drop the flattest vertex
        var worst = 0, wv = Infinity;
        for (var w = 0; w < ring.length; w++) { var cv = Math.abs(cross2(P[ring[(w + ring.length - 1) % ring.length]], P[ring[w]], P[ring[(w + 1) % ring.length]])); if (cv < wv) { wv = cv; worst = w; } }
        if (st && wv > 1e-14 * (1 + Math.abs(P[ring[worst]][0]) + Math.abs(P[ring[worst]][1]))) st.stuck = true;
        // lane stepreal2: the vertex leaves as a triangle of its own (no area), so its two edges stay in the mesh. Dropped
        // without one, a run of samples along a curved edge that is straight in the face's own parameters (or nearly
        // straight in a plane) left the face with one long chord where the face beside it has every sample: open edges
        var wn = ring.length, wa = ring[(worst + wn - 1) % wn], wb = ring[worst], wc = ring[(worst + 1) % wn];
        if (wa !== wb && wb !== wc && wa !== wc) tris.push(wa, wb, wc);
        ring.splice(worst, 1);
      }
    }
    if (ring.length === 3 && (cross2(P[ring[0]], P[ring[1]], P[ring[2]]) > 0 || (ring[0] !== ring[1] && ring[1] !== ring[2] && ring[0] !== ring[2]))) tris.push(ring[0], ring[1], ring[2]);
    return tris;
    function maxX(h) { var x = -Infinity; h.forEach(function (i) { if (P[i][0] > x) x = P[i][0]; }); return x; }
  }
  function dist2(a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]); }
  // the direction a -> m leaves vertex a (ring neighbours p, n, counter-clockwise ring) into the polygon's interior
  function locallyInside(p, a, n, m) {
    return cross2(p, a, n) > 0 ? cross2(a, m, n) <= 0 && cross2(a, p, m) <= 0 : cross2(a, m, p) > 0 || cross2(a, n, m) > 0;
  }
  // proper crossing of segments ab and cd (touching at a shared end point does not count)
  function segCross(a, b, c, d) {
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
    var o1 = cross2(a, b, c), o2 = cross2(a, b, d), o3 = cross2(c, d, a), o4 = cross2(c, d, b);
    return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
  }
  function cross2(a, b, c) { return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); }
  function same(a, b) { return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12; }
  function inTri(p, a, b, c) {
    var d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    var d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    var d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    return d1 >= 0 && d2 >= 0 && d3 >= 0;
  }
  // p inside the triangle a, b, c (counter-clockwise), on it, or within a band outside it (e1, e2, e3: the band's
  // width times the length of side ab, bc, ca)
  function nearTri(p, a, b, c, e1, e2, e3) {
    var d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    var d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    var d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    return d1 >= -e1 && d2 >= -e2 && d3 >= -e3;
  }
  function isReflex(ring, k, P) { var n = ring.length; return cross2(P[ring[(k + n - 1) % n]], P[ring[k]], P[ring[(k + 1) % n]]) <= 0; }

  // ------------------------------------------------------------------ STL import
  function importSTL(data, opts) {
    opts = opts || {};
    var bytes = typeof data === 'string' ? null : toBytes(data), text = typeof data === 'string' ? data : null;
    var solids = [], warnings = [];
    var binary = false;
    if (bytes && bytes.length >= 84) {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), nt = dv.getUint32(80, true);
      if (84 + nt * 50 === bytes.length) binary = true;
    }
    if (binary) {
      var name = fromUtf8(bytes.subarray(0, 80)).replace(/\0[\s\S]*$/, '').replace(/^solid\s*/i, '').trim();
      var tri = [];
      for (var i = 0; i < nt; i++) {
        var o = 84 + i * 50 + 12;
        for (var k = 0; k < 9; k++) tri.push(dv.getFloat32(o + k * 4, true));
      }
      solids.push({ name: name || null, soup: tri });
    } else {
      if (!text) text = fromUtf8(bytes);
      if (!/facet/i.test(text)) throw new Error('Not an STL file (no facets).');
      var cur = null, re = /(solid)[ \t]*([^\r\n]*)|(vertex)\s+(\S+)\s+(\S+)\s+(\S+)|(endsolid)/gi, m;
      while ((m = re.exec(text))) {
        if (m[1]) { cur = { name: m[2].trim() || null, soup: [] }; solids.push(cur); }
        else if (m[3]) { if (!cur) { cur = { name: null, soup: [] }; solids.push(cur); } cur.soup.push(+m[4], +m[5], +m[6]); }
        else if (m[7]) cur = null;
      }
    }
    var out = [];
    solids.forEach(function (s) {
      if (s.soup.length < 9) return;
      var welded = weldSoup(s.soup);
      splitComponents(welded.positions, welded.triangles).forEach(function (c, i, all) {
        out.push({ name: (s.name || opts.baseName || 'STL') + (all.length > 1 ? '-' + (i + 1) : ''), positions: c.positions, triangles: c.triangles });
      });
    });
    if (!out.length) throw new Error('The STL file has no triangles.');
    return finishImport('stl', opts, out, 1, warnings);
  }
  // recs (optional): one record per soup triangle, kept for the triangles that survive (result.recs)
  function weldSoup(soup, recs) {
    var pos = [], tris = [], map = {}, keep = recs ? [] : null;
    for (var i = 0; i < soup.length; i += 3) {
      var k = wkey(soup[i], soup[i + 1], soup[i + 2]), v = map[k];
      if (v == null) { v = map[k] = pos.length / 3; pos.push(soup[i], soup[i + 1], soup[i + 2]); }
      tris.push(v);
    }
    var clean = [];
    for (var t = 0; t < tris.length; t += 3) if (tris[t] !== tris[t + 1] && tris[t + 1] !== tris[t + 2] && tris[t] !== tris[t + 2]) { clean.push(tris[t], tris[t + 1], tris[t + 2]); if (keep) keep.push(recs[t / 3]); }
    var res = { positions: pos, triangles: clean };
    if (keep) res.recs = keep;
    return res;
  }
  // connected components of a triangle mesh (by shared vertices); a component with negative volume whose box sits
  // inside another component's box is a void of that one and stays with it
  function splitComponents(pos, tris) {
    var nv = pos.length / 3, par = new Int32Array(nv);
    for (var i = 0; i < nv; i++) par[i] = i;
    function f(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    for (var t = 0; t < tris.length; t += 3) { var a = f(tris[t]), b = f(tris[t + 1]), c = f(tris[t + 2]); par[a] = b; par[f(c)] = f(b); }
    var groups = {}, order = [];
    for (t = 0; t < tris.length; t += 3) { var r = f(tris[t]); if (!groups[r]) { groups[r] = []; order.push(r); } groups[r].push(tris[t], tris[t + 1], tris[t + 2]); }
    var comps = order.map(function (r) {
      var map = {}, p = [], tr = [];
      groups[r].forEach(function (v) { if (map[v] == null) { map[v] = p.length / 3; p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } tr.push(map[v]); });
      return { positions: p, triangles: tr, volume: signedVolume(p, tr), box: boxOf(p) };
    });
    if (comps.length < 2) return comps;
    var outer = comps.filter(function (c) { return c.volume >= 0; }), voids = comps.filter(function (c) { return c.volume < 0; });
    voids.forEach(function (v) {
      var host = null;
      outer.forEach(function (o) { if (boxInside(v.box, o.box) && (!host || o.volume < host.volume)) host = o; });
      if (!host) { outer.push(v); return; }
      var base = host.positions.length / 3;
      host.positions = host.positions.concat(v.positions);
      host.triangles = host.triangles.concat(v.triangles.map(function (x) { return x + base; }));
    });
    return comps.filter(function (c) { return outer.indexOf(c) >= 0; });
  }
  function boxOf(p) { var b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; for (var i = 0; i < p.length; i += 3) for (var a = 0; a < 3; a++) { if (p[i + a] < b.min[a]) b.min[a] = p[i + a]; if (p[i + a] > b.max[a]) b.max[a] = p[i + a]; } return b; }
  function boxInside(a, b) { for (var i = 0; i < 3; i++) if (a.min[i] < b.min[i] - 1e-9 || a.max[i] > b.max[i] + 1e-9) return false; return true; }

  // ------------------------------------------------------------------ OBJ import
  function importOBJ(text, opts) {
    opts = opts || {};
    text = typeof text === 'string' ? text : fromUtf8(toBytes(text));
    var v = [], groups = [], cur = null, hasObjects = /^o\s/m.test(text);
    function group(name) { cur = { name: name, faces: [] }; groups.push(cur); }
    text.split(/\r?\n/).forEach(function (line) {
      line = line.replace(/#.*$/, '').trim();
      if (!line) return;
      var parts = line.split(/\s+/), k = parts[0];
      if (k === 'v') v.push([+parts[1], +parts[2], +parts[3]]);
      else if (k === 'o' || (k === 'g' && !hasObjects)) group(parts.slice(1).join(' ') || null);
      else if (k === 'f') {
        if (!cur) group(null);
        var idx = parts.slice(1).map(function (s) { var n = parseInt(s.split('/')[0], 10); return n < 0 ? v.length + n : n - 1; });
        cur.faces.push(idx);
      }
    });
    var solids = [], warnings = [];
    groups.forEach(function (g) {
      if (!g.faces.length) return;
      var soup = [];
      g.faces.forEach(function (f) {
        var pts = f.map(function (i) { return v[i]; });
        if (pts.some(function (p) { return !p; })) return;
        if (pts.length === 3) { soup.push.apply(soup, pts[0].concat(pts[1], pts[2])); return; }
        var o = { pos: [], tris: [] };
        triangulateFace([pts], 0, norm(newellOf(pts)), o);
        for (var t = 0; t < o.tris.length; t++) { var q = o.tris[t] * 3; soup.push(o.pos[q], o.pos[q + 1], o.pos[q + 2]); }
      });
      if (soup.length < 9) return;
      var w = weldSoup(soup);
      var comps = g.name ? [w] : splitComponents(w.positions, w.triangles);
      comps.forEach(function (c, i) { solids.push({ name: (g.name || opts.baseName || 'OBJ') + (comps.length > 1 ? '-' + (i + 1) : ''), positions: c.positions, triangles: c.triangles }); });
    });
    if (!solids.length) throw new Error('The OBJ file has no faces.');
    return finishImport('obj', opts, solids, 1, warnings);
  }
  function newellOf(pts) {
    var n = [0, 0, 0];
    for (var k = 0; k < pts.length; k++) {
      var a = pts[k], b = pts[(k + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }

  // ------------------------------------------------------------------ surface records of imported solids
  // mapRecord(F, memo, point, dir, lengthScale) -> a copy of the facet record F = { s, P?, Q? } with its surface's
  // axis point and direction mapped and lengths scaled; one copy per record and per surface (memo), so the facets of
  // one face still share their surface.
  function mapRecord(F, memo, pointFn, dirFn, ls) {
    for (var i = 0; i < memo.length; i++) if (memo[i][0] === F) return memo[i][1];
    var S = F.s, S2 = null;
    for (var j = 0; j < memo.length; j++) if (memo[j][0] === S) S2 = memo[j][1];
    if (!S2) {
      S2 = { t: S.t, o: pointFn(S.o), d: norm(dirFn(S.d)), r: S.r * ls };
      if (S.k != null) S2.k = S.k;
      if (S.R != null) S2.R = S.R * ls;
      memo.push([S, S2]);
    }
    var F2 = { s: S2 };
    if (F.P) { F2.P = [F.P[0] * ls, F.P[1] * ls]; F2.Q = [F.Q[0] * ls, F.Q[1] * ls]; }
    if (F.g) F2.g = 1;
    memo.push([F, F2]);
    return F2;
  }
  // curvesOf(triSurf) -> { surfs: [S], recs: [{ s: surface index, P?, Q? }], tri: [0 | record index + 1 per triangle] }:
  // the compact form an imported solid (and the Imported feature) keeps its triangles' surface records in
  function curvesOf(triSurf) {
    var surfs = [], recs = [], recObjs = [], tri = [], last = null, lastI = 0;
    triSurf.forEach(function (F) {
      if (!F) { tri.push(0); return; }
      if (F !== last) {
        last = F; lastI = recObjs.indexOf(F);
        if (lastI < 0) {
          var si = surfs.indexOf(F.s);
          if (si < 0) { si = surfs.length; surfs.push(F.s); }
          var r = { s: si };
          if (F.P) { r.P = F.P.slice(); r.Q = F.Q.slice(); }
          if (F.g) r.g = 1;
          lastI = recObjs.length; recObjs.push(F); recs.push(r);
        }
      }
      tri.push(lastI + 1);
    });
    return { surfs: surfs.map(function (S) { var o = { t: S.t, o: S.o.slice(), d: S.d.slice(), r: S.r }; if (S.k != null) o.k = S.k; if (S.R != null) o.R = S.R; return o; }), recs: recs, tri: tri };
  }
  // curveRecords(curves) -> per-triangle facet records (null for planar triangles), sharing one object per record and
  // surface, as kernel.js expects
  function curveRecords(curves) {
    if (!curves || !curves.surfs) return null;
    var surfs = curves.surfs.map(function (S) { var o = { t: S.t, o: S.o.map(Number), d: S.d.map(Number), r: +S.r }; if (S.k != null) o.k = +S.k; if (S.R != null) o.R = +S.R; return o; });
    var recs = (curves.recs || []).map(function (r) { var F = { s: surfs[r.s] }; if (r.P) { F.P = r.P.map(Number); F.Q = r.Q.map(Number); } if (r.g) F.g = 1; return F; });
    return decodeU32(curves.tri || []).map(function (k) { return k > 0 ? recs[k - 1] || null : null; });
  }

  // ------------------------------------------------------------------ common import finish
  // Scale to the target units, weld, split T-junctions (a mesh exported from a CSG modeller usually has them), orient
  // each solid outward, and report open edges.
  function finishImport(format, opts, solids, toMM, warnings) {
    // target units: the model's ('mm' / 'in'); 'auto' keeps a STEP / 3MF file's own inches, else millimetres
    var units = opts.units === 'in' ? 'in' : opts.units === 'auto' && (format === 'step' || format === '3mf') && Math.abs((toMM || 1) - 25.4) < 1e-9 ? 'in' : 'mm';
    var target = units === 'in' ? 25.4 : 1, s = (toMM || 1) / target;
    if (format !== 'step' && format !== '3mf') s = (opts.sourceUnits === 'in' ? 25.4 : opts.sourceUnits === 'cm' ? 10 : opts.sourceUnits === 'm' ? 1000 : 1) / target;
    var out = [], tris = 0, open = 0, names = {};
    solids.forEach(function (sol, i) {
      var pos = sol.positions.map(function (x) { return x * s; });
      // mesh formats carry float32 (STL) or short decimals: T-junctions are found within 1e-6 of the part's size
      var bx = boxOf(pos), ext = Math.max(bx.max[0] - bx.min[0], bx.max[1] - bx.min[1], bx.max[2] - bx.min[2]) || 1;
      var tol = format === 'step' ? 1e-6 : Math.max(1e-6, ext * 1e-6);
      var polys = [], memo = [];
      var recs = sol.recs ? sol.recs.map(function (F) { return F ? mapRecord(F, memo, function (p) { return scale(p, s); }, function (d) { return d; }, s) : null; }) : null;
      var w = weldSoup(expand(pos, sol.triangles), recs);
      // lane stepreal2: two triangles on the same three vertices, wound opposite ways, are a fold of no volume (two
      // faces meeting in a cusp each cut the same sliver off their shared boundary): both go, their edges cancel
      var twin = {}, dead = null;
      for (var tw = 0; tw < w.triangles.length; tw += 3) {
        var ta = w.triangles[tw], tb = w.triangles[tw + 1], tc = w.triangles[tw + 2], lo3 = Math.min(ta, tb, tc);
        var s3 = lo3 === ta ? tb : lo3 === tb ? tc : ta, u3 = lo3 === ta ? tc : lo3 === tb ? ta : tb, rk = lo3 + ',' + u3 + ',' + s3;
        if (twin[rk] != null) { (dead = dead || {})[tw] = true; dead[twin[rk]] = true; delete twin[rk]; } else twin[lo3 + ',' + s3 + ',' + u3] = tw;
      }
      for (var t = 0; t < w.triangles.length; t += 3) {
        if (dead && dead[t]) continue;
        var a = w.triangles[t], b = w.triangles[t + 1], c = w.triangles[t + 2];
        var pa = [w.positions[a * 3], w.positions[a * 3 + 1], w.positions[a * 3 + 2]], pb = [w.positions[b * 3], w.positions[b * 3 + 1], w.positions[b * 3 + 2]], pc = [w.positions[c * 3], w.positions[c * 3 + 1], w.positions[c * 3 + 2]];
        var nn = cross(sub(pb, pa), sub(pc, pa)), l = len(nn);
        if (l < 1e-14) continue;
        nn = scale(nn, 1 / l);
        var poly = { idx: [a, b, c], n: nn, w: dot(nn, pa) };
        if (w.recs && w.recs[t / 3]) poly.srf = w.recs[t / 3];
        polys.push(poly);
      }
      splitTJunctions(w.positions, polys, tol);
      var m = fanPolygons(w.positions, polys);
      var compact = compactMesh(m.positions, m.triangles);
      if (signedVolume(compact.positions, compact.triangles) < 0) flipRange(compact.triangles, 0);
      var nm = String(sol.name || (format.toUpperCase() + (i + 1)));
      if (names[nm]) { var k = 2; while (names[nm + '-' + k]) k++; nm = nm + '-' + k; }
      names[nm] = true;
      tris += compact.triangles.length / 3;
      open += m.openEdges;
      var solid = { name: nm, positions: compact.positions.map(function (x) { return Math.round(x * 1e9) / 1e9; }), triangles: compact.triangles };
      if (m.triSurf) solid.curves = curvesOf(m.triSurf);
      out.push(solid);
    });
    if (open) warnings.push(open + ' open edge' + (open === 1 ? '' : 's') + ': the mesh is not closed, so cuts and bosses against it may fail.');
    return { format: format, units: units, solids: out, warnings: warnings, stats: { solids: out.length, triangles: tris, openEdges: open } };
  }
  function expand(pos, tris) { var soup = []; for (var t = 0; t < tris.length; t++) { var q = tris[t] * 3; soup.push(pos[q], pos[q + 1], pos[q + 2]); } return soup; }
  function compactMesh(pos, tris) {
    var map = {}, p = [], t = [];
    tris.forEach(function (v) { if (map[v] == null) { map[v] = p.length / 3; p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } t.push(map[v]); });
    return { positions: p, triangles: t };
  }

  // importFile(fileName, data, opts?) -> import result; data is text or bytes (ArrayBuffer / Uint8Array)
  function formatOf(fileName, data) {
    var ext = (/\.([a-z0-9]+)$/i.exec(String(fileName || '')) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (ext === 'stp' || ext === 'step' || ext === 'p21') return 'step';
    if (ext === 'igs' || ext === 'iges') return 'iges';
    if (ext === 'stl' || ext === 'obj' || ext === '3mf') return ext;
    if (typeof data === 'string') {
      if (/^\s*ISO-10303-21/.test(data)) return 'step';
      if (/^\s*solid\b/.test(data) && /facet/.test(data)) return 'stl';
      if (/^\s*(v|o|g|f|#)\s/m.test(data)) return 'obj';
    } else if (data) {
      var b = toBytes(data);
      if (b[0] === 0x50 && b[1] === 0x4B) return '3mf';
      var head = fromUtf8(b.subarray(0, Math.min(b.length, 80)));
      if (/^\s*ISO-10303-21/.test(head)) return 'step';
      return 'stl';
    }
    return null;
  }
  function importFile(fileName, data, opts) {
    opts = opts || {};
    var fmt = opts.format || formatOf(fileName, data);
    var base = String(fileName || 'Imported').replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '');
    var o = { units: opts.units, sourceUnits: opts.sourceUnits, baseName: base };
    var res;
    if (fmt === 'step') res = importSTEP(typeof data === 'string' ? data : fromUtf8(toBytes(data)), o);
    else if (fmt === 'stl') res = importSTL(data, o);
    else if (fmt === 'obj') res = importOBJ(data, o);
    else if (fmt === '3mf') res = import3MF(data, o);
    else if (fmt === 'iges') throw new Error('IGES files are read by OpenCascade (Tools ▸ OpenCascade kernel; vendor/get-occt.ps1).');
    else throw new Error('Unknown file type "' + fileName + '". Anvil opens .step / .stp, .stl, .obj and .3mf (.igs with OpenCascade).');
    res.name = base;
    res.file = String(fileName || '').replace(/^.*[\\\/]/, '');
    return res;
  }

  // ------------------------------------------------------------------ the imported feature
  // Feature JSON:  { type: 'import', name: 'Imported1', file, format, units, merge?, solids: [{ name, vertices, triangles }] }
  // `vertices` / `triangles` are base64 of little-endian Float64 / Uint32 arrays: compact, exact, and cheap for the
  // rebuild's feature keys (a string is stringified and copied, never walked). Plain arrays are accepted everywhere
  // and encoded on the way in. Each solid becomes its own body; `merge: true` unions them into the bodies they touch.
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64encode(bytes) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) { var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]; }
    var r = bytes.length - i;
    if (r === 1) { var a = bytes[i] << 16; out += B64[a >> 18 & 63] + B64[a >> 12 & 63] + '=='; }
    else if (r === 2) { var b = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[b >> 18 & 63] + B64[b >> 12 & 63] + B64[b >> 6 & 63] + '='; }
    return out;
  }
  var B64R = null;
  function b64decode(s) {
    if (!B64R) { B64R = {}; for (var k = 0; k < 64; k++) B64R[B64[k]] = k; }
    s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
    var out = new Uint8Array(Math.floor(s.length * 3 / 4)), o = 0;
    for (var i = 0; i < s.length; i += 4) {
      var n = (B64R[s[i]] << 18) | (B64R[s[i + 1]] << 12) | ((B64R[s[i + 2]] || 0) << 6) | (B64R[s[i + 3]] || 0);
      out[o++] = n >> 16 & 255;
      if (i + 2 < s.length) out[o++] = n >> 8 & 255;
      if (i + 3 < s.length) out[o++] = n & 255;
    }
    return out.subarray(0, o);
  }
  function encodeF64(a) { var f = new Float64Array(a.length); for (var i = 0; i < a.length; i++) f[i] = +a[i]; return b64encode(new Uint8Array(littleEndian(f.buffer, 8))); }
  function encodeU32(a) { var u = new Uint32Array(a.length); for (var i = 0; i < a.length; i++) u[i] = a[i]; return b64encode(new Uint8Array(littleEndian(u.buffer, 4))); }
  var LE = (function () { var b = new Uint8Array(new Uint16Array([1]).buffer); return b[0] === 1; })();
  function littleEndian(buf, size) { // byte-swap in place on big-endian hosts
    if (LE) return buf;
    var b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i += size) for (var j = 0; j < size / 2; j++) { var t = b[i + j]; b[i + j] = b[i + size - 1 - j]; b[i + size - 1 - j] = t; }
    return buf;
  }
  function decodeF64(s) { if (Array.isArray(s)) return s.map(Number); var b = b64decode(s), c = new Uint8Array(b.length); c.set(b); littleEndian(c.buffer, 8); return Array.prototype.slice.call(new Float64Array(c.buffer)); }
  function decodeU32(s) { if (Array.isArray(s)) return s.map(function (x) { return x | 0; }); var b = b64decode(s), c = new Uint8Array(b.length); c.set(b); littleEndian(c.buffer, 4); return Array.prototype.slice.call(new Uint32Array(c.buffer)); }

  // encodeSolids(list) -> the feature's `solids` (arrays or already-encoded strings accepted)
  function encodeSolids(list) {
    return (list || []).map(function (s, i) {
      var v = s.vertices != null ? s.vertices : s.positions, t = s.triangles;
      var out = { name: String(s.name || 'Body' + (i + 1)), vertices: typeof v === 'string' ? v : encodeF64(v || []), triangles: typeof t === 'string' ? t : encodeU32(t || []) };
      // the triangles' analytic surface records (curved faces of a STEP file): { surfs, recs, tri (base64 U32) }
      if (s.curves && s.curves.surfs) out.curves = { surfs: s.curves.surfs, recs: s.curves.recs || [], tri: typeof s.curves.tri === 'string' ? s.curves.tri : encodeU32(s.curves.tri || []) };
      return out;
    });
  }
  // solidMesh(featureSolid) -> { positions, triangles } (decoded)
  function solidMesh(s) { return { positions: decodeF64(s.vertices != null ? s.vertices : s.positions || []), triangles: decodeU32(s.triangles || []) }; }

  // solidCSG(featureSolid) -> CSG of its triangles, outward (flipped when the signed volume is negative)
  var csgCache = [];
  function solidCSG(s) {
    var key = (typeof s.vertices === 'string' ? s.vertices : JSON.stringify(s.vertices || s.positions)) + '|' + (typeof s.triangles === 'string' ? s.triangles : JSON.stringify(s.triangles)) + (s.curves ? '|' + JSON.stringify(s.curves) : '');
    for (var c = 0; c < csgCache.length; c++) if (csgCache[c].key === key) return csgCache[c].csg.clone();
    var m = solidMesh(s), p = m.positions, t = m.triangles, flip = signedVolume(p, t) < 0, polys = [], recs = curveRecords(s.curves);
    for (var i = 0; i + 2 < t.length; i += 3) {
      var ids = flip ? [t[i], t[i + 2], t[i + 1]] : [t[i], t[i + 1], t[i + 2]];
      var vs = ids.map(function (k) { return new CSG.Vertex(new CSG.Vector(p[k * 3], p[k * 3 + 1], p[k * 3 + 2])); });
      var poly = CSG.Polygon.tryCreate ? CSG.Polygon.tryCreate(vs, null) : new CSG.Polygon(vs);
      if (poly) { if (recs && recs[i / 3]) poly.surf = recs[i / 3]; polys.push(poly); }
    }
    var csg = CSG.fromPolygons(polys);
    csgCache.unshift({ key: key, csg: csg });
    if (csgCache.length > 6) csgCache.pop();
    return csg.clone();
  }

  // importFeature(model, result, opts?) -> a new `import` feature (not yet added), named Imported<n>
  function importedName(model) {
    var max = 0;
    (model.features || []).forEach(function (f) { var m = /^Imported(\d+)$/.exec(f.name || ''); if (m && +m[1] > max) max = +m[1]; });
    return 'Imported' + (max + 1);
  }
  function importFeature(model, result, opts) {
    opts = opts || {};
    var f = { type: 'import', name: opts.name || importedName(model), file: result.file || '', format: result.format || '', units: result.units || 'mm', solids: encodeSolids(result.solids) };
    if (opts.merge) f.merge = true;
    // read through OpenCascade (ui-occt.js importFile): the source file itself, so OpenCascade rebuilds it exactly
    if (result.brep) f.brep = { format: result.brep.format, text: result.brep.text };
    return f;
  }
  // newPartFromImport(result) -> a new part model whose only feature is Imported1 (File ▸ Open of a STEP / STL / OBJ)
  function newPartFromImport(result, opts) {
    var m = K.newModel(result.name || 'Imported');
    m.units = result.units === 'in' ? 'in' : 'mm';
    var f = importFeature(m, result, opts);
    f.id = m.nextId++;
    m.features.push(f);
    return m;
  }

  // ------------------------------------------------------------------ kernel hook
  // An `import` feature is registered with Kernel.registerFeature as an `apply` feature: rebuild hands it the body list
  // at its place in the tree and it adds the imported solids (as new bodies, or unioned into the bodies they touch when
  // `merge` is set). Every later feature (sketches on its faces, cuts, bosses, patterns) then builds against the
  // imported bodies with the kernel's own code, and the rebuild cache and worker builds need nothing special.
  function applyImport(f, state) {
    var bodies = state.bodies, bf = state.bodyFeatures;
    var solids = (f.solids || []).map(solidCSG).filter(function (c) { return c.polygons.length; });
    if (!solids.length) throw new Error('The imported file has no solid geometry.');
    var tool = null;
    solids.forEach(function (c) {
      tool = tool ? CSG.fromPolygons(tool.polygons.concat(c.clone().polygons)) : c.clone();
      if (f.merge) {
        var cb = c.getBounds ? c.getBounds() : null, hit = -1;
        if (cb) bodies.forEach(function (b, i) { var bb = b.getBounds && b.getBounds(); if (hit < 0 && bb && boxesMeet(bb, cb)) hit = i; });
        if (hit >= 0) { bodies[hit] = bodies[hit].union(c); return; }
      }
      bodies.push(c);
      bf.push(f.id);
    });
    return { bodies: bodies, bodyFeatures: bf, tool: tool };
  }
  function boxesMeet(a, b) {
    var amin = a.min || a[0], amax = a.max || a[1], bmin = b.min || b[0], bmax = b.max || b[1];
    if (!amin || !bmin) return true;
    function g(v, k) { return v[k] != null ? v[k] : v[['x', 'y', 'z'][k]]; }
    for (var k = 0; k < 3; k++) if (g(amin, k) > g(bmax, k) + 1e-6 || g(bmin, k) > g(amax, k) + 1e-6) return false;
    return true;
  }
  // script: `var f7 = p.importMesh({ name, file, format, units, solids });` in the feature's place
  function importScript(f, v) {
    var spec = { name: f.name, file: f.file || '', format: f.format || '', units: f.units || 'mm', solids: f.solids };
    if (f.merge) spec.merge = true;
    return 'var ' + v + ' = p.importMesh(' + JSON.stringify(spec) + ');';
  }
  function installKernelHook() {
    if (K.Builder.prototype.importMesh) return;
    K.registerFeature('import', { apply: applyImport, script: importScript });
    // p.importMesh({ name?, file?, format?, units?, merge?, solids: [{ name, positions | vertices, triangles }] }) -> id
    K.Builder.prototype.importMesh = function (spec) {
      spec = spec || {};
      var f = { type: 'import', name: spec.name || importedName(this.model), file: String(spec.file || ''), format: String(spec.format || ''), units: spec.units === 'in' ? 'in' : 'mm', solids: encodeSolids(spec.solids) };
      if (spec.merge) f.merge = true;
      return this._add(f).id;
    };
  }
  installKernelHook();

  // summary of an import feature for the UI: solids, triangles
  function featureInfo(f) {
    var tris = 0;
    (f.solids || []).forEach(function (s) { tris += typeof s.triangles === 'string' ? Math.floor(b64decode(s.triangles).length / 12) : (s.triangles || []).length / 3; });
    return { solids: (f.solids || []).length, triangles: tris, file: f.file || '', format: f.format || '' };
  }

  return {
    VERSION: VERSION,
    bodyMesh: bodyMesh, docParts: docParts, meshBounds: meshBounds,
    exportOBJ: exportOBJ, exportMTL: exportMTL, export3MF: export3MF, exportSTEP: exportSTEP,
    parseStep: parseStep, importSTEP: importSTEP, importSTL: importSTL, importOBJ: importOBJ, import3MF: import3MF,
    importFile: importFile, finishImport: finishImport, formatOf: formatOf, zip: zip, unzip: unzip, crc32: crc32,
    importFeature: importFeature, newPartFromImport: newPartFromImport, importedName: importedName, featureInfo: featureInfo,
    encodeSolids: encodeSolids, solidMesh: solidMesh, solidCSG: solidCSG, signedVolume: signedVolume, earcut: earcut,
    b64encode: b64encode, b64decode: b64decode, utf8: utf8, fromUtf8: fromUtf8,
    surfaceGridKind: bsSurfClassify,   // lane stepin2: occt-kernel.js importCylRecord (B-spline faces that are cylinders)
    FORMATS: [
      { id: 'step', label: 'STEP AP214 (*.step;*.stp)', ext: 'step', import: true, export: true },
      { id: '3mf', label: '3D Manufacturing Format (*.3mf)', ext: '3mf', import: true, export: true },
      { id: 'obj', label: 'OBJ (*.obj)', ext: 'obj', import: true, export: true },
      { id: 'stl', label: 'STL (*.stl)', ext: 'stl', import: true, export: true }
    ]
  };
})();
