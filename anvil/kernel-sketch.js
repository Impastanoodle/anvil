// kernel-sketch.js — Anvil kernel, sketches: sketch entities -> polylines (tessellation settings TESS), profiles (closed
// loops with nesting), 2D sketch geometry utilities, 2D entity editing (mirror, pattern, trim) and sketch dimensions
// (Smart Dimension). Loaded after kernel.js (vector helpers through Kernel._); uses `_.fmt` from kernel-script.js at run
// time. No DOM.
(function (K, _) {
  'use strict';
  var cross = _.cross;   // kernel.js
  // fmt (kernel-script.js) are called through _.name: that file loads later

  // ------------------------------------------------------------------ sketch entities -> polylines
  // Tessellation of circles and arcs (true curves, cloud-2026-09-25p). Curves stay exact in the analytic records the
  // profiles and solids carry; the polygon mesh that booleans and display use follows a chord tolerance: the
  // sagitta r·(1 − cos(π/n)) of each chord of a full circle stays under chordTol (mm), with n a multiple of 8
  // between minSegs and maxSegs: a circle has vertices on its quadrant points (exact extents), and circles of
  // different sizes share every 45° vertex, which keeps lofts and shells between them free of long needle facets
  // (with multiples of 4 some tolerances left cracks in the Funnel's shell). The old rule, clamp(round(8√r), 16, 72),
  // was a sagitta of about 0.077 mm.
  // `legacy: true` restores the pre-true-curves meshes exactly (clamp(round(8√r), 16, 72) segments, 48 revolve rings
  // per turn, mitred draft offsets on arcs): old polygonal results can be reproduced bit for bit.
  var TESS = { chordTol: 0.05, minSegs: 16, maxSegs: 128, legacy: false };
  function segsForRadius(r) {
    if (TESS.legacy) return Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(Math.max(r, 0.01)))));
    r = Math.max(+r || 0, 0.01);
    var c = 1 - TESS.chordTol / r, n = c <= -1 ? TESS.minSegs : Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, c))) - 1e-9);
    n = Math.ceil(n / 8) * 8;
    return Math.max(TESS.minSegs, Math.min(TESS.maxSegs, n));
  }
  // setTessellation({ chordTol?, minSegs?, maxSegs?, legacy? }) -> the settings now in force (rebuild cache keys
  // include them); setTessellation('default') restores the defaults
  function setTessellation(o) {
    if (o === 'default') o = { chordTol: 0.05, minSegs: 16, maxSegs: 128, legacy: false };
    o = o || {};
    if (o.legacy != null) TESS.legacy = !!o.legacy;
    if (o.chordTol != null) { if (!(+o.chordTol > 0)) throw new Error('Chord tolerance must be positive.'); TESS.chordTol = +o.chordTol; }
    if (o.minSegs != null) TESS.minSegs = Math.max(8, Math.ceil((+o.minSegs || 8) / 8) * 8);
    if (o.maxSegs != null && !(+o.maxSegs >= 4)) throw new Error('maxSegs must be at least 4.');
    if (o.maxSegs != null) TESS.maxSegs = Math.max(TESS.minSegs, +o.maxSegs | 0);
    return { chordTol: TESS.chordTol, minSegs: TESS.minSegs, maxSegs: TESS.maxSegs, legacy: TESS.legacy };
  }
  function tessKey() { return TESS.legacy ? 'legacy' : TESS.chordTol + '/' + TESS.minSegs + '/' + TESS.maxSegs; }

  function arcPoints(cx, cy, r, a0, a1, segs) {
    var pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = a0 + (a1 - a0) * i / segs;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  // Returns [{pts:[[u,v],...], closed:bool}] for drawing and profiling. Construction points return [].
  function entityPolylines(e) {
    switch (e.t) {
      case 'line': return [{ pts: [[e.x1, e.y1], [e.x2, e.y2]], closed: false }];
      case 'rect': return [{ pts: [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]], closed: true }];
      case 'crect': {
        var hw = e.w / 2, hh = e.h / 2;
        return [{ pts: [[e.cx - hw, e.cy - hh], [e.cx + hw, e.cy - hh], [e.cx + hw, e.cy + hh], [e.cx - hw, e.cy + hh]], closed: true }];
      }
      case 'circle': {
        var n = segsForRadius(e.r);
        var pts = arcPoints(e.cx, e.cy, e.r, 0, Math.PI * 2, n);
        pts.pop();
        return [{ pts: pts, closed: true }];
      }
      case 'poly': {
        var rot = (e.rot || 0) * Math.PI / 180, ps = [];
        for (var i = 0; i < e.n; i++) {
          var a = rot + Math.PI * 2 * i / e.n;
          ps.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]);
        }
        return [{ pts: ps, closed: true }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.sqrt(dx * dx + dy * dy);
        var r = e.w / 2;
        if (L < 1e-9) return entityPolylines({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(r) / 2));
        var a2 = arcPoints(e.x2, e.y2, r, ang - Math.PI / 2, ang + Math.PI / 2, segs);
        var a1 = arcPoints(e.x1, e.y1, r, ang + Math.PI / 2, ang + 3 * Math.PI / 2, segs);
        // arc end points are the tangent vertices where the straight sides begin; keep them all
        return [{ pts: a2.concat(a1), closed: true }];
      }
      case 'arc': {
        var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180;
        var sweep = Math.abs(s1 - s0);
        var sg = Math.max(4, Math.round(segsForRadius(e.r) * sweep / (Math.PI * 2)));
        return [{ pts: arcPoints(e.cx, e.cy, e.r, s0, s1, sg), closed: false }];
      }
      case 'polyline': return [{ pts: e.pts.map(function (p) { return [p[0], p[1]]; }), closed: !!e.closed }];
      case 'point': return [];
    }
    return [];
  }

  // The exact circles and arcs behind an entity's polyline: [{ c: [u, v], r, a0, a1, full, step }] (angles in radians,
  // a0 < a1; step is the angle each chord of the tessellation spans). Profiles use them to tell which loop segments
  // are chords of a true curve (see curveSegments).
  function entityCurves(e) {
    switch (e.t) {
      case 'circle': return e.r > 0 ? [{ c: [e.cx, e.cy], r: e.r, a0: 0, a1: Math.PI * 2, full: true, step: Math.PI * 2 / segsForRadius(e.r) }] : [];
      case 'arc': {
        var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180, sweep = Math.abs(s1 - s0);
        if (!(e.r > 0) || sweep < 1e-12) return [];
        var sg = Math.max(4, Math.round(segsForRadius(e.r) * sweep / (Math.PI * 2)));
        return [{ c: [e.cx, e.cy], r: e.r, a0: Math.min(s0, s1), a1: Math.max(s0, s1), full: sweep >= Math.PI * 2 - 1e-12, step: sweep / sg }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.sqrt(dx * dx + dy * dy), r = e.w / 2;
        if (!(r > 0)) return [];
        if (L < 1e-9) return entityCurves({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(r) / 2));
        return [{ c: [e.x2, e.y2], r: r, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2, full: false, step: Math.PI / segs },
          { c: [e.x1, e.y1], r: r, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2, full: false, step: Math.PI / segs }];
      }
    }
    return [];
  }
  // The segment i -> i+1 of a closed loop is a chord of curve C when both ends lie on C's circle, the chord spans C's
  // tessellation step and its mid-angle is inside C's range. -> array (one entry per segment) of indices into
  // `curves`, -1 for straight segments; null when no segment is on a curve.
  function curveSegments(pts, curves) {
    if (!curves.length) return null;
    var n = pts.length, out = null;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      for (var k = 0; k < curves.length; k++) {
        var C = curves[k], tol = 1e-7 * Math.max(1, C.r);
        var rp = Math.hypot(p[0] - C.c[0], p[1] - C.c[1]), rq = Math.hypot(q[0] - C.c[0], q[1] - C.c[1]);
        if (Math.abs(rp - C.r) > tol || Math.abs(rq - C.r) > tol) continue;
        if (Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 2 * C.r * Math.sin(C.step / 2)) > 1e-6 * Math.max(1, C.r)) continue;
        if (!C.full) {
          var am = Math.atan2((p[1] + q[1]) / 2 - C.c[1], (p[0] + q[0]) / 2 - C.c[0]);
          while (am < C.a0 - 1e-9) am += Math.PI * 2;
          while (am > C.a1 + 1e-9) am -= Math.PI * 2;
          if (am < C.a0 - 1e-9 || am > C.a1 + 1e-9) continue;
        }
        if (!out) { out = []; for (var j = 0; j < n; j++) out.push(-1); }
        out[i] = k;
        break;
      }
    }
    return out;
  }

  // Characteristic points for snapping (endpoints, centers, midpoints).
  function entitySnapPoints(e) {
    switch (e.t) {
      case 'line': return [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]];
      case 'rect': return [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h], [e.x + e.w / 2, e.y + e.h / 2]];
      case 'crect': return [[e.cx, e.cy], [e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
      case 'circle': return [[e.cx, e.cy], [e.cx + e.r, e.cy], [e.cx - e.r, e.cy], [e.cx, e.cy + e.r], [e.cx, e.cy - e.r]];
      case 'poly': return [[e.cx, e.cy]].concat(entityPolylines(e)[0].pts);
      case 'slot': return [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]];
      case 'arc': { var pl = entityPolylines(e)[0].pts; return [[e.cx, e.cy], pl[0], pl[pl.length - 1]]; }
      case 'polyline': return e.pts.slice();
      case 'point': return [[e.x, e.y]];
    }
    return [];
  }

  // ------------------------------------------------------------------ profiles: closed loops with nesting
  function signedArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function pointInPoly(pt, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function key2(p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4); }

  function dedupeLoop(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      if (Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7) out.push(p);
    }
    return out;
  }

  // Chain open segments (lines, arcs, open polylines) into closed loops by matching endpoints.
  function chainSegments(chains) {
    var loops = [], warnings = [];
    var used = chains.map(function () { return false; });
    var byKey = {};
    chains.forEach(function (c, i) {
      var k0 = key2(c[0]), k1 = key2(c[c.length - 1]);
      (byKey[k0] = byKey[k0] || []).push(i);
      (byKey[k1] = byKey[k1] || []).push(i);
    });
    for (var s = 0; s < chains.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      var pts = chains[s].slice();
      var startKey = key2(pts[0]);
      var guard = 0, closed = false;
      while (guard++ < chains.length + 1) {
        var endKey = key2(pts[pts.length - 1]);
        if (endKey === startKey && pts.length > 2) { closed = true; break; }
        var cands = (byKey[endKey] || []).filter(function (i) { return !used[i]; });
        if (!cands.length) break;
        var ni = cands[0];
        used[ni] = true;
        var next = chains[ni];
        if (key2(next[0]) !== endKey) next = next.slice().reverse();
        pts = pts.concat(next.slice(1));
      }
      if (closed) {
        pts.pop();
        loops.push(dedupeLoop(pts));
      } else {
        warnings.push('Open contour ignored (' + pts.length + ' points).');
      }
    }
    return { loops: loops, warnings: warnings };
  }

  // Proper crossing of segments a-b and c-d (interiors only; touching at an end is not a crossing) -> point | null.
  function segCross(a, b, c, d) {
    var rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    var den = rx * sy - ry * sx;
    if (Math.abs(den) <= 1e-12 * Math.max(1, Math.hypot(rx, ry) * Math.hypot(sx, sy))) return null; // parallel
    var qx = c[0] - a[0], qy = c[1] - a[1];
    var t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den, eps = 1e-9;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
    return [a[0] + rx * t, a[1] + ry * t];
  }

  // First point where two non-adjacent edges of a closed loop cross, or null for a simple polygon. O(n²).
  function loopSelfCrossing(pts) {
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent through the wrap-around
        var x = segCross(a, b, pts[j], pts[(j + 1) % n]);
        if (x) return x;
      }
    }
    return null;
  }

  // Throws when any loop of a profile crosses itself; builders call it before making solids from the loops.
  function checkProfile(profile) {
    (profile.loops || []).forEach(function (l) {
      if (l.cross) throw new Error('Sketch profile crosses itself near (' + _.fmt(l.cross[0]) + ', ' + _.fmt(l.cross[1]) + '). Trim or move the entities so the contour does not self-intersect.');
    });
  }

  // -> { loops: [{pts, hole, depth, cross?}], warnings }. A loop with `cross` (a self-intersection point) is kept for
  // display but every feature built from the profile errors through checkProfile.
  // Loops made of chords of circles and arcs keep the exact curves: profile.curves lists them ({ c, r, a0, a1, full,
  // step }, sketch coordinates) and loop.seg[i] is the curve index of segment i -> i+1 (-1 straight), absent when the
  // loop has no curved segment.
  function sketchProfile(sketch) {
    var loops = [], chains = [], warnings = [], curves = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction) return;
      curves = curves.concat(entityCurves(e));
      entityPolylines(e).forEach(function (pl) {
        if (pl.closed) loops.push(dedupeLoop(pl.pts));
        else chains.push(pl.pts);
      });
    });
    if (chains.length) {
      var ch = chainSegments(chains);
      loops = loops.concat(ch.loops);
      warnings = warnings.concat(ch.warnings);
    }
    var zero = 0, out = [];
    loops.forEach(function (l) {
      var cross = l.length >= 3 ? loopSelfCrossing(l) : null;
      if (!cross && (l.length < 3 || Math.abs(signedArea(l)) <= 1e-9)) { zero++; return; }
      var pts = signedArea(l) < 0 ? l.slice().reverse() : l;
      var loop = { pts: pts, hole: false, depth: 0 };
      if (cross) loop.cross = cross;
      var seg = curveSegments(pts, curves);
      if (seg) loop.seg = seg;
      out.push(loop);
    });
    if (zero) warnings.push(zero === 1 ? '1 zero-area contour was ignored.' : zero + ' zero-area contours were ignored.');
    for (var i = 0; i < out.length; i++) {
      var depth = 0, probe = out[i].pts[0];
      // use the centroid of the first edge so a shared vertex does not confuse containment
      probe = [(out[i].pts[0][0] + out[i].pts[1][0]) / 2, (out[i].pts[0][1] + out[i].pts[1][1]) / 2];
      for (var j = 0; j < out.length; j++) {
        if (i === j) continue;
        if (pointInPoly(probe, out[j].pts)) depth++;
      }
      out[i].depth = depth;
      out[i].hole = depth % 2 === 1;
    }
    var prof = { loops: out, warnings: warnings };
    if (out.some(function (l) { return l.seg; })) prof.curves = curves;
    return prof;
  }

  // ------------------------------------------------------------------ 2D sketch geometry utilities
  // Offset a closed polygon by d (positive = outward for a CCW loop) using mitred corners.
  function offsetLoop(pts, d) {
    var ccw = signedArea(pts) >= 0, n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
      var l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
      e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
      // outward normal of a CCW edge is the right-hand normal
      var s = ccw ? 1 : -1;
      var n1 = [e1[1] * s, -e1[0] * s], n2 = [e2[1] * s, -e2[0] * s];
      var bis = [n1[0] + n2[0], n1[1] + n2[1]], bl = Math.hypot(bis[0], bis[1]);
      if (bl < 1e-9) { out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]); continue; }
      bis = [bis[0] / bl, bis[1] / bl];
      var cosHalf = bis[0] * n1[0] + bis[1] * n1[1];
      var m = d / Math.max(cosHalf, 0.2); // mitre length, clamped for very sharp corners
      out.push([p1[0] + bis[0] * m, p1[1] + bis[1] * m]);
    }
    return out;
  }

  // Replace vertex idx of a closed polyline with a tangent arc of radius r (returns a new point list).
  function filletPolyline(pts, idx, r, segs) {
    var n = pts.length, p0 = pts[(idx + n - 1) % n], p1 = pts[idx], p2 = pts[(idx + 1) % n];
    var a = [p0[0] - p1[0], p0[1] - p1[1]], b = [p2[0] - p1[0], p2[1] - p1[1]];
    var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    if (la < 1e-9 || lb < 1e-9) return pts;
    a = [a[0] / la, a[1] / la]; b = [b[0] / lb, b[1] / lb];
    var cosT = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])), theta = Math.acos(cosT);
    if (theta < 0.02 || theta > Math.PI - 0.02) return pts;
    var t = r / Math.tan(theta / 2);
    if (t > la - 1e-6 || t > lb - 1e-6) throw new Error('Fillet radius too large for this corner.');
    var pa = [p1[0] + a[0] * t, p1[1] + a[1] * t], pb = [p1[0] + b[0] * t, p1[1] + b[1] * t];
    var bis = [a[0] + b[0], a[1] + b[1]], bl = Math.hypot(bis[0], bis[1]);
    var c = [p1[0] + bis[0] / bl * (r / Math.sin(theta / 2)), p1[1] + bis[1] / bl * (r / Math.sin(theta / 2))];
    var a0 = Math.atan2(pa[1] - c[1], pa[0] - c[0]), a1 = Math.atan2(pb[1] - c[1], pb[0] - c[0]);
    var sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    segs = segs || Math.max(3, Math.round(Math.abs(sweep) / (Math.PI / 16)));
    var arc = [];
    for (var s = 0; s <= segs; s++) { var ang = a0 + sweep * s / segs; arc.push([c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)]); }
    var out = pts.slice(0, idx).concat(arc, pts.slice(idx + 1));
    return out;
  }

  // ------------------------------------------------------------------ 2D entity editing: mirror, pattern, trim
  function reflect2(p, P, D) {
    var t = (p[0] - P[0]) * D[0] + (p[1] - P[1]) * D[1];
    return [2 * (P[0] + D[0] * t) - p[0], 2 * (P[1] + D[1] * t) - p[1]];
  }
  // Mirror axis spec: 'x' | 'y' (sketch axes), a line entity index, or { x1, y1, x2, y2 } -> { p, d } with d unit.
  function mirrorAxis(spec, entities) {
    var p = [0, 0], d;
    if (spec === 'x' || spec == null) d = [1, 0];
    else if (spec === 'y') d = [0, 1];
    else {
      var l = typeof spec === 'number' ? (entities || [])[spec] : spec;
      if (!l || (l.t && l.t !== 'line') || l.x1 == null) throw new Error('Mirror axis must be a sketch line.');
      p = [l.x1, l.y1]; d = [l.x2 - l.x1, l.y2 - l.y1];
    }
    var L = Math.hypot(d[0], d[1]);
    if (L < 1e-9) throw new Error('Mirror axis has zero length.');
    return { p: p, d: [d[0] / L, d[1] / L] };
  }
  function mirrorEntity(e, axis) {
    var P = axis.p, D = axis.d, out;
    function m(x, y) { return reflect2([x, y], P, D); }
    var axisAligned = Math.abs(D[0]) < 1e-9 || Math.abs(D[1]) < 1e-9;
    var phi = Math.atan2(D[1], D[0]) * 180 / Math.PI;
    switch (e.t) {
      case 'line': { var a = m(e.x1, e.y1), b = m(e.x2, e.y2); out = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; break; }
      case 'circle': { var c = m(e.cx, e.cy); out = { t: 'circle', cx: c[0], cy: c[1], r: e.r }; break; }
      case 'point': { var q = m(e.x, e.y); out = { t: 'point', x: q[0], y: q[1] }; break; }
      case 'slot': { var s1 = m(e.x1, e.y1), s2 = m(e.x2, e.y2); out = { t: 'slot', x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], w: e.w }; break; }
      case 'arc': {
        // angles reflect as 2φ − a; the reflected sweep runs the other way, so swap to keep a0 < a1
        var ca = m(e.cx, e.cy), r0 = 2 * phi - e.a1, r1 = 2 * phi - e.a0;
        while (r0 < 0) { r0 += 360; r1 += 360; }
        while (r0 >= 360) { r0 -= 360; r1 -= 360; }
        out = { t: 'arc', cx: ca[0], cy: ca[1], r: e.r, a0: r0, a1: r1 };
        break;
      }
      case 'poly': { var cp = m(e.cx, e.cy); out = { t: 'poly', cx: cp[0], cy: cp[1], r: e.r, n: e.n, rot: 2 * phi - (e.rot || 0) }; break; }
      case 'rect':
      case 'crect':
      case 'polyline': {
        var pl = entityPolylines(e)[0];
        var pts = pl.pts.map(function (q) { return m(q[0], q[1]); });
        if (e.t === 'rect' && axisAligned) {
          var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
          out = { t: 'rect', x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: e.w, h: e.h };
        } else if (e.t === 'crect' && axisAligned) {
          var cc = m(e.cx, e.cy);
          out = { t: 'crect', cx: cc[0], cy: cc[1], w: e.w, h: e.h };
        } else out = { t: 'polyline', pts: pts, closed: pl.closed };
        break;
      }
      default: return null;
    }
    if (e.construction) out.construction = true;
    return out;
  }
  function translateEntity(e, dx, dy) {
    var out = JSON.parse(JSON.stringify(e));
    switch (e.t) {
      case 'line': case 'slot': out.x1 += dx; out.y1 += dy; out.x2 += dx; out.y2 += dy; break;
      case 'rect': case 'point': out.x += dx; out.y += dy; break;
      case 'crect': case 'circle': case 'poly': case 'arc': out.cx += dx; out.cy += dy; break;
      case 'polyline': out.pts = e.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); break;
    }
    return out;
  }

  // ------------------------------------------------------------------ sketch dimensions (Smart Dimension)
  // A dimension is { e: entityIndex, k: kind, i?: subIndex, off?: placement, ang?: placement } stored in sketch.dims.
  // Kinds: line 'len' | 'dx' | 'dy'; rect / crect 'w' | 'h' (i = edge 0 bottom, 1 right, 2 top, 3 left); circle 'dia';
  // arc / poly 'r'; slot 'len' | 'w'; polyline 'seg' (i = segment). Values are driven by the entity geometry and
  // setDimValue edits the entity so the dimension reads the new value (no constraint solver: one entity moves).
  function dimGeometry(e, d) {
    if (!e || !d) return null;
    var k = d.k;
    function linear(P, Q, dir) {
      var L = Math.hypot(dir[0], dir[1]);
      if (L < 1e-12) return null;
      dir = [dir[0] / L, dir[1] / L];
      var v = (Q[0] - P[0]) * dir[0] + (Q[1] - P[1]) * dir[1];
      if (v < 0) { v = -v; dir = [-dir[0], -dir[1]]; }
      return { type: 'linear', P: P, Q: Q, dir: dir, value: v, prefix: '' };
    }
    function radial(C, r, prefix) { return { type: 'radial', C: C, r: r, value: prefix === '⌀' ? 2 * r : r, prefix: prefix }; }
    function rectCorners(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
    function rectDim(c) {
      var i = d.i | 0;
      if (k === 'w') return i === 2 ? linear(c[3], c[2], [1, 0]) : linear(c[0], c[1], [1, 0]);
      if (k === 'h') return i === 1 ? linear(c[1], c[2], [0, 1]) : linear(c[0], c[3], [0, 1]);
      return null;
    }
    switch (e.t) {
      case 'line':
        if (k === 'len') return linear([e.x1, e.y1], [e.x2, e.y2], [e.x2 - e.x1, e.y2 - e.y1]);
        if (k === 'dx') return linear([e.x1, e.y1], [e.x2, e.y2], [1, 0]);
        if (k === 'dy') return linear([e.x1, e.y1], [e.x2, e.y2], [0, 1]);
        return null;
      case 'rect': return rectDim(rectCorners(e.x, e.y, e.w, e.h));
      case 'crect': return rectDim(rectCorners(e.cx - e.w / 2, e.cy - e.h / 2, e.w, e.h));
      case 'circle': return k === 'dia' ? radial([e.cx, e.cy], e.r, '⌀') : null;
      case 'arc': case 'poly': return k === 'r' ? radial([e.cx, e.cy], e.r, 'R') : null;
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
        if (k === 'len') return linear([e.x1, e.y1], [e.x2, e.y2], [dx, dy]);
        if (k === 'w') {
          var n = L < 1e-12 ? [0, 1] : [-dy / L, dx / L];
          return linear([e.x1 + n[0] * e.w / 2, e.y1 + n[1] * e.w / 2], [e.x1 - n[0] * e.w / 2, e.y1 - n[1] * e.w / 2], n);
        }
        return null;
      }
      case 'polyline': {
        if (k !== 'seg') return null;
        var n2 = e.pts.length, i2 = d.i | 0;
        if (i2 < 0 || i2 >= (e.closed ? n2 : n2 - 1)) return null;
        var A = e.pts[i2], B = e.pts[(i2 + 1) % n2];
        return linear([A[0], A[1]], [B[0], B[1]], [B[0] - A[0], B[1] - A[1]]);
      }
    }
    return null;
  }
  function dimValue(e, d) { var g = dimGeometry(e, d); return g ? g.value : null; }
  // Change the entity so the dimension reads `v`. Throws on invalid values; returns the entity.
  function setDimValue(e, d, v) {
    v = +v;
    if (!(v > 0) || !isFinite(v)) throw new Error('Dimension must be a positive number.');
    var g = dimGeometry(e, d);
    if (!g) throw new Error('That dimension no longer applies to the entity.');
    var k = d.k;
    switch (e.t) {
      case 'line': {
        if (k === 'len') { e.x2 = e.x1 + g.dir[0] * v; e.y2 = e.y1 + g.dir[1] * v; }
        else if (k === 'dx') e.x2 = e.x1 + (e.x2 >= e.x1 ? v : -v);
        else e.y2 = e.y1 + (e.y2 >= e.y1 ? v : -v);
        break;
      }
      case 'rect': if (k === 'w') { if ((d.i | 0) === 3) e.x += e.w - v; e.w = v; } else { if ((d.i | 0) === 2) e.y += e.h - v; e.h = v; } break;
      case 'crect': if (k === 'w') e.w = v; else e.h = v; break;
      case 'circle': e.r = v / 2; break;
      case 'arc': case 'poly': e.r = v; break;
      case 'slot': if (k === 'len') { e.x2 = e.x1 + g.dir[0] * v; e.y2 = e.y1 + g.dir[1] * v; } else e.w = v; break;
      case 'polyline': {
        var i = d.i | 0, n = e.pts.length, dl = v - g.value, mv = [g.dir[0] * dl, g.dir[1] * dl];
        // open chains carry the rest of the chain along; closed loops move just the far vertex
        var last = e.closed ? i + 1 : n - 1;
        for (var j = i + 1; j <= last; j++) { var p = e.pts[j % n]; p[0] += mv[0]; p[1] += mv[1]; }
        break;
      }
    }
    return e;
  }
  function segDist2(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  // Which dimension a Smart Dimension click at sketch point uv on entity e means: { k, i } or null.
  function dimForEntity(e, uv) {
    if (!e) return null;
    switch (e.t) {
      case 'line': {
        var minx = Math.min(e.x1, e.x2), maxx = Math.max(e.x1, e.x2), miny = Math.min(e.y1, e.y2), maxy = Math.max(e.y1, e.y2);
        var slanted = maxx - minx > 1e-9 && maxy - miny > 1e-9;
        if (slanted && uv) {
          var inX = uv[0] >= minx && uv[0] <= maxx, inY = uv[1] >= miny && uv[1] <= maxy;
          if (inX && !inY) return { k: 'dx' };
          if (inY && !inX) return { k: 'dy' };
        }
        return { k: 'len' };
      }
      case 'rect': case 'crect': {
        var c = e.t === 'rect' ? [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]]
          : [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
        var best = 0, bd = Infinity;
        for (var i = 0; i < 4; i++) { var dd = segDist2(uv || c[0], c[i], c[(i + 1) % 4]); if (dd < bd) { bd = dd; best = i; } }
        return { k: best % 2 === 0 ? 'w' : 'h', i: best };
      }
      case 'circle': return { k: 'dia' };
      case 'arc': case 'poly': return { k: 'r' };
      case 'slot': {
        if (!uv) return { k: 'len' };
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
        var t = L2 > 0 ? ((uv[0] - e.x1) * dx + (uv[1] - e.y1) * dy) / L2 : 0.5;
        return { k: t >= 0 && t <= 1 ? 'len' : 'w' };
      }
      case 'polyline': {
        var n = e.pts.length, cnt = e.closed ? n : n - 1, bi = 0, bdd = Infinity;
        for (var s = 0; s < cnt; s++) { var q = segDist2(uv || e.pts[0], e.pts[s], e.pts[(s + 1) % n]); if (q < bdd) { bdd = q; bi = s; } }
        return { k: 'seg', i: bi };
      }
    }
    return null;
  }

  // Exact primitives of an entity for trimming: { kind: 'seg', a, b } or { kind: 'arc', c, r, a0, a1 } (radians, a0 < a1).
  function entityPrimitives(e) {
    var d2r = Math.PI / 180;
    switch (e.t) {
      case 'line': return [{ kind: 'seg', a: [e.x1, e.y1], b: [e.x2, e.y2] }];
      case 'circle': return [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: 0, a1: 2 * Math.PI, full: true }];
      case 'arc': {
        var lo = Math.min(e.a0, e.a1) * d2r, hi = Math.max(e.a0, e.a1) * d2r;
        return [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: lo, a1: hi }];
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy), r = e.w / 2;
        if (L < 1e-9) return entityPrimitives({ t: 'circle', cx: e.x1, cy: e.y1, r: r });
        var ang = Math.atan2(dy, dx), nx = -dy / L * r, ny = dx / L * r;
        return [
          { kind: 'seg', a: [e.x1 + nx, e.y1 + ny], b: [e.x2 + nx, e.y2 + ny] },
          { kind: 'arc', c: [e.x2, e.y2], r: r, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2 },
          { kind: 'seg', a: [e.x2 - nx, e.y2 - ny], b: [e.x1 - nx, e.y1 - ny] },
          { kind: 'arc', c: [e.x1, e.y1], r: r, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2 }
        ];
      }
      case 'rect': case 'crect': case 'poly': case 'polyline': {
        var pl = entityPolylines(e)[0], pts = pl.pts, out = [], n = pts.length, cnt = pl.closed ? n : n - 1;
        for (var i = 0; i < cnt; i++) out.push({ kind: 'seg', a: pts[i], b: pts[(i + 1) % n] });
        return out;
      }
    }
    return [];
  }
  function angleIn(a, a0, a1) {
    var t = a;
    while (t < a0 - 1e-9) t += 2 * Math.PI;
    while (t >= a0 + 2 * Math.PI - 1e-9) t -= 2 * Math.PI;
    return t <= a1 + 1e-9 ? t : null;
  }
  // Intersection parameters on primitive p with primitive q: seg → t in [0,1], arc → angle in [a0, a1].
  function primIntersections(p, q) {
    var out = [], eps = 1e-9;
    if (p.kind === 'seg' && q.kind === 'seg') {
      var d1 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
      var den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < eps) return out;
      var w = [q.a[0] - p.a[0], q.a[1] - p.a[1]];
      var t = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den;
      if (t > -eps && t < 1 + eps && u > -eps && u < 1 + eps) out.push(t);
      return out;
    }
    if (p.kind === 'seg' && q.kind === 'arc') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], f = [p.a[0] - q.c[0], p.a[1] - q.c[1]];
      var A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - q.r * q.r;
      var disc = B * B - 4 * A * C;
      if (A < eps) return out;
      // r15/trimtan15: a line tangent to the circle touches it at one point. Its discriminant comes out within
      // rounding of zero, often slightly negative (two lines drawn tangent to a circle found no crossing, so nothing
      // split the circle and a trim deleted all of it): a line within 1e-7 of touching counts as touching, once.
      if (disc < 0) { if (Math.sqrt(q.r * q.r - disc / (4 * A)) - q.r < 1e-7 * Math.max(1, q.r)) disc = 0; else return out; }
      var sq = Math.sqrt(disc);
      (sq / (2 * A) < 1e-9 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]).forEach(function (t) {
        if (t < -eps || t > 1 + eps) return;
        var x = p.a[0] + d[0] * t, y = p.a[1] + d[1] * t;
        if (angleIn(Math.atan2(y - q.c[1], x - q.c[0]), q.a0, q.a1) != null) out.push(t);
      });
      return out;
    }
    if (p.kind === 'arc' && q.kind === 'seg') {
      var ts = primIntersections(q, p);
      ts.forEach(function (t) {
        var x = q.a[0] + (q.b[0] - q.a[0]) * t, y = q.a[1] + (q.b[1] - q.a[1]) * t;
        var a = angleIn(Math.atan2(y - p.c[1], x - p.c[0]), p.a0, p.a1);
        if (a != null) out.push(a);
      });
      return out;
    }
    // arc-arc: circle intersection
    var dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], D = Math.hypot(dx, dy);
    if (D < eps || D > p.r + q.r + eps || D < Math.abs(p.r - q.r) - eps) return out;
    var a2 = (p.r * p.r - q.r * q.r + D * D) / (2 * D), h2 = Math.max(0, p.r * p.r - a2 * a2), h = Math.sqrt(h2);
    var mx = p.c[0] + dx / D * a2, my = p.c[1] + dy / D * a2;
    [[mx + h * -dy / D, my + h * dx / D], [mx - h * -dy / D, my - h * dx / D]].forEach(function (pt, i) {
      if (i === 1 && h < eps) return;
      if (angleIn(Math.atan2(pt[1] - q.c[1], pt[0] - q.c[0]), q.a0, q.a1) == null) return;
      var a = angleIn(Math.atan2(pt[1] - p.c[1], pt[0] - p.c[0]), p.a0, p.a1);
      if (a != null) out.push(a);
    });
    return out;
  }
  function primParamAt(p, uv) {
    if (p.kind === 'seg') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], L2 = d[0] * d[0] + d[1] * d[1];
      var t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((uv[0] - p.a[0]) * d[0] + (uv[1] - p.a[1]) * d[1]) / L2)) : 0;
      return { t: t, dist: Math.hypot(uv[0] - p.a[0] - d[0] * t, uv[1] - p.a[1] - d[1] * t) };
    }
    var ang = Math.atan2(uv[1] - p.c[1], uv[0] - p.c[0]), a = angleIn(ang, p.a0, p.a1);
    if (a == null) {
      // outside the arc's span: nearest endpoint
      var e0 = [p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0)], e1 = [p.c[0] + p.r * Math.cos(p.a1), p.c[1] + p.r * Math.sin(p.a1)];
      var d0 = Math.hypot(uv[0] - e0[0], uv[1] - e0[1]), d1 = Math.hypot(uv[0] - e1[0], uv[1] - e1[1]);
      return d0 < d1 ? { t: p.a0, dist: d0 } : { t: p.a1, dist: d1 };
    }
    return { t: a, dist: Math.abs(Math.hypot(uv[0] - p.c[0], uv[1] - p.c[1]) - p.r) };
  }
  function primPoint(p, t) {
    if (p.kind === 'seg') return [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
    return [p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)];
  }
  function r2d(a) { return a * 180 / Math.PI; }

  // Trim: remove the portion of entity `idx` between the intersections on either side of the point uv.
  // Returns the new entity list (the trimmed entity is replaced by 0..n pieces). Slots are exploded into lines
  // and arcs first; rectangles and polygons become polylines.
  function trimEntity(entities, idx, uv) {
    var e = entities[idx];
    if (!e || e.t === 'point') throw new Error('Nothing to trim there.');
    if (e.t === 'slot') {
      var parts = entityPrimitives(e).map(function (p) {
        var o = p.kind === 'seg' ? { t: 'line', x1: p.a[0], y1: p.a[1], x2: p.b[0], y2: p.b[1] } : { t: 'arc', cx: p.c[0], cy: p.c[1], r: p.r, a0: r2d(p.a0), a1: r2d(p.a1) };
        if (e.construction) o.construction = true;
        return o;
      });
      var list = entities.slice(0, idx).concat(parts, entities.slice(idx + 1));
      var best = -1, bestD = Infinity;
      parts.forEach(function (p, i) { var q = primParamAt(entityPrimitives(p)[0], uv); if (q.dist < bestD) { bestD = q.dist; best = idx + i; } });
      return trimEntity(list, best, uv);
    }
    var prims = entityPrimitives(e), k = -1, kd = Infinity, kt = 0;
    prims.forEach(function (p, i) { var q = primParamAt(p, uv); if (q.dist < kd) { kd = q.dist; k = i; kt = q.t; } });
    if (k < 0) throw new Error('Nothing to trim there.');
    var prim = prims[k], params = [];
    entities.forEach(function (o, oi) {
      if (o.t === 'point') return;
      entityPrimitives(o).forEach(function (q, qi) {
        if (oi === idx && qi === k) return;
        primIntersections(prim, q).forEach(function (t) { params.push(t); });
      });
    });
    var isArc = prim.kind === 'arc', start = isArc ? prim.a0 : 0, end = isArc ? prim.a1 : 1, span = end - start;
    var lo = null, hi = null;
    params.forEach(function (t) {
      if (t < kt - 1e-7 && (lo == null || t > lo)) lo = t;
      if (t > kt + 1e-7 && (hi == null || t < hi)) hi = t;
    });
    if (prim.full) {
      if (params.length < 2) return entities.slice(0, idx).concat(entities.slice(idx + 1));
      if (lo == null) lo = Math.max.apply(null, params) - 2 * Math.PI;
      if (hi == null) hi = Math.min.apply(null, params) + 2 * Math.PI;
      var arc = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(hi), a1: r2d(lo + 2 * Math.PI) };
      while (arc.a0 >= 360) { arc.a0 -= 360; arc.a1 -= 360; }
      if (e.construction) arc.construction = true;
      return entities.slice(0, idx).concat([arc], entities.slice(idx + 1));
    }
    if (lo == null) lo = start;
    if (hi == null) hi = end;
    var pieces = [], tiny = span * 1e-6;
    function keep(o) { if (e.construction) o.construction = true; pieces.push(o); }
    if (e.t === 'line') {
      if (lo - start > tiny) { var pa = primPoint(prim, lo); keep({ t: 'line', x1: e.x1, y1: e.y1, x2: pa[0], y2: pa[1] }); }
      if (end - hi > tiny) { var pb = primPoint(prim, hi); keep({ t: 'line', x1: pb[0], y1: pb[1], x2: e.x2, y2: e.y2 }); }
    } else if (e.t === 'arc') {
      if (lo - start > tiny) keep({ t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(start), a1: r2d(lo) });
      if (end - hi > tiny) keep({ t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r2d(hi), a1: r2d(end) });
    } else {
      // polyline-like: edge k of pts runs pts[k] -> pts[k+1]
      var pl = entityPolylines(e)[0], pts = pl.pts, n = pts.length;
      var pLo = primPoint(prim, lo), pHi = primPoint(prim, hi);
      if (pl.closed) {
        var seq = [];
        if (end - hi > tiny) seq.push(pHi);
        for (var i = 1; i <= n; i++) seq.push(pts[(k + i) % n]);
        if (lo - start > tiny) seq.push(pLo);
        if (seq.length >= 2) keep({ t: 'polyline', pts: seq, closed: false });
      } else {
        var first = pts.slice(0, k + 1); if (lo - start > tiny) first.push(pLo);
        var second = (end - hi > tiny ? [pHi] : []).concat(pts.slice(k + 1));
        if (first.length >= 2) keep({ t: 'polyline', pts: first, closed: false });
        if (second.length >= 2) keep({ t: 'polyline', pts: second, closed: false });
      }
    }
    return entities.slice(0, idx).concat(pieces, entities.slice(idx + 1));
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.entityPolylines = entityPolylines; K.entitySnapPoints = entitySnapPoints; K.sketchProfile = sketchProfile; K.signedArea = signedArea;
  K.loopSelfCrossing = loopSelfCrossing; K.checkProfile = checkProfile; K.offsetLoop = offsetLoop; K.filletPolyline = filletPolyline;
  K.mirrorAxis = mirrorAxis; K.mirrorEntity = mirrorEntity; K.translateEntity = translateEntity; K.entityPrimitives = entityPrimitives;
  K.trimEntity = trimEntity; K.dimGeometry = dimGeometry; K.dimValue = dimValue; K.setDimValue = setDimValue; K.dimForEntity = dimForEntity;
  K.setTessellation = setTessellation; K.segsForRadius = segsForRadius; K.entityCurves = entityCurves;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.TESS = TESS; _.checkProfile = checkProfile; _.dimGeometry = dimGeometry; _.entityPolylines = entityPolylines; _.key2 = key2;
  _.mirrorAxis = mirrorAxis; _.mirrorEntity = mirrorEntity; _.offsetLoop = offsetLoop; _.pointInPoly = pointInPoly; _.segsForRadius = segsForRadius;
  _.setDimValue = setDimValue; _.setTessellation = setTessellation; _.signedArea = signedArea; _.sketchProfile = sketchProfile; _.tessKey = tessKey;
  _.translateEntity = translateEntity; _.trimEntity = trimEntity;
})(Kernel, Kernel._);
