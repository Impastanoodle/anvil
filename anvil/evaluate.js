// evaluate.js — the Evaluate tab's analyses, as plain functions over the kernel's meshes and bodies (no DOM, no three.js):
//   Check                 geometry validation of a triangle mesh or a CSG body: open edges, non-manifold edges,
//                         zero-area faces, self-intersections (checkMesh / checkBody / check)
//   Zebra Stripes         smooth vertex normals across tangent facets for the stripe shader (smoothNormals)
//   Section Properties    area, centroid, second moments Ixx / Iyy / Ixy, polar moment, principal axes of a planar
//                         face or a sketch profile (sectionFromLoops / sectionOfFace / sectionOfSketch)
//   Draft Analysis        per-face draft angle against a pull direction, classified positive / negative /
//                         requires draft / straddle (draftAnalysis)
//   Thickness Analysis    wall thickness over the surface: min / max, area histogram, a sample field (thickness)
//   Clearance Verification  minimum distance and the two closest points between bodies (minDistance / clearance)
//   Interference Detection  common volume of every pair among the selected bodies (interference)
// Geometry is read through Kernel.meshFromBody / faceOutline / bodyEdges / sketchProfile and the CSG body API only;
// Exchange.bodyMesh (welded, T-junctions split) is used for Check when exchange.js is loaded.
var Evaluate = (function () {
  'use strict';
  var K = Kernel;

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function arr(v) { return [v.x, v.y, v.z]; }
  var DEG = 180 / Math.PI;

  // ------------------------------------------------------------------ bounding boxes and a small BVH over triangles
  function triBox(t) {
    return {
      min: [Math.min(t[0], t[3], t[6]), Math.min(t[1], t[4], t[7]), Math.min(t[2], t[5], t[8])],
      max: [Math.max(t[0], t[3], t[6]), Math.max(t[1], t[4], t[7]), Math.max(t[2], t[5], t[8])]
    };
  }
  function boxUnion(a, b) {
    return { min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])], max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])] };
  }
  // distance between two boxes (0 when they overlap)
  function boxDist(a, b) {
    var s = 0;
    for (var k = 0; k < 3; k++) {
      var d = Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k]);
      s += d * d;
    }
    return Math.sqrt(s);
  }
  function boxDiag(b) { return b ? len(sub(b.max, b.min)) : 0; }
  // tris: [[x0,y0,z0,x1,…,z2], …] -> tree of { box, left, right } / { box, items: [index…] }
  function buildBVH(tris) {
    var items = tris.map(function (t, i) { var b = triBox(t); return { i: i, box: b, c: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] }; });
    function node(list) {
      var box = list[0].box;
      for (var i = 1; i < list.length; i++) box = boxUnion(box, list[i].box);
      if (list.length <= 6) return { box: box, items: list.map(function (it) { return it.i; }) };
      var ext = sub(box.max, box.min), ax = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
      list.sort(function (p, q) { return p.c[ax] - q.c[ax]; });
      var mid = list.length >> 1;
      return { box: box, left: node(list.slice(0, mid)), right: node(list.slice(mid)) };
    }
    return items.length ? node(items) : null;
  }

  // ------------------------------------------------------------------ point / segment / triangle distances
  // closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
  function closestOnTri(p, a, b, c) {
    var ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    var d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    var bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    var vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
    var cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    var vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
    var va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) return add(b, scale(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    var den = 1 / (va + vb + vc);
    return add(a, add(scale(ab, vb * den), scale(ac, vc * den)));
  }
  // closest points between segments p1q1 and p2q2 -> [c1, c2] (Ericson 5.1.9)
  function closestSegSeg(p1, q1, p2, q2) {
    var d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    var a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), s, t;
    var EPS = 1e-18;
    if (a <= EPS && e <= EPS) return [p1, p2];
    if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
    else {
      var c = dot(d1, r);
      if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
      else {
        var b = dot(d1, d2), den = a * e - b * b;
        s = den > EPS ? clamp((b * f - c * e) / den, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
    return [add(p1, scale(d1, s)), add(p2, scale(d2, t))];
  }
  // segment pq against triangle abc: { t, u, v, point } when it crosses (Möller–Trumbore), else null.
  // strict: the crossing must be inside the segment and the triangle by more than eps (no touching).
  function segTri(p, q, a, b, c, strict, eps) {
    eps = eps || 0;
    var d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
    var scaleRef = len(e1) * len(e2) * len(d);
    if (Math.abs(det) <= 1e-12 * scaleRef) return null;   // parallel (coplanar handled elsewhere)
    var inv = 1 / det, s = sub(p, a), u = inv * dot(s, h);
    var qv = cross(s, e1), v = inv * dot(d, qv), t = inv * dot(e2, qv);
    var lo = strict ? eps : -eps, hi = strict ? 1 - eps : 1 + eps;
    if (u < lo || v < lo || u + v > hi || t < lo || t > hi) return null;
    return { t: t, u: u, v: v, point: add(p, scale(d, t)) };
  }
  function triPts(t) { return [[t[0], t[1], t[2]], [t[3], t[4], t[5]], [t[6], t[7], t[8]]]; }
  // distance between two triangles -> { d, pa, pb }
  function triTriDistance(A, B) {
    var a = triPts(A), b = triPts(B), best = { d: Infinity, pa: null, pb: null }, i, j;
    function take(pa, pb) { var dd = len(sub(pa, pb)); if (dd < best.d) { best.d = dd; best.pa = pa; best.pb = pb; } }
    // an edge of one crossing the other: they intersect
    for (i = 0; i < 3; i++) {
      var h = segTri(a[i], a[(i + 1) % 3], b[0], b[1], b[2], false, 0);
      if (h) return { d: 0, pa: h.point, pb: h.point };
      h = segTri(b[i], b[(i + 1) % 3], a[0], a[1], a[2], false, 0);
      if (h) return { d: 0, pa: h.point, pb: h.point };
    }
    for (i = 0; i < 3; i++) {
      take(a[i], closestOnTri(a[i], b[0], b[1], b[2]));
      take(closestOnTri(b[i], a[0], a[1], a[2]), b[i]);
      for (j = 0; j < 3; j++) { var cc = closestSegSeg(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3]); take(cc[0], cc[1]); }
    }
    return best;
  }

  // ------------------------------------------------------------------ mesh access
  // triangles of a kernel mesh (K.meshFromBody) or a CSG body as [[9 numbers], …] in double precision
  function trianglesOf(src) {
    if (!src) return [];
    var mesh = src.polygons ? K.meshFromBody(src) : src;
    var p = mesh.positions64 || mesh.positions, out = [];
    for (var i = 0; i + 8 < p.length; i += 9) out.push([p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8]]);
    return out;
  }

  // ------------------------------------------------------------------ Check
  // checkMesh({ positions: [x,y,z,…], triangles: [i,j,k,…] }, opts?) -> {
  //   vertices, triangles, edges, openEdges: [{ a, b }], nonManifoldEdges: [{ a, b, count, reason }],
  //   zeroAreaFaces: [{ tri, area, points }], selfIntersections: [{ t1, t2, point, tris }], ok, tolerance }
  // Vertices are welded on a 1e-6 grid first. An edge is open when one triangle uses it, non-manifold when more than
  // two do or its two triangles run it the same way (inconsistent orientation). Zero-area (degenerate, collinear): area
  // below 1e-14·diag² or below 1e-10·(longest edge)²; thin but real slivers are not flagged.
  // Self-intersection: a triangle edge crossing another triangle's interior strictly, for triangles sharing no vertex
  // (sweep over x, capped at opts.maxPairs tests).
  var WELD = 1e6;
  function checkMesh(m, opts) {
    opts = opts || {};
    var P = m.positions, T = m.triangles, map = {}, pos = [], idx = [];
    for (var v = 0; v < P.length / 3; v++) {
      var k = Math.round(P[v * 3] * WELD) + ',' + Math.round(P[v * 3 + 1] * WELD) + ',' + Math.round(P[v * 3 + 2] * WELD);
      if (map[k] == null) { map[k] = pos.length; pos.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); }
      idx.push(map[k]);
    }
    var tris = [];
    for (var t = 0; t + 2 < T.length; t += 3) tris.push([idx[T[t]], idx[T[t + 1]], idx[T[t + 2]]]);
    var box = null;
    pos.forEach(function (q) { box = box ? boxUnion(box, { min: q, max: q }) : { min: q.slice(), max: q.slice() }; });
    var diag = Math.max(boxDiag(box), 1e-9), areaTol = opts.areaTol != null ? opts.areaTol : 1e-14 * diag * diag, shapeTol = 1e-10;
    // edges
    var edges = {}, nEdges = 0;
    tris.forEach(function (tr, ti) {
      for (var i = 0; i < 3; i++) {
        var a = tr[i], b = tr[(i + 1) % 3];
        if (a === b) continue;
        var key = a < b ? a + '|' + b : b + '|' + a, e = edges[key];
        if (!e) { e = edges[key] = { a: Math.min(a, b), b: Math.max(a, b), uses: [] }; nEdges++; }
        e.uses.push({ t: ti, fwd: a < b });
      }
    });
    var open = [], nonManifold = [];
    Object.keys(edges).forEach(function (key) {
      var e = edges[key], n = e.uses.length, seg = { a: pos[e.a], b: pos[e.b] };
      if (n === 1) open.push(seg);
      else if (n > 2) nonManifold.push({ a: seg.a, b: seg.b, count: n, reason: n + ' faces share this edge' });
      else if (e.uses[0].fwd === e.uses[1].fwd) nonManifold.push({ a: seg.a, b: seg.b, count: 2, reason: 'faces on either side are oriented inconsistently' });
    });
    // zero-area triangles (including triangles with a repeated vertex)
    var zero = [], triCoords = [];
    tris.forEach(function (tr, ti) {
      var a = pos[tr[0]], b = pos[tr[1]], c = pos[tr[2]];
      var area = len(cross(sub(b, a), sub(c, a))) / 2, e2 = Math.max(dot(sub(b, a), sub(b, a)), dot(sub(c, b), sub(c, b)), dot(sub(a, c), sub(a, c)));
      triCoords.push(a.concat(b, c));
      if (area <= areaTol || area <= shapeTol * e2) zero.push({ tri: ti, area: area, points: [a, b, c] });
    });
    // self-intersections
    var selfX = [], skip = {};
    zero.forEach(function (z) { skip[z.tri] = true; });
    var order = tris.map(function (tr, i) { return { i: i, box: triBox(triCoords[i]) }; }).filter(function (o) { return !skip[o.i]; });
    order.sort(function (p, q) { return p.box.min[0] - q.box.min[0]; });
    var eps = 1e-7, boxEps = 1e-9 * diag, maxPairs = opts.maxPairs || 2e6, pairs = 0, capped = false, maxReport = opts.maxReport || 200;
    for (var i = 0; i < order.length && !capped; i++) {
      var A = order[i], ta = tris[A.i];
      for (var j = i + 1; j < order.length; j++) {
        var B = order[j];
        if (B.box.min[0] > A.box.max[0] - boxEps) break;
        if (B.box.min[1] > A.box.max[1] - boxEps || A.box.min[1] > B.box.max[1] - boxEps || B.box.min[2] > A.box.max[2] - boxEps || A.box.min[2] > B.box.max[2] - boxEps) continue;
        var tb = tris[B.i];
        if (ta[0] === tb[0] || ta[0] === tb[1] || ta[0] === tb[2] || ta[1] === tb[0] || ta[1] === tb[1] || ta[1] === tb[2] || ta[2] === tb[0] || ta[2] === tb[1] || ta[2] === tb[2]) continue;
        if (++pairs > maxPairs) { capped = true; break; }
        var hit = crossTris(triPts(triCoords[A.i]), triPts(triCoords[B.i]), eps);
        if (hit) {
          selfX.push({ t1: A.i, t2: B.i, point: hit, tris: [triPts(triCoords[A.i]), triPts(triCoords[B.i])] });
          if (selfX.length >= maxReport) { capped = true; break; }
        }
      }
    }
    return {
      vertices: pos.length, triangles: tris.length, edges: nEdges,
      openEdges: open, nonManifoldEdges: nonManifold, zeroAreaFaces: zero, selfIntersections: selfX, capped: capped,
      ok: !open.length && !nonManifold.length && !zero.length && !selfX.length, tolerance: { area: areaTol, shape: shapeTol, weld: 1 / WELD }
    };
  }
  // two triangles cross when an edge of one passes through the other's interior (strictly, by eps in parameter space)
  function crossTris(a, b, eps) {
    for (var i = 0; i < 3; i++) {
      var h = segTri(a[i], a[(i + 1) % 3], b[0], b[1], b[2], true, eps);
      if (h) return h.point;
      h = segTri(b[i], b[(i + 1) % 3], a[0], a[1], a[2], true, eps);
      if (h) return h.point;
    }
    return null;
  }
  // checkBody(csg) -> checkMesh of the body's welded mesh, plus zero-area polygons of the CSG body itself (a sliver
  // polygon is removed from the fanned mesh, so it is looked for here).
  function bodyTriangleMesh(body) {
    if (typeof Exchange !== 'undefined' && Exchange.bodyMesh) {
      var bm = Exchange.bodyMesh(body);
      return { positions: bm.positions, triangles: bm.triangles };
    }
    var positions = [], triangles = [];
    (body.polygons || []).forEach(function (p) {
      var base = positions.length / 3;
      p.vertices.forEach(function (v) { positions.push(v.pos.x, v.pos.y, v.pos.z); });
      for (var j = 1; j + 1 < p.vertices.length; j++) triangles.push(base, base + j, base + j + 1);
    });
    return { positions: positions, triangles: triangles };
  }
  function polygonArea(p) {
    var vs = p.vertices, s = [0, 0, 0];
    for (var j = 1; j + 1 < vs.length; j++) s = add(s, cross(sub(arr(vs[j].pos), arr(vs[0].pos)), sub(arr(vs[j + 1].pos), arr(vs[0].pos))));
    return len(s) / 2;
  }
  function checkBody(body, opts) {
    var r = checkMesh(bodyTriangleMesh(body), opts);
    var tol = r.tolerance.area, seen = {};
    r.zeroAreaFaces.forEach(function (z) { seen[z.points.map(function (q) { return q.join(','); }).join(';')] = true; });
    (body.polygons || []).forEach(function (p, pi) {
      var a = polygonArea(p), pts = p.vertices.map(function (v) { return arr(v.pos); }), e2 = 0;
      for (var i = 0; i < pts.length; i++) { var d = sub(pts[(i + 1) % pts.length], pts[i]); e2 = Math.max(e2, dot(d, d)); }
      if (a > tol && a > r.tolerance.shape * e2) return;
      var k = pts.slice(0, 3).map(function (q) { return q.join(','); }).join(';');
      if (seen[k]) return;
      r.zeroAreaFaces.push({ polygon: pi, area: a, points: pts });
    });
    r.ok = r.ok && !r.zeroAreaFaces.length;
    return r;
  }
  // check(bodies, names?) -> { bodies: [checkBody result + { name }], items: [{ kind, body, name, label, lines, tris, points }],
  //   counts: { open, nonManifold, zeroArea, selfIntersection }, ok }
  // items flatten every problem with drawable geometry (world coordinates) for click-to-highlight.
  var KIND_LABEL = { open: 'Open edge', nonManifold: 'Non-manifold edge', zeroArea: 'Zero-area face', selfIntersection: 'Self-intersection' };
  function check(bodies, names, opts) {
    var out = { bodies: [], items: [], counts: { open: 0, nonManifold: 0, zeroArea: 0, selfIntersection: 0 }, ok: true };
    (bodies || []).forEach(function (b, bi) {
      var name = names && names[bi] ? names[bi] : 'Body' + (bi + 1);
      var r = b && b.polygons ? checkBody(b, opts) : checkMesh(b, opts);
      r.name = name; r.index = bi;
      out.bodies.push(r);
      function item(kind, geo, extra) {
        out.counts[kind]++;
        out.items.push({ kind: kind, body: bi, name: name, label: KIND_LABEL[kind] + ' ' + out.counts[kind] + (extra ? ' — ' + extra : ''), lines: geo.lines || [], tris: geo.tris || [], points: geo.points || [] });
      }
      r.openEdges.forEach(function (e) { var L = len(sub(e.b, e.a)); item('open', { lines: [[e.a, e.b]] }, 'length ' + (L < 1e-3 ? L.toExponential(2) : round(L, 4))); });
      r.nonManifoldEdges.forEach(function (e) { item('nonManifold', { lines: [[e.a, e.b]] }, e.reason); });
      r.zeroAreaFaces.forEach(function (z) {
        var pts = z.points, lines = [];
        for (var i = 0; i < pts.length; i++) lines.push([pts[i], pts[(i + 1) % pts.length]]);
        item('zeroArea', { lines: lines, points: pts }, 'area ' + z.area.toExponential(2));
      });
      r.selfIntersections.forEach(function (s) {
        var lines = [];
        s.tris.forEach(function (t) { for (var i = 0; i < 3; i++) lines.push([t[i], t[(i + 1) % 3]]); });
        item('selfIntersection', { lines: lines, tris: s.tris, points: [s.point] });
      });
      if (!r.ok) out.ok = false;
    });
    return out;
  }
  function round(x, d) { var p = Math.pow(10, d == null ? 3 : d); return Math.round(x * p) / p; }

  // ------------------------------------------------------------------ Zebra Stripes: smooth normals
  // smoothNormals(mesh, angleDeg = 22) -> Float32Array (3 per triangle vertex, same layout as mesh.normals).
  // Each corner takes the average of the normals of the faces meeting at that point (one vote per face) whose normal is
  // within angleDeg of its own face's, so faceted curved surfaces shade (and stripe) continuously while real edges stay
  // sharp — the stripes then jump exactly where the surface is not tangent-continuous, which is what zebra shows.
  function smoothNormals(mesh, angleDeg) {
    var cosA = Math.cos((angleDeg == null ? 22 : angleDeg) / DEG);
    var p = mesh.positions64 || mesh.positions, n = mesh.triCount, faceOf = new Int32Array(n);
    mesh.faces.forEach(function (f, fi) { for (var t = f.start; t < f.start + f.count; t++) faceOf[t] = fi; });
    var vmap = {}, keys = new Array(n * 3);
    function key(i) { return Math.round(p[i] * 1e4) + ',' + Math.round(p[i + 1] * 1e4) + ',' + Math.round(p[i + 2] * 1e4); }
    for (var t = 0; t < n; t++) {
      var a = [p[t * 9], p[t * 9 + 1], p[t * 9 + 2]], b = [p[t * 9 + 3], p[t * 9 + 4], p[t * 9 + 5]], c = [p[t * 9 + 6], p[t * 9 + 7], p[t * 9 + 8]];
      var fi = faceOf[t];
      if (!(len(cross(sub(b, a), sub(c, a))) > 0)) { keys[t * 3] = keys[t * 3 + 1] = keys[t * 3 + 2] = null; continue; }
      for (var k = 0; k < 3; k++) {
        var kk = key(t * 9 + k * 3);
        keys[t * 3 + k] = kk;
        (vmap[kk] || (vmap[kk] = {}))[fi] = 1;
      }
    }
    var out = new Float32Array(n * 9);
    for (t = 0; t < n; t++) {
      var f0 = mesh.faces[faceOf[t]], n0 = f0.normal;
      for (k = 0; k < 3; k++) {
        var s = vmap[keys[t * 3 + k]] || {}, acc = [0, 0, 0];
        Object.keys(s).forEach(function (fk) {
          var nf = mesh.faces[+fk].normal;
          if (dot(nf, n0) >= cosA) acc = add(acc, scale(nf, s[fk]));
        });
        var m = len(acc) > 1e-12 ? scale(acc, 1 / len(acc)) : n0;
        out[t * 9 + k * 3] = m[0]; out[t * 9 + k * 3 + 1] = m[1]; out[t * 9 + k * 3 + 2] = m[2];
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ Section Properties
  // sectionFromLoops(loops, frame?) -> { area, centroid2, Ixx, Iyy, Ixy, J, I1, I2, angle, axis1, axis2, origin: {...},
  //   centroid (3D), frame, perimeter }
  // loops: [{ pts: [[u, v], …], hole?: bool }] in any orientation (outer loops count positive, holes negative).
  // Ixx = ∫(v − v̄)² dA, Iyy = ∫(u − ū)² dA, Ixy = ∫(u − ū)(v − v̄) dA, about axes through the centroid parallel to the
  // frame's x / y; `origin` holds the same moments about the frame origin. I1 ≥ I2 are the principal moments; axis1 is
  // the direction (angle degrees from frame x) about which the moment is I1.
  // Exact Green's-theorem integrals over the polygon edges.
  function loopIntegrals(pts) {
    var A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0, per = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length], x0 = p[0], y0 = p[1], x1 = q[0], y1 = q[1];
      var c = x0 * y1 - x1 * y0;
      A += c / 2;
      Sx += (x0 + x1) * c / 6;           // ∫x dA
      Sy += (y0 + y1) * c / 6;           // ∫y dA
      Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12;   // ∫y² dA
      Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12;   // ∫x² dA
      Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24;
      per += Math.hypot(x1 - x0, y1 - y0);
    }
    return { A: A, Sx: Sx, Sy: Sy, Ixx: Ixx, Iyy: Iyy, Ixy: Ixy, per: per };
  }
  function sectionFromIntegrals(s, frame, perimeter) {
    if (!(Math.abs(s.A) > 1e-15)) throw new Error('The section has no area.');
    var A = s.A, cx = s.Sx / A, cy = s.Sy / A;
    var Ixx = s.Ixx - A * cy * cy, Iyy = s.Iyy - A * cx * cx, Ixy = s.Ixy - A * cx * cy;
    var avg = (Ixx + Iyy) / 2, R = Math.sqrt((Ixx - Iyy) * (Ixx - Iyy) / 4 + Ixy * Ixy);
    var th = Math.abs(R) < 1e-12 * Math.max(1e-300, Math.abs(avg)) ? 0 : 0.5 * Math.atan2(-2 * Ixy, Ixx - Iyy);
    var res = {
      area: A, centroid2: [cx, cy], Ixx: Ixx, Iyy: Iyy, Ixy: Ixy, J: Ixx + Iyy, I1: avg + R, I2: avg - R,
      angle: th * DEG, axis1: [Math.cos(th), Math.sin(th)], axis2: [-Math.sin(th), Math.cos(th)],
      origin: { Ixx: s.Ixx, Iyy: s.Iyy, Ixy: s.Ixy, J: s.Ixx + s.Iyy },
      radiusOfGyration: { x: Math.sqrt(Math.max(0, Ixx) / A), y: Math.sqrt(Math.max(0, Iyy) / A) },
      perimeter: perimeter
    };
    if (frame) {
      res.frame = frame;
      res.centroid = K.to3D(frame, cx, cy);
      var d = function (v) { return norm(add(scale(frame.x, v[0]), scale(frame.y, v[1]))); };
      res.axis1World = d(res.axis1); res.axis2World = d(res.axis2); res.normal = frame.n.slice();
    }
    return res;
  }
  function sectionFromLoops(loops, frame) {
    var tot = { A: 0, Sx: 0, Sy: 0, Ixx: 0, Iyy: 0, Ixy: 0 }, per = 0;
    (loops || []).forEach(function (l) {
      var pts = l.pts || l;
      if (pts.length < 3) return;
      var s = loopIntegrals(pts), sign = (s.A >= 0 ? 1 : -1) * (l.hole ? -1 : 1);
      ['A', 'Sx', 'Sy', 'Ixx', 'Iyy', 'Ixy'].forEach(function (k) { tot[k] += sign * s[k]; });
      per += s.per;
    });
    if (tot.A < 0) Object.keys(tot).forEach(function (k) { tot[k] = -tot[k]; });
    return sectionFromIntegrals(tot, frame, per);
  }
  // sectionOfFace(mesh, faceIndex) — the planar face's polygons, integrated triangle by triangle in the face frame
  // (K.planeFromFace), so faces with holes and T-junctions need no loop reconstruction. The perimeter comes from
  // K.faceOutline.
  function sectionOfFace(mesh, faceIndex) {
    var face = mesh && mesh.faces[faceIndex];
    if (!face) throw new Error('Select a planar face.');
    var frame = K.planeFromFace(face.normal, scale(face.normal, face.w));
    var tot = { A: 0, Sx: 0, Sy: 0, Ixx: 0, Iyy: 0, Ixy: 0 };
    face.polys.forEach(function (p) {
      var uv = p.vertices.map(function (v) { return K.to2D(frame, arr(v.pos)); });
      for (var j = 1; j + 1 < uv.length; j++) {
        var s = loopIntegrals([uv[0], uv[j], uv[j + 1]]);
        ['A', 'Sx', 'Sy', 'Ixx', 'Iyy', 'Ixy'].forEach(function (k) { tot[k] += s[k]; });
      }
    });
    if (tot.A < 0) Object.keys(tot).forEach(function (k) { tot[k] = -tot[k]; });
    var per = 0;
    try { (K.faceOutline(mesh, faceIndex).loops || []).forEach(function (l) { per += loopIntegrals(l).per; }); } catch (e) { per = null; }
    var r = sectionFromIntegrals(tot, frame, per);
    r.source = 'face'; r.face = faceIndex;
    return r;
  }
  // sectionOfSketch(sketchFeature, model?, planesById?) — the closed profile of a sketch (holes by nesting, as the
  // extrude sees it), in the sketch's own frame: Ixx / Iyy / Ixy are about the sketch x / y directions.
  function sectionOfSketch(sketch, model, planesById) {
    if (!sketch || sketch.type !== 'sketch') throw new Error('Select a sketch.');
    var prof = K.sketchProfile(sketch);
    if (!prof.loops.length) throw new Error('The sketch has no closed contour.');
    var frame;
    try { frame = K.resolvePlane(sketch.plane, model, planesById); } catch (e) { frame = K.makePlane('Front', 0); }
    var r = sectionFromLoops(prof.loops, frame);
    r.source = 'sketch'; r.sketch = sketch.id; r.loops = prof.loops.length;
    return r;
  }

  // ------------------------------------------------------------------ Draft Analysis
  // draftAnalysis(mesh, pull, angleDeg, opts?) -> { faces: [{ index, angle, cls, surface }], counts, surfaces, pull, draft }
  // angle = asin(n · pull) in degrees: +90 faces the pull direction, 0 is parallel to it (a vertical wall), −90 faces
  // away. cls: 'positive' (angle ≥ draft), 'negative' (angle ≤ −draft), 'requires' (|angle| < draft), 'straddle' (a
  // faceted curved surface — facets joined by tangent edges — whose facets are both positive and negative).
  // opts.edges: K.bodyEdges(mesh) when the caller has it (smooth edges join facets into surfaces).
  var DRAFT_COLORS = { positive: '#3cb04a', negative: '#d9412e', requires: '#f2c230', straddle: '#3f7fd8' };
  function draftAnalysis(mesh, pull, angleDeg, opts) {
    opts = opts || {};
    var d = norm(pull), draft = Math.abs(+angleDeg || 0), tol = 1e-9;
    if (!(len(d) > 0.5)) throw new Error('Pick a pull direction.');
    var faces = mesh.faces.map(function (f, i) {
      var c = clamp(dot(f.normal, d), -1, 1), a = Math.asin(c) * DEG;
      var cls = Math.abs(c) <= tol || Math.abs(a) < draft - 1e-9 ? 'requires' : a > 0 ? 'positive' : 'negative';
      return { index: i, angle: a, cls: cls, surface: i };
    });
    // surfaces: union-find over smooth (tangent) edges
    var parent = faces.map(function (f, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    var edges = opts.edges || K.bodyEdges(mesh);
    edges.forEach(function (e) {
      if (!e.smooth || e.faces.length < 2) return;
      for (var k = 1; k < e.faces.length; k++) { var a = find(e.faces[0]), b = find(e.faces[k]); if (a !== b) parent[a] = b; }
    });
    var groups = {};
    faces.forEach(function (f) { f.surface = find(f.index); (groups[f.surface] = groups[f.surface] || []).push(f); });
    var surfaces = Object.keys(groups).map(function (k) {
      var g = groups[k], pos = g.some(function (f) { return f.cls === 'positive'; }), neg = g.some(function (f) { return f.cls === 'negative'; });
      if (g.length > 1 && pos && neg) g.forEach(function (f) { f.cls = 'straddle'; });
      return { faces: g.map(function (f) { return f.index; }), cls: g.length > 1 && pos && neg ? 'straddle' : g[0].cls, min: Math.min.apply(null, g.map(function (f) { return f.angle; })), max: Math.max.apply(null, g.map(function (f) { return f.angle; })) };
    });
    var counts = { positive: 0, negative: 0, requires: 0, straddle: 0 };
    surfaces.forEach(function (sf) { counts[sf.cls]++; });
    var faceCounts = { positive: 0, negative: 0, requires: 0, straddle: 0 };
    faces.forEach(function (f) { faceCounts[f.cls]++; });
    return { faces: faces, surfaces: surfaces, counts: counts, faceCounts: faceCounts, pull: d, draft: +angleDeg || 0 };
  }

  // ------------------------------------------------------------------ Thickness Analysis
  // thickness(body | [bodies], opts?) -> { min, max, mean, area, wallArea, cornerArea, histogram: [{ from, to, area, fraction }],
  //   target, below, above, samples, field: { positions, normals, t, corner, median, area } }
  // opts: target, treatCorners, bins (10), resolution 'low' | 'medium' | 'high' or samples (a count).
  // Each facet is cut into cells; the cell's centre (on the true cylinder or sphere when the facet has an analytic record,
  // so a curved wall is exact and not cos(π/n) short) casts a ray straight in along −n to the first exit, which gives the
  // chord to the facing wall. That chord alone is wrong in two places:
  //  - a rim (the edge of a plate, the end of a tube): the ray runs along the wall. So the sample also tries chords
  //    through itself in the plane of its face, along the body's main plane directions and toward the nearest other
  //    surface; a chord counts when both ends meet their walls square (ends' normals within 25° of it). The thinnest wins.
  //  - a junction of walls (the corner of a shell): the ray runs down the length of the next wall. A sample much thicker
  //    than its surface's area-weighted median and within that median of the surface's edge is a corner sample. Corner
  //    samples leave min / max / histogram, or count as zero with treatCorners (SolidWorks' Treat corners as zero thickness).
  var THICK_SAMPLES = { low: 3000, medium: 12000, high: 40000 };
  function thickPolys(src) {
    var out = [];
    function planeKey(a, n) { return 'p' + n.map(function (x) { return Math.round(x * 1e4); }).join(',') + ':' + Math.round(dot(n, a) * 1e5); }
    function push(a, b, c, S, key) {
      var n = cross(sub(b, a), sub(c, a)), l = len(n);
      if (l > 1e-13) out.push({ a: a, b: b, c: c, n: scale(n, 1 / l), area: l / 2, S: S && (S.t === 'cyl' || S.t === 'sph') ? S : null, key: key });
    }
    if (src && src.polygons) src.polygons.forEach(function (p) {
      var v = p.vertices.map(function (x) { return [x.pos.x, x.pos.y, x.pos.z]; }), S = p.surf && !p.surf.fc ? p.surf.s : null, key;
      if (S) key = S.t + ':' + [S.o, S.d].map(function (q) { return q ? q.map(function (x) { return Math.round(x * 1e6); }).join(',') : ''; }).join(':') + ':' + Math.round((S.r || 0) * 1e6);
      else key = planeKey(v[0], [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z]);
      for (var i = 1; i + 1 < v.length; i++) push(v[0], v[i], v[i + 1], S, key);
    });
    else trianglesOf(src).forEach(function (t) {
      var a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]];
      push(a, b, c, null, planeKey(a, norm(cross(sub(b, a), sub(c, a)))));
    });
    return out;
  }
  // the surface's own outward normal at x, oriented like the facet normal n (null: a plane or another surface)
  function thickSurfN(S, x, n) {
    if (!S) return null;
    var v = sub(x, S.o), r = S.t === 'sph' ? v : sub(v, scale(S.d, dot(v, S.d))), u = norm(r);
    if (!(len(u) > 0.5)) return null;
    return dot(u, n) < 0 ? scale(u, -1) : u;
  }
  // x moved onto the true surface
  function thickSnap(S, x) {
    var v = sub(x, S.o), z = S.t === 'sph' ? 0 : dot(v, S.d), r = S.t === 'sph' ? v : sub(v, scale(S.d, z)), u = norm(r);
    if (!(len(u) > 0.5)) return x;
    return add(S.t === 'sph' ? S.o : add(S.o, scale(S.d, z)), scale(u, S.r));
  }
  // the ray o + t d on the true surface: the root nearest the facet hit tf
  function thickRefine(S, o, d, tf) {
    var w = sub(o, S.o), a = d, b = w;
    if (S.t !== 'sph') { a = sub(d, scale(S.d, dot(d, S.d))); b = sub(w, scale(S.d, dot(w, S.d))); }
    var A = dot(a, a), B = dot(a, b), C = dot(b, b) - S.r * S.r, D = B * B - A * C;
    if (A < 1e-12 || D < 0) return tf;
    var q = Math.sqrt(D), t1 = (-B - q) / A, t2 = (-B + q) / A, t = Math.abs(t1 - tf) < Math.abs(t2 - tf) ? t1 : t2;
    return Math.abs(t - tf) < Math.max(0.2 * S.r, 1e-9) ? t : tf;
  }
  // the first exit from the solid along the ray
  function thickRay(T, o, d) {
    var best = Infinity, hit = -1, stack = [T.tree], inv = [1 / d[0], 1 / d[1], 1 / d[2]];
    while (stack.length) {
      var nd = stack.pop(), t0 = 0, t1 = best, k;
      for (k = 0; k < 3; k++) {
        var p = (nd.box.min[k] - 1e-9 - o[k]) * inv[k], q = (nd.box.max[k] + 1e-9 - o[k]) * inv[k];
        if (p !== p || q !== q) { if (o[k] < nd.box.min[k] - 1e-9 || o[k] > nd.box.max[k] + 1e-9) { t0 = 1; t1 = 0; } continue; }
        if (p > q) { var s = p; p = q; q = s; }
        if (p > t0) t0 = p;
        if (q < t1) t1 = q;
      }
      if (t0 > t1) continue;
      if (!nd.items) { stack.push(nd.left); stack.push(nd.right); continue; }
      for (var j = 0; j < nd.items.length; j++) {
        var f = T.polys[nd.items[j]];
        if (dot(f.n, d) <= 1e-9) continue;
        var e1 = sub(f.b, f.a), e2 = sub(f.c, f.a), pv = cross(d, e2), det = dot(e1, pv);
        if (Math.abs(det) < 1e-14) continue;
        var tv = sub(o, f.a), u = dot(tv, pv) / det;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        var qv = cross(tv, e1), v = dot(d, qv) / det;
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
        var t = dot(e2, qv) / det;
        if (t > 1e-10 && t < best) { best = t; hit = nd.items[j]; }
      }
    }
    if (hit < 0) return null;
    var P = T.polys[hit], tt = P.S ? thickRefine(P.S, o, d, best) : best;
    return { t: tt, n: thickSurfN(P.S, add(o, scale(d, tt)), P.n) || P.n };
  }
  // the nearest point on any surface other than `key`
  function thickNearest(T, p, key) {
    var best = Infinity, poly = null, pb = { min: p, max: p }, stack = [T.tree];
    while (stack.length) {
      var nd = stack.pop();
      if (boxDist(pb, nd.box) >= best) continue;
      if (!nd.items) {
        if (boxDist(pb, nd.left.box) < boxDist(pb, nd.right.box)) { stack.push(nd.right); stack.push(nd.left); } else { stack.push(nd.left); stack.push(nd.right); }
        continue;
      }
      for (var j = 0; j < nd.items.length; j++) {
        var f = T.polys[nd.items[j]];
        if (f.key === key) continue;
        var d = len(sub(closestOnTri(p, f.a, f.b, f.c), p));
        if (d < best) { best = d; poly = f; }
      }
    }
    return poly ? { d: best, poly: poly } : null;
  }
  function thickBody(src, h, out) {
    var polys = thickPolys(src);
    if (!polys.length) return;
    var T = { polys: polys, tree: buildBVH(polys.map(function (f) { return [f.a[0], f.a[1], f.a[2], f.b[0], f.b[1], f.b[2], f.c[0], f.c[1], f.c[2]]; })) };
    var eps = 1e-7 * Math.max(1e-3, boxDiag(T.tree.box));
    // the body's main plane directions, largest area first (±n count once)
    var dirs = [], planar = {};
    polys.forEach(function (f) { if (!f.S) { var s = f.key.split(':')[0]; (planar[s] = planar[s] || { n: f.n, a: 0 }).a += f.area; } });
    Object.keys(planar).map(function (k) { return planar[k]; }).sort(function (a, b) { return b.a - a.a; }).forEach(function (q) {
      if (dirs.length < 8 && !dirs.some(function (d) { return Math.abs(dot(d, q.n)) > 1 - 1e-6; })) dirs.push(q.n);
    });
    function chord(q, u) {
      var F = thickRay(T, q, u), B = thickRay(T, q, scale(u, -1));
      return F && B && dot(F.n, u) > 0.9 && dot(B.n, u) < -0.9 ? F.t + B.t : Infinity;
    }
    var bySurface = {};
    function sample(f, a, b, c, area) {
      var cen = scale(add(add(a, b), c), 1 / 3), p = f.S ? thickSnap(f.S, cen) : cen, n = thickSurfN(f.S, p, f.n) || f.n;
      var q = sub(p, scale(n, eps)), r = thickRay(T, q, scale(n, -1)), t = r ? r.t + eps : Infinity, near = thickNearest(T, p, f.key);
      var qc = sub(cen, scale(f.n, eps));   // on a curved face p lies outside the facets: chords start from the facet
      dirs.forEach(function (u) { if (Math.abs(dot(u, n)) < 0.02) t = Math.min(t, chord(qc, u)); });
      if (near) {
        var m = thickSurfN(near.poly.S, p, near.poly.n) || near.poly.n, u = sub(m, scale(n, dot(m, n)));
        if (len(u) > 1e-3) t = Math.min(t, chord(qc, norm(u)));
      }
      if (t === Infinity) return;   // an open sheet: no wall to measure
      var i = out.t.length;
      out.t.push(t); out.area.push(area); out.corner.push(0); out.median.push(t); out.near.push(near ? near.d : Infinity);
      [a, b, c].forEach(function (x) {
        out.positions.push(x[0], x[1], x[2]);
        var w = thickSurfN(f.S, x, f.n) || f.n;
        out.normals.push(w[0], w[1], w[2]);
      });
      (bySurface[f.key] = bySurface[f.key] || []).push(i);
    }
    polys.forEach(function (f) {
      var k = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(f.area) / h))), e1 = scale(sub(f.b, f.a), 1 / k), e2 = scale(sub(f.c, f.a), 1 / k), area = f.area / (k * k);
      function at(i, j) { return add(add(f.a, scale(e1, i)), scale(e2, j)); }
      for (var i = 0; i < k; i++) for (var j = 0; i + j < k; j++) {
        sample(f, at(i, j), at(i + 1, j), at(i, j + 1), area);
        if (i + j + 1 < k) sample(f, at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), area);
      }
    });
    // corner samples: much thicker than their surface's median, and near its edge
    Object.keys(bySurface).forEach(function (key) {
      var list = bySurface[key].slice().sort(function (a, b) { return out.t[a] - out.t[b]; }), total = 0, s = 0, med = out.t[list[0]];
      list.forEach(function (i) { total += out.area[i]; });
      for (var i = 0; i < list.length; i++) { s += out.area[list[i]]; if (s >= total / 2) { med = out.t[list[i]]; break; } }
      list.forEach(function (i) { out.median[i] = med; if (out.t[i] > 1.25 * med && out.near[i] <= med) out.corner[i] = 1; });
    });
  }
  // the statistics of a field (Evaluate.thickness(…).field); cheap, so options can change without casting again
  function thicknessStats(field, opts) {
    opts = opts || {};
    var n = field.t.length, bins = opts.bins || 10, lo = Infinity, hi = -Infinity, area = 0, sum = 0, cornerArea = 0, wallArea = 0, below = 0, above = 0, i;
    var target = opts.target != null ? +opts.target : null;
    for (i = 0; i < n; i++) {
      area += field.area[i];
      if (field.corner[i]) { cornerArea += field.area[i]; if (!opts.treatCorners) continue; }
      var t = field.corner[i] ? 0 : field.t[i];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t * field.area[i]; wallArea += field.area[i];
      if (target != null) { if (t < target - 1e-9) below += field.area[i]; else if (t > target + 1e-9) above += field.area[i]; }
    }
    var hist = [];
    if (wallArea > 0) {
      var w = (hi - lo) / bins;
      if (!(w > 1e-9 * Math.max(hi, 1e-9))) hist.push({ from: lo, to: hi, area: wallArea, fraction: 1 });
      else {
        for (i = 0; i < bins; i++) hist.push({ from: lo + i * w, to: lo + (i + 1) * w, area: 0, fraction: 0 });
        for (i = 0; i < n; i++) {
          if (field.corner[i] && !opts.treatCorners) continue;
          hist[Math.min(bins - 1, Math.floor(((field.corner[i] ? 0 : field.t[i]) - lo) / w))].area += field.area[i];
        }
        hist.forEach(function (b) { b.fraction = b.area / wallArea; });
      }
    }
    return { min: wallArea > 0 ? lo : 0, max: wallArea > 0 ? hi : 0, mean: wallArea > 0 ? sum / wallArea : 0, area: area, wallArea: wallArea, cornerArea: cornerArea, histogram: hist, target: target, below: below, above: above, samples: n, treatCorners: !!opts.treatCorners };
  }
  function thickness(body, opts) {
    opts = opts || {};
    var list = Array.isArray(body) ? body : [body], total = 0;
    list.forEach(function (b) { thickPolys(b).forEach(function (f) { total += f.area; }); });
    if (!(total > 0)) throw new Error('There is no solid to analyze.');
    var count = opts.samples || THICK_SAMPLES[opts.resolution || 'medium'] || THICK_SAMPLES.medium, h = Math.sqrt(total / count);
    var out = { positions: [], normals: [], t: [], corner: [], median: [], area: [], near: [] };
    list.forEach(function (b) { thickBody(b, h, out); });
    var r = thicknessStats(out, opts);
    r.field = { positions: new Float32Array(out.positions), normals: new Float32Array(out.normals), t: out.t, corner: out.corner, median: out.median, area: out.area };
    return r;
  }

  // ------------------------------------------------------------------ Clearance Verification
  // minDistance(a, b) -> { distance, pa, pb, interfering }  (a, b: CSG bodies or kernel meshes)
  // Exact minimum distance between the two triangle sets (a BVH over b, pruned by the best distance so far); 0 when
  // they touch or cross. `interfering` is true when the solids share volume: for CSG bodies whose boxes overlap, the
  // CSG.intersect volume exceeds 1e-9 · diag³ (this also catches coplanar-sided overlaps and one solid nested inside the
  // other, which then reports distance 0); for plain meshes, a triangle edge through the other's interior. Touching
  // faces are 0 apart but not interfering.
  function minDistance(a, b, opts) {
    opts = opts || {};
    var ta = trianglesOf(a), tb = trianglesOf(b);
    if (!ta.length || !tb.length) return { distance: Infinity, pa: null, pb: null, interfering: false };
    var tree = buildBVH(tb), best = { d: Infinity, pa: null, pb: null };
    var boxes = ta.map(triBox), order = ta.map(function (t, i) { return { i: i, lb: boxDist(boxes[i], tree.box) }; });
    order.sort(function (p, q) { return p.lb - q.lb; });
    for (var k = 0; k < order.length; k++) {
      if (order[k].lb >= best.d) break;
      var A = ta[order[k].i], boxA = boxes[order[k].i];
      var stack = [tree];
      while (stack.length) {
        var nd = stack.pop();
        if (boxDist(boxA, nd.box) >= best.d) continue;
        if (nd.items) {
          for (var j = 0; j < nd.items.length; j++) {
            var r = triTriDistance(A, tb[nd.items[j]]);
            if (r.d < best.d) { best = r; if (r.d === 0) break; }
          }
          if (best.d === 0) break;
        } else {
          var dl = boxDist(boxA, nd.left.box), dr = boxDist(boxA, nd.right.box);
          if (dl < dr) { stack.push(nd.right); stack.push(nd.left); } else { stack.push(nd.left); stack.push(nd.right); }
        }
      }
      if (best.d === 0) break;
    }
    var out = { distance: best.d, pa: best.pa, pb: best.pb, interfering: false };
    if (opts.checkCrossing === false) return exactClearance(a, b, out);
    if (a && a.polygons && b && b.polygons && a.intersect) {
      var ba = csgBox(a), bb = csgBox(b);
      if (ba && bb && boxDist(ba, bb) === 0) {
        var d = boxDiag(boxUnion(ba, bb)), tol = Math.max(1e-12, 1e-9 * d * d * d), common = a.intersect(b);
        if (common.polygons.length && exactVolume(common) > tol) {
          out.interfering = true;
          if (out.distance > 0) {   // nested: the surfaces are apart but the solids overlap
            var v = common.polygons[0].vertices[0].pos, q = [v.x, v.y, v.z];
            out.distance = 0; out.pa = q; out.pb = q.slice();
          }
        }
      }
    } else if (best.d === 0) {
      // plain meshes: a strict edge-through-interior crossing means they interpenetrate
      out.interfering = anyCrossing(ta, tb, tree);
    }
    return out.interfering ? out : exactClearance(a, b, out);
  }

  // ------------------------------------------------------------------ exact values from the surface records (true curves)
  // exactVolume(csg): the volume with the kernel's curve correction when any facet carries an analytic surface record
  // (polygon.surf): the common volume of two analytic solids (a pin through a plate, a shaft in its bore) is then the
  // true one, not the facets', so a shaft in a bore of the same diameter no longer shows a sliver of interference.
  function exactVolume(csg) {
    if (!csg || !csg.polygons || !csg.polygons.length) return 0;
    if (!csg.polygons.some(function (p) { return p.surf; })) return csg.volume();
    var v = K.massProps(K.meshFromBody(csg)).volume;
    return isFinite(v) ? v : csg.volume();
  }
  // exactClearance(a, b, r): when the facet result's closest points lie on exact cylinders (or a cylinder and a plane
  // parallel to its axis) and the gap between them runs square to the axes, the distance and the two points come from
  // the surfaces: cylinder–plane |n·c − w| − r; parallel cylinders D − rA − rB outside each other, rB − rA − D for one
  // inside the other (D = the distance between the axes). The facet value only picks the configuration: the exact one
  // must lie within the facets' sagitta of it. Everything else keeps the facet result. -> r (with exact: true when refined)
  function cylsOf(body) {
    return (K.curveSurfaces ? K.curveSurfaces(body) : []).map(function (e) { return e.surf; }).filter(function (S) { return S.t === 'cyl' && S.r > 0; });
  }
  function onCyl(q, list) {
    var best = null, bd = Infinity;
    list.forEach(function (S) {
      var o = S.o, d = norm(S.d), v = sub(q, o), e = Math.abs(len(sub(v, scale(d, dot(v, d)))) - S.r);
      if (e <= 0.05 * S.r + 1e-9 && e < bd) { bd = e; best = S; }
    });
    return best;
  }
  function axisPoint(S, q) { var d = norm(S.d); return add(S.o, scale(d, dot(sub(q, S.o), d))); }
  function planeAt(body, q, u) {
    var best = null;
    body.polygons.forEach(function (p) {
      if (best || p.surf) return;
      var n = arr(p.plane.normal);
      if (Math.abs(dot(n, q) - p.plane.w) < 1e-6 && Math.abs(dot(n, u)) > 0.99) best = { n: n, w: p.plane.w };
    });
    return best;
  }
  function exactClearance(a, b, r) {
    if (!(r.distance > 0) || !isFinite(r.distance) || !r.pa || !r.pb || !a || !b || !a.polygons || !b.polygons) return r;
    var u = norm(sub(r.pb, r.pa)), SA = onCyl(r.pa, cylsOf(a)), SB = onCyl(r.pb, cylsOf(b)), res = null;
    if (!SA && !SB) return r;
    function take(dist, pa, pb, tol) {
      if (dist >= -1e-12 && Math.abs(dist - r.distance) <= tol && (!res || Math.abs(dist - r.distance) < Math.abs(res.distance - r.distance))) res = { distance: Math.max(0, dist), pa: pa, pb: pb };
    }
    if (SA && SB) {
      var dA = norm(SA.d), dB = norm(SB.d);
      if (len(cross(dA, dB)) < 1e-9 && Math.abs(dot(u, dA)) < 0.1) {
        var ca = axisPoint(SA, r.pa), cb = axisPoint(SB, ca), w = sub(cb, ca), D = len(w), tol = 0.05 * (SA.r + SB.r) + 1e-9;
        var e = D > 1e-12 ? scale(w, 1 / D) : u;   // from A's axis towards B's
        take(D - SA.r - SB.r, add(ca, scale(e, SA.r)), sub(cb, scale(e, SB.r)), tol);                  // outside each other
        take(SB.r - SA.r - D, sub(ca, scale(e, SA.r)), sub(cb, scale(e, SB.r)), tol);                  // A inside B
        take(SA.r - SB.r - D, add(ca, scale(e, SA.r)), add(cb, scale(e, SB.r)), tol);                  // B inside A
      }
    } else {
      var S = SA || SB, q = SA ? r.pa : r.pb, other = SA ? b : a, v = SA ? u : scale(u, -1), pl = planeAt(other, SA ? r.pb : r.pa, v);
      if (pl && Math.abs(dot(pl.n, norm(S.d))) < 1e-9) {
        var c = axisPoint(S, q), sd = dot(pl.n, c) - pl.w, n = sd >= 0 ? scale(pl.n, -1) : pl.n;   // n: from the axis towards the plane
        var dist = Math.abs(sd) - S.r, ps = add(c, scale(n, S.r)), pp = add(ps, scale(n, dist));
        if (SA) take(dist, ps, pp, 0.05 * S.r + 1e-9); else take(dist, pp, ps, 0.05 * S.r + 1e-9);
      }
    }
    if (!res) return r;
    r.distance = res.distance; r.pa = res.pa; r.pb = res.pb; r.exact = true;
    return r;
  }
  function anyCrossing(ta, tb, tree) {
    for (var i = 0; i < ta.length; i++) {
      var boxA = triBox(ta[i]), stack = [tree];
      while (stack.length) {
        var nd = stack.pop();
        if (boxDist(boxA, nd.box) > 0) continue;
        if (nd.items) {
          for (var j = 0; j < nd.items.length; j++) if (crossTris(triPts(ta[i]), triPts(tb[nd.items[j]]), 1e-7)) return true;
        } else { stack.push(nd.left); stack.push(nd.right); }
      }
    }
    return false;
  }
  // pairsFor(n, selected) -> index pairs to test: all pairs among `selected` when it has 2+, the selected one against
  // every other when it has 1, all pairs when it is empty (SolidWorks: "selected items" vs "selected items and the
  // rest of the assembly").
  function pairsFor(n, selected, opts) {
    var sel = (selected || []).filter(function (i, k, a) { return i >= 0 && i < n && a.indexOf(i) === k; }), out = [];
    var rest = opts && opts.withRest;
    if (sel.length === 1 || (rest && sel.length)) {
      sel.forEach(function (i) { for (var j = 0; j < n; j++) if (sel.indexOf(j) < 0) out.push(i < j ? [i, j] : [j, i]); });
      if (rest) for (var p = 0; p < sel.length; p++) for (var q = p + 1; q < sel.length; q++) out.push([sel[p], sel[q]]);
      return out;
    }
    var list = sel.length ? sel.slice().sort(function (a, b) { return a - b; }) : Array.apply(null, Array(n)).map(function (x, i) { return i; });
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
    return out;
  }
  // clearance(bodies, names, selected, minClearance, opts?) -> { results: [{ a, b, aName, bName, distance, pa, pb,
  //   interfering, ok }] (smallest first), minimum, failed, checked }
  function clearance(bodies, names, selected, minClearance, opts) {
    var min = +minClearance || 0, res = [];
    pairsFor(bodies.length, selected, opts).forEach(function (pr) {
      var A = bodies[pr[0]], B = bodies[pr[1]];
      if (!A || !B || (A.polygons && !A.polygons.length) || (B.polygons && !B.polygons.length)) return;
      var r = minDistance(A, B);
      res.push({ a: pr[0], b: pr[1], aName: names ? names[pr[0]] : 'Body' + (pr[0] + 1), bName: names ? names[pr[1]] : 'Body' + (pr[1] + 1),
        distance: r.distance, pa: r.pa, pb: r.pb, interfering: r.interfering, ok: r.distance >= min - 1e-12 && !r.interfering });
    });
    res.sort(function (p, q) { return p.distance - q.distance; });
    return { results: res, minimum: res.length ? res[0].distance : null, failed: res.filter(function (r) { return !r.ok; }).length, checked: res.length, minClearance: min };
  }

  // ------------------------------------------------------------------ Interference Detection (selected bodies)
  // interference(bodies, names, selected, opts?) -> { pairs: [{ a, b, aName, bName, aIndex, bIndex, volume, body }],
  //   volume, checked, tolerance }  — the same test as Assembly.interference (CSG.intersect of each pair whose boxes
  //   overlap; volume above 1e-9 · diag³), but only over the pairs pairsFor(selected) gives.
  function csgBox(b) {
    var box = null;
    b.polygons.forEach(function (p) { p.vertices.forEach(function (v) { var q = arr(v.pos); box = box ? boxUnion(box, { min: q, max: q }) : { min: q.slice(), max: q.slice() }; }); });
    return box;
  }
  function interference(bodies, names, selected, opts) {
    opts = opts || {};
    var boxes = bodies.map(function (b) { return b && b.polygons && b.polygons.length ? csgBox(b) : null; }), all = null;
    boxes.forEach(function (bx) { if (bx) all = all ? boxUnion(all, bx) : bx; });
    var diag = boxDiag(all), tol = opts.minVolume != null ? +opts.minVolume : Math.max(1e-12, 1e-9 * diag * diag * diag);
    var pairs = [], checked = 0, e = 1e-9 * Math.max(1, diag);
    pairsFor(bodies.length, selected, opts).forEach(function (pr) {
      var i = pr[0], j = pr[1], A = boxes[i], B = boxes[j];
      if (!A || !B) return;
      if (A.min[0] > B.max[0] - e || B.min[0] > A.max[0] - e || A.min[1] > B.max[1] - e || B.min[1] > A.max[1] - e || A.min[2] > B.max[2] - e || B.min[2] > A.max[2] - e) return;
      checked++;
      var common = bodies[i].intersect(bodies[j]), v = exactVolume(common);
      if (v > tol) pairs.push({ a: i, b: j, aIndex: i, bIndex: j, aName: names ? names[i] : 'Body' + (i + 1), bName: names ? names[j] : 'Body' + (j + 1), volume: v, body: common });
    });
    pairs.sort(function (p, q) { return q.volume - p.volume; });
    return { pairs: pairs, volume: pairs.reduce(function (s, p) { return s + p.volume; }, 0), checked: checked, tolerance: tol };
  }

  return {
    checkMesh: checkMesh, checkBody: checkBody, check: check, KIND_LABEL: KIND_LABEL,
    smoothNormals: smoothNormals,
    sectionFromLoops: sectionFromLoops, sectionOfFace: sectionOfFace, sectionOfSketch: sectionOfSketch,
    draftAnalysis: draftAnalysis, DRAFT_COLORS: DRAFT_COLORS,
    thickness: thickness, thicknessStats: thicknessStats,
    minDistance: minDistance, clearance: clearance, interference: interference, pairsFor: pairsFor,
    exactVolume: exactVolume, exactClearance: exactClearance,
    triTriDistance: triTriDistance, closestOnTri: closestOnTri, closestSegSeg: closestSegSeg
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Evaluate;
