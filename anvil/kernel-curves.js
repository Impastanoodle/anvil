// kernel-curves.js — Anvil kernel, true curves: the analytic surface records that curved facets carry (cyl, cone, sph,
// tor), the extrude / revolve / transform tool builders that attach them, exact volumes and mass properties from the
// records (massOptions, massCache) and analytic edges (true circles and arcs). Loaded after kernel.js and
// kernel-sketch.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, arr = _.arr, cross = _.cross, dot = _.dot, ensureOutward = _.ensureOutward, len = _.len, norm = _.norm, poly = _.poly, pushPoly = _.pushPoly, scale = _.scale, sub = _.sub, to3D = _.to3D, triangulate = _.triangulate, vec = _.vec;   // kernel.js
  var TESS = _.TESS, checkProfile = _.checkProfile, offsetLoop = _.offsetLoop, segsForRadius = _.segsForRadius, signedArea = _.signedArea, sketchProfile = _.sketchProfile;   // kernel-sketch.js

  // ------------------------------------------------------------------ analytic surface records (true curves)
  // A facet that approximates a curved face carries polygon.surf = { s: surface, P?, Q?, e0?, dphi? }; facets of one
  // curved face share the surface object:
  //   { t: 'cyl',  o, d, r }        cylinder: axis through o along the unit d, radius r
  //   { t: 'cone', o, d, r, k }     cone: radius r + k·z at axial coordinate z = (x − o)·d
  //   { t: 'sph',  o, d, r }        sphere: centre o (d: the axis of the revolve that made it)
  //   { t: 'tor',  o, d, R, r }     torus: centre o on the axis d, major radius R (signed), tube radius r
  // Spheres and tori come from revolving a profile arc; their facets also carry the chord of the profile arc they
  // were made from, P and Q = [ρ, z] (radius from the axis, axial coordinate from o), plus e0 (the radial direction
  // at angle 0) and dphi (the angle one ring of facets spans). The records survive CSG splits, clones, transforms
  // and pack / unpack (csg.js), so every fragment of a curved face knows its exact surface; massProps integrates the
  // difference between the facets and the true surfaces (curveCorrection), exports and drawings read the circles.
  function loopCurves(profile, loop) {
    if (!loop.seg || !profile.curves) return null;
    return loop.seg.map(function (k) { return k >= 0 ? profile.curves[k] : null; });
  }
  function cylSurf(plane, C) { return { t: 'cyl', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: C.r }; }
  // attach one record per curve to the side facets of segments that are chords of it
  function tagSides(sides, cv, make) {
    if (!cv) return;
    var memo = [];
    for (var i = 0; i < sides.length; i++) {
      var C = cv[i];
      if (!C || !sides[i]) continue;
      var k = memo.indexOf(C);
      if (k < 0) { memo.push(C); memo.push({ s: make(C, i) }); k = memo.length - 2; }
      sides[i].surf = memo[k + 1];
    }
  }

  function prism(loop, plane, a, b, shared, cv) {
    var polys = [], n = loop.length, sides = [];
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = loop.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    var tris = triangulate(loop);
    tris.forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    tagSides(sides, cv, function (C) { return cylSurf(plane, C); });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function rotatePoint(p, A, D, ang) {
    var v = sub(p, A), c = Math.cos(ang), s = Math.sin(ang);
    var r = add(add(scale(v, c), scale(cross(D, v), s)), scale(D, dot(D, v) * (1 - c)));
    return add(A, r);
  }

  function revolveSegs(rmax, angleDeg) {
    return Math.max(8, Math.round((TESS.legacy ? 48 : segsForRadius(rmax)) * Math.abs(angleDeg) / 360));
  }
  // segs: rings of facets (default: from the loop's largest radius and the chord tolerance); cv: loopCurves; fseg: the
  // loop's free-curve segments (sketchProfile loop.fseg: chords of a spline / ellipse). rfFE: a chord of a free curve
  // still gets its cone record (exact volumes of the faceted ring), flagged fc: 1 so analyticNormals smooths the
  // rings into one surface instead of shading each chord's cone apart.
  function revolveLoop(loop, plane, axisP, axisD, angleDeg, shared, cv, segs, fseg) {
    var A = to3D(plane, axisP[0], axisP[1]);
    var D = norm(sub(to3D(plane, axisP[0] + axisD[0], axisP[1] + axisD[1]), A));
    var full = Math.abs(angleDeg) >= 360 - 1e-6;
    // profile points as (ρ, z) about the axis; e = the radial direction of the profile's side (angle 0)
    var rz = loop.map(function (p) { var P = to3D(plane, p[0], p[1]), z = dot(sub(P, A), D); return [len(sub(sub(P, A), scale(D, z))), z, P]; });
    var rmax = 0, e = null;
    rz.forEach(function (q) { if (q[0] > rmax) { rmax = q[0]; e = norm(sub(sub(q[2], A), scale(D, q[1]))); } });
    if (!segs) segs = revolveSegs(rmax, angleDeg);
    var rings = [], s, i;
    for (s = 0; s <= segs; s++) {
      var ang = angleDeg * Math.PI / 180 * s / segs;
      rings.push(loop.map(function (p) { return rotatePoint(to3D(plane, p[0], p[1]), A, D, ang); }));
    }
    if (full) rings[segs] = rings[0];
    var polys = [], n = loop.length;
    // one surface record per profile segment (see "analytic surface records"); planar annuli and segments on the
    // axis get none
    var eps = 1e-9 * Math.max(1, rmax), surfs = [], dphi = angleDeg * Math.PI / 180 / segs;
    for (i = 0; i < n && e; i++) {
      var qi = rz[i], qj = rz[(i + 1) % n], C = cv && cv[i], S = null;
      if (C) {
        var C3 = to3D(plane, C.c[0], C.c[1]), zc = dot(sub(C3, A), D), rc = dot(sub(sub(C3, A), scale(D, zc)), e);
        var o = add(A, scale(D, zc));
        S = Math.abs(rc) < 1e-9 * Math.max(1, C.r) ? { t: 'sph', o: o, d: D.slice(), r: C.r } : { t: 'tor', o: o, d: D.slice(), R: rc, r: C.r };
        surfs.push({ s: S, P: [qi[0], qi[1] - zc], Q: [qj[0], qj[1] - zc], e0: e.slice(), dphi: dphi });
        continue;
      }
      var dz = qj[1] - qi[1], dr = qj[0] - qi[0];
      if (Math.abs(dz) <= eps || (qi[0] <= eps && qj[0] <= eps)) { surfs.push(null); continue; }
      if (Math.abs(dr) <= eps) S = { t: 'cyl', o: A.slice(), d: D.slice(), r: qi[0] };
      else S = { t: 'cone', o: A.slice(), d: D.slice(), r: qi[0] - dr / dz * qi[1], k: dr / dz };
      surfs.push(fseg && fseg[i] && fseg[i] !== -1 ? { s: S, fc: 1 } : { s: S });
    }
    for (s = 0; s < segs; s++) {
      var r0 = rings[s], r1 = rings[s + 1];
      for (i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var quad = [r0[i], r1[i], r1[j], r0[j]];
        // drop duplicate points (vertices on the axis)
        var clean = [];
        for (var q = 0; q < 4; q++) {
          var a = quad[q], b = quad[(q + 1) % 4];
          if (len(sub(a, b)) > 1e-7) clean.push(a);
        }
        if (clean.length < 3) continue;
        var pg = poly(clean, shared);
        if (!pg) continue;
        if (surfs[i]) pg.surf = surfs[i];
        polys.push(pg);
      }
    }
    if (!full) {
      var tris = triangulate(loop);
      var first = rings[0], last = rings[segs];
      tris.forEach(function (t) {
        pushPoly(polys, [first[t[0]], first[t[1]], first[t[2]]], shared);
        pushPoly(polys, [last[t[2]], last[t[1]], last[t[0]]], shared);
      });
    }
    return ensureOutward(polys);
  }

  function unionAll(list) {
    if (!list.length) return null;
    // rfLD: copies apart from each other (a pattern of holes) are one solid with all their polygons, no booleans
    var apart = list.length > 2 && CSG.unionApart ? CSG.unionApart(list) : null;
    if (apart) return apart;
    var acc = list[0];
    for (var i = 1; i < list.length; i++) acc = acc.union(list[i]);
    return acc;
  }
  // Balanced pairwise union: far fewer polygon splits than a running union when the list is long.
  function unionTree(list) {
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    var mid = list.length >> 1;
    return unionTree(list.slice(0, mid)).union(unionTree(list.slice(mid)));
  }

  // Solid from a profile: disjoint outer prisms concatenated, holes subtracted (slightly overshooting the caps).
  function solidFromProfile(profile, makeSolid) {
    checkProfile(profile);
    var outers = [], holes = [];
    profile.loops.forEach(function (l) {
      var solid = makeSolid(l.pts, l.hole, loopCurves(profile, l), l);
      if (!solid) return;
      (l.hole ? holes : outers).push(solid);
    });
    if (!outers.length) throw new Error('Sketch has no closed profile.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

  // ------------------------------------------------------------------ perforated plates (lane perforated, rfGM)
  // plateCut(body, f, profile, plane, range) -> the body with the profile's loops cut through it, without a boolean, or
  // null when the cut is anything but holes through one plate (the caller then does the boolean). Conditions: at least
  // plateOptions.minLoops loops, all outlines; apart from each other; no wall, slanted or curved polygon of the body
  // anywhere near a hole; every hole's column crosses exactly one up cap and one down cap, inside the tool's range. Then
  // the only things that change are the caps, so each cap is cut by the BSP of the hole it meets: a k-d split of the
  // holes hands each hole its own few fragments, so the cost is n log n, not n × the whole cap. The new walls are the
  // tool's side facets with their surf records (true cylinders in STEP and Mass Properties). The holes being apart and
  // clear of every wall proves the solid neither touches itself nor falls apart, which is what zeroThickness would have
  // meshed the body to find out (_ghTouch below). plateOptions.on = false: always the boolean.
  var plateOptions = { on: true, minLoops: 64, last: null };
  function plateBox(pts, gap) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1];
    }
    if (gap) { b[0] -= gap; b[1] -= gap; b[2] += gap; b[3] += gap; }
    return b;
  }
  function plateMeet(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }
  // a grid over the boxes; visit(box, fn) calls fn(index) for the boxes in the cells box covers until fn returns true
  function plateGrid(boxes) {
    var U = [Infinity, Infinity, -Infinity, -Infinity], i, sum = 0;
    for (i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      U[0] = Math.min(U[0], b[0]); U[1] = Math.min(U[1], b[1]); U[2] = Math.max(U[2], b[2]); U[3] = Math.max(U[3], b[3]);
      sum += Math.max(b[2] - b[0], b[3] - b[1]);
    }
    var cs = Math.max(sum / boxes.length, Math.max(U[2] - U[0], U[3] - U[1]) / 1024, 1e-9);
    var nx = Math.floor((U[2] - U[0]) / cs) + 1, ny = Math.floor((U[3] - U[1]) / cs) + 1, cells = new Array(nx * ny);
    function range(b) {
      return [Math.max(0, Math.floor((b[0] - U[0]) / cs)), Math.max(0, Math.floor((b[1] - U[1]) / cs)), Math.min(nx - 1, Math.floor((b[2] - U[0]) / cs)), Math.min(ny - 1, Math.floor((b[3] - U[1]) / cs))];
    }
    for (i = 0; i < boxes.length; i++) {
      var r = range(boxes[i]);
      for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) (cells[y * nx + x] = cells[y * nx + x] || []).push(i);
    }
    return {
      U: U,
      visit: function (box, fn) {
        var r = range(box);
        for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) {
          var c = cells[y * nx + x];
          if (!c) continue;
          for (var k = 0; k < c.length; k++) if (fn(c[k])) return true;
        }
        return false;
      }
    };
  }
  function plateSegDist2(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
    return ex * ex + ey * ey;
  }
  function plateSide(a, b, p) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); }
  // do two loops come within gap of each other? (only the edges inside the other's box matter)
  function plateLoopsNear(A, B, boxA, boxB, gap) {
    function near(L, box) {
      var out = [];
      for (var i = 0; i < L.length; i++) {
        var a = L[i], b = L[(i + 1) % L.length];
        if (Math.max(a[0], b[0]) >= box[0] && Math.min(a[0], b[0]) <= box[2] && Math.max(a[1], b[1]) >= box[1] && Math.min(a[1], b[1]) <= box[3]) out.push([a, b]);
      }
      return out;
    }
    var ea = near(A, boxB), eb = near(B, boxA), g2 = gap * gap;
    for (var i = 0; i < ea.length; i++) for (var j = 0; j < eb.length; j++) {
      var a = ea[i][0], b = ea[i][1], c = eb[j][0], d = eb[j][1];
      if (plateSegDist2(a, c, d) < g2 || plateSegDist2(b, c, d) < g2 || plateSegDist2(c, a, b) < g2 || plateSegDist2(d, a, b) < g2) return true;
      if (plateSide(a, b, c) * plateSide(a, b, d) < 0 && plateSide(c, d, a) * plateSide(c, d, b) < 0) return true;
    }
    return false;
  }
  // are all these loops at least gap apart? (boxes that only touch or overlap are a fine hexagonal pitch, not a touch)
  function plateApart(pts, gap) {
    var boxes = pts.map(function (l) { return plateBox(l, gap); }), grid = plateGrid(boxes), seen = {};
    for (var i = 0; i < pts.length; i++) {
      var bad = grid.visit(boxes[i], function (j) {
        if (j <= i || !plateMeet(boxes[i], boxes[j])) return false;
        var key = i + ',' + j;
        if (seen[key]) return false;
        seen[key] = true;
        return plateLoopsNear(pts[i], pts[j], boxes[i], boxes[j], gap);
      });
      if (bad) return false;
    }
    return true;
  }
  // does the segment a-b reach into the box? (Liang-Barsky)
  function plateSegBox(a, b, box) {
    var t0 = 0, t1 = 1, d = [b[0] - a[0], b[1] - a[1]];
    for (var k = 0; k < 2; k++) {
      if (Math.abs(d[k]) < 1e-300) { if (a[k] < box[k] || a[k] > box[k + 2]) return false; continue; }
      var s = (box[k] - a[k]) / d[k], e = (box[k + 2] - a[k]) / d[k];
      if (s > e) { var t = s; s = e; e = t; }
      if (s > t0) t0 = s;
      if (e < t1) t1 = e;
      if (t0 > t1) return false;
    }
    return true;
  }
  function plateArea(list) {
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      var v = list[i].vertices, A = v[0].pos, sx = 0, sy = 0, sz = 0;
      for (var j = 1; j + 1 < v.length; j++) {
        var B = v[j].pos, C = v[j + 1].pos, ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, wx = C.x - A.x, wy = C.y - A.y, wz = C.z - A.z;
        sx += uy * wz - uz * wy; sy += uz * wx - ux * wz; sz += ux * wy - uy * wx;
      }
      total += Math.sqrt(sx * sx + sy * sy + sz * sz) / 2;
    }
    return total;
  }
  function plateCut(body, f, profile, plane, range) {
    var loops = profile && profile.loops;
    if (!plateOptions.on || !loops || loops.length < plateOptions.minLoops) return null;
    var X = plane.x, Y = plane.y, N = plane.n, O = plane.origin, i;
    if (Math.abs(dot(X, Y)) > 1e-9 || Math.abs(dot(X, N)) > 1e-9 || Math.abs(dot(Y, N)) > 1e-9) return null;
    var pts = [];
    for (i = 0; i < loops.length; i++) {
      if (loops[i].hole || loops[i].depth || loops[i].cross) return null;
      pts.push(loops[i].pts);
    }
    // the hole walls from lo to hi (nlo / nhi: N·lo, N·hi), outward from the hole
    function wallsOf(l, nlo, nhi) {
      var L = pts[l], n = L.length, bottom = new Array(n), top = new Array(n), sides = [], j;
      for (j = 0; j < n; j++) { var b3 = to3D(plane, L[j][0], L[j][1]); bottom[j] = add(b3, nlo); top[j] = add(b3, nhi); }
      for (j = 0; j < n; j++) { var m = (j + 1) % n; sides.push(poly([bottom[j], bottom[m], top[m], top[j]], f.id)); }
      tagSides(sides, loopCurves(profile, loops[l]), function (C) { return cylSurf(plane, C); });
      return sides.filter(function (s) { return s; });
    }
    return plateCore(body, plane, pts, wallsOf, range);
  }
  // rfLD: plateCore(body, plane, pts, wallsOf(l, nlo, nhi, lo, hi), range): plateCut's work once the holes are known —
  // pts[l] the outline of hole l in the plane's 2D frame, wallsOf its walls between the plate's two cap levels
  function plateCore(body, plane, pts, wallsOf, range) {
    var X = plane.x, Y = plane.y, N = plane.n, O = plane.origin, i, areaMin = Infinity, areaAll = 0;
    for (i = 0; i < pts.length; i++) { var ar = Math.abs(signedArea(pts[i])); areaMin = Math.min(areaMin, ar); areaAll += ar; }
    var bb = body.getBounds();
    var gap = 1e-5 * Math.max(1, Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]));
    if (!plateApart(pts, gap)) return null;
    var boxes = pts.map(function (l) { return plateBox(l, gap); }), grid = plateGrid(boxes), U = grid.U;
    var keep = [], caps = [], hi = null, lo = null, polys = body.polygons;
    for (var q = 0; q < polys.length; q++) {
      var p = polys[q], vs = p.vertices, nm = p.plane.normal;
      if (p.face != null || p.part != null) return null;
      var nz = nm.x * N[0] + nm.y * N[1] + nm.z * N[2], uv = new Array(vs.length), hmin = Infinity, hmax = -Infinity;
      for (var k = 0; k < vs.length; k++) {
        var P = vs[k].pos, rx = P.x - O[0], ry = P.y - O[1], rz = P.z - O[2], h = rx * N[0] + ry * N[1] + rz * N[2];
        uv[k] = [rx * X[0] + ry * X[1] + rz * X[2], rx * Y[0] + ry * Y[1] + rz * Y[2]];
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
      }
      var box = plateBox(uv, gap);
      if (!plateMeet(box, U)) { keep.push(p); continue; }
      var meets = function (j) { return plateMeet(box, boxes[j]); };
      if (Math.abs(nz) > 1 - 1e-12 && hmax - hmin < 1e-9 && !p.surf) {
        if (!grid.visit(box, meets)) { keep.push(p); continue; }
        if (nz > 0) { if (hi == null) hi = hmin; else if (Math.abs(hi - hmin) > 1e-9) return null; }
        else if (lo == null) lo = hmin; else if (Math.abs(lo - hmin) > 1e-9) return null;
        caps.push(p);
      } else if (Math.abs(nz) < 1e-9) {
        // a wall seen from above is a segment: its two farthest corners
        var far = 0, best = -1;
        for (k = 0; k < uv.length; k++) { var dd = (uv[k][0] - uv[0][0]) * (uv[k][0] - uv[0][0]) + (uv[k][1] - uv[0][1]) * (uv[k][1] - uv[0][1]); if (dd > best) { best = dd; far = k; } }
        var other = 0; best = -1;
        for (k = 0; k < uv.length; k++) { var de = (uv[k][0] - uv[far][0]) * (uv[k][0] - uv[far][0]) + (uv[k][1] - uv[far][1]) * (uv[k][1] - uv[far][1]); if (de > best) { best = de; other = k; } }
        var ua = uv[far], ub = uv[other];
        if (grid.visit(box, function (j) { return plateSegBox(ua, ub, boxes[j]); })) return null;
        keep.push(p);
      } else {
        if (grid.visit(box, meets)) return null;
        keep.push(p);
      }
    }
    if (hi == null || lo == null || !(hi - lo > 1e-9) || range[0] > lo + 1e-9 || range[1] < hi - 1e-9) return null;
    var capsUp = caps.filter(function (c) { return c.plane.normal.x * N[0] + c.plane.normal.y * N[1] + c.plane.normal.z * N[2] > 0; });
    var capsDown = caps.filter(function (c) { return c.plane.normal.x * N[0] + c.plane.normal.y * N[1] + c.plane.normal.z * N[2] < 0; });
    var areaUp = plateArea(capsUp), areaDown = plateArea(capsDown);
    // the hole walls, outward from the hole for now: they are the hole's BSP, and flipped they face the plate's material
    var walls = [], trees = new Array(pts.length), nlo = scale(N, lo), nhi = scale(N, hi);
    for (i = 0; i < pts.length; i++) walls.push(wallsOf(i, nlo, nhi, lo, hi));
    function treeOf(l) { return trees[l] || (trees[l] = new CSG.Node(walls[l])); }
    var cutPlanes = [X, Y], W = [dot(O, X), dot(O, Y)], out = [];
    // a k-d split of the holes, along the wider spread, at a gap between them when there is one near the median
    function divide(list, ids) {
      var l;
      if (!list.length) return;
      if (!ids.length) { for (l = 0; l < list.length; l++) out.push(list[l]); return; }
      if (ids.length === 1) { treeOf(ids[0]).clipInto(list, out); return; }
      var lo2 = [Infinity, Infinity], hi2 = [-Infinity, -Infinity];
      ids.forEach(function (d) { var b = boxes[d]; lo2[0] = Math.min(lo2[0], b[0]); lo2[1] = Math.min(lo2[1], b[1]); hi2[0] = Math.max(hi2[0], b[2]); hi2[1] = Math.max(hi2[1], b[3]); });
      var ax = hi2[0] - lo2[0] >= hi2[1] - lo2[1] ? 0 : 1, sorted = ids.slice().sort(function (a, b) { return boxes[a][ax] - boxes[b][ax]; });
      var run = new Array(sorted.length), mx = -Infinity, c = sorted.length, m = c >> 1, pick = -1, score = Infinity;
      for (l = 0; l < c; l++) { mx = Math.max(mx, boxes[sorted[l]][ax + 2]); run[l] = mx; }
      for (l = 1; l < c; l++) if (run[l - 1] < boxes[sorted[l]][ax] && Math.abs(l - m) < score) { score = Math.abs(l - m); pick = l; }
      var t = pick > 0 ? (run[pick - 1] + boxes[sorted[pick]][ax]) / 2 : (run[m - 1] + boxes[sorted[m]][ax]) / 2;
      var left = ids.filter(function (d) { return boxes[d][ax] < t; }), right = ids.filter(function (d) { return boxes[d][ax + 2] > t; });
      if (left.length === ids.length && right.length === ids.length) { var rest = list; ids.forEach(function (d) { rest = treeOf(d).clipPolygons(rest); }); for (l = 0; l < rest.length; l++) out.push(rest[l]); return; }
      var cp = new CSG.Plane(vec(cutPlanes[ax]), W[ax] + t), front = [], back = [];
      for (l = 0; l < list.length; l++) cp.splitPolygon(list[l], front, back, front, back);
      divide(back, left);
      divide(front, right);
    }
    divide(caps, ids0(pts.length));
    var afterUp = [], afterDown = [];
    for (i = 0; i < out.length; i++) { var c = out[i], cn = c.plane.normal; (cn.x * N[0] + cn.y * N[1] + cn.z * N[2] > 0 ? afterUp : afterDown).push(c); }
    // every hole was all on the caps (none in air): the area taken off each cap is the holes' area
    var tol = 0.25 * areaMin;
    if (Math.abs(areaUp - plateArea(afterUp) - areaAll) > tol || Math.abs(areaDown - plateArea(afterDown) - areaAll) > tol) return null;
    var res = keep.map(function (k0) { return k0.clone(); });
    for (i = 0; i < out.length; i++) res.push(out[i].clone());
    for (i = 0; i < walls.length; i++) for (var w = 0; w < walls[i].length; w++) { var fl = walls[i][w].clone(); fl.flip(); res.push(fl); }
    var csg = CSG.fromPolygons(res);
    Object.defineProperty(csg, '_ghTouch', { value: { nm: 0, lumps: null, touch: false }, enumerable: false, writable: true, configurable: true });
    plateOptions.last = { holes: pts.length, polygons: res.length };
    return csg;
  }
  // rfLD: plateCutParts(body, parts) -> the body with every part taken out without a boolean, or null (the caller then
  // does the boolean). parts = the solids of a pattern's / mirror's tool when they are apart (CSG.unionApart's list,
  // tool._parts): copies of a through cut's tool. Each part must be a right prism along one direction N (tried: the
  // first few face normals of part 0): every polygon a cap (normal ±N) or a wall (normal ⟂ N), every wall corner on
  // one of the part's two cap levels, which span the plate; its outline is chained from the walls' top edges. Then
  // plateCore exactly as for a sketch of holes (rfGM): holes apart, on the caps, clear of every other face, the area
  // check. The walls are the part's own (surf records and feature tags kept), moved onto the plate's caps.
  function plateCutParts(body, parts) {
    if (!plateOptions.on || !parts || parts.length < plateOptions.minLoops) return null;
    var p0 = parts[0].polygons, cands = [], c;
    for (c = 0; c < p0.length && cands.length < 3; c++) {
      var nm = p0[c].plane.normal, n = [nm.x, nm.y, nm.z], dup = false;
      for (var k = 0; k < cands.length; k++) if (Math.abs(Math.abs(dot(cands[k], n)) - 1) < 1e-9) dup = true;
      if (!dup) cands.push(n);
    }
    for (c = 0; c < cands.length; c++) {
      var r = plateParts(body, parts, cands[c]);
      if (r) return r;
    }
    return null;
  }
  function plateParts(body, parts, N) {
    var a = Math.abs(N[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0], X = norm(cross(a, N)), Y = cross(N, X);
    var plane = { x: X, y: Y, n: N, origin: [0, 0, 0] }, info = [], lo0 = -Infinity, hi0 = Infinity;
    function hOf(P) { return P.x * N[0] + P.y * N[1] + P.z * N[2]; }
    function uvKey(P) { return Math.round((P.x * X[0] + P.y * X[1] + P.z * X[2]) * 1e9) + ',' + Math.round((P.x * Y[0] + P.y * Y[1] + P.z * Y[2]) * 1e9); }
    for (var k = 0; k < parts.length; k++) {
      var ps = parts[k].polygons, hmin = Infinity, hmax = -Infinity, walls = [], i, j, P, h;
      for (i = 0; i < ps.length; i++) {
        var pn = ps[i].plane.normal, nz = Math.abs(pn.x * N[0] + pn.y * N[1] + pn.z * N[2]);
        if (nz < 1e-12) walls.push(ps[i]);
        else if (nz < 1 - 1e-12) return null;
        for (j = 0; j < ps[i].vertices.length; j++) { h = hOf(ps[i].vertices[j].pos); if (h < hmin) hmin = h; if (h > hmax) hmax = h; }
      }
      if (!walls.length || !(hmax - hmin > 1e-9)) return null;
      var tol = 1e-9 * Math.max(1, Math.abs(hmin), Math.abs(hmax)), next = {}, nE = 0, start = null;
      for (i = 0; i < walls.length; i++) {
        var vs = walls[i].vertices;
        for (j = 0; j < vs.length; j++) {
          var A = vs[j].pos, B = vs[(j + 1) % vs.length].pos, ha = hOf(A), hb = hOf(B);
          if (Math.abs(ha - hmin) > tol && Math.abs(ha - hmax) > tol) return null;
          if (Math.abs(ha - hmax) <= tol && Math.abs(hb - hmax) <= tol) {
            var ka = uvKey(A), kb = uvKey(B);
            if (ka === kb) continue;
            if (next[ka]) return null;
            next[ka] = { k: kb, p: A }; nE++;
            if (start == null) start = ka;
          }
        }
      }
      // the top edges chained into one closed loop
      var loop = [], at = start;
      for (i = 0; i <= nE; i++) {
        var e = next[at];
        if (!e) return null;
        loop.push([e.p.x * X[0] + e.p.y * X[1] + e.p.z * X[2], e.p.x * Y[0] + e.p.y * Y[1] + e.p.z * Y[2]]);
        at = e.k;
        if (at === start) break;
      }
      if (at !== start || loop.length !== nE || loop.length < 3) return null;
      info.push({ pts: loop, walls: walls, hmin: hmin, hmax: hmax, tol: tol });
      lo0 = Math.max(lo0, hmin); hi0 = Math.min(hi0, hmax);
    }
    function wallsOf(l, nlo, nhi, lo, hi) {
      var I = info[l];
      return I.walls.map(function (w) {
        var c = w.clone();
        c._bs = null;
        c.vertices.forEach(function (v) {
          var P = v.pos, h = hOf(P), s = (Math.abs(h - I.hmin) <= I.tol ? lo : hi) - h;
          v.pos = new CSG.Vector(P.x + N[0] * s, P.y + N[1] * s, P.z + N[2] * s);
        });
        return c;
      });
    }
    return plateCore(body, plane, info.map(function (I) { return I.pts; }), wallsOf, [lo0, hi0]);
  }
  function ids0(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = i; return a; }

  var THROUGH = 5000;

  function extrudeRange(f, through) {
    through = through || THROUGH;
    if (f.depth != null && !isFinite(+f.depth)) throw new Error('Extrude depth must be a number.');
    if (f.dir2 && f.depth2 != null && !isFinite(+f.depth2)) throw new Error('Extrude depth must be a number.');
    var d = Math.abs(+f.depth || 0);
    var a, b;
    switch (f.end) {
      case 'through': a = 0; b = through; break;
      case 'mid': a = -d / 2; b = d / 2; break;
      default: a = 0; b = d;
    }
    if (f.reverse) { var t = -a; a = -b; b = t; }
    if (f.dir2) {
      var d2 = f.end2 === 'through' ? through : Math.abs(+f.depth2 || 0);
      if (f.reverse) b = Math.max(b, d2); else a = Math.min(a, -d2);
    }
    if (b - a < 1e-9) throw new Error('Extrude depth must be greater than zero.');
    return [a, b];
  }

  // Prism whose section is offset by offA at plane offset a and by offB at b (mitred offsets keep corresponding
  // edges parallel, so the side quads stay planar). Used for drafted extrudes.
  // On chords of true curves (cv, loopCurves) the offset is radial, so the section stays inscribed in the offset
  // circle and the side facets lie on a true cone (a mitred offset would inscribe them in a circle of radius
  // r + d / cos(half chord angle)); a vertex where a curve meets a tangent line or a tangent curve is offset radially
  // too, which keeps the line's facet planar.
  function curveOffset(loop, d, cv) {
    var out = offsetLoop(loop, d);
    if (!cv || !d || TESS.legacy) return out;
    var n = loop.length;
    function radial(i, C) {
      var p = loop[i], u = [(p[0] - C.c[0]) / C.r, (p[1] - C.c[1]) / C.r];
      // convex arc (centre on the left of a CCW loop): outward is away from the centre
      var k = cv.indexOf(C), a = loop[k], b = loop[(k + 1) % n];
      var sg = ((b[0] - a[0]) * (C.c[1] - a[1]) - (b[1] - a[1]) * (C.c[0] - a[0])) > 0 ? 1 : -1;
      if (signedArea(loop) < 0) sg = -sg;
      return [C.c[0] + u[0] * (C.r + sg * d), C.c[1] + u[1] * (C.r + sg * d)];
    }
    function dir(i, j) { var a = loop[i], b = loop[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    for (var i = 0; i < n; i++) {
      var ip = (i + n - 1) % n, Cp = cv[ip], Cn = cv[i];
      if (!Cp && !Cn) continue;
      if (Cp && Cn && Cp === Cn) { out[i] = radial(i, Cn); continue; }
      var C = Cn || Cp, other = Cn ? Cp : Cn, u = [(loop[i][0] - C.c[0]) / C.r, (loop[i][1] - C.c[1]) / C.r];
      var tangent;
      if (!other) { var t = Cn ? dir(ip, i) : dir(i, (i + 1) % n); tangent = Math.abs(t[0] * u[0] + t[1] * u[1]) < 1e-6; }
      else { var u2 = [(loop[i][0] - other.c[0]) / other.r, (loop[i][1] - other.c[1]) / other.r]; tangent = Math.abs(u[0] * u2[1] - u[1] * u2[0]) < 1e-6; }
      if (tangent) out[i] = radial(i, C);
    }
    return out;
  }
  function convexLoop(loop) {
    for (var i = 0, n = loop.length; i < n; i++) {
      var p = loop[i], q = loop[(i + 1) % n], r = loop[(i + 2) % n];
      var ux = q[0] - p[0], uy = q[1] - p[1], vx = r[0] - q[0], vy = r[1] - q[1];
      if (ux * vy - uy * vx < -1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) return false;
    }
    return true;
  }
  // rfGH (SolidWorks measured, rfGD R18a..c, R02b): a draft past the depth where the section runs out is not an error:
  // the drafted faces go on until they meet, at a tip or along a ridge (Ø1, 45°, depth 0.5 or 1: a cone 0.5 high; 2 × 1,
  // 45°: a roof 0.5 high, 0.416667), and any depth left over builds nothing. For a convex section the solid is the
  // intersection of its side planes and the end planes, so each face is the plane clipped by all the others; nothing is
  // re-offset, and the side planes are those of the plain frustum: the offsets are linear in d (mitres and radial
  // moves alike), so a collapsed section's "inverted" corners still lie on them. A concave section would need a
  // straight skeleton: it stays refused. Chords of true circles keep their cone (all through the tip): exact.
  function taperedRoof(loop, la, lb, plane, a, b, offA, offB, shared, cv) {
    var n = loop.length, nA = scale(plane.n, a), nB = scale(plane.n, b), low = Math.abs(offA) <= Math.abs(offB);
    var A = la.map(function (p) { return add(to3D(plane, p[0], p[1]), nA); }), B = lb.map(function (p) { return add(to3D(plane, p[0], p[1]), nB); });
    var base = low ? A : B, far = low ? B : A, mid = [0, 0, 0], size = Math.abs(b - a);
    base.forEach(function (p) { mid = add(mid, scale(p, 1 / n)); });
    base.forEach(function (p) { size = Math.max(size, len(sub(p, mid))); });
    var hs = [], own = [], i;   // half-spaces n·x <= w; own[i]: the side plane of edge i
    for (i = 0; i < n; i++) {
      var p = base[i], q = base[(i + 1) % n], r = far[i], N = cross(sub(q, p), sub(r, p)), l = len(N);
      own.push(-1);
      if (l < 1e-14 * size * size) continue;
      N = scale(N, 1 / l);
      if (dot(N, sub(mid, p)) > 0) N = scale(N, -1);
      var w = dot(N, p), same = -1;
      for (var h = 0; h < hs.length && same < 0; h++) if (len(sub(hs[h].n, N)) < 1e-12 && Math.abs(hs[h].w - w) < 1e-12 * size) same = h;
      if (same >= 0) { own[i] = same; continue; }
      own[i] = hs.length;
      hs.push({ n: N, w: w });
    }
    var sideCount = hs.length, w0 = dot(plane.n, to3D(plane, 0, 0));
    hs.push({ n: plane.n.slice(), w: w0 + b }); hs.push({ n: scale(plane.n, -1), w: -(w0 + a) });
    // one plane's face: a big square on it, cut by every other half-space. Tip and ridge corners are computed from
    // several planes, so they are welded to one point (1e-10 of the size) or a tip would come out as a tiny facet.
    var eps = 1e-12 * size, weld = {}, Q = 1e10 / size;
    function snap(x) {
      var k = Math.round(x[0] * Q) + ',' + Math.round(x[1] * Q) + ',' + Math.round(x[2] * Q);
      return weld[k] || (weld[k] = x);
    }
    function face(f) {
      var hf = hs[f], ax = Math.abs(hf.n[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0], u = norm(cross(ax, hf.n)), v = cross(hf.n, u), S = 8 * size;
      var c = add(mid, scale(hf.n, hf.w - dot(hf.n, mid))), pts = [add(add(c, scale(u, -S)), scale(v, -S)), add(add(c, scale(u, S)), scale(v, -S)), add(add(c, scale(u, S)), scale(v, S)), add(add(c, scale(u, -S)), scale(v, S))];
      for (var g = 0; g < hs.length && pts.length >= 3; g++) {
        if (g === f) continue;
        var cut = hs[g], out = [];
        for (var k = 0; k < pts.length; k++) {
          var P = pts[k], R = pts[(k + 1) % pts.length], dp = dot(cut.n, P) - cut.w, dr = dot(cut.n, R) - cut.w;
          if (dp <= eps) out.push(P);
          if ((dp < -eps && dr > eps) || (dp > eps && dr < -eps)) out.push(add(P, scale(sub(R, P), dp / (dp - dr))));
        }
        pts = out;
      }
      var keep = [];
      pts.map(snap).forEach(function (x) { if (!keep.length || keep[keep.length - 1] !== x) keep.push(x); });
      while (keep.length > 1 && keep[0] === keep[keep.length - 1]) keep.pop();
      return keep.length >= 3 ? poly(keep, shared) : null;
    }
    var polys = [], made = [], sides = [];
    for (i = 0; i < hs.length; i++) made.push(face(i));
    for (i = sideCount; i < hs.length; i++) if (made[i]) polys.push(made[i]);
    for (i = 0; i < n; i++) sides.push(own[i] >= 0 ? made[own[i]] : null);
    tagSides(sides, cv, function (C) {
      var k = (offB - offA) / (b - a);
      return { t: 'cone', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: C.r + offA - k * a, k: k };
    });
    for (i = 0; i < sideCount; i++) if (made[i]) polys.push(made[i]);
    if (polys.length < 4) throw new Error('Draft angle is too large for this depth: the profile collapses.');
    return ensureOutward(polys);
  }
  function taperedPrism(loop, plane, a, b, offA, offB, shared, cv) {
    var la = offA ? curveOffset(loop, offA, cv) : loop, lb = offB ? curveOffset(loop, offB, cv) : loop;
    // an offset loop has collapsed when any edge reverses direction (a square offset past its centre keeps its area sign)
    function collapsed(off) {
      for (var i = 0; i < loop.length; i++) {
        var j = (i + 1) % loop.length;
        if ((loop[j][0] - loop[i][0]) * (off[j][0] - off[i][0]) + (loop[j][1] - loop[i][1]) * (off[j][1] - off[i][1]) <= 1e-12) return true;
      }
      return signedArea(off) <= 1e-9;
    }
    if (collapsed(la) || collapsed(lb)) {
      if (convexLoop(loop)) return taperedRoof(loop, la, lb, plane, a, b, offA, offB, shared, cv);
      throw new Error('Draft angle is too large for this depth: the profile collapses.');
    }
    var polys = [], n = loop.length;
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = la.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = lb.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    triangulate(lb).forEach(function (t) { pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared); });
    triangulate(la).forEach(function (t) { pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared); });
    var sides = [];
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      sides.push(poly([bottom[i], bottom[j], top[j], top[i]], shared));
    }
    // the cone through the chord ends: radius at the sketch plane and slope from the section's own vertices
    tagSides(sides, cv, function (C, i) {
      var v = cv[(i + n - 1) % n] === C ? i : (i + 1) % n; // prefer a vertex inside the arc over a junction
      var ra = Math.hypot(la[v][0] - C.c[0], la[v][1] - C.c[1]), rb = Math.hypot(lb[v][0] - C.c[0], lb[v][1] - C.c[1]);
      var k = (rb - ra) / (b - a);
      if (Math.abs(k) < 1e-12) return cylSurf(plane, { c: C.c, r: ra });
      return { t: 'cone', o: to3D(plane, C.c[0], C.c[1]), d: plane.n.slice(), r: ra - k * a, k: k };
    });
    sides.forEach(function (p) { if (p) polys.push(p); });
    return ensureOutward(polys);
  }

  function buildExtrude(f, sketch, plane, through) {
    var profile = sketch.profile || sketchProfile(sketch);
    var range = extrudeRange(f, through);
    if (f.draft != null && !isFinite(+f.draft)) throw new Error('Draft angle must be a number.');
    var draft = +f.draft || 0;
    if (Math.abs(draft) >= 89) throw new Error('Draft angle must be less than 89°.');
    // draft: the section shrinks (or grows, with draftOut) by |t|·tan(angle) at distance t from the sketch plane
    var k = draft ? Math.tan(draft * Math.PI / 180) * (f.draftOut ? 1 : -1) : 0;
    return solidFromProfile(profile, function (pts, hole, cv) {
      var a = range[0], b = range[1];
      if (hole) { a -= 0.01; b += 0.01; }
      if (!k) return prism(pts, plane, a, b, f.id, cv);
      var s = hole ? -1 : 1; // holes are the complement: they grow when the material shrinks
      function part(a0, b0) { return taperedPrism(pts, plane, a0, b0, s * k * Math.abs(a0), s * k * Math.abs(b0), f.id, cv); }
      // the taper starts at the sketch plane on both sides (mid-plane, direction 2), so split there
      if (a < -1e-9 && b > 1e-9) return part(a, 0).union(part(0, b));
      return part(a, b);
    });
  }

  function revolveAxis(f, sketch) {
    var ax = f.axis;
    if (ax === 'y' || ax == null) return { p: [0, 0], d: [0, 1] };
    if (ax === 'x') return { p: [0, 0], d: [1, 0] };
    if (typeof ax === 'object' && ax.x1 != null) return { p: [ax.x1, ax.y1], d: [ax.x2 - ax.x1, ax.y2 - ax.y1] };
    var e = sketch.entities[ax];
    if (!e || e.t !== 'line') throw new Error('Revolve axis must be a sketch line.');
    return { p: [e.x1, e.y1], d: [e.x2 - e.x1, e.y2 - e.y1] };
  }

  function buildRevolve(f, sketch, plane) {
    var profile = sketch.profile || sketchProfile(sketch);
    var axis = revolveAxis(f, sketch);
    var axisLine = f.axis, isLine = typeof axisLine === 'number';
    if (f.angle != null && !isFinite(+f.angle)) throw new Error('Revolve angle must be a number.');
    var angle = +f.angle || 360;
    if (f.reverse) angle = -angle;
    var dl = len([axis.d[0], axis.d[1], 0]);
    if (dl < 1e-9) throw new Error('Revolve axis has zero length.');
    var d = [axis.d[0] / dl, axis.d[1] / dl];
    // one ring count for the whole feature, from the largest radius of any loop
    var rmax = 0;
    profile.loops.forEach(function (l) { l.pts.forEach(function (p) { rmax = Math.max(rmax, Math.abs((p[0] - axis.p[0]) * d[1] - (p[1] - axis.p[1]) * d[0])); }); });
    var segs = revolveSegs(rmax, angle);
    return solidFromProfile(profile, function (pts, hole, cv, l) {
      // reject loops crossing the axis
      var side = 0;
      for (var i = 0; i < pts.length; i++) {
        var s = (pts[i][0] - axis.p[0]) * d[1] - (pts[i][1] - axis.p[1]) * d[0];
        if (Math.abs(s) < 1e-7) continue;
        if (side === 0) side = s > 0 ? 1 : -1;
        else if ((s > 0 ? 1 : -1) !== side) throw new Error('Revolve profile crosses the axis.');
      }
      return revolveLoop(pts, plane, axis.p, d, angle, f.id, cv, segs, l && l.fseg);
    });
  }

  function translateBody(body, t) {
    return body.transform(function (p) { return new CSG.Vector(p.x + t[0], p.y + t[1], p.z + t[2]); }, false);
  }
  function rotateBody(body, center, axis, angleDeg) {
    var ang = angleDeg * Math.PI / 180;
    return body.transform(function (p) { return vec(rotatePoint(arr(p), center, axis, ang)); }, false);
  }
  function mirrorBody(body, plane) {
    var n = plane.n, o = plane.origin;
    return body.transform(function (p) {
      var q = arr(p);
      var dd = dot(sub(q, o), n);
      return vec(sub(q, scale(n, 2 * dd)));
    }, true);
  }

  // ------------------------------------------------------------------ exact volumes from the analytic records
  // curveCorrection(polygons) -> { volume, moment: [x, y, z], area, facets } — what the true curved faces add to (or,
  // for concave faces such as holes, take from) the polygonal solid: volume, first moment ∫x dV, and surface area.
  // Each facet fragment F owns the region between itself and its true surface, swept along columns that keep the
  // pieces of neighbouring facets apart (so fragments made by CSG splits still add up exactly):
  //   cylinders / cones: in the plane perpendicular to the axis through x, the ray from the axis through x, out to
  //     the surface radius R(z). Per unit area of F that is (n·eρ)(R² − ρ²)/(2ρ) (ρ = distance of x from the axis,
  //     eρ the radial direction): the polar area ∫ρ dρ dφ with dφ dz = |n·eρ|/ρ dA. A facet's slice is a chord of
  //     the circle R(z), so the sum over a whole ring of facets is exactly the circle minus the polygon.
  //   spheres / tori (revolved arcs), in two levels: first out to the cone through the circles of the chord's ends
  //     P and Q (as above), then, in the meridian half-plane, along the ray from the arc centre C through that point
  //     on the chord PQ out to the arc: ∫(Cρ + r' cos θ) r' dr' dθ dφ, with dθ = h / r_y² ds along the chord.
  // The columns are exact where the neighbouring faces are perpendicular to the axis (caps, steps, hole bottoms) or
  // contain it (the ends of a partial revolve); elsewhere (a hole drilled through a slanted face, crossing cylinders)
  // the error is of the order of the sliver's own curvature. Integrals: Gauss-Legendre on each fan triangle
  // (collapsed square, 6 × 6 points), the columns in closed form.
  var GL6 = { x: [0.033765242898423986, 0.16939530676686776, 0.38069040695840156, 0.6193095930415985, 0.8306046932331322, 0.966234757101576],
    w: [0.08566224618958517, 0.18038078652406933, 0.23395696728634552, 0.23395696728634552, 0.18038078652406933, 0.08566224618958517] };

  // r11/perf11: a box that holds every point the inside test below can accept for planar polygon p (x0 y0 z0 x1 y1 z1),
  // so most polygons of a big plane are skipped at once (the Flange's curve correction 28 → 10 ms, same result). The
  // test lets a point be up to d = 1e-12·max(1, L²)/L outside an edge of length L and 1e-6·max(1, |w|) off the plane;
  // on a convex polygon that stays within max(d) / sin(α/2) of it (α its sharpest corner), padded twice over here. A
  // polygon with a very short edge or a needle corner gets an infinite box (always tested, as before).
  // Kernel.massOptions: planarBoxes (the box filter) and cache (massProps kept per mesh); the tests switch them off to
  // compare
  var massOptions = { planarBoxes: true, cache: true };
  function planarBox(p) {
    var vs = p.vertices, n = vs.length, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], dmax = 0, smin = 1;
    for (var j = 0; j < n; j++) {
      var a = vs[j].pos, b = vs[(j + 1) % n].pos, c = vs[(j + 2) % n].pos;
      lo[0] = Math.min(lo[0], a.x); lo[1] = Math.min(lo[1], a.y); lo[2] = Math.min(lo[2], a.z);
      hi[0] = Math.max(hi[0], a.x); hi[1] = Math.max(hi[1], a.y); hi[2] = Math.max(hi[2], a.z);
      var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
      var L = Math.sqrt(ux * ux + uy * uy + uz * uz), M = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (!(L > 1e-6) || !(M > 1e-6)) return [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
      dmax = Math.max(dmax, 1e-12 * Math.max(1, L * L) / L);
      var cosA = -(ux * vx + uy * vy + uz * vz) / (L * M);   // interior angle at b
      smin = Math.min(smin, Math.sqrt(Math.max(0, (1 - cosA) / 2)));
    }
    if (!(smin > 1e-3) || !(n >= 3)) return [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
    var pad = 2 * (dmax / smin + 1e-6 * Math.max(1, Math.abs(p.plane.w))) + 1e-9;
    return [lo[0] - pad, lo[1] - pad, lo[2] - pad, hi[0] + pad, hi[1] + pad, hi[2] + pad];
  }
  // planar faces by plane, for the side walls of the slivers (surface area only)
  function planarIndex(polys) {
    var idx = {}, boxIdx = {};
    polys.forEach(function (p) {
      if (p.surf) return;
      var n = p.plane.normal, s = (n.x < -1e-9 || (Math.abs(n.x) <= 1e-9 && (n.y < -1e-9 || (Math.abs(n.y) <= 1e-9 && n.z < 0)))) ? -1 : 1;
      var k = Math.round(n.x * s * 1000) + ',' + Math.round(n.y * s * 1000) + ',' + Math.round(n.z * s * 1000) + ',' + Math.round(p.plane.w * s * 1e4);
      (idx[k] = idx[k] || []).push(p);
      (boxIdx[k] = boxIdx[k] || []).push(planarBox(p));
    });
    // rfGM: a plane of many polygons (a perforated plate's caps) gets a grid on its two widest axes, so a query looks at
    // the polygons whose boxes cover its cell, not at the whole list. Same answers: only polygons the box filter would
    // have skipped are left out. Boxes with no extent limit, or covering many cells, are in every cell (`wide`).
    var grids = {};
    function planarGrid(list, boxes) {
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], wide = [], i, k;
      for (i = 0; i < list.length; i++) {
        if (boxes[i][0] === -Infinity) { wide.push(i); continue; }
        for (k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], boxes[i][k]); hi[k] = Math.max(hi[k], boxes[i][k + 3]); }
      }
      var sp = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], small = sp.indexOf(Math.min(sp[0], sp[1], sp[2])), a = small === 0 ? 1 : 0, b = small === 2 ? 1 : 2;
      if (!(sp[a] > 0) || !(sp[b] > 0)) return null;
      var nc = Math.ceil(Math.sqrt(list.length)), nx = Math.min(1024, nc), ny = Math.min(1024, nc), fx = nx / sp[a], fy = ny / sp[b], cells = new Array(nx * ny);
      for (i = 0; i < list.length; i++) {
        var B = boxes[i];
        if (B[0] === -Infinity) continue;
        var x0 = Math.floor((B[a] - lo[a]) * fx), x1 = Math.min(nx - 1, Math.floor((B[a + 3] - lo[a]) * fx)), y0 = Math.floor((B[b] - lo[b]) * fy), y1 = Math.min(ny - 1, Math.floor((B[b + 3] - lo[b]) * fy));
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 1024) { wide.push(i); continue; }
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) (cells[y * nx + x] = cells[y * nx + x] || []).push(i);
      }
      if (wide.length > 256) return null;
      return { lo: lo, a: a, b: b, fx: fx, fy: fy, nx: nx, ny: ny, cells: cells, wide: wide };
    }
    function planarCell(key, list, boxes, q) {
      if (!massOptions.planarBoxes || list.length <= 64) return null;
      if (grids[key] === undefined) grids[key] = planarGrid(list, boxes);
      var g = grids[key];
      if (!g) return null;
      var x = Math.floor((q[g.a] - g.lo[g.a]) * g.fx), y = Math.floor((q[g.b] - g.lo[g.b]) * g.fy);
      if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) return g.wide;
      var c = g.cells[y * g.nx + x];
      return c ? (g.wide.length ? c.concat(g.wide) : c) : g.wide;
    }
    return function (N, q) {
      var s = (N[0] < -1e-9 || (Math.abs(N[0]) <= 1e-9 && (N[1] < -1e-9 || (Math.abs(N[1]) <= 1e-9 && N[2] < 0)))) ? -1 : 1;
      var w = dot(N, q) * s, base = Math.round(N[0] * s * 1000) + ',' + Math.round(N[1] * s * 1000) + ',' + Math.round(N[2] * s * 1000) + ',', wk = Math.round(w * 1e4);
      for (var dk = -1; dk <= 1; dk++) {
        var list = idx[base + (wk + dk)], boxes = boxIdx[base + (wk + dk)];
        if (!list) continue;
        var sel = planarCell(base + (wk + dk), list, boxes, q), cnt = sel ? sel.length : list.length;
        for (var c0 = 0; c0 < cnt; c0++) {
          var i = sel ? sel[c0] : c0, bx = boxes[i];
          if (massOptions.planarBoxes && (q[0] < bx[0] || q[0] > bx[3] || q[1] < bx[1] || q[1] > bx[4] || q[2] < bx[2] || q[2] > bx[5])) continue;
          var p = list[i], pn = p.plane.normal, vs = p.vertices, inside = true;
          if (Math.abs(pn.x * q[0] + pn.y * q[1] + pn.z * q[2] - p.plane.w) > 1e-6 * Math.max(1, Math.abs(p.plane.w))) continue;
          for (var j = 0; j < vs.length && inside; j++) {
            var a = vs[j].pos, b = vs[(j + 1) % vs.length].pos;
            var ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, qx = q[0] - a.x, qy = q[1] - a.y, qz = q[2] - a.z;
            var cx = ey * qz - ez * qy, cy = ez * qx - ex * qz, cz = ex * qy - ey * qx;
            if (cx * pn.x + cy * pn.y + cz * pn.z < -1e-12 * Math.max(1, ex * ex + ey * ey + ez * ez)) inside = false;
          }
          if (inside) return true;
        }
      }
      return false;
    };
  }

  // densities at a point x of a facet with unit outward normal n: [volume, mx, my, mz, true area] per unit facet area
  function curveDensity(F, x, n, phiC) {
    var S = F.s, rel = sub(x, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)), rx = len(v);
    if (rx < 1e-12) return null;
    var er = scale(v, 1 / rx), nr = dot(n, er), base = add(S.o, scale(S.d, z)), out = [0, 0, 0, 0, 0];
    function level1(R) {
      var f = nr / rx, i1 = (R * R - rx * rx) / 2, i2 = (R * R * R - rx * rx * rx) / 3;
      out[0] += f * i1;
      for (var k = 0; k < 3; k++) out[1 + k] += f * (base[k] * i1 + er[k] * i2);
    }
    if (S.t === 'cyl' || S.t === 'cone') {
      var kk = S.k || 0, R = S.r + kk * z;
      level1(R);
      out[4] = R * Math.sqrt(1 + kk * kk) * Math.abs(nr) / rx;
      return out;
    }
    if (!F.P || !F.Q) {
      // a sphere / torus facet not made by a revolve (OpenCascade's triangles): no profile chord, no correction, unless
      // it says its corners lie on the surface (lane stepreal2, `g: 1`: the STEP reader's patches of any outline). Then
      // the column from x runs along the ray from the sphere's centre, or from the tube's centre circle in x's own
      // meridian half-plane, out to the surface: ∫ρ'² dρ' dΩ with dΩ = (n·e)/ρ'² dA on a sphere, ∫ρ'(R + ρ' cos ψ) dρ'
      // dψ dφ with dψ dφ = (n·e) / (ρ'(R + ρ' cos ψ)) dA on a torus (ρ' the distance from the centre / the centre
      // circle, e the ray's direction). Columns of facets that share an edge share its wall, so a whole patch adds up.
      if (!F.g) return null;
      var Cg = S.t === 'tor' ? S.R : 0, ag = rx - Cg, rg = Math.hypot(ag, z), rs = S.r;
      if (rg < 1e-12) return out;
      var cg = ag / rg, sg2 = z / rg, eg = add(scale(er, cg), scale(S.d, sg2)), neg = dot(n, eg);
      var G1 = (rs * rs - rg * rg) / 2, G2 = (rs * rs * rs - rg * rg * rg) / 3, G3 = (rs * rs * rs * rs - rg * rg * rg * rg) / 4, kg;
      if (S.t === 'sph') {
        var Jc = neg / (rg * rg);
        out[0] = Jc * G2;
        for (kg = 0; kg < 3; kg++) out[1 + kg] = Jc * (S.o[kg] * G2 + eg[kg] * G3);
        out[4] = rs * rs * Math.abs(Jc);
        return out;
      }
      var wg = Cg + rg * cg;
      if (!(wg > 1e-12)) return out;
      var Jt = neg / (rg * wg), gg = Cg * G1 + cg * G2, zg = sg2 * (Cg * G2 + cg * G3), rmg = Cg * Cg * G1 + 2 * Cg * cg * G2 + cg * cg * G3;
      out[0] = Jt * gg;
      for (kg = 0; kg < 3; kg++) out[1 + kg] = Jt * (S.o[kg] * gg + S.d[kg] * zg + er[kg] * rmg);
      out[4] = rs * Math.abs(Cg + rs * cg) * Math.abs(Jt);
      return out;
    }
    var P = F.P, Q = F.Q, Cr = S.t === 'tor' ? S.R : 0, r = S.r;
    var dz = Q[1] - P[1], dr = Q[0] - P[0], L = Math.hypot(dr, dz), y, js;
    if (Math.abs(dz) > 1e-12 * Math.max(1, L)) {
      var R1 = P[0] + dr * (z - P[1]) / dz;
      level1(R1);
      y = [R1, z];
      js = L / Math.abs(dz) * Math.abs(nr) / rx;
    } else {
      // a chord perpendicular to the axis: its facets are planar trapezoids; map them onto the annulus radially
      // within their ring of facets (the ring comes from the fragment's centroid angle phiC)
      var dphi = F.dphi, beta = Math.abs(dphi) / 2, e0 = F.e0, e1 = cross(S.d, e0);
      var phi = Math.atan2(dot(er, e1), dot(er, e0));
      var jr = Math.floor(phiC / dphi), phim = (jr + 0.5) * dphi;
      var u = rx * Math.cos(phi - phim);
      y = [u / Math.cos(beta), P[1]];
      js = L / Math.abs(dr) * Math.abs(u) / (rx * rx * Math.cos(beta));
    }
    var a = y[0] - Cr, b = y[1], ry = Math.hypot(a, b);
    if (ry < 1e-12) return out;
    var c = a / ry, sn = b / ry;
    var h = Math.abs(dr * (0 - P[1]) - dz * (Cr - P[0])) / L;
    var nz = dot(n, S.d), sg = ((Cr - P[0]) * nr + (0 - P[1]) * nz) < 0 ? 1 : -1;
    var J = h / (ry * ry) * js;
    var I1 = (r * r - ry * ry) / 2, I2 = (r * r * r - ry * ry * ry) / 3, I3 = (r * r * r * r - ry * ry * ry * ry) / 4;
    var g = Cr * I1 + c * I2, zm = sn * Cr * I2 + sn * c * I3, rm = Cr * Cr * I1 + 2 * Cr * c * I2 + c * c * I3;
    out[0] += sg * J * g;
    for (var k2 = 0; k2 < 3; k2++) out[1 + k2] += sg * J * (S.o[k2] * g + S.d[k2] * zm + er[k2] * rm);
    out[4] = r * Math.abs(Cr + r * c) * J;
    return out;
  }

  function angleOf(F, x) {
    var S = F.s, rel = sub(x, S.o), v = sub(rel, scale(S.d, dot(rel, S.d)));
    var phi = Math.atan2(dot(v, cross(S.d, F.e0)), dot(v, F.e0));
    if (F.dphi > 0 && phi < 0) phi += 2 * Math.PI;
    if (F.dphi < 0 && phi > 0) phi -= 2 * Math.PI;
    return phi;
  }

  // the side walls of a fragment's sliver that lie in a planar face (area only): +wall where the face is on the
  // axis side (or the arc-centre side) of the chord, −wall where it is on the far side
  function curveWalls(F, p, planar) {
    var S = F.s, vs = p.vertices, total = 0, n = arr(p.plane.normal);
    for (var i = 0; i < vs.length; i++) {
      var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos), el = len(sub(B, A));
      if (el < 1e-9) continue;
      var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, Math.abs(za), el);
      var M = scale(add(A, B), 0.5), zm = dot(sub(M, S.o), S.d), cM = add(S.o, scale(S.d, zm)), vm = sub(M, cM), rm = len(vm);
      if (rm < 1e-12) continue;
      var erm = scale(vm, 1 / rm), eps = 1e-4 * el, wall = null, inner, outer, N;
      if (Math.abs(za - zb) < 1e-9 * scl) {
        var R = null;
        if (S.t === 'cyl' || S.t === 'cone') R = S.r + (S.k || 0) * zm;
        else if (F.P && F.Q && Math.abs(F.Q[1] - F.P[1]) > 1e-12 * scl) R = F.P[0] + (F.Q[0] - F.P[0]) * (zm - F.P[1]) / (F.Q[1] - F.P[1]);
        if (R != null) {
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var cosA = dot(va, vb) / (len(va) * len(vb) || 1), dphi = Math.acos(Math.max(-1, Math.min(1, cosA)));
          wall = R * R * dphi / 2 - len(cross(va, vb)) / 2;
          inner = sub(M, scale(erm, eps)); outer = add(M, scale(erm, eps)); N = S.d;
        }
      } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
        // an edge in a meridian half-plane (the end of a partial revolve): the arc's own segment
        var Cr = S.t === 'tor' ? S.R : 0, pa = [len(sub(sub(A, S.o), scale(S.d, za))) - Cr, za], pb = [len(sub(sub(B, S.o), scale(S.d, zb))) - Cr, zb];
        var ang = Math.acos(Math.max(-1, Math.min(1, (pa[0] * pb[0] + pa[1] * pb[1]) / (Math.hypot(pa[0], pa[1]) * Math.hypot(pb[0], pb[1]) || 1))));
        wall = S.r * S.r * ang / 2 - Math.abs(pa[0] * pb[1] - pa[1] * pb[0]) / 2;
        var o2 = [rm - Cr, zm], ol = Math.hypot(o2[0], o2[1]) || 1, dout = add(scale(erm, o2[0] / ol), scale(S.d, o2[1] / ol));
        inner = sub(M, scale(dout, eps)); outer = add(M, scale(dout, eps)); N = norm(cross(S.d, erm));
      }
      if (wall == null || !(Math.abs(wall) > 0)) continue;
      if (planar(N, inner)) total += wall;
      if (planar(N, outer)) total -= wall;
    }
    return total;
  }

  function curveCorrection(polys) {
    var res = { volume: 0, moment: [0, 0, 0], area: 0, facets: 0 };
    var planar = null;
    for (var pi = 0; pi < polys.length; pi++) {
      var p = polys[pi], F = p.surf;
      if (!F) continue;
      res.facets++;
      var vs = p.vertices, n = arr(p.plane.normal), phiC = 0, polyArea = 0;
      if (F.P && F.e0) {
        var cen = [0, 0, 0];
        vs.forEach(function (v) { cen = add(cen, arr(v.pos)); });
        phiC = angleOf(F, scale(cen, 1 / vs.length));
      }
      // fan from the vertex nearest the axis: the densities vary fastest there (a sphere's pole), and the collapsed
      // square's corner at u = 0 clusters its points on the fan apex
      var i0 = 0, best = Infinity;
      for (var q = 0; q < vs.length; q++) {
        var rq = sub(arr(vs[q].pos), F.s.o), dq = len(sub(rq, scale(F.s.d, dot(rq, F.s.d))));
        if (dq < best - 1e-12) { best = dq; i0 = q; }
      }
      var A = arr(vs[i0].pos);
      for (var j = 1; j + 1 < vs.length; j++) {
        var B = arr(vs[(i0 + j) % vs.length].pos), C = arr(vs[(i0 + j + 1) % vs.length].pos), ab = sub(B, A), bc = sub(C, B);
        var ar2 = len(cross(ab, sub(C, A)));
        if (ar2 < 1e-18) continue;
        polyArea += ar2 / 2;
        for (var iu = 0; iu < 6; iu++) {
          var u = GL6.x[iu];
          for (var iv = 0; iv < 6; iv++) {
            var v = GL6.x[iv], wgt = GL6.w[iu] * GL6.w[iv] * ar2 * u;
            var x = add(A, add(scale(ab, u), scale(bc, u * v)));
            var d = curveDensity(F, x, n, phiC);
            if (!d) continue;
            res.volume += wgt * d[0];
            res.moment[0] += wgt * d[1]; res.moment[1] += wgt * d[2]; res.moment[2] += wgt * d[3];
            res.area += wgt * d[4];
          }
        }
      }
      res.area -= polyArea;
      if (!planar) planar = planarIndex(polys);
      res.area += curveWalls(F, p, planar);
    }
    if (res.facets) boundCorrection(polys, res);
    return res;
  }

  // lane FX (rfFY's two TODO rows): curveCorrection's columns run radially from each facet point out to the cylinder,
  // so the sliver of a fragment ends on the ruled radial wall over each of its edges. That is the true boundary where
  // the face beside it holds the axis (a facet seam, a partial revolve's end) or is square to it (a cap), but not where a
  // plane cuts the surface obliquely: a mitre between two rounds (the bisector plane), a pocket's wall or floor parallel
  // to the axis, a sheet-metal flange's mitre. boundCorrection adds, for every such edge of a cylinder fragment, the
  // volume between that radial wall and the bounding plane inside the sliver (exact for planes parallel to the axis, a
  // Gauss-Legendre line integral of the closed-form ρ integral otherwise) and its first moment. The bounding plane is the
  // planar polygon sharing the edge, or the bisector plane of two cylinder records of one radius meeting there.
  function boundCorrection(polys, res) {
    var cands = [], scl = 1;
    function A3(v) { return [v.pos.x, v.pos.y, v.pos.z]; }
    polys.forEach(function (p) {
      var F = p.surf, S = F && F.s;
      if (!S || F.fc) return;
      var isCyl = S.t === 'cyl';
      if (isCyl ? !(S.r > 0) : (S.t === 'cone' ? false : !(F.P && F.Q && S.r > 0))) return;
      var vs = p.vertices, R = S.r, tolR = 1e-9 * Math.max(1, R);
      for (var i = 0; i < vs.length; i++) {
        var A = A3(vs[i]), B = A3(vs[(i + 1) % vs.length]), AB = sub(B, A), L = len(AB);
        scl = Math.max(scl, Math.abs(A[0]), Math.abs(A[1]), Math.abs(A[2]));
        if (!(L > 1e-9)) continue;
        var cap = false;
        if (isCyl) {
          var ax = dot(AB, S.d) / L, ra = len(sub(sub(A, S.o), scale(S.d, dot(sub(A, S.o), S.d))));
          if (Math.abs(ax) > 1 - 1e-12) { if (ra > R - tolR) continue; }   // a seam between facets (on the circle)
          else if (Math.abs(ax) < 1e-9) cap = true;                        // square to the axis: a cap (exact on a plane)
        }
        cands.push({ p: p, A: A, B: B, L: L, S: S, cap: cap });
      }
    });
    if (!cands.length) return;
    // every polygon edge in a sparse grid, so an edge finds its neighbours without scanning the part (a perforated plate
    // has hundreds of thousands of edges; by direction alone every hole's rim landed in one list: quadratic)
    var edges = [], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    polys.forEach(function (q) {
      var vs = q.vertices;
      for (var i = 0; i < vs.length; i++) {
        var P = A3(vs[i]), Q = A3(vs[(i + 1) % vs.length]), PQ = sub(Q, P), l = len(PQ);
        if (!(l > 1e-12)) continue;
        edges.push({ q: q, P: P, Q: Q, u: scale(PQ, 1 / l) });
        for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[a]); hi[a] = Math.max(hi[a], P[a]); }
      }
    });
    // rfHV (1.8 s of Mass Properties on a 1000 hole panel, each hole-wall edge met ~350 neighbours): (1) an edge that
    // runs along no candidate's direction (|e.u · u| < 1 - 1e-4 for every candidate: the first test below) is never
    // put in the grid; the candidates' directions are clustered within 1e-6 (≤ 256 clusters, else every edge goes in)
    // and the test is widened by 4e-6, so only edges that test can never accept are left out; (2) cells about the median
    // candidate edge long (was the part's size / √edges, 0.17 in on a 48 x 96 in panel), but never so fine that the
    // edges in the grid are sampled more than 8 times each on average, nor finer than the part / 4000. Every edge that
    // runs along a candidate still lands in a neighbouring cell and they are visited in index order: the same result.
    var reps = [];
    for (var ci0 = 0; ci0 < cands.length && reps; ci0++) {
      var c0 = cands[ci0], u0 = scale(sub(c0.B, c0.A), 1 / c0.L), hit = false;
      for (var r0 = 0; r0 < reps.length && !hit; r0++) { var R0 = reps[r0]; hit = Math.abs(R0[0] - u0[0]) <= 1e-6 && Math.abs(R0[1] - u0[1]) <= 1e-6 && Math.abs(R0[2] - u0[2]) <= 1e-6; }
      if (!hit) { if (reps.length >= 256) reps = null; else reps.push(u0); }
    }
    var inGrid = edges.map(function (e) {
      if (!reps) return true;
      for (var r = 0; r < reps.length; r++) if (Math.abs(dot(e.u, reps[r])) >= 1 - 1e-4 - 4e-6) return true;
      return false;
    });
    var span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-9), sumL = 0, nIn = 0, cl = cands.map(function (c) { return c.L; }).sort(function (x, y) { return x - y; });
    edges.forEach(function (e, i) { if (inGrid[i]) { sumL += len(sub(e.Q, e.P)); nIn++; } });
    var G = Math.min(1024, Math.max(8, Math.ceil(Math.sqrt(edges.length)))), cell = Math.min(span / G, Math.max(cl[cl.length >> 1], 2 * sumL / (8 * Math.max(1, nIn)), span / 4000));
    var grid = new Map(), stamp = new Int32Array(edges.length);
    var lo0 = lo[0], lo1 = lo[1], lo2 = lo[2];
    // the cells of a segment, sampled at half a cell (a query takes the 26 neighbours too, so nothing falls between)
    function eachCell(P, Q, fn) {
      var d0 = Q[0] - P[0], d1 = Q[1] - P[1], d2 = Q[2] - P[2];
      var n = Math.max(1, Math.ceil(Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2) / (cell / 2))), last = -1;
      for (var s = 0; s <= n; s++) {
        var f = s / n, key = (Math.floor((P[0] + d0 * f - lo0) / cell) + 2) * 16777216 + (Math.floor((P[1] + d1 * f - lo1) / cell) + 2) * 4096 + (Math.floor((P[2] + d2 * f - lo2) / cell) + 2);
        if (key !== last) { last = key; fn(key); }
      }
    }
    edges.forEach(function (e, i) {
      if (!inGrid[i]) return;
      eachCell(e.P, e.Q, function (key) { var list = grid.get(key); if (list) { if (list[list.length - 1] !== i) list.push(i); } else grid.set(key, [i]); });
    });
    var tol = 1e-7 * scl, jobs = [], stopped = {};
    cands.forEach(function (c, ci) {
      // the stretches of the edge each neighbour borders (a fragment edge may run on past a sibling fragment of its own
      // surface, a facet split along the line of a pocket's wall, into the wall itself): planes with their intervals
      var u = scale(sub(c.B, c.A), 1 / c.L), planes = [];
      function put(pl, t0, t1) {
        var k = null;
        for (var i = 0; i < planes.length && !k; i++) if (planes[i].n && dot(planes[i].n, pl.n) > 1 - 1e-9 && Math.abs(planes[i].w - pl.w) <= tol) k = planes[i];
        if (!k) planes.push(k = { n: pl.n, w: pl.w, iv: [] });
        k.iv.push([t0, t1]);
      }
      var near = [];
      eachCell(c.A, c.B, function (key) {
        for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) for (var g = -1; g <= 1; g++) {
          var list = grid.get(key + a * 16777216 + b * 4096 + g);
          if (!list) continue;
          for (var k = 0; k < list.length; k++) {
            var lk = list[k];
            if (stamp[lk] === ci + 1) continue;
            stamp[lk] = ci + 1;
            var eu = edges[lk].u;
            if (Math.abs(eu[0] * u[0] + eu[1] * u[1] + eu[2] * u[2]) < 1 - 1e-4) continue;   // rfHV: the first test below, early
            near.push(lk);
          }
        }
      });
      near.sort(function (x, y) { return x - y; });
      near.forEach(function (ei) {
          var e = edges[ei];
          if (e.q === c.p || Math.abs(dot(e.u, u)) < 1 - 1e-4) return;
          var dP = sub(e.P, c.A), dQ = sub(e.Q, c.A), tP = dot(dP, u), tQ = dot(dQ, u);
          if (len(sub(dP, scale(u, tP))) > tol || len(sub(dQ, scale(u, tQ))) > tol) return;
          var t0 = Math.max(Math.min(tP, tQ), 0), t1 = Math.min(Math.max(tP, tQ), c.L);
          if (t1 - t0 <= 1e-9 * c.L) return;
          var Sq = e.q.surf && e.q.surf.s;
          if (Sq && (Sq === c.S || surfKey(Sq) === surfKey(c.S))) return;   // a sibling fragment: an inner split
          if (!Sq) {
            var n = arr(e.q.plane.normal);
            if (!c.cap && Math.abs(dot(n, arr(c.p.plane.normal))) < 1 - 1e-9) put({ n: n, w: e.q.plane.w }, t0, t1);
            if ((c.S.t === 'tor' || c.S.t === 'sph') && Math.abs(dot(n, c.S.d)) < 1e-9 && Math.abs(dot(n, c.S.o) - e.q.plane.w) <= tol) stopped[surfKey(c.S)] = true;
          } else {
            // two rounds of one radius meeting: the bisector plane through the edge
            var done = false;
            if (c.S.t === 'cyl' && Sq.t === 'cyl' && Math.abs(Sq.r - c.S.r) <= 1e-9 * Math.max(1, c.S.r)) [add(c.S.d, Sq.d), sub(c.S.d, Sq.d)].forEach(function (m) {
              if (done || len(m) < 1e-9) return;
              m = norm(m);
              if (Math.abs(dot(m, u)) < 1e-9) { done = true; put({ n: m, w: dot(m, c.A) }, t0, t1); }
            });
            // any other two surfaces: at each point of the edge, the plane through the edge and the true corner of the two
            // surfaces there, shared by the fragments on both sides, so their slivers meet on it (boundRevolved)
            if (!done) putCorner(Sq, t0, t1);
          }
      });
      function putCorner(Sq, t0, t1) {
        var k = surfKey(Sq), e = null;
        for (var i = 0; i < planes.length && !e; i++) if (planes[i].key === k) e = planes[i];
        if (!e) planes.push(e = { key: k, sq: Sq, iv: [] });
        e.iv.push([t0, t1]);
      }
      planes.forEach(function (pl) {
        pl.iv.sort(function (x, y) { return x[0] - y[0]; });
        var cur = null;
        pl.iv.concat([null]).forEach(function (iv) {
          if (iv && cur && iv[0] <= cur[1] + 1e-9 * c.L) { cur[1] = Math.max(cur[1], iv[1]); return; }
          // boundEdge's closed forms take a convex cylinder and one plane; boundRevolved all the rest
          if (cur) {
            var rA = sub(c.A, c.S.o), convex = dot(arr(c.p.plane.normal), sub(rA, scale(c.S.d, dot(rA, c.S.d)))) > 0;
            jobs.push({ f: c.S.t === 'cyl' && !pl.sq && convex ? boundEdge : boundRevolved, c: { p: c.p, S: c.S, A: add(c.A, scale(u, cur[0])), B: add(c.A, scale(u, cur[1])) }, pl: pl });
          }
          cur = iv && iv.slice();
        });
      });
    });
    // a round that ends on a plane through its own axis stopped short: an arc chain ending on a wall (rfFP, the Moulded cap's
    // hole floor) ends on the meridian of the polygon's corner, leaving a tip against the wall unfilled, and only the surface
    // knows it. Bounding its slivers at that wall would widen the gap to the true round, so it keeps its plain columns
    jobs.forEach(function (j) {
      var S = j.c.S;
      if (!j.pl.sq && stopped[surfKey(S)] && Math.abs(dot(j.pl.n, S.d)) < 1 - 1e-9) return;
      j.f(j.c, j.pl, res);
    });
  }
  // the correction of one fragment edge c (on cylinder c.S) against the plane n·x = w that bounds the fragment there
  function boundEdge(c, plane, res) {
    var S = c.S, R = S.r, d = S.d, p = c.p, vs = p.vertices, n = plane.n, w = plane.w;
    // orient the plane so the fragment lies on its negative side (its vertex farthest from the plane decides)
    var far = 0;
    vs.forEach(function (v) { var x = dot(n, [v.pos.x, v.pos.y, v.pos.z]) - w; if (Math.abs(x) > Math.abs(far)) far = x; });
    if (Math.abs(far) < 1e-12) return;
    if (far > 0) { n = scale(n, -1); w = -w; }
    var bAx = dot(n, d), mid = scale(add(c.A, c.B), 0.5);
    function radial(X) { var rel = sub(X, S.o), z = dot(rel, d), v = sub(rel, scale(d, z)); return { z: z, v: v, r: len(v) }; }
    if (Math.abs(bAx) < 1e-9) {
      // a plane parallel to the axis: in the cross-section the region between the radial ray from the edge point E0
      // and the plane's line, out to the circle; the same along the edge's whole (axial) length
      var e1 = norm(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])), e2 = cross(d, e1);
      var q0 = radial(c.A), E0 = [dot(q0.v, e1), dot(q0.v, e2)], r0 = q0.r;
      if (!(r0 > 1e-12) || r0 >= R) return;
      var n2 = [dot(n, e1), dot(n, e2)], nl = Math.hypot(n2[0], n2[1]);
      if (!(nl > 1e-12)) return;
      var uu = [-n2[1] / nl, n2[0] / nl], fn = arr(p.plane.normal), m2 = [dot(fn, e1), dot(fn, e2)];
      if (m2[0] * E0[0] + m2[1] * E0[1] < 0) m2 = [-m2[0], -m2[1]];   // the facet normal away from the axis
      if (uu[0] * m2[0] + uu[1] * m2[1] < 0) uu = [-uu[0], -uu[1]];
      var eu = E0[0] * uu[0] + E0[1] * uu[1], t = -eu + Math.sqrt(Math.max(0, eu * eu - (r0 * r0 - R * R)));
      var Pr = [E0[0] * R / r0, E0[1] * R / r0], Pp = [E0[0] + uu[0] * t, E0[1] + uu[1] * t];
      var fr = Math.atan2(Pr[1], Pr[0]), fp = Math.atan2(Pp[1], Pp[0]), df = fp - fr;
      while (df > Math.PI) df -= 2 * Math.PI;
      while (df < -Math.PI) df += 2 * Math.PI;
      var As = Math.abs(0.5 * (E0[0] * Pr[1] - E0[1] * Pr[0]) + 0.5 * R * R * df + 0.5 * (Pp[0] * E0[1] - Pp[1] * E0[0]));
      if (!(As > 0)) return;
      var Lz = Math.abs(radial(c.B).z - q0.z), zm = (radial(c.B).z + q0.z) / 2;
      var T2 = [(E0[0] + Pr[0] + Pp[0]) / 3, (E0[1] + Pr[1] + Pp[1]) / 3];
      var T3 = add(add(S.o, scale(d, zm)), add(scale(e1, T2[0]), scale(e2, T2[1])));
      var sg = dot(n, T3) - w <= 0 ? 1 : -1, dv = sg * As * Lz;
      res.volume += dv;
      for (var k = 0; k < 3; k++) res.moment[k] += dv * T3[k];
      return;
    }
    // a plane oblique to the axis: at each angle the fragment's axial end moves by −c (ρ − ρc) / |b| at radius ρ
    // (c = n·er, b = n·d), so the edge adds ∫ −c / |b| · (R³/3 − ρc R²/2 + ρc³/6) dθ
    var AB = sub(c.B, c.A);
    for (var ig = 0; ig < 6; ig++) {
      var s = GL6.x[ig], X = add(c.A, scale(AB, s)), q = radial(X);
      if (!(q.r > 1e-12)) continue;
      var er = scale(q.v, 1 / q.r), dth = Math.abs(dot(d, cross(er, AB))) / q.r, cc = dot(n, er), rc = q.r;
      var I = R * R * R / 3 - rc * R * R / 2 + rc * rc * rc / 6, dv2 = GL6.w[ig] * dth * (-cc / Math.abs(bAx)) * I;
      var at = add(X, scale(er, (R - rc) / 2));
      res.volume += dv2;
      for (var k2 = 0; k2 < 3; k2++) res.moment[k2] += dv2 * at[k2];
    }
  }
  // lane massprops (rfGP): the same bound on cones, spheres and tori. curveDensity's columns stay in the meridian half-plane
  // of their point (radially to the chord's cone, then along the ray from the arc centre), so the sliver's wall over a
  // fragment edge is, at each angle, the column from the edge point X; the plane leaves X along a straight line of that
  // half-plane, out to the true meridian at T. The edge adds ∫ E dθ, E = ±∮ ρ²/2 dz (Green: ∫ρ dA) round X, T, along the
  // meridian to the column's end, back down the column. The sign is fixed once, the same for convex and concave faces:
  // a walk along the facet towards the edge has the facet normal on its left, or E changes sign. On a cylinder or cone an
  // edge running more along the axis than round it slices at z = const instead (no θ range at the limit, a wall beside a hole).
  function revolvedColumn(F, X, q, er, phiC) {
    var S = F.s, z = q.z, rho = q.r;
    if (S.t === 'cone' || S.t === 'cyl') { var Rc = S.r + (S.k || 0) * z; return { y1: [Rc, z], y2: [Rc, z] }; }
    var P = F.P, Q = F.Q, Cr = S.t === 'tor' ? S.R : 0, r = S.r, dz = Q[1] - P[1], dr = Q[0] - P[0], L = Math.hypot(dr, dz), y1;
    if (Math.abs(dz) > 1e-12 * Math.max(1, L)) y1 = [P[0] + dr * (z - P[1]) / dz, z];
    else {
      var dphi = F.dphi, e0 = F.e0, e1 = cross(S.d, e0), phi = Math.atan2(dot(er, e1), dot(er, e0));
      y1 = [rho * Math.cos(phi - (Math.floor(phiC / dphi) + 0.5) * dphi) / Math.cos(Math.abs(dphi) / 2), P[1]];
    }
    var a = y1[0] - Cr, b = y1[1], ry = Math.hypot(a, b);
    if (ry < 1e-12) return null;
    return { y1: y1, y2: [Cr + a * r / ry, b * r / ry] };
  }
  // the signed distance to a revolved surface and its gradient at x
  function surfField(S, x) {
    var rel = sub(x, S.o), z = dot(rel, S.d), v = sub(rel, scale(S.d, z)), rho = len(v), er = rho > 1e-12 ? scale(v, 1 / rho) : null;
    if (!er) return null;
    if (S.t === 'cyl') return { f: rho - S.r, g: er };
    if (S.t === 'cone') { var k = S.k || 0, q = Math.sqrt(1 + k * k); return { f: (rho - S.r - k * z) / q, g: scale(sub(er, scale(S.d, k)), 1 / q) }; }
    var a = rho - (S.t === 'tor' ? S.R : 0), D = Math.hypot(a, z);
    if (!(D > 1e-12)) return null;
    return { f: D - S.r, g: add(scale(er, a / D), scale(S.d, z / D)) };
  }
  // the plane through the edge direction u and the corner of surfaces S and Sq nearest X, in the plane square to u at X:
  // null where they run tangent (no corner to find, the slivers are the same there) or Newton does not settle close by
  function cornerPlane(S, Sq, X, u) {
    var Z = X, a0 = surfField(S, X), b0 = surfField(Sq, X);
    if (!a0 || !b0) return null;
    var s0 = len(cross(a0.g, b0.g));
    if (!(s0 > 0.03)) return null;
    for (var it = 0; it < 12; it++) {
      var a = surfField(S, Z), b = surfField(Sq, Z);
      if (!a || !b) return null;
      if (Math.abs(a.f) + Math.abs(b.f) < 1e-11 * Math.max(1, S.r)) {
        var ZX = sub(Z, X), L = len(ZX);
        if (!(L > 1e-11) || L > 3 * (Math.abs(a0.f) + Math.abs(b0.f)) / s0) return null;
        var m = cross(u, ZX), ml = len(m);
        if (!(ml > 1e-11)) return null;
        m = scale(m, 1 / ml);
        return { n: m, w: dot(m, X) };
      }
      var g1 = sub(a.g, scale(u, dot(a.g, u))), g2 = sub(b.g, scale(u, dot(b.g, u)));
      var c11 = dot(g1, g1), c12 = dot(g1, g2), c22 = dot(g2, g2), det = c11 * c22 - c12 * c12;
      if (!(Math.abs(det) > 1e-9)) return null;
      var la = (-a.f * c22 + b.f * c12) / det, lb = (-b.f * c11 + a.f * c12) / det;
      Z = add(Z, add(scale(g1, la), scale(g2, lb)));
    }
    return null;
  }
  function boundRevolved(c, plane, res) {
    var S = c.S, F = c.p.surf, d = S.d, p = c.p, vs = p.vertices, fn = arr(p.plane.normal), n = plane.n, w = plane.w;
    var phiC = 0, Cr = S.t === 'tor' ? S.R : 0, round = S.t === 'sph' || S.t === 'tor', u = norm(sub(c.B, c.A));
    function orient(q) {   // the fragment on the plane's negative side (its vertex farthest from the plane decides)
      var far = 0;
      vs.forEach(function (v) { var x = dot(q.n, [v.pos.x, v.pos.y, v.pos.z]) - q.w; if (Math.abs(x) > Math.abs(far)) far = x; });
      if (Math.abs(far) < 1e-12) return null;
      return far > 0 ? { n: scale(q.n, -1), w: -q.w } : q;
    }
    if (!plane.sq) { var o0 = orient(plane); if (!o0) return; n = o0.n; w = o0.w; }
    if (F.P && F.e0) {
      var cen = [0, 0, 0];
      vs.forEach(function (v) { cen = add(cen, [v.pos.x, v.pos.y, v.pos.z]); });
      phiC = angleOf(F, scale(cen, 1 / vs.length));
    }
    function seg(a, b) { return (b[1] - a[1]) * (a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) / 6; }
    var AB = sub(c.B, c.A);
    for (var ig = 0; ig < 6; ig++) {
      var X = add(c.A, scale(AB, GL6.x[ig])), rel = sub(X, S.o), z = dot(rel, d), v = sub(rel, scale(d, z)), rho = len(v);
      if (!(rho > 1e-12)) continue;
      var er = scale(v, 1 / rho), dth = Math.abs(dot(d, cross(er, AB))) / rho, dzEdge = Math.abs(dot(AB, d));
      var useZ = !round && dzEdge >= rho * dth;
      if (!useZ && !(dth > 1e-14)) continue;
      var col = revolvedColumn(F, X, { z: z, r: rho }, er, phiC);
      if (!col) continue;
      if (plane.sq) {
        var cp = cornerPlane(S, plane.sq, X, u);
        cp = cp && orient(cp);
        if (!cp) continue;
        n = cp.n; w = cp.w;
      }
      if (useZ) {
        // an edge that runs more along the axis than round it (a wall beside a hole: at the limit no θ range at all): the
        // same region in the slice z = const, where the columns of a cylinder or cone lie: X, out to the circle R(z) at
        // Y = (R, 0), round to T where the plane's line meets it, back to X (axes er, e2)
        var e2 = cross(d, er), n1 = dot(n, er), n2 = dot(n, e2), nl = Math.hypot(n1, n2), Rz = S.r + (S.k || 0) * z;
        if (!(nl > 1e-12)) continue;
        var lx = -n2 / nl, ly = n1 / nl, lq = rho * lx, ld = lq * lq - rho * rho + Rz * Rz;
        if (ld < 0) continue;
        var lr = Math.sqrt(ld), s1 = -lq + lr, s2 = -lq - lr;
        var t1 = [rho + lx * s1, ly * s1], t2 = [rho + lx * s2, ly * s2];
        var Tz = Math.hypot(t1[0] - Rz, t1[1]) <= Math.hypot(t2[0] - Rz, t2[1]) ? t1 : t2;
        var hz = Math.abs(Rz - rho), gz = Math.hypot(Tz[0] - Rz, Tz[1]);
        if (!(hz > 1e-13) || gz > 50 * hz) continue;
        var Az = 0.5 * rho * Tz[1] - 0.5 * Rz * Rz * Math.atan2(Tz[1], Tz[0]);
        var N1 = dot(fn, er), N2 = dot(fn, e2), outz = n1 * N2 - n2 * N1;
        if (!(Math.abs(outz) > 1e-12)) continue;
        var dvz = GL6.w[ig] * dzEdge * (outz > 0 ? Az : -Az);
        var atz = add(add(S.o, scale(d, z)), add(scale(er, (rho + Rz + Tz[0]) / 3), scale(e2, Tz[1] / 3)));
        res.volume += dvz;
        for (var kz = 0; kz < 3; kz++) res.moment[kz] += dvz * atz[kz];
        continue;
      }
      var cc = dot(n, er), bb = dot(n, d), ln = Math.hypot(cc, bb);
      if (!(ln > 1e-12)) continue;                                    // the plane holds the half-plane: no line in it
      var vx = bb / ln, vz = -cc / ln, Y2 = col.y2, XX = [rho, z], T = null;
      if (round) {
        var q0 = rho - Cr, qb = q0 * vx + z * vz, qc = q0 * q0 + z * z - S.r * S.r, disc = qb * qb - qc;
        if (disc < 0) continue;
        var rt = Math.sqrt(disc), T1 = [rho + vx * (-qb + rt), z + vz * (-qb + rt)], T2 = [rho + vx * (-qb - rt), z + vz * (-qb - rt)];
        T = Math.hypot(T1[0] - Y2[0], T1[1] - Y2[1]) <= Math.hypot(T2[0] - Y2[0], T2[1] - Y2[1]) ? T1 : T2;
      } else {
        var kk = S.k || 0, den = vx - kk * vz;
        if (!(Math.abs(den) > 1e-12)) continue;
        var ss = (S.r + kk * z - rho) / den;
        T = [rho + vx * ss, z + vz * ss];
      }
      var h = Math.hypot(Y2[0] - rho, Y2[1] - z), gap = Math.hypot(T[0] - Y2[0], T[1] - Y2[1]);
      if (!(h > 1e-13) || gap > 50 * h) continue;                     // grazing: the line leaves the sliver, nothing to bound
      var E = seg(XX, T) + seg(Y2, col.y1) + seg(col.y1, XX);
      if (round) {
        var a0 = Math.atan2(T[1], T[0] - Cr), a1 = Math.atan2(Y2[1], Y2[0] - Cr), da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        for (var ia = 0; ia < 6; ia++) {
          var ang = a0 + da * GL6.x[ia], ra = Cr + S.r * Math.cos(ang);
          E += GL6.w[ia] * da * ra * ra / 2 * S.r * Math.cos(ang);
        }
      } else E += seg(T, Y2);
      var Nr = dot(fn, er), Nz = dot(fn, d), out = cc * Nz - bb * Nr;  // the plane's side of τ' = (Nz, −Nρ), the direction with N on its left
      if (!(Math.abs(out) > 1e-12)) continue;
      var dv = GL6.w[ig] * dth * (out > 0 ? E : -E);
      var mr = (rho + T[0] + Y2[0]) / 3, mz = (z + T[1] + Y2[1]) / 3, at = add(add(S.o, scale(d, mz)), scale(er, mr));
      res.volume += dv;
      for (var k = 0; k < 3; k++) res.moment[k] += dv * at[k];
    }
  }

  // ------------------------------------------------------------------ analytic edges (true circles and arcs)
  function polysOf(x) {
    if (!x) return [];
    if (x.polygons) return x.polygons;
    // rfLD: push, not out = out.concat(f.polys): the concat copied the whole list per face (quadratic; 75 s at 1800 holes)
    if (x.faces) { var out = []; x.faces.forEach(function (f) { var ps = f.polys; if (ps) for (var i = 0; i < ps.length; i++) out.push(ps[i]); }); return out; }
    return x;
  }
  function surfKey(S) {
    function q(v) { return Math.round(v * 1e6); }
    var d = S.d, sg = (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) <= 1e-9 && d[2] < 0)))) ? -1 : 1;
    var dd = scale(d, sg), o = S.o;
    // cylinders and cones: the axis line (its point nearest the world origin); spheres and tori: the centre
    if (S.t === 'cyl' || S.t === 'cone') { o = sub(S.o, scale(dd, dot(S.o, dd))); }
    var k = S.t + ':' + o.map(q).join(',') + ':' + dd.map(q).join(',') + ':' + q(S.r);
    if (S.t === 'cone') k += ':' + q(S.k * sg) + ':' + q(S.r + S.k * dot(S.o, dd) * 0); // same line + same radius at o
    if (S.t === 'tor') k += ':' + q(S.R);
    if (S.w != null) k += ':w' + S.w;   // rfDZ: the faces inside a Wrap scribe are a surface of their own
    return k;
  }
  // curveSurfaces(bodyOrMeshOrPolygons) -> [{ key, surf, polys }]: the curved faces as their analytic surfaces (one
  // entry per distinct surface, every facet fragment on it)
  function curveSurfaces(x) {
    var by = {}, out = [];
    polysOf(x).forEach(function (p) {
      if (!p.surf) return;
      var S = p.surf.s, k = S._key || surfKey(S);
      if (!by[k]) { by[k] = { key: k, surf: S, polys: [] }; out.push(by[k]); }
      by[k].polys.push(p);
    });
    return out;
  }
  // curveEdges(bodyOrMeshOrPolygons) -> [{ kind: 'circle' | 'arc', center, normal, radius, xdir, a0, a1, surface,
  //   chords: [[p, q], ...] }]: the boundaries of the curved faces that are true circles and arcs — where a cylinder,
  // cone, sphere or torus meets a face perpendicular to its axis (a cap, a step, a hole's rim or bottom), and the
  // profile arcs at the ends of a partial revolve. Angles are about `normal` from `xdir` (a0 < a1, radians); a full
  // circle has a0 = 0, a1 = 2π. `chords` are the mesh edges that approximate it (the facet boundaries on the curve),
  // so a consumer can swap them for the exact curve. Edges shared by two fragments of the same surface (splits) are
  // interior and left out.
  function curveEdges(x) {
    var polys = polysOf(x), groups = {}, order = [];
    function k3(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6); }
    polys.forEach(function (p) {
      if (!p.surf) return;
      var F = p.surf, S = F.s, sk = S._key || surfKey(S), vs = p.vertices;
      for (var i = 0; i < vs.length; i++) {
        var A = arr(vs[i].pos), B = arr(vs[(i + 1) % vs.length].pos);
        var el = len(sub(B, A));
        if (el < 1e-9) continue;
        var za = dot(sub(A, S.o), S.d), zb = dot(sub(B, S.o), S.d), scl = Math.max(1, el, Math.abs(za));
        var g = null;
        if (Math.abs(za - zb) < 1e-9 * scl) {
          // a chord (or a piece of one, when CSG split the facet) in a plane perpendicular to the axis: both ends
          // between the chord's distance and the circle of that level (at most a 16-gon's sagitta inside it)
          var c = add(S.o, scale(S.d, za)), ra = len(sub(A, c)), rb = len(sub(B, c));
          var Rz = null;
          if (S.t === 'cyl' || S.t === 'cone') Rz = S.r + (S.k || 0) * za;
          else if (F.P && Math.abs(za - F.P[1]) < 1e-7 * scl) Rz = F.P[0];
          else if (F.Q && Math.abs(za - F.Q[1]) < 1e-7 * scl) Rz = F.Q[0];
          if (Rz == null || !(Rz > 1e-9)) continue;
          var tolR = 1e-6 * Math.max(1, Rz), lo = Rz * Math.cos(Math.PI / 8) - tolR;
          if (ra > Rz + tolR || rb > Rz + tolR || ra < lo || rb < lo) continue;
          // the chord must be a boundary of the facet on the curve: its midpoint no nearer the axis than the chord of
          // the facet it lies on (a straight edge across the face would be)
          if (len(sub(scale(add(A, B), 0.5), c)) < lo) continue;
          // keyed by the record's origin as well as za: two faces of one cylinder can carry records with different
          // origins, and a rim at za of one is not the other's (OpenCascade's Pulley: y = 6 and y = 20) (r9/drawings9)
          var dsg = (S.d[0] < -1e-9 || (Math.abs(S.d[0]) <= 1e-9 && (S.d[1] < -1e-9 || (Math.abs(S.d[1]) <= 1e-9 && S.d[2] < 0)))) ? -1 : 1;
          g = { key: sk + '|o' + Math.round(dsg * dot(S.o, S.d) * 1e6) + '|z' + Math.round(za * 1e6), center: c, normal: S.d.slice(), radius: Rz, surface: S };
        } else if (F.P && Math.abs(dot(norm(cross(S.d, sub(A, S.o))), sub(B, S.o))) < 1e-9 * scl) {
          // a profile arc of a partial revolve: in a meridian half-plane, both ends on the tube circle
          // the radial direction of the half-plane, from the end farther from the axis (the other may be a pole)
          var va = sub(sub(A, S.o), scale(S.d, za)), vb = sub(sub(B, S.o), scale(S.d, zb));
          var er = norm(len(va) >= len(vb) ? va : vb), Cr = S.t === 'tor' ? S.R : 0, C = add(S.o, scale(er, Cr));
          var da = len(sub(A, C)), db = len(sub(B, C));
          if (Math.abs(da - S.r) > 1e-6 * Math.max(1, S.r) || Math.abs(db - S.r) > 1e-6 * Math.max(1, S.r)) continue;
          var nrm = norm(cross(er, S.d)), ang = Math.atan2(dot(er, cross(S.d, F.e0)), dot(er, F.e0));
          g = { key: sk + '|m' + Math.round(ang * 1e6), center: C, normal: nrm, radius: S.r, surface: S };
        }
        if (!g) continue;
        if (!groups[g.key]) { groups[g.key] = { g: g, edges: {} }; order.push(g.key); }
        var ek = k3(A) < k3(B) ? k3(A) + '|' + k3(B) : k3(B) + '|' + k3(A), E = groups[g.key].edges;
        if (E[ek]) E[ek].n++; else E[ek] = { n: 1, a: A, b: B };
      }
    });
    var out = [];
    order.forEach(function (key) {
      var G = groups[key], g = G.g, chords = [];
      Object.keys(G.edges).forEach(function (ek) { var e = G.edges[ek]; if (e.n === 1) chords.push([e.a, e.b]); });
      if (!chords.length) return;
      var n = g.normal, xd = null;
      // reference direction: world-stable (the in-plane direction nearest +x, else +y) so equal circles agree
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (w) { if (xd) return; var t = sub(w, scale(n, dot(w, n))); if (len(t) > 1e-6) xd = norm(t); });
      var yd = cross(n, xd);
      function angle(p) { var v = sub(p, g.center), a = Math.atan2(dot(v, yd), dot(v, xd)); return a < 0 ? a + 2 * Math.PI : a; }
      // angular intervals of the chords, merged into runs
      var iv = chords.map(function (c) {
        var a = angle(c[0]), b = angle(c[1]);
        if (b < a) { var t = a; a = b; b = t; }
        if (b - a > Math.PI) { var t2 = a; a = b; b = t2 + 2 * Math.PI; } // the chord across angle 0
        return [a, b, c];
      }).sort(function (u, v) { return u[0] - v[0]; });
      var runs = [];
      iv.forEach(function (u) {
        var r = runs[runs.length - 1];
        if (r && u[0] <= r.a1 + 1e-9) { r.a1 = Math.max(r.a1, u[1]); r.chords.push(u[2]); }
        else runs.push({ a0: u[0], a1: u[1], chords: [u[2]] });
      });
      // a run that wraps past 2π joins the first
      if (runs.length > 1) {
        var last = runs[runs.length - 1], first = runs[0];
        if (last.a1 >= 2 * Math.PI + first.a0 - 1e-9) { first.a0 = last.a0 - 2 * Math.PI; first.chords = last.chords.concat(first.chords); runs.pop(); }
      }
      runs.forEach(function (r) {
        var full = r.a1 - r.a0 >= 2 * Math.PI - 1e-9;
        out.push({ kind: full ? 'circle' : 'arc', center: g.center, normal: n, radius: g.radius, xdir: xd,
          a0: full ? 0 : r.a0, a1: full ? 2 * Math.PI : r.a1, surface: g.surface, chords: r.chords });
      });
    });
    return out;
  }
  // meshCurveInfo(mesh) -> { faces, faceSurfs, key0, curves }: what the viewport needs about a mesh's curved faces, as
  // plain data a worker can send with its build (r3/engine3): faceSurfs[i] the surface keys of mesh face i's polygons
  // (null: none curved), key0[i] that of its first polygon, curves = curveEdges(mesh); faces = the face count it fits.
  function meshCurveInfo(mesh) {
    var keyOf = new Map();
    curveSurfaces(mesh).forEach(function (s) { s.polys.forEach(function (p) { keyOf.set(p, s.key); }); });
    var faceSurfs = [], key0 = [];
    mesh.faces.forEach(function (f) {
      var ks = null, ps = f.polys || [];
      for (var i = 0; i < ps.length; i++) { var k = keyOf.get(ps[i]); if (k && (!ks || ks.indexOf(k) < 0)) (ks = ks || []).push(k); }
      faceSurfs.push(ks);
      key0.push(ps[0] && keyOf.get(ps[0]) || null);
    });
    var curves = keyOf.size ? curveEdges(mesh).map(function (c) {
      return { kind: c.kind, center: c.center, normal: c.normal, radius: c.radius, xdir: c.xdir, a0: c.a0, a1: c.a1, chords: c.chords };
    }) : [];
    return { faces: mesh.faces.length, faceSurfs: faceSurfs, key0: key0, curves: curves };
  }
  // ------------------------------------------------------------------ smooth shading normals (rfFE)
  // analyticNormals(mesh) -> Float32Array laid out like mesh.normals (3 per triangle corner): the viewport's smooth
  // shading (ui-core.js UI.analyticNormals calls this; a worker sends it with its build). mesh.normals stays flat
  // (exports, zebra, picking). The triangles follow meshFromBody's order (each face's polygons fanned from vertex 0).
  //   record facets (polygon.surf.s: cyl / cone / sph / tor): the surface's own normal at each corner, oriented like
  //     the facet; on the axis (a cone apex, a torus pole) the limit along the facet's own meridian;
  //   other curved faces (fillets on curved edges, revolved / extruded splines and ellipses, lofts, sweeps, boundary,
  //     wrap, OpenCascade B-spline faces …): meshFromBody makes one mesh face per facet plane, so a facet is told
  //     from a real plane by its neighbours (faces sharing a welded vertex, normals within SMOOTH.crease degrees):
  //     a face is a facet when its turn to some neighbour G carries on G's own curvature (the turn from G to G's
  //     other neighbours, per unit distance between face centres) — a plane next to a fillet turns far less than
  //     the fillet's curvature over its size and stays flat; two planes at a small angle have no third face to
  //     carry on and stay sharp. Polygons of one OpenCascade face (polygon.face) are facets of it whenever it spans
  //     several mesh faces. A revolved free curve's chords (surf.fc) are always facets. Each corner of a facet takes
  //     the angle-weighted normal of the faces at its vertex: the exact ones (planes and record facets within
  //     SMOOTH.exact degrees: a tangent plane's normal is the surface's there) when there are any, else the facets
  //     within SMOOTH.crease (one OpenCascade face's own only), so a real sharp edge inside a face stays sharp.
  var SMOOTH = { crease: 20, exact: 12, carry: 0.4, occCrease: 35, occSeam: 10 };
  function surfNormalAt(S, x, toward) {
    var v = [x[0] - S.o[0], x[1] - S.o[1], x[2] - S.o[2]], d = S.d, z = dot(v, d), n;
    if (S.t === 'sph') n = v;
    else {
      var rho = [v[0] - d[0] * z, v[1] - d[1] * z, v[2] - d[2] * z], rl = len(rho);
      if (rl < 1e-9 * Math.max(1, Math.abs(S.r || 0), Math.abs(S.R || 0)) && toward) {
        // on the axis: the limit along the meridian through `toward` (a point of the same facet)
        var w = [toward[0] - S.o[0], toward[1] - S.o[1], toward[2] - S.o[2]], zw = dot(w, d);
        rho = [w[0] - d[0] * zw, w[1] - d[1] * zw, w[2] - d[2] * zw]; var rw = len(rho);
        if (rw < 1e-12) return null;
        var eu = [rho[0] / rw, rho[1] / rw, rho[2] / rw];
        if (S.t === 'cone') n = [eu[0] - (S.k || 0) * d[0], eu[1] - (S.k || 0) * d[1], eu[2] - (S.k || 0) * d[2]];
        else if (S.t === 'tor') n = [d[0] * z - eu[0] * S.R, d[1] * z - eu[1] * S.R, d[2] * z - eu[2] * S.R];   // x − (o + R·eρ)
        else return null;
      } else {
        if (rl < 1e-12) return null;
        var er = [rho[0] / rl, rho[1] / rl, rho[2] / rl];
        if (S.t === 'cyl') n = er;
        else if (S.t === 'cone') n = [er[0] - (S.k || 0) * d[0], er[1] - (S.k || 0) * d[1], er[2] - (S.k || 0) * d[2]];
        else if (S.t === 'tor') n = [v[0] - er[0] * S.R, v[1] - er[1] * S.R, v[2] - er[2] * S.R];   // x − (o + R·eρ), the tube centre (rfFE: with the axial part; it was radial only)
        else return null;
      }
    }
    var l = len(n);
    return l > 1e-12 ? [n[0] / l, n[1] / l, n[2] / l] : null;
  }
  function analyticNormals(m) {
    var out = new Float32Array(m.normals), faces = m.faces || [], nf = faces.length;
    if (!nf) return out;
    var P = m.positions64 || m.positions, nT = (P.length / 9) | 0;
    // 1. record facets: the surface normal at each corner; kind[fi]: 0 plane, 1 record, 2 facet, 3 candidate, -1 skip
    var kind = new Int8Array(nf), bface = new Array(nf), faceOf = new Int32Array(nT), recTri = new Uint8Array(nT);
    var cos = Math.cos, D2R = Math.PI / 180;
    faces.forEach(function (f, fi) {
      for (var q = f.start; q < f.start + f.count && q < nT; q++) faceOf[q] = fi;
      if (!f.polys) { kind[fi] = -1; return; }
      var t = f.start, fn = f.normal, writes = [], rec = 0, plain = 0, fc = 0, bf = null;
      f.polys.forEach(function (p) {
        var vs = p.vertices, nt = Math.max(0, vs.length - 2);
        if (p.face != null && bf == null) bf = p.face;
        if (p.surf && p.surf.s && !p.surf.fc) {
          rec++;
          var cx = 0, cy = 0, cz = 0;
          vs.forEach(function (vx) { cx += vx.pos.x; cy += vx.pos.y; cz += vx.pos.z; });
          var cen = [cx / vs.length, cy / vs.length, cz / vs.length];
          var vn = vs.map(function (vx) {
            var n = surfNormalAt(p.surf.s, [vx.pos.x, vx.pos.y, vx.pos.z], cen);
            if (!n) return fn;
            return dot(n, fn) < 0 ? [-n[0], -n[1], -n[2]] : n;
          });
          for (var j = 1; j + 1 < vs.length; j++) writes.push(t + j - 1, vn[0], vn[j], vn[j + 1]);
        } else { plain++; if (p.surf && p.surf.fc) fc++; }
        t += nt;
      });
      bface[fi] = bf;
      if (t !== f.start + f.count) { kind[fi] = -1; return; }   // not the layout meshFromBody made: keep the flat normals
      for (var w = 0; w < writes.length; w += 4) {
        var o = writes[w] * 9;
        recTri[writes[w]] = 1;
        for (var c = 0; c < 3; c++) { var n = writes[w + 1 + c]; out[o + c * 3] = n[0]; out[o + c * 3 + 1] = n[1]; out[o + c * 3 + 2] = n[2]; }
      }
      kind[fi] = plain === 0 ? 1 : fc === plain && !rec ? 2 : rec ? 0 : 3;
    });
    var anyCand = false;
    for (var fi0 = 0; fi0 < nf; fi0++) if (kind[fi0] >= 2) { anyCand = true; break; }
    if (!anyCand || !nT) return out;
    // 2. weld corners (a grid of 1e-7 × the bounding diagonal) and list the faces at each vertex
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], i, k;
    for (i = 0; i < nT * 9; i += 3) for (k = 0; k < 3; k++) { if (P[i + k] < lo[k]) lo[k] = P[i + k]; if (P[i + k] > hi[k]) hi[k] = P[i + k]; }
    var q = Math.max(len(sub(hi, lo)) * 1e-7, 1e-12), ids = new Map(), vid = new Int32Array(nT * 3), nv = 0;
    for (i = 0; i < nT * 3; i++) {
      var key = Math.round(P[i * 3] / q) + ',' + Math.round(P[i * 3 + 1] / q) + ',' + Math.round(P[i * 3 + 2] / q), id = ids.get(key);
      if (id == null) { id = nv++; ids.set(key, id); }
      vid[i] = id;
    }
    ids = null;
    var vfStart = new Int32Array(nv + 1), vfList, cnt = new Int32Array(nv);
    // faces at each vertex, without repeats (a triangle fan visits a vertex many times)
    var seen = new Map();
    for (i = 0; i < nT * 3; i++) { var sk = vid[i] * nf + faceOf[(i / 3) | 0]; if (!seen.has(sk)) { seen.set(sk, -1); cnt[vid[i]]++; } }
    for (i = 0; i < nv; i++) vfStart[i + 1] = vfStart[i] + cnt[i];
    vfList = new Int32Array(vfStart[nv]); cnt.fill(0);
    seen.forEach(function (x, sk) { var v = Math.floor(sk / nf), f = sk - v * nf; vfList[vfStart[v] + cnt[v]++] = f; });
    // 3. classify candidates: neighbour pairs within the crease, curvature carried on from a neighbour
    var cosC = cos(SMOOTH.crease * D2R), cosE = cos(SMOOTH.exact * D2R), MIN_T = 1e-4;
    function fnrm(fi) { return faces[fi].normal; }
    function cdist(a, b) { var ca = faces[a].centroid, cb = faces[b].centroid; return Math.max(Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]), 1e-12); }
    var pairs = new Map(), k1 = new Float64Array(nf), k1o = new Int32Array(nf).fill(-1), k2 = new Float64Array(nf);
    for (var v = 0; v < nv; v++) {
      var s0 = vfStart[v], s1 = vfStart[v + 1];
      for (var a = s0; a < s1; a++) for (var b = a + 1; b < s1; b++) {
        var fa = vfList[a], fb = vfList[b];
        if (kind[fa] < 0 || kind[fb] < 0) continue;
        var pk = fa < fb ? fa * nf + fb : fb * nf + fa;
        if (pairs.has(pk)) continue;
        var c = dot(fnrm(fa), fnrm(fb));
        if (c < cosC) { pairs.set(pk, -1); continue; }
        var th = Math.acos(Math.min(1, c));
        pairs.set(pk, th);
        if (th < MIN_T) continue;
        var kap = th / cdist(fa, fb);
        [[fa, fb], [fb, fa]].forEach(function (ab) {
          var x = ab[0];
          if (kap > k1[x]) { k2[x] = k1[x]; k1[x] = kap; k1o[x] = ab[1]; } else if (kap > k2[x]) k2[x] = kap;
        });
      }
    }
    var occ = {};   // OpenCascade face id -> mesh faces it spans
    for (i = 0; i < nf; i++) if (bface[i] != null) occ[bface[i]] = (occ[bface[i]] || 0) + 1;
    pairs.forEach(function (th, pk) {
      if (th < MIN_T) return;
      var fa = Math.floor(pk / nf), fb = pk - fa * nf;
      [[fa, fb], [fb, fa]].forEach(function (ab) {
        var F = ab[0], G = ab[1];
        if (kind[F] !== 3) return;
        var kG = k1o[G] === F ? k2[G] : k1[G];
        if (kG > 0 && th >= SMOOTH.carry * cdist(F, G) * kG) kind[F] = 4;   // a facet (decided below)
      });
    });
    for (i = 0; i < nf; i++) if (kind[i] === 3 && bface[i] != null && occ[bface[i]] > 1) kind[i] = 4;
    // rfFM: a loft's strips are triangulated unevenly (turns of 2.2°, 4.3°, 6.5° on the Funnel), so the carry test
    // missed a few facets, flat bands between smooth ones: a candidate between two facets of its own feature, each
    // within SMOOTH.exact, is one too (a plane beside a fillet belongs to another feature and stays flat)
    var tagOf = function (fi) { var p = faces[fi].polys && faces[fi].polys[0]; return p ? p.shared : null; }, nFac = new Int32Array(nf);
    pairs.forEach(function (th, pk) {
      if (th < MIN_T || th > SMOOTH.exact * D2R) return;
      var fa = Math.floor(pk / nf), fb = pk - fa * nf;
      if (tagOf(fa) == null || tagOf(fa) !== tagOf(fb)) return;
      if (kind[fa] === 3 && kind[fb] === 4) nFac[fa]++;
      if (kind[fb] === 3 && kind[fa] === 4) nFac[fb]++;
    });
    for (i = 0; i < nf; i++) if (kind[i] === 3 && nFac[i] >= 2) kind[i] = 4;
    for (i = 0; i < nf; i++) { if (kind[i] === 4) kind[i] = 2; else if (kind[i] === 3) kind[i] = 0; }
    // 4. angle-weighted source normals per (vertex, face) at the vertices of facets
    var need = new Uint8Array(nv), anyF = false;
    for (i = 0; i < nT * 3; i++) if (kind[faceOf[(i / 3) | 0]] === 2) { need[vid[i]] = 1; anyF = true; }
    if (!anyF) return chordBlend();
    var acc = new Map();
    for (var t = 0; t < nT; t++) {
      var f0 = faceOf[t];
      if (kind[f0] < 0) continue;
      var base = t * 9;
      for (k = 0; k < 3; k++) {
        var vi = vid[t * 3 + k];
        if (!need[vi]) continue;
        var pa = base + k * 3, pb = base + ((k + 1) % 3) * 3, pc = base + ((k + 2) % 3) * 3;
        var ux = P[pb] - P[pa], uy = P[pb + 1] - P[pa + 1], uz = P[pb + 2] - P[pa + 2], wx = P[pc] - P[pa], wy = P[pc + 1] - P[pa + 1], wz = P[pc + 2] - P[pa + 2];
        var lu = Math.hypot(ux, uy, uz), lw = Math.hypot(wx, wy, wz);
        if (!(lu > 0 && lw > 0)) continue;
        var ang = Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy + uz * wz) / (lu * lw))));
        if (!(ang > 0)) continue;
        var ak = vi * nf + f0, sm = acc.get(ak);
        if (!sm) acc.set(ak, sm = [0, 0, 0]);
        var on = base + k * 3;
        sm[0] += ang * out[on]; sm[1] += ang * out[on + 1]; sm[2] += ang * out[on + 2];
      }
    }
    // 5. facet corners
    // rfHM: facets of one OpenCascade face share ONE normal per vertex (the angle-weighted sum over all of that face's
    // facets there): a B-rep face is smooth inside, and OpenCascade's mesh turns up to its angular deflection (~20°)
    // between facets, right at SMOOTH.crease, so the per-facet crease test let neighbours in and out from one triangle
    // to the next (a Ø.0625 spring wire: normals jumped up to 39° across 38k of 83k shared corners: lumps, bright
    // streaks along the coil, dark spots). The crease test still applies when that normal is over SMOOTH.occCrease from
    // the facet's own (a real crease inside one face, a C0 boundary patch's corner).
    var cosO = cos((SMOOTH.occCrease || 35) * D2R), occN = new Map();
    function occVertexNormal(vv, B) {
      var ok = occN.get(vv + ':' + B);
      if (ok !== undefined) return ok;
      var s = [0, 0, 0];
      for (var j3 = vfStart[vv]; j3 < vfStart[vv + 1]; j3++) {
        var G3 = vfList[j3];
        if (kind[G3] !== 2 || bface[G3] !== B) continue;
        var g3 = acc.get(vv * nf + G3);
        if (g3) { s[0] += g3[0]; s[1] += g3[1]; s[2] += g3[2]; }
      }
      var sl3 = Math.hypot(s[0], s[1], s[2]);
      ok = sl3 > 1e-12 ? [s[0] / sl3, s[1] / sl3, s[2] / sl3, s] : null;
      occN.set(vv + ':' + B, ok);
      return ok;
    }
    // ... and across a tangent seam between two OpenCascade faces (the pieces of a loft through three sections, a
    // periodic face's seam) the faces' vertex normals, each from its own side only, differ by about half a facet turn:
    // within SMOOTH.occSeam they are one tangent surface and share their sum (a shaded line along the seam otherwise)
    var cosSeam = cos((SMOOTH.occSeam || 10) * D2R);
    function occSeamNormal(vv, B, own) {
      var s = own[3].slice(), merged = false, seen = {};
      seen[B] = 1;
      for (var j4 = vfStart[vv]; j4 < vfStart[vv + 1]; j4++) {
        var G4 = vfList[j4], B4 = bface[G4];
        if (kind[G4] !== 2 || B4 == null || seen[B4] || !(occ[B4] > 1)) continue;
        seen[B4] = 1;
        var o4 = occVertexNormal(vv, B4);
        if (!o4 || o4[0] * own[0] + o4[1] * own[1] + o4[2] * own[2] < cosSeam) continue;
        s[0] += o4[3][0]; s[1] += o4[3][1]; s[2] += o4[3][2]; merged = true;
      }
      return merged ? s : own;
    }
    for (t = 0; t < nT; t++) {
      var F = faceOf[t];
      if (kind[F] !== 2) continue;
      var nF = faces[F].normal;
      for (k = 0; k < 3; k++) {
        var vv = vid[t * 3 + k], ex = [0, 0, 0], fs = [0, 0, 0], nEx = 0;
        for (var j2 = vfStart[vv]; j2 < vfStart[vv + 1]; j2++) {
          var G = vfList[j2], g = acc.get(vv * nf + G);
          if (!g || kind[G] < 0) continue;
          var gl = Math.hypot(g[0], g[1], g[2]);
          if (!(gl > 0)) continue;
          var cg = (g[0] * nF[0] + g[1] * nF[1] + g[2] * nF[2]) / gl;
          if (kind[G] === 2) {
            if (G !== F && cg < cosC) continue;
            if (G !== F && bface[F] != null && bface[G] !== bface[F]) continue;
            fs[0] += g[0]; fs[1] += g[1]; fs[2] += g[2];
          } else if (cg >= cosE) { ex[0] += g[0]; ex[1] += g[1]; ex[2] += g[2]; nEx++; }
        }
        if (!nEx && bface[F] != null && occ[bface[F]] > 1) {
          var on3 = occVertexNormal(vv, bface[F]);
          if (on3 && on3[0] * nF[0] + on3[1] * nF[1] + on3[2] * nF[2] >= cosO) fs = occSeamNormal(vv, bface[F], on3).slice(0, 3);
        }
        var r = nEx ? ex : fs, rl = Math.hypot(r[0], r[1], r[2]);
        if (!(rl > 1e-12)) continue;
        var oo = t * 9 + k * 3;
        out[oo] = r[0] / rl; out[oo + 1] = r[1] / rl; out[oo + 2] = r[2] / rl;
      }
    }
    // 6. rfFM: corners no other face shares (a boolean's split points inside a facet, T-junctions on its sides) only
    // had the facet's own flat normal, so a record-less facet cut into pieces (the Funnel's shelled loft: 617 of
    // 1742 inner triangles) shaded in bands; they blend the facet's shared corners' normals by inverse square distance
    var anchors = new Map(), took = new Set();
    for (t = 0; t < nT; t++) {
      F = faceOf[t];
      if (kind[F] !== 2) continue;
      for (k = 0; k < 3; k++) {
        vv = vid[t * 3 + k];
        if (vfStart[vv + 1] - vfStart[vv] < 2 || took.has(vv * nf + F)) continue;
        took.add(vv * nf + F);
        var an = anchors.get(F);
        if (!an) anchors.set(F, an = []);
        var po = t * 9 + k * 3;
        an.push(P[po], P[po + 1], P[po + 2], out[po], out[po + 1], out[po + 2]);
      }
    }
    for (t = 0; t < nT; t++) {
      F = faceOf[t];
      var A6 = kind[F] === 2 && anchors.get(F);
      if (!A6) continue;
      for (k = 0; k < 3; k++) {
        vv = vid[t * 3 + k];
        if (vfStart[vv + 1] - vfStart[vv] > 1) continue;
        var pp = t * 9 + k * 3, sx = 0, sy = 0, sz = 0;
        for (var ai = 0; ai < A6.length; ai += 6) {
          var dx = A6[ai] - P[pp], dy = A6[ai + 1] - P[pp + 1], dz = A6[ai + 2] - P[pp + 2], wgt = 1 / Math.max(dx * dx + dy * dy + dz * dz, 1e-24);
          sx += wgt * A6[ai + 3]; sy += wgt * A6[ai + 4]; sz += wgt * A6[ai + 5];
        }
        var sl = Math.hypot(sx, sy, sz);
        if (sl > 1e-12) { out[pp] = sx / sl; out[pp + 1] = sy / sl; out[pp + 2] = sz / sl; }
      }
    }
    return chordBlend();
    // 7. rfHM: a round along the chords of a free curve (an elliptic or spline boss rim: rfFRruns) is one cylinder
    // record per chord, mitred where the chords meet, so neighbouring pieces' exact normals differ by the chord's turn
    // (~12°) at the mitre, and the wall facets beside them took those pieces' normals as "exact": the round and the
    // wall shaded in steps. Where two records of one feature, the same kind and radius, axes within SMOOTH.crease, meet
    // at a vertex at a small angle, the record and facet corners there within SMOOTH.crease of each other share one
    // normal (their mean). Mitres of rounds on a real corner (axes far apart) stay sharp.
    function chordBlend() {
      var recOf = new Array(nf), anyRec = false;
      for (var f7 = 0; f7 < nf; f7++) {
        if (kind[f7] !== 1) continue;
        var p7 = faces[f7].polys[0], s7 = p7 && p7.surf && p7.surf.s;
        if (s7 && (s7.t === 'cyl' || s7.t === 'cone' || s7.t === 'tor')) { recOf[f7] = { s: s7, tag: p7.shared }; anyRec = true; }
      }
      if (!anyRec) return out;
      var at = new Map(), q7, k7;
      for (q7 = 0; q7 < nT; q7++) {
        var kf = kind[faceOf[q7]];
        if (kf !== 1 && kf !== 2) continue;
        for (k7 = 0; k7 < 3; k7++) { var v7 = vid[q7 * 3 + k7], l7 = at.get(v7); if (!l7) at.set(v7, l7 = []); l7.push(q7 * 9 + k7 * 3, faceOf[q7]); }
      }
      var cosLo = Math.cos(0.05 * D2R);
      at.forEach(function (l) {
        var fsAt = [], nAt = [], seenF = {};
        for (var i7 = 0; i7 < l.length; i7 += 2) if (!seenF[l[i7 + 1]]) { seenF[l[i7 + 1]] = 1; fsAt.push(l[i7 + 1]); nAt.push([out[l[i7]], out[l[i7] + 1], out[l[i7] + 2]]); }
        if (fsAt.length < 2) return;
        var hit = false, a7, b7;
        for (a7 = 0; a7 < fsAt.length && !hit; a7++) for (b7 = a7 + 1; b7 < fsAt.length && !hit; b7++) {
          var A = recOf[fsAt[a7]], B = recOf[fsAt[b7]];
          if (!A || !B || A.s === B.s || A.tag !== B.tag || A.s.t !== B.s.t) continue;
          if (Math.abs((A.s.r || 0) - (B.s.r || 0)) > 1e-9 * Math.max(1, Math.abs(A.s.r || 0))) continue;
          if (Math.abs(dot(A.s.d, B.s.d)) < cosC) continue;
          var c7 = dot(nAt[a7], nAt[b7]);
          if (c7 < cosLo && c7 >= cosC) hit = true;
        }
        if (!hit) return;
        // clusters of corners within the crease of each other (union-find over this vertex's faces)
        var par = fsAt.map(function (x, i) { return i; });
        function root(i) { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }
        for (a7 = 0; a7 < fsAt.length; a7++) for (b7 = a7 + 1; b7 < fsAt.length; b7++) if (dot(nAt[a7], nAt[b7]) >= cosC) par[root(a7)] = root(b7);
        var sum = {};
        fsAt.forEach(function (f, i) { var r = root(i), s = sum[r] || (sum[r] = [0, 0, 0, 0]); s[0] += nAt[i][0]; s[1] += nAt[i][1]; s[2] += nAt[i][2]; s[3]++; });
        var idx = {};
        fsAt.forEach(function (f, i) { idx[f] = i; });
        for (var j7 = 0; j7 < l.length; j7 += 2) {
          var s8 = sum[root(idx[l[j7 + 1]])];
          if (!s8 || s8[3] < 2) continue;
          var ln = Math.hypot(s8[0], s8[1], s8[2]);
          if (ln > 1e-12) { out[l[j7]] = s8[0] / ln; out[l[j7] + 1] = s8[1] / ln; out[l[j7] + 2] = s8[2] / ln; }
        }
      });
      return out;
    }
  }
  K.smoothOptions = SMOOTH;

  // massProps(mesh, density) -> { volume, area, centroid, bbox, density, mass, polygonal?, curved? }. Volume, area and
  // centroid are the exact values of the true curved faces when the mesh's faces carry their CSG polygons (meshes
  // from meshFromBody): the polygonal figures plus curveCorrection. `polygonal` keeps the facets' own volume and
  // area; `curved` counts the facets on analytic surfaces.
  // r11/perf11: the result is kept per mesh object (a WeakMap; meshes are not changed after meshFromBody) and handed
  // out as a fresh copy: the curve correction takes 2–40 ms on a part with many curved facets, and the same mesh is
  // asked again and again (anvil.summary twice per call, materials and assembly mass, drawings, the OpenCascade
  // check). Another positions / faces array, another length or a changed sampled coordinate misses the cache.
  var massCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function massKey(mesh) {
    var p = mesh.positions64 || mesh.positions, n = p ? p.length : 0, s = 0;
    for (var i = 0; i < n; i += Math.max(1, (n / 16) | 0)) s += p[i] * (i + 1);
    if (n) s += p[n - 1];
    return { p: p, n: n, s: s, faces: mesh.faces, nf: mesh.faces ? mesh.faces.length : 0, exact: mesh.exact };
  }
  function sameMassKey(a, b) { return a.p === b.p && a.n === b.n && (a.s === b.s || (a.s !== a.s && b.s !== b.s)) && a.faces === b.faces && a.nf === b.nf && a.exact === b.exact; }
  function massCopy(r, density) {
    var out = { volume: r.volume, area: r.area, centroid: r.centroid.slice(), bbox: { min: r.bbox.min.slice(), max: r.bbox.max.slice() }, density: density, mass: r.volume * density };
    if (r.polygonal) out.polygonal = { volume: r.polygonal.volume, area: r.polygonal.area };
    if (r.exact) out.exact = true;
    else if (r.polygonal) out.curved = r.curved;
    return out;
  }
  function massProps(mesh, density) {
    if (!massCache || !massOptions.cache || !mesh || typeof mesh !== 'object') return massPropsOf(mesh, density);
    var key = massKey(mesh), hit = massCache.get(mesh);
    if (hit && sameMassKey(hit.key, key)) return massCopy(hit.r, density);
    var r = massPropsOf(mesh, density);
    massCache.set(mesh, { key: key, r: massCopy(r, density) });
    return r;
  }
  function massPropsOf(mesh, density) {
    var p = mesh.positions64 || mesh.positions, vol = 0, area = 0, cx = 0, cy = 0, cz = 0;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 9) {
      var a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
      var v = dot(a, cross(b, c)) / 6;
      vol += v;
      cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
      area += len(cross(sub(b, a), sub(c, a))) / 2;
      [a, b, c].forEach(function (q) { for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    }
    if (!(p.length > 0)) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var polygonal = null, curved = 0;
    if (mesh.exact) {
      // OpenCascade's exact B-rep integrals (the facets only give the bounding box here)
      var ex = mesh.exact;
      return { volume: ex.volume, area: ex.area, centroid: ex.centroid.slice(), bbox: { min: min, max: max }, density: density, mass: ex.volume * density, polygonal: { volume: vol, area: area }, exact: true };
    }
    if (mesh.faces && mesh.faces.length && mesh.faces[0].polys) {
      var polys = [];
      mesh.faces.forEach(function (f) { if (f.polys) for (var j = 0; j < f.polys.length; j++) polys.push(f.polys[j]); });   // (r11/perf11: no concat per face)
      var corr = curveCorrection(polys);
      if (corr.facets) {
        polygonal = { volume: vol, area: area };
        curved = corr.facets;
        vol += corr.volume; area += corr.area;
        cx += corr.moment[0]; cy += corr.moment[1]; cz += corr.moment[2];
      }
    }
    var centroid = vol > 1e-12 ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0];
    var out = { volume: vol, area: area, centroid: centroid, bbox: { min: min, max: max }, density: density, mass: vol * density };
    if (polygonal) { out.polygonal = polygonal; out.curved = curved; }
    return out;
  }


  // lane DF: the exact area centroid of the planar face of `body` under the picked point `at` (a reference Point "Center
  // of Face"), or null when the face there is curved / missing. The faceted face's own centroid is corrected by the
  // circular segment between every chord of a true circle on its outline and its arc: the chords are the in-plane edges
  // of the cylinder / cone facets (axis along the face normal) that bound the face; a segment whose arc midpoint lies in
  // the faceted face (a hole, a boss standing on it) is taken off, one outside it (a rounded outer corner) is added.
  function faceCentroidExact(body, at, tol) {
    if (!body || !body.polygons || !body.polygons.length) return null;
    var PN = function (q) { return [q.plane.normal.x, q.plane.normal.y, q.plane.normal.z]; };
    var PP = function (q) { return q.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }); };
    var curved = function (q) { var s = q.surf && q.surf.s; return !!(s && s.t && s.t !== 'plane' && s.o); };
    function outside(q, p) {   // how far p lies outside convex q in its plane, plus its distance off the plane
      var n = PN(q), pts = PP(q), o = 0;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length], inw = cross(n, sub(b, a)), l = len(inw);
        if (l > 1e-12) o = Math.max(o, -dot(sub(p, a), inw) / l);
      }
      return Math.abs(dot(n, p) - q.plane.w) + o;
    }
    var pick = null, bs = tol;
    body.polygons.forEach(function (q) {
      if (Math.abs(dot(PN(q), at) - q.plane.w) >= bs) return;
      var s = outside(q, at); if (s < bs) { bs = s; pick = q; }
    });
    if (!pick || curved(pick)) return null;
    var n = PN(pick), w = pick.plane.w, eps = 1e-7 * (1 + Math.abs(w));
    var key = function (p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6); };
    var pool = body.polygons.filter(function (q) { return !curved(q) && dot(PN(q), n) > 1 - 1e-9 && Math.abs(q.plane.w - w) < eps; });
    var face = [pick], keys = {}, grew = true;
    PP(pick).forEach(function (P) { keys[key(P)] = 1; });
    while (grew) {
      grew = false;
      pool.forEach(function (q) {
        if (face.indexOf(q) >= 0) return;
        var pts = PP(q);
        if (!pts.some(function (P) { return keys[key(P)]; })) return;
        face.push(q); grew = true; pts.forEach(function (P) { keys[key(P)] = 1; });
      });
    }
    var A = 0, M = [0, 0, 0];
    face.forEach(function (q) {
      var pts = PP(q);
      for (var j = 1; j + 1 < pts.length; j++) {
        var a = len(cross(sub(pts[j], pts[0]), sub(pts[j + 1], pts[0]))) / 2;
        A += a; M = add(M, scale(add(add(pts[0], pts[j]), pts[j + 1]), a / 3));
      }
    });
    if (!(A > 0)) return null;
    var onFace = function (p, t) { return face.some(function (q) { return outside(q, p) < t; }); };
    var seen = {};
    body.polygons.forEach(function (q) {
      if (!curved(q)) return;
      var s = q.surf.s, d = s.d ? norm(s.d) : null;
      if (!d || (s.t !== 'cyl' && s.t !== 'cone') || Math.abs(Math.abs(dot(d, n)) - 1) > 1e-9) return;
      var pts = PP(q);
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if (Math.abs(dot(n, a) - w) > eps || Math.abs(dot(n, b) - w) > eps) continue;
        var ka = key(a), kb = key(b), k2 = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (seen[k2]) continue;
        seen[k2] = 1;
        var c = add(s.o, scale(d, dot(sub(a, s.o), d))), r = len(sub(a, c)), ch = len(sub(b, a));
        if (r < 1e-12 || ch < 1e-12 || Math.abs(len(sub(b, c)) - r) > 1e-7 * (1 + r)) continue;
        var mid = scale(add(a, b), 0.5), u = sub(mid, c), ul = len(u);
        if (ul < 1e-12) continue;   // a half circle in one chord: not a tessellation
        u = scale(u, 1 / ul);
        var th = 2 * Math.asin(Math.min(1, ch / (2 * r))), sag = r - ul;
        if (!onFace(mid, Math.max(1e-9, sag * 0.01))) continue;   // the chord does not bound this face
        var tms = th < 1e-3 ? th * th * th / 6 - Math.pow(th, 5) / 120 : th - Math.sin(th);
        var As = r * r / 2 * tms, g = add(c, scale(u, 4 * r * Math.pow(Math.sin(th / 2), 3) / (3 * tms)));
        var sign = onFace(add(c, scale(u, r)), sag * 0.25) ? -1 : 1;
        A += sign * As; M = add(M, scale(g, sign * As));
      }
    });
    return A > 0 ? scale(M, 1 / A) : null;
  }

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.faceCentroidExact = faceCentroidExact;   // lane DF
  K.extrudeRange = extrudeRange; K.revolveAxis = revolveAxis; K.THROUGH = THROUGH; K.massProps = massProps; K.curveCorrection = curveCorrection;
  K.curveEdges = curveEdges; K.curveSurfaces = curveSurfaces; K.massOptions = massOptions; K.meshCurveInfo = meshCurveInfo;
  K.analyticNormals = analyticNormals; K.surfNormalAt = surfNormalAt;   // rfFE: K.smoothOptions (crease, exact, carry) is set above
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  K.plateOptions = plateOptions; _.plateCut = plateCut; _.plateApart = plateApart;   // rfGM
  _.plateCutParts = plateCutParts;   // rfLD
  _.THROUGH = THROUGH; _.buildExtrude = buildExtrude; _.buildRevolve = buildRevolve; _.extrudeRange = extrudeRange; _.mirrorBody = mirrorBody;
  _.prism = prism; _.rotateBody = rotateBody; _.rotatePoint = rotatePoint; _.translateBody = translateBody; _.unionAll = unionAll;
  _.unionTree = unionTree;
})(Kernel, Kernel._);
