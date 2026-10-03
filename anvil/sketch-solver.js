// sketch-solver.js — sketch relations, driving dimensions and the numeric solver behind them.
//
// A sketch feature may carry `rels`: [{ type, refs: [ref, …], v?, at? }]. A ref names a piece of an entity by index:
//   'O'      the sketch origin (fixed at 0, 0)
//   '3'      entity 3 as a whole (a line, circle/arc, slot axis, or a point entity)
//   '3.p1'   start point (line, slot, arc)      '3.p2' end point      '3.mid' midpoint (line, slot)
//   '3.c'    centre (circle, arc, polygon, rectangles, slot)
//   '3.v0'   vertex i (rectangles, polygon, polyline)      '3.e0' edge i (same entities, as a line)
// Relation types: coincident, horizontal, vertical, parallel, perpendicular, tangent, concentric, equal, midpoint,
// collinear, symmetric (two points / lines / circles about a centerline: refs [a, b, axis]), fix (at: the fixed
// values), and the two-entity driving dimensions distance and angle (v: value, degrees for angle). A dimension
// (relation or Smart Dimension) with `driven: true` is a reference dimension: it adds no equation and its value
// follows the geometry (updateDriven after every solve). Entities with `construction: true` are solved like the
// others but left out of profiles (Kernel.sketchProfile skips them). The single-entity Smart Dimensions in `dims` (Kernel.dimGeometry) are driving too: each holds the value
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
  // mirror image of p about line L
  function reflect(p, L) {
    var d = sub(L.b, L.a), l2 = dot(d, d);
    if (l2 < 1e-24) return [p[0], p[1]];
    var t = dot(sub(p, L.a), d) / l2, f = [L.a[0] + d[0] * t, L.a[1] + d[1] * t];
    return [2 * f[0] - p[0], 2 * f[1] - p[1]];
  }

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
    symmetric: { name: 'Symmetric', glyph: '⇹' },
    // r9/sketch9: an offset copy of a rectangle, refs [original, copy] (whole entities): its sides are offset by the same
    // distance all round (one offset dimension drives it, as SolidWorks' Offset Entities links them). Added by Offset
    // Entities only, never offered in Add Relations.
    offset: { name: 'Offset', glyph: '⧈' },
    fix: { name: 'Fix', glyph: 'F' },
    distance: { name: 'Distance', glyph: '↔', dim: true },
    angle: { name: 'Angle', glyph: '∠', dim: true }
  };
  var ADD_ORDER = ['horizontal', 'vertical', 'coincident', 'midpoint', 'collinear', 'parallel', 'perpendicular', 'tangent', 'concentric', 'equal', 'symmetric', 'fix'];

  // Does relation `type` apply to refs of these kinds? (order-free; returns the kinds in the order the residual wants
  // them, as an index permutation, or null)
  function match(type, kinds) {
    var n = kinds.length;
    function perm(a, b) { if (kinds[0] === a && kinds[1] === b) return [0, 1]; if (kinds[0] === b && kinds[1] === a) return [1, 0]; return null; }
    switch (type) {
      case 'symmetric':
        // two items of one kind and the centerline (a line) they are mirrored about; with three lines the last is the axis
        if (n !== 3) return null;
        for (var k = 2; k >= 0; k--) {
          if (kinds[k] !== 'line') continue;
          var o = [0, 1, 2].filter(function (q) { return q !== k; });
          if (kinds[o[0]] === kinds[o[1]]) return [o[0], o[1], k];
        }
        return null;
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
  // r9/sketch9: refs A and B name two whole slots (a slot and its offset copy: the radial offset dimension)
  function slotPair(ents, A, B) {
    return !!(A && B && !A.o && !B.o && A.s === null && B.s === null && A.e !== B.e && ents[A.e] && ents[B.e] && ents[A.e].t === 'slot' && ents[B.e].t === 'slot');
  }

  function relEquation(ents, rel, rels) {
    var R = (rel.refs || []).map(parseRef);
    if (!TYPES[rel.type] || R.some(function (r) { return !r; })) return null;
    if (rel.type === 'offset') {
      // r9/sketch9: (w' - w) - (h' - h) = 0 between a rectangle and its offset copy (same kind, whole entities)
      var e0 = R.length === 2 && !R[0].o && !R[1].o && R[0].s === null && R[1].s === null && R[0].e !== R[1].e ? ents[R[0].e] : null, e1 = e0 && ents[R[1].e];
      if (!e1 || !/^(rect|crect)$/.test(e0.t) || e1.t !== e0.t) return null;
      var i0 = R[0].e, i1 = R[1].e;
      return { n: 1, ents: [i0, i1], f: function (E) { return [(E[i1].w - E[i0].w) - (E[i1].h - E[i0].h)]; } };
    }
    var kinds = R.map(function (r) { return refKind(ents, r); });
    if (kinds.some(function (k) { return !k; })) return null;
    var p = match(rel.type, kinds);
    if (!p) return null;
    var A = R[p[0]], B = R[p[1]], kA = kinds[p[0]], kB = kinds[p[1]], Ax = p.length > 2 ? R[p[2]] : null;
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
      case 'symmetric': {
        // mirror pairs: the midpoint of each pair lies on the axis and the pair's chord is perpendicular to it
        var pairs;
        if (kA === 'point') pairs = [[function (E) { return P(A, E); }, function (E) { return P(B, E); }]];
        else if (kA === 'circle') pairs = [[function (E) { return C(A, E).c; }, function (E) { return C(B, E).c; }]];
        else {
          // two lines: pair the ends the way the geometry mirrors best now (a.p1 with b.p1, or a.p1 with b.p2)
          var la = C(A, ents), lb = C(B, ents), ax0 = C(Ax, ents), m1 = reflect(la.a, ax0);
          var swap = len(sub(m1, lb.b)) < len(sub(m1, lb.a));
          pairs = [[function (E) { return C(A, E).a; }, function (E) { var l = C(B, E); return swap ? l.b : l.a; }],
                   [function (E) { return C(A, E).b; }, function (E) { var l = C(B, E); return swap ? l.a : l.b; }]];
        }
        n = pairs.length * 2 + (kA === 'circle' ? 1 : 0);
        f = function (E) {
          var L = C(Ax, E), dir = unit(sub(L.b, L.a)), out = [];
          pairs.forEach(function (pr) {
            var a = pr[0](E), b = pr[1](E);
            out.push(lineDist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L), dot(sub(b, a), dir));
          });
          if (kA === 'circle') out.push(C(A, E).r - C(B, E).r);
          return out;
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
        if (rel.dir === 'r' && kA === 'circle' && kB === 'circle') {
          // r6/sketch6: radial distance between two (concentric) circles / arcs, rB - rA signed as the geometry started
          // (the driving dimension Offset Entities adds between a circle and its offset copy)
          var s4 = sgn(C(B, ents).r - C(A, ents).r);
          f = function (E) { return [s4 * (C(B, E).r - C(A, E).r) - v]; };
        }
        else if (rel.dir === 'r' && slotPair(ents, A, B)) {
          // r9/sketch9: the offset between a slot and its offset copy (same centres): half the width difference
          var s5 = sgn(ents[B.e].w - ents[A.e].w);
          f = function (E) { return [s5 * (E[B.e].w - E[A.e].w) / 2 - v]; };
        }
        else if ((rel.dir === 'h' || rel.dir === 'v') && kA !== 'line' && kB !== 'line') {
          // horizontal / vertical distance between two points (or centres), signed as the geometry started
          var ax = rel.dir === 'h' ? 0 : 1, pc = function (r, k, E) { return k === 'point' ? P(r, E) : C(r, E).c; };
          var s3 = sgn(pc(B, kB, ents)[ax] - pc(A, kA, ents)[ax]);
          f = function (E) { return [s3 * (pc(B, kB, E)[ax] - pc(A, kA, E)[ax]) - v]; };
        }
        else if (kA === 'point' && kB === 'point') f = function (E) { return [len(sub(P(A, E), P(B, E))) - v]; };
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
        // rel.sup (r5/sketch5): the supplementary angle, measured to the second line reversed (the dimension was
        // placed in the obtuse quadrant); same sign as the plain angle, magnitude 180 - |angle|
        var sup = !!rel.sup, ang = function (E) { var a = angleDeg(C(A, E), C(B, E)); return sup ? (a >= 0 ? 180 - a : -180 - a) : a; };
        var s2 = sgn(ang(ents));
        f = function (E) { return [s2 * ang(E) - v]; };
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
    var only = opts.entities || null;   // { index: true }: unknowns of these entities only, and the equations that touch them
    ents.forEach(function (e, i) { if (only && !only[i]) return; paramNames(e).forEach(function (nm) { vars.push({ e: i, n: nm }); owner.push(i); }); });
    var cons = [];
    (sketch.rels || []).forEach(function (rel, i) {
      var r = rel;
      if (opts.relTargets && opts.relTargets[i] != null) { r = clone(rel); r.v = opts.relTargets[i]; }
      if (rel.driven && TYPES[rel.type] && TYPES[rel.type].dim) { cons.push({ src: 'rel', index: i, n: 0, driven: true, ents: [] }); return; }
      var q = relEquation(ents, r, sketch.rels);
      cons.push(q ? { src: 'rel', index: i, n: q.n, f: q.f, ents: q.ents } : { src: 'rel', index: i, n: 0, bad: true, ents: [] });
    });
    (sketch.dims || []).forEach(function (d, i) {
      if (d.driven) { cons.push({ src: 'dim', index: i, n: 0, driven: true, ents: [] }); return; }
      var q = dimEquation(ents, d, opts.dimTargets ? opts.dimTargets[i] : null);
      cons.push(q ? { src: 'dim', index: i, n: q.n, f: q.f, ents: q.ents } : { src: 'dim', index: i, n: 0, bad: true, ents: [] });
    });
    (opts.extra || []).forEach(function (q, i) { cons.push({ src: 'extra', index: i, n: q.n, f: q.f, ents: q.ents, soft: q.soft }); });
    if (only) cons = cons.filter(function (c) { return c.n && c.ents.some(function (e) { return only[e]; }); });
    var row = 0, byEnt = ents.map(function () { return []; });
    cons.forEach(function (c) { c.row = row; row += c.n; c.ents.forEach(function (e) { if (byEnt[e]) byEnt[e].push(c); }); });
    var scale = 1;
    vars.forEach(function (v) { if (v.n !== 'a0' && v.n !== 'a1' && v.n !== 'rot') scale = Math.max(scale, Math.abs(pget(ents[v.e], v.n))); });
    return { ents: ents, vars: vars, cons: cons, m: row, byEnt: byEnt, scale: scale };
  }
  // The entities tied to entity e through the system's equations: { set: { index: true }, count }.
  function connected(sys, e) {
    var set = {}, count = 0, stack = [e];
    while (stack.length) {
      var i = stack.pop();
      if (set[i] || !sys.ents[i]) continue;
      set[i] = true; count++;
      sys.byEnt[i].forEach(function (c) { if (c.n) c.ents.forEach(function (j) { if (!set[j]) stack.push(j); }); });
    }
    return { set: set, count: count };
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

  // the column indices of the non-zeros in each row of J, and the row indices of the non-zeros in each column (ascending)
  function sparseRows(J, m, n) {
    var out = new Array(m);
    for (var i = 0; i < m; i++) { var row = J[i], l = []; for (var j = 0; j < n; j++) if (row[j] !== 0) l.push(j); out[i] = l; }
    return out;
  }
  function sparseCols(J, m, n) {
    var out = new Array(n), j;
    for (j = 0; j < n; j++) out[j] = [];
    for (var i = 0; i < m; i++) { var row = J[i]; for (j = 0; j < n; j++) if (row[j] !== 0) out[j].push(i); }
    return out;
  }
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
        // J^T J from the non-zeros of each row (J is sparse: a relation touches one or two entities); the terms are
        // summed in the same order as the dense product, so the result is the same to the last bit
        var rowNz = sparseRows(J, m, n);
        for (i = 0; i < m; i++) {
          var nz = rowNz[i], Ji = J[i];
          for (var a1 = 0; a1 < nz.length; a1++) { var ja = nz[a1], va = Ji[ja], Na = N[ja]; for (var b1 = 0; b1 <= a1; b1++) Na[nz[b1]] += va * Ji[nz[b1]]; }
        }
        for (j = 0; j < n; j++) for (k = 0; k < j; k++) N[k][j] = N[j][k];
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
      // G = J M J^T from the non-zeros of each column of J, summed in the dense product's order (same result, bit for bit)
      var G = [], diag = 0, colNz = sparseCols(J, m, n);
      for (i = 0; i < m; i++) G.push(new Float64Array(m));
      for (j = 0; j < n; j++) {
        var cz = colNz[j];
        for (var a2 = 0; a2 < cz.length; a2++) { var ia = cz[a2], Ga = G[ia], va2 = J[ia][j]; for (var b2 = 0; b2 <= a2; b2++) Ga[cz[b2]] += va2 * MJt[cz[b2]][j]; }
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
  //   'conflict'|'invalid'|'driven'], dims: [...same], redundant, conflicts, unknowns, equations }
  function analyze(sketch, sysIn) {
    var sys = sysIn || buildSystem(sketch);
    var n = sys.vars.length, r = residuals(sys), J = jacobian(sys), info = rankInfo(sys, J);
    var tol = 1e-7 * sys.scale;
    var out = { dof: n - info.rank, unknowns: n, equations: sys.m, rank: info.rank, rels: [], dims: [], redundant: 0, conflicts: 0 };
    var entState = sys.ents.map(function () { return null; });
    sys.cons.forEach(function (c, ci) {
      if (c.src === 'extra') return;
      var st = 'ok';
      if (c.driven) st = 'driven';
      else if (c.bad) st = 'invalid';
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
    // opts.part = entity index: only the geometry tied to it can move (a dimension edit), so that part is solved alone
    // (as a drag is): smaller matrices in a sketch of separate pieces, and a conflict elsewhere does not block it
    if (opts.part != null && sys.ents[opts.part]) {
      var pc = connected(sys, opts.part);
      if (pc.count < sys.ents.length) sys = buildSystem(sketch, Object.assign({}, opts, { entities: pc.set }));
    }
    var x0 = getX(sys);
    var r = lm(sys, { mob: mobility(sys, opts.mob) });
    var moved = 0, x1 = getX(sys);
    for (var j = 0; j < x0.length; j++) moved = Math.max(moved, Math.abs(x1[j] - x0[j]));
    if (r.ok || opts.force) writeBack(sketch, sys);
    updateDriven(sketch);
    return { ok: r.ok, it: r.it, res: r.res, moved: r.ok || opts.force ? moved : 0 };
  }

  // Driven (reference) distance / angle relations read their value off the geometry. Single-entity Smart Dimensions
  // hold no value (Kernel.dimValue reads the entity), so a driven one is always current.
  function updateDriven(sketch) {
    (sketch.rels || []).forEach(function (rel) {
      if (!rel.driven || !TYPES[rel.type] || !TYPES[rel.type].dim) return;
      var v = measure(sketch, rel.type, rel.refs, rel.dir, rel.sup);
      if (v != null && isFinite(v)) rel.v = Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-9 * Math.max(1, Math.abs(v)) ? Math.round(v * 1e6) / 1e6 : v;
    });
  }
  // Would this dimension ('dim' | 'rel', index), taken as driving, over-define the sketch? (the 'Make this dimension
  // driven?' question). True when, taken as driving, it removes no degree of freedom (it repeats what the rest already
  // says, whichever equation the rank reduction happens to flag) or adds a conflict.
  function overDefines(sketch, kind, index) {
    var list = kind === 'rel' ? sketch.rels : sketch.dims, item = list && list[index];
    if (!item) return false;
    var was = item.driven;
    item.driven = true;
    var a0 = analyze(sketch);
    delete item.driven;
    var a1 = analyze(sketch);
    if (was) item.driven = true;
    return a1.dof === a0.dof || a1.conflicts > a0.conflicts;
  }
  // Make dimension ('dim' | 'rel', index) driven (reference) or driving. Driving again holds the value it reads now.
  function setDriven(sketch, kind, index, on) {
    var list = kind === 'rel' ? sketch.rels : sketch.dims, item = list && list[index];
    if (!item || (kind === 'rel' && !(TYPES[item.type] && TYPES[item.type].dim))) return { ok: false, error: 'Not a dimension.' };
    var over = false;
    if (on) { item.driven = true; if (kind === 'rel') updateDriven(sketch); }
    else { over = overDefines(sketch, kind, index); delete item.driven; if (kind === 'rel') { var v = measure(sketch, item.type, item.refs, item.dir, item.sup); if (v != null) item.v = v; } }
    var an = analyze(sketch), st = an[kind === 'rel' ? 'rels' : 'dims'][index];
    return { ok: true, state: over && st === 'ok' ? 'redundant' : st, analysis: an };
  }

  // ------------------------------------------------------------------ editing helpers
  var DRIVEN_MSG = 'This is a driven dimension: its value follows the geometry. Make it driving to change it.';
  // What a failed edit fights with: the sketch is solved in the least-squares sense with the new value, and the other
  // relations / dimensions left unsatisfied (largest first) are named, so the message can say "conflicts with Line1
  // length (50)" as SolidWorks' "over defining" list does. `skip` = { src, index } is the edited item.
  var DIM_WORDS = { len: 'length', dx: 'horizontal distance', dy: 'vertical distance', w: 'width', h: 'height', dia: 'diameter', r: 'radius', seg: 'segment length' };
  function dimName(sketch, d) {
    var e = sketch.entities[d.e], v = e && K ? K.dimValue(e, d) : null;
    return (e ? (ENTITY_NAMES[e.t] || 'Entity') : 'Entity') + (d.e + 1) + ' ' + (DIM_WORDS[d.k] || d.k) + (v != null ? ' (' + Math.round(v * 1e4) / 1e4 + ')' : '');
  }
  function conflictNames(sketch, opts, skip, max) {
    try {
      var sys = buildSystem(sketch, opts), tol = 1e-6 * sys.scale, list = [];
      lm(sys, { leastSquares: true, maxIt: 60 });
      var r = residuals(sys);
      sys.cons.forEach(function (c) {
        if (!c.n || c.soft || c.src === 'extra' || (skip && c.src === skip.src && c.index === skip.index)) return;
        var worst = 0;
        for (var k = 0; k < c.n; k++) worst = Math.max(worst, Math.abs(r[c.row + k]));
        if (worst > tol) list.push({ w: worst, rank: c.src === 'dim' || (TYPES[sketch.rels[c.index].type] || {}).dim ? 0 : sketch.rels[c.index].type === 'coincident' ? 2 : 1, text: c.src === 'dim' ? dimName(sketch, sketch.dims[c.index]) : describe(sketch, sketch.rels[c.index]) });
      });
      list.sort(function (a, b) { return a.rank - b.rank || b.w - a.w; });   // dimensions first: they are what one changes
      return list.slice(0, max || 3).map(function (x) { return x.text; });
    } catch (err) { return []; }
  }
  function conflictMessage(names) {
    return 'That value cannot be reached: it conflicts with ' + (names.length ? names.join('; ') : 'the sketch\'s other relations or dimensions') + '.';
  }
  // Set placed dimension `index` (or a dimension object not in sketch.dims) to v and re-solve the whole sketch.
  // Returns { ok, error }; on failure the sketch is unchanged.
  function setDim(sketch, d, v) {
    v = +v;
    if (!(v > 0) || !isFinite(v)) return { ok: false, error: 'Dimension must be a positive number.' };
    var index = typeof d === 'number' ? d : (sketch.dims || []).indexOf(d);
    var dim = index >= 0 ? sketch.dims[index] : d;
    if (dim.driven) return { ok: false, error: DRIVEN_MSG };
    var e = sketch.entities[dim.e];
    if (!e || !K || !K.dimGeometry(e, dim)) return { ok: false, error: 'That dimension no longer applies to the entity.' };
    var saved = clone(sketch.entities);
    K.setDimValue(e, dim, v);              // the kernel's one-entity move is the starting guess
    var opts = { dimTargets: {}, part: dim.e };
    if (index >= 0) opts.dimTargets[index] = v;
    else opts.extra = [dimEquation(sketch.entities, dim, v)];
    var r = solve(sketch, opts);
    if (!r.ok) { var names = conflictNames(sketch, opts, index >= 0 ? { src: 'dim', index: index } : null); sketch.entities = saved; return { ok: false, error: conflictMessage(names), conflicts: names }; }
    return { ok: true };
  }
  // Change the value of a distance / angle relation and re-solve.
  function setRelValue(sketch, index, v) {
    var rel = (sketch.rels || [])[index];
    if (!rel || !TYPES[rel.type] || !TYPES[rel.type].dim) return { ok: false, error: 'Not a dimension.' };
    if (rel.driven) return { ok: false, error: DRIVEN_MSG };
    v = +v;
    if (!(v >= 0) || !isFinite(v) || (rel.type === 'angle' && v > 180)) return { ok: false, error: rel.type === 'angle' ? 'Angle must be between 0 and 180 degrees.' : 'Dimension must be a positive number.' };
    var saved = clone(sketch.entities), t = {};
    t[index] = v;
    var pe = rel.refs.map(parseRef).filter(function (q) { return q && !q.o; })[0];
    var r = solve(sketch, { relTargets: t, part: pe ? pe.e : null });
    if (!r.ok) { var names = conflictNames(sketch, { relTargets: t }, { src: 'rel', index: index }); sketch.entities = saved; return { ok: false, error: conflictMessage(names), conflicts: names }; }
    rel.v = v;
    return { ok: true };
  }
  // The value a distance / angle relation reads on the current geometry (dir 'h' / 'v': the horizontal / vertical
  // distance between two points or centres).
  function measure(sketch, type, refs, dir, sup) {
    var ents = sketch.entities, R = refs.map(parseRef), kinds = R.map(function (r) { return refKind(ents, r); });
    var p = match(type, kinds);
    if (!p) return null;
    var A = R[p[0]], B = R[p[1]], kA = kinds[p[0]], kB = kinds[p[1]];
    if (type === 'angle') { var ag = Math.abs(angleDeg(refCurve(ents, A), refCurve(ents, B))); return sup ? 180 - ag : ag; }
    if (type === 'distance' && dir === 'r' && slotPair(ents, A, B)) return Math.abs(ents[B.e].w - ents[A.e].w) / 2;   // r9/sketch9
    if (kB === 'line') {
      var from = kA === 'point' ? refPoint(ents, A) : kA === 'circle' ? refCurve(ents, A).c : (function () { var l = refCurve(ents, A); return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]; })();
      return Math.abs(lineDist(from, refCurve(ents, B)));
    }
    if (type === 'distance' && dir === 'r' && kA === 'circle' && kB === 'circle') return Math.abs(refCurve(ents, B).r - refCurve(ents, A).r);
    if (type === 'distance' && (dir === 'h' || dir === 'v')) return Math.abs(refCenter(ents, B)[dir === 'h' ? 0 : 1] - refCenter(ents, A)[dir === 'h' ? 0 : 1]);
    return len(sub(refCenter(ents, A), refCenter(ents, B)));
  }

  // Relation types that apply to a selection of refs (the Add Relations list), in SolidWorks' order.
  function applicable(sketch, refs) {
    var R = refs.map(parseRef);
    if (!R.length || R.some(function (r) { return !r; })) return [];
    var kinds = R.map(function (r) { return refKind(sketch.entities, r); });
    if (kinds.some(function (k) { return !k; })) return [];
    return ADD_ORDER.filter(function (t) {
      if (t === 'symmetric') return R.length === 3 && !!match(t, kinds);
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
    } else if (type === 'symmetric') groups = [symOrder(sketch, refs)];
    else groups = type === 'distance' || type === 'angle' ? [refs] : expand(type, refs);
    var added = [], saved = clone(sketch.entities), savedRels = clone(sketch.rels || []), before = analyze(sketch);
    sketch.rels = sketch.rels || [];
    for (var g = 0; g < groups.length; g++) {
      var rel = { type: type, refs: groups[g] };
      if (TYPES[type].dim) {
        if (type === 'distance' && (opts.dir === 'h' || opts.dir === 'v') && groups[g].every(function (r) { return refKind(sketch.entities, parseRef(r)) !== 'line'; })) rel.dir = opts.dir;
        if (type === 'distance' && opts.dir === 'r' && (groups[g].every(function (r) { return refKind(sketch.entities, parseRef(r)) === 'circle'; }) || slotPair(sketch.entities, parseRef(groups[g][0]), parseRef(groups[g][1])))) rel.dir = 'r';
        // angle (r5/sketch5): sup = the supplementary angle, q = -1 drawn on the reversed rays, ta = label angle from
        // the middle of the arc (degrees)
        if (type === 'angle' && opts.sup) rel.sup = true;
        if (type === 'angle' && +opts.q === -1) rel.q = -1;
        if (type === 'angle' && opts.ta != null) rel.ta = +opts.ta;
        rel.v = opts.value != null && !opts.driven ? +opts.value : measure(sketch, type, groups[g], rel.dir, rel.sup);
        if (opts.off != null) rel.off = +opts.off;
        if (opts.tx != null && type === 'distance') rel.tx = +opts.tx;
        if (opts.driven) rel.driven = true;
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
    if (!res.ok || an.conflicts > before.conflicts) worst = 'conflict';
    // the rank reduction flags whichever equation comes last, so a new relation repeating an older dimension shows up
    // as that dimension turning redundant: judge by the count, not only by the added rows
    else if (worst === 'ok' && an.redundant > before.redundant) worst = 'redundant';
    if (worst !== 'ok' && opts.rejectOver) { sketch.rels = savedRels; sketch.entities = saved; return { ok: false, status: worst, error: 'Adding ' + TYPES[type].name + ' would over-define the sketch.' }; }
    var out = { ok: true, rels: added, status: worst, analysis: an };
    if (worst === 'conflict' && added.length) out.conflicts = conflictNames(sketch, {}, { src: 'rel', index: added[0] });   // what it fights, for the message
    return out;
  }
  // Symmetric refs in [a, b, axis] order; when more than one of the three could be the axis, a construction line
  // (a centerline) is preferred.
  function symOrder(sketch, refs) {
    var kinds = refs.map(function (r) { return refKind(sketch.entities, parseRef(r)); });
    if (kinds.length !== 3) return refs;
    for (var k = 2; k >= 0; k--) {
      var p = parseRef(refs[k]), e = p && !p.o && sketch.entities[p.e], o = [0, 1, 2].filter(function (q) { return q !== k; });
      if (kinds[k] === 'line' && e && e.construction && kinds[o[0]] === kinds[o[1]]) return [refs[o[0]], refs[o[1]], refs[k]];
    }
    var m = match('symmetric', kinds);
    return m ? m.map(function (i) { return refs[i]; }) : refs;
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
  // Trim Entities replaced entity `idx` of `before` (the old entity list) by the pieces now in sketch.entities (new
  // objects in its place; every other entity is the same object). As SolidWorks does, the pieces keep the trimmed
  // entity's relations that still make sense on a part of it (Horizontal, Vertical, Parallel, Tangent, Concentric,
  // a point lying on it, ... and the relations of an end that survives), and each new end gets a Coincident with the
  // entity it was trimmed at. Placed dimensions follow their entities (a radius stays on the arc). Falls back to
  // dropping the trimmed entity's relations when keeping them would leave the sketch unsolvable.
  var KEEP_ON_PIECE = { horizontal: 1, vertical: 1, parallel: 1, perpendicular: 1, collinear: 1, tangent: 1, concentric: 1, coincident: 1, angle: 1, distance: 1 };
  function afterTrim(sketch, before, idx) {
    var E = sketch.entities, old = before[idx];
    var map = before.map(function (e) { return E.indexOf(e); });
    var pieces = [];
    E.forEach(function (e, i) { if (before.indexOf(e) < 0) pieces.push(i); });
    var simple = !!old && (old.t === 'line' || old.t === 'arc' || old.t === 'circle') && pieces.every(function (i) { return E[i].t === 'line' || E[i].t === 'arc'; });
    var savedRels = sketch.rels ? clone(sketch.rels) : null, savedDims = sketch.dims ? clone(sketch.dims) : null;
    var an0 = simple ? analyze({ entities: before, rels: sketch.rels, dims: sketch.dims }) : null;
    function near(a, b) { return !!(a && b) && Math.abs(a[0] - b[0]) < 1e-6 * Math.max(1, Math.abs(a[0])) && Math.abs(a[1] - b[1]) < 1e-6 * Math.max(1, Math.abs(a[1])); }
    function oldPt(k) { return refPoint(before, { e: idx, s: 'p', k: k }); }
    // where an old point ref of the trimmed entity lives now ('3.p1', an arc piece's centre), or null
    function pointOnPiece(p) {
      if (p.s === 'c') { for (var q = 0; q < pieces.length; q++) if (E[pieces[q]].t === 'arc') return pieces[q] + '.c'; return null; }
      if (p.s !== 'p') return null;
      var at = oldPt(p.k);
      for (var j = 0; j < pieces.length; j++) for (var k = 1; k <= 2; k++) if (near(refPoint(E, { e: pieces[j], s: 'p', k: k }), at)) return pieces[j] + '.p' + k;
      return null;
    }
    var rels = [];
    (sketch.rels || []).forEach(function (rel) {
      var touches = false, ok = true;
      var refs = rel.refs.map(function (r) {
        var p = parseRef(r);
        if (!p || p.o) return [r];
        if (p.e !== idx) { if (map[p.e] < 0) ok = false; return [String(map[p.e]) + String(r).slice(String(p.e).length)]; }
        touches = true;
        if (p.s === null) return pieces.map(String);          // the whole curve: each piece
        var q = simple ? pointOnPiece(p) : null;
        if (!q) ok = false;
        return [q];
      });
      if (!ok) return;
      if (!touches) { rel.refs = refs.map(function (x) { return x[0]; }); rels.push(rel); return; }
      if (!simple || !KEEP_ON_PIECE[rel.type]) return;
      var n = Math.max.apply(null, refs.map(function (x) { return x.length; }));
      for (var k = 0; k < n; k++) {
        var copy = clone(rel);
        copy.refs = refs.map(function (x) { return x.length > 1 ? x[k] : x[0]; });
        if (copy.refs.every(function (x) { return x != null; })) rels.push(copy);
      }
    });
    if (simple) {
      // the new ends: Coincident with whatever they were cut at (an end point there, or the cutting curve)
      pieces.forEach(function (pi) {
        [1, 2].forEach(function (k) {
          var pt = refPoint(E, { e: pi, s: 'p', k: k });
          if (!pt || near(pt, oldPt(1)) || near(pt, oldPt(2))) return;
          var hit = null;
          for (var j = 0; j < E.length && !hit; j++) {
            if (pieces.indexOf(j) >= 0) continue;
            pointRefs(sketch, j).forEach(function (q) { if (!hit && !/\.(mid|c)$/.test(q.ref) && len(sub(q.pt, pt)) < 1e-3) hit = q.ref; });
          }
          var on = hit || onCurveRef(sketch, -1, pt, 1e-3, pieces);
          if (!on) return;
          // the other entity's end was already Coincident with (lying on) the trimmed curve: the end-to-end one replaces it
          if (hit) rels = rels.filter(function (r) { return !(r.type === 'coincident' && r.refs.indexOf(hit) >= 0 && r.refs.indexOf(String(pi)) >= 0); });
          rels.push({ type: 'coincident', refs: [pi + '.p' + k, on] });
        });
      });
    }
    sketch.rels = rels;
    if (!rels.length) delete sketch.rels;
    // placed dimensions follow their entity; a radius / diameter of the trimmed circle or arc goes to its first arc
    var firstArc = pieces.filter(function (i) { return E[i].t === 'arc'; })[0];
    function moveDims() {
      if (!sketch.dims) return;
      sketch.dims = sketch.dims.filter(function (d) {
        if (d.e !== idx) { if (!(map[d.e] >= 0)) return false; d.e = map[d.e]; return true; }
        if (simple && (d.k === 'r' || d.k === 'dia') && firstArc != null) { d.e = firstArc; d.k = 'r'; return true; }
        return false;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    moveDims();
    clean(sketch);
    if (simple) solve(sketch);   // the cut point was rounded: close the new Coincidents exactly
    if (simple && analyze(sketch).conflicts > an0.conflicts) {
      // keeping them fights the geometry: the trimmed entity's relations go, as before
      if (savedRels) sketch.rels = savedRels; else delete sketch.rels;
      if (savedDims) sketch.dims = savedDims; else delete sketch.dims;
      remap(sketch, before);
      simple = false;
      moveDims();
      return false;
    }
    return true;
  }
  // A rectangle entity (corner or centre) becomes four lines, as SolidWorks' rectangle tools draw them: line k runs
  // from corner k to corner k+1 (bottom, right, top, left), held by Horizontal / Vertical and corner Coincidents.
  // Relations follow (corner vk -> line k start, edge ek -> line k); a width / height dimension becomes the length of
  // the edge it was placed on. A centre rectangle also gets a construction diagonal whose midpoint carries the old
  // centre's relations. Later entities shift by 3 (4 with the diagonal). Returns the index of the first line, or -1.
  function explodeRect(sketch, idx) {
    var E = sketch.entities, e = E[idx];
    if (!e || (e.t !== 'rect' && e.t !== 'crect')) return -1;
    var c = corners(e), lines = [];
    for (var k = 0; k < 4; k++) {
      var l = { t: 'line', x1: c[k][0], y1: c[k][1], x2: c[(k + 1) % 4][0], y2: c[(k + 1) % 4][1] };
      if (e.construction) l.construction = true;
      lines.push(l);
    }
    var usesCentre = (sketch.rels || []).some(function (rel) { return rel.refs.some(function (r) { var p = parseRef(r); return p && !p.o && p.e === idx && p.s === 'c'; }); });
    var diag = usesCentre ? { t: 'line', x1: c[0][0], y1: c[0][1], x2: c[2][0], y2: c[2][1], construction: true } : null;
    var add = diag ? lines.concat([diag]) : lines, shift = add.length - 1;
    sketch.entities = E.slice(0, idx).concat(add, E.slice(idx + 1));
    function mapRef(r) {
      var p = parseRef(r);
      if (!p || p.o) return r;
      if (p.e > idx) return String(p.e + shift) + String(r).slice(String(p.e).length);
      if (p.e < idx) return r;
      if (p.s === 'v' && p.k != null && p.k < 4) return (idx + p.k) + '.p1';
      if (p.s === 'e' && p.k != null && p.k < 4) return String(idx + p.k);
      if (p.s === 'c' && diag) return (idx + 4) + '.mid';
      return null;
    }
    var rels = [];
    (sketch.rels || []).forEach(function (rel) {
      var refs = rel.refs.map(mapRef);
      if (refs.some(function (r) { return r == null; })) return;
      rel.refs = refs;
      rels.push(rel);
    });
    for (var j = 0; j < 4; j++) {
      rels.push({ type: j % 2 ? 'vertical' : 'horizontal', refs: [String(idx + j)] });
      rels.push({ type: 'coincident', refs: [(idx + j) + '.p2', (idx + (j + 1) % 4) + '.p1'] });
    }
    if (diag) rels.push({ type: 'coincident', refs: [(idx + 4) + '.p1', idx + '.p1'] }, { type: 'coincident', refs: [(idx + 4) + '.p2', (idx + 2) + '.p1'] });
    sketch.rels = rels;
    if (sketch.dims) {
      sketch.dims = sketch.dims.filter(function (d) {
        if (d.e > idx) { d.e += shift; return true; }
        if (d.e < idx) return true;
        if (d.k !== 'w' && d.k !== 'h') return false;
        // Kernel.dimGeometry: w on edge 2 (top) else bottom; h on edge 1 (right) else left. The top and left lines run
        // the other way, so the offset side flips with them.
        var edge = d.k === 'w' ? ((d.i | 0) === 2 ? 2 : 0) : ((d.i | 0) === 1 ? 1 : 3);
        d.e = idx + edge; d.k = 'len'; delete d.i;
        if (d.off != null && edge >= 2) d.off = -d.off;
        if (d.tx != null && edge >= 2) d.tx = -d.tx;   // r5/sketch5: the label stays where it was along the edge
        return true;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    clean(sketch);
    return idx;
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
    symCandidates(sketch, i, tol).forEach(function (c) { out.push(c); });
    if (e.t === 'line' || e.t === 'slot') {   // r9/sketch9: a straight slot drawn level / upright too (its centre line)
      var dx = Math.abs(e.x2 - e.x1), dy = Math.abs(e.y2 - e.y1);
      if (dy < tol && dx > tol) out.push({ type: 'horizontal', refs: [String(i)], at: [(e.x1 + e.x2) / 2, e.y1] });
      else if (dx < tol && dy > tol) out.push({ type: 'vertical', refs: [String(i)], at: [e.x1, (e.y1 + e.y2) / 2] });
    }
    pointRefs(sketch, i).forEach(function (pr) {
      // r9/sketch9: a Center Rectangle's / Polygon's centre is a sketch point in SolidWorks (started on the origin it is
      // Coincident with it); a corner rectangle's and a slot's centre are not
      if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && (e.t === 'rect' || e.t === 'slot'))) return;
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
      if (!hit) {
        // an end point (or a centre, a point) dropped on another entity's line, circle or arc, not at one of its points: Coincident to it
        var on = onCurveRef(sketch, i, pr.pt, Math.max(tol, 1e-7));
        // r9/sketch9: at the middle of a rectangle / polygon edge: Midpoint (as a line's midpoint already infers it)
        var oc = on && /\.e\d+$/.test(on) ? refCurve(sketch.entities, parseRef(on)) : null;
        if (oc && oc.kind === 'line' && len(sub(pr.pt, [(oc.a[0] + oc.b[0]) / 2, (oc.a[1] + oc.b[1]) / 2])) < Math.max(tol, 1e-7)) { out.push({ type: 'midpoint', refs: [pr.ref, on], at: pr.pt }); return; }
        if (on) out.push({ type: 'coincident', refs: [pr.ref, on], at: pr.pt });
        return;
      }
      if (isCenterRef(sketch, pr.ref) && isCenterRef(sketch, hit.ref)) out.push({ type: 'concentric', refs: [pr.ref.replace(/\.c$/, ''), hit.ref.replace(/\.c$/, '')], at: pr.pt });
      else if (/\.mid$/.test(hit.ref)) out.push({ type: 'midpoint', refs: [pr.ref, hit.ref.replace(/\.mid$/, '')], at: pr.pt });
      else if (/\.c$/.test(hit.ref) && /^(rect|crect|slot|poly)$/.test(sketch.entities[parseRef(hit.ref).e].t)) return;
      else out.push({ type: 'coincident', refs: [pr.ref, hit.ref], at: pr.pt });
    });
    smoothCandidates(sketch, i, tol).forEach(function (c) { out.push(c); });
    return out;
  }
  // The unit direction of line / arc entity e at its end point pt (the line's direction; the arc's tangent there).
  function endDir(e, pt) {
    if (e.t === 'line') return unit([e.x2 - e.x1, e.y2 - e.y1]);
    if (e.t === 'arc') { var v = unit(sub(pt, [e.cx, e.cy])); return [-v[1], v[0]]; }
    return null;
  }
  // Tangent / Perpendicular where an end of line or arc i meets an end of another line or arc at a matching angle, as
  // SolidWorks infers them while sketching from an existing end point: a line leaving an arc along its tangent, an arc
  // leaving a line or an arc smoothly (Tangent), a line at 90° to the line it starts from (Perpendicular; left to
  // Horizontal / Vertical when both lines are axis-aligned).
  function smoothCandidates(sketch, i, tol) {
    var E = sketch.entities, e = E[i], out = [], ANG = 1e-7;
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return out;
    function axis(d) { return Math.abs(d[0]) < ANG || Math.abs(d[1]) < ANG; }
    var seen = {};
    ['p1', 'p2'].forEach(function (s) {
      var pt = refPoint(E, { e: i, s: 'p', k: s === 'p1' ? 1 : 2 }), u = pt && endDir(e, pt);
      if (!u || len(u) < 0.5) return;
      for (var j = 0; j < E.length; j++) {
        var o = E[j];
        if (j === i || seen[j] || !o || (o.t !== 'line' && o.t !== 'arc')) continue;
        for (var k = 1; k <= 2; k++) {
          var q = refPoint(E, { e: j, s: 'p', k: k });
          if (!q || Math.abs(q[0] - pt[0]) >= tol || Math.abs(q[1] - pt[1]) >= tol) continue;
          var v = endDir(o, q);
          if (!v || len(v) < 0.5) continue;
          if (e.t === 'line' && o.t === 'line') {
            if (Math.abs(dot(u, v)) < ANG && !(axis(u) && axis(v))) { out.push({ type: 'perpendicular', refs: [String(i), String(j)], at: pt }); seen[j] = true; }
          } else if (Math.abs(crs(u, v)) < ANG) { out.push({ type: 'tangent', refs: [String(i), String(j)], at: pt }); seen[j] = true; }
          break;
        }
      }
    });
    return out;
  }
  // The curve ref (a line, a rectangle / polygon edge, a circle or an arc) of an entity other than `self` that point pt
  // lies on, within its extent (between a segment's ends, inside an arc's sweep), or null.
  function onCurveRef(sketch, self, pt, tol, skip) {
    var E = sketch.entities;
    for (var j = 0; j < E.length; j++) {
      if (j === self || !E[j] || E[j].t === 'slot' || (skip && skip.indexOf(j) >= 0)) continue;
      var refs = curveRefs(sketch, j);
      for (var k = 0; k < refs.length; k++) {
        var c = refCurve(E, parseRef(refs[k]));
        if (!c) continue;
        if (c.kind === 'line') {
          var d = sub(c.b, c.a), l2 = dot(d, d);
          if (l2 < 1e-18) continue;
          var t = dot(sub(pt, c.a), d) / l2;
          if (t > 1e-9 && t < 1 - 1e-9 && Math.abs(lineDist(pt, c)) < tol) return refs[k];
        } else {
          var v = sub(pt, c.c);
          if (Math.abs(len(v) - c.r) >= tol) continue;
          var e = E[j];
          if (e.t === 'arc') {
            var a = Math.atan2(v[1], v[0]) / D2R, rel = ((a - e.a0) % 360 + 360) % 360, sw = e.a1 - e.a0;
            if (sw < 360 && (rel < 1e-7 || rel > sw - 1e-7)) continue;
          }
          return refs[k];
        }
      }
    }
    return null;
  }
  // Symmetric about an existing centerline (a construction line): a line whose ends mirror each other, or a point /
  // line / circle that mirrors an existing one of its kind.
  function symCandidates(sketch, i, tol) {
    var E = sketch.entities, e = E[i], out = [];
    if (!e || e.construction && e.t === 'line') return out;
    function near(a, b) { return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol; }
    E.forEach(function (ax, j) {
      if (j === i || !ax || ax.t !== 'line' || !ax.construction) return;
      var L = { a: [ax.x1, ax.y1], b: [ax.x2, ax.y2] };
      if (len(sub(L.b, L.a)) < 1e-12) return;
      if (e.t === 'line' && !near([e.x1, e.y1], [e.x2, e.y2]) && near(reflect([e.x1, e.y1], L), [e.x2, e.y2])) {
        out.push({ type: 'symmetric', refs: [i + '.p1', i + '.p2', String(j)], at: [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2] });
        return;
      }
      for (var k = 0; k < E.length; k++) {
        var o = E[k];
        if (k === i || k === j || !o || o.t !== e.t) continue;
        var hit = false, at;
        if (e.t === 'point') { hit = near(reflect([o.x, o.y], L), [e.x, e.y]); at = [e.x, e.y]; }
        else if (e.t === 'circle' || e.t === 'arc') { hit = Math.abs(o.r - e.r) < tol && near(reflect([o.cx, o.cy], L), [e.cx, e.cy]); at = [e.cx, e.cy]; }
        else if (e.t === 'line') {
          var m1 = reflect([o.x1, o.y1], L), m2 = reflect([o.x2, o.y2], L), p1 = [e.x1, e.y1], p2 = [e.x2, e.y2];
          hit = (near(m1, p1) && near(m2, p2)) || (near(m1, p2) && near(m2, p1));
          at = [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
        }
        if (hit) { out.push({ type: 'symmetric', refs: [String(k), String(i), String(j)], at: at }); return; }
      }
    });
    return out;
  }
  // Add the inferred relations of entity i, skipping any that would over-define the sketch. Returns the added rels.
  function infer(sketch, i) {
    var added = [];
    function tryAdd(rel) {
      if (!relEquation(sketch.entities, rel)) return false;
      var before = analyze(sketch);
      (sketch.rels = sketch.rels || []).push(rel);
      var an = analyze(sketch), k = sketch.rels.length - 1;
      if (an.rels[k] !== 'ok' || an.redundant > before.redundant || an.conflicts > before.conflicts) { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; return false; }
      added.push(rel);
      return true;
    }
    inferCandidates(sketch, i).forEach(function (c) {
      // a Midpoint that half repeats what is there (a vertical line between two midpoints) still puts the end on the line
      if (!tryAdd({ type: c.type, refs: c.refs }) && c.type === 'midpoint') tryAdd({ type: 'coincident', refs: c.refs.slice() });
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
  // opts.radius: ref is a circle or arc grabbed on its curve, and `to` is where the curve should pass (the radius
  // follows the mouse about the centre, as dragging a circle's edge does in SolidWorks).
  function drag(sketch, ref, to, start, opts) {
    var R = parseRef(ref);
    if (!R || R.o) return { ok: false };
    var targets = {};                                  // dimension values held at their drag-start values
    var base = { entities: start || sketch.entities, dims: sketch.dims, rels: sketch.rels };
    (sketch.dims || []).forEach(function (d, i) { var v = K && base.entities[d.e] ? K.dimValue(base.entities[d.e], d) : null; if (v != null) targets[i] = v; });
    var w = 0.1, pull;
    var P0 = refPoint(base.entities, R), eR = base.entities[R.e];
    if (opts && opts.radius && R.s === null && eR && (eR.t === 'circle' || eR.t === 'arc')) {
      var rTo = len(sub(to, [eR.cx, eR.cy]));
      pull = { n: 1, ents: [R.e], soft: true, f: function (E) { return [w * (E[R.e].r - rTo)]; } };
    } else if (P0) pull = { n: 2, ents: [R.e], soft: true, f: function (E) { var p = refPoint(E, R); return [w * (p[0] - to[0]), w * (p[1] - to[1])]; } };
    else {
      var e0 = base.entities[R.e];
      if (!e0 || !K) return { ok: false };
      var tgt = K.translateEntity(e0, to[0], to[1]), names = paramNames(e0);
      pull = { n: names.length, ents: [R.e], soft: true, f: function (E) { return names.map(function (nm) { return w * (pget(E[R.e], nm) - pget(tgt, nm)); }); } };
    }
    var sys = buildSystem(sketch, { dimTargets: targets, extra: [pull] });
    // only the geometry tied to the dragged entity (through relations and dimensions) can move: solve that part alone
    // (much smaller matrices in a sketch of several separate pieces; a conflict elsewhere does not block the drag)
    var part = connected(sys, R.e);
    if (part.count < sys.ents.length) sys = buildSystem(sketch, { dimTargets: targets, extra: [pull], entities: part.set });
    lm(sys, { leastSquares: true, maxIt: 60 });
    var r = lm(sys, { only: function (c) { return !c.soft; } });
    if (!r.ok) return { ok: false };
    writeBack(sketch, sys);
    return { ok: true };
  }

  // ------------------------------------------------------------------ offset of a whole entity
  // Offset Entities on a circle, rectangle, slot or regular polygon gives the same kind of entity (a circle stays a
  // circle, not a faceted polyline). d > 0 grows it, d < 0 shrinks it. Returns null for other kinds or when it would
  // vanish.
  function offsetEntity(e, d) {
    d = +d;
    if (!e || !isFinite(d)) return null;
    var o = null;
    switch (e.t) {
      case 'circle': if (e.r + d > 1e-9) o = { t: 'circle', cx: e.cx, cy: e.cy, r: e.r + d }; break;
      case 'arc': if (e.r + d > 1e-9) o = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r + d, a0: e.a0, a1: e.a1 }; break;
      case 'line': {   // r6/sketch6: a parallel copy, d along the line's left normal
        var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.hypot(dx, dy);
        if (L > 1e-12 && Math.abs(d) > 1e-12) { var nx = -dy / L * d, ny = dx / L * d; o = { t: 'line', x1: e.x1 + nx, y1: e.y1 + ny, x2: e.x2 + nx, y2: e.y2 + ny }; }
        break;
      }
      case 'rect': if (e.w + 2 * d > 1e-9 && e.h + 2 * d > 1e-9) o = { t: 'rect', x: e.x - d, y: e.y - d, w: e.w + 2 * d, h: e.h + 2 * d }; break;
      case 'crect': if (e.w + 2 * d > 1e-9 && e.h + 2 * d > 1e-9) o = { t: 'crect', cx: e.cx, cy: e.cy, w: e.w + 2 * d, h: e.h + 2 * d }; break;
      case 'slot': if (e.w + 2 * d > 1e-9) o = { t: 'slot', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, w: e.w + 2 * d }; break;
      case 'poly': { var n = e.n | 0 || 6, r = e.r + d / Math.cos(Math.PI / n); if (r > 1e-9) o = { t: 'poly', cx: e.cx, cy: e.cy, r: r, n: n, rot: e.rot || 0 }; break; }
    }
    return o;
  }
  // The relations that keep offset copy `j` of entity `i` centred on it (Concentric, centre / end Coincidents).
  function offsetRelations(sketch, i, j) {
    var e = sketch.entities[i], o = sketch.entities[j];
    if (!e || !o || e.t !== o.t) return [];
    if (e.t === 'circle' || e.t === 'arc') return [{ type: 'concentric', refs: [String(i), String(j)] }];
    if (e.t === 'line') return [{ type: 'parallel', refs: [String(i), String(j)] }];
    // r9/sketch9: a rectangle's copy is offset by the same distance on every side (Offset): one dimension drives it
    if (e.t === 'rect' || e.t === 'crect') return [{ type: 'coincident', refs: [i + '.c', j + '.c'] }, { type: 'offset', refs: [String(i), String(j)] }];
    if (e.t === 'poly') return [{ type: 'coincident', refs: [i + '.c', j + '.c'] }, { type: 'parallel', refs: [i + '.e0', j + '.e0'] }];
    if (e.t === 'crect' || e.t === 'poly') return [{ type: 'coincident', refs: [i + '.c', j + '.c'] }];
    if (e.t === 'slot') return [{ type: 'coincident', refs: [i + '.p1', j + '.p1'] }, { type: 'coincident', refs: [i + '.p2', j + '.p2'] }];
    return [];
  }

  // r6/sketch6: the driving offset dimension(s) SolidWorks' Offset Entities adds between entity `i` and its offset
  // copy `j` (after offsetRelations): circle / arc -> radial distance (dir 'r'); line -> parallel distance; polygon ->
  // distance between the first edges; rectangle -> distance between the bottom edges (r9: the Offset relation links the
  // other sides); slot -> radial distance (half the width difference, r9).
  // Each holds |d|; one that would over-define is skipped. Returns the indices of the relations added.
  function offsetDimensions(sketch, i, j, d) {
    var e = sketch.entities[i], o = sketch.entities[j], v = Math.abs(+d), out = [];
    if (!e || !o || e.t !== o.t || !(v > 1e-12)) return out;
    // r9/sketch9: a rectangle gets one dimension (its Offset relation links the other sides); a slot a radial one
    var pairs = e.t === 'circle' || e.t === 'arc' || e.t === 'line' || e.t === 'slot' ? [[String(i), String(j)]]
      : e.t === 'poly' ? [[i + '.e0', j + '.e0']] : e.t === 'rect' || e.t === 'crect' ? [[i + '.e0', j + '.e0']] : [];
    pairs.forEach(function (p) {
      var r = addRelation(sketch, 'distance', p, { value: v, dir: e.t === 'circle' || e.t === 'arc' || e.t === 'slot' ? 'r' : undefined, rejectOver: true });
      if (r.ok) out = out.concat(r.rels);
    });
    return out;
  }

  // Mirror Entities about a line entity: each copy is held Symmetric to its original about that line (lines, circles,
  // arcs, points), as SolidWorks does. pairs = [[original, copy], ...]. A relation that would over-define is skipped.
  // Returns the number added.
  function mirrorRelations(sketch, pairs, axis) {
    var n = 0, E = sketch.entities, ax = E[axis];
    if (!ax || ax.t !== 'line') return 0;
    pairs.forEach(function (p) {
      var a = E[p[0]], b = E[p[1]];
      if (!a || !b || a.t !== b.t || !/^(line|circle|arc|point)$/.test(a.t)) return;
      var rel = { type: 'symmetric', refs: [String(p[0]), String(p[1]), String(axis)] };
      if (!relEquation(E, rel, sketch.rels)) return;
      var before = analyze(sketch);
      (sketch.rels = sketch.rels || []).push(rel);
      solve(sketch);   // the copies were rounded to 1e-4: close the relation exactly
      var an = analyze(sketch);
      if (an.rels[sketch.rels.length - 1] !== 'ok' || an.redundant > before.redundant || an.conflicts > before.conflicts) { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; return; }
      n++;
    });
    return n;
  }

  // ------------------------------------------------------------------ sketch fillet between two lines
  // The corner where two lines meet (an end of each at the same point) nearest uv, within maxDist: { i, ei, j, ej, at }
  // with ei / ej = 'p1' | 'p2', or null.
  function lineCorner(sketch, uv, maxDist) {
    var E = sketch.entities || [], best = null, bd = maxDist == null ? Infinity : maxDist;
    function ends(e) { return { p1: [e.x1, e.y1], p2: [e.x2, e.y2] }; }
    for (var i = 0; i < E.length; i++) {
      if (!E[i] || E[i].t !== 'line') continue;
      for (var j = i + 1; j < E.length; j++) {
        if (!E[j] || E[j].t !== 'line') continue;
        var a = ends(E[i]), b = ends(E[j]), tol = 1e-6 * Math.max(1, len(sub(a.p2, a.p1)), len(sub(b.p2, b.p1)));
        ['p1', 'p2'].forEach(function (ei) {
          ['p1', 'p2'].forEach(function (ej) {
            if (len(sub(a[ei], b[ej])) > tol) return;
            var d = len(sub(a[ei], uv));
            if (d < bd) { bd = d; best = { i: i, ei: ei, j: j, ej: ej, at: a[ei].slice() }; }
          });
        });
      }
    }
    return best;
  }
  // Round the corner between lines c.i and c.j (a lineCorner result) with radius r, as SolidWorks' Sketch Fillet
  // does: both lines are trimmed back to the tangent points, an arc is added, and the arc is held by Coincident and
  // Tangent relations to both lines. Relations and length dimensions on the vanished corner move to a virtual sharp
  // (below). Returns { ok, arc, sharp (index or -1), error }.
  function filletCorner(sketch, c, r) {
    r = +r;
    var E = sketch.entities, L1 = E[c.i], L2 = E[c.j];
    if (!(r > 0) || !isFinite(r)) return { ok: false, error: 'The fillet radius must be a positive number.' };
    if (!L1 || !L2 || L1.t !== 'line' || L2.t !== 'line') return { ok: false, error: 'A sketch fillet needs two lines that meet.' };
    function end(e, s) { return s === 'p1' ? [e.x1, e.y1] : [e.x2, e.y2]; }
    function other(s) { return s === 'p1' ? 'p2' : 'p1'; }
    var P = end(L1, c.ei), A = end(L1, other(c.ei)), B = end(L2, other(c.ej));
    var la = len(sub(A, P)), lb = len(sub(B, P));
    if (la < 1e-12 || lb < 1e-12) return { ok: false, error: 'One of the lines has no length.' };
    var u = [(A[0] - P[0]) / la, (A[1] - P[1]) / la], v = [(B[0] - P[0]) / lb, (B[1] - P[1]) / lb];
    var th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (th < 1e-6 || Math.PI - th < 1e-6) return { ok: false, error: 'The lines are collinear: there is no corner to round.' };
    var t = r / Math.tan(th / 2);
    if (t > la * (1 + 1e-9) || t > lb * (1 + 1e-9)) return { ok: false, error: 'Radius too large: the fillet would be longer than the lines (at most ' + (Math.round(Math.min(la, lb) * Math.tan(th / 2) * 1e4) / 1e4) + ').' };
    var Ti = [P[0] + u[0] * t, P[1] + u[1] * t], Tj = [P[0] + v[0] * t, P[1] + v[1] * t];
    var bis = unit([u[0] + v[0], u[1] + v[1]]), dc = r / Math.sin(th / 2), C = [P[0] + bis[0] * dc, P[1] + bis[1] * dc];
    var a0 = Math.atan2(Ti[1] - C[1], Ti[0] - C[0]) / D2R, a1 = Math.atan2(Tj[1] - C[1], Tj[0] - C[0]) / D2R, swap = false;
    var sw = ((a1 - a0) % 360 + 360) % 360;
    if (sw > 180) { var tmp = a0; a0 = a1; a1 = tmp; swap = true; sw = 360 - sw; }
    var savedE = clone(E), savedR = sketch.rels ? clone(sketch.rels) : null, savedD = sketch.dims ? clone(sketch.dims) : null, before = analyze(sketch);
    function setEnd(e, s, p) { if (s === 'p1') { e.x1 = p[0]; e.y1 = p[1]; } else { e.x2 = p[0]; e.y2 = p[1]; } }
    var lens = {};   // the lengths the two lines had to the corner (their length dimensions measure to the virtual sharp)
    lens[c.i] = { len: la, dx: Math.abs(A[0] - P[0]), dy: Math.abs(A[1] - P[1]) }; lens[c.j] = { len: lb, dx: Math.abs(B[0] - P[0]), dy: Math.abs(B[1] - P[1]) };
    setEnd(L1, c.ei, Ti); setEnd(L2, c.ej, Tj);
    var arc = { t: 'arc', cx: C[0], cy: C[1], r: r, a0: a0, a1: a0 + sw };
    if (L1.construction && L2.construction) arc.construction = true;
    E.push(arc);
    var k = E.length - 1, gone = [c.i + '.' + c.ei, c.j + '.' + c.ej];
    // Virtual sharp, as SolidWorks keeps it: when relations or dimensions hold the corner (a Coincident with the origin,
    // a distance to it, the length of either line), a construction point stays at the intersection of the two lines
    // (on both, so it adds no freedom) and carries them; a line's length becomes the distance from its far end to it.
    var keep = (sketch.rels || []).filter(function (rel) {
      var n = rel.refs.filter(function (x) { return gone.indexOf(String(x)) >= 0; }).length;
      return n > 0 && !(rel.type === 'coincident' && n === 2);
    });
    var lenDims = (sketch.dims || []).filter(function (d) { return (d.e === c.i || d.e === c.j) && (d.k === 'len' || d.k === 'dx' || d.k === 'dy'); });
    var sharp = -1;
    if (keep.length || lenDims.length) {
      E.push({ t: 'point', x: P[0], y: P[1], construction: true, sharp: true });
      sharp = E.length - 1;
      var sref = String(sharp);
      keep.forEach(function (rel) { rel.refs = rel.refs.map(function (x) { return gone.indexOf(String(x)) >= 0 ? sref : x; }); });
      lenDims.forEach(function (d) {
        var ln = d.e === c.i ? { e: c.i, s: c.ei } : { e: c.j, s: c.ej }, far = ln.e + '.' + other(ln.s);
        // the dimension keeps its side (it ran p1 -> p2 along the line), its direction (a horizontal / vertical
        // distance stays one) and whether it was driven
        var rel = { type: 'distance', refs: ln.s === 'p1' ? [sref, far] : [far, sref], v: lens[ln.e][d.k] };
        if (d.k === 'dx') rel.dir = 'h'; else if (d.k === 'dy') rel.dir = 'v';
        if (d.tx != null) rel.tx = d.tx;
        if (d.off != null) rel.off = d.off;
        if (d.driven) rel.driven = true;
        keep.push(rel);
      });
      sketch.dims = sketch.dims.filter(function (d) { return lenDims.indexOf(d) < 0; });
    }
    if (sketch.rels) {
      sketch.rels = sketch.rels.filter(function (rel) { return keep.indexOf(rel) >= 0 || !rel.refs.some(function (x) { return gone.indexOf(String(x)) >= 0; }); });
    }
    sketch.rels = sketch.rels || [];
    keep.forEach(function (rel) { if (sketch.rels.indexOf(rel) < 0) sketch.rels.push(rel); });
    if (sharp >= 0) sketch.rels.push({ type: 'coincident', refs: [String(sharp), String(c.i)] }, { type: 'coincident', refs: [String(sharp), String(c.j)] });
    sketch.rels.push({ type: 'coincident', refs: [gone[0], k + (swap ? '.p2' : '.p1')] },
                     { type: 'coincident', refs: [gone[1], k + (swap ? '.p1' : '.p2')] },
                     { type: 'tangent', refs: [String(c.i), String(k)] },
                     { type: 'tangent', refs: [String(c.j), String(k)] });
    // the radius is dimensioned, as SolidWorks dimensions the first fillet, so the corner stays as defined as it was
    (sketch.dims = sketch.dims || []).push({ e: k, k: 'r', ang: Math.round(Math.atan2(-bis[1], -bis[0]) / D2R * 10) / 10, off: Math.round(dc * 1e4) / 1e4 });
    var res = solve(sketch), an = analyze(sketch);
    if (!res.ok || an.conflicts > before.conflicts) {
      sketch.entities = savedE;
      if (savedR) sketch.rels = savedR; else delete sketch.rels;
      if (savedD) sketch.dims = savedD; else delete sketch.dims;
      return { ok: false, error: 'The fillet conflicts with the sketch\'s relations or dimensions.' };
    }
    return { ok: true, arc: k, sharp: sharp, analysis: an };
  }

  // ------------------------------------------------------------------ extend (the counterpart of Trim)
  // Where line or arc i reaches when its end nearest uv is extended to the first entity it meets, as SolidWorks' Extend
  // Entities does: { end: 'p1' | 'p2', from, to, d: added length (line) or degrees (arc), a: new end angle (arc) }, or
  // null when nothing lies ahead.
  function extendTarget(sketch, i, uv) {
    var E = sketch.entities, e = E[i];
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return null;
    var q1 = refPoint(E, { e: i, s: 'p', k: 1 }), q2 = refPoint(E, { e: i, s: 'p', k: 2 });
    var end = len(sub(uv, q1)) <= len(sub(uv, q2)) ? 'p1' : 'p2', from = end === 'p1' ? q1 : q2;
    var segs = [], circs = [];
    E.forEach(function (o, j) {
      if (j === i || !o || o.t === 'point') return;
      if (o.t === 'line') segs.push([[o.x1, o.y1], [o.x2, o.y2]]);
      else if (o.t === 'circle' || o.t === 'arc') circs.push(o);
      else {
        var c = corners(o);
        if (c) { var n = c.length, last = closedCorners(o) ? n : n - 1; for (var k = 0; k < last; k++) segs.push([c[k], c[(k + 1) % n]]); }
        else if (K && K.entityPolylines) K.entityPolylines(o).forEach(function (pl) {
          for (var k2 = 0; k2 + 1 < pl.pts.length; k2++) segs.push([pl.pts[k2], pl.pts[k2 + 1]]);
          if (pl.closed && pl.pts.length > 2) segs.push([pl.pts[pl.pts.length - 1], pl.pts[0]]);
        });
      }
    });
    var scale = Math.max(1, Math.abs(from[0]), Math.abs(from[1])), eps = 1e-9 * scale, hits = [];
    function onSweep(o, p) {
      if (o.t !== 'arc' || o.a1 - o.a0 >= 360) return true;
      var a = Math.atan2(p[1] - o.cy, p[0] - o.cx) / D2R, rel = ((a - o.a0) % 360 + 360) % 360;
      return rel <= o.a1 - o.a0 + 1e-7;
    }
    // points where the carrier (the infinite line, or the arc's whole circle) meets the other entities
    function lineHits(A, d) {
      segs.forEach(function (sg) {
        var w = sub(sg[1], sg[0]), den = crs(d, w);
        if (Math.abs(den) < 1e-12 * (len(w) || 1)) return;
        var t = crs(sub(sg[0], A), w) / den, s = crs(sub(sg[0], A), d) / den;
        if (s >= -1e-9 && s <= 1 + 1e-9) hits.push([A[0] + d[0] * t, A[1] + d[1] * t]);
      });
      circs.forEach(function (o) {
        var f = sub(A, [o.cx, o.cy]), b = dot(f, d), c = dot(f, f) - o.r * o.r, disc = b * b - c;
        if (disc < 0) return;
        var sq = Math.sqrt(disc);
        [-b - sq, -b + sq].forEach(function (t) { var p = [A[0] + d[0] * t, A[1] + d[1] * t]; if (onSweep(o, p)) hits.push(p); });
      });
    }
    function circleHits(C, R) {
      segs.forEach(function (sg) {
        var d = sub(sg[1], sg[0]), L = len(d);
        if (L < 1e-12) return;
        var u = [d[0] / L, d[1] / L], f = sub(sg[0], C), b = dot(f, u), c = dot(f, f) - R * R, disc = b * b - c;
        if (disc < 0) return;
        var sq = Math.sqrt(disc);
        [-b - sq, -b + sq].forEach(function (t) { if (t >= -1e-9 * L && t <= L * (1 + 1e-9)) hits.push([sg[0][0] + u[0] * t, sg[0][1] + u[1] * t]); });
      });
      circs.forEach(function (o) {
        var ex = o.cx - C[0], ey = o.cy - C[1], D = Math.hypot(ex, ey);
        if (D < 1e-12 || D > R + o.r + 1e-9 || D < Math.abs(R - o.r) - 1e-9) return;
        var al = (R * R - o.r * o.r + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, R * R - al * al)), mx = C[0] + ex * al / D, my = C[1] + ey * al / D;
        [[mx - ey * hh / D, my + ex * hh / D], [mx + ey * hh / D, my - ex * hh / D]].forEach(function (p) { if (onSweep(o, p)) hits.push(p); });
      });
    }
    var best = null;
    if (e.t === 'line') {
      var other = end === 'p1' ? q2 : q1, L0 = len(sub(from, other));
      if (L0 < 1e-12) return null;
      var d = [(from[0] - other[0]) / L0, (from[1] - other[1]) / L0];
      lineHits(from, d);
      hits.forEach(function (p) { var t = dot(sub(p, from), d); if (t > eps && (!best || t < best.d)) best = { end: end, from: from, to: p, d: t }; });
      return best;
    }
    var sw = e.a1 - e.a0;
    if (sw >= 360 - 1e-9) return null;
    circleHits([e.cx, e.cy], e.r);
    hits.forEach(function (p) {
      var a = Math.atan2(p[1] - e.cy, p[0] - e.cx) / D2R;
      var da = end === 'p2' ? ((a - e.a1) % 360 + 360) % 360 : ((e.a0 - a) % 360 + 360) % 360;
      if (da * D2R * e.r > eps && sw + da < 360 - 1e-7 && (!best || da < best.d)) best = { end: end, from: from, to: p, d: da, a: end === 'p2' ? e.a1 + da : e.a0 - da };
    });
    return best;
  }
  // Extend line or arc i (its end nearest uv) to the first entity in the way. The end's point-on-curve Coincidents are
  // dropped (it leaves that curve), and it gets a Coincident where it lands (on the point there, or on the curve).
  // An end joined to another point cannot move: { ok: false, error }. Returns { ok, end, to }.
  function extendEntity(sketch, i, uv) {
    var E = sketch.entities, e = E[i];
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return { ok: false, error: 'Extend works on lines and arcs.' };
    var tg = extendTarget(sketch, i, uv);
    if (!tg) return { ok: false, error: 'Nothing to extend to in that direction.' };
    var endRef = i + '.' + tg.end;
    var joined = (sketch.rels || []).some(function (rel) {
      return rel.type === 'coincident' && rel.refs.indexOf(endRef) >= 0 && rel.refs.some(function (r) { return r !== endRef && refKind(E, parseRef(r)) === 'point'; });
    });
    if (joined) return { ok: false, error: 'That end is joined to other geometry: only a free end can be extended.' };
    var savedE = clone(E), savedR = sketch.rels ? clone(sketch.rels) : null, before = analyze(sketch);
    if (sketch.rels) { sketch.rels = sketch.rels.filter(function (rel) { return !(rel.type === 'coincident' && rel.refs.indexOf(endRef) >= 0); }); if (!sketch.rels.length) delete sketch.rels; }
    if (e.t === 'line') { if (tg.end === 'p1') { e.x1 = tg.to[0]; e.y1 = tg.to[1]; } else { e.x2 = tg.to[0]; e.y2 = tg.to[1]; } }
    else if (tg.end === 'p1') e.a0 = tg.a; else e.a1 = tg.a;
    // where it lands: a point there, or the curve
    var tol = 1e-7 * Math.max(1, Math.abs(tg.to[0]), Math.abs(tg.to[1])), at = null;
    for (var j = 0; j < E.length && !at; j++) {
      if (j === i) continue;
      pointRefs(sketch, j).forEach(function (pr) { if (!at && !/\.(mid|c)$/.test(pr.ref) && Math.abs(pr.pt[0] - tg.to[0]) < tol && Math.abs(pr.pt[1] - tg.to[1]) < tol) at = pr.ref; });
    }
    at = at || onCurveRef(sketch, i, tg.to, tol);
    if (at) {
      var rel = { type: 'coincident', refs: [endRef, at] };
      (sketch.rels = sketch.rels || []).push(rel);
      var an0 = analyze(sketch);
      if (an0.rels[sketch.rels.length - 1] !== 'ok') { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; }
    }
    var res = solve(sketch), an = analyze(sketch);
    if (!res.ok || an.conflicts > before.conflicts) {
      sketch.entities = savedE;
      if (savedR) sketch.rels = savedR; else delete sketch.rels;
      return { ok: false, error: 'Extending conflicts with the sketch\'s relations or dimensions.' };
    }
    return { ok: true, end: tg.end, to: tg.to, at: at };
  }

  // ------------------------------------------------------------------ descriptions
  var ENTITY_NAMES = { line: 'Line', rect: 'Rectangle', crect: 'Rectangle', circle: 'Circle', poly: 'Polygon', slot: 'Slot', arc: 'Arc', point: 'Point', polyline: 'Polyline' };
  function refName(sketch, ref) {
    var p = parseRef(ref);
    if (!p) return String(ref);
    if (p.o) return 'Origin';
    var e = sketch.entities[p.e], base = (e ? (e.sharp ? 'Sharp' : ENTITY_NAMES[e.t] || 'Entity') : 'Entity') + (p.e + 1);
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
    var s = (rel.dir === 'h' ? 'Horizontal ' : rel.dir === 'v' ? 'Vertical ' : rel.dir === 'r' ? 'Radial ' : '') + (t ? t.name : rel.type) + ': ' + rel.refs.map(function (r) { return refName(sketch, r); }).join(', ');
    if (t && t.dim) s += (rel.driven ? ' (driven) = ' : ' = ') + (Math.round(rel.v * 1e4) / 1e4) + (rel.type === 'angle' ? '°' : '');
    return s;
  }

  // ------------------------------------------------------------------ script round trip (Builder / generateScript hooks)
  // `.rel(type, refs, value)`, `.solve()`, `.construction()` and `.driven()` are added to the SketchBuilder prototype,
  // and Kernel.registerSketchScript writes each sketch's construction marks, driven dimensions and relations before its
  // `.id();` in generateScript.
  function relArgs(rel) {
    var s = JSON.stringify(rel.type) + ', ' + JSON.stringify(rel.refs);
    if (TYPES[rel.type] && TYPES[rel.type].dim) {
      // angle placement (r5/sketch5): sup / q / ta
      var ang = function (o) { if (rel.sup) o.sup = true; if (rel.q === -1) o.q = -1; if (rel.ta != null) o.ta = rel.ta; return o; };
      if (rel.driven) { var o = { driven: true }; if (rel.off != null) o.off = rel.off; if (rel.dir) o.dir = rel.dir; if (rel.tx != null) o.tx = rel.tx; s += ', ' + JSON.stringify(ang(o)); }
      else if (rel.dir || rel.tx != null || rel.sup || rel.q === -1 || rel.ta != null) { var o2 = { value: rel.v }; if (rel.off != null) o2.off = rel.off; if (rel.dir) o2.dir = rel.dir; if (rel.tx != null) o2.tx = rel.tx; s += ', ' + JSON.stringify(ang(o2)); }
      else s += rel.off != null ? ', ' + JSON.stringify({ value: rel.v, off: rel.off }) : ', ' + rel.v;
    }
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
      if (opt && typeof opt === 'object' && opt.driven) o.driven = true;
      if (opt && typeof opt === 'object' && (opt.dir === 'h' || opt.dir === 'v' || opt.dir === 'r')) o.dir = opt.dir;
      if (opt && typeof opt === 'object' && opt.tx != null) o.tx = +opt.tx;
      if (opt && typeof opt === 'object') { if (opt.sup) o.sup = true; if (+opt.q === -1) o.q = -1; if (opt.ta != null) o.ta = +opt.ta; }
      var r = addRelation(this.f, type, refs, o);
      if (!r.ok) throw new Error('rel(' + JSON.stringify(type) + '): ' + r.error);
      return this;
    };
    SBP.solve = function () { solve(this.f); return this; };
    // .construction([i, …]): mark entities as construction geometry (drawn dashed, not part of any profile)
    SBP.construction = function (list) {
      var self = this;
      (Array.isArray(list) ? list : [list]).forEach(function (i) { var e = self.f.entities[i]; if (!e) throw new Error('No sketch entity ' + i + ' to make construction.'); e.construction = true; });
      return this;
    };
    // .driven([i, …]): Smart Dimensions i become driven (reference) dimensions
    SBP.driven = function (list) {
      var self = this;
      (Array.isArray(list) ? list : [list]).forEach(function (i) { var d = (self.f.dims || [])[i]; if (!d) throw new Error('No sketch dimension ' + i + ' to make driven.'); d.driven = true; });
      return this;
    };
    // .sharp([i, …]): points i are virtual sharps (SketchSolver.filletCorner), drawn with extension lines to the corner
    SBP.sharp = function (list) {
      var self = this;
      (Array.isArray(list) ? list : [list]).forEach(function (i) { var e = self.f.entities[i]; if (!e || e.t !== 'point') throw new Error('No sketch point ' + i + ' to make a virtual sharp.'); e.sharp = true; });
      return this;
    };
    // .dimText([[i, t], …]): the label of Smart Dimension i sits t along its dimension line from the middle (where it
    // was dropped)
    SBP.dimText = function (list) {
      var self = this;
      (list || []).forEach(function (p) { var d = (self.f.dims || [])[p[0]]; if (!d) throw new Error('No sketch dimension ' + p[0] + ' to place.'); d.tx = +p[1]; });
      return this;
    };
    Kn.registerSketchScript(function (f) {
      var cons = (f.entities || []).map(function (e, i) { return e.construction ? i : -1; }).filter(function (i) { return i >= 0; });
      var drv = (f.dims || []).map(function (d, i) { return d.driven ? i : -1; }).filter(function (i) { return i >= 0; });
      var shp = (f.entities || []).map(function (e, i) { return e.sharp && e.t === 'point' ? i : -1; }).filter(function (i) { return i >= 0; });
      var txs = (f.dims || []).map(function (d, i) { return d.tx != null ? [i, Math.round(d.tx * 1e4) / 1e4] : null; }).filter(function (x) { return x; });
      return (cons.length ? '\n  .construction(' + JSON.stringify(cons) + ')' : '') + (shp.length ? '\n  .sharp(' + JSON.stringify(shp) + ')' : '') + (drv.length ? '\n  .driven(' + JSON.stringify(drv) + ')' : '') + (txs.length ? '\n  .dimText(' + JSON.stringify(txs) + ')' : '') + (f.rels || []).map(function (rel) { return '\n  .rel(' + relArgs(rel) + ')'; }).join('');
    });
  }
  if (K) install(K);

  return {
    TYPES: TYPES, STATUS_TEXT: STATUS_TEXT, parseRef: parseRef, paramNames: paramNames,
    refPoint: function (sketch, ref) { return refPoint(sketch.entities, parseRef(ref)); },
    refCurve: function (sketch, ref) { return refCurve(sketch.entities, parseRef(ref)); },
    refKind: function (sketch, ref) { return refKind(sketch.entities, parseRef(ref)); },
    pointRefs: pointRefs, curveRefs: curveRefs, refName: refName, describe: describe,
    buildSystem: buildSystem, analyze: analyze, solve: solve, drag: drag,
    setDim: setDim, setRelValue: setRelValue, measure: measure, updateDriven: updateDriven, overDefines: overDefines, setDriven: setDriven,
    applicable: applicable, addRelation: addRelation, deleteRelation: deleteRelation,
    removeEntity: removeEntity, remap: remap, afterTrim: afterTrim, explodeRect: explodeRect, clean: clean,
    infer: infer, inferCandidates: inferCandidates, inferPreview: inferPreview, onCurveRef: onCurveRef,
    lineCorner: lineCorner, filletCorner: filletCorner, extendTarget: extendTarget, extendEntity: extendEntity, endDir: endDir, offsetEntity: offsetEntity, offsetRelations: offsetRelations, offsetDimensions: offsetDimensions,
    mirrorRelations: mirrorRelations, install: install
  };
})();
