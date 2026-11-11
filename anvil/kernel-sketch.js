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
  // rfFE (2026-10-29): an angular limit next to the chord tolerance, as in SolidWorks' Image Quality: with maxAngle > 0
  // no chord of a circle (or spline span, bezSegs) turns more than maxAngle degrees, so small holes and fillets keep
  // round outlines at any chord tolerance. rfFE2: on by default at 12° (at least 30 -> 32 segments per turn: a Ø.25 in
  // hole is a 32-gon instead of 24, its outline under 0.7 px off the circle at 300 px across). 10° (40) still breaks
  // drawings (Funnel Front view 56 hidden facet lines, Rounded handle silhouette ends 0.05 mm short, Shaft keyway-end
  // arcs as more lines) and CSG slivers (Shaft, Chamfered block); 0 switches the limit off.
  var TESS = { chordTol: 0.05, minSegs: 16, maxSegs: 128, maxAngle: 12, legacy: false };
  function segsForRadius(r) {
    if (TESS.legacy) return Math.max(16, Math.min(72, Math.round(8 * Math.sqrt(Math.max(r, 0.01)))));
    r = Math.max(+r || 0, 0.01);
    var c = 1 - TESS.chordTol / r, n = c <= -1 ? TESS.minSegs : Math.ceil(Math.PI / Math.acos(Math.max(-1, Math.min(1, c))) - 1e-9);
    if (TESS.maxAngle > 0) n = Math.max(n, Math.ceil(360 / TESS.maxAngle - 1e-9));
    n = Math.ceil(n / 8) * 8;
    return Math.max(TESS.minSegs, Math.min(TESS.maxSegs, n));
  }
  // setTessellation({ chordTol?, minSegs?, maxSegs?, maxAngle?, legacy? }) -> the settings now in force (rebuild cache
  // keys include them); setTessellation('default') restores the defaults
  function setTessellation(o) {
    if (o === 'default') o = { chordTol: 0.05, minSegs: 16, maxSegs: 128, maxAngle: 12, legacy: false };
    o = o || {};
    if (o.legacy != null) TESS.legacy = !!o.legacy;
    if (o.chordTol != null) { if (!(+o.chordTol > 0)) throw new Error('Chord tolerance must be positive.'); TESS.chordTol = +o.chordTol; }
    if (o.minSegs != null) TESS.minSegs = Math.max(8, Math.ceil((+o.minSegs || 8) / 8) * 8);
    if (o.maxSegs != null && !(+o.maxSegs >= 4)) throw new Error('maxSegs must be at least 4.');
    if (o.maxSegs != null) TESS.maxSegs = Math.max(TESS.minSegs, +o.maxSegs | 0);
    if (o.maxAngle != null) { if (!(+o.maxAngle >= 0)) throw new Error('maxAngle must be 0 (off) or a positive angle.'); TESS.maxAngle = +o.maxAngle; }
    return { chordTol: TESS.chordTol, minSegs: TESS.minSegs, maxSegs: TESS.maxSegs, maxAngle: TESS.maxAngle, legacy: TESS.legacy };
  }
  function tessKey() { return TESS.legacy ? 'legacy' : TESS.chordTol + '/' + TESS.minSegs + '/' + TESS.maxSegs + (TESS.maxAngle > 0 ? '/a' + TESS.maxAngle : ''); }

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
  // ---- rfAS: Conic / Parabola { t: 'spline', pts: [P0, S, P2], conic: rho, parabola? }: SolidWorks' Conic (and its
  // Parabola, rho = 0.5) as the rational quadratic Bezier P0, T, P2 with middle weight w = rho / (1 - rho), where the
  // top vertex T (where the end tangents meet) is M + (S - M) / rho, M the midpoint of P0 P2 and S the shoulder point
  // (the curve's point at t = 1/2). Any drag of the three points keeps a conic of the same rho.
  // conicData(e) -> { P0, T, P2, S, rho, w } or null; conicPoint(c, t) the exact point.
  function conicData(e) {
    if (!e || e.t !== 'spline' || e.conic == null || !e.pts || e.pts.length !== 3) return null;
    var rho = +e.conic;
    if (!(rho > 0 && rho < 1)) return null;
    var P0 = [+e.pts[0][0], +e.pts[0][1]], S = [+e.pts[1][0], +e.pts[1][1]], P2 = [+e.pts[2][0], +e.pts[2][1]];
    var M = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2], T = [M[0] + (S[0] - M[0]) / rho, M[1] + (S[1] - M[1]) / rho];
    return { P0: P0, T: T, P2: P2, S: S, rho: rho, w: rho / (1 - rho) };
  }
  function conicPoint(c, t) {
    var u = 1 - t, a = u * u, b = 2 * c.w * u * t, d = t * t, W = a + b + d;
    return [(a * c.P0[0] + b * c.T[0] + d * c.P2[0]) / W, (a * c.P0[1] + b * c.T[1] + d * c.P2[1]) / W];
  }
  function conicDeriv(c, t) {   // dC/dt of the rational quadratic (quotient rule)
    var u = 1 - t, a = u * u, b = 2 * c.w * u * t, d = t * t, W = a + b + d, da = -2 * u, db = 2 * c.w * (1 - 2 * t), dd = 2 * t, dW = da + db + dd;
    var N = [a * c.P0[0] + b * c.T[0] + d * c.P2[0], a * c.P0[1] + b * c.T[1] + d * c.P2[1]], dN = [da * c.P0[0] + db * c.T[0] + dd * c.P2[0], da * c.P0[1] + db * c.T[1] + dd * c.P2[1]];
    return [(dN[0] * W - N[0] * dW) / (W * W), (dN[1] * W - N[1] * dW) / (W * W)];
  }
  // the conic as cubic spans (CONIC_SPANS of them, evenly in t; a parabola, being polynomial, as two exact ones): each
  // keeps its ends and end tangent directions and passes through the conic's point halfway along it, so the curve is
  // G1 and within about 1e-7 of its size of the true conic
  var CONIC_SPANS = 16;
  function conicGeom(e) {
    var c = conicData(e);
    if (!c) return null;
    var bez = [], knots = [0], N = Math.abs(c.rho - 0.5) < 1e-12 ? 2 : CONIC_SPANS, rs = [];
    for (var q = 0; q < N; q++) rs.push([q / N, (q + 1) / N]);
    rs.forEach(function (r) {
      var A = conicPoint(c, r[0]), B = conicPoint(c, r[1]), X = conicPoint(c, (r[0] + r[1]) / 2), u = conicDeriv(c, r[0]), v = conicDeriv(c, r[1]);
      if (r[0] === 0) A = c.P0; else if (r[0] === 0.5) A = c.S;
      if (r[1] === 1) B = c.P2; else if (r[1] === 0.5) B = c.S;
      var lu = Math.hypot(u[0], u[1]) || 1, lv = Math.hypot(v[0], v[1]) || 1;
      u = [u[0] / lu, u[1] / lu]; v = [v[0] / lv, v[1] / lv];
      // B(1/2) = (A + B) / 2 + 3/8 (a u - b v) = X
      var rx = (X[0] - (A[0] + B[0]) / 2) * 8 / 3, ry = (X[1] - (A[1] + B[1]) / 2) * 8 / 3, det = -u[0] * v[1] + u[1] * v[0], a, b;
      if (Math.abs(det) > 1e-12) { a = (-rx * v[1] + ry * v[0]) / det; b = (u[0] * ry - u[1] * rx) / det; }
      if (!(a > 0) || !(b > 0)) { a = b = Math.hypot(B[0] - A[0], B[1] - A[1]) / 3; }
      bez.push([A, [A[0] + a * u[0], A[1] + a * u[1]], [B[0] - b * v[0], B[1] - b * v[1]], B]);
      knots.push(knots[knots.length - 1] + Math.max(Math.hypot(B[0] - A[0], B[1] - A[1]), 1e-9));
    });
    return { bez: bez, knots: knots, closed: false, conic: c };
  }
  // ---- lane fitspline: B-spline { t: 'spline', style: true, deg: 3, knots: [U0 … Um], pts: [CP0 … CPn], closed?,
  // fit?, fitSrc? }: a multi-span B-spline of degree deg (3) given by its control points and its clamped knot vector
  // (m = n + deg + 1; the first and last deg + 1 knots equal, so the curve starts at CP0 and ends at CPn): what Fit
  // Spline makes (one entity fitted to a chain within a tolerance, SolidWorks' Fit Spline) and what a cubic DXF SPLINE
  // reads in as. `style: true` because, as a Style Spline's, its points are control vertices, not points on the curve:
  // every control-polygon path (solver unknowns, leg refs, the polygon drawn, no handles / tangent driving) applies;
  // the paths that evaluate the curve dispatch on isBSpline. Knots are in length units (Fit Spline: arc length along
  // the chain), so splineGeom's knots stay about the curve's length as a spline's are. closed: a closed fit (start and
  // end control points equal, the curve C2 across the seam as fitted). fit (Constrained): { id, tol, closed, sig }, the
  // source entities carrying fitSrc === id; syncFitSplines refits the spline whenever they move.
  function isBSpline(e) { return !!e && e.t === 'spline' && !!e.style && Array.isArray(e.knots); }
  function bsDeg(e) { return e && e.deg > 0 ? e.deg | 0 : 3; }
  function bsValid(e) {
    if (!isBSpline(e) || !e.pts) return false;
    var p = bsDeg(e), U = e.knots, n = e.pts.length;
    if (n < p + 1 || U.length !== n + p + 1) return false;
    for (var i = 1; i < U.length; i++) if (!(+U[i] >= +U[i - 1])) return false;
    return +U[n] > +U[p];
  }
  // the blossom of the B-spline (knots U, control points P, degree p) on span j (U[j] <= u < U[j + 1]) at ts (p values):
  // de Boor's triangle with ts[r - 1] at level r; ts all u is the point at u (u past the span carries its polynomial on)
  function bsBlossom(U, P, p, j, ts) {
    var d = [], k, r;
    for (k = 0; k <= p; k++) d.push([+P[j - p + k][0], +P[j - p + k][1]]);
    for (r = 1; r <= p; r++) for (k = p; k >= r; k--) {
      var i = j - p + k, den = U[i + p + 1 - r] - U[i], a = den > 0 ? (ts[r - 1] - U[i]) / den : 0;
      d[k] = [(1 - a) * d[k - 1][0] + a * d[k][0], (1 - a) * d[k - 1][1] + a * d[k][1]];
    }
    return d[p];
  }
  // the B-spline's polynomial pieces as cubic Béziers: [{ B, lo, hi, mult (the multiplicity of the knot at lo; 0 for
  // the first piece) }], one per knot interval of non-zero length (a degree below 3 elevated: the same curve)
  function bsPieces(U, P, p) {
    var out = [], n = P.length - 1;
    for (var j = p; j <= n; j++) {
      if (!(U[j + 1] > U[j])) continue;
      var B = [];
      for (var k = 0; k <= p; k++) { var ts = []; for (var q = 0; q < p; q++) ts.push(q < p - k ? U[j] : U[j + 1]); B.push(bsBlossom(U, P, p, j, ts)); }
      while (B.length < 4) B = bzElevate(B);
      var mult = 0;
      if (out.length) for (var z = 0; z < U.length; z++) if (U[z] === U[j]) mult++;
      out.push({ B: B, lo: U[j], hi: U[j + 1], mult: mult });
    }
    return out;
  }
  // cubic pieces [{ B, lo, hi, mult }] (end to end, each interior knot of multiplicity mult, 1 when absent) as one
  // clamped cubic B-spline { knots, pts }: each control point is the blossom of a piece its support covers at its knots
  function bsFromPieces(pcs) {
    var U = [], i, j, k;
    if (!pcs.length) return null;
    for (k = 0; k < 4; k++) U.push(pcs[0].lo);
    for (i = 1; i < pcs.length; i++) for (k = 0; k < Math.max(1, Math.min(3, pcs[i].mult || 1)); k++) U.push(pcs[i].lo);
    for (k = 0; k < 4; k++) U.push(pcs[pcs.length - 1].hi);
    var n = U.length - 4, P = [];
    for (i = 0; i < n; i++) {
      var pc = null;
      for (j = i; j <= i + 3 && !pc; j++) if (U[j + 1] > U[j]) for (k = 0; k < pcs.length; k++) if (pcs[k].lo === U[j]) { pc = pcs[k]; break; }
      if (!pc) return null;
      var h = pc.hi - pc.lo;
      P.push(bzBlossom(pc.B, [(U[i + 1] - pc.lo) / h, (U[i + 2] - pc.lo) / h, (U[i + 3] - pc.lo) / h]));
    }
    return { knots: U, pts: P };
  }
  // splineGeom of a B-spline: its exact cubic pieces; bs = { deg, knots, cps } is what DXF SPLINE writes
  function bsGeom(e) {
    if (!bsValid(e)) return null;
    var p = bsDeg(e), U = e.knots.map(Number), P = e.pts.map(function (q) { return [+q[0], +q[1]]; }), pcs = bsPieces(U, P, p);
    if (!pcs.length) return null;
    var knots = [0];   // from 0, as a spline's (a closed curve's period is the last)
    pcs.forEach(function (pc) { knots.push(pc.hi - pcs[0].lo); });
    return { bez: pcs.map(function (pc) { return pc.B; }), knots: knots, closed: !!e.closed, bs: { deg: p, knots: U, cps: P }, pieces: pcs };
  }
  // the piece of B-spline e from knot value ua to ub (either may lie past an open end: the end piece's polynomial
  // carried on; a closed one wraps, ub up to ua + its period) as a new B-spline entity, the same curve exactly
  function bsSub(e, ua, ub) {
    var g = bsGeom(e);
    if (!g || !(ub > ua)) return null;
    var pcs = g.pieces, a = pcs[0].lo, b = pcs[pcs.length - 1].hi, L = b - a, out = [], s, k;
    var closed = !!e.closed;
    if (closed) { while (ua < a) { ua += L; ub += L; } while (ua >= b) { ua -= L; ub -= L; } }
    for (s = 0; s <= (closed ? 2 : 0); s++) pcs.forEach(function (pc, i) {
      var lo = pc.lo + s * L, hi = pc.hi + s * L;
      if (!closed && i === 0) lo = Math.min(lo, ua);
      if (!closed && i === pcs.length - 1) hi = Math.max(hi, ub);
      var x0 = Math.max(lo, ua), x1 = Math.min(hi, ub);
      if (!(x1 > x0 + 1e-14 * Math.max(1, Math.abs(L)))) return;
      var h = pc.hi - pc.lo, o = pc.lo + s * L;
      out.push({ B: bzSub(pc.B, (x0 - o) / h, (x1 - o) / h), lo: x0, hi: x1, mult: out.length ? (x0 === pc.lo + s * L && i === 0 && s > 0 ? 3 : pc.mult || 1) : 0 });
    });
    if (!out.length) return null;
    for (k = 1; k < out.length; k++) out[k].lo = out[k - 1].hi;
    var r = bsFromPieces(out);
    if (!r) return null;
    var o2 = { t: 'spline', style: true, deg: 3, knots: r.knots, pts: r.pts };
    return o2;
  }
  // B-spline e with the knot u inserted once (Boehm): one control point more, the same curve
  function bsInsertKnot(e, u) {
    if (!bsValid(e)) return null;
    var p = bsDeg(e), U = e.knots.map(Number), P = e.pts.map(function (q) { return [+q[0], +q[1]]; }), n = P.length - 1, j = p;
    if (!(u > U[p] && u < U[n + 1])) return null;
    while (j < n && u >= U[j + 1]) j++;
    var Q = [];
    for (var i = 0; i <= n + 1; i++) {
      if (i <= j - p) Q.push(P[i]);
      else if (i > j) Q.push(P[i - 1]);
      else { var a = (u - U[i]) / (U[i + p] - U[i]); Q.push([(1 - a) * P[i - 1][0] + a * P[i][0], (1 - a) * P[i - 1][1] + a * P[i][1]]); }
    }
    var V = U.slice(0, j + 1).concat([u], U.slice(j + 1));
    return { knots: V, pts: Q };
  }
  function splineGeom(e) {
    if (isBSpline(e)) return bsGeom(e);   // lane fitspline
    if (isStyle(e)) return styleGeom(e);
    if (e && e.conic != null) { var cg = conicGeom(e); if (cg) return cg; }   // rfAS
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
    if (tans.some(function (tg) { return tg && tg[3] != null && isFinite(+tg[3]); })) {   // rfAY: curvature controls
      var cv = splineCurvatureFit(P, h, closed, Mx, My, rho, tans, !!e.local);
      Mx = cv.Mx; My = cv.My;
    }
    for (i = 0; i < m; i++) {
      var p0 = P[i], p3 = P[(i + 1) % n], k = h[i] / 3, j = (i + 1) % n, kj = k * rho[j];
      bez.push([p0, [p0[0] + k * Mx[i], p0[1] + k * My[i]], [p3[0] - kj * Mx[j], p3[1] - kj * My[j]], p3]);
    }
    return { bez: bez, knots: knots, closed: closed };
  }
  // ---- rfAY: Curvature Control (SolidWorks: a spline point's Curvature Control, set by its Radius of curvature).
  // tans[i] = [angleDeg, weight, weightIn?, curvature]: point i is tangent-driving and the curve has the signed
  // curvature κ there (1 / radius; positive bends to the left of the way the points run, 0 is flat), the same on both
  // sides (G2 at that value). With the point's tangent T fixed, the curvature of the span leaving it depends only on
  // the tangent at the next point: cross(T, M_{i+1}) = 3·cross(T, Δ)/h − κ|T|³h/2 (and alike arriving, from M_{i−1}),
  // so each side is one linear condition on a neighbour's tangent. Maintain internal continuity on: the spline is the
  // one of least bending energy ∫|P''|² (which is what the C2 rows above are) that meets every such condition — a KKT
  // solve over the free point tangents; the curvature is exact and the curve stays C2 at every other point except in
  // the one bend component at a controlled point's neighbours. Off (local): the neighbour's tangent is turned by just
  // what the condition needs. A side whose neighbour is tangent-driving itself (or missing: a free end) is not held.
  function splineCurvatureFit(P, h, closed, Mx0, My0, rho, tans, local) {
    var n = P.length, m = h.length, i, j, Mx = Mx0.slice(), My = My0.slice();
    var relaxed = {};
    function drivingAt(k) { var tg = tans[k]; return !!(tg && isFinite(+tg[0])); }
    function fixedAt(k) { return drivingAt(k) && !relaxed[k]; }
    function controlled(k) { var tg = tans[k]; return !!(tg && tg[3] != null && isFinite(+tg[3]) && drivingAt(k)); }
    function relax(k) { if (!controlled(k)) { relaxed[k] = true; rho[k] = 1; } }   // a neighbour's tangent lets go
    function cr(ax, ay, bx, by) { return ax * by - ay * bx; }
    // a side whose neighbour is tangent-driving too (Insert Spline Point / Add Curvature Control leave the neighbours
    // driving so the curve keeps its shape) has no free tangent: that side's speed at the controlled point is what
    // gives the curvature there instead (leaving: w² = (6·cross(d, Δ)/h² − 2·cross(d, M_next)/h) / κ; arriving alike,
    // as rho, the arriving span's own speed). Where no speed does it (κ = 0, or the curve bends the other way there)
    // the neighbour's tangent lets go (unless it is a curvature control itself) and the fit below sets it
    for (i = 0; i < n; i++) {
      if (!controlled(i)) continue;
      var k0 = +tans[i][3], w0 = Math.hypot(Mx[i], My[i]);
      if (!(w0 > 1e-12)) continue;
      var dx0 = Mx[i] / w0, dy0 = My[i] / w0, wIn = rho[i] * w0;
      if ((closed || i < n - 1) && fixedAt((i + 1) % n)) {
        j = (i + 1) % n;
        var hO = h[i], NO = 6 * cr(dx0, dy0, P[j][0] - P[i][0], P[j][1] - P[i][1]) / (hO * hO) - 2 * cr(dx0, dy0, rho[j] * Mx[j], rho[j] * My[j]) / hO;
        if (k0 !== 0 && NO / k0 > 1e-18) { w0 = Math.sqrt(NO / k0); Mx[i] = w0 * dx0; My[i] = w0 * dy0; } else relax(j);
      }
      if ((closed || i > 0) && fixedAt((i + n - 1) % n)) {
        j = (i + n - 1) % n;
        var hI = h[(i + m - 1) % m], NI = 2 * cr(dx0, dy0, Mx[j], My[j]) / hI - 6 * cr(dx0, dy0, P[i][0] - P[j][0], P[i][1] - P[j][1]) / (hI * hI);
        if (k0 !== 0 && NI / k0 > 1e-18) wIn = Math.sqrt(NI / k0); else relax(j);
      }
      rho[i] = wIn / w0;
    }
    var cons = [];   // { at: neighbour index, tx, ty (T at the controlled point, scaled by the side's speed), rhs }
    for (i = 0; i < n; i++) {
      var tg = tans[i];
      if (!controlled(i)) continue;
      var kap = +tg[3], Tx = Mx[i], Ty = My[i], w = Math.hypot(Tx, Ty);
      if (!(w > 1e-12)) continue;
      if (closed || i < n - 1) {   // leaving: span i, to point j
        j = (i + 1) % n;
        var hr = h[i], dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1];
        if (!fixedAt(j)) cons.push({ at: j, s: rho[j], tx: Tx, ty: Ty, rhs: 3 * cr(Tx, Ty, dx, dy) / hr - kap * w * w * w * hr / 2 });
      }
      if (closed || i > 0) {   // arriving: span i − 1, from point j, at the speed rho[i]·T
        j = (i + n - 1) % n;
        var hl = h[(i + m - 1) % m], ex = P[i][0] - P[j][0], ey = P[i][1] - P[j][1], Ux = rho[i] * Tx, Uy = rho[i] * Ty, wu = rho[i] * w;
        if (!fixedAt(j)) cons.push({ at: j, s: 1, tx: Ux, ty: Uy, rhs: 3 * cr(Ux, Uy, ex, ey) / hl + kap * wu * wu * wu * hl / 2 });
      }
    }
    if (!cons.length) return { Mx: Mx, My: My };
    if (local) {
      cons.forEach(function (c) {   // turn the neighbour's tangent square to T by what the condition lacks
        var cur = c.s * cr(c.tx, c.ty, Mx[c.at], My[c.at]), wt = Math.hypot(c.tx, c.ty), d = (c.rhs - cur) / (c.s * wt * wt);
        Mx[c.at] += -c.ty * d; My[c.at] += c.tx * d;
      });
      return { Mx: Mx, My: My };
    }
    // the free tangents (the point tangents not driving) are the unknowns: index map, then the energy's Hessian and
    // gradient per coordinate (the same for x and y), then the KKT system [H 0 Cxᵀ; 0 H Cyᵀ; Cx Cy 0]
    var idx = [], F = 0;
    for (i = 0; i < n; i++) idx.push(fixedAt(i) ? -1 : F++);
    var C = cons.length, N = 2 * F + C, A = [], r;
    for (r = 0; r < N; r++) { var row = new Float64Array(N + 1); A.push(row); }
    for (var s = 0; s < m; s++) {
      var a0 = s, b0 = (s + 1) % n, hs = h[s], ia = idx[a0], ib = idx[b0];
      var D = [P[b0][0] - P[a0][0], P[b0][1] - P[a0][1]];
      for (var q = 0; q < 2; q++) {
        var M = q ? My : Mx, off = q * F;
        var c0 = ia < 0 ? M[a0] : 0, c1 = ib < 0 ? rho[b0] * M[b0] : 0;   // a fixed end's derivative is a constant
        if (ia >= 0) { A[off + ia][off + ia] += 8 / hs; A[off + ia][N] -= 4 / hs * (2 * c0 + c1) - 12 * D[q] / (hs * hs); }
        if (ib >= 0) { A[off + ib][off + ib] += 8 / hs; A[off + ib][N] -= 4 / hs * (c0 + 2 * c1) - 12 * D[q] / (hs * hs); }
        if (ia >= 0 && ib >= 0) { A[off + ia][off + ib] += 4 / hs; A[off + ib][off + ia] += 4 / hs; }
      }
    }
    cons.forEach(function (c, k) {   // c.s·(tx·My − ty·Mx) at the neighbour = rhs
      var v = idx[c.at], R = 2 * F + k;
      A[R][v] = -c.s * c.ty; A[R][F + v] = c.s * c.tx; A[R][N] = c.rhs;
      A[v][R] = -c.s * c.ty; A[F + v][R] = c.s * c.tx;
    });
    // Gaussian elimination with partial pivoting; a singular system (two conditions on one tangent that cannot both
    // hold) keeps the C2 curve
    for (var col = 0; col < N; col++) {
      var piv = col, best = Math.abs(A[col][col]);
      for (r = col + 1; r < N; r++) if (Math.abs(A[r][col]) > best) { best = Math.abs(A[r][col]); piv = r; }
      if (!(best > 1e-14)) return { Mx: Mx0, My: My0 };
      if (piv !== col) { var t = A[piv]; A[piv] = A[col]; A[col] = t; }
      for (r = col + 1; r < N; r++) {
        var fct = A[r][col] / A[col][col];
        if (fct === 0) continue;
        for (var k2 = col; k2 <= N; k2++) A[r][k2] -= fct * A[col][k2];
      }
    }
    var x = new Float64Array(N);
    for (r = N - 1; r >= 0; r--) { var sum = A[r][N]; for (var k3 = r + 1; k3 < N; k3++) sum -= A[r][k3] * x[k3]; x[r] = sum / A[r][r]; }
    for (i = 0; i < n; i++) if (idx[i] >= 0) { Mx[i] = x[idx[i]]; My[i] = x[F + idx[i]]; }
    return { Mx: Mx, My: My };
  }
  // the signed curvature of spline e at its point i: { out (the span leaving it), in (the span arriving), k (out, or in
  // at an open spline's last point) }; null where there is no span
  function splineCurvatureAt(e, i) {
    var g = splineGeom(e);
    if (!g) return null;
    var m = g.bez.length, n = e.pts.length, res = { out: null, 'in': null };
    function kap(d1, d2) { var L = Math.hypot(d1[0], d1[1]); return L > 1e-15 ? (d1[0] * d2[1] - d1[1] * d2[0]) / (L * L * L) : null; }
    var B, hh;
    if (i < m) { B = g.bez[i]; hh = g.knots[i + 1] - g.knots[i]; res.out = kap([3 * (B[1][0] - B[0][0]) / hh, 3 * (B[1][1] - B[0][1]) / hh], [6 * (B[0][0] - 2 * B[1][0] + B[2][0]) / (hh * hh), 6 * (B[0][1] - 2 * B[1][1] + B[2][1]) / (hh * hh)]); }
    var ip = g.closed ? (i + m - 1) % m : i - 1;
    if (ip >= 0 && ip < m && (g.closed || i <= n - 1)) { B = g.bez[ip]; hh = g.knots[ip + 1] - g.knots[ip]; res['in'] = kap([3 * (B[3][0] - B[2][0]) / hh, 3 * (B[3][1] - B[2][1]) / hh], [6 * (B[1][0] - 2 * B[2][0] + B[3][0]) / (hh * hh), 6 * (B[1][1] - 2 * B[2][1] + B[3][1]) / (hh * hh)]); }
    res.k = res.out != null ? res.out : res['in'];
    return res;
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
  // rfFE: and, unless legacy, so the tangent turns no more than TESS.maxAngle per chord on average over the span
  function bezSegs(B) {
    var dd = 0;
    for (var k = 0; k < 2; k++) dd = Math.max(dd, 6 * Math.hypot(B[k][0] - 2 * B[k + 1][0] + B[k + 2][0], B[k][1] - 2 * B[k + 1][1] + B[k + 2][1]));
    var n = Math.ceil(Math.sqrt(dd / (8 * TESS.chordTol)) - 1e-9);
    if (TESS.maxAngle > 0 && !TESS.legacy && dd > 0) {
      // chords are equal steps in s: the fastest turn per unit s (sampled at 32 steps) sets the count
      var rate = 0, prev = null, NS = 32;
      for (var i = 0; i <= NS; i++) {
        var d = bezDeriv(B, i / NS);
        if (!(Math.abs(d[0]) + Math.abs(d[1]) > 1e-12)) { prev = null; continue; }
        var a = Math.atan2(d[1], d[0]);
        if (prev != null) { var da = a - prev; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; rate = Math.max(rate, Math.abs(da) * NS); }
        prev = a;
      }
      n = Math.max(n, Math.ceil(rate * 180 / Math.PI / TESS.maxAngle - 1e-9));
    }
    return Math.max(4, Math.min(256, n));
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
      case 'spline':
        if (isBSpline(e)) return e.closed ? [] : [e.pts[0], e.pts[e.pts.length - 1]].map(function (p) { return [p[0], p[1]]; });   // lane fitspline: its control points lie off the curve
        return e.pts.map(function (p) { return [p[0], p[1]]; });
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
        (warnings.open = warnings.open || []).push({ pts: pts, w: warnings.length - 1 });
      }
    }
    return { loops: loops, warnings: warnings };
  }
  // lane CV: an open contour whose two ends both lie on the sketch's other geometry (a line across a rectangle, used
  // with Selected Contours) splits a region: it is not an ignored open contour, so it gives no warning
  function splitterWarnings(ch, loops, chains) {
    var open = ch.warnings.open || [];
    if (!open.length) return ch.warnings.slice();
    var segs = [], scale = 1;
    loops.forEach(function (l) { for (var i = 0; i < l.length; i++) segs.push([l[i], l[(i + 1) % l.length]]); });
    chains.forEach(function (c) { for (var i = 0; i + 1 < c.length; i++) segs.push([c[i], c[i + 1], c]); });
    segs.forEach(function (s) { scale = Math.max(scale, Math.abs(s[0][0]), Math.abs(s[0][1])); });
    var tol = 1e-7 * scale;
    function onOther(p, own) {
      return segs.some(function (s) {
        if (s[2] && own.indexOf(s[2]) >= 0) return false;
        var a = s[0], b = s[1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        var t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
        return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]) <= tol;
      });
    }
    var drop = {};
    open.forEach(function (o) {
      // the chains this open contour was made of (its own pieces do not count as "other geometry")
      var own = chains.filter(function (c) { return c.some(function (q) { return o.pts.some(function (r) { return r === q || (r[0] === q[0] && r[1] === q[1]); }); }); });
      if (onOther(o.pts[0], own) && onOther(o.pts[o.pts.length - 1], own)) drop[o.w] = true;
    });
    return ch.warnings.filter(function (w, i) { return !drop[i]; });
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
      warnings = warnings.concat(splitterWarnings(ch, loops, chains));   // lane CV: a splitting line is no open contour
    }
    var zero = 0, out = [];
    // rfGM: with thousands of circles (a perforated sheet) a loop only tries the curves whose box meets its own, in list
    // order, so the first match is the one the whole list gives and seg holds the same indices
    var cellOf = null, wideC = [], cellS = 0, cellX = 0, cellY = 0;
    if (curves.length > 32) {
      var cMax = [-Infinity, -Infinity], cSum = 0;
      cellX = Infinity; cellY = Infinity;
      curves.forEach(function (C) { cellX = Math.min(cellX, C.c[0] - C.r); cellY = Math.min(cellY, C.c[1] - C.r); cMax[0] = Math.max(cMax[0], C.c[0] + C.r); cMax[1] = Math.max(cMax[1], C.c[1] + C.r); cSum += 2 * C.r; });
      cellS = Math.max(cSum / curves.length, Math.max(cMax[0] - cellX, cMax[1] - cellY) / 512, 1e-9);
      cellOf = new Map();
      curves.forEach(function (C, k) {
        var pad = C.r + 2e-7 * Math.max(1, C.r), x0 = Math.floor((C.c[0] - pad - cellX) / cellS), x1 = Math.floor((C.c[0] + pad - cellX) / cellS), y0 = Math.floor((C.c[1] - pad - cellY) / cellS), y1 = Math.floor((C.c[1] + pad - cellY) / cellS);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) { wideC.push(k); return; }
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { var key = (x + 2048) * 8192 + y + 2048, c = cellOf.get(key); if (c) c.push(k); else cellOf.set(key, [k]); }
      });
    }
    function loopSegments(pts) {
      var b = cellOf ? loopBox(pts) : null;
      if (!b) return curveSegments(pts, curves);
      var x0 = Math.floor((b[0] - cellX) / cellS), x1 = Math.floor((b[2] - cellX) / cellS), y0 = Math.floor((b[1] - cellY) / cellS), y1 = Math.floor((b[3] - cellY) / cellS);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return curveSegments(pts, curves);
      var seen = {}, ids = wideC.slice();
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var c = cellOf.get((x + 2048) * 8192 + y + 2048);
        if (c) for (var i = 0; i < c.length; i++) if (!seen[c[i]]) { seen[c[i]] = true; ids.push(c[i]); }
      }
      ids.sort(function (p, q) { return p - q; });
      var seg = curveSegments(pts, ids.map(function (k) { return curves[k]; }));
      return seg && seg.map(function (k) { return k < 0 ? k : ids[k]; });
    }
    loops.forEach(function (l) {
      var cross = l.length >= 3 ? loopSelfCrossing(l) : null;
      if (!cross && (l.length < 3 || Math.abs(signedArea(l)) <= 1e-9)) { zero++; return; }
      var pts = signedArea(l) < 0 ? l.slice().reverse() : l;
      var loop = { pts: pts, hole: false, depth: 0 };
      if (cross) loop.cross = cross;
      var seg = loopSegments(pts);
      if (seg) loop.seg = seg;
      var fseg = free.length ? freeSegments(pts, free) : null;
      if (fseg) loop.fseg = fseg;
      out.push(loop);
    });
    if (zero) warnings.push(zero === 1 ? '1 zero-area contour was ignored.' : zero + ' zero-area contours were ignored.');
    var outBox = out.length > 32 ? out.map(function (l) { return loopBox(l.pts); }) : null;   // rfGM: outside its box a point is outside the loop
    for (var i = 0; i < out.length; i++) {
      var depth = 0, probe = out[i].pts[0];
      // use the centroid of the first edge so a shared vertex does not confuse containment
      probe = [(out[i].pts[0][0] + out[i].pts[1][0]) / 2, (out[i].pts[0][1] + out[i].pts[1][1]) / 2];
      for (var j = 0; j < out.length; j++) {
        if (i === j) continue;
        if (outBox && (probe[0] < outBox[j][0] || probe[0] > outBox[j][2] || probe[1] < outBox[j][1] || probe[1] > outBox[j][3])) continue;
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

  // ------------------------------------------------------------------ regions: the faces of the sketch's planar arrangement
  // Selected Contours (lane CO). The non-construction entities, split where they cross and where an end lands on
  // another entity, make a planar graph; its bounded faces are the regions SolidWorks lets a feature pick from: a
  // rectangle split by a line gives two, a circle inside a rectangle the annulus and the disk, two overlapping circles
  // three. Pieces that touch nothing at one end bound no region and are dropped. Crossings of chords are refined onto
  // the true circles (circle–circle, line–circle), so a picked region's chords keep their exact curves (loop.seg as in
  // sketchProfile) and the solid's volume stays exact.
  // sketchRegions(sketch) -> [{ index, loops: [{ pts (CCW), hole, depth, seg? }], area, p: [u, v] }] (p is strictly
  //   inside the region and outside its holes; sorted by the outer loop's lower-left corner, then area); [] when the
  //   sketch bounds no region. Cached per sketch content.
  // regionAt(sketch, uv, regions?) -> the region holding uv, or null.
  // contourProfile(sketch, contours) -> the profile (sketchProfile's shape) of the union of the regions the points in
  //   `contours` ([[u, v], …]) fall in; throws when a point is in no region (the feature errors instead of silently
  //   extruding the whole sketch).
  // contourSketch(f, sketch) -> sketch itself, or a copy whose profile is contourProfile(...) when f.contours has picks.
  // regionsAmbiguous(sketch) -> true when a plain extrude would not take every region: more regions than profile loops
  //   (an open line splits a loop, two contours share an edge), or loops that cross (the PropertyManager opens its
  //   Selected Contours box then, as SolidWorks does).
  function circleCircle(A, B) {
    var dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
    if (d < 1e-12 || d > A.r + B.r + 1e-9 || d < Math.abs(A.r - B.r) - 1e-9) return [];
    var a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h2 = A.r * A.r - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
    var mx = A.c[0] + a * dx / d, my = A.c[1] + a * dy / d;
    return [[mx + h * dy / d, my - h * dx / d], [mx - h * dy / d, my + h * dx / d]];
  }
  function lineCircle(a, b, C) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (L2 < 1e-24) return [];
    var fx = a[0] - C.c[0], fy = a[1] - C.c[1];
    var bq = 2 * (fx * dx + fy * dy), cq = fx * fx + fy * fy - C.r * C.r, disc = bq * bq - 4 * L2 * cq;
    if (disc < 0) return [];
    var s = Math.sqrt(disc), t1 = (-bq - s) / (2 * L2), t2 = (-bq + s) / (2 * L2);
    return [[a[0] + dx * t1, a[1] + dy * t1], [a[0] + dx * t2, a[1] + dy * t2]];
  }
  // fraction (0..1) of the angle from p to q (the short way) at which the point x stands about C's centre, or null
  // when x is not between them
  function angleFraction(x, p, q, C) {
    var ap = Math.atan2(p[1] - C.c[1], p[0] - C.c[0]), aq = Math.atan2(q[1] - C.c[1], q[0] - C.c[0]), ax = Math.atan2(x[1] - C.c[1], x[0] - C.c[0]);
    function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
    var dq = wrap(aq - ap), dx = wrap(ax - ap);
    if (Math.abs(dq) < 1e-15) return null;
    var t = dx / dq;
    return t >= -1e-9 && t <= 1 + 1e-9 ? Math.max(0, Math.min(1, t)) : null;
  }
  // the entities as polylines with each segment tagged with its true curve (index into curves) or -1
  function regionSources(sketch) {
    var chains = [], curves = [], frees = [];
    syncTextPaths(sketch);
    (sketch.entities || []).forEach(function (e) {
      if (e.construction || noProfileEntity(sketch, e)) return;
      if (e.t === 'line' && e.infinite) return;
      if (e.t === 'text' && e.mode !== 'outline') return;
      var ec = entityCurves(e), base = curves.length;
      curves = curves.concat(ec);
      var fr = isFree(e) ? freeRecord(e) : null;   // lane DP: splines / ellipses keep their parameters
      if (fr) frees.push(fr);
      entityPolylines(e, true).forEach(function (pl) {
        var pts = pl.closed ? dedupeLoop(pl.pts) : pl.pts.filter(function (p, i, arr) { return !i || Math.abs(p[0] - arr[i - 1][0]) > 1e-9 || Math.abs(p[1] - arr[i - 1][1]) > 1e-9; });
        if (pts.length < 2) return;
        var cv = null;
        if (ec.length) {
          var tags = curveSegments(pts, ec);
          if (tags) { cv = tags.map(function (k) { return k >= 0 ? k + base : -1; }); if (!pl.closed) cv[pts.length - 1] = -1; }
        }
        var fv = null;
        if (fr) {
          var tg = freeSegments(pts, [fr]);
          if (tg) {
            fv = tg.map(function (q) { return q === -1 ? null : { k: frees.length - 1, ua: q[1], ub: q[2] }; });
            if (!pl.closed) fv[pts.length - 1] = null;
          }
        }
        chains.push({ pts: pts, closed: !!pl.closed, cv: cv, fv: fv });
      });
    });
    return { chains: chains, curves: curves, frees: frees };
  }
  function regionGraph(sketch) {
    var src = regionSources(sketch), chains = src.chains, curves = src.curves, frees = src.frees;
    var span = 0;
    chains.forEach(function (ch) { ch.pts.forEach(function (p) { span = Math.max(span, Math.abs(p[0]), Math.abs(p[1])); }); });
    var tol = 1e-7 * (1 + span);
    function sag(C) { return C.r * (1 - Math.cos(C.step / 2)); }
    // segments with their bounding boxes (padded by the chord's sagitta: a true-circle point may stand that far off)
    var segs = [];
    chains.forEach(function (ch, ci) {
      var n = ch.pts.length, m = ch.closed ? n : n - 1;
      for (var i = 0; i < m; i++) {
        var a = ch.pts[i], b = ch.pts[(i + 1) % n], cv = ch.cv ? ch.cv[i] : -1, pad = (cv >= 0 ? sag(curves[cv]) : 0) + tol;
        segs.push({ a: a, b: b, cv: cv, fv: ch.fv ? ch.fv[i] : null, chain: ci, i: i, cuts: [], x0: Math.min(a[0], b[0]) - pad, x1: Math.max(a[0], b[0]) + pad, y0: Math.min(a[1], b[1]) - pad, y1: Math.max(a[1], b[1]) + pad });
      }
    });
    function adjacent(s, t) {
      if (s.chain !== t.chain) return false;
      var n = chains[s.chain].pts.length, d = Math.abs(s.i - t.i);
      return d <= 1 || (chains[s.chain].closed && d === n - 1);
    }
    function cutAt(s, p, u) {
      var t;
      if (s.fv) {
        // lane DP: on a chord of a spline / ellipse the cut carries the curve parameter u (the crossing moved onto the
        // true curve, freeCross) and goes on the chord whose parameter range holds it; a crossing at a sample's own
        // parameter goes on both chords there and takes the place of that (area-true, off-curve) end
        if (u == null) {
          var dx0 = s.b[0] - s.a[0], dy0 = s.b[1] - s.a[1], L0 = dx0 * dx0 + dy0 * dy0;
          var t0 = L0 > 0 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx0 + (p[1] - s.a[1]) * dy0) / L0)) : 0;
          s.cuts.push({ t: t0, p: p, u: s.fv.ua + (s.fv.ub - s.fv.ua) * t0 });
          return;
        }
        var Pd = frees[s.fv.k].period, hosts = [];
        segs.forEach(function (o2) {
          if (o2.chain !== s.chain || !o2.fv) return;
          var uu = u;
          if (Pd) uu -= Pd * Math.floor((uu - Math.min(o2.fv.ua, o2.fv.ub) + 1e-12) / Pd);
          var lo2 = Math.min(o2.fv.ua, o2.fv.ub), hi2 = Math.max(o2.fv.ua, o2.fv.ub), sp2 = o2.fv.ub - o2.fv.ua;
          if (uu >= lo2 - 1e-12 && uu <= hi2 + 1e-12) hosts.push({ o: o2, t: Math.max(0, Math.min(1, sp2 ? (uu - o2.fv.ua) / sp2 : 0)), u: uu });
        });
        if (!hosts.length) hosts.push({ o: s, t: 0.5, u: u });
        hosts.forEach(function (h) { h.o.cuts.push({ t: h.t, p: p, u: h.u }); });
        return;
      }
      if (s.cv >= 0) {
        // on a chord of a true curve the cut goes where the point's angle falls; it may fall in a neighbouring chord
        var C = curves[s.cv], ch = chains[s.chain], n = ch.pts.length, m = ch.closed ? n : n - 1;
        t = angleFraction(p, s.a, s.b, C);
        if (t == null) {
          for (var k = 0; k < segs.length; k++) {
            var o = segs[k];
            if (o.chain !== s.chain || o.cv !== s.cv || o === s) continue;
            var tk = angleFraction(p, o.a, o.b, C);
            if (tk != null) { o.cuts.push({ t: tk, p: p }); return; }
          }
          t = null;
        }
      }
      if (t == null) {
        var dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy;
        t = L2 > 0 ? ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
      }
      s.cuts.push({ t: t, p: p });
    }
    // a crossing of two chords, moved onto the true curves behind them
    function refine(s, u, X) {
      var Cs = s.cv >= 0 ? curves[s.cv] : null, Cu = u.cv >= 0 ? curves[u.cv] : null;
      if (!Cs && !Cu) return X;
      if (Cs && Cu && Cs === Cu) return X;
      var cands, lim = (Cs ? sag(Cs) : 0) + (Cu ? sag(Cu) : 0);
      if (Cs && Cu) cands = circleCircle(Cs, Cu);
      else {
        var line = Cs ? u : s;
        cands = lineCircle(line.a, line.b, Cs || Cu).filter(function (q) {
          var dx = line.b[0] - line.a[0], dy = line.b[1] - line.a[1], L2 = dx * dx + dy * dy, eps = L2 > 0 ? (lim + tol) / Math.sqrt(L2) : 0;
          var t = L2 > 0 ? ((q[0] - line.a[0]) * dx + (q[1] - line.a[1]) * dy) / L2 : 0;
          return t >= -eps && t <= 1 + eps;
        });
      }
      var best = null, bd = Infinity;
      cands.forEach(function (q) { var d = Math.hypot(q[0] - X[0], q[1] - X[1]); if (d < bd) { bd = d; best = q; } });
      return best && bd <= 10 * lim + tol ? best : X;
    }
    // lane DP: a crossing with a spline / ellipse chord, moved onto the true curve(s) by Newton's method from the chord
    // crossing: line x curve, circle x curve, curve x curve. -> { p, us, uu } (us / uu: the curve parameter on s / u,
    // null when that one is no free curve or the iteration did not settle near the chords)
    function freeCross(s, u, X) {
      function chordU(g) { var dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? ((X[0] - g.a[0]) * dx + (X[1] - g.a[1]) * dy) / L2 : 0; return g.fv.ua + (g.fv.ub - g.fv.ua) * Math.max(0, Math.min(1, t)); }
      function reach(g) { return 2 * Math.abs(g.fv.ub - g.fv.ua) + 1e-9; }
      var out = { p: X, us: null, uu: null };
      if (s.fv && u.fv) {
        if (s.fv.k === u.fv.k) return out;
        var F = frees[s.fv.k].rec, G = frees[u.fv.k].rec, a = chordU(s), b = chordU(u), a0 = a, b0 = b;
        for (var it = 0; it < 40; it++) {
          var P = freeEval(F, a), Q = freeEval(G, b), dP = freeDeriv(F, a), dQ = freeDeriv(G, b), rx = P[0] - Q[0], ry = P[1] - Q[1];
          // [dP, -dQ] (da, db) = -(P - Q)
          var det = -dP[0] * dQ[1] + dP[1] * dQ[0];
          if (Math.abs(det) < 1e-300) break;
          var da = (rx * dQ[1] - ry * dQ[0]) / det, db = (dP[1] * rx - dP[0] * ry) / det;
          a += da; b += db;
          if (Math.abs(da) + Math.abs(db) < 1e-15 * (1 + Math.abs(a) + Math.abs(b))) break;
        }
        if (!(Math.abs(a - a0) <= reach(s)) || !(Math.abs(b - b0) <= reach(u))) return out;
        return { p: freeEval(F, a), us: a, uu: b };
      }
      var fs = s.fv ? s : u, os = s.fv ? u : s, Fr = frees[fs.fv.k].rec, w = chordU(fs), w0 = w, C = os.cv >= 0 ? curves[os.cv] : null;
      for (var j = 0; j < 40; j++) {
        var Pw = freeEval(Fr, w), dw = freeDeriv(Fr, w), f, df;
        if (C) { var ex = Pw[0] - C.c[0], ey = Pw[1] - C.c[1]; f = ex * ex + ey * ey - C.r * C.r; df = 2 * (ex * dw[0] + ey * dw[1]); }
        else { var lx = os.b[0] - os.a[0], ly = os.b[1] - os.a[1]; f = lx * (Pw[1] - os.a[1]) - ly * (Pw[0] - os.a[0]); df = lx * dw[1] - ly * dw[0]; }
        if (Math.abs(df) < 1e-300) break;
        var dd = f / df;
        w -= dd;
        if (Math.abs(dd) < 1e-15 * (1 + Math.abs(w))) break;
      }
      if (!(Math.abs(w - w0) <= reach(fs))) return out;
      var p = freeEval(Fr, w);
      out.p = p;
      if (s.fv) out.us = w; else out.uu = w;
      return out;
    }
    function nearEnd(p, s) { return (Math.abs(p[0] - s.a[0]) <= tol && Math.abs(p[1] - s.a[1]) <= tol) || (Math.abs(p[0] - s.b[0]) <= tol && Math.abs(p[1] - s.b[1]) <= tol); }
    // an end p of segment s lying on segment u (not at u's ends): on u's true circle within its chord's angle, or on
    // the chord itself
    function endOn(p, s, u) {
      if (nearEnd(p, u)) return;
      if (u.cv >= 0 && (s.cv < 0 || s.cv !== u.cv)) {
        var C = curves[u.cv];
        if (Math.abs(Math.hypot(p[0] - C.c[0], p[1] - C.c[1]) - C.r) <= tol && angleFraction(p, u.a, u.b, C) != null) { cutAt(u, p); return; }
      }
      var dx = u.b[0] - u.a[0], dy = u.b[1] - u.a[1], L2 = dx * dx + dy * dy;
      if (L2 <= 0) return;
      var t = ((p[0] - u.a[0]) * dx + (p[1] - u.a[1]) * dy) / L2;
      if (t <= 0 || t >= 1) return;
      if (Math.abs(u.a[0] + dx * t - p[0]) <= tol && Math.abs(u.a[1] + dy * t - p[1]) <= tol) cutAt(u, p);
    }
    // every pair whose boxes meet (sweep on x)
    var order = segs.map(function (s, i) { return i; }).sort(function (i, j) { return segs[i].x0 - segs[j].x0; });
    for (var oi = 0; oi < order.length; oi++) {
      var s = segs[order[oi]];
      for (var oj = oi + 1; oj < order.length; oj++) {
        var u = segs[order[oj]];
        if (u.x0 > s.x1) break;
        if (u.y0 > s.y1 || u.y1 < s.y0 || adjacent(s, u)) continue;
        var X = segCross(s.a, s.b, u.a, u.b);
        if (X && (s.fv || u.fv)) { var fx = freeCross(s, u, X); cutAt(s, fx.p, fx.us); cutAt(u, fx.p, fx.uu); }
        else if (X) { X = refine(s, u, X); cutAt(s, X); cutAt(u, X); }
        endOn(s.a, s, u); endOn(s.b, s, u); endOn(u.a, u, s); endOn(u.b, u, s);
      }
    }
    // the split polylines, welded into a graph (vertices within 1e-4 are one)
    var verts = [], cells = {}, edges = [], ekeys = {};
    function vertexOf(p) {
      var cx = Math.round(p[0] * 1e4), cy = Math.round(p[1] * 1e4);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var ids = cells[(cx + dx) + ',' + (cy + dy)];
        if (!ids) continue;
        for (var k = 0; k < ids.length; k++) { var q = verts[ids[k]]; if (Math.abs(q[0] - p[0]) <= 1e-4 && Math.abs(q[1] - p[1]) <= 1e-4) return ids[k]; }
      }
      var id = verts.length;
      verts.push([p[0], p[1]]);
      (cells[cx + ',' + cy] = cells[cx + ',' + cy] || []).push(id);
      return id;
    }
    function addEdge(a, b, cv, fv) {
      if (a === b) return;
      var k = a < b ? a + ',' + b : b + ',' + a;
      if (ekeys[k] != null) return;
      ekeys[k] = edges.length;
      edges.push({ a: a, b: b, cv: cv, fv: fv || null, dead: false });
    }
    segs.forEach(function (s) {
      var pts = [s.a], us = [s.fv ? s.fv.ua : null], b = s.b;
      s.cuts.sort(function (p, q) { return p.t - q.t; });
      s.cuts.forEach(function (c) {
        if (c.t > 1e-9 && c.t < 1 - 1e-9) { pts.push(c.p); us.push(c.u); }
        else if (s.fv && c.t <= 1e-9) pts[0] = c.p;   // lane DP: the crossing on the true curve replaces the sample
        else if (s.fv) b = c.p;
      });
      pts.push(b); us.push(s.fv ? s.fv.ub : null);
      for (var i = 0; i + 1 < pts.length; i++) addEdge(vertexOf(pts[i]), vertexOf(pts[i + 1]), s.cv, s.fv ? { k: s.fv.k, ua: us[i], ub: us[i + 1] } : null);
    });
    // drop what dangles: an end that touches nothing bounds no region
    var adj = verts.map(function () { return []; }), deg = verts.map(function () { return 0; });
    edges.forEach(function (e, i) { adj[e.a].push(i); adj[e.b].push(i); deg[e.a]++; deg[e.b]++; });
    var stack = [];
    deg.forEach(function (d, v) { if (d === 1) stack.push(v); });
    while (stack.length) {
      var v = stack.pop();
      if (deg[v] !== 1) continue;
      for (var k = 0; k < adj[v].length; k++) {
        var e = edges[adj[v][k]];
        if (e.dead) continue;
        e.dead = true; deg[e.a]--; deg[e.b]--;
        var w = e.a === v ? e.b : e.a;
        if (deg[w] === 1) stack.push(w);
        break;
      }
    }
    return { verts: verts, edges: edges, adj: adj, curves: curves, frees: frees, span: span };
  }
  function regionFaces(g) {
    var verts = g.verts, edges = g.edges;
    // half-edge h: edge h >> 1, direction h & 1 (0: a -> b); outgoing half-edges per vertex sorted by angle
    function from(h) { var e = edges[h >> 1]; return h & 1 ? e.b : e.a; }
    function to(h) { var e = edges[h >> 1]; return h & 1 ? e.a : e.b; }
    var out = verts.map(function () { return []; });
    edges.forEach(function (e, i) { if (e.dead) return; out[e.a].push(2 * i); out[e.b].push(2 * i + 1); });
    var angles = {};
    out.forEach(function (list, v) {
      list.forEach(function (h) { var p = verts[v], q = verts[to(h)]; angles[h] = Math.atan2(q[1] - p[1], q[0] - p[0]); });
      list.sort(function (h1, h2) { return angles[h1] - angles[h2]; });
    });
    function next(h) {
      var v = to(h), list = out[v], i = list.indexOf(h ^ 1);
      return list[(i - 1 + list.length) % list.length];   // the first half-edge clockwise from the way back: the face on the left stays tight
    }
    var seen = {}, faces = [];
    edges.forEach(function (e, i) {
      if (e.dead) return;
      [2 * i, 2 * i + 1].forEach(function (h0) {
        if (seen[h0]) return;
        var h = h0, cyc = [], guard = 0;
        do { seen[h] = true; cyc.push(h); h = next(h); } while (h !== h0 && guard++ < 4 * edges.length + 4);
        var pts = cyc.map(function (x) { return verts[from(x)]; });
        faces.push({ cyc: cyc, pts: pts, area: signedArea(pts), v: from(h0) });
      });
    });
    // connected components (so an inner contour's outer face can be told from the outer face of the whole)
    var comp = verts.map(function (v, i) { return i; });
    function find(x) { while (comp[x] !== x) { comp[x] = comp[comp[x]]; x = comp[x]; } return x; }
    edges.forEach(function (e) { if (!e.dead) comp[find(e.a)] = find(e.b); });
    faces.forEach(function (f) {
      f.comp = find(f.v);
      f.edges = f.cyc.map(function (h) { var e = edges[h >> 1], fv = e.fv ? (h & 1 ? { k: e.fv.k, ua: e.fv.ub, ub: e.fv.ua } : e.fv) : null; return { a: verts[from(h)], b: verts[to(h)], cv: e.cv, fv: fv }; });
    });
    return faces;
  }
  // lane DP: a free curve (profile.free's record: { t: 'spline', bez, knots, closed } | { t: 'ellipse', cx, cy, rx, ry,
  // rot }) at parameter u (knot length / radians), its derivative, and the sliver between it and its chord from ua to
  // ub (ua < ub inside one span)
  function freeSpan(F, u) {
    var m = F.bez.length, P = F.knots[m];
    if (F.closed && P > 0) u -= P * Math.floor(u / P);
    var j = 0;
    while (j < m - 1 && u > F.knots[j + 1]) j++;
    var h = F.knots[j + 1] - F.knots[j];
    return { B: F.bez[j], s: h > 0 ? (u - F.knots[j]) / h : 0, h: h };
  }
  function freeEval(F, u) {
    if (F.t === 'ellipse') return ellipsePoint(F, u);
    var sp = freeSpan(F, u);
    return bezPoint(sp.B, sp.s);
  }
  function freeDeriv(F, u) {
    if (F.t === 'ellipse') {
      var r = (+F.rot || 0) * Math.PI / 180, x = -F.rx * Math.sin(u), y = F.ry * Math.cos(u);
      return [Math.cos(r) * x - Math.sin(r) * y, Math.sin(r) * x + Math.cos(r) * y];
    }
    var sp = freeSpan(F, u), d = bezDeriv(sp.B, sp.s);
    return [d[0] / (sp.h || 1), d[1] / (sp.h || 1)];
  }
  function freeSliver(F, ua, ub) {
    if (F.t === 'ellipse') { var d = ub - ua; return F.rx * F.ry / 2 * (d - Math.sin(d)); }
    var sp = freeSpan(F, (ua + ub) / 2);
    return bezSliver(sp.B, sp.s + (ua - (ua + ub) / 2) / (sp.h || 1), sp.s + (ub - (ua + ub) / 2) / (sp.h || 1));
  }
  // exactFreeLoop(loop, cv, fv, frees) -> loop with seg (circle tags, as sketchProfile's) and fseg: every run of a
  // region loop along one spline / ellipse (fv[i] = { k, ua, ub }: segment i lies on frees[k] from parameter ua to ub)
  // is sampled again between its two ends (the crossings, on the true curve) at the curve's own sample parameters and
  // made area-true (areaTrue: the polyline encloses what the curve does), so an extrude of the region is as exact as
  // the plain extrude of the same curve, and fseg = [k, u at i, u at i + 1] gives OpenCascade the true curve
  // (loopWire), as sketchProfile's loops do. A loop that is one whole closed curve keeps its points.
  function exactFreeLoop(loop, cv, fv, frees) {
    var pts = loop.pts, n = pts.length, hasC = cv.some(function (k) { return k >= 0; });
    if (!frees || !fv || !fv.some(Boolean)) { if (hasC) loop.seg = cv; return loop; }
    function joins(p, q) {
      if (!p || !q || p.k !== q.k) return false;
      var d = q.ua - p.ub, P = frees[p.k].period;
      if (P) d -= P * Math.round(d / P);
      return Math.abs(d) < 1e-9 * (1 + Math.abs(q.ua));
    }
    var start = -1, i;
    for (i = 0; i < n; i++) if (!joins(fv[(i + n - 1) % n], fv[i])) { start = i; break; }
    if (start < 0) {
      if (hasC) loop.seg = cv;
      loop.fseg = fv.map(function (q) { return [q.k, q.ua, q.ub]; });
      return loop;
    }
    var P2 = [], seg = [], fseg = [];
    i = 0;
    while (i < n) {
      var a = (start + i) % n;
      if (!fv[a]) { P2.push(pts[a]); seg.push(cv[a]); fseg.push(-1); i++; continue; }
      var len = 1, k = fv[a].k, u0 = fv[a].ua, u1 = u0 + (fv[a].ub - fv[a].ua);
      while (i + len < n && joins(fv[(start + i + len - 1) % n], fv[(start + i + len) % n])) { var q = fv[(start + i + len) % n]; u1 += q.ub - q.ua; len++; }
      var R = frees[k], F = R.rec, lo = Math.min(u0, u1), hi = Math.max(u0, u1), grid = [lo, hi], Pd = R.period;
      R.par.concat(Pd ? [Pd] : []).forEach(function (pv) {
        if (Pd) pv += Pd * Math.ceil((lo - pv) / Pd);
        for (; pv < hi; pv += Pd || Infinity) if (pv > lo + 1e-12 && pv < hi - 1e-12) grid.push(pv);
      });
      grid.sort(function (x, y) { return x - y; });
      grid = grid.filter(function (x, j) { return !j || x - grid[j - 1] > 1e-12; });
      if (grid.length < 3) grid.splice(1, 0, (lo + hi) / 2);
      var sp = grid.map(function (u) { return freeEval(F, u); }), sl = [];
      for (var j = 0; j + 1 < grid.length; j++) sl.push(freeSliver(F, grid[j], grid[j + 1]));
      sp = areaTrue(sp, sl, false);
      if (u1 < u0) { sp.reverse(); grid.reverse(); }
      sp[0] = pts[a];
      // a closed spline's run across its start: OpenCascade's B-spline is not periodic, so the part past the start is
      // tagged with a second record of the same curve (one edge each, parameters back in [0, period])
      var wrapK = F.t === 'spline' && Pd ? -1 : null, m0 = null;
      for (j = 0; j + 1 < sp.length; j++) {
        var ga = grid[j], gb = grid[j + 1], kk = k;
        if (wrapK != null) {
          var mm = Math.floor((ga + gb) / 2 / Pd);
          if (m0 == null) m0 = mm;
          ga -= mm * Pd; gb -= mm * Pd;
          if (mm !== m0) {
            if (wrapK < 0) {
              for (var fi2 = 0; fi2 < frees.length && wrapK < 0; fi2++) if (frees[fi2].alias === k) wrapK = fi2;
              if (wrapK < 0) { frees.push({ rec: F, keys: {}, par: R.par, n: R.n, closed: R.closed, period: Pd, alias: k }); wrapK = frees.length - 1; }
            }
            kk = wrapK;
          }
        }
        P2.push(sp[j]); seg.push(-1); fseg.push([kk, ga, gb]);
      }
      i += len;
    }
    loop.pts = P2;
    if (seg.some(function (x) { return x >= 0; })) loop.seg = seg;
    loop.fseg = fseg;
    return loop;
  }
  var regionCache = { key: null, regions: null };
  function sketchRegions(sketch) {
    syncTextPaths(sketch);
    var key = tessKey() + '|' + JSON.stringify(sketch.entities || null) + '|' + JSON.stringify(sketch.layers || null);
    if (regionCache.key === key) return regionCache.regions;
    var g = regionGraph(sketch), faces = regionFaces(g), eps = 1e-10 * (1 + g.span * g.span);
    var bounded = faces.filter(function (f) { return f.area > eps; }), outers = {};
    faces.forEach(function (f) { if (f.area < -eps && (!outers[f.comp] || f.area < outers[f.comp].area)) outers[f.comp] = f; });
    bounded.forEach(function (f) { f.holes = []; });
    Object.keys(outers).forEach(function (c) {
      var O = outers[c], probe = [(O.pts[0][0] + O.pts[1 % O.pts.length][0]) / 2, (O.pts[0][1] + O.pts[1 % O.pts.length][1]) / 2], best = null;
      bounded.forEach(function (f) { if (f.comp !== O.comp && (!best || f.area < best.area) && pointInPoly(probe, f.pts)) best = f; });
      if (best) best.holes.push(O);
    });
    function loopOf(f, hole) {
      var pts = f.pts, cv = f.edges.map(function (e) { return e.cv; }), fv = f.edges.map(function (e) { return e.fv; }), n = pts.length;
      if (hole) {   // traced clockwise round the hole; the profile wants every loop counter-clockwise
        pts = pts.slice().reverse();
        cv = cv.map(function (x, j) { return f.edges[(n - 2 - j + n) % n].cv; });
        fv = fv.map(function (x, j) { var q = f.edges[(n - 2 - j + n) % n].fv; return q ? { k: q.k, ua: q.ub, ub: q.ua } : null; });
      }
      return exactFreeLoop({ pts: pts, hole: !!hole, depth: hole ? 1 : 0 }, cv, fv, g.frees);
    }
    var regions = bounded.map(function (f) {
      var loops = [loopOf(f, false)].concat(f.holes.map(function (h) { return loopOf(h, true); }));
      var area = f.area;
      f.holes.forEach(function (h) { area -= Math.abs(h.area); });
      var ed = f.edges.slice();
      f.holes.forEach(function (h) { ed = ed.concat(h.edges); });
      var bb = loopBox(f.pts);
      return { loops: loops, area: area, p: interiorPoint(loops), _edges: ed, _bb: bb };
    });
    regions.sort(function (r, s) { return (r._bb[0] - s._bb[0]) || (r._bb[1] - s._bb[1]) || (s.area - r.area) || (r.p[0] - s.p[0]) || (r.p[1] - s.p[1]); });
    regions.forEach(function (r, i) { r.index = i; delete r._bb; });
    if (regions.some(function (r) { return r.loops.some(function (l) { return l.seg; }); })) regions.curves = g.curves;
    if (regions.some(function (r) { return r.loops.some(function (l) { return l.fseg; }); })) regions.free = g.frees.map(function (F) { return F.rec; });
    regions.frees = g.frees;
    regionCache = { key: key, regions: regions };
    return regions;
  }
  // a point strictly inside the outer loop and outside the holes: the middle of the longest run of a scan line through
  // the centroid of the outer loop's biggest ear
  function interiorPoint(loops) {
    var outer = loops[0].pts, best = null, ba = 0;
    _.triangulate(outer).forEach(function (t) {
      var a = outer[t[0]], b = outer[t[1]], c = outer[t[2]], ar = Math.abs(signedArea([a, b, c]));
      if (ar > ba) { ba = ar; best = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; }
    });
    if (!best) { best = [0, 0]; outer.forEach(function (p) { best[0] += p[0] / outer.length; best[1] += p[1] / outer.length; }); }
    var y0 = best[1], xs = [];
    loops.forEach(function (l) {
      for (var i = 0, n = l.pts.length; i < n; i++) {
        var p = l.pts[i], q = l.pts[(i + 1) % n];
        if ((p[1] > y0) !== (q[1] > y0)) xs.push(p[0] + (y0 - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      }
    });
    xs.sort(function (a, b) { return a - b; });
    var bi = -1, bl = 0;
    for (var k = 0; k + 1 < xs.length; k += 2) { var L = xs[k + 1] - xs[k]; if (L > bl) { bl = L; bi = k; } }
    return bi >= 0 ? [(xs[bi] + xs[bi + 1]) / 2, y0] : best;
  }
  function regionAt(sketch, uv, regions) {
    regions = regions || sketchRegions(sketch);
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      if (!pointInPoly(uv, r.loops[0].pts)) continue;
      var inHole = false;
      for (var j = 1; j < r.loops.length; j++) if (pointInPoly(uv, r.loops[j].pts)) { inHole = true; break; }
      if (!inHole) return r;
    }
    return null;
  }
  function contourProfile(sketch, contours) {
    var regions = sketchRegions(sketch), picked = [], seen = {};
    if (!regions.length) throw new Error('Sketch has no closed region for the selected contours.');
    (contours || []).forEach(function (c) {
      var uv = [+c[0], +c[1]], r = regionAt(sketch, uv, regions);
      if (!r) throw new Error('Selected contour at (' + _.fmt(uv[0]) + ', ' + _.fmt(uv[1]) + ') is no longer inside a closed sketch region. Edit the feature and pick its contours again.');
      if (!seen[r.index]) { seen[r.index] = true; picked.push(r); }
    });
    if (!picked.length) throw new Error('Select at least one contour.');
    // the union of the picked regions: the edge two of them share is gone; what is left chains into the outline and holes
    var dir = {};
    picked.forEach(function (r) {
      r._edges.forEach(function (e) {
        var ka = key2(e.a), kb = key2(e.b), back = kb + '>' + ka;
        if (dir[back]) delete dir[back]; else dir[ka + '>' + kb] = { a: e.a, b: e.b, cv: e.cv, fv: e.fv, ka: ka, kb: kb };
      });
    });
    var outs = {};
    Object.keys(dir).forEach(function (k) { var e = dir[k]; (outs[e.ka] = outs[e.ka] || []).push(e); });
    var loops = [];
    Object.keys(dir).forEach(function (k0) {
      var e = dir[k0];
      if (e.used) return;
      var pts = [], cv = [], fv = [], cur = e, guard = 0;
      while (cur && !cur.used && guard++ < 100000) {
        cur.used = true; pts.push(cur.a); cv.push(cur.cv); fv.push(cur.fv || null);
        var cands = (outs[cur.kb] || []).filter(function (x) { return !x.used; });
        if (!cands.length) break;
        if (cands.length === 1) { cur = cands[0]; continue; }
        var rev = Math.atan2(cur.a[1] - cur.b[1], cur.a[0] - cur.b[0]), best = null, bturn = Infinity;   // the first way clockwise from the way back
        cands.forEach(function (x) { var t = rev - Math.atan2(x.b[1] - x.a[1], x.b[0] - x.a[0]); while (t <= 1e-12) t += 2 * Math.PI; while (t > 2 * Math.PI) t -= 2 * Math.PI; if (t < bturn) { bturn = t; best = x; } });
        cur = best;
      }
      if (pts.length < 3) return;
      var a = signedArea(pts), loop;
      if (a < 0) {
        var n = pts.length, rc = cv.map(function (x, j) { return cv[(n - 2 - j + n) % n]; });
        var rf = fv.map(function (x, j) { var q = fv[(n - 2 - j + n) % n]; return q ? { k: q.k, ua: q.ub, ub: q.ua } : null; });
        loop = exactFreeLoop({ pts: pts.slice().reverse(), hole: true, depth: 1 }, rc, rf, regions.frees);
      } else loop = exactFreeLoop({ pts: pts, hole: false, depth: 0 }, cv, fv, regions.frees);
      loops.push(loop);
    });
    loops.sort(function (l, m) { return (l.hole ? 1 : 0) - (m.hole ? 1 : 0); });
    var prof = { loops: loops, warnings: [] };
    if (loops.some(function (l) { return l.seg; })) prof.curves = regions.curves;
    if (loops.some(function (l) { return l.fseg; })) prof.free = (regions.frees || []).map(function (F) { return F.rec; });
    return prof;
  }
  function contourSketch(f, sketch) {
    if (!f || !Array.isArray(f.contours) || !f.contours.length || !sketch) return sketch;
    var copy = {};
    Object.keys(sketch).forEach(function (k) { copy[k] = sketch[k]; });
    copy.profile = contourProfile(sketch, f.contours);
    return copy;
  }
  function regionsAmbiguous(sketch) {
    var regions = sketchRegions(sketch);
    if (!regions.length) return false;
    var prof = sketch.profile || sketchProfile(sketch);
    return regions.length > prof.loops.length || prof.loops.some(function (l) { return l.cross || l.meet; });
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
        if (e.knots) { out.knots = e.knots.slice(); out.deg = bsDeg(e); }   // lane fitspline: a B-spline's knots stay (its control points mirror)
        if (e.tans) out.tans = e.tans.map(function (tg) { return tg ? [2 * phi - tg[0]].concat(tg.slice(1, 3), tg[3] != null ? [-tg[3]] : []) : null; });   // rfAY: a curvature control bends the other way
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
      case 'spline': {
        // lane DM: Smart Dimension on a curvature control (SolidWorks: dimension the curvature handle): the radius of
        // curvature 1 / |tans[i][3]| at spline point i; drawn as a radius leader from the point itself (C = the point,
        // r = 0: the arrow on the spline, the label where it was placed); `centre` is the true centre of curvature
        if (k !== 'curv') return null;
        var ci = d.i | 0, tc = e.tans && e.tans[ci], kc = tc && tc[3] != null ? +tc[3] : NaN;
        if (!e.pts || !e.pts[ci] || !isFinite(kc) || Math.abs(kc) < 1e-12) return null;
        var Pc = [e.pts[ci][0], e.pts[ci][1]], ta = (tc[0] != null ? +tc[0] : 0) * Math.PI / 180, nc = [-Math.sin(ta), Math.cos(ta)];
        return { type: 'radial', C: Pc, r: 0, value: 1 / Math.abs(kc), prefix: 'R', curv: true, centre: [Pc[0] + nc[0] / kc, Pc[1] + nc[1] / kc] };
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
      case 'spline': { var tcs = e.tans[d.i | 0]; tcs[3] = (+tcs[3] < 0 ? -1 : 1) / v; break; }   // lane DM: keeps the side it bends to
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

  // The end points of an entity: a line's two ends (a ray's one, an infinite line's none), an arc's two, a rectangle's /
  // polygon's corners, a polyline's vertices, an open spline's / partial ellipse's two ends. Closed curves (circles,
  // ellipses, closed splines, slots), points and text have none.
  function entityEnds(e) {
    if (!e) return [];
    switch (e.t) {
      case 'line': {
        var inf = e.infinite, ends = [];
        if (!inf || inf === 'p2') ends.push([e.x1, e.y1]);   // 'p2': that side runs on for ever, p1 is still an end
        if (!inf || inf === 'p1') ends.push([e.x2, e.y2]);
        return ends;
      }
      case 'arc': return [[e.cx + e.r * Math.cos(e.a0 * Math.PI / 180), e.cy + e.r * Math.sin(e.a0 * Math.PI / 180)], [e.cx + e.r * Math.cos(e.a1 * Math.PI / 180), e.cy + e.r * Math.sin(e.a1 * Math.PI / 180)]];
      case 'rect': case 'crect': case 'poly': case 'polyline': { var pl = entityPolylines(e)[0]; return pl ? pl.pts.slice() : []; }
      case 'spline': return e.closed || !e.pts || e.pts.length < 2 ? [] : [e.pts[0], e.pts[e.pts.length - 1]];
      case 'pellipse': { var pe = entityPolylines(e)[0]; return pe && pe.pts.length >= 2 ? [pe.pts[0], pe.pts[pe.pts.length - 1]] : []; }
    }
    return [];
  }
  // rfCH: the parameter on primitive p of the foot of point pt, when pt lies on p within tol and the foot is inside it
  // (more than tol from either end: a point at an end makes no cut), else null.
  function footParam(p, pt, tol) {
    if (p.kind === 'seg') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], L2 = d[0] * d[0] + d[1] * d[1], L = Math.sqrt(L2);
      if (L2 < 1e-24) return null;
      var t = ((pt[0] - p.a[0]) * d[0] + (pt[1] - p.a[1]) * d[1]) / L2;
      if (t * L <= tol || (1 - t) * L <= tol) return null;
      return Math.hypot(pt[0] - p.a[0] - d[0] * t, pt[1] - p.a[1] - d[1] * t) <= tol ? t : null;
    }
    var vx = pt[0] - p.c[0], vy = pt[1] - p.c[1], rr = Math.hypot(vx, vy);
    if (rr < 1e-12 || Math.abs(rr - p.r) > tol) return null;
    var a = angleIn(Math.atan2(vy, vx), p.a0, p.a1);
    if (a == null) return null;
    if (!p.full && ((a - p.a0) * p.r <= tol || (p.a1 - a) * p.r <= tol)) return null;
    return a;
  }
  // rfCH: the parameters on primitive `prim` (number k of entity idx) at which Trim cuts it: where the other entities'
  // primitives truly cross it, where an end point of another entity truly lies on it (a T-junction: within opts.tol,
  // floating-point noise only — 1e-9 of the sketch's size, the largest coordinate, 1 at least), and at opts.cuts
  // (points the caller knows are tied to it: ends a Coincident holds on the entity, taken within opts.cutTol, 1e-3 of
  // the size), each exactly at the point's foot on the primitive. An end that stops short of the entity or overshoots
  // it by more than noise is no junction (user, 2026-10-14: "it shouldn't trim if it's not a true intersection or a
  // T-junction"): nothing cuts there, as before. A point at the primitive's own end is no cut (no zero-length piece);
  // the same parameter reached twice counts once. opts.only: the indices of the entities that cut (all when absent).
  // opts.ends (rfCK): keep a crossing at the primitive's own end too (Trim away inside / outside: a bound through the
  // end is a corner the entity does meet; the caller drops the empty span there).
  // rfCK: a junction the crossing test already found counts once: the foot of an end that is off the primitive by up to
  // its tolerance (overshooting it, so the entity crosses it there too) is dropped when a crossing lies within that
  // tolerance along the primitive; before, the two parameters (apart by less than the tolerance, more than the 1e-9
  // merge) were two cuts, and a circle with one such junction kept a sliver or a 360-degree arc instead of going.
  // Before this (user report, 2026-10-14) a junction counted only through the crossing test, within 1e-9 of the other
  // entity's parameter, and an end a hair off it did not split the line: trimming at the junction deleted the whole line.
  function trimCuts(entities, idx, k, prim, opts) {
    opts = opts || {};
    var only = opts.only || null, cross = [], feet = [], size = 1;
    function grow(p) { size = Math.max(size, Math.abs(p[0]), Math.abs(p[1])); }
    if (prim.kind === 'seg') { grow(prim.a); grow(prim.b); } else grow([Math.abs(prim.c[0]) + prim.r, Math.abs(prim.c[1]) + prim.r]);
    if (opts.tol == null) entities.forEach(function (o) { entityEnds(o).forEach(grow); });
    var tol = opts.tol != null ? opts.tol : 1e-9 * size;
    entities.forEach(function (o, oi) {
      if (!o || o.t === 'point' || (only && only.indexOf(oi) < 0)) return;
      entityPrimitives(o).forEach(function (q, qi) {
        if (oi === idx && qi === k) return;
        primIntersections(prim, q).forEach(function (t) { cross.push(t); });
      });
      if (oi !== idx) entityEnds(o).forEach(function (p) { feet.push([p, tol]); });
    });
    var cutTol = opts.cutTol != null ? opts.cutTol : Math.max(tol, 1e-3 * size);
    (opts.cuts || []).forEach(function (p) { feet.push([p, cutTol]); });
    var start = prim.kind === 'arc' ? prim.a0 : 0, end = prim.kind === 'arc' ? prim.a1 : 1, per = prim.kind === 'arc' ? prim.r : Math.hypot(prim.b[0] - prim.a[0], prim.b[1] - prim.a[1]);
    var params = cross.slice();
    feet.forEach(function (f) {
      var t = footParam(prim, f[0], f[1]);
      if (t == null) return;
      var same = cross.some(function (c) { var d = Math.abs(t - c); if (prim.full) d = Math.min(d, 2 * Math.PI - d); return d * per <= f[1]; });
      if (!same) params.push(t);
    });
    // a crossing at the primitive's own end (an L corner) cuts nothing either, unless the caller asks for it (opts.ends)
    if (!opts.ends) params = params.filter(function (t) { return prim.full || ((t - start) * per > tol && (end - t) * per > tol); });
    params.sort(function (a, b) { return a - b; });
    return params.filter(function (t, i) { return !i || t - params[i - 1] > 1e-9; });
  }

  // Trim: remove the portion of entity `idx` between the intersections on either side of the point uv.
  // Returns the new entity list (the trimmed entity is replaced by 0..n pieces). Slots (and arc slots) are exploded into
  // lines and arcs first; rectangles and polygons become polylines. opts (rfCH): the T-junction options of trimCuts
  // ({ tol, cuts, cutTol }).
  function trimEntity(entities, idx, uv, opts) {
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
      return trimEntity(list, best, uv, opts);
    }
    var prims = entityPrimitives(e), k = -1, kd = Infinity, kt = 0;
    prims.forEach(function (p, i) { var q = primParamAt(p, uv); if (q.dist < kd) { kd = q.dist; k = i; kt = q.t; } });
    if (k < 0) throw new Error('Nothing to trim there.');
    var prim = prims[k], params = trimCuts(entities, idx, k, prim, opts);
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
    // a closed ring from pieces in order: { pts, sr (the circle the piece's chords lie on, null: straight) }; a piece
    // starting where the last ended continues it, otherwise a straight edge joins them (a flat end)
    function ringOf(pieces) {
      var P = [], S = [];
      function same(p, q) { return Math.abs(p[0] - q[0]) <= 1e-12 * (1 + Math.abs(p[0])) && Math.abs(p[1] - q[1]) <= 1e-12 * (1 + Math.abs(p[1])); }
      function add(q, sr) { if (P.length) S.push(sr); P.push(q); }
      pieces.forEach(function (pc) {
        pc.pts.forEach(function (q, i) { if (i === 0 && P.length && same(P[P.length - 1], q)) return; add(q, i === 0 ? null : pc.sr); });
      });
      if (P.length > 1 && same(P[P.length - 1], P[0])) P.pop(); else S.push(null);
      return { pts: P, src: S };
    }
    function capPiece(c, a0, a1, segs) {   // a round end: half a circle of the stroke's radius, with its curve record
      curves.push({ c: c, r: hw, a0: a0, a1: a1, full: false, step: (a1 - a0) / segs });
      return { pts: arcPoints(c[0], c[1], hw, a0, a1, segs), sr: { id: uid++, c: c, r: hw } };
    }
    function flatPiece(c, a0, a1) { return { pts: [[c[0] + hw * Math.cos(a0), c[1] + hw * Math.sin(a0)], [c[0] + hw * Math.cos(a1), c[1] + hw * Math.sin(a1)]], sr: null }; }
    // lane CV2: flatA / flatB — the end runs on smoothly into the next stroke (a tangent joint), so it is cut square
    // instead of rounded: a round cap there poked its chords out of the neighbour's ring and the union kept slivers
    // that no true arc carries (plain Cut "O" was 0.46 % short of its analytic area)
    function capsule(a, b, flatA, flatB) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.hypot(dx, dy) < 1e-12) { var rg = circleRing(a, hw, true); shapes.push({ rings: [rg], box: box(rg.pts) }); return; }
      var ang = Math.atan2(dy, dx), segs = Math.max(8, Math.round(segsForRadius(hw) / 2));
      var rg2 = ringOf([flatB ? flatPiece(b, ang - Math.PI / 2, ang + Math.PI / 2) : capPiece(b, ang - Math.PI / 2, ang + Math.PI / 2, segs),
        flatA ? flatPiece(a, ang + Math.PI / 2, ang + 3 * Math.PI / 2) : capPiece(a, ang + Math.PI / 2, ang + 3 * Math.PI / 2, segs)]);
      shapes.push({ rings: [rg2], box: box(rg2.pts) });
    }
    function chain(pts) { for (var i = 0; i + 1 < pts.length; i++) capsule(pts[i], pts[i + 1]); }
    // the ends of the line and arc strokes: { p, o (unit, pointing out of the stroke) }; an end meeting exactly one other
    // end at the same point with the opposite outward direction is a tangent joint (flat)
    var ends = [];
    strokes.forEach(function (s, i) {
      if (s.t === 'line') {
        var L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        if (L > 1e-12) { var tx = (s.x2 - s.x1) / L, ty = (s.y2 - s.y1) / L; ends.push({ i: i, k: 0, p: [s.x1, s.y1], o: [-tx, -ty] }, { i: i, k: 1, p: [s.x2, s.y2], o: [tx, ty] }); }
      } else if (s.t === 'arc' && s.a1 - s.a0 < 360 - 1e-9 && s.r - hw > 1e-6 * s.r) {
        var e0 = s.a0 * Math.PI / 180, e1 = s.a1 * Math.PI / 180;
        ends.push({ i: i, k: 0, p: [s.cx + s.r * Math.cos(e0), s.cy + s.r * Math.sin(e0)], o: [Math.sin(e0), -Math.cos(e0)] },
          { i: i, k: 1, p: [s.cx + s.r * Math.cos(e1), s.cy + s.r * Math.sin(e1)], o: [-Math.sin(e1), Math.cos(e1)] });
      }
    });
    var flat = {}, tolP = 1e-9 * Math.max(1, hw);
    ends.forEach(function (E) {
      var meet = ends.filter(function (F) { return F !== E && Math.hypot(F.p[0] - E.p[0], F.p[1] - E.p[1]) <= tolP; });
      if (meet.length === 1 && E.o[0] * meet[0].o[0] + E.o[1] * meet[0].o[1] < -1 + 1e-9) flat[E.i + ':' + E.k] = true;
    });
    strokes.forEach(function (s, si) {
      if (s.t === 'line') { capsule([s.x1, s.y1], [s.x2, s.y2], flat[si + ':0'], flat[si + ':1']); return; }
      if (s.t === 'poly') { chain(s.closed ? s.pts.concat([s.pts[0]]) : s.pts); return; }
      var sweep = s.a1 - s.a0, c = [s.cx, s.cy];
      if (!(s.r - hw > 1e-6 * s.r)) { chain(strokePolyline(s).pts.concat(sweep >= 360 - 1e-9 ? [strokePolyline(s).pts[0]] : [])); return; }   // tighter than the stroke: a chain of capsules
      if (sweep >= 360 - 1e-9) {   // a full circle: the ring between r ± w/2
        var outer = circleRing(c, s.r + hw, true), inner = circleRing(c, s.r - hw, false);
        shapes.push({ rings: [outer, inner], box: box(outer.pts) });
        return;
      }
      // an arc: arc slots of at most 180° each (a longer one could close on itself); the joints between them are flat
      var k = Math.max(1, Math.ceil(sweep / 180 - 1e-9));
      for (var j = 0; j < k; j++) {
        var as = aslotArcs({ cx: s.cx, cy: s.cy, r: s.r, a0: s.a0 + sweep * j / k, a1: s.a0 + sweep * (j + 1) / k, w: 2 * hw });
        if (!as) continue;
        var fl0 = j > 0 || flat[si + ':0'], fl1 = j < k - 1 || flat[si + ':1'], pieces = [];
        as.forEach(function (cv, q) {
          if ((q === 1 && fl1) || (q === 3 && fl0)) return;   // the end caps (1: at a1, 3: at a0)
          var p = cv.back ? arcPoints(cv.c[0], cv.c[1], cv.r, cv.a1, cv.a0, cv.n) : arcPoints(cv.c[0], cv.c[1], cv.r, cv.a0, cv.a1, cv.n);
          pieces.push({ pts: p, sr: { id: uid++, c: cv.c, r: cv.r } });
          curves.push({ c: cv.c, r: cv.r, a0: cv.a0, a1: cv.a1, full: false, step: (cv.a1 - cv.a0) / cv.n });
        });
        var ring = ringOf(pieces);
        shapes.push({ rings: [ring], box: box(ring.pts) });
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
  // the bridge (the furthest of the three, then a tenth of the width more), and the bridge is that stretch bw wide —
  // at most half as wide as the counter across it (lane CV2).
  function textBridges(lay, hw, bw, scale) {
    var out = [];
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
        // lane CV2: a bridge is never wider than half the counter it crosses (a wider one swallowed the letter: Stencil
        // "B" 1 high with the 0.8 mm default bridge kept 0.3 % of its area); b / m are this bridge's half width / margin
        var b = Math.min(bw, 0.5 * (ax === 0 ? wd : ht)) / 2, m = Math.max(0.2 * b, 1e-9 * scale);
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
  // lane CV: Dissolve Sketch Text (SolidWorks' right-click ▸ Dissolve Sketch Text). dissolveText(e) -> the ordinary
  // sketch entities the text is drawn with, on the text's layer (ETCH for an Etch text with none), construction kept:
  // Etch strokes as lines, arcs (circles when whole) and open / closed polylines; a Cut text's outline loops as lines
  // and arcs end to end (a run of chords of one true circle is one arc, a loop all on one circle a circle; a run whose
  // ends are off its circle, where trueArcs kept the chords, stays lines), collinear straight pieces joined. The
  // profile of the result is the text's: same loops, same exact curves (volumes agree to rounding).
  function dissolveText(e) {
    if (!e || e.t !== 'text') return [];
    var out = [], layer = e.layer != null && e.layer !== '' ? e.layer : (e.mode === 'outline' ? null : 'ETCH');
    function add(x) { if (layer) x.layer = layer; if (e.construction) x.construction = true; out.push(x); }
    function deg(a) { return a * 180 / Math.PI; }
    if (e.mode !== 'outline') {
      textLayout(e).strokes.forEach(function (s) {
        if (s.t === 'line') add({ t: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
        else if (s.t === 'poly') { var pl = { t: 'polyline', pts: s.pts.map(function (q) { return [q[0], q[1]]; }) }; if (s.closed) pl.closed = true; add(pl); }
        else if (s.a1 - s.a0 >= 360 - 1e-9) add({ t: 'circle', cx: s.cx, cy: s.cy, r: s.r });
        else add({ t: 'arc', cx: s.cx, cy: s.cy, r: s.r, a0: s.a0, a1: s.a1 });
      });
      return out;
    }
    var o = textOutline(e);
    (o ? o.loops : []).forEach(function (l) {
      var P = l.pts, src = l.src, n = P.length, segs = [], j;
      if (n < 2) return;
      function onCircle(p, s) { return Math.abs(Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.r) <= 1e-9 * Math.max(1, s.r); }
      // edge j (P[j] -> P[j + 1]) lies on a true circle when both its ends do (as curveSegments tags a profile's chords);
      // a partial chord the union left at a crossing trueArcs could not move onto the circle stays a line
      var on = [], tags = curveSegments(P, o.curves);
      for (j = 0; j < n; j++) {
        var cv = tags && tags[j] >= 0 ? o.curves[tags[j]] : null;
        on.push(cv ? { c: cv.c, r: cv.r } : null);   // exactly the chords the text's own profile takes as true arcs
      }
      function same(a, b) { return !!(a && b && (a === b || (Math.abs(a.r - b.r) <= 1e-9 * Math.max(1, a.r) && Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) <= 1e-9 * Math.max(1, a.r)))); }
      if (on.every(function (s) { return same(s, on[0]); })) { add({ t: 'circle', cx: on[0].c[0], cy: on[0].c[1], r: on[0].r }); return; }
      var s0 = 0;
      while (s0 < n && on[s0] && same(on[s0], on[(s0 + n - 1) % n])) s0++;
      function line(a, b) {
        var last = segs[segs.length - 1];
        if (last && last.t === 'line') {   // join a straight piece on to the previous one when they are collinear
          var ux = last.x2 - last.x1, uy = last.y2 - last.y1, vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(ux, uy) * Math.hypot(vx, vy);
          if (L > 0 && Math.abs(ux * vy - uy * vx) <= 1e-12 * L && ux * vx + uy * vy > 0) { last.x2 = b[0]; last.y2 = b[1]; return; }
        }
        segs.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      }
      for (var i = 0; i < n;) {
        var a = (s0 + i) % n, sr = on[a];
        if (!sr) { line(P[a], P[(a + 1) % n]); i++; continue; }
        var k = i + 1;
        while (k < n && same(on[(s0 + k) % n], sr)) k++;
        var A = P[a], c = sr.c, sw = 0;
        for (j = i; j < k; j++) {
          var p = P[(s0 + j) % n], p2 = P[(s0 + j + 1) % n];
          sw += Math.atan2((p[0] - c[0]) * (p2[1] - c[1]) - (p[1] - c[1]) * (p2[0] - c[0]), (p[0] - c[0]) * (p2[0] - c[0]) + (p[1] - c[1]) * (p2[1] - c[1]));
        }
        var ta = Math.atan2(A[1] - c[1], A[0] - c[0]), tb = ta + sw;
        segs.push({ t: 'arc', cx: c[0], cy: c[1], r: sr.r, a0: deg(Math.min(ta, tb)), a1: deg(Math.max(ta, tb)) });
        i = k;
      }
      segs.forEach(add);
    });
    return out;
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
      if (src.knots) { g.knots = src.knots.map(Number); g.deg = bsDeg(src); }   // lane fitspline: a B-spline
      // lane sketchgaps: the whole handle, curvature control (tg[3], rfAY) included: the text follows the spline's real
      // shape (it dropped tg[3], so text on a curvature-controlled spline followed the curve without it); a conic's rho too
      if (src.tans) g.tans = src.tans.map(function (tg) {
        if (!tg) return null;
        var t = [+tg[0], tg[1] == null ? 1 : +tg[1]];
        if (tg[2] != null || tg[3] != null) t.push(tg[2] == null ? null : +tg[2]);
        if (tg[3] != null) t.push(+tg[3]);
        return t;
      });
      if (src.local) g.local = true;
      if (src.conic != null) g.conic = +src.conic;   // rfAS
      if (src.parabola) g.parabola = true;
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
  // lane DS2: a linear sketch pattern's saved settings (Pattern relation pat.spec, Edit Linear Pattern) name the line
  // each direction runs along by entity index (ref1 / ref2: '<index>', or 'x' / 'y' for a sketch axis); they follow
  // deletions and renumbering as text paths do. A deleted line leaves the axis word of its direction (the angle stays).
  function patternSpecRefs(sketch, fn) {
    (sketch && sketch.rels || []).forEach(function (rel) {
      var sp = rel && rel.type === 'pattern' && rel.pat && rel.pat.spec;
      if (!sp) return;
      [['ref1', 'x'], ['ref2', 'y']].forEach(function (kd) {
        var r = sp[kd[0]];
        if (r == null || !/^\d+$/.test(String(r))) return;
        var j = fn(+r);
        sp[kd[0]] = j == null || j < 0 ? kd[1] : String(j);
      });
    });
  }
  function patternEntityRemoved(sketch, index) { patternSpecRefs(sketch, function (i) { return i === index ? -1 : i > index ? i - 1 : i; }); }
  function remapPatternRefs(sketch, before) {
    var E = sketch && sketch.entities;
    if (!E || !before) return;
    patternSpecRefs(sketch, function (i) { return before[i] ? E.indexOf(before[i]) : -1; });
  }
  K.patternEntityRemoved = patternEntityRemoved; K.remapPatternRefs = remapPatternRefs;
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
        if (g.tans) o.path.g.tans = g.tans.map(function (tg) { if (!tg) return null; var t = [normDeg(+tg[0] + rot)].concat(tg.slice(1)); if (t[3] != null && isFinite(+t[3])) t[3] = +t[3] / k; return t; });   // a curvature control (1 / R) scales as 1 / size
      } else if (g && (g.t === 'ellipse' || g.t === 'pellipse')) {
        var ce = P(g.cx, g.cy);
        o.path.g.cx = ce[0]; o.path.g.cy = ce[1]; o.path.g.rx = g.rx * k; o.path.g.ry = g.ry * k; o.path.g.rot = normDeg((+g.rot || 0) + rot);
      }
    }
    return o;
  }

  // ------------------------------------------------------------------ Close Sketch to Model (Tools ▸ Sketch Tools)
  // openSketchChains(sketch) -> [{ ents: [entity indices], a: [u, v], b: [u, v] }]: the open contours of the sketch, each
  // with its two free ends. Only what a profile takes counts (no construction, ETCH / BEND or infinite lines); a branch
  // with more than two free ends is no chain.
  function openSketchChains(sketch) {
    var E = (sketch && sketch.entities) || [], items = [], byKey = {};
    E.forEach(function (e, i) {
      if (!e || e.construction || noProfileEntity(sketch, e) || e.t === 'point' || e.t === 'text' || (e.t === 'line' && e.infinite)) return;
      entityPolylines(e, true).forEach(function (pl) {
        if (pl.closed || !pl.pts || pl.pts.length < 2) return;
        var it = { i: i, a: pl.pts[0], b: pl.pts[pl.pts.length - 1] };
        items.push(it);
        [it.a, it.b].forEach(function (p) { var k = key2(p); (byKey[k] = byKey[k] || []).push(it); });
      });
    });
    var seen = [], out = [];
    items.forEach(function (it0) {
      if (seen.indexOf(it0) >= 0) return;
      var stack = [it0], ents = [], ends = {};
      seen.push(it0);
      while (stack.length) {
        var it = stack.pop();
        if (ents.indexOf(it.i) < 0) ents.push(it.i);
        [it.a, it.b].forEach(function (p) {
          var k = key2(p), on = byKey[k];
          if (on.length === 1) ends[k] = p;
          on.forEach(function (o) { if (seen.indexOf(o) < 0) { seen.push(o); stack.push(o); } });
        });
      }
      var keys = Object.keys(ends);
      if (keys.length === 2) out.push({ ents: ents.sort(function (x, y) { return x - y; }), a: ends[keys[0]], b: ends[keys[1]] });
    });
    return out;
  }
  // closeToModel(a, b, geo, opts?) -> { ok, entities, other } | { ok: false, why: 'end' | 'path' }: the sketch lines and
  // arcs that run along model edges from a to b (the two free ends of an open contour). geo: the model edges as sketch
  // entities (line, arc, circle; opts.tol the on-edge tolerance). The shorter way round is the closure; opts.reverse the
  // shortest way that shares no edge piece with it. other: there is such a second way. The entities run end to end from
  // a towards b, and a and b themselves are their first and last points, so the contour chains.
  function closeToModel(a, b, geo, opts) {
    opts = opts || {};
    var tol = opts.tol || 1e-6, D = 180 / Math.PI, nodes = [a, b], links = [];
    function nodeOf(p) {
      for (var i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i][0] - p[0], nodes[i][1] - p[1]) <= tol) return i;
      nodes.push(p);
      return nodes.length - 1;
    }
    function ptAt(g, t) {
      if (g.t === 'line') return [g.x1 + t * (g.x2 - g.x1), g.y1 + t * (g.y2 - g.y1)];
      return [g.cx + g.r * Math.cos(t / D), g.cy + g.r * Math.sin(t / D)];
    }
    // the parameter of p on g (line 0..1, arc a0..a1 degrees, circle 0..360), or null when p is not on it
    function paramOn(g, p) {
      if (g.t === 'line') {
        var dx = g.x2 - g.x1, dy = g.y2 - g.y1, L2 = dx * dx + dy * dy;
        if (L2 < 1e-24) return null;
        var t = ((p[0] - g.x1) * dx + (p[1] - g.y1) * dy) / L2, ov = tol / Math.sqrt(L2);
        if (t < -ov || t > 1 + ov) return null;
        t = Math.max(0, Math.min(1, t));
        var q = ptAt(g, t);
        return Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol ? t : null;
      }
      if (Math.abs(Math.hypot(p[0] - g.cx, p[1] - g.cy) - g.r) > tol) return null;
      var ang = Math.atan2(p[1] - g.cy, p[0] - g.cx) * D;
      if (g.t === 'circle') return (ang + 360) % 360;
      var off = (((ang - g.a0) % 360) + 360) % 360, sw = g.a1 - g.a0, slack = tol / g.r * D;
      if (off <= sw + slack) return g.a0 + Math.min(off, sw);
      return off >= 360 - slack ? g.a0 : null;
    }
    function endsOf(g) { return g.t === 'circle' ? [] : g.t === 'line' ? [[g.x1, g.y1], [g.x2, g.y2]] : [ptAt(g, g.a0), ptAt(g, g.a1)]; }
    function onSome(p) { return geo.some(function (g) { return paramOn(g, p) != null; }); }
    if (!onSome(a) || !onSome(b)) return { ok: false, why: 'end' };
    var marks = [a, b];
    geo.forEach(function (g) { endsOf(g).forEach(function (p) { marks.push(p); }); });
    // each edge cut at the two free ends and at every edge end on it, one link per piece
    geo.forEach(function (g, k) {
      var cuts = [];
      marks.forEach(function (p) {
        var t = paramOn(g, p);
        if (t != null) cuts.push({ t: t, n: nodeOf(p) });
      });
      cuts.sort(function (x, y) { return x.t - y.t; });
      cuts = cuts.filter(function (c, i) { return !i || c.n !== cuts[i - 1].n; });
      if (g.t === 'circle' && cuts.length > 1) cuts.push({ t: cuts[0].t + 360, n: cuts[0].n });
      for (var i = 0; i + 1 < cuts.length; i++) {
        var sw = cuts[i + 1].t - cuts[i].t;
        links.push({ g: g, src: k, t0: cuts[i].t, t1: cuts[i + 1].t, n0: cuts[i].n, n1: cuts[i + 1].n, len: g.t === 'line' ? sw * Math.hypot(g.x2 - g.x1, g.y2 - g.y1) : g.r * sw / D });
      }
    });
    function shortest(skip) {
      var dist = nodes.map(function () { return Infinity; }), from = nodes.map(function () { return null; }), done = nodes.map(function () { return false; });
      dist[0] = 0;
      for (;;) {
        var u = -1;
        dist.forEach(function (d, i) { if (!done[i] && d < Infinity && (u < 0 || d < dist[u])) u = i; });
        if (u < 0 || u === 1) break;
        done[u] = true;
        links.forEach(function (L) {
          if ((skip && skip.indexOf(L) >= 0) || (L.n0 !== u && L.n1 !== u)) return;
          var w = L.n0 === u ? L.n1 : L.n0;
          if (dist[u] + L.len < dist[w] - 1e-12) { dist[w] = dist[u] + L.len; from[w] = { L: L, u: u }; }
        });
      }
      if (dist[1] === Infinity) return null;
      var path = [];
      for (var at = 1; at !== 0; at = from[at].u) path.unshift({ L: from[at].L, fwd: from[at].L.n1 === at });
      return path;
    }
    var first = shortest(null);
    if (!first) return { ok: false, why: 'path' };
    var second = shortest(first.map(function (s) { return s.L; })), path = opts.reverse && second ? second : first;
    // consecutive pieces of one edge walked the same way become one entity
    var runs = [];
    path.forEach(function (s) {
      var R = runs[runs.length - 1], from = s.fwd ? s.L.n0 : s.L.n1, to = s.fwd ? s.L.n1 : s.L.n0;
      if (R && R.src === s.L.src && R.fwd === s.fwd) { R.to = to; R.sweep += s.L.t1 - s.L.t0; return; }
      runs.push({ src: s.L.src, g: s.L.g, fwd: s.fwd, from: from, to: to, tStart: s.fwd ? s.L.t0 : s.L.t1, sweep: s.L.t1 - s.L.t0 });
    });
    function r9(x) { return Math.round(x * 1e9) / 1e9; }
    var ents = runs.map(function (R) {
      if (R.g.t === 'line') { var p = nodes[R.from], q = nodes[R.to]; return { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; }
      var a0 = R.fwd ? R.tStart : R.tStart - R.sweep;   // arcs run counter-clockwise, whichever way the path walks them
      a0 = ((a0 % 360) + 360) % 360;
      return { t: 'arc', cx: R.g.cx, cy: R.g.cy, r: R.g.r, a0: r9(a0), a1: r9(a0 + R.sweep) };
    });
    return { ok: true, entities: ents, other: !!second };
  }
  K.openSketchChains = openSketchChains; K.closeToModel = closeToModel;

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.entityPolylines = entityPolylines; K.entitySnapPoints = entitySnapPoints; K.sketchProfile = sketchProfile; K.signedArea = signedArea;
  K.loopSelfCrossing = loopSelfCrossing; K.checkProfile = checkProfile; K.offsetLoop = offsetLoop; K.filletPolyline = filletPolyline;
  K.mirrorAxis = mirrorAxis; K.mirrorEntity = mirrorEntity; K.translateEntity = translateEntity; K.entityPrimitives = entityPrimitives;
  K.trimEntity = trimEntity; K.trimCuts = trimCuts; K.entityEnds = entityEnds; K.dimGeometry = dimGeometry; K.dimValue = dimValue; K.setDimValue = setDimValue; K.dimForEntity = dimForEntity;
  K.setTessellation = setTessellation; K.segsForRadius = segsForRadius; K.entityCurves = entityCurves;
  K.sketchRegions = sketchRegions; K.regionAt = regionAt; K.contourProfile = contourProfile; K.contourSketch = contourSketch; K.regionsAmbiguous = regionsAmbiguous;   // lane CO: Selected Contours
  K.isStyleSpline = isStyle; K.bzPoint = bzPoint; K.bzDeriv = bzDeriv; K.bzSub = bzSub; K.bzElevate = bzElevate; K.bzDegree = bzDegree;   // rfAH: Style Spline
  K.splineCurvatureAt = splineCurvatureAt;   // rfAY
  K.isBSpline = isBSpline; K.bsValid = bsValid; K.bsBlossom = bsBlossom; K.bsPieces = bsPieces; K.bsFromPieces = bsFromPieces; K.bsSub = bsSub; K.bsInsertKnot = bsInsertKnot; K.bzBlossom = bzBlossom;   // lane fitspline
  K.splineGeom = splineGeom; K.conicData = conicData; K.conicPoint = conicPoint; K.ellipsePoint = ellipsePoint; K.bezPoint = bezPoint; K.freeSamples = freeSamples; K.isFreeCurve = isFree;
  K.sketchLayer = sketchLayer; K.noProfileEntity = noProfileEntity; K.LAYER_PRESETS = LAYER_PRESETS;   // sketch-layers
  K.textLayout = textLayout; K.textOutline = textOutline; K.textDxf = textDxf; K.textStrokeWidth = textStrokeWidth;   // sketch-text
  K.syncTextPaths = syncTextPaths; K.textEntityRemoved = textEntityRemoved; K.remapTextPaths = remapTextPaths; K.transformText = transformText;
  K.textPathOf = pathGeomOf; K.TEXT_PATH_TYPES = TEXT_PATH_TYPES.slice(); K.textBridgeWidth = textBridgeWidth;   // sketch-text2
  K.dissolveText = dissolveText;   // lane CV: Dissolve Sketch Text
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.TESS = TESS; _.checkProfile = checkProfile; _.dimGeometry = dimGeometry; _.entityPolylines = entityPolylines; _.key2 = key2;
  _.mirrorAxis = mirrorAxis; _.mirrorEntity = mirrorEntity; _.offsetLoop = offsetLoop; _.pointInPoly = pointInPoly; _.segsForRadius = segsForRadius;
  _.setDimValue = setDimValue; _.setTessellation = setTessellation; _.signedArea = signedArea; _.sketchProfile = sketchProfile; _.tessKey = tessKey;
  _.translateEntity = translateEntity; _.trimEntity = trimEntity; _.splineGeom = splineGeom; _.ellipsePoint = ellipsePoint; _.freeSamples = freeSamples;
  _.contourSketch = contourSketch;   // lane CO: kernel-rebuild.js buildTool hands extrude / revolve the picked-contour profile
  _.syncTextPaths = syncTextPaths; _.textDxf = textDxf;

  // ------------------------------------------------------------------ rfAT: Blocks (Tools ▸ Blocks)
  // SolidWorks' sketch blocks: a named group of entities placed as rigid instances (punch / louver symbols repeated on
  // a flat blank). Definitions live on the sketch: sketch.blocks = { Name: { ents: [entities in block coordinates,
  // the insertion point at 0, 0] } }. An instance is ordinary sketch geometry tagged with the instance id `blk` (so
  // profiles, display, the sketch DXF writer and drawings take it as it is: DXF gets the exploded geometry) plus its
  // insertion point, a point { t: 'point', x, y, blk: id, blkDef: name, blkAng: degrees, blkS: scale }. The insertion
  // point is a solver point (dimension it, relate it, drag it); syncBlocks re-places each instance's geometry from its
  // insertion point, angle and scale, and an instance part of which was moved (a drag of one of its lines, a relation
  // to one of its points) moves its insertion point by that move first, so the whole instance follows.
  function blockXf(ins, ang, sc) {
    var a = (+ang || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = sc != null && +sc > 0 ? +sc : 1;
    if (Math.abs(c) < 1e-15) c = 0;
    if (Math.abs(s) < 1e-15) s = 0;
    return { c: c, s: s, k: k, ang: +ang || 0, tx: +ins[0] || 0, ty: +ins[1] || 0 };
  }
  function blkClean(v) { return Math.abs(v) < 1e-13 ? 0 : +(+v).toPrecision(13); }
  function blkPt(m, x, y) { return [blkClean(m.tx + m.k * (m.c * x - m.s * y)), blkClean(m.ty + m.k * (m.s * x + m.c * y))]; }
  // entity e (block coordinates) placed by m (blockXf); null for a type a block cannot carry
  function blockEntity(e, m) {
    var o = JSON.parse(JSON.stringify(e)), p, q;
    switch (e.t) {
      case 'point': p = blkPt(m, e.x, e.y); o.x = p[0]; o.y = p[1]; break;
      case 'line': case 'slot': p = blkPt(m, e.x1, e.y1); q = blkPt(m, e.x2, e.y2); o.x1 = p[0]; o.y1 = p[1]; o.x2 = q[0]; o.y2 = q[1]; if (e.t === 'slot') o.w = blkClean(e.w * m.k); break;
      case 'circle': p = blkPt(m, e.cx, e.cy); o.cx = p[0]; o.cy = p[1]; o.r = blkClean(e.r * m.k); break;
      case 'arc': case 'aslot': p = blkPt(m, e.cx, e.cy); o.cx = p[0]; o.cy = p[1]; o.r = blkClean(e.r * m.k); o.a0 = blkClean(normDeg(e.a0 + m.ang)); o.a1 = blkClean(o.a0 + (e.a1 - e.a0)); if (e.t === 'aslot') o.w = blkClean(e.w * m.k); break;
      case 'poly': p = blkPt(m, e.cx, e.cy); o.cx = p[0]; o.cy = p[1]; o.r = blkClean(e.r * m.k); o.rot = blkClean(normDeg((+e.rot || 0) + m.ang)); break;
      case 'ellipse': case 'pellipse': p = blkPt(m, e.cx, e.cy); o.cx = p[0]; o.cy = p[1]; o.rx = blkClean(e.rx * m.k); o.ry = blkClean(e.ry * m.k); o.rot = blkClean(normDeg((+e.rot || 0) + m.ang)); break;
      case 'polyline': case 'spline':
        o.pts = e.pts.map(function (r) { return blkPt(m, r[0], r[1]); });
        // rfBC: a curvature control (tg[3], 1 / R) scales as 1 / the instance's scale
        if (e.tans) o.tans = e.tans.map(function (tg) { if (!tg) return null; var t = [normDeg(+tg[0] + m.ang)].concat(tg.slice(1)); if (t[3] != null && isFinite(+t[3])) t[3] = blkClean(+t[3] / m.k); return t; });
        break;
      case 'text': {
        var t1 = m.k !== 1 ? transformText(e, { s: m.k, cx: 0, cy: 0 }) : e, t2 = m.ang ? transformText(t1, { rot: m.ang, cx: 0, cy: 0 }) : t1;
        o = transformText(t2, { dx: m.tx, dy: m.ty });
        break;
      }
      default: return null;
    }
    return o;
  }
  // block-coordinate copies of sketch entity e for a definition whose insertion point is ins (a rectangle becomes its
  // four lines: a turned instance keeps them square); [] when a block cannot hold it
  function blockLocal(e, ins, inv) {
    if (!e) return [];
    if (e.t === 'rect' || e.t === 'crect') {
      var x0 = e.t === 'rect' ? e.x : e.cx - e.w / 2, y0 = e.t === 'rect' ? e.y : e.cy - e.h / 2, c = [[x0, y0], [x0 + e.w, y0], [x0 + e.w, y0 + e.h], [x0, y0 + e.h]];
      var out = [];
      c.forEach(function (a, i) {
        var b = c[(i + 1) % 4], l = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
        if (e.construction) l.construction = true;
        if (e.layer != null) l.layer = e.layer;
        out = out.concat(blockLocal(l, ins, inv));
      });
      return out;
    }
    var o = blockEntity(e, blockXf([-ins[0], -ins[1]], 0, 1));
    if (o && inv) o = blockEntity(o, inv);
    if (!o) return [];
    ['blk', 'blkDef', 'blkAng', 'blkS', 'sharp'].forEach(function (k) { delete o[k]; });
    return [o];
  }
  // every instance in the sketch: [{ id, def, ins (index of its insertion point), x, y, ang, s, ents: [indices] }]
  function blockInstances(sketch) {
    var E = (sketch && sketch.entities) || [], by = {}, order = [];
    E.forEach(function (e, i) {
      if (!e || e.blk == null) return;
      var id = String(e.blk), r = by[id];
      if (!r) { r = by[id] = { id: id, ins: -1, ents: [] }; order.push(id); }
      if (e.t === 'point' && e.blkDef != null && r.ins < 0) { r.ins = i; r.def = String(e.blkDef); r.x = +e.x || 0; r.y = +e.y || 0; r.ang = +e.blkAng || 0; r.s = e.blkS != null ? +e.blkS : 1; }
      else r.ents.push(i);
    });
    return order.map(function (id) { return by[id]; }).filter(function (r) { return r.ins >= 0; });
  }
  function newBlockId(sketch) {
    var used = {}, n = 1;
    ((sketch && sketch.entities) || []).forEach(function (e) { if (e && e.blk != null) used[String(e.blk)] = true; });
    while (used['b' + n]) n++;
    return 'b' + n;
  }
  // the geometry instance r should have (its definition placed by its insertion point, angle and scale), or null
  function blockPlaced(sketch, r) {
    var d = sketch.blocks && sketch.blocks[r.def];
    if (!d) return null;
    var m = blockXf([r.x, r.y], r.ang, r.s);
    return d.ents.map(function (e) { return blockEntity(e, m); });
  }
  // the point that says where an entity is (its first parameter point)
  function blkAnchor(e) {
    if (!e) return null;
    if (e.t === 'point' || e.t === 'text') return [+e.x || 0, +e.y || 0];
    if (e.x1 != null) return [e.x1, e.y1];
    if (e.cx != null) return [e.cx, e.cy];
    if (e.pts && e.pts.length) return [e.pts[0][0], e.pts[0][1]];
    return null;
  }
  function blkStrip(e) {
    var o = {};
    Object.keys(e || {}).sort().forEach(function (k) { if (k !== 'blk' && k !== 'layer' && k !== 'construction') o[k] = typeof e[k] === 'number' ? Math.round(e[k] * 1e7) / 1e7 : e[k]; });
    return JSON.stringify(o);
  }
  // Re-place every instance from its insertion point (skip: an instance id left alone, the one in Edit Block). An
  // instance part of which moved while its insertion point did not moves its insertion point by that move first.
  // Returns the number of instances changed.
  function syncBlocks(sketch, skip) {
    if (!sketch || !sketch.blocks) return 0;
    var E = sketch.entities, changed = 0;
    blockInstances(sketch).forEach(function (r) {
      if (skip != null && String(skip) === r.id) return;
      var want = blockPlaced(sketch, r);
      if (!want || want.length !== r.ents.length) return;
      var tol = 1e-9 * (1 + Math.abs(r.x) + Math.abs(r.y)), moved = null, still = false;
      r.ents.forEach(function (i, k) {
        var a = blkAnchor(E[i]), b = blkAnchor(want[k]);
        if (!a || !b) return;
        var d = [a[0] - b[0], a[1] - b[1]];
        if (Math.hypot(d[0], d[1]) > tol) { if (!moved) moved = d; } else still = true;
      });
      if (!moved && !r.ents.some(function (i, k) { return blkStrip(E[i]) !== blkStrip(want[k]); })) return;
      if (moved && (still || r.ents.length === 1) && !blkSameMove(E, r, want, moved, tol)) {
        // part of the instance moved (a drag of one of its lines): the whole instance follows
        var P = E[r.ins];
        P.x = blkClean(P.x + moved[0]); P.y = blkClean(P.y + moved[1]); r.x = P.x; r.y = P.y;
        want = blockPlaced(sketch, r);
      }
      r.ents.forEach(function (i, k) {
        var keep = E[i], w = want[k];
        w.blk = keep.blk;
        if (keep.construction) w.construction = true;
        if (keep.layer != null) w.layer = keep.layer;
        Object.keys(keep).forEach(function (key) { delete keep[key]; });
        Object.keys(w).forEach(function (key) { keep[key] = w[key]; });
      });
      changed++;
    });
    return changed;
  }
  // true when every entity of the instance is off by the same move (its insertion point moved: the geometry follows it)
  function blkSameMove(E, r, want, d, tol) {
    return r.ents.length > 1 && r.ents.every(function (i, k) { var a = blkAnchor(E[i]), b = blkAnchor(want[k]); return !a || !b || Math.hypot(a[0] - b[0] - d[0], a[1] - b[1] - d[1]) <= tol; });
  }
  // relations and dimensions after the entity list changed from `before`: those on an entity in `gone` go (those
  // among `keepIn` only, when all their entities are there, stay), and indices follow the entities
  function blkRemap(sketch, before, gone) {
    var E = sketch.entities, map = before.map(function (e) { return E.indexOf(e); });
    function ent(r) { var m = /^(\d+)/.exec(String(r)); return m ? +m[1] : null; }
    if (sketch.rels) {
      sketch.rels = sketch.rels.filter(function (rel) { return rel.refs.every(function (r) { var e = ent(r); return e == null || (gone.indexOf(e) < 0 && map[e] >= 0); }); })
        .map(function (rel) { rel.refs = rel.refs.map(function (r) { var m = /^(\d+)(.*)$/.exec(String(r)); return m ? map[+m[1]] + m[2] : r; }); return rel; });
      if (!sketch.rels.length) delete sketch.rels;
    }
    if (sketch.dims) {
      sketch.dims = sketch.dims.filter(function (d) { return gone.indexOf(d.e) < 0 && map[d.e] >= 0; });
      sketch.dims.forEach(function (d) { d.e = map[d.e]; });
      if (!sketch.dims.length) delete sketch.dims;
    }
  }
  // Make Block: entities idx become the definition `name` (block coordinates from ins, [x, y]) and, where they were,
  // its first instance. Their relations and dimensions go (a block's geometry is held by the block, as in SolidWorks).
  // Returns { ok, id, name, ins (index of the insertion point), error }.
  function makeBlock(sketch, idx, name, ins) {
    var E = sketch.entities;
    idx = (idx || []).filter(function (i, k, a) { return E[i] && a.indexOf(i) === k; }).sort(function (a, b) { return a - b; });
    if (!idx.length) return { ok: false, error: 'Select the sketch entities for the block first.' };
    if (idx.some(function (i) { return E[i].blk != null; })) return { ok: false, error: 'An entity is in a block already: explode that block first.' };
    name = String(name == null ? '' : name).trim();
    sketch.blocks = sketch.blocks || {};
    if (!name) { var n = 1; while (sketch.blocks['Block' + n]) n++; name = 'Block' + n; }
    if (sketch.blocks[name]) return { ok: false, error: 'A block named ' + name + ' exists: give the new one another name.' };
    ins = ins || [0, 0];
    var ents = [];
    idx.forEach(function (i) { ents = ents.concat(blockLocal(E[i], ins)); });
    if (!ents.length) { if (!Object.keys(sketch.blocks).length) delete sketch.blocks; return { ok: false, error: 'Nothing selected can go into a block.' }; }
    sketch.blocks[name] = { ents: ents };
    var id = newBlockId(sketch), before = E.slice();
    sketch.entities = E.filter(function (e, i) { return idx.indexOf(i) < 0; });
    blkRemap(sketch, before, idx);
    blockPlaced(sketch, { def: name, x: +ins[0] || 0, y: +ins[1] || 0, ang: 0, s: 1 }).forEach(function (w) { w.blk = id; sketch.entities.push(w); });
    sketch.entities.push({ t: 'point', x: blkClean(+ins[0] || 0), y: blkClean(+ins[1] || 0), blk: id, blkDef: name, blkAng: 0, blkS: 1 });
    return { ok: true, id: id, name: name, ins: sketch.entities.length - 1 };
  }
  // Insert Block: one more instance of `name` at (x, y), turned ang degrees, scaled s. Returns { ok, id, ins, error }.
  function insertBlock(sketch, name, x, y, ang, s) {
    if (!sketch.blocks || !sketch.blocks[name]) return { ok: false, error: 'No block named ' + name + ' in this sketch.' };
    if (s != null && !(+s > 0)) return { ok: false, error: 'The scale must be more than 0.' };
    var id = newBlockId(sketch), r = { def: name, x: +x || 0, y: +y || 0, ang: +ang || 0, s: s != null ? +s : 1 };
    blockPlaced(sketch, r).forEach(function (w) { w.blk = id; sketch.entities.push(w); });
    sketch.entities.push({ t: 'point', x: blkClean(r.x), y: blkClean(r.y), blk: id, blkDef: name, blkAng: r.ang, blkS: r.s });
    return { ok: true, id: id, ins: sketch.entities.length - 1 };
  }
  // Add a definition from a saved block ({ name, ents } as blockFile writes). Returns { ok, name, error }.
  function addBlockDef(sketch, o, name) {
    if (!o || !Array.isArray(o.ents) || !o.ents.length) return { ok: false, error: 'That is not a block file.' };
    name = String(name || o.name || 'Block').trim();
    sketch.blocks = sketch.blocks || {};
    var base = name, n = 2;
    while (sketch.blocks[name]) name = base + '-' + n++;
    sketch.blocks[name] = { ents: JSON.parse(JSON.stringify(o.ents)) };
    return { ok: true, name: name };
  }
  function blockFile(sketch, name) {
    var d = sketch.blocks && sketch.blocks[name];
    return d ? JSON.stringify({ anvilBlock: 1, name: name, ents: d.ents }, null, 1) : null;
  }
  // Block properties of instance id: { x, y, ang, s } (any of them): its insertion point and geometry move
  function setBlockInstance(sketch, id, o) {
    var r = blockInstances(sketch).filter(function (q) { return q.id === String(id); })[0];
    if (!r) return { ok: false, error: 'No block instance ' + id + '.' };
    if (o.s != null && !(+o.s > 0)) return { ok: false, error: 'The scale must be more than 0.' };
    var P = sketch.entities[r.ins];
    if (o.x != null) P.x = +o.x;
    if (o.y != null) P.y = +o.y;
    if (o.ang != null) P.blkAng = +o.ang;
    if (o.s != null) P.blkS = +o.s;
    // the geometry follows the insertion point (not the other way round): place it before syncing
    var want = blockPlaced(sketch, { def: r.def, x: P.x, y: P.y, ang: P.blkAng, s: P.blkS });
    if (want && want.length === r.ents.length) r.ents.forEach(function (i, k) { var w = want[k], keep = sketch.entities[i]; w.blk = keep.blk; if (keep.construction) w.construction = true; if (keep.layer != null) w.layer = keep.layer; sketch.entities[i] = w; });
    return { ok: true };
  }
  // Explode Block: instance id's geometry becomes ordinary sketch geometry and its insertion point goes (a definition
  // no instance uses any more goes too). Returns { ok, error }.
  function explodeBlock(sketch, id) {
    var r = blockInstances(sketch).filter(function (q) { return q.id === String(id); })[0];
    if (!r) return { ok: false, error: 'No block instance ' + id + '.' };
    var before = sketch.entities.slice();
    r.ents.forEach(function (i) { delete sketch.entities[i].blk; });
    sketch.entities = sketch.entities.filter(function (e, i) { return i !== r.ins; });
    blkRemap(sketch, before, [r.ins]);
    if (!blockInstances(sketch).some(function (q) { return q.def === r.def; }) && sketch.blocks) { delete sketch.blocks[r.def]; if (!Object.keys(sketch.blocks).length) delete sketch.blocks; }
    return { ok: true };
  }
  // Edit Block: the definition of instance id's block becomes that instance's geometry now (plus `extra`, entity
  // indices drawn while editing), in its block coordinates, and every instance of it is placed again. AZ: relations and
  // dimensions are kept where their entities still are: each entity of the new definition that was one of the old
  // (the same piece, matched by position in the definition when the edit kept the list of pieces, else the nearest
  // piece of the same kind) carries the relations of that piece in every instance; the edited instance's relations
  // among its own geometry are folded into the definition (a block is rigid), those to other geometry (and a Horizontal,
  // Vertical or Fix on one of its pieces, which places the instance) stay. A relation
  // on a piece the edit took out goes (counted in `dropped`; those to the insertion point always stay).
  // Returns { ok, dropped: number of relations / dimensions that went, error }.
  function redefineBlock(sketch, id, extra) {
    var r = blockInstances(sketch).filter(function (q) { return q.id === String(id); })[0];
    if (!r) return { ok: false, error: 'No block instance ' + id + '.' };
    var E = sketch.entities, idx = r.ents.concat((extra || []).filter(function (i) { return E[i] && E[i].blk == null && r.ents.indexOf(i) < 0; }));
    if (!idx.length) return { ok: false, error: 'The block has no geometry left.' };
    var inv = { c: Math.cos(-r.ang * Math.PI / 180), s: Math.sin(-r.ang * Math.PI / 180), k: 1 / r.s, ang: -r.ang, tx: 0, ty: 0 }, ents = [];
    // the old definition piece each member of the edited instance still is (oldOf[sketch index] = definition index)
    var oldPlaced = blockPlaced(sketch, r) || [], oldOf = {};
    if (r.ents.length === oldPlaced.length && r.ents.every(function (i, k) { return E[i].t === oldPlaced[k].t; })) r.ents.forEach(function (i, k) { oldOf[i] = k; });
    else {
      var used = {};
      r.ents.forEach(function (i) {
        var best = -1, bd = Infinity, a = blkAnchor(E[i]);
        oldPlaced.forEach(function (o, k) {
          if (used[k] || !o || o.t !== E[i].t) return;
          var b = blkAnchor(o), d = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
          if (d < bd) { bd = d; best = k; }
        });
        if (best >= 0) { used[best] = true; oldOf[i] = best; }
      });
    }
    // the new definition; per piece: the sketch entity it came from when it is that entity alone (src), the old piece (from)
    var src = [], from = [];
    idx.forEach(function (i) {
      var p = blockLocal(E[i], [r.x, r.y], inv);
      p.forEach(function (o) { ents.push(o); src.push(p.length === 1 ? i : -1); from.push(p.length === 1 && oldOf[i] != null ? oldOf[i] : -1); });
    });
    var insts = blockInstances(sketch).filter(function (q) { return q.def === r.def; });
    sketch.blocks[r.def] = { ents: ents };
    // map: old sketch index -> new; the instances' pieces go and come back placed again at the end, in definition order
    var gone = {}, keep = [], map = [], n = 0, nOld = oldPlaced.length;
    insts.forEach(function (q) { q.ents.forEach(function (i) { gone[i] = true; }); });
    idx.forEach(function (i) { gone[i] = true; });
    E.forEach(function (e, i) { if (gone[i]) map[i] = -1; else { map[i] = n++; keep.push(e); } });
    insts.forEach(function (q) {
      var placed = blockPlaced(sketch, q) || [], mine = q.id === r.id;
      placed.forEach(function (w, j) {
        w.blk = q.id;
        var o = mine ? src[j] : (from[j] >= 0 && q.ents.length === nOld ? q.ents[from[j]] : -1);
        if (o >= 0) map[o] = n;
        keep.push(w); n++;
      });
    });
    function ent(x) { var m = /^(\d+)/.exec(String(x)); return m ? +m[1] : null; }
    var dropped = 0, own = {};   // own: the edited instance's entities (old indices); relations among them only go into the definition
    idx.forEach(function (i) { own[i] = true; });
    if (sketch.rels) {
      sketch.rels = sketch.rels.filter(function (rel) {
        var es = (rel.refs || []).map(ent);
        // (one between two of its pieces, a dimension of one, or one on a piece drawn in the edit is its shape; a
        // Horizontal / Fix on one of the pieces it had before places it)
        var distinct = es.filter(function (e, k) { return es.indexOf(e) === k; });
        if (es.length && es.every(function (e) { return e != null && (own[e] || e === r.ins); }) && es.some(function (e) { return e !== r.ins; }) && (distinct.length > 1 || rel.value != null || es.some(function (e) { return r.ents.indexOf(e) < 0 && e !== r.ins; }))) return false;
        if (es.some(function (e) { return e != null && !(map[e] >= 0); })) { dropped++; return false; }
        rel.refs = rel.refs.map(function (x) { var m = /^(\d+)(.*)$/.exec(String(x)); return m ? map[+m[1]] + m[2] : x; });
        return true;
      });
      if (!sketch.rels.length) delete sketch.rels;
    }
    if (sketch.dims) {
      sketch.dims = sketch.dims.filter(function (d) {
        if (own[d.e]) return false;
        if (!(map[d.e] >= 0)) { dropped++; return false; }
        d.e = map[d.e];
        return true;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    sketch.entities = keep;
    return { ok: true, dropped: dropped };
  }
  // lane sketchgaps: SolidWorks' Blocks ▸ Add/Remove. Entities `add` (ordinary sketch geometry) join the definition of
  // instance id's block, entities `remove` (pieces of that instance) leave it and stay in the sketch as ordinary geometry
  // where they are; every instance of the block is placed again from the new definition (the pieces removed go from the
  // other instances). Returns { ok, added, removed, dropped, error } (see redefineBlock).
  function blockAddRemove(sketch, id, add, remove) {
    var r = blockInstances(sketch).filter(function (q) { return q.id === String(id); })[0];
    if (!r) return { ok: false, error: 'No block instance ' + id + '.' };
    var E = sketch.entities;
    add = (add || []).filter(function (i, k, a) { return E[i] && E[i].blk == null && a.indexOf(i) === k; });
    remove = (remove || []).filter(function (i, k, a) { return r.ents.indexOf(i) >= 0 && a.indexOf(i) === k; });
    if (!add.length && !remove.length) return { ok: false, error: 'Select sketch entities to add to the block, or pieces of the block to remove from it.' };
    if (remove.length >= r.ents.length && !add.length) return { ok: false, error: 'A block keeps at least one entity: explode it instead.' };
    remove.forEach(function (i) { delete E[i].blk; });
    var q = redefineBlock(sketch, id, add);
    if (!q.ok) { remove.forEach(function (i) { E[i].blk = r.id; }); return q; }
    return { ok: true, added: add.length, removed: remove.length, dropped: q.dropped };
  }
  // lane sketchgaps: SolidWorks' Blocks ▸ Rebuild: every instance placed again from its definition (an instance whose
  // pieces were left off its definition, by a script or a solve, comes back to it). Returns how many changed.
  function rebuildBlocks(sketch) {
    if (!sketch || !sketch.blocks) return 0;
    var n = 0;
    blockInstances(sketch).forEach(function (r) {
      var want = blockPlaced(sketch, r), E = sketch.entities;
      if (!want || want.length !== r.ents.length) return;
      var diff = r.ents.some(function (i, k) { return blkStrip(E[i]) !== blkStrip(want[k]); });
      if (!diff) return;
      r.ents.forEach(function (i, k) { var w = want[k], keep = E[i]; w.blk = keep.blk; if (keep.construction) w.construction = true; if (keep.layer != null) w.layer = keep.layer; E[i] = w; });
      n++;
    });
    return n;
  }
  // rfAU: the definitions a sketch's instances use: sketch.blocks, plus, for a name an instance carries but the sketch
  // has no definition of (instances that came in from a DXF: DxfImport.parse with blocks), that instance's geometry in
  // its block coordinates (the first such instance). Pure; adoptBlocks writes the missing ones into sketch.blocks and
  // returns how many it added.
  function blockDefs(sketch) {
    var out = {}, have = (sketch && sketch.blocks) || {};
    Object.keys(have).forEach(function (n) { out[n] = have[n]; });
    blockInstances(sketch).forEach(function (r) {
      if (out[r.def]) return;
      var a = -r.ang * Math.PI / 180, inv = { c: Math.cos(a), s: Math.sin(a), k: 1 / (r.s > 0 ? r.s : 1), ang: -r.ang, tx: 0, ty: 0 }, ents = [];
      r.ents.forEach(function (i) { ents = ents.concat(blockLocal(sketch.entities[i], [r.x, r.y], inv)); });
      if (ents.length === r.ents.length) out[r.def] = { ents: ents };
    });
    return out;
  }
  function adoptBlocks(sketch) {
    if (!sketch || !(sketch.entities || []).some(function (e) { return e && e.blkDef != null; })) return 0;
    var defs = blockDefs(sketch), n = 0;
    Object.keys(defs).forEach(function (k) { if (!sketch.blocks || !sketch.blocks[k]) { sketch.blocks = sketch.blocks || {}; sketch.blocks[k] = JSON.parse(JSON.stringify(defs[k])); n++; } });
    return n;
  }
  // script round trip: .blocks({ defs, tags: [[entity, id], [insertion point, id, name, angle, scale], …] })
  function blockScriptLine(f) {
    if (!f.blocks || !Object.keys(f.blocks).length) return '';
    var tags = [];
    (f.entities || []).forEach(function (e, i) {
      if (!e || e.blk == null) return;
      tags.push(e.blkDef != null ? [i, String(e.blk), String(e.blkDef), +e.blkAng || 0, e.blkS != null ? +e.blkS : 1] : [i, String(e.blk)]);
    });
    return '\n  .blocks(' + JSON.stringify({ defs: f.blocks, tags: tags }) + ')';
  }
  function applyBlockScript(f, o) {
    o = o || {};
    f.blocks = JSON.parse(JSON.stringify(o.defs || {}));
    (o.tags || []).forEach(function (t) {
      var e = f.entities[t[0]];
      if (!e) throw new Error('No sketch entity ' + t[0] + ' for a block.');
      e.blk = String(t[1]);
      if (t.length > 2) { e.blkDef = String(t[2]); e.blkAng = +t[3] || 0; e.blkS = t[4] != null ? +t[4] : 1; }
    });
    if (!Object.keys(f.blocks).length) delete f.blocks;
  }
  // the builder method and the script writer: kernel-script.js calls Kernel.installBlockScript once it has made the Builder
  function installBlockScript() {
    if (K.__sketchBlocks || !K.registerSketchScript || !K.newModel || !K.Builder) return;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    SBP.blocks = function (o) { applyBlockScript(this.f, o); return this; };
    K.registerSketchScript(blockScriptLine);
    K.__sketchBlocks = true;
  }
  K.installBlockScript = installBlockScript;
  K.blockInstances = blockInstances; K.makeBlock = makeBlock; K.insertBlock = insertBlock; K.explodeBlock = explodeBlock; K.syncBlocks = syncBlocks;
  K.setBlockInstance = setBlockInstance; K.redefineBlock = redefineBlock; K.blockEntity = blockEntity; K.blockXf = blockXf;
  K.blockDefs = blockDefs; K.adoptBlocks = adoptBlocks;   // rfAU
  K.blockAddRemove = blockAddRemove; K.rebuildBlocks = rebuildBlocks;   // lane sketchgaps
  K.addBlockDef = addBlockDef; K.blockFile = blockFile; K.blockScriptLine = blockScriptLine; K.applyBlockScript = applyBlockScript;
})(Kernel, Kernel._);

// rfAW: Sketch Picture (ui-sketch-picture.js). A sketch's pictures live beside its entities, never in its profiles,
// regions or DXF: sketch.pictures = [{ name, src: data URL, px: [w, h] pixels, x, y (lower-left corner), w, h, ang (°),
// flipH, flipV, tmode: 'none' | 'file' | 'full' | 'user', alpha, key, keyTol, file, lock }]. They round-trip through
// scripts as one `.picture({ … })` line each (written before the sketch's `.id()`).
(function (K) {
  'use strict';
  var PIC_KEYS = ['name', 'file', 'src', 'px', 'x', 'y', 'w', 'h', 'ang', 'flipH', 'flipV', 'tmode', 'alpha', 'key', 'keyTol', 'lock'];
  function pictureRecord(o) {
    var p = {};
    PIC_KEYS.forEach(function (k) { if (o && o[k] != null) p[k] = JSON.parse(JSON.stringify(o[k])); });
    if (typeof p.src !== 'string' || !/^data:image\//i.test(p.src)) throw new Error('.picture() takes the picture as a data:image/… URL in src.');
    ['x', 'y', 'w', 'h'].forEach(function (k) { p[k] = +p[k] || 0; });
    if (!(p.w > 0) || !(p.h > 0)) throw new Error('.picture() needs a positive width w and height h.');
    return p;
  }
  function pictureScriptLine(f) {
    return (f.pictures || []).map(function (p) { return '\n  .picture(' + JSON.stringify(pictureRecord(p)) + ')'; }).join('');
  }
  function applyPictureScript(f, o) { (f.pictures = f.pictures || []).push(pictureRecord(o)); }
  function installPictureScript() {
    if (K.__sketchPictures || !K.registerSketchScript || !K.newModel || !K.Builder) return;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    SBP.picture = function (o) { applyPictureScript(this.f, o); return this; };
    K.registerSketchScript(pictureScriptLine);
    K.__sketchPictures = true;
  }
  // kernel-script.js calls Kernel.installPictureScript once the Builder exists
  K.installPictureScript = installPictureScript; K.pictureScriptLine = pictureScriptLine; K.sketchPictureRecord = pictureRecord;
})(Kernel);

// lane sketch-path: Make Path (Tools ▸ Sketch Tools). A path is a set of sketch entities joined end to end; each member
// carries `pathId` (a number, the same on all of them), so trims, splits and renumbering keep it without any remapping.
// Scripts write `.paths([[i, …], …])` before the sketch's `.id()`.
(function (K) {
  'use strict';
  var JOIN = 1e-6, TANGENT = 0.9997;   // ends that meet; cos of the 1.4° a tangent join may miss by (chords of a free curve)
  // the two ends of an open entity, each with its outward unit direction; [] for a closed one
  function pathEnds(e) {
    if (!e || e.t === 'point' || e.t === 'text') return [];
    if (e.t === 'line' && !e.infinite) {
      var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1, ux = (e.x2 - e.x1) / L, uy = (e.y2 - e.y1) / L;
      return [{ p: [e.x1, e.y1], out: [-ux, -uy] }, { p: [e.x2, e.y2], out: [ux, uy] }];
    }
    if (e.t === 'arc') {
      var a = e.a0 * Math.PI / 180, b = e.a1 * Math.PI / 180;
      return [{ p: [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)], out: [Math.sin(a), -Math.cos(a)] },
        { p: [e.cx + e.r * Math.cos(b), e.cy + e.r * Math.sin(b)], out: [-Math.sin(b), Math.cos(b)] }];
    }
    var pl = K.entityPolylines(e, true)[0];
    if (!pl || pl.closed || pl.pts.length < 2) return [];
    function dir(p, q) { var d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1; return [(p[0] - q[0]) / d, (p[1] - q[1]) / d]; }
    var n = pl.pts.length;
    return [{ p: pl.pts[0], out: dir(pl.pts[0], pl.pts[1]) }, { p: pl.pts[n - 1], out: dir(pl.pts[n - 1], pl.pts[n - 2]) }];
  }
  function meet(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= JOIN * Math.max(1, Math.abs(p[0]), Math.abs(p[1])); }
  // tangentChain(sketch, i) -> [entity indices]: i and the entities joined to it end to end and tangent, in chain order
  function tangentChain(sketch, i) {
    var E = sketch.entities, used = [i], order = [i];
    function walk(at, end, front) {
      for (var guard = 0; guard < E.length; guard++) {
        var best = -1, bestEnd = -1;
        E.forEach(function (o, j) {
          if (!o || !!o.construction !== !!E[i].construction || used.indexOf(j) >= 0) return;
          pathEnds(o).forEach(function (q, k) {
            if (best < 0 && meet(end.p, q.p) && end.out[0] * q.out[0] + end.out[1] * q.out[1] < -TANGENT) { best = j; bestEnd = k; }
          });
        });
        if (best < 0) return;
        used.push(best);
        if (front) order.unshift(best); else order.push(best);
        end = pathEnds(E[best])[1 - bestEnd];
      }
    }
    var ends = pathEnds(E[i]);
    if (ends.length) { walk(i, ends[1], false); walk(i, ends[0], true); }
    return order;
  }
  // pathOrder(sketch, list) -> the entities of list in chain order, or null when they are not one chain end to end
  function pathOrder(sketch, list) {
    var E = sketch.entities, ids = list.filter(function (i, k) { return E[i] && list.indexOf(i) === k; });
    if (!ids.length) return null;
    if (ids.length === 1) return ids.slice();
    var ends = {};
    for (var n = 0; n < ids.length; n++) { ends[ids[n]] = pathEnds(E[ids[n]]); if (!ends[ids[n]].length) return null; }
    function joined(p, skip) { return ids.filter(function (j) { return j !== skip && ends[j].some(function (q) { return meet(p, q.p); }); }); }
    var start = ids[0], from = 0, branch = false;
    ids.forEach(function (i) {
      ends[i].forEach(function (q, k) {
        var on = joined(q.p, i);
        if (on.length > 1) branch = true;
        if (!on.length && !(joined(ends[start][from].p, start).length === 0)) { start = i; from = k; }
      });
    });
    if (branch) return null;
    var order = [start], at = ends[start][1 - from].p;
    for (var guard = 0; guard < ids.length; guard++) {
      var cur = order[order.length - 1], next = joined(at, cur).filter(function (j) { return order.indexOf(j) < 0; })[0];
      if (next == null) break;
      order.push(next);
      at = meet(ends[next][0].p, at) ? ends[next][1].p : ends[next][0].p;
    }
    return order.length === ids.length ? order : null;
  }
  // sketchPaths(sketch) -> [{ id, ents: [entity indices in chain order when they still chain] }], by id
  function sketchPaths(sketch) {
    var by = {};
    (sketch.entities || []).forEach(function (e, i) { if (e && e.pathId != null) (by[e.pathId] = by[e.pathId] || []).push(i); });
    return Object.keys(by).map(Number).sort(function (a, b) { return a - b; }).map(function (id) { return { id: id, ents: pathOrder(sketch, by[id]) || by[id] }; });
  }
  // makeSketchPath(sketch, list, id?) -> { ok, id, ents } | { ok: false, error }: list becomes one path (id: the path
  // being edited, whose other members leave it). An entity of another path moves to this one.
  function makeSketchPath(sketch, list, id) {
    var order = pathOrder(sketch, list);
    if (!order) return { ok: false, error: 'A path has to be one chain of sketch entities joined end to end, with no branches.' };
    var E = sketch.entities;
    if (id == null) { id = 0; E.forEach(function (e) { if (e && e.pathId > id) id = e.pathId; }); id++; }
    E.forEach(function (e) { if (e && e.pathId === id) delete e.pathId; });
    order.forEach(function (i) { E[i].pathId = id; });
    return { ok: true, id: id, ents: order };
  }
  // dissolveSketchPath(sketch, i) -> how many entities left the path of entity i; the entities themselves stay
  function dissolveSketchPath(sketch, i) {
    var e = sketch.entities[i], id = e && e.pathId, n = 0;
    if (id == null) return 0;
    sketch.entities.forEach(function (o) { if (o && o.pathId === id) { delete o.pathId; n++; } });
    return n;
  }
  function pathScriptLine(f) {
    var list = sketchPaths(f).map(function (p) { return p.ents; });
    return list.length ? '\n  .paths(' + JSON.stringify(list) + ')' : '';
  }
  function installPathScript() {
    if (K.__sketchPaths || !K.registerSketchScript || !K.newModel || !K.Builder) return;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    SBP.paths = function (list) {
      var f = this.f;
      (list || []).forEach(function (ents) { var r = makeSketchPath(f, ents); if (!r.ok) throw new Error(r.error); });
      return this;
    };
    K.registerSketchScript(pathScriptLine);
    K.__sketchPaths = true;
  }
  // kernel-script.js calls Kernel.installPictureScript once the Builder exists
  var installPictures = K.installPictureScript;
  K.installPictureScript = function () { installPictures(); installPathScript(); };
  K.tangentChain = tangentChain; K.pathOrder = pathOrder; K.sketchPaths = sketchPaths; K.makeSketchPath = makeSketchPath; K.dissolveSketchPath = dissolveSketchPath;
})(Kernel);

// rfGS: Derived Sketch (Insert ▸ Derived Sketch). A sketch with derived: { from: <parent sketch id>, dx, dy, at, name } is
// a linked copy of its parent on another plane or face: its entities are the parent's own, same 2D coordinates moved
// by (dx, dy). SolidWorks lets a derived sketch be located but not reshaped, so a sync keeps how far the copy was moved
// by hand (at: where each entity stood after the last sync) and takes the shape from the parent again. Underive
// (Kernel.underiveSketch) drops the link and leaves the entities as they stand.
(function (K) {
  'use strict';
  function anchor(e) { var p = e ? K.entitySnapPoints(e) : null; return p && p.length ? p[0] : null; }
  function anchors(ents) { return ents.map(anchor); }
  // how far the copy was dragged since the last sync: the move of the first entity that is not where it was left
  function dragged(ents, at) {
    if (!Array.isArray(at) || at.length !== ents.length) return null;
    for (var i = 0; i < ents.length; i++) {
      var c = anchor(ents[i]), a = at[i];
      if (c && a && Math.hypot(c[0] - a[0], c[1] - a[1]) > 1e-9) return [c[0] - a[0], c[1] - a[1]];
    }
    return null;
  }
  function deriveEntities(parent, dx, dy) { return (parent.entities || []).map(function (e) { return K.translateEntity(e, dx, dy); }); }
  // one derived sketch from its parent: true when anything changed
  function syncDerived(f, parent) {
    var d = f.derived, dx = +d.dx || 0, dy = +d.dy || 0, mv = dragged(f.entities || [], d.at);
    if (mv) { dx += mv[0]; dy += mv[1]; }
    var ents = deriveEntities(parent, dx, dy), a = anchors(ents), same = JSON.stringify(ents) === JSON.stringify(f.entities || []);
    var sameLen = (f.entities || []).length === ents.length;
    d.name = parent.name;
    if (same && d.dx === dx && d.dy === dy) { d.at = a; return false; }
    d.dx = dx; d.dy = dy; d.at = a;
    f.entities = ents;
    if (!sameLen) { f.rels = []; f.dims = []; }   // what they held has changed: relations added to locate the copy start again
    return true;
  }
  // every derived sketch of the model from its parent, in tree order (a derived sketch of a derived sketch follows).
  // A sketch being edited (skipId) waits for the rebuild after it closes. Returns the number of sketches changed.
  function syncDerivedSketches(model, skipId) {
    var n = 0;
    ((model && model.features) || []).forEach(function (f) {
      if (f.type !== 'sketch' || !f.derived || f.id === skipId) return;
      var parent = K.findFeature(model, f.derived.from);
      if (parent && parent.type === 'sketch' && parent !== f && syncDerived(f, parent)) n++;
    });
    return n;
  }
  // a new derived sketch's record: { derived, entities } (no feature made: the caller places it in the tree)
  function deriveSketch(parent) {
    var ents = deriveEntities(parent, 0, 0);
    return { derived: { from: parent.id, dx: 0, dy: 0, at: anchors(ents), name: parent.name }, entities: ents };
  }
  function underiveSketch(f) { if (!f || !f.derived) return false; delete f.derived; return true; }
  // the script line: p.sketch('Top').line(…).derivedFrom('Sketch1', dx, dy)
  function derivedScriptLine(f) {
    var d = f.derived;
    return d && d.name ? '\n  .derivedFrom(' + JSON.stringify(d.name) + (d.dx || d.dy ? ', ' + (+d.dx || 0) + ', ' + (+d.dy || 0) : '') + ')' : '';
  }
  function installDerivedScript() {
    if (K.__derivedSketches || !K.registerSketchScript || !K.newModel || !K.Builder) return;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    SBP.derivedFrom = function (name, dx, dy) {
      var f = this.f, parent = this.part.model.features.filter(function (g) { return g.type === 'sketch' && g.name === name; })[0];
      if (!parent) throw new Error('derivedFrom: there is no sketch named ' + name + ' before this one.');
      f.derived = { from: parent.id, dx: +dx || 0, dy: +dy || 0, name: parent.name };
      f.entities = deriveEntities(parent, f.derived.dx, f.derived.dy);
      f.derived.at = anchors(f.entities);
      return this;
    };
    K.registerSketchScript(derivedScriptLine);
    K.__derivedSketches = true;
  }
  var basePictureScript = K.installPictureScript;   // kernel-script.js calls it once the Builder exists
  K.installPictureScript = function () { basePictureScript(); installDerivedScript(); };
  K.syncDerivedSketches = syncDerivedSketches; K.deriveSketch = deriveSketch; K.underiveSketch = underiveSketch; K.derivedScriptLine = derivedScriptLine;
})(Kernel);

// ------------------------------------------------------------------ lane fitspline: Fit Spline as one B-spline
// SolidWorks' Fit Spline (Tools ▸ Spline Tools ▸ Fit Spline): a chain of lines, arcs and polylines, end to end, becomes
// ONE spline entity within a Tolerance of it: here a clamped cubic B-spline (isBSpline above) fitted by least squares
// to the chain parameterised by arc length, with a knot inserted (the span halved) wherever the curve strays further
// than 0.8 × the tolerance, until it does nowhere. The deviation is |C(s) − chain(s)| at 24 points per span, an upper
// bound of the distance both ways (the spline from the chain and the chain from the spline). A closed chain with Closed
// spline gives a periodic fit (C2 through the seam too), stored clamped with its first and last control points equal.
// Constrained: the spline keeps fit = { id, tol, closed, sig } and its source entities fitSrc = id; every solve
// (SketchSolver writeBack) calls syncFitSplines, which refits a spline whose sources moved.
(function (K) {
  'use strict';
  var TAU = 2 * Math.PI;
  function d2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function pStart(p) { return p.k === 'line' ? p.a : [p.c[0] + p.r * Math.cos(p.a0), p.c[1] + p.r * Math.sin(p.a0)]; }
  function pEnd(p) { return p.k === 'line' ? p.b : [p.c[0] + p.r * Math.cos(p.a0 + p.sw), p.c[1] + p.r * Math.sin(p.a0 + p.sw)]; }
  function pRev(p) { return p.k === 'line' ? { k: 'line', a: p.b, b: p.a } : { k: 'arc', c: p.c, r: p.r, a0: p.a0 + p.sw, sw: -p.sw }; }
  function pLen(p) { return p.k === 'line' ? d2(p.a, p.b) : p.r * Math.abs(p.sw); }
  function pAt(p, f) { return p.k === 'line' ? [p.a[0] + (p.b[0] - p.a[0]) * f, p.a[1] + (p.b[1] - p.a[1]) * f] : [p.c[0] + p.r * Math.cos(p.a0 + p.sw * f), p.c[1] + p.r * Math.sin(p.a0 + p.sw * f)]; }
  // the selected entities as one chain of exact pieces: { pieces: [{ k: 'line', a, b } | { k: 'arc', c, r, a0, sw }]
  // (radians, sw signed), closed, ends: [start ref, end ref], diag } or { error }
  function fitChain(ents, idx) {
    var segs = [], xs = [], ys = [];
    idx.forEach(function (i) {
      var e = ents[i];
      if (!e) return;
      if (e.t === 'line') segs.push({ pcs: [{ k: 'line', a: [+e.x1, +e.y1], b: [+e.x2, +e.y2] }], refs: [i + '.p1', i + '.p2'] });
      else if (e.t === 'arc') {
        var sw = (+e.a1 - +e.a0) * Math.PI / 180;
        while (sw <= 0) sw += TAU;
        segs.push({ pcs: [{ k: 'arc', c: [+e.cx, +e.cy], r: +e.r, a0: +e.a0 * Math.PI / 180, sw: sw }], refs: [i + '.p1', i + '.p2'] });
      } else if (e.t === 'polyline' && e.pts && e.pts.length >= 2) {
        var Q = e.pts.map(function (q) { return [+q[0], +q[1]]; }), pc = [];
        if (e.closed) Q.push(Q[0]);
        for (var k = 0; k + 1 < Q.length; k++) if (d2(Q[k], Q[k + 1]) > 0) pc.push({ k: 'line', a: Q[k], b: Q[k + 1] });
        if (pc.length) segs.push({ pcs: pc, refs: [null, null] });
      }
    });
    if (!segs.length) return { error: 'Select lines, arcs or a polyline: a chain of them, end to end.' };
    segs.forEach(function (s) { s.pcs.forEach(function (p) { [pStart(p), pEnd(p)].forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); }); });
    var diag = Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) || 1;
    var tol = 1e-6 * Math.max(1, diag), first = segs.shift(), chain = { pcs: first.pcs.slice(), refs: first.refs.slice() };
    while (segs.length) {
      var hit = -1, how = null, c0 = pStart(chain.pcs[0]), c1 = pEnd(chain.pcs[chain.pcs.length - 1]);
      for (var j = 0; j < segs.length && hit < 0; j++) {
        var s = segs[j], a0 = pStart(s.pcs[0]), a1 = pEnd(s.pcs[s.pcs.length - 1]);
        if (d2(a0, c1) < tol) { hit = j; how = 'end'; }
        else if (d2(a1, c1) < tol) { hit = j; how = 'endRev'; }
        else if (d2(a1, c0) < tol) { hit = j; how = 'start'; }
        else if (d2(a0, c0) < tol) { hit = j; how = 'startRev'; }
      }
      if (hit < 0) return { error: 'The selected entities do not form one chain: they must join end to end.' };
      var sg = segs.splice(hit, 1)[0], P = sg.pcs.slice(), R = sg.refs.slice();
      if (how === 'endRev' || how === 'startRev') { P = P.reverse().map(pRev); R.reverse(); }
      if (how === 'end' || how === 'endRev') { chain.pcs = chain.pcs.concat(P); chain.refs[1] = R[1]; }
      else { chain.pcs = P.concat(chain.pcs); chain.refs[0] = R[0]; }
    }
    var closed = chain.pcs.length > 1 && d2(pStart(chain.pcs[0]), pEnd(chain.pcs[chain.pcs.length - 1])) < tol;
    return { pieces: chain.pcs, closed: closed, ends: chain.refs, diag: diag };
  }
  // B-spline basis: the p + 1 functions not zero on span j at u (knot accessor T(i)), Cox-de Boor (NURBS book A2.2)
  function basis(T, j, u, p) {
    var N = [1], left = [0], right = [0];
    for (var r = 1; r <= p; r++) {
      left[r] = u - T(j + 1 - r); right[r] = T(j + r) - u;
      var saved = 0;
      for (var k = 0; k < r; k++) { var den = right[k + 1] + left[r - k], tmp = den !== 0 ? N[k] / den : 0; N[k] = saved + right[k + 1] * tmp; saved = left[r - k] * tmp; }
      N[r] = saved;
    }
    return N;
  }
  // the symmetric positive definite band system M x = R (row i holds columns i − bw … i + bw), two right-hand sides
  function bandSolve(M, R, bw) {
    var n = M.length, i, r, c;
    for (i = 0; i < n; i++) {
      var piv = M[i][bw];
      if (!(Math.abs(piv) > 1e-300)) return null;
      for (r = i + 1; r <= Math.min(n - 1, i + bw); r++) {
        var f = M[r][i - r + bw] / piv;
        if (!f) continue;
        for (c = i; c <= Math.min(n - 1, i + bw); c++) M[r][c - r + bw] -= f * M[i][c - i + bw];
        R[r][0] -= f * R[i][0]; R[r][1] -= f * R[i][1];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var sx = R[i][0], sy = R[i][1];
      for (c = i + 1; c <= Math.min(n - 1, i + bw); c++) { sx -= M[i][c - i + bw] * x[c][0]; sy -= M[i][c - i + bw] * x[c][1]; }
      x[i] = [sx / M[i][bw], sy / M[i][bw]];
    }
    return x;
  }
  var LS_PER_SPAN = 10, ERR_PER_SPAN = 24, MAX_CPS = 1500, MAX_CLOSED = 400, MAX_IT = 60;
  // fitspline2: the least-squares cubic B-spline on the knots b (b[0] = 0, then every knot inside (0, L), a repeated
  // value a multiple knot) to the curve at(s), s in [0, L]: open = clamped with the ends at at(0) / at(L) fixed;
  // closed = periodic. -> { Ux, Px (the spline's knots and control points; periodic: the extended ones), dev (the
  // largest |C(s) − at(s)| at 24 points per span), add (the middles of the spans over 0.8 tol) } or null
  function lsSolve(at, L, b, closed, tol) {
    var m = b.length, Ux, nP, cpOf, nu, i, j, k;
    if (closed) {
      var T = function (q) { var w = Math.floor(q / m); return b[q - w * m] + w * L; };
      Ux = [];
      for (k = 0; k < m + 7; k++) Ux.push(T(k - 3));
      nP = m + 3; nu = m;
      cpOf = function (q) { return (((q - 3) % m) + m) % m; };
    } else {
      Ux = [0, 0, 0, 0].concat(b.slice(1), [L, L, L, L]);
      nP = Ux.length - 4; nu = nP - 2;
      cpOf = function (q) { return q === 0 || q === nP - 1 ? -1 : q - 1; };
    }
    if (nu > (closed ? MAX_CLOSED : MAX_CPS)) return null;
    var E0 = at(0), E1 = at(L), fixedVal = function (q) { return q === 0 ? E0 : E1; };
    var bw = closed ? Math.max(0, nu - 1) : 3, M = [], R = [], UxF = function (q) { return Ux[q]; };
    for (i = 0; i < nu; i++) { M.push(new Float64Array(2 * bw + 1)); R.push([0, 0]); }
    for (j = 3; j < nP; j++) {
      var lo = Ux[j], hi = Ux[j + 1];
      if (!(hi > lo)) continue;
      for (k = 0; k < LS_PER_SPAN; k++) {
        var u = lo + (hi - lo) * (k + 0.5) / LS_PER_SPAN, N = basis(UxF, j, u, 3), tgt = at(u), rx = tgt[0], ry = tgt[1], idx = [], w = [];
        for (var a = 0; a <= 3; a++) {
          var q = j - 3 + a, ci = cpOf(q);
          if (ci < 0) { var fv = fixedVal(q); rx -= N[a] * fv[0]; ry -= N[a] * fv[1]; continue; }
          var at2 = idx.indexOf(ci);
          if (at2 >= 0) w[at2] += N[a]; else { idx.push(ci); w.push(N[a]); }
        }
        for (var x1 = 0; x1 < idx.length; x1++) {
          R[idx[x1]][0] += w[x1] * rx; R[idx[x1]][1] += w[x1] * ry;
          for (var x2 = 0; x2 < idx.length; x2++) { var off = idx[x2] - idx[x1] + bw; if (off >= 0 && off <= 2 * bw) M[idx[x1]][off] += w[x1] * w[x2]; }
        }
      }
    }
    var X = nu ? bandSolve(M, R, bw) : [];
    if (!X) return null;
    var Px = [];
    for (k = 0; k < nP; k++) { var c = cpOf(k); Px.push(c < 0 ? fixedVal(k).slice() : X[c].slice()); }
    var add = [], dev = 0;
    for (j = 3; j < nP; j++) {
      var l2 = Ux[j], h2 = Ux[j + 1], worst = 0;
      if (!(h2 > l2)) continue;
      for (k = 0; k <= ERR_PER_SPAN; k++) { var uu = l2 + (h2 - l2) * k / ERR_PER_SPAN, pc = K.bsBlossom(Ux, Px, 3, j, [uu, uu, uu]); worst = Math.max(worst, d2(pc, at(uu))); }
      dev = Math.max(dev, worst);
      if (worst > tol * 0.8 && h2 - l2 > L * 1e-7) add.push((l2 + h2) / 2);
    }
    return { Ux: Ux, Px: Px, dev: dev, add: add };
  }
  // fitspline2: Simplify Spline on a B-spline: interior knots removed one at a time (the one whose removal changes the
  // curve least first, the rest refitted to the original curve by least squares) while the curve stays within tol of
  // the original. -> { e (a new entity), dev } (the same entity's copy when nothing can go)
  function simplifyBSpline(e, tol) {
    var g = K.splineGeom(e);
    if (!g || !g.bs) return null;
    var pcs = g.pieces, u0 = pcs[0].lo, L = pcs[pcs.length - 1].hi - u0;
    function at(s) {
      var u = u0 + Math.max(0, Math.min(L, s)), z = 0;
      while (z < pcs.length - 1 && u >= pcs[z].hi) z++;
      var pc = pcs[z];
      return K.bzPoint(pc.B, (u - pc.lo) / (pc.hi - pc.lo));
    }
    var U = g.bs.knots, kl = U.slice(4, U.length - 4).map(function (x) { return x - u0; }), dev = 0, cur = null;
    for (var guard = 0; guard < 400 && kl.length; guard++) {
      var bestK = null;
      var seen = {};
      for (var z = 0; z < kl.length; z++) {
        if (seen[kl[z]]) continue;
        seen[kl[z]] = true;
        var trial = kl.slice(0, z).concat(kl.slice(z + 1)), sol = lsSolve(at, L, [0].concat(trial), false, tol);
        if (sol && (!bestK || sol.dev < bestK.sol.dev)) bestK = { kl: trial, sol: sol };
      }
      if (!bestK || bestK.sol.dev > tol) break;
      kl = bestK.kl; cur = bestK.sol; dev = cur.dev;
    }
    var o = JSON.parse(JSON.stringify(e));
    if (!cur) return { e: o, dev: 0 };
    o.knots = cur.Ux.map(function (x) { return x + u0; });
    o.pts = cur.Px.map(function (q) { return [q[0], q[1]]; });
    if (e.closed) o.pts[o.pts.length - 1] = o.pts[0].slice();
    delete o.fit;
    return { e: o, dev: dev };
  }
  // fitBSpline(chain (fitChain's), tol, closed) -> { knots, pts, closed, dev, spans } or null
  function fitBSpline(ch, tol, wantClosed) {
    var P = ch.pieces, S = [0], i, j, k;
    P.forEach(function (p) { S.push(S[S.length - 1] + pLen(p)); });
    var L = S[S.length - 1];
    if (!(L > 0)) return null;
    var closed = !!wantClosed && !!ch.closed;
    tol = +tol > 0 ? +tol : 1e-3 * ch.diag;
    function at(s) {
      if (closed) { s = s % L; if (s < 0) s += L; } else s = Math.max(0, Math.min(L, s));
      var lo = 0, hi = P.length - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (S[mid] <= s) lo = mid; else hi = mid - 1; }
      var l = S[lo + 1] - S[lo];
      return pAt(P[lo], l > 0 ? Math.min(1, (s - S[lo]) / l) : 0);
    }
    // first breakpoints: the chain's own joints (an arc cut every 60°) when there are few of them, else even spans
    // fitspline2: a joint where the chain stays tangent but its curvature jumps (line to arc, arc to arc of another
    // radius) gets a double knot: the spline is C1 there (as the chain is) and each side fits its own piece, so lines
    // come out exact and arcs within the tolerance in a span or two; elsewhere the spline stays C2 (a corner is
    // rounded within the tolerance by halving the spans next to it)
    var jk = [], seamJump = false, minGap = L * 1e-9;
    function kap(p) { return p.k === 'line' ? 0 : (p.sw > 0 ? 1 : -1) / p.r; }
    function tanAt(p, end) {
      if (p.k === 'line') { var dl = d2(p.a, p.b) || 1; return [(p.b[0] - p.a[0]) / dl, (p.b[1] - p.a[1]) / dl]; }
      var a = p.a0 + (end ? p.sw : 0), sg = p.sw > 0 ? 1 : -1;
      return [-Math.sin(a) * sg, Math.cos(a) * sg];
    }
    function jump(A, B) {
      var ta = tanAt(A, true), tb = tanAt(B, false);
      if (Math.abs(ta[0] * tb[1] - ta[1] * tb[0]) > 1e-7 || ta[0] * tb[0] + ta[1] * tb[1] < 0) return false;   // not tangent: a corner
      return Math.abs(kap(A) - kap(B)) > 1e-9 / Math.max(1e-12, ch.diag);
    }
    var br = [];
    if (P.length <= 80) {
      P.forEach(function (p, q) {
        var nsub = p.k === 'arc' ? Math.max(1, Math.ceil(Math.abs(p.sw) / (Math.PI / 3))) : 1;
        for (k = 1; k < nsub; k++) br.push(S[q] + (S[q + 1] - S[q]) * k / nsub);
        if (q + 1 < P.length) { if (jump(p, P[q + 1])) jk.push(S[q + 1]); else br.push(S[q + 1]); }
      });
      if (closed && P.length > 1 && jump(P[P.length - 1], P[0])) seamJump = true;
    } else for (k = 1; k < 4; k++) br.push(L * k / 4);   // (a dense polyline: few spans first, halved where they stray)
    function nearJk(x) { for (var z = 0; z < jk.length; z++) if (Math.abs(x - jk[z]) <= minGap) return true; return false; }
    function tidy(list) {
      list.sort(function (a, b) { return a - b; });
      var out = [];
      list.forEach(function (x) { if (x > minGap && x < L - minGap && !nearJk(x) && (!out.length || x - out[out.length - 1] > minGap)) out.push(x); });
      return out;
    }
    br = tidy(br);
    // every knot inside (0, L): the simple ones and the joints twice
    function knotList() { return br.concat(jk, jk).sort(function (a, b) { return a - b; }); }
    while (br.length + 2 * jk.length + 1 < (closed ? 4 : 1)) {
      var all = [0].concat(knotList(), [L]), wi = 0;
      for (k = 1; k + 1 < all.length; k++) if (all[k + 1] - all[k] > all[wi + 1] - all[wi]) wi = k;
      br = tidy(br.concat([(all[wi] + all[wi + 1]) / 2]));
    }
    var best = null;
    for (var it = 0; it < MAX_IT; it++) {
      var sol = lsSolve(at, L, [0].concat(seamJump ? [0] : [], knotList()), closed, tol);
      if (!sol) break;
      best = sol;
      if (!sol.add.length) break;
      br = tidy(br.concat(sol.add));
    }
    if (!best) return null;
    var out;
    if (closed) {
      var pcs = K.bsPieces(best.Ux, best.Px, 3);
      pcs.forEach(function (pc, z) { pc.mult = z ? Math.max(1, pc.mult) : 0; });   // (a double knot stays double)
      out = K.bsFromPieces(pcs);
      if (!out) return null;
      out.pts[out.pts.length - 1] = out.pts[0].slice();
    } else out = { knots: best.Ux.slice(), pts: best.Px };
    function cl(v) { var r = Math.round(v * 1e12) / 1e12; return Math.abs(r - v) < 1e-13 * Math.max(1, Math.abs(v)) ? r : v; }
    return { knots: out.knots.map(cl), pts: out.pts.map(function (q) { return [cl(q[0]), cl(q[1])]; }), closed: closed, dev: best.dev, spans: spanCount(out.knots) };
  }
  // the knot intervals of non-zero length (the spline's spans)
  function spanCount(U) { var n = 0; for (var i = 0; i + 1 < U.length; i++) if (U[i + 1] > U[i]) n++; return n; }
  // the B-spline entity fitted to entities idx of ents: { ok, e, dev, chain } or { ok: false, error }
  function fitSplineEntity(ents, idx, opts) {
    opts = opts || {};
    var ch = fitChain(ents, idx);
    if (ch.error) return { ok: false, error: ch.error };
    var fit = fitBSpline(ch, opts.tol, opts.closed !== false);
    if (!fit) return { ok: false, error: 'No spline fits that chain.' };
    var e = { t: 'spline', style: true, deg: 3, knots: fit.knots, pts: fit.pts };
    if (fit.closed) e.closed = true;
    return { ok: true, e: e, dev: fit.dev, spans: fit.spans, chain: ch };
  }
  function srcSig(ents, idx) {
    function r(v) { return Math.round(+v * 1e10) / 1e10; }
    return idx.map(function (i) {
      var e = ents[i];
      if (e.t === 'line') return [i, r(e.x1), r(e.y1), r(e.x2), r(e.y2)].join(',');
      if (e.t === 'arc') return [i, r(e.cx), r(e.cy), r(e.r), r(e.a0), r(e.a1)].join(',');
      return i + ':' + (e.pts || []).map(function (q) { return r(q[0]) + ',' + r(q[1]); }).join(';') + (e.closed ? 'c' : '');
    }).join('|');
  }
  // the source entities of Constrained fit spline e (fitSrc === e.fit.id), in sketch order
  function fitSources(f, e) {
    var out = [];
    if (!e || !e.fit) return out;
    (f.entities || []).forEach(function (x, k) { if (x && x !== e && x.fitSrc === e.fit.id) out.push(k); });
    return out;
  }
  // refit every Constrained fit spline of sketch f whose sources changed; returns how many were refitted
  function syncFitSplines(f) {
    var n = 0;
    if (!f || !f.entities) return 0;
    f.entities.forEach(function (e) {
      if (!e || !e.fit || !K.isBSpline(e)) return;
      var src = fitSources(f, e);
      if (!src.length) return;
      var sig = srcSig(f.entities, src);
      if (sig === e.fit.sig) return;
      var r = fitSplineEntity(f.entities, src, { tol: e.fit.tol, closed: !!e.fit.closed });
      e.fit.sig = sig;
      if (!r.ok) return;
      e.knots = r.e.knots; e.pts = r.e.pts;
      if (r.e.closed) e.closed = true; else delete e.closed;
      n++;
    });
    return n;
  }
  // a new fit id for sketch f
  function newFitId(f) {
    var m = 0;
    (f.entities || []).forEach(function (e) { if (e && e.fit && +e.fit.id > m) m = +e.fit.id; if (e && +e.fitSrc > m) m = +e.fitSrc; });
    return m + 1;
  }
  K.fitChain = fitChain; K.fitBSpline = fitBSpline; K.fitSplineEntity = fitSplineEntity; K.syncFitSplines = syncFitSplines;
  // fitspline2: entities first … first + count − 1 were just copied in (paste): each Constrained spline among them whose
  // sources came along gets a new link id shared with those copies, so it follows them and not the originals; a copied
  // spline without its sources is no longer linked, copied sources without their spline are plain construction
  function relinkFitCopies(f, first, count) {
    var ents = f.entities || [], ids = {}, i, e, fresh = newFitId(f), last = first + count;
    for (i = first; i < last; i++) { e = ents[i]; if (e && e.fit && K.isBSpline(e)) ids[e.fit.id] = ids[e.fit.id] || { spl: [], src: [] }; }
    for (i = first; i < last; i++) { e = ents[i]; if (e && e.fitSrc != null && ids[e.fitSrc]) ids[e.fitSrc].src.push(i); }
    for (i = first; i < last; i++) { e = ents[i]; if (e && e.fit && ids[e.fit.id]) ids[e.fit.id].spl.push(i); }
    var n = 0, kept = {};
    Object.keys(ids).forEach(function (id) {
      var g = ids[id];
      if (!g.src.length || g.spl.length !== 1) { g.spl.forEach(function (k) { delete ents[k].fit; }); return; }
      g.src.forEach(function (k) { kept[k] = true; });
      var nid = fresh++;
      ents[g.spl[0]].fit.id = nid; delete ents[g.spl[0]].fit.sig;
      g.src.forEach(function (k) { ents[k].fitSrc = nid; });
      n++;
    });
    for (i = first; i < last; i++) { e = ents[i]; if (e && e.fitSrc != null && !kept[i]) delete e.fitSrc; }
    return n;
  }
  K.fitSources = fitSources; K.fitSourceSig = srcSig; K.newFitId = newFitId; K.relinkFitCopies = relinkFitCopies; K.simplifyBSpline = simplifyBSpline;
})(Kernel);

// ------------------------------------------------------------------ lane sketchref: sketch references to the model
// A sketch's reference geometry (a construction entity held by a `fix` / `onEdge` relation: Convert Entities, Offset of
// a face loop, a model edge / vertex picked for a Smart Dimension or a relation, a snap to a model vertex / midpoint /
// edge / centre) carries `rel.mref`, the model topology it came from, in the identity the rest of Anvil uses for a
// face (ui-model-dims.js refs): a face sig `{ fid, n }` = the feature id that made the face (CSG polygon.shared) and
// its normal (null for a curved face).
//   { k: 'vertex', at: [x, y, z], sigs: [face sig, …] }                                   the faces round the vertex
//   { k: 'edge',   at: [x, y, z] (midpoint), d: [unit dir], sig: [face sig, face sig] }    a straight edge
//   { k: 'circle', c: [x, y, z], n, r, full, sig: [plane face sig, cylinder face sig] }    a round edge
// On every rebuild, before the sketch's feature builds (kernel-rebuild.js case 'sketch'), resolveSketchRefs re-finds
// each one on the bodies made so far (the candidate nearest its last position `at` / `c`), projects it into the sketch
// plane, moves the entity and its rel.at there and solves the sketch with it as fixed outside geometry, so whatever is
// dimensioned or related to it follows the model. One that is gone gets `rel.dangling: true`: the entity keeps its last
// position, the build goes on, and the sketch gets a Dangling warning. No mref: nothing changes (older files).
(function (K, _) {
  'use strict';
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function crs(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = len(a); return l > 1e-15 ? scale(a, 1 / l) : [0, 0, 0]; }
  function segDist(p, a, b) { var ab = sub(b, a), t = dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-30); t = Math.max(0, Math.min(1, t)); return len(sub(p, add(a, scale(ab, t)))); }
  function r9(x) { var q = Math.round(x * 1e9) / 1e9; return Math.abs(x - q) < 1e-12 ? q + 0 : x; }
  function perp(n) { return unit(Math.abs(n[0]) < 0.9 ? crs(n, [1, 0, 0]) : crs(n, [0, 1, 0])); }

  // the polygons of the bodies as plain records { fid, n, w, curved, surf, pts }; cached per body (a CSG solid is not
  // changed in place)
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function polysOf(bodies) {
    var out = [];
    (bodies || []).forEach(function (b) {
      if (!b || !b.polygons) return;
      var list = cache && cache.get(b);
      if (!list) {
        list = b.polygons.map(function (p) {
          var s = p.surf && (p.surf.s || p.surf);
          return { fid: p.shared == null ? null : p.shared, n: [p.plane.normal.x, p.plane.normal.y, p.plane.normal.z], w: p.plane.w, curved: !!s, surf: s || null,
            pts: p.vertices.map(function (v) { return [v.pos.x, v.pos.y, v.pos.z]; }) };
        });
        if (cache) cache.set(b, list);
      }
      for (var i = 0; i < list.length; i++) out.push(list[i]);
    });
    return out;
  }
  function sigOf(P) { return { fid: P.fid, n: P.curved ? null : P.n.map(r9) }; }
  function sigMatch(a, b) {
    if (!a || !b || a.fid !== b.fid) return false;
    if (!a.n || !b.n) return !a.n && !b.n;
    return dot(a.n, b.n) > 1 - 1e-6;
  }
  function polyMatch(P, s) { return P.fid === s.fid && (s.n ? !P.curved && dot(P.n, s.n) > 1 - 1e-6 : P.curved); }
  function tolOf(polys) {
    var m = 1, step = Math.max(1, polys.length >> 6);
    for (var i = 0; i < polys.length; i += step) polys[i].pts.forEach(function (q) { m = Math.max(m, Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])); });
    return 1e-5 * m;
  }
  // is q on polygon P (on its plane within tol, inside or on its boundary)?
  function onPoly(q, P, tol) {
    if (Math.abs(dot(P.n, q) - P.w) > tol) return false;
    var pts = P.pts, k, nk = pts.length;
    for (k = 0; k < nk; k++) if (segDist(q, pts[k], pts[(k + 1) % nk]) <= tol) return true;
    var ax = Math.abs(P.n[0]) > Math.abs(P.n[1]) ? (Math.abs(P.n[0]) > Math.abs(P.n[2]) ? 0 : 2) : (Math.abs(P.n[1]) > Math.abs(P.n[2]) ? 1 : 2), u = (ax + 1) % 3, v = (ax + 2) % 3, odd = false;
    for (k = 0; k < nk; k++) {
      var A = pts[k], B = pts[(k + 1) % nk];
      if ((A[v] > q[v]) !== (B[v] > q[v]) && q[u] < (B[u] - A[u]) * (q[v] - A[v]) / (B[v] - A[v]) + A[u]) odd = !odd;
    }
    return odd;
  }
  function addSig(list, s) { if (!list.some(function (t) { return sigMatch(s, t); })) list.push(s); }

  // modelRefFor(bodies, geom, opts) -> an mref naming model geometry picked in a sketch, or null when it cannot be named
  // (the reference then stays a plain Fix, as before). geom: { k: 'vertex', p } | { k: 'edge', a, b } |
  // { k: 'circle', c, n, r, full }. opts.fids: the feature ids that may be referenced (the features before the sketch;
  // SolidWorks takes no reference to a later feature).
  function modelRefFor(bodies, g, opts) {
    var polys = polysOf(bodies);
    if (!g || !polys.length) return null;
    var tol = tolOf(polys), ok = function (s) { return s.fid != null && (!opts || !opts.fids || opts.fids.indexOf(s.fid) >= 0); }, out = null;
    if (g.k === 'vertex') {
      var sigs = [];
      polys.forEach(function (P) { if (onPoly(g.p, P, tol)) addSig(sigs, sigOf(P)); });
      if (sigs.length >= 2 && sigs.every(ok)) out = { k: 'vertex', at: g.p.map(r9), sigs: sigs };
    } else if (g.k === 'edge') {
      var m = scale(add(g.a, g.b), 0.5), es = [];
      polys.forEach(function (P) { if (Math.abs(dot(P.n, g.a) - P.w) <= tol && Math.abs(dot(P.n, g.b) - P.w) <= tol && onPoly(m, P, tol)) addSig(es, sigOf(P)); });
      if (es.length > 2) {   // more than two faces touch it: the two most unlike
        var bi = 0, bj = 1, bd = Infinity;
        for (var i = 0; i < es.length; i++) for (var j = i + 1; j < es.length; j++) { var d = es[i].n && es[j].n ? dot(es[i].n, es[j].n) : 0; if (d < bd) { bd = d; bi = i; bj = j; } }
        es = [es[bi], es[bj]];
      }
      if (es.length === 2 && es.every(ok)) out = { k: 'edge', at: m.map(r9), d: unit(sub(g.b, g.a)).map(r9), sig: es };
    } else if (g.k === 'circle') {
      var cyl = null, pln = null, n = unit(g.n), x = perp(n), y = crs(n, x);
      polys.forEach(function (P) {
        var s = P.surf;
        if (!cyl && s && s.t === 'cyl' && Math.abs(Math.abs(dot(unit(s.d), n)) - 1) < 1e-6 && len(crs(sub(g.c, s.o), unit(s.d))) <= tol && Math.abs(s.r - g.r) <= tol) cyl = sigOf(P);
        if (!pln && !P.curved && Math.abs(Math.abs(dot(P.n, n)) - 1) < 1e-6 && Math.abs(dot(P.n, g.c) - P.w) <= tol) {
          for (var a = 0; a < 16 && !pln; a++) { var t = a * Math.PI / 8, q = add(g.c, add(scale(x, g.r * Math.cos(t)), scale(y, g.r * Math.sin(t)))); if (onPoly(q, P, tol * 100)) pln = sigOf(P); }
        }
      });
      if (cyl && pln && ok(cyl) && ok(pln)) out = { k: 'circle', c: g.c.map(r9), n: n.map(r9), r: r9(g.r), full: g.full !== false, sig: [pln, cyl] };
    }
    return out;
  }

  // resolveModelRef(bodies, mref) -> the geometry now: { k: 'vertex', p } | { k: 'edge', a, b } |
  // { k: 'circle', c, n, r, full, x, y, a0?, a1? } (an arc's ends as angles about n from x towards y), or null (gone)
  function resolveModelRef(bodies, ref) {
    var polys = polysOf(bodies);
    if (!ref || !polys.length) return null;
    var tol = tolOf(polys);
    if (ref.k === 'vertex') {
      var s0 = ref.sigs && ref.sigs[0], others = (ref.sigs || []).slice(1).map(function (s) { return polys.filter(function (P) { return polyMatch(P, s); }); }), bestV = null, bdV = Infinity, seen = {};
      if (!s0 || others.some(function (l) { return !l.length; })) return null;
      polys.forEach(function (P) {
        if (!polyMatch(P, s0)) return;
        P.pts.forEach(function (q) {
          var key = q.map(function (x) { return Math.round(x / tol); }).join(',');
          if (seen[key]) return;
          seen[key] = 1;
          if (!others.every(function (l) { return l.some(function (Q) { return onPoly(q, Q, tol); }); })) return;
          var d = len(sub(q, ref.at));
          if (d < bdV) { bdV = d; bestV = q; }
        });
      });
      return bestV ? { k: 'vertex', p: bestV.slice() } : null;
    }
    if (ref.k === 'edge') {
      var A = polys.filter(function (P) { return polyMatch(P, ref.sig[0]); }), B = polys.filter(function (P) { return polyMatch(P, ref.sig[1]); }), segs = [];
      if (!A.length || !B.length) return null;
      // a planar B: its planes' offsets first (most pieces of A are nowhere near them), then the polygons
      var Bw = [];
      if (ref.sig[1].n) B.forEach(function (Q) { if (!Bw.some(function (w) { return Math.abs(w - Q.w) <= tol; })) Bw.push(Q.w); });
      var onB = function (q) {
        if (Bw.length) { var h = dot(ref.sig[1].n, q); if (!Bw.some(function (w) { return Math.abs(h - w) <= tol * 2; })) return false; }
        return B.some(function (Q) { return onPoly(q, Q, tol); });
      };
      A.forEach(function (P) {
        for (var k = 0; k < P.pts.length; k++) {
          var a = P.pts[k], b = P.pts[(k + 1) % P.pts.length];
          if (len(sub(b, a)) <= tol) continue;
          if (onB(a) && onB(b) && onB(scale(add(a, b), 0.5))) segs.push([a, b]);
        }
      });
      if (!segs.length) return null;
      var best = null, bd = Infinity;
      segs.forEach(function (s) { var d = segDist(ref.at, s[0], s[1]); if (d < bd - 1e-12) { bd = d; best = s; } });
      // the whole edge: every collinear piece joined to it end to end (the booleans split edges)
      var d0 = unit(sub(best[1], best[0])), o = best[0], lo = 0, hi = dot(sub(best[1], o), d0);
      var onLine = function (q) { var w = sub(q, o); return len(sub(w, scale(d0, dot(w, d0)))) <= tol; };
      var ivs = segs.filter(function (s) { return onLine(s[0]) && onLine(s[1]); }).map(function (s) { var t0 = dot(sub(s[0], o), d0), t1 = dot(sub(s[1], o), d0); return [Math.min(t0, t1), Math.max(t0, t1)]; });
      for (var grew = true; grew;) {
        grew = false;
        for (var q = 0; q < ivs.length; q++) { var iv = ivs[q]; if (iv[0] <= hi + tol && iv[1] >= lo - tol && (iv[0] < lo - 1e-12 || iv[1] > hi + 1e-12)) { lo = Math.min(lo, iv[0]); hi = Math.max(hi, iv[1]); grew = true; } }
      }
      var ea = add(o, scale(d0, lo)), eb = add(o, scale(d0, hi));
      if (ref.d && dot(sub(eb, ea), ref.d) < 0) { var t = ea; ea = eb; eb = t; }
      return { k: 'edge', a: ea, b: eb };
    }
    if (ref.k === 'circle') {
      var n = ref.n, cands = [];
      polys.forEach(function (P) {
        var s = P.surf;
        if (!s || s.t !== 'cyl' || P.fid !== ref.sig[1].fid || Math.abs(Math.abs(dot(unit(s.d), n)) - 1) > 1e-6) return;
        var key = s.o.concat(unit(s.d), [s.r]).map(function (x) { return Math.round(x / tol); }).join(',');
        var c = null;
        for (var i = 0; i < cands.length; i++) if (cands[i].key === key) c = cands[i];
        if (!c) cands.push(c = { key: key, s: s, pts: [] });
        P.pts.forEach(function (q) { c.pts.push(q); });
      });
      var planes = polys.filter(function (P) { return polyMatch(P, ref.sig[0]); }), bestC = null, bdC = Infinity;
      cands.forEach(function (c) {
        var d = unit(c.s.d);
        planes.forEach(function (Q) {
          var dn = dot(d, Q.n);
          if (Math.abs(dn) < 1e-9) return;
          var on = c.pts.filter(function (q) { return Math.abs(dot(Q.n, q) - Q.w) <= tol && onPoly(q, Q, tol); });
          if (!on.length) return;
          var cen = add(c.s.o, scale(d, (Q.w - dot(Q.n, c.s.o)) / dn)), dd = len(sub(cen, ref.c)) + 0.01 * Math.abs(c.s.r - ref.r);
          if (dd < bdC - 1e-12) { bdC = dd; bestC = { c: cen, r: c.s.r, on: on }; }
        });
      });
      if (!bestC) return null;
      var x = perp(n), y = crs(n, x), res = { k: 'circle', c: bestC.c, n: n.slice(), r: bestC.r, full: ref.full !== false, x: x, y: y };
      if (!res.full) {
        // the arc: the angles of the facet corners on the plane; the widest gap between them is where it is open
        var angs = bestC.on.map(function (q) { var w = sub(q, bestC.c); return Math.atan2(dot(w, y), dot(w, x)); }).sort(function (p, q) { return p - q; }), gap = -1, gi = 0;
        for (var j = 0; j < angs.length; j++) { var nx = j + 1 < angs.length ? angs[j + 1] : angs[0] + 2 * Math.PI; if (nx - angs[j] > gap) { gap = nx - angs[j]; gi = j; } }
        if (angs.length < 2) res.full = true;
        else { res.a0 = gi + 1 < angs.length ? angs[gi + 1] : angs[0]; res.a1 = angs[gi]; while (res.a1 <= res.a0) res.a1 += 2 * Math.PI; }
      }
      return res;
    }
    return null;
  }

  // the entity's parameters for resolved geometry g in sketch plane pl (null: g no longer fits the entity)
  function entityParams(ent, g, pl) {
    var to2D = K.to2D;
    function r(x) { return Math.round(x * 1e9) / 1e9; }
    if (g.k === 'vertex') { if (ent.t !== 'point') return null; var q = to2D(pl, g.p); return { x: r(q[0]), y: r(q[1]) }; }
    if (g.k === 'edge') {
      var a = to2D(pl, g.a), b = to2D(pl, g.b);
      if (ent.t === 'point') return Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9 ? { x: r(a[0]), y: r(a[1]) } : null;
      if (ent.t !== 'line' || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return null;
      if ((b[0] - a[0]) * (ent.x2 - ent.x1) + (b[1] - a[1]) * (ent.y2 - ent.y1) < 0) { var t = a; a = b; b = t; }   // keep the line's own direction
      return { x1: r(a[0]), y1: r(a[1]), x2: r(b[0]), y2: r(b[1]) };
    }
    if (g.k === 'circle') {
      if (Math.abs(Math.abs(dot(g.n, pl.n)) - 1) > 1e-6) return null;
      var c = to2D(pl, g.c);
      if (ent.t === 'point') return { x: r(c[0]), y: r(c[1]) };
      if (ent.t === 'circle') return { cx: r(c[0]), cy: r(c[1]), r: r(g.r) };
      if (ent.t !== 'arc') return null;
      if (g.full || g.a0 == null) return { cx: r(c[0]), cy: r(c[1]), r: r(g.r) };
      var ang = function (u) { var q2 = to2D(pl, add(g.c, add(scale(g.x, g.r * Math.cos(u)), scale(g.y, g.r * Math.sin(u))))); return Math.atan2(q2[1] - c[1], q2[0] - c[0]) * 180 / Math.PI; };
      var sw = (g.a1 - g.a0) * 180 / Math.PI, a0 = dot(g.n, pl.n) > 0 ? ang(g.a0) : ang(g.a1);
      while (a0 < 0) a0 += 360;
      while (a0 >= 360) a0 -= 360;
      return { cx: r(c[0]), cy: r(c[1]), r: r(g.r), a0: r(a0), a1: r(a0 + sw) };
    }
    return null;
  }

  // the sketch solver: a global on the page and under Node; worker.js does not load it, so it is fetched there the first
  // time a sketch with model references builds
  function solver() {
    if (typeof SketchSolver !== 'undefined') return SketchSolver;
    var g = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null);
    if (g && g.SketchSolver) return g.SketchSolver;
    if (g && typeof g.importScripts === 'function' && typeof g.document === 'undefined') {
      try { g.importScripts('sketch-solver.js'); } catch (e) { return null; }
      return g.SketchSolver || (typeof SketchSolver !== 'undefined' ? SketchSolver : null);
    }
    return null;
  }
  K.sketchSolver = solver;

  // resolveSketchRefs(f, plane, bodies) -> null (f has no model references) | { changed, moved, dangling: [rel index],
  // warning? }: f's reference entities moved to where the model has their edges / vertices now, f solved (in place)
  function resolveSketchRefs(f, pl, bodies) {
    var rels = f && f.rels;
    if (!rels || !rels.some(function (r) { return r && r.mref; })) return null;
    var changed = false, moved = false, dangling = [], S = solver();
    rels.forEach(function (rel, i) {
      if (!rel || !rel.mref || rel.suppressed) return;
      var ent = f.entities[+rel.refs[0]];
      if (!ent || !/^\d+$/.test(String(rel.refs[0]))) return;
      var g = null;
      try { g = resolveModelRef(bodies, rel.mref); } catch (e) { g = null; }
      var np = g ? entityParams(ent, g, pl) : null;
      if (!np) { if (!rel.dangling) { rel.dangling = true; changed = true; } dangling.push(i); return; }
      if (rel.dangling) { delete rel.dangling; changed = true; }
      // found: its last position is where it is now
      if (g.k === 'vertex') rel.mref.at = g.p.map(r9);
      else if (g.k === 'edge') rel.mref.at = scale(add(g.a, g.b), 0.5).map(r9);
      else { rel.mref.c = g.c.map(r9); rel.mref.r = r9(g.r); }
      var keys = Object.keys(np);
      if (keys.every(function (k) { return Math.abs((+ent[k] || 0) - np[k]) < 1e-9; })) return;
      keys.forEach(function (k) { ent[k] = np[k]; });
      rel.at = ent.t === 'point' ? [ent.x, ent.y] : (S ? S.paramNames(ent) : keys).map(function (nm) { return ent[nm]; });
      changed = moved = true;
    });
    if (moved && S) { try { S.solve(f); } catch (e) { /* the references moved; the rest stays */ } }
    var out = { changed: changed, moved: moved, dangling: dangling };
    if (dangling.length) {
      var one = dangling.length === 1;
      out.warning = 'Dangling: ' + dangling.length + ' sketch relation' + (one ? '' : 's') + ' to model geometry that is gone (' + dangling.map(function (i) { var r = rels[i]; return (r.type === 'onEdge' ? 'On Edge' : 'Fixed') + ' ' + entName(f, +r.refs[0]); }).join(', ') + '); ' + (one ? 'it stays' : 'they stay') + ' at the last position. Delete or replace ' + (one ? 'it' : 'them') + ' in Display/Delete Relations.';
    }
    return out;
  }
  function entName(f, i) {
    var S = solver();
    if (S && S.refName) return S.refName(f, String(i));
    var e = f.entities[i], T = { line: 'Line', point: 'Point', circle: 'Arc', arc: 'Arc' };
    return (e && T[e.t] || 'Entity') + (i + 1);
  }
  K.modelRefFor = modelRefFor; K.resolveModelRef = resolveModelRef; K.resolveSketchRefs = resolveSketchRefs;
  _.resolveSketchRefs = resolveSketchRefs;
})(Kernel, Kernel._);
