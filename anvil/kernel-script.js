// kernel-script.js — Anvil kernel, exports and the script API: STL and DXF writers (`exportSTL`, `exportDXFSketch`,
// `exportDXFFace`, `exportDXFFlat`), the `Builder` / `SketchBuilder` the scripts talk to, `runScript` and
// `generateScript` (model -> script round trip). Loaded last, after every other kernel-*.js file. No DOM.
(function (K, _) {
  'use strict';
  var faceCopy = _.faceCopy, norm = _.norm, planeFromFace = _.planeFromFace, scale = _.scale, tidyPlane = _.tidyPlane;   // kernel.js
  var dimGeometry = _.dimGeometry, entityPolylines = _.entityPolylines, mirrorAxis = _.mirrorAxis, mirrorEntity = _.mirrorEntity, setDimValue = _.setDimValue, signedArea = _.signedArea, translateEntity = _.translateEntity, trimEntity = _.trimEntity;   // kernel-sketch.js
  var configExpr = _.configExpr, evalExpression = _.evalExpression, findConfiguration = _.findConfiguration, isExpression = _.isExpression, resolveEquations = _.resolveEquations;   // kernel-equations.js
  var faceOutline = _.faceOutline;   // kernel-mesh.js
  var featureName = _.featureName, featureTypes = _.featureTypes, scriptSections = _.scriptSections, sketchScripts = _.sketchScripts;   // kernel-rebuild.js

  // ------------------------------------------------------------------ DXF output (laser / Mastercam ready)
  // Every 2D export of a part goes through the writer below. A loop of a face or of the flat pattern arrives as the
  // vertices of a tessellated outline: true circles and arcs as chords, straight edges cut where the CSG split them,
  // near-coincident corners where two unfolded regions meet. dxfLoopCurves turns it back into what was drawn:
  //   1. weld: a segment shorter than `weld` (1e-3 model units) collapses onto the corner its neighbours meet at (or
  //      its midpoint), the closing duplicate goes;
  //   2. a vertex on the straight line through its neighbours (within 1e-6) goes: the points CSG split edges at;
  //   3. a run of three or more chords of equal length turning by the same small angle (at most 25° each: Anvil
  //      tessellates every circle with 16 or more segments and every arc with 4 or more) is fitted with a circle
  //      (least squares); when every vertex of the run lies on it within 1e-6·(1 + r) the run is an arc (its centre
  //      moved onto the perpendicular bisector of its ends, so both ends lie on it exactly), a whole loop of such
  //      chords is a circle;
  //   4. straight runs left are merged into one line (a vertex within 1e-4 of the line through its neighbours goes).
  // The writer emits a circle as CIRCLE and any other loop as one closed polyline with bulges (style 'polyline', the
  // default: joined end to end by construction; POLYLINE + VERTEX in R12, LWPOLYLINE in R2000) or as LINE and ARC
  // entities that share their end points (style 'entities').
  var DXF_TOL = { weld: 1e-3, onLine: 1e-6, merge: 1e-4, maxStep: 25 * Math.PI / 180, minChords: 3 };

  function dist2(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  // distance of p from the line a–b, and whether p projects strictly between a and b
  function offLine(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (L2 < 1e-30) return { d: dist2(p, a), inside: false };
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    return { d: Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(L2), inside: t > 0 && t < 1 };
  }
  // the crossing of the lines a1–a2 and b1–b2 (null when parallel)
  function crossLines(a1, a2, b1, b2) {
    var ux = a2[0] - a1[0], uy = a2[1] - a1[1], vx = b2[0] - b1[0], vy = b2[1] - b1[1], den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-12 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) return null;
    var t = ((b1[0] - a1[0]) * vy - (b1[1] - a1[1]) * vx) / den;
    return [a1[0] + ux * t, a1[1] + uy * t];
  }
  function dropCollinear(pts, tol) {
    for (var again = true; again && pts.length > 3;) {
      again = false;
      for (var i = 0; i < pts.length && pts.length > 3; i++) {
        var o = offLine(pts[i], pts[(i + pts.length - 1) % pts.length], pts[(i + 1) % pts.length]);
        if (o.inside && o.d <= tol) { pts.splice(i, 1); i--; again = true; }
      }
    }
    return pts;
  }
  // cleanLoop(pts, weld) -> the loop's vertices without duplicates, slivers and on-line points (steps 1 and 2)
  function cleanLoop(pts, weld) {
    var p = [];
    (pts || []).forEach(function (q) {
      if (!q || !isFinite(q[0]) || !isFinite(q[1])) return;
      q = [+q[0], +q[1]];
      if (!p.length || dist2(p[p.length - 1], q) > 1e-12) p.push(q);
    });
    while (p.length > 1 && dist2(p[0], p[p.length - 1]) <= 1e-12) p.pop();
    // collapse the shortest segment under `weld` first, onto the corner its neighbours meet at when that is near
    for (;;) {
      var n = p.length, best = -1, bl = Infinity;
      if (n < 3) break;
      for (var i = 0; i < n; i++) { var l = dist2(p[i], p[(i + 1) % n]); if (l <= weld && l < bl) { bl = l; best = i; } }
      if (best < 0) break;
      var a = p[best], b = p[(best + 1) % n], X = null;
      if (n >= 4) {
        X = crossLines(p[(best + n - 1) % n], a, b, p[(best + 2) % n]);
        if (X && (dist2(X, a) > 10 * weld || dist2(X, b) > 10 * weld)) X = null;
      }
      p[best] = X || [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      p.splice((best + 1) % n, 1);
    }
    return dropCollinear(p, DXF_TOL.onLine);
  }
  // fitCircle(pts) -> { c, r, err (largest |distance − r|) } by least squares (Kåsa, about the centroid), or null
  function fitCircle(pts) {
    var n = pts.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
    mx /= n; my /= n;
    var suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (i = 0; i < n; i++) {
      var u = pts[i][0] - mx, v = pts[i][1] - my;
      suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
    }
    var det = suu * svv - suv * suv;
    if (!(Math.abs(det) > 1e-30)) return null;
    var bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2;
    var c = [mx + (bu * svv - bv * suv) / det, my + (bv * suu - bu * suv) / det], r = 0, err = 0;
    for (i = 0; i < n; i++) r += dist2(c, pts[i]);
    r /= n;
    for (i = 0; i < n; i++) err = Math.max(err, Math.abs(dist2(c, pts[i]) - r));
    return isFinite(r) && r > 0 ? { c: c, r: r, err: err } : null;
  }
  function fitTol(r) { return 1e-6 * (1 + r); }
  // arcThrough(run, ccw) -> { t: 'arc', a, b, c, r, ccw, sweep (signed, radians) } through the run's ends, or null
  function arcThrough(run, ccw) {
    var f = fitCircle(run);
    if (!f || f.err > fitTol(f.r)) return null;
    var A = run[0], B = run[run.length - 1], M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], L = dist2(A, B);
    var c = f.c;
    if (L > 1e-12) {   // the centre onto the perpendicular bisector of A–B: both ends then lie on the arc exactly
      var nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L, t = (c[0] - M[0]) * nx + (c[1] - M[1]) * ny;
      c = [M[0] + nx * t, M[1] + ny * t];
    }
    var r = dist2(c, A), sw = Math.atan2(B[1] - c[1], B[0] - c[0]) - Math.atan2(A[1] - c[1], A[0] - c[0]);
    if (ccw) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
    return { t: 'arc', a: A, b: B, c: c, r: r, ccw: !!ccw, sweep: sw };
  }

  // rfFJ: an arc whose end chord was spoiled. At a tangent point where two tessellated curves meet at a shallow angle
  // (a fillet outside a circle: the chords turn by only |half step − half step|) a boolean leaves split points a few
  // 1e-4 along the chord, and the outline's 1e-4 weld can keep one of them instead of the tangent point. That end
  // chord is then a little longer or shorter than the run's and its far end 1e-5 off the circle, so it is not in the
  // run and was written as a LINE (one per fillet end on the laser). A single chord next to an arc is taken into
  // it when its far end lies on the arc's circle within snap·(1 + r) (snap 3e-5: a weld of 1e-4 along a chord that
  // turns by at most half of maxStep), it turns the same way, and it spans at most 1.5 × the arc's mean chord angle.
  // The arc then runs to that end (its centre moved onto the new ends' bisector, as arcThrough does).
  function absorbEndChords(segs, tol) {
    var snap = tol.snap != null ? tol.snap : 3e-5, TAU = 2 * Math.PI;
    function wrapPi(a) { a = ((a % TAU) + TAU) % TAU; return a > Math.PI ? a - TAU : a; }
    for (var again = true; again && segs.length > 2;) {
      again = false;
      for (var i = 0; i < segs.length && !again; i++) {
        var s = segs[i];
        if (s.t !== 'arc' || !s.n) continue;
        for (var dir = 1; dir >= -1 && !again; dir -= 2) {
          var j = (i + dir + segs.length) % segs.length, L = segs[j];
          if (L.t !== 'line') continue;
          var E = dir > 0 ? s.b : s.a, Q = dir > 0 ? L.b : L.a;
          if (dist2(dir > 0 ? L.a : L.b, E) > 1e-12) continue;
          if (Math.abs(dist2(s.c, Q) - s.r) > snap * (1 + s.r)) continue;
          var phi = wrapPi(Math.atan2(Q[1] - s.c[1], Q[0] - s.c[0]) - Math.atan2(E[1] - s.c[1], E[0] - s.c[0]));
          if (phi * (s.ccw ? 1 : -1) * dir <= 0 || Math.abs(phi) > 1.5 * Math.abs(s.sweep) / s.n) continue;
          var A = dir > 0 ? s.a : Q, B = dir > 0 ? Q : s.b, M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], LL = dist2(A, B), c = s.c;
          if (LL > 1e-12) {
            var nx = -(B[1] - A[1]) / LL, ny = (B[0] - A[0]) / LL, t = (c[0] - M[0]) * nx + (c[1] - M[1]) * ny;
            c = [M[0] + nx * t, M[1] + ny * t];
          }
          var sw = Math.atan2(B[1] - c[1], B[0] - c[0]) - Math.atan2(A[1] - c[1], A[0] - c[0]);
          if (s.ccw) { while (sw <= 0) sw += TAU; } else { while (sw >= 0) sw -= TAU; }
          segs[i] = { t: 'arc', a: A, b: B, c: c, r: dist2(c, A), ccw: s.ccw, sweep: sw, n: s.n + 1 };
          segs.splice(j, 1);
          again = true;
        }
      }
    }
    segs.forEach(function (s) { delete s.n; });
  }

  // dxfLoopCurves(loop, tol?) -> { circle: { c, r } } | { segs: [{ t: 'line', a, b } | { t: 'arc', a, b, c, r, ccw,
  // sweep }] } (closed, in loop order, each segment starting where the last ended) | null for a degenerate loop
  function dxfLoopCurves(loop, tol) {
    tol = tol || DXF_TOL;
    var p = cleanLoop(loop, tol.weld), n = p.length, i, k;
    if (n < 3) return null;
    var L = [], T = [];
    for (i = 0; i < n; i++) L.push(dist2(p[i], p[(i + 1) % n]));
    for (i = 0; i < n; i++) {
      var o = p[(i + n - 1) % n], q = p[(i + 1) % n];
      var ux = p[i][0] - o[0], uy = p[i][1] - o[1], wx = q[0] - p[i][0], wy = q[1] - p[i][1];
      T.push(Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy));
    }
    function sameLen(a, b) { return Math.abs(L[a] - L[b]) <= 1e-7 + 1e-4 * Math.max(L[a], L[b]); }
    function sameTurn(a, b) { return Math.abs(a - b) <= 1e-7 + 1e-3 * Math.abs(b); }
    // inner[k]: vertex k lies inside a run of chords (a small turn between two chords of equal length)
    var inner = T.map(function (t, j) { return Math.abs(t) > 1e-9 && Math.abs(t) <= tol.maxStep && sameLen((j + n - 1) % n, j); });
    if (n >= 8 && inner.every(Boolean) && T.every(function (t) { return sameTurn(t, T[0]); })) {
      var fc = fitCircle(p);
      if (fc && fc.err <= fitTol(fc.r)) return { circle: { c: fc.c, r: fc.r } };
    }
    // walk the loop from a vertex where no run passes through (a corner, or the end of an arc)
    var s0 = inner.indexOf(false);
    if (s0 < 0) for (s0 = 0, k = 0; k < n; k++) if (!sameTurn(T[k], T[(k + n - 1) % n])) { s0 = k; break; }
    var segs = [];
    for (i = 0; i < n;) {
      var a = (s0 + i) % n, m = 0;
      while (i + m + 1 < n) {
        var v = (a + m + 1) % n;
        if (!inner[v] || !sameTurn(T[v], T[(a + 1) % n]) || !sameLen(v, a)) break;
        m++;
      }
      if (m + 1 >= tol.minChords) {
        var run = [];
        for (k = 0; k <= m + 1; k++) run.push(p[(a + k) % n]);
        var arc = arcThrough(run, T[(a + 1) % n] > 0);
        if (arc) { arc.n = m + 1; segs.push(arc); i += m + 1; continue; }
      }
      segs.push({ t: 'line', a: p[a], b: p[(a + 1) % n] });
      i++;
    }
    absorbEndChords(segs, tol);
    // step 4: merge straight runs
    for (var again = true; again && segs.length > 2;) {
      again = false;
      for (i = 0; i < segs.length; i++) {
        var j = (i + 1) % segs.length, s = segs[i], t2 = segs[j];
        if (s.t !== 'line' || t2.t !== 'line') continue;
        var ol = offLine(s.b, s.a, t2.b);
        if (ol.inside && ol.d <= tol.merge) { s.b = t2.b; segs.splice(j, 1); again = true; break; }
      }
    }
    return segs.length >= 2 ? { segs: segs } : null;
  }
  // the extents of loops given as dxfLoopCurves results (arcs bulge past their ends where they cross an axis)
  function curvesBox(list) {
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    function grow(x, y) { min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); }
    list.forEach(function (cv) {
      if (!cv) return;
      if (cv.circle) { grow(cv.circle.c[0] - cv.circle.r, cv.circle.c[1] - cv.circle.r); grow(cv.circle.c[0] + cv.circle.r, cv.circle.c[1] + cv.circle.r); return; }
      cv.segs.forEach(function (s) {
        grow(s.a[0], s.a[1]); grow(s.b[0], s.b[1]);
        if (s.t !== 'arc') return;
        var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]);
        for (var q = 0; q < 4; q++) {
          var th = q * Math.PI / 2, d = s.ccw ? th - a0 : a0 - th;
          d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (d < Math.abs(s.sweep)) grow(s.c[0] + s.r * Math.cos(th), s.c[1] + s.r * Math.sin(th));
        }
      });
    });
    return { min: min, max: max };
  }
  function degrees(rad) { var d = rad * 180 / Math.PI; d = ((d % 360) + 360) % 360; return d >= 360 - 1e-10 ? 0 : d; }
  // one loop on a layer, moved by `shift`
  function emitLoop(d, layer, cv, style, shift) {
    function sh(q) { return [q[0] + shift[0], q[1] + shift[1]]; }
    if (cv.circle) { d.circle(layer, sh(cv.circle.c), cv.circle.r); return; }
    if (style === 'entities') {
      cv.segs.forEach(function (s) {
        if (s.t === 'line') { d.line(layer, sh(s.a), sh(s.b)); return; }
        var aa = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), ab = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
        if (s.ccw) d.arc(layer, sh(s.c), s.r, degrees(aa), degrees(ab)); else d.arc(layer, sh(s.c), s.r, degrees(ab), degrees(aa));
      });
      return;
    }
    d.polyline(layer, cv.segs.map(function (s) { return sh(s.a); }), true, cv.segs.map(function (s) { return s.t === 'arc' ? Math.tan(s.sweep / 4) : 0; }));
  }
  // a number for note text: up to 4 decimals in inches, 3 in mm, no trailing zeros
  function noteNum(x, units) { var k = units === 'in' ? 1e4 : 1e3; return String(Math.round(x * k) / k); }
  // bendNotePlace(bend, h) -> { p, rot }: where a bend note of text height h goes, as the drawing places them: centred
  // on the bend line, its baseline a quarter of h beside it, running along the line and kept readable (rot in
  // (−90°, 90°]). The note then lies in the bend strip and the wall or sheet beside it, never across the blank's edge
  // at the line's ends, whatever the bend's direction (an end flange's vertical line included).
  function bendNotePlace(b, h) {
    var dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
    var g = 0.25 * h, m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
    var rot = Math.atan2(dy, dx) * 180 / Math.PI;
    return { p: [m[0] - dy * g, m[1] + dx * g], rot: Math.abs(rot) < 1e-9 ? 0 : rot };
  }
  K.bendNotePlace = bendNotePlace;

  // lane dxfout: points kept in a segment's frame (origin a, x along a->b, y to its left) back in the flat's frame
  function fromLocal(a, b, pts) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    return pts.map(function (q) { return [a[0] + q[0] * dx - q[1] * dy, a[1] + q[0] * dy + q[1] * dx]; });
  }
  // the bend-relief notches of a flat (each bend's reliefs, in its line's frame) as polygons in the flat's frame
  function flatReliefPolys(flat) {
    var out = [];
    (flat.bends || []).forEach(function (b) { (b.reliefs || []).forEach(function (pl) { out.push(fromLocal(b.a, b.b, pl)); }); });
    return out;
  }
  // the segments of a loop (dxfLoopCurves segs) with their layer: a line, or the part of it, running along a relief
  // polygon's edge, and an arc whose ends and middle lie on one, go on RELIEF; the rest keeps `layer`
  var RELIEF_TOL = 2e-4;
  function reliefPieces(segs, polys, layer) {
    var tol = RELIEF_TOL, out = [];
    function onPoly(p) {
      return polys.some(function (pl) {
        return pl.some(function (a, i) {
          var b = pl[(i + 1) % pl.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
          var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
          return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]) <= tol;
        });
      });
    }
    segs.forEach(function (s) {
      if (s.t === 'arc') {
        var a0 = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), am = a0 + s.sweep / 2, M = [s.c[0] + s.r * Math.cos(am), s.c[1] + s.r * Math.sin(am)];
        out.push(Object.assign({}, s, { layer: onPoly(s.a) && onPoly(s.b) && onPoly(M) ? 'RELIEF' : layer }));
        return;
      }
      var ux = s.b[0] - s.a[0], uy = s.b[1] - s.a[1], L = Math.hypot(ux, uy);
      if (!(L > 0)) return;
      ux /= L; uy /= L;
      var iv = [];
      polys.forEach(function (pl) {
        pl.forEach(function (p, i) {
          var q = pl[(i + 1) % pl.length];
          function off(r) { return Math.abs((r[0] - s.a[0]) * uy - (r[1] - s.a[1]) * ux); }
          if (off(p) > tol || off(q) > tol) return;
          var tp = (p[0] - s.a[0]) * ux + (p[1] - s.a[1]) * uy, tq = (q[0] - s.a[0]) * ux + (q[1] - s.a[1]) * uy;
          var lo = Math.max(0, Math.min(tp, tq)), hi = Math.min(L, Math.max(tp, tq));
          if (hi - lo > tol) iv.push([lo, hi]);
        });
      });
      iv.sort(function (x, y) { return x[0] - y[0]; });
      var merged = [];
      iv.forEach(function (x) { var m = merged[merged.length - 1]; if (m && x[0] <= m[1] + tol) m[1] = Math.max(m[1], x[1]); else merged.push(x.slice()); });
      function at(t) { return t <= 0 ? s.a : t >= L ? s.b : [s.a[0] + ux * t, s.a[1] + uy * t]; }
      var t0 = 0;
      merged.forEach(function (x) {
        var lo = x[0] <= tol ? 0 : x[0], hi = x[1] >= L - tol ? L : x[1];
        if (lo > t0) out.push({ t: 'line', a: at(t0), b: at(lo), layer: layer });
        out.push({ t: 'line', a: at(lo), b: at(hi), layer: 'RELIEF' });
        t0 = hi;
      });
      if (t0 < L) out.push({ t: 'line', a: at(t0), b: s.b, layer: layer });
    });
    return out;
  }
  // a closed loop's pieces on more than one layer: LINE / ARC each, whatever the style (a laser chains them across
  // the layers; an open polyline on a cut layer is what dxf-check and most CAM read as a broken contour)
  function emitPieces(d, pcs, shift) {
    function sh(q) { return [q[0] + shift[0], q[1] + shift[1]]; }
    pcs.forEach(function (s) {
      if (s.t === 'line') { d.line(s.layer, sh(s.a), sh(s.b)); return; }
      var aa = Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), ab = Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0]);
      if (s.ccw) d.arc(s.layer, sh(s.c), s.r, degrees(aa), degrees(ab)); else d.arc(s.layer, sh(s.c), s.r, degrees(ab), degrees(aa));
    });
  }

  // exportDXFFlat(flat, units, opts?) -> DXF text of a Kernel.flatPattern result. opts: { version: 'R12' (AC1009,
  // default) | 'R2000' (AC1015), style: 'polyline' (default) | 'entities', bendLines (default true), notes (default
  // true: the bend labels and the sheet note), origin (default true: the blank's lower-left corner at 0,0), etch
  // (default true: flat.etch, the marks sketched on the sheet's faces) }.
  // Lane dxfout (SolidWorks' DXF/DWG Output entities, all off by default): boundaryBox (a rectangle round the blank,
  // arcs' bulges included, on BOUNDARY), bendLayers: 'split' (bend lines on BEND_UP / BEND_DOWN instead of BEND, by
  // each bend's up), reliefLayer (the edges of bend-relief notches, bend.reliefs, on RELIEF: that loop is then written
  // as LINE / ARC entities, which still chain end to end), hiddenEdges (the far-side outline of each Forming Tool,
  // farR / farPts on its mark, on HIDDEN with the HIDDEN line type).
  // Layers: OUTLINE (the blank), HOLES (every inner loop; round holes are CIRCLEs), BEND (bend centre lines), NOTES,
  // ETCH (marking: Etch text strokes and ETCH-layer lines / arcs / circles, colour from the sketch's layer, default 3).
  // Coordinates are in the part's units ($INSUNITS 1 inch / 4 mm, $MEASUREMENT 0 / 1).
  function exportDXFFlat(flat, units, opts) {
    opts = opts || {};
    units = units === 'in' ? 'in' : 'mm';
    var d = new DXF(units, opts), style = opts.style === 'entities' ? 'entities' : 'polyline';
    var cvs = flat.loops.map(function (l) { return dxfLoopCurves(l); });
    var box = curvesBox(cvs), shift = opts.origin === false || !isFinite(box.min[0]) ? [0, 0] : [-box.min[0], -box.min[1]];
    var rel = opts.reliefLayer ? flatReliefPolys(flat) : [];
    if (rel.length) d.layer('RELIEF', 2);
    cvs.forEach(function (cv, i) {
      if (!cv) return;
      var ly = i === 0 ? 'OUTLINE' : 'HOLES', pcs = rel.length && cv.segs ? reliefPieces(cv.segs, rel, ly) : null;
      if (pcs && pcs.some(function (q) { return q.layer === 'RELIEF'; })) emitPieces(d, pcs, shift);
      else emitLoop(d, ly, cv, style, shift);
    });
    if (opts.boundaryBox && isFinite(box.min[0])) {
      d.layer('BOUNDARY', 4);
      var bx = [[box.min[0], box.min[1]], [box.max[0], box.min[1]], [box.max[0], box.max[1]], [box.min[0], box.max[1]]].map(function (q) { return [q[0] + shift[0], q[1] + shift[1]]; });
      if (style === 'entities') bx.forEach(function (q, k) { d.line('BOUNDARY', q, bx[(k + 1) % 4]); });
      else d.polyline('BOUNDARY', bx, true);
    }
    var split = opts.bendLayers === 'split';
    function bendLayer(b) { return split ? (b.up ? 'BEND_UP' : 'BEND_DOWN') : 'BEND'; }
    if (split && opts.bendLines !== false) { d.layer('BEND_UP', 3); d.layer('BEND_DOWN', 30); }
    var s = flat.sheet, T = +s.thickness, inch = units === 'in';
    var th = inch ? Math.max(0.08, T) : Math.max(1.5, T);
    function sh(q) { return [q[0] + shift[0], q[1] + shift[1]]; }
    // marking (flat.etch: Etch text strokes and ETCH-layer geometry of sketches on the sheet's faces), never a cut:
    // LINE / ARC / CIRCLE (a stretched letter as a polyline) on ETCH, in the layer's colour (default 3, green)
    // lane cross-break: a Cross-Break's marks ride in flat.etch but are bend marks: BEND lines and one UP / DOWN note
    var etch = opts.etch === false ? [] : (flat.etch || []).filter(function (it) { return !it.crossBreak && it.form == null; });
    // lane forming: a Forming Tool's marks ride in flat.etch too: its outline and centre mark on FORM (the punch
    // position, like the bend lines on BEND), its note on NOTES (lance slits are real holes of flat.loops, on HOLES)
    var formIts = (flat.etch || []).filter(function (it) { return it.form != null; });
    if (formIts.some(function (it) { return it.kind === 'mark'; }) && opts.bendLines !== false) d.layer('FORM', 6);
    formIts.forEach(function (it) {
      if (it.kind === 'cut') { if (it.t === 'line') d.line('HOLES', sh(it.a), sh(it.b)); return; }
      if (it.kind === 'note') { if (opts.notes !== false) d.text('NOTES', sh(it.a), th, it.text, { center: true }); return; }
      if (opts.hiddenEdges && it.kind === 'mark' && (it.farR > 0 || it.farPts)) {
        d.layer('HIDDEN', 8, { hidden: true });
        if (it.t === 'circle' && it.farR > 0) d.circle('HIDDEN', sh(it.c), it.farR);
        else if (it.farPts && it.pts && it.pts.length > 1) d.polyline('HIDDEN', fromLocal(it.pts[0], it.pts[1], it.farPts).map(sh), true);
      }
      if (opts.bendLines === false) return;
      if (it.t === 'line') d.line('FORM', sh(it.a), sh(it.b));
      else if (it.t === 'circle') d.circle('FORM', sh(it.c), it.r);
      else if (it.t === 'poly' && it.pts && it.pts.length > 1) d.polyline('FORM', it.pts.map(sh), !!it.closed);
    });
    (flat.etch || []).forEach(function (it) {
      if (!it.crossBreak) return;
      if (opts.bendLines !== false) d.line(bendLayer(it), sh(it.a), sh(it.b));
      if (opts.notes !== false && it.note) {
        // on the line's first half, clear of the crossing
        var nb = { a: it.a, b: [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2] }, np = bendNotePlace(nb, th);
        d.text('NOTES', sh(np.p), th, 'CROSS BREAK ' + K.bendNoteText(it, units), { rot: np.rot, center: true });
      }
    });
    if (etch.length) {
      var el = flat.etchLayer || {};
      d.layer('ETCH', el.aci > 0 ? el.aci | 0 : el.color ? nearestAci(el.color) : 3);
      etch.forEach(function (it) {
        if (it.t === 'line') d.line('ETCH', sh(it.a), sh(it.b));
        else if (it.t === 'circle') d.circle('ETCH', sh(it.c), it.r);
        else if (it.t === 'arc') d.arc('ETCH', sh(it.c), it.r, degrees(it.a0 * Math.PI / 180), degrees(it.a1 * Math.PI / 180));
        else if (it.t === 'poly' && it.pts && it.pts.length > 1) d.polyline('ETCH', it.pts.map(sh), !!it.closed);
      });
    }
    flat.bends.forEach(function (b) {
      if (opts.bendLines !== false) d.line(bendLayer(b), sh(b.a), sh(b.b));
      if (opts.notes !== false) {
        var pl = bendNotePlace(b, th);
        d.text('NOTES', sh(pl.p), th, K.bendNoteText(b, units), { rot: pl.rot, center: true });
      }
    });
    if (opts.notes !== false) {
      var w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
      // flat.note names the bend allowance method actually used (K, BA, BD or the bend table)
      var note = (flat.note || 'T=' + s.thickness + ' R=' + s.bendRadius + ' K=' + s.kFactor) + '  BLANK ' + noteNum(w, units) + ' X ' + noteNum(h, units) + (inch ? ' IN' : ' MM');
      d.text('NOTES', sh([box.min[0], box.min[1] - (inch ? Math.max(0.12, 2 * T) : Math.max(3, 2 * T))]), th, note);
    }
    return d.toString();
  }

  // ------------------------------------------------------------------ exports
  function fmt(n) { return (Math.round(n * 1e6) / 1e6).toString(); }
  // angles in degrees and bulges carry more digits: an arc's end then lands within 1e-8·r of its neighbour's
  function fmtA(n) { return (Math.round(n * 1e9) / 1e9).toString(); }
  // rfE: a DXF coordinate / length at full precision (14 significant digits, at most 13 decimals, as AutoCAD and
  // SolidWorks write them): a non-terminating value (a 3 point arc's centre -5.5333333333333, a trig point) reads back
  // to 5e-14, where fmt's six decimals left it up to 5e-7 off (fmt stays for STL). The 15th digit is left out: it is
  // float noise (an R.25 flat corner came out 0.249999999999996). Plain decimal (never 1e-7 notation), no -0.
  function fmtD(n) {
    n = +n;
    if (!isFinite(n) || Math.abs(n) < 5e-14) return '0';
    var v = +(+n.toFixed(13)).toPrecision(14), s = String(v);
    if (v === 0) return '0';
    if (/e/i.test(s)) s = Math.abs(v) >= 1 ? v.toFixed(0) : v.toFixed(Math.min(20, 15 - Math.floor(Math.log(Math.abs(v)) / Math.LN10))).replace(/\.?0+$/, '');
    return s;
  }

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

  // DXF(units, { version }) collects entities and writes them as R12 (AC1009: HEADER, TABLES, ENTITIES; POLYLINE +
  // VERTEX) or R2000 (AC1015: HEADER with $HANDSEED, CLASSES, the nine symbol tables, BLOCKS for model / paper space,
  // ENTITIES with handles and subclass markers, OBJECTS with the root dictionary; LWPOLYLINE). Both carry $INSUNITS,
  // $MEASUREMENT, $EXTMIN / $EXTMAX and an *Active viewport on the extents. Text is plain ASCII: °, Ø and ± become
  // %%d, %%c and %%p (DXF before 2007 is codepage text, not UTF-8).
  var DXF_LAYERS = [['0', 7], ['OUTLINE', 7], ['HOLES', 1], ['BEND', 3], ['NOTES', 5]];
  function dxfVersion(v) { return /^(r?2000|ac1015)$/i.test(String(v || '').trim()) ? 'R2000' : 'R12'; }
  function dxfText(s) {
    return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/°/g, '%%d').replace(/[Ø⌀]/g, '%%c').replace(/±/g, '%%p').replace(/[^\x20-\x7e]/g, '?');
  }
  function DXF(units, opts) {
    this.units = units === 'in' ? 'in' : 'mm';
    this.insunits = this.units === 'in' ? 1 : 4;
    this.version = dxfVersion(opts && opts.version);
    this.ents = [];
    this.layerDefs = {};
    this.blocks = [];   // rfAU: [{ name, ents }] block definitions (BLOCKS section), placed by INSERT entities
    this.min = [Infinity, Infinity]; this.max = [-Infinity, -Infinity];
  }
  // rfAU: beginBlock(name) … endBlock(): the entities added in between make block `name` (block coordinates, base point
  // 0, 0) instead of going to ENTITIES; they do not count toward the extents (the INSERTs' placed geometry does, through
  // grow). insert(layer, name, p, rot°, scale): an INSERT of that block.
  DXF.prototype.beginBlock = function (name) {
    this._saved = { ents: this.ents, min: this.min.slice(), max: this.max.slice() };
    this.ents = []; this.blocks.push({ name: name, ents: this.ents });
  };
  DXF.prototype.endBlock = function () {
    if (!this._saved) return;
    this.ents = this._saved.ents; this.min = this._saved.min; this.max = this._saved.max; this._saved = null;
  };
  DXF.prototype.insert = function (layer, name, p, rot, sc) {
    this.ents.push({ k: 'INSERT', layer: layer, name: name, p: p, rot: +rot || 0, s: sc > 0 ? +sc : 1 });
    this._grow(p[0], p[1]);
  };
  DXF.prototype.grow = function (x, y) { this._grow(x, y); };
  // layer(name, aci, { dashed, off }): the colour and line type of a layer (sketch-layers); a layer named here takes
  // that colour even when it is one of the standard ones, a dashed one gets the DASHED line type, an off one a
  // negative colour (AutoCAD's layer Off)
  // (lane dxfout: { hidden } gives it AutoCAD's HIDDEN line type, a 0.25 dash and a 0.125 gap)
  DXF.prototype.layer = function (name, aci, o) { this.layerDefs[name] = { aci: aci, dashed: !!(o && o.dashed), hidden: !!(o && o.hidden), off: !!(o && o.off) }; };
  DXF.prototype._grow = function (x, y, r) {
    r = r || 0;
    this.min[0] = Math.min(this.min[0], x - r); this.min[1] = Math.min(this.min[1], y - r);
    this.max[0] = Math.max(this.max[0], x + r); this.max[1] = Math.max(this.max[1], y + r);
  };
  DXF.prototype.line = function (layer, a, b) { this.ents.push({ k: 'LINE', layer: layer, a: a, b: b }); this._grow(a[0], a[1]); this._grow(b[0], b[1]); };
  DXF.prototype.circle = function (layer, c, r) { this.ents.push({ k: 'CIRCLE', layer: layer, c: c, r: r }); this._grow(c[0], c[1], r); };
  // arc(layer, centre, r, start°, end°): counterclockwise from start to end
  DXF.prototype.arc = function (layer, c, r, a0, a1) { this.ents.push({ k: 'ARC', layer: layer, c: c, r: r, a0: a0, a1: a1 }); this._grow(c[0], c[1], r); };
  // text(layer, p, height, text, opts?): opts.rot (degrees, counterclockwise) and opts.center (p is then the middle of
  // the baseline: horizontal justification 1, alignment point 11/21)
  DXF.prototype.text = function (layer, p, height, text, opts) {
    var e = { k: 'TEXT', layer: layer, p: p, h: height, s: text };
    if (opts && opts.rot) e.rot = opts.rot;
    if (opts && opts.center) e.center = true;
    this.ents.push(e); this._grow(p[0], p[1]);
  };
  // spline(layer, bez, knots): a cubic SPLINE (R2000 only) made of Bézier spans bez[i] = [B0, B1, B2, B3] running from
  // knot i to knot i + 1 (interior knots of multiplicity 3: each span is exact, the curve as continuous as the spans)
  // rfAH: style (a style spline's { cps, degree, L }) writes its single Bézier span exactly instead: degree n, clamped
  // knots [0 × (n + 1), L × (n + 1)], its control vertices
  DXF.prototype.spline = function (layer, bez, knots, style) {
    var self = this;
    this.ents.push({ k: 'SPLINE', layer: layer, bez: bez, knots: knots, style: style && style.degree > 3 ? style : null });
    bez.forEach(function (B) { for (var i = 0; i <= 8; i++) { var p = K.bezPoint(B, i / 8); self._grow(p[0], p[1]); } });
  };
  // ellipse(layer, centre, major (vector from the centre to the major axis end), ratio (minor / major ≤ 1), start,
  // end (parameters in radians, counterclockwise; 0 and 2π for a full ellipse)): an ELLIPSE (R2000 only)
  DXF.prototype.ellipse = function (layer, c, maj, ratio, p0, p1) {
    this.ents.push({ k: 'ELLIPSE', layer: layer, c: c, maj: maj, ratio: ratio, p0: p0, p1: p1 });
    var L = Math.hypot(maj[0], maj[1]), ux = maj[0] / L, uy = maj[1] / L;
    for (var i = 0; i <= 64; i++) {
      var u = p0 + (p1 - p0) * i / 64, x = L * Math.cos(u), y = L * ratio * Math.sin(u);
      this._grow(c[0] + ux * x - uy * y, c[1] + uy * x + ux * y);
    }
  };
  // polyline(layer, pts, closed, bulges?): bulges[i] = tan(sweep / 4) of the segment from pts[i] to the next point
  DXF.prototype.polyline = function (layer, pts, closed, bulges) {
    var self = this;
    this.ents.push({ k: 'POLY', layer: layer, pts: pts, closed: !!closed, bulges: bulges || null });
    pts.forEach(function (q, i) {
      self._grow(q[0], q[1]);
      var b = bulges && bulges[i];
      if (b && (closed || i + 1 < pts.length)) {   // a bulged segment can reach out to the arc's radius
        var q2 = pts[(i + 1) % pts.length], c = Math.hypot(q2[0] - q[0], q2[1] - q[1]) / 2, r = c * (1 + b * b) / (2 * Math.abs(b));
        self._grow((q[0] + q2[0]) / 2, (q[1] + q2[1]) / 2, r);
      }
    });
  };
  DXF.prototype.toString = function () {
    var r2000 = this.version === 'R2000', out = [];
    function P(code, value) { out.push(String(code), String(value)); }
    // R2000 handles: the fixed ones AutoCAD's own drawings use (tables 1–A, root dictionary C, ACAD_GROUP D, layer 0
    // 10, Standard 11, ACAD 12, ByBlock / ByLayer / Continuous 14–16, paper space 1B–1D, model space 1F–21; LibreDWG's
    // DXF reader treats 1F as the model space record), every other one from 30 up
    var h = 0x2F;
    function H() { return (++h).toString(16).toUpperCase(); }
    var hasExt = isFinite(this.min[0]);
    var mn = hasExt ? this.min : [0, 0], mx = hasExt ? this.max : [1, 1];
    // ---- handles first (R2000): tables, records, blocks, root dictionary
    var th = {};
    var ltypes = r2000 ? [['ByBlock', ''], ['ByLayer', ''], ['Continuous', 'Solid line']] : [['CONTINUOUS', 'Solid line']];
    var cont = r2000 ? 'Continuous' : 'CONTINUOUS', defs = this.layerDefs;
    var dashed = Object.keys(defs).some(function (n) { return defs[n].dashed; });
    if (dashed) ltypes.push(['DASHED', 'Dashed __ __ __', 1]);
    if (Object.keys(defs).some(function (n) { return defs[n].hidden; })) ltypes.push(['HIDDEN', 'Hidden __ __ __ __', 2]);
    var msBR = null, psBR = null, root = null, groups = null;
    if (r2000) {
      th = { BLOCK_RECORD: '1', LAYER: '2', STYLE: '3', LTYPE: '5', VIEW: '6', UCS: '7', VPORT: '8', APPID: '9', DIMSTYLE: 'A' };
      msBR = '1F'; psBR = '1B'; root = 'C'; groups = 'D';
    }
    function table(name, count, records) {
      P(0, 'TABLE'); P(2, name);
      if (r2000) { P(5, th[name]); P(330, 0); P(100, 'AcDbSymbolTable'); }
      P(70, count);
      if (r2000 && name === 'DIMSTYLE') P(100, 'AcDbDimStyleTable');
      records();
      P(0, 'ENDTAB');
    }
    function record(type, tname, sub, handle) {
      P(0, type);
      if (r2000) { P(type === 'DIMSTYLE' ? 105 : 5, handle || H()); P(330, th[tname]); P(100, 'AcDbSymbolTableRecord'); P(100, sub); }
    }
    var body = [];
    // ---- CLASSES, TABLES
    if (r2000) { P(0, 'SECTION'); P(2, 'CLASSES'); P(0, 'ENDSEC'); }
    P(0, 'SECTION'); P(2, 'TABLES');
    table('VPORT', 1, function () {
      var w = Math.max(mx[0] - mn[0], 1e-6), hh = Math.max(mx[1] - mn[1], 1e-6);
      record('VPORT', 'VPORT', 'AcDbViewportTableRecord');
      P(2, r2000 ? '*Active' : '*ACTIVE'); P(70, 0); P(10, 0); P(20, 0); P(11, 1); P(21, 1);
      P(12, fmtD((mn[0] + mx[0]) / 2)); P(22, fmtD((mn[1] + mx[1]) / 2)); P(13, 0); P(23, 0); P(14, 1); P(24, 1); P(15, 0); P(25, 0);
      P(16, 0); P(26, 0); P(36, 1); P(17, 0); P(27, 0); P(37, 0); P(40, fmtD(Math.max(hh, w / 1.5) * 1.1)); P(41, 1.5); P(42, 50);
      P(43, 0); P(44, 0); P(50, 0); P(51, 0); P(71, 0); P(72, 100); P(73, 1); P(74, 3); P(75, 0); P(76, 0); P(77, 0); P(78, 0);
    });
    table('LTYPE', ltypes.length, function () {
      ltypes.forEach(function (lt, i) {
        record('LTYPE', 'LTYPE', 'AcDbLinetypeTableRecord', ['14', '15', '16'][i]); P(2, lt[0]); P(70, 0); P(3, lt[1]); P(72, 65);
        if (!lt[2]) { P(73, 0); P(40, 0); return; }
        // sketch-layers: DASHED, a 0.5 dash and a 0.25 gap (drawing units; LTSCALE scales it); HIDDEN 0.25 / 0.125
        var dash = lt[2] === 2 ? [0.25, 0.125] : [0.5, 0.25];
        P(73, 2); P(40, dash[0] + dash[1]); P(49, dash[0]); if (r2000) P(74, 0); P(49, -dash[1]); if (r2000) P(74, 0);
      });
    });
    // the standard layers, plus any other layer an entity is on (e.g. a sketch's CONSTRUCTION, colour 8)
    var layers = DXF_LAYERS.slice(), names = layers.map(function (l) { return l[0]; }), blocks = this.blocks;
    var allEnts = this.ents.slice();
    blocks.forEach(function (b) { allEnts = allEnts.concat(b.ents); });
    allEnts.forEach(function (e) { if (names.indexOf(e.layer) < 0) { names.push(e.layer); layers.push([e.layer, 8]); } });
    Object.keys(defs).forEach(function (n) { if (names.indexOf(n) < 0) { names.push(n); layers.push([n, 7]); } });
    table('LAYER', layers.length, function () {
      layers.forEach(function (l, i) {
        var d = defs[l[0]], c = d && d.aci ? d.aci : l[1];
        record('LAYER', 'LAYER', 'AcDbLayerTableRecord', i ? null : '10'); P(2, l[0]); P(70, 0); P(62, d && d.off ? -c : c); P(6, d && d.hidden ? 'HIDDEN' : d && d.dashed ? 'DASHED' : cont);
      });
    });
    table('STYLE', 1, function () {
      record('STYLE', 'STYLE', 'AcDbTextStyleTableRecord', '11');
      P(2, r2000 ? 'Standard' : 'STANDARD'); P(70, 0); P(40, 0); P(41, 1); P(50, 0); P(71, 0); P(42, 2.5); P(3, 'txt'); P(4, '');
    });
    table('VIEW', 0, function () { });
    table('UCS', 0, function () { });
    table('APPID', 1, function () { record('APPID', 'APPID', 'AcDbRegAppTableRecord', '12'); P(2, 'ACAD'); P(70, 0); });
    table('DIMSTYLE', 1, function () { record('DIMSTYLE', 'DIMSTYLE', 'AcDbDimStyleTableRecord'); P(2, r2000 ? 'Standard' : 'STANDARD'); P(70, 0); });
    if (r2000) table('BLOCK_RECORD', 2 + blocks.length, function () {
      record('BLOCK_RECORD', 'BLOCK_RECORD', 'AcDbBlockTableRecord', msBR); P(2, '*Model_Space');
      record('BLOCK_RECORD', 'BLOCK_RECORD', 'AcDbBlockTableRecord', psBR); P(2, '*Paper_Space');
      // rfAU: one record per block definition (its BLOCK / ENDBLK and entities name it as their owner)
      blocks.forEach(function (b) { b.br = H(); record('BLOCK_RECORD', 'BLOCK_RECORD', 'AcDbBlockTableRecord', b.br); P(2, b.name); });
    });
    P(0, 'ENDSEC');
    var owner = msBR;
    function head(type, layer, sub) {
      P(0, type);
      if (r2000) { P(5, H()); P(330, owner); P(100, 'AcDbEntity'); }
      P(8, layer);
      if (r2000 && sub) P(100, sub);
    }
    // ---- BLOCKS (R2000: the model and paper space blocks; rfAU: then, R12 and R2000, each block definition)
    if (r2000 || blocks.length) {
      P(0, 'SECTION'); P(2, 'BLOCKS');
      if (r2000) [[msBR, '*Model_Space', false, '20', '21'], [psBR, '*Paper_Space', true, '1C', '1D']].forEach(function (b) {
        P(0, 'BLOCK'); P(5, b[3]); P(330, b[0]); P(100, 'AcDbEntity'); if (b[2]) P(67, 1); P(8, 0); P(100, 'AcDbBlockBegin');
        P(2, b[1]); P(70, 0); P(10, 0); P(20, 0); P(30, 0); P(3, b[1]); P(1, '');
        P(0, 'ENDBLK'); P(5, b[4]); P(330, b[0]); P(100, 'AcDbEntity'); if (b[2]) P(67, 1); P(8, 0); P(100, 'AcDbBlockEnd');
      });
      blocks.forEach(function (b) {
        P(0, 'BLOCK');
        if (r2000) { P(5, H()); P(330, b.br); P(100, 'AcDbEntity'); }
        P(8, 0);
        if (r2000) P(100, 'AcDbBlockBegin');
        P(2, b.name); P(70, 0); P(10, 0); P(20, 0); P(30, 0); P(3, b.name); if (r2000) P(1, '');
        owner = b.br;
        b.ents.forEach(entity);
        owner = msBR;
        P(0, 'ENDBLK');
        if (r2000) { P(5, H()); P(330, b.br); P(100, 'AcDbEntity'); }
        P(8, 0);
        if (r2000) P(100, 'AcDbBlockEnd');
      });
      P(0, 'ENDSEC');
    }
    // ---- ENTITIES
    P(0, 'SECTION'); P(2, 'ENTITIES');
    this.ents.forEach(entity);
    function entity(e) {
      if (e.k === 'INSERT') {   // rfAU: a block instance: its block, insertion point, scale and rotation
        head('INSERT', e.layer, 'AcDbBlockReference');
        P(2, e.name); P(10, fmtD(e.p[0])); P(20, fmtD(e.p[1])); P(30, 0);
        if (e.s !== 1) { P(41, fmtA(e.s)); P(42, fmtA(e.s)); P(43, fmtA(e.s)); }
        if (e.rot) P(50, fmtA(e.rot));
      } else if (e.k === 'LINE') {
        head('LINE', e.layer, 'AcDbLine');
        P(10, fmtD(e.a[0])); P(20, fmtD(e.a[1])); P(30, 0); P(11, fmtD(e.b[0])); P(21, fmtD(e.b[1])); P(31, 0);
      } else if (e.k === 'CIRCLE') {
        head('CIRCLE', e.layer, 'AcDbCircle');
        P(10, fmtD(e.c[0])); P(20, fmtD(e.c[1])); P(30, 0); P(40, fmtD(e.r));
      } else if (e.k === 'ARC') {
        head('ARC', e.layer, 'AcDbCircle');
        P(10, fmtD(e.c[0])); P(20, fmtD(e.c[1])); P(30, 0); P(40, fmtD(e.r));
        if (r2000) P(100, 'AcDbArc');
        P(50, fmtA(e.a0)); P(51, fmtA(e.a1));
      } else if (e.k === 'SPLINE') {
        // degree 3, planar (flag 8), clamped; one Bézier span per knot interval (interior knots × 3)
        var kn = [e.knots[0], e.knots[0], e.knots[0], e.knots[0]], cps = [e.bez[0][0]], deg = 3;
        e.bez.forEach(function (B, i) { cps.push(B[1], B[2], B[3]); var t = e.knots[i + 1]; kn.push(t, t, t); });
        kn.push(e.knots[e.bez.length]);
        if (e.style) {   // rfAH: a style spline of degree 5 / 7: its one Bézier span, exactly
          deg = e.style.degree; cps = e.style.cps; kn = [];
          for (var sk = 0; sk <= deg; sk++) kn.push(0);
          for (sk = 0; sk <= deg; sk++) kn.push(e.style.L);
        }
        head('SPLINE', e.layer, 'AcDbSpline');
        P(210, 0); P(220, 0); P(230, 1); P(70, 8); P(71, deg); P(72, kn.length); P(73, cps.length); P(74, 0);
        P(42, '0.0000000001'); P(43, '0.0000000001');
        kn.forEach(function (t) { P(40, fmtA(t)); });
        cps.forEach(function (q) { P(10, fmtD(q[0])); P(20, fmtD(q[1])); P(30, 0); });
      } else if (e.k === 'ELLIPSE') {
        head('ELLIPSE', e.layer, 'AcDbEllipse');
        P(10, fmtD(e.c[0])); P(20, fmtD(e.c[1])); P(30, 0); P(11, fmtD(e.maj[0])); P(21, fmtD(e.maj[1])); P(31, 0);
        P(210, 0); P(220, 0); P(230, 1); P(40, fmtA(e.ratio)); P(41, fmtA(e.p0)); P(42, fmtA(e.p1));
      } else if (e.k === 'TEXT') {
        head('TEXT', e.layer, 'AcDbText');
        P(10, fmtD(e.p[0])); P(20, fmtD(e.p[1])); P(30, 0); P(40, fmtD(e.h)); P(1, dxfText(e.s));
        if (e.rot) P(50, fmtA(e.rot));
        if (r2000) P(7, 'Standard');
        if (e.center) { P(72, 1); P(11, fmtD(e.p[0])); P(21, fmtD(e.p[1])); P(31, 0); }
        if (r2000) P(100, 'AcDbText');
      } else if (e.k === 'POLY') {
        if (r2000) {
          head('LWPOLYLINE', e.layer, 'AcDbPolyline');
          P(90, e.pts.length); P(70, e.closed ? 1 : 0); P(43, 0);
          e.pts.forEach(function (q, i) { P(10, fmtD(q[0])); P(20, fmtD(q[1])); if (e.bulges && e.bulges[i]) P(42, fmtA(e.bulges[i])); });
        } else {
          head('POLYLINE', e.layer); P(66, 1); P(10, 0); P(20, 0); P(30, 0); P(70, e.closed ? 1 : 0);
          e.pts.forEach(function (q, i) {
            P(0, 'VERTEX'); P(8, e.layer); P(10, fmtD(q[0])); P(20, fmtD(q[1])); P(30, 0);
            if (e.bulges && e.bulges[i]) P(42, fmtA(e.bulges[i]));
          });
          P(0, 'SEQEND'); P(8, e.layer);
        }
      }
    }
    P(0, 'ENDSEC');
    // ---- OBJECTS (R2000): the root dictionary with ACAD_GROUP
    if (r2000) {
      P(0, 'SECTION'); P(2, 'OBJECTS');
      P(0, 'DICTIONARY'); P(5, root); P(330, 0); P(100, 'AcDbDictionary'); P(281, 1); P(3, 'ACAD_GROUP'); P(350, groups);
      P(0, 'DICTIONARY'); P(5, groups); P(330, root); P(100, 'AcDbDictionary'); P(281, 1);
      P(0, 'ENDSEC');
    }
    body = out; out = [];
    // ---- HEADER (written last: $HANDSEED is the next free handle)
    P(0, 'SECTION'); P(2, 'HEADER');
    P(9, '$ACADVER'); P(1, r2000 ? 'AC1015' : 'AC1009');
    P(9, '$DWGCODEPAGE'); P(3, 'ANSI_1252');
    if (r2000) { P(9, '$HANDSEED'); P(5, (h + 1).toString(16).toUpperCase()); }
    P(9, '$INSUNITS'); P(70, this.insunits);
    P(9, '$MEASUREMENT'); P(70, this.units === 'in' ? 0 : 1);
    P(9, '$DIMALTF'); P(40, this.units === 'in' ? '25.4' : '0.0393700787');   // rfDU: SolidWorks reads the file's unit from $DIMALTF, not $INSUNITS
    P(9, '$LUNITS'); P(70, 2);
    P(9, '$EXTMIN'); P(10, fmtD(mn[0])); P(20, fmtD(mn[1])); P(30, 0);
    P(9, '$EXTMAX'); P(10, fmtD(mx[0])); P(20, fmtD(mx[1])); P(30, 0);
    P(0, 'ENDSEC');
    return out.concat(body, ['0', 'EOF']).join('\n');
  };

  // A spline or an ellipse in a sketch DXF: R2000 writes it exactly (SPLINE: the spline's own cubic spans; ELLIPSE:
  // centre, major axis, ratio, start / end parameters); R12 has neither, so the curve goes out as ARCs (each through
  // the curve at both ends and the middle of its piece, pieces halved until the curve stays within DXF_TOL.freeArc
  // (0.001 mm, 0.00004 in) of every arc at its eighth points; the arcs share their end points, so a laser chains them
  // like any contour). A straight piece is a LINE.
  DXF_TOL.freeArc = { mm: 1e-3, 'in': 4e-5 };
  function freeArcs(evalAt, u0, u1, tol, k0) {
    var out = [];
    function arcOf(a, b) {
      var A = evalAt(a), B = evalAt(b), M = evalAt((a + b) / 2);
      var ax = M[0] - A[0], ay = M[1] - A[1], bx = B[0] - A[0], by = B[1] - A[1], cr = ax * by - ay * bx, chord = Math.hypot(bx, by);
      var dev = 0, q, t;
      // a piece whose ends meet (a loop inside one span) has no arc through A, M, B: halve it again (rfL)
      if (chord < 1e-9 * (1 + Math.hypot(ax, ay)) && Math.hypot(ax, ay) > 1e-9) return { A: A, B: B, dev: Infinity };
      function lineDev() { for (t = 1; t < 8; t++) { q = evalAt(a + (b - a) * t / 8); dev = Math.max(dev, Math.abs(((q[0] - A[0]) * by - (q[1] - A[1]) * bx) / (chord || 1))); } return { line: true, A: A, B: B, dev: dev }; }
      if (Math.abs(cr) < 1e-12 * chord * chord) return lineDev();
      var a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, cx = (by * a2 - ay * b2) / (2 * cr), cy = (ax * b2 - bx * a2) / (2 * cr);
      var c = [A[0] + cx, A[1] + cy], r = Math.hypot(cx, cy);
      if (r > 1e5 * chord) return lineDev();
      for (t = 1; t < 8; t++) { q = evalAt(a + (b - a) * t / 8); dev = Math.max(dev, Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - r)); }
      return { A: A, B: B, c: c, r: r, ccw: cr > 0, dev: dev };
    }
    for (var k = k0; k <= 4096; k *= 2) {
      out = [];
      var ok = true;
      for (var i = 0; i < k && ok; i++) { var p = arcOf(u0 + (u1 - u0) * i / k, u0 + (u1 - u0) * (i + 1) / k); if (p.dev > tol) ok = false; out.push(p); }
      if (ok) break;
    }
    return out.filter(function (p) { return isFinite(p.dev) && (p.line ? Math.hypot(p.B[0] - p.A[0], p.B[1] - p.A[1]) > 1e-9 : p.r > 1e-9 && isFinite(p.r)); });
  }
  function dxfFreeCurve(d, layer, e) {
    var r2000 = d.version === 'R2000', tol = DXF_TOL.freeArc[d.units] || DXF_TOL.freeArc.mm;
    function emitArcs(list) {
      list.forEach(function (p) {
        if (p.line) { d.line(layer, p.A, p.B); return; }
        var aa = Math.atan2(p.A[1] - p.c[1], p.A[0] - p.c[0]) * 180 / Math.PI, ab = Math.atan2(p.B[1] - p.c[1], p.B[0] - p.c[0]) * 180 / Math.PI;
        if (p.ccw) d.arc(layer, p.c, p.r, aa, ab); else d.arc(layer, p.c, p.r, ab, aa);
      });
    }
    if (e.t === 'spline') {
      var g = K.splineGeom(e);
      if (!g) return;
      if (r2000) { d.spline(layer, g.bez, g.knots, g.style); return; }
      if (g.style && g.style.degree > 3) {   // rfAH: R12: arcs along the style spline's own Bézier
        var SP = g.style.cps;
        emitArcs(freeArcs(function (s) { return K.bzPoint(SP, s); }, 0, 1, tol, 1));
        return;
      }
      // a span of zero length (a closed spline whose last point repeats the first) writes nothing (rfL: it wrote an
      // ARC with r = 0 and NaN angles)
      g.bez.forEach(function (B) {
        var ext = 0;
        for (var j = 1; j < 4; j++) ext = Math.max(ext, Math.hypot(B[j][0] - B[0][0], B[j][1] - B[0][1]));
        if (ext <= 1e-9) return;
        emitArcs(freeArcs(function (s) { return K.bezPoint(B, s); }, 0, 1, tol, 1));
      });
      return;
    }
    if (!(e.rx > 0) || !(e.ry > 0)) return;
    var full = e.t === 'ellipse', u0 = full ? 0 : e.a0 * Math.PI / 180, u1 = full ? 2 * Math.PI : e.a1 * Math.PI / 180;
    if (r2000) {
      var ro = (+e.rot || 0) * Math.PI / 180, swap = e.ry > e.rx, maj = swap ? [-Math.sin(ro) * e.ry, Math.cos(ro) * e.ry] : [Math.cos(ro) * e.rx, Math.sin(ro) * e.rx];
      var p0 = swap ? u0 - Math.PI / 2 : u0, p1 = p0 + (u1 - u0);
      if (full) { p0 = 0; p1 = 2 * Math.PI; }
      else { while (p0 < 0) { p0 += 2 * Math.PI; p1 += 2 * Math.PI; } while (p0 >= 2 * Math.PI) { p0 -= 2 * Math.PI; p1 -= 2 * Math.PI; } }
      d.ellipse(layer, [e.cx, e.cy], maj, swap ? e.rx / e.ry : e.ry / e.rx, p0, p1);
      return;
    }
    emitArcs(freeArcs(function (u) { return K.ellipsePoint(e, u); }, u0, u1, tol, full ? 8 : 2));
  }

  // exportDXFSketch(sketch, units, opts?) -> DXF text of a sketch as drawn, full size in the sketch's own 2D frame:
  // every entity as its exact pieces (K.entityPrimitives): lines as LINE, circles as CIRCLE, arcs as ARC, rectangles /
  // polygons / polylines as their LINE edges, slots as two LINEs and two ARCs, arc slots as four ARCs. Construction geometry (centerlines too)
  // is left out unless opts.construction, which puts it on layer CONSTRUCTION; points and dimensions are not written.
  // Layers as the flat pattern's: entities on a closed loop that lies inside another closed loop (holes, slots,
  // cutouts: the sketch profile's loops at depth 1 or more) go on HOLES; the outermost loops and open geometry on OUTLINE.
  // Sketch layers (sketch-layers): an entity on a layer of the sketch's table (sketch.layers) goes on that layer, named
  // as in the sketch (upper case, characters DXF does not allow as _), with its colour (the layer's aci, else the ACI
  // colour nearest its colour, else 7), DASHED for a dashed layer and a negative colour for a hidden one; entities on
  // the default layer keep OUTLINE / HOLES. Construction geometry stays on CONSTRUCTION whatever its layer.
  // rfAU: block instances (Tools ▸ Blocks) go out as each definition once in the BLOCKS section (its entities in block
  // coordinates, base point 0, 0; entities on the default layer on layer 0, so they take the INSERT's layer, construction
  // on CONSTRUCTION, sketch layers kept) and each instance as an INSERT (insertion point, rotation, scale) on HOLES or
  // OUTLINE as its first entity would be; block names as layer names (upper case, A-Z 0-9 $ - _). An instance that no
  // longer matches its definition (an entity of it deleted) is written exploded. opts.explode writes every instance as
  // its exploded geometry (LINE / ARC / CIRCLE …, no BLOCKS), as before blocks were written.
  // opts: { version: 'R12' (default) | 'R2000', construction, explode }
  function exportDXFSketch(sketch, units, opts) {
    opts = opts || {};
    var d = new DXF(units, opts), R2D = 180 / Math.PI;
    var loops = [];
    try { loops = K.sketchProfile({ entities: (sketch.entities || []).filter(Boolean), layers: sketch.layers }).loops; } catch (e) { loops = []; }
    var span = 0;
    loops.forEach(function (l) { l.pts.forEach(function (p) { span = Math.max(span, Math.abs(p[0]), Math.abs(p[1])); }); });
    var tol = 1e-6 * (1 + span);
    function onLoop(q, pts) {
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length], vx = b[0] - a[0], vy = b[1] - a[1], ll = vx * vx + vy * vy;
        var t = ll > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / ll)) : 0;
        if (Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1]) <= tol) return true;
      }
      return false;
    }
    // HOLES when the entity's first chord lies on a nested loop and on no outermost one
    function isHole(e) {
      var pl = K.entityPolylines(e, true)[0];   // splines / ellipses: the area-true points the profile loops are made of
      if (!pl || pl.pts.length < 2) return false;
      var q = [(pl.pts[0][0] + pl.pts[1][0]) / 2, (pl.pts[0][1] + pl.pts[1][1]) / 2], hole = false;
      for (var i = 0; i < loops.length; i++) {
        if (!onLoop(q, loops[i].pts)) continue;
        if (loops[i].meetInner) return true;   // rfAC: a hole drawn over the outline stays a hole as drawn (no feature builds from it)
        if (loops[i].depth === 0) return false;
        hole = true;
      }
      return hole;
    }
    function written(e) { return !!e && e.t !== 'point' && !(e.construction && !opts.construction) && !(e.t === 'line' && e.infinite); }
    // the layer of entity e: inBlock, a block definition's entity (the default layer is 0 there)
    function layerOf(e, inBlock) {
      var rec = e.construction ? null : K.sketchLayer(sketch, e);
      if (rec) {
        var ln = dxfLayerName(rec.name);
        d.layer(ln, rec.aci > 0 ? rec.aci | 0 : rec.color ? nearestAci(rec.color) : 7, { dashed: rec.lineType === 'dashed', off: !!rec.hidden });
        return ln;
      }
      if (e.t === 'text' && !e.construction && e.mode !== 'outline') { d.layer('ETCH', 3); return 'ETCH'; }   // sketch-text: Etch text is marking, never a cut
      return e.construction ? 'CONSTRUCTION' : inBlock ? '0' : (isHole(e) ? 'HOLES' : 'OUTLINE');
    }
    // rfAU: the instances written as INSERTs (each entity of one is skipped below) and their block names
    var inBlock = {}, plan = opts.explode ? null : dxfBlockPlan(sketch, written);
    if (plan) {
      plan.defs.forEach(function (b) {
        d.beginBlock(b.name);
        b.ents.forEach(function (e) { writeEnt(e, layerOf(e, true)); });
        d.endBlock();
      });
      plan.inserts.forEach(function (q) {
        q.ents.forEach(function (i) { inBlock[i] = true; });
        var E = sketch.entities, first = q.ents.map(function (i) { return E[i]; }).filter(function (e) { return written(e) && !e.construction; })[0];
        d.insert(first ? (isHole(first) ? 'HOLES' : 'OUTLINE') : 'OUTLINE', q.name, [q.x, q.y], q.ang, q.s);
        q.ents.forEach(function (i) { if (written(E[i])) K.entityPolylines(E[i]).forEach(function (pl) { pl.pts.forEach(function (p) { d.grow(p[0], p[1]); }); }); });
      });
    }
    (sketch.entities || []).forEach(function (e, i) {
      if (!written(e) || inBlock[i]) return;
      writeEnt(e, layerOf(e, false));
    });
    return d.toString();
    function writeEnt(e, layer) {
      if (e.t === 'text') { dxfSketchText(d, layer, e); return; }
      // a sketch arc runs counterclockwise from a0 to a1 in degrees as stored (entityPrimitives sorts the two, which
      // would flip an arc across 0°)
      if (e.t === 'arc') { d.arc(layer, [e.cx, e.cy], e.r, e.a0, e.a1); return; }
      if (K.isFreeCurve(e)) { dxfFreeCurve(d, layer, e); return; }
      K.entityPrimitives(e).forEach(function (p) {
        if (p.kind === 'seg') d.line(layer, p.a, p.b);
        else if (p.full) d.circle(layer, p.c, p.r);
        else d.arc(layer, p.c, p.r, p.a0 * R2D, p.a1 * R2D);
      });
    }
  }
  // rfAU: which block instances of a sketch go out as INSERTs: { defs: [{ name, ents (block coordinates, the written
  // ones) }], inserts: [{ name, x, y, ang, s, ents (sketch indices) }] }, or null when there are none. The definitions are
  // the sketch's (Kernel.blockDefs: a definition an instance names but the sketch lacks, e.g. after a DXF import, is
  // taken from that instance); an instance whose entities do not match its definition one for one is left out
  // (written exploded), and so is a definition with nothing to write.
  function dxfBlockPlan(sketch, written) {
    if (!K.blockInstances || !K.blockDefs) return null;
    var inst = K.blockInstances(sketch);
    if (!inst.length) return null;
    var defs = K.blockDefs(sketch), E = sketch.entities, names = {}, used = {}, out = { defs: [], inserts: [] };
    inst.forEach(function (r) {
      var d = defs[r.def];
      if (!d || d.ents.length !== r.ents.length || d.ents.some(function (q, k) { return !E[r.ents[k]] || E[r.ents[k]].t !== q.t; })) return;
      var keep = d.ents.filter(written);
      if (!keep.length) return;
      if (names[r.def] == null) {
        var base = dxfLayerName(r.def), nm = base, n = 2;
        if (nm === '0') nm = base = 'BLOCK';
        while (used[nm]) nm = base + '_' + n++;
        used[nm] = true; names[r.def] = nm;
        out.defs.push({ name: nm, ents: keep });
      }
      out.inserts.push({ name: names[r.def], x: r.x, y: r.y, ang: ((r.ang % 360) + 360) % 360, s: r.s, ents: r.ents });
    });
    return out.inserts.length ? out : null;
  }

  // sketch-text: a text's geometry, never a TEXT entity (laser and punch software cut and etch geometry): Etch text as
  // its strokes (LINE, ARC, CIRCLE; a letter stretched by a width factor as a polyline), Cut text as one closed
  // polyline per outline loop with its round ends as bulged (true arc) segments (Kernel.textDxf)
  function dxfSketchText(d, layer, e) {
    var g = K.textDxf(e);
    function deg(a) { a = a % 360; return a < 0 ? a + 360 : a; }
    (g.strokes || []).forEach(function (s) {
      if (s.t === 'line') d.line(layer, [s.x1, s.y1], [s.x2, s.y2]);
      else if (s.t === 'poly') d.polyline(layer, s.pts, !!s.closed);
      else if (s.a1 - s.a0 >= 360 - 1e-9) d.circle(layer, [s.cx, s.cy], s.r);
      else d.arc(layer, [s.cx, s.cy], s.r, deg(s.a0), deg(s.a1));
    });
    (g.polys || []).forEach(function (p) { if (p.circle) d.circle(layer, p.circle.c, p.circle.r); else d.polyline(layer, p.pts, true, p.bulges); });
  }
  // a sketch layer's name as a DXF layer name (R12: up to 31 of A-Z 0-9 $ - _)
  function dxfLayerName(n) { return (String(n).toUpperCase().replace(/[^A-Z0-9$_-]/g, '_').slice(0, 31)) || '0'; }
  // the AutoCAD Color Index nearest a '#rrggbb' colour: greys go to 7 / 8 / 9, other colours to the nearest hue among
  // 1-6 and orange 30 (each colour scaled to its brightest channel first, so a dark green is still green, ACI 3)
  var ACI_RGB = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [30, 255, 127, 0]];
  function nearestAci(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 7;
    var v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, mx = Math.max(r, g, b), best = 7, bd = Infinity;
    if (mx - Math.min(r, g, b) < 40) return mx < 100 || mx >= 220 ? 7 : mx < 160 ? 8 : 9;
    var k = 255 / mx;
    ACI_RGB.forEach(function (c) {
      var dd = Math.pow(r * k - c[1], 2) + Math.pow(g * k - c[2], 2) + Math.pow(b * k - c[3], 2);
      if (dd < bd) { bd = dd; best = c[0]; }
    });
    return best;
  }
  K.dxfNearestAci = nearestAci;

  // exportDXFFace(mesh, faceIndex, units, opts?) -> DXF text of a planar face's loops in the face's own frame (null for
  // a bad index): the largest loop on OUTLINE, the others on HOLES, cleaned and fitted as the flat pattern's.
  // opts: { version, style, origin (default false: the face frame's coordinates; true: lower-left at 0,0) }
  function exportDXFFace(mesh, faceIndex, units, opts) {
    opts = opts || {};
    var o = faceOutline(mesh, faceIndex);
    if (!o) return null;
    var d = new DXF(units, opts), style = opts.style === 'entities' ? 'entities' : 'polyline';
    var areas = o.loops.map(function (l) { return Math.abs(signedArea(l)); });
    var outerIdx = areas.indexOf(Math.max.apply(null, areas));
    var cvs = o.loops.map(function (l) { return dxfLoopCurves(l); });
    var box = curvesBox(cvs), shift = opts.origin === true && isFinite(box.min[0]) ? [-box.min[0], -box.min[1]] : [0, 0];
    cvs.forEach(function (cv, i) { if (cv) emitLoop(d, i === outerIdx ? 'OUTLINE' : 'HOLES', cv, style, shift); });
    return d.toString();
  }
  K.dxfLoopCurves = dxfLoopCurves; K.DXF_TOL = DXF_TOL;

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
    else if (f.type !== 'plane' && f.type !== 'refaxis' && f.type !== 'refpoint' && f.type !== 'csys') this.lastSolidId = f.id;   // lane CZ: reference geometry is no pattern source
    return f;
  };
  // num(x): a numeric argument, or an equation ('=T*2') passed through untouched for rebuild to resolve
  function num(x) { return isExpression(x) ? x : +x; }
  Builder.prototype.name = function (n) { this.model.name = String(n); return this; };
  Builder.prototype.units = function (u) { this.model.units = u === 'in' ? 'in' : 'mm'; return this; };
  // the part's Levels Manager table (ui-levels.js): numbered levels, level sets and the main level
  Builder.prototype.levels = function (list, main) { this.model.levels = JSON.parse(JSON.stringify(list || [])); if (main != null) this.model.mainLevel = +main; return this; };
  Builder.prototype.density = function (d) { this.model.density = +d; return this; };
  Builder.prototype.color = function (c) { this.model.color = String(c); return this; };
  // rfIF: the document's dimension precision (SolidWorks: Document Properties > Dimensions > Primary precision):
  // dimPrecision({ linear, angular }) decimal places 0 ... 8 -> model.dimPrecision; a missing field is the default for
  // the units (inch .123, mm .12, angles .12), an empty object removes it
  Builder.prototype.dimPrecision = function (o) {
    var out = {};
    ['linear', 'angular'].forEach(function (k) { if (o && o[k] != null && o[k] !== '' && +o[k] >= 0) out[k] = Math.min(8, Math.round(+o[k])); });
    if (Object.keys(out).length) this.model.dimPrecision = out; else delete this.model.dimPrecision;
    return this;
  };
  // equations({ T: 10, W: '=T*2' }) or equations([{ name, expr }]): the model's global variables, in order (replaces
  // any earlier list). Numbers are stored as their string. The object form drops a leading "="; the array form (what
  // generateScript writes) keeps each expr string exactly, so a script round trip reproduces model.equations.
  Builder.prototype.equations = function (spec) {
    var list = [];
    function expr(v) { return String(v == null ? '' : v).replace(/^\s*=/, '').trim(); }
    if (Array.isArray(spec)) spec.forEach(function (e) {
      if (!e) return;
      var q = {};
      Object.keys(e).forEach(function (k) { q[k] = e[k]; }); // extra fields (a comment, say) ride along
      q.name = String(e.name);
      q.expr = typeof e.expr === 'string' ? e.expr : String(e.expr == null ? '' : e.expr);
      list.push(q);
    });
    else if (spec && typeof spec === 'object') Object.keys(spec).forEach(function (k) { list.push({ name: k, expr: expr(spec[k]) }); });
    this.model.equations = list;
    return this;
  };
  // configurations([{ name, values: { T: 6, N: '=2' } }], active?): the model's named variable sets (replaces any
  // earlier list). Values are stored as expression strings without a leading "=". `active` (optional) activates one.
  Builder.prototype.configurations = function (list, active) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || c.name == null) return;
      var q = {}, vals = {};
      Object.keys(c).forEach(function (k) { q[k] = c[k]; });
      Object.keys(c.values || {}).forEach(function (k) { vals[k] = configExpr(c.values[k]); });
      q.name = String(c.name); q.values = vals;
      out.push(q);
    });
    if (out.length) this.model.configurations = out; else { delete this.model.configurations; delete this.model.activeConfiguration; }
    if (active != null) this.activeConfiguration(active);
    return this;
  };
  // activeConfiguration(name): the configuration whose values drive the equations (null: the base equations)
  Builder.prototype.activeConfiguration = function (name) {
    if (name == null) { delete this.model.activeConfiguration; return this; }
    if (!findConfiguration(this.model, name)) throw new Error('activeConfiguration: no configuration named "' + name + '"');
    this.model.activeConfiguration = String(name);
    return this;
  };
  // _value(x): a number for a sketch dimension that must be numeric now (box, cylinder, hole sizes): an equation is
  // evaluated against the current variables at script time, since sketch entities hold no expressions.
  Builder.prototype._value = function (x, what) {
    if (!isExpression(x)) return +x;
    try { return evalExpression(x, resolveEquations(this.model).vars); } catch (e) { throw new Error(what + ': ' + e.message); }
  };
  Builder.prototype.plane = function (ref, offset, name) {
    var f = this._add({ type: 'plane', ref: ref || 'Front', offset: num(offset) || 0, name: name });
    return f.id;
  };
  // lane CZ: reference geometry. Each returns the new feature's id (like p.plane), to pass on as a ref ({ axis: id },
  // { point: id }, { plane: csysId }) or as a circular pattern's / revolve's `axisRef`. A ref is an object (see
  // kernel-features.js) or a shorthand: 'Front' / 'Top' / 'Right' (a standard plane), 'x' / 'y' / 'z' (an origin axis),
  // 'origin', or [x, y, z] (a vertex).
  function refIn(r) {
    if (r == null) return null;
    if (typeof r === 'string') return r === 'origin' ? { point: 'origin' } : /^[xyz]$/.test(r) ? { axis: r } : { plane: r };
    if (Array.isArray(r)) return { vertex: r.map(Number) };
    var o = {};
    Object.keys(r).forEach(function (k) { o[k] = Array.isArray(r[k]) ? r[k].map(Number) : r[k]; });
    return o;
  }
  // p.axis(kind, refs, opts): kind 'line' (one line / edge / axis), 'planes' (two planes), 'points' (two points),
  // 'cyl' (a cylindrical / conical face), 'pointFace' (a point and a plane: the normal through the point)
  Builder.prototype.axis = function (kind, refs, opts) {
    opts = opts || {};
    return this._add({ type: 'refaxis', kind: kind || 'line', refs: (refs || []).map(refIn), name: opts.name }).id;
  };
  // p.point(kind, refs, opts): kind 'arc' (arc centre), 'face' (centre of face), 'intersect' (two edges / lines),
  // 'project' (a point onto a plane / face), 'on' (a vertex / sketch point), 'along' (opts.distance along an edge or
  // sketch line / arc from its start; opts.percent: distance in %; opts.reverse: from the other end)
  Builder.prototype.point = function (kind, refs, opts) {
    opts = opts || {};
    var f = { type: 'refpoint', kind: kind || 'on', refs: (refs || []).map(refIn), name: opts.name };
    if (opts.distance != null) f.distance = num(opts.distance);
    if (opts.percent) f.percent = true;
    if (opts.reverse) f.reverse = true;
    return this._add(f).id;
  };
  // p.csys({ origin, x, y, z, flipX, flipY, flipZ, name }): any two of x / y / z fix the frame (the third follows,
  // right-handed); one fixes that axis; none gives the world axes at the origin
  Builder.prototype.csys = function (opts) {
    opts = opts || {};
    var f = { type: 'csys', name: opts.name };
    ['origin', 'x', 'y', 'z'].forEach(function (k) { if (opts[k] != null) f[k] = refIn(opts[k]); });
    ['flipX', 'flipY', 'flipZ'].forEach(function (k) { if (opts[k]) f[k] = true; });
    return this._add(f).id;
  };
  Builder.prototype._planeRef = function (spec, offset) {
    if (spec == null) return { ref: 'Front', offset: 0 };
    if (typeof spec === 'number') return { featureId: spec };
    if (typeof spec === 'string') return { ref: spec, offset: num(offset) || 0 };
    // r10/facesketch10: a sketch on a face of a feature, which follows that face at rebuild:
    //   p.sketch({ face: boss, normal: [0, 0, 1] })   the face of feature `boss` whose outward normal is `normal`
    //     (an extrude's end cap is found from the extrude itself; for other faces give `at`, a point on the face, or
    //     `offset`, the face plane's distance along the normal, and the nearest such face is taken);
    //   a full frame { custom: true, origin, x, y, n, offset, face: { feature, role, cap?, inst?, lx?, ln? } } as
    //   generateScript writes it; `cap: 'far' | 'near'` (r11/faceref11) keeps the sketch on its cap when the extrude is reversed.
    var fr = spec.face;
    if (fr != null && typeof fr !== 'object') fr = { feature: fr, role: spec.role || 'cap' };
    if (fr && spec.cap && !fr.cap) fr = faceCopy(fr, { cap: spec.cap });
    if (spec.custom) {
      if (!fr) return spec;
      var cp = JSON.parse(JSON.stringify(spec)); cp.face = faceCopy(fr);
      return cp;
    }
    if (fr) {
      var n = spec.normal || spec.n || [0, 0, 1], nn = norm(n);
      var pl = tidyPlane(planeFromFace(nn, spec.at ? spec.at : scale(nn, num(spec.offset || offset || 0))));
      pl.face = faceCopy(fr);
      return pl;
    }
    if (spec.featureId != null) return { featureId: spec.featureId };
    return { ref: spec.ref || 'Front', offset: num(spec.offset || offset || 0) };
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
      type: 'extrude', sketch: this._sketchId(opts), depth: depth == null ? 0 : num(depth), end: opts.throughAll ? 'through' : (opts.midplane ? 'mid' : 'blind'),
      reverse: !!opts.reverse || opts.dir === -1, cut: !!opts.cut, dir2: !!opts.depth2 || !!opts.both,
      depth2: opts.depth2 != null ? num(opts.depth2) : (opts.both ? num(depth) : 0), end2: opts.throughAll2 ? 'through' : 'blind', name: opts.name
    });
    // rfFS: a cut given no direction (no `reverse`, no `dir`, one direction) leaves `reverse` out; the rebuild then
    // cuts into the material as SolidWorks does (+n, or −n when +n removes nothing) and writes the direction it took
    if (opts.cut && opts.reverse == null && opts.dir == null && f.end !== 'mid' && !f.dir2) delete f.reverse;
    if (opts.sheetBase) f.sheetBase = true;
    if (opts.draft) { f.draft = num(opts.draft); if (opts.draftOutward) f.draftOut = true; }
    if (opts.cut && opts.normalCut) f.normalCut = true; // sheet metal Normal Cut: the tool is made normal to the sheet
    if (opts.cut && opts.linkT) { f.linkT = true; f.end = 'blind'; if (this.model.sheet) f.depth = this.model.sheet.thickness; }   // lane DC: Link to thickness
    contourOpts(f, opts);
    bodyOpts(f, opts);
    return this;
  };
  // lane CO: Selected Contours — `contours: [[u, v], …]` (sketch-plane coordinates, one point inside each picked
  // region) makes the feature's profile the union of those regions of the sketch (Kernel.sketchRegions)
  function contourOpts(f, opts) {
    if (opts && Array.isArray(opts.contours) && opts.contours.length) f.contours = opts.contours.map(function (p) { return [+p[0], +p[1]]; });
    return f;
  }
  function contoursOut(o, f) {
    if (Array.isArray(f.contours) && f.contours.length) o.contours = f.contours.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; });
    return o;
  }
  // Multi-body options shared by every boss and cut: `merge: false` keeps a boss as a separate body, `bodies: [i, …]`
  // limits a cut to those bodies. A pattern or mirror takes both and the rebuild applies whichever fits its source.
  function bodyOpts(f, opts) {
    if (!opts) return f;
    var patternLike = f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror';
    if (opts.merge === false && (!f.cut || patternLike)) f.merge = false;
    if ((f.cut || patternLike) && Array.isArray(opts.bodies) && opts.bodies.length) f.bodies = opts.bodies.map(function (i) { return i | 0; });
    return f;
  }
  // Sheet metal parameters used by baseFlange/flange/flatten: thickness T, inside bend radius R (default T) and the
  // K-factor (BA = θ·(R + K·T); default 0.5, SolidWorks' default). opts (SolidWorks' Bend Allowance group and gauge
  // table): bendAllowanceType ('kfactor' | 'allowance' | 'deduction' | 'table'), bendAllowance (BA), bendDeduction (BD),
  // bendTable ({ kind: 'BA' | 'BD', name?, tolerance?, rows: [{ thickness, radius, angle, value }] }), gaugeTable (a
  // built-in table name, Kernel.gaugeTables, or a table object) and gauge: with a gauge, T, R and K (or BD) that are
  // left null come from the table's row.
  Builder.prototype.sheet = function (thickness, bendRadius, kFactor, opts) {
    opts = opts || {};
    var g = null;
    if (opts.gauge != null) {
      g = K.gaugeRow(opts.gaugeTable, opts.gauge, this.model.units);
      if (!g) throw new Error('Gauge ' + JSON.stringify(String(opts.gauge)) + ' is not in the gauge table ' + JSON.stringify((opts.gaugeTable && opts.gaugeTable.name) || opts.gaugeTable || K.DEFAULT_GAUGE_TABLE) + '.');
    }
    if (thickness == null && !g) throw new Error('sheet() needs a thickness (or a gauge).');
    var T = thickness != null ? num(thickness) : g.thickness;
    var o = { thickness: T, bendRadius: bendRadius != null ? num(bendRadius) : (g ? g.radius : T), kFactor: kFactor != null ? num(kFactor) : (g && g.kFactor != null ? g.kFactor : K.DEFAULT_K_FACTOR) };
    o.bendAllowanceType = opts.bendAllowanceType || (g && g.bendDeduction != null && opts.bendDeduction == null ? 'deduction' : 'kfactor');
    if (opts.bendAllowance != null) o.bendAllowance = num(opts.bendAllowance);
    if (opts.bendDeduction != null) o.bendDeduction = num(opts.bendDeduction);
    else if (g && g.bendDeduction != null) o.bendDeduction = g.bendDeduction;
    if (opts.bendTable) o.bendTable = opts.bendTable;
    if (g) { o.gaugeTable = opts.gaugeTable != null ? opts.gaugeTable : K.DEFAULT_GAUGE_TABLE; o.gauge = g.gauge; }
    if (opts.relief != null) { o.relief = opts.relief; if (opts.reliefRatio != null) o.reliefRatio = num(opts.reliefRatio); }   // Auto Relief (absent: none)
    this.model.sheet = K.makeSheet(o);
    return this;
  };
  Builder.prototype.baseFlange = function (thickness, opts) {
    opts = opts || {};
    // no sheet yet: baseFlange(T) sets one (R = T, K = 0.5 unless opts say otherwise); after sheet(...) it keeps that
    // sheet's radius, K-factor and bend allowance method and changes only what it is given
    if (!this.model.sheet) this.sheet(thickness != null ? thickness : 2, opts.bendRadius, opts.kFactor);
    else if (thickness != null || opts.bendRadius != null || opts.kFactor != null) {
      var s = Object.assign({}, this.model.sheet);
      if (thickness != null && num(thickness) !== s.thickness) { s.thickness = num(thickness); delete s.gauge; delete s.gaugeTable; }
      if (opts.bendRadius != null) s.bendRadius = num(opts.bendRadius);
      if (opts.kFactor != null) s.kFactor = num(opts.kFactor);
      s.bendAllowanceType = s.bendAllowanceType || 'kfactor';
      this.model.sheet = K.makeSheet(s);
    }
    var T = this.model.sheet.thickness;
    // lane open-base: an open chain of lines is SolidWorks' open-profile Base Flange: opts depth (default 1 in / 25 mm),
    // midplane, reverse (depth direction), flip (thickness side), radius
    var skf = this.model.features.filter(function (q) { return q.id === (opts.sketch != null ? opts.sketch : this.lastSketchId); }, this)[0];
    if (skf && K.isOpenProfile(skf)) {
      var ob = { type: 'insertBends', openBase: true, sketch: skf.id, depth: opts.depth != null ? num(opts.depth) : (this.model.units === 'in' ? 1 : 25), end: opts.midplane ? 'mid' : 'blind', reverse: !!opts.reverse, sheetBase: true, name: opts.name || 'Base-Flange1' };
      if (opts.flip) ob.flip = true;
      if (opts.radius != null) ob.radius = num(opts.radius);
      this._add(ob);
      return this;
    }
    var f = this.extrude(T, Object.assign({}, opts, { sheetBase: true, name: opts.name || 'Base-Flange1' }));
    return f;
  };
  // Custom Bend Allowance of a flange, hem or jog: { type: 'kfactor' | 'allowance' | 'deduction' | 'table', value }
  // (value: K, BA or BD; none for 'table', which uses the sheet's bend table), overriding the sheet's method
  function customBendAllowance(f, c) {
    if (!c) return f;
    if (K.BEND_ALLOWANCE_TYPES.indexOf(c.type) < 0) throw new Error('bendAllowance.type must be one of ' + K.BEND_ALLOWANCE_TYPES.join(', ') + '.');
    f.bendAllowance = { type: c.type };
    if (c.type !== 'table') {
      if (c.value == null || (!isExpression(c.value) && !isFinite(+c.value))) throw new Error('bendAllowance.value must be a number.');
      f.bendAllowance.value = num(c.value);
    }
    return f;
  }
  // edges: [[x,y,z], ...] points on straight edges of the flat sheet face
  // opts: angle, reverse, radius, position, toward, name, miter (bool), miterGap, relief ('none' | 'rect' | 'obround'),
  // reliefWidth (default T), reliefDepth (default T/2), bendAllowance ({ type, value }: Custom Bend Allowance)
  Builder.prototype.flange = function (length, edges, opts) {
    opts = opts || {};
    var f = { type: 'flange', length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside', toward: opts.toward ? [num(opts.toward[0]), num(opts.toward[1]), num(opts.toward[2])] : undefined,
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name,
      miter: !!opts.miter };
    // lane CS: no relief given = the sheet's Auto Relief (none on a sheet without one, as before); 'none' turns it off
    if (opts.miterGap != null) f.miterGap = num(opts.miterGap);
    flangeExtras(f, opts);
    if (opts.lengthRef != null) {
      if (K.FLANGE_LENGTH_REFS.indexOf(opts.lengthRef) < 0) throw new Error('lengthRef must be one of ' + K.FLANGE_LENGTH_REFS.join(', ') + '.');
      f.lengthRef = opts.lengthRef;
    }
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // lane rfJC: the options of lane rfIZ (kernel flangeLayout) for p.flange / p.hem: relief ('rect' | 'obround' | 'tear' |
  // 'none'), reliefWidth / reliefDepth, reliefRatio (Rectangle / Obround: width = depth = ratio × T); flange only:
  // lengthEnd ('blind' | 'upToVertex') with lengthVertex [x, y, z] and lengthVertexMode ('normal' | 'parallel'), offset
  // (a distance, or { end: 'blind', distance })
  var FLANGE_RELIEFS = ['rect', 'obround', 'tear'];
  function flangeExtras(f, opts) {
    if (opts.relief != null) f.relief = FLANGE_RELIEFS.indexOf(opts.relief) >= 0 ? opts.relief : 'none';
    if (opts.reliefWidth != null) f.reliefWidth = num(opts.reliefWidth);
    if (opts.reliefDepth != null) f.reliefDepth = num(opts.reliefDepth);
    if (opts.reliefRatio != null) f.reliefRatio = num(opts.reliefRatio);
    if (f.hem) return;
    if (opts.trimSideBends) f.trimSideBends = true;   // lane smtrim: Trim side bends (flangeLayout's sideBendTrim), flange only
    if (opts.lengthEnd != null && opts.lengthEnd !== 'blind') {
      if (opts.lengthEnd !== 'upToVertex') throw new Error('lengthEnd must be "blind" or "upToVertex".');
      if (!Array.isArray(opts.lengthVertex) || opts.lengthVertex.length !== 3) throw new Error('lengthEnd "upToVertex" needs lengthVertex: [x, y, z].');
      f.lengthEnd = 'upToVertex';
      f.lengthVertex = opts.lengthVertex.map(num);
      if (opts.lengthVertexMode != null) {
        if (opts.lengthVertexMode !== 'normal' && opts.lengthVertexMode !== 'parallel') throw new Error('lengthVertexMode must be "normal" or "parallel".');
        f.lengthVertexMode = opts.lengthVertexMode;
      }
    }
    if (opts.offset != null) {
      var o = typeof opts.offset === 'object' ? opts.offset : { distance: opts.offset };
      if (o.end != null && o.end !== 'blind') throw new Error('offset.end must be "blind".');
      f.offset = { end: 'blind', distance: num(o.distance) };
    }
  }
  // lane DL: miterFlange(edges, opts): Sheet Metal ▸ Miter Flange from a profile sketch (Kernel.miterFlangeStages). edges:
  // [[x,y,z], …] points on the straight edges to run along (the one the profile starts on is added when missing). opts:
  // sketch (default: the last sketch; an open chain of lines (+ tangent arcs) on a plane normal to an edge, starting on
  // it), position ('inside' Material Inside (default) | 'outside' | 'bendOutside'), radius, miterGap, startOffset,
  // endOffset, relief / reliefWidth / reliefDepth (as flange), bendAllowance, name
  Builder.prototype.miterFlange = function (edges, opts) {
    opts = opts || {};
    var position = opts.position || 'inside';
    if (K.MITER_FLANGE_POSITIONS.indexOf(position) < 0) throw new Error('miterFlange position must be one of ' + K.MITER_FLANGE_POSITIONS.join(', ') + '.');
    var f = { type: 'flange', miterFlange: true, miter: true, sketch: this._sketchId(opts), edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }),
      position: position, radius: opts.radius != null ? num(opts.radius) : null, miterGap: opts.miterGap != null ? num(opts.miterGap) : K.closedCornerDefaultGap(this.model),
      startOffset: opts.startOffset != null ? num(opts.startOffset) : 0, endOffset: opts.endOffset != null ? num(opts.endOffset) : 0, name: opts.name };
    if (opts.relief != null) f.relief = opts.relief === 'rect' || opts.relief === 'obround' ? opts.relief : 'none';
    if (opts.reliefWidth != null) f.reliefWidth = num(opts.reliefWidth);
    if (opts.reliefDepth != null) f.reliefDepth = num(opts.reliefDepth);
    if (opts.trimSideBends) f.trimSideBends = true;   // lane smtrim
    customBendAllowance(f, opts.bendAllowance);
    if (!f.name) f.name = 'Miter Flange' + (this.model.features.filter(function (q) { return q.type === 'flange' && q.miterFlange; }).length + 1);
    this._add(f);
    return this;
  };
  // hem: a 180° flange folded back over the sheet; `gap` is the opening between the flats (default T/2, open hem).
  // A numeric gap is stored as the bend radius; a gap (or sheet thickness) given as an equation is kept as `gap`
  // and the radius is derived from it at rebuild.
  // opts.hemType ('open' | 'closed' | 'teardrop' | 'rolled'; absent = the legacy open hem), hemPosition ('inside':
  // Material Inside, within the flange's height | 'outside': Bend Outside, the legacy placement), hemRadius and
  // hemAngle (tear drop / rolled: the curl's inner radius, default the sheet radius, and sweep, default 200° / 270°). A closed,
  // tear drop or rolled hem has no gap (its radius comes from its type).
  Builder.prototype.hem = function (length, edges, opts) {
    opts = opts || {};
    var T = this.model.sheet ? this.model.sheet.thickness : 2;
    var gap = opts.gap != null ? num(opts.gap) : (isExpression(T) ? '=(' + T.replace(/^\s*=/, '') + ')/2' : T / 2);
    var f = { type: 'flange', hem: true, length: num(length), angle: 180, reverse: !!opts.reverse, position: 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name };
    if (opts.hemType != null) {
      if (K.HEM_TYPES.indexOf(opts.hemType) < 0) throw new Error('hemType must be one of ' + K.HEM_TYPES.join(', ') + '.');
      f.hemType = opts.hemType;
    }
    if (opts.hemPosition != null) {
      if (opts.hemPosition !== 'inside' && opts.hemPosition !== 'outside') throw new Error('hemPosition must be "inside" or "outside".');
      f.hemPosition = opts.hemPosition;
    }
    if (opts.hemRadius != null) f.hemRadius = num(opts.hemRadius);
    if (opts.hemAngle != null) f.hemAngle = num(opts.hemAngle);
    if (f.hemType && f.hemType !== 'open') f.radius = null;
    else if (isExpression(gap) || isExpression(T)) { f.gap = gap; f.radius = null; }
    else f.radius = Math.max(gap / 2, 0.02 * T);
    f.name = f.name || featureName(this.model, 'hem');
    // lane rfJC: Miter Gap (hems on adjacent edges mitred at their corner) and the Custom Relief Type fields
    if (opts.miter) { f.miter = true; if (opts.miterGap != null) f.miterGap = num(opts.miterGap); }
    flangeExtras(f, opts);
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // jog: two bends offsetting the sheet by `height`, then `length` of flat parallel to the base
  // lane DC: jog(offset, { sketch, fixed, offsetRef, angle, position, reverse, radius, bendAllowance, name }) — SolidWorks'
  // Jog from a sketch with one line on a flat face of the sheet (also on SketchBuilder). offsetRef 'outside' (default) |
  // 'inside' | 'overall'; position 'centerline' (default) | 'inside' | 'outside' | 'bendOutside'; fixed [x, y, z] on the side
  // that stays (default the larger piece)
  Builder.prototype.jog = function (height, length, edges, opts) {
    if (edges == null && (length == null || (typeof length === 'object' && !Array.isArray(length)))) return this._sketchJog(height, length || {});
    opts = opts || {};
    this._add(customBendAllowance({ type: 'jog', height: num(height), length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name }, opts.bendAllowance));
    return this;
  };
  // lane dxfout-2: loftedBend([sketchA, sketchB], { method: 'bent' (default) | 'formed', faceting: 'count' (default) |
  // 'length' | 'chord', facetValue (4 segments per arc by default), name }) — SolidWorks' Lofted-Bend between two open
  // profiles (the sheet's mid-surface); needs p.sheet(T, …) first. Its flat is Kernel.flatPattern's like any sheet part.
  Builder.prototype.loftedBend = function (sketches, opts) {
    opts = opts || {};
    if (!Array.isArray(sketches) || sketches.length !== 2) throw new Error('loftedBend: give the two profile sketches.');
    if (!this.model.sheet) throw new Error('loftedBend: set the sheet first (p.sheet(thickness, radius, k)).');
    var method = opts.method || 'bent', fac = opts.faceting || 'count';
    if (K.LOFTED_BEND_METHODS.indexOf(method) < 0) throw new Error('loftedBend method must be one of ' + K.LOFTED_BEND_METHODS.join(', ') + '.');
    if (K.LOFTED_BEND_FACETING.indexOf(fac) < 0) throw new Error('loftedBend faceting must be one of ' + K.LOFTED_BEND_FACETING.join(', ') + '.');
    var f = { type: 'loftedBend', sketches: sketches.map(Number), method: method, faceting: fac, facetValue: opts.facetValue != null ? num(opts.facetValue) : (fac === 'count' ? 4 : null), name: opts.name || 'Lofted-Bend' + (this.model.features.filter(function (q) { return q.type === 'loftedBend'; }).length + 1) };
    if (!(+f.facetValue > 0)) throw new Error('loftedBend facetValue must be greater than zero.');
    this._add(f);
    return this;
  };
  // lane sweptflange: sweptFlange(profileSketch, path, { flip (Reverse direction: T on the left of the profile as
  // drawn), radius, flatten: 'profile' (default) | 'path' (Flatten along path), bendAllowance: { type, value }, name })
  // — SolidWorks' Swept Flange: an open profile swept along a path sketch, or along edges of the part (path = a list
  // of points on them, [[x, y, z], ...]); needs p.sheet(T, R, k) first.
  Builder.prototype.sweptFlange = function (profile, path, opts) {
    opts = opts || {};
    if (!this.model.sheet) throw new Error('sweptFlange: set the sheet first (p.sheet(thickness, radius, k)).');
    if (profile == null) throw new Error('sweptFlange: give the profile sketch.');
    var flatten = opts.flatten || 'profile';
    if (K.SWEPT_FLANGE_FLATTEN.indexOf(flatten) < 0) throw new Error('sweptFlange flatten must be one of ' + K.SWEPT_FLANGE_FLATTEN.join(', ') + '.');
    var f = { type: 'sweptFlange', profile: Number(profile), flip: !!opts.flip, flatten: flatten };
    if (Array.isArray(path)) f.edges = path.map(function (e) { return { at: (Array.isArray(e) ? e : e.at).map(num) }; });
    else if (path == null) throw new Error('sweptFlange: give the path sketch (or points on the path edges).');
    else f.path = Number(path);
    if (opts.radius != null) f.radius = num(opts.radius);
    f.name = opts.name || 'Swept Flange' + (this.model.features.filter(function (q) { return q.type === 'sweptFlange'; }).length + 1);
    this._add(customBendAllowance(f, opts.bendAllowance));
    return this;
  };
  Builder.prototype._sketchJog = function (offset, opts) {
    var position = opts.position || 'centerline', ref = opts.offsetRef || 'outside';
    if (K.SKETCHED_BEND_POSITIONS.indexOf(position) < 0) throw new Error('jog position must be one of ' + K.SKETCHED_BEND_POSITIONS.join(', ') + '.');
    if (K.JOG_OFFSET_REFS.indexOf(ref) < 0) throw new Error('jog offsetRef must be one of ' + K.JOG_OFFSET_REFS.join(', ') + '.');
    // lane dxfout-2: offsetEnd 'blind' (default) | 'upToVertex' | 'upToSurface' | 'offsetFromSurface', offsetTarget ([x, y, z]
    // or a plane name / reference plane id), offsetDistance, offsetFlip; the offset is then not used (pass null)
    var end = opts.offsetEnd || 'blind';
    if (K.JOG_OFFSET_ENDS.indexOf(end) < 0) throw new Error('jog offsetEnd must be one of ' + K.JOG_OFFSET_ENDS.join(', ') + '.');
    var f = { type: 'jog', sketch: this._sketchId(opts), offset: offset == null && end !== 'blind' ? null : num(offset), offsetRef: ref, angle: opts.angle == null ? 90 : num(opts.angle), position: position,
      reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, fixed: opts.fixed ? [+opts.fixed[0], +opts.fixed[1], +opts.fixed[2]] : null, name: opts.name };
    if (end !== 'blind') {
      f.offsetEnd = end;
      f.offsetTarget = Array.isArray(opts.offsetTarget) ? opts.offsetTarget.map(Number) : opts.offsetTarget;
      if (end === 'offsetFromSurface') { f.offsetDistance = num(opts.offsetDistance || 0); if (opts.offsetFlip) f.offsetFlip = true; }
    }
    if (opts.fixLength) f.fixLength = true;   // lane DK2: Fix projected length
    this._add(customBendAllowance(f, opts.bendAllowance));
    return this;
  };
  // sketchedBend(angle, opts): bend the sheet along every line of a sketch drawn on one of its flat faces (SolidWorks'
  // Sketched Bend; the flat is kept, each bend rolls up BA of it). opts: sketch (default: the last sketch), fixed ([x, y,
  // z] on the side that stays put; default the largest piece), position ('centerline' (default) | 'inside' | 'outside' |
  // 'bendOutside'), reverse (fold away from the sketch normal), radius, bendAllowance ({ type, value }), name
  Builder.prototype.sketchedBend = function (angle, opts) {
    opts = opts || {};
    var position = opts.position || 'centerline';
    if (K.SKETCHED_BEND_POSITIONS.indexOf(position) < 0) throw new Error('sketchedBend position must be one of ' + K.SKETCHED_BEND_POSITIONS.join(', ') + '.');
    var f = { type: 'sketchedBend', sketch: this._sketchId(opts), angle: angle == null ? 90 : num(angle), position: position, reverse: !!opts.reverse,
      radius: opts.radius != null ? num(opts.radius) : null, fixed: opts.fixed ? [+opts.fixed[0], +opts.fixed[1], +opts.fixed[2]] : null, name: opts.name };
    this._add(customBendAllowance(f, opts.bendAllowance));
    return this;
  };
  // breakCorner(size, corners, opts): Sheet Metal ▸ Break-Corner/Corner-Trim (kernel-sheetmetal.js). corners: [[x, y, z],
  // …] points on corner edges (the short edges through the thickness at outside corners); opts: kind ('chamfer', the
  // default, size = the distance along both edges | 'fillet', size = the radius), faces ([[x, y, z], …] points on flat
  // sheet faces: every outside corner of each), name
  Builder.prototype.breakCorner = function (size, corners, opts) {
    opts = opts || {};
    var kind = opts.kind || 'chamfer';
    if (K.BREAK_CORNER_KINDS.indexOf(kind) < 0) throw new Error('breakCorner kind must be "chamfer" or "fillet".');
    function pt(p) { return [+p[0], +p[1], +p[2]]; }
    var f = { type: 'breakCorner', kind: kind, size: num(size), corners: (corners || []).map(pt) };
    if (opts.faces && opts.faces.length) f.faces = opts.faces.map(pt);
    f.name = opts.name || K.breakCornerName(this.model);
    this._add(f);
    return this;
  };
  // lane smtrim: cornerRelief(corners, size, opts): Sheet Metal ▸ Corners ▸ Corner Relief, 2 Bend corners
  // (kernel-sheetmetal.js cornerReliefLayout). corners: [[x, y, z]] near the corners (K.cornerReliefCandidates); size
  // (null = 2 × T; unused by 'tear'); opts: reliefType ('rect' (default) | 'circular' | 'tear' | 'obround' |
  // 'constantWidth'), centeredOnBend (default true), name
  Builder.prototype.cornerRelief = function (corners, size, opts) {
    opts = opts || {};
    var type = opts.reliefType || 'rect';
    if (K.CORNER_RELIEF_TYPES.indexOf(type) < 0) throw new Error('cornerRelief reliefType must be one of ' + K.CORNER_RELIEF_TYPES.join(', ') + '.');
    var f = { type: 'cornerRelief', corners: (corners || []).map(function (p) { return [+p[0], +p[1], +p[2]]; }), reliefType: type, size: size == null ? null : num(size) };
    if (opts.centeredOnBend === false) f.centeredOnBend = false;
    f.name = opts.name || K.cornerReliefName(this.model);
    this._add(f);
    return this;
  };
  // crossBreak(face, opts): Sheet Metal ▸ Cross-Break (kernel-sheetmetal.js), cosmetic: the solid and the blank stay.
  // face: [x, y, z] on a planar sheet face; opts: radius (default the sheet's bend radius), angle (degrees, default 1),
  // reverse, sketch (a sketch on the face: its lines replace the corner-to-corner X), name
  Builder.prototype.crossBreak = function (face, opts) {
    opts = opts || {};
    var s = this.model.sheet;
    var f = { type: 'crossBreak', face: [+face[0], +face[1], +face[2]], radius: opts.radius != null ? num(opts.radius) : (s ? s.bendRadius : 0), angle: opts.angle != null ? num(opts.angle) : 1, reverse: !!opts.reverse };
    if (opts.sketch != null) f.sketch = opts.sketch;
    f.name = opts.name || K.crossBreakName(this.model);
    this._add(f);
    return this;
  };
  // formingTool(tool, face, opts): Sheet Metal ▸ Forming Tool (kernel-sheetmetal.js, lane forming). tool: 'dimple' |
  // 'extrudedHole' | 'louver' | 'lance' | 'rib' (Kernel.FORMING_TOOLS); face: [x, y, z] on a flat sheet face (the tool
  // sits there unless opts.at is given); opts: at ([u, v] in the face's sketch frame), angle (degrees), flip (form the
  // other way), the tool's dims (default Kernel.formingToolDefaults in the part's units), name
  Builder.prototype.formingTool = function (tool, face, opts) {
    opts = opts || {};
    var def = K.formingToolDefaults(tool, this.model.units);
    if (!def) throw new Error('formingTool: unknown tool "' + tool + '" (' + K.FORMING_TOOLS.map(function (t) { return t.id; }).join(', ') + ').');
    if (!face || face.length !== 3) throw new Error('formingTool: give a point [x, y, z] on a flat face of the sheet.');
    var f = { type: 'formingTool', tool: tool, face: [+face[0], +face[1], +face[2]] };
    if (opts.at) f.at = [+opts.at[0], +opts.at[1]];
    f.angle = opts.angle != null ? num(opts.angle) : 0;
    f.flip = !!opts.flip;
    K.FORMING_TOOLS.filter(function (t) { return t.id === tool; })[0].params.forEach(function (p) { f[p.key] = opts[p.key] != null ? num(opts[p.key]) : def[p.key]; });
    f.name = opts.name || K.formingToolName(this.model, tool);
    this._add(f);
    return this;
  };
  // rip(edges, gap, opts): Sheet Metal ▸ Rip (kernel-sheetmetal.js, lane DI). edges: [[x, y, z] | { at: [x, y, z],
  // direction }, …] points on corner edges (outside or inside) where two walls meet; gap (default 0.004 in / 0.1 mm);
  // opts: direction ('both', the default | 'side1' | 'side2': which wall keeps the corner), name
  Builder.prototype.rip = function (edges, gap, opts) {
    opts = opts || {};
    var dir = opts.direction || 'both';
    if (K.RIP_DIRECTIONS.indexOf(dir) < 0) throw new Error('rip direction must be "both", "side1" or "side2".');
    function pt(p) { return [+p[0], +p[1], +p[2]]; }
    var f = { type: 'rip', edges: (edges || []).map(function (e) {
      if (Array.isArray(e)) return { at: pt(e) };
      if (e.direction && K.RIP_DIRECTIONS.indexOf(e.direction) < 0) throw new Error('rip direction must be "both", "side1" or "side2".');
      return e.direction ? { at: pt(e.at), direction: e.direction } : { at: pt(e.at) };
    }), gap: gap != null ? num(gap) : K.ripDefaultGap(this.model), direction: dir };
    if (opts.name) f.name = opts.name;
    this._add(f);
    return this;
  };
  // tab(opts): Base Flange/Tab on a part that already has a sheet (lane DI): the last sketch (on a sheet face) extruded
  // the sheet's thickness into the sheet and merged; opts: sketch, reverse (away from the face instead), name (TabN)
  Builder.prototype.tab = function (opts) {
    opts = opts || {};
    if (!this.model.sheet) throw new Error('tab needs a sheet: make a baseFlange first.');
    this.extrude(this.model.sheet.thickness, { sketch: opts.sketch, reverse: !!opts.reverse, name: opts.name || featureName(this.model, 'tab') });
    var f = this.model.features[this.model.features.length - 1];
    f.sheetBase = true; f.tab = true; f.linkT = true;
    if (opts.contours) contourOpts(f, opts);
    return this;
  };
  // vent(opts): Sheet Metal ▸ Vent (kernel-sheetmetal.js, lane DT). opts: sketch (default: the last sketch), boundary,
  // ribs, spars, fill ([entity indices] of that sketch; no boundary = the largest closed entity is the boundary, lines
  // ribs, other closed entities spars), ribWidth, sparWidth, fillWidth (default 0), radius (default 0), name
  Builder.prototype.vent = function (opts) {
    opts = opts || {};
    var f = { type: 'vent', sketch: this._sketchId(opts) };
    ['boundary', 'ribs', 'spars', 'fill'].forEach(function (k) { f[k] = (opts[k] || []).map(function (i) { return +i; }); });
    f.ribWidth = opts.ribWidth != null ? num(opts.ribWidth) : null;
    f.sparWidth = opts.sparWidth != null ? num(opts.sparWidth) : null;
    f.fillWidth = opts.fillWidth != null ? num(opts.fillWidth) : 0;
    f.radius = opts.radius != null ? num(opts.radius) : 0;
    if (opts.name) f.name = opts.name;
    this._add(f);
    return this;
  };
  // closedCorner(faces, opts): Sheet Metal ▸ Closed Corner (kernel-sheetmetal.js). faces: [[x, y, z], …] points on the
  // end faces of a flange to extend across a corner gap (the matching faces are found); opts: cornerType ('butt', the
  // default | 'overlap' | 'underlap'), gap (default 0.01 in / 0.25 mm), ratio (overlap / underlap ratio 0..1, default
  // 1), coplanar (default true: coplanar end faces are extended too), closeBend (lane DK2: true closes the bend region
  // too, the PropertyManager's Open bend region unchecked; absent / false = open, so scripts written before keep their
  // geometry), name
  Builder.prototype.closedCorner = function (faces, opts) {
    opts = opts || {};
    var type = opts.cornerType || 'butt';
    if (K.CLOSED_CORNER_TYPES.indexOf(type) < 0) throw new Error('closedCorner cornerType must be "butt", "overlap" or "underlap".');
    function pt(p) { return [+p[0], +p[1], +p[2]]; }
    var f = { type: 'closedCorner', faces: (faces || []).map(pt), cornerType: type,
      gap: opts.gap != null ? num(opts.gap) : K.closedCornerDefaultGap(this.model), ratio: opts.ratio != null ? num(opts.ratio) : 1 };
    if (opts.coplanar === false) f.coplanar = false;
    if (opts.closeBend) f.closeBend = true;
    f.name = opts.name || K.closedCornerName(this.model);
    this._add(f);
    return this;
  };
  // weldedCorner(faces, opts) (lane smcorner): Sheet Metal ▸ Corners ▸ Welded Corner (kernel-sheetmetal.js
  // weldedCornerLayout). faces: [[x, y, z], …] a point on a side face of each corner (a wall's end face facing the other
  // wall across the gap); opts: fillet (radius in the weld's inside corner, default none), addTexture (cosmetic), name.
  // The weld is in the folded part only: the flat pattern leaves it out.
  Builder.prototype.weldedCorner = function (faces, opts) {
    opts = opts || {};
    var f = { type: 'weldedCorner', faces: (faces || []).map(function (p) { return [+p[0], +p[1], +p[2]]; }) };
    if (opts.fillet != null && (isExpression(opts.fillet) || +opts.fillet > 0)) f.fillet = num(opts.fillet);
    if (opts.addTexture) f.addTexture = true;
    f.name = opts.name || K.weldedCornerName(this.model);
    this._add(f);
    return this;
  };
  // insertBends(fixedFace, opts) / convertSheetMetal(fixedFace, bendEdges, opts): Sheet Metal ▸ Insert Bends and
  // Convert to Sheet Metal (kernel-sheetmetal.js, lane DQ). fixedFace: [x, y, z] on a flat face that stays put (the flat
  // is laid from it). Insert Bends works on a part of constant thickness (a shell, a thin extrude): every sharp corner
  // between two walls becomes a bend. Convert to Sheet Metal works on a solid: bendEdges [[x, y, z], …] are points on
  // the solid's edges that become bends; the faces not reached from the fixed face across them are removed (a shell of
  // the thickness inward) and the edges between kept faces are ripped. opts: thickness (Insert Bends: default measured
  // at the fixed face; Convert: required unless the part has a sheet), radius (inside bend radius, default T),
  // kFactor (0.5) or bendAllowanceType / bendAllowance / bendDeduction / bendTable (as sheet()), autoRelief ('rect',
  // the default | 'none'), Convert also ripEdges ([[x, y, z], …]; default: found) and gap (rip gap, default 0.004 in /
  // 0.1 mm); name. With no sheet yet they set one; after sheet(...) (a script written back) they keep it and change
  // only what they are given.
  function ibPt(p, what) {
    if (!p || p.length !== 3 || !p.every(function (x) { return isFinite(+x); })) throw new Error(what + ': points are [x, y, z].');
    return [+p[0], +p[1], +p[2]];
  }
  function ibSheet(b, opts, measure) {
    var m = b.model;
    if (!m.sheet) {
      var T = opts.thickness != null ? num(opts.thickness) : measure();
      if (typeof T === 'number') T = Math.round(T * 1e9) / 1e9;
      b.sheet(T, opts.radius != null ? opts.radius : T, opts.kFactor, opts);
    } else if (opts.thickness != null || opts.radius != null || opts.kFactor != null) {
      var s = Object.assign({}, m.sheet);
      if (opts.thickness != null) { s.thickness = num(opts.thickness); delete s.gauge; delete s.gaugeTable; }
      if (opts.radius != null) s.bendRadius = num(opts.radius);
      if (opts.kFactor != null) s.kFactor = num(opts.kFactor);
      m.sheet = K.makeSheet(s);
    }
  }
  function ibRelief(f, opts) {
    if (opts.autoRelief == null) return;
    if (K.INSERT_BENDS_RELIEFS.indexOf(opts.autoRelief) < 0) throw new Error('autoRelief must be "rect" or "none".');
    if (opts.autoRelief !== 'rect') f.autoRelief = opts.autoRelief;
  }
  Builder.prototype.insertBends = function (fixedFace, opts) {
    opts = opts || {};
    var P = ibPt(fixedFace, 'insertBends'), m = this.model;
    ibSheet(this, opts, function () { return K.sheetThicknessAt(K.rebuild(m).body, P, m.units); });
    var f = { type: 'insertBends', fixedFace: P, sheetBase: true };
    ibRelief(f, opts);
    if (opts.name) f.name = opts.name;
    this._add(f);
    return this;
  };
  Builder.prototype.convertSheetMetal = function (fixedFace, bendEdges, opts) {
    opts = opts || {};
    var P = ibPt(fixedFace, 'convertSheetMetal');
    ibSheet(this, opts, function () { throw new Error('convertSheetMetal needs a thickness (opts.thickness).'); });
    var f = { type: 'convertSM', fixedFace: P, bendEdges: (bendEdges || []).map(function (e) { return ibPt(Array.isArray(e) ? e : e.at, 'convertSheetMetal'); }), sheetBase: true };
    if (opts.ripEdges && opts.ripEdges.length) f.ripEdges = opts.ripEdges.map(function (e) { return ibPt(Array.isArray(e) ? e : e.at, 'convertSheetMetal'); });
    f.gap = opts.gap != null ? num(opts.gap) : K.ripDefaultGap(this.model);
    ibRelief(f, opts);
    if (opts.reverse) f.reverse = true;   // lane rfIM: Reverse thickness (the sheet outside the kept faces)
    if (opts.name) f.name = opts.name;
    this._add(f);
    return this;
  };
  // flatPattern({ fixedFace: [x, y, z], grain: { at: [x, y, z], dir: [x, y, z] } }) (lane DK2): Flat-Pattern1's Fixed face
  // (a point on a flat face of the folded part) and Grain direction (a point on a straight edge and its direction):
  // model.flatFixed / model.flatGrain, read by Kernel.flatPattern. A key left out (or null) clears that option.
  // Lane flatopts: mergeFaces / simplifyBends / showSlit / cornerTreatment (booleans, Kernel.FLAT_OPTION_DEFAULTS) go to
  // model.flatOptions, only those that differ from the default (left out = the default).
  Builder.prototype.flatPattern = function (opts) {
    opts = opts || {};
    function pt(p) { if (!p || p.length !== 3 || !p.every(function (x) { return isFinite(+x); })) throw new Error('flatPattern: points are [x, y, z].'); return [+p[0], +p[1], +p[2]]; }
    if (opts.fixedFace) this.model.flatFixed = pt(opts.fixedFace); else delete this.model.flatFixed;
    if (opts.grain) {
      var d = pt(opts.grain.dir);
      if (!(Math.hypot(d[0], d[1], d[2]) > 0)) throw new Error('flatPattern: grain dir must not be zero.');
      this.model.flatGrain = { at: pt(opts.grain.at), dir: d };
    } else delete this.model.flatGrain;
    var defs = K.FLAT_OPTION_DEFAULTS || {}, fo = {};
    Object.keys(defs).forEach(function (k) { if (opts[k] != null && !!opts[k] !== defs[k]) fo[k] = !!opts[k]; });
    if (Object.keys(fo).length) this.model.flatOptions = fo; else delete this.model.flatOptions;
    return this;
  };
  // unfold(fixedFace, bends, opts) / fold(bends, opts): Sheet Metal > Unfold / Fold (kernel-sheetmetal.js, lane DB).
  // fixedFace: [x, y, z] on a flat face of the sheet that stays put (null: the flat pattern's base face); bends:
  // [[x, y, z] on a bend (folded state), ...] or null / [] / 'all' for every bend (Collect All Bends); a Fold with no
  // bends folds back every bend its Unfold unfolded. opts: name
  function ufPts(list) { return list === 'all' || !list ? [] : list.map(function (p) { return [+p[0], +p[1], +p[2]]; }); }
  Builder.prototype.unfold = function (fixedFace, bends, opts) {
    opts = opts || {};
    this._add({ type: 'unfold', fixedFace: fixedFace ? [+fixedFace[0], +fixedFace[1], +fixedFace[2]] : null, bends: ufPts(bends), name: opts.name });
    return this;
  };
  Builder.prototype.fold = function (bends, opts) {
    opts = opts || {};
    this._add({ type: 'fold', bends: ufPts(bends), name: opts.name });
    return this;
  };
  Builder.prototype.cut = function (depth, opts) {
    opts = Object.assign({}, opts || {}, { cut: true });
    if (depth === 'through' || depth == null) { opts.throughAll = true; depth = 0; }
    return this.extrude(depth, opts);
  };
  Builder.prototype.revolve = function (angle, opts) {
    opts = opts || {};
    bodyOpts(contourOpts(this._add({ type: 'revolve', sketch: this._sketchId(opts), angle: angle == null ? 360 : num(angle), axis: opts.axis == null ? 'y' : opts.axis, reverse: !!opts.reverse, cut: !!opts.cut, name: opts.name }), opts), opts);
    if (opts.axisRef != null) this.model.features[this.model.features.length - 1].axisRef = opts.axisRef;   // lane CZ: about a reference axis
    return this;
  };
  Builder.prototype.revolveCut = function (angle, opts) { return this.revolve(angle, Object.assign({}, opts || {}, { cut: true })); };
  // sweep: profile sketch swept along a path (a sketch id of lines/arcs, or [[x,y,z],...])
  Builder.prototype.sweep = function (opts) {
    opts = opts || {};
    var profile = opts.profile != null ? opts.profile : this.lastSketchId;
    if (profile == null || opts.path == null) throw new Error('sweep needs {profile, path}.');
    bodyOpts(this._add({ type: 'sweep', profile: profile, path: opts.path, cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // loft: blend between two or more sketches, each holding exactly one closed profile
  Builder.prototype.loft = function (sketches, opts) {
    opts = opts || {};
    if (!Array.isArray(sketches) || sketches.length < 2) throw new Error('loft needs an array of at least two sketch ids.');
    bodyOpts(this._add({ type: 'loft', sketches: sketches.slice(), cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // shell: hollow the body with wall thickness t; faces: [[x,y,z], ...] points on the faces to remove (open)
  Builder.prototype.shell = function (t, faces, opts) {
    opts = opts || {};
    this._add({ type: 'shell', thickness: num(t), faces: (faces || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype._srcId = function (opts) {
    var id = opts && opts.feature != null ? opts.feature : this.lastSolidId;
    if (id == null) throw new Error('No feature to pattern. Create a boss or cut first.');
    return id;
  };
  Builder.prototype.linearPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({
      type: 'lpattern', feature: this._srcId(opts), d1: opts.dir || 'x', rev1: !!opts.reverse, s1: num(opts.spacing) || 10, n1: num(opts.count) || 2,
      d2: opts.dir2 || null, rev2: !!opts.reverse2, s2: num(opts.spacing2) || 0, n2: num(opts.count2) || 1, name: opts.name
    }), opts);
    return this;
  };
  Builder.prototype.circularPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'cpattern', feature: this._srcId(opts), axis: opts.axis || 'z', center: opts.center ? opts.center.map(num) : [0, 0, 0], n: num(opts.count) || 4, angle: opts.angle == null ? 360 : num(opts.angle), equal: opts.equal !== false, name: opts.name }), opts);
    if (opts.axisRef != null) this.model.features[this.model.features.length - 1].axisRef = opts.axisRef;   // lane CZ: about a reference axis
    return this;
  };
  Builder.prototype.mirror = function (plane, opts) {
    opts = opts || {};
    var f = { type: 'mirror', plane: plane || 'Right', offset: num(opts.offset) || 0, name: opts.name };
    if (opts.body) f.body = true; else f.feature = this._srcId(opts);
    bodyOpts(this._add(f), opts);
    return this;
  };
  // edges: [[x,y,z], ...] points on (or near) the edges to modify; chain=false disables tangent propagation
  Builder.prototype.chamfer = function (d, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'chamfer', d: num(d), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.fillet = function (r, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'fillet', r: num(r), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.hole = function (planeSpec, x, y, dia, opts) {
    opts = opts || {};
    var s = this.sketch(planeSpec, opts.offset);
    s.circle(x, y, this._value(dia, 'hole diameter') / 2);
    var f = s.end();
    if (opts.depth) f.cut(opts.depth, { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    else f.cut('through', { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.box = function (w, d, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0];
    w = this._value(w, 'box width'); d = this._value(d, 'box depth'); // sketch sizes are numbers; h may stay an equation
    // sketch on Top: u = x, v = -z
    var s = this.sketch('Top', at[1]);
    if (opts.centered) s.centerRect(at[0], -at[2], w, d); else s.rect(at[0], -at[2] - d, w, d);
    s.end().extrude(h, { cut: !!opts.cut, reverse: false, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.cylinder = function (r, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0], axis = opts.axis || 'y';
    r = this._value(r, 'cylinder radius'); // the sketch circle is a number; h may stay an equation
    var s;
    if (axis === 'y') s = this.sketch('Top', at[1]).circle(at[0], -at[2], r);
    else if (axis === 'z') s = this.sketch('Front', at[2]).circle(at[0], at[1], r);
    else s = this.sketch('Right', at[0]).circle(-at[2], at[1], r);
    s.end().extrude(h, { cut: !!opts.cut, reverse: false, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.last = function () { return this.lastId; };

  function SketchBuilder(part, feature) { this.part = part; this.f = feature; }
  SketchBuilder.prototype._e = function (e) { this.f.entities.push(e); return this; };
  // sketch entities hold plain numbers: a value given as an equation ('=T/2') is evaluated against the current
  // variables when the script runs (the entity keeps the number, not the expression)
  SketchBuilder.prototype._v = function (x) { return isExpression(x) ? this.part._value(x, 'sketch value') : +x; };
  SketchBuilder.prototype.line = function (x1, y1, x2, y2) { var s = this; return this._e({ t: 'line', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2) }); };
  SketchBuilder.prototype.rect = function (x, y, w, h) { var s = this; return this._e({ t: 'rect', x: s._v(x), y: s._v(y), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.centerRect = function (cx, cy, w, h) { var s = this; return this._e({ t: 'crect', cx: s._v(cx), cy: s._v(cy), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.circle = function (cx, cy, r) { var s = this; return this._e({ t: 'circle', cx: s._v(cx), cy: s._v(cy), r: s._v(r) }); };
  // r is the corner radius; opts.inscribed (p9-sketch-curves): the polygon's circle is inscribed (it touches the flats,
  // as SolidWorks' Inscribed circle): the shape is the same, its R dimension and the Polygon PM's diameter go to the flats
  SketchBuilder.prototype.polygon = function (cx, cy, r, n, rot, opts) { var s = this, e = { t: 'poly', cx: s._v(cx), cy: s._v(cy), r: s._v(r), n: s._v(n) | 0 || 6, rot: s._v(rot) || 0 }; if (opts && opts.inscribed) e.ins = true; return this._e(e); };
  SketchBuilder.prototype.slot = function (x1, y1, x2, y2, w) { var s = this; return this._e({ t: 'slot', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2), w: s._v(w) }); };
  SketchBuilder.prototype.arc = function (cx, cy, r, a0, a1) { var s = this; return this._e({ t: 'arc', cx: s._v(cx), cy: s._v(cy), r: s._v(r), a0: s._v(a0), a1: s._v(a1) }); };
  // p9-sketch-curves: an arc slot w wide round the centre-line arc (centre, radius r, counter-clockwise a0 -> a1 degrees)
  SketchBuilder.prototype.arcSlot = function (cx, cy, r, a0, a1, w) { var s = this; return this._e({ t: 'aslot', cx: s._v(cx), cy: s._v(cy), r: s._v(r), a0: s._v(a0), a1: s._v(a1), w: s._v(w) }); };
  SketchBuilder.prototype.polyline = function (pts, closed) { var s = this; return this._e({ t: 'polyline', pts: pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }), closed: closed !== false }); };
  SketchBuilder.prototype.point = function (x, y) { var s = this; return this._e({ t: 'point', x: s._v(x), y: s._v(y) }); };
  // spline(points, closed = false, tans?): the curve through the points (see Kernel.splineGeom); tans[i] = [angle°,
  // weight] makes point i tangent-driving. ellipse(cx, cy, rx, ry, rot°); partialEllipse(cx, cy, rx, ry, rot°, a0°, a1°)
  // opts { local: true }: Maintain internal continuity off (each point's tangent from its neighbours only)
  SketchBuilder.prototype.spline = function (pts, closed, tans, opts) {
    var s = this, e = { t: 'spline', pts: pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }) };
    if (closed) e.closed = true;
    if (tans && tans.some(Boolean)) e.tans = pts.map(function (p, i) { var t = tans[i]; return t ? [+t[0], t[1] == null ? 1 : +t[1]].concat(t[2] != null || t[3] != null ? [t[2] == null ? null : +t[2]] : [], t[3] != null ? [+t[3]] : []) : null; });   // rfAK: [angle, weight, weightIn], rfAY: curvature
    if (opts && opts.local) e.local = true;   // rfAK: Maintain internal continuity off
    if (opts && opts.eq) e.eq = JSON.parse(JSON.stringify(opts.eq));   // rfAP: an Equation Driven Curve's equation (SketchSolver.equationPoints)
    if (opts && opts.conic != null) { e.conic = +opts.conic; if (opts.parabola) e.parabola = true; }   // rfAS: a Conic / Parabola (pts: start, shoulder, end)
    return this._e(e);
  };
  // rfAS: conic(start, topVertex, end, rho): SolidWorks' Conic, the rational quadratic from start to end whose end tangents
  // meet at the top vertex; rho in (0, 1) (0.5 a parabola, less an ellipse, more a hyperbola). parabola(start, topVertex,
  // end): the parabola so. Both are splines { pts: [start, shoulder, end], conic: rho } (Kernel.splineGeom).
  SketchBuilder.prototype.conic = function (p0, top, p2, rho) {
    var s = this, A = [s._v(p0[0]), s._v(p0[1])], T = [s._v(top[0]), s._v(top[1])], B = [s._v(p2[0]), s._v(p2[1])], r = rho == null ? 0.5 : +rho;
    if (!(r > 0 && r < 1)) throw new Error('A conic\'s rho is between 0 and 1.');
    var M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], S = [M[0] + r * (T[0] - M[0]), M[1] + r * (T[1] - M[1])];
    return this.spline([A, [Math.round(S[0] * 1e9) / 1e9, Math.round(S[1] * 1e9) / 1e9], B], false, null, { conic: r, parabola: rho == null || this._parabola });
  };
  SketchBuilder.prototype.parabola = function (p0, top, p2) { this._parabola = true; try { return this.conic(p0, top, p2, 0.5); } finally { this._parabola = false; } };
  // rfAH: styleSpline(controlVertices, { degree: 3 | 5 | 7 }?): a Style Spline, one Bézier span shaped by its control
  // polygon (Kernel.splineGeom). Without a degree it is the number of vertices less one; a different degree elevates
  // (exact) or fits (Kernel.bzDegree) the vertices given.
  SketchBuilder.prototype.styleSpline = function (pts, opts) {
    var s = this, P = pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }), deg = opts && opts.degree != null ? +opts.degree : P.length - 1;
    if (P.length < 2) throw new Error('A style spline needs at least two control vertices.');
    if (!(deg >= 1 && deg <= 7 && deg === Math.round(deg))) throw new Error('A style spline is of degree 3, 5 or 7.');
    if (deg !== P.length - 1) P = K.bzDegree(P, deg).map(function (q) { return [Math.round(q[0] * 1e9) / 1e9, Math.round(q[1] * 1e9) / 1e9]; });
    return this._e({ t: 'spline', style: true, pts: P });
  };
  SketchBuilder.prototype.ellipse = function (cx, cy, rx, ry, rot) { var s = this; return this._e({ t: 'ellipse', cx: s._v(cx), cy: s._v(cy), rx: s._v(rx), ry: s._v(ry), rot: s._v(rot || 0) }); };
  SketchBuilder.prototype.partialEllipse = function (cx, cy, rx, ry, rot, a0, a1) { var s = this; return this._e({ t: 'pellipse', cx: s._v(cx), cy: s._v(cy), rx: s._v(rx), ry: s._v(ry), rot: s._v(rot || 0), a0: s._v(a0), a1: s._v(a1) }); };
  // sketch-text: text(x, y, str, opts?) — Sketch Text in Anvil's single-stroke font (Kernel.textLayout): opts { h (letter
  // height; default 3 mm / 0.125 in), rot (degrees), align ('left' | 'center' | 'right'), valign ('baseline' | 'middle' |
  // 'top'), widthFactor (1 = 100 %), spacing (1 = the normal gap), lineSpacing (in letter heights), mode ('stroke': Etch,
  // single-stroke marking, the default | 'outline': Cut, closed outlines strokeWidth wide), strokeWidth, stencil (Cut:
  // islands kept by bridges), bridge (their width; default 0.03 in / 0.8 mm), mirror (Flip horizontal), flipV (Flip
  // vertical), path (a line / arc / spline / ellipse / partial ellipse entity index the baseline follows, or { e, flip, g }) }
  SketchBuilder.prototype.text = function (x, y, str, opts) {
    opts = opts || {};
    var s = this, inch = this.part.model && this.part.model.units === 'in';
    var e = { t: 'text', x: s._v(x), y: s._v(y), str: String(str == null ? '' : str), h: opts.h != null ? s._v(opts.h) : (inch ? 0.125 : 3) };
    if (!(e.h > 0)) throw new Error('Text height must be greater than zero.');
    var CHOICES = { align: ['left', 'center', 'right'], valign: ['baseline', 'middle', 'top'], mode: ['stroke', 'outline'] };
    Object.keys(CHOICES).forEach(function (k) {
      if (opts[k] == null) return;
      if (CHOICES[k].indexOf(opts[k]) < 0) throw new Error('Text ' + k + ' must be one of ' + CHOICES[k].join(', ') + '.');
      e[k] = opts[k];
    });
    if (opts.rot) e.rot = s._v(opts.rot);
    ['widthFactor', 'spacing', 'lineSpacing', 'strokeWidth'].forEach(function (k) { if (opts[k] != null) e[k] = s._v(opts[k]); });
    if (opts.stencil) { e.stencil = true; e.bridge = opts.bridge != null ? s._v(opts.bridge) : (inch ? 0.03 : 0.8); }   // sketch-text2
    if (e.stencil && !(e.bridge > 0)) throw new Error('Stencil bridge width must be greater than zero.');
    if (opts.mirror) e.mirror = true;
    if (opts.flipV) e.flipV = true;
    if (opts.path != null) {
      var p = typeof opts.path === 'object' ? opts.path : { e: opts.path };
      e.path = {};
      if (p.e != null) {
        var src = this.f.entities[p.e | 0];
        if (!src || (K.TEXT_PATH_TYPES || ['line', 'arc']).indexOf(src.t) < 0) throw new Error('Text can follow a sketch line or arc, a spline or an ellipse only (entity ' + p.e + ').');
        e.path.e = p.e | 0;
      }
      if (p.g) e.path.g = JSON.parse(JSON.stringify(p.g));
      if (p.flip) e.path.flip = true;
      if (e.path.e == null && !e.path.g) delete e.path;
    }
    this._e(e);
    if (e.path) K.syncTextPaths(this.f);
    return this;
  };
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
  // sketch-layers: .layers([{ name, color, hidden, noProfile, lineType, aci }, ...]) sets the sketch's layer table (a
  // name given twice keeps the last); .layer(name, [i, ...]) puts entities on a layer ("0": the default layer)
  SketchBuilder.prototype.layers = function (list) {
    var out = [];
    (list || []).forEach(function (l) {
      if (!l || l.name == null || String(l.name) === '' || String(l.name) === '0') return;
      var r = { name: String(l.name) };
      ['color', 'hidden', 'noProfile', 'lineType', 'aci'].forEach(function (k) { if (l[k] != null && l[k] !== false) r[k] = l[k]; });
      out = out.filter(function (o) { return o.name !== r.name; });
      out.push(r);
    });
    if (out.length) this.f.layers = out; else delete this.f.layers;
    return this;
  };
  SketchBuilder.prototype.layer = function (name, list) {
    var self = this;
    (Array.isArray(list) ? list : [list]).forEach(function (i) {
      var e = self.f.entities[i];
      if (!e) throw new Error('No sketch entity ' + i + ' to put on a layer.');
      if (name == null || String(name) === '' || String(name) === '0') delete e.layer; else e.layer = String(name);
    });
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

  SketchBuilder.prototype.sketchedBend = function (a, opts) { return this.part.sketchedBend(a, Object.assign({}, opts || {}, { sketch: this.f.id })); };
  SketchBuilder.prototype.miterFlange = function (edges, opts) { return this.part.miterFlange(edges, Object.assign({}, opts || {}, { sketch: this.f.id })); };   // lane DL
  SketchBuilder.prototype.vent = function (opts) { return this.part.vent(Object.assign({}, opts || {}, { sketch: this.f.id })); };   // lane DT
  SketchBuilder.prototype.crossBreak = function (face, opts) { return this.part.crossBreak(face, Object.assign({}, opts || {}, { sketch: this.f.id })); };   // lane cross-break
  SketchBuilder.prototype.jog = function (offset, opts) { return this.part._sketchJog(offset, Object.assign({}, opts || {}, { sketch: this.f.id })); };   // lane DC

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('p', 'part', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  // sketch-text: the .text() options of a text entity (only what differs from the defaults; a path keeps its geometry so
  // a text whose curve was deleted stays where it was)
  function textOptsOut(e) {
    var o = { h: e.h };
    ['rot', 'align', 'valign', 'widthFactor', 'spacing', 'lineSpacing', 'mode', 'strokeWidth'].forEach(function (k) { if (e[k] != null && e[k] !== 0 && e[k] !== '') o[k] = e[k]; });
    if (e.stencil) { o.stencil = true; if (e.bridge != null) o.bridge = e.bridge; }   // sketch-text2
    if (e.mirror) o.mirror = true;
    if (e.flipV) o.flipV = true;
    if (e.path) { o.path = {}; if (e.path.e != null) o.path.e = e.path.e; if (e.path.g) o.path.g = e.path.g; if (e.path.flip) o.path.flip = true; }
    return o;
  }
  // Regenerate a script from a model so the two representations stay interchangeable.
  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil', 'p.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units) + ');'];
    if (Array.isArray(model.levels) && model.levels.length) out.push('p.levels(' + JSON.stringify(model.levels) + (model.mainLevel != null ? ', ' + JSON.stringify(model.mainLevel) : '') + ');');
    var dpr = model.dimPrecision;   // rfIF: written only when the part has its own
    if (dpr && (dpr.linear != null || dpr.angular != null)) out.push('p.dimPrecision(' + JSON.stringify({ linear: dpr.linear, angular: dpr.angular }) + ');');
    scriptSections.forEach(function (sec) { if (sec.head) out = out.concat(sec.head(model) || []); });
    // equations first, so every "=" field below resolves against them; the array form keeps each expr string exactly
    if (Array.isArray(model.equations) && model.equations.length) out.push('p.equations(' + JSON.stringify(model.equations) + ');');
    // configurations right after, so a box/hole size given as "=..." is evaluated with the active set as the model had it
    if (Array.isArray(model.configurations) && model.configurations.length) {
      out.push('p.configurations(' + JSON.stringify(model.configurations, function (k, x) { return k === 'suppressed' ? undefined : x; }) + ');');   // rfFC: states by script variable, after the features
      if (model.activeConfiguration != null && findConfiguration(model, model.activeConfiguration)) out.push('p.activeConfiguration(' + JSON.stringify(String(model.activeConfiguration)) + ');');
    }
    if (model.sheet) {
      // a sheet without a stored K (made before bend deductions existed) is written with the K its flat always used
      var sh = model.sheet, so = {};
      if (sh.bendAllowanceType && sh.bendAllowanceType !== 'kfactor') so.bendAllowanceType = sh.bendAllowanceType;
      if (sh.bendAllowance != null) so.bendAllowance = numOut(sh.bendAllowance);
      if (sh.bendDeduction != null) so.bendDeduction = numOut(sh.bendDeduction);
      if (sh.bendTable) so.bendTable = sh.bendTable;
      if (sh.gaugeTable != null && sh.gauge != null) { so.gaugeTable = sh.gaugeTable; so.gauge = sh.gauge; }
      if (sh.relief) { so.relief = sh.relief; so.reliefRatio = numOut(sh.reliefRatio); }
      out.push('p.sheet(' + nv(sh.thickness) + ', ' + nv(sh.bendRadius) + ', ' + nv(sh.kFactor != null && sh.kFactor !== '' ? sh.kFactor : K.LEGACY_K_FACTOR) + (Object.keys(so).length ? ', ' + optsStr(so) : '') + ');');
    }
    var idVar = {};
    model.features.forEach(function (f) {
      var v = 'f' + f.id;
      idVar[f.id] = v;
      switch (f.type) {
        case 'plane':
          out.push('var ' + v + ' = p.plane(' + JSON.stringify(f.ref) + ', ' + nv(f.offset) + ', ' + JSON.stringify(f.name) + ');');
          break;
        case 'refaxis':   // lane CZ: reference geometry
          out.push('var ' + v + ' = p.axis(' + JSON.stringify(f.kind || 'line') + ', [' + (f.refs || []).map(function (r) { return refOut(r, idVar); }).join(', ') + '], ' + optsStr({ name: f.name }) + ');');
          break;
        case 'refpoint': {
          var po = { name: f.name };
          if (f.distance != null) po.distance = numOut(f.distance);
          if (f.percent) po.percent = true;
          if (f.reverse) po.reverse = true;
          out.push('var ' + v + ' = p.point(' + JSON.stringify(f.kind || 'on') + ', [' + (f.refs || []).map(function (r) { return refOut(r, idVar); }).join(', ') + '], ' + optsStr(po) + ');');
          break;
        }
        case 'csys': {
          var co = { name: f.name };
          ['origin', 'x', 'y', 'z'].forEach(function (k) { if (f[k]) co[k] = '@' + refOut(f[k], idVar); });
          ['flipX', 'flipY', 'flipZ'].forEach(function (k) { if (f[k]) co[k] = true; });
          out.push('var ' + v + ' = p.csys(' + optsStr(co) + ');');
          break;
        }
        case 'sketch': {
          var pl = f.plane || {};
          // r10/facesketch10: a face reference names its feature by the script variable (ids are renumbered)
          var plj = pl.custom && pl.face ? JSON.stringify(pl, function (k, x) { return k === 'face' ? undefined : x; }) : null;
          if (plj && idVar[pl.face.feature]) plj = plj.slice(0, -1) + ',"face":' + JSON.stringify(faceCopy(pl.face, { feature: 0 })).replace('"feature":0', '"feature":' + idVar[pl.face.feature]) + '}';
          var spec = plj ? plj : pl.custom ? JSON.stringify(pl) : (pl.featureId != null ? idVar[pl.featureId] : JSON.stringify(pl.ref || 'Front') + ', ' + nv(pl.offset || 0));
          var s = 'var ' + v + ' = p.sketch(' + spec + (pl.custom || pl.featureId != null ? ', 0' : '') + ', ' + JSON.stringify(f.name) + ')';
          f.entities.forEach(function (e) {
            switch (e.t) {
              case 'line': s += '\n  .line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')'; break;
              case 'rect': s += '\n  .rect(' + [e.x, e.y, e.w, e.h].join(', ') + ')'; break;
              case 'crect': s += '\n  .centerRect(' + [e.cx, e.cy, e.w, e.h].join(', ') + ')'; break;
              case 'circle': s += '\n  .circle(' + [e.cx, e.cy, e.r].join(', ') + ')'; break;
              case 'poly': s += '\n  .polygon(' + [e.cx, e.cy, e.r, e.n, e.rot || 0].join(', ') + (e.ins ? ', { inscribed: true }' : '') + ')'; break;
              case 'slot': s += '\n  .slot(' + [e.x1, e.y1, e.x2, e.y2, e.w].join(', ') + ')'; break;
              case 'arc': s += '\n  .arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; break;
              case 'aslot': s += '\n  .arcSlot(' + [e.cx, e.cy, e.r, e.a0, e.a1, e.w].join(', ') + ')'; break;
              case 'polyline': s += '\n  .polyline(' + JSON.stringify(e.pts) + ', ' + !!e.closed + ')'; break;
              case 'point': s += '\n  .point(' + e.x + ', ' + e.y + ')'; break;
              case 'spline': if (e.style) { s += '\n  .styleSpline(' + JSON.stringify(e.pts) + ', { degree: ' + (e.pts.length - 1) + ' })'; break; }   // rfAH
                var spo = (e.local ? ['local: true'] : []).concat(e.eq ? ['eq: ' + JSON.stringify(e.eq)] : []);   // rfAP: an Equation Driven Curve keeps its equation
                if (e.conic != null) spo.push('conic: ' + e.conic + (e.parabola ? ', parabola: true' : ''));   // rfAS: a Conic / Parabola
                s += '\n  .spline(' + JSON.stringify(e.pts) + ', ' + !!e.closed + (e.tans && e.tans.some(Boolean) ? ', ' + JSON.stringify(e.tans) : spo.length ? ', null' : '') + (spo.length ? ', { ' + spo.join(', ') + ' }' : '') + ')'; break;
              case 'ellipse': s += '\n  .ellipse(' + [e.cx, e.cy, e.rx, e.ry, e.rot || 0].join(', ') + ')'; break;
              case 'pellipse': s += '\n  .partialEllipse(' + [e.cx, e.cy, e.rx, e.ry, e.rot || 0, e.a0, e.a1].join(', ') + ')'; break;
              case 'text': s += '\n  .text(' + [e.x, e.y, JSON.stringify(String(e.str == null ? '' : e.str))].join(', ') + ', ' + JSON.stringify(textOptsOut(e)) + ')'; break;   // sketch-text
            }
          });
          (f.dims || []).forEach(function (d) {
            var o = {};
            if (d.i != null) o.i = d.i;
            if (d.off != null) o.off = Math.round(d.off * 1e4) / 1e4;
            if (d.ang != null) o.ang = Math.round(d.ang * 1e4) / 1e4;
            s += '\n  .dim(' + d.e + ', ' + JSON.stringify(d.k) + (Object.keys(o).length ? ', ' + optsStr(o) : '') + ')';
          });
          // sketch-layers: the layer table, then the entities on each layer
          if (Array.isArray(f.layers) && f.layers.length) s += '\n  .layers(' + JSON.stringify(f.layers) + ')';
          var onLayer = {};
          f.entities.forEach(function (e, i) { if (e.layer != null && e.layer !== '' && e.layer !== '0') (onLayer[e.layer] = onLayer[e.layer] || []).push(i); });
          Object.keys(onLayer).forEach(function (n) { s += '\n  .layer(' + JSON.stringify(n) + ', ' + JSON.stringify(onLayer[n]) + ')'; });
          sketchScripts.forEach(function (fn) { s += fn(f) || ''; });
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
          if (f.cut && f.normalCut) o.normalCut = true;
          if (f.cut && f.linkT) o.linkT = true;   // lane DC
          if (f.tab && !f.cut) {   // lane DI: Tab
            var to = { sketch: o.sketch, name: f.name };
            if (f.reverse) to.reverse = true;
            out.push('var ' + v + ' = p.tab(' + optsStr(contoursOut(to, f)) + ').last();');
            break;
          }
          out.push('var ' + v + ' = p.' + (f.cut ? 'cut' : 'extrude') + '(' + nv(f.depth) + ', ' + optsStr(bodyOptsOut(contoursOut(o, f), f)) + ').last();');
          break;
        }
        default:
          if (featureTypes[f.type] && featureTypes[f.type].script) out.push(featureTypes[f.type].script(f, v, idVar, optsStr));
          break;
        case 'flange': {
          var fspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          if (f.miterFlange && f.sketch != null) {   // lane DL: Miter Flange from a profile sketch
            var mfo = { sketch: '@' + idVar[f.sketch], name: f.name };
            if (f.position && f.position !== 'inside') mfo.position = f.position;
            if (f.radius != null) mfo.radius = numOut(f.radius);
            if (f.miterGap != null) mfo.miterGap = numOut(f.miterGap);
            if (f.startOffset != null && (isExpression(f.startOffset) || +f.startOffset !== 0)) mfo.startOffset = numOut(f.startOffset);
            if (f.endOffset != null && (isExpression(f.endOffset) || +f.endOffset !== 0)) mfo.endOffset = numOut(f.endOffset);
            if (f.relief) mfo.relief = f.relief;
            if (f.reliefWidth != null) mfo.reliefWidth = numOut(f.reliefWidth);
            if (f.reliefDepth != null) mfo.reliefDepth = numOut(f.reliefDepth);
            if (f.trimSideBends) mfo.trimSideBends = true;   // lane smtrim
            if (f.bendAllowance) mfo.bendAllowance = bendAllowanceOut(f.bendAllowance);
            out.push('var ' + v + ' = p.miterFlange(' + fspecs + ', ' + optsStr(mfo) + ').last();');
            break;
          }
          var fo = { angle: f.angle, name: f.name };
          if (f.reverse) fo.reverse = true;
          if (f.radius != null) fo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') fo.position = f.position;
          if (f.lengthRef != null) fo.lengthRef = f.lengthRef;
          if (f.toward) fo.toward = f.toward.map(function (x) { return isExpression(x) ? x : Math.round(x * 1e4) / 1e4; });
          if (f.miter) fo.miter = true;
          if (f.miterGap != null && (isExpression(f.miterGap) || +f.miterGap !== 0)) fo.miterGap = numOut(f.miterGap);
          if (f.relief && (f.relief !== 'none' || (model.sheet && model.sheet.relief))) fo.relief = f.relief;   // 'none' matters only against an Auto Relief
          if (f.reliefWidth != null) fo.reliefWidth = numOut(f.reliefWidth);
          if (f.reliefDepth != null) fo.reliefDepth = numOut(f.reliefDepth);
          if (f.reliefRatio != null) fo.reliefRatio = numOut(f.reliefRatio);
          if (f.lengthEnd === 'upToVertex') { fo.lengthEnd = 'upToVertex'; fo.lengthVertex = f.lengthVertex; if (f.lengthVertexMode) fo.lengthVertexMode = f.lengthVertexMode; }
          if (f.offset != null) fo.offset = numOut(typeof f.offset === 'object' ? f.offset.distance : f.offset);
          if (f.trimSideBends && !f.hem) fo.trimSideBends = true;   // lane smtrim
          if (f.bendAllowance) fo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          if (f.hem) {
            var ho = !f.hemType || f.hemType === 'open' ? { gap: f.gap != null ? numOut(f.gap) : Math.round(f.radius * 2 * 1e4) / 1e4, name: f.name } : { name: f.name };
            if (f.hemType) ho.hemType = f.hemType;
            if (f.hemPosition) ho.hemPosition = f.hemPosition;
            if (f.hemRadius != null) ho.hemRadius = numOut(f.hemRadius);
            if (f.hemAngle != null) ho.hemAngle = numOut(f.hemAngle);
            if (f.reverse) ho.reverse = true;
            if (f.miter) { ho.miter = true; if (f.miterGap != null) ho.miterGap = numOut(f.miterGap); }
            ['relief', 'reliefWidth', 'reliefDepth', 'reliefRatio'].forEach(function (k) { if (fo[k] != null) ho[k] = fo[k]; });
            if (f.bendAllowance) ho.bendAllowance = bendAllowanceOut(f.bendAllowance);
            out.push('var ' + v + ' = p.hem(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(ho) + ').last();');
          } else out.push('var ' + v + ' = p.flange(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(fo) + ').last();');
          break;
        }
        case 'jog': {
          if (f.sketch != null) {   // lane DC: Jog from a sketch line
            var sjo = { sketch: '@' + idVar[f.sketch], name: f.name };
            if (f.offsetRef && f.offsetRef !== 'outside') sjo.offsetRef = f.offsetRef;
            if (f.angle != null && (isExpression(f.angle) || +f.angle !== 90)) sjo.angle = numOut(f.angle);
            if (f.position && f.position !== 'centerline') sjo.position = f.position;
            if (f.fixed) sjo.fixed = f.fixed.map(function (x) { return Math.round(x * 1e4) / 1e4; });
            if (f.reverse) sjo.reverse = true;
            if (f.radius != null) sjo.radius = numOut(f.radius);
            if (f.bendAllowance) sjo.bendAllowance = bendAllowanceOut(f.bendAllowance);
            if (f.fixLength) sjo.fixLength = true;   // lane DK2
            if (f.offsetEnd && f.offsetEnd !== 'blind') {   // lane dxfout-2: Up To Vertex / Up To Surface / Offset From Surface
              sjo.offsetEnd = f.offsetEnd;
              sjo.offsetTarget = Array.isArray(f.offsetTarget) ? f.offsetTarget.map(function (x) { return Math.round(x * 1e6) / 1e6; }) : typeof f.offsetTarget === 'number' && idVar[f.offsetTarget] ? '@' + idVar[f.offsetTarget] : f.offsetTarget;
              if (f.offsetEnd === 'offsetFromSurface') { sjo.offsetDistance = numOut(f.offsetDistance || 0); if (f.offsetFlip) sjo.offsetFlip = true; }
            }
            out.push('var ' + v + ' = p.jog(' + (f.offset == null ? 'null' : nv(f.offset)) + ', ' + optsStr(sjo) + ').last();');
            break;
          }
          var jspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var jo = { angle: f.angle, name: f.name };
          if (f.reverse) jo.reverse = true;
          if (f.radius != null) jo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') jo.position = f.position;
          if (f.bendAllowance) jo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          out.push('var ' + v + ' = p.jog(' + nv(f.height) + ', ' + nv(f.length) + ', ' + jspecs + ', ' + optsStr(jo) + ').last();');
          break;
        }
        case 'sketchedBend': {
          var sbo = { sketch: '@' + idVar[f.sketch], name: f.name };
          if (f.fixed) sbo.fixed = f.fixed.map(function (x) { return Math.round(x * 1e4) / 1e4; });
          if (f.position && f.position !== 'centerline') sbo.position = f.position;
          if (f.reverse) sbo.reverse = true;
          if (f.radius != null) sbo.radius = numOut(f.radius);
          if (f.bendAllowance) sbo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          out.push('var ' + v + ' = p.sketchedBend(' + nv(f.angle == null ? 90 : f.angle) + ', ' + optsStr(sbo) + ').last();');
          break;
        }
        case 'unfold':
        case 'fold': {
          // lane DB
          var ufr = function (q) { return q.map(function (x) { return Math.round(x * 1e4) / 1e4; }); };
          var ufb = f.bends && f.bends.length ? JSON.stringify(f.bends.map(ufr)) : 'null';
          if (f.type === 'unfold') out.push('var ' + v + ' = p.unfold(' + (f.fixedFace ? JSON.stringify(ufr(f.fixedFace)) : 'null') + ', ' + ufb + ', ' + optsStr({ name: f.name }) + ').last();');
          else out.push('var ' + v + ' = p.fold(' + ufb + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'closedCorner': {
          var cco = { cornerType: f.cornerType || 'butt' };
          if (f.gap != null) cco.gap = numOut(f.gap);
          if (f.ratio != null && +f.ratio !== 1) cco.ratio = numOut(f.ratio);
          if (f.closeBend) cco.closeBend = true;   // lane DK2
          cco.name = f.name;
          var ccs = optsStr(cco);
          if (f.coplanar === false) ccs = ccs.replace(/^\{ /, '{ coplanar: false, ');   // optsStr drops false values
          out.push('var ' + v + ' = p.closedCorner(' + JSON.stringify((f.faces || []).map(function (q) { return q.map(function (x) { return Math.round(x * 1e4) / 1e4; }); })) + ', ' + ccs + ').last();');
          break;
        }
        case 'insertBends':
        case 'convertSM': {
          if (f.openBase) {   // lane open-base: the Base Flange from an open profile
            var obo = { sketch: '@' + idVar[f.sketch], depth: numOut(f.depth), name: f.name };
            if (f.end === 'mid') obo.midplane = true;
            if (f.reverse) obo.reverse = true;
            if (f.flip) obo.flip = true;
            if (f.radius != null) obo.radius = numOut(f.radius);
            out.push('var ' + v + ' = p.baseFlange(null, ' + optsStr(obo) + ').last();');
            break;
          }
          // lane DQ: the sheet (T, R, K) is the p.sheet(...) line at the top
          var ibr = function (q) { return q.map(function (x) { return Math.round(x * 1e4) / 1e4; }); };
          var ibo = {};
          if (f.type === 'convertSM' && f.ripEdges && f.ripEdges.length) ibo.ripEdges = f.ripEdges.map(ibr);
          if (f.type === 'convertSM' && f.gap != null) ibo.gap = numOut(f.gap);
          if (f.autoRelief && f.autoRelief !== 'rect') ibo.autoRelief = f.autoRelief;
          if (f.type === 'convertSM' && f.reverse) ibo.reverse = true;
          ibo.name = f.name;
          if (f.type === 'insertBends') out.push('var ' + v + ' = p.insertBends(' + JSON.stringify(ibr(f.fixedFace)) + ', ' + optsStr(ibo) + ').last();');
          else out.push('var ' + v + ' = p.convertSheetMetal(' + JSON.stringify(ibr(f.fixedFace)) + ', ' + JSON.stringify((f.bendEdges || []).map(ibr)) + ', ' + optsStr(ibo) + ').last();');
          break;
        }
        case 'revolve': {
          var ro = { sketch: '@' + idVar[f.sketch], name: f.name, axis: f.axis };
          if (f.axisRef != null && idVar[f.axisRef]) ro.axisRef = '@' + idVar[f.axisRef];   // lane CZ
          if (f.reverse) ro.reverse = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'revolveCut' : 'revolve') + '(' + nv(f.angle) + ', ' + optsStr(bodyOptsOut(contoursOut(ro, f), f)) + ').last();');
          break;
        }
        case 'lpattern': {
          var lo = { feature: '@' + idVar[f.feature], dir: f.d1, spacing: f.s1, count: f.n1, name: f.name };
          if (f.rev1) lo.reverse = true;
          if (f.d2) { lo.dir2 = f.d2; lo.spacing2 = f.s2; lo.count2 = f.n2; if (f.rev2) lo.reverse2 = true; }
          out.push('var ' + v + ' = p.linearPattern(' + optsStr(bodyOptsOut(lo, f)) + ').last();');
          break;
        }
        case 'cpattern':
          out.push('var ' + v + ' = p.circularPattern(' + optsStr(bodyOptsOut({ feature: '@' + idVar[f.feature], axis: f.axis, center: f.center, count: f.n, angle: f.angle, equal: f.equal !== false, axisRef: f.axisRef != null && idVar[f.axisRef] ? '@' + idVar[f.axisRef] : null, name: f.name }, f)) + ').last();');
          break;
        case 'mirror': {
          var mo = { name: f.name, offset: f.offset || 0 };
          if (f.body) mo.body = true; else mo.feature = '@' + idVar[f.feature];
          out.push('var ' + v + ' = p.mirror(' + JSON.stringify(f.plane) + ', ' + optsStr(bodyOptsOut(mo, f)) + ').last();');
          break;
        }
        case 'sweep': {
          var so = { profile: '@' + idVar[f.profile], path: Array.isArray(f.path) ? f.path : '@' + idVar[f.path], name: f.name };
          if (f.cut) so.cut = true;
          out.push('var ' + v + ' = p.sweep(' + optsStr(bodyOptsOut(so, f)) + ').last();');
          break;
        }
        case 'loft': {
          var lo2 = { name: f.name };
          if (f.cut) lo2.cut = true;
          out.push('var ' + v + ' = p.loft([' + f.sketches.map(function (id) { return idVar[id]; }).join(', ') + '], ' + optsStr(bodyOptsOut(lo2, f)) + ').last();');
          break;
        }
        case 'boundary': out.push(boundaryScript(f, v, idVar)); break;   // rfFB
        case 'chamfer':
        case 'fillet': {
          var specs = JSON.stringify((f.edges || []).map(function (e) { return { at: e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), chain: e.chain !== false }; }));
          out.push('var ' + v + ' = p.' + f.type + '(' + nv(f.type === 'chamfer' ? f.d : f.r) + ', ' + specs + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'draft': out.push('var ' + v + ' = p.draft(' + nv(f.angle) + ', ' + refOut(f.neutral, idVar) + ', ' + JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); })) + ', ' + optsStr({ reverse: !!f.reverse, propagate: f.propagate === 'tangent' ? 'tangent' : undefined, name: f.name }) + ').last();'); break;   // rfDX
        case 'shell': {
          var fspecs2 = JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          out.push('var ' + v + ' = p.shell(' + nv(f.thickness) + ', ' + fspecs2 + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
      }
    });
    // lane DK2: Flat-Pattern1's options, after the features
    var fdefs = K.FLAT_OPTION_DEFAULTS || {}, fopts = Object.keys(fdefs).filter(function (k) { return model.flatOptions && model.flatOptions[k] != null && !!model.flatOptions[k] !== fdefs[k]; });
    if (model.flatFixed || (model.flatGrain && model.flatGrain.at && model.flatGrain.dir) || fopts.length) {
      var r6 = function (q) { return q.map(function (x) { return Math.round(x * 1e6) / 1e6; }); }, fpo = {};
      if (model.flatFixed) fpo.fixedFace = r6(model.flatFixed);
      if (model.flatGrain && model.flatGrain.at && model.flatGrain.dir) fpo.grain = { at: r6(model.flatGrain.at), dir: r6(model.flatGrain.dir) };
      fopts.forEach(function (k) { fpo[k] = !!model.flatOptions[k]; });   // lane flatopts
      out.push('p.flatPattern(' + JSON.stringify(fpo) + ');');
    }
    out = out.concat(suppressScript(model, idVar));   // rfFC
    var tail = [];
    scriptSections.forEach(function (sec) { if (sec.tail) tail = tail.concat(sec.tail(model, idVar) || []); });
    return out.join('\n') + (tail.length ? '\n' + tail.join('\n') + '\n' : '');
  }
  // The multi-body fields of a feature, added to its emitted opts: `merge: false` on a boss kept separate, `bodies`
  // on a scoped cut. Nothing is emitted for the defaults, so an ordinary part's script reads as before.
  // nv(x): a numeric argument as script text, an equation ('=T*2') as its quoted string
  function nv(x) { return isExpression(x) ? JSON.stringify(x) : String(x); }
  // numOut(x): an option value, a number or the equation string untouched (optsStr quotes strings)
  function numOut(x) { return isExpression(x) ? x : +x; }
  function bendAllowanceOut(c) { var o = { type: c.type }; if (c.value != null) o.value = numOut(c.value); return o; }
  function bodyOptsOut(o, f) {
    if (f.merge === false) o.merge = false;
    if (Array.isArray(f.bodies) && f.bodies.length) o.bodies = f.bodies.slice();
    return o;
  }
  // lane CZ: a reference-geometry ref as script text: feature ids become their variables, picked points 1e-4
  function refOut(r, idVar) {
    var parts = [];
    Object.keys(r || {}).forEach(function (k) {
      var x = r[k];
      if ((k === 'plane' || k === 'axis' || k === 'point' || k === 'sketch') && typeof x === 'number' && idVar[x]) parts.push(k + ': ' + idVar[x]);
      else if (Array.isArray(x)) parts.push(k + ': ' + JSON.stringify(x.map(function (c) { return Math.round(c * 1e4) / 1e4; })));
      else parts.push(k + ': ' + JSON.stringify(x));
    });
    return '{ ' + parts.join(', ') + ' }';
  }
  function optsStr(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || (v === false && k !== 'merge')) return;
      if (typeof v === 'string' && v.charAt(0) === '@') parts.push(k + ': ' + v.slice(1));
      else parts.push(k + ': ' + JSON.stringify(v));
    });
    return '{ ' + parts.join(', ') + ' }';
  }

  // ------------------------------------------------------------------ rfFC: Suppress / Unsuppress in scripts
  // p.suppress(ref, configs?) / p.unsuppress(ref, configs?): ref = a feature id (a script variable), its name, or a
  // list of them; configs omitted = every configuration (f.suppressed), 'this' = the active one, a name or [names] =
  // those configurations (Kernel.setSuppressed). Children follow at rebuild (Kernel.suppressedIds).
  function suppressIds(model, ref) {
    return (Array.isArray(ref) ? ref : [ref]).map(function (r) {
      var f = typeof r === 'number' ? K.findFeature(model, r) : null;
      if (!f) for (var i = 0; i < model.features.length; i++) if (model.features[i].name === String(r)) { f = model.features[i]; break; }
      if (!f) throw new Error('suppress: no feature "' + r + '"');
      return f.id;
    });
  }
  function suppressScope(model, configs) {
    if (configs == null || configs === 'all' || configs === 'this') return configs;
    (Array.isArray(configs) ? configs : [configs]).forEach(function (n) { if (!findConfiguration(model, n)) throw new Error('suppress: no configuration named "' + n + '"'); });
    return configs;
  }
  // rfFC2: as the UI (Kernel.suppressWithChildren): Suppress also suppresses the children (by id and by picks on the
  // feature's faces: a fillet on a hole's edge); Unsuppress also the suppressed features it needs, opts { dependents:
  // true } its children too. opts { exact: true } sets just the listed features (what generateScript writes, so a round
  // trip never rebuilds).
  function setSuppress(b, ref, configs, opts, on) {
    var ids = suppressIds(b.model, ref), sc = suppressScope(b.model, configs);
    if (opts && opts.exact) K.setSuppressed(b.model, ids, on, sc);
    else K.suppressWithChildren(b.model, ids, on, sc, opts);
    return b;
  }
  Builder.prototype.suppress = function (ref, configs, opts) { return setSuppress(this, ref, configs, opts, true); };
  Builder.prototype.unsuppress = function (ref, configs, opts) { return setSuppress(this, ref, configs, opts, false); };
  // the script lines that give every feature its suppression state: p.suppress(fN) for f.suppressed, then one line per
  // configuration override (by configuration name and script variable, since ids are renumbered)
  function suppressScript(model, idVar) {
    var out = [];
    var all = model.features.filter(function (f) { return f.suppressed && idVar[f.id]; }).map(function (f) { return idVar[f.id]; });
    if (all.length) out.push('p.suppress([' + all.join(', ') + '], null, { exact: true });');
    (Array.isArray(model.configurations) ? model.configurations : []).forEach(function (c) {
      if (!c || c.name == null || !c.suppressed) return;
      var on = [], off = [];
      Object.keys(c.suppressed).forEach(function (id) { var v = idVar[+id]; if (v) (c.suppressed[id] ? on : off).push(v); });
      if (on.length) out.push('p.suppress([' + on.join(', ') + '], [' + JSON.stringify(String(c.name)) + '], { exact: true });');
      if (off.length) out.push('p.unsuppress([' + off.join(', ') + '], [' + JSON.stringify(String(c.name)) + '], { exact: true });');
    });
    return out;
  }
  // rfFB: Boundary Boss/Base and Boundary Cut (kernel-features.js buildBoundary)
  //   p.boundary([s1, s2, …], { dir2: [sketch | { sketch, entity } | { pts: [[x,y,z], …] }], cut, tangency1: { start, end },
  //     tangency2, close, mergeTangent, thin: { t, mid, reverse }, name, merge, bodies })
  //   p.boundary({ dir1: [...], dir2: [...], … }) and p.boundaryCut(dir1, opts) work too.
  Builder.prototype.boundary = function (dir1, opts) {
    if (dir1 && !Array.isArray(dir1) && typeof dir1 === 'object') { opts = dir1; dir1 = opts.dir1; }
    opts = opts || {};
    if (!Array.isArray(dir1) || dir1.length < 2) throw new Error('boundary needs an array of at least two Direction 1 sketch ids.');
    var f = { type: 'boundary', dir1: dir1.slice(), dir2: (opts.dir2 || []).map(function (c) { return c && typeof c === 'object' ? JSON.parse(JSON.stringify(c)) : c; }), cut: !!opts.cut, name: opts.name };
    ['tangency1', 'tangency2'].forEach(function (k) { if (opts[k]) f[k] = { start: opts[k].start || 'none', end: opts[k].end || 'none' }; });
    if (opts.close) f.close = true;
    if (opts.mergeTangent === false) f.mergeTangent = false;
    if (opts.thin) f.thin = { t: num(opts.thin.t != null ? opts.thin.t : opts.thin), mid: !!opts.thin.mid, reverse: !!opts.thin.reverse };
    bodyOpts(this._add(f), opts);
    return this;
  };
  Builder.prototype.boundaryCut = function (dir1, opts) {
    if (dir1 && !Array.isArray(dir1) && typeof dir1 === 'object') { opts = dir1; dir1 = opts.dir1; }
    return this.boundary(dir1, Object.assign({}, opts || {}, { cut: true }));
  };
  function boundaryScript(f, v, idVar) {
    function ref(c) {
      if (c && typeof c === 'object') {
        if (Array.isArray(c.pts)) return '{ pts: ' + JSON.stringify(c.pts.map(function (p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); })) + ' }';
        return '{ sketch: ' + (idVar[c.sketch] || c.sketch) + (c.entity != null ? ', entity: ' + (c.entity | 0) : '') + ' }';
      }
      return idVar[c] || String(c);
    }
    var o = { dir2: (f.dir2 || []).length ? '@[' + f.dir2.map(ref).join(', ') + ']' : null, name: f.name };
    if (f.cut) o.cut = true;
    ['tangency1', 'tangency2'].forEach(function (k) { var t = f[k]; if (t && ((t.start && t.start !== 'none') || (t.end && t.end !== 'none'))) o[k] = { start: t.start || 'none', end: t.end || 'none' }; });
    if (f.close) o.close = true;
    if (f.mergeTangent === false) o.mergeTangent = '@false';   // optsStr drops plain false values
    if (f.thin && (isExpression(f.thin.t) || +f.thin.t > 0)) { var th = { t: numOut(f.thin.t) }; if (f.thin.mid) th.mid = true; if (f.thin.reverse) th.reverse = true; o.thin = th; }
    return 'var ' + v + ' = p.boundary([' + (f.dir1 || []).map(function (id) { return idVar[id] || String(id); }).join(', ') + '], ' + optsStr(bodyOptsOut(o, f)) + ').last();';
  }
  _.boundaryScript = boundaryScript;


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.exportSTL = exportSTL; K.exportDXFSketch = exportDXFSketch; K.exportDXFFace = exportDXFFace; K.exportDXFFlat = exportDXFFlat;
  // rfDX: p.draft(angle, neutral, faces, opts): a Neutral Plane draft. neutral: [x,y,z] on a planar face, 'Front' | 'Top' |
  // 'Right', a plane feature id, or a ref ({ face: [x,y,z] } | { plane: name | id, offset? }); faces: [[x,y,z], ...] points
  // on the faces to draft; opts { reverse, propagate: 'tangent', name }
  Builder.prototype.draft = function (angle, neutral, faces, opts) {
    opts = opts || {};
    var nr = Array.isArray(neutral) ? { face: neutral } : (neutral != null && typeof neutral === 'object') ? neutral : { plane: neutral };
    var f = { type: 'draft', angle: num(angle), neutral: nr, faces: (faces || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name };
    if (opts.reverse) f.reverse = true;
    if (opts.propagate === 'tangent') f.propagate = 'tangent';
    this._add(f);
    return this;
  };
  K.Builder = Builder; K.runScript = runScript; K.generateScript = generateScript;
  if (K.installBlockScript) K.installBlockScript();   // sketch Blocks (kernel-sketch.js) add .blocks() to the SketchBuilder
  if (K.installPictureScript) K.installPictureScript();   // Sketch Picture (kernel-sketch.js) adds .picture()
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.fmt = fmt;
  _.fmtD = fmtD;

  // ------------------------------------------------------------------ rfDY: Rib and Intersect (kernel-features.js)
  // p.rib(thickness, { sketch, side: 'both' | 'one' | 'other', direction: 'parallel' | 'normal', flip, extension, name })
  Builder.prototype.rib = function (t, opts) {
    opts = opts || {};
    var f = this._add({ type: 'rib', sketch: this._sketchId(opts), thickness: num(t), side: opts.side === 'one' || opts.side === 'other' ? opts.side : 'both',
      direction: opts.direction === 'normal' ? 'normal' : 'parallel', name: opts.name });
    if (opts.flip) f.flip = true;
    if (opts.extension === 'natural') f.extension = 'natural';
    return this;
  };
  // p.intersect({ bodies: [i], planes: ['Front' | planeId], regions: [keep flags] | exclude: [region indices], merge: true, mode: 'create' | 'internal', name })
  Builder.prototype.intersect = function (opts) {
    opts = opts || {};
    var f = { type: 'intersect', mode: opts.mode === 'internal' ? 'internal' : 'create', name: opts.name };
    if (Array.isArray(opts.bodies) && opts.bodies.length) f.bodies = opts.bodies.map(function (i) { return i | 0; });
    if (Array.isArray(opts.planes) && opts.planes.length) f.planes = opts.planes.slice();
    if (Array.isArray(opts.regions)) f.regions = opts.regions.map(function (x) { return x !== false; });
    if (Array.isArray(opts.exclude)) { f.regions = f.regions || []; opts.exclude.forEach(function (i) { for (var k = f.regions.length; k <= i; k++) f.regions.push(true); f.regions[i] = false; }); }
    if (opts.merge === false) f.merge = false;
    this._add(f);
    return this;
  };
  // ------------------------------------------------------------------ rfHT: Delete/Keep Body (kernel-rebuild.js)
  // p.deleteBody(points, { keep, name }): points = a point on / inside each body ([x, y, z], or a list of them; a bare
  // number is a body index); keep: true keeps those bodies and deletes the rest
  Builder.prototype.deleteBody = function (points, opts) {
    opts = opts || {};
    var list = Array.isArray(points) && points.length === 3 && points.every(function (x) { return typeof x === 'number'; }) && !opts.indices ? [points] : (Array.isArray(points) ? points : [points]);
    var f = { type: 'deleteBody', bodies: list.map(function (r) {
      if (typeof r === 'number') return r | 0;
      var p = r && (Array.isArray(r) ? r : r.at);
      return { at: [+p[0], +p[1], +p[2]] };
    }), name: opts.name };
    if (opts.keep) f.keep = true;
    this._add(f);
    return this;
  };
  // ------------------------------------------------------------------ rfFA: reference curves (kernel-features.js)
  // Each returns the new feature's id (not `this`), like p.axis / p.point; a curve is never a pattern source.
  // p.helix(sketchId, { defineBy: 'pitchRev' | 'heightRev' | 'heightPitch' | 'spiral', pitch, revolutions, height,
  //   startAngle, clockwise, reverse, taper, taperOut, name })
  // p.projectedCurve(sketchId, { mode: 'sketchOnFaces' | 'sketchOnSketch', faces: [[x,y,z], …] | sketch2, reverse })
  // p.compositeCurve([ref, …]) — refs { edge: [x,y,z] }, { sketch, entity, seg? }, { curve: id }
  // p.xyzCurve([[x,y,z], …], { closed }) and p.refPointCurve([ref, …], { closed })
  Builder.prototype._addCurve = function (f, opts) {
    var keep = this.lastSolidId;
    if (opts && opts.name) f.name = opts.name;
    var id = this._add(f).id;
    this.lastSolidId = keep;
    return id;
  };
  Builder.prototype.helix = function (sketch, opts) {
    opts = opts || {};
    var f = { type: 'helix', sketch: sketch != null ? sketch : this.lastSketchId, defineBy: opts.defineBy || 'pitchRev' };
    if (f.sketch == null) throw new Error('helix needs a sketch with one circle.');
    ['pitch', 'revolutions', 'height', 'startAngle', 'taper'].forEach(function (k) { if (opts[k] != null) f[k] = num(opts[k]); });
    if (f.defineBy !== 'heightRev' && f.pitch == null) throw new Error('helix needs a pitch.');
    ['clockwise', 'reverse', 'taperOut'].forEach(function (k) { if (opts[k]) f[k] = true; });
    return this._addCurve(f, opts);
  };
  Builder.prototype.projectedCurve = function (sketch, opts) {
    opts = opts || {};
    var f = { type: 'projCurve', mode: opts.mode || (opts.sketch2 != null ? 'sketchOnSketch' : 'sketchOnFaces'), sketch: sketch != null ? sketch : this.lastSketchId };
    if (f.mode === 'sketchOnSketch') f.sketch2 = opts.sketch2;
    else f.faces = (opts.faces || []).map(function (p) { return { at: (Array.isArray(p) ? p : p.at).map(Number) }; });
    if (opts.reverse) f.reverse = true;
    return this._addCurve(f, opts);
  };
  function curveRefIn(r) {
    if (Array.isArray(r)) return { vertex: r.map(Number) };
    var o = {};
    Object.keys(r).forEach(function (k) { o[k] = Array.isArray(r[k]) ? r[k].map(Number) : r[k]; });
    return o;
  }
  Builder.prototype.compositeCurve = function (refs, opts) {
    return this._addCurve({ type: 'compositeCurve', edges: (refs || []).map(curveRefIn) }, opts);
  };
  Builder.prototype.xyzCurve = function (points, opts) {
    var f = { type: 'xyzCurve', points: (points || []).map(function (p) { return p.map(Number); }) };
    if (opts && opts.closed) f.closed = true;
    return this._addCurve(f, opts);
  };
  Builder.prototype.refPointCurve = function (refs, opts) {
    var f = { type: 'refPtCurve', points: (refs || []).map(curveRefIn) };
    if (opts && opts.closed) f.closed = true;
    return this._addCurve(f, opts);
  };
  // ------------------------------------------------------------------ rfDZ: Wrap
  // wrap(opts): Insert ▸ Features ▸ Wrap (kernel-features.js). opts: face ([x, y, z] on the cylindrical, conical or
  // planar face to wrap onto, required), sketch (default: the last sketch), mode ('emboss', the default | 'deboss' |
  // 'scribe'), thickness (emboss / deboss), reverse, name
  Builder.prototype.wrap = function (opts) {
    opts = opts || {};
    if (!Array.isArray(opts.face) || opts.face.length !== 3) throw new Error('wrap: give face: [x, y, z], a point on the face to wrap onto.');
    var mode = opts.mode || 'emboss';
    if (mode !== 'emboss' && mode !== 'deboss' && mode !== 'scribe') throw new Error('wrap: mode must be emboss, deboss or scribe.');
    var f = { type: 'wrap', sketch: this._sketchId(opts), face: opts.face.map(Number), mode: mode };
    if (mode !== 'scribe') f.thickness = num(opts.thickness != null ? opts.thickness : 0);
    if (opts.reverse) f.reverse = true;
    if (opts.name) f.name = opts.name;
    this._add(f);
    return this;
  };
  SketchBuilder.prototype.wrap = function (opts) { return this.part.wrap(Object.assign({}, opts || {}, { sketch: this.f.id })); };
})(Kernel, Kernel._);
