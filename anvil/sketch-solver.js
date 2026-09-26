// sketch-solver.js — sketch relations, driving dimensions and the numeric solver behind them.
//
// A sketch feature may carry `rels`: [{ type, refs: [ref, …], v?, at? }]. A ref names a piece of an entity by index:
//   'O'      the sketch origin (fixed at 0, 0)
//   '3'      entity 3 as a whole (a line, circle/arc, slot axis, or a point entity)
//   '3.p1'   start point (line, slot, arc)      '3.p2' end point      '3.mid' midpoint (line, slot)
//   '3.c'    centre (circle, arc, polygon, rectangles, slot)
//   '3.v0'   vertex i (rectangles, polygon, polyline)      '3.e0' edge i (same entities, as a line)
// Relation types: coincident, horizontal, vertical, parallel, perpendicular, tangent, concentric, equal, midpoint,
// collinear, fix (at: the fixed values), and the two-entity driving dimensions distance and angle (v: value, degrees
// for angle). The single-entity Smart Dimensions in `dims` (Kernel.dimGeometry) are driving too: each holds the value
// the geometry has when the solve starts, unless a new target is given (dimension edit).
//
// The solver treats every entity parameter as an unknown (arc angles in degrees), every relation / dimension as one or
// two residual equations, and runs damped Gauss-Newton (Levenberg-Marquardt) with minimum-norm steps
// dx = -J^T (J J^T + lambda I)^-1 r, so an under-defined sketch moves as little as possible. After a solve the Jacobian
// is reduced row by row to find the rank: DOF = unknowns - rank; a relation whose rows add no rank is redundant
// (over-defining, yellow), one left unsatisfied is a conflict (red); an entity whose unknowns are all pinned by the
// row space is fully defined (black), otherwise under defined (blue). No DOM here: kernel tests and the Builder use it.
var SketchSolver = (function () {
  'use strict';
  var K = typeof Kernel !== 'undefined' ? Kernel : null;
  var D2R = Math.PI / 180;

  var PARAMS = {
    line: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'w', 'h'], crect: ['cx', 'cy', 'w', 'h'], circle: ['cx', 'cy', 'r'],
    arc: ['cx', 'cy', 'r', 'a0', 'a1'], slot: ['x1', 'y1', 'x2', 'y2', 'w'], poly: ['cx', 'cy', 'r', 'rot'], point: ['x', 'y']
  };
  function paramNames(e) {
    if (e.t === 'polyline') { var o = []; for (var i = 0; i < e.pts.length * 2; i++) o.push(i); return o; }
    return PARAMS[e.t] || [];
  }
  function pget(e, n) { return typeof n === 'number' ? e.pts[n >> 1][n & 1] : (+e[n] || 0); }
  function pset(e, n, v) { if (typeof n === 'number') e.pts[n >> 1][n & 1] = v; else e[n] = v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ------------------------------------------------------------------ references
  function parseRef(ref) {
    ref = String(ref);
    if (ref === 'O') return { o: true };
    var m = /^(\d+)(?:\.([a-z]+)(\d*))?$/.exec(ref);
    if (!m) return null;
    return { e: +m[1], s: m[2] || null, k: m[3] === '' || m[3] == null ? null : +m[3] };
  }
  function corners(e) {
    switch (e.t) {
      case 'rect': return [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]];
      case 'crect': return [[e.cx - e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy - e.h / 2], [e.cx + e.w / 2, e.cy + e.h / 2], [e.cx - e.w / 2, e.cy + e.h / 2]];
      case 'poly': {
        var out = [], n = e.n | 0 || 6, rot = (e.rot || 0) * D2R;
        for (var i = 0; i < n; i++) { var a = rot + Math.PI * 2 * i / n; out.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]); }
        return out;
      }
      case 'polyline': return e.pts;
    }
    return null;
  }
  function closedCorners(e) { return e.t !== 'polyline' || !!e.closed; }
  // the point a ref names, or null when it names no point
  function refPoint(ents, r) {
    if (!r) return null;
    if (r.o) return [0, 0];
    var e = ents[r.e];
    if (!e) return null;
    switch (r.s) {
      case null: return e.t === 'point' ? [e.x, e.y] : null;
      case 'p':
        if (e.t === 'line' || e.t === 'slot') return r.k === 1 ? [e.x1, e.y1] : r.k === 2 ? [e.x2, e.y2] : null;
        if (e.t === 'arc') { var a = (r.k === 1 ? e.a0 : r.k === 2 ? e.a1 : NaN) * D2R; return isNaN(a) ? null : [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]; }
        return null;
      case 'mid': return e.t === 'line' || e.t === 'slot' ? [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2] : null;
      case 'c':
        if (e.t === 'circle' || e.t === 'arc' || e.t === 'poly' || e.t === 'crect') return [e.cx, e.cy];
        if (e.t === 'rect') return [e.x + e.w / 2, e.y + e.h / 2];
        if (e.t === 'slot') return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
        return null;
      case 'v': { var c = corners(e); return c && r.k != null && c[r.k] ? [c[r.k][0], c[r.k][1]] : null; }
    }
    return null;
  }
  // the curve a ref names: { kind: 'line', a, b } | { kind: 'circle', c, r } | null
  function refCurve(ents, r) {
    if (!r || r.o) return null;
    var e = ents[r.e];
    if (!e) return null;
    if (r.s === null) {
      if (e.t === 'line' || e.t === 'slot') return { kind: 'line', a: [e.x1, e.y1], b: [e.x2, e.y2] };
      if (e.t === 'circle' || e.t === 'arc') return { kind: 'circle', c: [e.cx, e.cy], r: e.r };
      return null;
    }
    if (r.s === 'e') {
      var c = corners(e);
      if (!c || r.k == null || r.k < 0) return null;
      var n = c.length, last = closedCorners(e) ? n : n - 1;
      if (r.k >= last) return null;
      return { kind: 'line', a: c[r.k], b: c[(r.k + 1) % n] };
    }
    return null;
  }
  function refKind(ents, r) {
    if (refPoint(ents, r)) return 'point';
    var c = refCurve(ents, r);
    return c ? c.kind : null;
  }
  // a point, or the centre of a circle ref (what concentric / distance use)
  function refCenter(ents, r) {
    var p = refPoint(ents, r);
    if (p) return p;
    var c = refCurve(ents, r);
    return c && c.kind === 'circle' ? c.c : null;
  }

  // ------------------------------------------------------------------ geometry helpers
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function crs(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function lineDist(p, L) { var d = sub(L.b, L.a), l = len(d); return l < 1e-12 ? len(sub(p, L.a)) : crs(d, sub(p, L.a)) / l; }
  function angleDeg(L1, L2) { var d1 = sub(L1.b, L1.a), d2 = sub(L2.b, L2.a); return Math.atan2(crs(d1, d2), dot(d1, d2)) / D2R; }
  function sgn(x) { return x < 0 ? -1 : 1; }

  // ------------------------------------------------------------------ relation catalogue
  var TYPES = {
    coincident: { name: 'Coincident', glyph: '•' },
    horizontal: { name: 'Horizontal', glyph: '—' },
    vertical: { name: 'Vertical', glyph: '|' },
    parallel: { name: 'Parallel', glyph: '∥' },
    perpendicular: { name: 'Perpendicular', glyph: '⊥' },
    tangent: { name: 'Tangent', glyph: 'T' },
    concentric: { name: 'Concentric', glyph: '◎' },
    equal: { name: 'Equal', glyph: '=' },
    midpoint: { name: 'Midpoint', glyph: 'M' },
    collinear: { name: 'Collinear', glyph: '≡' },
    fix: { name: 'Fix', glyph: 'F' },
    distance: { name: 'Distance', glyph: '↔', dim: true },
    angle: { name: 'Angle', glyph: '∠', dim: true }
  };
  var ADD_ORDER = ['horizontal', 'vertical', 'coincident', 'midpoint', 'collinear', 'parallel', 'perpendicular', 'tangent', 'concentric', 'equal', 'fix'];

  // Does relation `type` apply to refs of these kinds? (order-free; returns the kinds in the order the residual wants
  // them, as an index permutation, or null)
  function match(type, kinds) {
    var n = kinds.length;
    function perm(a, b) { if (kinds[0] === a && kinds[1] === b) return [0, 1]; if (kinds[0] === b && kinds[1] === a) return [1, 0]; return null; }
    switch (type) {
      case 'horizontal': case 'vertical':
        if (n === 1 && kinds[0] === 'line') return [0];
        return n === 2 ? perm('point', 'point') : null;
      case 'coincident':
        if (n !== 2) return null;
        return perm('point', 'point') || perm('point', 'line') || perm('point', 'circle');
      case 'midpoint': return n === 2 ? perm('point', 'line') : null;
      case 'parallel': case 'perpendicular': case 'collinear': return n === 2 ? perm('line', 'line') : null;
      case 'tangent': return n === 2 ? perm('line', 'circle') || perm('circle', 'circle') : null;
      case 'concentric': return n === 2 ? perm('circle', 'circle') || perm('point', 'circle') : null;
      case 'equal': return n === 2 ? perm('line', 'line') || perm('circle', 'circle') : null;
      case 'fix': return n === 1 && kinds[0] ? [0] : null;
      case 'distance':
        if (n !== 2) return null;
        return perm('point', 'point') || perm('point', 'line') || perm('line', 'line') || perm('circle', 'circle') || perm('point', 'circle') || perm('circle', 'line');
      case 'angle': return n === 2 ? perm('line', 'line') : null;
    }
    return null;
  }

  // Residual function of one relation, with the sign / branch choices made from the geometry it is built on.
  // The end-point refs of a curve ref (a line's p1 / p2, an arc's p1 / p2, a polygon edge's corners).
  function endRefs(ents, r) {
    var e = ents[r.e];
    if (!e) return [];
    if (r.s === null && (e.t === 'line' || e.t === 'arc')) return [r.e + '.p1', r.e + '.p2'];
    if (r.s === 'e') { var c = corners(e); return c ? [r.e + '.v' + r.k, r.e + '.v' + ((r.k + 1) % c.length)] : []; }
    return [];
  }
  // A Coincident in `rels` that joins an end of curve A to an end of curve B (or puts it on B): { ref } names the
  // shared point on A's side, or null. Tangency at a shared end point is written as an angle condition there, because
  // the distance form (centre-to-line = radius) has a zero gradient at the touching point and would be dependent on
  // the Coincident that holds the ends together.
  function sharedEnd(ents, rels, A, B) {
    if (!rels) return null;
    var ea = endRefs(ents, A), eb = endRefs(ents, B).concat([String(B.e)]);
    for (var i = 0; i < rels.length; i++) {
      var r = rels[i];
      if (r.type !== 'coincident' || !r.refs || r.refs.length !== 2) continue;
      for (var k = 0; k < 2; k++) if (ea.indexOf(r.refs[k]) >= 0 && eb.indexOf(r.refs[1 - k]) >= 0) return { ref: parseRef(r.refs[k]) };
    }
    return null;
  }
  function unit(v) { var l = len(v); return l < 1e-15 ? [0, 0] : [v[0] / l, v[1] / l]; }

  function relEquation(ents, rel, rels) {
    var R = (rel.refs || []).map(parseRef);
    if (!TYPES[rel.type] || R.some(function (r) { return !r; })) return null;
    var kinds = R.map(function (r) { return refKind(ents, r); });
    if (kinds.some(function (k) { return !k; })) return null;
    var p = match(rel.type, kinds);
    if (!p) return null;
    var A = R[p[0]], B = R[p[1]], kA = kinds[p[0]], kB = kinds[p[1]];
    var eidx = [];
    R.forEach(function (r) { if (!r.o && eidx.indexOf(r.e) < 0) eidx.push(r.e); });
    var f, n, v = +rel.v;
    function P(r, E) { return refPoint(E, r); }
    function C(r, E) { return refCurve(E, r); }
    switch (rel.type) {
      case 'coincident':
        if (kB === 'point') { n = 2; f = function (E) { var a = P(A, E), b = P(B, E); return [a[0] - b[0], a[1] - b[1]]; }; }
        else if (kB === 'line') { n = 1; f = function (E) { return [lineDist(P(A, E), C(B, E))]; }; }
        else { n = 1; f = function (E) { var c = C(B, E); return [len(sub(P(A, E), c.c)) - c.r]; }; }
        break;
      case 'horizontal': case 'vertical': {
        var ax = rel.type === 'horizontal' ? 1 : 0;
        n = 1;
        if (kA === 'line') f = function (E) { var l = C(A, E); return [l.a[ax] - l.b[ax]]; };
        else f = function (E) { return [P(A, E)[ax] - P(B, E)[ax]]; };
        break;
      }
      case 'midpoint': n = 2; f = function (E) { var a = P(A, E), l = C(B, E); return [a[0] - (l.a[0] + l.b[0]) / 2, a[1] - (l.a[1] + l.b[1]) / 2]; }; break;
      case 'parallel': case 'perpendicular': {
        n = 1;
        var par = rel.type === 'parallel';
        f = function (E) {
          var d1 = sub(C(A, E).b, C(A, E).a), d2 = sub(C(B, E).b, C(B, E).a), l = len(d1) * len(d2);
          if (l < 1e-18) return [0];
          return [(par ? crs(d1, d2) : dot(d1, d2)) / l];
        };
        break;
      }
      case 'collinear': n = 2; f = function (E) { var l1 = C(A, E), l2 = C(B, E); return [lineDist(l2.a, l1), lineDist(l2.b, l1)]; }; break;
      case 'tangent': {
        n = 1;
        var sh = sharedEnd(ents, rels, A, B);
        if (sh && kA === 'line') {
          // the radius to the shared end point is perpendicular to the line
          f = function (E) { var l = C(A, E), c = C(B, E), q = P(sh.ref, E); return [dot(unit(sub(l.b, l.a)), unit(sub(q, c.c)))]; };
        } else if (sh) {
          // two arcs through a shared end point: their radii there are collinear
          f = function (E) { var q = P(sh.ref, E); return [crs(unit(sub(q, C(A, E).c)), unit(sub(q, C(B, E).c)))]; };
        } else if (kA === 'line') {
          var s0 = sgn(lineDist(C(B, ents).c, C(A, ents)));
          f = function (E) { var c = C(B, E); return [s0 * lineDist(c.c, C(A, E)) - c.r]; };
        } else {
          var c1 = C(A, ents), c2 = C(B, ents), dd = len(sub(c1.c, c2.c));
          var ext = Math.abs(dd - (c1.r + c2.r)) <= Math.abs(dd - Math.abs(c1.r - c2.r)), si = sgn(c1.r - c2.r);
          f = function (E) { var a = C(A, E), b = C(B, E), d = len(sub(a.c, b.c)); return [ext ? d - (a.r + b.r) : d - si * (a.r - b.r)]; };
        }
        break;
      }
      case 'concentric': n = 2; f = function (E) { var a = refCenter(E, A), b = refCenter(E, B); return [a[0] - b[0], a[1] - b[1]]; }; break;
      case 'equal':
        n = 1;
        if (kA === 'line') f = function (E) { var a = C(A, E), b = C(B, E); return [len(sub(a.b, a.a)) - len(sub(b.b, b.a))]; };
        else f = function (E) { return [C(A, E).r - C(B, E).r]; };
        break;
      case 'fix': {
        if (!A.o && A.s === null && ents[A.e] && ents[A.e].t !== 'point') {
          var names = paramNames(ents[A.e]), at = Array.isArray(rel.at) && rel.at.length === names.length ? rel.at : names.map(function (nm) { return pget(ents[A.e], nm); });
          n = names.length;
          f = function (E) { return names.map(function (nm, i) { return pget(E[A.e], nm) - at[i]; }); };
        } else {
          var pt = P(A, ents) || refCenter(ents, A), at2 = Array.isArray(rel.at) && rel.at.length === 2 ? rel.at : [pt[0], pt[1]];
          n = 2;
          f = function (E) { var q = P(A, E) || refCenter(E, A); return [q[0] - at2[0], q[1] - at2[1]]; };
        }
        break;
      }
      case 'distance': {
        if (!(v >= 0)) return null;
        n = 1;
        if (kA === 'point' && kB === 'point') f = function (E) { return [len(sub(P(A, E), P(B, E))) - v]; };
        else if (kA === 'circle' && kB === 'circle') f = function (E) { return [len(sub(C(A, E).c, C(B, E).c)) - v]; };
        else if (kA === 'point' && kB === 'circle') f = function (E) { return [len(sub(P(A, E), C(B, E).c)) - v]; };
        else {
          // to a line: signed distance with the side the geometry started on (point, circle centre, or the second
          // line's midpoint for two parallel lines)
          var from = function (E) { if (kA === 'point') return P(A, E); if (kA === 'circle') return C(A, E).c; var l = C(A, E); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; };
          var s1 = sgn(lineDist(from(ents), C(B, ents)));
          f = function (E) { return [s1 * lineDist(from(E), C(B, E)) - v]; };
        }
        break;
      }
      case 'angle': {
        if (!(v >= 0)) return null;
        n = 1;
        var s2 = sgn(angleDeg(C(A, ents), C(B, ents)));
        f = function (E) { return [s2 * angleDeg(C(A, E), C(B, E)) - v]; };
        break;
      }
    }
    return f ? { n: n, f: f, ents: eidx } : null;
  }

  // Equation of a Smart Dimension (Kernel.dimGeometry kinds) holding value `target`.
  function dimEquation(ents, d, target) {
    if (!K || !ents[d.e]) return null;
    var g = K.dimGeometry(ents[d.e], d);
    if (!g) return null;
    var t = target != null ? +target : g.value;
    return { n: 1, ents: [d.e], f: function (E) { var x = K.dimValue(E[d.e], d); return [x == null ? 0 : x - t]; } };
  }

  // ------------------------------------------------------------------ the system
  // opts: { dimTargets: { index: value }, relTargets: { index: value }, extra: [{ n, f, ents }], skipRels: bool }
  function buildSystem(sketch, opts) {
    opts = opts || {};
    var ents = clone(sketch.entities || []);
    var vars = [], owner = [];
    ents.forEach(function (e, i) { paramNames(e).forEach(function (nm) { vars.push({ e: i, n: nm }); owner.push(i); }); });
    var cons = [];
    (sketch.rels || []).forEach(function (rel, i) {
      var r = rel;
      if (opts.relTargets && opts.relTargets[i] != null) { r = clone(rel); r.v = opts.relTargets[i]; }
      var q = relEquation(ents, r, sketch.rels);
      cons.push(q ? { src: 'rel', index: i, n: q.n, f: q.f, ents: q.ents } : { src: 'rel', index: i, n: 0, bad: true, ents: [] });
    });
    (sketch.dims || []).forEach(function (d, i) {
      var q = dimEquation(ents, d, opts.dimTargets ? opts.dimTargets[i] : null);
      cons.push(q ? { src: 'dim', index: i, n: q.n, f: q.f, ents: q.ents } : { src: 'dim', index: i, n: 0, bad: true, ents: [] });
    });
    (opts.extra || []).forEach(function (q, i) { cons.push({ src: 'extra', index: i, n: q.n, f: q.f, ents: q.ents, soft: q.soft }); });
    var row = 0, byEnt = ents.map(function () { return []; });
    cons.forEach(function (c) { c.row = row; row += c.n; c.ents.forEach(function (e) { if (byEnt[e]) byEnt[e].push(c); }); });
    var scale = 1;
    vars.forEach(function (v) { if (v.n !== 'a0' && v.n !== 'a1' && v.n !== 'rot') scale = Math.max(scale, Math.abs(pget(ents[v.e], v.n))); });
    return { ents: ents, vars: vars, cons: cons, m: row, byEnt: byEnt, scale: scale };
  }
  function residuals(sys, only) {
    var r = new Array(sys.m);
    sys.cons.forEach(function (c) {
      if (!c.n || (only && !only(c))) { for (var k = 0; k < c.n; k++) r[c.row + k] = 0; return; }
      var v = c.f(sys.ents);
      for (var j = 0; j < c.n; j++) r[c.row + j] = isFinite(v[j]) ? v[j] : 1e6;
    });
    return r;
  }
  function jacobian(sys, only) {
    var m = sys.m, n = sys.vars.length, J = [];
    for (var i = 0; i < m; i++) J.push(new Float64Array(n));
    sys.vars.forEach(function (v, j) {
      var e = sys.ents[v.e], x = pget(e, v.n), h = 1e-6 * Math.max(1, Math.abs(x));
      sys.byEnt[v.e].forEach(function (c) {
        if (!c.n || (only && !only(c))) return;
        pset(e, v.n, x + h); var a = c.f(sys.ents);
        pset(e, v.n, x - h); var b = c.f(sys.ents);
        pset(e, v.n, x);
        for (var k = 0; k < c.n; k++) J[c.row + k][j] = (a[k] - b[k]) / (2 * h);
      });
    });
    return J;
  }
  function getX(sys) { return sys.vars.map(function (v) { return pget(sys.ents[v.e], v.n); }); }
  function setX(sys, x) { sys.vars.forEach(function (v, j) { pset(sys.ents[v.e], v.n, x[j]); }); }
  function sumSq(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return s; }
  function maxAbs(r) { var s = 0; for (var i = 0; i < r.length; i++) s = Math.max(s, Math.abs(r[i])); return s; }

  // Dense Gaussian elimination with partial pivoting; A is modified. Returns x or null.
  function linSolve(A, b) {
    var n = b.length, i, j, k;
    for (k = 0; k < n; k++) {
      var p = k, best = Math.abs(A[k][k]);
      for (i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > best) { best = Math.abs(A[i][k]); p = i; }
      if (!(best > 1e-300)) return null;
      if (p !== k) { var t = A[p]; A[p] = A[k]; A[k] = t; var tb = b[p]; b[p] = b[k]; b[k] = tb; }
      for (i = k + 1; i < n; i++) {
        var fct = A[i][k] / A[k][k];
        if (!fct) continue;
        for (j = k; j < n; j++) A[i][j] -= fct * A[k][j];
        b[i] -= fct * b[k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = b[i]; for (j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }

  // Levenberg-Marquardt with minimum-norm steps. mob[j] (default 1) is how freely unknown j moves: a small value makes
  // the solver prefer moving the others. Returns { ok, it, res }.
  function lm(sys, opts) {
    opts = opts || {};
    var only = opts.only, tol = (opts.tol || 1e-13) * sys.scale, maxIt = opts.maxIt || 80, n = sys.vars.length;
    var mob = opts.mob || null;
    var r = residuals(sys, only), F = sumSq(r), lambda = 1e-9, it = 0;
    if (!n || !sys.m) return { ok: maxAbs(r) <= tol, it: 0, res: maxAbs(r) };
    for (it = 0; it < maxIt; it++) {
      if (!opts.leastSquares && maxAbs(r) <= tol) break;
      var J = jacobian(sys, only), m = sys.m, x0 = getX(sys), i, j, k;
      if (m > n) {
        // more equations than unknowns (least squares, redundant relations): classic LM on the normal equations
        // (J^T J + lambda diag) dx = -J^T r, n x n
        var N = [], g = new Array(n), dmax = 0;
        for (j = 0; j < n; j++) {
          N.push(new Float64Array(n));
          var gj = 0;
          for (i = 0; i < m; i++) gj += J[i][j] * r[i];
          g[j] = gj;
        }
        for (j = 0; j < n; j++) for (k = 0; k <= j; k++) { var sjk = 0; for (i = 0; i < m; i++) sjk += J[i][j] * J[i][k]; N[j][k] = N[k][j] = sjk; }
        for (j = 0; j < n; j++) dmax = Math.max(dmax, N[j][j]);
        var acc = false;
        for (var t2 = 0; t2 < 14; t2++) {
          var A2 = N.map(function (rw, jj) { var c = Array.prototype.slice.call(rw); c[jj] += lambda * (dmax || 1) + 1e-300; return c; });
          var dx = linSolve(A2, g.slice());
          if (dx) {
            var x2 = x0.slice();
            for (j = 0; j < n; j++) x2[j] -= dx[j];
            setX(sys, x2);
            var r2 = residuals(sys, only), F2 = sumSq(r2);
            if (F2 < F || (F2 === 0 && F === 0)) { var dec2 = F - F2; r = r2; F = F2; lambda = Math.max(lambda / 10, 1e-15); acc = true; if (opts.leastSquares && dec2 < 1e-15 * Math.max(1, F)) it = maxIt; break; }
            setX(sys, x0);
          }
          lambda *= 10;
        }
        if (!acc) break;
        continue;
      }
      var MJt = [];   // M J^T  (n x m) stored as rows of J scaled
      for (i = 0; i < m; i++) { var ri = new Float64Array(n); for (j = 0; j < n; j++) ri[j] = J[i][j] * (mob ? mob[j] : 1); MJt.push(ri); }
      var G = [], diag = 0;
      for (i = 0; i < m; i++) {
        G.push(new Float64Array(m));
        for (k = 0; k <= i; k++) { var s = 0, a = J[i], b = MJt[k]; for (j = 0; j < n; j++) s += a[j] * b[j]; G[i][k] = s; }
      }
      for (i = 0; i < m; i++) { for (k = i + 1; k < m; k++) G[i][k] = G[k][i]; diag = Math.max(diag, G[i][i]); }
      var accepted = false;
      for (var tries = 0; tries < 14; tries++) {
        var A = G.map(function (rw, ii) { var c = Array.prototype.slice.call(rw); c[ii] += lambda * (diag || 1) + 1e-300; return c; });
        var y = linSolve(A, r.slice());
        if (y) {
          var x1 = x0.slice();
          for (j = 0; j < n; j++) { var sj = 0; for (i = 0; i < m; i++) sj += MJt[i][j] * y[i]; x1[j] -= sj; }
          setX(sys, x1);
          var r1 = residuals(sys, only), F1 = sumSq(r1);
          if (F1 < F || (F1 === 0 && F === 0)) { r = r1; var dec = F - F1; F = F1; lambda = Math.max(lambda / 10, 1e-15); accepted = true; if (opts.leastSquares && dec < 1e-14 * Math.max(1, F)) it = maxIt; break; }
          setX(sys, x0);
        }
        lambda *= 10;
      }
      if (!accepted) break;
    }
    var res = maxAbs(r);
    return { ok: res <= Math.max(tol * 100, 1e-7 * sys.scale), it: it, res: res };
  }

  // Row-by-row rank reduction of J: which constraints add no rank (dependent), which unknowns are pinned.
  function rankInfo(sys, J) {
    var n = sys.vars.length, basis = [], dep = {}, tolR = 1e-7;
    sys.cons.forEach(function (c, ci) {
      if (c.soft) return;
      for (var k = 0; k < c.n; k++) {
        var v = Array.prototype.slice.call(J[c.row + k]), nv = Math.sqrt(v.reduce(function (s, x) { return s + x * x; }, 0));
        if (nv < 1e-14) { dep[ci] = true; continue; }
        for (var j = 0; j < n; j++) v[j] /= nv;
        basis.forEach(function (b) { var f = v[b.p]; if (f) for (var j2 = 0; j2 < n; j2++) v[j2] -= f * b.row[j2]; });
        var p = -1, best = 0;
        for (var j3 = 0; j3 < n; j3++) if (Math.abs(v[j3]) > best) { best = Math.abs(v[j3]); p = j3; }
        if (best < tolR) { dep[ci] = true; continue; }
        var pv = v[p];
        for (var j4 = 0; j4 < n; j4++) v[j4] /= pv;
        basis.forEach(function (b) { var f = b.row[p]; if (f) for (var j5 = 0; j5 < n; j5++) b.row[j5] -= f * v[j5]; });
        basis.push({ p: p, row: v });
      }
    });
    var fixed = new Array(n);
    for (var i = 0; i < n; i++) fixed[i] = false;
    var isPivot = {};
    basis.forEach(function (b) { isPivot[b.p] = true; });
    basis.forEach(function (b) {
      var free = false;
      for (var j = 0; j < n; j++) if (!isPivot[j] && Math.abs(b.row[j]) > 1e-6) { free = true; break; }
      fixed[b.p] = !free;
    });
    return { rank: basis.length, dep: dep, fixed: fixed };
  }

  // ------------------------------------------------------------------ public: analyse
  // { dof, status: 'under' | 'full' | 'over', entities: ['under'|'full'|'over'|'conflict'], rels: ['ok'|'redundant'|
  //   'conflict'|'invalid'], dims: [...same], redundant, conflicts, unknowns, equations }
  function analyze(sketch, sysIn) {
    var sys = sysIn || buildSystem(sketch);
    var n = sys.vars.length, r = residuals(sys), J = jacobian(sys), info = rankInfo(sys, J);
    var tol = 1e-7 * sys.scale;
    var out = { dof: n - info.rank, unknowns: n, equations: sys.m, rank: info.rank, rels: [], dims: [], redundant: 0, conflicts: 0 };
    var entState = sys.ents.map(function () { return null; });
    sys.cons.forEach(function (c, ci) {
      if (c.src === 'extra') return;
      var st = 'ok';
      if (c.bad) st = 'invalid';
      else {
        var bad = false;
        for (var k = 0; k < c.n; k++) if (Math.abs(r[c.row + k]) > tol) bad = true;
        if (bad) st = 'conflict'; else if (info.dep[ci]) st = 'redundant';
      }
      (c.src === 'rel' ? out.rels : out.dims)[c.index] = st;
      if (st === 'conflict') out.conflicts++;
      if (st === 'redundant') out.redundant++;
      if (st === 'conflict' || st === 'redundant') c.ents.forEach(function (e) { if (entState[e] !== 'conflict') entState[e] = st === 'conflict' ? 'conflict' : 'over'; });
    });
    var off = 0;
    out.entities = sys.ents.map(function (e, i) {
      var np = paramNames(e).length, all = true;
      for (var j = 0; j < np; j++) if (!info.fixed[off + j]) all = false;
      off += np;
      return entState[i] || (all ? 'full' : 'under');
    });
    out.status = out.conflicts || out.redundant ? 'over' : (out.dof === 0 && n > 0 ? 'full' : 'under');
    return out;
  }
  var STATUS_TEXT = { under: 'Under Defined', full: 'Fully Defined', over: 'Over Defined' };

  // ------------------------------------------------------------------ public: solve
  // Solve the sketch in place. opts: dimTargets / relTargets (new values), mob: { entityIndex: mobility }, extra.
  // On failure (a conflict, no convergence) the geometry is left as it was unless opts.force. Returns
  // { ok, it, res, moved }.
  function writeBack(sketch, sys) {
    sys.ents.forEach(function (e, i) {
      var o = sketch.entities[i];
      paramNames(e).forEach(function (nm) {
        var v = pget(e, nm);
        if (v === pget(o, nm)) return;
        // round-off from the iteration is snapped away so a 20 stays 20 (and scripts stay readable)
        var q = Math.round(v * 1e6) / 1e6;
        if (Math.abs(q - v) < 1e-11 * Math.max(1, Math.abs(v))) v = q;
        pset(o, nm, v);
      });
      if (o.t === 'arc') { while (o.a1 <= o.a0) o.a1 += 360; while (o.a1 - o.a0 > 360 + 1e-9) o.a1 -= 360; }
    });
  }
  function mobility(sys, mobByEnt) {
    if (!mobByEnt) return null;
    return sys.vars.map(function (v) { return mobByEnt[v.e] != null ? mobByEnt[v.e] : 1; });
  }
  function solve(sketch, opts) {
    opts = opts || {};
    var sys = buildSystem(sketch, opts);
    var x0 = getX(sys);
    var r = lm(sys, { mob: mobility(sys, opts.mob) });
    var moved = 0, x1 = getX(sys);
    for (var j = 0; j < x0.length; j++) moved = Math.max(moved, Math.abs(x1[j] - x0[j]));
    if (r.ok || opts.force) writeBack(sketch, sys);
    return { ok: r.ok, it: r.it, res: r.res, moved: r.ok || opts.force ? moved : 0 };
  }

  // ------------------------------------------------------------------ editing helpers
  // Set placed dimension `index` (or a dimension object not in sketch.dims) to v and re-solve the whole sketch.
  // Returns { ok, error }; on failure the sketch is unchanged.
  function setDim(sketch, d, v) {
    v = +v;
    if (!(v > 0) || !isFinite(v)) return { ok: false, error: 'Dimension must be a positive number.' };
    var index = typeof d === 'number' ? d : (sketch.dims || []).indexOf(d);
    var dim = index >= 0 ? sketch.dims[index] : d;
    var e = sketch.entities[dim.e];
    if (!e || !K || !K.dimGeometry(e, dim)) return { ok: false, error: 'That dimension no longer applies to the entity.' };
    var saved = clone(sketch.entities);
    K.setDimValue(e, dim, v);              // the kernel's one-entity move is the starting guess
    var opts = { dimTargets: {} };
    if (index >= 0) opts.dimTargets[index] = v;
    else opts.extra = [dimEquation(sketch.entities, dim, v)];
    var r = solve(sketch, opts);
    if (!r.ok) { sketch.entities = saved; return { ok: false, error: 'That value cannot be reached: it conflicts with the sketch\'s other relations or dimensions.' }; }
    return { ok: true };
  }
  // Change the value of a distance / angle relation and re-solve.
  function setRelValue(sketch, index, v) {
    var rel = (sketch.rels || [])[index];
    if (!rel || !TYPES[rel.type] || !TYPES[rel.type].dim) return { ok: false, error: 'Not a dimension.' };
    v = +v;
    if (!(v >= 0) || !isFinite(v) || (rel.type === 'angle' && v > 180)) return { ok: false, error: rel.type === 'angle' ? 'Angle must be between 0 and 180 degrees.' : 'Dimension must be a positive number.' };
    var saved = clone(sketch.entities), t = {};
    t[index] = v;
    var r = solve(sketch, { relTargets: t });
    if (!r.ok) { sketch.entities = saved; return { ok: false, error: 'That value cannot be reached: it conflicts with the sketch\'s other relations or dimensions.' }; }
    rel.v = v;
    return { ok: true };
  }
  // The value a distance / angle relation reads on the current geometry.
  function measure(sketch, type, refs) {
    var ents = sketch.entities, R = refs.map(parseRef), kinds = R.map(function (r) { return refKind(ents, r); });
    var p = match(type, kinds);
    if (!p) return null;
    var A = R[p[0]], B = R[p[1]], kA = kinds[p[0]], kB = kinds[p[1]];
    if (type === 'angle') return Math.abs(angleDeg(refCurve(ents, A), refCurve(ents, B)));
    if (kB === 'line') {
      var from = kA === 'point' ? refPoint(ents, A) : kA === 'circle' ? refCurve(ents, A).c : (function () { var l = refCurve(ents, A); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; })();
      return Math.abs(lineDist(from, refCurve(ents, B)));
    }
    return len(sub(refCenter(ents, A), refCenter(ents, B)));
  }

  // Relation types that apply to a selection of refs (the Add Relations list), in SolidWorks' order.
  function applicable(sketch, refs) {
    var R = refs.map(parseRef);
    if (!R.length || R.some(function (r) { return !r; })) return [];
    var kinds = R.map(function (r) { return refKind(sketch.entities, r); });
    if (kinds.some(function (k) { return !k; })) return [];
    return ADD_ORDER.filter(function (t) {
      if (R.length > 2) return (t === 'horizontal' || t === 'vertical' || t === 'fix') && kinds.every(function (k) { return k === 'line' || t === 'fix'; })
        || ((t === 'parallel' || t === 'equal' || t === 'collinear' || t === 'coincident') && sameKind(kinds, t));
      if (R.length === 2 && kinds[0] === 'line' && kinds[1] === 'line' && (t === 'horizontal' || t === 'vertical')) return true;
      if (R.length === 2 && t === 'fix') return true;
      return !!match(t, kinds);
    });
  }
  function sameKind(kinds, t) {
    if (t === 'coincident') return kinds.every(function (k) { return k === 'point'; });
    if (t === 'equal') return kinds.every(function (k) { return k === 'line'; }) || kinds.every(function (k) { return k === 'circle'; });
    return kinds.every(function (k) { return k === 'line'; });
  }
  // The pairwise / per-entity relations one Add Relations click makes for a selection.
  function expand(type, refs) {
    if (type === 'fix' || ((type === 'horizontal' || type === 'vertical') && refs.length !== 2)) return refs.map(function (r) { return [r]; });
    if ((type === 'horizontal' || type === 'vertical') && refs.length === 2) return null; // decided by kinds below
    if (refs.length <= 2) return [refs];
    return refs.slice(1).map(function (r) { return [refs[0], r]; });
  }

  // Add a relation and solve. Returns { ok, rels: [indices added], status: 'ok'|'redundant'|'conflict', analysis,
  // error }. A relation that over-defines the sketch is kept (drawn yellow / red, as SolidWorks does) unless
  // opts.rejectOver; when the solve fails the geometry stays where it was.
  function addRelation(sketch, type, refs, opts) {
    opts = opts || {};
    refs = (Array.isArray(refs) ? refs : [refs]).map(String);
    if (!TYPES[type]) return { ok: false, error: 'Unknown relation ' + type };
    var groups;
    if ((type === 'horizontal' || type === 'vertical') && refs.length === 2) {
      var kinds = refs.map(function (r) { return refKind(sketch.entities, parseRef(r)); });
      groups = kinds[0] === 'point' && kinds[1] === 'point' ? [refs] : refs.map(function (r) { return [r]; });
    } else groups = type === 'distance' || type === 'angle' ? [refs] : expand(type, refs);
    var added = [], saved = clone(sketch.entities), savedRels = clone(sketch.rels || []);
    sketch.rels = sketch.rels || [];
    for (var g = 0; g < groups.length; g++) {
      var rel = { type: type, refs: groups[g] };
      if (TYPES[type].dim) {
        rel.v = opts.value != null ? +opts.value : measure(sketch, type, groups[g]);
        if (opts.off != null) rel.off = +opts.off;
      }
      if (type === 'fix') {
        var r0 = parseRef(groups[g][0]), e = sketch.entities[r0.e];
        if (r0 && !r0.o && r0.s === null && e && e.t !== 'point') rel.at = paramNames(e).map(function (nm) { return pget(e, nm); });
        else { var pt = refPoint(sketch.entities, r0) || refCenter(sketch.entities, r0); if (pt) rel.at = [pt[0], pt[1]]; }
      }
      if (!relEquation(sketch.entities, rel)) { sketch.rels = savedRels; sketch.entities = saved; return { ok: false, error: TYPES[type].name + ' does not apply to that selection.' }; }
      sketch.rels.push(rel);
      added.push(sketch.rels.length - 1);
    }
    var res = solve(sketch);
    var an = analyze(sketch), worst = 'ok';
    added.forEach(function (i) { var s = an.rels[i]; if (s === 'conflict') worst = 'conflict'; else if (s === 'redundant' && worst === 'ok') worst = 'redundant'; });
    if (!res.ok) worst = 'conflict';
    if (worst !== 'ok' && opts.rejectOver) { sketch.rels = savedRels; sketch.entities = saved; return { ok: false, status: worst, error: 'Adding ' + TYPES[type].name + ' would over-define the sketch.' }; }
    return { ok: true, rels: added, status: worst, analysis: an };
  }
  function deleteRelation(sketch, index) {
    if (!sketch.rels || !sketch.rels[index]) return false;
    sketch.rels.splice(index, 1);
    if (!sketch.rels.length) delete sketch.rels;
    return true;
  }

  // Entity `index` was deleted: relations on it go, refs to later entities shift down.
  function removeEntity(sketch, index) {
    if (!sketch.rels) return;
    sketch.rels = sketch.rels.filter(function (rel) {
      return !rel.refs.some(function (r) { var p = parseRef(r); return p && !p.o && p.e === index; });
    }).map(function (rel) {
      rel.refs = rel.refs.map(function (r) { var p = parseRef(r); if (!p || p.o || p.e < index) return r; return String(p.e - 1) + String(r).slice(String(p.e).length); });
      return rel;
    });
    if (!sketch.rels.length) delete sketch.rels;
  }
  // The entity list was replaced (trim, mirror in place): keep relations whose entities survive as the same objects.
  function remap(sketch, before) {
    if (!sketch.rels) return;
    var map = before.map(function (e) { return sketch.entities.indexOf(e); });
    sketch.rels = sketch.rels.filter(function (rel) {
      return rel.refs.every(function (r) { var p = parseRef(r); return p && (p.o || map[p.e] >= 0); });
    }).map(function (rel) {
      rel.refs = rel.refs.map(function (r) { var p = parseRef(r); return p.o ? r : String(map[p.e]) + String(r).slice(String(p.e).length); });
      return rel;
    });
    clean(sketch);
  }
  // Drop relations whose refs no longer name anything of the right kind (an entity changed type, went away).
  function clean(sketch) {
    if (!sketch.rels) return 0;
    var n = sketch.rels.length;
    sketch.rels = sketch.rels.filter(function (rel) { return !!relEquation(sketch.entities, rel); });
    var dropped = n - sketch.rels.length;
    if (!sketch.rels.length) delete sketch.rels;
    return dropped;
  }

  // ------------------------------------------------------------------ inference (automatic relations while sketching)
  // Every point ref of entity i with its position.
  function pointRefs(sketch, i) {
    var e = sketch.entities[i], out = [];
    if (!e) return out;
    function add(s) { var r = String(i) + (s ? '.' + s : ''), p = refPoint(sketch.entities, parseRef(r)); if (p) out.push({ ref: r, pt: p }); }
    switch (e.t) {
      case 'point': add(''); break;
      case 'line': add('p1'); add('p2'); add('mid'); break;
      case 'slot': add('p1'); add('p2'); add('c'); break;
      case 'arc': add('c'); add('p1'); add('p2'); break;
      case 'circle': add('c'); break;
      case 'rect': case 'crect': case 'poly': case 'polyline': {
        var c = corners(e);
        for (var k = 0; k < c.length; k++) add('v' + k);
        if (e.t !== 'polyline') add('c');
        break;
      }
    }
    return out;
  }
  function curveRefs(sketch, i) {
    var e = sketch.entities[i], out = [];
    if (!e) return out;
    if (e.t === 'line' || e.t === 'slot' || e.t === 'circle' || e.t === 'arc') out.push(String(i));
    var c = corners(e);
    if (c) for (var k = 0; k < (closedCorners(e) ? c.length : c.length - 1); k++) out.push(i + '.e' + k);
    return out;
  }
  function isCenterRef(sketch, ref) { var p = parseRef(ref), e = p && !p.o && sketch.entities[p.e]; return !!(e && p.s === 'c' && (e.t === 'circle' || e.t === 'arc')); }
  // Relations SolidWorks would infer for entity i as drawn: coincident / concentric / midpoint where one of its points
  // lands exactly on an existing point (or the origin), horizontal / vertical for an axis-aligned line.
  function inferCandidates(sketch, i) {
    var e = sketch.entities[i], out = [];
    if (!e) return out;
    var tol = 1e-9 * Math.max(1, Math.abs(e.x1 || e.x || e.cx || 0), Math.abs(e.y1 || e.y || e.cy || 0)) + 1e-9;
    if (e.t === 'line') {
      var dx = Math.abs(e.x2 - e.x1), dy = Math.abs(e.y2 - e.y1);
      if (dy < tol && dx > tol) out.push({ type: 'horizontal', refs: [String(i)], at: [(e.x1 + e.x2) / 2, e.y1] });
      else if (dx < tol && dy > tol) out.push({ type: 'vertical', refs: [String(i)], at: [e.x1, (e.y1 + e.y2) / 2] });
    }
    pointRefs(sketch, i).forEach(function (pr) {
      if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && (e.t === 'rect' || e.t === 'crect' || e.t === 'slot' || e.t === 'poly'))) return;
      if (Math.abs(pr.pt[0]) < tol && Math.abs(pr.pt[1]) < tol) { out.push({ type: 'coincident', refs: [pr.ref, 'O'], at: pr.pt }); return; }
      var hit = null;
      for (var j = 0; j < sketch.entities.length && !hit; j++) {
        if (j === i) continue;
        var cands = pointRefs(sketch, j);
        for (var k = 0; k < cands.length; k++) {
          var q = cands[k];
          if (Math.abs(q.pt[0] - pr.pt[0]) < tol && Math.abs(q.pt[1] - pr.pt[1]) < tol) { hit = q; break; }
        }
      }
      if (!hit) return;
      if (isCenterRef(sketch, pr.ref) && isCenterRef(sketch, hit.ref)) out.push({ type: 'concentric', refs: [pr.ref.replace(/\.c$/, ''), hit.ref.replace(/\.c$/, '')], at: pr.pt });
      else if (/\.mid$/.test(hit.ref)) out.push({ type: 'midpoint', refs: [pr.ref, hit.ref.replace(/\.mid$/, '')], at: pr.pt });
      else if (/\.c$/.test(hit.ref) && /^(rect|crect|slot|poly)$/.test(sketch.entities[parseRef(hit.ref).e].t)) return;
      else out.push({ type: 'coincident', refs: [pr.ref, hit.ref], at: pr.pt });
    });
    return out;
  }
  // Add the inferred relations of entity i, skipping any that would over-define the sketch. Returns the added rels.
  function infer(sketch, i) {
    var added = [];
    inferCandidates(sketch, i).forEach(function (c) {
      var rel = { type: c.type, refs: c.refs };
      if (!relEquation(sketch.entities, rel)) return;
      (sketch.rels = sketch.rels || []).push(rel);
      var an = analyze(sketch), k = sketch.rels.length - 1;
      if (an.rels[k] !== 'ok') { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; return; }
      added.push(rel);
    });
    return added;
  }
  // What a temporary (being-drawn) entity would infer: [{ type, at }] for the yellow inference icons.
  function inferPreview(sketch, e) {
    if (!e) return [];
    var tmp = { entities: (sketch.entities || []).concat([e]) };
    return inferCandidates(tmp, tmp.entities.length - 1).map(function (c) { return { type: c.type, at: c.at }; });
  }

  // ------------------------------------------------------------------ dragging
  // Drag ref (a point ref, or a whole entity by `delta` from its start) toward `to`, keeping every relation and
  // dimension: a least-squares pull (hard equations plus a weak pull on the dragged geometry) followed by an exact
  // minimum-norm projection onto the relations. `start` is a copy of the entities when the drag began.
  function drag(sketch, ref, to, start) {
    var R = parseRef(ref);
    if (!R || R.o) return { ok: false };
    var targets = {};                                  // dimension values held at their drag-start values
    var base = { entities: start || sketch.entities, dims: sketch.dims, rels: sketch.rels };
    (sketch.dims || []).forEach(function (d, i) { var v = K && base.entities[d.e] ? K.dimValue(base.entities[d.e], d) : null; if (v != null) targets[i] = v; });
    var w = 0.1, pull;
    var P0 = refPoint(base.entities, R);
    if (P0) pull = { n: 2, ents: [R.e], soft: true, f: function (E) { var p = refPoint(E, R); return [w * (p[0] - to[0]), w * (p[1] - to[1])]; } };
    else {
      var e0 = base.entities[R.e];
      if (!e0 || !K) return { ok: false };
      var tgt = K.translateEntity(e0, to[0], to[1]), names = paramNames(e0);
      pull = { n: names.length, ents: [R.e], soft: true, f: function (E) { return names.map(function (nm) { return w * (pget(E[R.e], nm) - pget(tgt, nm)); }); } };
    }
    var sys = buildSystem(sketch, { dimTargets: targets, extra: [pull] });
    lm(sys, { leastSquares: true, maxIt: 60 });
    var r = lm(sys, { only: function (c) { return !c.soft; } });
    if (!r.ok) return { ok: false };
    writeBack(sketch, sys);
    return { ok: true };
  }

  // ------------------------------------------------------------------ descriptions
  var ENTITY_NAMES = { line: 'Line', rect: 'Rectangle', crect: 'Rectangle', circle: 'Circle', poly: 'Polygon', slot: 'Slot', arc: 'Arc', point: 'Point', polyline: 'Polyline' };
  function refName(sketch, ref) {
    var p = parseRef(ref);
    if (!p) return String(ref);
    if (p.o) return 'Origin';
    var e = sketch.entities[p.e], base = (e ? ENTITY_NAMES[e.t] || 'Entity' : 'Entity') + (p.e + 1);
    switch (p.s) {
      case null: return base;
      case 'p': return base + (p.k === 1 ? ' start' : ' end');
      case 'mid': return base + ' midpoint';
      case 'c': return base + ' center';
      case 'v': return base + ' corner ' + (p.k + 1);
      case 'e': return base + ' edge ' + (p.k + 1);
    }
    return base;
  }
  function describe(sketch, rel) {
    var t = TYPES[rel.type];
    var s = (t ? t.name : rel.type) + ': ' + rel.refs.map(function (r) { return refName(sketch, r); }).join(', ');
    if (t && t.dim) s += ' = ' + (Math.round(rel.v * 1e4) / 1e4) + (rel.type === 'angle' ? '°' : '');
    return s;
  }

  // ------------------------------------------------------------------ script round trip (Builder / generateScript hooks)
  // kernel.js is not edited for this: `.rel(type, refs, value)` and `.solve()` are added to the SketchBuilder
  // prototype, and generateScript is wrapped to write each sketch's relations before its `.id();`.
  function relArgs(rel) {
    var s = JSON.stringify(rel.type) + ', ' + JSON.stringify(rel.refs);
    if (TYPES[rel.type] && TYPES[rel.type].dim) s += rel.off != null ? ', ' + JSON.stringify({ value: rel.v, off: rel.off }) : ', ' + rel.v;
    else if (rel.type === 'fix' && rel.at) s += ', ' + JSON.stringify({ at: rel.at });
    return s;
  }
  function install(Kn) {
    if (!Kn || Kn.__sketchSolver) return;
    Kn.__sketchSolver = true;
    var SBP = Object.getPrototypeOf(new Kn.Builder(Kn.newModel('x')).sketch('Front'));
    // .rel(type, refs, value | { at }): add a relation (or distance / angle dimension) and re-solve the sketch
    SBP.rel = function (type, refs, opt) {
      var o = {};
      if (typeof opt === 'number' || typeof opt === 'string') o.value = this._v(opt);
      else if (opt && opt.value != null) o.value = this._v(opt.value);
      refs = Array.isArray(refs) ? refs : [refs];
      if (type === 'fix' && opt && Array.isArray(opt.at)) {
        (this.f.rels = this.f.rels || []).push({ type: 'fix', refs: refs.map(String), at: opt.at.map(Number) });
        solve(this.f);
        return this;
      }
      if (opt && typeof opt === 'object' && opt.off != null) o.off = +opt.off;
      var r = addRelation(this.f, type, refs, o);
      if (!r.ok) throw new Error('rel(' + JSON.stringify(type) + '): ' + r.error);
      return this;
    };
    SBP.solve = function () { solve(this.f); return this; };
    var gen = Kn.generateScript;
    Kn.generateScript = function (model) {
      var s = gen.apply(this, arguments);
      (model.features || []).forEach(function (f) {
        if (f.type !== 'sketch' || !f.rels || !f.rels.length) return;
        var head = 'var f' + f.id + ' = p.sketch(', at = s.indexOf(head);
        if (at < 0) return;
        var end = s.indexOf('\n  .id();', at);
        if (end < 0) return;
        var add = f.rels.map(function (rel) { return '\n  .rel(' + relArgs(rel) + ')'; }).join('');
        s = s.slice(0, end) + add + s.slice(end);
      });
      return s;
    };
  }
  if (K) install(K);

  return {
    TYPES: TYPES, STATUS_TEXT: STATUS_TEXT, parseRef: parseRef, paramNames: paramNames,
    refPoint: function (sketch, ref) { return refPoint(sketch.entities, parseRef(ref)); },
    refCurve: function (sketch, ref) { return refCurve(sketch.entities, parseRef(ref)); },
    refKind: function (sketch, ref) { return refKind(sketch.entities, parseRef(ref)); },
    pointRefs: pointRefs, curveRefs: curveRefs, refName: refName, describe: describe,
    buildSystem: buildSystem, analyze: analyze, solve: solve, drag: drag,
    setDim: setDim, setRelValue: setRelValue, measure: measure,
    applicable: applicable, addRelation: addRelation, deleteRelation: deleteRelation,
    removeEntity: removeEntity, remap: remap, clean: clean,
    infer: infer, inferCandidates: inferCandidates, inferPreview: inferPreview, install: install
  };
})();
