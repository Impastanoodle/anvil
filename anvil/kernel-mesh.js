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
      var bi = p.body || 0, tag = bi + (p.face != null ? '|f' + p.face : '') + (p.part != null ? '|p' + p.part : '');   // OpenCascade faces / assembly parts stay apart
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
    var boundary = split.filter(function (e) {
      var twin = e[1].k + '>' + e[0].k;
      return !count[twin];
    });
    // chain
    var next = {};
    boundary.forEach(function (e) { next[e[0].k] = e; });
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
    // simplify collinear runs
    loops = loops.map(function (l) {
      var out = [];
      for (var i = 0; i < l.length; i++) {
        var p = l[(i + l.length - 1) % l.length], q = l[i], r = l[(i + 1) % l.length];
        var cr = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
        if (Math.abs(cr) > 1e-7) out.push(q);
      }
      return out.length >= 3 ? out : l;
    });
    return { loops: loops, plane: plane, face: face };
  }

  // ------------------------------------------------------------------ body edges (for display, picking, chamfer/fillet)
  var COS_SMOOTH = Math.cos(22 * Math.PI / 180);
  function ekey(p) { return Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000); }

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
      for (var s = 0; s <= segs; s++) { pts.push(add(c, rotatePoint(vA, [0, 0, 0], axis, sweep * s / segs))); arcPt.push(true); }
      // the round is a true cylinder about the edge line through c when both faces are planar (a fillet along a
      // chain of facets of a curved face is a polygonal approximation of a torus: no record)
      var planarFaces = [fa, fb].every(function (f) { return !(f.polys || []).some(function (p) { return p.surf; }); });
      if (planarFaces) S = { t: 'cyl', o: c, d: dir.slice(), r: size };
    }
    var last = pts[pts.length - 1], first = pts[0];
    if (e.convex) {
      pts.push(add(last, scale(nB, ext)), add(first, scale(nA, ext)));
    } else {
      pts.push(sub(m, scale(add(dA, dB), ext)));
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

  // -> { cut: CSG|null, add: CSG|null, count }
  function buildEdgeFeature(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to ' + f.type + ' yet.');
    var size = f.type === 'chamfer' ? +f.d : +f.r;
    if (!(size > 0)) throw new Error((f.type === 'chamfer' ? 'Distance' : 'Radius') + ' must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
    var selected = resolveEdges(f.edges, edges, pickTol(ctx.units, size));   // r16/picktol
    if (!selected.length) throw new Error('No edges found for this ' + f.type + '. Select edges again.');
    var byKey = {};
    selected.forEach(function (e) { (byKey[e.ka] = byKey[e.ka] || []).push(e); (byKey[e.kb] = byKey[e.kb] || []).push(e); });
    var cuts = [], adds = [];
    selected.forEach(function (e) {
      var nbA = byKey[e.ka].filter(function (x) { return x !== e; }), nbB = byKey[e.kb].filter(function (x) { return x !== e; });
      var tool = edgeTool(e, mesh, f.type, size, mitreCap(e, true, nbA), mitreCap(e, false, nbB), f.id);
      (e.convex ? cuts : adds).push(tool);
    });
    return { cut: cuts.length ? unionAll(cuts) : null, add: adds.length ? unionAll(adds) : null, count: selected.length };
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.buildEdgeFeature = buildEdgeFeature; K.meshFromBody = meshFromBody; K.meshQuality = meshQuality; K.faceOutline = faceOutline;
  K.outlineOptions = outlineOptions; K.bodyEdges = bodyEdges; K.resolveEdges = resolveEdges; K.pointSegmentDistance = pointSegmentDistance; K.pickTol = pickTol;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.bodyEdges = bodyEdges; _.buildEdgeFeature = buildEdgeFeature; _.ekey = ekey; _.faceOutline = faceOutline; _.meshFromBody = meshFromBody;
  _.pointSegmentDistance = pointSegmentDistance; _.resolveEdges = resolveEdges; _.pickTol = pickTol;
  _.planeClusters = planeClusters; _.planeTol = planeTol; _.bodyDiag = bodyDiag;
})(Kernel, Kernel._);
