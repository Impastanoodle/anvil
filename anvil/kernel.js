// kernel.js — Anvil's modeling kernel: sketches, features, rebuild, meshing, mass properties, exports, script builder.
// Depends on csg.js. Units are whatever the model says (mm by default); the kernel is unit-agnostic.
var Kernel = (function () {
  'use strict';

  // ------------------------------------------------------------------ small vector helpers (arrays)
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; }
  function vec(a) { return new CSG.Vector(a[0], a[1], a[2]); }
  function arr(v) { return [v.x, v.y, v.z]; }

  var AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  // ------------------------------------------------------------------ planes
  // Right-handed frames matching SolidWorks' standard planes (x cross y = n).
  var STD_PLANES = {
    Front: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1] },
    Top: { x: [1, 0, 0], y: [0, 0, -1], n: [0, 1, 0] },
    Right: { x: [0, 0, -1], y: [0, 1, 0], n: [1, 0, 0] }
  };

  function makePlane(ref, offset) {
    var s = STD_PLANES[ref] || STD_PLANES.Front;
    offset = offset || 0;
    return { ref: ref, offset: offset, origin: scale(s.n, offset), x: s.x.slice(), y: s.y.slice(), n: s.n.slice() };
  }

  // A sketch frame on an arbitrary planar face. Origin = projection of the world origin onto the plane.
  function planeFromFace(normal, point) {
    var n = norm(normal);
    var up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
    var x = norm(cross(up, n));
    var y = cross(n, x);
    var d = dot(n, point);
    return { custom: true, origin: scale(n, d), x: x, y: y, n: n, offset: d };
  }

  function to3D(pl, u, v) {
    return [pl.origin[0] + pl.x[0] * u + pl.y[0] * v, pl.origin[1] + pl.x[1] * u + pl.y[1] * v, pl.origin[2] + pl.x[2] * u + pl.y[2] * v];
  }
  function to2D(pl, p) {
    var d = sub(p, pl.origin);
    return [dot(d, pl.x), dot(d, pl.y)];
  }

  // Resolve a sketch's plane reference against the model (standard plane, reference-plane feature, or custom frame).
  function resolvePlane(ref, model, planesById) {
    if (!ref) return makePlane('Front', 0);
    if (ref.custom) return ref;
    if (ref.featureId != null) {
      var pl = planesById && planesById[ref.featureId];
      if (pl) return pl;
      throw new Error('Reference plane not found (feature ' + ref.featureId + ').');
    }
    return makePlane(ref.ref || 'Front', ref.offset || 0);
  }

  // ------------------------------------------------------------------ sketch entities -> polylines
  function segsForRadius(r) {
    return Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(Math.max(r, 0.01)))));
  }

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
      if (l.cross) throw new Error('Sketch profile crosses itself near (' + fmt(l.cross[0]) + ', ' + fmt(l.cross[1]) + '). Trim or move the entities so the contour does not self-intersect.');
    });
  }

  // -> { loops: [{pts, hole, depth, cross?}], warnings }. A loop with `cross` (a self-intersection point) is kept for
  // display but every feature built from the profile errors through checkProfile.
  function sketchProfile(sketch) {
    var loops = [], chains = [], warnings = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction) return;
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
    return { loops: out, warnings: warnings };
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
      if (disc < 0 || A < eps) return out;
      var sq = Math.sqrt(disc);
      [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].forEach(function (t) {
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

  // ------------------------------------------------------------------ triangulation (ear clipping, CCW input)
  function triangulate(pts) {
    var n = pts.length, idx = [], tris = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    function area2(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    function inTri(p, a, b, c) {
      return area2(a, b, p) >= -1e-9 && area2(b, c, p) >= -1e-9 && area2(c, a, p) >= -1e-9;
    }
    var guard = 0;
    while (idx.length > 3 && guard++ < 5000) {
      var found = false;
      for (i = 0; i < idx.length; i++) {
        var ip = idx[(i + idx.length - 1) % idx.length], ic = idx[i], inx = idx[(i + 1) % idx.length];
        var a = pts[ip], b = pts[ic], c = pts[inx];
        if (area2(a, b, c) <= 1e-9) continue;
        var ear = true;
        for (var k = 0; k < idx.length; k++) {
          var q = idx[k];
          if (q === ip || q === ic || q === inx) continue;
          if (inTri(pts[q], a, b, c)) { ear = false; break; }
        }
        if (!ear) continue;
        tris.push([ip, ic, inx]);
        idx.splice(i, 1);
        found = true;
        break;
      }
      if (!found) break;
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) for (i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    return tris;
  }

  // ------------------------------------------------------------------ primitive tool bodies
  function poly(points, shared) {
    var vs = points.map(function (p) { return new CSG.Vertex(vec(p)); });
    return CSG.Polygon.tryCreate(vs, shared);
  }

  function pushPoly(list, points, shared) {
    var p = poly(points, shared);
    if (p) list.push(p);
  }

  function ensureOutward(polys) {
    var csg = CSG.fromPolygons(polys);
    if (csg.volume() < 0) polys.forEach(function (p) { p.flip(); });
    return csg;
  }

  function prism(loop, plane, a, b, shared) {
    var polys = [], n = loop.length;
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
      pushPoly(polys, [bottom[i], bottom[j], top[j], top[i]], shared);
    }
    return ensureOutward(polys);
  }

  function rotatePoint(p, A, D, ang) {
    var v = sub(p, A), c = Math.cos(ang), s = Math.sin(ang);
    var r = add(add(scale(v, c), scale(cross(D, v), s)), scale(D, dot(D, v) * (1 - c)));
    return add(A, r);
  }

  function revolveLoop(loop, plane, axisP, axisD, angleDeg, shared) {
    var A = to3D(plane, axisP[0], axisP[1]);
    var D = norm(sub(to3D(plane, axisP[0] + axisD[0], axisP[1] + axisD[1]), A));
    var full = Math.abs(angleDeg) >= 360 - 1e-6;
    var segs = Math.max(8, Math.round(48 * Math.abs(angleDeg) / 360));
    var rings = [], s, i;
    for (s = 0; s <= segs; s++) {
      var ang = angleDeg * Math.PI / 180 * s / segs;
      rings.push(loop.map(function (p) { return rotatePoint(to3D(plane, p[0], p[1]), A, D, ang); }));
    }
    if (full) rings[segs] = rings[0];
    var polys = [], n = loop.length;
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
        if (clean.length >= 3) pushPoly(polys, clean, shared);
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
      var solid = makeSolid(l.pts, l.hole);
      if (!solid) return;
      (l.hole ? holes : outers).push(solid);
    });
    if (!outers.length) throw new Error('Sketch has no closed profile.');
    var body = CSG.fromPolygons([].concat.apply([], outers.map(function (o) { return o.polygons; })));
    if (holes.length) body = body.subtract(unionAll(holes));
    return body;
  }

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
  function taperedPrism(loop, plane, a, b, offA, offB, shared) {
    var la = offA ? offsetLoop(loop, offA) : loop, lb = offB ? offsetLoop(loop, offB) : loop;
    // an offset loop has collapsed when any edge reverses direction (a square offset past its centre keeps its area sign)
    function collapsed(off) {
      for (var i = 0; i < loop.length; i++) {
        var j = (i + 1) % loop.length;
        if ((loop[j][0] - loop[i][0]) * (off[j][0] - off[i][0]) + (loop[j][1] - loop[i][1]) * (off[j][1] - off[i][1]) <= 1e-12) return true;
      }
      return signedArea(off) <= 1e-9;
    }
    if (collapsed(la) || collapsed(lb)) throw new Error('Draft angle is too large for this depth: the profile collapses.');
    var polys = [], n = loop.length;
    var na = scale(plane.n, a), nb = scale(plane.n, b);
    var bottom = la.map(function (p) { return add(to3D(plane, p[0], p[1]), na); });
    var top = lb.map(function (p) { return add(to3D(plane, p[0], p[1]), nb); });
    triangulate(lb).forEach(function (t) { pushPoly(polys, [top[t[0]], top[t[1]], top[t[2]]], shared); });
    triangulate(la).forEach(function (t) { pushPoly(polys, [bottom[t[2]], bottom[t[1]], bottom[t[0]]], shared); });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      pushPoly(polys, [bottom[i], bottom[j], top[j], top[i]], shared);
    }
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
    return solidFromProfile(profile, function (pts, hole) {
      var a = range[0], b = range[1];
      if (hole) { a -= 0.01; b += 0.01; }
      if (!k) return prism(pts, plane, a, b, f.id);
      var s = hole ? -1 : 1; // holes are the complement: they grow when the material shrinks
      function part(a0, b0) { return taperedPrism(pts, plane, a0, b0, s * k * Math.abs(a0), s * k * Math.abs(b0), f.id); }
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
    return solidFromProfile({
      loops: profile.loops.filter(function (l) {
        // the axis line itself must not be treated as part of the profile (it is open anyway)
        return true;
      })
    }, function (pts, hole) {
      // reject loops crossing the axis
      var side = 0;
      for (var i = 0; i < pts.length; i++) {
        var s = (pts[i][0] - axis.p[0]) * d[1] - (pts[i][1] - axis.p[1]) * d[0];
        if (Math.abs(s) < 1e-7) continue;
        if (side === 0) side = s > 0 ? 1 : -1;
        else if ((s > 0 ? 1 : -1) !== side) throw new Error('Revolve profile crosses the axis.');
      }
      if (hole) {
        // grow holes a hair radially so coplanar caps do not fight
        return revolveLoop(pts, plane, axis.p, d, angle, f.id);
      }
      return revolveLoop(pts, plane, axis.p, d, angle, f.id);
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

  // ------------------------------------------------------------------ rebuild
  function newModel(name) {
    return { name: name || 'Part1', units: 'mm', density: 7850, color: '#a8adb6', features: [], nextId: 1 };
  }

  var NAME_BASE = {
    sketch: 'Sketch', plane: 'Plane', extrude: 'Boss-Extrude', cut: 'Cut-Extrude', revolve: 'Revolve',
    revolveCut: 'Cut-Revolve', lpattern: 'LPattern', cpattern: 'CirPattern', mirror: 'Mirror', chamfer: 'Chamfer', fillet: 'Fillet', flange: 'Edge-Flange', sweep: 'Sweep', loft: 'Loft', shell: 'Shell', hem: 'Hem', jog: 'Jog'
  };

  function featureName(model, type, cut) {
    var base = NAME_BASE[type] || 'Feature';
    if (type === 'extrude' && cut) base = NAME_BASE.cut;
    if (type === 'revolve' && cut) base = NAME_BASE.revolveCut;
    if (type === 'sweep' && cut) base = 'Cut-Sweep';
    if (type === 'loft' && cut) base = 'Cut-Loft';
    var max = 0;
    model.features.forEach(function (f) {
      if (f.name && f.name.indexOf(base) === 0) {
        var n = parseInt(f.name.slice(base.length), 10);
        if (n > max) max = n;
      }
    });
    return base + (max + 1);
  }

  function findFeature(model, id) {
    for (var i = 0; i < model.features.length; i++) if (model.features[i].id === id) return model.features[i];
    return null;
  }

  // The geometry a pattern or mirror should copy: a pattern's own tool holds only its copies, so when the source
  // is itself a pattern/mirror the seed instance has to be included (recursively) or nested patterns miss it.
  function familyTool(id, model, ctx) {
    var tool = ctx.tools[id];
    var src = findFeature(model, id);
    if (!src || !tool) return tool || null;
    if (src.type === 'lpattern' || src.type === 'cpattern' || (src.type === 'mirror' && !src.body)) {
      var seed = familyTool(src.feature, model, ctx);
      return seed ? seed.union(tool) : tool;
    }
    return tool;
  }

  // Build the tool body of one feature given a context of previously built tools/planes/sketches.
  function buildTool(f, model, ctx) {
    var sketch, plane;
    switch (f.type) {
      case 'extrude':
      case 'revolve':
        sketch = ctx.sketches[f.sketch] || findFeature(model, f.sketch);
        if (!sketch || sketch.type !== 'sketch') throw new Error('Select a sketch for this feature.');
        plane = resolvePlane(sketch.plane, model, ctx.planes);
        if (!sketch.profile) sketch.profile = sketchProfile(sketch);
        return f.type === 'extrude' ? buildExtrude(f, sketch, plane, ctx.throughLimit) : buildRevolve(f, sketch, plane);
      case 'sweep': return buildSweep(f, model, ctx);
      case 'loft': return buildLoft(f, model, ctx);
      case 'lpattern': {
        var src = familyTool(f.feature, model, ctx);
        if (!src) throw new Error('Pattern source feature has no geometry.');
        var d1 = scale(AXES[f.d1 || 'x'], f.rev1 ? -1 : 1), copies = [];
        var n1 = Math.max(1, f.n1 | 0), n2 = f.d2 ? Math.max(1, f.n2 | 0) : 1;
        var d2 = f.d2 ? scale(AXES[f.d2], f.rev2 ? -1 : 1) : [0, 0, 0];
        for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
          if (i === 0 && j === 0) continue;
          copies.push(translateBody(src, add(scale(d1, i * (+f.s1 || 0)), scale(d2, j * (+f.s2 || 0)))));
        }
        if (!copies.length) throw new Error('Pattern needs at least 2 instances.');
        return unionAll(copies);
      }
      case 'cpattern': {
        var csrc = familyTool(f.feature, model, ctx);
        if (!csrc) throw new Error('Pattern source feature has no geometry.');
        var count = Math.max(2, f.n | 0), total = +f.angle || 360;
        var step = (f.equal === false) ? total : (Math.abs(total) >= 360 ? total / count : total / (count - 1));
        var ccopies = [];
        for (var k = 1; k < count; k++) ccopies.push(rotateBody(csrc, f.center || [0, 0, 0], AXES[f.axis || 'z'], step * k));
        return unionAll(ccopies);
      }
      case 'mirror': {
        var mplane = makePlane(f.plane || 'Right', f.offset || 0);
        if (f.body) {
          if (!ctx.body) throw new Error('No body to mirror yet.');
          return mirrorBody(ctx.body, mplane);
        }
        var msrc = familyTool(f.feature, model, ctx);
        if (!msrc) throw new Error('Mirror source feature has no geometry.');
        return mirrorBody(msrc, mplane);
      }
    }
    return null;
  }

  function isCut(f, model) {
    if (f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'loft') return !!f.cut;
    if (f.type === 'mirror' && f.body) return false;
    if (f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror') {
      var src = findFeature(model, f.feature);
      return src ? isCut(src, model) : false;
    }
    return false;
  }

  // Cache key of a feature: its JSON (minus the computed profile) plus the sheet parameters flanges depend on.
  function featureKey(f, model) {
    return JSON.stringify(f, function (k, v) { return k === 'profile' || k === 'name' ? undefined : v; }) + '|' + JSON.stringify(model.sheet || null);
  }

  // rebuild(model, cache): `cache` is the `cache` of a previous build; the longest prefix of features whose keys are
  // unchanged is restored from it (bodies are immutable, so the snapshots are just references) and only the rest is
  // rebuilt. The result carries a fresh `cache` and `reused` (number of features taken from the cache).
  function rebuild(model, cache) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var errors = {}, warnings = {};
    var ctx = { tools: {}, planes: {}, sketches: {}, flanges: {}, body: null, warnings: warnings };
    // sketches used as sweep paths are open by design: no "open contour" warning for them
    var pathIds = {};
    model.features.forEach(function (f) { if (f.type === 'sweep' && typeof f.path === 'number') pathIds[f.path] = true; });
    var keys = model.features.map(function (f) { return featureKey(f, model); });
    var prev = cache && cache.steps ? cache.steps : [], steps = [], p = 0;
    while (p < model.features.length && p < prev.length && prev[p].key === keys[p]) p++;
    for (var i = 0; i < p; i++) {
      var st = prev[i], pf = model.features[i];
      if (st.error) errors[pf.id] = st.error;
      if (st.warning) warnings[pf.id] = st.warning;
      if (st.tool) ctx.tools[pf.id] = st.tool;
      if (st.plane) ctx.planes[pf.id] = st.plane;
      if (st.flange) ctx.flanges[pf.id] = st.flange;
      if (pf.type === 'sketch') { pf.profile = st.profile; ctx.sketches[pf.id] = pf; }
      ctx.body = st.body;
      steps.push(st);
    }
    model.features.slice(p).forEach(function (f, j) {
      try {
        switch (f.type) {
          case 'flange': {
            var ft = buildFlange(f, model, ctx);
            ctx.tools[f.id] = ft;
            if (ctx.flangeCut) ctx.body = ctx.body.subtract(ctx.flangeCut);
            ctx.body = ctx.body.union(ft);
            break;
          }
          case 'jog': {
            var jg = buildJog(f, model, ctx);
            if (ctx.flangeCut) ctx.body = ctx.body.subtract(ctx.flangeCut);
            ctx.body = ctx.body.union(jg.first).union(jg.second);
            ctx.tools[f.id] = jg.first.union(jg.second);
            break;
          }
          case 'sketch':
            f.profile = sketchProfile(f);
            ctx.sketches[f.id] = f;
            if (f.profile.warnings.length && !pathIds[f.id]) warnings[f.id] = f.profile.warnings.join(' ');
            break;
          case 'shell': {
            var sh = buildShell(f, ctx);
            ctx.body = sh.body;
            ctx.tools[f.id] = sh.inner;
            break;
          }
          case 'plane':
            ctx.planes[f.id] = makePlane(f.ref || 'Front', +f.offset || 0);
            break;
          case 'chamfer':
          case 'fillet': {
            var r = buildEdgeFeature(f, ctx);
            if (r.cut) ctx.body = ctx.body.subtract(r.cut);
            if (r.add) ctx.body = ctx.body.union(r.add);
            ctx.tools[f.id] = r.cut || r.add;
            break;
          }
          default: {
            var tool = buildTool(f, model, ctx);
            if (!tool) break;
            ctx.tools[f.id] = tool;
            var cut = isCut(f, model);
            if (cut) {
              if (!ctx.body) throw new Error('Nothing to cut yet.');
              var volBefore = ctx.body.volume();
              ctx.body = ctx.body.subtract(tool);
              if (Math.abs(ctx.body.volume() - volBefore) < 1e-6) warnings[f.id] = 'Cut removed no material. Try "Reverse direction".';
            } else {
              ctx.body = ctx.body ? ctx.body.union(tool) : tool;
            }
          }
        }
      } catch (e) {
        errors[f.id] = e.message || String(e);
      }
      steps.push({ key: keys[p + j], body: ctx.body, tool: ctx.tools[f.id] || null, plane: ctx.planes[f.id] || null, flange: ctx.flanges[f.id] || null, profile: f.profile || null, error: errors[f.id] || null, warning: warnings[f.id] || null });
    });
    var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // profiles: the computed profile of every sketch, by feature id, so a build made on a copy of the model (a worker)
    // can hand them back to the original with applyProfiles
    var profiles = {};
    Object.keys(ctx.sketches).forEach(function (id) { profiles[id] = ctx.sketches[id].profile || null; });
    return { body: ctx.body, tools: ctx.tools, planes: ctx.planes, flanges: ctx.flanges, errors: errors, warnings: warnings, time: t1 - t0, cache: { steps: steps }, reused: p, profiles: profiles };
  }

  // ------------------------------------------------------------------ build serialization (Web Worker rebuilds)
  // packBuild(build, model?) -> a structured-clone-safe copy of a rebuild result without its cache:
  //   { body: packedCSG | null, tools: { featureId: packedCSG | null }, planes, flanges, errors, warnings, time, reused,
  //     profiles: { sketchFeatureId: profile } }
  // planes (makePlane frames), flanges (flange info records), errors, warnings and profiles are plain JSON already; the
  // solids are packed with CSG.prototype.pack (typed arrays). `model` is only consulted for profiles when the build
  // predates the `profiles` field.
  function packBuild(build, model) {
    var tools = {};
    Object.keys(build.tools || {}).forEach(function (id) { tools[id] = build.tools[id] ? build.tools[id].pack() : null; });
    var profiles = build.profiles;
    if (!profiles) {
      profiles = {};
      if (model) model.features.forEach(function (f) { if (f.type === 'sketch') profiles[f.id] = f.profile || null; });
    }
    return {
      body: build.body ? build.body.pack() : null, tools: tools,
      planes: build.planes || {}, flanges: build.flanges || {}, errors: build.errors || {}, warnings: build.warnings || {},
      time: build.time || 0, reused: build.reused || 0, profiles: profiles
    };
  }
  // Every ArrayBuffer of a packed build (body and tools), for postMessage's transfer list. pack() allocates fresh
  // arrays per call, so no buffer appears twice even when a tool and the body are the same solid.
  function packTransferables(packed) {
    var out = [];
    if (packed.body) out = out.concat(CSG.packTransferables(packed.body));
    Object.keys(packed.tools || {}).forEach(function (id) { if (packed.tools[id]) out = out.concat(CSG.packTransferables(packed.tools[id])); });
    return out;
  }
  // unpackBuild(obj) -> an object shaped like a rebuild result (meshFromBody, massProps, faceOutline, flatPattern and
  // the exports all work on it) with `cache: null`, since the cache stays where the build was made.
  function unpackBuild(obj) {
    var tools = {};
    Object.keys(obj.tools || {}).forEach(function (id) { tools[id] = obj.tools[id] ? CSG.unpack(obj.tools[id]) : null; });
    return {
      body: obj.body ? CSG.unpack(obj.body) : null, tools: tools,
      planes: obj.planes || {}, flanges: obj.flanges || {}, errors: obj.errors || {}, warnings: obj.warnings || {},
      time: obj.time || 0, reused: obj.reused || 0, profiles: obj.profiles || {}, cache: null
    };
  }
  // Write the profiles a build computed (build.profiles, keyed by sketch feature id) onto the model's sketch features.
  // Other features are left alone; a sketch the build did not see (or recorded as null) keeps its profile.
  function applyProfiles(model, profiles) {
    if (!profiles) return model;
    model.features.forEach(function (f) {
      if (f.type === 'sketch' && profiles[f.id]) f.profile = profiles[f.id];
    });
    return model;
  }

  // ------------------------------------------------------------------ meshing
  function planeKey(pl) {
    return [Math.round(pl.normal.x * 1000), Math.round(pl.normal.y * 1000), Math.round(pl.normal.z * 1000), Math.round(pl.w * 100)].join('|');
  }

  // -> { positions, normals, faces:[{normal,w,start,count,centroid,area}], triCount, polygons }
  function meshFromBody(body) {
    if (!body) return { positions: new Float32Array(0), normals: new Float32Array(0), faces: [], triCount: 0 };
    var groups = {}, order = [];
    body.polygons.forEach(function (p) {
      var k = planeKey(p.plane);
      if (!groups[k]) { groups[k] = { polys: [], plane: p.plane }; order.push(k); }
      groups[k].polys.push(p);
    });
    var tris = [];
    var faces = [];
    order.forEach(function (k) {
      var g = groups[k];
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
      faces.push({
        normal: [g.plane.normal.x, g.plane.normal.y, g.plane.normal.z], w: g.plane.w,
        start: start, count: count, centroid: [cx / cnt, cy / cnt, cz / cnt], area: area, polys: g.polys
      });
    });
    var positions = new Float32Array(tris);
    var normals = new Float32Array(tris.length);
    faces.forEach(function (f) {
      for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) {
        normals[i] = f.normal[0]; normals[i + 1] = f.normal[1]; normals[i + 2] = f.normal[2];
      }
    });
    // positions64 keeps full precision for mass properties; positions (Float32) is what the renderer uploads
    return { positions: positions, positions64: new Float64Array(tris), normals: normals, faces: faces, triCount: tris.length / 9 };
  }

  function massProps(mesh, density) {
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
    var centroid = vol > 1e-12 ? [cx / vol, cy / vol, cz / vol] : [0, 0, 0];
    return { volume: vol, area: area, centroid: centroid, bbox: { min: min, max: max }, density: density, mass: vol * density };
  }

  // ------------------------------------------------------------------ face outlines (for DXF of flat faces)
  function key3(p) { return Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4); }

  // Boundary loops of a planar face as 2D polylines in the face frame. Handles T-junctions by splitting edges at
  // any face vertex lying on them.
  function faceOutline(mesh, faceIndex) {
    var face = mesh.faces[faceIndex];
    if (!face) return null;
    var plane = planeFromFace(face.normal, scale(face.normal, face.w));
    var verts = {}, edges = [];
    face.polys.forEach(function (p) {
      var vs = p.vertices.map(function (v) { var q = arr(v.pos); verts[key3(q)] = q; return q; });
      for (var i = 0; i < vs.length; i++) edges.push([vs[i], vs[(i + 1) % vs.length]]);
    });
    var vlist = Object.keys(verts).map(function (k) { return verts[k]; });
    // split edges at collinear interior vertices
    var split = [];
    edges.forEach(function (e) {
      var a = e[0], b = e[1], d = sub(b, a), L = len(d);
      if (L < 1e-9) return;
      var u = scale(d, 1 / L), ts = [0, L];
      vlist.forEach(function (v) {
        var w = sub(v, a), t = dot(w, u);
        if (t <= 1e-6 || t >= L - 1e-6) return;
        var perp = len(sub(w, scale(u, t)));
        if (perp < 1e-5) ts.push(t);
      });
      ts.sort(function (x, y) { return x - y; });
      for (var i = 0; i + 1 < ts.length; i++) {
        if (ts[i + 1] - ts[i] < 1e-7) continue;
        split.push([add(a, scale(u, ts[i])), add(a, scale(u, ts[i + 1]))]);
      }
    });
    // an edge is on the boundary when no opposite-direction twin exists
    var count = {};
    split.forEach(function (e) {
      var k = key3(e[0]) + '>' + key3(e[1]);
      count[k] = (count[k] || 0) + 1;
    });
    var boundary = split.filter(function (e) {
      var twin = key3(e[1]) + '>' + key3(e[0]);
      return !count[twin];
    });
    // chain
    var next = {};
    boundary.forEach(function (e) { next[key3(e[0])] = e; });
    var used = {}, loops = [];
    boundary.forEach(function (e) {
      var k0 = key3(e[0]);
      if (used[k0]) return;
      var loop = [], cur = e, guard = 0;
      while (cur && !used[key3(cur[0])] && guard++ < 100000) {
        used[key3(cur[0])] = true;
        loop.push(to2D(plane, cur[0]));
        cur = next[key3(cur[1])];
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
    var pts = [];
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
      var segs = Math.max(4, Math.round(sweep / (Math.PI / 12)));
      for (var s = 0; s <= segs; s++) pts.push(add(c, rotatePoint(vA, [0, 0, 0], axis, sweep * s / segs)));
    }
    var last = pts[pts.length - 1], first = pts[0];
    if (e.convex) {
      pts.push(add(last, scale(nB, ext)), add(first, scale(nA, ext)));
    } else {
      pts.push(sub(m, scale(add(dA, dB), ext)));
    }
    var loop = pts.map(uv);
    if (signedArea(loop) < 0) { loop.reverse(); pts.reverse(); }
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
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      pushPoly(polys, [bottom[i], bottom[j], top[j], top[i]], tag);
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

  // -> { cut: CSG|null, add: CSG|null, count }
  function buildEdgeFeature(f, ctx) {
    if (!ctx.body) throw new Error('Nothing to ' + f.type + ' yet.');
    var size = f.type === 'chamfer' ? +f.d : +f.r;
    if (!(size > 0)) throw new Error((f.type === 'chamfer' ? 'Distance' : 'Radius') + ' must be greater than zero.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex !== null; });
    var selected = resolveEdges(f.edges, edges, Math.max(0.5, size));
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

  // ------------------------------------------------------------------ sweep & loft
  // Chain a sketch's open entities (lines, arcs, open polylines) into one 3D polyline path.
  // `info.dropped` receives the number of entities that did not connect to the chain.
  function sketchPath(sketch, plane, info) {
    var chains = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction) return;
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
      var capA = i > 0 ? { v: pts[i], n: norm(add(dirs[i - 1], dirs[i])) } : null;
      var capB = i + 1 < dirs.length ? { v: pts[i + 1], n: norm(add(dirs[i], dirs[i + 1])) } : null;
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
    var N = 24;
    secs.forEach(function (s) { N = Math.max(N, s.pts.length); });
    N = Math.min(N, 96);
    var loops = secs.map(function (s) { return resampleLoop(s.pts, N); });
    // consistent winding along the loft direction, then align start indices
    for (var i = 0; i + 1 < loops.length; i++) {
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
    var polys = [];
    for (i = 0; i + 1 < loops.length; i++) {
      var P = loops[i], Q = loops[i + 1];
      for (var k2 = 0; k2 < N; k2++) {
        var j = (k2 + 1) % N;
        pushPoly(polys, [P[k2], P[j], Q[j]], f.id);
        pushPoly(polys, [P[k2], Q[j], Q[k2]], f.id);
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
    if (extensions.length) inner = inner.union(unionTree(extensions));
    if (slabs.length) inner = inner.subtract(unionTree(slabs));
    if (!inner.polygons.length || inner.volume() < 1e-9) throw new Error('Shell thickness ' + T + ' is too large for this part: nothing would remain hollow.');
    var body = ctx.body.subtract(inner);
    return { body: body, inner: inner, removed: removed };
  }

  // ------------------------------------------------------------------ sheet metal: edge flange and flat pattern
  function sheetParams(model) {
    return model.sheet || { thickness: 2, bendRadius: 2, kFactor: 0.71 };
  }

  // Flange section in the (o, u) frame: o across the edge (outward), u along the fold. The strip o ∈ [-ov, 0] overlaps
  // the sheet so the union is watertight; the material actually added is the o >= 0 part (bend + wall).
  function flangeProfile(A, R, T, L, ov) {
    var segs = Math.max(4, Math.round(8 * A / (Math.PI / 2)));
    var inner = [], outer = [];
    for (var s = 0; s <= segs; s++) {
      var th = A * s / segs;
      inner.push([R * Math.sin(th), R - R * Math.cos(th)]);
      outer.push([(R + T) * Math.sin(th), R - (R + T) * Math.cos(th)]);
    }
    var tx = Math.cos(A), ty = Math.sin(A);
    var iEnd = [inner[segs][0] + tx * L, inner[segs][1] + ty * L], oEnd = [outer[segs][0] + tx * L, outer[segs][1] + ty * L];
    var loop = [[-ov, 0]].concat(inner, [iEnd, oEnd], outer.slice().reverse(), [[-ov, -T]]);
    if (signedArea(loop) < 0) loop.reverse();
    return loop;
  }

  // Edge flange: bend (inner radius R, thickness T, sweep angle) plus a flat wall of length L, swept along each
  // selected straight edge of a flat sheet face. "Bend outside" placement: the flange sits beyond the edge.
  // `miter`: flanges on two selected edges that share a corner are extended past it and clipped by the corner's
  // bisector plane (each keeps its own side, moved apart by miterGap/2), so they meet at a mitre.
  // `relief` ('rect' | 'obround'): where a flange end runs into more sheet (the plate continues beyond the end,
  // inline or on the outward side) a slot reliefWidth wide (default T) is cut from the base before the flange is
  // added, from reliefDepth (default T/2) inside the edge out past the bend zone. Ends shared with another selected
  // edge (mitred or collinear) get no relief.
  function buildFlange(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding edge flanges.');
    var sheet = sheetParams(model);
    var T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var L = +f.length, A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180;
    if (!isFinite(L)) throw new Error('Flange length must be a number.');
    if (!isFinite(A)) throw new Error('Flange angle must be a number.');
    if (!(L > 0)) throw new Error('Flange length must be greater than zero.');
    if (!(A > 0.01)) throw new Error('Flange angle must be greater than zero.');
    var miter = !!f.miter, gap = Math.max(0, +f.miterGap || 0);
    var relief = f.relief === 'rect' || f.relief === 'obround' ? f.relief : 'none';
    var rw = f.reliefWidth != null ? +f.reliefWidth : T, rd = f.reliefDepth != null ? +f.reliefDepth : T / 2;
    if (relief !== 'none' && !(rw > 0)) throw new Error('Relief width must be greater than zero.');
    if (relief !== 'none' && !(rd >= 0)) throw new Error('Relief depth must be zero or more.');
    var mesh = meshFromBody(ctx.body);
    var edges = bodyEdges(mesh).filter(function (e) { return !e.smooth && e.faces.length === 2 && e.convex; });
    var selected = resolveEdges((f.edges || []).map(function (e) { return { at: e.at, chain: false }; }), edges, Math.max(0.5, T));
    if (!selected.length) throw new Error('No edge selected for the flange.');
    // placement: 'bendOutside' (default: bend and wall beyond the edge), 'outside' (Material Outside: the wall's inner
    // face at the edge), 'inside' (Material Inside: the wall's outer face at the edge). The base sheet is trimmed back
    // by the shift so the bend takes its place.
    var shift = f.position === 'inside' ? R + T : (f.position === 'outside' ? R : 0);
    var ov = Math.min(T, 0.5); // overlap into the sheet so the union is watertight
    var tools = [], cuts = [], info = [], eds = [];
    selected.forEach(function (e) {
      var fa = mesh.faces[e.faces[0]], fb = mesh.faces[e.faces[1]];
      if (Math.abs(dot(fa.normal, fb.normal)) > 0.05) throw new Error('Flange edges must be square edges of a flat face.');
      var flat = fa.area >= fb.area ? 0 : 1;
      var nF = e.normals[flat], nT = e.normals[1 - flat];
      var u = f.reverse ? scale(nF, -1) : nF;   // flange goes toward u
      if (f.toward && dot(u, f.toward) < 0) u = scale(u, -1); // an explicit world direction wins over `reverse`
      var o = nT;                               // outward, away from the sheet
      // the bend's inside face is the sheet face on the side the flange folds toward
      var origin = dot(u, nF) > 0 ? e.mid : sub(e.mid, scale(nF, T));
      if (shift) {
        var cutPlane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
        var tca = dot(sub(e.a, e.mid), cutPlane.n), tcb = dot(sub(e.b, e.mid), cutPlane.n);
        cuts.push(prism([[-shift, 0.01], [-shift, -T - 0.01], [0.5, -T - 0.01], [0.5, 0.01]].reverse(), cutPlane, Math.min(tca, tcb) - 0.01, Math.max(tca, tcb) + 0.01, f.id));
        origin = sub(origin, scale(o, shift));
      }
      var plane = { origin: origin, x: o, y: u, n: norm(cross(o, u)) };
      var loop = flangeProfile(A, R, T, L, ov);
      var wmax = 0;
      loop.forEach(function (p) { wmax = Math.max(wmax, p[0]); });
      var ta = dot(sub(e.a, e.mid), plane.n), tb = dot(sub(e.b, e.mid), plane.n);
      // ends: P = vertex, t = sweep coordinate, dIn = unit direction from the vertex into the edge
      eds.push({ e: e, nF: nF, o: o, u: u, plane: plane, loop: loop, wmax: wmax,
        ends: [{ P: e.a, t: ta, dIn: norm(sub(e.b, e.a)) }, { P: e.b, t: tb, dIn: norm(sub(e.a, e.b)) }] });
    });
    // corners shared by two selected edges: mark them (no relief there) and, with `miter`, set up the mitre planes
    for (var i = 0; i < eds.length; i++) for (var j = i + 1; j < eds.length; j++) {
      var ei = eds[i], ej = eds[j];
      var tol = Math.max(1e-4, 1e-3 * Math.min(ei.e.len, ej.e.len));
      for (var ki = 0; ki < 2; ki++) for (var kj = 0; kj < 2; kj++) {
        var ea = ei.ends[ki], eb = ej.ends[kj];
        if (len(sub(ea.P, eb.P)) > tol) continue;
        ea.shared = eb.shared = true;
        if (!miter || ea.miter || eb.miter) continue;
        var di = ea.dIn, dj = eb.dIn;
        if (len(cross(di, dj)) < 1e-6 || dot(ei.u, ej.u) < 0.99) continue; // collinear, or folding opposite ways
        var c = dot(ei.o, ej.o);
        if (1 + c < 0.05) continue;
        // corner of the (possibly trimmed-back) edge lines, and the bisector plane through it containing the sheet normal
        var V = scale(add(ea.P, eb.P), 0.5);
        if (shift) V = sub(V, scale(add(ei.o, ej.o), shift / (1 + c)));
        var nb = norm(sub(di, dj));
        [[ei, ea, nb], [ej, eb, scale(nb, -1)]].forEach(function (q) {
          var ed = q[0], en = q[1], n = q[2];
          // extend the sweep past the corner far enough for the outermost point of the section to reach the bisector
          var ext = ed.wmax * dot(ed.o, n) / dot(en.dIn, n);
          ext = Math.max(0, Math.min(ext, 4 * ed.wmax)) + 1;
          en.miter = { n: n, w: dot(V, n) + gap / 2, tExt: dot(sub(V, ed.plane.origin), ed.plane.n) - dot(en.dIn, ed.plane.n) * ext };
        });
      }
    }
    var inside = null;
    eds.forEach(function (ed) {
      var t0 = ed.ends[0].miter ? ed.ends[0].miter.tExt : ed.ends[0].t;
      var t1 = ed.ends[1].miter ? ed.ends[1].miter.tExt : ed.ends[1].t;
      var tool = prism(ed.loop, ed.plane, Math.min(t0, t1), Math.max(t0, t1), f.id);
      ed.ends.forEach(function (en) { if (en.miter) tool = tool.clipByPlane(en.miter.n, en.miter.w); });
      tools.push(tool);
      if (relief !== 'none') ed.ends.forEach(function (en) {
        if (en.shared) return;
        // does the sheet continue beyond this end? probe half a thickness past it at mid-thickness, inside the
        // base (just behind the edge) and on the outward side (a plate lying beside the bend zone)
        if (!inside) inside = ctx.body.pointTester();
        var past = add(sub(en.P, scale(ed.nF, T / 2)), scale(en.dIn, -0.5 * T));
        if (!inside(add(past, scale(ed.o, -0.25 * T))) && !inside(add(past, scale(ed.o, (R + T) / 2)))) return;
        var beyond = -dot(en.dIn, ed.plane.n); // sign of t past the end
        var tA = beyond > 0 ? en.t : en.t - rw, tB = beyond > 0 ? en.t + rw : en.t;
        var o0 = -(shift + rd), o1 = R + T + rd;
        var slot = [[o1, tA], [o1, tB]];
        if (relief === 'obround') {
          var r = rw / 2, oc = o0 + r, tc = (tA + tB) / 2;
          for (var k = 0; k <= 12; k++) { var ph = Math.PI / 2 + Math.PI * k / 12; slot.push([oc + r * Math.cos(ph), tc + r * Math.sin(ph)]); }
        } else slot.push([o0, tB], [o0, tA]);
        // sweep the slot outline (in the sheet plane: o across, t along the edge) through the thickness (u ∈ [-T, 0])
        var sp = { origin: ed.plane.origin, x: ed.o, y: ed.plane.n, n: scale(ed.u, -1) };
        cuts.push(prism(slot, sp, -0.01, T + 0.01, f.id));
      });
      var sh = scale(ed.o, -shift), e = ed.e;
      // miterPlanes: per end, the clip plane { n, w } (tool kept where n·p >= w) or null; the flat pattern uses it to
      // run the bend strip out to the mitre line. Plain arrays and numbers only: the record must survive a structured clone.
      info.push({ a: add(e.a, sh), b: add(e.b, sh), mid: add(e.mid, sh), origin: ed.plane.origin, o: ed.o, u: ed.u, len: e.len, angle: A, R: R, L: L, T: T,
        mitred: [!!ed.ends[0].miter, !!ed.ends[1].miter],
        miterPlanes: ed.ends.map(function (en) { return en.miter ? { n: en.miter.n.slice(), w: en.miter.w } : null; }) });
    });
    ctx.flanges[f.id] = info;
    ctx.flangeCut = cuts.length ? unionAll(cuts) : null;
    return unionAll(tools);
  }

  // Jog: two opposite bends in one feature. The first flange lifts the sheet by `height` (wall length so the offset
  // measured between the flats is `height`), the second folds back parallel to the base for `length`.
  // -> tool and cut for the first bend; the second is built on the intermediate body. Info records for both.
  function buildJog(f, model, ctx) {
    if (!ctx.body) throw new Error('Create a Base Flange before adding a jog.');
    var sheet = sheetParams(model), T = +sheet.thickness, R = f.radius != null ? +f.radius : +sheet.bendRadius;
    var A = (f.angle == null ? 90 : +f.angle) * Math.PI / 180, H = +f.height, L2 = +f.length;
    if (!isFinite(H) || !isFinite(L2) || !isFinite(A)) throw new Error('Jog height, length and angle must be a number each.');
    if (!(H > 0)) throw new Error('Jog height must be greater than zero.');
    if (!(L2 > 0)) throw new Error('Jog length must be greater than zero.');
    if (!(A > 0.05 && A < Math.PI - 0.05)) throw new Error('Jog angle must be between 3° and 177°.');
    // wall length so the jogged flat's near face sits `height` from the base's fold-side face:
    // rise = R(1−cosA) [first bend] + wall·sinA + R(1−cosA) − T·cosA [second bend, inner radius on the far face]
    var wall = (H - 2 * R * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A);
    if (!(wall > 0.01)) throw new Error('Jog height is too small for this bend radius and angle.');
    var f1 = { id: f.id, edges: f.edges, angle: A * 180 / Math.PI, length: wall, reverse: !!f.reverse, radius: R, position: f.position };
    var tool1 = buildFlange(f1, model, ctx), cut1 = ctx.flangeCut, info1 = ctx.flanges[f.id];
    var body1 = cut1 ? ctx.body.subtract(cut1) : ctx.body;
    body1 = body1.union(tool1);
    // second bend: pick the end edge of each wall (mid-thickness point), fold back toward the outward direction
    var picks = info1.map(function (fi) {
      var sA = Math.sin(A), cA = Math.cos(A);
      var innerEnd = add(add(fi.origin, scale(fi.o, R * sA + cA * wall)), scale(fi.u, R - R * cA + sA * wall));
      var outerDir = add(scale(fi.o, sA), scale(fi.u, -cA)); // away from the bend centre at the wall
      var tw = add(scale(fi.o, cA), scale(fi.u, sA));
      var toward = norm(sub(fi.o, scale(tw, dot(fi.o, tw))));
      return { at: add(innerEnd, scale(outerDir, T / 2)), toward: toward };
    });
    var ctx2 = { body: body1, flanges: {}, tools: {} };
    var tools2 = [], infos2 = [];
    picks.forEach(function (pk) {
      var f2 = { id: f.id, edges: [{ at: pk.at }], angle: A * 180 / Math.PI, length: L2, toward: pk.toward, radius: R, position: 'bendOutside' };
      tools2.push(buildFlange(f2, model, ctx2));
      infos2 = infos2.concat(ctx2.flanges[f.id]);
    });
    ctx.flanges[f.id] = info1.concat(infos2);
    ctx.flangeCut = cut1;
    return { first: tool1, second: unionAll(tools2) };
  }

  // Bend allowance with the shop k-factor: arc length of the neutral axis.
  function bendAllowance(angleRad, R, T, K) { return angleRad * (R + K * T); }

  // -> { loops: [[[u,v],...]] (outer first, CCW; holes after), bends: [{a:[u,v], b:[u,v], label, up, angle, R}], plane, sheet, bbox }
  // Recursive unfold on one side of the sheet: the base face (largest face on the +n side of the base sketch plane)
  // is mapped into the sketch frame; every flange attached to an unfolded face contributes a bend strip of length
  // BA = angle·(R + K·T) beyond its edge and then unfolds its wall face (real outline, holes included) with a rigid
  // map, recursively, so flanges on flanges and holes on walls all reach the flat. The regions are merged with the
  // CSG kernel (thin prisms) and the merged top face's outline is the blank.
  function flatPattern(model, build, mesh) {
    var sheet = model.sheet;
    if (!sheet) throw new Error('No sheet metal parameters: create a Base Flange first (Sheet Metal tab).');
    var base = model.features.filter(function (f) { return f.sheetBase; })[0];
    if (!base) throw new Error('No Base Flange feature found.');
    var sketch = findFeature(model, base.sketch);
    var plane = resolvePlane(sketch.plane, model, build.planes);
    var K = +sheet.kFactor, T = +sheet.thickness;
    var best = null;
    mesh.faces.forEach(function (face, i) {
      var d = dot(face.normal, plane.n);
      if (Math.abs(d) < 0.999) return;
      var score = face.area * (d > 0 ? 1 + 1e-9 : 1);
      if (!best || score > best.score) best = { face: face, i: i, score: score };
    });
    if (!best) throw new Error('Could not find the flat sheet face.');
    var flanges = [];
    model.features.forEach(function (f) {
      if ((f.type !== 'flange' && f.type !== 'jog') || build.errors[f.id]) return;
      (build.flanges[f.id] || []).forEach(function (fi) { flanges.push(fi); });
    });
    var regions = [], bends = [], usedFaces = {}, usedFlanges = {};
    function onSegment(p, a, b) {
      var d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
      if (L2 < 1e-12) return false;
      var t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2;
      if (t < -1e-6 || t > 1 + 1e-6) return false;
      return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t) < 1e-3;
    }
    function unfold(faceIdx, map, nTracked, depth) {
      if (usedFaces[faceIdx] || depth > 16) return;
      usedFaces[faceIdx] = true;
      var face = mesh.faces[faceIdx], o = faceOutline(mesh, faceIdx);
      if (!o) return;
      var loops2 = o.loops.map(function (l) { return l.map(function (p) { return map(to3D(o.plane, p[0], p[1])); }); });
      regions.push(loops2);
      flanges.forEach(function (fi, k) {
        if (usedFlanges[k] || Math.abs(dot(fi.u, face.normal)) < 0.999) return;
        var dm = dot(fi.mid, face.normal) - face.w;
        if (Math.abs(dm) > 1e-3 && Math.abs(Math.abs(dm) - T) > 1e-3) return;
        var A2 = map(fi.a), B2 = map(fi.b);
        var attached = loops2.some(function (l) {
          return l.some(function (p, i) { var q = l[(i + 1) % l.length]; return onSegment(A2, p, q) && onSegment(B2, p, q); });
        });
        if (!attached) return;
        usedFlanges[k] = true;
        var M2 = map(fi.mid), O2 = map(add(fi.mid, fi.o));
        var o2 = [O2[0] - M2[0], O2[1] - M2[1]], ol = Math.hypot(o2[0], o2[1]);
        if (ol < 1e-9) return;
        o2 = [o2[0] / ol, o2[1] / ol];
        var BA = bendAllowance(fi.angle, fi.R, T, K), eps = 1e-3;
        function off(p, d) { return [p[0] + o2[0] * d, p[1] + o2[1] * d]; }
        var trackedInner = dot(fi.u, nTracked) > 0;
        // the wall face on the tracked side of the sheet: inner radius when the fold comes toward this side
        var Rt = trackedInner ? fi.R : fi.R + T, sA = Math.sin(fi.angle), cA = Math.cos(fi.angle);
        // Ends of the bend strip. An unmitred end is square at the edge end (t0 = ext = 0). A mitred end was swept past
        // the end point P and clipped by the plane { n, w } (kept where n·p >= w): a wall point at o-distance d from the
        // edge line reaches t(d) = (n·P − w + d·(o·n)) / (dIn·n) past P, so the wall's start line (d = Rt·sin A) ends at
        // `ext`, the base corner (d = 0) sits at `t0` (0 without a gap or a placement shift) and the wall's end line
        // slants by `slope` per unit of wall length when the fold is not 90°. The strip is drawn as a trapezoid whose
        // end edge runs straight from the base corner to that wall corner, so the blank has no step at the mitre.
        var ends = [fi.a, fi.b].map(function (P, kk) {
          var Q = kk === 0 ? A2 : B2, other = kk === 0 ? B2 : A2;
          var dl = Math.hypot(Q[0] - other[0], Q[1] - other[1]);
          var r = { P: Q, dOut: dl > 1e-9 ? [(Q[0] - other[0]) / dl, (Q[1] - other[1]) / dl] : [0, 0], t0: 0, ext: 0, slope: 0, mitred: false };
          var mp = fi.miterPlanes && fi.miterPlanes[kk];
          if (!mp || dl <= 1e-9) return r;
          var dIn = norm(sub(kk === 0 ? fi.b : fi.a, P)), dn = dot(dIn, mp.n);
          if (!(dn > 1e-9)) return r;
          var kappa = dot(fi.o, mp.n) / dn;
          r.t0 = (dot(mp.n, P) - mp.w) / dn;
          r.ext = r.t0 + kappa * Rt * sA;
          r.slope = kappa * cA;
          r.mitred = true;
          return r;
        });
        // point at o-distance d from the edge and t past end r along the edge line
        function corner(r, d, t) { return [r.P[0] + o2[0] * d + r.dOut[0] * t, r.P[1] + o2[1] * d + r.dOut[1] * t]; }
        var eA = ends[0], eB = ends[1];
        // strip: base side at −eps (inside the sheet), far side at BA + eps (inside the wall). A mitred end passes through
        // the wall corner (BA, ext) itself and then follows the wall's end line for the eps overlap, so the strip never
        // pokes out past the wall's unfolded outline.
        var strip = [corner(eA, -eps, eA.t0 - (eA.ext - eA.t0) * eps / BA), corner(eB, -eps, eB.t0 - (eB.ext - eB.t0) * eps / BA)];
        if (eB.mitred) strip.push(corner(eB, BA, eB.ext), corner(eB, BA + eps, eB.ext + eB.slope * eps));
        else strip.push(off(B2, BA + eps));
        if (eA.mitred) strip.push(corner(eA, BA + eps, eA.ext + eA.slope * eps), corner(eA, BA, eA.ext));
        else strip.push(off(A2, BA + eps));
        regions.push([strip]);
        // bend line: mid-strip, reaching the mitre line at a mitred end
        bends.push({ a: corner(eA, BA / 2, (eA.t0 + eA.ext) / 2), b: corner(eB, BA / 2, (eB.t0 + eB.ext) / 2), up: trackedInner, angle: fi.angle * 180 / Math.PI, R: fi.R, label: (trackedInner ? 'UP' : 'DOWN') + ' ' + Math.round(fi.angle * 180 / Math.PI) + '° R' + fi.R });
        var Pmid = add(add(fi.origin, scale(fi.o, Rt * sA)), scale(fi.u, fi.R - Rt * cA));
        var wn = trackedInner ? add(scale(fi.o, -sA), scale(fi.u, cA)) : add(scale(fi.o, sA), scale(fi.u, -cA));
        var tw = add(scale(fi.o, cA), scale(fi.u, sA));
        var dir3 = norm(cross(tw, wn)), dir2 = [o2[1], -o2[0]];
        var wallMap = function (Q) {
          var d = sub(Q, Pmid), s = dot(d, dir3), w = dot(d, tw);
          return [M2[0] + dir2[0] * s + o2[0] * (BA + w), M2[1] + dir2[1] * s + o2[1] * (BA + w)];
        };
        var wIdx = -1;
        mesh.faces.forEach(function (fc, i) { if (wIdx < 0 && dot(fc.normal, wn) > 0.999 && Math.abs(dot(fc.normal, Pmid) - fc.w) < 1e-3) wIdx = i; });
        if (wIdx >= 0 && !usedFaces[wIdx]) unfold(wIdx, wallMap, wn, depth + 1);
        else regions.push([[corner(eA, BA - eps, eA.ext - eA.slope * eps), corner(eB, BA - eps, eB.ext - eB.slope * eps),
          corner(eB, BA + fi.L, eB.ext + eB.slope * fi.L), corner(eA, BA + fi.L, eA.ext + eA.slope * fi.L)]]);
      });
    }
    unfold(best.i, function (Q) { return to2D(plane, Q); }, best.face.normal, 0);
    // merge: thin prisms in the Front frame, union, outline of the top face
    var fp = makePlane('Front', 0), solids = [];
    regions.forEach(function (loops) {
      var cl = [];
      loops.forEach(function (l) {
        var a = signedArea(l);
        if (Math.abs(a) < 1e-9) return;
        cl.push({ pts: a > 0 ? l : l.slice().reverse(), depth: 0 });
      });
      cl.forEach(function (x) {
        var probe = [(x.pts[0][0] + x.pts[1][0]) / 2, (x.pts[0][1] + x.pts[1][1]) / 2];
        cl.forEach(function (y) { if (x !== y && pointInPoly(probe, y.pts)) x.depth++; });
      });
      var outers = cl.filter(function (x) { return x.depth % 2 === 0; }).map(function (x) { return prism(x.pts, fp, 0, 1); });
      var holes = cl.filter(function (x) { return x.depth % 2 === 1; }).map(function (x) { return prism(x.pts, fp, -0.01, 1.01); });
      if (!outers.length) return;
      var s = unionAll(outers);
      if (holes.length) s = s.subtract(unionAll(holes));
      solids.push(s);
    });
    if (!solids.length) throw new Error('Could not build the flat pattern.');
    var merged = unionTree(solids), fm = meshFromBody(merged), topIdx = -1;
    fm.faces.forEach(function (fc, i) { if (fc.normal[2] > 0.999 && Math.abs(fc.w - 1) < 1e-6) topIdx = i; });
    if (topIdx < 0) throw new Error('Could not build the flat pattern.');
    var fo = faceOutline(fm, topIdx);
    var loops = fo.loops.map(function (l) { return l.map(function (p) { var q = to3D(fo.plane, p[0], p[1]); return [q[0], q[1]]; }); });
    loops.sort(function (a, b) { return signedArea(b) - signedArea(a); });
    if (!loops.length || signedArea(loops[0]) <= 0) throw new Error('Could not build the flat pattern.');
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    loops.forEach(function (l) { l.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }); });
    return { loops: loops, bends: bends, plane: plane, sheet: sheet, bbox: { min: min, max: max } };
  }
  function near2(p, q) { return Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3; }

  function exportDXFFlat(flat, units) {
    var d = new DXF(units);
    flat.loops.forEach(function (l, i) {
      var layer = i === 0 ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    flat.bends.forEach(function (b) {
      d.line('BEND', b.a, b.b);
      d.text('NOTES', [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], Math.max(1.5, flat.sheet.thickness), b.label);
    });
    var s = flat.sheet;
    d.text('NOTES', [flat.bbox.min[0], flat.bbox.min[1] - Math.max(3, s.thickness * 2)], Math.max(1.5, s.thickness), 'T=' + s.thickness + ' R=' + s.bendRadius + ' K=' + s.kFactor);
    return d.toString();
  }

  // ------------------------------------------------------------------ exports
  function fmt(n) { return (Math.round(n * 1e6) / 1e6).toString(); }

  function exportSTL(mesh, name) {
    var p = mesh.positions, n = mesh.normals, out = ['solid ' + (name || 'anvil')];
    for (var i = 0; i < p.length; i += 9) {
      out.push('  facet normal ' + fmt(n[i]) + ' ' + fmt(n[i + 1]) + ' ' + fmt(n[i + 2]));
      out.push('    outer loop');
      for (var k = 0; k < 3; k++) out.push('      vertex ' + fmt(p[i + k * 3]) + ' ' + fmt(p[i + k * 3 + 1]) + ' ' + fmt(p[i + k * 3 + 2]));
      out.push('    endloop');
      out.push('  endfacet');
    }
    out.push('endsolid ' + (name || 'anvil'));
    return out.join('\n');
  }

  function DXF(units) {
    this.lines = [];
    this.insunits = units === 'in' ? 1 : 4;
  }
  DXF.prototype.pair = function (code, value) { this.lines.push(String(code), String(value)); };
  DXF.prototype.line = function (layer, a, b) {
    this.pair(0, 'LINE'); this.pair(8, layer);
    this.pair(10, fmt(a[0])); this.pair(20, fmt(a[1])); this.pair(30, 0);
    this.pair(11, fmt(b[0])); this.pair(21, fmt(b[1])); this.pair(31, 0);
  };
  DXF.prototype.circle = function (layer, c, r) {
    this.pair(0, 'CIRCLE'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
  };
  DXF.prototype.arc = function (layer, c, r, a0, a1) {
    this.pair(0, 'ARC'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
    this.pair(50, fmt(a0)); this.pair(51, fmt(a1));
  };
  DXF.prototype.text = function (layer, p, height, text) {
    this.pair(0, 'TEXT'); this.pair(8, layer);
    this.pair(10, fmt(p[0])); this.pair(20, fmt(p[1])); this.pair(30, 0); this.pair(40, fmt(height)); this.pair(1, text);
  };
  DXF.prototype.polyline = function (layer, pts, closed) {
    this.pair(0, 'POLYLINE'); this.pair(8, layer); this.pair(66, 1); this.pair(70, closed ? 1 : 0);
    for (var i = 0; i < pts.length; i++) {
      this.pair(0, 'VERTEX'); this.pair(8, layer);
      this.pair(10, fmt(pts[i][0])); this.pair(20, fmt(pts[i][1])); this.pair(30, 0);
    }
    this.pair(0, 'SEQEND');
  };
  DXF.prototype.toString = function () {
    var head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', String(this.insunits), '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '4',
      '0', 'LAYER', '2', 'OUTLINE', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'HOLES', '70', '0', '62', '1', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'BEND', '70', '0', '62', '3', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'NOTES', '70', '0', '62', '5', '6', 'CONTINUOUS',
      '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    return head.concat(this.lines, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
  };

  // A loop that is a regular sampling of a circle becomes a true CIRCLE entity.
  function loopAsCircle(pts) {
    if (pts.length < 12) return null;
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    var r = 0;
    pts.forEach(function (p) { r += Math.hypot(p[0] - cx, p[1] - cy); });
    r /= pts.length;
    for (var i = 0; i < pts.length; i++) if (Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - r) > r * 0.01 + 1e-6) return null;
    return { c: [cx, cy], r: r };
  }

  function exportDXFSketch(sketch, units) {
    var d = new DXF(units);
    (sketch.entities || []).forEach(function (e) {
      if (e.t === 'circle') { d.circle('OUTLINE', [e.cx, e.cy], e.r); return; }
      if (e.t === 'arc') { d.arc('OUTLINE', [e.cx, e.cy], e.r, e.a0, e.a1); return; }
      if (e.t === 'line') { d.line('OUTLINE', [e.x1, e.y1], [e.x2, e.y2]); return; }
      if (e.t === 'point') return;
      entityPolylines(e).forEach(function (pl) { d.polyline('OUTLINE', pl.pts, pl.closed); });
    });
    return d.toString();
  }

  function exportDXFFace(mesh, faceIndex, units) {
    var o = faceOutline(mesh, faceIndex);
    if (!o) return null;
    var d = new DXF(units);
    var areas = o.loops.map(function (l) { return Math.abs(signedArea(l)); });
    var outerIdx = areas.indexOf(Math.max.apply(null, areas));
    o.loops.forEach(function (l, i) {
      var layer = i === outerIdx ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    return d.toString();
  }

  // ------------------------------------------------------------------ script builder (the API scripts talk to)
  function Builder(model) {
    this.model = model;
    this.lastId = null;
    this.lastSketchId = null;
    this.lastSolidId = null;
  }
  Builder.prototype._add = function (f) {
    f.id = this.model.nextId++;
    if (!f.name) f.name = featureName(this.model, f.type, f.cut);
    this.model.features.push(f);
    this.lastId = f.id;
    if (f.type === 'sketch') this.lastSketchId = f.id;
    else if (f.type !== 'plane') this.lastSolidId = f.id;
    return f;
  };
  Builder.prototype.name = function (n) { this.model.name = String(n); return this; };
  Builder.prototype.units = function (u) { this.model.units = u === 'in' ? 'in' : 'mm'; return this; };
  Builder.prototype.density = function (d) { this.model.density = +d; return this; };
  Builder.prototype.color = function (c) { this.model.color = String(c); return this; };
  Builder.prototype.plane = function (ref, offset, name) {
    var f = this._add({ type: 'plane', ref: ref || 'Front', offset: +offset || 0, name: name });
    return f.id;
  };
  Builder.prototype._planeRef = function (spec, offset) {
    if (spec == null) return { ref: 'Front', offset: 0 };
    if (typeof spec === 'number') return { featureId: spec };
    if (typeof spec === 'string') return { ref: spec, offset: +offset || 0 };
    if (spec.custom) return spec;
    if (spec.featureId != null) return { featureId: spec.featureId };
    return { ref: spec.ref || 'Front', offset: +(spec.offset || offset || 0) };
  };
  Builder.prototype.sketch = function (spec, offset, name) {
    var f = this._add({ type: 'sketch', plane: this._planeRef(spec, offset), entities: [], name: name });
    return new SketchBuilder(this, f);
  };
  Builder.prototype._sketchId = function (opts) {
    var id = opts && opts.sketch != null ? opts.sketch : this.lastSketchId;
    if (id == null) throw new Error('No sketch to use. Call sketch(...) first.');
    return id;
  };
  Builder.prototype.extrude = function (depth, opts) {
    opts = opts || {};
    var f = this._add({
      type: 'extrude', sketch: this._sketchId(opts), depth: depth == null ? 0 : +depth, end: opts.throughAll ? 'through' : (opts.midplane ? 'mid' : 'blind'),
      reverse: !!opts.reverse || opts.dir === -1, cut: !!opts.cut, dir2: !!opts.depth2 || !!opts.both,
      depth2: opts.depth2 != null ? +opts.depth2 : (opts.both ? +depth : 0), end2: opts.throughAll2 ? 'through' : 'blind', name: opts.name
    });
    if (opts.sheetBase) f.sheetBase = true;
    if (opts.draft) { f.draft = +opts.draft; if (opts.draftOutward) f.draftOut = true; }
    return this;
  };
  // Sheet metal parameters used by baseFlange/flange/flatten. K = 0.71 (steel) or 0.64 (aluminum) per shop practice.
  Builder.prototype.sheet = function (thickness, bendRadius, kFactor) {
    this.model.sheet = { thickness: +thickness, bendRadius: bendRadius == null ? +thickness : +bendRadius, kFactor: kFactor == null ? 0.71 : +kFactor };
    return this;
  };
  Builder.prototype.baseFlange = function (thickness, opts) {
    opts = opts || {};
    if (!this.model.sheet || thickness != null) this.sheet(thickness != null ? thickness : 2, opts.bendRadius, opts.kFactor);
    var T = this.model.sheet.thickness;
    var f = this.extrude(T, Object.assign({}, opts, { sheetBase: true, name: opts.name || 'Base-Flange1' }));
    return f;
  };
  // edges: [[x,y,z], ...] points on straight edges of the flat sheet face
  // opts: angle, reverse, radius, position, toward, name, miter (bool), miterGap, relief ('none' | 'rect' | 'obround'),
  // reliefWidth (default T), reliefDepth (default T/2)
  Builder.prototype.flange = function (length, edges, opts) {
    opts = opts || {};
    var f = { type: 'flange', length: +length, angle: opts.angle == null ? 90 : +opts.angle, reverse: !!opts.reverse, radius: opts.radius != null ? +opts.radius : null, position: opts.position || 'bendOutside', toward: opts.toward ? [+opts.toward[0], +opts.toward[1], +opts.toward[2]] : undefined,
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name,
      miter: !!opts.miter, relief: opts.relief === 'rect' || opts.relief === 'obround' ? opts.relief : 'none' };
    if (opts.miterGap != null) f.miterGap = +opts.miterGap;
    if (opts.reliefWidth != null) f.reliefWidth = +opts.reliefWidth;
    if (opts.reliefDepth != null) f.reliefDepth = +opts.reliefDepth;
    this._add(f);
    return this;
  };
  // hem: a 180° flange folded back over the sheet; `gap` is the opening between the flats (default T/2, open hem)
  Builder.prototype.hem = function (length, edges, opts) {
    opts = opts || {};
    var T = this.model.sheet ? +this.model.sheet.thickness : 2;
    var gap = opts.gap != null ? +opts.gap : T / 2;
    var f = { type: 'flange', hem: true, length: +length, angle: 180, reverse: !!opts.reverse, radius: Math.max(gap / 2, 0.02 * T), position: 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name };
    f.name = f.name || featureName(this.model, 'hem');
    this._add(f);
    return this;
  };
  // jog: two bends offsetting the sheet by `height`, then `length` of flat parallel to the base
  Builder.prototype.jog = function (height, length, edges, opts) {
    opts = opts || {};
    this._add({ type: 'jog', height: +height, length: +length, angle: opts.angle == null ? 90 : +opts.angle, reverse: !!opts.reverse, radius: opts.radius != null ? +opts.radius : null, position: opts.position || 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype.cut = function (depth, opts) {
    opts = Object.assign({}, opts || {}, { cut: true });
    if (depth === 'through' || depth == null) { opts.throughAll = true; depth = 0; }
    return this.extrude(depth, opts);
  };
  Builder.prototype.revolve = function (angle, opts) {
    opts = opts || {};
    this._add({ type: 'revolve', sketch: this._sketchId(opts), angle: angle == null ? 360 : +angle, axis: opts.axis == null ? 'y' : opts.axis, reverse: !!opts.reverse, cut: !!opts.cut, name: opts.name });
    return this;
  };
  Builder.prototype.revolveCut = function (angle, opts) { return this.revolve(angle, Object.assign({}, opts || {}, { cut: true })); };
  // sweep: profile sketch swept along a path (a sketch id of lines/arcs, or [[x,y,z],...])
  Builder.prototype.sweep = function (opts) {
    opts = opts || {};
    var profile = opts.profile != null ? opts.profile : this.lastSketchId;
    if (profile == null || opts.path == null) throw new Error('sweep needs {profile, path}.');
    this._add({ type: 'sweep', profile: profile, path: opts.path, cut: !!opts.cut, name: opts.name });
    return this;
  };
  // loft: blend between two or more sketches, each holding exactly one closed profile
  Builder.prototype.loft = function (sketches, opts) {
    opts = opts || {};
    if (!Array.isArray(sketches) || sketches.length < 2) throw new Error('loft needs an array of at least two sketch ids.');
    this._add({ type: 'loft', sketches: sketches.slice(), cut: !!opts.cut, name: opts.name });
    return this;
  };
  // shell: hollow the body with wall thickness t; faces: [[x,y,z], ...] points on the faces to remove (open)
  Builder.prototype.shell = function (t, faces, opts) {
    opts = opts || {};
    this._add({ type: 'shell', thickness: +t, faces: (faces || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype._srcId = function (opts) {
    var id = opts && opts.feature != null ? opts.feature : this.lastSolidId;
    if (id == null) throw new Error('No feature to pattern. Create a boss or cut first.');
    return id;
  };
  Builder.prototype.linearPattern = function (opts) {
    opts = opts || {};
    this._add({
      type: 'lpattern', feature: this._srcId(opts), d1: opts.dir || 'x', rev1: !!opts.reverse, s1: +opts.spacing || 10, n1: opts.count || 2,
      d2: opts.dir2 || null, rev2: !!opts.reverse2, s2: +opts.spacing2 || 0, n2: opts.count2 || 1, name: opts.name
    });
    return this;
  };
  Builder.prototype.circularPattern = function (opts) {
    opts = opts || {};
    this._add({ type: 'cpattern', feature: this._srcId(opts), axis: opts.axis || 'z', center: opts.center || [0, 0, 0], n: opts.count || 4, angle: opts.angle == null ? 360 : +opts.angle, equal: opts.equal !== false, name: opts.name });
    return this;
  };
  Builder.prototype.mirror = function (plane, opts) {
    opts = opts || {};
    var f = { type: 'mirror', plane: plane || 'Right', offset: +opts.offset || 0, name: opts.name };
    if (opts.body) f.body = true; else f.feature = this._srcId(opts);
    this._add(f);
    return this;
  };
  // edges: [[x,y,z], ...] points on (or near) the edges to modify; chain=false disables tangent propagation
  Builder.prototype.chamfer = function (d, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'chamfer', d: +d, edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.fillet = function (r, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'fillet', r: +r, edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.hole = function (planeSpec, x, y, dia, opts) {
    opts = opts || {};
    var s = this.sketch(planeSpec, opts.offset);
    s.circle(x, y, dia / 2);
    var f = s.end();
    if (opts.depth) f.cut(opts.depth, { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name });
    else f.cut('through', { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name });
    return this;
  };
  Builder.prototype.box = function (w, d, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0];
    // sketch on Top: u = x, v = -z
    var s = this.sketch('Top', at[1]);
    if (opts.centered) s.centerRect(at[0], -at[2], w, d); else s.rect(at[0], -at[2] - d, w, d);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name });
    return this;
  };
  Builder.prototype.cylinder = function (r, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0], axis = opts.axis || 'y';
    var s;
    if (axis === 'y') s = this.sketch('Top', at[1]).circle(at[0], -at[2], r);
    else if (axis === 'z') s = this.sketch('Front', at[2]).circle(at[0], at[1], r);
    else s = this.sketch('Right', at[0]).circle(-at[2], at[1], r);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name });
    return this;
  };
  Builder.prototype.last = function () { return this.lastId; };

  function SketchBuilder(part, feature) { this.part = part; this.f = feature; }
  SketchBuilder.prototype._e = function (e) { this.f.entities.push(e); return this; };
  SketchBuilder.prototype.line = function (x1, y1, x2, y2) { return this._e({ t: 'line', x1: +x1, y1: +y1, x2: +x2, y2: +y2 }); };
  SketchBuilder.prototype.rect = function (x, y, w, h) { return this._e({ t: 'rect', x: +x, y: +y, w: +w, h: +h }); };
  SketchBuilder.prototype.centerRect = function (cx, cy, w, h) { return this._e({ t: 'crect', cx: +cx, cy: +cy, w: +w, h: +h }); };
  SketchBuilder.prototype.circle = function (cx, cy, r) { return this._e({ t: 'circle', cx: +cx, cy: +cy, r: +r }); };
  SketchBuilder.prototype.polygon = function (cx, cy, r, n, rot) { return this._e({ t: 'poly', cx: +cx, cy: +cy, r: +r, n: n | 0 || 6, rot: +rot || 0 }); };
  SketchBuilder.prototype.slot = function (x1, y1, x2, y2, w) { return this._e({ t: 'slot', x1: +x1, y1: +y1, x2: +x2, y2: +y2, w: +w }); };
  SketchBuilder.prototype.arc = function (cx, cy, r, a0, a1) { return this._e({ t: 'arc', cx: +cx, cy: +cy, r: +r, a0: +a0, a1: +a1 }); };
  SketchBuilder.prototype.polyline = function (pts, closed) { return this._e({ t: 'polyline', pts: pts.map(function (p) { return [+p[0], +p[1]]; }), closed: closed !== false }); };
  SketchBuilder.prototype.point = function (x, y) { return this._e({ t: 'point', x: +x, y: +y }); };
  // mirror entities across 'x' | 'y' | a line entity index | {x1,y1,x2,y2}; opts.entities = indices (default all), opts.copy=false replaces
  SketchBuilder.prototype.mirrorEntities = function (axis, opts) {
    opts = opts || {};
    var ents = this.f.entities, ax = mirrorAxis(axis, ents);
    var idx = opts.entities || ents.map(function (e, i) { return i; });
    var copies = idx.map(function (i) { return mirrorEntity(ents[i], ax); }).filter(Boolean);
    if (opts.copy === false) this.f.entities = ents.filter(function (e, i) { return idx.indexOf(i) < 0; });
    copies.forEach(function (c) { this.f.entities.push(c); }, this);
    return this;
  };
  // linear pattern of entities: { dx, dy, count, dx2, dy2, count2, entities } (steps are vectors in sketch units)
  SketchBuilder.prototype.patternEntities = function (opts) {
    opts = opts || {};
    var ents = this.f.entities, idx = opts.entities || ents.map(function (e, i) { return i; });
    var n1 = Math.max(1, opts.count | 0), n2 = Math.max(1, opts.count2 | 0), src = idx.map(function (i) { return ents[i]; });
    for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
      if (!i && !j) continue;
      src.forEach(function (e) { this.f.entities.push(translateEntity(e, i * (+opts.dx || 0) + j * (+opts.dx2 || 0), i * (+opts.dy || 0) + j * (+opts.dy2 || 0))); }, this);
    }
    return this;
  };
  // trim entity `index` at the sketch point (u, v): removes the portion between neighbouring intersections
  SketchBuilder.prototype.trim = function (index, u, v) { if (Array.isArray(u)) { v = u[1]; u = u[0]; } this.f.entities = trimEntity(this.f.entities, index, [+u, +v]); return this; };
  // Smart Dimension on entity `index`: kind per dimForEntity ('len', 'dx', 'dy', 'w', 'h', 'dia', 'r', 'seg');
  // opts: { i (edge / segment), off, ang (placement), value (drive the entity to this value first) }
  SketchBuilder.prototype.dim = function (index, kind, opts) {
    opts = opts || {};
    var e = this.f.entities[index];
    if (!e) throw new Error('No sketch entity ' + index + ' to dimension.');
    var d = { e: index | 0, k: kind };
    if (opts.i != null) d.i = opts.i | 0;
    if (opts.off != null) d.off = +opts.off;
    if (opts.ang != null) d.ang = +opts.ang;
    if (!dimGeometry(e, d)) throw new Error('Dimension ' + JSON.stringify(kind) + ' does not apply to a ' + e.t + '.');
    if (opts.value != null) setDimValue(e, d, opts.value);
    (this.f.dims = this.f.dims || []).push(d);
    return this;
  };
  SketchBuilder.prototype.id = function () { return this.f.id; };
  SketchBuilder.prototype.end = function () { return this.part; };
  ['extrude', 'cut', 'revolve', 'revolveCut', 'baseFlange'].forEach(function (m) {
    SketchBuilder.prototype[m] = function (a, opts) {
      opts = Object.assign({}, opts || {}, { sketch: this.f.id });
      return this.part[m](a, opts);
    };
  });

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('p', 'part', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  // Regenerate a script from a model so the two representations stay interchangeable.
  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil', 'p.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units) + ');'];
    if (model.sheet) out.push('p.sheet(' + model.sheet.thickness + ', ' + model.sheet.bendRadius + ', ' + model.sheet.kFactor + ');');
    var idVar = {};
    model.features.forEach(function (f) {
      var v = 'f' + f.id;
      idVar[f.id] = v;
      switch (f.type) {
        case 'plane':
          out.push('var ' + v + ' = p.plane(' + JSON.stringify(f.ref) + ', ' + f.offset + ', ' + JSON.stringify(f.name) + ');');
          break;
        case 'sketch': {
          var pl = f.plane || {};
          var spec = pl.custom ? JSON.stringify(pl) : (pl.featureId != null ? idVar[pl.featureId] : JSON.stringify(pl.ref || 'Front') + ', ' + (pl.offset || 0));
          var s = 'var ' + v + ' = p.sketch(' + spec + (pl.custom || pl.featureId != null ? ', 0' : '') + ', ' + JSON.stringify(f.name) + ')';
          f.entities.forEach(function (e) {
            switch (e.t) {
              case 'line': s += '\n  .line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')'; break;
              case 'rect': s += '\n  .rect(' + [e.x, e.y, e.w, e.h].join(', ') + ')'; break;
              case 'crect': s += '\n  .centerRect(' + [e.cx, e.cy, e.w, e.h].join(', ') + ')'; break;
              case 'circle': s += '\n  .circle(' + [e.cx, e.cy, e.r].join(', ') + ')'; break;
              case 'poly': s += '\n  .polygon(' + [e.cx, e.cy, e.r, e.n, e.rot || 0].join(', ') + ')'; break;
              case 'slot': s += '\n  .slot(' + [e.x1, e.y1, e.x2, e.y2, e.w].join(', ') + ')'; break;
              case 'arc': s += '\n  .arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; break;
              case 'polyline': s += '\n  .polyline(' + JSON.stringify(e.pts) + ', ' + !!e.closed + ')'; break;
              case 'point': s += '\n  .point(' + e.x + ', ' + e.y + ')'; break;
            }
          });
          (f.dims || []).forEach(function (d) {
            var o = {};
            if (d.i != null) o.i = d.i;
            if (d.off != null) o.off = Math.round(d.off * 1e4) / 1e4;
            if (d.ang != null) o.ang = Math.round(d.ang * 1e4) / 1e4;
            s += '\n  .dim(' + d.e + ', ' + JSON.stringify(d.k) + (Object.keys(o).length ? ', ' + optsStr(o) : '') + ')';
          });
          out.push(s + '\n  .id();');
          break;
        }
        case 'extrude': {
          var o = { sketch: '@' + idVar[f.sketch], name: f.name };
          if (f.end === 'through') o.throughAll = true;
          if (f.end === 'mid') o.midplane = true;
          if (f.reverse) o.reverse = true;
          if (f.dir2) { o.depth2 = f.depth2; if (f.end2 === 'through') o.throughAll2 = true; }
          if (f.sheetBase) o.sheetBase = true;
          if (f.draft) { o.draft = f.draft; if (f.draftOut) o.draftOutward = true; }
          out.push('var ' + v + ' = p.' + (f.cut ? 'cut' : 'extrude') + '(' + f.depth + ', ' + optsStr(o) + ').last();');
          break;
        }
        case 'flange': {
          var fspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var fo = { angle: f.angle, name: f.name };
          if (f.reverse) fo.reverse = true;
          if (f.radius != null) fo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') fo.position = f.position;
          if (f.toward) fo.toward = f.toward.map(function (x) { return Math.round(x * 1e4) / 1e4; });
          if (f.miter) fo.miter = true;
          if (f.miterGap != null && +f.miterGap !== 0) fo.miterGap = +f.miterGap;
          if (f.relief && f.relief !== 'none') fo.relief = f.relief;
          if (f.reliefWidth != null) fo.reliefWidth = +f.reliefWidth;
          if (f.reliefDepth != null) fo.reliefDepth = +f.reliefDepth;
          if (f.hem) {
            var ho = { gap: Math.round(f.radius * 2 * 1e4) / 1e4, name: f.name };
            if (f.reverse) ho.reverse = true;
            out.push('var ' + v + ' = p.hem(' + f.length + ', ' + fspecs + ', ' + optsStr(ho) + ').last();');
          } else out.push('var ' + v + ' = p.flange(' + f.length + ', ' + fspecs + ', ' + optsStr(fo) + ').last();');
          break;
        }
        case 'jog': {
          var jspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var jo = { angle: f.angle, name: f.name };
          if (f.reverse) jo.reverse = true;
          if (f.radius != null) jo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') jo.position = f.position;
          out.push('var ' + v + ' = p.jog(' + f.height + ', ' + f.length + ', ' + jspecs + ', ' + optsStr(jo) + ').last();');
          break;
        }
        case 'revolve': {
          var ro = { sketch: '@' + idVar[f.sketch], name: f.name, axis: f.axis };
          if (f.reverse) ro.reverse = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'revolveCut' : 'revolve') + '(' + f.angle + ', ' + optsStr(ro) + ').last();');
          break;
        }
        case 'lpattern': {
          var lo = { feature: '@' + idVar[f.feature], dir: f.d1, spacing: f.s1, count: f.n1, name: f.name };
          if (f.rev1) lo.reverse = true;
          if (f.d2) { lo.dir2 = f.d2; lo.spacing2 = f.s2; lo.count2 = f.n2; if (f.rev2) lo.reverse2 = true; }
          out.push('var ' + v + ' = p.linearPattern(' + optsStr(lo) + ').last();');
          break;
        }
        case 'cpattern':
          out.push('var ' + v + ' = p.circularPattern(' + optsStr({ feature: '@' + idVar[f.feature], axis: f.axis, center: f.center, count: f.n, angle: f.angle, equal: f.equal !== false, name: f.name }) + ').last();');
          break;
        case 'mirror': {
          var mo = { name: f.name, offset: f.offset || 0 };
          if (f.body) mo.body = true; else mo.feature = '@' + idVar[f.feature];
          out.push('var ' + v + ' = p.mirror(' + JSON.stringify(f.plane) + ', ' + optsStr(mo) + ').last();');
          break;
        }
        case 'sweep': {
          var so = { profile: '@' + idVar[f.profile], path: Array.isArray(f.path) ? f.path : '@' + idVar[f.path], name: f.name };
          if (f.cut) so.cut = true;
          out.push('var ' + v + ' = p.sweep(' + optsStr(so) + ').last();');
          break;
        }
        case 'loft': {
          var lo2 = { name: f.name };
          if (f.cut) lo2.cut = true;
          out.push('var ' + v + ' = p.loft([' + f.sketches.map(function (id) { return idVar[id]; }).join(', ') + '], ' + optsStr(lo2) + ').last();');
          break;
        }
        case 'chamfer':
        case 'fillet': {
          var specs = JSON.stringify((f.edges || []).map(function (e) { return { at: e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), chain: e.chain !== false }; }));
          out.push('var ' + v + ' = p.' + f.type + '(' + (f.type === 'chamfer' ? f.d : f.r) + ', ' + specs + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'shell': {
          var fspecs2 = JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          out.push('var ' + v + ' = p.shell(' + f.thickness + ', ' + fspecs2 + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
      }
    });
    return out.join('\n');
  }
  function optsStr(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || v === false) return;
      if (typeof v === 'string' && v.charAt(0) === '@') parts.push(k + ': ' + v.slice(1));
      else parts.push(k + ': ' + JSON.stringify(v));
    });
    return '{ ' + parts.join(', ') + ' }';
  }

  return {
    STD_PLANES: STD_PLANES, AXES: AXES,
    makePlane: makePlane, planeFromFace: planeFromFace, resolvePlane: resolvePlane, to3D: to3D, to2D: to2D,
    entityPolylines: entityPolylines, entitySnapPoints: entitySnapPoints, sketchProfile: sketchProfile, signedArea: signedArea, loopSelfCrossing: loopSelfCrossing, checkProfile: checkProfile,
    offsetLoop: offsetLoop, filletPolyline: filletPolyline,
    mirrorAxis: mirrorAxis, mirrorEntity: mirrorEntity, translateEntity: translateEntity, entityPrimitives: entityPrimitives, trimEntity: trimEntity,
    dimGeometry: dimGeometry, dimValue: dimValue, setDimValue: setDimValue, dimForEntity: dimForEntity,
    newModel: newModel, featureName: featureName, findFeature: findFeature,
    buildTool: buildTool, isCut: isCut, rebuild: rebuild, buildEdgeFeature: buildEdgeFeature,
    packBuild: packBuild, packTransferables: packTransferables, unpackBuild: unpackBuild, applyProfiles: applyProfiles,
    meshFromBody: meshFromBody, massProps: massProps, faceOutline: faceOutline, bodyEdges: bodyEdges, resolveEdges: resolveEdges, pointSegmentDistance: pointSegmentDistance,
    exportSTL: exportSTL, exportDXFSketch: exportDXFSketch, exportDXFFace: exportDXFFace,
    buildFlange: buildFlange, buildJog: buildJog, flangeProfile: flangeProfile, flatPattern: flatPattern, exportDXFFlat: exportDXFFlat, bendAllowance: bendAllowance, sheetParams: sheetParams,
    sketchPath: sketchPath, buildSweep: buildSweep, buildLoft: buildLoft,
    resolveFaces: resolveFaces, buildShell: buildShell,
    Builder: Builder, runScript: runScript, generateScript: generateScript,
    vec: { add: add, sub: sub, scale: scale, dot: dot, cross: cross, len: len, norm: norm }
  };
})();
