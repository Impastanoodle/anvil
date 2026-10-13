// kernel-sketch.js — Anvil kernel, sketches: sketch entities -> polylines (tessellation settings TESS), profiles (closed
// loops with nesting), 2D sketch geometry utilities, 2D entity editing (mirror, pattern, trim) and sketch dimensions
// (Smart Dimension), and Sketch Text (entity 'text': layout, Etch strokes / Cut outlines, text along a curve; the font
// is sketch-font.js, used at run time when it is loaded). Loaded after kernel.js (vector helpers through Kernel._); uses
// `_.fmt` from kernel-script.js at run time. No DOM.
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
  // rfAK: tans[i] = [angleDeg, weight, weightIn] gives the span arriving at point i its own speed (SolidWorks' asymmetric
  // tangent weighting): what keeps a spline cut in two by Split Entities / Trim exactly the curve it was.
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
  // ---- rfAH: Style Spline { t: 'spline', style: true, pts: [CV0, …, CVn] }: SolidWorks' Style Spline, one Bézier span
  // of degree n = pts.length − 1 (3, 5 or 7 from its PropertyManager) shaped by its control polygon. It passes through
  // its first and last control vertex, tangent to the polygon there. closed / tans / local do not apply. Its exact
  // curve is bzPoint(pts, t), t in [0, 1] (what Coincident, Trim, Extend, sketch DXF and the script use); splineGeom
  // hands the other consumers (profiles, OpenCascade, drawings) cubic spans: exact for degree ≤ 3, C1 Hermite spans
  // within about 1e-7 of its size for degree 5 / 7 (8·n spans).
  function isStyle(e) { return !!e && e.t === 'spline' && !!e.style; }
  // the blossom of P at ts (n values): bzBlossom(P, [t, …, t]) is the point at t; [a…a, b…b] gives the control
  // points of the piece from a to b
  function bzBlossom(P, ts) {
    var Q = P.map(function (p) { return [+p[0], +p[1]]; }), n = Q.length - 1;
    for (var k = 0; k < n; k++) { var t = ts[k], u = 1 - t; for (var i = 0; i < n - k; i++) Q[i] = [u * Q[i][0] + t * Q[i + 1][0], u * Q[i][1] + t * Q[i + 1][1]]; }
    return Q[0];
  }
  // the point of the Bézier with control points P at t (de Casteljau; t outside [0, 1] carries the polynomial on)
  function bzPoint(P, t) { var ts = []; for (var k = 1; k < P.length; k++) ts.push(t); return bzBlossom(P, ts); }
  // dP/dt: n · the Bézier of the control polygon's legs
  function bzDeriv(P, t) {
    var n = P.length - 1;
    if (n < 1) return [0, 0];
    var D = [];
    for (var i = 0; i < n; i++) D.push([n * (P[i + 1][0] - P[i][0]), n * (P[i + 1][1] - P[i][1])]);
    return bzPoint(D, t);
  }
  // the control points of the piece of P from a to b (either may lie outside [0, 1]): the same curve exactly
  function bzSub(P, a, b) {
    var n = P.length - 1, out = [];
    for (var i = 0; i <= n; i++) { var ts = []; for (var k = 0; k < n; k++) ts.push(k < n - i ? a : b); out.push(bzBlossom(P, ts)); }
    return out;
  }
  // degree elevation by one (the same curve)
  function bzElevate(P) {
    var n = P.length - 1, out = [[+P[0][0], +P[0][1]]];
    for (var i = 1; i <= n; i++) { var a = i / (n + 1); out.push([a * P[i - 1][0] + (1 - a) * P[i][0], a * P[i - 1][1] + (1 - a) * P[i][1]]); }
    out.push([+P[n][0], +P[n][1]]);
    return out;
  }
  // P as a Bézier of degree m: elevated exactly when m is higher; otherwise the least-squares fit of degree m that keeps
  // both ends and (m ≥ 3) the end tangent directions, as SolidWorks changes a style spline's degree
  function bzDegree(P, m) {
    var n = P.length - 1, Q, i, j, k;
    if (m === n) return P.map(function (p) { return [+p[0], +p[1]]; });
    if (m > n) { Q = P; while (Q.length - 1 < m) Q = bzElevate(Q); return Q; }
    if (m < 1) return null;
    var A = P[0], B = P[n], S = 64, ts = [], tgt = [];
    if (m === 1) return [[+A[0], +A[1]], [+B[0], +B[1]]];
    for (k = 1; k < S; k++) { ts.push(k / S); tgt.push(bzPoint(P, k / S)); }
    function bern(q, t) { var c = 1; for (var z = 0; z < q; z++) c = c * (m - z) / (z + 1); return c * Math.pow(t, q) * Math.pow(1 - t, m - q); }
    function unit(v) { var L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }
    var tanFix = m >= 3, u0 = unit(bzDeriv(P, 0)), u1 = unit(bzDeriv(P, 1));
    // unknowns: tanFix: [a (P1 = A + a·u0), b (P(m−1) = B − b·u1), x2, y2, …]; else [x1, y1, …]
    var cols = tanFix ? 2 + 2 * (m - 3) : 2 * (m - 1), rows = [], rhs = [];
    function col(q) { return tanFix ? 2 + 2 * (q - 2) : 2 * (q - 1); }
    ts.forEach(function (t, s) {
      var rx = [], ry = [], bx = tgt[s][0] - bern(0, t) * A[0] - bern(m, t) * B[0], by = tgt[s][1] - bern(0, t) * A[1] - bern(m, t) * B[1];
      for (var c = 0; c < cols; c++) { rx.push(0); ry.push(0); }
      for (var q = 1; q < m; q++) {
        var w = bern(q, t);
        if (tanFix && q === 1) { bx -= w * A[0]; by -= w * A[1]; rx[0] += w * u0[0]; ry[0] += w * u0[1]; }
        else if (tanFix && q === m - 1) { bx -= w * B[0]; by -= w * B[1]; rx[1] -= w * u1[0]; ry[1] -= w * u1[1]; }
        else { rx[col(q)] += w; ry[col(q) + 1] += w; }
      }
      rows.push(rx, ry); rhs.push(bx, by);
    });
    // the normal equations (small and dense): Gaussian elimination with partial pivoting
    var N = [], r = [];
    for (i = 0; i < cols; i++) { N.push([]); r.push(0); for (j = 0; j < cols; j++) N[i].push(0); }
    rows.forEach(function (row, q) { for (var a = 0; a < cols; a++) { if (!row[a]) continue; r[a] += row[a] * rhs[q]; for (var b = 0; b < cols; b++) N[a][b] += row[a] * row[b]; } });
    for (i = 0; i < cols; i++) {
      var piv = i;
      for (j = i + 1; j < cols; j++) if (Math.abs(N[j][i]) > Math.abs(N[piv][i])) piv = j;
      var tmp = N[i]; N[i] = N[piv]; N[piv] = tmp; var tr = r[i]; r[i] = r[piv]; r[piv] = tr;
      if (Math.abs(N[i][i]) < 1e-300) return null;
      for (j = i + 1; j < cols; j++) { var f = N[j][i] / N[i][i]; if (!f) continue; for (k = i; k < cols; k++) N[j][k] -= f * N[i][k]; r[j] -= f * r[i]; }
    }
    var x = [];
    for (i = cols - 1; i >= 0; i--) { var sum = r[i]; for (k = i + 1; k < cols; k++) sum -= N[i][k] * x[k]; x[i] = sum / N[i][i]; }
    Q = [[+A[0], +A[1]]];
    for (i = 1; i < m; i++) {
      if (tanFix && i === 1) Q.push([A[0] + x[0] * u0[0], A[1] + x[0] * u0[1]]);
      else if (tanFix && i === m - 1) Q.push([B[0] - x[1] * u1[0], B[1] - x[1] * u1[1]]);
      else Q.push([x[col(i)], x[col(i) + 1]]);
    }
    Q.push([+B[0], +B[1]]);
    return Q;
  }
  // splineGeom of a style spline: one exact cubic span (degree ≤ 3, lower degrees elevated) or 8·n C1 Hermite cubic
  // spans; knots evenly spaced over about its length (the mean of its chord and its control polygon's length)
  function styleGeom(e) {
    var P = (e.pts || []).map(function (p) { return [+p[0], +p[1]]; }), n = P.length - 1, i;
    if (n < 1) return null;
    var poly = 0;
    for (i = 0; i < n; i++) poly += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    var L = Math.max((poly + Math.hypot(P[n][0] - P[0][0], P[n][1] - P[0][1])) / 2, 1e-9), bez = [], knots = [];
    if (n <= 3) { bez.push(bzDegree(P, 3)); knots = [0, L]; }
    else {
      var N = 8 * n;
      for (i = 0; i <= N; i++) knots.push(L * i / N);
      for (i = 0; i < N; i++) {
        var a = i / N, b = (i + 1) / N, h = (b - a) / 3, p0 = bzPoint(P, a), p3 = bzPoint(P, b), d0 = bzDeriv(P, a), d3 = bzDeriv(P, b);
        bez.push([p0, [p0[0] + h * d0[0], p0[1] + h * d0[1]], [p3[0] - h * d3[0], p3[1] - h * d3[1]], p3]);
      }
    }
    return { bez: bez, knots: knots, closed: false, style: { cps: P, degree: n, L: L } };
  }
  function splineGeom(e) {
    if (isStyle(e)) return styleGeom(e);
    var P = (e.pts || []).map(function (p) { return [+p[0], +p[1]]; }), n = P.length;
    if (n < 2) return null;
    var closed = !!e.closed && n >= 3, m = closed ? n : n - 1, h = [], knots = [0], i;
    for (i = 0; i < m; i++) { var q = P[(i + 1) % n]; h.push(Math.max(Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 1e-9)); knots.push(knots[i] + h[i]); }
    // the first derivatives M_i at the points: C2 rows h_i·M_{i−1} + 2(h_{i−1} + h_i)·M_i + h_{i−1}·M_{i+1} = 3(h_i·Δ_{i−1}/h_{i−1} + h_{i−1}·Δ_i/h_i),
    // natural ends 2·M_0 + M_1 = 3·Δ_0/h_0, a tangent-driving point M_i = weight·(cos, sin)
    var a = [], b = [], c = [], rx = [], ry = [], tans = e.tans || [], rho = [];
    for (i = 0; i < n; i++) {
      var tg = tans[i];
      a.push(0); b.push(0); c.push(0); rho.push(1);
      if (tg && isFinite(+tg[0])) {
        var w = tg[1] == null || !isFinite(+tg[1]) ? 1 : +tg[1], an = +tg[0] * Math.PI / 180;
        b[i] = 1; rx.push(w * Math.cos(an)); ry.push(w * Math.sin(an));
        if (tg[2] != null && isFinite(+tg[2]) && w !== 0) rho[i] = +tg[2] / w;   // rfAK: the arriving span's speed over the leaving one's
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
        var ro = k === 0 ? rho[o] : 1;   // rfAK: the first span arrives at point 1 at its own speed
        Mx[k] = n === 2 ? dx / 3 : (dx - ro * Mx[o]) / 2; My[k] = n === 2 ? dy / 3 : (dy - ro * My[o]) / 2;
      });
    } else {
      // rfAK: row r's c[r] multiplies M_{r+1} as the end of span r: its arriving speed
      for (i = 0; i < n; i++) if (rho[i] !== 1 && (closed || i > 0)) c[(i + n - 1) % n] *= rho[i];
      Mx = closed ? cyclicSolve(a, b, c, rx) : triSolve(a, b, c, rx); My = closed ? cyclicSolve(a, b, c, ry) : triSolve(a, b, c, ry);
    }
    for (i = 0; i < m; i++) {
      var p0 = P[i], p3 = P[(i + 1) % n], k = h[i] / 3, j = (i + 1) % n, kj = k * rho[j];
      bez.push([p0, [p0[0] + k * Mx[i], p0[1] + k * My[i]], [p3[0] - kj * Mx[j], p3[1] - kj * My[j]], p3]);
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
      case 'text': return textPolylines(e);   // sketch-text: open strokes (Etch) or closed outlines (Cut)
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
      case 'text': { var to = e.mode === 'outline' ? textOutline(e) : null; return to ? to.curves.map(function (c) { return { c: c.c.slice(), r: c.r, a0: c.a0, a1: c.a1, full: c.full, step: c.step }; }) : []; }
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
      case 'text': return [textAnchor(e)];   // sketch-text: the insertion point only
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

  // rfAC: where two closed loops of a profile cross each other -> point | null. Loops that only touch (a circle tangent
  // to an edge, two contours sharing an edge or a corner, a hole wholly inside) do not cross. Two tests: a proper
  // crossing of two edges, and (for crossings that land on vertices, as a circle centred on a corner does: its chord
  // ends lie on the corner's edges) one loop having vertices strictly inside and strictly outside the other.
  function loopBox(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }
  function onPolyEdge(q, pts, tol) {
    for (var i = 0, n = pts.length; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n], vx = b[0] - a[0], vy = b[1] - a[1], ll = vx * vx + vy * vy;
      var t = ll > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / ll)) : 0;
      if (Math.abs(a[0] + vx * t - q[0]) <= tol && Math.abs(a[1] + vy * t - q[1]) <= tol) return true;
    }
    return false;
  }
  function loopsCross(A, B, ba, bb, tol) {
    var na = A.length, nb = B.length, i, j;
    for (i = 0; i < na; i++) {
      var a = A[i], b = A[(i + 1) % na];
      if (Math.max(a[0], b[0]) < bb[0] - tol || Math.min(a[0], b[0]) > bb[2] + tol || Math.max(a[1], b[1]) < bb[1] - tol || Math.min(a[1], b[1]) > bb[3] + tol) continue;
      for (j = 0; j < nb; j++) {
        var c = B[j], d = B[(j + 1) % nb];
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.min(a[0], b[0]) > Math.max(c[0], d[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.min(a[1], b[1]) > Math.max(c[1], d[1])) continue;
        var x = segCross(a, b, c, d);
        if (x) return x;
      }
    }
    function mixed(P, Q, bq) {
      var st = P.map(function (p) {
        if (p[0] < bq[0] - tol || p[0] > bq[2] + tol || p[1] < bq[1] - tol || p[1] > bq[3] + tol) return 'out';
        if (onPolyEdge(p, Q, tol)) return 'on';
        return pointInPoly(p, Q) ? 'in' : 'out';
      });
      if (st.indexOf('in') < 0 || st.indexOf('out') < 0) return null;
      // the crossing: the vertex on Q between an inside and an outside run, else the middle of the edge that jumps
      var n = P.length, start = st.indexOf('in'), last = start;
      for (var k = 1; k <= n; k++) {
        var idx = (start + k) % n;
        if (st[idx] === 'on') continue;
        if (st[idx] === 'out') {
          var prev = (idx - 1 + n) % n;
          if (st[prev] === 'on') return P[prev].slice();
          return [(P[last][0] + P[idx][0]) / 2, (P[last][1] + P[idx][1]) / 2];
        }
        last = idx;
      }
      return null;
    }
    return mixed(A, B, bb) || mixed(B, A, ba);
  }
  // Marks loops that cross another loop: loop.meet = the crossing point on both, loop.meetInner on the smaller of the two
  // (the circle that strays over the outline: the sketch DXF keeps it on HOLES). checkProfile then refuses the profile.
  function markLoopCrossings(out) {
    if (out.length < 2) return;
    var span = 0;
    out.forEach(function (l) { l.pts.forEach(function (p) { span = Math.max(span, Math.abs(p[0]), Math.abs(p[1])); }); });
    var tol = 1e-7 * (1 + span), boxes = out.map(function (l) { return loopBox(l.pts); });
    for (var i = 0; i < out.length; i++) {
      for (var j = i + 1; j < out.length; j++) {
        var bi = boxes[i], bj = boxes[j];
        if (bi[2] < bj[0] - tol || bj[2] < bi[0] - tol || bi[3] < bj[1] - tol || bj[3] < bi[1] - tol) continue;
        var x = loopsCross(out[i].pts, out[j].pts, bi, bj, tol);
        if (!x) continue;
        if (!out[i].meet) out[i].meet = x;
        if (!out[j].meet) out[j].meet = x;
        if (Math.abs(signedArea(out[i].pts)) <= Math.abs(signedArea(out[j].pts))) out[i].meetInner = true; else out[j].meetInner = true;
      }
    }
  }

  // Throws when any loop of a profile crosses itself or another loop (SolidWorks: "Sketch contours intersect" — the
  // feature is refused rather than built from part of the sketch); builders call it before making solids from the loops.
  function checkProfile(profile) {
    (profile.loops || []).forEach(function (l) {
      if (l.cross) throw new Error('Sketch profile crosses itself near (' + _.fmt(l.cross[0]) + ', ' + _.fmt(l.cross[1]) + '). Trim or move the entities so the contour does not self-intersect.');
    });
    (profile.loops || []).forEach(function (l) {
      if (l.meet) throw new Error('Sketch contours intersect near (' + _.fmt(l.meet[0]) + ', ' + _.fmt(l.meet[1]) + '): a closed contour crosses another one. Move it clear of the other contour, or trim both so they make one contour.');
    });
  }

  // -> { loops: [{pts, hole, depth, cross?, meet?, meetInner?}], warnings }. A loop with `cross` (a self-intersection
  // point) or `meet` (where it crosses another loop; markLoopCrossings) is kept for display but every feature built
  // from the profile errors through checkProfile.
  // Loops made of chords of circles and arcs keep the exact curves: profile.curves lists them ({ c, r, a0, a1, full,
  // step }, sketch coordinates) and loop.seg[i] is the curve index of segment i -> i+1 (-1 straight), absent when the
  // loop has no curved segment.
  // Splines and ellipses (area-true points, see areaTrue) are listed in profile.free ({ t: 'spline', bez, knots,
  // closed } | { t: 'ellipse', cx, cy, rx, ry, rot, full }) with loop.fseg[i] = [free index, parameter at i, at i+1]
  // for each segment on one (-1 elsewhere): OpenCascade builds them as true B-spline / ellipse edges.
  function sketchProfile(sketch) {
    var loops = [], chains = [], warnings = [], curves = [], free = [];
    syncTextPaths(sketch);   // sketch-text: text along a line / arc follows it
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || noProfileEntity(sketch, e)) return;   // sketch-layers: ETCH / BEND make no region
      if (e.t === 'line' && e.infinite) return;   // sketch-refine: an infinite line (or ray) bounds no region
      if (e.t === 'text' && e.mode !== 'outline') return;   // sketch-text: single-stroke (Etch) text is open marking, never a region
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
    markLoopCrossings(out);   // rfAC: a hole circle over the outline is refused (checkProfile), never dropped
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
        if (e.style) out.style = true;   // rfAH: a style spline's control polygon mirrors: the mirrored curve exactly
        if (e.tans) out.tans = e.tans.map(function (tg) { return tg ? [2 * phi - tg[0]].concat(tg.slice(1)) : null; });
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
      case 'text': {
        // sketch-text: a reflection is Rot(2φ − rot) · Flip vertical, so the copy turns to 2φ − rot and flips; text along
        // a curve keeps its (mirrored) curve, flips, and runs the other way round an arc (see textLayout)
        out = JSON.parse(JSON.stringify(e));
        var ti = m(e.x, e.y);
        out.x = ti[0]; out.y = ti[1]; out.rot = normDeg(2 * phi - (+e.rot || 0));
        if (e.flipV) delete out.flipV; else out.flipV = true;
        if (e.path) {
          delete out.path.e;   // the copy does not follow the original curve
          var g = e.path.g;
          if (g && g.t === 'line') { var g1 = m(g.x1, g.y1), g2 = m(g.x2, g.y2); out.path.g = { t: 'line', x1: g1[0], y1: g1[1], x2: g2[0], y2: g2[1] }; }
          else if (g && g.t === 'arc') {
            var gc = m(g.cx, g.cy), b0 = 2 * phi - g.a1, b1 = 2 * phi - g.a0;
            while (b0 < 0) { b0 += 360; b1 += 360; }
            while (b0 >= 360) { b0 -= 360; b1 -= 360; }
            out.path.g = { t: 'arc', cx: gc[0], cy: gc[1], r: g.r, a0: b0, a1: b1 };
            if (e.path.flip) delete out.path.flip; else out.path.flip = true;
          } else if (g && (g.t === 'spline' || g.t === 'ellipse' || g.t === 'pellipse')) {
            // sketch-text2: the curve mirrors as the entity would; an ellipse's parameter runs backwards (u -> −u), so the
            // copy reads it the other way (a spline's points keep their order: no change)
            var gm = mirrorEntity(g, axis);
            delete gm.layer; delete gm.construction;
            out.path.g = gm;
            if (g.t !== 'spline') { if (e.path.flip) delete out.path.flip; else out.path.flip = true; }
          }
        }
        return out;
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
      case 'text': return transformText(e, { dx: dx, dy: dy });   // sketch-text
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
    if (e.t === 'text') throw new Error('Sketch text cannot be trimmed: edit its text, or delete it.');
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

  // ------------------------------------------------------------------ Sketch Text (sketch-text)
  // { t: 'text', x, y, str, h, rot, align: 'left' | 'center' | 'right', valign: 'baseline' | 'middle' | 'top',
  //   widthFactor (1 = 100 %), spacing (1 = the font's normal gap), lineSpacing (baseline pitch in letter heights,
  //   1.6), mode: 'stroke' | 'outline', strokeWidth (outline), stencil, bridge (outline: stencil bridges and their
  //   width), mirror (Flip horizontal), flipV (Flip vertical), path: { e: <line / arc / spline / ellipse / partial
  //   ellipse index>, g: <its geometry when last seen>, flip } }
  // The letters come from sketch-font.js (single-stroke lines and true arcs). (x, y) is the insertion point: the text
  // block is aligned on it (align / valign, as SolidWorks' Sketch Text), Flip horizontal mirrors it about the vertical
  // through it, Flip vertical about the baseline through it, then it turns by rot. Text along a curve (path, the
  // SolidWorks Curves box) ignores x, y and rot: each letter sits rigidly with its baseline on the line, or as a chord of
  // the arc (both ends of its baseline on the circle); left / center / right put the text at the curve's start, middle
  // or end. An arc is read from outside (clockwise, letters upright on its convex side); path.flip runs it the other way
  // (counter-clockwise, read from inside) and a line from its end. path.g keeps the curve's geometry: syncTextPaths
  // refreshes it from entity path.e (sketchProfile does, ui-sketch-text.js on every redraw), so a text whose curve was
  // deleted stays where it was.
  // Mode 'stroke' (Etch, the default) is open single-stroke geometry: drawn, exported to DXF as LINE / ARC on its layer
  // (ETCH when it has none), never part of a profile. Mode 'outline' (Cut) is each stroke offset by strokeWidth / 2 into a
  // capsule (an arc into an arc slot, a full circle into a ring), all of them united (textUnion) into closed loops that
  // the profile builder takes like any other: an O keeps its island, the round ends stay true arcs (exact volumes:
  // where the union cuts a round end, trueArcs lays its chords again on the true circle between the exact crossings).
  // Text along a spline, ellipse or partial ellipse (sketch-text2; SolidWorks' Sketch Text follows any sketch curve):
  // each letter's baseline is a chord of the curve from its place by length along it (freePath), the letters upright
  // on the left of the reading direction, later lines offset square to the curve. A spline reads from its first point
  // to its last (path.flip: from the last back); a partial ellipse as an arc, clockwise from its a1 end with the letters
  // outside (flip: counter-clockwise from a0, inside); a whole ellipse clockwise from the end of its minor axis at
  // −90° (the bottom when it is not turned), so centred text sits outside across the top (flip: counter-clockwise from
  // +90°, centred text inside across the bottom, as on a seal).
  // Stencil (sketch-text2, Cut text only): every island the outline leaves (the centre of an O, A, B, 0, 8, a, e, @ …:
  // a hole of the letter's union) stays attached by bridges `bridge` wide (default: the stroke width) cut across the
  // strokes round it — one rectangle through the island from the letter's outside above it to its outside below it,
  // or left to right when the counter is narrower than two bridges and taller than wide (textBridges) — so cut-through
  // part numbers keep their centres on the laser.
  function normDeg(a) { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-9 ? 0 : a; }
  var TEXT_PATH_TYPES = ['line', 'arc', 'spline', 'ellipse', 'pellipse'];
  function textPathGeom(e) {
    var g = e && e.path && e.path.g;
    if (!g) return null;
    if (g.t === 'line' && Math.hypot(g.x2 - g.x1, g.y2 - g.y1) > 1e-12) return g;
    if (g.t === 'arc' && g.r > 0 && g.a1 - g.a0 > 1e-9) return g;
    if (g.t === 'spline' && g.pts && g.pts.length >= 2) return g;
    if ((g.t === 'ellipse' || g.t === 'pellipse') && g.rx > 0 && g.ry > 0 && (g.t === 'ellipse' || g.a1 - g.a0 > 1e-9)) return g;
    return null;
  }
  // ---- text along a spline / ellipse: the curve by its length (sketch-text2)
  // freePath(g, flip) -> { L, closed, at(s) -> { p, d } } or null: the path geometry g (a spline, ellipse or partial
  // ellipse, as its entity) by length s along it in the reading direction (see above; flip reverses it), from where the
  // reading starts, d the unit tangent that way; past an open curve's ends it runs on along its end tangents, round a
  // closed one it goes on round. The parameter is SketchSolver.freeCurve's (a spline's span index plus the span's
  // Bézier parameter, an ellipse's parameter angle); lengths are |dP/dt| integrated (5-point Gauss-Legendre per
  // sample, Newton for the inverse).
  var GL5 = [[-0.906179845938664, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891]];
  function freePath(g, flip) {
    var pt, d1, t0, t1, closed, N;
    if (g.t === 'spline') {
      var sg = splineGeom(g);
      if (!sg || !sg.bez.length) return null;
      var m = sg.bez.length;
      var span = function (t) { var j = Math.max(0, Math.min(m - 1, Math.floor(t))); return { B: sg.bez[j], s: t - j }; };
      pt = function (t) { var q = span(t); return bezPoint(q.B, q.s); };
      d1 = function (t) { var q = span(t); return bezDeriv(q.B, q.s); };
      t0 = 0; t1 = m; closed = sg.closed; N = 16 * m;
    } else {
      if (!(g.rx > 0) || !(g.ry > 0)) return null;
      var full = g.t === 'ellipse', r = (+g.rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
      t0 = full ? 0 : +g.a0 * Math.PI / 180; t1 = full ? 2 * Math.PI : +g.a1 * Math.PI / 180;
      if (!(t1 > t0)) return null;
      pt = function (u) { return ellipsePoint(g, u); };
      d1 = function (u) { var x = -g.rx * Math.sin(u), y = g.ry * Math.cos(u); return [cr * x - sr * y, sr * x + cr * y]; };
      closed = full; N = Math.max(32, Math.ceil(128 * (t1 - t0) / (2 * Math.PI)));
    }
    function speed(t) { var d = d1(t); return Math.hypot(d[0], d[1]); }
    function seg(a, b) { var h = (b - a) / 2, c = (a + b) / 2, s = 0; GL5.forEach(function (q) { s += q[1] * speed(c + h * q[0]); }); return s * h; }
    var ts = [], cum = [0], i;
    for (i = 0; i <= N; i++) ts.push(t0 + (t1 - t0) * i / N);
    for (i = 0; i < N; i++) cum.push(cum[i] + seg(ts[i], ts[i + 1]));
    var L = cum[N];
    if (!(L > 0)) return null;
    function param(s) {   // the parameter at length s (0..L) from t0
      var lo = 0, hi = N;
      while (hi - lo > 1) { var md = (lo + hi) >> 1; if (cum[md] <= s) lo = md; else hi = md; }
      var ta = ts[lo], tb = ts[lo + 1], want = s - cum[lo], span0 = cum[lo + 1] - cum[lo], t = ta + (tb - ta) * (span0 > 0 ? want / span0 : 0);
      for (var it = 0; it < 8; it++) {
        var v = speed(t);
        if (!(v > 1e-300)) break;
        var nt = Math.max(ta, Math.min(tb, t - (seg(ta, t) - want) / v));
        if (Math.abs(nt - t) <= 1e-15 * Math.max(1, Math.abs(t))) { t = nt; break; }
        t = nt;
      }
      return t;
    }
    // reading backwards along the parameter (ellipses unless flipped, splines when flipped), from base (the length from
    // t0 to where the reading starts: an end, or a whole ellipse's minor axis end at −90° / +90°)
    var back = g.t === 'spline' ? !!flip : !flip, base = back ? L : 0;
    if (closed && g.t === 'ellipse') {
      var u0 = back ? 1.5 * Math.PI : 0.5 * Math.PI, k0 = Math.min(N - 1, Math.floor(u0 / (t1 - t0) * N));
      base = cum[k0] + seg(ts[k0], u0);
    }
    var sgn = back ? -1 : 1;
    function at(s) {
      if (!closed && (s < 0 || s > L)) {
        var e0 = at(s < 0 ? 0 : L), ex = s < 0 ? s : s - L;
        return { p: [e0.p[0] + e0.d[0] * ex, e0.p[1] + e0.d[1] * ex], d: e0.d };
      }
      var q = base + sgn * s;
      if (closed) { q = q % L; if (q < 0) q += L; }
      var t = param(Math.max(0, Math.min(L, q))), d = d1(t), l = Math.hypot(d[0], d[1]) || 1;
      return { p: pt(t), d: [sgn * d[0] / l, sgn * d[1] / l] };
    }
    return { L: L, closed: closed, at: at };
  }
  // a rigid map (rotation, maybe with one reflection) p -> [a·x + b·y + tx, c·x + d·y + ty] applied to a font stroke
  function mapStroke(s, M) {
    function P(x, y) { return [M.a * x + M.b * y + M.tx, M.c * x + M.d * y + M.ty]; }
    if (s.t === 'line') { var p = P(s.x1, s.y1), q = P(s.x2, s.y2); return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }
    if (s.t === 'poly') return { t: 'poly', pts: s.pts.map(function (q) { return P(q[0], q[1]); }), closed: !!s.closed };
    var c = P(s.cx, s.cy), det = M.a * M.d - M.b * M.c, sweep = s.a1 - s.a0;
    function ang(a) { var r = a * Math.PI / 180, x = Math.cos(r), y = Math.sin(r); return Math.atan2(M.c * x + M.d * y, M.a * x + M.b * y) * 180 / Math.PI; }
    var a0 = normDeg(det > 0 ? ang(s.a0) : ang(s.a1));
    return { t: 'arc', cx: c[0], cy: c[1], r: s.r, a0: a0, a1: a0 + sweep };
  }
  // textLayout(e) -> { strokes (sketch coordinates), glyphs: [{ ch, p0, p1, blank, s0, s1, u, v }] (each letter's
  // baseline from its left end p0 to p1, as placed; its strokes strokes[s0 .. s1 − 1]; u, v: where the letter's own x
  // and y axes point in the sketch, unit vectors), width, height, anchor }
  function textLayout(e) {
    var key = 'L' + textKey(e), hit = textCache[key];
    if (hit) return hit;
    var out = { strokes: [], glyphs: [], width: 0, height: 0, anchor: [+e.x || 0, +e.y || 0] };
    if (typeof SketchFont === 'undefined' || !e || e.str == null) return textRemember(key, out);
    var lay = SketchFont.layout(e.str, { height: +e.h > 0 ? +e.h : 1, widthFactor: e.widthFactor, charSpacing: e.spacing, lineSpacing: e.lineSpacing, align: e.align, valign: e.valign });
    var mx = e.mirror ? -1 : 1, fy = e.flipV ? -1 : 1, g = textPathGeom(e), fp = null;
    out.width = lay.width; out.height = lay.height;
    if (g && g.t !== 'line' && g.t !== 'arc') { fp = freePath(g, !!e.path.flip); if (!fp) g = null; }
    if (!g) {
      var r = (+e.rot || 0) * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r), x0 = +e.x || 0, y0 = +e.y || 0;
      var M = { a: cr * mx, b: -sr * fy, c: sr * mx, d: cr * fy, tx: x0, ty: y0 }, s0 = 0;
      out.strokes = lay.strokes.map(function (s) { return mapStroke(s, M); });
      lay.glyphs.forEach(function (gl) {
        var p0 = [M.a * gl.x + M.b * gl.y + M.tx, M.c * gl.x + M.d * gl.y + M.ty], p1 = [M.a * (gl.x + gl.w) + M.b * gl.y + M.tx, M.c * (gl.x + gl.w) + M.d * gl.y + M.ty];
        out.glyphs.push({ ch: gl.ch, p0: p0, p1: p1, blank: !gl.strokes.length, s0: s0, s1: s0 + gl.strokes.length, u: [M.a, M.c], v: [M.b, M.d] });
        s0 += gl.strokes.length;
      });
      return textRemember(key, out);
    }
    // a glyph placed with its baseline from A along the unit d (its local up the left normal of d, flipped by Flip
    // vertical; Flip horizontal mirrors it within its box w long)
    function placeGlyph(gl, A, d, w) {
      var n = [-d[1], d[0]], s0 = out.strokes.length;
      // glyph-local (u, v) -> A + d·(mx·u + (mirrored ? w : 0)) + n·(fy·v)
      var M2 = { a: d[0] * mx, b: n[0] * fy, c: d[1] * mx, d: n[1] * fy, tx: A[0] + (mx < 0 ? d[0] * w : 0), ty: A[1] + (mx < 0 ? d[1] * w : 0) };
      gl.strokes.forEach(function (s) { out.strokes.push(mapStroke(s, M2)); });
      out.glyphs.push({ ch: gl.ch, p0: A, p1: [A[0] + d[0] * w, A[1] + d[1] * w], blank: !gl.strokes.length, s0: s0, s1: out.strokes.length, u: [M2.a, M2.c], v: [M2.b, M2.d] });
    }
    if (fp) {
      // along a spline / ellipse: the letter box [bx0, bx0 + w] from length anchor + bx0, its baseline the chord to the
      // point of the (offset) curve w away
      var La = fp.L, an = e.align === 'center' ? La / 2 : e.align === 'right' ? La : 0;
      out.anchor = fp.at(an).p;
      lay.glyphs.forEach(function (gl) {
        var w = gl.w, bx0 = mx > 0 ? gl.x : -gl.x - w, gy = fy * gl.y, sa = an + bx0, a0 = fp.at(sa);
        var Q = function (s) { var q = fp.at(s); return gy ? [q.p[0] - q.d[1] * gy, q.p[1] + q.d[0] * gy] : q.p; };
        var A = Q(sa), d = a0.d;
        if (w > 0) {
          var f = function (s) { var q = Q(s); return Math.hypot(q[0] - A[0], q[1] - A[1]) - w; }, lo = sa, hi = sa + w, k = 0;
          while (f(hi) < 0 && k++ < 8) { lo = hi; hi += w; }
          if (f(hi) >= 0) {
            for (var it = 0; it < 64 && hi - lo > 1e-15 * Math.max(1, Math.abs(hi)); it++) { var md = (lo + hi) / 2; if (f(md) < 0) lo = md; else hi = md; }
            var B = Q(hi), bl = Math.hypot(B[0] - A[0], B[1] - A[1]);
            if (bl > 1e-12 * w) d = [(B[0] - A[0]) / bl, (B[1] - A[1]) / bl];
          }
        }
        placeGlyph(gl, A, d, w);
      });
      return textRemember(key, out);
    }
    // along a line or an arc: the letter box [bx0, bx0 + w] on baseline gy (after the flips) placed on the curve one by one
    var fl = !!e.path.flip, line = g.t === 'line', S, T, N, L, C, R, ts, dir;
    if (line) {
      var A0 = fl ? [g.x2, g.y2] : [g.x1, g.y1], A1 = fl ? [g.x1, g.y1] : [g.x2, g.y2];
      L = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]); S = A0; T = [(A1[0] - A0[0]) / L, (A1[1] - A0[1]) / L]; N = [-T[1], T[0]];
    } else {
      C = [g.cx, g.cy]; R = g.r; L = R * (g.a1 - g.a0) * Math.PI / 180;
      ts = (fl ? g.a0 : g.a1) * Math.PI / 180; dir = fl ? 1 : -1;   // clockwise from the a1 end (outside), or counter-clockwise from a0
    }
    var anchor = e.align === 'center' ? L / 2 : e.align === 'right' ? L : 0;
    out.anchor = line ? [S[0] + T[0] * anchor, S[1] + T[1] * anchor] : [C[0] + R * Math.cos(ts + dir * anchor / R), C[1] + R * Math.sin(ts + dir * anchor / R)];
    lay.glyphs.forEach(function (gl) {
      var w = gl.w, bx0 = mx > 0 ? gl.x : -gl.x - w, gy = fy * gl.y, A, d;
      if (line) { A = [S[0] + T[0] * (anchor + bx0) + N[0] * gy, S[1] + T[1] * (anchor + bx0) + N[1] * gy]; d = T; }
      else {
        var Rl = R - dir * gy;   // outside reading: up is away from the centre; inside: towards it
        if (!(Rl > 1e-9 * R)) return;
        var ta = ts + dir * (anchor / R + bx0 / Rl), tb = ta + dir * 2 * Math.asin(Math.min(1, w / (2 * Rl)));
        A = [C[0] + Rl * Math.cos(ta), C[1] + Rl * Math.sin(ta)];
        var B = [C[0] + Rl * Math.cos(tb), C[1] + Rl * Math.sin(tb)], bl = Math.hypot(B[0] - A[0], B[1] - A[1]);
        d = bl > 1e-12 ? [(B[0] - A[0]) / bl, (B[1] - A[1]) / bl] : [-dir * Math.sin(ta), dir * Math.cos(ta)];
      }
      placeGlyph(gl, A, d, w);
    });
    return textRemember(key, out);
  }
  function textAnchor(e) {
    if (!textPathGeom(e)) return [+e.x || 0, +e.y || 0];
    var a = textLayout(e).anchor;
    return [a[0], a[1]];
  }
  // a small cache of laid-out texts and outlines (both are pure functions of the entity and the tessellation)
  var textCache = {}, textCacheN = 0;
  function textKey(e) {
    return JSON.stringify([e.x, e.y, e.str, e.h, e.rot, e.align, e.valign, e.widthFactor, e.spacing, e.lineSpacing, e.mode, e.strokeWidth, e.mirror, e.flipV,
      e.path ? [e.path.g, !!e.path.flip] : null, tessKey(), e.stencil ? [true, e.bridge] : null]);
  }
  function textRemember(key, v) {
    if (++textCacheN > 400) { textCache = {}; textCacheN = 1; }
    textCache[key] = v;
    return v;
  }
  // a font stroke as a polyline: lines as is, arcs tessellated as sketch arcs are
  function strokePolyline(s) {
    if (s.t === 'line') return { pts: [[s.x1, s.y1], [s.x2, s.y2]], closed: false };
    if (s.t === 'poly') return { pts: s.pts.map(function (q) { return [q[0], q[1]]; }), closed: !!s.closed };
    var sw = (s.a1 - s.a0) * Math.PI / 180, full = sw >= Math.PI * 2 - 1e-9;
    var n = full ? segsForRadius(s.r) : Math.max(4, Math.round(segsForRadius(s.r) * sw / (Math.PI * 2)));
    var pts = arcPoints(s.cx, s.cy, s.r, s.a0 * Math.PI / 180, s.a0 * Math.PI / 180 + sw, n);
    if (full) pts.pop();
    return { pts: pts, closed: full };
  }
  function textPolylines(e) {
    if (e.mode === 'outline') {
      var o = textOutline(e);
      if (o) return o.loops.map(function (l) { return { pts: l.pts.map(function (q) { return [q[0], q[1]]; }), closed: true }; });
    }
    return textLayout(e).strokes.map(strokePolyline);
  }
  // the outline width of a Cut text: strokeWidth, else 12 % of the letter height
  function textStrokeWidth(e) { return +e.strokeWidth > 0 ? +e.strokeWidth : 0.12 * (+e.h > 0 ? +e.h : 1); }

  // ---- outline (Cut) text: stroke shapes and their union
  // shapes: [{ rings: [{ pts, src }], box }] — rings[0] counter-clockwise, rings[1] (a ring stroke's hole) clockwise;
  // src[i] is what edge i -> i + 1 lies on: null (straight) or { id, c, r } (a chord of that circle). curves: the true
  // arcs ({ c, r, a0, a1, full, step }, as entityCurves) whose chords the rings are made of.
  function strokeShapes(strokes, hw) {
    var shapes = [], curves = [], uid = 0;
    function box(pts) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
    function circleRing(c, r, ccw) {
      var n = segsForRadius(r), pts = arcPoints(c[0], c[1], r, 0, Math.PI * 2, n), src = { id: uid++, c: c, r: r };
      pts.pop();
      curves.push({ c: c, r: r, a0: 0, a1: Math.PI * 2, full: true, step: Math.PI * 2 / n });
      if (!ccw) pts.reverse();
      return { pts: pts, src: pts.map(function () { return src; }) };
    }
    function capsule(a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 1e-12) { var rg = circleRing(a, hw, true); shapes.push({ rings: [rg], box: box(rg.pts) }); return; }
      var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(hw) / 2));
      var c2 = { id: uid++, c: b, r: hw }, c1 = { id: uid++, c: a, r: hw }, src = [], i;
      var pts = arcPoints(b[0], b[1], hw, ang - Math.PI / 2, ang + Math.PI / 2, segs).concat(arcPoints(a[0], a[1], hw, ang + Math.PI / 2, ang + 3 * Math.PI / 2, segs));
      for (i = 0; i < segs; i++) src.push(c2);
      src.push(null);
      for (i = 0; i < segs; i++) src.push(c1);
      src.push(null);
      curves.push({ c: b, r: hw, a0: ang - Math.PI / 2, a1: ang + Math.PI / 2, full: false, step: Math.PI / segs },
        { c: a, r: hw, a0: ang + Math.PI / 2, a1: ang + 3 * Math.PI / 2, full: false, step: Math.PI / segs });
      shapes.push({ rings: [{ pts: pts, src: src }], box: box(pts) });
    }
    function chain(pts) { for (var i = 0; i + 1 < pts.length; i++) capsule(pts[i], pts[i + 1]); }
    strokes.forEach(function (s) {
      if (s.t === 'line') { capsule([s.x1, s.y1], [s.x2, s.y2]); return; }
      if (s.t === 'poly') { chain(s.closed ? s.pts.concat([s.pts[0]]) : s.pts); return; }
      var sweep = s.a1 - s.a0, c = [s.cx, s.cy];
      if (!(s.r - hw > 1e-6 * s.r)) { chain(strokePolyline(s).pts.concat(sweep >= 360 - 1e-9 ? [strokePolyline(s).pts[0]] : [])); return; }   // tighter than the stroke: a chain of capsules
      if (sweep >= 360 - 1e-9) {   // a full circle: the ring between r ± w/2
        var outer = circleRing(c, s.r + hw, true), inner = circleRing(c, s.r - hw, false);
        shapes.push({ rings: [outer, inner], box: box(outer.pts) });
        return;
      }
      // an arc: arc slots of at most 180° each (a longer one could close on itself)
      var k = Math.max(1, Math.ceil(sweep / 180 - 1e-9));
      for (var j = 0; j < k; j++) {
        var as = aslotArcs({ cx: s.cx, cy: s.cy, r: s.r, a0: s.a0 + sweep * j / k, a1: s.a0 + sweep * (j + 1) / k, w: 2 * hw });
        if (!as) continue;
        var ring = [], src = [];
        as.forEach(function (cv, q) {
          var p = cv.back ? arcPoints(cv.c[0], cv.c[1], cv.r, cv.a1, cv.a0, cv.n) : arcPoints(cv.c[0], cv.c[1], cv.r, cv.a0, cv.a1, cv.n);
          ring = ring.concat(q ? p.slice(1, q === 3 ? -1 : undefined) : p);
          var sr = { id: uid++, c: cv.c, r: cv.r };
          for (var m = 0; m < cv.n; m++) src.push(sr);
          curves.push({ c: cv.c, r: cv.r, a0: cv.a0, a1: cv.a1, full: false, step: (cv.a1 - cv.a0) / cv.n });
        });
        shapes.push({ rings: [{ pts: ring, src: src }], box: box(ring) });
      }
    });
    return { shapes: shapes, curves: curves };
  }
  // The union of the shapes as closed loops [{ pts, src }] (outer boundaries counter-clockwise, holes clockwise). Every
  // edge is split where it crosses (or touches) an edge of another shape; a piece is kept when the union is on one side
  // of it and not the other (probed a hair off its midpoint), oriented with the union on its left; pieces shared by two
  // shapes in the same direction count once; the pieces are then chained (at a vertex where two boundaries touch, the
  // sharpest right turn, so touching loops stay apart). A shape with `sub` (a stencil bridge) is taken away instead: the
  // region is in a shape and in no `sub` shape, and the bridges' edges join the pool the same way.
  function textUnion(shapes, scale) {
    var snapTol = 1e-10 * Math.max(1, scale), pool = {}, nid = 0, tolLen = 1e-10 * Math.max(1, scale), probe = 1e-8 * Math.max(1, scale);
    function snap(p) {
      var k = Math.round(p[0] / snapTol) + ',' + Math.round(p[1] / snapTol), q = pool[k];
      if (!q) { q = pool[k] = [p[0], p[1]]; q.id = nid++; }
      return q;
    }
    var edgesBy = shapes.map(function () { return []; });
    shapes.forEach(function (sh, si) {
      sh.rings.forEach(function (rg) {
        var P = rg.pts.map(snap), n = P.length;
        for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; if (a !== b) edgesBy[si].push({ a: a, b: b, src: rg.src[i], cuts: [] }); }
      });
    });
    function boxesMeet(A, B, t) { return A[0] <= B[2] + t && B[0] <= A[2] + t && A[1] <= B[3] + t && B[1] <= A[3] + t; }
    function eBox(E) { return [Math.min(E.a[0], E.b[0]), Math.min(E.a[1], E.b[1]), Math.max(E.a[0], E.b[0]), Math.max(E.a[1], E.b[1])]; }
    function cut(E, t, p) { E.cuts.push([t, p]); }
    function meet(E1, E2) {
      var a = E1.a, b = E1.b, c = E2.a, d = E2.b;
      var rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], qx = c[0] - a[0], qy = c[1] - a[1];
      var L1 = Math.hypot(rx, ry), L2 = Math.hypot(sx, sy), den = rx * sy - ry * sx, e1 = tolLen / L1, e2 = tolLen / L2;
      if (Math.abs(den) > 1e-12 * L1 * L2) {
        var t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        if (t < -e1 || t > 1 + e1 || u < -e2 || u > 1 + e2) return;
        var inT = t > e1 && t < 1 - e1, inU = u > e2 && u < 1 - e2;
        if (!inT && !inU) return;
        var p = inT ? snap([a[0] + rx * t, a[1] + ry * t]) : t <= e1 ? a : b;
        if (inT && !inU) p = u <= e2 ? c : d;   // an end of E2 on E1
        if (inT) cut(E1, t, p);
        if (inU) cut(E2, u, p);
        return;
      }
      if (Math.abs(qx * ry - qy * rx) / L1 > tolLen) return;   // parallel, apart
      // collinear: each is cut at the other's ends that fall inside it
      [c, d].forEach(function (p) { var t = ((p[0] - a[0]) * rx + (p[1] - a[1]) * ry) / (L1 * L1); if (t > e1 && t < 1 - e1) cut(E1, t, p); });
      [a, b].forEach(function (p) { var u = ((p[0] - c[0]) * sx + (p[1] - c[1]) * sy) / (L2 * L2); if (u > e2 && u < 1 - e2) cut(E2, u, p); });
    }
    for (var i = 0; i < shapes.length; i++) for (var j = i + 1; j < shapes.length; j++) {
      if (!boxesMeet(shapes[i].box, shapes[j].box, tolLen)) continue;
      var Bj = edgesBy[j].map(eBox);
      edgesBy[i].forEach(function (E1) {
        var b1 = eBox(E1);
        edgesBy[j].forEach(function (E2, k) { if (boxesMeet(b1, Bj[k], tolLen)) meet(E1, E2); });
      });
    }
    function inShape(sh, p) {
      var b = sh.box;
      if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) return false;
      return pointInPoly(p, sh.rings[0].pts) && !(sh.rings[1] && pointInPoly(p, sh.rings[1].pts));
    }
    var adds = shapes.filter(function (sh) { return !sh.sub; }), subs = shapes.filter(function (sh) { return sh.sub; });
    function inside(p) {
      var s, hitAdd = false;
      for (s = 0; s < adds.length && !hitAdd; s++) if (inShape(adds[s], p)) hitAdd = true;
      if (!hitAdd) return false;
      for (s = 0; s < subs.length; s++) if (inShape(subs[s], p)) return false;
      return true;
    }
    var kept = [], seen = {};
    edgesBy.forEach(function (list) {
      list.forEach(function (E) {
        var pts = [E.a];
        E.cuts.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (c) { if (c[1] !== pts[pts.length - 1]) pts.push(c[1]); });
        if (E.b !== pts[pts.length - 1]) pts.push(E.b);
        for (var k = 0; k + 1 < pts.length; k++) {
          var p = pts[k], q = pts[k + 1], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
          if (L < tolLen) continue;
          var m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], nx = -dy / L * probe, ny = dx / L * probe;
          var inL = inside([m[0] + nx, m[1] + ny]), inR = inside([m[0] - nx, m[1] - ny]);
          if (inL === inR) continue;
          var from = inL ? p : q, to = inL ? q : p, key = from.id + '>' + to.id;
          if (seen[key]) continue;
          seen[key] = true;
          kept.push({ a: from, b: to, src: E.src, used: false });
        }
      });
    });
    var byStart = {};
    kept.forEach(function (E) { (byStart[E.a.id] = byStart[E.a.id] || []).push(E); });
    var loops = [];
    kept.forEach(function (E0) {
      if (E0.used) return;
      var pts = [], src = [], cur = E0, guard = 0, closed = false;
      while (cur && guard++ <= kept.length) {
        cur.used = true; pts.push([cur.a[0], cur.a[1]]); src.push(cur.src);
        if (cur.b === E0.a) { closed = true; break; }
        var cands = (byStart[cur.b.id] || []).filter(function (x) { return !x.used; });
        if (cands.length > 1) {
          var din = [cur.b[0] - cur.a[0], cur.b[1] - cur.a[1]];
          cands.sort(function (x, y) { return turn(din, x) - turn(din, y); });
        }
        cur = cands[0];
      }
      if (closed && pts.length >= 3 && Math.abs(signedArea(pts)) > tolLen * tolLen) loops.push({ pts: pts, src: src });
    });
    function turn(din, E) { var o = [E.b[0] - E.a[0], E.b[1] - E.a[1]]; return Math.atan2(din[0] * o[1] - din[1] * o[0], din[0] * o[0] + din[1] * o[1]); }
    return loops;
  }
  // textOutline(e) -> { loops: [{ pts, src }], curves, bridges } of an outline (Cut) text, or null; bridges: the stencil
  // bridges taken out (rectangles, sketch coordinates), [] without Stencil
  function textOutline(e) {
    var key = 'O' + textKey(e), hit = textCache[key];
    if (hit) return hit;
    var lay = textLayout(e), strokes = lay.strokes, hw = textStrokeWidth(e) / 2;
    if (!strokes.length) return textRemember(key, { loops: [], curves: [], bridges: [] });
    var sc = strokeShapes(strokes, hw), scale = 2 * hw, shapes = sc.shapes, bridges = [];
    sc.shapes.forEach(function (s) { scale = Math.max(scale, Math.abs(s.box[0]), Math.abs(s.box[1]), Math.abs(s.box[2]), Math.abs(s.box[3])); });
    if (e.stencil) {
      bridges = textBridges(lay, hw, textBridgeWidth(e), scale);
      shapes = shapes.concat(bridges.map(function (pts) { return { sub: true, rings: [{ pts: pts, src: pts.map(function () { return null; }) }], box: polyBox(pts) }; }));
    }
    var ta = trueArcs(textUnion(shapes, scale), scale);
    return textRemember(key, { loops: ta.loops, curves: sc.curves.concat(ta.curves), bridges: bridges });
  }
  // the stencil bridge width of a text: bridge, else its stroke width
  function textBridgeWidth(e) { return +e.bridge > 0 ? +e.bridge : textStrokeWidth(e); }
  function polyBox(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }
  // textBridges(lay, hw, bw, scale) -> [[4 corners, counter-clockwise]]: the stencil bridges of a laid-out text, letter
  // by letter in each letter's own frame (glyph u, v: so text that is turned, mirrored or on a curve is bridged square
  // to its letters). For each island of a letter (a hole of the union of its strokes): the bridge line runs through the
  // island's centroid (else the middle of its box), up its letter's y axis — along x when the counter is narrower than
  // two bridges and taller than wide; from the middle of the stretch of that line inside the island it goes out each
  // way through the strokes round the island to where the line leaves the letter, on the line and on both edges of
  // the bridge (the furthest of the three, then a tenth of the width more), and the bridge is that stretch bw wide.
  function textBridges(lay, hw, bw, scale) {
    var out = [], b = bw / 2, m = Math.max(0.1 * bw, 1e-9 * scale);
    lay.glyphs.forEach(function (gl) {
      if (!(gl.s1 > gl.s0)) return;
      var loops = textUnion(strokeShapes(lay.strokes.slice(gl.s0, gl.s1), hw).shapes, scale);
      var holes = loops.filter(function (l) { return signedArea(l.pts) < 0; });
      if (!holes.length) return;
      var u = gl.u, v = gl.v;
      function loc(p) { return [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]]; }
      function glob(q) { return [q[0] * u[0] + q[1] * v[0], q[0] * u[1] + q[1] * v[1]]; }
      var Lg = loops.map(function (l) { return l.pts.map(loc); });
      // where the line {coordinate ax = c} crosses the loops: the other coordinate of each crossing, sorted
      function cuts(list, ax, c) {
        var o = 1 - ax, ys = [];
        list.forEach(function (l) {
          for (var i = 0; i < l.length; i++) {
            var p = l[i], q = l[(i + 1) % l.length];
            if ((p[ax] > c) !== (q[ax] > c)) ys.push(p[o] + (q[o] - p[o]) * (c - p[ax]) / (q[ax] - p[ax]));
          }
        });
        return ys.sort(function (x, y) { return x - y; });
      }
      // from y0 along the line (dir ±1): the crossing where the line leaves the letter for good, after being in it
      function exit(ys, y0, dir) {
        var inside = ys.filter(function (y) { return y < y0; }).length % 2 === 1, seen = inside;
        var ahead = ys.filter(function (y) { return dir > 0 ? y > y0 : y < y0; });
        if (dir < 0) ahead.reverse();
        for (var i = 0; i < ahead.length; i++) {
          inside = !inside;
          if (inside) seen = true;
          else if (seen) return ahead[i];
        }
        return null;
      }
      holes.forEach(function (hl) {
        var H = hl.pts.map(loc), bb = polyBox(H), A2 = 0, cx = 0, cy = 0;
        H.forEach(function (p, i) { var q = H[(i + 1) % H.length], cr = p[0] * q[1] - q[0] * p[1]; A2 += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; });
        var cen = Math.abs(A2) > 1e-300 ? [cx / (3 * A2), cy / (3 * A2)] : [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
        var wd = bb[2] - bb[0], ht = bb[3] - bb[1], ax = wd < 2 * bw && ht > wd ? 1 : 0, o = 1 - ax;
        var c = cen[ax], hc = cuts([H], ax, c);
        if (hc.length < 2) { c = (bb[ax] + bb[ax + 2]) / 2; hc = cuts([H], ax, c); }
        if (hc.length < 2) return;
        var lo = hc[0], hi = hc[1], best = -1;
        for (var k = 0; k + 1 < hc.length; k += 2) {
          if (cen[o] >= hc[k] && cen[o] <= hc[k + 1]) { lo = hc[k]; hi = hc[k + 1]; break; }
          if (hc[k + 1] - hc[k] > best) { best = hc[k + 1] - hc[k]; lo = hc[k]; hi = hc[k + 1]; }
        }
        var mid = (lo + hi) / 2, top = -Infinity, bot = Infinity;
        [c - b, c, c + b].forEach(function (cp) {
          var ys = cuts(Lg, ax, cp), up = exit(ys, mid, 1), dn = exit(ys, mid, -1);
          if (up != null) top = Math.max(top, up);
          if (dn != null) bot = Math.min(bot, dn);
        });
        if (!isFinite(top) || !isFinite(bot)) return;
        function P(along, across) { var q = [0, 0]; q[ax] = across; q[o] = along; return glob(q); }
        var rect = [P(bot - m, c - b), P(bot - m, c + b), P(top + m, c + b), P(top + m, c - b)];
        out.push(signedArea(rect) < 0 ? rect.reverse() : rect);
      });
    });
    return out;
  }
  // trueArcs(loops, scale) -> { loops, curves }: a union's loops with the chords that came from one stroke circle (src)
  // laid again on the true circle between the exact points where it meets its neighbours (the next round end, a
  // straight side, a stencil bridge), each run evenly in chords no longer than the circle's tessellation step, with a
  // curve record of its own: an outline of whole chords of true arcs (exact volumes, DXF bulges through points on the
  // circle) instead of the partial chords the union left. A crossing that does not meet the true curves within a
  // chord's length of where the chords met (curves almost tangent) keeps its chords; a loop all on one circle as it is.
  function trueArcs(loops, scale) {
    var extra = [], eq = 1e-12 * Math.max(1, scale);
    function cid(s) { return s ? Math.round(s.c[0] / eq) + ',' + Math.round(s.c[1] / eq) + ',' + Math.round(s.r / eq) : null; }
    function onC(p, s) { return Math.abs(Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.r) <= 1e-9 * Math.max(1, s.r); }
    // the point where the line through `far` and p meets circle s, nearest p (null when the line nearly touches it:
    // under 3° between them the crossing is ill-conditioned)
    function lineCircle(far, p, s) {
      var d = [p[0] - far[0], p[1] - far[1]], f = [far[0] - s.c[0], far[1] - s.c[1]], A = d[0] * d[0] + d[1] * d[1];
      if (!(A > 0)) return null;
      var B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - s.r * s.r, disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      var sq = Math.sqrt(disc), t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A), t = Math.abs(t1 - 1) < Math.abs(t2 - 1) ? t1 : t2;
      var q = [far[0] + d[0] * t, far[1] + d[1] * t];
      if (Math.abs(d[0] * (q[0] - s.c[0]) + d[1] * (q[1] - s.c[1])) / (Math.sqrt(A) * s.r) < 0.05) return null;
      return q;
    }
    // the crossing of circles a and b nearest p (null when they nearly touch or nearly coincide: under 3° between them)
    function circleCircle(a, b, p) {
      var dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1], D = Math.hypot(dx, dy);
      if (!(D > eq) || D > a.r + b.r || D < Math.abs(a.r - b.r)) return null;
      var cosX = (a.r * a.r + b.r * b.r - D * D) / (2 * a.r * b.r);
      if (1 - cosX * cosX < 0.0025) return null;
      var a2 = (a.r * a.r - b.r * b.r + D * D) / (2 * D), h = Math.sqrt(Math.max(0, a.r * a.r - a2 * a2)), mx = a.c[0] + dx / D * a2, my = a.c[1] + dy / D * a2;
      var q1 = [mx - h * dy / D, my + h * dx / D], q2 = [mx + h * dy / D, my - h * dx / D];
      return Math.hypot(q1[0] - p[0], q1[1] - p[1]) <= Math.hypot(q2[0] - p[0], q2[1] - p[1]) ? q1 : q2;
    }
    var out = loops.map(function (l) {
      var P = l.pts, S = l.src, n = P.length, ids = S.map(cid);
      if (n < 3 || !ids.some(Boolean) || ids.every(function (x) { return x && x === ids[0]; })) return l;
      // 1. the run boundaries, moved onto the true curves
      var at = P.slice(), k, s0 = -1;
      for (k = 0; k < n; k++) {
        var ia = ids[(k + n - 1) % n], ib = ids[k];
        if (ia === ib) continue;
        if (s0 < 0) s0 = k;
        var a = ia ? S[(k + n - 1) % n] : null, b = ib ? S[k] : null, p = P[k], q = null;
        if (a && b) q = onC(p, a) && onC(p, b) ? p : circleCircle(a, b, p);
        else if (a) q = onC(p, a) ? p : lineCircle(P[(k + 1) % n], p, a);
        else q = onC(p, b) ? p : lineCircle(P[(k + n - 1) % n], p, b);
        var lim = Math.max(Math.hypot(P[(k + n - 1) % n][0] - p[0], P[(k + n - 1) % n][1] - p[1]), Math.hypot(P[(k + 1) % n][0] - p[0], P[(k + 1) % n][1] - p[1]));
        if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) <= lim) at[k] = q;
      }
      if (s0 < 0) return l;
      // 2. each run of one circle from boundary to boundary, evenly on its true arc when both ends lie on it
      var pts = [], src = [];
      for (var i = 0; i < n;) {
        var k0 = (s0 + i) % n, sr = ids[k0] ? S[k0] : null;
        if (!sr) { pts.push(at[k0]); src.push(S[k0]); i++; continue; }
        var j = i + 1;
        while (j < n && ids[(s0 + j) % n] === ids[k0]) j++;
        var A = at[k0], B = at[(s0 + j) % n], c = sr.c, r = sr.r, q2;
        if (!onC(A, sr) || !onC(B, sr)) {
          for (q2 = i; q2 < j; q2++) { pts.push(q2 === i ? A : P[(s0 + q2) % n]); src.push(sr); }
          i = j;
          continue;
        }
        var sw = 0, prev = A;
        for (q2 = i + 1; q2 <= j; q2++) {
          var cur = q2 === j ? B : P[(s0 + q2) % n], u0 = [prev[0] - c[0], prev[1] - c[1]], u1 = [cur[0] - c[0], cur[1] - c[1]];
          sw += Math.atan2(u0[0] * u1[1] - u0[1] * u1[0], u0[0] * u1[0] + u0[1] * u1[1]);
          prev = cur;
        }
        var mseg = Math.max(1, Math.ceil(Math.abs(sw) / (2 * Math.PI / segsForRadius(r)) - 1e-9)), th = Math.atan2(A[1] - c[1], A[0] - c[0]);
        pts.push(A); src.push(sr);
        for (q2 = 1; q2 < mseg; q2++) { var t = th + sw * q2 / mseg; pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); src.push(sr); }
        extra.push({ c: [c[0], c[1]], r: r, a0: Math.min(th, th + sw), a1: Math.max(th, th + sw), full: false, step: Math.abs(sw) / mseg });
        i = j;
      }
      return { pts: pts, src: src };
    });
    return { loops: out, curves: extra };
  }
  // textDxf(e) -> what a DXF writer draws for a text: { strokes } (Etch: lines, arcs, polylines) or { polys: [{ pts,
  // bulges }] } (Cut: one closed polyline per outline loop, a run of chords of one circle as a single bulged segment of
  // it — at most a half turn — so each loop is one continuous closed contour)
  function textDxf(e) {
    if (e.mode !== 'outline') return { strokes: textLayout(e).strokes.map(function (s) { return JSON.parse(JSON.stringify(s)); }) };
    var o = textOutline(e), polys = [];
    (o ? o.loops : []).forEach(function (l) {
      var n = l.pts.length, src = l.src, s0 = 0;
      while (s0 < n && src[s0] && src[(s0 + n - 1) % n] && src[s0].id === src[(s0 + n - 1) % n].id) s0++;
      if (s0 >= n) {   // the whole loop on one circle
        var c0 = src[0].c, r0 = src[0].r;
        polys.push({ circle: { c: [c0[0], c0[1]], r: r0 } });
        return;
      }
      var pts = [], bul = [];
      for (var i = 0; i < n;) {
        var a = (s0 + i) % n, sr = src[a];
        if (!sr) { pts.push(l.pts[a]); bul.push(0); i++; continue; }
        var run = [a], k = i + 1;
        while (k < n && src[(s0 + k) % n] && src[(s0 + k) % n].id === sr.id) { run.push((s0 + k) % n); k++; }
        // the signed sweep of the run about its centre, split into pieces of at most 180°
        var piece = [run[0]], sw = 0, c = sr.c;
        run.forEach(function (j, q) {
          var p = l.pts[j], p2 = l.pts[(j + 1) % n];
          var d = Math.atan2((p[0] - c[0]) * (p2[1] - c[1]) - (p[1] - c[1]) * (p2[0] - c[0]), (p[0] - c[0]) * (p2[0] - c[0]) + (p[1] - c[1]) * (p2[1] - c[1]));
          if (Math.abs(sw + d) > Math.PI + 1e-9 && q > 0) { pts.push(l.pts[piece[0]]); bul.push(Math.tan(sw / 4)); piece = [j]; sw = 0; }
          sw += d;
        });
        pts.push(l.pts[piece[0]]); bul.push(Math.tan(sw / 4));
        i = k;
      }
      polys.push({ pts: pts.map(function (q) { return [q[0], q[1]]; }), bulges: bul });
    });
    return { polys: polys };
  }
  // ---- text along a curve: keeping path.e / path.g in step with the sketch
  // pathGeomOf(src) -> the geometry a text keeps of the curve it follows (a copy of the line / arc / spline / ellipse /
  // partial ellipse's own fields), or null for any other entity
  function pathGeomOf(src) {
    if (!src || TEXT_PATH_TYPES.indexOf(src.t) < 0) return null;
    if (src.t === 'line') return { t: 'line', x1: +src.x1, y1: +src.y1, x2: +src.x2, y2: +src.y2 };
    if (src.t === 'arc') return { t: 'arc', cx: +src.cx, cy: +src.cy, r: +src.r, a0: +src.a0, a1: +src.a1 };
    if (src.t === 'spline') {
      var g = { t: 'spline', pts: (src.pts || []).map(function (p) { return [+p[0], +p[1]]; }) };
      if (src.closed) g.closed = true;
      if (src.style) g.style = true;   // rfAH
      if (src.tans) g.tans = src.tans.map(function (tg) { return tg ? [+tg[0], tg[1] == null ? 1 : +tg[1]].concat(tg[2] != null ? [+tg[2]] : []) : null; });
      if (src.local) g.local = true;
      return g;
    }
    var o = { t: src.t, cx: +src.cx, cy: +src.cy, rx: +src.rx, ry: +src.ry, rot: +src.rot || 0 };
    if (src.t === 'pellipse') { o.a0 = +src.a0; o.a1 = +src.a1; }
    return o;
  }
  // path.g from entity path.e for every text of the sketch (a path.e that no longer names a curve a text can follow is
  // dropped: the text stays where it was); -> the number of texts changed
  function syncTextPaths(sketch) {
    var E = sketch && sketch.entities, n = 0;
    if (!E) return 0;
    for (var i = 0; i < E.length; i++) {
      var e = E[i];
      if (!e || e.t !== 'text' || !e.path) continue;
      if (e.path.e == null) { if (!e.path.g) { delete e.path; n++; } continue; }
      var src = E[e.path.e], g = src && src !== e ? pathGeomOf(src) : null;
      if (!g) { delete e.path.e; if (!e.path.g) delete e.path; n++; continue; }
      var old = e.path.g;
      if (!old || old.t !== g.t || JSON.stringify(g) !== JSON.stringify(old)) { e.path.g = g; n++; }
    }
    return n;
  }
  // entity `index` was deleted: text on it keeps its last place, path indices past it shift down
  function textEntityRemoved(sketch, index) {
    (sketch && sketch.entities || []).forEach(function (e) {
      if (!e || e.t !== 'text' || !e.path || e.path.e == null) return;
      if (e.path.e === index) delete e.path.e; else if (e.path.e > index) e.path.e--;
    });
  }
  // the entity list was rebuilt from `before` (same objects where they survive): path indices follow their curves
  function remapTextPaths(sketch, before) {
    var E = sketch && sketch.entities;
    if (!E || !before) return;
    E.forEach(function (e) {
      if (!e || e.t !== 'text' || !e.path || e.path.e == null) return;
      var j = E.indexOf(before[e.path.e]);
      if (j >= 0 && before[e.path.e]) e.path.e = j; else delete e.path.e;
    });
  }
  // transformText(e, xf) -> a moved / turned / scaled copy: xf { dx, dy } | { rot (degrees), cx, cy } | { s, cx, cy }
  // (SketchSolver's Move / Copy / Rotate / Scale form); the copy keeps its curve's geometry but no longer follows it
  function transformText(e, xf) {
    var o = JSON.parse(JSON.stringify(e)), rot = xf.rot != null ? +xf.rot : 0, k = xf.s != null ? +xf.s : 1;
    function P(x, y) {
      if (xf.rot != null) { var a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), u = x - xf.cx, v = y - xf.cy; return [xf.cx + c * u - s * v, xf.cy + s * u + c * v]; }
      if (xf.s != null) return [xf.cx + (x - xf.cx) * k, xf.cy + (y - xf.cy) * k];
      return [x + (+xf.dx || 0), y + (+xf.dy || 0)];
    }
    var q = P(+e.x || 0, +e.y || 0);
    o.x = q[0]; o.y = q[1];
    if (rot) o.rot = normDeg((+e.rot || 0) + rot);
    if (k !== 1) { o.h = (+e.h || 1) * k; if (e.strokeWidth != null) o.strokeWidth = +e.strokeWidth * k; if (e.bridge != null) o.bridge = +e.bridge * k; }
    if (e.path) {
      delete o.path.e;
      var g = e.path.g;
      if (g && g.t === 'line') { var a = P(g.x1, g.y1), b = P(g.x2, g.y2); o.path.g = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
      else if (g && g.t === 'arc') { var c = P(g.cx, g.cy), a0 = normDeg(g.a0 + rot); o.path.g = { t: 'arc', cx: c[0], cy: c[1], r: g.r * k, a0: a0, a1: a0 + (g.a1 - g.a0) }; }
      else if (g && g.t === 'spline') {   // sketch-text2: a driving tangent turns with it (its weight is per unit of chord length)
        o.path.g.pts = g.pts.map(function (q) { return P(q[0], q[1]); });
        if (g.tans) o.path.g.tans = g.tans.map(function (tg) { return tg ? [normDeg(+tg[0] + rot)].concat(tg.slice(1)) : null; });
      } else if (g && (g.t === 'ellipse' || g.t === 'pellipse')) {
        var ce = P(g.cx, g.cy);
        o.path.g.cx = ce[0]; o.path.g.cy = ce[1]; o.path.g.rx = g.rx * k; o.path.g.ry = g.ry * k; o.path.g.rot = normDeg((+g.rot || 0) + rot);
      }
    }
    return o;
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.entityPolylines = entityPolylines; K.entitySnapPoints = entitySnapPoints; K.sketchProfile = sketchProfile; K.signedArea = signedArea;
  K.loopSelfCrossing = loopSelfCrossing; K.checkProfile = checkProfile; K.offsetLoop = offsetLoop; K.filletPolyline = filletPolyline;
  K.mirrorAxis = mirrorAxis; K.mirrorEntity = mirrorEntity; K.translateEntity = translateEntity; K.entityPrimitives = entityPrimitives;
  K.trimEntity = trimEntity; K.dimGeometry = dimGeometry; K.dimValue = dimValue; K.setDimValue = setDimValue; K.dimForEntity = dimForEntity;
  K.setTessellation = setTessellation; K.segsForRadius = segsForRadius; K.entityCurves = entityCurves;
  K.isStyleSpline = isStyle; K.bzPoint = bzPoint; K.bzDeriv = bzDeriv; K.bzSub = bzSub; K.bzElevate = bzElevate; K.bzDegree = bzDegree;   // rfAH: Style Spline
  K.splineGeom = splineGeom; K.ellipsePoint = ellipsePoint; K.bezPoint = bezPoint; K.freeSamples = freeSamples; K.isFreeCurve = isFree;
  K.sketchLayer = sketchLayer; K.noProfileEntity = noProfileEntity; K.LAYER_PRESETS = LAYER_PRESETS;   // sketch-layers
  K.textLayout = textLayout; K.textOutline = textOutline; K.textDxf = textDxf; K.textStrokeWidth = textStrokeWidth;   // sketch-text
  K.syncTextPaths = syncTextPaths; K.textEntityRemoved = textEntityRemoved; K.remapTextPaths = remapTextPaths; K.transformText = transformText;
  K.textPathOf = pathGeomOf; K.TEXT_PATH_TYPES = TEXT_PATH_TYPES.slice(); K.textBridgeWidth = textBridgeWidth;   // sketch-text2
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.TESS = TESS; _.checkProfile = checkProfile; _.dimGeometry = dimGeometry; _.entityPolylines = entityPolylines; _.key2 = key2;
  _.mirrorAxis = mirrorAxis; _.mirrorEntity = mirrorEntity; _.offsetLoop = offsetLoop; _.pointInPoly = pointInPoly; _.segsForRadius = segsForRadius;
  _.setDimValue = setDimValue; _.setTessellation = setTessellation; _.signedArea = signedArea; _.sketchProfile = sketchProfile; _.tessKey = tessKey;
  _.translateEntity = translateEntity; _.trimEntity = trimEntity; _.splineGeom = splineGeom; _.ellipsePoint = ellipsePoint; _.freeSamples = freeSamples;
  _.syncTextPaths = syncTextPaths; _.textDxf = textDxf;
})(Kernel, Kernel._);
