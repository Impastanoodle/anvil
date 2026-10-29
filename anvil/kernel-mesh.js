// kernel-mesh.js — Anvil kernel, meshing: `meshFromBody`, mesh quality, face outlines (for DXF of flat faces) and body
// edges (for display, picking, chamfer / fillet; `buildEdgeFeature`). Loaded after kernel.js, kernel-sketch.js and
// kernel-curves.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, arr = _.arr, cross = _.cross, dot = _.dot, ensureOutward = _.ensureOutward, len = _.len, norm = _.norm, planeFromFace = _.planeFromFace, poly = _.poly, pushPoly = _.pushPoly, scale = _.scale, sub = _.sub, to2D = _.to2D, to3D = _.to3D, triangulate = _.triangulate;   // kernel.js
  var TESS = _.TESS, segsForRadius = _.segsForRadius, signedArea = _.signedArea;   // kernel-sketch.js
  var rotatePoint = _.rotatePoint, unionAll = _.unionAll;   // kernel-curves.js

  // ------------------------------------------------------------------ meshing
  // r16/planeclust: coplanar polygons are clustered by tolerance, not by a rounded key. The old key rounded the offset
  // to 0.01 units, so a face whose offset sat on a rounding boundary (0.075 in, 0.005, 0.015: the top of a 14 ga
  // sheet) split in two when its polygons carried noise of 1e-12. Normals within PLANE_COS (1e-3 rad, the old key's
  // resolution) and offsets within planeTol(diag) = max(2e-5, 1e-5 × the body's bounding diagonal) are one plane:
  // above the CSG's absolute 1e-5 coplanar epsilon and Float32 noise of imported meshes, far below any sheet or
  // feature thickness. The first plane of a cluster is its plane.
  var PLANE_COS = Math.cos(1e-3);
  function planeTol(diag) { return Math.max(2e-5, 1e-5 * (diag || 0)); }
  function bodyDiag(polys) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    polys.forEach(function (p) {
      p.vertices.forEach(function (v) {
        var q = v.pos;
        if (q.x < lo[0]) lo[0] = q.x; if (q.y < lo[1]) lo[1] = q.y; if (q.z < lo[2]) lo[2] = q.z;
        if (q.x > hi[0]) hi[0] = q.x; if (q.y > hi[1]) hi[1] = q.y; if (q.z > hi[2]) hi[2] = q.z;
      });
    });
    return lo[0] <= hi[0] ? len(sub(hi, lo)) : 0;
  }
  // planeClusters(tol) -> { find(plane, tag), add(plane, tag, value) }: find returns the cluster ({ plane, value })
  // with the same tag whose normal is within PLANE_COS and offset within tol of the plane, or null. Offsets are
  // bucketed by tol, so a lookup scans three buckets.
  function planeClusters(tol) {
    var buckets = {};
    function find(pl, tag) {
      var b = Math.floor(pl.w / tol), n = pl.normal;
      for (var d = -1; d <= 1; d++) {
        var list = buckets[tag + '#' + (b + d)];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var c = list[i], cn = c.plane.normal;
          if (Math.abs(c.plane.w - pl.w) <= tol && n.x * cn.x + n.y * cn.y + n.z * cn.z >= PLANE_COS) return c;
        }
      }
      return null;
    }
    function add(pl, tag, value) {
      var k = tag + '#' + Math.floor(pl.w / tol), c = { plane: pl, value: value };
      (buckets[k] || (buckets[k] = [])).push(c);
      return c;
    }
    return { find: find, add: add };
  }

  // -> { positions, normals, faces:[{normal,w,start,count,centroid,area,body}], triCount, polygons }
  // Coplanar polygons make one face, but only within one body: the body tag (polygon.body, from combineBodies; 0 when
  // untagged) is part of the grouping key, and each face records it as `face.body`. r10/asmfaces10: so is the
  // assembly part tag (polygon.part, assembly.js), so coplanar faces of two parts in a sub-assembly stay apart (`face.part`).
  function meshFromBody(body) {
    if (!body) return { positions: new Float32Array(0), normals: new Float32Array(0), faces: [], triCount: 0 };
    var clusters = planeClusters(planeTol(bodyDiag(body.polygons))), order = [];
    body.polygons.forEach(function (p) {
      var bi = p.body || 0, tag = bi + (p.face != null ? '|f' + p.face : '') + (p.part != null ? '|p' + p.part : '') + (p.surf && p.surf.s && p.surf.s.w != null ? '|w' + p.surf.s.w : '');   // OpenCascade faces / assembly parts stay apart
      var c = clusters.find(p.plane, tag);
      if (!c) { c = clusters.add(p.plane, tag, { polys: [], plane: p.plane, body: bi, part: p.part }); order.push(c.value); }
      c.value.polys.push(p);
    });
    var tris = [];
    var faces = [];
    order.forEach(function (g) {
      var start = tris.length / 9, cx = 0, cy = 0, cz = 0, cnt = 0, area = 0;
      g.polys.forEach(function (p) {
        var vs = p.vertices;
        for (var j = 1; j + 1 < vs.length; j++) {
          var a = vs[0].pos, b = vs[j].pos, c = vs[j + 1].pos;
          tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
          area += b.minus(a).cross(c.minus(a)).length() / 2;
        }
        vs.forEach(function (v) { cx += v.pos.x; cy += v.pos.y; cz += v.pos.z; cnt++; });
      });
      var count = tris.length / 9 - start;
      var face = {
        normal: [g.plane.normal.x, g.plane.normal.y, g.plane.normal.z], w: g.plane.w,
        start: start, count: count, centroid: [cx / cnt, cy / cnt, cz / cnt], area: area, polys: g.polys, body: g.body
      };
      if (g.part != null) face.part = g.part;
      faces.push(face);
    });
    var positions = new Float32Array(tris);
    var normals = new Float32Array(tris.length);
    faces.forEach(function (f) {
      for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) {
        normals[i] = f.normal[0]; normals[i + 1] = f.normal[1]; normals[i + 2] = f.normal[2];
      }
    });
    // positions64 keeps full precision for mass properties; positions (Float32) is what the renderer uploads
    var mesh = { positions: positions, positions64: new Float64Array(tris), normals: normals, faces: faces, triCount: tris.length / 9 };
    if (body.exact) mesh.exact = body.exact;   // a solid from OpenCascade knows its exact mass properties (occt-kernel.js toBuild)
    return mesh;
  }

  // ------------------------------------------------------------------ mesh quality
  // meshQuality(mesh, opts?) -> { triangles, vertices, minAngle, needles, slivers, openEdges, nonManifoldEdges,
  //   tJunctions, closed, diag, tol }
  // Works on the rendered triangles (positions64). Vertices closer than tol = opts.tol (default 1e-9 × the bounding
  // diagonal) are welded. Every directed triangle edge must be cancelled by an opposite edge: first exactly (the same
  // two welded vertices), then, for what is left, by antiparallel collinear edges within tol (T-junctions: a long edge
  // on one side, several short ones on the other), subtracting the overlapping parameter ranges. What remains longer
  // than tol is an open edge (a crack as narrow as ~10 tol is found; the drawing's edge matcher pairs lines on a
  // 1e-3 grid and would not see it). An edge used more than once in the same direction, or by more than two
  // triangles, is non-manifold. slivers: triangles whose height over their longest edge is under tol (collinear);
  // needles: triangles with a corner under opts.needleDeg (default 1°); minAngle in degrees over non-sliver triangles.
  function meshQuality(mesh, opts) {
    opts = opts || {};
    var P = mesh.positions64 || mesh.positions, nT = P.length / 9;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], i, k;
    for (i = 0; i < P.length; i += 3) for (k = 0; k < 3; k++) { if (P[i + k] < min[k]) min[k] = P[i + k]; if (P[i + k] > max[k]) max[k] = P[i + k]; }
    var diag = P.length ? len(sub(max, min)) : 0, tol = opts.tol || Math.max(diag * 1e-9, 1e-12);
    var needleDeg = opts.needleDeg == null ? 1 : opts.needleDeg;
    // weld: grid cells of size tol, a vertex joins any existing vertex within tol in the 27 neighbouring cells
    var cells = {}, verts = [], ids = new Int32Array(nT * 3);
    function cellKey(x, y, z) { return x + ',' + y + ',' + z; }
    for (i = 0; i < nT * 3; i++) {
      var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      var cx = Math.floor(x / tol), cy = Math.floor(y / tol), cz = Math.floor(z / tol), found = -1;
      for (var dx = -1; dx <= 1 && found < 0; dx++) for (var dy = -1; dy <= 1 && found < 0; dy++) for (var dz = -1; dz <= 1 && found < 0; dz++) {
        var list = cells[cellKey(cx + dx, cy + dy, cz + dz)];
        if (!list) continue;
        for (var m = 0; m < list.length; m++) {
          var v = verts[list[m]];
          if (Math.abs(v[0] - x) <= tol && Math.abs(v[1] - y) <= tol && Math.abs(v[2] - z) <= tol) { found = list[m]; break; }
        }
      }
      if (found < 0) {
        found = verts.length; verts.push([x, y, z]);
        var ck = cellKey(cx, cy, cz);
        (cells[ck] || (cells[ck] = [])).push(found);
      }
      ids[i] = found;
    }
    // triangle shape
    var minAngle = 180, needles = 0, slivers = 0;
    for (var t = 0; t < nT; t++) {
      var A = verts[ids[t * 3]], B = verts[ids[t * 3 + 1]], C = verts[ids[t * 3 + 2]];
      var ab = sub(B, A), bc = sub(C, B), ca = sub(A, C), lab = len(ab), lbc = len(bc), lca = len(ca);
      var area2 = len(cross(ab, sub(C, A))), longest = Math.max(lab, lbc, lca);
      if (!(longest > 0) || area2 / longest < tol) { slivers++; continue; }
      var angA = Math.acos(Math.max(-1, Math.min(1, -dot(ab, ca) / (lab * lca)))), angB = Math.acos(Math.max(-1, Math.min(1, -dot(bc, ab) / (lbc * lab))));
      var a = Math.min(angA, angB, Math.PI - angA - angB) * 180 / Math.PI;
      if (a < minAngle) minAngle = a;
      if (a < needleDeg) needles++;
    }
    // exact pairing of directed edges between welded vertices
    var directed = {}, undirected = {}, nonManifold = 0, open = [];
    for (t = 0; t < nT; t++) for (k = 0; k < 3; k++) {
      var ia = ids[t * 3 + k], ib = ids[t * 3 + (k + 1) % 3];
      if (ia === ib) continue;
      var dk = ia + '>' + ib, uk = ia < ib ? ia + '|' + ib : ib + '|' + ia;
      directed[dk] = (directed[dk] || 0) + 1;
      undirected[uk] = (undirected[uk] || 0) + 1;
    }
    Object.keys(undirected).forEach(function (uk) {
      var p = uk.split('|'), f = directed[p[0] + '>' + p[1]] || 0, r = directed[p[1] + '>' + p[0]] || 0;
      if (f > 1 || r > 1 || f + r > 2) nonManifold++;
      for (var n = 0; n < f - r; n++) open.push([+p[0], +p[1]]);
      for (n = 0; n < r - f; n++) open.push([+p[1], +p[0]]);
    });
    // T-junctions: cancel what is left against antiparallel collinear edges, by parameter range along each edge
    var rest = open.map(function (e) {
      var a = verts[e[0]], b = verts[e[1]], d = sub(b, a), L = len(d);
      return { a: a, u: scale(d, 1 / L), L: L, pieces: [[0, L]], lo: [Math.min(a[0], b[0]) - tol, Math.min(a[1], b[1]) - tol, Math.min(a[2], b[2]) - tol], hi: [Math.max(a[0], b[0]) + tol, Math.max(a[1], b[1]) + tol, Math.max(a[2], b[2]) + tol] };
    });
    function cutOut(e, t0, t1) {
      var out = [];
      e.pieces.forEach(function (pc) {
        if (t1 <= pc[0] || t0 >= pc[1]) { out.push(pc); return; }
        if (t0 > pc[0]) out.push([pc[0], t0]);
        if (t1 < pc[1]) out.push([t1, pc[1]]);
      });
      e.pieces = out;
    }
    function offLine(e, p) { var w = sub(p, e.a), s = dot(w, e.u); return len(sub(w, scale(e.u, s))); }
    var tj = 0;
    for (i = 0; i < rest.length; i++) {
      var e = rest[i];
      for (var j = i + 1; j < rest.length; j++) {
        var g = rest[j];
        if (dot(e.u, g.u) > -1 + 1e-9) continue;
        if (g.lo[0] > e.hi[0] || g.hi[0] < e.lo[0] || g.lo[1] > e.hi[1] || g.hi[1] < e.lo[1] || g.lo[2] > e.hi[2] || g.hi[2] < e.lo[2]) continue;
        var gb = add(g.a, scale(g.u, g.L));
        if (offLine(e, g.a) > tol || offLine(e, gb) > tol) continue;
        var s0 = dot(sub(gb, e.a), e.u), s1 = dot(sub(g.a, e.a), e.u); // g runs backwards along e
        var t0 = Math.max(0, s0), t1 = Math.min(e.L, s1);
        if (t1 - t0 <= tol) continue;
        cutOut(e, t0, t1);
        // the same range in g's own parameter
        cutOut(g, dot(sub(add(e.a, scale(e.u, t1)), g.a), g.u), dot(sub(add(e.a, scale(e.u, t0)), g.a), g.u));
        tj++;
      }
    }
    var openEdges = 0, openList = [];
    rest.forEach(function (e) { e.pieces.forEach(function (pc) { if (pc[1] - pc[0] > tol * 10) { openEdges++; if (opts.list) openList.push([add(e.a, scale(e.u, pc[0])), add(e.a, scale(e.u, pc[1]))]); } }); });
    return { openList: opts.list ? openList : undefined, triangles: nT, vertices: verts.length, minAngle: nT - slivers > 0 ? minAngle : 0, needles: needles, slivers: slivers,
      openEdges: openEdges, nonManifoldEdges: nonManifold, tJunctions: tj, closed: openEdges === 0 && nonManifold === 0, diag: diag, tol: tol };
  }

  // ------------------------------------------------------------------ face outlines (for DXF of flat faces)
  var outlineOptions = { gridMin: 32 };   // faces with more vertices use outlineGrid (Infinity: never; the tests compare)
  function key3(p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4); }

  // outlineGrid(vlist, plane) -> near(a, b, mark, fn): calls fn(v) for every vertex of vlist that can lie within 1e-5
  // of segment a-b (and maybe a few more), each once per mark. The vertices are put, in the face's 2D frame, into every
  // cell of a uniform grid their ±2e-5 box touches; a segment visits the cells it crosses (Amanatides-Woo). The 2D
  // projection never lengthens a distance, so this is a superset of faceOutline's own test and its result is unchanged.
  function outlineGrid(vlist, plane) {
    var nv = vlist.length, P = new Float64Array(nv * 2), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], TOL = 2e-5;
    for (var i = 0; i < nv; i++) {
      var q = to2D(plane, vlist[i]);
      P[i * 2] = q[0]; P[i * 2 + 1] = q[1];
      for (var k = 0; k < 2; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
    }
    lo[0] -= TOL; lo[1] -= TOL; hi[0] += TOL; hi[1] += TOL;
    var w = hi[0] - lo[0], h = hi[1] - lo[1];
    var c = Math.max(Math.sqrt(w * h / nv), Math.max(w, h) / nv, 8 * TOL);
    var nx = Math.max(1, Math.ceil(w / c)), ny = Math.max(1, Math.ceil(h / c)), cells = new Array(nx * ny);
    function cx(x) { return Math.min(nx - 1, Math.max(0, Math.floor((x - lo[0]) / c))); }
    function cy(y) { return Math.min(ny - 1, Math.max(0, Math.floor((y - lo[1]) / c))); }
    for (i = 0; i < nv; i++) {
      var x0 = cx(P[i * 2] - TOL), x1 = cx(P[i * 2] + TOL), y0 = cy(P[i * 2 + 1] - TOL), y1 = cy(P[i * 2 + 1] + TOL);
      for (var gx = x0; gx <= x1; gx++) for (var gy = y0; gy <= y1; gy++) (cells[gx * ny + gy] = cells[gx * ny + gy] || []).push(i);
    }
    var stamp = new Int32Array(nv).fill(-1);
    return function (a, b, mark, fn) {
      var pa = to2D(plane, a), pb = to2D(plane, b);
      var X0 = (pa[0] - lo[0]) / c, Y0 = (pa[1] - lo[1]) / c, X1 = (pb[0] - lo[0]) / c, Y1 = (pb[1] - lo[1]) / c;
      var ix = cx(pa[0]), iy = cy(pa[1]), ex = cx(pb[0]), ey = cy(pb[1]);
      var dx = X1 - X0, dy = Y1 - Y0, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      var tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
      var tmx = dx !== 0 ? (sx > 0 ? ix + 1 - X0 : X0 - ix) * tdx : Infinity, tmy = dy !== 0 ? (sy > 0 ? iy + 1 - Y0 : Y0 - iy) * tdy : Infinity;
      function visit(gx, gy) {
        var l = cells[gx * ny + gy];
        if (l) for (var j = 0; j < l.length; j++) { var vi = l[j]; if (stamp[vi] !== mark) { stamp[vi] = mark; fn(vlist[vi]); } }
      }
      visit(ix, iy);
      for (var guard = Math.abs(ex - ix) + Math.abs(ey - iy) + 4; (ix !== ex || iy !== ey) && guard > 0; guard--) {
        if (tmx < tmy) { ix += sx; tmx += tdx; } else { iy += sy; tmy += tdy; }
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) break;
        visit(ix, iy);
      }
      visit(ex, ey);
    };
  }

  // rfFG: a boolean can lose a sliver polygon (a few 1e-4 wide, a BSP coplanar call at EPSILON) and leave a crack in a
  // face's boundary: one chain ends at a vertex no boundary edge leaves (a dangling end) a hair away from a vertex no
  // boundary edge reaches (a dangling start). The chain stopped there and the loop closed straight back to its first
  // vertex: a chord across the face, drawn as a stray triangle / line on the shaded solid. Each dangling end now
  // continues with the boundary edge leaving the nearest dangling start within 1e-3 of the face's size (the end vertex
  // itself is dropped; the collinear pass removes what is left of the step).
  function bridgeGaps(boundary, next, vlist) {
    var into = {}, ends = [], starts = [];
    boundary.forEach(function (e) { into[e[1].k] = true; });
    boundary.forEach(function (e) { if (!next[e[1].k]) ends.push(e[1]); if (!into[e[0].k]) starts.push(e); });
    if (!ends.length || !starts.length) return;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    vlist.forEach(function (v) { for (var k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; } });
    var gapTol = 1e-3 * len(sub(hi, lo)), taken = {};
    ends.forEach(function (v) {
      if (next[v.k]) return;
      var best = null, bestD = gapTol;
      starts.forEach(function (s) {
        if (taken[s[0].k]) return;
        var d = len(sub(s[0], v));
        if (d <= bestD) { bestD = d; best = s; }
      });
      if (best) { taken[best[0].k] = true; next[v.k] = best; }
    });
  }

  // Boundary loops of a planar face as 2D polylines in the face frame. Handles T-junctions by splitting edges at
  // any face vertex lying on them.
  function faceOutline(mesh, faceIndex) {
    var face = mesh.faces[faceIndex];
    if (!face) return null;
    var plane = planeFromFace(face.normal, scale(face.normal, face.w));
    // Vertices are welded once: each gets .k, the key of the first vertex within 1e-4 of it on every axis (looked up in
    // its own and the neighbouring 1e-4 cells). That welds all the old key3 cell did (near-coincident CSG corners a few
    // 1e-5 apart) and also two copies of one point that straddle a rounding midpoint, which key3 kept apart.
    var WELD = 1e-4, verts = {}, cells = {}, edges = [];
    function weld(q) {
      var ix = Math.round(q[0] * 1e4), iy = Math.round(q[1] * 1e4), iz = Math.round(q[2] * 1e4);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var c = cells[(ix + dx) + ',' + (iy + dy) + ',' + (iz + dz)];
        if (c) for (var j = 0; j < c.length; j++) { var r = c[j]; if (Math.abs(r[0] - q[0]) <= WELD && Math.abs(r[1] - q[1]) <= WELD && Math.abs(r[2] - q[2]) <= WELD) { q.k = r.k; return q; } }
      }
      var k = ix + ',' + iy + ',' + iz;
      if (verts[k]) k += '#' + Object.keys(verts).length;   // a different point in the same cell keeps its own key
      q.k = k; verts[k] = q; (cells[ix + ',' + iy + ',' + iz] = cells[ix + ',' + iy + ',' + iz] || []).push(q);
      return q;
    }
    face.polys.forEach(function (p) {
      var vs = p.vertices.map(function (v) { return weld(arr(v.pos)); });
      for (var i = 0; i < vs.length; i++) edges.push([vs[i], vs[(i + 1) % vs.length]]);
    });
    var vlist = Object.keys(verts).map(function (k) { return verts[k]; });
    // split edges at collinear interior vertices; on faces with many vertices only the vertices in the grid cells the
    // edge crosses are tested (r3/engine3: was every vertex against every edge, ~100 ms on the Flange)
    var near = vlist.length > outlineOptions.gridMin ? outlineGrid(vlist, plane) : null;
    // The pieces keep the real vertex coordinates (the edge's own ends and the face vertex that splits it), never a
    // point recomputed as a + u·t: vertices are welded on a 1e-4 grid, and a recomputed end that differs
    // from the stored vertex by a few 1e-17 rounds to the other key when the coordinate sits on a rounding midpoint
    // (an inch hole of radius .1405 at .5 has a point at x = .57025). The interior edge then loses its twin, counts as
    // boundary, and the outline chains one hole into the next across the face (a slit through the flat DXF).
    var split = [];
    edges.forEach(function (e, ei) {
      var a = e[0], b = e[1], d = sub(b, a), L = len(d);
      if (L < 1e-9) return;
      var u = scale(d, 1 / L), ts = [{ t: 0, p: a }, { t: L, p: b }];
      function test(v) {
        if (v.k === a.k || v.k === b.k) return;   // the edge's own ends (or their welded twins) never split it
        var w = sub(v, a), t = dot(w, u);
        if (t <= 1e-6 || t >= L - 1e-6) return;
        var perp = len(sub(w, scale(u, t)));
        if (perp < 1e-5) ts.push({ t: t, p: v });
      }
      if (near) near(a, b, ei, test); else vlist.forEach(test);
      ts.sort(function (x, y) { return x.t - y.t; });
      for (var i = 0; i + 1 < ts.length; i++) {
        if (ts[i + 1].t - ts[i].t < 1e-7) continue;
        split.push([ts[i].p, ts[i + 1].p]);
      }
    });
    // an edge is on the boundary when no opposite-direction twin exists
    var count = {};
    split.forEach(function (e) {
      var k = e[0].k + '>' + e[1].k;
      count[k] = (count[k] || 0) + 1;
    });
    // rfFG: by count, not presence: a boolean can leave a sliver copy of part of a polygon (the same corners in the
    // same order twice, one of them welded shut), whose reversed edge cancelled the face's real boundary edge and
    // the loop through it was lost. a>b is on the boundary as many times as it outnumbers b>a.
    var emitted = {};
    var boundary = split.filter(function (e) {
      var k = e[0].k + '>' + e[1].k, net = count[k] - (count[e[1].k + '>' + e[0].k] || 0);
      if (!(net > 0) || (emitted[k] || 0) >= net) return false;
      emitted[k] = (emitted[k] || 0) + 1;
      return true;
    });
    // chain
    var next = {};
    boundary.forEach(function (e) { next[e[0].k] = e; });
    bridgeGaps(boundary, next, vlist);
    var used = {}, loops = [];
    boundary.forEach(function (e) {
      var k0 = e[0].k;
      if (used[k0]) return;
      var loop = [], cur = e, guard = 0;
      while (cur && !used[cur[0].k] && guard++ < 100000) {
        used[cur[0].k] = true;
        loop.push(to2D(plane, cur[0]));
        cur = next[cur[1].k];
      }
      if (loop.length >= 3) loops.push(loop);
    });
    // simplify collinear runs. rfFG: the cross product is not normalised, so it is also tested against the longer
    // adjacent segment (sin of the turn × the shorter one): a true corner between two tiny pieces (a CSG sliver at a
    // fillet end leaves 2e-4 steps, cross ~7e-8) was dropped as "collinear" together with its collinear neighbours,
    // and the outline cut across the face (a diagonal edge drawn as a stray triangle on the shaded solid).
    loops = loops.map(function (l) {
      var out = [];
      for (var i = 0; i < l.length; i++) {
        var p = l[(i + l.length - 1) % l.length], q = l[i], r = l[(i + 1) % l.length];
        var cr = Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]));
        var lp = Math.hypot(q[0] - p[0], q[1] - p[1]), lr = Math.hypot(r[0] - q[0], r[1] - q[1]);
        if (cr > 1e-7 || cr > 1e-6 * Math.max(lp, lr)) out.push(q);
      }
      return out.length >= 3 ? out : l;
    });
    return { loops: loops, plane: plane, face: face };
  }

  // ------------------------------------------------------------------ body edges (for display, picking, chamfer/fillet)
  var COS_SMOOTH = Math.cos(22 * Math.PI / 180);
  function ekey(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }

  // rfFG: pairCracks(mesh, map, order) -> order. On a closed solid every outline segment should meet its twin from the
  // neighbouring face (same two ekey ends). After a boolean the two sides can disagree: a sliver left a vertex a few
  // 1e-4 off (a crack), or one side has a vertex the other side's single segment runs through (a T-junction between
  // faces). Such a segment kept one face, was never "smooth", and was drawn: short V / "<" marks along tangent fillet
  // edges and lines across curved faces. The segments left unpaired are split at each other's ends lying on them
  // (within tol = 1e-4 of the mesh diagonal), their ends snapped together within tol, and pieces of two faces of one
  // body that now share both ends become one edge. Segments that already paired are never touched, so a clean mesh
  // gives exactly the edges it gave before.
  function pairCracks(mesh, map, order) {
    var lone = order.filter(function (k) { return map[k].faces.length === 1; });
    if (lone.length < 2 || lone.length > 4000) return order;
    var P = mesh.positions64 || mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) for (var c = 0; c < 3; c++) { if (P[i + c] < lo[c]) lo[c] = P[i + c]; if (P[i + c] > hi[c]) hi[c] = P[i + c]; }
    var tol = 1e-4 * len(sub(hi, lo));
    if (!(tol > 0)) return order;
    var segs = lone.map(function (k) { var e = map[k]; return { e: e, key: k, d: len(sub(e.b, e.a)), pts: [] }; });
    var ends = [];
    segs.forEach(function (s) { ends.push(s.e.a, s.e.b); });
    // ends within tol of each other share one representative (the first one met)
    var rep = ends.map(function (p, i) { return i; });
    function find(i) { while (rep[i] !== i) i = rep[i] = rep[rep[i]]; return i; }
    for (i = 0; i < ends.length; i++) for (var j = i + 1; j < ends.length; j++) {
      var p = ends[i], q = ends[j];
      if (Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol && len(sub(p, q)) <= tol) { var a = find(i), b = find(j); if (a !== b) rep[Math.max(a, b)] = Math.min(a, b); }
    }
    function at(i) { return ends[find(i)]; }
    // split points: other segments' (snapped) ends inside a segment, within tol of its line
    segs.forEach(function (s, si) {
      var A = at(si * 2), B = at(si * 2 + 1), d = sub(B, A), L = len(d);
      s.A = A; s.B = B; s.L = L;
      if (!(L > tol)) return;
      var u = scale(d, 1 / L), x0 = Math.min(A[0], B[0]) - tol, x1 = Math.max(A[0], B[0]) + tol, y0 = Math.min(A[1], B[1]) - tol, y1 = Math.max(A[1], B[1]) + tol, z0 = Math.min(A[2], B[2]) - tol, z1 = Math.max(A[2], B[2]) + tol;
      for (var k = 0; k < ends.length; k++) {
        if ((k >> 1) === si) continue;
        var v = at(k);
        if (v === A || v === B || v[0] < x0 || v[0] > x1 || v[1] < y0 || v[1] > y1 || v[2] < z0 || v[2] > z1) continue;
        var w = sub(v, A), t = dot(w, u);
        if (t <= tol || t >= L - tol || len(sub(w, scale(u, t))) > tol) continue;
        if (!s.pts.some(function (x) { return x.v === v; })) s.pts.push({ t: t, v: v });
      }
      s.pts.sort(function (x, y) { return x.t - y.t; });
    });
    var pieces = {}, pieceOrder = [];
    function pkey(v) { return ends.indexOf(v); }
    segs.forEach(function (s) {
      if (!(s.L > tol)) return;
      var chain = [s.A].concat(s.pts.map(function (x) { return x.v; }), [s.B]);
      for (var k = 0; k + 1 < chain.length; k++) {
        var a = chain[k], b = chain[k + 1], ia = pkey(a), ib = pkey(b), key = ia < ib ? ia + '|' + ib : ib + '|' + ia;
        (pieces[key] || (pieces[key] = [], pieceOrder.push(key), pieces[key])).push({ s: s, a: a, b: b });
      }
    });
    // a segment is replaced only when every one of its pieces found a twin from another face of the same body / part
    function sameBody(fa, fb) { var A = mesh.faces[fa], B = mesh.faces[fb]; return (A.body || 0) === (B.body || 0) && A.part === B.part; }
    function paired(key) { var l = pieces[key]; return l.length === 2 && l[0].s.e.faces[0] !== l[1].s.e.faces[0] && sameBody(l[0].s.e.faces[0], l[1].s.e.faces[0]); }
    var ok = new Map();
    segs.forEach(function (s) { ok.set(s, s.L > tol); });
    pieceOrder.forEach(function (key) { if (!paired(key)) pieces[key].forEach(function (pc) { ok.set(pc.s, false); }); });
    // a piece whose twin's segment is not replaced cannot be replaced either (repeat until stable)
    for (var changed = true, guard = 0; changed && guard++ < 50;) {
      changed = false;
      pieceOrder.forEach(function (key) {
        var l = pieces[key];
        if (l.length === 2 && ok.get(l[0].s) !== ok.get(l[1].s)) { ok.set(l[0].s, false); ok.set(l[1].s, false); changed = true; }
      });
    }
    var drop = {}, added = [];
    segs.forEach(function (s) { if (ok.get(s) || s.A === s.B) drop[s.key] = true; });   // both ends snapped together: a sliver's edge
    if (!Object.keys(drop).length) return order;
    pieceOrder.forEach(function (key) {
      var l = pieces[key];
      if (!ok.get(l[0].s)) return;
      var a = l[0].a, b = l[0].b, ka = ekey(a), kb = ekey(b), mk = (ka < kb ? ka + '|' + kb : kb + '|' + ka) + '#fg' + added.length;
      var e = map[mk] = { a: a, b: b, ka: ka, kb: kb, faces: [], normals: [], ins: [] };
      l.forEach(function (pc) {
        var se = pc.s.e, n = se.normals[0];
        e.faces.push(se.faces[0]); e.normals.push(n);
        e.ins.push(norm(cross(n, norm(sub(pc.b, pc.a)))));
      });
      added.push(mk);
    });
    return order.filter(function (k) { return !drop[k]; }).concat(added);
  }

  // -> [{a, b, mid, dir, len, faces:[i,j], normals:[nA,nB], smooth, convex, ka, kb}]
  function bodyEdges(mesh) {
    var map = {}, order = [];
    for (var i = 0; i < mesh.faces.length; i++) {
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      if (!o) continue;
      var n = mesh.faces[i].normal;
      o.loops.forEach(function (loop) {
        for (var k = 0; k < loop.length; k++) {
          var a = to3D(o.plane, loop[k][0], loop[k][1]), b = to3D(o.plane, loop[(k + 1) % loop.length][0], loop[(k + 1) % loop.length][1]);
          var ka = ekey(a), kb = ekey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          var e = map[key];
          if (!e) { e = map[key] = { a: a, b: b, ka: ka, kb: kb, faces: [], normals: [], ins: [] }; order.push(key); }
          e.faces.push(i);
          e.normals.push(n);
          // outline loops run counter-clockwise about the face normal, so the face interior is to the left of a->b
          e.ins.push(norm(cross(n, norm(sub(b, a)))));
        }
      });
    }
    order = pairCracks(mesh, map, order);
    var list = [];
    order.forEach(function (key) {
      var e = map[key];
      e.mid = scale(add(e.a, e.b), 0.5);
      var d = sub(e.b, e.a);
      e.len = len(d);
      if (e.len < 1e-6) return;
      e.dir = scale(d, 1 / e.len);
      e.smooth = false;
      if (e.normals.length >= 2) {
        e.smooth = true;
        for (var p = 0; p < e.normals.length && e.smooth; p++) for (var q = p + 1; q < e.normals.length; q++) {
          if (dot(e.normals[p], e.normals[q]) < COS_SMOOTH) { e.smooth = false; break; }
        }
      }
      if (e.smooth && e.faces.length === 2 && wrapSplit(mesh, e.faces[0], e.faces[1])) e.smooth = false;   // rfDZ: a Wrap scribe edge is a real edge
      e.convex = null;
      if (e.faces.length >= 2) {
        // convex when face B's interior heads behind face A's plane (into the material)
        e.convex = dot(e.normals[0], e.ins[1]) < 0;
      }
      list.push(e);
    });
    return list;
  }

  function pointSegmentDistance(p, a, b) {
    var ab = sub(b, a), t = dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12);
    t = Math.max(0, Math.min(1, t));
    return len(sub(p, add(a, scale(ab, t))));
  }

  // Resolve edge specs ({at:[x,y,z], chain:bool}) against the current edges, with tangent-chain propagation.
  function resolveEdges(specs, edges, tol) {
    var picked = [], seen = {};
    var COS_CHAIN = Math.cos(28 * Math.PI / 180);
    function addEdge(e) { var k = e.ka + '|' + e.kb; if (seen[k]) return false; seen[k] = true; picked.push(e); return true; }
    (specs || []).forEach(function (spec) {
      var best = null, bestD = tol;
      edges.forEach(function (e) {
        var d = pointSegmentDistance(spec.at, e.a, e.b);
        if (d < bestD) { bestD = d; best = e; }
      });
      if (!best) return;
      addEdge(best);
      if (spec.chain === false) return;
      // breadth-first along nearly collinear neighbours sharing an endpoint and the same convexity
      var queue = [best];
      while (queue.length) {
        var cur = queue.shift();
        edges.forEach(function (e) {
          if (e === cur || e.convex !== cur.convex) return;
          var touches = e.ka === cur.ka || e.ka === cur.kb || e.kb === cur.ka || e.kb === cur.kb;
          if (!touches) return;
          if (Math.abs(dot(e.dir, cur.dir)) < COS_CHAIN) return;
          if (addEdge(e)) queue.push(e);
        });
      }
    });
    return picked;
  }

  // Cross-section solid for one edge: chamfer (flat) or fillet (arc). Returns CSG; caller unions per op.
  function edgeTool(e, mesh, kind, size, extA, extB, tag) {
    var fa = mesh.faces[e.faces[0]], fb = mesh.faces[e.faces[1]];
    var nA = fa.normal, nB = fb.normal, m = e.mid, dir = e.dir;
    var dA = e.ins[0], dB = e.ins[1];
    var cosT = Math.max(-1, Math.min(1, dot(dA, dB)));
    var theta = Math.acos(cosT);
    if (theta < 0.05 || theta > Math.PI - 0.05) throw new Error('Edge faces are nearly parallel; cannot ' + kind + ' it.');
    var plane = { origin: m, x: dA, y: cross(dir, dA), n: dir };
    function uv(p) { var d = sub(p, m); return [dot(d, plane.x), dot(d, plane.y)]; }
    var pts = [], arcPt = [], S = null;
    var ext = size * 1.5;
    if (kind === 'chamfer') {
      pts.push(add(m, scale(dA, size)), add(m, scale(dB, size)));
    } else {
      var t = size / Math.tan(theta / 2);
      var pA = add(m, scale(dA, t)), pB = add(m, scale(dB, t));
      var c = add(m, scale(norm(add(dA, dB)), size / Math.sin(theta / 2)));
      var vA = sub(pA, c), vB = sub(pB, c);
      var sweep = Math.acos(Math.max(-1, Math.min(1, dot(vA, vB) / (size * size))));
      var axis = norm(cross(vA, vB));
      var segs = TESS.legacy ? Math.max(4, Math.round(sweep / (Math.PI / 12))) : Math.max(4, Math.ceil(segsForRadius(size) * sweep / (2 * Math.PI) - 1e-9));
      var angs = rfFMarcAngles(sweep, segs);   // rfFM: end chords ≥ 24°, as the torus rounds (rfFFsection)
      for (var s = 0; s < angs.length; s++) { pts.push(s === angs.length - 1 ? pB : add(c, rotatePoint(vA, [0, 0, 0], axis, angs[s]))); arcPt.push(true); }
      // the round is a true cylinder about the edge line through c when both faces are planar (a fillet along a
      // chain of facets of a curved face is a polygonal approximation of a torus: no record)
      var planarFaces = [fa, fb].every(function (f) { return !(f.polys || []).some(function (p) { return p.surf; }); });
      if (planarFaces) S = { t: 'cyl', o: c, d: dir.slice(), r: size };
    }
    var last = pts[pts.length - 1], first = pts[0];
    if (e.convex) {
      // rfFM: a thin band (rfFMband) outside each face, closed round the corner: reaching 1.5 × size out, the tool of an
      // edge inside a thin-walled bore (the Funnel's spout) crossed the bore and cut the far wall
      var bx = Math.min(ext, rfFMband), cx = dot(nA, nB);
      pts.push(add(last, scale(nB, bx)), add(m, scale(add(nA, nB), bx / (1 + cx))), add(first, scale(nA, bx)));
    } else {
      // rfFM: a concave tool overlaps the material by a thin band parallel to each face (rfFMband), its corner where the
      // two offset lines meet; the old back point 1.5 × size behind the corner poked out of thin walls (an L with 8 mm
      // legs and R9: +4 %, a 2 mm shell: +22 %)
      var bd = rfFMband, cAB = dot(nA, nB);
      pts.push(sub(last, scale(nB, bd)), sub(m, scale(add(nA, nB), bd / (1 + cAB))), sub(first, scale(nA, bd)));
    }
    while (arcPt.length < pts.length) arcPt.push(false);
    var loop = pts.map(uv);
    if (signedArea(loop) < 0) { loop.reverse(); pts.reverse(); arcPt.reverse(); }
    // Section is swept from end A to end B. Ends are either perpendicular caps (with a small overshoot) or
    // mitre planes shared with a selected neighbour, so chained facets join without notches.
    var tA = dot(sub(e.a, m), dir) - (extA.ext || 0), tB = dot(sub(e.b, m), dir) + (extB.ext || 0);
    var lim = size * 6;
    function shift(P, cap, def) {
      if (!cap || !cap.n) return def;
      var den = dot(dir, cap.n);
      if (Math.abs(den) < 0.25) return def;
      var t = dot(sub(cap.v, P), cap.n) / den;
      return Math.max(def - lim, Math.min(def + lim, t));
    }
    var bottom = pts.map(function (P) { return add(P, scale(dir, shift(P, extA, tA))); });
    var top = pts.map(function (P) { return add(P, scale(dir, shift(P, extB, tB))); });
    var polys = [], n = pts.length;
    triangulate(loop).forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], tag);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], tag);
    });
    var F = S ? { s: S } : null;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var side = poly([bottom[i], bottom[j], top[j], top[i]], tag);
      if (!side) continue;
      if (F && arcPt[i] && arcPt[j]) side.surf = F;
      polys.push(side);
    }
    return ensureOutward(polys);
  }

  // Mitre plane at vertex v between edge e (leaving v along u1) and neighbour nb; null when not exactly one neighbour.
  function mitreCap(e, atA, neighbours) {
    var v = atA ? e.a : e.b;
    if (neighbours.length !== 1) return { v: v, n: null, ext: neighbours.length ? 0.02 : 0.01 };
    var nb = neighbours[0];
    var u1 = atA ? e.dir : scale(e.dir, -1);
    var sharedKey = atA ? e.ka : e.kb;
    var u2 = nb.ka === sharedKey ? nb.dir : scale(nb.dir, -1);
    var nm = sub(u1, u2);
    if (len(nm) < 1e-6) return { v: v, n: null, ext: 0.01 };
    return { v: v, n: norm(nm), ext: 0 };
  }

  // r16/picktol: the distance within which a recorded pick (an edge's or face's `at`) still finds its edge or face.
  // It was max(0.5, size) in model units: 12.7 mm on an inch part, so on a thin inch part a pick whose own edge or
  // face was gone landed on the one on the other side of the sheet. Now the floor is 0.5 mm in the model's units
  // (0.5 / 25.4 in an inch part); the feature's own size (fillet radius, chamfer distance, half the shell
  // thickness) still widens it. Both kernels use it (occt-kernel.js edgeOp / shellOp).
  var PICK_MM = 0.5;
  function pickTol(units, size) { return Math.max(units === 'in' ? PICK_MM / 25.4 : PICK_MM, +size || 0); }

  // ------------------------------------------------------------------ rfFF: fillets / chamfers on circular edges, spherical corners
  // A circular edge (a chain of chords where a plane perpendicular to the axis meets a faceted cylinder or cone) is
  // filleted / chamfered as SolidWorks does it: the section (the same corner construction as edgeTool, in the
  // meridian half-plane (ρ, z)) is revolved about the axis through the chord vertices themselves, so the tool's facets
  // lie in the planes of the body's facets (each facet of a revolve is the section scaled radially), the cut leaves
  // no slivers, and the round carries a 'tor' record (a chamfer a 'cone' record) with the profile chord P / Q that
  // curveCorrection integrates exactly (as for a revolve). Three mutually perpendicular convex straight edges filleted
  // at one vertex with one radius get SolidWorks' spherical corner: each edge's round stops at the plane through the
  // ball centre C, and the cube between the vertex and C minus the ball is cut with 'sph' records.
  function rfFFsurf(fc) { var ps = fc.polys || []; for (var i = 0; i < ps.length; i++) if (ps[i].surf && ps[i].surf.s) return ps[i].surf.s; return null; }
  function rfFFplanar(fc) { return !(fc.polys || []).some(function (p) { return p.surf; }); }
  function rfFFsegs(size, sweep) {
    return TESS.legacy ? Math.max(4, Math.round(sweep / (Math.PI / 12))) : Math.max(4, Math.ceil(segsForRadius(size) * sweep / (2 * Math.PI) - 1e-9));
  }
  function rfFFradial(p, A, d) { var v = sub(p, A); return sub(v, scale(d, dot(v, d))); }
  // -> null, or the circle an edge (one chord) lies on: { key, A (centre), d, Rc, uP, uC (unit directions into the planar
  // and the curved face in (ρ, z)), conv }
  function arcEdgeInfo(e, mesh, kind) {
    if (e.faces.length !== 2 || e.convex == null) return null;
    var f0 = mesh.faces[e.faces[0]], f1 = mesh.faces[e.faces[1]];
    var ip = rfFFplanar(f0) ? 0 : rfFFplanar(f1) ? 1 : -1;
    if (ip < 0) return null;
    var ic = 1 - ip, fc = mesh.faces[e.faces[ic]], S = rfFFsurf(fc);
    if (S && (S.t === 'tor' || S.t === 'sph') && S.w == null && kind !== 'chamfer') return rfFKcircInfo(e, mesh, ip, ic, fc, S);
    if (!S || (S.t !== 'cyl' && S.t !== 'cone') || S.w != null) return null;
    if (!(fc.polys || []).every(function (p) { return p.surf && p.surf.s && p.surf.s.t === S.t; })) return null;
    var d = norm(S.d), nP = e.normals[ip];
    if (Math.abs(Math.abs(dot(nP, d)) - 1) > 1e-7) return null;
    var za = dot(sub(e.a, S.o), d), zb = dot(sub(e.b, S.o), d), k = S.k || 0, Rc = S.r + k * za;
    if (!(Rc > 1e-9)) return null;
    var tol = 1e-6 * Math.max(1, Rc, Math.abs(za));
    if (Math.abs(za - zb) > tol) return null;
    var A = add(S.o, scale(d, za)), ra = len(rfFFradial(e.a, A, d)), rb = len(rfFFradial(e.b, A, d));
    // both ends on the faceted circle: on the true circle, or (a T-junction on a chord) inside it by at most a sagitta
    if (ra > Rc + tol || rb > Rc + tol || ra < 0.7 * Rc || rb < 0.7 * Rc) return null;
    var erm = norm(rfFFradial(e.mid, A, d));
    var sp = dot(e.ins[ip], erm) > 0 ? 1 : -1, sc = dot(e.ins[ic], d) > 0 ? 1 : -1, kn = Math.sqrt(1 + k * k);
    var dd = d, sg = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1;
    function q(v) { return Math.round(v * 1e5); }
    var key = A.map(q).join(',') + '|' + scale(dd, sg).map(q).join(',') + '|' + q(Rc) + '|' + (e.convex ? 1 : 0) + '|' + sp + '|' + sc;
    return { key: key, A: A, d: d, Rc: Rc, uP: [sp, 0], uC: [k * sc / kn, sc / kn], conv: e.convex };
  }
  // rfFK: the circle where a plane square to the axis meets a revolved torus / sphere face (a dish wall cut by a
  // revolve with an arc, a ball dimple). In the meridian half-plane (ρ, z from A) the face is the tube circle C, r and
  // the round is the circle tangent to the plane line and to that circle (rfFFsection's circ), so it is a torus too.
  // The body's edge lies on the faceted surface (a profile chord), inside the true circle Rc by up to a sagitta: Rv is
  // that ring's radius (arcChainTool scales the true section by ρ_vertex / Rv, so the round meets the true surface).
  // Fillets only (what SolidWorks measures a chamfer distance along on a curved face is not checked yet).
  function rfFKcircInfo(e, mesh, ip, ic, fc, S) {
    var F0 = fc.polys[0].surf;
    if (!F0 || !F0.P || !F0.Q) return null;
    var same = (fc.polys || []).every(function (p) {
      var s = p.surf && p.surf.s;
      return s && (s === S || (s.t === S.t && Math.abs(s.r - S.r) < 1e-9 * Math.max(1, S.r) && Math.abs((s.R || 0) - (S.R || 0)) < 1e-9 * Math.max(1, Math.abs(S.R || 0)) && len(sub(s.o, S.o)) < 1e-9 * Math.max(1, len(S.o))));
    });
    if (!same) return null;
    var d = norm(S.d), nP = e.normals[ip];
    if (Math.abs(Math.abs(dot(nP, d)) - 1) > 1e-7) return null;
    var za = dot(sub(e.a, S.o), d), zb = dot(sub(e.b, S.o), d), r = S.r, Cr = S.t === 'tor' ? S.R : 0;
    var tol = 1e-6 * Math.max(1, r, Math.abs(za));
    if (Math.abs(za - zb) > tol || !(r * r - za * za > 0)) return null;
    var A = add(S.o, scale(d, za)), ra = len(rfFFradial(e.a, A, d)), rb = len(rfFFradial(e.b, A, d)), Rv = Math.max(ra, rb);
    var h = Math.sqrt(r * r - za * za), Rc = Math.abs(Cr + h - Rv) <= Math.abs(Cr - h - Rv) ? Cr + h : Cr - h;
    // the ring within a sagitta of the true circle (a chord of the profile arc deviates by at most its own sagitta)
    if (!(Rc > 1e-9) || Math.abs(Rc - Rv) > 0.25 * r || Math.min(ra, rb) < 0.7 * Rv) return null;
    var erm = norm(rfFFradial(e.mid, A, d)), sp = dot(e.ins[ip], erm) > 0 ? 1 : -1;
    var C = [Cr, -za], v = [Rc - Cr, za];
    if (Math.abs(sp * v[0]) < 1e-6 * r) return null;   // the plane tangent to the tube: no edge to round
    var t = [-v[1] / r, v[0] / r], insC = [dot(e.ins[ic], erm), dot(e.ins[ic], d)];
    if (t[0] * insC[0] + t[1] * insC[1] < 0) t = [-t[0], -t[1]];
    var sg = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1;
    function q(x) { return Math.round(x * 1e5); }
    var key = A.map(q).join(',') + '|' + scale(d, sg).map(q).join(',') + '|' + q(Rc) + '|' + (e.convex ? 1 : 0) + '|' + sp + '|' + S.t + q(r);
    // out: the corner's wedge lies outside the tube (a cut dish wall, material outside the circle)
    return { key: key, A: A, d: d, Rc: Rc, Rv: Rv, uP: [sp, 0], uC: t, conv: e.convex, circ: { C: C, r: r, out: sp * v[0] > 0 } };
  }

  // The corner section in 2D (edgeTool's construction): uA, uB unit directions from the corner E into the two faces.
  // -> { pts, arc (curved-segment flags), c (arc centre) }
  function rfFFsection(kind, size, E, uA, uB, conv, minRho, circ) {
    function a2(p, u, t) { return [p[0] + u[0] * t, p[1] + u[1] * t]; }
    var cosT = Math.max(-1, Math.min(1, uA[0] * uB[0] + uA[1] * uB[1])), theta = Math.acos(cosT);
    if (theta < 0.05 || theta > Math.PI - 0.05) throw new Error('Edge faces are nearly parallel; cannot ' + kind + ' it.');
    var pts = [], arc = [], c = null;
    if (circ && kind !== 'chamfer') return rfFKsection(size, E, uA, uB, minRho, circ, a2);
    if (kind === 'chamfer') { pts.push(a2(E, uA, size), a2(E, uB, size)); arc.push(true, true); }
    else {
      var t = size / Math.tan(theta / 2), pA = a2(E, uA, t), pB = a2(E, uB, t);
      var bis = [uA[0] + uB[0], uA[1] + uB[1]], bl = Math.hypot(bis[0], bis[1]);
      c = a2(E, [bis[0] / bl, bis[1] / bl], size / Math.sin(theta / 2));
      var a0 = Math.atan2(pA[1] - c[1], pA[0] - c[0]), a1 = Math.atan2(pB[1] - c[1], pB[0] - c[0]), sw = a1 - a0;
      while (sw > Math.PI) sw -= 2 * Math.PI;
      while (sw < -Math.PI) sw += 2 * Math.PI;
      // rfFM: the end chords turn at least rfFMend (23°, cf. rfFKsection's first chord): a small round on a hole rim (R.0125 on an inch
      // plate, 8 chords of 11°) left its first chord within the BSP's 1e-5 of the plane face over 1e-4 and the cut
      // dropped a sliver of the face beside the rim (an open triangle)
      var asw = Math.abs(sw), angs = rfFMarcAngles(asw, rfFFsegs(size, asw)), sgn = sw < 0 ? -1 : 1;
      for (var s = 0; s < angs.length; s++) {
        var an = a0 + sgn * angs[s];
        pts.push(s === 0 ? pA : s === angs.length - 1 ? pB : [c[0] + size * Math.cos(an), c[1] + size * Math.sin(an)]);
        arc.push(true);
      }
    }
    var first = pts[0], last = pts[pts.length - 1], ext = 1.5 * size, extra;
    function perpAway(u, other) { var p = [-u[1], u[0]]; return p[0] * other[0] + p[1] * other[1] > 0 ? [-p[0], -p[1]] : p; }
    if (conv) {
      // (a revolved convex tool keeps its 1.5 × size run-out: it cannot reach a far wall across a bore, the minRho guard
      // stops it at the axis; with edgeTool's thin band the GROOVE rim's exact volume moved by 5e-9, in curveCorrection)
      var nA = perpAway(uA, uB), nB = perpAway(uB, uA);
      extra = function (x) { return [a2(last, nB, x), a2(E, [nA[0] + nB[0], nA[1] + nB[1]], x), a2(first, nA, x)]; };
    } else {
      // rfFM: a thin band into the material parallel to each face (see edgeTool), not a point 1.5 × size behind the corner
      var mA = perpAway(uA, uB), mB = perpAway(uB, uA), cm = mA[0] * mB[0] + mA[1] * mB[1];
      extra = function (x) { var b = Math.min(x, rfFMband); return [a2(last, mB, b), a2(E, [mA[0] + mB[0], mA[1] + mB[1]], b / (1 + cm)), a2(first, mA, b)]; };
    }
    // keep the extension clear of the axis (a revolved section must not cross it)
    for (var it = 0; it < 30 && extra(ext).some(function (p) { return p[0] < minRho; }); it++) ext *= 0.6;
    extra(ext).forEach(function (p) { pts.push(p); arc.push(false); });
    return { pts: pts, arc: arc, c: c };
  }
  // ------------------------------------------------------------------ rfFM: does the round fit?
  // rfFMband: how far a concave tool reaches into the material behind its faces (set per feature by buildEdgeFeature:
  // 0.05 × size, at most 0.05 mm), far above the BSP's 1e-5, far below any wall the round could stand on.
  var rfFMband = 0.05;
  // The angles (0 … asw) of a round's chords: n equal steps, except that the two end chords (tangent to the faces)
  // turn at least rfFMend (23°) so neither lies within the BSP's 1e-5 of its face over more than ~5e-5 (23°, not
  // rfFKfirst's 24°: the end facet's normal, 11.5°, stays within SMOOTH.exact, 12°, of the face, as the shading
  // expects; at 20° the inch hole rim cracked again and GROOVE moved by 1e-8).
  // edgeTool, rfFFsection and sphereCornerTool share it, so a straight round, the torus it runs on into and a ball
  // corner keep matching sections. The legacy tessellation keeps equal steps (its pinned polygonal volumes).
  var rfFMend = 23 * Math.PI / 180;
  function rfFMarcAngles(asw, n) {
    var angs = [0], s;
    if (TESS.legacy || asw / n >= rfFMend) { for (s = 1; s < n; s++) angs.push(asw * s / n); angs.push(asw); return angs; }
    var ends = Math.min(asw / 2, rfFMend), mid = asw - 2 * ends, nm = mid > 1e-9 ? Math.max(1, Math.round(n * mid / asw)) : 0;
    if (nm === 0) angs.push(asw / 2);
    else { angs.push(ends); for (s = 1; s < nm; s++) angs.push(ends + mid * s / nm); angs.push(asw - ends); }
    angs.push(asw);
    return angs;
  }
  // Probe points (section coordinates, corner E, unit directions uA / uB into the two faces) that tell whether a
  // round / chamfer of this size fits the body as SolidWorks requires: each setback line lies on its face (material
  // just under it, air just over it; testA / testB: only for a face whose surface is known there), and the corner
  // region the tool removes (convex) is all material / the region it fills (concave) is all air, up to and just past
  // the round. -> [{ p: [x, y], want: inside? }]
  function rfFMprobes(kind, size, E, uA, uB, conv, eta, testA, testB) {
    function a2(p, u, t) { return [p[0] + u[0] * t, p[1] + u[1] * t]; }
    function perpAway(u, other) { var p = [-u[1], u[0]]; return p[0] * other[0] + p[1] * other[1] > 0 ? [-p[0], -p[1]] : p; }
    var cosT = Math.max(-1, Math.min(1, uA[0] * uB[0] + uA[1] * uB[1])), theta = Math.acos(cosT);
    if (theta < 0.05 || theta > Math.PI - 0.05) return [];
    var t = (kind === 'chamfer' ? size : size / Math.tan(theta / 2)) * (1 - 1e-4), out = [];
    var bis = [uA[0] + uB[0], uA[1] + uB[1]], bl = Math.hypot(bis[0], bis[1]);
    bis = [bis[0] / bl, bis[1] / bl];
    [[uA, uB, testA], [uB, uA, testB]].forEach(function (s, side) {
      if (!s[2]) return;
      var n = perpAway(s[0], s[1]), p = a2(E, s[0], t);
      if (!conv) n = [-n[0], -n[1]];   // the face's outward normal
      out.push({ p: a2(p, n, -eta), want: true, why: 'under', side: side, t: t }, { p: a2(p, n, eta), want: false, why: 'over', side: side, t: t });
    });
    if (testA && testB) {
      var mid = kind === 'chamfer' ? a2(E, bis, size * Math.cos(theta / 2)) : a2(E, bis, size / Math.sin(theta / 2) - size);
      out.push({ p: [(E[0] + mid[0]) / 2, (E[1] + mid[1]) / 2], want: !!conv, why: 'corner' }, { p: a2(mid, bis, eta), want: !!conv, why: 'corner' });
    }
    return out;
  }
  function rfFMrefuse(kind) {
    return new Error(kind === 'chamfer' ? 'Failed to create chamfer. The distance may be too large for the selected edges.' : 'Failed to create fillet. The radius may be too large for the selected edges.');
  }

  // rfFK: the round between the plane line (E, uA) and the tube circle (circ.C, circ.r): its centre F is size off the
  // line on the wedge's side and r ± size from C (+ when the wedge lies outside the tube); A on the line, B on the
  // circle. The tool runs on from B along the circle's normal (a ray through C, the direction curveCorrection's columns
  // take on the wall's facets, so the wall left under the round still integrates exactly), past E and back over A.
  var rfFKfirst = 24 * Math.PI / 180;
  function rfFKsection(size, E, uA, uB, minRho, circ, a2) {
    var C = circ.C, r = circ.r, D = circ.out ? r + size : r - size;
    if (!(D > 1e-9 * r)) throw new Error('Radius ' + +size.toFixed(6) + ' is too large for the curved face of radius ' + +r.toFixed(6) + ' it meets; use less than ' + +r.toFixed(6) + '.');
    var m = [-uA[1], uA[0]];
    if (m[0] * uB[0] + m[1] * uB[1] < 0) m = [-m[0], -m[1]];
    var w = [E[0] + m[0] * size - C[0], E[1] + m[1] * size - C[1]], wu = w[0] * uA[0] + w[1] * uA[1];
    var disc = wu * wu - (w[0] * w[0] + w[1] * w[1]) + D * D;
    if (!(disc >= 0)) throw new Error('Radius ' + +size.toFixed(6) + ' does not fit between these faces.');
    var tt = [-wu - Math.sqrt(disc), -wu + Math.sqrt(disc)].filter(function (x) { return x > 1e-9 * size; });
    if (!tt.length) throw new Error('Radius ' + +size.toFixed(6) + ' does not fit between these faces.');
    var pA = a2(E, uA, tt[0]), F = a2(pA, m, size), fd = Math.hypot(F[0] - C[0], F[1] - C[1]);
    var pB = [C[0] + (F[0] - C[0]) * r / fd, C[1] + (F[1] - C[1]) * r / fd];
    var a0 = Math.atan2(pA[1] - F[1], pA[0] - F[0]), a1 = Math.atan2(pB[1] - F[1], pB[0] - F[0]), sw = a1 - a0;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    while (sw < -Math.PI) sw += 2 * Math.PI;
    // the chord at A leaves the plane at half its turn: a shallow round (a dish wall at 31° to the top, 4 chords of
    // 7.7°) put that chord within the BSP's 1e-5 of the plane over 1e-4 and cracked the plane face, so the first chord
    // turns at least rfFKfirst (its facets keep their exact record; only the shading near A is coarser)
    var asw = Math.abs(sw), n = rfFFsegs(size, asw), first = Math.min(asw, Math.max(asw / n, rfFKfirst)), pts = [], arc = [];
    var rest = asw - first, nr = rest > 1e-9 ? Math.max(1, Math.ceil(n * rest / asw - 1e-9)) : 0, sg = sw < 0 ? -1 : 1;
    for (var s = 0; s <= nr + 1; s++) {
      var an = a0 + sg * (s === 0 ? 0 : first + rest * (s - 1) / (nr || 1));
      pts.push(s === 0 ? pA : s === nr + 1 ? pB : [F[0] + size * Math.cos(an), F[1] + size * Math.sin(an)]);
      arc.push(true);
    }
    // away from the wedge: off the plane (−m), and along the circle's normal (towards C when the wedge is outside)
    function nAt(p) { var x = (p[0] - C[0]) / r, y = (p[1] - C[1]) / r; return circ.out ? [-x, -y] : [x, y]; }
    var nA = [-m[0], -m[1]], nB = nAt(pB), nE = nAt(E), ext = 1.5 * size;
    function extra(x) { return [a2(pB, nB, x), a2(E, [nA[0] + nE[0], nA[1] + nE[1]], x), a2(pA, nA, x)]; }
    for (var it = 0; it < 30 && extra(ext).some(function (p) { return p[0] < minRho; }); it++) ext *= 0.6;
    extra(ext).forEach(function (p) { pts.push(p); arc.push(false); });
    return { pts: pts, arc: arc, c: F, b: pB };
  }

  // Revolve the section about the circle's axis through the chain's vertices. chain: { info, vs (3D points in order,
  // turning positively about d), closed }
  function arcChainTool(chain, kind, size, tag) {
    var I = chain.info, A = I.A, d = I.d, Rc = I.Rc;
    var sec = rfFFsection(kind, size, [Rc, 0], I.uP, I.uC, I.conv, 0.2 * Rc, I.circ);
    var pts = sec.pts, arc = sec.arc;
    // the round would cross the axis (a radius larger than the round edge it runs round): SolidWorks refuses it too
    if (pts.some(function (p, i) { return arc[i] && !(p[0] > 1e-6 * Math.max(1, Rc)); }))
      throw new Error((kind === 'chamfer' ? 'Distance ' : 'Radius ') + +size.toFixed(6) + ' is too large for the round edge of radius ' + +Rc.toFixed(6) + ' it runs round; use less than ' + +Rc.toFixed(6) + ' (or ' + kind + ' this edge before the smaller rounds).');
    if (signedArea(pts) < 0) { pts = pts.slice().reverse(); arc = arc.slice().reverse(); }
    var n = pts.length, vs = chain.vs, m = vs.length, Rv = I.Rv || Rc;
    // rfFK: on a torus / sphere wall the ring is the faceted one (a profile chord's radius at the plane): the largest
    // vertex radius of the chain (T-junctions sit inside, on chords), so ring vertices map the true section unscaled
    if (I.circ) vs.forEach(function (v) { Rv = Math.max(Rv, len(rfFFradial(v, A, d))); });
    // one record for the whole round
    var S = null;
    if (kind === 'chamfer') {
      var ia = arc.indexOf(true), P = pts[ia], Q = pts[(ia + 1) % n], dz = Q[1] - P[1], dr = Q[0] - P[0];
      S = Math.abs(dr) < 1e-12 * Rc ? { t: 'cyl', o: A.slice(), d: d.slice(), r: P[0] } : { t: 'cone', o: A.slice(), d: d.slice(), r: P[0] - dr / dz * P[1], k: dr / dz };
    } else {
      var oc = add(A, scale(d, sec.c[1]));
      S = Math.abs(sec.c[0]) < 1e-9 * Math.max(1, size) ? { t: 'sph', o: oc, d: d.slice(), r: size } : { t: 'tor', o: oc, d: d.slice(), R: sec.c[0], r: size };
    }
    var e0 = norm(rfFFradial(vs[0], A, d)), e1 = cross(d, e0);
    var rings = [], ph = [];
    for (var k = 0; k < m; k++) {
      var rv = rfFFradial(vs[k], A, d), rho = len(rv), uk = scale(rv, 1 / rho), s = rho / Rv;
      var raw = Math.atan2(dot(uk, e1), dot(uk, e0));
      if (k === 0) ph.push(0);
      else { var dp = raw - ph[k - 1]; while (dp < 0) dp += 2 * Math.PI; while (dp >= 2 * Math.PI) dp -= 2 * Math.PI; ph.push(ph[k - 1] + dp); }
      rings.push(pts.map(function (p) { return add(A, add(scale(d, p[1]), scale(uk, p[0] * s))); }));
    }
    if (chain.closed) { rings.push(rings[0]); ph.push(2 * Math.PI); }
    // rfFM: an open chain meeting a selected straight edge at a corner (a gear tooth's top arc and its flank) ends on
    // the same mitre plane as that edge's tool (chain.caps, from mitreCap): with the end ring in its meridian plane the
    // two tools left a sliver between them and R.086 on the gear cracked the face (16 open edges)
    var mitred = [false, false];
    if (!chain.closed && chain.caps) [0, rings.length - 1].forEach(function (k, w) {
      var cap = chain.caps[w];
      if (!cap || !cap.n) return;
      var uk = norm(rfFFradial(vs[k], A, d)), tk = cross(d, uk), den = dot(tk, cap.n);
      if (Math.abs(den) < 0.25) return;
      rings[k] = rings[k].map(function (P) { var sh = dot(sub(cap.v, P), cap.n) / den; return add(P, scale(tk, Math.max(-6 * size, Math.min(6 * size, sh)))); });
      mitred[w] = true;
    });
    // one wrapper per profile segment, all sharing e0 (curveEdges keys a meridian edge by its angle from e0); dphi (the
    // first sector's) only serves profile chords perpendicular to the axis, which a fillet section never has
    var wraps = pts.map(function (p, i) {
      var j = (i + 1) % n;
      // rfFK: the run-on from B along the tube's normal is left as a step (up to a sagitta wide) between the wall's
      // facets and the round: a cone record, so its facets integrate exactly as well
      if (sec.b && arc[i] !== arc[j] && (pts[i] === sec.b || pts[j] === sec.b)) {
        var cz = pts[j][1] - pts[i][1], cr = pts[j][0] - pts[i][0];
        if (Math.abs(cz) < 1e-12 * Math.max(1, Rc)) return null;
        return Math.abs(cr) < 1e-12 * Math.max(1, Rc) ? { s: { t: 'cyl', o: A.slice(), d: d.slice(), r: pts[i][0] }, step: 1 } : { s: { t: 'cone', o: A.slice(), d: d.slice(), r: pts[i][0] - cr / cz * pts[i][1], k: cr / cz }, step: 1 };
      }
      if (!(arc[i] && arc[j])) return null;
      return S.t === 'tor' || S.t === 'sph' ? { s: S, P: [pts[i][0], pts[i][1] - sec.c[1]], Q: [pts[j][0], pts[j][1] - sec.c[1]], e0: e0.slice(), dphi: ph[1] - ph[0] } : { s: S };
    });
    var polys = [];
    for (k = 0; k + 1 < rings.length; k++) {
      var r0 = rings[k], r1 = rings[k + 1];
      var tri = (k === 0 && mitred[0]) || (k + 2 === rings.length && mitred[1]);   // a mitred end sector: quads are no longer planar
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n, pgs = tri ? [poly([r0[i], r1[i], r1[j]], tag), poly([r0[i], r1[j], r0[j]], tag)] : [poly([r0[i], r1[i], r1[j], r0[j]], tag)];
        pgs.forEach(function (pg) {
          if (!pg) return;
          if (wraps[i]) pg.surf = wraps[i];
          polys.push(pg);
        });
      }
    }
    if (!chain.closed) {
      var first = rings[0], lastR = rings[rings.length - 1];
      triangulate(pts).forEach(function (t) {
        pushPoly(polys, [first[t[0]], first[t[1]], first[t[2]]], tag);
        pushPoly(polys, [lastR[t[2]], lastR[t[1]], lastR[t[0]]], tag);
      });
    }
    return ensureOutward(polys);
  }

  // Group the selected chords by circle and walk each group into chains of vertices turning positively about d.
  function arcChains(arcEdges) {
    var groups = {}, order = [];
    arcEdges.forEach(function (x) { var g = groups[x.info.key]; if (!g) { g = groups[x.info.key] = []; order.push(g); } g.push(x); });
    var chains = [];
    order.forEach(function (g) {
      var adj = {}, used = {};
      g.forEach(function (x, i) { (adj[x.e.ka] = adj[x.e.ka] || []).push(i); (adj[x.e.kb] = adj[x.e.kb] || []).push(i); });
      function walk(startKey) {
        var keys = [startKey], cur = startKey, closed = false;
        for (;;) {
          var next = (adj[cur] || []).filter(function (i) { return !used[i]; })[0];
          if (next == null) break;
          used[next] = true;
          var e = g[next].e, nk = e.ka === cur ? e.kb : e.ka;
          if (nk === startKey) { closed = true; break; }
          keys.push(nk); cur = nk;
        }
        return { keys: keys, closed: closed };
      }
      var pos = {};
      g.forEach(function (x) { pos[x.e.ka] = x.e.a; pos[x.e.kb] = x.e.b; });
      var starts = Object.keys(adj).filter(function (k) { return adj[k].length === 1; });
      var all = starts.concat(Object.keys(adj));
      all.forEach(function (sk) {
        if (!(adj[sk] || []).some(function (i) { return !used[i]; })) return;
        var w = walk(sk);
        if (w.keys.length < 2) return;
        var vs = w.keys.map(function (k) { return pos[k]; }), info = g[0].info;
        // turn positively about d: the second vertex at a positive angle from the first
        var e0 = norm(rfFFradial(vs[0], info.A, info.d)), v1 = norm(rfFFradial(vs[1], info.A, info.d));
        if (dot(cross(e0, v1), info.d) < 0) { vs.reverse(); w.keys.reverse(); if (w.closed) { vs.unshift(vs.pop()); w.keys.unshift(w.keys.pop()); } }
        chains.push({ info: info, vs: vs, keys: w.keys, closed: w.closed });
      });
    });
    return chains;
  }

  // corner: { V, C, u: [u1, u2, u3] (unit, leaving V along the three edges) }: the cube between V and C minus the ball.
  function sphereCornerTool(corner, size, tag) {
    var C = corner.C, u1 = corner.u[0], u2 = corner.u[1], u3 = corner.u[2], r = size, AG = rfFMarcAngles(Math.PI / 2, rfFFsegs(size, Math.PI / 2)), n = AG.length - 1, i, j;   // rfFM: the edge rounds' chord angles
    function P(a, b, c) { return sub(C, add(scale(u1, a), add(scale(u2, b), scale(u3, c)))); }
    var hand = dot(cross(u1, u2), u3) > 0 ? 1 : -1;
    var S = { t: 'sph', o: C.slice(), d: u1.slice(), r: r }, polys = [], ring = [];
    // the octant as a revolve about u1: profile β from the ring (ρ = r, z = 0) to the pole (ρ = 0, z = −r), rings φ from −u2 to −u3
    for (i = 0; i <= n; i++) {
      var be = AG[i], rho = i === n ? 0 : r * Math.cos(be), z = i === 0 ? 0 : -r * Math.sin(be), row = [];
      if (i === n) z = -r;
      for (j = 0; j <= n; j++) {
        var phi = AG[j], cb = j === 0 ? 1 : j === n ? 0 : Math.cos(phi), sb = j === 0 ? 0 : j === n ? 1 : Math.sin(phi);
        row.push(P(-z, rho * cb, rho * sb));
      }
      ring.push({ rho: rho, z: z, pts: row });
    }
    var dphi = hand * AG[1];
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      var a = ring[i], b = ring[i + 1], q = [a.pts[j], b.pts[j], b.pts[j + 1], a.pts[j + 1]], clean = [];
      for (var t = 0; t < 4; t++) if (len(sub(q[t], q[(t + 1) % 4])) > 1e-9 * Math.max(1, r)) clean.push(q[t]);
      var pg = clean.length >= 3 ? poly(clean, tag) : null;
      if (!pg) continue;
      pg.surf = { s: S, P: [a.rho, a.z], Q: [b.rho, b.z], e0: scale(u2, -1), dphi: dphi };
      polys.push(pg);
    }
    // three faces through C (square minus the quarter disc) and three full squares through V
    function lface(pt, arcPts) {
      var loop = [[r, 0], [r, r], [0, r]].concat(arcPts), loop3 = loop.map(function (p) { return pt(p[0], p[1]); });
      if (signedArea(loop) < 0) { loop.reverse(); loop3.reverse(); }
      triangulate(loop).forEach(function (tr) { pushPoly(polys, [loop3[tr[0]], loop3[tr[1]], loop3[tr[2]]], tag); });
    }
    // each loop: (r, 0), (r, r), (0, r), then back along the quarter arc to (r, 0) (its inner points only)
    var ringArc = [], meridArc = [];
    for (j = n - 1; j >= 1; j--) ringArc.push([r * Math.cos(AG[j]), r * Math.sin(AG[j])]);
    for (i = 1; i <= n - 1; i++) meridArc.push([r * Math.sin(AG[i]), r * Math.cos(AG[i])]);
    lface(function (b, c) { return P(0, b, c); }, ringArc);        // ⊥ u1 through C: the ring z = 0
    lface(function (a, b) { return P(a, b, 0); }, meridArc);       // ⊥ u3: the meridian φ = 0 (a = r sin β, b = ρ)
    lface(function (a, c) { return P(a, 0, c); }, meridArc);       // ⊥ u2: the meridian φ = π/2
    [[function (b, c) { return P(r, b, c); }], [function (a, c) { return P(a, r, c); }], [function (a, b) { return P(a, b, r); }]].forEach(function (F) {
      var pt = F[0], loop = [[0, 0], [r, 0], [r, r], [0, r]].map(function (p) { return pt(p[0], p[1]); });
      pushPoly(polys, loop, tag);
    });
    // outward: the planar faces away from the cube's centre, the sphere facets towards C (the tool is outside the ball)
    var mid = P(r / 2, r / 2, r / 2);
    polys.forEach(function (pg) {
      var cen = [0, 0, 0];
      pg.vertices.forEach(function (v) { cen = add(cen, arr(v.pos)); });
      cen = scale(cen, 1 / pg.vertices.length);
      var want = pg.surf ? sub(C, cen) : sub(cen, mid);
      if (dot(arr(pg.plane.normal), want) < 0) pg.flip();
    });
    return CSG.fromPolygons(polys);
  }

  // -> { cut: CSG|null, add: CSG|null, count }
  function buildEdgeFeature(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to ' + f.type + ' yet.');
    var size = f.type === 'chamfer' ? +f.d : +f.r;
    if (!(size > 0)) throw new Error((f.type === 'chamfer' ? 'Distance' : 'Radius') + ' must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var allEdges = bodyEdges(mesh), edges = allEdges.filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
    var tol = pickTol(ctx.units, size);
    var selected = resolveEdges(f.edges, edges, tol);   // r16/picktol
    if (!selected.length) throw new Error('No edges found for this ' + f.type + '. Select edges again.');
    // rfFF: circular edges; a chained pick takes the whole circle (SolidWorks' tangent propagation), however few its chords
    var infoOf = new Map();
    function info(e) { if (!infoOf.has(e)) infoOf.set(e, arcEdgeInfo(e, mesh, f.type)); return infoOf.get(e); }
    var seen = {};
    selected.forEach(function (e) { seen[e.ka + '|' + e.kb] = true; });
    (f.edges || []).forEach(function (spec) {
      if (spec.chain === false) return;
      var hit = resolveEdges([{ at: spec.at, chain: false }], edges, tol)[0], hi = hit && info(hit);
      if (!hi) return;
      var grow = true;
      while (grow) {
        grow = false;
        edges.forEach(function (e) {
          if (seen[e.ka + '|' + e.kb]) return;
          var ii = info(e);
          if (!ii || ii.key !== hi.key) return;
          if (!selected.some(function (x) { return info(x) && info(x).key === hi.key && (x.ka === e.ka || x.ka === e.kb || x.kb === e.ka || x.kb === e.kb); })) return;
          seen[e.ka + '|' + e.kb] = true; selected.push(e); grow = true;
        });
      }
    });
    var byKey = {};
    selected.forEach(function (e) { (byKey[e.ka] = byKey[e.ka] || []).push(e); (byKey[e.kb] = byKey[e.kb] || []).push(e); });
    var arcs = [], straight = [];
    selected.forEach(function (e) { var ii = info(e); if (ii) arcs.push({ e: e, info: ii }); else straight.push(e); });
    // rfFP: a chord of a curve between two analytic curved faces (the saddle where a pipe tee's branch meets the run:
    // cylinder × cylinder) has no exact tool here: the chord-by-chord prisms are not planar where they meet (2e-3) and
    // left ~1100 open edges, or added 11 % more than OpenCascade's round. Refused cleanly; OpenCascade builds it.
    // A straight edge along both faces' rulings (two cylinders with axes parallel to it) is a true line and still builds.
    straight.forEach(function (e) {
      var S0 = rfFFsurf(mesh.faces[e.faces[0]]), S1 = rfFFsurf(mesh.faces[e.faces[1]]);
      if (!S0 || !S1) return;
      function ruling(S) { return S.t === 'cyl' && S.d && Math.abs(dot(norm(S.d), e.dir)) > 1 - 1e-6; }
      if (ruling(S0) && ruling(S1)) return;
      throw new Error('Failed to create ' + f.type + '. Anvil\'s kernel cannot ' + (f.type === 'chamfer' ? 'chamfer' : 'round') + ' an edge where two curved faces meet in a curve (OpenCascade can: Tools ▸ OpenCascade kernel).');
    });
    // rfFM: a round that does not fit (its setback runs off a face, into a hole or a boss; it breaks through a thin wall)
    // is refused as SolidWorks refuses it, instead of cutting a wrong body
    rfFMband = Math.min(0.05 * size, ctx.units === 'in' ? 0.05 / 25.4 : 0.05);
    var eta = Math.max(1e-3 * size, 1e-4), tester = null, chainList = arcChains(arcs);
    K.fitProbe.last = null; K.fitProbe.soft = 0;
    // rfFP: does the setback point P = V + s·dE + t·u (V an end of the round's edge e, dE along e from V, u into face fi
    // square to e) leave face fi across the face's own corner at V? True when fi has one sharp outline edge w leaving
    // V, not selected in this feature, of the given convexity, and P lies beyond it (atan2(t, s) > the corner's angle
    // between dE and w). A convex round then runs out into air at that corner (the mitre between two chamfers on the
    // Rounded handle's base: = OpenCascade to 1e-12), as SolidWorks / OpenCascade trim it, instead of not fitting.
    // Only convex 'under' misses use it: a concave round there would hang off its face, and an arc chain on a cone
    // pinching out between hex flats (Hex nut) is built wrong by arcChainTool (70× OpenCascade's volume), so stays refused.
    function rfFPcorner(e, fi, vk, dE, u, s, t, convex) {
      var got = [];
      allEdges.forEach(function (x) { if (x !== e && (x.ka === vk || x.kb === vk) && x.faces.indexOf(fi) >= 0) got.push(x); });
      if (got.length !== 1 || got[0].smooth || got[0].convex !== convex || seen[got[0].ka + '|' + got[0].kb]) return false;
      var w = got[0].ka === vk ? got[0].dir : scale(got[0].dir, -1), ph = Math.atan2(dot(w, u), dot(w, dE));
      return ph > 1e-3 && ph < Math.PI / 2 + 1e-9 && Math.atan2(t, s) > ph + 1e-3;
    }
    function probe(pts3) {
      if (!pts3.length) return;
      if (!tester) tester = ctx.body.pointTester();
      pts3.forEach(function (q) {
        if (tester(q.p) === q.want) return;
        K.fitProbe.last = q.why + (q.at != null ? '@' + q.at : ''); K.fitProbe.lastP = q.p;
        if (q.soft) { K.fitProbe.soft++; return; }
        if (K.fitProbe.on) throw rfFMrefuse(f.type);
      });
    }
    straight.forEach(function (e) {
      var tA = rfFFplanar(mesh.faces[e.faces[0]]), tB = rfFFplanar(mesh.faces[e.faces[1]]);
      if (!tA && !tB) return;
      var x = e.ins[0], y = cross(e.dir, x), uB = [dot(e.ins[1], x), dot(e.ins[1], y)];
      var pr = rfFMprobes(f.type, size, [0, 0], [1, 0], uB, e.convex, eta, tA, tB);
      // every half setback along the edge (3 to 64 stations, clear of the ends): a boss beside the edge is found
      var th = Math.acos(Math.max(-1, Math.min(1, uB[0]))), tset = f.type === 'chamfer' ? size : size / Math.tan(th / 2);
      var ns = Math.max(3, Math.min(64, Math.ceil(e.len / (0.5 * tset))));
      for (var si = 0; si < ns; si++) {
        var m = add(e.a, scale(sub(e.b, e.a), (si + 0.5) / ns)), sa = e.len * (si + 0.5) / ns, sb = e.len - sa;
        probe(pr.map(function (q) {
          // rfFP: a convex round's setback that leaves its face across the face's own corner at an end of the edge (the
          // face narrows there: a mitre between two chamfers) is the round running out into air at that corner, not a
          // misfit (a concave round's material would hang off the face there: OpenCascade refuses those too)
          var soft = e.convex && q.why === 'under' && [[true, sa], [false, sb]].some(function (c) {
            return rfFPcorner(e, e.faces[q.side], c[0] ? e.ka : e.kb, c[0] ? e.dir : scale(e.dir, -1), e.ins[q.side], c[1], q.t, true);
          });
          return { p: add(m, add(scale(x, q.p[0]), scale(y, q.p[1]))), want: q.want, why: q.why, soft: soft, at: 's' + si + '/' + ns };
        }));
      }
    });
    chainList.forEach(function (ch) {
      var I = ch.info;
      if (I.circ) return;
      var pr = rfFMprobes(f.type, size, [I.Rc, 0], I.uP, I.uC, I.conv, eta, true, true), vs = ch.vs, k0 = ch.closed ? 0 : 1, k1 = ch.closed ? vs.length : vs.length - 1;
      var step = Math.max(1, Math.floor((k1 - k0) / 4));
      // rfFP: an open concave chain ending on a wall (a rib across a hole's floor: one planar face at the end vertex
      // that is neither face of the round, meeting both in concave edges) ends on that wall's plane, as arcChainTool
      // caps it: probe points behind the wall (inside its material) say nothing about the fit; the chain's middle vertex
      // is probed without that excuse (R1 in a 0.5-wide half of a Ø3 hole split by a rib: OpenCascade refuses it)
      var walls = ch.closed || I.conv ? [] : [0, vs.length - 1].map(function (c) {
        var vk = ch.keys[c], nbs = allEdges.filter(function (x) { return (x.ka === vk || x.kb === vk) && !seen[x.ka + '|' + x.kb]; });
        var own = {}, wf = {}, ok = nbs.length === 2;
        arcs.forEach(function (x) { if (x.e.ka === vk || x.e.kb === vk) x.e.faces.forEach(function (fi) { own[fi] = true; }); });
        nbs.forEach(function (x) { if (x.smooth || x.convex !== false) ok = false; x.faces.forEach(function (fi) { if (!own[fi]) wf[fi] = true; }); });
        var ws = Object.keys(wf);
        if (!ok || ws.length !== 1 || !rfFFplanar(mesh.faces[+ws[0]])) return null;
        return { V: vs[c], n: mesh.faces[+ws[0]].normal };
      }).filter(function (w) { return w; });
      var ks = [], kMid = Math.floor((vs.length - 1) / 2);
      for (var k = k0; k < k1; k += step) ks.push(k);
      if (walls.length && ks.indexOf(kMid) < 0) ks.push(kMid);
      ks.forEach(function (k) {
        var rv = rfFFradial(vs[k], I.A, I.d), rho = len(rv), uk = scale(rv, 1 / rho), sc = rho / I.Rc;
        probe(pr.map(function (q) {
          var P = add(I.A, add(scale(I.d, q.p[1]), scale(uk, q.p[0] * sc)));
          var soft = k !== kMid && walls.some(function (w) { return dot(sub(P, w.V), w.n) < -0.5 * eta; });
          return { p: P, want: q.want, why: q.why, soft: soft, at: 'a' + k + '/' + vs.length + (ch.closed ? 'c' : '') };
        }));
      });
    });
    // rfFP: the tools are made by makeTools() so a cracked result can be retried with another band (see below)
    function makeTools() {
    var cuts = [], adds = [];
    // rfFM: an open chain's end at a corner with one selected straight edge takes that edge's mitre plane (see arcChainTool)
    chainList.forEach(function (ch) {
      if (ch.closed || ch.vs.length < 2) return;
      var m = ch.vs.length;
      ch.caps = [[ch.keys[0], ch.vs[0], ch.vs[1]], [ch.keys[m - 1], ch.vs[m - 1], ch.vs[m - 2]]].map(function (q) {
        var st = (byKey[q[0]] || []).filter(function (x) { return !info(x); });        if (st.length !== 1) return null;
        var s = st[0], u1 = norm(sub(q[2], q[1])), u2 = s.ka === q[0] ? s.dir : scale(s.dir, -1);
        if (dot(u1, u2) < -0.97) return null;   // runs on tangentially: capFor's meridian cap
        var nm = sub(u1, u2);
        return len(nm) < 1e-6 ? null : { v: q[1], n: norm(nm) };
      });
    });
    chainList.forEach(function (ch) { (ch.info.conv ? cuts : adds).push(arcChainTool(ch, f.type, size, f.id)); });
    // spherical corners: three mutually perpendicular convex straight edges between planar faces at one vertex
    var corners = {}, chamferCorners = [];
    Object.keys(byKey).forEach(function (vk) {
      var es = byKey[vk];
      if (es.length !== 3 || !es.every(function (e) { return e.convex && !info(e) && e.faces.every(function (fi) { return rfFFplanar(mesh.faces[fi]); }); })) return;
      var V = es[0].ka === vk ? es[0].a : es[0].b;
      var us = es.map(function (e) { return e.ka === vk ? e.dir : scale(e.dir, -1); });
      if (Math.abs(dot(us[0], us[1])) > 1e-6 || Math.abs(dot(us[0], us[2])) > 1e-6 || Math.abs(dot(us[1], us[2])) > 1e-6) return;
      if (!es.every(function (e) { return e.len > size * (1 + 1e-9); })) return;
      if (f.type === 'chamfer') chamferCorners.push({ V: V, u: us });
      else corners[vk] = { V: V, C: add(V, scale(add(us[0], add(us[1], us[2])), size)), u: us };
    });
    Object.keys(corners).forEach(function (vk) { cuts.push(sphereCornerTool(corners[vk], size, f.id)); });
    // rfFM: three equal chamfers at a square corner meet in a triangle through the three faces' setback corners
    // (V + d (ui + uj)), as SolidWorks and OpenCascade build it; the edge prisms alone left the corner under that
    // triangle (a box with every edge chamfered 9: +3.7 % of the removed volume)
    chamferCorners.forEach(function (cc) {
      var V = cc.V, u = cc.u, k = 0.5 * size, far = 2 * size + 2 * k;
      function P(a, b, c) { return add(V, add(scale(u[0], a), add(scale(u[1], b), scale(u[2], c)))); }
      var o = P(-k, -k, -k), p1 = P(far, -k, -k), p2 = P(-k, far, -k), p3 = P(-k, -k, far), polys = [];   // x + y + z = 2d
      [[o, p2, p1], [o, p1, p3], [o, p3, p2], [p1, p2, p3]].forEach(function (t) { pushPoly(polys, t, f.id); });
      cuts.push(ensureOutward(polys));
    });
    function capFor(e, atA, nbs) {
      var vk = atA ? e.ka : e.kb, v = atA ? e.a : e.b;
      if (corners[vk]) return { v: corners[vk].C, n: e.dir, ext: 0 };
      // a straight edge running on tangentially into a filleted circle stops at the circle's meridian plane there
      var arcNb = nbs.filter(function (x) { return info(x); });
      if (arcNb.length === 1 && nbs.length === 1) {
        var I = info(arcNb[0]), tn = norm(cross(I.d, norm(rfFFradial(v, I.A, I.d))));
        if (Math.abs(dot(tn, e.dir)) > 0.97) return { v: v, n: tn, ext: 0 };
      }
      // rfFF2: an edge whose end runs into a round that one of its faces blends into tangentially (an edge left by an
      // earlier fillet, SolidWorks P07): the round rolls on until it leaves the body, as SolidWorks trims it against
      // that round; the tool runs on past the end by the round's radius + this size (a wall square to the edge never
      // continues a face tangentially, so it is never cut into)
      if (!nbs.length) {
        var run = 0, atRound = false;
        // fillets only: what SolidWorks does with a chamfer there is not measured yet (the Chamfered block example keeps its end)
        allEdges.forEach(function (s) {
          if (!s.smooth || (s.ka !== vk && s.kb !== vk) || !s.faces.some(function (fi) { return e.faces.indexOf(fi) >= 0; })) return;
          // rfFM: a plane face of the edge blending into another face's round, not a seam between two facets of the edge's
          // own curved face (a lone chord of the Funnel's bore ran on 21 mm along its tangent and cut a slab out)
          if (!s.faces.some(function (fi) { return e.faces.indexOf(fi) >= 0 && rfFFplanar(mesh.faces[fi]); })) return;
          s.faces.forEach(function (fi) { if (e.faces.indexOf(fi) >= 0) return; var S = rfFFsurf(mesh.faces[fi]); if (S) { atRound = true; if (f.type === 'fillet') run = Math.max(run, size + (S.t === 'tor' ? S.R + S.r : S.r)); } });
        });
        if (run > 0) return { v: v, n: null, ext: run };
        // rfFM: a chamfer keeps its end there, exactly on the plane square to the edge at the tangent line: its 0.01
        // overshoot cut the round's first facet (now 23°, rfFMarcAngles) and the BSP left two zero-area polygons; the
        // notched facets also kept their full cylinder correction: Chamfered block was 40.15 mm³ light (4e-4), now it
        // is the formula 80·50·25 − 4(1 − π/4)·36·25 − 2·212 − π·4.5²·25 − π(8² − 4.5²)·6 = 96388.334
        // (not where a face at the end already lies in that plane, square to the edge: the edge left by such a chamfer
        // then overshoots into air as before; a cap in that plane gave the BSP coplanar faces and a stack overflow)
        var squareEnd = false;
        if (atRound) allEdges.forEach(function (s) {
          if (s.ka !== vk && s.kb !== vk) return;
          s.faces.forEach(function (fi) { if (e.faces.indexOf(fi) < 0 && Math.abs(dot(mesh.faces[fi].normal, e.dir)) > 1 - 1e-6) squareEnd = true; });
        });
        if (atRound && !squareEnd) return { v: v, n: e.dir.slice(), ext: 0 };
        // a wall the edge runs into (a face at the end whose outward normal faces back along the edge): stop exactly on
        // the wall's plane (the 0.01 overshoot of a free end cut a sliver out of the wall)
        var out = atA ? scale(e.dir, -1) : e.dir, wall = null, endf = null;
        allEdges.forEach(function (s) {
          if (s.ka !== vk && s.kb !== vk) return;
          s.faces.forEach(function (fi) {
            if (e.faces.indexOf(fi) >= 0 || !rfFFplanar(mesh.faces[fi])) return;
            var wn = mesh.faces[fi].normal;
            if (dot(wn, out) < -0.5 && (!wall || dot(wn, out) < dot(wall, out))) wall = wn;
            if (dot(wn, out) > 0.5 && (!endf || dot(wn, out) > dot(endf, out))) endf = wn;
          });
        });
        if (wall) return { v: v, n: wall.slice(), ext: 0 };
        // rfFM: a concave edge ending at the part's end face (the inside corner of an L, run out to its side) stops on
        // that face's plane: the 0.01 overshoot of a free end added a sliver of material outside the part
        if (endf && !e.convex) return { v: v, n: endf.slice(), ext: 0 };
        // rfFM: a convex edge ending where the part's end faces lean back over it (the Hex nut's corner edges, cut off by
        // the 45° chamfer cone) runs on until its section has left the body, as SolidWorks / OpenCascade trim the round
        // against those faces: by t · tan ψ (ψ ≤ 60° the end face's tilt from square to the edge, t the setback), × 1.5
        if (e.convex) {
          var minC = 1, any = false;
          allEdges.forEach(function (s) {
            if (s.ka !== vk && s.kb !== vk) return;
            s.faces.forEach(function (fi) { if (e.faces.indexOf(fi) < 0) { any = true; minC = Math.min(minC, dot(mesh.faces[fi].normal, out)); } });
          });
          if (any && minC > 0.5 && minC < 1 - 1e-9) {   // not a round continuing the face (its first chord leans 12°)
            var th = Math.acos(Math.max(-1, Math.min(1, dot(e.ins[0], e.ins[1])))), tset = f.type === 'chamfer' ? size : size / Math.tan(th / 2);
            return { v: v, n: null, ext: 0.01 + 1.5 * tset * Math.sqrt(1 - minC * minC) / minC };
          }
        }
      }
      return mitreCap(e, atA, nbs);
    }
    straight.forEach(function (e) {
      var nbA = byKey[e.ka].filter(function (x) { return x !== e; }), nbB = byKey[e.kb].filter(function (x) { return x !== e; });
      var tool = edgeTool(e, mesh, f.type, size, capFor(e, true, nbA), capFor(e, false, nbB), f.id);
      (e.convex ? cuts : adds).push(tool);
    });
    return [cuts.length ? unionAll(cuts) : null, adds.length ? unionAll(adds) : null];
    }
    // rfFP: a fillet / chamfer whose result has open edges is never returned: the boolean is done here, checked (open
    // edges of the welded, T-junction-split mesh, more than the body had before), and handed to the caller's own
    // `body.subtract(cut)` / `.union(add)` (kernel-rebuild.js, worker / PM previews) through a one-shot memo, so it
    // is not done twice. A cracked result (the BSP's 1e-5 where a tool face lies nearly on a body face) is retried with
    // the tools' band past the faces halved, then doubled; still cracked, the feature is refused, the body kept.
    var band0 = rfFMband, tools = makeTools(), cutT = tools[0], addT = tools[1];
    if (K.openGuard.on && (cutT || addT)) {
      // head (2026-10-29c): before refusing, one more try with the tools at their own band and csg.js's wider crack
      // healing for this boolean only (healWide 20 EPSILON + healFill; off by default because globally they change
      // rfCW / rfBZ flats): a wheel's R.1 rim fillet after an R.25 one had 6 open edges and built before the guard
      var before = ctx.body, open0 = rfFPopenCount(before), done = false;
      var CO = (typeof CSG !== 'undefined' && CSG.options) || {}, keepW = CO.healWide, keepF = CO.healFill;
      [0.5, 2, 'heal', null].forEach(function (bf) {
        if (done) return;
        var mid, res;
        try { mid = cutT ? before.subtract(cutT) : before; res = addT ? mid.union(addT) : mid; }
        finally { CO.healWide = keepW; CO.healFill = keepF; }
        if (rfFPopenCount(res) <= open0) {
          done = true;
          if (cutT) rfFPmemo(before, 'subtract', cutT, mid);
          if (addT) rfFPmemo(mid, 'union', addT, res);
          return;
        }
        if (bf == null) return;
        rfFMband = bf === 'heal' ? band0 : band0 * bf; tools = makeTools(); cutT = tools[0]; addT = tools[1];
        if (bf === 'heal') { CO.healWide = 2e-4; CO.healFill = true; }
      });
      rfFMband = band0;
      if (!done) throw new Error('Failed to create ' + f.type + '. Anvil\'s kernel could not close the ' + (f.type === 'chamfer' ? 'chamfered' : 'rounded') + ' faces on these edges (the result would have gaps).');
    }
    return { cut: cutT, add: addT, count: selected.length };
  }
  // rfFP: open and non-manifold edges of a body (edges of its welded, T-junction-split triangle mesh used by one or by
  // three or more triangles, at least 1e-9 × its diagonal long), cached on the body
  function rfFPopenCount(body) {
    if (!body || !body.polygons || typeof Exchange === 'undefined' || !Exchange.bodyMesh) return 0;
    if (body._fpOpen != null) return body._fpOpen;
    var m = Exchange.bodyMesh(body), t = m.triangles, P = m.positions, use = {}, n = 0;
    for (var i = 0; i < t.length; i += 3) for (var k = 0; k < 3; k++) {
      var a = t[i + k], b = t[i + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a;
      use[key] = (use[key] || 0) + 1;
    }
    var bb = body.getBounds ? body.getBounds() : null, diag = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) : 1;
    Object.keys(use).forEach(function (key) {
      if (use[key] === 2) return;   // 1: open; 3 or more: non-manifold
      var ab = key.split('_'), p = +ab[0] * 3, q = +ab[1] * 3;
      if (Math.hypot(P[p] - P[q], P[p + 1] - P[q + 1], P[p + 2] - P[q + 2]) > 1e-9 * diag) n++;
    });
    try { Object.defineProperty(body, '_fpOpen', { value: n, enumerable: false, writable: true, configurable: true }); } catch (e) { /* frozen */ }
    return n;
  }
  // rfFP: obj[method](arg) returns `out` once (the boolean already done by buildEdgeFeature), then the method is the
  // prototype's again; any other argument goes to the prototype's method
  function rfFPmemo(obj, method, arg, out) {
    try {
      Object.defineProperty(obj, method, { configurable: true, enumerable: false, writable: true, value: function (x) {
        var proto = Object.getPrototypeOf(obj)[method];
        if (x !== arg) return proto.apply(this, arguments);
        delete obj[method];
        return out;
      } });
    } catch (e) { /* frozen: the caller does the boolean itself */ }
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  // rfFP: the fit probe's state (tests, fuzz): on = refuse a misfit; last / lastP = the last miss ('under' / 'over' /
  // 'corner' @ station) and its point; soft = misses excused this build (a round running out at a face corner / wall)
  K.fitProbe = { on: true, last: null, lastP: null, soft: 0 };
  // rfFP: on = check every fillet / chamfer result for open edges before returning it (see buildEdgeFeature)
  K.openGuard = { on: true };
  K.buildEdgeFeature = buildEdgeFeature; K.meshFromBody = meshFromBody; K.meshQuality = meshQuality; K.faceOutline = faceOutline;
  K.outlineOptions = outlineOptions; K.bodyEdges = bodyEdges; K.resolveEdges = resolveEdges; K.pointSegmentDistance = pointSegmentDistance; K.pickTol = pickTol;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.bodyEdges = bodyEdges; _.buildEdgeFeature = buildEdgeFeature; _.ekey = ekey; _.faceOutline = faceOutline; _.meshFromBody = meshFromBody;
  _.pointSegmentDistance = pointSegmentDistance; _.resolveEdges = resolveEdges; _.pickTol = pickTol;
  _.planeClusters = planeClusters; _.planeTol = planeTol; _.bodyDiag = bodyDiag;

  // ------------------------------------------------------------------ rfDZ: Wrap scribe edges
  // wrapSplit(mesh, i, j) -> true when mesh faces i and j lie on one surface but are kept apart by a Wrap scribe: Anvil's
  // facets inside a scribe carry surface records marked w (kernel-features.js scribeSplit); OpenCascade's split faces
  // are different B-rep faces (face tags) on one plane or one analytic surface (after UnifySameDomain only a kept split
  // leaves two). Their common edge is a model edge, not a seam between facets.
  function wrapSplit(mesh, i, j) {
    var fa = mesh.faces[i], fb = mesh.faces[j], pa = fa && fa.polys && fa.polys[0], pb = fb && fb.polys && fb.polys[0];
    if (!pa || !pb || (fa.body || 0) !== (fb.body || 0) || fa.part !== fb.part) return false;
    var sa = pa.surf && pa.surf.s, sb = pb.surf && pb.surf.s, wa = sa && sa.w != null ? sa.w : null, wb = sb && sb.w != null ? sb.w : null;
    if (wa === wb && (pa.face == null || pb.face == null || pa.face === pb.face)) return false;
    if (!sa && !sb) return dot(fa.normal, fb.normal) > 1 - 1e-9 && Math.abs(fa.w - fb.w) < 1e-6 * (1 + Math.abs(fa.w));
    if (!sa || !sb || sa.t !== sb.t || Math.abs((sa.r || 0) - (sb.r || 0)) > 1e-7 * (1 + Math.abs(sa.r || 0)) || Math.abs((sa.k || 0) - (sb.k || 0)) > 1e-9) return false;
    if (Math.abs(Math.abs(dot(norm(sa.d), norm(sb.d))) - 1) > 1e-9) return false;
    var v = sub(sb.o, sa.o), dd = norm(sa.d);
    return len(sub(v, scale(dd, dot(v, dd)))) < 1e-7 * (1 + len(sa.o)) && (sa.t !== 'cone' || Math.abs(dot(v, dd)) < 1e-7 * (1 + len(sa.o)));
  }
  K.wrapSplit = wrapSplit;
})(Kernel, Kernel._);
