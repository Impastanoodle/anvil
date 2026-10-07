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

  // p9-sketch-curves: an arc slot ({ t: 'aslot', cx, cy, r, a0, a1, w }: SolidWorks' 3 Point / Centerpoint Arc Slot) is
  // the band w wide round its centre-line arc (centre cx, cy, radius r, counter-clockwise a0 -> a1 in degrees, the ends
  // are the cap centres): outer arc a0 -> a1, half-circle cap round the end, inner arc back, cap round the start. Its
  // four exact arcs (radians, a0 < a1, in loop order) with the chord count each is tessellated with, or null.
  function aslotArcs(e) {
    var s0 = e.a0 * Math.PI / 180, s1 = e.a1 * Math.PI / 180, h = e.w / 2, sw = s1 - s0;
    if (!(e.r > 0) || !(h > 0) || !(sw > 1e-12)) return null;
    var P1 = [e.cx + e.r * Math.cos(s0), e.cy + e.r * Math.sin(s0)], P2 = [e.cx + e.r * Math.cos(s1), e.cy + e.r * Math.sin(s1)];
    function n(r, ang) { return Math.max(4, Math.round(segsForRadius(Math.abs(r)) * ang / (Math.PI * 2))); }
    var nc = Math.max(8, Math.round(segsForRadius(h) / 2));
    return [{ c: [e.cx, e.cy], r: e.r + h, a0: s0, a1: s1, n: n(e.r + h, sw) }, { c: P2, r: h, a0: s1, a1: s1 + Math.PI, n: nc },
      { c: [e.cx, e.cy], r: e.r - h, a0: s0, a1: s1, n: n(e.r - h, sw), back: true }, { c: P1, r: h, a0: s0 + Math.PI, a1: s0 + 2 * Math.PI, n: nc }];
  }
  // ------------------------------------------------------------------ freeform curves: splines and ellipses
  // Spline { t: 'spline', pts: [[x, y], …], closed?, tans? }: the C2 cubic through its points (SolidWorks' Spline),
  // parameterised by chord length (knot t_i = the summed distances between the points, so a point's parameter is
  // about the length along the curve). Free ends are natural (no curvature, as a bent strip would lie); a closed
  // spline (closed: true, at least 3 points) is periodic, curvature-continuous through its first point too.
  // tans[i] = [angleDeg, weight] makes point i tangent-driving (SolidWorks' Tangent Driving: the curve leaves the point
  // at that angle, its speed scaled by the weight; 1 is the natural chord-length speed); the curve stays C1 there.
  // splineGeom(e) -> { bez: [[B0, B1, B2, B3], …] (one cubic Bézier per span), knots: [t0, …], closed } or null.
  // The same Béziers are what DXF SPLINE (R2000) and OpenCascade get, so every consumer draws the same curve.
  function triSolve(a, b, c, r) {   // Thomas: a sub-, b main, c super-diagonal (a[0], c[n-1] unused)
    var n = b.length, cp = [], rp = [], x = [], i;
    cp[0] = c[0] / b[0]; rp[0] = r[0] / b[0];
    for (i = 1; i < n; i++) { var m = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / m; rp[i] = (r[i] - a[i] * rp[i - 1]) / m; }
    x[n - 1] = rp[n - 1];
    for (i = n - 2; i >= 0; i--) x[i] = rp[i] - cp[i] * x[i + 1];
    return x;
  }
  // the same with the corners A[0][n-1] = a[0] and A[n-1][0] = c[n-1] (cyclic; Sherman-Morrison)
  function cyclicSolve(a, b, c, r) {
    var n = b.length, beta = a[0], alpha = c[n - 1], gamma = -b[0], bb = b.slice(), aa = a.slice(), cc = c.slice(), i;
    if (n < 3) { var d0 = b[0] * b[1] - (c[0] + a[0]) * (a[1] + c[1]); return [(r[0] * b[1] - (c[0] + a[0]) * r[1]) / d0, (b[0] * r[1] - (a[1] + c[1]) * r[0]) / d0]; }
    bb[0] = b[0] - gamma; bb[n - 1] = b[n - 1] - alpha * beta / gamma; aa[0] = 0; cc[n - 1] = 0;
    var x = triSolve(aa, bb, cc, r), u = [];
    for (i = 0; i < n; i++) u.push(0);
    u[0] = gamma; u[n - 1] = alpha;
    var z = triSolve(aa, bb, cc, u), fact = (x[0] + beta * x[n - 1] / gamma) / (1 + z[0] + beta * z[n - 1] / gamma);
    for (i = 0; i < n; i++) x[i] -= fact * z[i];
    return x;
  }
  function splineGeom(e) {
    var P = (e.pts || []).map(function (p) { return [+p[0], +p[1]]; }), n = P.length;
    if (n < 2) return null;
    var closed = !!e.closed && n >= 3, m = closed ? n : n - 1, h = [], knots = [0], i;
    for (i = 0; i < m; i++) { var q = P[(i + 1) % n]; h.push(Math.max(Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 1e-9)); knots.push(knots[i] + h[i]); }
    // the first derivatives M_i at the points: C2 rows h_i·M_{i−1} + 2(h_{i−1} + h_i)·M_i + h_{i−1}·M_{i+1} = 3(h_i·Δ_{i−1}/h_{i−1} + h_{i−1}·Δ_i/h_i),
    // natural ends 2·M_0 + M_1 = 3·Δ_0/h_0, a tangent-driving point M_i = weight·(cos, sin)
    var a = [], b = [], c = [], rx = [], ry = [], tans = e.tans || [];
    for (i = 0; i < n; i++) {
      var tg = tans[i];
      a.push(0); b.push(0); c.push(0);
      if (tg && isFinite(+tg[0])) {
        var w = tg[1] == null || !isFinite(+tg[1]) ? 1 : +tg[1], an = +tg[0] * Math.PI / 180;
        b[i] = 1; rx.push(w * Math.cos(an)); ry.push(w * Math.sin(an));
        continue;
      }
      if (!closed && (i === 0 || i === n - 1)) {
        var j0 = i === 0 ? 0 : n - 2, s = 3 / h[j0];
        b[i] = 2; if (i === 0) c[i] = 1; else a[i] = 1;
        rx.push((P[j0 + 1][0] - P[j0][0]) * s); ry.push((P[j0 + 1][1] - P[j0][1]) * s);
        continue;
      }
      var ip = (i + n - 1) % n, inx = (i + 1) % n, hp = h[(i + m - 1) % m], hn = h[i % m];
      a[i] = hn; b[i] = 2 * (hp + hn); c[i] = hp;
      rx.push(3 * (hn * (P[i][0] - P[ip][0]) / hp + hp * (P[inx][0] - P[i][0]) / hn));
      ry.push(3 * (hn * (P[i][1] - P[ip][1]) / hp + hp * (P[inx][1] - P[i][1]) / hn));
    }
    var Mx, My, bez = [];
    if (e.local) {
      // Maintain internal continuity off: each point's tangent from its neighbours only (the chord P_{i+1} − P_{i−1} over
      // its knot span), a free end's so the end span has no curvature at the end; C1, and a point moved reshapes only
      // the spans next to it
      Mx = []; My = [];
      for (i = 0; i < n; i++) {
        if (b[i] === 1 && a[i] === 0 && c[i] === 0) { Mx.push(rx[i]); My.push(ry[i]); continue; }   // tangent-driving
        if (!closed && (i === 0 || i === n - 1)) { Mx.push(null); My.push(null); continue; }
        var pi = P[(i + n - 1) % n], ni = P[(i + 1) % n], hs = h[(i + m - 1) % m] + h[i % m];
        Mx.push((ni[0] - pi[0]) / hs); My.push((ni[1] - pi[1]) / hs);
      }
      if (!closed) [[0, 1, 0], [n - 1, n - 2, n - 2]].forEach(function (q) {
        var k = q[0], o = q[1], s = q[2], d = 3 / h[s];
        if (Mx[k] != null) return;
        var dx = (P[s + 1][0] - P[s][0]) * d, dy = (P[s + 1][1] - P[s][1]) * d;
        Mx[k] = n === 2 ? dx / 3 : (dx - Mx[o]) / 2; My[k] = n === 2 ? dy / 3 : (dy - My[o]) / 2;
      });
    } else { Mx = closed ? cyclicSolve(a, b, c, rx) : triSolve(a, b, c, rx); My = closed ? cyclicSolve(a, b, c, ry) : triSolve(a, b, c, ry); }
    for (i = 0; i < m; i++) {
      var p0 = P[i], p3 = P[(i + 1) % n], k = h[i] / 3, j = (i + 1) % n;
      bez.push([p0, [p0[0] + k * Mx[i], p0[1] + k * My[i]], [p3[0] - k * Mx[j], p3[1] - k * My[j]], p3]);
    }
    return { bez: bez, knots: knots, closed: closed };
  }
  function bezPoint(B, s) {
    var u = 1 - s, b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s;
    return [b0 * B[0][0] + b1 * B[1][0] + b2 * B[2][0] + b3 * B[3][0], b0 * B[0][1] + b1 * B[1][1] + b2 * B[2][1] + b3 * B[3][1]];
  }
  function bezDeriv(B, s) {   // dP/ds (s in [0, 1])
    var u = 1 - s, d0 = 3 * u * u, d1 = 6 * u * s, d2 = 3 * s * s;
    return [d0 * (B[1][0] - B[0][0]) + d1 * (B[2][0] - B[1][0]) + d2 * (B[3][0] - B[2][0]), d0 * (B[1][1] - B[0][1]) + d1 * (B[2][1] - B[1][1]) + d2 * (B[3][1] - B[2][1])];
  }
  // chords per span so the sagitta |P''|·Δs²/8 stays under the chord tolerance (P'' is linear: largest at an end)
  function bezSegs(B) {
    var dd = 0;
    for (var k = 0; k < 2; k++) dd = Math.max(dd, 6 * Math.hypot(B[k][0] - 2 * B[k + 1][0] + B[k + 2][0], B[k][1] - 2 * B[k + 1][1] + B[k + 2][1]));
    return Math.max(4, Math.min(256, Math.ceil(Math.sqrt(dd / (8 * TESS.chordTol)) - 1e-9)));
  }
  // signed area between span B and its chord from s0 to s1 (½∮ x dy − y dx along the curve minus along the chord;
  // 3-point Gauss-Legendre is exact: the integrand is a quintic)
  function bezSliver(B, s0, s1) {
    var P0 = bezPoint(B, s0), g = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]], half = (s1 - s0) / 2, mid = (s0 + s1) / 2, sum = 0;
    g.forEach(function (gw) {
      var s = mid + half * gw[0], p = bezPoint(B, s), d = bezDeriv(B, s);
      sum += gw[1] * ((p[0] - P0[0]) * d[1] - (p[1] - P0[1]) * d[0]);
    });
    return sum * half / 2;
  }
  // Ellipse { t: 'ellipse', cx, cy, rx, ry, rot } (rx along the rotated x axis, rot in degrees) and Partial Ellipse
  // { t: 'pellipse', …, a0, a1 }: the part from parameter angle a0 to a1 (degrees, counterclockwise, a0 < a1), where
  // the point at parameter u is centre + rot·(rx·cos u, ry·sin u) — the angle DXF ELLIPSE and OpenCascade use too.
  function ellipsePoint(e, u) {
    var r = (+e.rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), x = e.rx * Math.cos(u), y = e.ry * Math.sin(u);
    return [e.cx + cr * x - sr * y, e.cy + sr * x + cr * y];
  }
  // curve samples of a spline / ellipse: { pts, par (the curve parameter of each sample: knot length for splines,
  // radians for ellipses), sl (signed sliver area of each chord), closed }, or null
  function freeSamples(e) {
    var pts = [], par = [], sl = [], i, k;
    if (e.t === 'spline') {
      var g = splineGeom(e);
      if (!g) return null;
      g.bez.forEach(function (B, j) {
        var n = bezSegs(B), h = g.knots[j + 1] - g.knots[j];
        for (k = j === 0 ? 0 : 1; k <= n; k++) { pts.push(bezPoint(B, k / n)); par.push(g.knots[j] + h * k / n); }
        for (k = 0; k < n; k++) sl.push(bezSliver(B, k / n, (k + 1) / n));
      });
      if (g.closed) { pts.pop(); par.pop(); }
      return { pts: pts, par: par, sl: sl, closed: g.closed };
    }
    if (!(e.rx > 0) || !(e.ry > 0)) return null;
    var full = e.t === 'ellipse', u0 = full ? 0 : +e.a0 * Math.PI / 180, u1 = full ? 2 * Math.PI : +e.a1 * Math.PI / 180;
    if (!(u1 > u0)) return null;
    var big = Math.max(e.rx, e.ry), segs = full ? segsForRadius(big) : Math.max(4, Math.round(segsForRadius(big) * (u1 - u0) / (2 * Math.PI)));
    for (i = 0; i <= segs; i++) { var u = u0 + (u1 - u0) * i / segs; pts.push(ellipsePoint(e, u)); par.push(u); }
    var d = (u1 - u0) / segs, s1 = e.rx * e.ry / 2 * (d - Math.sin(d));
    for (i = 0; i < segs; i++) sl.push(s1);
    if (full) { pts.pop(); par.pop(); }
    return { pts: pts, par: par, sl: sl, closed: full };
  }
  // Area-true profile points: the samples moved off the curve by about two thirds of a sagitta so that the polyline
  // encloses exactly the area the true curve does (each vertex in turn moves along the normal of its neighbours'
  // chord, which changes ½∮ x dy − y dx by exactly its share of the chords' slivers; open curves keep their ends).
  // An extrude of an ellipse is then πab·h to rounding whatever the tessellation; the mesh stays within the chord
  // tolerance of the curve.
  function areaTrue(pts, sl, closed) {
    var n = pts.length, out = pts.map(function (p) { return [p[0], p[1]]; }), want = [], i;
    if (closed) for (i = 0; i < n; i++) want.push((sl[(i + n - 1) % n] + sl[i]) / 2);
    else {
      if (n < 3) return out;
      for (i = 0; i < n; i++) want.push(i > 0 && i < n - 1 ? (sl[i - 1] + sl[i]) / 2 : 0);
      want[1] += sl[0] / 2; want[n - 2] += sl[n - 2] / 2;
    }
    for (i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      var pv = out[(i + n - 1) % n], nx = out[(i + 1) % n], wx = nx[0] - pv[0], wy = nx[1] - pv[1], L = Math.hypot(wx, wy);
      if (L < 1e-15) continue;
      var dl = 2 * want[i] / L;
      out[i] = [out[i][0] + dl * wy / L, out[i][1] - dl * wx / L];
    }
    return out;
  }
  // { pts, closed } of a spline / ellipse for drawing (on the curve) or, with areaTrue, for profiles
  function freePolyline(e, area) {
    var s = freeSamples(e);
    if (!s || s.pts.length < 2) return [];
    return [{ pts: area ? areaTrue(s.pts, s.sl, s.closed) : s.pts, closed: s.closed }];
  }
  function isFree(e) { return !!e && (e.t === 'spline' || e.t === 'ellipse' || e.t === 'pellipse'); }

  // Returns [{pts:[[u,v],...], closed:bool}] for drawing and profiling. Construction points return []. Splines and
  // ellipses: on the curve, or with `area` the area-true points profiles use (see areaTrue).
  function entityPolylines(e, area) {
    switch (e.t) {
      case 'spline': case 'ellipse': case 'pellipse': return freePolyline(e, area);
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
      case 'aslot': {   // p9-sketch-curves: each arc's first point is the previous one's last
        var as = aslotArcs(e);
        if (!as) return [];
        var ring = [];
        as.forEach(function (c, k) {
          var q = c.back ? arcPoints(c.c[0], c.c[1], c.r, c.a1, c.a0, c.n) : arcPoints(c.c[0], c.c[1], c.r, c.a0, c.a1, c.n);
          ring = ring.concat(k ? q.slice(1, k === 3 ? -1 : undefined) : q);
        });
        return [{ pts: ring, closed: true }];
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
      case 'aslot': return (aslotArcs(e) || []).map(function (c) { return { c: c.c, r: c.r, a0: c.a0, a1: c.a1, full: false, step: (c.a1 - c.a0) / c.n }; });
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
      case 'aslot': { var D = Math.PI / 180; return [[e.cx, e.cy], [e.cx + e.r * Math.cos(e.a0 * D), e.cy + e.r * Math.sin(e.a0 * D)], [e.cx + e.r * Math.cos(e.a1 * D), e.cy + e.r * Math.sin(e.a1 * D)]]; }
      case 'polyline': return e.pts.slice();
      case 'point': return [[e.x, e.y]];
      case 'spline': return e.pts.map(function (p) { return [p[0], p[1]]; });
      case 'ellipse': case 'pellipse': {
        var ep = [[e.cx, e.cy]];
        for (var q = 0; q < 4; q++) ep.push(ellipsePoint(e, q * Math.PI / 2));
        if (e.t === 'pellipse') ep.push(ellipsePoint(e, e.a0 * Math.PI / 180), ellipsePoint(e, e.a1 * Math.PI / 180));
        return ep;
      }
    }
    return [];
  }

  // ------------------------------------------------------------------ sketch layers (AutoCAD layers; sketch-layers)
  // sketch.layers = [{ name, color ('#rrggbb' | null: the entity's usual colour), hidden, noProfile, lineType
  // ('continuous' | 'dashed'), aci (DXF colour number, optional) }]; an entity's `layer` names one. No `layer`, "0" or
  // a name missing from the table is the default layer "0". Entities on a noProfile layer (ETCH marks, BEND lines) make
  // no region: sketchProfile leaves them out, as it does construction geometry. LAYER_PRESETS are the shop's three.
  var LAYER_PRESETS = [
    { name: 'CUT', color: null, aci: 7 },
    { name: 'ETCH', color: '#1e9e3c', aci: 3, noProfile: true },
    { name: 'BEND', color: '#c77700', aci: 30, noProfile: true, lineType: 'dashed' }
  ];
  function sketchLayer(sketch, e) {
    var n = e && e.layer, L = sketch && sketch.layers;
    if (n == null || n === '' || n === '0' || !L) return null;
    for (var i = 0; i < L.length; i++) if (L[i] && L[i].name === n) return L[i];
    return null;
  }
  function noProfileEntity(sketch, e) { var l = sketchLayer(sketch, e); return !!(l && l.noProfile); }

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
  // Splines and ellipses (area-true points, see areaTrue) are listed in profile.free ({ t: 'spline', bez, knots,
  // closed } | { t: 'ellipse', cx, cy, rx, ry, rot, full }) with loop.fseg[i] = [free index, parameter at i, at i+1]
  // for each segment on one (-1 elsewhere): OpenCascade builds them as true B-spline / ellipse edges.
  function sketchProfile(sketch) {
    var loops = [], chains = [], warnings = [], curves = [], free = [];
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || noProfileEntity(sketch, e)) return;   // sketch-layers: ETCH / BEND make no region
      if (e.t === 'line' && e.infinite) return;   // sketch-refine: an infinite line (or ray) bounds no region
      curves = curves.concat(entityCurves(e));
      if (isFree(e)) { var fr = freeRecord(e); if (fr) free.push(fr); }
      entityPolylines(e, true).forEach(function (pl) {
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
      var fseg = free.length ? freeSegments(pts, free) : null;
      if (fseg) loop.fseg = fseg;
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
    if (out.some(function (l) { return l.fseg; })) prof.free = free.map(function (r) { return r.rec; });
    return prof;
  }
  // a spline / ellipse of a profile: { rec (what profile.free holds), keys: { key2 of each area-true point: its
  // sample index }, par, n, closed, period }
  function freeRecord(e) {
    var s = freeSamples(e);
    if (!s || s.pts.length < 2) return null;
    var pts = areaTrue(s.pts, s.sl, s.closed), keys = {}, rec;
    pts.forEach(function (p, i) { keys[key2(p)] = i; });
    if (e.t === 'spline') { var g = splineGeom(e); rec = { t: 'spline', bez: g.bez, knots: g.knots, closed: g.closed }; }
    else rec = { t: 'ellipse', cx: +e.cx, cy: +e.cy, rx: +e.rx, ry: +e.ry, rot: +e.rot || 0, full: e.t === 'ellipse' };
    var period = s.closed ? (e.t === 'spline' ? rec.knots[rec.knots.length - 1] : 2 * Math.PI) : null;
    return { rec: rec, keys: keys, par: s.par, n: pts.length, closed: s.closed, period: period };
  }
  // loop.fseg (see sketchProfile): segment i -> i+1 lies on free curve k when both ends are consecutive samples of it
  function freeSegments(pts, free) {
    var n = pts.length, out = null;
    for (var i = 0; i < n; i++) {
      var ka = key2(pts[i]), kb = key2(pts[(i + 1) % n]);
      for (var k = 0; k < free.length; k++) {
        var F = free[k], ia = F.keys[ka], ib = F.keys[kb];
        if (ia == null || ib == null) continue;
        var pa = F.par[ia], pb = F.par[ib];
        if (Math.abs(ia - ib) !== 1) {
          if (!F.closed || Math.abs(ia - ib) !== F.n - 1) continue;
          if (ia === 0) pa = F.period; else pb = F.period;   // across the closed curve's start
        }
        if (!out) { out = []; for (var j = 0; j < n; j++) out.push(-1); }
        out[i] = [k, pa, pb];
        break;
      }
    }
    return out;
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
      case 'aslot': {   // p9-sketch-curves: as an arc, keeping the width
        var cs = m(e.cx, e.cy), s0 = 2 * phi - e.a1, s1 = 2 * phi - e.a0;
        while (s0 < 0) { s0 += 360; s1 += 360; }
        while (s0 >= 360) { s0 -= 360; s1 -= 360; }
        out = { t: 'aslot', cx: cs[0], cy: cs[1], r: e.r, a0: s0, a1: s1, w: e.w };
        break;
      }
      case 'poly': { var cp = m(e.cx, e.cy); out = { t: 'poly', cx: cp[0], cy: cp[1], r: e.r, n: e.n, rot: 2 * phi - (e.rot || 0) }; if (e.ins) out.ins = true; break; }
      case 'spline': {
        // the points mirror; a driving tangent's direction reflects as 2φ − angle
        out = { t: 'spline', pts: e.pts.map(function (q) { return m(q[0], q[1]); }) };
        if (e.closed) out.closed = true;
        if (e.tans) out.tans = e.tans.map(function (tg) { return tg ? [2 * phi - tg[0], tg[1]] : null; });
        break;
      }
      case 'ellipse': case 'pellipse': {
        // the axis turns to 2φ − rot and the parameter runs backwards (u -> −u): a partial ellipse [a0, a1] becomes [−a1, −a0]
        var ce = m(e.cx, e.cy);
        out = { t: e.t, cx: ce[0], cy: ce[1], rx: e.rx, ry: e.ry, rot: 2 * phi - (e.rot || 0) };
        if (e.t === 'pellipse') { var b0 = -e.a1, b1 = -e.a0; while (b0 < 0) { b0 += 360; b1 += 360; } out.a0 = b0; out.a1 = b1; }
        break;
      }
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
    if (e.layer != null) out.layer = e.layer;   // sketch-layers
    return out;
  }
  function translateEntity(e, dx, dy) {
    var out = JSON.parse(JSON.stringify(e));
    switch (e.t) {
      case 'line': case 'slot': out.x1 += dx; out.y1 += dy; out.x2 += dx; out.y2 += dy; break;
      case 'rect': case 'point': out.x += dx; out.y += dy; break;
      case 'crect': case 'circle': case 'poly': case 'arc': case 'aslot': case 'ellipse': case 'pellipse': out.cx += dx; out.cy += dy; break;
      case 'polyline': case 'spline': out.pts = e.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); break;
    }
    return out;
  }

  // ------------------------------------------------------------------ sketch dimensions (Smart Dimension)
  // A dimension is { e: entityIndex, k: kind, i?: subIndex, off?: placement, ang?: placement } stored in sketch.dims.
  // Kinds: line 'len' | 'dx' | 'dy'; rect / crect 'w' | 'h' (i = edge 0 bottom, 1 right, 2 top, 3 left); circle 'dia';
  // arc / poly 'r'; slot 'len' | 'olen' (overall length) | 'w'; arc slot 'r' (centre-line radius) | 'w'; polyline 'seg'
  // (i = segment); a polygon with `ins` (inscribed circle) measures 'r' to the flats. Values are driven by the entity geometry and
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
      case 'arc': case 'poly': return k === 'r' ? radial([e.cx, e.cy], e.t === 'poly' && e.ins ? e.r * Math.cos(Math.PI / (e.n || 6)) : e.r, 'R') : null;
      case 'aslot': {   // p9-sketch-curves: the centre-line radius; the width across the start cap's centre
        if (k === 'r') return radial([e.cx, e.cy], e.r, 'R');
        if (k !== 'w') return null;
        var ua = e.a0 * Math.PI / 180, u = [Math.cos(ua), Math.sin(ua)], P1 = [e.cx + u[0] * e.r, e.cy + u[1] * e.r];
        return linear([P1[0] + u[0] * e.w / 2, P1[1] + u[1] * e.w / 2], [P1[0] - u[0] * e.w / 2, P1[1] - u[1] * e.w / 2], u);
      }
      case 'ellipse': case 'pellipse': {   // 'rx' / 'ry': centre to the end of the major / minor axis (SolidWorks dimensions the axis points)
        if (k !== 'rx' && k !== 'ry') return null;
        var er = (+e.rot || 0) * Math.PI / 180 + (k === 'ry' ? Math.PI / 2 : 0), ed = [Math.cos(er), Math.sin(er)], el = k === 'rx' ? e.rx : e.ry;
        return linear([e.cx, e.cy], [e.cx + ed[0] * el, e.cy + ed[1] * el], ed);
      }
      case 'slot': {
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
        if (k === 'len') return linear([e.x1, e.y1], [e.x2, e.y2], [dx, dy]);
        if (k === 'olen') {   // p9-sketch-curves: Overall Length, cap end to cap end
          var ud = L < 1e-12 ? [1, 0] : [dx / L, dy / L], h2 = e.w / 2;
          return linear([e.x1 - ud[0] * h2, e.y1 - ud[1] * h2], [e.x2 + ud[0] * h2, e.y2 + ud[1] * h2], ud);
        }
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
      case 'arc': e.r = v; break;
      case 'poly': e.r = e.ins ? v / Math.cos(Math.PI / (e.n || 6)) : v; break;
      case 'aslot': if (k === 'r') { if (!(v > e.w / 2)) throw new Error('The arc radius must be more than half the slot width.'); e.r = v; } else { if (!(v < 2 * e.r)) throw new Error('The slot width must be less than twice the arc radius.'); e.w = v; } break;
      case 'slot':
        if (k === 'olen') { if (!(v >= e.w)) throw new Error('The overall length must be at least the slot width.'); e.x2 = e.x1 + g.dir[0] * (v - e.w); e.y2 = e.y1 + g.dir[1] * (v - e.w); }
        else if (k === 'len') { e.x2 = e.x1 + g.dir[0] * v; e.y2 = e.y1 + g.dir[1] * v; } else e.w = v;
        break;
      case 'ellipse': case 'pellipse': if (k === 'rx') e.rx = v; else e.ry = v; break;
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
      case 'aslot': {   // p9-sketch-curves: on a side the radius, on a cap the width
        if (!uv) return { k: 'r' };
        var rel = ((Math.atan2(uv[1] - e.cy, uv[0] - e.cx) * 180 / Math.PI - e.a0) % 360 + 360) % 360;
        return { k: rel <= e.a1 - e.a0 ? 'r' : 'w' };
      }
      case 'ellipse': case 'pellipse': {   // the axis nearer the click (in the ellipse's own proportions)
        if (!uv) return { k: 'rx' };
        var ro = (+e.rot || 0) * Math.PI / 180, ux = uv[0] - e.cx, uy = uv[1] - e.cy;
        var lx = Math.cos(ro) * ux + Math.sin(ro) * uy, ly = -Math.sin(ro) * ux + Math.cos(ro) * uy;
        return { k: Math.abs(lx) / (e.rx || 1) >= Math.abs(ly) / (e.ry || 1) ? 'rx' : 'ry' };
      }
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
      case 'aslot': return (aslotArcs(e) || []).map(function (c) { return { kind: 'arc', c: c.c, r: c.r, a0: c.a0, a1: c.a1 }; });
      case 'rect': case 'crect': case 'poly': case 'polyline': case 'spline': case 'ellipse': case 'pellipse': {
        // splines and ellipses: the chords of their curve (where other entities are trimmed against them)
        var pl = entityPolylines(e)[0], out = [];
        if (!pl) return out;
        var pts = pl.pts, n = pts.length, cnt = pl.closed ? n : n - 1;
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
  // Returns the new entity list (the trimmed entity is replaced by 0..n pieces). Slots (and arc slots) are exploded into
  // lines and arcs first; rectangles and polygons become polylines.
  function trimEntity(entities, idx, uv) {
    var e = entities[idx];
    if (!e || e.t === 'point') throw new Error('Nothing to trim there.');
    if (isFree(e)) throw new Error('Splines and ellipses cannot be trimmed yet: trim the entities that cross them, or delete the curve.');
    if (e.t === 'slot' || e.t === 'aslot') {
      var parts = entityPrimitives(e).map(function (p) {
        var o = p.kind === 'seg' ? { t: 'line', x1: p.a[0], y1: p.a[1], x2: p.b[0], y2: p.b[1] } : { t: 'arc', cx: p.c[0], cy: p.c[1], r: p.r, a0: r2d(p.a0), a1: r2d(p.a1) };
        if (e.construction) o.construction = true;
        if (e.layer != null) o.layer = e.layer;
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
      if (e.layer != null) arc.layer = e.layer;
      return entities.slice(0, idx).concat([arc], entities.slice(idx + 1));
    }
    if (lo == null) lo = start;
    if (hi == null) hi = end;
    var pieces = [], tiny = span * 1e-6;
    function keep(o) { if (e.construction) o.construction = true; if (e.layer != null) o.layer = e.layer; pieces.push(o); }
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
  K.splineGeom = splineGeom; K.ellipsePoint = ellipsePoint; K.bezPoint = bezPoint; K.freeSamples = freeSamples; K.isFreeCurve = isFree;
  K.sketchLayer = sketchLayer; K.noProfileEntity = noProfileEntity; K.LAYER_PRESETS = LAYER_PRESETS;   // sketch-layers
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.TESS = TESS; _.checkProfile = checkProfile; _.dimGeometry = dimGeometry; _.entityPolylines = entityPolylines; _.key2 = key2;
  _.mirrorAxis = mirrorAxis; _.mirrorEntity = mirrorEntity; _.offsetLoop = offsetLoop; _.pointInPoly = pointInPoly; _.segsForRadius = segsForRadius;
  _.setDimValue = setDimValue; _.setTessellation = setTessellation; _.signedArea = signedArea; _.sketchProfile = sketchProfile; _.tessKey = tessKey;
  _.translateEntity = translateEntity; _.trimEntity = trimEntity; _.splineGeom = splineGeom; _.ellipsePoint = ellipsePoint; _.freeSamples = freeSamples;
})(Kernel, Kernel._);
