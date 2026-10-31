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

  // lane FH2: a path sketch of lines and true arcs as pieces, chained end to end: [{ kind: 'line' | 'arc', a, b (3D),
  // C, D, ang (arcs: centre, unit axis, signed angle in radians, so rotating a about (C, D) by ang gives b) }], or
  // null when the sketch holds anything else (splines, ellipses, closed entities, construction-free points) or no arc
  // (the polyline sweep then runs as before).
  function sketchPathPieces(sketch, plane) {
    var raw = [], other = false, arcs = 0;
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'text' || e.t === 'point' || K.noProfileEntity(sketch, e)) return;
      if (e.t === 'line') raw.push({ kind: 'line', a: [e.x1, e.y1], b: [e.x2, e.y2] });
      else if (e.t === 'polyline' && !e.closed) for (var i = 0; i + 1 < e.pts.length; i++) raw.push({ kind: 'line', a: e.pts[i].slice(0, 2), b: e.pts[i + 1].slice(0, 2) });
      else if (e.t === 'arc' && Math.abs(e.a1 - e.a0) > 1e-9 && Math.abs(e.a1 - e.a0) < 360 - 1e-9) {
        var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180;
        raw.push({ kind: 'arc', c: [e.cx, e.cy], a: [e.cx + e.r * Math.cos(s0), e.cy + e.r * Math.sin(s0)], b: [e.cx + e.r * Math.cos(s1), e.cy + e.r * Math.sin(s1)], ang: s1 - s0 });
        arcs++;
      } else other = true;
    });
    if (other || !arcs || !raw.length) return null;
    raw = raw.filter(function (p) { return Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) > 1e-9; });
    function rev(p) { return { kind: p.kind, c: p.c, a: p.b, b: p.a, ang: -p.ang }; }
    var chain = [raw.shift()], guard = 0;
    while (raw.length && guard++ < 1000) {
      var head = chain[0].a, tail = chain[chain.length - 1].b, found = false;
      for (var k = 0; k < raw.length && !found; k++) {
        var p = raw[k];
        if (key2(p.a) === key2(tail)) { chain.push(p); found = true; }
        else if (key2(p.b) === key2(tail)) { chain.push(rev(p)); found = true; }
        else if (key2(p.b) === key2(head)) { chain.unshift(p); found = true; }
        else if (key2(p.a) === key2(head)) { chain.unshift(rev(p)); found = true; }
        if (found) raw.splice(k, 1);
      }
      if (!found) return null;   // a disconnected piece: the polyline sweep reports it
    }
    return chain.map(function (p) {
      var o = { kind: p.kind, a: to3D(plane, p.a[0], p.a[1]), b: to3D(plane, p.b[0], p.b[1]) };
      if (p.kind === 'arc') {
        o.C = to3D(plane, p.c[0], p.c[1]); o.D = norm(cross(plane.x, plane.y)); o.ang = p.ang;
        if (len(sub(rotatePoint(o.a, o.C, o.D, o.ang), o.b)) > 1e-6 * Math.max(1, len(sub(o.a, o.C)))) o.ang = -o.ang;
      }
      return o;
    });
  }
  function pieceDir(p, end) {
    if (p.kind === 'line') return norm(sub(p.b, p.a));
    return scale(norm(cross(p.D, sub(end ? p.b : p.a, p.C))), p.ang < 0 ? -1 : 1);
  }
  // Sweep along line / arc pieces joined tangentially: each line piece is a prism of the section, each arc piece a
  // revolve of it about the arc's axis, so the end caps lie in the path's end planes (normal to the true tangent) and
  // the walls carry true-surface records (cylinders along lines, tori along arcs: the volume is exact, Pappus).
  // Returns null (the caller falls back to the chord-polyline sweep) when a join is not tangent or the path closes.
  function sweepAlongPieces(f, pieces, profile, profPlane) {
    var i, n = pieces.length;
    for (i = 1; i < n; i++) if (dot(pieceDir(pieces[i - 1], true), pieceDir(pieces[i], false)) < 1 - 1e-9) return null;
    if (n > 1 && len(sub(pieces[n - 1].b, pieces[0].a)) < 1e-6) return null;
    var c0 = loopCentroid3(profile.loops[0].pts.map(function (p) { return to3D(profPlane, p[0], p[1]); }));
    if (len(sub(pieces[n - 1].b, c0)) < len(sub(pieces[0].a, c0))) {
      pieces = pieces.slice().reverse().map(function (p) { return { kind: p.kind, a: p.b, b: p.a, C: p.C, D: p.D, ang: -p.ang }; });
    }
    var d0 = pieceDir(pieces[0], false), J0 = pieces[0].a;
    var nSign = dot(profPlane.n, d0) < 0 ? -1 : 1;
    var rot0 = rotationTo(scale(profPlane.n, nSign), d0);
    // the section frame: the profile's own 2D coordinates stay valid in it (rigid motion of the profile plane)
    var F = { origin: add(J0, rot0(sub(profPlane.origin, J0))), x: rot0(profPlane.x), y: rot0(profPlane.y), n: rot0(profPlane.n) };
    function cvOf(l) { return l.seg && profile.curves ? l.seg.map(function (k) { return k >= 0 ? profile.curves[k] : null; }) : null; }
    var perLoop = profile.loops.map(function () { return []; });
    pieces.forEach(function (p) {
      if (p.kind === 'line') {
        var L = len(sub(p.b, p.a));
        profile.loops.forEach(function (l, k) { perLoop[k].push(_.prism(l.pts, F, 0, L * nSign, f.id, cvOf(l))); });
        F = { origin: add(F.origin, sub(p.b, p.a)), x: F.x, y: F.y, n: F.n };
        return;
      }
      // the section plane holds the arc's axis: express the loops in a frame (radial e, axis D) and revolve them
      var e = sub(p.a, p.C); e = norm(sub(e, scale(p.D, dot(e, p.D))));
      var R = { origin: p.C, x: e, y: p.D, n: cross(e, p.D) };
      function map2(u, v) { return to2D(R, to3D(F, u, v)); }
      var deg = Math.abs(p.ang) * 180 / Math.PI;
      profile.loops.forEach(function (l, k) {
        var curves = (profile.curves || []).map(function (C) {
          if (!C) return C;
          var o = {}; Object.keys(C).forEach(function (key) { o[key] = C[key]; });
          o.c = map2(C.c[0], C.c[1]);
          return o;
        });
        var fake = { profile: { loops: [{ pts: l.pts.map(function (q) { return map2(q[0], q[1]); }), hole: false, seg: l.seg }], curves: curves }, entities: [] };
        perLoop[k].push(_.buildRevolve({ id: f.id, angle: deg, reverse: p.ang < 0, axis: { x1: 0, y1: 0, x2: 0, y2: 1 } }, fake, R));
      });
      function rot(v) { return rotatePoint(v, [0, 0, 0], p.D, p.ang); }
      F = { origin: rotatePoint(F.origin, p.C, p.D, p.ang), x: rot(F.x), y: rot(F.y), n: rot(F.n) };
    });
    if (!profile.loops.some(function (l) { return !l.hole; })) throw new Error('Sweep profile has no outer loop.');
    // rfFJ: each piece is made hollow on its own (its outer loops less its holes), then the pieces are joined. Joining
    // all the outers and subtracting all the holes in one boolean lost a sliver (3.7e-8 of a tube's 0.848, the raw
    // facets too, not the curve correction) once the 12° angular limit gave the bore and the outside the same 32
    // section chords on the same rays; every piece less its own bore, and the hollow pieces' union, stay exact.
    var hollow = pieces.map(function (p, i) {
      var outs = [], hs = [];
      perLoop.forEach(function (parts, k) { (profile.loops[k].hole ? hs : outs).push(parts[i]); });
      var s = CSG.fromPolygons([].concat.apply([], outs.map(function (o) { return o.polygons; })));
      return hs.length ? s.subtract(unionAll(hs)) : s;
    });
    return unionTree(hollow);
  }

  function buildSweep(f, model, ctx) {
    var prof = ctx.sketches[f.profile] || findFeature(model, f.profile);
    if (!prof || prof.type !== 'sketch') throw new Error('Select a profile sketch for the sweep.');
    var profPlane = resolvePlane(prof.plane, model, ctx.planes);
    var profile = prof.profile || sketchProfile(prof);
    if (!profile.loops.length) throw new Error('Sweep profile sketch has no closed profile.');
    checkProfile(profile);
    var path, cpath = null;
    if (Array.isArray(f.path)) {
      path = f.path.map(function (p) { return [+p[0], +p[1], +p[2]]; });
      path.forEach(function (p) { if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) throw new Error('Every sweep path coordinate must be a number.'); });
    } else if (isCurveFeature(findFeature(model, f.path))) {   // rfFA: a reference curve (helix, projected, composite, …)
      cpath = _.curveSweepPath(f.path, ctx); path = cpath.pts;
    } else {
      var ps = ctx.sketches[f.path] || findFeature(model, f.path);
      if (!ps || ps.type !== 'sketch') throw new Error('Select a path sketch for the sweep.');
      var info = {}, psPlane = resolvePlane(ps.plane, model, ctx.planes);
      // lane FH2: true arcs in the path (the legacy tessellation keeps the chord sweep, so its pinned volumes hold)
      var pieces = _.TESS && _.TESS.legacy ? null : sketchPathPieces(ps, psPlane);
      var exact = pieces && sweepAlongPieces(f, pieces, profile, profPlane);
      if (exact) return exact;
      path = sketchPath(ps, psPlane, info);
      if (info.dropped && ctx.warnings) ctx.warnings[f.id] = info.dropped + ' path ' + (info.dropped === 1 ? 'entity does' : 'entities do') + ' not connect to the path and ' + (info.dropped === 1 ? 'was' : 'were') + ' ignored.';
    }
    var pts = [path[0]];
    for (var i = 1; i < path.length; i++) if (len(sub(path[i], pts[pts.length - 1])) > 1e-6) pts.push(path[i]);
    if (pts.length < 2) throw new Error('Sweep path needs at least two distinct points.');
    // the path starts at the end nearest the profile
    var c0 = loopCentroid3(profile.loops[0].pts.map(function (p) { return to3D(profPlane, p[0], p[1]); }));
    var flipped = len(sub(pts[pts.length - 1], c0)) < len(sub(pts[0], c0));
    if (flipped) pts.reverse();
    var dirs = [];
    for (i = 0; i + 1 < pts.length; i++) dirs.push(norm(sub(pts[i + 1], pts[i])));
    // a closed path (a closed polyline, or a chain back to its start) mitres its start / end joint like every other
    // corner; with flat ends there the tube had a notch on the outside of that corner (−2 % on a rectangular ring)
    var closed = dirs.length > 2 && len(sub(pts[pts.length - 1], pts[0])) < 1e-6;
    var joint = closed && len(add(dirs[dirs.length - 1], dirs[0])) > 1e-9 ? { v: pts[0], n: norm(add(dirs[dirs.length - 1], dirs[0])) } : null;
    // place the profile perpendicular to the first segment, pivoting about the path start
    var J0 = pts[0], A0 = cpath ? (flipped ? cpath.end : cpath.start) : J0;   // rfFA: the profile keeps its offset from the true curve end
    var nSign = dot(profPlane.n, dirs[0]) < 0 ? -1 : 1;
    var rot0 = rotationTo(scale(profPlane.n, nSign), dirs[0]);
    var sections = profile.loops.map(function (l) {
      return { hole: l.hole, pts: (cpath ? _.areaTrueLoop(l, profile) : l.pts).map(function (p) { return add(J0, rot0(sub(to3D(profPlane, p[0], p[1]), A0))); }) };
    });
    var perLoop = sections.map(function () { return []; });
    // rfFN: a path that doubles back, or a corner tighter than the profile (the mitre planes at the two ends of a
    // segment cross inside the section), would sweep a self-intersecting solid (open edges): refuse it as SolidWorks does
    for (i = 1; i < dirs.length; i++) if (dot(dirs[i - 1], dirs[i]) < -1 + 1e-9) throw new Error('The sweep path turns back on itself. Sweep paths cannot fold back along their own line.');
    if (closed && dot(dirs[dirs.length - 1], dirs[0]) < -1 + 1e-9) throw new Error('The sweep path turns back on itself. Sweep paths cannot fold back along their own line.');
    function sweepFits(s, i, L, capA, capB) {
      var d = dirs[i], o = pts[i];
      for (var k = 0; k < s.pts.length; k++) {
        var w = sub(s.pts[k], o), q = sub(w, scale(d, dot(w, d)));
        var tA = capA ? -dot(q, capA.n) / dot(d, capA.n) : 0, tB = L - (capB ? dot(q, capB.n) / dot(d, capB.n) : 0);
        if (!(tB - tA > 1e-9 * Math.max(1, L))) return false;
      }
      return true;
    }
    for (i = 0; i < dirs.length; i++) {
      if (i > 0) {
        var R = rotationTo(dirs[i - 1], dirs[i]);
        sections = sections.map(function (s) { return { hole: s.hole, pts: s.pts.map(function (p) { return add(pts[i], R(sub(p, pts[i - 1]))); }) }; });
      }
      var L = len(sub(pts[i + 1], pts[i]));
      var capA = i > 0 ? { v: pts[i], n: norm(add(dirs[i - 1], dirs[i])) } : joint;
      var capB = i + 1 < dirs.length ? { v: pts[i + 1], n: norm(add(dirs[i], dirs[i + 1])) } : joint;
      sections.forEach(function (s) { if (!s.hole && !sweepFits(s, i, L, capA, capB)) throw new Error('The sweep would intersect itself: the path turns more tightly than the profile allows at a corner. Lengthen the path segment or use a smaller profile.'); });
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

  // lane FH2: SolidWorks' loft between a polygon and a full circle (two sections, no start / end constraints), measured
  // over its API on a 2 × 2 square → r 1 circle (head-tools/sw-reference/solids_loft.py): straight rulings between
  // the two profiles, each polygon side matched to one arc of the circle split at the directions of the polygon's
  // corners from the circle's centre; the side is parametrized uniformly, the arc as SolidWorks' rational quadratic
  // (weight cos(half span)), so u ↔ θ with tan((θ − mid) / 2) = tan(half span / 2)·(2u − 1). The hull loft (the
  // convex hull of the two sections) is 3.8 % bigger on that part. Returns { loops, tris } like hullLoftLoops, or
  // null when the pair is not one polygon and one full circle on parallel planes.
  function circleOf(sec) {
    var l = sec.loop, seg = l.seg, C = seg && seg.length && seg[0] >= 0 && seg.every(function (k) { return k === seg[0]; }) ? (sec.prof.curves || [])[seg[0]] : null;
    return C && C.full ? C : null;
  }
  function blendLoftLoops(secs) {
    if (secs.length !== 2) return null;
    var ci = circleOf(secs[0]) ? 0 : circleOf(secs[1]) ? 1 : -1;
    if (ci < 0 || circleOf(secs[1 - ci])) return null;
    var cs = secs[ci], ps = secs[1 - ci], C = circleOf(cs), pl = cs.plane;
    if (Math.abs(dot(pl.n, ps.plane.n)) < 1 - 1e-9) return null;
    if (ps.loop.seg && ps.loop.seg.some(function (k) { return k >= 0; })) return null;   // a polygon: straight sides only
    var O = to3D(pl, C.c[0], C.c[1]), hgt = dot(sub(loopCentroid3(ps.pts), O), pl.n);
    if (Math.abs(hgt) < 1e-9) return null;
    // the polygon's corners (collinear points dropped) CCW about the circle plane's normal, with their angles
    var P = ps.pts.slice(), p2 = P.map(function (p) { return to2D(pl, p); });
    if (signedArea(p2) < 0) { P.reverse(); p2.reverse(); }
    var corners = [];
    for (var i = 0; i < P.length; i++) {
      var a = p2[(i + P.length - 1) % P.length], b = p2[i], c = p2[(i + 1) % P.length];
      var cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) > 1e-12 * (1 + Math.abs(b[0]) + Math.abs(b[1]))) corners.push({ p: P[i], th: Math.atan2(b[1] - C.c[1], b[0] - C.c[0]) });
    }
    var n = corners.length;
    if (n < 3) return null;
    // angles increasing around the circle, each span under 180°
    var th = corners.map(function (q) { return q.th; });
    for (i = 1; i < n; i++) { while (th[i] <= th[i - 1]) th[i] += Math.PI * 2; }
    if (th[n - 1] - th[0] >= Math.PI * 2 - 1e-9) return null;
    th.push(th[0] + Math.PI * 2);
    for (i = 0; i < n; i++) if (th[i + 1] - th[i] >= Math.PI - 1e-9 || th[i + 1] - th[i] < 1e-9) return null;
    // samples: at least the sketch's own chord density and 1.5° steps (the chords then cost 5e-5 of the volume on the
    // square → circle), at least 8 per side
    var step = Math.min(Math.PI * 2 / Math.max(3, cs.pts.length), Math.PI / 120);
    var Lp = [], Lc = [];
    for (i = 0; i < n; i++) {
      var t0 = th[i], t1 = th[i + 1], half = (t1 - t0) / 2, mid = (t0 + t1) / 2, m = Math.max(8, Math.ceil((t1 - t0) / step));
      var A = corners[i].p, B = corners[(i + 1) % n].p;
      for (var k = 0; k < m; k++) {
        var t = t0 + (t1 - t0) * k / m, u = (Math.tan((t - mid) / 2) / Math.tan(half / 2) + 1) / 2;
        Lc.push(to3D(pl, C.c[0] + C.r * Math.cos(t), C.c[1] + C.r * Math.sin(t)));
        Lp.push(add(A, scale(sub(B, A), u)));
      }
    }
    // rows along the rulings too: the surface twists along each ruling (it is not developable), and strips of two long
    // triangles each would keep a fixed area error however fine the samples (+1.7 % on the square → circle)
    var N = Lc.length, tris = [], ROWS = 8, rows = [];
    for (var r = 0; r <= ROWS; r++) rows.push(r === 0 ? Lp : r === ROWS ? Lc : Lp.map(function (p, q) { return add(p, scale(sub(Lc[q], p), r / ROWS)); }));
    for (r = 0; r < ROWS; r++) {
      var R0 = rows[r], R1 = rows[r + 1];
      for (k = 0; k < N; k++) {
        var j = (k + 1) % N;
        tris.push([R0[k], R0[j], R1[j]]);
        tris.push([R0[k], R1[j], R1[k]]);
      }
    }
    var loops = ci === 0 ? [Lc, Lp] : [Lp, Lc];
    // the loops run CCW about the circle plane's normal n; [p0, p1, q0] faces out when the polygon (p) lies below the
    // circle (q) along n, as in hullLoftLoops
    var polyBelow = dot(sub(loopCentroid3(Lc), loopCentroid3(Lp)), pl.n) > 0;
    if (!polyBelow) tris.forEach(function (tr) { tr.reverse(); });
    return { loops: loops, tris: tris };
  }

  // lane FX: a loft through full circles on parallel planes with their centres on one line along the planes' normal is
  // a stack of cone frusta (a cylinder where two radii are equal), SolidWorks' and OpenCascade's ruled loft between
  // them: every side facet (its corners lie on the circles, so on the cone) gets the frustum's record { t: 'cone', o,
  // d, r, k } (radius r + k·z, z = (x − o)·d) or { t: 'cyl' }, so massProps integrates the chords out to the true
  // surface (the Funnel's cone), shading is smooth and the rims are true circles. Polygons are tagged in place.
  function loftAxisRecords(secs, polys) {
    var cs = secs.map(circleOf);
    if (cs.some(function (C) { return !C; })) return;
    var n0 = secs[0].plane.n, O = to3D(secs[0].plane, cs[0].c[0], cs[0].c[1]), last = to3D(secs[secs.length - 1].plane, cs[cs.length - 1].c[0], cs[cs.length - 1].c[1]);
    var span = len(sub(last, O));
    if (!(span > 1e-12)) return;
    var d = scale(sub(last, O), 1 / span), zs = [], recs = [];
    if (Math.abs(Math.abs(dot(d, n0)) - 1) > 1e-9) return;
    for (var i = 0; i < secs.length; i++) {
      var Ci = to3D(secs[i].plane, cs[i].c[0], cs[i].c[1]), z = dot(sub(Ci, O), d);
      if (Math.abs(Math.abs(dot(secs[i].plane.n, n0)) - 1) > 1e-9 || len(sub(Ci, add(O, scale(d, z)))) > 1e-9 * Math.max(1, span)) return;
      if (i && !(z > zs[i - 1] + 1e-12 * span)) return;
      zs.push(z);
    }
    for (i = 0; i + 1 < secs.length; i++) {
      var r0 = cs[i].r, r1 = cs[i + 1].r, k = (r1 - r0) / (zs[i + 1] - zs[i]);
      recs.push(Math.abs(r1 - r0) <= 1e-12 * Math.max(r0, r1) ? { s: { t: 'cyl', o: O.slice(), d: d.slice(), r: r0 } } : { s: { t: 'cone', o: O.slice(), d: d.slice(), r: r0 - k * zs[i], k: k } });
    }
    var tol = 1e-9 * Math.max(1, span);
    polys.forEach(function (p) {
      var lo = Infinity, hi = -Infinity;
      p.vertices.forEach(function (v) { var z = dot(sub([v.pos.x, v.pos.y, v.pos.z], O), d); lo = Math.min(lo, z); hi = Math.max(hi, z); });
      if (!(hi - lo > tol)) return;   // a cap
      for (var j = 0; j + 1 < zs.length; j++) if (lo >= zs[j] - tol && hi <= zs[j + 1] + tol) { p.surf = recs[j]; return; }
    });
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
      return { plane: pl, pts: outers[0].pts.map(function (p) { return to3D(pl, p[0], p[1]); }), loop: outers[0], prof: prof };
    });
    // rfFN: two consecutive profiles in one plane loft to a flat, zero-volume sheet (was: a body of volume 0)
    for (var c = 0; c + 1 < secs.length; c++) {
      var pa = secs[c].plane, sb = secs[c + 1].pts, off = 0, ext = 0;
      sb.forEach(function (q) { off = Math.max(off, Math.abs(dot(sub(q, pa.origin), pa.n))); ext = Math.max(ext, len(sub(q, pa.origin))); });
      if (off <= 1e-9 * Math.max(1, ext)) throw new Error('Loft profiles ' + (c + 1) + ' and ' + (c + 2) + ' lie in the same plane: zero-thickness geometry would result. Put each profile on its own plane.');
    }
    // rfFN2: a profile with points on both sides of its neighbour's plane makes the side surface reach that
    // neighbour's cap from both sides, so the loft folds over the cap and intersects itself (a Top rectangle lofted to
    // a Front octagon centred on the Top plane). Profiles that only touch the other plane are fine (an elbow).
    for (c = 0; c + 1 < secs.length; c++) {
      [[c, c + 1], [c + 1, c]].forEach(function (pr) {
        var pl = secs[pr[0]].plane, pts = secs[pr[1]].pts, lo = 0, hi = 0, span = 0;
        pts.forEach(function (q) { var h = dot(sub(q, pl.origin), pl.n); lo = Math.min(lo, h); hi = Math.max(hi, h); span = Math.max(span, len(sub(q, pl.origin))); });
        var tol = 1e-7 * Math.max(1, span);
        if (lo < -tol && hi > tol) throw new Error('The loft would intersect itself: profile ' + (pr[1] + 1) + ' lies on both sides of the plane of profile ' + (pr[0] + 1) + '. Move the profiles so that each one lies to one side of the next one\'s plane.');
      });
    }
    var polys = [], loops, i;
    var hull = blendLoftLoops(secs) || hullLoftLoops(secs);
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
    loftAxisRecords(secs, polys);
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

  // rfFN2: untangleLoop(pts) -> the simple loops of a self-intersecting closed polyline that keep its orientation.
  // Offsetting a concave run (a hole that bites shallowly into a face's edge) outward by more than its depth crosses the
  // offset edges and leaves an inverted "swallowtail"; a prism over that loop is self-intersecting and every boolean
  // with it cracks (a shell of a hexagon whose hole broke a side wall had 45 open edges). The loop is split at its first
  // crossing into two loops, recursively; pieces wound against the original (the swallowtails) and slivers are dropped.
  function segCross(p, q, r, s) {
    var d1 = [q[0] - p[0], q[1] - p[1]], d2 = [s[0] - r[0], s[1] - r[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
    var L1 = d1[0] * d1[0] + d1[1] * d1[1], L2 = d2[0] * d2[0] + d2[1] * d2[1];
    if (Math.abs(den) <= 1e-12 * Math.sqrt(L1 * L2)) {
      // parallel: two collinear runs lying over each other (a clamped mitre folding back along an edge) cross at the
      // middle of their overlap
      if (!L1 || !L2) return null;
      var wr = [r[0] - p[0], r[1] - p[1]];
      if (Math.abs(wr[0] * d1[1] - wr[1] * d1[0]) > 1e-9 * L1) return null;
      var tr = (wr[0] * d1[0] + wr[1] * d1[1]) / L1, ts = ((s[0] - p[0]) * d1[0] + (s[1] - p[1]) * d1[1]) / L1;
      var lo = Math.max(0, Math.min(tr, ts)), hi = Math.min(1, Math.max(tr, ts));
      if (hi - lo <= 1e-9) return null;
      var tm = (lo + hi) / 2;
      return [p[0] + d1[0] * tm, p[1] + d1[1] * tm];
    }
    var w = [r[0] - p[0], r[1] - p[1]], t = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den;
    if (t <= 1e-12 || t >= 1 - 1e-12 || u <= 1e-12 || u >= 1 - 1e-12) return null;
    return [p[0] + d1[0] * t, p[1] + d1[1] * t];
  }
  function untangleLoop(pts, sign, depth) {
    var n = pts.length;
    if (sign == null) sign = signedArea(pts) >= 0 ? 1 : -1;
    if (n < 3) return [];
    for (var i = 0; i < n && (depth || 0) < 64; i++) {
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;   // neighbours through the closing edge
        var X = segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]);
        if (!X) continue;
        var A = pts.slice(0, i + 1).concat([X], pts.slice(j + 1)), B = [X].concat(pts.slice(i + 1, j + 1));
        return untangleLoop(A, sign, (depth || 0) + 1).concat(untangleLoop(B, sign, (depth || 0) + 1));
      }
    }
    var ar = signedArea(pts);
    return ar * sign > 1e-9 ? [pts] : [];
  }
  _.untangleLoop = untangleLoop; _.offsetLoopVar = offsetLoopVar;
  // the pieces of an untangled loop minus the ones lying inside a bigger piece (a clamped mitre can fold a piece back
  // inside the outline: winding 2, and a prism over it shares a face with the big one -> non-manifold edges)
  function onOrIn(p, loop, eps) {
    if (pointInPoly(p, loop)) return true;
    for (var i = 0; i < loop.length; i++) {
      var a = loop[i], b = loop[(i + 1) % loop.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      var t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
      if (Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]) <= eps) return true;
    }
    return false;
  }
  function outerPieces(pieces) {
    var byArea = pieces.slice().sort(function (p, q) { return Math.abs(signedArea(q)) - Math.abs(signedArea(p)); }), kept = [];
    byArea.forEach(function (pc) {
      var span = 0; pc.forEach(function (q) { span = Math.max(span, Math.abs(q[0]), Math.abs(q[1])); });
      var eps = 1e-9 * Math.max(1, span);
      if (!kept.some(function (k) { return pc.every(function (q) { return onOrIn(q, k, eps); }); })) kept.push(pc);
    });
    return kept;
  }
  function loopSelfCrosses(pts) {
    var n = pts.length;
    for (var i = 0; i < n; i++) for (var j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
    return false;
  }

  // Prism over a face's loops: outer loops grown and holes shrunk by growFor(loop) (per-edge distances; holes that
  // collapse are dropped), from plane offset a to b along the face normal.
  // rfFS: a run of a loop offset by exactly its half width (a 4 wide slot in a face shelled 2 thick, a notch as wide as
  // 2T) collapses onto its centre line: the loop runs out along it and back, a spike of width ~1e-15 that segCross does
  // not see and a prism over it is non-manifold (fuzz: shells after slots had 26 open / 14 non-manifold edges in one
  // slab). Repeatedly drop repeated points and vertices where the loop turns straight back within eps.
  function dropSpikes(pts, eps) {
    var out = pts.slice(), changed = true;
    while (changed && out.length >= 3) {
      changed = false;
      for (var i = 0; i < out.length && out.length >= 3; i++) {
        var n = out.length, a = out[(i + n - 1) % n], p = out[i], c = out[(i + 1) % n];
        var u = [p[0] - a[0], p[1] - a[1]], v = [c[0] - p[0], c[1] - p[1]], lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
        var back = lu > eps && lv > eps && u[0] * v[0] + u[1] * v[1] < 0 && Math.abs(u[0] * v[1] - u[1] * v[0]) <= eps * (lu + lv);
        if (lu <= eps || back) { out.splice(i, 1); changed = true; i--; }
      }
    }
    return out.length >= 3 ? out : [];
  }
  _.dropSpikes = dropSpikes;
  function slabSolid(o, growFor, a, b, tag) {
    var cl = faceLoopsClassified(o), prisms = [], holes = [];
    var span = 1;
    o.loops.forEach(function (l) { l.forEach(function (q) { span = Math.max(span, Math.abs(q[0]), Math.abs(q[1])); }); });
    var spikeEps = 1e-9 * span;
    cl.outers.forEach(function (l) {
      var g = dropSpikes(offsetLoopVar(l, growFor(l, false)), spikeEps);
      if (g.length < 3) return;
      var gs = loopSelfCrosses(g) ? outerPieces(untangleLoop(g, signedArea(l) >= 0 ? 1 : -1)) : [g];   // rfFN2
      gs.forEach(function (gp) { if (signedArea(gp) > 1e-9) prisms.push(prism(gp, o.plane, a, b, tag)); });
    });
    cl.holes.forEach(function (l) {
      var g = dropSpikes(offsetLoopVar(l, growFor(l, true).map(function (d) { return -d; })), spikeEps);   // (hole: reversed to CCW, the face lies to its right)
      if (g.length < 3) return;
      var gs = loopSelfCrosses(g) ? outerPieces(untangleLoop(g, signedArea(l) >= 0 ? 1 : -1)) : [g];   // rfFN2
      gs.forEach(function (gp) { if (signedArea(gp) > 1e-9 && signedArea(gp) < signedArea(l)) holes.push(prism(gp, o.plane, a - 0.01, b + 0.01, tag)); });
    });
    if (!prisms.length) return null;
    var solid = prisms.length === 1 ? prisms[0] : unionAll(prisms);
    if (holes.length) solid = solid.subtract(unionAll(holes));
    return solid;
  }

  // rfFS: open + non-manifold edges of a body's welded triangle mesh (edges used by one or by three or more
  // triangles, longer than 1e-9 × the diagonal), cached on the body; the shell's crack check (as kernel-mesh.js'
  // rfFPopenCount for fillets)
  function crackCount(body) {
    if (!body || !body.polygons || typeof Exchange === 'undefined' || !Exchange.bodyMesh) return 0;
    if (body._fsCrack != null) return body._fsCrack;
    var m = Exchange.bodyMesh(body), t = m.triangles, P = m.positions, use = {}, n = 0;
    for (var i = 0; i < t.length; i += 3) for (var k = 0; k < 3; k++) {
      var a = t[i + k], b = t[i + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a;
      use[key] = (use[key] || 0) + 1;
    }
    var bb = body.getBounds ? body.getBounds() : null, diag = bb ? Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) : 1;
    Object.keys(use).forEach(function (key) {
      if (use[key] === 2) return;
      var ab = key.split('_'), p = +ab[0] * 3, q = +ab[1] * 3;
      if (Math.hypot(P[p] - P[q], P[p + 1] - P[q + 1], P[p + 2] - P[q + 2]) > 1e-9 * diag) n++;
    });
    try { Object.defineProperty(body, '_fsCrack', { value: n, enumerable: false, writable: true, configurable: true }); } catch (e) { /* frozen */ }
    return n;
  }
  function scaledGrow(grow, s) { return s === 1 ? grow : function (l, hole) { return grow(l, hole).map(function (d) { return d * s; }); }; }
  // on: check the shell for cracks (retry, refuse); slack: cracks above the body's own a shell may keep; last: the
  // last check { tries, open: [per try], before }
  K.shellGuard = { on: true, slack: 24, last: null };
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
    // dihedral turn angle per body edge, keyed like bodyEdges (and the edge itself: its two faces)
    var turn = {}, edgeOf = {};
    bodyEdges(mesh).forEach(function (e) {
      var key = e.ka < e.kb ? e.ka + '|' + e.kb : e.kb + '|' + e.ka;
      var phi = 0;
      for (var p = 0; p < e.normals.length; p++) for (var q = p + 1; q < e.normals.length; q++) phi = Math.max(phi, Math.acos(Math.max(-1, Math.min(1, dot(e.normals[p], e.normals[q])))));
      turn[key] = phi;
      edgeOf[key] = e;
    });
    // rfGB: the depth of each kept face's slab. A facet of a curved face (a chord of a cylinder, cone, sphere or torus
    // record) moves by T·|N(v)·n| (N the surface normal at its corners, n the facet's), so its corners land exactly on
    // the surface offset by T (the record the inner cap carries: r − T); moved by T they sat T/cos(α/2) deep and the
    // shell of a rounded part came out up to 8e-4 heavy (G13). Planar faces: T.
    var depthOf = {}, radiusOf = {};
    function surfOf(face) {
      var S = null, F = null, ps = face.polys || [];
      for (var j = 0; j < ps.length; j++) {
        var s = ps[j].surf && ps[j].surf.s;
        if (!s || ps[j].surf.fc) return null;
        if (S && S !== s) return null;
        S = s; F = F || ps[j].surf;
      }
      return S ? { S: S, F: F } : null;
    }
    function surfError(S, x) {
      var v = sub(x, S.o), z = dot(v, S.d), rho = len(sub(v, scale(S.d, z)));
      if (S.t === 'cyl') return Math.abs(rho - S.r);
      if (S.t === 'cone') return Math.abs(rho - (S.r + (S.k || 0) * z)) / Math.sqrt(1 + (S.k || 0) * (S.k || 0));
      if (S.t === 'sph') return Math.abs(len(v) - S.r);
      if (S.t === 'tor') return Math.abs(Math.hypot(rho - S.R, z) - S.r);
      return Infinity;
    }
    // surfaces kept at depth T: those meeting a record-less faceted face (a loft, a sweep) at a concave edge under 60°
    // (the Funnel's tube under its cone): the exact depth there left a CSG fragment and flat-shaded bands
    // lane GC: a surface with a facet whose corners meet it at different angles (N·n differs corner to corner: a
    // hull-loft triangle of a cone, two neck corners at 0.99714 and its mouth corner at 0.9999999, beside mouth-based
    // triangles at 0.99928 at every corner) has no exact parallel offset per facet: at each facet's own depth the
    // neighbouring caps stood 0.003 mm apart, the slabs met PAST the shared ruling (at (d1·cosφ − d2) / sinφ, three
    // times the T·tan(φ/2) growth) and the Funnel's inner wall kept a hair-thin slit along every ruling (0.0006°
    // fragments, 669 hidden lines). Tilted caps through the offset corners (exact) plus that growth still left slits
    // near the tube: such a surface is offset at depth T on every facet, as before rfGB (and counts as record-less in
    // mixedSurf, so the tube under the Funnel's cone stays at T too). Cylinders, spheres and tori (facets symmetric
    // about their middle) are even and keep the exact depth.
    var uneven = typeof Map === 'function' ? new Map() : null;
    function unevenSurf(S) {
      if (!uneven) return false;
      if (uneven.has(S)) return uneven.get(S);
      var out = false, scl = Math.max(1, Math.abs(S.r || 0), Math.abs(S.R || 0));
      for (var fi = 0; fi < mesh.faces.length && !out; fi++) {
        var sf = surfOf(mesh.faces[fi]);
        if (!sf || sf.S !== S) continue;
        var n = mesh.faces[fi].normal, cen = mesh.faces[fi].centroid, lo = Infinity, hi = -Infinity;
        mesh.faces[fi].polys.forEach(function (p) {
          p.vertices.forEach(function (v) {
            var x = [v.pos.x, v.pos.y, v.pos.z];
            if (!(surfError(S, x) < 1e-6 * scl)) return;
            var N = K.surfNormalAt(S, x, cen);
            if (!N) return;
            var c = Math.abs(dot(N, n));
            lo = Math.min(lo, c); hi = Math.max(hi, c);
          });
        });
        if (hi - lo > 1e-9) out = true;
      }
      uneven.set(S, out);
      return out;
    }
    var mixed = null;
    function mixedSurf() {
      if (mixed) return mixed;
      mixed = typeof Set === 'function' ? new Set() : { has: function () { return false; }, add: function () {} };
      Object.keys(edgeOf).forEach(function (key) {
        var e = edgeOf[key];
        if (e.faces.length !== 2 || !(turn[key] < Math.PI / 3)) return;
        var sa = surfOf(mesh.faces[e.faces[0]]), sb = surfOf(mesh.faces[e.faces[1]]);
        if (sa && unevenSurf(sa.S)) sa = null;   // lane GC: an uneven surface is offset as a record-less one
        if (sb && unevenSurf(sb.S)) sb = null;
        if (!!sa === !!sb) return;
        var k = sa ? 0 : 1, rec = sa || sb;
        if (dot(e.ins[k], mesh.faces[e.faces[1 - k]].normal) > 1e-9) mixed.add(rec.S);
      });
      return mixed;
    }
    function faceDepth(i) {
      if (i in depthOf) return depthOf[i];
      var face = mesh.faces[i], sf = surfOf(face), d = T;
      radiusOf[i] = null;
      if (sf && K.surfNormalAt) {
        var o = null;
        try { o = faceOutline(mesh, i); } catch (e) { o = null; }
        var S = sf.S, best = null, bestErr = Infinity, cen = face.centroid, scl = Math.max(1, Math.abs(S.r || 0), Math.abs(S.R || 0));
        (o ? o.loops : []).forEach(function (l) { l.forEach(function (p2) { var x = to3D(o.plane, p2[0], p2[1]), er = surfError(S, x); if (er < bestErr) { bestErr = er; best = x; } }); });
        var N = best && bestErr < 1e-6 * scl ? K.surfNormalAt(S, best, cen) : null;
        if (N && !mixedSurf().has(S) && !unevenSurf(S)) d = T * Math.abs(dot(N, face.normal));
        // the radius a convex face curves with (an inward shell thicker than it cannot offset the face): cylinder,
        // sphere, a torus's tube (convex when the facet faces away from the tube centre)
        var Nc = K.surfNormalAt(S, cen, best);
        if (Nc && dot(Nc, face.normal) > 0 && (S.t === 'cyl' || S.t === 'sph' || S.t === 'tor')) radiusOf[i] = S.r;
      }
      return (depthOf[i] = d);
    }
    function growFor(plane, fi) {
      return function (loop, hole) {
        var d1 = faceDepth(fi), n1 = mesh.faces[fi].normal;
        return loop.map(function (p, k) {
          var a = to3D(plane, p[0], p[1]), q = loop[(k + 1) % loop.length], b = to3D(plane, q[0], q[1]);
          var ka = ekey(a), kb = ekey(b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          var phi = key in turn ? turn[key] : Math.PI / 2;
          var g = Math.min(4 * T, T * Math.tan(Math.min(phi, Math.PI - 0.05) / 2));
          // rfGB: at a concave edge the slab reaches exactly where its inner cap meets the neighbour's (at depths d1,
          // d2): the old T·tan(φ/2) is right only when both are T (a hole's facets, a curved facet beside a plane).
          // Convex edges keep it (overgrowth there lies outside the body or inside the neighbour's wall).
          var e = edgeOf[key], j = -1;
          if (e && e.faces.length === 2) j = e.faces[0] === fi ? e.faces[1] : e.faces[1] === fi ? e.faces[0] : -1;
          if (j >= 0 && removed.indexOf(j) < 0) {
            var n2 = mesh.faces[j].normal, dir = norm(sub(b, a)), u1 = scale(cross(n1, dir), hole ? -1 : 1), un = dot(u1, n2);
            // (it leaves a 0.0008° CSG fragment in the Funnel where the tube meets the cone; 1e-6·T or 1e-4·T more, or
            // the old growth where the depths differ, each cracked or moved other shells: BSP-sensitive, left as is)
            if (un > 1e-9) g = Math.min(4 * T, Math.max(-(d1 * dot(n1, n2) - faceDepth(j)) / un, 0));
          }
          return g;
        });
      };
    }
    function uniform(loop) { return loop.map(function () { return T; }); }
    // rfFE2: a kept face on a cylinder or cone record walls in its inner side on that surface offset by T (r − T on a
    // convex face, r + T in a hole; a cone moves T·√(1 + k²) along its radius): the slab's inner cap carries the
    // offset record, so massProps stays exact on the shell's inner walls (the Mug's inner wall had none: its volume was
    // 0.9 % high at any tessellation) and its rims draw as true circles. One offset record per surface.
    var offMemo = typeof Map === 'function' ? new Map() : null;
    function offsetRecord(face) {
      var sf = surfOf(face), S = sf && sf.S;
      if (S && (S.t === 'sph' || S.t === 'tor')) return offsetRevRecord(face, sf);   // rfGB
      if (!S || (S.t !== 'cyl' && S.t !== 'cone') || !offMemo) return null;
      var v = sub(face.centroid, S.o), z = dot(v, S.d), rho = sub(v, scale(S.d, z));
      if (len(rho) < 1e-9) return null;
      var conv = dot(face.normal, rho) > 0 ? 1 : -1, k = S.k || 0, key = S, memo = offMemo.get(key);
      if (memo && memo[conv]) return memo[conv];
      var S2 = {};
      for (var q in S) if (S.hasOwnProperty(q) && q !== '_m' && q !== '_pk') S2[q] = S[q];
      S2.o = S.o.slice(); S2.d = S.d.slice(); S2.r = S.r - conv * T * Math.sqrt(1 + k * k);
      if (!(S2.r + k * z > 1e-9)) return null;
      if (!memo) offMemo.set(key, memo = {});
      return (memo[conv] = { s: S2 });
    }
    // rfGB: a sphere / torus facet's inner cap: the same surface with its radius (a torus's tube) moved T toward the
    // centre (away from it in a concave face), and the facet's profile chord P, Q scaled about the profile circle's
    // centre, since the offset corners are the old ones moved T along the surface normal
    var revMemo = typeof Map === 'function' ? new Map() : null;
    function offsetRevRecord(face, sf) {
      var S = sf.S, F = sf.F, N = K.surfNormalAt ? K.surfNormalAt(S, face.centroid) : null;
      if (!N || !revMemo) return null;
      var conv = dot(N, face.normal) > 0 ? 1 : -1, r2 = S.r - conv * T;
      if (!(r2 > 1e-9 * Math.max(1, S.r))) return null;
      var ms = revMemo.get(S);
      if (!ms) revMemo.set(S, ms = {});
      var S2 = ms[conv];
      if (!S2) {
        S2 = {};
        for (var q in S) if (S.hasOwnProperty(q) && q !== '_m' && q !== '_pk') S2[q] = S[q];
        S2.o = S.o.slice(); S2.d = S.d.slice(); S2.r = r2;
        ms[conv] = S2;
      }
      var mf = revMemo.get(F);
      if (!mf) revMemo.set(F, mf = {});
      if (mf[conv]) return mf[conv];
      var F2 = {}, k = r2 / S.r, Cr = S.t === 'tor' ? S.R : 0;
      for (var w in F) if (F.hasOwnProperty(w) && w !== '_m' && w !== '_pk') F2[w] = F[w];
      F2.s = S2;
      if (F.P) F2.P = [Cr + (F.P[0] - Cr) * k, F.P[1] * k];
      if (F.Q) F2.Q = [Cr + (F.Q[0] - Cr) * k, F.Q[1] * k];
      return (mf[conv] = F2);
    }
    // rfFS: a shell whose slabs meet in exact coincidences (a slot exactly 2T wide, a notch whose offset collapses onto
    // its centre line) can come out cracked (open / non-manifold edges). The result is checked against the body before
    // it; a cracked one is rebuilt with every growth 1e-6 (then 1e-4) larger, which turns the coincidences into
    // crossings untangleLoop removes, and refused if still cracked (OpenCascade's shell then drives: not a refusal).
    // rfGB: an inward shell thicker than the radius of a convex round (a rim fillet, a boss) cannot offset that face
    // (its offset would turn inside out): SolidWorks refuses it ("the thickness is greater than the minimum radius of
    // curvature"); Anvil's slabs left it cracked (fuzz pins 2, 5)
    var minR = Infinity;
    for (var fr = 0; fr < mesh.faces.length; fr++) {
      if (removed.indexOf(fr) >= 0) continue;
      faceDepth(fr);
      if (radiusOf[fr] != null && radiusOf[fr] < minR) minR = radiusOf[fr];
    }
    if (minR < T * (1 - 1e-9)) {
      var rs = String(+minR.toPrecision(6)), ts = String(+T.toPrecision(6));
      throw new Error('Failed to shell the part: the thickness ' + ts + ' is greater than the ' + rs + ' radius of a rounded face, so that face cannot be offset inward. Use a thickness below ' + rs + ', or a larger round.');
    }
    var inner = ctx.body, extensions = [], S = null, body = null, open0 = -1, best = null;
    // lane GC: a last try (0) with csg.js's restoreFar (rfFV) off: the top union of G13's slabs (rfGA: 4 × 3 × 2 box,
    // R.5 / R.25 rounds, shell .1) cracks with it on (two closed halves of 3192 + 3257 polygons → 12 open edges at
    // the inner corner torus; growth ×(1 + 1e-6) / ×(1 + 1e-4): 8 / 6) and closes with it off. Reported as a csg.js
    // repro; a shell that closes on an earlier try never gets here, so no other shell moves.
    var noFar = typeof CSG !== 'undefined' && CSG.options && CSG.options.restoreFar;
    var tries = K.shellGuard.on ? (noFar ? [1, 1 + 1e-6, 1 + 1e-4, 0] : [1, 1 + 1e-6, 1 + 1e-4]) : [1];
    for (var tr = 0; tr < tries.length; tr++) {
      var gs = tries[tr] || 1, slabs = [];
      extensions = [];
      for (var i = 0; i < mesh.faces.length; i++) {
        var o;
        try { o = faceOutline(mesh, i); } catch (e) { o = null; }
        if (!o || !o.loops.length) continue;
        if (removed.indexOf(i) >= 0) {
          // outward through the face, starting a little inside so no cap is coplanar with the face
          var ext = slabSolid({ loops: o.loops.filter(function (l) { return signedArea(l) > 0; }), plane: o.plane }, uniform, -T / 2, T + 1, f.id);
          if (ext) extensions.push(ext);
        } else {
          var slab = slabSolid(o, scaledGrow(growFor(o.plane, i), gs), -faceDepth(i), T, f.id);   // rfGB: −faceDepth (was −T)
          var rec = slab && offsetRecord(mesh.faces[i]), fn = mesh.faces[i].normal;
          if (rec) slab.polygons.forEach(function (p) { var n = p.plane.normal; if (n.x * fn[0] + n.y * fn[1] + n.z * fn[2] < -0.999999) p.surf = rec; });
          if (slab) slabs.push(slab);
        }
      }
      if (!slabs.length) throw new Error('Every face of the body is selected for removal: leave at least one face to keep as a wall.');
      // body − ((body ∪ ext) − S) = body ∩ S exactly (S: the slab union), so the walls are one intersection instead of
      // a union and two subtractions (the Funnel's shell: two large booleans fewer, the same solid). The cavity
      // `inner` (the Shell PropertyManager's red preview) is only built when it is read.
      if (tries[tr] === 0) {
        CSG.options.restoreFar = false;
        try { S = unionTree(slabs); body = ctx.body.intersect(S); } finally { CSG.options.restoreFar = true; }
      } else {
        S = unionTree(slabs);
        body = ctx.body.intersect(S);
      }
      if (ctx.body.volume() - body.volume() < 1e-9) throw new Error('Shell thickness ' + T + ' is too large for this part: nothing would remain hollow. Enter a thickness below half of the thinnest wall.');
      if (tries.length === 1) break;
      if (open0 < 0) { open0 = crackCount(ctx.body); K.shellGuard.last = { tries: 0, open: [], before: open0 }; }
      var nOpen = crackCount(body);
      K.shellGuard.last.tries = tr + 1; K.shellGuard.last.open.push(nOpen);
      if (!best || nOpen < best.n) best = { n: nOpen, body: body, S: S, extensions: extensions };
      if (nOpen <= open0) break;
      if (tr === tries.length - 1) {
        // a few cracks are the boolean's (csg.js; the legacy-tessellation Funnel leaves 4): keep the best try; a shell
        // that falls apart (fuzz: 90 .. 171 open / non-manifold edges) is refused
        if (best.n > open0 + K.shellGuard.slack) throw new Error('Failed to shell the part: a wall would offset into a neighbouring face where Anvil\'s kernel cannot close it (the result would have gaps). Try another thickness.');
        body = best.body; S = best.S; extensions = best.extensions;
      }
    }
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

  // rfFB: ------------------------------------------------------------------ Boundary Boss/Base, Boundary Cut
  // { type: 'boundary', dir1: [sketch ids], dir2: [sketch id | { sketch, entity } | { pts: [[x,y,z], …] }], cut?,
  //   tangency1?: { start, end }, tangency2?, close?, mergeTangent?, thin?: { t, mid?, reverse? } }
  // Direction 1 sketches each hold one closed profile; every open chain of a Direction 2 sketch (or the one entity, or
  // the 3D polyline) is a curve that must touch every Direction 1 profile. boundaryFrame splits each profile at the
  // curves' contact points into pieces and each curve between profiles into pieces: patch (band i, piece k) is bounded
  // by profile i and i+1's piece k and curves k and k+1 — a Coons patch (bilinear blend of the four sides). Anvil's
  // kernel facets it on the union of the sides' own vertices, so straight sides give planar faces (exact volumes);
  // OpenCascade (occt-kernel.js) builds the same patches as BSpline surfaces. With no Direction 2 curves the solid is
  // the Loft through the profiles (buildLoft; ThruSections on OpenCascade).
  function bfbErr(msg) { return new Error(msg); }
  function bfbArc(pts) { var a = [0]; for (var i = 1; i < pts.length; i++) a.push(a[i - 1] + len(sub(pts[i], pts[i - 1]))); return a; }
  // the points of polyline pts at arclength fractions fr (0..1)
  function bfbAt(pts, fr) {
    var a = bfbArc(pts), L = a[a.length - 1], out = [], j = 0;
    fr.forEach(function (x) {
      if (x <= 0) { out.push(pts[0]); return; }
      if (x >= 1) { out.push(pts[pts.length - 1]); return; }
      var s = x * L;
      while (j > 0 && a[j] > s) j--;
      while (j < pts.length - 2 && a[j + 1] < s) j++;
      var d = a[j + 1] - a[j], t = d > 1e-15 ? (s - a[j]) / d : 0;
      out.push(t <= 1e-12 ? pts[j] : t >= 1 - 1e-12 ? pts[j + 1] : add(pts[j], scale(sub(pts[j + 1], pts[j]), t)));
    });
    return out;
  }
  function bfbFracs(pts) { var a = bfbArc(pts), L = a[a.length - 1]; return a.map(function (x) { return L > 0 ? x / L : 0; }); }
  function bfbUnion(lists, cap) {
    var all = [];
    lists.forEach(function (l) { all = all.concat(l); });
    all.sort(function (p, q) { return p - q; });
    var out = [];
    all.forEach(function (x) { if (!out.length || x - out[out.length - 1] > 1e-7) out.push(x); });
    out[0] = 0; if (out[out.length - 1] < 1 - 1e-7) out.push(1); else out[out.length - 1] = 1;
    if (out.length > cap) { out = []; for (var i = 0; i <= 64; i++) out.push(i / 64); }
    return out;
  }
  function bfbId(x) { return x != null && typeof x === 'object' ? x.sketch : x; }
  function bfbSketch(id, model, ctx, what) {
    var s = ctx.sketches[id] || findFeature(model, id);
    if (!s || s.type !== 'sketch') throw bfbErr(what);
    return s;
  }
  // the Direction 2 curves as 3D polylines
  function bfbCurves(f, model, ctx) {
    var out = [];
    (f.dir2 || []).forEach(function (c) {
      if (c && Array.isArray(c.pts)) { if (c.pts.length >= 2) out.push(c.pts.map(function (p) { return [+p[0], +p[1], +p[2]]; })); return; }
      // { sketch, entity }: the chain through that entity; a sketch id: every chain of the sketch
      var s = bfbSketch(bfbId(c), model, ctx, 'A Direction 2 curve sketch was not found.'), pl = resolvePlane(s.plane, model, ctx.planes), chains = [];
      var want = c && typeof c === 'object' && c.entity != null ? +c.entity : null;
      (s.entities || []).forEach(function (e, i) {
        if (e.construction || e.t === 'text' || e.t === 'point' || (K.noProfileEntity && K.noProfileEntity(s, e))) return;
        entityPolylines(e).forEach(function (p) { chains.push({ pts: p.closed ? p.pts.concat([p.pts[0]]) : p.pts.slice(), ents: [i] }); });
      });
      // chain the pieces end to end: each connected chain is one curve
      while (chains.length) {
        var ch = chains.shift(), pts = ch.pts, ents = ch.ents, grew = true;
        while (grew) {
          grew = false;
          for (var i = 0; i < chains.length; i++) {
            var q = chains[i].pts, h = key2(pts[0]), t = key2(pts[pts.length - 1]);
            if (key2(q[0]) === t) pts = pts.concat(q.slice(1));
            else if (key2(q[q.length - 1]) === t) pts = pts.concat(q.slice().reverse().slice(1));
            else if (key2(q[q.length - 1]) === h) pts = q.slice(0, -1).concat(pts);
            else if (key2(q[0]) === h) pts = q.slice().reverse().slice(0, -1).concat(pts);
            else continue;
            ents = ents.concat(chains[i].ents); chains.splice(i, 1); grew = true; break;
          }
        }
        if (want == null || ents.indexOf(want) >= 0) out.push(pts.map(function (p) { return to3D(pl, p[0], p[1]); }));
      }
      if (want != null && !s.entities[want]) throw bfbErr('A Direction 2 curve (' + s.name + ', entity ' + (want + 1) + ') was not found.');
    });
    return out;
  }
  // contacts of polyline g with a section (plane pl, closed 3D loop L): [{ u (arclength on g), p, j (loop segment), t }]
  function bfbContacts(g, sec, tol) {
    var pl = sec.plane, L = sec.pts, n = L.length, ag = bfbArc(g), cands = [];
    function onLoop(p) {
      var best = null;
      for (var j = 0; j < n; j++) {
        var a = L[j], b = L[(j + 1) % n], ab = sub(b, a), l2 = dot(ab, ab), t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
        var d = len(sub(p, add(a, scale(ab, t))));
        if (!best || d < best.d) best = { d: d, j: j, t: t };
      }
      return best && best.d <= tol ? best : null;
    }
    for (var i = 0; i < g.length; i++) {
      var d0 = dot(sub(g[i], pl.origin), pl.n), hit = null, u = ag[i];
      if (Math.abs(d0) <= tol) hit = g[i];
      else if (i + 1 < g.length) {
        var d1 = dot(sub(g[i + 1], pl.origin), pl.n);
        if (Math.abs(d1) > tol && (d0 < 0) !== (d1 < 0)) { var s = d0 / (d0 - d1); hit = add(g[i], scale(sub(g[i + 1], g[i]), s)); u = ag[i] + s * (ag[i + 1] - ag[i]); }
      }
      if (!hit) continue;
      var on = onLoop(hit);
      if (on && !cands.some(function (c) { return Math.abs(c.u - u) <= tol; })) cands.push({ u: u, j: on.j, t: on.t, d: on.d });
    }
    return cands;
  }
  // the shared layout both kernels build from:
  // { secs: [{ plane, pts, dir }], G, virtual, close, pieces[i][k] (section i between curves k and k+1, both contact
  //   points included), guides[b][k] (curve k from section b to b + 1, ends = the contact points), tol }
  function boundaryFrame(f, model, ctx) {
    var ids = (f.dir1 || []).map(bfbId);
    if (ids.length < 2) throw bfbErr('Select at least two profiles for Direction 1.');
    var secs = ids.map(function (id) {
      var s = bfbSketch(id, model, ctx, 'A Direction 1 profile sketch was not found.'), pl = resolvePlane(s.plane, model, ctx.planes);
      var prof = s.profile || sketchProfile(s);
      checkProfile(prof);
      var outers = prof.loops.filter(function (l) { return !l.hole; });
      if (outers.length !== 1) throw bfbErr('Each Direction 1 sketch must contain exactly one closed profile.');
      return { id: id, plane: pl, pts: outers[0].pts.map(function (p) { return to3D(pl, p[0], p[1]); }) };
    });
    var n = secs.length, close = !!f.close && n >= 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    secs.forEach(function (s) { s.c = loopCentroid3(s.pts); s.pts.forEach(function (p) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); } }); });
    var tol = Math.max(1e-9, 1e-4 * len(sub(hi, lo)));
    secs.forEach(function (s, i) {
      var d = i + 1 < n ? sub(secs[i + 1].c, s.c) : sub(s.c, secs[i - 1].c);
      if (len(d) < tol) throw bfbErr('Two Direction 1 profiles lie on top of each other.');
      s.dir = norm(d);
      if (dot(loopNormal3(s.pts), s.dir) < 0) s.pts = s.pts.slice().reverse();
    });
    var curves = bfbCurves(f, model, ctx), G = curves.length, out = { secs: secs, close: close, tol: tol, virtual: !G, pieces: [], guides: [] };
    var contact = [], i, k;   // contact[i][k] = index of curve k's point in section i's loop
    if (G) {
      if (close) throw bfbErr('Close is not available with Direction 2 curves yet.');
      var hits = curves.map(function (g, gi) {
        var prev = -Infinity, list = secs.map(function (s) {
          var cs = bfbContacts(g, s, 10 * tol);
          if (!cs.length) throw bfbErr('Each Direction 2 curve must intersect every Direction 1 profile.');
          cs.sort(function (p, q) { return p.u - q.u; });
          var c = cs.filter(function (x) { return x.u > prev; })[0] || cs[0];
          prev = c.u;
          return c;
        });
        var inc = true, dec = true;
        for (var j = 1; j < n; j++) { if (!(list[j].u > list[j - 1].u)) inc = false; if (!(list[j].u < list[j - 1].u)) dec = false; }
        if (!inc && !dec) throw bfbErr('Direction 2 curve ' + (gi + 1) + ' must run through the Direction 1 profiles in order.');
        return { g: g, list: list, dec: dec };
      });
      // put the contact points into each loop
      secs.forEach(function (s, si) {
        var ins = hits.map(function (h, gi) { var c = h.list[si]; return { gi: gi, w: c.t > 1 - 1e-9 ? (c.j + 1) % s.pts.length : c.j + (c.t < 1e-9 ? 0 : c.t), c: c }; });
        ins.sort(function (p, q) { return p.w - q.w; });
        for (var q = 1; q < ins.length; q++) if (Math.abs(ins[q].w - ins[q - 1].w) < 1e-9) throw bfbErr('Two Direction 2 curves meet a profile at the same point.');
        var pts = [], at = {};
        for (var v = 0; v < s.pts.length; v++) {
          ins.forEach(function (x) { if (Math.abs(x.w - v) < 1e-9) at[x.gi] = pts.length; });
          pts.push(s.pts[v]);
          ins.forEach(function (x) { if (x.w > v + 1e-9 && x.w < v + 1 - 1e-9) { at[x.gi] = pts.length; var a = s.pts[v], b = s.pts[(v + 1) % s.pts.length]; pts.push(add(a, scale(sub(b, a), x.w - v))); } });
        }
        s.pts = pts;
        contact.push(hits.map(function (h, gi) { return at[gi]; }));
      });
      // the curves' cyclic order around the first profile must hold on every profile
      var order = hits.map(function (h, gi) { return gi; }).sort(function (p, q) { return contact[0][p] - contact[0][q]; });
      for (i = 1; i < n; i++) {
        var o2 = order.slice().sort(function (p, q) { return contact[i][p] - contact[i][q]; }), r = o2.indexOf(order[0]);
        for (k = 0; k < G; k++) if (o2[(r + k) % G] !== order[k]) throw bfbErr('The Direction 2 curves cross between the profiles.');
      }
      hits = order.map(function (gi) { return hits[gi]; });
      contact = contact.map(function (row) { return order.map(function (gi) { return row[gi]; }); });
      // curve pieces between consecutive profiles, ends snapped to the contact points
      for (var b = 0; b + 1 < n; b++) {
        out.guides.push(hits.map(function (h, kk) {
          var g = h.g, ag = bfbArc(g), u0 = h.list[b].u, u1 = h.list[b + 1].u, pts = [secs[b].pts[contact[b][kk]]];
          if (u0 < u1) { for (var m = 0; m < g.length; m++) if (ag[m] > u0 + 1e-9 && ag[m] < u1 - 1e-9) pts.push(g[m]); }
          else { for (var m2 = g.length - 1; m2 >= 0; m2--) if (ag[m2] < u0 - 1e-9 && ag[m2] > u1 + 1e-9) pts.push(g[m2]); }
          pts.push(secs[b + 1].pts[contact[b + 1][kk]]);
          return pts;
        }));
      }
    } else {
      // no curves: one seam per profile, each started where it best matches the one before (as Loft aligns them)
      contact.push([0]);
      for (i = 1; i < n; i++) {
        var A = resampleLoop(secs[i - 1].pts.slice(contact[i - 1][0]).concat(secs[i - 1].pts.slice(0, contact[i - 1][0])), 24), Bp = secs[i].pts, best = 0, bestCost = Infinity;
        for (var st = 0; st < Bp.length; st++) {
          var Bs = resampleLoop(Bp.slice(st).concat(Bp.slice(0, st)), 24), cost = 0;
          for (var q2 = 0; q2 < 24; q2++) { var dd = sub(sub(A[q2], secs[i - 1].c), sub(Bs[q2], secs[i].c)); cost += dot(dd, dd); }
          if (cost < bestCost - 1e-12) { bestCost = cost; best = st; }
        }
        contact.push([best]);
      }
      for (i = 0; i + 1 < n + (close ? 1 : 0); i++) out.guides.push([[secs[i].pts[contact[i][0]], secs[(i + 1) % n].pts[contact[(i + 1) % n][0]]]]);
      G = 1;
    }
    out.G = G;
    secs.forEach(function (s, si) {
      var m = s.pts.length;
      out.pieces.push(contact[si].map(function (c0, kk) {
        var c1 = contact[si][(kk + 1) % G], pts = [s.pts[c0]], v = (c0 + 1) % m, guard = 0;
        while (v !== c1 && guard++ <= m) { pts.push(s.pts[v]); v = (v + 1) % m; }
        pts.push(s.pts[c1]);
        return pts;
      }));
    });
    return out;
  }
  // a grid of rows (one per curve station, each a closed ring of points); planar convex quads stay quads
  function bfbQuad(polys, a, b, c, d, id) {
    var nrm = cross(sub(c, a), sub(d, b)), L = len(nrm);
    if (L < 1e-18) return;
    var nn = scale(nrm, 1 / L), size = len(sub(c, a)) + len(sub(d, b)), off = Math.abs(dot(sub(d, a), nn)) + Math.abs(dot(sub(b, a), nn)) + Math.abs(dot(sub(c, a), nn));
    var convex = [[a, b, c], [b, c, d], [c, d, a], [d, a, b]].every(function (t) { return dot(cross(sub(t[1], t[0]), sub(t[2], t[1])), nn) > 0; });
    if (off < 1e-9 * size && convex) { pushPoly(polys, [a, b, c, d], id); return; }
    if (len(sub(c, a)) <= len(sub(d, b))) { pushPoly(polys, [a, b, c], id); pushPoly(polys, [a, c, d], id); }
    else { pushPoly(polys, [a, b, d], id); pushPoly(polys, [b, c, d], id); }
  }
  function boundaryGrid(fr) {
    var secs = fr.secs, n = secs.length, G = fr.G, S = [], rows = [], k, i;
    for (k = 0; k < G; k++) S.push(bfbUnion(fr.pieces.map(function (ps) { return bfbFracs(ps[k]); }), 400));
    var ring = function (si) { var r = []; for (var kk = 0; kk < G; kk++) r = r.concat(bfbAt(fr.pieces[si][kk], S[kk]).slice(0, -1)); return r; };
    var bands = fr.guides.length;
    for (var b = 0; b < bands; b++) {
      var s0 = b, s1 = (b + 1) % n;
      rows.push(ring(s0));
      var T = bfbUnion(fr.guides[b].map(bfbFracs), 400);
      if (T.length <= 2) continue;
      var As = [], Bs = [], Ls = [];
      for (k = 0; k < G; k++) { As.push(bfbAt(fr.pieces[s0][k], S[k])); Bs.push(bfbAt(fr.pieces[s1][k], S[k])); Ls.push(bfbAt(fr.guides[b][k], T)); }
      for (i = 1; i + 1 < T.length; i++) {
        var t = T[i], row = [];
        for (k = 0; k < G; k++) {
          var A = As[k], B = Bs[k], L = Ls[k][i], R = Ls[(k + 1) % G][i], A0 = A[0], A1 = A[A.length - 1], B0 = B[0], B1 = B[B.length - 1];
          for (var j = 0; j + 1 < A.length; j++) {
            var s = S[k][j], p = add(scale(A[j], 1 - t), scale(B[j], t));
            p = add(p, add(scale(L, 1 - s), scale(R, s)));
            p = sub(p, add(add(scale(A0, (1 - s) * (1 - t)), scale(A1, s * (1 - t))), add(scale(B0, (1 - s) * t), scale(B1, s * t))));
            row.push(p);
          }
        }
        rows.push(row);
      }
    }
    if (!fr.close) rows.push(ring(n - 1));
    return rows;
  }
  // unit-distance offset per grid point (outward: rings run CCW about the direction of travel), mitred so planar
  // neighbouring faces move by exactly the distance
  function bfbOffsets(rows, closed) {
    var R = rows.length, C = rows[0].length, cell = [];
    function at(r, c) { return rows[(r + R) % R][(c + C) % C]; }
    for (var r = 0; r < R - (closed ? 0 : 1); r++) {
      cell.push([]);
      for (var c = 0; c < C; c++) { var nv = cross(sub(at(r + 1, c + 1), at(r, c)), sub(at(r + 1, c), at(r, c + 1))); cell[r].push(len(nv) > 1e-18 ? norm(nv) : null); }
    }
    var out = [];
    for (r = 0; r < R; r++) {
      out.push([]);
      for (c = 0; c < C; c++) {
        var ns = [];
        [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]].forEach(function (rc) {
          var rr = closed ? (rc[0] + cell.length) % cell.length : rc[0];
          if (rr < 0 || rr >= cell.length) return;
          var v = cell[rr][(rc[1] + C) % C];
          if (v && !ns.some(function (u) { return dot(u, v) > 1 - 1e-9; })) ns.push(v);
        });
        var d = [0, 0, 0];
        if (ns.length === 1) d = ns[0];
        else if (ns.length === 2) d = scale(add(ns[0], ns[1]), 1 / (1 + dot(ns[0], ns[1])));
        else if (ns.length > 2) {
          // least squares d·n = 1 for every neighbouring face normal (3×3 normal equations, Cramer)
          var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], y = [0, 0, 0];
          ns.forEach(function (v) { for (var a = 0; a < 3; a++) { y[a] += v[a]; for (var b = 0; b < 3; b++) M[a][b] += v[a] * v[b]; } });
          var det = function (m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); };
          var D = det(M);
          if (Math.abs(D) > 1e-12) for (var a = 0; a < 3; a++) { var Ma = M.map(function (row, ri) { var x = row.slice(); x[a] = y[ri]; return x; }); d[a] = det(Ma) / D; }
          else { ns.forEach(function (v) { d = add(d, v); }); d = norm(d); }
        }
        out[r].push(d);
      }
    }
    return out;
  }
  function buildBoundary(f, model, ctx) {
    var thin = f.thin && +f.thin.t > 0 ? f.thin : null;
    if (!(f.dir2 || []).length && !thin && !f.close) {
      // no Direction 2 curves: the Loft through the profiles
      var fr0 = boundaryFrame(f, model, ctx);   // the same checks and messages as with curves
      return buildLoft({ id: f.id, type: 'loft', sketches: fr0.secs.map(function (s) { return s.id; }) }, model, ctx);
    }
    var fr = boundaryFrame(f, model, ctx), rows = boundaryGrid(fr), R = rows.length, C = rows[0].length, polys = [], id = f.id, r, c;
    var closed = fr.close, secs = fr.secs;
    if (f.tangency1 || f.tangency2) {
      var tg = [f.tangency1, f.tangency2].some(function (t) { return t && ((t.start && t.start !== 'none') || (t.end && t.end !== 'none')); });
      if (tg && ctx.warnings) ctx.warnings[f.id] = (ctx.warnings[f.id] ? ctx.warnings[f.id] + ' ' : '') + 'End tangency is not applied yet: the profiles are joined without it.';
    }
    function capTris(ring, plane, want, flip) {
      var r2 = ring.map(function (p) { return to2D(plane, p); }), out = [];
      triangulateAny(r2).forEach(function (t) {
        var tri = [ring[t[0]], ring[t[1]], ring[t[2]]];
        if (dot(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])), want) < 0) tri.reverse();
        out.push(flip ? tri.reverse() : tri);
      });
      return out;
    }
    var nCells = closed ? R : R - 1;
    if (!thin) {
      for (r = 0; r < nCells; r++) for (c = 0; c < C; c++) bfbQuad(polys, rows[r][c], rows[r][(c + 1) % C], rows[(r + 1) % R][(c + 1) % C], rows[(r + 1) % R][c], id);
      if (!closed) {
        capTris(rows[0], secs[0].plane, scale(secs[0].dir, -1)).forEach(function (t) { pushPoly(polys, t, id); });
        capTris(rows[R - 1], secs[secs.length - 1].plane, secs[secs.length - 1].dir).forEach(function (t) { pushPoly(polys, t, id); });
      }
      return ensureOutward(polys);
    }
    // Thin Feature: walls of thickness t about the boundary surface, open at the end profiles
    var T = +thin.t, dOut = thin.mid ? T / 2 : (thin.reverse ? 0 : T), dIn = thin.mid ? T / 2 : (thin.reverse ? T : 0), off = bfbOffsets(rows, closed);
    // the wall ends lie in the end profiles' planes: slide each end offset along the surface (its run to the next row)
    if (!closed) [[0, 1, secs[0].plane], [R - 1, R - 2, secs[secs.length - 1].plane]].forEach(function (e) {
      off[e[0]] = off[e[0]].map(function (d, ci) {
        var dt = sub(rows[e[1]][ci], rows[e[0]][ci]), dn = dot(dt, e[2].n);
        return Math.abs(dn) > 1e-12 ? sub(d, scale(dt, dot(d, e[2].n) / dn)) : d;
      });
    });
    var O = rows.map(function (row, ri) { return row.map(function (p, ci) { return add(p, scale(off[ri][ci], dOut)); }); });
    var I = rows.map(function (row, ri) { return row.map(function (p, ci) { return sub(p, scale(off[ri][ci], dIn)); }); });
    for (r = 0; r < nCells; r++) for (c = 0; c < C; c++) {
      var r1 = (r + 1) % R, c1 = (c + 1) % C;
      bfbQuad(polys, O[r][c], O[r][c1], O[r1][c1], O[r1][c], id);
      bfbQuad(polys, I[r][c], I[r1][c], I[r1][c1], I[r][c1], id);
    }
    if (!closed) {
      [[0, scale(secs[0].dir, -1)], [R - 1, secs[secs.length - 1].dir]].forEach(function (e) {
        var ri = e[0], want = e[1];
        for (c = 0; c < C; c++) {
          var c2 = (c + 1) % C, q = [O[ri][c], O[ri][c2], I[ri][c2], I[ri][c]];
          if (dot(cross(sub(q[2], q[0]), sub(q[3], q[1])), want) < 0) q.reverse();
          bfbQuad(polys, q[0], q[1], q[2], q[3], id);
        }
      });
    }
    return ensureOutward(polys);
  }
  K.buildBoundary = buildBoundary; K.boundaryFrame = boundaryFrame; _.buildBoundary = buildBoundary; _.boundaryFrame = boundaryFrame; _.boundaryGrid = boundaryGrid;   // rfFB


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.sketchPath = sketchPath; K.buildSweep = buildSweep; K.buildLoft = buildLoft; K.resolveFaces = resolveFaces; K.buildShell = buildShell;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  K.resolveRefGeo = resolveRefGeo; K.toCsys = toCsys; K.dirToCsys = dirToCsys; _.resolveRefGeo = resolveRefGeo; _.revolveOnRefAxis = revolveOnRefAxis;   // lane CZ
  _.buildLoft = buildLoft; _.blendLoftLoops = blendLoftLoops; _.buildShell = buildShell; _.buildSweep = buildSweep; _.faceLoopsClassified = faceLoopsClassified;

  // ------------------------------------------------------------------ rfDX: Draft (SolidWorks' Neutral Plane draft)
  // { type: 'draft', neutral: { face: [x,y,z] } | { plane: 'Front' | 'Top' | 'Right' | <plane feature id>, offset? },
  //   faces: [{ at: [x,y,z] }], angle (deg, 0 < a < 89), reverse?, propagate?: 'none' | 'tangent' }
  // Pull direction: the neutral face's inward normal (a plane's normal), turned toward the side of the neutral plane
  // the drafted faces lie on (draftSide); reverse flips it. Every drafted face turns about its line on the neutral plane by the angle, its outward normal
  // tilting toward the pull, so the part tapers away from the neutral plane along the pull (a 2 x 2 x 1 block drafted
  // 5 deg about its bottom face: the top shrinks by 2 tan 5 deg each way; reverse grows it).
  // Planar faces are exact: per face, the wedge between the old and the new plane inside the face's prism (its
  // outline grown across convex edges so corners meet the neighbour's new plane) is cut away on the pull side of the
  // neutral plane and added (clipped by the convex neighbours' planes, new or old) on the other side. Curved faces
  // (cylinders become cones) are refused here; OpenCascade drafts them exactly (occt-kernel.js draftOp).
  // -> { body, faces: [mesh face index], pull, removed: CSG|null, added: CSG|null }
  function draftNeutral(ref, mesh, ctx, tol) {
    if (!ref) throw new Error('Select a neutral plane: a planar face or a plane.');
    var at = ref.face || ref.at;
    if (at) {
      var k = resolveFaces([{ at: at }], mesh, tol)[0];
      if (k == null || k < 0) throw new Error('The neutral face was not found on the body. Select it again.');
      if (draftCurved(mesh.faces[k])) throw new Error('The neutral plane must be a planar face or a plane.');
      var fn = mesh.faces[k].normal;
      return { pull: scale(fn, -1), d0: -mesh.faces[k].w, face: k };
    }
    var pl = null, name = ref.plane != null ? ref.plane : ref.ref;
    if (typeof name === 'string' && K.STD_PLANES[name]) pl = K.makePlane(name, +ref.offset || 0);
    else if (name != null && ctx.planes && ctx.planes[name] && ctx.planes[name].n && ctx.planes[name].origin) pl = ctx.planes[name];
    else if (ref.featureId != null || ref.custom) pl = resolvePlane(ref, null, ctx.planes);
    if (!pl) throw new Error('The neutral plane was not found. Select a planar face or a plane.');
    var n = norm(pl.n);
    return { pull: n, d0: dot(n, pl.origin), face: -1 };
  }
  function draftCurved(face) {
    return !!(face && face.polys && face.polys.some(function (p) { var s = p.surf && p.surf.s; return !!(s && s.t && s.t !== 'plane'); }));
  }
  // faces sharing a smooth edge with a picked face that lie on a curved surface (Face propagation: Along Tangent)
  function draftPropagate(idx, mesh) {
    var edges = bodyEdges(mesh), grew = true;
    while (grew) {
      grew = false;
      edges.forEach(function (e) {
        if (!e.smooth || e.faces.length !== 2) return;
        var a = e.faces[0], b = e.faces[1], ia = idx.indexOf(a) >= 0, ib = idx.indexOf(b) >= 0;
        if (ia === ib) return;
        var o = ia ? b : a;
        if (!draftCurved(mesh.faces[o]) && !draftCurved(mesh.faces[ia ? a : b])) return;
        idx.push(o); grew = true;
      });
    }
    return idx;
  }
  // -1 when the faces ({ area, centroid }) lie mostly on the far side of the neutral plane from the pull N (n . p = d0)
  function draftSide(N, d0, faces) {
    var s = 0, a = 0;
    faces.forEach(function (fc) { s += fc.area * (dot(N, fc.centroid) - d0); a += fc.area; });
    return s < -1e-9 * Math.max(1, a) ? -1 : 1;
  }
  function rotateVec(v, u, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return add(add(scale(v, c), scale(cross(u, v), s)), scale(u, dot(u, v) * (1 - c)));
  }
  function buildDraft(f, ctx) {
    if (!ctx.body || !ctx.body.polygons || !ctx.body.polygons.length) throw new Error('Nothing to draft yet.');
    var A = +f.angle;
    if (!(A > 0) || !(A < 89)) throw new Error('Draft angle must be greater than 0 and less than 89 degrees.');
    if (!(f.faces || []).length) throw new Error('Select the faces to draft.');
    var mesh = meshFromBody(ctx.body), tol = _.pickTol(ctx.units || 'mm');
    var neu = draftNeutral(f.neutral, mesh, ctx, tol);
    var N = f.reverse ? scale(neu.pull, -1) : neu.pull, d0 = f.reverse ? -neu.d0 : neu.d0;
    var idx = resolveFaces(f.faces, mesh, tol);
    if (idx.length < f.faces.length) throw new Error('A face to draft was not found on the body. Select the faces again.');
    if (f.propagate === 'tangent') idx = draftPropagate(idx.slice(), mesh);
    // the pull points to the side of the neutral plane the drafted faces lie on (the part tapers away from it)
    var side = draftSide(neu.pull, neu.d0, idx.map(function (i) { return { area: mesh.faces[i].area, centroid: mesh.faces[i].centroid }; }));
    if (side < 0) { neu.pull = scale(neu.pull, -1); neu.d0 = -neu.d0; }
    N = f.reverse ? scale(neu.pull, -1) : neu.pull; d0 = f.reverse ? -neu.d0 : neu.d0;
    // rfGB: a planar face tangent to a round that is not drafted with it would leave the round standing straight
    // beside the tilted face (a kink; a second Draft over it cracked the part, fuzz pin 6): refused, as the round
    // cannot follow on Anvil's kernel (it drafts planar faces only)
    var COS_TAN = Math.cos(30 * Math.PI / 180);
    bodyEdges(mesh).forEach(function (e) {
      if (e.faces.length !== 2) return;
      var a = e.faces[0], b = e.faces[1], ia = idx.indexOf(a), ib = idx.indexOf(b);
      if ((ia >= 0) === (ib >= 0)) return;
      var k = ia >= 0 ? ia : ib, other = ia >= 0 ? b : a;
      if (draftCurved(mesh.faces[ia >= 0 ? a : b])) return;   // a curved face itself is refused below, in its own words
      if (!draftCurved(mesh.faces[other]) || dot(mesh.faces[a].normal, mesh.faces[b].normal) < COS_TAN) return;
      throw new Error((k < f.faces.length ? 'Face<' + (k + 1) + '>' : 'A face reached by Along Tangent') + ' is tangent to a round that is not drafted with it, and Anvil\'s kernel cannot tilt the round to follow. Draft the faces before adding the round, or draft on the OpenCascade kernel.');
    });
    var ang = A * Math.PI / 180, recs = {};
    idx.forEach(function (i, k) {
      var face = mesh.faces[i], n = face.normal, nm = k < f.faces.length ? 'Face<' + (k + 1) + '>' : 'A face reached by Along Tangent';
      if (i === neu.face) throw new Error(nm + ' is the neutral face: it cannot be drafted.');
      if (draftCurved(face)) throw new Error(nm + ' is curved: a cylindrical or conical face is drafted by the OpenCascade kernel only (Anvil\'s own kernel drafts planar faces).');
      var c = dot(n, N), ux = cross(n, N);
      if (len(ux) < 1e-6) throw new Error(nm + ' is parallel to the neutral plane: only faces that run along the direction of pull can be drafted.');
      var u = norm(ux), det = 1 - c * c;
      var x0 = add(scale(n, (face.w - c * d0) / det), scale(N, (d0 - c * face.w) / det));   // on the face plane and the neutral plane
      var n2 = norm(rotateVec(n, u, ang));
      recs[i] = { n: n, w: face.w, n2: n2, w2: dot(n2, x0), o: faceOutline(mesh, i) };
      if (!recs[i].o || !recs[i].o.loops.length) throw new Error(nm + ' has no outline: select it again.');
    });
    // the widest gap between a face and its drafted plane, measured along the face normal
    var gap = 0, diag = 0, P64 = mesh.positions64, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var q = 0; q < P64.length; q += 3) for (var ax = 0; ax < 3; ax++) { lo[ax] = Math.min(lo[ax], P64[q + ax]); hi[ax] = Math.max(hi[ax], P64[q + ax]); }
    idx.forEach(function (i) {
      var r = recs[i];
      r.o.loops.forEach(function (l) { l.forEach(function (q) { var p = to3D(r.o.plane, q[0], q[1]); gap = Math.max(gap, Math.abs(dot(r.n2, p) - r.w2) / Math.max(1e-6, dot(r.n2, r.n))); }); });
    });
    if (P64.length) diag = len(sub(hi, lo));
    var D = gap * 1.25 + 1e-4 * (diag || 1) + 1e-6, G = 2 * D;
    // neighbour of a face outline segment: the other face whose plane holds both ends (convex when its normal points
    // away from this face's interior, the left of the segment)
    var ptol = Math.max(1e-7, 1e-8 * (diag || 1));
    function neighbour(i, a, b) {
      var e = sub(b, a), left = cross(mesh.faces[i].normal, e);
      for (var j = 0; j < mesh.faces.length; j++) {
        if (j === i) continue;
        var fj = mesh.faces[j];
        if (Math.abs(dot(fj.normal, a) - fj.w) > ptol * 10 || Math.abs(dot(fj.normal, b) - fj.w) > ptol * 10) continue;
        if (len(cross(fj.normal, mesh.faces[i].normal)) < 1e-9) continue;
        return { j: j, convex: dot(fj.normal, left) < 0 };
      }
      return null;
    }
    var R = [], Ad = [];
    idx.forEach(function (i) {
      var r = recs[i], pl = r.o.plane, cl = faceLoopsClassified(r.o), clips = [];
      function grown(l, forAdd) {
        return offsetLoopVar(l, l.map(function (q, k) {
          var a = to3D(pl, q[0], q[1]), q2 = l[(k + 1) % l.length], b = to3D(pl, q2[0], q2[1]), nb = neighbour(i, a, b);
          if (!nb) return forAdd ? 0 : G;
          if (!nb.convex) return 0;
          if (forAdd) { var rj = recs[nb.j]; clips.push(rj ? [rj.n2, rj.w2] : [mesh.faces[nb.j].normal, mesh.faces[nb.j].w]); }
          return G;
        }));
      }
      var rem = [], add_ = [], holes = [];
      cl.outers.forEach(function (l) {
        var g = grown(l, false); if (signedArea(g) > 1e-12) rem.push(prism(g, pl, -D, D, f.id));
        var g2 = grown(l, true); if (signedArea(g2) > 1e-12) add_.push(prism(g2, pl, -D, D, f.id));
      });
      cl.holes.forEach(function (l) { holes.push(prism(l, pl, -D * 1.1, D * 1.1, f.id)); });
      if (rem.length) {
        var zr = unionTree(rem).clipByPlane(r.n2, r.w2).clipByPlane(N, d0);   // outside the new plane, pull side
        if (zr.polygons.length) R.push(zr);
      }
      if (add_.length) {
        var za = unionTree(add_);
        if (holes.length) za = za.subtract(unionTree(holes));
        za = za.clipByPlane(scale(r.n2, -1), -r.w2).clipByPlane(r.n, r.w).clipByPlane(scale(N, -1), -d0);   // inside new, outside old, against the pull
        clips.forEach(function (c) { if (za.polygons.length) za = za.clipByPlane(scale(c[0], -1), -c[1]); });
        if (za.polygons.length) Ad.push(za);
      }
    });
    var removed = R.length ? unionTree(R) : null, added = Ad.length ? unionTree(Ad) : null, body = ctx.body;
    if (removed) body = body.subtract(removed);
    if (added) body = body.union(added);
    return { body: body, faces: idx, pull: N, removed: removed, added: added };
  }
  K.buildDraft = buildDraft; _.buildDraft = buildDraft; K.draftNeutral = draftNeutral; K.draftSide = draftSide;
  // ------------------------------------------------------------------ rfDY: Rib and Intersect
  // Rib { type: 'rib', sketch, thickness, side: 'both' | 'one' | 'other', direction: 'parallel' | 'normal', flip?, extension?: 'linear' | 'natural' }
  // An open sketch (lines, a chain; arcs as their chords) thickened and grown until it meets the body, as SolidWorks:
  // 'parallel' grows in the sketch plane, perpendicular to each line, toward the material (thickness across the plane:
  // 'one' = +n side, 'other' = -n side); 'normal' grows along the sketch normal (thickness in the plane, across the
  // line: 'one' = the line's left). `flip` takes the side opposite the one the body is found on. The free ends of a
  // chain are extended along their lines until they reach the body (both extension types extend lines linearly).
  // Shared by both kernels (OcctKernel builds the same pieces):
  // ribLayout -> { pieces: [{ loop (CCW, sketch coords), a, b (prism span along plane.n), m (unit growth direction), D }] };
  // each piece is the prism of its loop minus the "shadow" of the body inside it (every face of body ∩ piece facing
  // back toward the sketch, swept along m by D): exactly the material between the sketch and the first face it meets.
  function rfDYray(body, o, d) {
    var best = Infinity, ps = body ? body.polygons : [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], n = [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z], den = dot(n, d);
      if (Math.abs(den) < 1e-12) continue;
      var t = (p.plane.w - dot(n, o)) / den;
      if (t < -1e-9 || t >= best) continue;
      var x = add(o, scale(d, t)), vs = p.vertices, k = vs.length, inside = true;
      for (var j = 0; j < k && inside; j++) {
        var a = vs[j].pos, b = vs[(j + 1) % k].pos, e = [b.x - a.x, b.y - a.y, b.z - a.z];
        if (dot(cross(e, [x[0] - a.x, x[1] - a.y, x[2] - a.z]), n) < -1e-9 * (1 + len(e))) inside = false;
      }
      if (inside) best = Math.max(0, t);
    }
    return best;
  }
  function rfDYchains(sketch) {
    var lines = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'text' || e.t === 'point' || K.noProfileEntity(sketch, e)) return;
      entityPolylines(e).forEach(function (pl) { if (!pl.closed && pl.pts.length >= 2) lines.push(pl.pts.map(function (q) { return [q[0], q[1]]; })); });
    });
    var chains = [];
    while (lines.length) {
      var c = lines.shift(), grew = true;
      while (grew) {
        grew = false;
        for (var i = 0; i < lines.length; i++) {
          var q = lines[i], h = c[0], t = c[c.length - 1];
          if (key2(q[0]) === key2(t)) c = c.concat(q.slice(1));
          else if (key2(q[q.length - 1]) === key2(t)) c = c.concat(q.slice().reverse().slice(1));
          else if (key2(q[q.length - 1]) === key2(h)) c = q.slice(0, -1).concat(c);
          else if (key2(q[0]) === key2(h)) c = q.slice().reverse().slice(0, -1).concat(c);
          else continue;
          lines.splice(i, 1); grew = true; break;
        }
      }
      c = c.filter(function (p, j) { return !j || Math.hypot(p[0] - c[j - 1][0], p[1] - c[j - 1][1]) > 1e-9; });
      if (c.length >= 2 && key2(c[0]) !== key2(c[c.length - 1])) chains.push(c);
    }
    return chains;
  }
  function rfDYhull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [];
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); });
    p.slice().reverse().forEach(function (q) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function ribLayout(f, sketch, plane, body) {
    var T = +f.thickness;
    if (!(T > 0)) throw new Error('Rib thickness must be greater than zero.');
    if (!body || !body.polygons.length) throw new Error('A rib needs a solid to meet: create the part first.');
    var chains = rfDYchains(sketch);
    if (!chains.length) throw new Error('Sketch the rib as an open line or chain of lines: a closed contour is not a rib.');
    var side = f.side || 'both', t0 = side === 'one' ? 0 : side === 'other' ? -T : -T / 2, t1 = side === 'one' ? T : side === 'other' ? 0 : T / 2;
    var normal = f.direction === 'normal';
    var bb = body.getBounds(), cen = scale(add(bb.min, bb.max), 0.5), diag = len(sub(bb.max, bb.min));
    function to3(p) { return to3D(plane, p[0], p[1]); }
    function dir3(v) { return add(scale(plane.x, v[0]), scale(plane.y, v[1])); }
    function unit2(v) { var l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
    function ccw(loop) { return signedArea(loop) < 0 ? loop.slice().reverse() : loop; }
    function off(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k]; }
    var pieces = [];
    chains.forEach(function (pts) {
      var D = 4 * (diag + len(sub(to3(pts[0]), cen))) + 1;
      var d0 = unit2([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]), L0 = [-d0[1], d0[0]];
      var mid = to3([(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]), probe = normal ? plane.n : dir3(L0);
      var tp = rfDYray(body, mid, probe), tn = rfDYray(body, mid, scale(probe, -1));
      if (!isFinite(tp) && !isFinite(tn)) throw new Error('The rib sketch does not face the body: draw it where the rib can grow to the part.');
      var s = tp <= tn ? 1 : -1;
      if (f.flip) s = -s;
      // linear extension of the free ends to the body (a normal rib: the nearest wall at any height down to the floor)
      [0, 1].forEach(function (end) {
        var k = end ? pts.length - 1 : 0, kin = end ? pts.length - 2 : 1, P = pts[k];
        var u2 = unit2([P[0] - pts[kin][0], P[1] - pts[kin][1]]), u3 = dir3(u2), P3 = to3(P);
        var sd = end ? u2 : [-u2[0], -u2[1]];   // the end segment's own direction (start to end of the chain)
        var m3 = normal ? scale(plane.n, s) : dir3([-sd[1] * s, sd[0] * s]);
        var depth = rfDYray(body, P3, m3), hs = [0], best = Infinity;
        if (normal && isFinite(depth)) hs = [0, 0.25, 0.5, 0.75, 0.999].map(function (x) { return x * depth; });
        hs.forEach(function (h) { var t = rfDYray(body, add(P3, scale(m3, h)), u3); if (t < best) best = t; });
        if (isFinite(best) && best > 1e-9 && best < D) pts[k] = off(P, u2, best);
      });
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-12) continue;
        var d = unit2([b[0] - a[0], b[1] - a[1]]), L = [-d[1], d[0]];
        if (!normal) pieces.push({ loop: ccw([a, b, off(b, L, s * D), off(a, L, s * D)]), a: t0, b: t1, m: dir3([L[0] * s, L[1] * s]), D: D });
        else pieces.push({ loop: ccw([off(a, L, t0), off(b, L, t0), off(b, L, t1), off(a, L, t1)]), a: Math.min(0, s * D), b: Math.max(0, s * D), m: scale(plane.n, s), D: D });
        if (i + 2 < pts.length) {   // the joint to the next segment
          var c = pts[i + 2], d2 = unit2([c[0] - b[0], c[1] - b[1]]), L2 = [-d2[1], d2[0]], crs = d[0] * d2[1] - d[1] * d2[0];
          if (Math.abs(crs) < 1e-9) continue;
          if (!normal) {
            if (s * crs < 0) { var bis = unit2([L[0] + L2[0], L[1] + L2[1]]); pieces.push({ loop: ccw([b, off(b, L, s * D), off(b, L2, s * D)]), a: t0, b: t1, m: dir3([bis[0] * s, bis[1] * s]), D: D }); }
          } else {   // a mitred corner: the offsets of both lines and where they cross (M: the miter vector)
            var kM = 1 + L[0] * L2[0] + L[1] * L2[1], M = kM > 1e-6 ? [(L[0] + L2[0]) / kM, (L[1] + L2[1]) / kM] : L;
            pieces.push({ loop: ccw(rfDYhull([off(b, L, t0), off(b, L, t1), off(b, L2, t0), off(b, L2, t1), off(b, M, t0), off(b, M, t1)])), a: Math.min(0, s * D), b: Math.max(0, s * D), m: scale(plane.n, s), D: D });
          }
        }
      }
    });
    return { pieces: pieces, side: side, normal: normal };
  }
  // a convex polygon swept along v into a prism (q's outward normal points against v)
  function rfDYsweep(q, v, shared) {
    var pts = q.vertices.map(function (w) { return [w.pos.x, w.pos.y, w.pos.z]; }), top = pts.map(function (p) { return add(p, v); }), polys = [];
    pushPoly(polys, pts, shared);
    pushPoly(polys, top.slice().reverse(), shared);
    for (var i = 0; i < pts.length; i++) { var j = (i + 1) % pts.length; pushPoly(polys, [pts[j], pts[i], top[i], top[j]], shared); }
    return ensureOutward(polys);
  }
  function ribMissError() { return new Error('The rib does not meet the body all along its sketch: flip the material side, change the extrusion direction or extend the sketch.'); }
  function buildRib(f, model, ctx) {
    var sketch = ctx.sketches[f.sketch] || findFeature(model, f.sketch);
    if (!sketch || sketch.type !== 'sketch') throw new Error('Select a sketch for the rib.');
    var plane = resolvePlane(sketch.plane, model, ctx.planes), body = ctx.body;
    var lay = ribLayout(f, sketch, plane, body), parts = [];
    lay.pieces.forEach(function (pc) {
      var P = prism(pc.loop, plane, pc.a, pc.b, f.id), Bp = body.intersect(P), sh = [], vD = scale(pc.m, pc.D);
      Bp.polygons.forEach(function (q) { if (dot([q.plane.normal.x, q.plane.normal.y, q.plane.normal.z], pc.m) < -1e-9) sh.push(rfDYsweep(q, vD, f.id)); });
      var rib = sh.length ? P.subtract(unionTree(sh)) : P;
      var w0 = dot(to3D(plane, pc.loop[0][0], pc.loop[0][1]), pc.m);
      rib.polygons.forEach(function (q) { q.vertices.forEach(function (w) { if (dot([w.pos.x, w.pos.y, w.pos.z], pc.m) - w0 > 0.5 * pc.D) throw ribMissError(); }); });
      if (rib.polygons.length) parts.push(rib);
    });
    if (!parts.length) throw new Error('The rib has no material: its sketch lies inside the body.');
    return unionTree(parts);
  }

  // Intersect { type: 'intersect', bodies?: [i], planes?: ['Front' | planeFeatureId | { ref, offset } | { featureId }], regions?: [keep flags],
  //             merge?: true, mode?: 'create' | 'internal' }
  // The selected solids (f.bodies, else every body) are split into the regions their overlaps make (every in / out
  // pattern of the bodies, each split again by the selected planes, each separate lump its own region); with mode
  // 'internal' the closed voids between them are regions too. Regions come in a fixed order both kernels share
  // (pattern, plane side, then lump centroid x, y, z) and `regions[i] === false` excludes region i. The kept regions
  // replace the selected bodies; with `merge` (the default) kept regions whose boxes meet are joined.
  function ixPlanes(f, model, planesById) {
    return (f.planes || []).map(function (r) {
      var ref = typeof r === 'string' ? { ref: r, offset: 0 } : typeof r === 'number' ? { featureId: r } : r;
      var pl = resolvePlane(ref, model, planesById);
      return { n: pl.n.slice(), w: dot(pl.n, pl.origin) };
    });
  }
  function ixVolCen(csg) {
    var V = 0, c = [0, 0, 0];
    csg.polygons.forEach(function (p) {
      var v = p.vertices, a = [v[0].pos.x, v[0].pos.y, v[0].pos.z];
      for (var i = 1; i + 1 < v.length; i++) {
        var b = [v[i].pos.x, v[i].pos.y, v[i].pos.z], e = [v[i + 1].pos.x, v[i + 1].pos.y, v[i + 1].pos.z], dv = dot(a, cross(b, e)) / 6;
        V += dv; c = add(c, scale(add(add(a, b), e), dv / 4));
      }
    });
    return { volume: V, centroid: Math.abs(V) > 0 ? scale(c, 1 / V) : [0, 0, 0] };
  }
  // the separate lumps of a solid (polygons joined through shared vertices)
  function ixLumps(csg) {
    var ps = csg.polygons, parent = ps.map(function (p, i) { return i; }), owner = {};
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    ps.forEach(function (p, i) {
      p.vertices.forEach(function (w) {
        var k = Math.round(w.pos.x * 1e6) + ',' + Math.round(w.pos.y * 1e6) + ',' + Math.round(w.pos.z * 1e6);
        if (owner[k] == null) owner[k] = i; else { var a = find(i), b = find(owner[k]); if (a !== b) parent[a] = b; }
      });
    });
    var groups = {}, order = [];
    ps.forEach(function (p, i) { var r = find(i); if (!groups[r]) { groups[r] = []; order.push(r); } groups[r].push(p.clone()); });
    return order.map(function (r) { return CSG.fromPolygons(groups[r]); });
  }
  function ixSortKey(tol) {
    return function (a, b) { for (var k = 0; k < 3; k++) { var d = a.centroid[k] - b.centroid[k]; if (Math.abs(d) > tol) return d; } return 0; };
  }
  function ixBox(mn, mx) {
    var polys = [], c = function (i) { return [(i & 1 ? mx : mn)[0], (i & 2 ? mx : mn)[1], (i & 4 ? mx : mn)[2]]; };
    [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]].forEach(function (q) { pushPoly(polys, q.map(c)); });
    return ensureOutward(polys);
  }
  function ixMeet(a, b) {
    if (!a || !b) return false;
    for (var k = 0; k < 3; k++) if (a.min[k] > b.max[k] + 1e-6 || b.min[k] > a.max[k] + 1e-6) return false;
    return true;
  }
  function intersectRegions(bodies, f, model, planesById) {
    var sel = K.cutScope(f, bodies.length), planes = ixPlanes(f, model, planesById);
    if (!sel.length) throw new Error('Select the bodies to intersect.');
    if (sel.length > 6) throw new Error('Intersect takes at most 6 bodies at a time.');
    if (sel.length < 2 && !planes.length) throw new Error('Select at least two bodies, or a body and a plane, to intersect.');
    var B = sel.map(function (i) { return bodies[i]; }), U = unionTree(B.slice()), bb = U.getBounds();
    var size = len(sub(bb.max, bb.min)), eps = 1e-9 * Math.max(1, size * size * size), tol = 1e-6 * Math.max(1, size);
    var cells = [];
    for (var mask = 1; mask < (1 << B.length); mask++) {
      var acc = null, k;
      for (k = 0; k < B.length; k++) if (mask & (1 << k)) acc = acc ? acc.intersect(B[k]) : B[k];
      for (k = 0; k < B.length && acc.polygons.length; k++) if (!(mask & (1 << k))) acc = acc.subtract(B[k]);
      if (acc.polygons.length) cells.push({ csg: acc, cell: mask });
    }
    function split(list) {
      planes.forEach(function (pl) {
        var out = [];
        list.forEach(function (c) { [1, -1].forEach(function (sg) { var h = c.csg.clipByPlane(scale(pl.n, sg), sg * pl.w); if (h.polygons.length) out.push({ csg: h, cell: c.cell, void: c.void }); }); });
        list = out;
      });
      return list;
    }
    function lumpsOf(list) {
      var out = [];
      list.forEach(function (c) {
        var ls = ixLumps(c.csg).map(function (l) { var vc = ixVolCen(l); return { body: l, volume: vc.volume, centroid: vc.centroid, cell: c.cell, void: !!c.void }; })
          .filter(function (r) { return r.volume > eps; });
        ls.sort(ixSortKey(tol));
        out = out.concat(ls);
      });
      return out;
    }
    var regions = lumpsOf(split(cells));
    if (f.mode === 'internal') {
      var voids = lumpsOf([{ csg: ixBox(bb.min, bb.max).subtract(U), cell: 0, void: true }]).filter(function (r) {
        var b = r.body.getBounds();
        for (var q = 0; q < 3; q++) if (b.min[q] < bb.min[q] + tol || b.max[q] > bb.max[q] - tol) return false;
        return true;
      });
      regions = regions.concat(lumpsOf(split(voids.map(function (r) { return { csg: r.body, cell: 0, void: true }; }))));
    }
    if (!regions.length) throw new Error('The selections make no regions.');
    return regions;
  }
  // the kept regions as the new bodies (merge: those whose boxes meet joined); bounds / join / meet are the kernel's own.
  // rfGB: `join` may return null for two regions that must stay apart (they touch only along an edge or at a point:
  // joined they would be one non-manifold solid); they are then kept as separate bodies, as SolidWorks keeps them.
  function ixKeep(regions, f, bounds, join, meet) {
    var keep = regions.filter(function (r, i) { return !(Array.isArray(f.regions) && f.regions[i] === false); });
    if (!keep.length) throw new Error('Every region is excluded: keep at least one.');
    if (f.merge === false) return keep.map(function (r) { return r.body; });
    var groups = [];
    keep.forEach(function (r) {
      var g = r.body, hit = [];
      groups.forEach(function (h, i) { if (meet(bounds(h), bounds(g))) hit.push(i); });
      for (var i = hit.length - 1; i >= 0; i--) { var j = join(groups[hit[i]], g); if (j) { g = j; groups.splice(hit[i], 1); } }
      groups.push(g);
    });
    return groups;
  }
  // rfGB: the solid join of two kept regions, or null when the union touches itself along an edge / at a point (more
  // non-manifold edges than the two had): those stay two bodies
  function ixJoin(a, b) {
    var u = a.union(b);
    if (!K.nonManifoldCount) return u;
    var before = K.nonManifoldCount(a) + K.nonManifoldCount(b);
    return K.nonManifoldCount(u) > before ? null : u;
  }
  function applyIntersect(f, model, ctx) {
    var regions = intersectRegions(ctx.bodies, f, model, ctx.planes);
    var out = ixKeep(regions, f, function (b) { return b.getBounds(); }, ixJoin, ixMeet);
    // rfGB: a kept region that touches itself along an edge or at a point (ixLumps joins lumps through a shared
    // vertex) is zero-thickness geometry: refused in a sentence, as the rebuild refuses a boss that would make it
    var nmIn = 0;
    if (K.nonManifoldCount && !model.sheet) K.cutScope(f, ctx.bodies.length).forEach(function (i) { nmIn += K.nonManifoldCount(ctx.bodies[i]); });
    if (K.nonManifoldCount && !model.sheet && !nmIn) out.forEach(function (o) {
      if (K.nonManifoldCount(o)) throw new Error('Intersect: a region kept would touch itself along an edge or at a point (zero-thickness geometry). Keep or exclude the regions next to it so the solids overlap or stay apart.');
    });
    var sel = K.cutScope(f, ctx.bodies.length), at = Math.min.apply(null, sel), nb = [], nf = [];
    ctx.bodies.forEach(function (b, i) {
      if (i === at) out.forEach(function (o) { nb.push(o); nf.push(f.id); });
      if (sel.indexOf(i) < 0) { nb.push(b); nf.push(ctx.bodyFeatures[i]); }
    });
    ctx.bodies = nb; ctx.bodyFeatures = nf;
    ctx.tools[f.id] = null;
    return regions;
  }
  K.registerFeature('rib', {
    cut: false, build: buildRib,
    script: function (f, v, idVar, optsStr) {
      var t = typeof f.thickness === 'string' ? JSON.stringify(f.thickness) : String(f.thickness);
      return 'var ' + v + ' = p.rib(' + t + ', ' + optsStr({ sketch: '@' + idVar[f.sketch], side: f.side && f.side !== 'both' ? f.side : null, direction: f.direction === 'normal' ? 'normal' : null,
        flip: !!f.flip, extension: f.extension === 'natural' ? 'natural' : null, name: f.name }) + ').last();';
    }
  });
  K.registerFeature('intersect', {
    cut: false,
    script: function (f, v, idVar, optsStr) {
      var o = {};
      if (Array.isArray(f.bodies) && f.bodies.length) o.bodies = f.bodies.slice();
      if (Array.isArray(f.planes) && f.planes.length) o.planes = '@[' + f.planes.map(function (r) {
        var id = typeof r === 'number' ? r : r && r.featureId != null ? r.featureId : null;
        return id != null && idVar[id] ? idVar[id] : JSON.stringify(r);
      }).join(', ') + ']';
      if (Array.isArray(f.regions)) o.regions = f.regions.map(function (x) { return x !== false; });
      if (f.mode === 'internal') o.mode = 'internal';
      if (f.merge === false) o.merge = false;
      o.name = f.name;
      return 'var ' + v + ' = p.intersect(' + optsStr(o) + ').last();';
    }
  });
  K.ribLayout = ribLayout; K.buildRib = buildRib; K.intersectRegions = intersectRegions; K.intersectKeep = ixKeep; K.solidLumps = ixLumps; K.ribRay = rfDYray;
  _.applyIntersect = applyIntersect;
  // ------------------------------------------------------------------ rfFA: reference curves (Features ▸ Curves)
  // Five feature types that change no body (SolidWorks' Curves flyout); rebuild resolves each into a record kept in
  // ctx.planes[f.id], as lane CZ's axes and points are, so the cache, packBuild, the worker and OpenCascade carry it:
  //   { type: 'helix', sketch (one circle), defineBy: 'pitchRev' | 'heightRev' | 'heightPitch' | 'spiral', pitch,
  //     revolutions, height, startAngle (deg, from the sketch's x toward its y), clockwise?, reverse?, taper? (deg),
  //     taperOut? }   counterclockwise = right-handed about the direction the helix grows (the sketch normal, or its
  //     opposite with reverse); a spiral lies in the sketch plane and grows outward (reverse: inward)
  //   { type: 'projCurve', mode: 'sketchOnFaces' | 'sketchOnSketch', sketch, faces: [{ at }] | sketch2, reverse? }
  //   { type: 'compositeCurve', edges: [ref] }   refs: { edge: [x,y,z] }, { sketch, entity, seg? }, { curve: id }
  //   { type: 'xyzCurve', points: [[x,y,z], …], closed? }
  //   { type: 'refPtCurve', points: [ref], closed? }   refs as lane CZ's points ({ point: id }, { vertex }, { sketch, … })
  // -> { refgeo: 'curve', kind, runs: [{ pts, edges, closed }], pts / edges / closed (= runs[0]), length, t0, t1 (unit
  //    tangents at the ends), helix? }. pts lie on the true curve; edges are exact pieces for OpenCascade:
  //    { t: 'line', a, b }, { t: 'arc', a, m, b }, { t: 'circle', c, n, r, x }, { t: 'bez', bez: [[P0, P1, P2, P3], …] }
  //    (a C1 cubic chain), { t: 'helix', o, n, x, r0, a0, du, v1, cone, rev? } (a line in the (u, v) of a cylinder /
  //    cone about n: exact). A curve is a Sweep path (`sweep.path` = its id): see curveSweepPath.
  var FA_TYPES = { helix: 1, projCurve: 1, compositeCurve: 1, xyzCurve: 1, refPtCurve: 1 };
  function isCurveFeature(f) { return !!(f && FA_TYPES[typeof f === 'string' ? f : f.type]); }
  function faNum(x, what) { var v = +x; if (x === '' || x == null || !isFinite(v)) throw refErr(what + ' must be a number.'); return v; }
  function faLen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += len(sub(pts[i], pts[i - 1])); return L; }
  function faTol(pts) { var m = 1; pts.forEach(function (p) { m = Math.max(m, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); }); return 1e-6 * m; }
  // cubic Bézier span helpers
  function bezAt(B, t) { var s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t; return [0, 1, 2].map(function (k) { return a * B[0][k] + b * B[1][k] + c * B[2][k] + d * B[3][k]; }); }
  // the chord-length C1 cubic (Catmull-Rom) through pts, as Bézier spans; closed wraps (pts without the repeat)
  function hermiteBez(P, closed) {
    P = P.slice();
    if (closed && P.length > 2 && len(sub(P[0], P[P.length - 1])) < faTol(P)) P.pop();
    var n = P.length, m = closed ? n : n - 1, d = [], tg = [], i;
    if (n < 2) throw refErr('A curve needs at least two points.');
    for (i = 0; i < m; i++) { d.push(Math.max(1e-12, len(sub(P[(i + 1) % n], P[i])))); }
    for (i = 0; i < n; i++) {
      var pi = i > 0 ? i - 1 : closed ? n - 1 : 0, ni = i < n - 1 ? i + 1 : closed ? 0 : n - 1;
      var dl = i > 0 ? d[i - 1] : closed ? d[m - 1] : 0, dr = i < n - 1 || closed ? d[i % m] : 0;
      tg.push(scale(sub(P[ni], P[pi]), 1 / Math.max(1e-12, dl + dr)));
    }
    var bez = [];
    for (i = 0; i < m; i++) {
      var a = P[i], b = P[(i + 1) % n];
      bez.push([a, add(a, scale(tg[i], d[i] / 3)), sub(b, scale(tg[(i + 1) % n], d[i] / 3)), b]);
    }
    return bez;
  }
  function sampleBez(bez, k) {
    var out = [bez[0][0].slice()];
    bez.forEach(function (B) { for (var j = 1; j <= k; j++) out.push(bezAt(B, j / k)); });
    return out;
  }
  function revEdge(e) {
    switch (e.t) {
      case 'line': return { t: 'line', a: e.b, b: e.a };
      case 'arc': return { t: 'arc', a: e.b, m: e.m, b: e.a };
      case 'circle': return { t: 'circle', c: e.c, n: scale(e.n, -1), r: e.r, x: e.x };
      case 'bez': return { t: 'bez', bez: e.bez.slice().reverse().map(function (B) { return B.slice().reverse(); }) };
      case 'helix': { var h = JSON.parse(JSON.stringify(e)); h.rev = !e.rev; return h; }
    }
    return e;
  }
  function revPiece(pc) { return { pts: pc.pts.slice().reverse(), edges: pc.edges.slice().reverse().map(revEdge) }; }
  // pieces [{ pts, edges }] joined end to end into chains [{ pts, edges, closed }]; strict: a gap is an error
  function chainPieces(pieces, strict, what) {
    var all = []; pieces.forEach(function (p) { all = all.concat(p.pts); });
    var tol = faTol(all), left = pieces.slice(), chains = [];
    while (left.length) {
      var ch = { pts: left[0].pts.slice(), edges: left[0].edges.slice() };
      left.shift();
      for (var grew = true; grew && left.length;) {
        grew = false;
        for (var i = 0; i < left.length && !grew; i++) {
          var pc = left[i], s = pc.pts[0], e = pc.pts[pc.pts.length - 1], hd = ch.pts[0], tl = ch.pts[ch.pts.length - 1];
          if (len(sub(s, tl)) < tol) { ch.pts = ch.pts.concat(pc.pts.slice(1)); ch.edges = ch.edges.concat(pc.edges); grew = true; }
          else if (len(sub(e, tl)) < tol) { var r = revPiece(pc); ch.pts = ch.pts.concat(r.pts.slice(1)); ch.edges = ch.edges.concat(r.edges); grew = true; }
          else if (len(sub(e, hd)) < tol) { ch.pts = pc.pts.slice(0, -1).concat(ch.pts); ch.edges = pc.edges.concat(ch.edges); grew = true; }
          else if (len(sub(s, hd)) < tol) { var r2 = revPiece(pc); ch.pts = r2.pts.slice(0, -1).concat(ch.pts); ch.edges = r2.edges.concat(ch.edges); grew = true; }
          if (grew) left.splice(i, 1);
        }
      }
      if (strict && left.length) {
        var gap = Infinity;
        left.forEach(function (pc) { [pc.pts[0], pc.pts[pc.pts.length - 1]].forEach(function (p) { [ch.pts[0], ch.pts[ch.pts.length - 1]].forEach(function (q) { gap = Math.min(gap, len(sub(p, q))); }); }); });
        throw refErr((what || 'The curve') + ' must be one connected chain: there is a gap of ' + Math.round(gap * 1e4) / 1e4 + ' between the selections.');
      }
      ch.closed = ch.pts.length > 2 && len(sub(ch.pts[0], ch.pts[ch.pts.length - 1])) < tol;
      chains.push(ch);
    }
    return chains;
  }
  function curveRecord(kind, runs, extra) {
    if (!runs.length || runs[0].pts.length < 2) throw refErr('The curve is empty.');
    runs.sort(function (a, b) { return faLen(b.pts) - faLen(a.pts); });
    var r0 = runs[0], P = r0.pts, n = P.length;
    var rec = { refgeo: 'curve', kind: kind, runs: runs, pts: P, edges: r0.edges, closed: !!r0.closed, length: faLen(P),
      t0: norm(sub(P[1], P[0])), t1: norm(sub(P[n - 1], P[n - 2])) };
    Object.keys(extra || {}).forEach(function (k) { rec[k] = extra[k]; });
    return rec;
  }

  // ---- Helix and Spiral
  function helixCircle(f, model, ctx) {
    var sk = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sk || sk.type !== 'sketch') throw refErr('Select a sketch with one circle for the helix.');
    var cs = (sk.entities || []).filter(function (e) { return e.t === 'circle'; });
    if (cs.length !== 1) throw refErr(cs.length ? 'The helix sketch must hold exactly one circle (it has ' + cs.length + ').' : 'The helix sketch has no circle.');
    return { sk: sk, e: cs[0], pl: resolvePlane(sk.plane, model, ctx.planes) };
  }
  // -> { P (pitch), revs, H (height), spiral }
  function helixParams(f) {
    var by = f.defineBy || 'pitchRev', P, n, H;
    if (by === 'heightRev') { H = faNum(f.height, 'The height'); n = faNum(f.revolutions, 'The revolutions'); P = H / n; }
    else if (by === 'heightPitch') { H = faNum(f.height, 'The height'); P = faNum(f.pitch, 'The pitch'); n = H / P; }
    else { P = faNum(f.pitch, 'The pitch'); n = faNum(f.revolutions, 'The revolutions'); H = by === 'spiral' ? 0 : P * n; }
    if (by !== 'spiral' && !(H > 0)) throw refErr('The height must be more than 0.');
    if (!(P > 0)) throw refErr('The pitch must be more than 0.');
    if (!(n > 0)) throw refErr('The number of revolutions must be more than 0.');
    if (n > 2000) throw refErr('A helix of more than 2000 revolutions is not supported.');
    return { P: P, revs: n, H: H, spiral: by === 'spiral' };
  }
  function helixAt(h, th, rs) {
    var z = h.spiral ? 0 : h.P * th / (2 * Math.PI), r = (h.r0 + (h.spiral ? h.kr * th : h.kz * z)) * (rs || 1), phi = h.a0 + h.s * th;
    return add(add(h.o, add(scale(h.x, r * Math.cos(phi)), scale(h.y, r * Math.sin(phi)))), scale(h.d, z));
  }
  function helixDeriv(h, th) {
    var z = h.spiral ? 0 : h.P * th / (2 * Math.PI), r = h.r0 + (h.spiral ? h.kr * th : h.kz * z), phi = h.a0 + h.s * th;
    var dz = h.spiral ? 0 : h.P / (2 * Math.PI), dr = h.spiral ? h.kr : h.kz * dz, c = Math.cos(phi), s = Math.sin(phi);
    return add(add(scale(h.x, dr * c - r * h.s * s), scale(h.y, dr * s + r * h.s * c)), scale(h.d, dz));
  }
  function resolveHelix(f, model, ctx) {
    var hc = helixCircle(f, model, ctx), e = hc.e, pl = hc.pl, q = helixParams(f);
    var n = norm(pl.n), x = norm(pl.x), y = cross(n, x), flipY = dot(y, pl.y) < 0;
    var a0 = (+f.startAngle || 0) * Math.PI / 180;
    var sg = f.reverse && !q.spiral ? -1 : 1, s = (f.clockwise ? -1 : 1) * sg;
    if (flipY) { a0 = -a0; s = -s; }   // a left-handed sketch frame: angles still read in the sketch's own sense
    var T = q.spiral ? 0 : (+f.taper || 0) * Math.PI / 180;
    if (Math.abs(T) >= Math.PI / 2 - 1e-6) throw refErr('The taper angle must be less than 90°.');
    var h = { o: to3D(pl, e.cx, e.cy), d: scale(n, sg), x: x, y: y, r0: +e.r, a0: a0, s: s, P: q.P, revs: q.revs, H: q.H, spiral: q.spiral,
      kz: Math.tan(T) * (f.taperOut ? 1 : -1), kr: q.spiral ? (f.reverse ? -1 : 1) * q.P / (2 * Math.PI) : 0 };
    if (!(h.r0 > 0)) throw refErr('The helix circle has no radius.');
    var thEnd = 2 * Math.PI * q.revs, rEnd = h.r0 + (q.spiral ? h.kr * thEnd : h.kz * q.H);
    if (!(rEnd > 1e-9)) throw refErr(q.spiral ? 'The spiral reaches its centre: use fewer revolutions or a smaller pitch.' : 'The taper closes the helix to its axis: use a smaller taper angle or a shorter helix.');
    var rmax = Math.max(h.r0, rEnd), perRev = Math.max(48, Math.min(360, K.segsForRadius ? K.segsForRadius(rmax) : 72));
    var N = Math.max(8, Math.ceil(perRev * q.revs)), pts = [];
    for (var i = 0; i <= N; i++) pts.push(helixAt(h, thEnd * i / N));
    var length;
    if (!q.spiral && !h.kz) length = q.revs * Math.hypot(2 * Math.PI * h.r0, q.P);
    else {   // Simpson on |dP/dθ|
      var M = 2 * Math.max(64, Math.ceil(128 * q.revs)), acc = 0;
      for (i = 0; i <= M; i++) acc += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * len(helixDeriv(h, thEnd * i / M));
      length = acc * thEnd / M / 3;
    }
    var edges;
    if (!q.spiral) {
      // OpenCascade: a straight line in the (u, v) of a cylinder (cone when tapered) about the sketch normal, exact
      var cone = Math.atan(h.kz * sg);
      edges = [{ t: 'helix', o: h.o, n: n, x: x, r0: h.r0, a0: a0, du: s * thEnd, v1: sg * q.H / Math.cos(cone), cone: cone }];
    } else {
      // a spiral: cubic Hermite spans with the exact derivative, 16 a revolution
      var S = Math.max(4, Math.ceil(16 * q.revs)), bez = [], dt = thEnd / S;
      for (i = 0; i < S; i++) {
        var A = helixAt(h, i * dt), B = helixAt(h, (i + 1) * dt);
        bez.push([A, add(A, scale(helixDeriv(h, i * dt), dt / 3)), sub(B, scale(helixDeriv(h, (i + 1) * dt), dt / 3)), B]);
      }
      edges = [{ t: 'bez', bez: bez }];
    }
    var rec = curveRecord('helix', [{ pts: pts, edges: edges, closed: false }], { helix: h });
    rec.length = length; rec.t0 = norm(helixDeriv(h, 0)); rec.t1 = norm(helixDeriv(h, thEnd));
    return rec;
  }

  // ---- Projected Curve
  function polyOut(poly, p) {
    var n = polyN(poly), pts = polyPts(poly), out = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], inward = cross(n, sub(b, a)), l = len(inward);
      if (l < 1e-12) continue;
      out = Math.max(out, -dot(sub(p, a), inward) / l);
    }
    return out;
  }
  // parameters t (P + t·dir) where the ray meets face F (refFace): exact on planes and cylinders, on the facets otherwise
  function rayFace(F, P, dir, tol) {
    var ts = [];
    if (F.kind === 'plane') {
      var den = dot(F.n, dir);
      if (Math.abs(den) < 1e-12) return ts;
      var t = (F.w - dot(F.n, P)) / den, X = add(P, scale(dir, t));
      if (F.polys.some(function (q) { return polyScore(q, X) < tol; })) ts.push(t);
      return ts;
    }
    var s = F.surf;
    if (F.kind === 'cyl' && s && s.r > 0) {
      var d = norm(s.d), w = sub(P, s.o), wp = sub(w, scale(d, dot(w, d))), vp = sub(dir, scale(d, dot(dir, d)));
      var a = dot(vp, vp), b = 2 * dot(wp, vp), c = dot(wp, wp) - s.r * s.r, disc = b * b - 4 * a * c;
      if (a < 1e-18 || disc < 0) return ts;
      [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].forEach(function (t2) {
        var X2 = add(P, scale(dir, t2)), sag = s.r * 0.05 + tol;
        if (F.polys.some(function (q) { return polyOut(q, X2) < tol && Math.abs(dot(polyN(q), X2) - q.plane.w) < sag; })) ts.push(t2);
      });
      return ts;
    }
    F.polys.forEach(function (q) {
      var nq = polyN(q), dn = dot(nq, dir);
      if (Math.abs(dn) < 1e-12) return;
      var t3 = (q.plane.w - dot(nq, P)) / dn;
      if (polyOut(q, add(P, scale(dir, t3))) < tol * 1e-3) ts.push(t3);
    });
    return ts;
  }
  // a sketch's entities as pieces of 2D points: straight sides one by one, every other entity whole
  var FA_STRAIGHT = { line: 1, rect: 1, crect: 1, poly: 1, polyline: 1, rect3: 1, crect3: 1, parallelogram: 1 };
  function sketchPieces2(sk) {
    var out = [];
    (sk.entities || []).forEach(function (e) {
      if (e.construction || e.t === 'text' || e.t === 'point' || K.noProfileEntity(sk, e)) return;
      entityPolylines(e).forEach(function (pl) {
        var q = pl.closed ? pl.pts.concat([pl.pts[0]]) : pl.pts;
        if (FA_STRAIGHT[e.t] && !e.bulges) { for (var i = 0; i + 1 < q.length; i++) out.push({ pts: [q[i], q[i + 1]], straight: true, e: e }); }
        else out.push({ pts: q, straight: false, e: e });
      });
    });
    if (!out.length) throw refErr('The sketch to project has no lines or curves.');
    return out;
  }
  function densify2(pts, step) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (var j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    return out;
  }
  // samples -> runs of hits (null = a miss splits the run) -> pieces { pts, edges }
  function hitRuns(samples, pieces) {
    var run = [];
    function flush() {
      if (run.length >= 2) pieces.push({ pts: run, edges: [run.length === 2 ? { t: 'line', a: run[0], b: run[1] } : { t: 'bez', bez: hermiteBez(run, false) }] });
      run = [];
    }
    samples.forEach(function (p) { if (p) run.push(p); else flush(); });
    flush();
  }
  function resolveProjCurve(f, model, ctx) {
    var sk = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sk || sk.type !== 'sketch') throw refErr('Select the sketch to project.');
    var pl = resolvePlane(sk.plane, model, ctx.planes), pcs = sketchPieces2(sk), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    pcs.forEach(function (pc) { pc.pts.forEach(function (p) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }); });
    var step = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 400), pieces = [];
    if ((f.mode || 'sketchOnFaces') === 'sketchOnSketch') {
      var sk2 = (ctx.sketches && ctx.sketches[f.sketch2]) || findFeature(model, f.sketch2);
      if (!sk2 || sk2.type !== 'sketch' || sk2.id === sk.id) throw refErr('Select a second sketch to intersect with.');
      var pl2 = resolvePlane(sk2.plane, model, ctx.planes), n1 = norm(pl.n), ev = [dot(n1, pl2.x), dot(n1, pl2.y)];
      if (Math.hypot(ev[0], ev[1]) < 1e-9) throw refErr('The two sketches are on parallel planes: their extrusions do not cross.');
      // the second sketch's entities as exact 2D primitives: segments, and circles / arcs
      var prims = [];
      (sk2.entities || []).forEach(function (e) {
        if (e.construction || e.t === 'text' || e.t === 'point' || K.noProfileEntity(sk2, e)) return;
        if (e.t === 'circle' || e.t === 'arc') { prims.push({ t: 'c', c: [e.cx, e.cy], r: e.r, a0: e.t === 'arc' ? e.a0 : null, a1: e.a1 }); return; }
        entityPolylines(e).forEach(function (q) { var Q = q.closed ? q.pts.concat([q.pts[0]]) : q.pts; for (var i = 0; i + 1 < Q.length; i++) prims.push({ t: 's', a: Q[i], b: Q[i + 1] }); });
      });
      if (!prims.length) throw refErr('The second sketch has no lines or curves.');
      var hitsAt = function (q0) {
        var ts = [];
        prims.forEach(function (pr) {
          if (pr.t === 's') {
            var ab = [pr.b[0] - pr.a[0], pr.b[1] - pr.a[1]], den = ev[0] * -ab[1] + ev[1] * ab[0];   // q0 + t·ev = a + u·ab
            if (Math.abs(den) < 1e-14) return;
            var w = [pr.a[0] - q0[0], pr.a[1] - q0[1]], t = (w[0] * -ab[1] + w[1] * ab[0]) / den, u = (ev[0] * w[1] - ev[1] * w[0]) / den;
            if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
          } else {
            var wc = [q0[0] - pr.c[0], q0[1] - pr.c[1]], A = ev[0] * ev[0] + ev[1] * ev[1], B = 2 * (wc[0] * ev[0] + wc[1] * ev[1]), C = wc[0] * wc[0] + wc[1] * wc[1] - pr.r * pr.r, D = B * B - 4 * A * C;
            if (D < 0) return;
            [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)].forEach(function (t2) {
              if (pr.a0 != null) {
                var ang = Math.atan2(wc[1] + t2 * ev[1], wc[0] + t2 * ev[0]) * 180 / Math.PI, a0 = pr.a0, a1 = pr.a1;
                while (a1 <= a0) a1 += 360;
                while (ang < a0 - 1e-9) ang += 360;
                if (ang > a1 + 1e-9) return;
              }
              ts.push(t2);
            });
          }
        });
        return ts;
      };
      pcs.forEach(function (pc) {
        var prev = null, samples = densify2(pc.pts, step).map(function (p2) {
          var P = to3D(pl, p2[0], p2[1]), ts = hitsAt(to2D(pl2, P));
          if (!ts.length) { prev = null; return null; }
          var ref = prev == null ? 0 : prev, best = ts[0];
          ts.forEach(function (t) { if (Math.abs(t - ref) < Math.abs(best - ref)) best = t; });
          prev = best;
          return add(P, scale(n1, best));
        });
        hitRuns(samples, pieces);
      });
    } else {
      var faces = (f.faces || []).map(function (r) { return refFace(Array.isArray(r) ? r : r.at || r.face, ctx); });
      if (!faces.length) throw refErr('Select the faces to project the sketch onto.');
      var dir = scale(norm(pl.n), f.reverse ? -1 : 1), tol = refTol(ctx) * 0.02;
      pcs.forEach(function (pc) {
        var samples = densify2(pc.pts, step).map(function (p2) {
          var P = to3D(pl, p2[0], p2[1]), best = Infinity;
          faces.forEach(function (F) { rayFace(F, P, dir, tol).forEach(function (t) { if (t >= -tol && t < best) best = t; }); });
          return best < Infinity ? add(P, scale(dir, best)) : null;
        });
        hitRuns(samples, pieces);
      });
    }
    if (!pieces.length) throw refErr(f.mode === 'sketchOnSketch' ? 'The two sketches’ extrusions do not meet.' : 'The sketch does not project onto the selected faces' + (f.reverse ? '' : ' (try Reverse projection)') + '.');
    return curveRecord('projCurve', chainPieces(pieces, false));
  }

  // ---- Composite Curve
  function edgePiece(r, ctx, model) {
    if (r.curve != null) {
      var g = ctx.planes && ctx.planes[r.curve];
      if (!g || g.refgeo !== 'curve') throw refErr('A referenced curve (feature ' + r.curve + ') is missing or failed to rebuild.');
      return { pts: g.pts.slice(), edges: g.edges.slice() };
    }
    if (r.sketch != null) {
      var s = refSketch(r, ctx, model), e = s.e, P3 = function (p) { return to3D(s.pl, p[0], p[1]); };
      if (r.seg != null) { var sd = polySide(e, r.seg); return { pts: [P3(sd[0]), P3(sd[1])], edges: [{ t: 'line', a: P3(sd[0]), b: P3(sd[1]) }] }; }
      if (e.t === 'line') { var A = P3([e.x1, e.y1]), B = P3([e.x2, e.y2]); return { pts: [A, B], edges: [{ t: 'line', a: A, b: B }] }; }
      var pls = entityPolylines(e);
      if (!pls.length) throw refErr('The sketch entity has no curve.');
      var q = pls[0].closed ? pls[0].pts.concat([pls[0].pts[0]]) : pls[0].pts, pts = q.map(P3);
      if (e.t === 'circle') return { pts: pts, edges: [{ t: 'circle', c: P3([e.cx, e.cy]), n: s.pl.n.slice(), r: e.r, x: norm(sub(pts[0], P3([e.cx, e.cy]))) }] };
      if (e.t === 'arc') {
        var a0 = e.a0 * Math.PI / 180, a1 = e.a1 * Math.PI / 180;
        while (a1 <= a0) a1 += 2 * Math.PI;
        var at = function (an) { return P3([e.cx + e.r * Math.cos(an), e.cy + e.r * Math.sin(an)]); };
        pts[0] = at(a0); pts[pts.length - 1] = at(a1);
        return { pts: pts, edges: [{ t: 'arc', a: at(a0), m: at((a0 + a1) / 2), b: at(a1) }] };
      }
      return { pts: pts, edges: [{ t: 'bez', bez: hermiteBez(pts, false) }] };
    }
    if (r.edge) {
      var ed = refEdge(r.edge, ctx);
      if (!ed.circle) return { pts: [ed.line.a, ed.line.b], edges: [{ t: 'line', a: ed.line.a, b: ed.line.b }] };
      // a circular edge: the sharp chords on its circle connected to the picked one, in order
      var C = ed.circle, tol = refTol(ctx) * 0.02, on = function (p) { var v = sub(p, C.c), ax = dot(v, C.d); return Math.abs(ax) < tol && Math.abs(len(sub(v, scale(C.d, ax))) - C.r) < tol; };
      var segs = refEdges(ctx).filter(function (x) { return on(x.a) && on(x.b); }), chain = [ed.seg.a, ed.seg.b], used = [ed.seg];
      var near = function (p, q2) { return len(sub(p, q2)) < tol; };
      for (var grew = true; grew;) {
        grew = false;
        segs.forEach(function (x) {
          if (used.indexOf(x) >= 0) return;
          var tl = chain[chain.length - 1], hd = chain[0];
          if (near(x.a, tl) && !near(x.b, chain[chain.length - 2])) { chain.push(x.b); used.push(x); grew = true; }
          else if (near(x.b, tl) && !near(x.a, chain[chain.length - 2])) { chain.push(x.a); used.push(x); grew = true; }
          else if (near(x.b, hd) && !near(x.a, chain[1])) { chain.unshift(x.a); used.push(x); grew = true; }
          else if (near(x.a, hd) && !near(x.b, chain[1])) { chain.unshift(x.b); used.push(x); grew = true; }
        });
        if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) break;
      }
      if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) { chain[chain.length - 1] = chain[0]; return { pts: chain, edges: [{ t: 'circle', c: C.c, n: C.d, r: C.r, x: norm(sub(chain[0], C.c)) }] }; }
      return { pts: chain, edges: [{ t: 'arc', a: chain[0], m: arcMid(C, chain[0], chain[chain.length - 1], chain[Math.floor(chain.length / 2)]), b: chain[chain.length - 1] }] };
    }
    throw refErr('Pick model edges, sketch lines / arcs or curves.');
  }
  // the point on circle C halfway (by angle) from a to b, on the side through `via`
  function arcMid(C, a, b, via) {
    var x = norm(sub(a, C.c)), y = cross(C.d, x), ang = function (p) { var v = sub(p, C.c); var t = Math.atan2(dot(v, y), dot(v, x)); return t < 0 ? t + 2 * Math.PI : t; };
    var tb = ang(b), tv = ang(via), half = tv <= tb ? tb / 2 : (tb - 2 * Math.PI) / 2;
    return add(C.c, add(scale(x, C.r * Math.cos(half)), scale(y, C.r * Math.sin(half))));
  }
  function resolveComposite(f, model, ctx) {
    var refs = f.edges || [];
    if (!refs.length) throw refErr('Select the edges, sketch entities or curves to join.');
    return curveRecord('compositeCurve', chainPieces(refs.map(function (r) { return edgePiece(r, ctx, model); }), true, 'A composite curve'));
  }

  // ---- Curve Through XYZ Points / Reference Points
  function splineRecord(kind, P, closed) {
    if (P.length < 2) throw refErr('A curve through points needs at least two points.');
    for (var i = 1; i < P.length; i++) if (len(sub(P[i], P[i - 1])) < faTol(P)) throw refErr('Points ' + i + ' and ' + (i + 1) + ' are the same point.');
    var cl = !!closed && P.length > 2, bez = hermiteBez(P, cl), pts = sampleBez(bez, 12);
    var edges = P.length === 2 ? [{ t: 'line', a: P[0], b: P[1] }] : [{ t: 'bez', bez: bez }];
    if (P.length === 2) pts = [P[0], P[1]];
    return curveRecord(kind, [{ pts: pts, edges: edges, closed: cl }]);
  }
  function resolveXyz(f) {
    var P = (f.points || []).map(function (p, i) {
      if (!Array.isArray(p) || p.length < 3) throw refErr('Point ' + (i + 1) + ' needs X, Y and Z.');
      return [faNum(p[0], 'X of point ' + (i + 1)), faNum(p[1], 'Y of point ' + (i + 1)), faNum(p[2], 'Z of point ' + (i + 1))];
    });
    return splineRecord('xyzCurve', P, f.closed);
  }
  function resolveRefPtCurve(f, model, ctx) {
    return splineRecord('refPtCurve', (f.points || []).map(function (r) { return refPoint(r, ctx, model); }), f.closed);
  }

  function resolveCurve(f, model, ctx) {
    switch (f.type) {
      case 'helix': return resolveHelix(f, model, ctx);
      case 'projCurve': return resolveProjCurve(f, model, ctx);
      case 'compositeCurve': return resolveComposite(f, model, ctx);
      case 'xyzCurve': return resolveXyz(f, model, ctx);
      case 'refPtCurve': return resolveRefPtCurve(f, model, ctx);
    }
    throw refErr('Unknown curve type ' + f.type + '.');
  }
  // the 3D polyline Kernel.buildSweep follows along curve feature `id`: { pts, start, end (true ends: the profile's
  // offset from them is kept) }. A helix is sampled with its radius scaled by (Δθ/2) / sin(Δθ/2), so every chord is as
  // long as the true arc and the mitred sweep's volume is area × the true length.
  function curveSweepPath(id, ctx) {
    var g = ctx.planes && ctx.planes[id];
    if (!g || g.refgeo !== 'curve') throw refErr('The path curve (feature ' + id + ') is missing or failed to rebuild.');
    if (g.runs && g.runs.length > 1) throw refErr('The path curve is in ' + g.runs.length + ' separate pieces; a sweep path must be one connected curve.');
    var pts = g.pts, h = g.helix;
    if (h) {
      var N = pts.length - 1, th = 2 * Math.PI * h.revs, dt = th / N, k = (dt / 2) / Math.sin(dt / 2);
      pts = [];
      for (var i = 0; i <= N; i++) pts.push(helixAt(h, th * i / N, k));
    }
    return { pts: pts, start: g.pts[0], end: g.pts[g.pts.length - 1] };
  }
  // the loop's points with a full circle made area-true (scaled about its centre to the circle's own area), so a
  // circle swept along a curve has the exact volume; any other loop as it is
  function areaTrueLoop(l, profile) {
    var seg = l.seg, C = seg && seg.length && seg[0] >= 0 && seg.every(function (k) { return k === seg[0]; }) ? (profile.curves || [])[seg[0]] : null;
    if (!C || !C.full) return l.pts;
    var A = Math.abs(signedArea(l.pts));
    if (!(A > 0)) return l.pts;
    var k = Math.sqrt(Math.PI * C.r * C.r / A);
    return l.pts.map(function (p) { return [C.c[0] + (p[0] - C.c[0]) * k, C.c[1] + (p[1] - C.c[1]) * k]; });
  }
  // generateScript lines (registered: the default case of generateScript)
  function faR4(p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }
  function faRefOut(r, idVar) {
    var parts = [];
    Object.keys(r || {}).forEach(function (k) {
      var x = r[k];
      if ((k === 'point' || k === 'sketch' || k === 'curve') && typeof x === 'number' && idVar[x]) parts.push(k + ': ' + idVar[x]);
      else if (Array.isArray(x)) parts.push(k + ': ' + JSON.stringify(faR4(x)));
      else parts.push(k + ': ' + JSON.stringify(x));
    });
    return '{ ' + parts.join(', ') + ' }';
  }
  var FA_SCRIPT = {
    helix: function (f, v, idVar, optsStr) {
      var o = { defineBy: f.defineBy || 'pitchRev', name: f.name };
      ['pitch', 'revolutions', 'height', 'startAngle', 'taper'].forEach(function (k) { if (f[k] != null && f[k] !== '' && (k !== 'startAngle' && k !== 'taper' || +f[k] !== 0 || typeof f[k] === 'string')) o[k] = typeof f[k] === 'string' && f[k].charAt(0) === '=' ? f[k] : +f[k]; });
      ['clockwise', 'reverse', 'taperOut'].forEach(function (k) { if (f[k]) o[k] = true; });
      return 'var ' + v + ' = p.helix(' + (idVar[f.sketch] || f.sketch) + ', ' + optsStr(o) + ');';
    },
    projCurve: function (f, v, idVar, optsStr) {
      var o = { mode: f.mode || 'sketchOnFaces', name: f.name };
      if (o.mode === 'sketchOnSketch') o.sketch2 = '@' + (idVar[f.sketch2] || f.sketch2);
      else o.faces = (f.faces || []).map(function (r) { return faR4(Array.isArray(r) ? r : r.at); });
      if (f.reverse) o.reverse = true;
      return 'var ' + v + ' = p.projectedCurve(' + (idVar[f.sketch] || f.sketch) + ', ' + optsStr(o) + ');';
    },
    compositeCurve: function (f, v, idVar, optsStr) {
      return 'var ' + v + ' = p.compositeCurve([' + (f.edges || []).map(function (r) { return faRefOut(r, idVar); }).join(', ') + '], ' + optsStr({ name: f.name }) + ');';
    },
    xyzCurve: function (f, v, idVar, optsStr) {
      return 'var ' + v + ' = p.xyzCurve(' + JSON.stringify((f.points || []).map(function (p) { return p.map(Number); })) + ', ' + optsStr({ closed: !!f.closed, name: f.name }) + ');';
    },
    refPtCurve: function (f, v, idVar, optsStr) {
      return 'var ' + v + ' = p.refPointCurve([' + (f.points || []).map(function (r) { return faRefOut(r, idVar); }).join(', ') + '], ' + optsStr({ closed: !!f.closed, name: f.name }) + ');';
    }
  };
  Object.keys(FA_TYPES).forEach(function (t) { K.registerFeature(t, { cut: false, script: FA_SCRIPT[t] }); });
  // .sldcrv-style text (Curve Through XYZ Points ▸ Browse / Save): one point a line, "x y z", each value optionally
  // with a unit (mm, cm, m, in, ", ft); values without a unit are in the part's units
  var FA_UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, '"': 25.4, inch: 25.4, ft: 304.8 };
  function parseCurveFile(text, units) {
    var toU = units === 'in' ? 1 / 25.4 : 1, pts = [];
    String(text || '').split(/\r?\n/).forEach(function (line, li) {
      line = line.replace(/[#;].*$/, '').trim();
      if (!line) return;
      var parts = line.split(/[\s,]+/).filter(Boolean);
      if (parts.length < 3) throw refErr('Line ' + (li + 1) + ' needs X, Y and Z.');
      pts.push(parts.slice(0, 3).map(function (s) {
        var m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z"]*)$/i.exec(s);
        if (!m) throw refErr('Line ' + (li + 1) + ': "' + s + '" is not a number.');
        var u = m[2].toLowerCase();
        if (u && !FA_UNITS[u]) throw refErr('Line ' + (li + 1) + ': unknown unit "' + m[2] + '".');
        return u ? +m[1] * FA_UNITS[u] * toU : +m[1];
      }));
    });
    return pts;
  }
  function formatCurveFile(points, units) {
    var u = units === 'in' ? 'in' : 'mm';
    return points.map(function (p) { return p.map(function (x) { return (Math.round(+x * 1e8) / 1e8) + u; }).join(' '); }).join('\r\n') + '\r\n';
  }
  K.isCurveFeature = isCurveFeature; K.resolveCurve = resolveCurve; K.curveSweepPath = curveSweepPath; K.parseCurveFile = parseCurveFile; K.formatCurveFile = formatCurveFile;   // rfFA
  K.helixAt = helixAt; K.hermiteBez = hermiteBez; K.CURVE_TYPES = Object.keys(FA_TYPES);
  _.resolveCurve = resolveCurve; _.curveSweepPath = curveSweepPath; _.areaTrueLoop = areaTrueLoop;
  // ------------------------------------------------------------------ rfDZ: Wrap
  // { type: 'wrap', sketch, face: [x, y, z], mode: 'emboss' | 'deboss' | 'scribe', thickness, reverse? } — SolidWorks'
  // Insert ▸ Features ▸ Wrap, Analytical method: the sketch's closed contours (Sketch Text outlines and their counters
  // included) are wrapped onto a cylindrical, conical or planar face keeping arc length along the surface. Emboss adds
  // and deboss removes material a constant `thickness` normal to the face; scribe splits the face along the wrapped
  // contours (no volume change; the faces inside are their own faces, owned by the Wrap feature). `reverse` turns the
  // normal round. The face is picked by a point on it (re-resolved on the body before the feature, like every pick).
  // Cylinder: the sketch plane is parallel to the axis; sketch coordinates map to (θ = w / R, z) where w is the
  // distance across the axis in the sketch plane, z along it, θ measured from the line where the sketch plane faces
  // the cylinder. Cone: the sketch plane is tangent to the cone; the cone is developed (unrolled) about its apex.
  // Plane: the sketch is projected onto the face. Wrapped solids are faceted in strips of constant θ whose edges sit on
  // the true surface; the caps carry exact surface records, so a straight-sided contour on a cylinder or a plane gives
  // exact volumes (massProps).
  var WRAP_MODES = { emboss: 1, deboss: 1, scribe: 1 };
  function wrapLayout(f, model, ctx) {
    var mode = f.mode || 'emboss';
    if (!WRAP_MODES[mode]) throw new Error('Wrap: unknown wrap type "' + mode + '".');
    var sk = (ctx.sketches && ctx.sketches[f.sketch]) || findFeature(model, f.sketch);
    if (!sk || sk.type !== 'sketch') throw new Error('Wrap: select a sketch (Source Sketch).');
    var plane = resolvePlane(sk.plane, model, ctx.planes || {});
    var profile = sk.profile || sketchProfile(sk);
    checkProfile(profile);
    if (!profile.loops.length) throw new Error('Wrap: the sketch has no closed contour.');
    var at = f.face && !Array.isArray(f.face) && f.face.at ? f.face.at : f.face;   // (an array's own .at is a method)
    if (!Array.isArray(at) || at.length !== 3) throw new Error('Wrap: pick the face to wrap onto (Face for Wrap Sketch).');
    at = at.map(Number);
    var d = mode === 'scribe' ? 0 : +f.thickness;
    if (mode !== 'scribe' && !(d > 0)) throw new Error('Wrap: Thickness must be greater than zero.');
    var body = needBody(ctx), pk = polyAt(body, at, refTol(ctx));
    if (!pk) throw refErr('Wrap: the face is gone (nothing at ' + fmtPt(at) + ').');
    var rf = refFace(at, ctx), flip = f.reverse ? -1 : 1, pn = polyN(pk), size = 0;
    profile.loops.forEach(function (l) { l.pts.forEach(function (p) { size = Math.max(size, Math.abs(p[0]), Math.abs(p[1])); }); });
    var L = { mode: mode, d: d, plane: plane, profile: profile, kind: rf.kind, id: f.id, rec: function () { return null; } };
    if (rf.kind === 'plane') {
      var nf = rf.n, sg = dot(plane.n, nf);
      L.n = nf; L.w = rf.w; L.sigma = flip;
      L.eps = mode === 'scribe' ? Math.max(1e-6, 1e-4 * size) : 0.05 * d;
      if (Math.abs(sg) > 1 - 1e-9) {
        // parallel: a prism of the sketch's own loops (exact arcs) on the sketch plane moved onto the face
        L.prism = { origin: sub(plane.origin, scale(nf, dot(nf, plane.origin) - rf.w)), x: plane.x, y: plane.y, n: plane.n };
        L.prismSign = (sg > 0 ? 1 : -1) * flip;
      }
      L.toST = function (p) { return p; };
      L.G = function (s, t, h) { var P = to3D(plane, s, t); return add(sub(P, scale(nf, dot(nf, P) - rf.w)), scale(nf, flip * h)); };
      L.dsMax = Infinity;
    } else if (rf.kind === 'cyl' || (rf.kind === 'cone' && Math.abs(rf.surf.k || 0) < 1e-12)) {
      var S = rf.surf, o = S.o.slice(), dd = norm(S.d), R = S.r;
      if (Math.abs(dot(plane.n, dd)) > 1e-6) throw new Error('Wrap: the sketch plane must be parallel to the cylinder\'s axis.');
      var s0 = dot(sub(plane.origin, o), plane.n);
      if (Math.abs(s0) < 1e-9 * (1 + R)) s0 = dot(sub(at, o), plane.n);
      var e1 = scale(plane.n, s0 >= 0 ? 1 : -1), e2 = cross(dd, e1);
      var rel = sub(at, o), er = norm(sub(rel, scale(dd, dot(rel, dd)))), sig = (dot(pn, er) >= 0 ? 1 : -1) * flip;
      if (mode !== 'scribe' && sig < 0 && d >= R) throw new Error('Wrap: the thickness reaches the axis of the cylinder.');
      var segsB = _.segsForRadius(R), segsT = _.segsForRadius(R + d), sag = Math.max(R * (1 - Math.cos(Math.PI / segsB)), (R + d) * (1 - Math.cos(Math.PI / segsT)));
      L.kind = 'cyl'; L.o = o; L.dd = dd; L.e1 = e1; L.e2 = e2; L.R = R; L.sigma = sig;
      L.eps = Math.min(Math.max(2 * sag, 1e-6 * (1 + R)), 0.25 * R);   // past the facets of both the body and the wrap
      L.dsMax = 2 * Math.PI / segsT;
      L.toST = function (p) { var r = sub(to3D(plane, p[0], p[1]), o); return [dot(r, e2) / R, dot(r, dd)]; };
      L.G = function (th, z, h) { var c = Math.cos(th), s = Math.sin(th), rr = R + sig * h; return [o[0] + dd[0] * z + rr * (c * e1[0] + s * e2[0]), o[1] + dd[1] * z + rr * (c * e1[1] + s * e2[1]), o[2] + dd[2] * z + rr * (c * e1[2] + s * e2[2])]; };
      L.rec = function (h) { return { t: 'cyl', o: o.slice(), d: dd.slice(), r: R + sig * h }; };
    } else if (rf.kind === 'cone') {
      var C = rf.surf, co = C.o.slice(), cd = norm(C.d), k = C.k, q = Math.sqrt(1 + k * k), z0 = -C.r / k, A = add(co, scale(cd, z0));
      var nd = dot(plane.n, cd);
      if (Math.abs(nd) < 1e-9) throw new Error('Wrap: the sketch plane must be tangent to the cone.');
      // the tangent plane's normal is ±(e1 − k·d)/q for the generator direction e1
      var sgc = -(nd > 0 ? 1 : -1) * (k > 0 ? 1 : -1), v1 = add(scale(plane.n, sgc * q), scale(cd, k));
      var ce1 = norm(sub(v1, scale(cd, dot(v1, cd)))), ce2 = cross(cd, ce1), sk0 = k > 0 ? 1 : -1;
      var g0 = scale(add(cd, scale(ce1, k)), sk0 / q), sb = Math.abs(k) / q;
      var crel = sub(at, co), cer = norm(sub(crel, scale(cd, dot(crel, cd)))), csig = (dot(pn, sub(cer, scale(cd, k))) >= 0 ? 1 : -1) * flip;
      var rmax = 0;
      L.kind = 'cone'; L.o = co; L.dd = cd; L.e1 = ce1; L.e2 = ce2; L.k = k; L.sigma = csig; L.apex = A;
      L.toST = function (p) {
        var r = sub(to3D(plane, p[0], p[1]), A), rg = dot(r, g0), wl = dot(r, ce2), rho = Math.hypot(rg, wl);
        return [Math.atan2(wl, rg) / sb, z0 + sk0 * rho / q];
      };
      L.G = function (th, z, h) {
        var c = Math.cos(th), s = Math.sin(th), er2 = add(scale(ce1, c), scale(ce2, s)), rr = C.r + k * z;
        return add(add(add(co, scale(cd, z)), scale(er2, rr)), scale(sub(er2, scale(cd, k)), csig * h / q));
      };
      L.rec = function (h) { return { t: 'cone', o: co.slice(), d: cd.slice(), r: C.r + csig * h * q, k: k }; };
      profile.loops.forEach(function (l) { l.pts.forEach(function (p) { var z = L.toST(p)[1]; rmax = Math.max(rmax, Math.abs(C.r + k * z)); }); });
      var segC = _.segsForRadius(rmax + d);
      L.dsMax = 2 * Math.PI / segC;
      L.maxEdge = Math.max(1e-6, (rmax + d) * L.dsMax);
      L.eps = Math.min(Math.max(2 * (rmax + d) * (1 - Math.cos(Math.PI / segC)), 1e-6 * (1 + rmax)), 0.25 * Math.max(rmax, 1e-9));
    } else throw new Error('Wrap: the face must be cylindrical, conical or planar.');
    // the loops in parameter space (s = θ or the sketch's u, t = z or v), counter-clockwise, with their nesting
    L.loops = profile.loops.map(function (l) {
      var pts = l.pts;
      if (L.maxEdge) {
        var fine = [];
        pts.forEach(function (p, i) {
          var nx = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(nx[0] - p[0], nx[1] - p[1]) / L.maxEdge));
          for (var j = 0; j < n; j++) fine.push([p[0] + (nx[0] - p[0]) * j / n, p[1] + (nx[1] - p[1]) * j / n]);
        });
        pts = fine;
      }
      var st = pts.map(L.toST);
      if (signedArea(st) < 0) st.reverse();
      var lo = Infinity, hi = -Infinity;
      st.forEach(function (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); });
      if (L.kind !== 'plane' && hi - lo >= 2 * Math.PI - 1e-9) throw new Error('Wrap: the sketch is longer than the way round the face.');
      return { st: st, pts: l.pts, seg: l.seg, depth: l.depth || 0, hole: !!l.hole };
    });
    return L;
  }
  // strip lines (s values) for one loop: its ends, every s where an edge runs along t (exact walls there), and as many
  // between as dsMax needs
  function wrapZones(st, dsMax) {
    var lo = Infinity, hi = -Infinity, base = [];
    st.forEach(function (p, i) {
      lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]);
      var q = st[(i + 1) % st.length];
      if (Math.abs(q[0] - p[0]) <= 1e-12 * (1 + Math.abs(p[0])) && Math.abs(q[1] - p[1]) > 0) base.push(p[0]);
    });
    base.push(lo, hi);
    base.sort(function (a, b) { return a - b; });
    var u = [];
    base.forEach(function (s) { if (!u.length || s - u[u.length - 1] > 1e-11 * (1 + Math.abs(s))) u.push(s); });
    if (u.length < 2) throw new Error('Wrap: a contour has no width.');
    var Z = [u[0]];
    for (var i = 0; i + 1 < u.length; i++) {
      var n = isFinite(dsMax) ? Math.max(1, Math.ceil((u[i + 1] - u[i]) / dsMax - 1e-9)) : 1;
      for (var j = 1; j <= n; j++) Z.push(j === n ? u[i + 1] : u[i] + (u[i + 1] - u[i]) * j / n);
    }
    return Z;
  }
  // one loop (parameter space, CCW) wrapped between heights h0 < h1 as a closed CSG solid: caps cut into strips
  // (chordal facets, planar for cylinders, cones and planes), walls split at the strip lines; a wall piece that is not
  // planar (an edge slanted across a strip) is four triangles to its centre
  function wrapLoopSolid(L, st, h0, h1, shared, recs) {
    var Z = wrapZones(st, L.dsMax), memo = {}, polys = [], G = L.G;
    var loop = st.map(function (p) {
      for (var j = 0; j < Z.length; j++) if (Math.abs(p[0] - Z[j]) < 1e-10 * (1 + Math.abs(Z[j]))) return [Z[j], p[1]];
      return p;
    }).filter(function (p, j, l) { var q = l[(j + 1) % l.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-13; });
    function zoneOf(s) { var k = 0; while (k + 2 < Z.length && Z[k + 1] <= s) k++; return k; }
    function key(p) { return p[0] + ',' + p[1]; }
    function cross2(a, b, z) {
      var ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb + '|' + z : kb + '|' + ka + '|' + z;
      if (!memo[k]) { var p = ka < kb ? a : b, q2 = p === a ? b : a, t = (z - p[0]) / (q2[0] - p[0]); memo[k] = [z, p[1] + (q2[1] - p[1]) * t]; }
      return memo[k];
    }
    function crossings(a, b) {
      var lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]), out = [];
      Z.forEach(function (z) { if (z > lo && z < hi) out.push(cross2(a, b, z)); });
      return a[0] <= b[0] ? out : out.reverse();
    }
    function at(p, h, k) {
      var A = G(Z[k], p[1], h), B = G(Z[k + 1], p[1], h), f = (p[0] - Z[k]) / (Z[k + 1] - Z[k]);
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
    }
    function put(pts, surf) { var pg = _.poly(pts, shared); if (pg) { if (surf) pg.surf = surf; polys.push(pg); } }
    var w0 = recs && recs[0] ? { s: recs[0] } : null, w1 = recs && recs[1] ? { s: recs[1] } : null;
    triangulate(loop).forEach(function (t) {
      var tri = [loop[t[0]], loop[t[1]], loop[t[2]]], lo = Infinity, hi = -Infinity;
      tri.forEach(function (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); });
      var cuts = [-Infinity].concat(Z.filter(function (z) { return z > lo && z < hi; }), [Infinity]);
      for (var c = 0; c + 1 < cuts.length; c++) {
        var za = cuts[c], zb = cuts[c + 1], pc = [];
        for (var i = 0; i < 3; i++) {
          var a = tri[i], b = tri[(i + 1) % 3];
          if (a[0] >= za && a[0] <= zb) pc.push(a);
          crossings(a, b).forEach(function (x) { if (x[0] === za || x[0] === zb) pc.push(x); });
        }
        if (pc.length < 3) continue;
        var sm = 0; pc.forEach(function (p) { sm += p[0]; });
        var zone = zoneOf(sm / pc.length);
        put(pc.map(function (p) { return at(p, h1, zone); }), w1);
        put(pc.map(function (p) { return at(p, h0, zone); }).reverse(), w0);
      }
    });
    for (var i = 0; i < loop.length; i++) {
      var a = loop[i], b = loop[(i + 1) % loop.length], pts = [a].concat(crossings(a, b), [b]);
      for (var k = 0; k + 1 < pts.length; k++) {
        var p = pts[k], q = pts[k + 1], zone = zoneOf((p[0] + q[0]) / 2);
        var p0 = at(p, h0, zone), q0 = at(q, h0, zone), p1 = at(p, h1, zone), q1 = at(q, h1, zone);
        var nrm = cross(sub(q0, p0), sub(p1, p0)), nl = len(nrm), sz = Math.max(len(sub(q0, p0)), len(sub(p1, p0)), 1e-12);
        if (nl > 1e-14 && Math.abs(dot(nrm, sub(q1, p0))) / nl < 1e-10 * sz) { put([p0, q0, q1, p1]); continue; }
        var cm = at([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], (h0 + h1) / 2, zone);
        put([p0, q0, cm]); put([q0, q1, cm]); put([q1, p1, cm]); put([p1, p0, cm]);
      }
    }
    return ensureOutward(polys);
  }
  // the wrapped solid of every contour between heights h[0] < h[1] (holes cut, islands added back)
  function wrapTool(L, h, shared) {
    var dlt = 0.5 * Math.max(L.eps, 1e-9);
    function solid(l, a, b) {
      if (L.prism) {
        var cv = l.seg && L.profile.curves ? l.seg.map(function (k) { return k >= 0 ? L.profile.curves[k] : null; }) : null;
        var x = L.prismSign * a, y = L.prismSign * b;
        return prism(l.pts, L.prism, Math.min(x, y), Math.max(x, y), shared, cv);
      }
      return wrapLoopSolid(L, l.st, a, b, shared, [L.rec(a), L.rec(b)]);
    }
    var outers = [], holes = [], islands = [];
    L.loops.forEach(function (l) {
      if (l.depth % 2 === 1) holes.push(solid(l, h[0] - dlt, h[1] + dlt));
      else (l.depth ? islands : outers).push(solid(l, h[0], h[1]));
    });
    if (!outers.length) throw new Error('Wrap: the sketch has no closed contour.');
    var acc = CSG.fromPolygons([].concat.apply([], outers.map(function (s) { return s.polygons; })));
    if (holes.length) acc = acc.subtract(unionAll(holes));
    if (islands.length) acc = acc.union(CSG.fromPolygons([].concat.apply([], islands.map(function (s) { return s.polygons; }))));
    return acc;
  }
  function wrapHeights(L) {
    return L.mode === 'emboss' ? [-L.eps, L.d] : L.mode === 'deboss' ? [-L.d, L.eps] : [-L.eps, L.eps];
  }
  // scribe: the body split along the wrapped contours. The body ∩ tool and body − tool keep the body's own surface on
  // each side of the contours; the tool's walls between them cancel and are dropped. The surface inside belongs to the
  // Wrap feature (shared) and its curved facets get a copy of their surface record marked w: <feature id>, so it is a
  // face of its own (meshFromBody, surfKey) with real edges round it (bodyEdges); the geometry is unchanged.
  function scribeSplit(body, tool, T, id) {
    var inside = body.intersect(tool), outside = body.subtract(tool), keep = [], from = [], to = [];
    function mark(p) {
      p.shared = id;
      if (!p.surf || !p.surf.s) return;
      var i = from.indexOf(p.surf);
      if (i < 0) {
        var w = {}, s = {}, k;
        for (k in p.surf) if (Object.prototype.hasOwnProperty.call(p.surf, k) && k.charAt(0) !== '_') w[k] = p.surf[k];
        for (k in p.surf.s) if (Object.prototype.hasOwnProperty.call(p.surf.s, k) && k.charAt(0) !== '_') s[k] = p.surf.s[k];
        s.w = id; w.s = s;
        from.push(p.surf); to.push(w); i = from.length - 1;
      }
      p.surf = to[i];
    }
    outside.polygons.forEach(function (p) { if (p.shared !== T) keep.push(p); });
    inside.polygons.forEach(function (p) { if (p.shared !== T) { mark(p); keep.push(p); } });
    return CSG.fromPolygons(keep);
  }
  // buildWrap(f, model, ctx) -> { body, tool }: ctx.body is the body the face is on (kernel-rebuild.js picks it)
  function buildWrap(f, model, ctx) {
    var L = wrapLayout(f, model, ctx), body = ctx.body, h = wrapHeights(L);
    if (L.mode === 'scribe') {
      var T = { scribe: f.id };
      return { body: scribeSplit(body, wrapTool(L, h, T), T, f.id), tool: null };
    }
    var tool = wrapTool(L, h, f.id), nb = L.mode === 'deboss' ? body.subtract(tool) : body.union(tool);
    if (Math.abs(nb.volume() - body.volume()) < 1e-12 * Math.max(1, Math.abs(body.volume())) && ctx.warnings) {
      ctx.warnings[f.id] = (ctx.warnings[f.id] ? ctx.warnings[f.id] + ' ' : '') + 'Wrap ' + (L.mode === 'deboss' ? 'removed' : 'added') + ' no material. Try "Reverse direction".';
    }
    return { body: nb, tool: tool };
  }
  K.registerFeature('wrap', {
    cut: false,   // (kernel-rebuild.js isCut: a deboss cuts)
    build: function (f, model, ctx) { if ((f.mode || 'emboss') === 'scribe') return null; var L = wrapLayout(f, model, ctx); return wrapTool(L, wrapHeights(L), f.id); },
    script: function (f, v, idVar, optsStr) {
      var o = { sketch: '@' + idVar[f.sketch], face: (f.face || []).map(function (x) { return Math.round(+x * 1e4) / 1e4; }), mode: f.mode || 'emboss' };
      if ((f.mode || 'emboss') !== 'scribe') o.thickness = f.thickness;
      if (f.reverse) o.reverse = true;
      o.name = f.name;
      return 'var ' + v + ' = p.wrap(' + optsStr(o) + ').last();';
    }
  });
  K.wrapLayout = wrapLayout; K.wrapHeights = wrapHeights; K.wrapZones = wrapZones; K.buildWrap = buildWrap; _.buildWrap = buildWrap;
})(Kernel, Kernel._);
