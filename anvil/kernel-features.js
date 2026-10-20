// kernel-features.js — Anvil kernel, the sweep, loft and shell features (`sketchPath`, `buildSweep`, `buildLoft`,
// `resolveFaces`, `buildShell`). Loaded after kernel.js, kernel-sketch.js, kernel-curves.js, kernel-mesh.js and
// kernel-rebuild.js. No DOM.
(function (K, _) {
  'use strict';
  var add = _.add, cross = _.cross, dot = _.dot, ensureOutward = _.ensureOutward, len = _.len, norm = _.norm, pushPoly = _.pushPoly, resolvePlane = _.resolvePlane, scale = _.scale, sub = _.sub, to2D = _.to2D, to3D = _.to3D, triangulate = _.triangulate;   // kernel.js
  var checkProfile = _.checkProfile, entityPolylines = _.entityPolylines, key2 = _.key2, pointInPoly = _.pointInPoly, signedArea = _.signedArea, sketchProfile = _.sketchProfile;   // kernel-sketch.js
  var prism = _.prism, rotatePoint = _.rotatePoint, unionAll = _.unionAll, unionTree = _.unionTree;   // kernel-curves.js
  var bodyEdges = _.bodyEdges, ekey = _.ekey, faceOutline = _.faceOutline, meshFromBody = _.meshFromBody, pointSegmentDistance = _.pointSegmentDistance;   // kernel-mesh.js
  var findFeature = _.findFeature;   // kernel-rebuild.js

  // ------------------------------------------------------------------ sweep & loft
  // Chain a sketch's open entities (lines, arcs, open polylines) into one 3D polyline path.
  // `info.dropped` receives the number of entities that did not connect to the chain.
  function sketchPath(sketch, plane, info) {
    var chains = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'text' || K.noProfileEntity(sketch, e)) return;   // sketch-layers: ETCH / BEND entities (and text) are not the path
      entityPolylines(e).forEach(function (pl) { chains.push(pl.closed ? pl.pts.concat([pl.pts[0]]) : pl.pts.slice()); });
    });
    if (!chains.length) throw new Error('Path sketch has no lines or arcs.');
    var pts = chains.shift();
    var guard = 0;
    while (chains.length && guard++ < 1000) {
      var head = pts[0], tail = pts[pts.length - 1], found = false;
      for (var i = 0; i < chains.length; i++) {
        var c = chains[i], c0 = c[0], c1 = c[c.length - 1];
        if (key2(c0) === key2(tail)) { pts = pts.concat(c.slice(1)); found = true; }
        else if (key2(c1) === key2(tail)) { pts = pts.concat(c.slice().reverse().slice(1)); found = true; }
        else if (key2(c1) === key2(head)) { pts = c.slice(0, -1).concat(pts); found = true; }
        else if (key2(c0) === key2(head)) { pts = c.slice().reverse().slice(0, -1).concat(pts); found = true; }
        if (found) { chains.splice(i, 1); break; }
      }
      if (!found) break; // disconnected leftovers are ignored (reported through info.dropped)
    }
    if (info) info.dropped = chains.length;
    return pts.map(function (p) { return to3D(plane, p[0], p[1]); });
  }

  // Minimal rotation taking direction `from` to `to`, as a function on vectors.
  function rotationTo(from, to) {
    var f = norm(from), t = norm(to), c = Math.max(-1, Math.min(1, dot(f, t)));
    if (c > 1 - 1e-9) return function (v) { return v; };
    if (c < -1 + 1e-9) {
      var any = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var ax = norm(cross(f, any));
      return function (v) { return rotatePoint(v, [0, 0, 0], ax, Math.PI); };
    }
    var axis = norm(cross(f, t)), ang = Math.acos(c);
    return function (v) { return rotatePoint(v, [0, 0, 0], axis, ang); };
  }

  function triangulateAny(loop2) {
    if (signedArea(loop2) >= 0) return triangulate(loop2);
    var n = loop2.length, rev = loop2.slice().reverse();
    return triangulate(rev).map(function (t) { return [n - 1 - t[0], n - 1 - t[1], n - 1 - t[2]]; });
  }

  // Sweep one planar section (3D points located at path point J) along `dir` for length L with optional mitre caps.
  function sweepSection(pts3, dir, J, L, capA, capB, tag) {
    var x = norm(cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(dir, x);
    var loop = pts3.map(function (p) { var d = sub(p, J); return [dot(d, x), dot(d, y)]; });
    var pts = pts3.slice();
    if (signedArea(loop) < 0) { loop.reverse(); pts.reverse(); }
    var extent = 0;
    loop.forEach(function (p) { extent = Math.max(extent, Math.hypot(p[0], p[1])); });
    var lim = L + extent * 6;
    function shift(P, cap, def) {
      if (!cap || !cap.n) return def;
      var den = dot(dir, cap.n);
      if (Math.abs(den) < 0.2) return def;
      var t = dot(sub(cap.v, P), cap.n) / den;
      return Math.max(def - lim, Math.min(def + lim, t));
    }
    var bottom = pts.map(function (P) { return add(P, scale(dir, shift(P, capA, 0))); });
    var top = pts.map(function (P) { return add(P, scale(dir, shift(P, capB, L))); });
    var polys = [], n = pts.length;
    triangulate(loop).forEach(function (t) {
      pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], tag);
      pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], tag);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      pushPoly(polys, [bottom[i], bottom[j], top[j], top[i]], tag);
    }
    return ensureOutward(polys);
  }

  function loopCentroid3(pts) {
    var c = [0, 0, 0];
    pts.forEach(function (p) { c = add(c, p); });
    return scale(c, 1 / pts.length);
  }

  function buildSweep(f, model, ctx) {
    var prof = ctx.sketches[f.profile] || findFeature(model, f.profile);
    if (!prof || prof.type !== 'sketch') throw new Error('Select a profile sketch for the sweep.');
    var profPlane = resolvePlane(prof.plane, model, ctx.planes);
    var profile = prof.profile || sketchProfile(prof);
    if (!profile.loops.length) throw new Error('Sweep profile sketch has no closed profile.');
    checkProfile(profile);
    var path;
    if (Array.isArray(f.path)) {
      path = f.path.map(function (p) { return [+p[0], +p[1], +p[2]]; });
      path.forEach(function (p) { if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) throw new Error('Every sweep path coordinate must be a number.'); });
    } else {
      var ps = ctx.sketches[f.path] || findFeature(model, f.path);
      if (!ps || ps.type !== 'sketch') throw new Error('Select a path sketch for the sweep.');
      var info = {};
      path = sketchPath(ps, resolvePlane(ps.plane, model, ctx.planes), info);
      if (info.dropped && ctx.warnings) ctx.warnings[f.id] = info.dropped + ' path ' + (info.dropped === 1 ? 'entity does' : 'entities do') + ' not connect to the path and ' + (info.dropped === 1 ? 'was' : 'were') + ' ignored.';
    }
    var pts = [path[0]];
    for (var i = 1; i < path.length; i++) if (len(sub(path[i], pts[pts.length - 1])) > 1e-6) pts.push(path[i]);
    if (pts.length < 2) throw new Error('Sweep path needs at least two distinct points.');
    // the path starts at the end nearest the profile
    var c0 = loopCentroid3(profile.loops[0].pts.map(function (p) { return to3D(profPlane, p[0], p[1]); }));
    if (len(sub(pts[pts.length - 1], c0)) < len(sub(pts[0], c0))) pts.reverse();
    var dirs = [];
    for (i = 0; i + 1 < pts.length; i++) dirs.push(norm(sub(pts[i + 1], pts[i])));
    // a closed path (a closed polyline, or a chain back to its start) mitres its start / end joint like every other
    // corner; with flat ends there the tube had a notch on the outside of that corner (−2 % on a rectangular ring)
    var closed = dirs.length > 2 && len(sub(pts[pts.length - 1], pts[0])) < 1e-6;
    var joint = closed && len(add(dirs[dirs.length - 1], dirs[0])) > 1e-9 ? { v: pts[0], n: norm(add(dirs[dirs.length - 1], dirs[0])) } : null;
    // place the profile perpendicular to the first segment, pivoting about the path start
    var J0 = pts[0];
    var nSign = dot(profPlane.n, dirs[0]) < 0 ? -1 : 1;
    var rot0 = rotationTo(scale(profPlane.n, nSign), dirs[0]);
    var sections = profile.loops.map(function (l) {
      return { hole: l.hole, pts: l.pts.map(function (p) { return add(J0, rot0(sub(to3D(profPlane, p[0], p[1]), J0))); }) };
    });
    var perLoop = sections.map(function () { return []; });
    for (i = 0; i < dirs.length; i++) {
      if (i > 0) {
        var R = rotationTo(dirs[i - 1], dirs[i]);
        sections = sections.map(function (s) { return { hole: s.hole, pts: s.pts.map(function (p) { return add(pts[i], R(sub(p, pts[i - 1]))); }) }; });
      }
      var L = len(sub(pts[i + 1], pts[i]));
      var capA = i > 0 ? { v: pts[i], n: norm(add(dirs[i - 1], dirs[i])) } : joint;
      var capB = i + 1 < dirs.length ? { v: pts[i + 1], n: norm(add(dirs[i], dirs[i + 1])) } : joint;
      sections.forEach(function (s, k) { perLoop[k].push(sweepSection(s.pts, dirs[i], pts[i], L, capA, capB, f.id)); });
    }
    var outers = [], holes = [];
    perLoop.forEach(function (parts, k) { (sections[k].hole ? holes : outers).push(unionTree(parts)); });
    if (!outers.length) throw new Error('Sweep profile has no outer loop.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

  function resampleLoop(pts, N) {
    var n = pts.length, segLen = [], total = 0;
    for (var i = 0; i < n; i++) { var l = len(sub(pts[(i + 1) % n], pts[i])); segLen.push(l); total += l; }
    var out = [], seg = 0, acc = 0;
    for (var k = 0; k < N; k++) {
      var target = total * k / N;
      while (seg < n - 1 && acc + segLen[seg] < target - 1e-12) { acc += segLen[seg]; seg++; }
      var t = segLen[seg] > 1e-12 ? (target - acc) / segLen[seg] : 0;
      out.push(add(pts[seg], scale(sub(pts[(seg + 1) % n], pts[seg]), Math.min(1, Math.max(0, t)))));
    }
    return out;
  }

  function loopNormal3(pts) {
    var nx = 0, ny = 0, nz = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return norm([nx, ny, nz]);
  }

  // Loft side between convex sections on parallel planes: the convex hull of each consecutive pair (a rotating-calipers
  // merge of the two loops' edge directions), so every side face is planar and every edge convex. Each section keeps
  // its own polygon, so it still matches features made from the same sketch (the Funnel's spout). A Ø80 → Ø14 loft
  // used to resample the 21-gon onto 51 points: non-planar quads split into needle triangles with slightly concave
  // (saddle) diagonals, which the shell could not offset cleanly (grooves in the wall, extra lines in drawings).
  // secs: [{ plane, pts3 }] -> { loops: [pts3 CCW about the loft direction, started at the smallest edge angle],
  // tris: [[p, q, r] or [p, q, r, s]] } or null when a section is not convex or the planes are not parallel.
  function hullLoftLoops(secs) {
    var n0 = secs[0].plane.n, plane = secs[0].plane, sgn = 0, loops = [];
    for (var i = 0; i < secs.length; i++) {
      if (Math.abs(dot(secs[i].plane.n, n0)) < 1 - 1e-9) return null;
      if (i + 1 < secs.length) {
        var dn = dot(sub(loopCentroid3(secs[i + 1].pts), loopCentroid3(secs[i].pts)), n0), s = dn > 0 ? 1 : -1;
        if (Math.abs(dn) < 1e-9 || (sgn && s !== sgn)) return null;
        sgn = s;
      }
      var pts = secs[i].pts.slice(), p2 = pts.map(function (p) { return to2D(plane, p); });
      if (signedArea(p2) < 0) { pts.reverse(); p2.reverse(); }
      var n = pts.length, angs = [], best = 0;
      for (var k = 0; k < n; k++) {
        var a = p2[k], b = p2[(k + 1) % n], c = p2[(k + 2) % n];
        var cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (cr < -1e-9 * (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]) + 1e-12)) return null;
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang < 0) ang += Math.PI * 2;
        if (ang > Math.PI * 2 - 1e-9) ang = 0; // so a direction just below 2π merges with the other loop's 0
        angs.push(ang);
        if (ang < angs[best]) best = k;
      }
      loops.push({ pts: pts.slice(best).concat(pts.slice(0, best)), angs: angs.slice(best).concat(angs.slice(0, best)) });
    }
    var tris = [];
    for (i = 0; i + 1 < loops.length; i++) {
      var P = loops[i].pts, Q = loops[i + 1].pts, aP = loops[i].angs, aQ = loops[i + 1].angs, nP = P.length, nQ = Q.length, pi = 0, qj = 0;
      while (pi < nP || qj < nQ) {
        var x = pi < nP ? aP[pi] : Infinity, y = qj < nQ ? aQ[qj] : Infinity;
        var p0 = P[pi % nP], p1 = P[(pi + 1) % nP], q0 = Q[qj % nQ], q1 = Q[(qj + 1) % nQ];
        if (Math.abs(x - y) < 1e-9) { tris.push([p0, p1, q1, q0]); pi++; qj++; }
        else if (x < y) { tris.push([p0, p1, q0]); pi++; }
        else { tris.push([p0, q1, q0]); qj++; }
      }
    }
    // the loops run CCW about the first plane's normal; the side faces above are wound for a loft along +n
    if (sgn < 0) tris.forEach(function (t) { t.reverse(); });
    return { loops: loops.map(function (l) { return sgn < 0 ? l.pts.slice().reverse() : l.pts; }), tris: tris };
  }

  function buildLoft(f, model, ctx) {
    var ids = f.sketches || [];
    if (ids.length < 2) throw new Error('Loft needs at least two profile sketches.');
    var secs = ids.map(function (id) {
      var s = ctx.sketches[id] || findFeature(model, id);
      if (!s || s.type !== 'sketch') throw new Error('Loft sketch not found.');
      var pl = resolvePlane(s.plane, model, ctx.planes);
      var prof = s.profile || sketchProfile(s);
      checkProfile(prof);
      var outers = prof.loops.filter(function (l) { return !l.hole; });
      if (outers.length !== 1) throw new Error('Each loft sketch must contain exactly one closed profile.');
      return { plane: pl, pts: outers[0].pts.map(function (p) { return to3D(pl, p[0], p[1]); }) };
    });
    var polys = [], loops, i;
    var hull = hullLoftLoops(secs);
    if (hull) {
      loops = hull.loops;
      hull.tris.forEach(function (t) { pushPoly(polys, t, f.id); });
    } else {
      var N = 24;
      secs.forEach(function (s) { N = Math.max(N, s.pts.length); });
      N = Math.min(N, 96);
      loops = secs.map(function (s) { return resampleLoop(s.pts, N); });
      // consistent winding along the loft direction, then align start indices
      for (i = 0; i + 1 < loops.length; i++) {
        var dir = norm(sub(loopCentroid3(loops[i + 1]), loopCentroid3(loops[i])));
        if (i === 0 && dot(loopNormal3(loops[0]), dir) < 0) loops[0].reverse();
        if (dot(loopNormal3(loops[i + 1]), dir) < 0) loops[i + 1].reverse();
        var A = loops[i], B = loops[i + 1], bestO = 0, bestCost = Infinity;
        for (var o = 0; o < N; o++) {
          var cost = 0;
          for (var k = 0; k < N; k++) { var d = sub(A[k], B[(k + o) % N]); cost += dot(d, d); }
          if (cost < bestCost) { bestCost = cost; bestO = o; }
        }
        if (bestO) loops[i + 1] = B.slice(bestO).concat(B.slice(0, bestO));
      }
      for (i = 0; i + 1 < loops.length; i++) {
        var P = loops[i], Q = loops[i + 1];
        for (var k2 = 0; k2 < N; k2++) {
          var j = (k2 + 1) % N;
          pushPoly(polys, [P[k2], P[j], Q[j]], f.id);
          pushPoly(polys, [P[k2], Q[j], Q[k2]], f.id);
        }
      }
    }
    function cap(loop3, plane, flip) {
      var loop2 = loop3.map(function (p) { return to2D(plane, p); });
      triangulateAny(loop2).forEach(function (t) {
        var tri = [loop3[t[0]], loop3[t[1]], loop3[t[2]]];
        if (flip) tri.reverse();
        pushPoly(polys, tri, f.id);
      });
    }
    // caps: orientation is settled globally by ensureOutward, but each cap must be self-consistent
    // triangulateAny yields triangles whose normal is the section plane's n; flip so caps face away from the body
    var first = loops[0], last = loops[loops.length - 1];
    var firstDir = norm(sub(loopCentroid3(loops[1]), loopCentroid3(first)));
    cap(first, secs[0].plane, dot(secs[0].plane.n, firstDir) > 0);
    var lastDir = norm(sub(loopCentroid3(last), loopCentroid3(loops[loops.length - 2])));
    cap(last, secs[secs.length - 1].plane, dot(secs[secs.length - 1].plane.n, lastDir) < 0);
    return ensureOutward(polys);
  }

  // ------------------------------------------------------------------ shell
  // Resolve face specs ({at:[x,y,z]}) against the current mesh: the face whose plane contains the point and whose
  // outline contains its projection. Returns mesh face indices (deduplicated, in spec order).
  function resolveFaces(specs, mesh, tol) {
    tol = tol || 0.5;
    var out = [], outlines = {};
    function outline(i) { if (!(i in outlines)) { try { outlines[i] = faceOutline(mesh, i); } catch (e) { outlines[i] = null; } } return outlines[i]; }
    (specs || []).forEach(function (spec) {
      var best = -1, bestD = tol, fallback = -1, fallbackD = tol * 4;
      for (var i = 0; i < mesh.faces.length; i++) {
        var face = mesh.faces[i];
        var d = Math.abs(dot(face.normal, spec.at) - face.w);
        if (d >= fallbackD) continue;
        var o = outline(i);
        if (!o) continue;
        var uv = to2D(o.plane, spec.at), inside = 0;
        o.loops.forEach(function (l) { if (pointInPoly(uv, l)) inside++; });
        if (inside % 2 === 1) { if (d < bestD) { bestD = d; best = i; } }
        else if (d < fallbackD) {
          // near the outline (a pick right on an edge): accept when within tol of a boundary segment
          var dEdge = Infinity;
          o.loops.forEach(function (l) { for (var k = 0; k < l.length; k++) { var a = l[k], b = l[(k + 1) % l.length]; dEdge = Math.min(dEdge, pointSegmentDistance([uv[0], uv[1], 0], [a[0], a[1], 0], [b[0], b[1], 0])); } });
          if (dEdge < tol && d + dEdge < fallbackD) { fallbackD = d + dEdge; fallback = i; }
        }
      }
      var pick = best >= 0 ? best : fallback;
      if (pick >= 0 && out.indexOf(pick) < 0) out.push(pick);
    });
    return out;
  }

  // Outline loops of a mesh face split into outer loops (CCW, kept as is) and holes (CW, returned reversed to CCW).
  function faceLoopsClassified(o) {
    var outers = [], holes = [];
    o.loops.forEach(function (l) {
      var a = signedArea(l);
      if (Math.abs(a) < 1e-9) return;
      if (a > 0) outers.push(l); else holes.push(l.slice().reverse());
    });
    return { outers: outers, holes: holes };
  }

  // Offset a closed loop with a different distance per edge (dists[i] belongs to the edge pts[i] -> pts[i+1];
  // positive = outward of the polygon). Corners are the intersections of the two shifted edge lines, clamped.
  function offsetLoopVar(pts, dists) {
    var ccw = signedArea(pts) >= 0, n = pts.length, s = ccw ? 1 : -1, out = [];
    function edge(i) {
      var p = pts[i], q = pts[(i + 1) % n], e = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(e[0], e[1]) || 1;
      return { d: [e[0] / l, e[1] / l], nrm: [e[1] / l * s, -e[0] / l * s] };
    }
    for (var i = 0; i < n; i++) {
      var i0 = (i + n - 1) % n, e1 = edge(i0), e2 = edge(i), d1 = dists[i0] || 0, d2 = dists[i] || 0, p1 = pts[i];
      var a = [p1[0] + e1.nrm[0] * d1, p1[1] + e1.nrm[1] * d1], b = [p1[0] + e2.nrm[0] * d2, p1[1] + e2.nrm[1] * d2];
      var cr = e1.d[0] * e2.d[1] - e1.d[1] * e2.d[0];
      if (Math.abs(cr) < 1e-9) { out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); continue; }
      var t = ((b[0] - a[0]) * e2.d[1] - (b[1] - a[1]) * e2.d[0]) / cr;
      var x = [a[0] + e1.d[0] * t, a[1] + e1.d[1] * t];
      var lim = Math.max(Math.abs(d1), Math.abs(d2)) * 5, dx = x[0] - p1[0], dy = x[1] - p1[1], L = Math.hypot(dx, dy);
      if (L > lim && lim > 0) x = [p1[0] + dx / L * lim, p1[1] + dy / L * lim];
      out.push(x);
    }
    return out;
  }

  // Prism over a face's loops: outer loops grown and holes shrunk by growFor(loop) (per-edge distances; holes that
  // collapse are dropped), from plane offset a to b along the face normal.
  function slabSolid(o, growFor, a, b, tag) {
    var cl = faceLoopsClassified(o), prisms = [], holes = [];
    cl.outers.forEach(function (l) {
      var g = offsetLoopVar(l, growFor(l));
      if (signedArea(g) > 1e-9) prisms.push(prism(g, o.plane, a, b, tag));
    });
    cl.holes.forEach(function (l) {
      var g = offsetLoopVar(l, growFor(l).map(function (d) { return -d; }));
      if (signedArea(g) > 1e-9 && signedArea(g) < signedArea(l)) holes.push(prism(g, o.plane, a - 0.01, b + 0.01, tag));
    });
    if (!prisms.length) return null;
    var solid = prisms.length === 1 ? prisms[0] : unionAll(prisms);
    if (holes.length) solid = solid.subtract(unionAll(holes));
    return solid;
  }

  // Shell: hollow the body leaving walls of thickness T; faces listed in f.faces are removed (open).
  // The inner solid is the body minus a slab of depth T behind every kept face. Each slab outline is grown across
  // every edge by T·tan(φ/2), φ being the dihedral angle to the neighbouring face, which is exactly where the two
  // faces' offset planes meet, so slabs join at sharp offset corners (concave edges) and do not over-cut at
  // tangent facets. Removed faces get an extension out through the face instead. Shell = body − inner.
  // -> { body, inner, removed }
  function buildShell(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to shell yet.');
    var T = +f.thickness;
    if (!(T > 0)) throw new Error('Shell thickness must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var removed = resolveFaces(f.faces || [], mesh, _.pickTol(ctx.units, T / 2));   // r16/picktol (kernel-mesh.js)
    if ((f.faces || []).length && removed.length < f.faces.length) throw new Error('A face to remove was not found on the body. Select the faces again.');
    // dihedral turn angle per body edge, keyed like bodyEdges
    var turn = {};
    bodyEdges(mesh).forEach(function (e) {
      var key = e.ka < e.kb ? e.ka + '|' + e.kb : e.kb + '|' + e.ka;
      var phi = 0;
      for (var p = 0; p < e.normals.length; p++) for (var q = p + 1; q < e.normals.length; q++) phi = Math.max(phi, Math.acos(Math.max(-1, Math.min(1, dot(e.normals[p], e.normals[q])))));
      turn[key] = phi;
    });
    function growFor(plane) {
      return function (loop) {
        return loop.map(function (p, k) {
          var a = to3D(plane, p[0], p[1]), q = loop[(k + 1) % loop.length], b = to3D(plane, q[0], q[1]);
          var ka = ekey(a), kb = ekey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          var phi = key in turn ? turn[key] : Math.PI / 2;
          return Math.min(4 * T, T * Math.tan(Math.min(phi, Math.PI - 0.05) / 2));
        });
      };
    }
    function uniform(loop) { return loop.map(function () { return T; }); }
    var inner = ctx.body, extensions = [], slabs = [];
    for (var i = 0; i < mesh.faces.length; i++) {
      var o;
      try { o = faceOutline(mesh, i); } catch (e) { o = null; }
      if (!o || !o.loops.length) continue;
      if (removed.indexOf(i) >= 0) {
        // outward through the face, starting a little inside so no cap is coplanar with the face
        var ext = slabSolid({ loops: o.loops.filter(function (l) { return signedArea(l) > 0; }), plane: o.plane }, uniform, -T / 2, T + 1, f.id);
        if (ext) extensions.push(ext);
      } else {
        var slab = slabSolid(o, growFor(o.plane), -T, T, f.id);
        if (slab) slabs.push(slab);
      }
    }
    if (!slabs.length) throw new Error('Every face of the body is selected for removal: leave at least one face to keep as a wall.');
    // body − ((body ∪ ext) − S) = body ∩ S exactly (S: the slab union), so the walls are one intersection instead of
    // a union and two subtractions (the Funnel's shell: two large booleans fewer, the same solid). The cavity
    // `inner` (the Shell PropertyManager's red preview) is only built when it is read.
    var S = unionTree(slabs);
    var body = ctx.body.intersect(S);
    if (ctx.body.volume() - body.volume() < 1e-9) throw new Error('Shell thickness ' + T + ' is too large for this part: nothing would remain hollow. Enter a thickness below half of the thinnest wall.');
    var out = { body: body, removed: removed }, innerSolid = null;
    Object.defineProperty(out, 'inner', { enumerable: true, get: function () {
      if (!innerSolid) innerSolid = (extensions.length ? inner.union(unionTree(extensions)) : inner).subtract(S);
      return innerSolid;
    } });
    return out;
  }

  // ------------------------------------------------------------------ lane CZ: reference geometry (Axis, Point, Coordinate System)
  // Three feature types that change no body; rebuild resolves each into a record kept in ctx.planes[f.id] (so the
  // rebuild cache, packBuild / unpackBuild and the worker carry it like a reference plane's frame):
  //   { type: 'refaxis', kind: 'line' | 'planes' | 'points' | 'cyl' | 'pointFace', refs: [ref, ref?] }
  //       -> { refgeo: 'axis', o, d (unit), a, b (the drawn extent: the reference's own, else the part's) }
  //   { type: 'refpoint', kind: 'arc' | 'face' | 'intersect' | 'project' | 'on' | 'along', refs: [ref, ref?],
  //     distance?, percent?, reverse? }   -> { refgeo: 'point', p }
  //   { type: 'csys', origin?: ref, x?: ref, y?: ref, z?: ref, flipX?, flipY?, flipZ? }
  //       -> { refgeo: 'csys', origin, x, y, z, n (= z): a frame, so its XY plane can be a sketch plane }
  // A ref is one of: { plane: 'Front' | 'Top' | 'Right' | <plane / csys feature id> }, { axis: 'x' | 'y' | 'z' | <axis
  // feature id> }, { point: 'origin' | <point / csys feature id> }, { face: [x, y, z] }, { edge: [x, y, z] },
  // { vertex: [x, y, z] } (snapped to the nearest body vertex), { sketch: id, entity: i, end?: 'p1' | 'p2' | 'c' }.
  // Face / edge / vertex refs are points on the body before the feature, re-resolved at every rebuild (pickTol), so
  // the reference follows the model as long as the face or edge is still there.
  var REF_EPS = 1e-9;
  function refTol(ctx) { return _.pickTol(ctx.units || 'mm'); }
  function refErr(msg) { return new Error(msg); }
  function fmtPt(p) { return '(' + p.map(function (x) { return Math.round(x * 1000) / 1000; }).join(', ') + ')'; }
  function polyN(poly) { return [poly.plane.normal.x, poly.plane.normal.y, poly.plane.normal.z]; }
  function polyPts(poly) { return poly.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }); }
  function needBody(ctx) {
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw refErr('This reference needs a solid body, and there is none before this feature.');
    return ctx.body;
  }
  // how far p lies outside a convex polygon (0 inside), measured in its plane, plus its distance from the plane
  function polyScore(poly, p) {
    var n = polyN(poly), pts = polyPts(poly), out = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], inward = cross(n, sub(b, a)), l = len(inward);
      if (l < 1e-12) continue;
      out = Math.max(out, -dot(sub(p, a), inward) / l);
    }
    return Math.abs(dot(n, p) - poly.plane.w) + out;
  }
  function polyAt(body, p, tol) {
    var best = null, bs = tol;
    body.polygons.forEach(function (poly) {
      if (Math.abs(dot(polyN(poly), p) - poly.plane.w) >= bs) return;
      var s = polyScore(poly, p);
      if (s < bs) { bs = s; best = poly; }
    });
    return best;
  }
  function surfOf(q) { return q.surf && q.surf.s ? q.surf.s : null; }   // polygon.surf = { s: surface, … } (kernel-curves.js)
  function curvedSurf(s) { return !!(s && s.t && s.t !== 'plane' && s.o); }
  function sameSurf(a, b) {
    if (!a || !b || a.t !== b.t) return false;
    if (len(sub(a.o, b.o)) > 1e-7 * (1 + len(a.o))) {
      // two points on the same axis line are the same cylinder's axis
      if (!(a.d && b.d)) return false;
      var v = sub(b.o, a.o), dd = norm(a.d);
      if (len(sub(v, scale(dd, dot(v, dd)))) > 1e-7 * (1 + len(a.o))) return false;
    }
    if (a.d && b.d && Math.abs(Math.abs(dot(norm(a.d), norm(b.d))) - 1) > 1e-9) return false;
    return Math.abs((a.r || 0) - (b.r || 0)) < 1e-9 && Math.abs((a.R || 0) - (b.R || 0)) < 1e-9;
  }
  // the face under a picked point: { kind: 'plane', n, o, polys } or { kind: 'cyl' | 'cone' | 'sph' | 'tor', o, d, polys }
  function refFace(at, ctx) {
    var body = needBody(ctx), poly = polyAt(body, at, refTol(ctx));
    if (!poly) throw refErr('A referenced face is gone (nothing at ' + fmtPt(at) + ').');
    var s = surfOf(poly);
    if (curvedSurf(s)) return { kind: s.t, o: s.o.slice(), d: s.d ? norm(s.d) : [0, 0, 1], surf: s, polys: body.polygons.filter(function (q) { return sameSurf(surfOf(q), s); }) };
    // a planar face: the polygons of its plane connected to the picked one through shared vertices
    var n = polyN(poly), w = poly.plane.w;
    var pool = body.polygons.filter(function (q) { return !curvedSurf(surfOf(q)) && dot(polyN(q), n) > 1 - 1e-9 && Math.abs(q.plane.w - w) < 1e-7 * (1 + Math.abs(w)); });
    var seen = [poly], keys = {}, grew = true;
    polyPts(poly).forEach(function (P) { keys[_.ekey(P)] = 1; });
    while (grew) {
      grew = false;
      pool.forEach(function (q) {
        if (seen.indexOf(q) >= 0) return;
        var pts = polyPts(q);
        if (!pts.some(function (P) { return keys[_.ekey(P)]; })) return;
        seen.push(q); grew = true;
        pts.forEach(function (P) { keys[_.ekey(P)] = 1; });
      });
    }
    return { kind: 'plane', n: n, o: sub(at, scale(n, dot(n, at) - w)), w: w, polys: seen };
  }
  // area-weighted centroid of a set of convex polygons
  function polysCentroid(polys) {
    var A = 0, c = [0, 0, 0];
    polys.forEach(function (q) {
      var pts = polyPts(q);
      for (var j = 1; j + 1 < pts.length; j++) {
        var a = len(cross(sub(pts[j], pts[0]), sub(pts[j + 1], pts[0]))) / 2;
        A += a; c = add(c, scale(add(add(pts[0], pts[j]), pts[j + 1]), a / 3));
      }
    });
    return A > 0 ? scale(c, 1 / A) : null;
  }
  // the sharp body edges (cached per body for the rebuild)
  function refEdges(ctx) {
    var body = needBody(ctx), c = ctx._refEdges;
    if (c && c.body === body) return c.edges;
    var edges = bodyEdges(meshFromBody(body)).filter(function (e) { return !e.smooth; });
    ctx._refEdges = { body: body, edges: edges };
    return edges;
  }
  // a picked model edge: { seg, line: { a, b } (its straight run), circle: { c, d, r } | null }
  function refEdge(at, ctx) {
    var edges = refEdges(ctx), tol = refTol(ctx), best = null, bd = tol;
    edges.forEach(function (e) { var d = pointSegmentDistance(at, e.a, e.b); if (d < bd) { bd = d; best = e; } });
    if (!best) throw refErr('A referenced edge is gone (nothing at ' + fmtPt(at) + ').');
    // a circular edge: a cylinder / cone beside it whose axis is not along the edge
    var circle = null;
    ctx.body.polygons.forEach(function (q) {
      if (circle) return;
      var s = surfOf(q);
      if (!s || (s.t !== 'cyl' && s.t !== 'cone') || !s.o || !s.d) return;
      var d = norm(s.d);
      if (Math.abs(dot(d, best.dir)) > 0.5) return;
      if (polyScore(q, best.mid) > tol) return;
      var c = add(s.o, scale(d, dot(sub(best.a, s.o), d)));
      circle = { c: c, d: d, r: len(sub(best.a, c)) };
    });
    // the straight run: exactly collinear sharp edges joined end to end
    var a = best.a, b = best.b, dir = best.dir, grew = !circle, used = [best];
    var onLine = function (p) { var v = sub(p, best.a); return len(sub(v, scale(dir, dot(v, dir)))) < 1e-7 * (1 + len(p)); };
    while (grew) {
      grew = false;
      edges.forEach(function (e) {
        if (used.indexOf(e) >= 0 || Math.abs(dot(e.dir, dir)) < 1 - 1e-9 || !onLine(e.a) || !onLine(e.b)) return;
        var ta = dot(sub(e.a, best.a), dir), tb = dot(sub(e.b, best.a), dir), t0 = dot(sub(a, best.a), dir), t1 = dot(sub(b, best.a), dir);
        if (Math.min(ta, tb) > Math.max(t0, t1) + 1e-7 || Math.max(ta, tb) < Math.min(t0, t1) - 1e-7) return;
        used.push(e); grew = true;
        var lo = Math.min(ta, tb, t0, t1), hi = Math.max(ta, tb, t0, t1);
        a = add(best.a, scale(dir, lo)); b = add(best.a, scale(dir, hi));
      });
    }
    // the run's start is the end its largest direction component points away from (the edge's own direction
    // depends on which face outline found it, so it could flip from one rebuild to the next)
    var dv = sub(b, a), kmax = 0;
    for (var k = 1; k < 3; k++) if (Math.abs(dv[k]) > Math.abs(dv[kmax]) + 1e-9) kmax = k;
    if (dv[kmax] < 0) { var sw = a; a = b; b = sw; }
    return { seg: best, line: { a: a, b: b }, circle: circle };
  }
  function refSketch(r, ctx, model) {
    var sk = (ctx.sketches && ctx.sketches[r.sketch]) || findFeature(model, r.sketch);
    if (!sk || sk.type !== 'sketch') throw refErr('A referenced sketch (feature ' + r.sketch + ') is gone.');
    var e = sk.entities && sk.entities[r.entity];
    if (!e) throw refErr('A referenced sketch entity (' + sk.name + ', entity ' + (r.entity + 1) + ') is gone.');
    return { e: e, pl: resolvePlane(sk.plane, model, ctx.planes), sk: sk };
  }
  // a straight-sided sketch entity (rectangle, centre rectangle, polygon, polyline): its k-th corner / side
  var POLY_TYPES = { rect: 1, crect: 1, poly: 1, polyline: 1 };
  function polyPts2(e) {
    if (!POLY_TYPES[e.t]) throw refErr('Pick a line, or a side / corner of a rectangle, polygon or polyline.');
    var pl = entityPolylines(e)[0];
    if (!pl || pl.pts.length < 2) throw refErr('The sketch entity has no sides.');
    return pl;
  }
  function polyCorner(e, k) { var pl = polyPts2(e); if (k < 0 || k >= pl.pts.length) throw refErr('A referenced sketch corner is gone.'); return pl.pts[k]; }
  function polySide(e, k) {
    var pl = polyPts2(e), n = pl.pts.length;
    if (k < 0 || k >= (pl.closed ? n : n - 1)) throw refErr('A referenced sketch side is gone.');
    return [pl.pts[k], pl.pts[(k + 1) % n]];
  }
  function refGeoOf(id, ctx, kinds) {
    var g = ctx.planes && ctx.planes[id];
    if (!g || (kinds && kinds.indexOf(g.refgeo || 'plane') < 0)) throw refErr('A referenced feature (' + id + ') is missing or failed to rebuild.');
    return g;
  }
  // -> [x, y, z]
  function refPoint(r, ctx, model) {
    if (Array.isArray(r)) return r.slice();
    if (r.point === 'origin') return [0, 0, 0];
    if (r.point != null) { var g = refGeoOf(r.point, ctx, ['point', 'csys']); return (g.p || g.origin).slice(); }
    if (r.vertex) {
      if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) return r.vertex.slice();
      var best = null, bd = refTol(ctx);
      ctx.body.polygons.forEach(function (q) { polyPts(q).forEach(function (P) { var d = len(sub(P, r.vertex)); if (d < bd) { bd = d; best = P; } }); });
      if (!best) throw refErr('A referenced vertex is gone (nothing at ' + fmtPt(r.vertex) + ').');
      return best;
    }
    if (r.sketch != null) {
      var s = refSketch(r, ctx, model), e = s.e;
      if (r.pt != null) { var cp = polyCorner(e, r.pt); return to3D(s.pl, cp[0], cp[1]); }
      if (e.t === 'point') return to3D(s.pl, e.x, e.y);
      if (e.cx != null && (r.end === 'c' || r.end == null)) return to3D(s.pl, e.cx, e.cy);
      if (e.t === 'line') return r.end === 'p2' ? to3D(s.pl, e.x2, e.y2) : to3D(s.pl, e.x1, e.y1);
      if (e.t === 'arc' && (r.end === 'p1' || r.end === 'p2')) { var an = (r.end === 'p1' ? e.a0 : e.a1) * Math.PI / 180; return to3D(s.pl, e.cx + e.r * Math.cos(an), e.cy + e.r * Math.sin(an)); }
      throw refErr('Pick a sketch point, a line end or an arc centre.');
    }
    if (r.edge) { var ed = refEdge(r.edge, ctx); return ed.circle ? ed.circle.c : scale(add(ed.line.a, ed.line.b), 0.5); }
    throw refErr('This reference is not a point.');
  }
  // -> { o, d (unit), a?, b? }
  function refLine(r, ctx, model) {
    if (r.axis === 'x' || r.axis === 'y' || r.axis === 'z') return { o: [0, 0, 0], d: _.AXES[r.axis].slice() };
    if (r.axis != null) { var g = refGeoOf(r.axis, ctx, ['axis']); return { o: g.o.slice(), d: g.d.slice(), a: g.a, b: g.b }; }
    if (r.edge) {
      var ed = refEdge(r.edge, ctx);
      if (ed.circle) throw refErr('A circular edge has no direction: pick a straight edge, or the cylindrical face for its axis.');
      return { o: ed.line.a, d: norm(sub(ed.line.b, ed.line.a)), a: ed.line.a, b: ed.line.b };
    }
    if (r.sketch != null) {
      var s = refSketch(r, ctx, model), e = s.e, A, B;
      if (r.seg != null) { var sd = polySide(e, r.seg); A = to3D(s.pl, sd[0][0], sd[0][1]); B = to3D(s.pl, sd[1][0], sd[1][1]); }
      else if (e.t !== 'line') throw refErr('Pick a sketch line.');
      else { A = to3D(s.pl, e.x1, e.y1); B = to3D(s.pl, e.x2, e.y2); }
      if (len(sub(B, A)) < REF_EPS) throw refErr('The sketch line has no length.');
      return { o: A, d: norm(sub(B, A)), a: A, b: B };
    }
    if (r.face) {
      var f = refFace(r.face, ctx);
      if (f.kind === 'cyl' || f.kind === 'cone') return faceAxis(f);
      throw refErr('Pick a straight edge, a sketch line, an axis or a cylindrical face.');
    }
    throw refErr('This reference is not a line.');
  }
  function faceAxis(f) {
    var lo = Infinity, hi = -Infinity;
    f.polys.forEach(function (q) { polyPts(q).forEach(function (P) { var t = dot(sub(P, f.o), f.d); lo = Math.min(lo, t); hi = Math.max(hi, t); }); });
    var o = add(f.o, scale(f.d, isFinite(lo) ? lo : 0));
    return { o: o, d: f.d.slice(), a: o, b: add(f.o, scale(f.d, isFinite(hi) ? hi : 0)) };
  }
  // -> { n (unit), o (a point on it) }
  function refPlane(r, ctx, model) {
    if (typeof r.plane === 'string') { var sp = _.makePlane(r.plane, 0); return { n: sp.n, o: sp.origin }; }
    if (r.plane != null) { var g = refGeoOf(r.plane, ctx, ['plane', 'csys']); return { n: norm(g.n), o: (g.origin || [0, 0, 0]).slice() }; }
    if (r.face) {
      var f = refFace(r.face, ctx);
      if (f.kind !== 'plane') throw refErr('Pick a planar face or a plane.');
      return { n: f.n, o: f.o };
    }
    if (r.sketch != null && r.entity == null) {
      var sk = (ctx.sketches && ctx.sketches[r.sketch]) || findFeature(model, r.sketch);
      if (!sk || sk.type !== 'sketch') throw refErr('A referenced sketch is gone.');
      var pl = resolvePlane(sk.plane, model, ctx.planes);
      return { n: pl.n, o: pl.origin };
    }
    throw refErr('This reference is not a plane or a planar face.');
  }
  // a direction from a line ref or (failing that) a plane's normal
  function refDir(r, ctx, model) {
    if (r.plane != null || (r.sketch != null && r.entity == null)) return refPlane(r, ctx, model).n;
    if (r.face) { var f = refFace(r.face, ctx); return f.kind === 'plane' ? f.n : f.d; }
    return refLine(r, ctx, model).d;
  }
  // the drawn extent of an axis without one of its own: the part's box projected on it (or ±1 in / 25 mm)
  function axisExtent(o, d, ctx) {
    var bb = ctx.body && ctx.body.polygons && ctx.body.polygons.length ? ctx.body.getBounds() : null;
    var lo, hi;
    if (bb) {
      lo = Infinity; hi = -Infinity;
      for (var i = 0; i < 8; i++) { var c = [(i & 1 ? bb.max : bb.min)[0], (i & 2 ? bb.max : bb.min)[1], (i & 4 ? bb.max : bb.min)[2]], t = dot(sub(c, o), d); lo = Math.min(lo, t); hi = Math.max(hi, t); }
    } else { var L = ctx.units === 'in' ? 1 : 25; lo = -L; hi = L; }
    return { a: add(o, scale(d, lo)), b: add(o, scale(d, hi)) };
  }
  function lineLineClosest(L1, L2) {
    var w = sub(L1.o, L2.o), b = dot(L1.d, L2.d), den = 1 - b * b;
    if (den < 1e-12) return null;
    var d1 = dot(L1.d, w), d2 = dot(L2.d, w), s = (b * d2 - d1) / den, t = (d2 - b * d1) / den;
    return { p: add(L1.o, scale(L1.d, s)), q: add(L2.o, scale(L2.d, t)) };
  }
  function tidy3(v) { return v.map(function (x) { var r = Math.round(x * 1e9) / 1e9; return Math.abs(x - r) < 1e-12 ? r + 0 : x; }); }
  function resolveRefAxis(f, ctx, model) {
    var R = f.refs || [], o, d, ext = null;
    switch (f.kind || 'line') {
      case 'line': { if (!R[0]) throw refErr('Select a line, edge or axis.'); var L = refLine(R[0], ctx, model); o = L.o; d = L.d; if (L.a && L.b) ext = { a: L.a, b: L.b }; break; }
      case 'cyl': {
        if (!R[0] || !R[0].face) throw refErr('Select a cylindrical or conical face.');
        var F = refFace(R[0].face, ctx);
        if (F.kind !== 'cyl' && F.kind !== 'cone') throw refErr('The face is not cylindrical or conical.');
        var FA = faceAxis(F); o = FA.o; d = FA.d; ext = { a: FA.a, b: FA.b }; break;
      }
      case 'planes': {
        if (!R[0] || !R[1]) throw refErr('Select two planes or planar faces.');
        var P1 = refPlane(R[0], ctx, model), P2 = refPlane(R[1], ctx, model);
        d = cross(P1.n, P2.n);
        if (len(d) < 1e-9) throw refErr('The two planes are parallel: they do not intersect.');
        d = norm(d);
        // the point on both planes nearest the world origin: x = α n1 + β n2
        var w1 = dot(P1.n, P1.o), w2 = dot(P2.n, P2.o), c = dot(P1.n, P2.n), den = 1 - c * c;
        o = add(scale(P1.n, (w1 - c * w2) / den), scale(P2.n, (w2 - c * w1) / den));
        break;
      }
      case 'points': {
        if (!R[0] || !R[1]) throw refErr('Select two points or vertices.');
        var A = refPoint(R[0], ctx, model), B = refPoint(R[1], ctx, model);
        if (len(sub(B, A)) < REF_EPS) throw refErr('The two points are the same point.');
        o = A; d = norm(sub(B, A)); ext = { a: A, b: B }; break;
      }
      case 'pointFace': {
        if (!R[0] || !R[1]) throw refErr('Select a point and a plane or planar face.');
        var pt = refPoint(R[0], ctx, model), PL = refPlane(R[1], ctx, model);
        o = pt; d = PL.n.slice(); break;
      }
      default: throw refErr('Unknown axis type "' + f.kind + '".');
    }
    if (!ext) ext = axisExtent(o, d, ctx);
    return { refgeo: 'axis', o: tidy3(o), d: tidy3(norm(d)), a: tidy3(ext.a), b: tidy3(ext.b) };
  }
  function alongCurve(f, R, ctx, model) {
    var dist = +f.distance || 0, pts, arc = null;
    if (R[0].sketch != null) {
      var se = refSketch(R[0], ctx, model), e = se.e;
      if (R[0].seg != null) { var sd = polySide(e, R[0].seg); pts = [to3D(se.pl, sd[0][0], sd[0][1]), to3D(se.pl, sd[1][0], sd[1][1])]; }
      else if (e.t === 'line') pts = [to3D(se.pl, e.x1, e.y1), to3D(se.pl, e.x2, e.y2)];
      else if (e.t === 'arc' || e.t === 'circle') {
        var a0 = e.t === 'circle' ? 0 : e.a0 * Math.PI / 180, a1 = e.t === 'circle' ? 2 * Math.PI : e.a1 * Math.PI / 180;
        while (a1 <= a0) a1 += 2 * Math.PI;
        arc = { pl: se.pl, e: e, a0: a0, a1: a1 };
      } else throw refErr('Pick a sketch line or arc.');
    } else {
      var L = refLine(R[0], ctx, model);
      if (!L.a || !L.b) throw refErr('Pick a straight edge or a sketch line / arc.');
      pts = [L.a, L.b];
    }
    if (arc) {
      var total = arc.e.r * (arc.a1 - arc.a0), want = f.percent ? dist / 100 * total : dist;
      if (want < -1e-9 || want > total + 1e-9) throw refErr('The distance is off the end of the curve (its length is ' + Math.round(total * 1e4) / 1e4 + ').');
      var an = f.reverse ? arc.a1 - want / arc.e.r : arc.a0 + want / arc.e.r;
      return to3D(arc.pl, arc.e.cx + arc.e.r * Math.cos(an), arc.e.cy + arc.e.r * Math.sin(an));
    }
    if (f.reverse) pts = pts.slice().reverse();
    var Ln = len(sub(pts[1], pts[0])), w2 = f.percent ? dist / 100 * Ln : dist;
    if (w2 < -1e-9 || w2 > Ln + 1e-9) throw refErr('The distance is off the end of the curve (its length is ' + Math.round(Ln * 1e4) / 1e4 + ').');
    return add(pts[0], scale(sub(pts[1], pts[0]), Ln > 0 ? w2 / Ln : 0));
  }
  function resolveRefPoint(f, ctx, model) {
    var R = f.refs || [], p;
    switch (f.kind || 'on') {
      case 'arc': {
        if (!R[0]) throw refErr('Select a circular edge or a sketch arc / circle.');
        if (R[0].edge) { var ed = refEdge(R[0].edge, ctx); if (!ed.circle) throw refErr('The edge is not circular.'); p = ed.circle.c; }
        else if (R[0].sketch != null) { var s = refSketch(R[0], ctx, model); if (s.e.cx == null) throw refErr('Pick a sketch arc or circle.'); p = to3D(s.pl, s.e.cx, s.e.cy); }
        else if (R[0].face) { var cf = refFace(R[0].face, ctx); if (cf.kind === 'plane') throw refErr('Pick a circular edge, not a flat face.'); p = cf.o; }
        else throw refErr('Select a circular edge or a sketch arc / circle.');
        break;
      }
      case 'face': {
        if (!R[0] || !R[0].face) throw refErr('Select a face.');
        p = polysCentroid(refFace(R[0].face, ctx).polys);
        if (!p) throw refErr('The face has no area.');
        break;
      }
      case 'intersect': {
        if (!R[0] || !R[1]) throw refErr('Select two edges, lines or axes.');
        var cl = lineLineClosest(refLine(R[0], ctx, model), refLine(R[1], ctx, model));
        if (!cl) throw refErr('The two are parallel: they do not intersect.');
        if (len(sub(cl.p, cl.q)) > refTol(ctx)) throw refErr('The two do not intersect (they pass ' + Math.round(len(sub(cl.p, cl.q)) * 1000) / 1000 + ' apart).');
        p = scale(add(cl.p, cl.q), 0.5);
        break;
      }
      case 'project': {
        if (!R[0] || !R[1]) throw refErr('Select a point and a plane or face to project it onto.');
        var q = refPoint(R[0], ctx, model), PL = refPlane(R[1], ctx, model);
        p = sub(q, scale(PL.n, dot(sub(q, PL.o), PL.n)));
        break;
      }
      case 'on': { if (!R[0]) throw refErr('Select a point, vertex or sketch point.'); p = refPoint(R[0], ctx, model); break; }
      case 'along': { if (!R[0]) throw refErr('Select an edge or a sketch line / arc.'); p = alongCurve(f, R, ctx, model); break; }
      default: throw refErr('Unknown point type "' + f.kind + '".');
    }
    return { refgeo: 'point', p: tidy3(p) };
  }
  function resolveCsys(f, ctx, model) {
    var o = f.origin ? refPoint(f.origin, ctx, model) : [0, 0, 0];
    function dir(r, flip) { if (!r) return null; var v = norm(refDir(r, ctx, model)); return flip ? scale(v, -1) : v; }
    function ortho(a, b) { var c = sub(b, scale(a, dot(a, b))); if (len(c) < 1e-9) throw refErr('Two of the coordinate system directions are parallel.'); return norm(c); }
    // a direction perpendicular to v, from the world axis least along it
    function perp(v) { var w = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].sort(function (p, q) { return Math.abs(dot(p, v)) - Math.abs(dot(q, v)); })[0]; return ortho(v, w); }
    var X = dir(f.x, f.flipX), Y = dir(f.y, f.flipY), Z = dir(f.z, f.flipZ);
    if (X && Y) { Y = ortho(X, Y); Z = cross(X, Y); }
    else if (X && Z) { Z = ortho(X, Z); Y = cross(Z, X); }
    else if (Y && Z) { Z = ortho(Y, Z); X = cross(Y, Z); }
    else if (X) { Y = perp(X); if (f.flipY) Y = scale(Y, -1); Z = cross(X, Y); }
    else if (Y) { Z = perp(Y); if (f.flipZ) Z = scale(Z, -1); X = cross(Y, Z); }
    else if (Z) { X = perp(Z); if (f.flipX) X = scale(X, -1); Y = cross(Z, X); }
    else { X = [f.flipX ? -1 : 1, 0, 0]; Y = [0, f.flipY ? -1 : 1, 0]; Z = cross(X, Y); }
    X = tidy3(X); Y = tidy3(Y); Z = tidy3(Z); o = tidy3(o);
    return { refgeo: 'csys', origin: o, x: X, y: Y, z: Z, n: Z, offset: dot(Z, o), custom: true };
  }
  function resolveRefGeo(f, model, ctx) {
    if (f.type === 'refaxis') return resolveRefAxis(f, ctx, model);
    if (f.type === 'refpoint') return resolveRefPoint(f, ctx, model);
    if (f.type === 'csys') return resolveCsys(f, ctx, model);
    throw refErr('Not a reference geometry feature.');
  }
  // a revolve about a reference axis: the axis must lie in the sketch plane; the revolve gets it as a 2D line
  function revolveOnRefAxis(f, ax, plane, ctx) {
    var tol = Math.max(1e-6, refTol(ctx || {}) * 1e-3);
    if (Math.abs(dot(ax.d, plane.n)) > 1e-6 || Math.abs(dot(sub(ax.o, plane.origin), plane.n)) > tol) throw refErr('The reference axis must lie in the sketch plane.');
    var p = to2D(plane, ax.o), q = to2D(plane, add(ax.o, ax.d)), g = {};
    Object.keys(f).forEach(function (k) { g[k] = f[k]; });
    g.axis = { x1: p[0], y1: p[1], x2: q[0], y2: q[1] };
    delete g.axisRef;
    return g;
  }
  // reporting in a Coordinate System record: a world point / direction -> its coordinates in the system
  function toCsys(cs, p) { var v = sub(p, cs.origin); return [dot(v, cs.x), dot(v, cs.y), dot(v, cs.z)]; }
  function dirToCsys(cs, v) { return [dot(v, cs.x), dot(v, cs.y), dot(v, cs.z)]; }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.sketchPath = sketchPath; K.buildSweep = buildSweep; K.buildLoft = buildLoft; K.resolveFaces = resolveFaces; K.buildShell = buildShell;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  K.resolveRefGeo = resolveRefGeo; K.toCsys = toCsys; K.dirToCsys = dirToCsys; _.resolveRefGeo = resolveRefGeo; _.revolveOnRefAxis = revolveOnRefAxis;   // lane CZ
  _.buildLoft = buildLoft; _.buildShell = buildShell; _.buildSweep = buildSweep; _.faceLoopsClassified = faceLoopsClassified;
})(Kernel, Kernel._);
