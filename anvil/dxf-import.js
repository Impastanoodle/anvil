// dxf-import.js — DXF into sketches (no DOM; loaded after the kernel files, and by the Node runner through
// tests/kernel-tests.html). Three parts:
//   DxfImport.parse(text) -> { units: 'in' | 'mm' | null, layers: [{ name, color, count, frozen?, off? }], entities: [sketch entities
//     with a `layer` field], warnings: [], unitsFrom: 'INSUNITS' | 'MEASUREMENT' | null (lane dwgin: MEASUREMENT = assumed,
//     said in the warnings), tilted / offZ: counts of 3D records (projected / placed on the sketch plane, warned) }. LINE, ARC, CIRCLE, LWPOLYLINE and POLYLINE / VERTEX (bulges become arcs),
//     SPLINE (as an Anvil spline when its cubic spans map onto one exactly, else a chain of lines), ELLIPSE (full or
//     partial), POINT and INSERT of BLOCKS (exploded with base point, scale, rotation and MINSERT arrays; nested), in R12
//     and R2000+ layouts, in model space only (paper space is skipped with a warning). $INSUNITS (1 in, 4 mm; feet, cm and
//     m are converted) with $MEASUREMENT as the fallback. Entities in an object coordinate system (210/220/230; 0,0,-1
//     mirrors X) are mapped to the drawing's XY. TEXT, MTEXT and visible ATTRIBs become Sketch Text (Etch: single-
//     stroke marking, on their layer) with the file's height, rotation, width factor and alignment (TEXT's 72 / 73
//     justification, MTEXT's attachment point); DIMENSION and HATCH (and ATTDEF) are skipped quietly: counted in
//     `skipped` / `skippedNote` for the import message, not in the warnings; other entities are counted in the warnings.
//   DxfImport.check(entities, tol) -> issues (Check Sketch for Feature): open endpoints, gaps (with their size),
//     endpoints shared by three or more entities, zero-length and tiny entities, duplicate / overlapping entities,
//     crossings and endpoints touching the middle of another entity. issues.summary is the one-line summary.
//   DxfImport.repair(entities, opts) -> { entities, report, map, changed } (Repair Sketch): removes tiny entities,
//     merges duplicate / overlapping lines and co-radial arcs, closes gaps (ends snapped exactly together), joins
//     collinear lines and co-radial arcs, splits at crossings. No point moves more than opts.tol.
//   rfAU: parse(text, { blocks: true }) brings a model-space INSERT in as an Anvil block instance instead (Tools ▸
//     Blocks: its entities tagged `blk` plus an insertion point { t: 'point', blk, blkDef: the block name, blkAng: the
//     rotation, blkS: the scale }; Kernel.adoptBlocks / the solver take the definition from it), when the insertion is
//     uniformly scaled, not mirrored, flat (extrusion 0,0,1) and its block holds something Anvil draws; a MINSERT array
//     becomes one instance per cell; blocks nested in it are exploded into its definition. Otherwise it is exploded.
//     opts.idPrefix: the instance ids' prefix (default unique per parse, so a second import never joins the first).
// Sketch entities as kernel-sketch.js: line {x1,y1,x2,y2}, arc {cx,cy,r,a0,a1} (degrees, counterclockwise a0 -> a1),
// circle {cx,cy,r}, spline {pts, closed?, tans?}, ellipse {cx,cy,rx,ry,rot}, pellipse {…, a0, a1}, point {x,y}.
var DxfImport = (function () {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = 2 * Math.PI;
  function Kern() { return typeof Kernel !== 'undefined' ? Kernel : null; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(p, q) { return hyp(p[0] - q[0], p[1] - q[1]); }
  function normDeg(a) { a = a % 360; if (a < 0) a += 360; if (a > 360 - 1e-10) a = 0; return Math.abs(a) < 1e-10 ? 0 : a; }
  function fmtN(v) { return String(+(+v).toPrecision(3)); }

  // ------------------------------------------------------------------ group codes
  // [[code, value]] pairs: CRLF / CR / LF, trailing and leading spaces, a byte-order mark; a line that is not a group
  // code is skipped (the next one is tried), so one stray line does not shift the rest of the file
  function pairs(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (/^AutoCAD Binary DXF/.test(text)) throw new Error('Binary DXF is not supported: save the file as ASCII DXF.');
    var lines = text.split(/\r\n|\r|\n/), out = [];
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var s = lines[i].trim();
      if (!/^-?\d+$/.test(s)) { i -= 1; continue; }
      out.push([parseInt(s, 10), lines[i + 1].trim()]);
    }
    return out;
  }
  // { NAME: [pairs between SECTION/2 NAME and ENDSEC] }
  function sections(P) {
    var out = {}, i = 0;
    while (i < P.length) {
      if (P[i][0] === 0 && P[i][1].toUpperCase() === 'SECTION' && P[i + 1] && P[i + 1][0] === 2) {
        var name = P[i + 1][1].toUpperCase(), j = i + 2;
        while (j < P.length && !(P[j][0] === 0 && P[j][1].toUpperCase() === 'ENDSEC')) j++;
        out[name] = (out[name] || []).concat(P.slice(i + 2, j));
        i = j + 1;
      } else if (P[i][0] === 0 && P[i][1].toUpperCase() === 'EOF') break;
      else i++;
    }
    return out;
  }
  // records: one per group 0, { type, g: [pairs] }; a POLYLINE takes its VERTEX records (verts) up to SEQEND, an INSERT
  // its ATTRIBs (attribs)
  function records(P) {
    var raw = [], cur = null;
    P.forEach(function (p) {
      if (p[0] === 0) { cur = { type: p[1].toUpperCase(), g: [] }; raw.push(cur); }
      else if (cur) cur.g.push(p);
    });
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (r.type === 'POLYLINE' || (r.type === 'INSERT' && num(r, 66, 0) === 1)) {
        var kids = [];
        while (i + 1 < raw.length && (raw[i + 1].type === 'VERTEX' || raw[i + 1].type === 'ATTRIB')) kids.push(raw[++i]);
        if (i + 1 < raw.length && raw[i + 1].type === 'SEQEND') i++;
        if (r.type === 'POLYLINE') r.verts = kids; else r.attribs = kids;
      }
      out.push(r);
    }
    return out;
  }
  function num(r, code, def) {
    for (var k = 0; k < r.g.length; k++) if (r.g[k][0] === code) { var v = parseFloat(r.g[k][1]); return isFinite(v) ? v : def; }
    return def;
  }
  function str(r, code, def) {
    for (var k = 0; k < r.g.length; k++) if (r.g[k][0] === code) return r.g[k][1];
    return def;
  }

  // ------------------------------------------------------------------ 2D affine maps [a, b, c, d, e, f]:
  // x' = a·x + c·y + e, y' = b·x + d·y + f
  var ID = [1, 0, 0, 1, 0, 0];
  function mul(A, B) {
    return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  }
  function ap(M, x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }
  function apv(M, x, y) { return [M[0] * x + M[2] * y, M[1] * x + M[3] * y]; }
  function isId(M) { return M[0] === 1 && M[1] === 0 && M[2] === 0 && M[3] === 1 && M[4] === 0 && M[5] === 0; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit3(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function normalOf(r) { return unit3([num(r, 210, 0), num(r, 220, 0), num(r, 230, 1)]); }
  // the object coordinate system of an entity (DXF's arbitrary axis algorithm), projected onto XY; z is the elevation.
  // (0,0,1) is the identity; (0,0,-1) mirrors X.
  function ocs(r, z, ctx) {
    var N = normalOf(r);
    if (Math.abs(N[0]) < 1e-12 && Math.abs(N[1]) < 1e-12 && N[2] > 0) return z ? [1, 0, 0, 1, 0, 0] : ID;
    if (Math.abs(N[2]) < 1 - 1e-9 && ctx) ctx.tilted++;
    var Ax = unit3(Math.abs(N[0]) < 1 / 64 && Math.abs(N[1]) < 1 / 64 ? cross3([0, 1, 0], N) : cross3([0, 0, 1], N)), Ay = cross3(N, Ax);
    return [Ax[0], Ax[1], Ay[0], Ay[1], (z || 0) * N[0], (z || 0) * N[1]];
  }

  // ------------------------------------------------------------------ conics: circles, arcs and ellipses
  // A conic arc P(t) = c + a1·cos t + a2·sin t, t from t0 to t1 (t1 > t0), maps through any affine map as one again;
  // conicEntity turns it into an Anvil circle / arc (a1, a2 orthogonal and equal) or ellipse / partial ellipse through
  // the singular value decomposition of [a1 a2] = R(φ)·diag(sx, sy)·R(θ) (sy < 0: the map mirrors, the sense flips).
  function conicEntity(c, a1, a2, t0, t1, full) {
    var p = a1[0], q = a2[0], r = a1[1], s = a2[1];
    var E = (p + s) / 2, F = (p - s) / 2, G = (r + q) / 2, H = (r - q) / 2;
    var Q = hyp(E, H), R = hyp(F, G), sx = Q + R, sy = Q - R;
    if (!(sx > 0)) return null;
    var g1 = Math.atan2(G, F), g2 = Math.atan2(H, E), th = (g2 - g1) / 2, phi = (g2 + g1) / 2;
    var sign = sy < 0 ? -1 : 1, ry = Math.abs(sy);
    if (ry < 1e-12 * sx) return null;   // flattened to a line
    var u0, u1;
    if (sign > 0) { u0 = t0 + th; u1 = t1 + th; } else { u0 = -(t1 + th); u1 = -(t0 + th); }
    var sweep = (u1 - u0) * R2D;
    if (Math.abs(sx - ry) <= 1e-9 * sx) {
      var rr = (sx + ry) / 2;
      if (full) return { t: 'circle', cx: c[0], cy: c[1], r: rr };
      var a0 = normDeg((phi + u0) * R2D);
      return { t: 'arc', cx: c[0], cy: c[1], r: rr, a0: a0, a1: a0 + sweep };
    }
    // the major axis direction in (-90°, 90°]: a half turn of the frame is the same ellipse with u shifted by π
    while (phi > Math.PI / 2 + 1e-12) { phi -= Math.PI; u0 += Math.PI; u1 += Math.PI; }
    while (phi <= -Math.PI / 2 + 1e-12) { phi += Math.PI; u0 += Math.PI; u1 += Math.PI; }
    var rot = phi * R2D;
    if (Math.abs(rot) < 1e-10) rot = 0;
    if (full) return { t: 'ellipse', cx: c[0], cy: c[1], rx: sx, ry: ry, rot: rot };
    var e0 = normDeg(u0 * R2D);
    return { t: 'pellipse', cx: c[0], cy: c[1], rx: sx, ry: ry, rot: rot, a0: e0, a1: e0 + sweep };
  }
  function conicThrough(M, c, a1, a2, t0, t1, full) {
    return conicEntity(ap(M, c[0], c[1]), apv(M, a1[0], a1[1]), apv(M, a2[0], a2[1]), t0, t1, full);
  }
  // the arc of a polyline segment p -> q with bulge b (tan of a quarter of the sweep, > 0 counterclockwise):
  // { c, r, t0, t1 } with t0 -> t1 counterclockwise (from q to p when b < 0)
  function bulgeArc(p, q, b) {
    var dx = q[0] - p[0], dy = q[1] - p[1], ch = hyp(dx, dy);
    if (ch < 1e-15 || !b) return null;
    var r = ch * (1 + b * b) / (4 * Math.abs(b)), d = ch * (1 - b * b) / (4 * b);
    var c = [(p[0] + q[0]) / 2 - dy / ch * d, (p[1] + q[1]) / 2 + dx / ch * d];
    var sw = 4 * Math.atan(Math.abs(b)), from = b > 0 ? p : q;
    var t0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    return { c: c, r: r, t0: t0, t1: t0 + sw };
  }

  // ------------------------------------------------------------------ splines
  // de Boor: the point at u of the B-spline (degree p, control points P (2D or homogeneous [x·w, y·w, w]), knots U) in
  // knot span k (U[k] <= u <= U[k+1])
  function deBoor(P, U, p, k, u) {
    var d = [], j, r, dim = P[0].length;
    for (j = 0; j <= p; j++) d.push(P[j + k - p].slice());
    for (r = 1; r <= p; r++) {
      for (j = p; j >= r; j--) {
        var i = j + k - p, den = U[i + p - r + 1] - U[i], al = den ? (u - U[i]) / den : 0;
        for (var m = 0; m < dim; m++) d[j][m] = (1 - al) * d[j - 1][m] + al * d[j][m];
      }
    }
    return d[p];
  }
  // the cubic Bézier spans of a non-rational B-spline of degree <= 3 (each knot span's polynomial, found from four of
  // its points: exact for degree 1, 2 and 3)
  function bezSpans(P, U, p) {
    var n = P.length, lo = U[p], hi = U[n], out = [];
    for (var k = p; k < n; k++) {
      var u0 = U[k], u1 = U[k + 1];
      if (!(u1 - u0 > 1e-12 * Math.max(1e-12, Math.abs(hi - lo)))) continue;
      var Q = [0, 1 / 3, 2 / 3, 1].map(function (s) { return deBoor(P, U, p, k, u0 + (u1 - u0) * s); });
      var A = [27 * Q[1][0] - 8 * Q[0][0] - Q[3][0], 27 * Q[1][1] - 8 * Q[0][1] - Q[3][1]];
      var B = [27 * Q[2][0] - Q[0][0] - 8 * Q[3][0], 27 * Q[2][1] - Q[0][1] - 8 * Q[3][1]];
      out.push([Q[0], [(2 * A[0] - B[0]) / 18, (2 * A[1] - B[1]) / 18], [(2 * B[0] - A[0]) / 18, (2 * B[1] - A[1]) / 18], Q[3]]);
    }
    return out;
  }
  function bezAt(B, s) {
    var u = 1 - s, b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s;
    return [b0 * B[0][0] + b1 * B[1][0] + b2 * B[2][0] + b3 * B[3][0], b0 * B[0][1] + b1 * B[1][1] + b2 * B[2][1] + b3 * B[3][1]];
  }
  function bezSize(spans) {
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    spans.forEach(function (B) { B.forEach(function (q) { mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); }); });
    return hyp(mx[0] - mn[0], mx[1] - mn[1]);
  }
  // does Anvil's spline e reproduce the Bézier spans (control points within tol)?
  function sameSpans(e, spans, tol) {
    var K = Kern();
    if (!K || !K.splineGeom) return false;
    var g = K.splineGeom(e);
    if (!g || g.bez.length !== spans.length) return false;
    for (var i = 0; i < spans.length; i++) for (var j = 0; j < 4; j++) if (dist(g.bez[i][j], spans[i][j]) > tol) return false;
    return true;
  }
  // Bézier spans -> Anvil splines: one natural spline when it reproduces them (Anvil's own SPLINE export does), else
  // splines whose every point is tangent-driving (a cubic Hermite span is exact once its end derivatives are given;
  // where the two sides of a point disagree the curve is cut there), each checked against the spans
  function spansToSplines(spans, tol) {
    var out = [], i;
    spans = spans.filter(function (B) { return dist(B[0], B[3]) > 1e-12 || dist(B[0], B[1]) > 1e-12 || dist(B[0], B[2]) > 1e-12; });
    if (!spans.length) return out;
    // runs of spans joined end to end (a knot of full multiplicity can break the curve)
    var runs = [[spans[0]]];
    for (i = 1; i < spans.length; i++) { if (dist(spans[i - 1][3], spans[i][0]) > tol) runs.push([]); runs[runs.length - 1].push(spans[i]); }
    runs.forEach(function (run) {
      var pts = [run[0][0]].concat(run.map(function (B) { return B[3]; }));
      var closed = run.length >= 2 && dist(pts[0], pts[pts.length - 1]) <= tol;
      var cand = { t: 'spline', pts: (closed ? pts.slice(0, -1) : pts).map(function (q) { return [q[0], q[1]]; }) };
      if (closed) cand.closed = true;
      if (cand.pts.length >= 2 && sameSpans(cand, run, tol)) { out.push(cand); return; }
      // tangent-driving points: M = 3·(handle) / h with h the chord (Anvil's knot spacing)
      var h = run.map(function (B) { return Math.max(dist(B[0], B[3]), 1e-12); });
      function mOut(j) { var B = run[j]; return [3 * (B[1][0] - B[0][0]) / h[j], 3 * (B[1][1] - B[0][1]) / h[j]]; }
      function mIn(j) { var B = run[j]; return [3 * (B[3][0] - B[2][0]) / h[j], 3 * (B[3][1] - B[2][1]) / h[j]]; }
      function tan(m) { var w = hyp(m[0], m[1]); return [w > 1e-15 ? Math.atan2(m[1], m[0]) * R2D : 0, w]; }
      var n = run.length, groups = [[0]], joinM = [];
      for (i = 1; i <= n; i++) {
        if (i === n) break;
        var a = mIn(i - 1), b = mOut(i), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        var ok = dist([run[i][0][0] - h[i - 1] / 3 * m[0], run[i][0][1] - h[i - 1] / 3 * m[1]], run[i - 1][2]) <= tol &&
          dist([run[i][0][0] + h[i] / 3 * m[0], run[i][0][1] + h[i] / 3 * m[1]], run[i][1]) <= tol;
        joinM[i] = ok ? m : null;
        if (ok) groups[groups.length - 1].push(i); else groups.push([i]);
      }
      groups.forEach(function (gr) {
        var sp = gr.map(function (j) { return run[j]; }), P = [sp[0][0]].concat(sp.map(function (B) { return B[3]; }));
        var T = gr.map(function (j, k) { return tan(k === 0 ? mOut(j) : joinM[j]); });
        T.push(tan(mIn(gr[gr.length - 1])));
        var e = { t: 'spline', pts: P.map(function (q) { return [q[0], q[1]]; }), tans: T };
        if (sameSpans(e, sp, tol) || !Kern()) out.push(e);
        else sp.forEach(function (B) { out.push({ t: 'spline', pts: [B[0].slice(), B[3].slice()], tans: [tan([3 * (B[1][0] - B[0][0]) / Math.max(dist(B[0], B[3]), 1e-12), 3 * (B[1][1] - B[0][1]) / Math.max(dist(B[0], B[3]), 1e-12)]), tan([3 * (B[3][0] - B[2][0]) / Math.max(dist(B[0], B[3]), 1e-12), 3 * (B[3][1] - B[2][1]) / Math.max(dist(B[0], B[3]), 1e-12)])] }); });
      });
    });
    return out;
  }
  // a curve evaluated at u (u0..u1) as lines whose chords stay within tol of it
  function curveLines(evalAt, breaks, tol) {
    var pts = [];
    function rec(a, pa, b, pb, depth) {
      var m = (a + b) / 2, pm = evalAt(m), dev = 0;
      [0.25, 0.5, 0.75].forEach(function (s) {
        var q = evalAt(a + (b - a) * s), dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = hyp(dx, dy);
        dev = Math.max(dev, L > 1e-15 ? Math.abs((q[0] - pa[0]) * dy - (q[1] - pa[1]) * dx) / L : dist(q, pa));
      });
      if (dev > tol && depth < 14) { rec(a, pa, m, pm, depth + 1); rec(m, pm, b, pb, depth + 1); } else pts.push(pb);
    }
    for (var i = 0; i + 1 < breaks.length; i++) {
      var a = breaks[i], b = breaks[i + 1];
      if (!(b > a)) continue;
      var pa = evalAt(a);
      if (!pts.length) pts.push(pa);
      for (var k = 0; k < 4; k++) { var s0 = a + (b - a) * k / 4, s1 = a + (b - a) * (k + 1) / 4; rec(s0, k ? evalAt(s0) : pa, s1, evalAt(s1), 0); }
    }
    var out = [];
    for (var j = 0; j + 1 < pts.length; j++) if (dist(pts[j], pts[j + 1]) > 1e-12) out.push({ t: 'line', x1: pts[j][0], y1: pts[j][1], x2: pts[j + 1][0], y2: pts[j + 1][1] });
    return out;
  }

  // ------------------------------------------------------------------ parse
  var UNITS = { 1: ['in', 1], 2: ['in', 12], 4: ['mm', 1], 5: ['mm', 10], 6: ['mm', 1000], 8: ['in', 1e-6], 9: ['in', 1e-3], 10: ['in', 36], 13: ['mm', 1e-3], 14: ['mm', 100] };
  var UNIT_NAMES = { 2: 'feet', 5: 'centimetres', 6: 'metres', 8: 'microinches', 9: 'mils', 10: 'yards', 13: 'microns', 14: 'decimetres' };
  var TEXT_TYPES = { TEXT: 1, MTEXT: 1, ATTRIB: 1 };
  var QUIET = { VERTEX: 1, SEQEND: 1, VIEWPORT: 1 };
  // skipped without a warning, counted for the import message: a drawing's annotation, not geometry to cut
  var SKIP_QUIET = { DIMENSION: 'dimension', HATCH: 'hatch', ATTDEF: 'attribute definition' };
  // layers whose lines are not part of the outline: Anvil's own construction and bend-line layers (lane dwgin: also
  // BEND_UP / BEND_DOWN, which DXF/DWG Output's bend layers split writes, and the usual BEND LINES / BENDLINES)
  var CONSTRUCTION_LAYER = /^(CONSTRUCTION|BEND([_ -]?(UP|DOWN|LINES?))?|BENDLINES?)$/i;
  function parse(text, opts) {
    opts = opts || {};
    var P = pairs(text), sec = sections(P), warnings = [];
    if (!sec.ENTITIES && !sec.BLOCKS) {
      // a bare list of entities with no SECTION wrapper
      if (P.some(function (p) { return p[0] === 0 && /^(LINE|ARC|CIRCLE|LWPOLYLINE|POLYLINE)$/i.test(p[1]); })) sec.ENTITIES = P;
      else throw new Error('This is not a DXF file (no ENTITIES section).');
    }
    // HEADER: $INSUNITS, $MEASUREMENT
    var vars = {}, cur = null;
    (sec.HEADER || []).forEach(function (p) { if (p[0] === 9) { cur = p[1].toUpperCase(); vars[cur] = vars[cur] || {}; } else if (cur && vars[cur][p[0]] == null) vars[cur][p[0]] = p[1]; });
    var ins = vars.$INSUNITS ? parseInt(vars.$INSUNITS[70], 10) : 0, meas = vars.$MEASUREMENT ? parseInt(vars.$MEASUREMENT[70], 10) : null;
    var units = null, uscale = 1, unitsFrom = null;
    if (UNITS[ins]) { units = UNITS[ins][0]; uscale = UNITS[ins][1]; unitsFrom = 'INSUNITS'; if (uscale !== 1) warnings.push('The file is in ' + UNIT_NAMES[ins] + ': converted to ' + (units === 'in' ? 'inches' : 'millimetres') + '.'); }
    // lane dwgin: no $INSUNITS (0, unitless: what AutoCAD R14 and many DWG savers leave) but $MEASUREMENT: an assumption,
    // so it is said (the PM's File units and the message)
    else if (meas === 0 || meas === 1) {
      units = meas === 0 ? 'in' : 'mm'; unitsFrom = 'MEASUREMENT';
      warnings.push('No units in the file ($INSUNITS ' + (vars.$INSUNITS ? ins : 'not set') + '): taken as ' + (units === 'in' ? 'inches' : 'millimetres') + ' from $MEASUREMENT ' + meas + ' (' + (meas === 0 ? 'English' : 'metric') + ').');
    }
    // lane dwgin: a TEXT / MTEXT with no height (a converter that lost it) takes its style's fixed height, else $TEXTSIZE
    var textSize = vars.$TEXTSIZE ? parseFloat(vars.$TEXTSIZE[40]) : NaN, styleH = {};
    // TABLES: layer colours
    // lane dxfaudit: a layer's state too: frozen (70 & 1) or off (a negative colour); names match without case, as in
    // AutoCAD (an entity on "cut" is on layer CUT)
    var layerColor = {}, layerOrder = [], layerState = {};
    records(sec.TABLES || []).forEach(function (r) {
      if (r.type !== 'LAYER') return;
      var nm = str(r, 2, null);
      if (nm == null) return;
      if (layerColor[nm] == null) layerOrder.push(nm);
      var c62 = num(r, 62, 7);
      layerColor[nm] = Math.abs(c62);
      layerState[nm.toUpperCase()] = { frozen: (num(r, 70, 0) & 1) === 1, off: c62 < 0 };
    });
    records(sec.TABLES || []).forEach(function (r) { if (r.type === 'STYLE' && num(r, 40, 0) > 0) styleH[String(str(r, 2, '')).toUpperCase()] = num(r, 40, 0); });
    // BLOCKS
    var blocks = {}, blk = null;
    records(sec.BLOCKS || []).forEach(function (r) {
      if (r.type === 'BLOCK') { blk = { name: str(r, 2, ''), base: [num(r, 10, 0), num(r, 20, 0)], ents: [] }; blocks[blk.name.toUpperCase()] = blk; return; }
      if (r.type === 'ENDBLK') { blk = null; return; }
      if (blk) blk.ents.push(r);
    });
    var ctx = { out: [], skipped: {}, quiet: {}, text: 0, paper: 0, tilted: 0, offZ: 0, zoff: 0, zeroScale: 0, textSize: textSize > 0 ? textSize : 0, styleH: styleH, splineLines: 0, splineFit: 0, missing: {}, deep: 0, badSpline: 0, mesh: 0,
      blocks: !!opts.blocks && !!(Kern() && Kern().blockEntity), blkPrefix: opts.idPrefix != null ? String(opts.idPrefix) : 'x' + (++parseCount).toString(36) + Date.now().toString(36).slice(-5) + '_', nBlk: 0, blkDefs: {},
      curveTol: opts.curveTol || (units === 'in' ? 1e-4 : units === 'mm' ? 2.5e-3 : 0) };
    var top = records(sec.ENTITIES || []);
    top.forEach(function (r) {
      if (num(r, 67, 0) === 1) { if (!QUIET[r.type]) ctx.paper++; return; }
      emit(r, ID, null, 0, ctx, blocks);
    });
    var out = ctx.out;
    if (uscale !== 1) out = transform(out, { s: uscale });
    // layers: the ones that hold geometry, in table order then in order of appearance
    var counts = {};
    out.forEach(function (e) {
      if (counts[e.layer] == null) { counts[e.layer] = 0; if (layerOrder.indexOf(e.layer) < 0) layerOrder.push(e.layer); }
      counts[e.layer]++;
      if (CONSTRUCTION_LAYER.test(e.layer) && e.t !== 'point') e.construction = true;
    });
    var layers = layerOrder.filter(function (n) { return counts[n]; }).map(function (n) {
      var L = { name: n, color: layerColor[n] == null ? 7 : layerColor[n], count: counts[n] }, st = layerState[String(n).toUpperCase()];
      if (st && st.frozen) L.frozen = true;
      if (st && st.off) L.off = true;
      return L;
    });
    var hid = layers.filter(function (l) { return l.frozen || l.off; });
    if (hid.length) warnings.push('Layer' + (hid.length === 1 ? ' ' : 's ') + hid.map(function (l) { return l.name + ' (' + (l.frozen ? 'frozen' : 'off') + ')'; }).join(', ') + (hid.length === 1 ? ' is' : ' are') + ' not shown in the file: left out unless turned on.');
    if (ctx.text) warnings.push('Skipped ' + ctx.text + ' text entit' + (ctx.text === 1 ? 'y' : 'ies') + ' (empty, or with no height).');
    var sk = Object.keys(ctx.skipped);
    if (sk.length) warnings.push('Skipped ' + sk.map(function (k) { return ctx.skipped[k] + ' ' + k; }).join(', ') + '.');
    if (ctx.paper) warnings.push('Skipped ' + ctx.paper + ' entit' + (ctx.paper === 1 ? 'y' : 'ies') + ' in paper space (only model space is imported).');
    if (ctx.tilted) warnings.push(ctx.tilted + ' entit' + (ctx.tilted === 1 ? 'y is' : 'ies are') + ' not parallel to the XY plane (3D): projected onto it.');
    if (ctx.offZ) warnings.push(ctx.offZ + ' entit' + (ctx.offZ === 1 ? 'y lies' : 'ies lie') + ' off z = 0 (3D, at another elevation): placed on the sketch plane.');
    if (ctx.zeroScale) warnings.push(ctx.zeroScale + ' block insertion' + (ctx.zeroScale === 1 ? '' : 's') + ' with a scale of 0 (not valid in AutoCAD): read as the other scale.');
    if (ctx.splineLines) warnings.push(ctx.splineLines + ' spline' + (ctx.splineLines === 1 ? '' : 's') + ' (rational or above degree 3) converted to lines within ' + fmtN(ctx.curveTol || 1e-4) + '.');
    if (ctx.splineFit) warnings.push(ctx.splineFit + ' spline' + (ctx.splineFit === 1 ? '' : 's') + ' given by fit points only: drawn through them.');
    if (ctx.badSpline) warnings.push(ctx.badSpline + ' spline' + (ctx.badSpline === 1 ? '' : 's') + ' with inconsistent knots skipped.');
    if (ctx.mesh) warnings.push('Skipped ' + ctx.mesh + ' polyface / mesh polyline' + (ctx.mesh === 1 ? '' : 's') + '.');
    var miss = Object.keys(ctx.missing);
    if (miss.length) warnings.push('Missing block' + (miss.length === 1 ? '' : 's') + ': ' + miss.join(', ') + '.');
    if (ctx.deep) warnings.push('Blocks nested deeper than 16 levels were not exploded.');
    // the quiet ones, for the import message: "2 dimensions and 1 hatch skipped"
    var qk = Object.keys(SKIP_QUIET).filter(function (k) { return ctx.quiet[k]; }), parts = qk.map(function (k) { return ctx.quiet[k] + ' ' + SKIP_QUIET[k] + (ctx.quiet[k] === 1 ? '' : (SKIP_QUIET[k] === 'hatch' ? 'es' : 's')); });
    var note = parts.length ? (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + ' skipped' : '';
    var nText = out.filter(function (e) { return e.t === 'text'; }).length;
    return { units: units, unitsFrom: unitsFrom, layers: layers, entities: out, warnings: warnings, skipped: ctx.quiet, skippedNote: note, texts: nText, tilted: ctx.tilted, offZ: ctx.offZ };
  }
  // ------------------------------------------------------------------ text (TEXT, MTEXT, ATTRIB -> Sketch Text)
  // DXF text to plain characters: %%c %%d %%p (Ø ° ±), %%% (%), %%nnn (a character code), \U+xxxx; %%u / %%o (underline
  // / overline toggles) dropped
  function plainDxfText(s) {
    return String(s == null ? '' : s).replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/%%([cCdDpP%]|[uUoOkK]|\d{3})/g, function (m, c) {
        var u = c.toUpperCase();
        if (u === 'C') return 'Ø';
        if (u === 'D') return '°';
        if (u === 'P') return '±';
        if (u === '%') return '%';
        if (/^\d{3}$/.test(c)) return String.fromCharCode(parseInt(c, 10));
        return '';
      });
  }
  // MTEXT's string (its 3 chunks, then 1) without the formatting codes: \P (new paragraph) a new line, \~ a space,
  // \S a^b; / a/b; a stacked fraction a/b, the font / height / colour / width / tracking … codes and the braces gone
  function mtextString(r) {
    var s = '';
    r.g.forEach(function (p) { if (p[0] === 3) s += p[1]; });
    r.g.forEach(function (p) { if (p[0] === 1) s += p[1]; });
    s = s.replace(/\\\\/g, '\u0001').replace(/\\\{/g, '\u0002').replace(/\\\}/g, '\u0003');
    s = s.replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ').replace(/\\S([^;]*);/g, function (m, f) { return f.replace(/[\^#]/g, '/'); })
      .replace(/\\[ACcFfHhQqTtWwp][^;\\]*;/g, '').replace(/\\[LlOoKkNX]/g, '').replace(/[{}]/g, '');
    return plainDxfText(s.replace(/\u0001/g, '\\').replace(/\u0002/g, '{').replace(/\u0003/g, '}'));
  }
  // textEntity(r, M) -> a Sketch Text entity { t: 'text', x, y, str, h, rot, align, valign, widthFactor, lineSpacing,
  // mirror, flipV } for a TEXT / ATTRIB / MTEXT record through the map M, or null (empty, no height). TEXT: the first
  // alignment point (10) when left / baseline, else the second (11) with the justification 72 (0 left, 1 center, 2
  // right, 3 aligned, 4 middle, 5 fit) and 73 (74 for ATTRIB: 0 baseline, 1 bottom, 2 middle, 3 top; bottom is taken
  // as the baseline), rotation 50 (degrees), width factor 41, generation flags 71 (2 mirrored in X, 4 upside down);
  // Aligned / Fit run the text from the first point to the second (Fit by its width factor, Aligned by its height).
  // MTEXT: insertion point 10, attachment point 71 (1–9: top / middle / bottom × left / centre / right; bottom puts the
  // last line's baseline on the point), its direction 11 / 21 (else rotation 50, radians), line spacing factor 44
  // (× 5/3 of the height, AutoCAD's single spacing).
  function textEntity(r, M, ctx) {
    var mt = r.type === 'MTEXT', s = mt ? mtextString(r) : plainDxfText(str(r, 1, '')), h = num(r, 40, 0);
    if (!(h > 0) && ctx) h = ctx.styleH[String(str(r, 7, 'STANDARD')).toUpperCase()] || ctx.textSize;   // lane dwgin
    s = s.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (!s.replace(/\s+/g, '') || !(h > 0)) return null;
    var p, rot, wf = num(r, 41, 1) > 0 && !mt ? num(r, 41, 1) : 1, align = 'left', valign = 'baseline', mir = false, up = false, ls = null, Mt = M;
    if (mt) {
      var at = Math.max(1, Math.min(9, num(r, 71, 1) | 0)), col = (at - 1) % 3, row = Math.floor((at - 1) / 3);
      align = ['left', 'center', 'right'][col]; valign = ['top', 'middle', 'baseline'][row];
      p = [num(r, 10, 0), num(r, 20, 0)];
      var xd = [num(r, 11, 0), num(r, 21, 0)];
      rot = xd[0] || xd[1] ? Math.atan2(xd[1], xd[0]) : num(r, 50, 0);
      ls = 5 / 3 * (num(r, 44, 1) > 0 ? num(r, 44, 1) : 1);
      var nl = s.split('\n').length;
      if (row === 2 && nl > 1) { var sh = (nl - 1) * ls * h; p = [p[0] - Math.sin(rot) * sh, p[1] + Math.cos(rot) * sh]; }
      if (row === 1 && nl > 1) valign = 'middle';
    } else {
      Mt = mul(M, ocs(r, num(r, 30, 0), ctx));
      var hj = num(r, 72, 0) | 0, vj = num(r, r.type === 'ATTRIB' ? 74 : 73, 0) | 0, gen = num(r, 71, 0) | 0;
      var p1 = [num(r, 10, 0), num(r, 20, 0)], p2 = [num(r, 11, NaN), num(r, 21, NaN)], has2 = isFinite(p2[0]) && isFinite(p2[1]);
      rot = num(r, 50, 0) * D2R;
      mir = !!(gen & 2); up = !!(gen & 4);
      if ((hj === 3 || hj === 5) && has2 && dist(p1, p2) > 1e-12) {
        p = p1; rot = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
        var Sf = typeof SketchFont !== 'undefined' ? SketchFont : null, w0 = Sf ? Sf.layout(s.split('\n')[0], { height: h, widthFactor: wf }).width : 0;
        if (w0 > 0) { var kf = dist(p1, p2) / w0; if (hj === 5) wf *= kf; else h *= kf; }
      } else if (hj === 0 && vj === 0) p = p1;
      else {
        p = has2 ? p2 : p1;
        align = hj === 1 || hj === 4 ? 'center' : hj === 2 ? 'right' : 'left';
        valign = hj === 4 || vj === 2 ? 'middle' : vj === 3 ? 'top' : 'baseline';
      }
    }
    // through the map: the point, the direction of the baseline and of "up" (their lengths scale the width and height)
    var P = ap(Mt, p[0], p[1]), dx = apv(Mt, Math.cos(rot), Math.sin(rot)), dy = apv(Mt, -Math.sin(rot), Math.cos(rot));
    var lx = hyp(dx[0], dx[1]), ly = hyp(dy[0], dy[1]);
    if (!(lx > 0) || !(ly > 0)) return null;
    if (dx[0] * dy[1] - dx[1] * dy[0] < 0) mir = !mir;   // a mirrored insertion mirrors the letters
    var e = { t: 'text', x: P[0], y: P[1], str: s, h: h * ly };
    var deg = normDeg(Math.round(Math.atan2(dx[1], dx[0]) * R2D * 1e9) / 1e9);   // (a 30° rotation stays 30, not 29.999999999999993)
    if (deg > 1e-9) e.rot = deg;
    if (align !== 'left') e.align = align;
    if (valign !== 'baseline') e.valign = valign;
    var wfx = wf * lx / ly;
    if (Math.abs(wfx - 1) > 1e-9) e.widthFactor = wfx;
    if (ls != null && Math.abs(ls - 1.6) > 1e-9) e.lineSpacing = ls;
    if (mir) e.mirror = true;
    if (up) e.flipV = true;
    return e;
  }
  // one record into ctx.out, through the map M (block insertions); layer: the INSERT's layer for entities on layer 0
  function emit(r, M, insLayer, depth, ctx, blocks) {
    var layer = str(r, 8, '0');
    if (insLayer != null && layer === '0') layer = insLayer;
    function add(e) { if (!e) return; e.layer = layer; ctx.out.push(e); }
    function line(p, q) { add({ t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }); }
    // lane dwgin: 3D. The z values of one record (world z, or the elevation of an entity in its OCS): different ones
    // make it tilted (projected: ctx.tilted), one value off 0 (with the INSERTs' z it sits in) an elevated one (ctx.offZ)
    function zs(codes) {
      var lo = Infinity, hi = -Infinity;
      r.g.forEach(function (p) { if (codes.indexOf(p[0]) >= 0) { var z = parseFloat(p[1]) || 0; if (z < lo) lo = z; if (z > hi) hi = z; } });
      if (!(hi >= lo)) lo = hi = 0;
      var tol = 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi));
      if (hi - lo > tol) ctx.tilted++;
      else if (Math.abs(lo + ctx.zoff) > tol) ctx.offZ++;
    }
    switch (r.type) {
      case 'LINE': {
        zs([30, 31]);
        line(ap(M, num(r, 10, 0), num(r, 20, 0)), ap(M, num(r, 11, 0), num(r, 21, 0)));
        return;
      }
      case 'POINT': { zs([30]); var pt = ap(M, num(r, 10, 0), num(r, 20, 0)); add({ t: 'point', x: pt[0], y: pt[1] }); return; }
      case 'CIRCLE': case 'ARC': {
        zs([30]);
        var Mo = mul(M, ocs(r, num(r, 30, 0), ctx)), rad = num(r, 40, 0);
        if (!(rad > 0)) return;
        if (r.type === 'CIRCLE') { add(conicThrough(Mo, [num(r, 10, 0), num(r, 20, 0)], [rad, 0], [0, rad], 0, TAU, true)); return; }
        var t0 = num(r, 50, 0) * D2R, t1 = num(r, 51, 360) * D2R;
        while (t1 <= t0) t1 += TAU;
        add(conicThrough(Mo, [num(r, 10, 0), num(r, 20, 0)], [rad, 0], [0, rad], t0, t1, t1 - t0 >= TAU - 1e-12));
        return;
      }
      case 'ELLIPSE': {
        var N = normalOf(r), maj = [num(r, 11, 0), num(r, 21, 0), num(r, 31, 0)], ratio = num(r, 40, 1), mn = cross3(N, maj);
        var p0 = num(r, 41, 0), p1 = num(r, 42, TAU);
        while (p1 <= p0) p1 += TAU;
        if (Math.abs(N[2]) < 1 - 1e-9) ctx.tilted++;
        else zs([30]);
        add(conicThrough(M, [num(r, 10, 0), num(r, 20, 0)], [maj[0], maj[1]], [ratio * mn[0], ratio * mn[1]], p0, p1, p1 - p0 >= TAU - 1e-9));
        return;
      }
      case 'LWPOLYLINE': {
        var verts = [], v = null;
        r.g.forEach(function (p) {
          if (p[0] === 10) { v = { x: parseFloat(p[1]) || 0, y: 0, b: 0 }; verts.push(v); }
          else if (v && p[0] === 20) v.y = parseFloat(p[1]) || 0;
          else if (v && p[0] === 42) v.b = parseFloat(p[1]) || 0;
        });
        zs([38]);
        poly(verts, (num(r, 70, 0) & 1) === 1, mul(M, ocs(r, num(r, 38, 0), ctx)));
        return;
      }
      case 'POLYLINE': {
        var fl = num(r, 70, 0);
        if (fl & (16 | 64)) { ctx.mesh++; return; }
        var three = (fl & 8) === 8, Mp = three ? M : mul(M, ocs(r, num(r, 30, 0), ctx));
        var vs0 = (r.verts || []).filter(function (x) { return !(num(x, 70, 0) & 16); });
        if (three) { var rg = r.g; r.g = [].concat.apply([], vs0.map(function (x) { return x.g; })); zs([30]); r.g = rg; } else zs([30]);
        var vs = vs0.map(function (x) { return { x: num(x, 10, 0), y: num(x, 20, 0), b: three ? 0 : num(x, 42, 0) }; });
        poly(vs, (fl & 1) === 1, Mp);
        return;
      }
      case 'SPLINE': { zs([30, 31]); spline(r); return; }
      case 'INSERT': {
        var b = blocks[str(r, 2, '').toUpperCase()];
        if (!b) { ctx.missing[str(r, 2, '?')] = 1; return; }
        if (depth >= 16) { ctx.deep++; return; }
        if (ctx.blocks && depth === 0 && M === ID && blockInstance(r, b, layer, ctx, blocks)) { zs([30]); return; }   // rfAU
        var sc = insScale(r, ctx), Mo2 = mul(M, ocs(r, num(r, 30, 0), ctx)), sx = sc[0], sy = sc[1], rot = num(r, 50, 0) * D2R;
        var zo = ctx.zoff, N2 = normalOf(r);
        if (Math.abs(N2[2]) > 1 - 1e-9) ctx.zoff = zo + N2[2] * num(r, 30, 0);
        var cols = Math.max(1, num(r, 70, 1) | 0), rows = Math.max(1, num(r, 71, 1) | 0), csp = num(r, 44, 0), rsp = num(r, 45, 0);
        var cs = Math.cos(rot), sn = Math.sin(rot);
        for (var ci = 0; ci < cols; ci++) for (var ri = 0; ri < rows; ri++) {
          // insertion · rotation · array offset · scale · (− base point)
          var Mb = mul(Mo2, mul([cs, sn, -sn, cs, num(r, 10, 0), num(r, 20, 0)], mul([1, 0, 0, 1, ci * csp, ri * rsp], [sx, 0, 0, sy, -sx * b.base[0], -sy * b.base[1]])));
          b.ents.forEach(function (be) { if (num(be, 67, 0) !== 1) emit(be, Mb, layer, depth + 1, ctx, blocks); });
        }
        ctx.zoff = zo;
        // its attributes (part numbers, revisions …) stand where the INSERT puts them already: through M only
        (r.attribs || []).forEach(function (at) { if (!(num(at, 70, 0) & 1)) emit(at, M, layer, depth, ctx, blocks); });
        return;
      }
    }
    // (an ATTRIB left empty, a title block's unfilled field, is no loss: not counted)
    if (TEXT_TYPES[r.type]) { var te = textEntity(r, M, ctx); if (te) add(te); else if (r.type !== 'ATTRIB' || /\S/.test(str(r, 1, ''))) ctx.text++; return; }
    if (SKIP_QUIET[r.type]) { ctx.quiet[r.type] = (ctx.quiet[r.type] || 0) + 1; return; }
    if (!QUIET[r.type]) ctx.skipped[r.type] = (ctx.skipped[r.type] || 0) + 1;

    function poly(vs, closed, Mp) {
      var n = vs.length;
      if (n < 2) return;
      for (var i = 0; i < (closed ? n : n - 1); i++) {
        var a = vs[i], c = vs[(i + 1) % n];
        if (Math.abs(a.x - c.x) < 1e-15 && Math.abs(a.y - c.y) < 1e-15) continue;   // a repeated vertex
        var arc = Math.abs(a.b) > 1e-12 ? bulgeArc([a.x, a.y], [c.x, c.y], a.b) : null;
        if (arc) add(conicThrough(Mp, arc.c, [arc.r, 0], [0, arc.r], arc.t0, arc.t1, false));
        else line(ap(Mp, a.x, a.y), ap(Mp, c.x, c.y));
      }
    }
    function spline(rr) {
      var deg = num(rr, 71, 3) | 0, flags = num(rr, 70, 0), U = [], W = [], C = [], F = [], st = null, en = null, last = null;
      rr.g.forEach(function (p) {
        var c = p[0], v = parseFloat(p[1]);
        if (c === 40) U.push(v);
        else if (c === 41) W.push(v);
        else if (c === 10) { last = [v, 0]; C.push(last); }
        else if (c === 20 && last) last[1] = v;
        else if (c === 11) { last = [v, 0]; F.push(last); }
        else if (c === 21 && last) last[1] = v;
        else if (c === 12) { st = [v, 0]; last = st; }
        else if (c === 22 && st) st[1] = v;
        else if (c === 13) { en = [v, 0]; last = en; }
        else if (c === 23 && en) en[1] = v;
      });
      var good = deg >= 1 && C.length >= deg + 1 && U.length === C.length + deg + 1;
      for (var k = 1; good && k < U.length; k++) if (U[k] < U[k - 1]) good = false;
      var Cw = C.map(function (q) { return ap(M, q[0], q[1]); });
      var rational = W.length === C.length && W.some(function (w) { return Math.abs(w - W[0]) > 1e-12 * Math.abs(W[0]); });
      if (good && deg <= 3 && !rational) {
        var spans = bezSpans(Cw, U, deg), size = bezSize(spans), tol = 1e-6 * Math.max(1, size) + 2e-6;
        var Kb = Kern(), bezier = true, inner = U.slice(deg + 1, C.length), km = 0;
        for (var kq = 0; kq < inner.length; kq++) { km++; if (kq + 1 === inner.length || inner[kq + 1] !== inner[kq]) { if (km % deg) bezier = false; km = 0; } }
        var asSpl = bezier ? spansToSplines(spans, tol) : null;
        // lane fitspline: a true B-spline (an interior knot of multiplicity below the degree: not the Bézier spans
        // Anvil writes a through-points spline as) comes in as ONE B-spline entity, its knots and control points
        // clamped (SolidWorks reads a DXF spline as one spline); so does Bézier spans no spline of Anvil's reproduces
        if (deg >= 2 && Kb && Kb.bsPieces && (!bezier || !(asSpl.length === 1 && !asSpl[0].tans))) {
          var pcs = Kb.bsPieces(U, Cw, deg);
          pcs.forEach(function (pc, z) { if (z) pc.mult = Math.min(3, pc.mult + 3 - deg); });
          var bs = pcs.length ? Kb.bsFromPieces(pcs) : null;
          if (bs) {
            var be = { t: 'spline', style: true, deg: 3, knots: bs.knots, pts: bs.pts }, nb = bs.pts.length;
            if (nb > 4 && dist(bs.pts[0], bs.pts[nb - 1]) <= tol) { be.closed = true; be.pts[nb - 1] = be.pts[0].slice(); }
            add(be);
            return;
          }
        }
        asSpl.forEach(add);
        return;
      }
      if (good) {
        // rational or higher degree: lines along the curve
        var H = Cw.map(function (q, i) { var w = rational ? W[i] : 1; return [q[0] * w, q[1] * w, w]; }), n = C.length;
        var size2 = 0;
        Cw.forEach(function (q) { size2 = Math.max(size2, dist(q, Cw[0])); });
        var tolL = ctx.curveTol || 1e-4 * Math.max(1, size2);
        var spanOf = function (u) { var k2 = deg; while (k2 < n - 1 && u >= U[k2 + 1]) k2++; return k2; };
        var breaks = [];
        for (var bi = deg; bi <= n; bi++) if (!breaks.length || U[bi] > breaks[breaks.length - 1]) breaks.push(U[bi]);
        var evalAt = function (u) { var k3 = spanOf(Math.min(u, U[n] - 1e-15 * Math.max(1, Math.abs(U[n])))); var h = deBoor(H, U, deg, k3, u); return [h[0] / h[2], h[1] / h[2]]; };
        curveLines(evalAt, breaks, tolL).forEach(add);
        ctx.splineLines++;
        return;
      }
      if (F.length >= 2) {
        var Fw = F.map(function (q) { return ap(M, q[0], q[1]); }), closed = (flags & 1) === 1 && Fw.length >= 3;
        if (closed && dist(Fw[0], Fw[Fw.length - 1]) < 1e-9 * Math.max(1, bezSize([Fw]))) Fw.pop();
        var e = { t: 'spline', pts: Fw };
        if (closed) e.closed = true;
        if (!closed && (st || en)) {
          e.tans = Fw.map(function () { return null; });
          if (st) { var sv = apv(M, st[0], st[1]); e.tans[0] = [Math.atan2(sv[1], sv[0]) * R2D, 1]; }
          if (en) { var ev = apv(M, en[0], en[1]); e.tans[Fw.length - 1] = [Math.atan2(ev[1], ev[0]) * R2D, 1]; }
        }
        add(e);
        ctx.splineFit++;
        return;
      }
      ctx.badSpline++;
    }
  }

  // ------------------------------------------------------------------ rfAU: INSERT as a block instance
  var parseCount = 0;
  var BLK_TYPES = { line: 1, arc: 1, circle: 1, spline: 1, ellipse: 1, pellipse: 1, point: 1, text: 1, polyline: 1 };
  // the block's entities in block coordinates (base point at 0, 0), those on layer 0 marked (layer null: they take the
  // INSERT's layer), or null when it holds nothing Anvil can place as a block
  function blockDef(b, ctx, blocks) {
    var key = b.name.toUpperCase();
    if (ctx.blkDefs[key] !== undefined) return ctx.blkDefs[key];
    var keep = ctx.out, mark = '\u0000blk0';
    ctx.out = [];
    b.ents.forEach(function (be) { if (num(be, 67, 0) !== 1) emit(be, [1, 0, 0, 1, -b.base[0], -b.base[1]], mark, 1, ctx, blocks); });
    var ents = ctx.out;
    ctx.out = keep;
    ents.forEach(function (e) { if (e.layer === mark) e.layer = null; });
    var ok = ents.length && ents.every(function (e) { return BLK_TYPES[e.t]; });
    return (ctx.blkDefs[key] = ok ? ents : null);
  }
  // lane dwgin: an INSERT's X / Y scale; AutoCAD never writes 0, a converter can (LibreDWG's DWG writer gives a mirrored
  // insertion a Y scale of 0), which would flatten the block into zero-length lines: 0 takes the other one's size
  function insScale(r, ctx) {
    var sx = num(r, 41, 1), sy = num(r, 42, 1);
    if (sx === 0 || sy === 0) { ctx.zeroScale++; if (sx === 0 && sy === 0) sx = sy = 1; else if (sx === 0) sx = Math.abs(sy); else sy = Math.abs(sx); }
    return [sx, sy];
  }
  // an INSERT (r, of block b, on layer) as block instances into ctx.out; false when it has to be exploded
  function blockInstance(r, b, layer, ctx, blocks) {
    var N = normalOf(r), sc = insScale({ g: r.g }, { zeroScale: 0 }), sx = sc[0], sy = sc[1];
    if (Math.abs(N[0]) > 1e-12 || Math.abs(N[1]) > 1e-12 || !(N[2] > 0)) return false;
    if (!(sx > 0) || Math.abs(sx - sy) > 1e-12 * sx) return false;
    var def = blockDef(b, ctx, blocks), K = Kern();
    if (!def) return false;
    var rotDeg = num(r, 50, 0), rot = rotDeg * D2R, cs = Math.cos(rot), sn = Math.sin(rot), ix = num(r, 10, 0), iy = num(r, 20, 0);
    var cols = Math.max(1, num(r, 70, 1) | 0), rows = Math.max(1, num(r, 71, 1) | 0), csp = num(r, 44, 0), rsp = num(r, 45, 0);
    var ang = normDeg(Math.round(rotDeg * 1e9) / 1e9);
    for (var ci = 0; ci < cols; ci++) for (var ri = 0; ri < rows; ri++) {
      var ox = ci * csp, oy = ri * rsp, P = [ix + cs * ox - sn * oy, iy + sn * ox + cs * oy];
      var m = K.blockXf(P, ang, sx), id = ctx.blkPrefix + (++ctx.nBlk);
      def.forEach(function (e) {
        var w = K.blockEntity(e, m);
        if (!w) return;
        w.layer = e.layer == null ? layer : e.layer;
        w.blk = id;
        ctx.out.push(w);
      });
      ctx.out.push({ t: 'point', x: P[0], y: P[1], blk: id, blkDef: b.name, blkAng: ang, blkS: sx, layer: layer });
    }
    // its attributes (part numbers, revisions …) stand where the INSERT puts them already
    (r.attribs || []).forEach(function (at) { if (!(num(at, 70, 0) & 1)) emit(at, ID, layer, 0, ctx, blocks); });
    return true;
  }

  // ------------------------------------------------------------------ transforms
  // transform(entities, { s, rot (degrees), dx, dy }) -> new entities: p' = R(rot)·(s·p) + (dx, dy) (uniform scale,
  // rotation, move). Splines keep their tangent weights (they are per unit of chord length).
  function transform(entities, o) {
    var s = o.s == null ? 1 : +o.s, rot = +o.rot || 0, cs = Math.cos(rot * D2R), sn = Math.sin(rot * D2R), dx = +o.dx || 0, dy = +o.dy || 0;
    function P(x, y) { x *= s; y *= s; return [cs * x - sn * y + dx, sn * x + cs * y + dy]; }
    return entities.map(function (e0) {
      var e = clone(e0), q;
      switch (e.t) {
        case 'line': q = P(e.x1, e.y1); e.x1 = q[0]; e.y1 = q[1]; q = P(e.x2, e.y2); e.x2 = q[0]; e.y2 = q[1]; break;
        case 'point': q = P(e.x, e.y); e.x = q[0]; e.y = q[1];
          if (e.blkDef != null) { e.blkAng = normDeg((+e.blkAng || 0) + rot); e.blkS = (e.blkS != null ? +e.blkS : 1) * Math.abs(s); }   // rfAU: a block instance turns and scales with it
          break;
        case 'circle': case 'arc': case 'ellipse': case 'pellipse':
          q = P(e.cx, e.cy); e.cx = q[0]; e.cy = q[1];
          if (e.r != null) e.r *= Math.abs(s);
          if (e.rx != null) { e.rx *= Math.abs(s); e.ry *= Math.abs(s); e.rot = (+e.rot || 0) + rot; }
          if (e.t === 'arc') { var sw = e.a1 - e.a0; e.a0 = normDeg(e.a0 + rot); e.a1 = e.a0 + sw; }
          break;
        case 'spline': case 'polyline':
          e.pts = e.pts.map(function (p) { return P(p[0], p[1]); });
          if (e.tans) e.tans = e.tans.map(function (t) { return t ? [(+t[0] || 0) + rot, t[1]] : t; });
          break;
        case 'text':   // its insertion point moves, its height scales, it turns
          q = P(e.x, e.y); e.x = q[0]; e.y = q[1]; e.h *= Math.abs(s);
          if (rot) { e.rot = normDeg((+e.rot || 0) + rot); if (!e.rot) delete e.rot; }
          break;
      }
      return e;
    });
  }
  // [minX, minY, maxX, maxY] of entities (arcs and circles exactly, free curves from their tessellation), or null
  function bounds(entities) {
    var b = [Infinity, Infinity, -Infinity, -Infinity], K = Kern();
    function g(x, y) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    entities.forEach(function (e) {
      switch (e.t) {
        case 'line': g(e.x1, e.y1); g(e.x2, e.y2); return;
        case 'point': g(e.x, e.y); return;
        case 'circle': g(e.cx - e.r, e.cy - e.r); g(e.cx + e.r, e.cy + e.r); return;
        case 'arc': {
          var p1 = arcPt(e, e.a0), p2 = arcPt(e, e.a1);
          g(p1[0], p1[1]); g(p2[0], p2[1]);
          for (var q = Math.ceil(e.a0 / 90) * 90; q < e.a1; q += 90) { var pq = arcPt(e, q); g(pq[0], pq[1]); }
          return;
        }
      }
      if (K && K.entityPolylines) K.entityPolylines(e).forEach(function (pl) { pl.pts.forEach(function (p) { g(p[0], p[1]); }); });
      else if (e.pts) e.pts.forEach(function (p) { g(p[0], p[1]); });
    });
    return isFinite(b[0]) ? b : null;
  }

  // ------------------------------------------------------------------ entity geometry for check / repair
  function arcPt(e, deg) { return [e.cx + e.r * Math.cos(deg * D2R), e.cy + e.r * Math.sin(deg * D2R)]; }
  function ellPt(e, deg) {
    var r = (+e.rot || 0) * D2R, u = deg * D2R, x = e.rx * Math.cos(u), y = e.ry * Math.sin(u);
    return [e.cx + Math.cos(r) * x - Math.sin(r) * y, e.cy + Math.sin(r) * x + Math.cos(r) * y];
  }
  // the free ends of an open entity: [{ k: 1 | 2, p, rigid? }] (a partial ellipse's ends cannot be moved exactly)
  function ends(e) {
    switch (e.t) {
      case 'line': return [{ k: 1, p: [e.x1, e.y1] }, { k: 2, p: [e.x2, e.y2] }];
      case 'arc': return [{ k: 1, p: arcPt(e, e.a0) }, { k: 2, p: arcPt(e, e.a1) }];
      case 'pellipse': return [{ k: 1, p: ellPt(e, e.a0), rigid: true }, { k: 2, p: ellPt(e, e.a1), rigid: true }];
      case 'spline': case 'polyline':
        if (e.closed || !e.pts || e.pts.length < 2) return [];
        return [{ k: 1, p: e.pts[0].slice() }, { k: 2, p: e.pts[e.pts.length - 1].slice() }];
    }
    return [];
  }
  function geomEntity(e) { return !!e && !e.construction && e.t !== 'point' && e.t !== 'text'; }   // (text is marking: no ends, never repaired)
  function entLength(e) {
    switch (e.t) {
      case 'line': return hyp(e.x2 - e.x1, e.y2 - e.y1);
      case 'arc': return e.r * Math.abs(e.a1 - e.a0) * D2R;
      case 'circle': return TAU * e.r;
    }
    var K = Kern(), L = 0;
    var pls = K && K.entityPolylines ? K.entityPolylines(e) : (e.pts ? [{ pts: e.pts, closed: !!e.closed }] : []);
    pls.forEach(function (pl) { var p = pl.pts; for (var i = 0; i + 1 < p.length; i++) L += dist(p[i], p[i + 1]); if (pl.closed && p.length > 2) L += dist(p[p.length - 1], p[0]); });
    return L;
  }
  // three points -> the arc from p1 through pm to p2 ({ cx, cy, r, a0, a1 }, counterclockwise from p1), null when
  // they are in line or the arc would run the other way
  function arc3(p1, pm, p2) {
    var ax = pm[0] - p1[0], ay = pm[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], cr = ax * by - ay * bx;
    if (Math.abs(cr) < 1e-14 * (ax * ax + ay * ay + bx * bx + by * by)) return null;
    var a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, ux = (by * a2 - ay * b2) / (2 * cr), uy = (ax * b2 - bx * a2) / (2 * cr);
    var c = [p1[0] + ux, p1[1] + uy], r = hyp(ux, uy);
    var A1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]) * R2D, A2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]) * R2D, Am = Math.atan2(pm[1] - c[1], pm[0] - c[0]) * R2D;
    var s = ((A2 - A1) % 360 + 360) % 360, sm = ((Am - A1) % 360 + 360) % 360;
    if (sm > s) return null;
    var a0 = normDeg(A1);
    return { cx: c[0], cy: c[1], r: r, a0: a0, a1: a0 + s };
  }
  // move end k of e to p (exactly: an arc is redrawn through its new ends and its middle)
  function setEnd(e, k, p) {
    switch (e.t) {
      case 'line': if (k === 1) { e.x1 = p[0]; e.y1 = p[1]; } else { e.x2 = p[0]; e.y2 = p[1]; } return true;
      case 'spline': case 'polyline': e.pts[k === 1 ? 0 : e.pts.length - 1] = [p[0], p[1]]; return true;
      case 'arc': {
        var p1 = k === 1 ? p : arcPt(e, e.a0), p2 = k === 2 ? p : arcPt(e, e.a1), a = arc3(p1, arcPt(e, (e.a0 + e.a1) / 2), p2);
        if (!a) return false;
        e.cx = a.cx; e.cy = a.cy; e.r = a.r; e.a0 = a.a0; e.a1 = a.a1;
        return true;
      }
    }
    return false;
  }
  function scaleOf(entities) { var b = bounds(entities.filter(geomEntity)); return b ? Math.max(1, hyp(b[2] - b[0], b[3] - b[1])) : 1; }
  // a spatial hash of points (cell size h): near(p, r) -> the indices within r of p
  function PointGrid(h) { this.h = h > 0 ? h : 1; this.cells = {}; this.pts = []; }
  PointGrid.prototype.add = function (p, id) {
    var k = Math.floor(p[0] / this.h) + ',' + Math.floor(p[1] / this.h);
    (this.cells[k] = this.cells[k] || []).push(this.pts.length);
    this.pts.push({ p: p, id: id });
  };
  PointGrid.prototype.near = function (p, r) {
    var out = [], gx = Math.floor(p[0] / this.h), gy = Math.floor(p[1] / this.h), n = Math.max(1, Math.ceil(r / this.h));
    for (var i = gx - n; i <= gx + n; i++) for (var j = gy - n; j <= gy + n; j++) {
      var c = this.cells[i + ',' + j];
      if (c) for (var k = 0; k < c.length; k++) if (dist(this.pts[c[k]].p, p) <= r) out.push(c[k]);
    }
    return out;
  };

  // ------------------------------------------------------------------ primitives and crossings
  // { kind: 'seg', a, b } | { kind: 'arc', c, r, a0, a1 (radians, a0 < a1), full } with a box
  function prims(e) {
    var K = Kern(), list;
    if (K && K.entityPrimitives) list = K.entityPrimitives(e);
    else if (e.t === 'line') list = [{ kind: 'seg', a: [e.x1, e.y1], b: [e.x2, e.y2] }];
    else if (e.t === 'circle') list = [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: 0, a1: TAU, full: true }];
    else if (e.t === 'arc') list = [{ kind: 'arc', c: [e.cx, e.cy], r: e.r, a0: e.a0 * D2R, a1: e.a1 * D2R }];
    else list = [];
    list.forEach(function (p) {
      if (p.kind === 'seg') p.box = [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1]), Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])];
      else p.box = [p.c[0] - p.r, p.c[1] - p.r, p.c[0] + p.r, p.c[1] + p.r];
    });
    return list;
  }
  function boxHit(a, b, m) { return a[0] <= b[2] + m && b[0] <= a[2] + m && a[1] <= b[3] + m && b[1] <= a[3] + m; }
  function angIn(a, a0, a1, eps) { var t = a; while (t < a0 - eps) t += TAU; while (t > a0 + TAU) t -= TAU; return t <= a1 + eps; }
  // intersection points of two primitives (tangent touches counted once; collinear / co-radial overlaps give none)
  function primHits(p, q) {
    var out = [], eps = 1e-12;
    if (p.kind === 'arc' && q.kind === 'seg') { var t = p; p = q; q = t; }
    if (p.kind === 'seg' && q.kind === 'seg') {
      var d1 = [p.b[0] - p.a[0], p.b[1] - p.a[1]], d2 = [q.b[0] - q.a[0], q.b[1] - q.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      var L = hyp(d1[0], d1[1]) * hyp(d2[0], d2[1]);
      if (Math.abs(den) <= 1e-12 * L) return out;
      var w = [q.a[0] - p.a[0], q.a[1] - p.a[1]], s = (w[0] * d2[1] - w[1] * d2[0]) / den, u = (w[0] * d1[1] - w[1] * d1[0]) / den;
      if (s >= -1e-9 && s <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push([p.a[0] + d1[0] * s, p.a[1] + d1[1] * s]);
      return out;
    }
    if (p.kind === 'seg') {
      var d = [p.b[0] - p.a[0], p.b[1] - p.a[1]], f = [p.a[0] - q.c[0], p.a[1] - q.c[1]];
      var A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - q.r * q.r;
      if (A < eps) return out;
      var disc = B * B - 4 * A * C;
      if (disc < 0) { if (Math.sqrt(Math.max(0, q.r * q.r - disc / (4 * A))) - q.r < 1e-9 * Math.max(1, q.r)) disc = 0; else return out; }
      var sq = Math.sqrt(disc);
      (sq / (2 * A) < 1e-12 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]).forEach(function (tt) {
        if (tt < -1e-9 || tt > 1 + 1e-9) return;
        var x = p.a[0] + d[0] * tt, y = p.a[1] + d[1] * tt;
        if (q.full || angIn(Math.atan2(y - q.c[1], x - q.c[0]), q.a0, q.a1, 1e-9)) out.push([x, y]);
      });
      return out;
    }
    var dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], D = hyp(dx, dy);
    if (D < 1e-12 || D > p.r + q.r + 1e-12 || D < Math.abs(p.r - q.r) - 1e-12) return out;
    var a2 = (p.r * p.r - q.r * q.r + D * D) / (2 * D), h = Math.sqrt(Math.max(0, p.r * p.r - a2 * a2));
    var mx = p.c[0] + dx / D * a2, my = p.c[1] + dy / D * a2;
    [[mx - h * dy / D, my + h * dx / D], [mx + h * dy / D, my - h * dx / D]].forEach(function (pt, i) {
      if (i === 1 && h < 1e-12) return;
      if (!(p.full || angIn(Math.atan2(pt[1] - p.c[1], pt[0] - p.c[0]), p.a0, p.a1, 1e-9))) return;
      if (!(q.full || angIn(Math.atan2(pt[1] - q.c[1], pt[0] - q.c[0]), q.a0, q.a1, 1e-9))) return;
      out.push(pt);
    });
    return out;
  }
  // every crossing between two different entities: [{ i, j, at }] where `at` is not a joint (an end of both within tol)
  function crossings(E, tol) {
    var P = E.map(function (e) { return geomEntity(e) ? prims(e) : []; });
    var B = P.map(function (list) {
      if (!list.length) return null;
      var b = list[0].box.slice();
      list.forEach(function (p) { b[0] = Math.min(b[0], p.box[0]); b[1] = Math.min(b[1], p.box[1]); b[2] = Math.max(b[2], p.box[2]); b[3] = Math.max(b[3], p.box[3]); });
      return b;
    });
    var EN = E.map(function (e) { return geomEntity(e) ? ends(e) : []; }), out = [];
    function nearEnd(x, list) { for (var k = 0; k < list.length; k++) if (dist(x, list[k].p) <= tol) return true; return false; }
    // sweep over x so far-apart entities are never compared
    var order = [];
    for (var i = 0; i < E.length; i++) if (B[i]) order.push(i);
    order.sort(function (a, b) { return B[a][0] - B[b][0]; });
    for (var oi = 0; oi < order.length; oi++) {
      var a = order[oi];
      for (var oj = oi + 1; oj < order.length; oj++) {
        var b = order[oj];
        if (B[b][0] > B[a][2] + tol) break;
        if (!boxHit(B[a], B[b], tol)) continue;
        var seen = [];
        P[a].forEach(function (pa) {
          P[b].forEach(function (pb) {
            if (!boxHit(pa.box, pb.box, 1e-9)) return;
            primHits(pa, pb).forEach(function (x) {
              var ea = nearEnd(x, EN[a]), eb = nearEnd(x, EN[b]);
              if (ea && eb) return;
              if (seen.some(function (s) { return dist(s, x) <= tol; })) return;
              seen.push(x);
              out.push({ i: Math.min(a, b), j: Math.max(a, b), at: x, touch: ea || eb });
            });
          });
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ duplicates and overlaps
  function lineDir(e) { var L = hyp(e.x2 - e.x1, e.y2 - e.y1); return L > 0 ? [(e.x2 - e.x1) / L, (e.y2 - e.y1) / L, L] : null; }
  function ptLineDist(p, e, d) { return Math.abs((p[0] - e.x1) * d[1] - (p[1] - e.y1) * d[0]); }
  // two lines on one carrier (each one's ends within tol of the other's line) overlapping by more than tol:
  // { t0, t1 } the overlap along a, or null
  function lineOverlap(a, b, tol) {
    var da = lineDir(a), db = lineDir(b);
    if (!da || !db) return null;
    if (ptLineDist([b.x1, b.y1], a, da) > tol || ptLineDist([b.x2, b.y2], a, da) > tol) return null;
    if (ptLineDist([a.x1, a.y1], b, db) > tol || ptLineDist([a.x2, a.y2], b, db) > tol) return null;
    var s1 = (b.x1 - a.x1) * da[0] + (b.y1 - a.y1) * da[1], s2 = (b.x2 - a.x1) * da[0] + (b.y2 - a.y1) * da[1];
    var lo = Math.max(0, Math.min(s1, s2)), hi = Math.min(da[2], Math.max(s1, s2));
    return hi - lo > tol ? { lo: lo, hi: hi, s1: s1, s2: s2 } : null;
  }
  // co-radial arcs / circles overlapping by more than tol along the curve: { union: [a0, a1] degrees | 'full' } or null
  function arcOverlap(a, b, tol) {
    if (dist([a.cx, a.cy], [b.cx, b.cy]) > tol || Math.abs(a.r - b.r) > tol) return null;
    var fa = a.t === 'circle', fb = b.t === 'circle';
    if (fa || fb) return { full: fa && fb, inside: fa ? 'b' : 'a' };
    var r = Math.max(a.r, b.r, 1e-12), ang = tol / r * R2D;
    var a0 = a.a0, a1 = a.a1, b0 = b.a0, b1 = b.a1;
    while (b0 < a0 - 1e-9) { b0 += 360; b1 += 360; }
    while (b0 >= a0 + 360 - 1e-9) { b0 -= 360; b1 -= 360; }
    // b starts inside a, or a starts inside b (b shifted down a turn)
    var ov = Math.min(a1, b1) - b0, ov2 = Math.min(a1, b1 - 360) - a0;
    if (b0 <= a1 && ov > ang) return { u0: a0, u1: Math.max(a1, b1) };
    if (ov2 > ang) return { u0: b0 - 360, u1: Math.max(a1, b1 - 360) };
    return null;
  }
  function sameNumbers(a, b, tol) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tol;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return sameNumbers(x, b[i], tol); });
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      var ka = Object.keys(a).filter(function (k) { return k !== 'layer'; }), kb = Object.keys(b).filter(function (k) { return k !== 'layer'; });
      return ka.length === kb.length && ka.every(function (k) { return sameNumbers(a[k], b[k], tol); });
    }
    return a === b;
  }
  function sameEntity(a, b, tol) {
    if (a.t !== b.t) return false;
    if (a.t === 'spline' && !a.closed && !b.closed && a.pts.length === b.pts.length && !a.tans && !b.tans) {
      var rev = b.pts.slice().reverse();
      if (sameNumbers(a.pts, rev, tol)) return true;
    }
    return sameNumbers(a, b, tol);
  }
  // duplicates and overlaps among entities E: [{ i, j, kind: 'duplicate' | 'overlap', at }]
  function overlaps(E, tol) {
    var out = [], idx = [];
    E.forEach(function (e, i) { if (geomEntity(e)) idx.push(i); });
    var bx = bounds.bind(null);
    var boxes = {};
    idx.forEach(function (i) { boxes[i] = bx([E[i]]); });
    idx.sort(function (a, b) { return boxes[a][0] - boxes[b][0]; });
    for (var x = 0; x < idx.length; x++) {
      var i = idx[x], a = E[i];
      for (var y = x + 1; y < idx.length; y++) {
        var j = idx[y], b = E[j];
        if (boxes[j][0] > boxes[i][2] + tol) break;
        if (!boxHit(boxes[i], boxes[j], tol)) continue;
        var hit = null;
        if (a.t === 'line' && b.t === 'line') {
          var o = lineOverlap(a, b, tol);
          if (o) {
            var dup = (dist([a.x1, a.y1], [b.x1, b.y1]) <= tol && dist([a.x2, a.y2], [b.x2, b.y2]) <= tol) || (dist([a.x1, a.y1], [b.x2, b.y2]) <= tol && dist([a.x2, a.y2], [b.x1, b.y1]) <= tol);
            var dd = lineDir(a), mid = (o.lo + o.hi) / 2;
            hit = { kind: dup ? 'duplicate' : 'overlap', at: [a.x1 + dd[0] * mid, a.y1 + dd[1] * mid] };
          }
        } else if ((a.t === 'arc' || a.t === 'circle') && (b.t === 'arc' || b.t === 'circle')) {
          var ao = arcOverlap(a, b, tol);
          if (ao) {
            var full = ao.full || (a.t === 'arc' && b.t === 'arc' && Math.abs(a.a0 - b.a0) * D2R * a.r <= tol && Math.abs(a.a1 - b.a1) * D2R * a.r <= tol);
            var ref = a.t === 'arc' ? a : b, am = ref.t === 'arc' ? (ref.a0 + ref.a1) / 2 : 0;
            hit = { kind: full ? 'duplicate' : 'overlap', at: arcPt(ref, am) };
          }
        } else if (sameEntity(a, b, tol)) {
          var bb = boxes[i];
          hit = { kind: 'duplicate', at: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] };
        }
        if (hit) { hit.i = i; hit.j = j; out.push(hit); }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ end clusters
  // the open ends of E grouped where they coincide (within eps): [{ p, ends: [{ i, k, p }] }]
  function endClusters(E, eps) {
    var all = [], grid = new PointGrid(Math.max(eps, 1e-12) * 4), cl = [];
    E.forEach(function (e, i) { if (geomEntity(e)) ends(e).forEach(function (en) { all.push({ i: i, k: en.k, p: en.p, rigid: !!en.rigid }); }); });
    all.forEach(function (en, n) { grid.add(en.p, n); });
    var used = all.map(function () { return false; });
    all.forEach(function (en, n) {
      if (used[n]) return;
      var c = { p: en.p, ends: [] };
      grid.near(en.p, eps).forEach(function (g) { var m = grid.pts[g].id; if (!used[m]) { used[m] = true; c.ends.push(all[m]); } });
      cl.push(c);
    });
    return cl;
  }
  // endJoints(entities, eps?) -> [[ref, ref, …]] the end refs ('3.p1') that coincide, one list per joint of two or more
  function endJoints(E, eps) {
    eps = eps == null ? 1e-9 * scaleOf(E) : eps;
    return endClusters(E, eps).filter(function (c) { return c.ends.length >= 2; }).map(function (c) { return c.ends.map(function (en) { return en.i + '.p' + en.k; }); });
  }

  // ------------------------------------------------------------------ Check Sketch for Feature
  // check(entities, tol) -> [{ type, at, entities: [i], size?, msg }] with issues.summary, issues.contours
  // { open, closed }. Types: open (an open endpoint), gap (two ends closer than tol but not touching), branch (three or
  // more ends at one point), zero, tiny (shorter than tol), duplicate, overlap, cross (two entities cross), touch (an
  // end on the middle of another entity).
  function check(E, tol, opts) {
    opts = opts || {};
    E = E || [];
    var scale = scaleOf(E), eps = 1e-9 * scale, issues = [];
    tol = tol > 0 ? tol : 1e-3 * scale;
    var unit = opts.unit ? ' ' + opts.unit : '';
    E.forEach(function (e, i) {
      if (!geomEntity(e)) return;
      var L = entLength(e);
      if (L <= eps) issues.push({ type: 'zero', at: entMid(e), entities: [i], size: L, msg: 'Zero-length ' + nameOf(e) + ' ' + (i + 1) });
      else if (L < tol) issues.push({ type: 'tiny', at: entMid(e), entities: [i], size: L, msg: 'Tiny ' + nameOf(e) + ' ' + (i + 1) + ' (' + fmtN(L) + unit + ' long)' });
    });
    overlaps(E, tol).forEach(function (o) {
      issues.push({ type: o.kind, at: o.at, entities: [o.i, o.j], msg: (o.kind === 'duplicate' ? 'Duplicate entities ' : 'Overlapping entities ') + (o.i + 1) + ' and ' + (o.j + 1) });
    });
    var cl = endClusters(E, eps), cgrid = new PointGrid(Math.max(tol, eps)), gapSeen = {};
    cl.forEach(function (c, n) { cgrid.add(c.p, n); });
    cl.forEach(function (c, n) {
      if (c.ends.length >= 3) issues.push({ type: 'branch', at: c.p, entities: c.ends.map(function (x) { return x.i; }), msg: c.ends.length + ' endpoints shared at one point (a contour branches there)' });
      if (c.ends.length !== 1) return;
      var best = null, bd = Infinity;
      cgrid.near(c.p, tol).forEach(function (g) {
        var m = cgrid.pts[g].id;
        if (m === n) return;
        // a line's own other end is a tiny entity, not a gap
        if (cl[m].ends.length === 1 && cl[m].ends[0].i === c.ends[0].i && E[c.ends[0].i].t === 'line') return;
        var d = dist(cl[m].p, c.p);
        if (d > eps && d < bd) { bd = d; best = m; }
      });
      if (best == null) { issues.push({ type: 'open', at: c.p, entities: [c.ends[0].i], msg: 'Open endpoint of ' + nameOf(E[c.ends[0].i]) + ' ' + (c.ends[0].i + 1) }); return; }
      var key = Math.min(n, best) + ':' + Math.max(n, best);
      if (gapSeen[key]) return;
      gapSeen[key] = true;
      issues.push({ type: 'gap', at: [(c.p[0] + cl[best].p[0]) / 2, (c.p[1] + cl[best].p[1]) / 2], entities: [c.ends[0].i, cl[best].ends[0].i], size: bd, msg: 'Gap of ' + fmtN(bd) + unit + ' between ' + nameOf(E[c.ends[0].i]) + ' ' + (c.ends[0].i + 1) + ' and ' + nameOf(E[cl[best].ends[0].i]) + ' ' + (cl[best].ends[0].i + 1) });
    });
    crossings(E, tol).forEach(function (x) {
      issues.push({ type: x.touch ? 'touch' : 'cross', at: x.at, entities: [x.i, x.j], msg: (x.touch ? 'Endpoint touches the middle of ' : 'Crossing: ') + nameOf(E[x.i]) + ' ' + (x.i + 1) + ' and ' + nameOf(E[x.j]) + ' ' + (x.j + 1) });
    });
    // contours: entities joined at their ends (union-find); open when any end is free
    var par = E.map(function (e, i) { return i; });
    function find(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
    cl.forEach(function (c) { for (var k = 1; k < c.ends.length; k++) par[find(c.ends[k].i)] = find(c.ends[0].i); });
    var roots = {}, openRoots = {};
    E.forEach(function (e, i) { if (geomEntity(e)) roots[find(i)] = 1; });
    cl.forEach(function (c) { if (c.ends.length === 1) openRoots[find(c.ends[0].i)] = 1; });
    var nOpen = Object.keys(openRoots).length, nAll = Object.keys(roots).length;
    issues.contours = { open: nOpen, closed: nAll - nOpen };
    issues.summary = summary(issues, tol, opts.unit);
    return issues;
  }
  function entMid(e) {
    switch (e.t) {
      case 'line': return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
      case 'arc': return arcPt(e, (e.a0 + e.a1) / 2);
      case 'circle': case 'ellipse': case 'pellipse': return [e.cx, e.cy];
    }
    var b = bounds([e]);
    return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
  }
  var NAMES = { line: 'Line', arc: 'Arc', circle: 'Circle', spline: 'Spline', ellipse: 'Ellipse', pellipse: 'Partial Ellipse', polyline: 'Polyline', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', aslot: 'Slot' };
  function nameOf(e) { return (e && NAMES[e.t]) || 'Entity'; }
  // "2 open contours, 3 gaps < 0.001 in, 1 duplicate" (or "No problems found")
  function summary(issues, tol, unit) {
    var n = {};
    issues.forEach(function (x) { n[x.type] = (n[x.type] || 0) + 1; });
    var parts = [], u = unit ? ' ' + unit : '';
    function pl(k, one, many) { if (n[k]) parts.push(n[k] + ' ' + (n[k] === 1 ? one : many)); }
    if (issues.contours && issues.contours.open) parts.push(issues.contours.open + ' open contour' + (issues.contours.open === 1 ? '' : 's'));
    if (n.gap) parts.push(n.gap + ' gap' + (n.gap === 1 ? '' : 's') + ' < ' + fmtN(tol) + u);
    pl('branch', 'shared endpoint', 'shared endpoints');
    pl('duplicate', 'duplicate', 'duplicates'); pl('overlap', 'overlap', 'overlaps');
    pl('zero', 'zero-length entity', 'zero-length entities'); pl('tiny', 'tiny entity', 'tiny entities');
    pl('cross', 'crossing', 'crossings'); pl('touch', 'endpoint touching an entity', 'endpoints touching entities');
    return parts.length ? parts.join(', ') : 'No problems found';
  }

  // ------------------------------------------------------------------ Repair Sketch
  // repair(entities, { tol, removeTiny = true, merge = true, closeGaps = true, join = true, split = false }) ->
  // { entities, map (old index -> new index, -1 removed), changed (new indices whose shape changed beyond the
  // snapping of an end: joined, merged, split), report: { removed, merged, gaps, joined, split, maxMove, spots: [{ type,
  // at }], joints: [[ref, ref]] (the ends a closed gap joined, new indices) } }. Construction geometry and points are
  // left as they are. No point moves more than tol.
  // lane dxfaudit: where the two ends of a gap (x, y: { p }, of entities a, b) should meet: two lines that are not
  // parallel at their crossing, a line and a curve at the curve's end; null (the middle is used) when that point is
  // more than tol from either end
  function gapCorner(a, x, b, y, tol) {
    var t = null;
    if (a.t === 'line' && b.t === 'line') {
      var d1 = [a.x2 - a.x1, a.y2 - a.y1], d2 = [b.x2 - b.x1, b.y2 - b.y1], cr = d1[0] * d2[1] - d1[1] * d2[0];
      var l1 = hyp(d1[0], d1[1]), l2 = hyp(d2[0], d2[1]);
      if (!(l1 > 0) || !(l2 > 0) || Math.abs(cr) < 1e-6 * l1 * l2) return null;   // parallel: the middle keeps both on the line
      var s = ((b.x1 - a.x1) * d2[1] - (b.y1 - a.y1) * d2[0]) / cr;
      t = [a.x1 + d1[0] * s, a.y1 + d1[1] * s];
    } else if (a.t === 'line' && b.t !== 'line') t = y.p;
    else if (b.t === 'line' && a.t !== 'line') t = x.p;
    if (!t || dist(t, x.p) > tol || dist(t, y.p) > tol) return null;
    return [t[0], t[1]];
  }
  function repair(E, opts) {
    opts = opts || {};
    // lane sketchgaps-2: a gap of exactly the tolerance closes (10.0005 - 10 is 0.000500000000000611 in floating point)
    var tol = (opts.tol > 0 ? opts.tol : 1e-3 * scaleOf(E || [])) * (1 + 1e-6);
    var on = function (k, def) { return opts[k] == null ? def : !!opts[k]; };
    var R = (E || []).map(function (e, i) { return { e: clone(e), src: i, alive: true, changed: false }; });
    var rep = { removed: 0, merged: 0, gaps: 0, joined: 0, split: 0, maxMove: 0, spots: [], joints: [] };
    var eps = 1e-9 * scaleOf(E || []);
    function live() { return R.filter(function (r) { return r.alive && geomEntity(r.e); }); }
    // 1. tiny and zero-length entities
    if (on('removeTiny', true)) live().forEach(function (r) {
      if (entLength(r.e) < tol) { r.alive = false; rep.removed++; rep.spots.push({ type: 'removed', at: entMid(r.e) }); }
    });
    // 2. duplicates and overlaps, until none is left
    if (on('merge', true)) {
      for (var pass = 0; pass < 8; pass++) {
        var L = live(), ents = L.map(function (r) { return r.e; }), any = false;
        overlaps(ents, tol).forEach(function (o) {
          var A = L[o.i], B = L[o.j];
          if (!A.alive || !B.alive) return;
          var a = A.e, b = B.e;
          if (a.t === 'line' && b.t === 'line') {
            var ov = lineOverlap(a, b, tol);
            if (!ov) return;
            // the union: the outermost of the four ends along a (real ends, so nothing moves)
            var cand = [[0, [a.x1, a.y1]], [hyp(a.x2 - a.x1, a.y2 - a.y1), [a.x2, a.y2]], [ov.s1, [b.x1, b.y1]], [ov.s2, [b.x2, b.y2]]];
            cand.sort(function (u, v) { return u[0] - v[0]; });
            var p = cand[0][1], q = cand[3][1];
            if (dist(p, [a.x1, a.y1]) > 0 || dist(q, [a.x2, a.y2]) > 0) A.changed = true;
            a.x1 = p[0]; a.y1 = p[1]; a.x2 = q[0]; a.y2 = q[1];
          } else if ((a.t === 'arc' || a.t === 'circle') && (b.t === 'arc' || b.t === 'circle')) {
            var ao = arcOverlap(a, b, tol);
            if (!ao) return;
            if (ao.full != null) {
              if (ao.inside === 'a' && !ao.full) { A.alive = false; any = true; rep.merged++; rep.spots.push({ type: 'merged', at: entMid(a) }); return; }
            } else if (ao.u1 - ao.u0 >= 360 - tol / Math.max(a.r, 1e-12) * R2D) {
              A.e = { t: 'circle', cx: a.cx, cy: a.cy, r: a.r }; if (a.construction) A.e.construction = true; A.changed = true;
            } else { a.a0 = normDeg(ao.u0); a.a1 = a.a0 + (ao.u1 - ao.u0); A.changed = true; }
          } else if (!sameEntity(a, b, tol)) return;
          B.alive = false; any = true; rep.merged++; rep.spots.push({ type: 'merged', at: o.at });
        });
        if (!any) break;
      }
    }
    // 3. gaps: ends within tol snapped onto one point (an end of a partial ellipse, which cannot move, else where most
    // ends already meet, else the middle of two ends, else the first end): each moves at most tol
    if (on('closeGaps', true)) {
      var L3 = live(), ents3 = L3.map(function (r) { return r.e; }), all = [], grid = new PointGrid(tol);
      ents3.forEach(function (e, i) { ends(e).forEach(function (en) { grid.add(en.p, all.length); all.push({ i: i, k: en.k, p: en.p, rigid: !!en.rigid }); }); });
      var used = all.map(function () { return false; });
      all.forEach(function (seed, n) {
        if (used[n]) return;
        // the seed, then the nearest end of each other entity within tol of it
        var members = [n], byEnt = {};
        grid.near(seed.p, tol).forEach(function (g) {
          var m = grid.pts[g].id, x = all[m], d = dist(x.p, seed.p);
          if (used[m] || m === n || x.i === seed.i) return;
          if (byEnt[x.i] == null || d < byEnt[x.i].d) byEnt[x.i] = { m: m, d: d };
        });
        Object.keys(byEnt).forEach(function (k) { members.push(byEnt[k].m); });
        members.forEach(function (m) { used[m] = true; });
        if (members.length < 2) return;
        var pts = members.map(function (m) { return all[m]; });
        var spread = 0;
        pts.forEach(function (x) { pts.forEach(function (y) { spread = Math.max(spread, dist(x.p, y.p)); }); });
        if (spread === 0) return;
        var target = null, rig = pts.filter(function (x) { return x.rigid; });
        if (rig.length > 1 && rig.some(function (x) { return dist(x.p, rig[0].p) > eps; })) return;   // two fixed ends: cannot close
        if (rig.length) target = rig[0].p;
        else {
          var bestC = 1;
          pts.forEach(function (x) { var c = pts.filter(function (y) { return dist(x.p, y.p) <= eps; }).length; if (c > bestC) { bestC = c; target = x.p; } });
          // lane dxfaudit (opts.corners, the import's repair): two ends of a gap at a corner: two lines meet where they
          // cross (each keeps its direction, a horizontal edge stays horizontal), a line and a curve at the curve's end
          // (the curve keeps its shape); Repair Sketch keeps the middle (no end moves more than half the gap)
          if (!target && pts.length === 2 && opts.corners) target = gapCorner(ents3[pts[0].i], pts[0], ents3[pts[1].i], pts[1], tol);
          if (!target) target = pts.length === 2 ? [(pts[0].p[0] + pts[1].p[0]) / 2, (pts[0].p[1] + pts[1].p[1]) / 2] : seed.p;
        }
        target = [target[0], target[1]];
        if (pts.some(function (x) { return dist(x.p, target) > tol; })) target = [seed.p[0], seed.p[1]];
        var moved = 0;
        pts.forEach(function (x) {
          if (x.rigid) return;
          var d = dist(x.p, target);
          if (d > 0 && setEnd(L3[x.i].e, x.k, target)) { moved = Math.max(moved, d); rep.maxMove = Math.max(rep.maxMove, d); }
        });
        if (spread > eps) {
          rep.gaps++; rep.spots.push({ type: 'gap', at: target, size: spread });
          rep.joints.push(pts.map(function (x) { return { r: L3[x.i], k: x.k }; }));
        }
      });
    }
    // 4. collinear lines and co-radial arcs that meet end to end (and nothing else meets there): one entity
    if (on('join', true)) {
      for (var jp = 0; jp < 200; jp++) {
        var L4 = live(), ents4 = L4.map(function (r) { return r.e; }), did = false, touched = {};
        var cl4 = endClusters(ents4, Math.max(eps, 1e-12));
        for (var ci = 0; ci < cl4.length; ci++) {
          var c = cl4[ci];
          if (c.ends.length !== 2 || c.ends[0].i === c.ends[1].i) continue;
          // one join per entity per pass: the ends of a joined entity are found again in the next pass
          if (touched[c.ends[0].i] || touched[c.ends[1].i]) continue;
          var X = L4[c.ends[0].i], Y = L4[c.ends[1].i], x = X.e, y = Y.e, kx = c.ends[0].k, ky = c.ends[1].k;
          if (x.t === 'line' && y.t === 'line') {
            var A0 = kx === 1 ? [x.x2, x.y2] : [x.x1, x.y1], B0 = ky === 1 ? [y.x2, y.y2] : [y.x1, y.y1], V = c.p;
            var dx = B0[0] - A0[0], dy = B0[1] - A0[1], LL = hyp(dx, dy);
            if (LL <= tol) continue;
            var off = Math.abs((V[0] - A0[0]) * dy - (V[1] - A0[1]) * dx) / LL, along = ((V[0] - A0[0]) * dx + (V[1] - A0[1]) * dy) / LL;
            if (off > tol || along <= 0 || along >= LL) continue;
            x.x1 = A0[0]; x.y1 = A0[1]; x.x2 = B0[0]; x.y2 = B0[1];
            Y.alive = false; X.changed = true; did = true; touched[c.ends[0].i] = touched[c.ends[1].i] = true;
            rep.joined++; rep.spots.push({ type: 'joined', at: V });
          } else if (x.t === 'arc' && y.t === 'arc' && kx !== ky && dist([x.cx, x.cy], [y.cx, y.cy]) <= tol && Math.abs(x.r - y.r) <= tol) {
            var first = kx === 2 ? x : y, second = kx === 2 ? y : x, F = kx === 2 ? X : Y, S2 = kx === 2 ? Y : X;
            var p1 = arcPt(first, first.a0), p2 = arcPt(second, second.a1), sweep = (first.a1 - first.a0) + (second.a1 - second.a0);
            var na;
            if (sweep >= 360 - 1e-7 || dist(p1, p2) <= eps) {
              if (Math.abs(sweep - 360) * D2R * first.r > tol) continue;
              na = { t: 'circle', cx: (first.cx + second.cx) / 2, cy: (first.cy + second.cy) / 2, r: (first.r + second.r) / 2 };
            } else {
              var a3 = arc3(p1, c.p, p2);
              if (!a3 || Math.abs((a3.a1 - a3.a0) - sweep) > 1e-6 * Math.max(1, sweep)) continue;
              na = { t: 'arc', cx: a3.cx, cy: a3.cy, r: a3.r, a0: a3.a0, a1: a3.a1 };
            }
            if (first.construction) na.construction = true;
            F.e = na; F.changed = true; S2.alive = false; did = true; touched[c.ends[0].i] = touched[c.ends[1].i] = true; rep.joined++; rep.spots.push({ type: 'joined', at: c.p });
          }
        }
        if (!did) break;
      }
    }
    // 5. split lines, arcs and circles where they cross another entity
    if (on('split', false)) {
      var L5 = live(), ents5 = L5.map(function (r) { return r.e; }), cuts = ents5.map(function () { return []; });
      crossings(ents5, Math.max(eps, Math.min(tol, 1e-6 * scaleOf(ents5)))).forEach(function (x) {
        if (x.touch) { [x.i, x.j].forEach(function (k) { if (!ends(ents5[k]).some(function (en) { return dist(en.p, x.at) <= tol; })) cuts[k].push(x.at); }); return; }
        cuts[x.i].push(x.at); cuts[x.j].push(x.at);
      });
      L5.forEach(function (r, i) {
        var e = r.e, pts = cuts[i];
        if (!pts.length) return;
        var pieces = splitAt(e, pts, tol);
        if (!pieces || pieces.length < 2) return;
        r.e = pieces[0]; r.changed = true;
        for (var k = 1; k < pieces.length; k++) R.push({ e: pieces[k], src: -1, alive: true, changed: true });
        rep.split += pieces.length - 1;
        pts.forEach(function (p) { rep.spots.push({ type: 'split', at: p }); });
      });
    }
    // compact
    var out = [], map = (E || []).map(function () { return -1; }), changed = [];
    R.forEach(function (r) {
      if (!r.alive) return;
      r.index = out.length;
      if (r.src >= 0) map[r.src] = out.length;
      if (r.changed) changed.push(out.length);
      out.push(r.e);
    });
    rep.joints = rep.joints.map(function (j) { return j.filter(function (x) { return x.r.alive; }).map(function (x) { return x.r.index + '.p' + x.k; }); }).filter(function (j) { return j.length >= 2; });
    return { entities: out, map: map, changed: changed, report: rep };
  }
  // a line, arc or circle cut at the points pts (on it) -> pieces, in order; null for other entities
  function splitAt(e, pts, tol) {
    var out = [];
    if (e.t === 'line') {
      var d = lineDir(e);
      if (!d) return null;
      var ts = pts.map(function (p) { return (p[0] - e.x1) * d[0] + (p[1] - e.y1) * d[1]; }).filter(function (t) { return t > tol && t < d[2] - tol; }).sort(function (a, b) { return a - b; });
      var prev = [e.x1, e.y1];
      ts.concat([d[2]]).forEach(function (t, k) {
        var q = k === ts.length ? [e.x2, e.y2] : [e.x1 + d[0] * t, e.y1 + d[1] * t];
        if (dist(prev, q) <= tol) return;
        var o = { t: 'line', x1: prev[0], y1: prev[1], x2: q[0], y2: q[1] };
        if (e.construction) o.construction = true;
        out.push(o); prev = q;
      });
      return out;
    }
    if (e.t !== 'arc' && e.t !== 'circle') return null;
    var full = e.t === 'circle', a0 = full ? 0 : e.a0, a1 = full ? 360 : e.a1, step = tol / Math.max(e.r, 1e-12) * R2D;
    var as = pts.map(function (p) { var a = Math.atan2(p[1] - e.cy, p[0] - e.cx) * R2D; while (a < a0) a += 360; while (a >= a0 + 360) a -= 360; return a; })
      .filter(function (a) { return full || (a > a0 + step && a < a1 - step); }).sort(function (x, y) { return x - y; });
    var uniq = [];
    as.forEach(function (a) { if (!uniq.length || a - uniq[uniq.length - 1] > step) uniq.push(a); });
    if (full) {
      if (uniq.length < 2) return null;
      uniq.forEach(function (a, k) { var b = k + 1 < uniq.length ? uniq[k + 1] : uniq[0] + 360, o = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: normDeg(a), a1: normDeg(a) + (b - a) }; if (e.construction) o.construction = true; out.push(o); });
      return out;
    }
    var bnd = [a0].concat(uniq, [a1]);
    for (var k = 0; k + 1 < bnd.length; k++) { var o = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: k ? normDeg(bnd[k]) : e.a0, a1: (k ? normDeg(bnd[k]) : e.a0) + (bnd[k + 1] - bnd[k]) }; if (e.construction) o.construction = true; out.push(o); }
    return out;
  }

  // ------------------------------------------------------------------ the DXF/DWG Import pipeline (lane sketchgaps-2)
  // prepare(parsed, opts) -> { entities, report, scale }: what the DXF/DWG Import PropertyManager adds to the sketch
  // (ui-sketch-import.js), here so it runs and is tested without the UI. parsed: parse()'s result. opts: { partUnits
  // 'in' | 'mm', units: 'file' | 'in' | 'mm' (the file's data units; 'file': $INSUNITS / $MEASUREMENT, else the part's),
  // layers: { name: false } (layers left out; lane dxfaudit: { name: true } brings in a layer the file has frozen or
  // off, parse()'s layers[i].frozen / .off, which stay out otherwise), origin: 'file' | 'lowerleft' | 'center', dx, dy, rot, tol (Merge points
  // closer than: ends snapped together), repair (default true: tiny entities removed, duplicates and overlaps merged,
  // gaps up to opts.gap closed), gap (Close gaps up to; default 0.001 in / 0.025 mm) }. Block instances keep their
  // insertion point while any of their geometry is on and are not repaired (their geometry is their definition's).
  // Layer "0" becomes the sketch's default layer (no layer field).
  function prepare(parsed, opts) {
    opts = opts || {};
    var pu = opts.partUnits === 'in' ? 'in' : 'mm', off = opts.layers || {};
    var src = opts.units === 'in' || opts.units === 'mm' ? opts.units : (parsed.units || pu);
    var s = src === pu ? 1 : src === 'in' ? 25.4 : 1 / 25.4;
    // lane dxfaudit: a frozen or off layer of the file stays out unless opts.layers names it true
    var hidden = {};
    (parsed.layers || []).forEach(function (l) { if (l.frozen || l.off) hidden[l.name] = true; });
    var ents = parsed.entities.filter(function (e) { return off[e.layer] === true || (off[e.layer] !== false && !hidden[e.layer]); });
    var live = {}, ins = {};
    ents.forEach(function (e) { if (e.blk != null && e.blkDef == null) live[e.blk] = true; });
    parsed.entities.forEach(function (e) { if (e.blkDef != null) ins[e.blk] = e; });
    ents = ents.filter(function (e) { return e.blkDef == null || live[e.blk]; });
    Object.keys(live).forEach(function (id) { if (ins[id] && ents.indexOf(ins[id]) < 0) ents.push(ins[id]); });
    ents = transform(ents, { s: s });
    var b = bounds(ents), o = [0, 0];
    if (b && opts.origin === 'lowerleft') o = [b[0], b[1]];
    else if (b && opts.origin === 'center') o = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    ents = transform(ents, { dx: -o[0], dy: -o[1] });
    ents = transform(ents, { rot: +opts.rot || 0, dx: +opts.dx || 0, dy: +opts.dy || 0 });
    var tol = Math.max(0, +(opts.tol != null ? opts.tol : pu === 'in' ? 0.0005 : 0.01) || 0), fix = opts.repair !== false;
    var inBlk = ents.filter(function (e) { return e.blk != null; }), plain = ents.filter(function (e) { return e.blk == null; });
    var rep = plain.length ? repair(plain, { tol: tol || 1e-9, closeGaps: tol > 0, merge: fix, removeTiny: fix, join: false, split: false }) : { entities: [], report: null };
    // Repair after import also closes the gaps customer DXFs carry, so a flat comes in as one closed profile that
    // extrudes or makes a Base Flange without a Repair Sketch step; only ends move, none more than the gap (lane dxfaudit:
    // corners: two lines of a gap meet where they cross, so an edge keeps its direction)
    var gap = Math.max(0, +(opts.gap != null ? opts.gap : pu === 'in' ? 0.001 : 0.025) || 0);
    if (fix && gap > tol && rep.entities.length) {
      var rep2 = repair(rep.entities, { tol: gap, closeGaps: true, merge: true, removeTiny: false, join: false, split: false, corners: true });
      if (rep.report) {
        rep2.report.gaps += rep.report.gaps; rep2.report.merged += rep.report.merged; rep2.report.removed += rep.report.removed;
        rep2.report.maxMove = Math.max(rep2.report.maxMove, rep.report.maxMove);
        rep2.report.spots = rep.report.spots.concat(rep2.report.spots);
      }
      rep = rep2;
    }
    var out = rep.entities.concat(inBlk);
    out.forEach(function (e) { if (e.layer == null || e.layer === '' || e.layer === '0') delete e.layer; });
    return { entities: out, report: rep.report, scale: s };
  }

  return {
    prepare: prepare,
    parse: parse, check: check, repair: repair, transform: transform, bounds: bounds, endJoints: endJoints, summary: summary,
    ends: ends, crossings: crossings, overlaps: overlaps,
    // internals, for the tests
    _: { pairs: pairs, conicEntity: conicEntity, bulgeArc: bulgeArc, bezSpans: bezSpans, spansToSplines: spansToSplines, arc3: arc3, setEnd: setEnd, splitAt: splitAt, entLength: entLength }
  };
})();
