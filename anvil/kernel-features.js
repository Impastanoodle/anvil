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
    var removed = resolveFaces(f.faces || [], mesh, Math.max(0.5, T / 2));
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


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.sketchPath = sketchPath; K.buildSweep = buildSweep; K.buildLoft = buildLoft; K.resolveFaces = resolveFaces; K.buildShell = buildShell;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.buildLoft = buildLoft; _.buildShell = buildShell; _.buildSweep = buildSweep; _.faceLoopsClassified = faceLoopsClassified;
})(Kernel, Kernel._);
