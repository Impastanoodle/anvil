// ui-sketch-construct.js — AutoCAD / Mastercam-style construction commands on the Sketch tab, each with a SolidWorks
// PropertyManager: Tangent Line, Perpendicular Line, Bisector (Line flyout), Tangent Circle (Circle flyout: Tangent,
// Tangent, Radius and Tangent, Tangent, Tangent), Split Entities and Join Entities (Trim flyout). See README *Sketch tab*.
//
// Every command opens its PropertyManager at once, shows what a click would make (orange preview), places one result
// per pick as one undo step, adds the relations that keep the result parametric (an over-defining one refuses the
// whole placement with a toast) and ends on ✓ / Esc. Where a pick has several answers (the four tangent lines of two
// circles, the solutions of a tangent circle) the one nearest the picks is placed and *Next solution* (or N) swaps it
// for the next one in place. The geometry is pure and exposed on UI.sketchConstruct for tests.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  var App = UI.App, $ = UI.$, K = UI.K;
  function SS() { return window.SketchSolver; }
  var D2R = Math.PI / 180;
  function clean(v) { return +(+v).toPrecision(12); }
  function sketch() { return UI.activeSketchFeature ? UI.activeSketchFeature() : null; }
  function refresh() { App.dimsStale = true; App.gridStale = true; UI.updateSketches(); if (UI.refreshTree) UI.refreshTree(); if (UI.refreshStatus) UI.refreshStatus(); }
  function hint(html) { var h = $('sketch-hint'); if (h && App.mode === 'sketch') h.innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ------------------------------------------------------------------ plane geometry (pure)
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function crs(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function dist(a, b) { return len(sub(a, b)); }
  function unit(a) { var l = len(a); return l < 1e-300 ? [0, 0] : [a[0] / l, a[1] / l]; }
  function perp(a) { return [-a[1], a[0]]; }
  function cpt(p) { return [clean(p[0]), clean(p[1])]; }
  // a carrier is SketchSolver.refCurve's shape: { kind: 'line', a, b } (the infinite line through a, b) or
  // { kind: 'circle', c, r }
  function foot(L, P) { var d = sub(L.b, L.a), l2 = dot(d, d); return l2 < 1e-300 ? L.a.slice() : add(L.a, mul(d, dot(sub(P, L.a), d) / l2)); }
  function lineMeet(L1, L2) {
    var d1 = sub(L1.b, L1.a), d2 = sub(L2.b, L2.a), den = crs(d1, d2);
    if (Math.abs(den) < 1e-12 * len(d1) * len(d2)) return null;
    return add(L1.a, mul(d1, crs(sub(L2.a, L1.a), d2) / den));
  }
  function lineCircle(L, C) {
    var F = foot(L, C.c), h = dist(F, C.c), u = unit(sub(L.b, L.a));
    if (h > C.r * (1 + 1e-12) + 1e-12) return [];
    var s = Math.sqrt(Math.max(0, C.r * C.r - h * h));
    return s < 1e-12 * Math.max(1, C.r) ? [F] : [add(F, mul(u, -s)), add(F, mul(u, s))];
  }
  function circleCircle(A, B) {
    var d = sub(B.c, A.c), D = len(d);
    if (D < 1e-12 || D > A.r + B.r + 1e-9 * Math.max(1, A.r + B.r) || D < Math.abs(A.r - B.r) - 1e-9 * Math.max(1, A.r + B.r)) return [];
    var a = (A.r * A.r - B.r * B.r + D * D) / (2 * D), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)), m = add(A.c, mul(d, a / D)), n = perp(mul(d, 1 / D));
    return h < 1e-12 * Math.max(1, A.r) ? [m] : [add(m, mul(n, h)), add(m, mul(n, -h))];
  }
  function meet(A, B) {
    if (A.kind === 'line' && B.kind === 'line') { var p = lineMeet(A, B); return p ? [p] : []; }
    if (A.kind === 'line') return lineCircle(A, B);
    if (B.kind === 'line') return lineCircle(B, A);
    return circleCircle(A, B);
  }
  // where a circle centred at C touches carrier c
  function touchPoint(c, C, R) {
    if (c.kind === 'line') return foot(c, C);
    var v = sub(C, c.c), l = len(v);
    if (l < 1e-12) return add(c.c, [c.r, 0]);
    // externally tangent or enclosed: the touch point is on c's side towards C; enclosing: away from it (same ray)
    return add(c.c, mul(v, c.r / l));
  }

  // Lines tangent to two circles c1, c2: [{ a (on c1), b (on c2), outer }], up to four (two outer, two inner).
  function tangentLines(c1, c2) {
    var d = sub(c2.c, c1.c), D = len(d), out = [];
    if (D < 1e-12) return out;
    var v = mul(d, 1 / D), w = perp(v);
    [1, -1].forEach(function (s) {
      var k = (c1.r - s * c2.r) / D;
      if (Math.abs(k) > 1 + 1e-12) return;
      k = Math.max(-1, Math.min(1, k));
      var h = Math.sqrt(Math.max(0, 1 - k * k));
      [1, -1].forEach(function (q) {
        if (q < 0 && h < 1e-12) return;
        var n = add(mul(v, k), mul(w, q * h)), a = add(c1.c, mul(n, c1.r)), b = add(c2.c, mul(n, s * c2.r));
        if (dist(a, b) > 1e-9 * Math.max(1, D)) out.push({ a: a, b: b, outer: s > 0 });
      });
    });
    return out;
  }
  // The tangent points of circle c for a line at angle angDeg: [{ t, u }] (u the line's unit direction).
  function tangentAtAngle(c, angDeg) {
    var u = [Math.cos(angDeg * D2R), Math.sin(angDeg * D2R)], n = perp(u);
    return [{ t: add(c.c, mul(n, c.r)), u: u }, { t: add(c.c, mul(n, -c.r)), u: u }];
  }
  // The bisectors of two lines from where they meet: { at, dirs: [the bisector of the angle between the picked sides,
  // its reverse, the bisector of the other angle, its reverse], angle (° between the picked sides) } or null (parallel).
  // A pick says which side of the meeting point each line is taken on (null: the side its far end is on).
  function bisectors(L1, L2, pick1, pick2) {
    var X = lineMeet(L1, L2);
    if (!X) return null;
    function ray(L, pick) {
      var u = unit(sub(L.b, L.a)), t = pick ? dot(sub(pick, X), u) : 0;
      if (Math.abs(t) < 1e-9 * Math.max(1, len(X))) t = Math.abs(dot(sub(L.a, X), u)) > Math.abs(dot(sub(L.b, X), u)) ? dot(sub(L.a, X), u) : dot(sub(L.b, X), u);
      return t < 0 ? mul(u, -1) : u;
    }
    var d1 = ray(L1, pick1), d2 = ray(L2, pick2), b = unit(add(d1, d2)), o = unit(sub(d1, d2));
    return { at: X, d1: d1, d2: d2, dirs: [b, mul(b, -1), o, mul(o, -1)], angle: Math.acos(Math.max(-1, Math.min(1, dot(d1, d2)))) / D2R };
  }
  // Circles of radius R tangent to carriers c1 and c2: [{ c, r }] (centres where the offset loci meet).
  function loci(c, R) {
    if (c.kind === 'line') { var n = perp(unit(sub(c.b, c.a))); return [{ kind: 'line', a: add(c.a, mul(n, R)), b: add(c.b, mul(n, R)) }, { kind: 'line', a: add(c.a, mul(n, -R)), b: add(c.b, mul(n, -R)) }]; }
    var out = [{ kind: 'circle', c: c.c, r: c.r + R }];
    if (Math.abs(c.r - R) > 1e-9 * Math.max(1, R)) out.push({ kind: 'circle', c: c.c, r: Math.abs(c.r - R) });
    return out;
  }
  function uniqCircles(list) {
    var out = [];
    list.forEach(function (q) { if (!out.some(function (o) { return dist(o.c, q.c) < 1e-7 * Math.max(1, len(q.c), q.r) && Math.abs(o.r - q.r) < 1e-7 * Math.max(1, q.r); })) out.push(q); });
    return out;
  }
  function tangentCirclesTTR(c1, c2, R) {
    if (!(R > 0)) return [];
    var out = [];
    loci(c1, R).forEach(function (A) { loci(c2, R).forEach(function (B) { meet(A, B).forEach(function (p) { out.push({ c: p, r: R }); }); }); });
    return uniqCircles(out);
  }
  // Apollonius: circles tangent to three carriers (lines and circles in any mix). Each carrier is one equation in the
  // centre X and radius R with a sign per carrier (the side of a line; outside / inside a circle):
  //   line  n·X − s·R = d        circle  |X − c|² = (r + s·R)²
  // The circle equations less the first are linear too, so two linear rows leave a line of (X, R) through 3-space
  // that meets the first circle's quadric in a quadratic (three lines: a 3 × 3 system). Every sign choice; R > 0.
  function tangentCirclesTTT(cs) {
    if (!cs || cs.length !== 3) return [];
    var lines = cs.filter(function (c) { return c.kind === 'line'; }), circles = cs.filter(function (c) { return c.kind === 'circle'; });
    var out = [], scale = 1;
    cs.forEach(function (c) { (c.kind === 'line' ? [c.a, c.b] : [c.c]).forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); }); if (c.r) scale = Math.max(scale, c.r); });
    var lrows = lines.map(function (c) { var n = perp(unit(sub(c.b, c.a))); return { n: n, d: dot(n, c.a) }; });
    for (var m = 0; m < 8; m++) {
      var s = [m & 1 ? -1 : 1, m & 2 ? -1 : 1, m & 4 ? -1 : 1], rows = [], rhs = [];
      lrows.forEach(function (L, i) { rows.push([L.n[0], L.n[1], -s[i]]); rhs.push(L.d); });
      var cs0 = circles[0], s0 = s[lines.length];
      for (var j = 1; j < circles.length; j++) {
        var cj = circles[j], sj = s[lines.length + j];
        rows.push([-2 * (cj.c[0] - cs0.c[0]), -2 * (cj.c[1] - cs0.c[1]), -2 * (cj.r * sj - cs0.r * s0)]);
        rhs.push(-(dot(cj.c, cj.c) - cj.r * cj.r - dot(cs0.c, cs0.c) + cs0.r * cs0.r));
      }
      var sols = [];
      if (!circles.length) { var x3 = solve3(rows, rhs); if (x3) sols.push(x3); }
      else {
        var A0 = rows[0], A1 = rows[1], v = [A0[1] * A1[2] - A0[2] * A1[1], A0[2] * A1[0] - A0[0] * A1[2], A0[0] * A1[1] - A0[1] * A1[0]];
        var vl = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (vl < 1e-12 * Math.max(1e-300, Math.sqrt(dot3(A0, A0) * dot3(A1, A1)))) continue;
        // the point of the two planes nearest the origin: p = Aᵀ (A Aᵀ)⁻¹ b
        var g00 = dot3(A0, A0), g01 = dot3(A0, A1), g11 = dot3(A1, A1), det = g00 * g11 - g01 * g01;
        if (Math.abs(det) < 1e-300) continue;
        var y0 = (rhs[0] * g11 - rhs[1] * g01) / det, y1 = (rhs[1] * g00 - rhs[0] * g01) / det;
        var p = [A0[0] * y0 + A1[0] * y1, A0[1] * y0 + A1[1] * y1, A0[2] * y0 + A1[2] * y1];
        var e = [p[0] - cs0.c[0], p[1] - cs0.c[1]], q = cs0.r + s0 * p[2], dq = s0 * v[2];
        var qa = v[0] * v[0] + v[1] * v[1] - dq * dq, qb = 2 * (e[0] * v[0] + e[1] * v[1] - q * dq), qc = e[0] * e[0] + e[1] * e[1] - q * q;
        quadRoots(qa, qb, qc).forEach(function (t) { sols.push([p[0] + t * v[0], p[1] + t * v[1], p[2] + t * v[2]]); });
      }
      sols.forEach(function (x) {
        if (!(x[2] > 1e-9 * scale) || !isFinite(x[0]) || !isFinite(x[1])) return;
        var C = [x[0], x[1]], R = x[2];
        // every carrier touched (a root of a squared equation may not be)
        var ok = cs.every(function (c) { var g = c.kind === 'line' ? Math.abs(Math.abs(crs(unit(sub(c.b, c.a)), sub(C, c.a))) - R) : Math.min(Math.abs(dist(C, c.c) - (c.r + R)), Math.abs(dist(C, c.c) - Math.abs(c.r - R))); return g < 1e-6 * Math.max(1, scale); });
        if (ok) out.push({ c: C, r: R });
      });
    }
    return uniqCircles(out);
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function solve3(A, b) {
    var det = function (M) { return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); };
    var D = det(A);
    if (Math.abs(D) < 1e-12) return null;
    return [0, 1, 2].map(function (k) { return det(A.map(function (row, i) { return row.map(function (x, j) { return j === k ? b[i] : x; }); })) / D; });
  }
  function quadRoots(a, b, c) {
    var sc = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
    if (sc < 1e-300) return [];
    if (Math.abs(a) < 1e-12 * sc) return Math.abs(b) < 1e-300 ? [] : [-c / b];
    var disc = b * b - 4 * a * c;
    if (disc < 0) { if (disc > -1e-10 * b * b) disc = 0; else return []; }
    var sq = Math.sqrt(disc), q = -0.5 * (b + (b < 0 ? -sq : sq));
    var r = [q / a];
    if (Math.abs(q) > 1e-300 && sq > 1e-12 * Math.abs(b)) r.push(c / q);
    return r;
  }
  // sort solutions by how near their touch points come to the picks: score(sol) = Σ |touch_i − pick_i|
  function byPicks(sols, touch, picks) {
    return sols.map(function (s) { var sc = 0; picks.forEach(function (p, i) { if (p) sc += dist(touch(s, i), p); }); return { s: s, sc: sc }; })
      .sort(function (a, b) { return a.sc - b.sc; }).map(function (o) { return o.s; });
  }

  // ------------------------------------------------------------------ split and join (on a sketch; pure, no DOM)
  // Exact primitives of an entity (Kernel.entityPrimitives): segments and arcs (radians, a0 < a1).
  function prims(e) { return e && e.t !== 'point' && K.entityPrimitives ? K.entityPrimitives(e) : []; }
  function angIn(a, a0, a1) { var t = a; while (t < a0 - 1e-12) t += 2 * Math.PI; while (t >= a0 + 2 * Math.PI - 1e-12) t -= 2 * Math.PI; return t <= a1 + 1e-12 ? t : null; }
  // points where primitive p meets primitive q (both within their extents)
  function primMeet(p, q) {
    var A = p.kind === 'seg' ? { kind: 'line', a: p.a, b: p.b } : { kind: 'circle', c: p.c, r: p.r };
    var B = q.kind === 'seg' ? { kind: 'line', a: q.a, b: q.b } : { kind: 'circle', c: q.c, r: q.r };
    function inside(pr, P) {
      if (pr.kind === 'seg') { var d = sub(pr.b, pr.a), l2 = dot(d, d), t = l2 > 0 ? dot(sub(P, pr.a), d) / l2 : 0, tol = 1e-9 * Math.max(1, Math.sqrt(l2)); return t > -tol && t < 1 + tol; }
      return pr.full || angIn(Math.atan2(P[1] - pr.c[1], P[0] - pr.c[0]), pr.a0 - 1e-12, pr.a1 + 1e-12) != null;
    }
    var pts = A.kind === 'line' && B.kind === 'line' ? (function () { var x = lineMeet(A, B); return x ? [x] : []; })() : meet(A, B);
    return pts.filter(function (P) { return inside(p, P) && inside(q, P); });
  }
  function scaleOf(e) { var m = 1; ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r'].forEach(function (k) { if (typeof e[k] === 'number') m = Math.max(m, Math.abs(e[k])); }); return m; }
  // position of P along entity e: a line's t ∈ [0, 1], an arc's angle (°) past a0, a circle's angle (°) in [0, 360)
  function paramOf(e, P) {
    if (e.t === 'line') { var d = [e.x2 - e.x1, e.y2 - e.y1], l2 = dot(d, d); return l2 > 0 ? dot(sub(P, [e.x1, e.y1]), d) / l2 : 0; }
    var a = Math.atan2(P[1] - e.cy, P[0] - e.cx) / D2R;
    if (e.t === 'circle') return ((a % 360) + 360) % 360;
    return (((a - e.a0) % 360) + 360) % 360;
  }
  // rfAK: a spline (a style spline too) as SketchSolver's free curve: { fc } of its true curve
  function isSpl(e) { return !!e && e.t === 'spline' && !!e.pts && e.pts.length >= 2; }
  function splFc(e) { return isSpl(e) && SS() ? SS().freeCurve(e) : null; }
  function splScale(e) { var m = 1; (e.pts || []).forEach(function (q) { m = Math.max(m, Math.abs(q[0]), Math.abs(q[1])); }); return m; }
  // the carriers of entity o as SketchSolver.freeHits takes them (its exact segments and arcs, or its own free curve)
  function hitCarriers(o) {
    if (!o || o.t === 'point') return [];
    if (SS().isFree(o)) { var fo = SS().freeCurve(o); return fo ? [{ fc: fo }] : []; }
    return prims(o).map(function (q) { return q.kind === 'seg' ? { kind: 'seg', a: q.a, b: q.b } : q.full ? { kind: 'circle', c: q.c, r: q.r } : { kind: 'arc', c: q.c, r: q.r, a0: q.a0, a1: q.a1, full: false }; });
  }
  // is P strictly inside entity e (not at an end, within its extent)?
  function interior(e, P) {
    if (isSpl(e)) { var fc = splFc(e), c = fc && SS().freeClosest(fc, P); return !!c && (fc.closed || (c.t > fc.t0 + 1e-6 * (fc.t1 - fc.t0) && c.t < fc.t1 - 1e-6 * (fc.t1 - fc.t0))); }
    var tol = 1e-6 * scaleOf(e);
    if (e.t === 'line') { var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), t = paramOf(e, P); return t * L > tol && (1 - t) * L > tol; }
    if (e.t === 'arc') { var s = paramOf(e, P), sw = e.a1 - e.a0; return s * D2R * e.r > tol && (sw - s) * D2R * e.r > tol; }
    return e.t === 'circle';
  }
  function pointOn(e, P) {
    if (isSpl(e)) { var fc = splFc(e); return fc ? SS().freeClosest(fc, P).p : P.slice(); }
    if (e.t === 'line') return foot({ a: [e.x1, e.y1], b: [e.x2, e.y2] }, P);
    var v = sub(P, [e.cx, e.cy]), l = len(v);
    return l < 1e-12 ? [e.cx + e.r, e.cy] : add([e.cx, e.cy], mul(v, e.r / l));
  }
  function arcAt(e, deg) { return [e.cx + e.r * Math.cos(deg * D2R), e.cy + e.r * Math.sin(deg * D2R)]; }
  function normArc(o) { while (o.a0 >= 360) { o.a0 -= 360; o.a1 -= 360; } while (o.a0 < 0) { o.a0 += 360; o.a1 += 360; } return o; }
  function snapState(f) { return JSON.stringify({ entities: f.entities, rels: f.rels || null, dims: f.dims || null }); }
  function restoreState(f, s) { var o = JSON.parse(s); f.entities = o.entities; if (o.rels) f.rels = o.rels; else delete f.rels; if (o.dims) f.dims = o.dims; else delete f.dims; }
  function hasRel(f, type, refs) { return (f.rels || []).some(function (r) { return r.type === type && r.refs.length === refs.length && refs.every(function (x) { return r.refs.indexOf(x) >= 0; }); }); }
  function dropRel(f, type, refs) { if (f.rels) f.rels = f.rels.filter(function (r) { return !(r.type === type && r.refs.length === refs.length && refs.every(function (x) { return r.refs.indexOf(x) >= 0; })); }); }
  function refEnt(r) { var m = /^(\d+)/.exec(String(r)); return m ? +m[1] : -1; }
  // Relations a command moved or made that repeat what the rest of the sketch says (redundant: over-defining) go, last
  // first, while the count is above the sketch's before (an0); `keep` are never dropped, `touch` limits the candidates
  // to relations on those entities.
  function settle(f, an0, keep, touch) {
    var S = SS(), an = S.analyze(f);
    if (an.redundant > an0.redundant && f.rels) {
      for (var m = f.rels.length - 1; m >= 0 && an.redundant > an0.redundant; m--) {
        var rel = f.rels[m];
        if (keep.indexOf(rel) >= 0 || (touch && !rel.refs.some(function (r) { return touch.indexOf(refEnt(r)) >= 0; }))) continue;
        f.rels.splice(m, 1);
        var a2 = S.analyze(f);
        if (a2.redundant < an.redundant && a2.dof === an.dof && a2.conflicts <= an.conflicts) an = a2;
        else f.rels.splice(m, 0, rel);
      }
      if (!f.rels.length) delete f.rels;
    }
    return an;
  }
  // Split entity i (line or arc) at P into two pieces at i and i + 1, as Trim cuts it (SketchSolver.afterTrim keeps the
  // relations and dimensions that still hold); the pieces join at P (Coincident) and stay on one carrier: the second
  // piece's far end lies on the first line (a line), or the pieces are Concentric (an arc). Returns the relations made.
  function splitOnce(f, i, P) {
    var S = SS(), E = f.entities, e = E[i], before = E.slice(), A = JSON.parse(JSON.stringify(e)), B = JSON.parse(JSON.stringify(e)), made = [];
    if (e.t === 'line') { A.x2 = B.x1 = clean(P[0]); A.y2 = B.y1 = clean(P[1]); }
    else { var ang = clean(e.a0 + paramOf(e, P)); A.a1 = ang; B.a0 = ang; normArc(B); }
    f.entities = E.slice(0, i).concat([A, B], E.slice(i + 1));
    S.afterTrim(f, before, i);
    var a = String(i), b = String(i + 1);
    dropRel(f, 'collinear', [a, b]); dropRel(f, 'equal', [a, b]);
    f.rels = f.rels || [];
    if (e.t === 'line') made.push({ type: 'coincident', refs: [b + '.p2', a] });
    else if (!hasRel(f, 'concentric', [a, b])) made.push({ type: 'concentric', refs: [a, b] });
    made.push({ type: 'coincident', refs: [a + '.p2', b + '.p1'] });
    made.forEach(function (r) { f.rels.push(r); });
    return made;
  }
  // A circle split at two points (angles θ1 < θ2): arcs θ1 → θ2 (at i) and θ2 → θ1 + 360 (at i + 1), end to end
  // (two Coincidents) and Tangent where they meet (the shared-end form: the centres in line with the shared point, which
  // with both ends shared puts them on one centre). Equal radii instead would be degenerate for a split across a
  // diameter (the radius is stationary there), Concentric would repeat what the Coincidents say.
  function splitCircle(f, i, P1, P2) {
    var S = SS(), E = f.entities, e = E[i], before = E.slice();
    var t1 = paramOf(e, P1), t2 = paramOf(e, P2);
    if (t2 < t1) { var tt = t1; t1 = t2; t2 = tt; }
    var base = JSON.parse(JSON.stringify(e)), A = base, B = JSON.parse(JSON.stringify(e));
    A.t = B.t = 'arc';
    A.a0 = clean(t1); A.a1 = clean(t2); B.a0 = clean(t2); B.a1 = clean(t1 + 360);
    normArc(A); normArc(B);
    f.entities = E.slice(0, i).concat([A, B], E.slice(i + 1));
    S.afterTrim(f, before, i);
    var a = String(i), b = String(i + 1), made = [{ type: 'coincident', refs: [a + '.p2', b + '.p1'] }, { type: 'coincident', refs: [b + '.p2', a + '.p1'] }, { type: 'tangent', refs: [a, b] }];
    dropRel(f, 'concentric', [a, b]); dropRel(f, 'equal', [a, b]);
    f.rels = f.rels || [];
    made.forEach(function (r) { f.rels.push(r); });
    return made;
  }
  // Split entity i of sketch f at the points pts (a line or an arc at one or more points; a circle needs two or more).
  // Relations and dimensions follow the pieces as Trim keeps them; the pieces meet at the split points (Coincident).
  // Returns { ok, pieces: [indices], error }. On a failure the sketch is exactly as it was.
  function splitEntity(f, i, pts) {
    var S = SS(), e = f.entities[i];
    if (isSpl(e)) return S.freeSplit(f, i, pts);   // rfAK: a spline or a style spline: the pieces are exactly its curve
    if (!e || (e.t !== 'line' && e.t !== 'arc' && e.t !== 'circle')) return { ok: false, error: 'Split Entities splits lines, arcs, circles and splines.' };
    var tol = 1e-6 * scaleOf(e), P = [];
    (pts || []).forEach(function (q) {
      var p = pointOn(e, q);
      if (e.t !== 'circle' && !interior(e, p)) return;
      if (!P.some(function (o) { return dist(o, p) < tol; })) P.push(p);
    });
    if (e.t === 'circle' ? P.length < 2 : !P.length) return { ok: false, error: e.t === 'circle' ? 'A circle is split at two points: click a second point on it.' : 'Click inside the ' + (e.t === 'line' ? 'line' : 'arc') + ', away from its ends.' };
    P.sort(function (p, q) { return paramOf(e, p) - paramOf(e, q); });
    var saved = snapState(f), an0 = S.analyze(f), keep = [], pieces = [];
    try {
      var at = i, rest = P;
      if (e.t === 'circle') { keep = keep.concat(splitCircle(f, i, P[0], P[1])); at = i + 1; rest = P.slice(2); }
      rest.forEach(function (p) { keep = keep.concat(splitOnce(f, at, p)); at++; });
      S.clean(f);
      S.solve(f);
      var an = settle(f, an0, keep, null);
      if (an.conflicts > an0.conflicts) throw new Error('Splitting there would leave the sketch unsolvable: nothing was split.');
      for (var k = i; k <= at; k++) pieces.push(k);
    } catch (er) { restoreState(f, saved); return { ok: false, error: er.message || String(er) }; }
    return { ok: true, pieces: pieces };
  }
  // Where entity i meets the other entities (or only those in `among`): the points inside it.
  function crossings(f, i, among) {
    var E = f.entities, e = E[i], out = [];
    if (!e) return out;
    var tol = 1e-6 * (isSpl(e) ? splScale(e) : scaleOf(e)), mine = isSpl(e) ? null : prims(e), fe = isSpl(e) ? splFc(e) : null;
    function push(P) { if (interior(e, P) && !out.some(function (x) { return dist(x, P) < tol; })) out.push(P); }
    E.forEach(function (o, j) {
      if (j === i || !o || o.t === 'point' || (among && among.indexOf(j) < 0)) return;
      // rfAK: where a spline is involved, on its true curve (SketchSolver.freeHits), not on the chords it is drawn with
      if (fe) { hitCarriers(o).forEach(function (q) { SS().freeHits(fe, q).forEach(function (t) { push(fe.pt(t)); }); }); return; }
      if (SS().isFree(o)) { var fo = SS().freeCurve(o); if (fo) hitCarriers(e).forEach(function (q) { SS().freeHits(fo, q).forEach(function (t) { push(fo.pt(t)); }); }); return; }
      prims(o).forEach(function (q) { mine.forEach(function (p) { primMeet(p, q).forEach(push); }); });
    });
    return out;
  }
  // Mastercam's Break at all intersections: every line, arc and circle of `idx` (all of them when idx is empty) split
  // where any other entity crosses it. Returns { ok, split: entities split, pieces: entities made, error }.
  function splitAll(f, idx) {
    var E = f.entities;
    var targets = (idx && idx.length ? idx : E.map(function (e, i) { return i; })).filter(function (i) { var e = E[i]; return e && (e.t === 'line' || e.t === 'arc' || e.t === 'circle' || isSpl(e)); });
    var plan = targets.map(function (i) { return { i: i, pts: crossings(f, i) }; }).filter(function (p) { var e = f.entities[p.i]; return e.t === 'circle' || (isSpl(e) && e.closed) ? p.pts.length >= 2 : p.pts.length; });
    if (!plan.length) return { ok: false, error: idx && idx.length ? 'Nothing crosses the selected entities: nothing to split.' : 'Nothing in the sketch crosses anything else: nothing to split.' };
    plan.sort(function (a, b) { return b.i - a.i; });   // from the last: a split shifts only the entities after it
    var saved = snapState(f), made = 0;
    for (var k = 0; k < plan.length; k++) {
      var r = splitEntity(f, plan[k].i, plan[k].pts);
      if (!r.ok) { restoreState(f, saved); return { ok: false, error: r.error }; }
      made += r.pieces.length;
    }
    return { ok: true, split: plan.length, pieces: made };
  }
  // AutoCAD's JOIN: collinear lines that touch or overlap become one line (the outer ends, the first line's direction);
  // arcs on one circle that touch or overlap become one arc, or a circle when they close it. Relations of the outer
  // ends and of the whole entities (Horizontal, Parallel, Tangent, …) move to the joined entity; those of inner ends
  // and those between the joined entities go; an arc's radius dimension stays. Returns { ok, index, error }.
  function joinEntities(f, idx) {
    var S = SS(), E = f.entities;
    idx = (idx || []).filter(function (i, k, a) { return E[i] && a.indexOf(i) === k; }).sort(function (a, b) { return a - b; });
    if (idx.length < 2) return { ok: false, error: 'Select two or more lines, or two or more arcs, to join.' };
    var es = idx.map(function (i) { return E[i]; }), N, sc = 1;
    es.forEach(function (e) { sc = Math.max(sc, scaleOf(e)); });
    var tol = 1e-6 * sc;
    if (es.every(function (e) { return e.t === 'line'; })) {
      var a = [es[0].x1, es[0].y1], u = unit([es[0].x2 - es[0].x1, es[0].y2 - es[0].y1]), L0 = { a: a, b: add(a, u) };
      var iv = [];
      for (var k = 0; k < es.length; k++) {
        var p1 = [es[k].x1, es[k].y1], p2 = [es[k].x2, es[k].y2];
        if (dist(foot(L0, p1), p1) > tol || dist(foot(L0, p2), p2) > tol) return { ok: false, error: 'The lines are not collinear: only lines on one line can be joined.' };
        var t1 = dot(sub(p1, a), u), t2 = dot(sub(p2, a), u);
        iv.push([Math.min(t1, t2), Math.max(t1, t2)]);
      }
      iv.sort(function (x, y) { return x[0] - y[0]; });
      var hi = iv[0][1];
      for (k = 1; k < iv.length; k++) { if (iv[k][0] > hi + tol) return { ok: false, error: 'The lines do not touch or overlap: there is a gap between them.' }; hi = Math.max(hi, iv[k][1]); }
      N = JSON.parse(JSON.stringify(es[0]));
      var A = add(a, mul(u, iv[0][0])), B = add(a, mul(u, hi));
      N.x1 = clean(A[0]); N.y1 = clean(A[1]); N.x2 = clean(B[0]); N.y2 = clean(B[1]);
      delete N.infinite;
    } else if (es.every(function (e) { return e.t === 'arc'; })) {
      var c0 = [es[0].cx, es[0].cy], r0 = es[0].r;
      if (!es.every(function (e) { return dist([e.cx, e.cy], c0) <= tol && Math.abs(e.r - r0) <= tol; })) return { ok: false, error: 'The arcs are not on one circle: only arcs with the same centre and radius can be joined.' };
      var arcs = es.map(function (e) { var o = normArc({ a0: e.a0, a1: e.a1 }); return [o.a0, o.a1]; }), tolDeg = tol / Math.max(r0, 1e-12) / D2R, span = null;
      // a run round the circle from each arc's start that takes in every arc
      for (var s = 0; s < arcs.length && !span; s++) {
        var st = arcs[s][0], rel = arcs.map(function (x) { var d = x[0] - st; while (d < -tolDeg) d += 360; while (d >= 360 - tolDeg) d -= 360; return [d, d + (x[1] - x[0])]; }).sort(function (x, y) { return x[0] - y[0]; });
        var end = rel[0][1], good = rel[0][0] <= tolDeg;
        for (k = 1; k < rel.length && good; k++) { if (rel[k][0] > end + tolDeg) good = false; else end = Math.max(end, rel[k][1]); }
        if (good) span = [st, st + end];
      }
      if (!span) return { ok: false, error: 'The arcs do not touch or overlap: there is a gap between them.' };
      N = JSON.parse(JSON.stringify(es[0]));
      if (span[1] - span[0] >= 360 - tolDeg) { N.t = 'circle'; delete N.a0; delete N.a1; }
      else { N.a0 = clean(span[0]); N.a1 = clean(span[1]); normArc(N); }
    } else return { ok: false, error: 'Join Entities joins lines with lines, or arcs with arcs.' };
    var saved = snapState(f), an0 = S.analyze(f), before = E.slice();
    var list = before.map(function (e, i) { return i === idx[0] ? N : e; }).filter(function (e, i) { return idx.indexOf(i) < 0 || i === idx[0]; });
    var ni = list.indexOf(N), map = before.map(function (e) { return list.indexOf(e); });
    var nf = { entities: list }, n1 = N.t === 'circle' ? null : S.refPoint(nf, ni + '.p1'), n2 = N.t === 'circle' ? null : S.refPoint(nf, ni + '.p2');
    function mapRef(r) {
      var p = S.parseRef(r);
      if (!p) return null;
      if (p.o) return r;
      var tail = String(r).slice(String(p.e).length);
      if (idx.indexOf(p.e) < 0) return map[p.e] >= 0 ? String(map[p.e]) + tail : null;
      if (p.s === null) return String(ni);
      if (p.s === 'c') return N.t !== 'line' ? ni + '.c' : null;
      if (p.s !== 'p') return null;
      var pt = S.refPoint({ entities: before }, r);
      if (pt && n1 && dist(pt, n1) <= tol) return ni + '.p1';
      if (pt && n2 && dist(pt, n2) <= tol) return ni + '.p2';
      return null;
    }
    // relations on a whole joined entity that still hold on the longer one (an Equal length, a Midpoint, a Fix or a
    // Symmetric pairing of its ends would not)
    var WHOLE = { coincident: 1, horizontal: 1, vertical: 1, parallel: 1, perpendicular: 1, collinear: 1, tangent: 1, concentric: 1, coradial: 1, intersection: 1, distance: 1, angle: 1 };
    if (N.t !== 'line') WHOLE.equal = 1;
    var rels = [];
    (f.rels || []).forEach(function (rel) {
      var refs = rel.refs.map(mapRef);
      if (refs.some(function (x) { return x == null; })) return;
      if (!WHOLE[rel.type] && rel.refs.some(function (x) { var p = S.parseRef(x); return p && !p.o && p.s === null && idx.indexOf(p.e) >= 0; })) return;
      var onN = refs.filter(function (x) { return refEnt(x) === ni; });
      if (refs.length >= 2 && onN.length === refs.length && (refs.some(function (x) { return x === String(ni); }) || refs[0] === refs[1])) return;
      var c = JSON.parse(JSON.stringify(rel)); c.refs = refs; rels.push(c);
    });
    var dims = [];
    (f.dims || []).forEach(function (d) {
      var c = JSON.parse(JSON.stringify(d));
      if (idx.indexOf(d.e) < 0) { if (map[d.e] < 0) return; c.e = map[d.e]; dims.push(c); return; }
      if (d.e !== idx[0] && dims.some(function (x) { return x.e === ni; })) return;
      if (N.t === 'arc' && d.k === 'r') { c.e = ni; dims.push(c); }
      else if (N.t === 'circle' && (d.k === 'r' || d.k === 'dia')) { c.e = ni; c.k = 'dia'; if (d.k === 'r') c.show = 'r'; dims.push(c); }
    });
    f.entities = list;
    if (rels.length) f.rels = rels; else delete f.rels;
    if (dims.length) f.dims = dims; else delete f.dims;
    try {
      S.clean(f);
      S.solve(f);
      var an = settle(f, an0, [], [ni]);
      if (an.conflicts > an0.conflicts) throw new Error('The joined entity would leave the sketch unsolvable: nothing was joined.');
    } catch (er) { restoreState(f, saved); return { ok: false, error: er.message || String(er) }; }
    return { ok: true, index: ni, kind: N.t };
  }

  UI.sketchConstruct = {
    tangentLines: tangentLines, tangentAtAngle: tangentAtAngle, bisectors: bisectors, lineMeet: lineMeet,
    tangentCirclesTTR: tangentCirclesTTR, tangentCirclesTTT: tangentCirclesTTT,
    splitEntity: splitEntity, splitAll: splitAll, crossings: crossings, joinEntities: joinEntities
  };

  // ------------------------------------------------------------------ the commands: shared
  var PICK = 'stroke:#2d7dd2;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.75';
  var HOT = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  function toUV(mx, my) { return UI.screenToPlane(mx, my, UI.activePlane()); }
  function scr(q) { return UI.worldToScreen(K.to3D(UI.activePlane(), q[0], q[1])); }
  function pxWorld(mx, my) { var a = toUV(mx, my), b = toUV(mx + 1, my); return a && b ? dist(a, b) : 1; }
  function ring(p, px) { var s = scr(p), out = []; for (var k = 0; k <= 16; k++) { var a = k * Math.PI / 8, q = toUV(s[0] + px * Math.cos(a), s[1] + px * Math.sin(a)); if (q) out.push(q); } return out; }
  function curvePts(c, e) {
    if (!c && isSpl(e)) { var fc = splFc(e); return fc ? SS().freePts(fc, fc.t0, fc.t1) : e.pts; }   // rfAK
    if (c.kind === 'line') return [c.a, c.b];
    var a0 = 0, a1 = 360, out = [];
    if (e && e.t === 'arc') { a0 = e.a0; a1 = e.a1; }
    for (var k = 0; k <= 64; k++) { var a = (a0 + (a1 - a0) * k / 64) * D2R; out.push([c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)]); }
    return out;
  }
  function selIdx(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  // The curve under the cursor as a ref of one of `kinds` ('line': a line or a rectangle / polygon / polyline edge;
  // 'circle': a circle or an arc): { r, i, curve, uv, label } | { bad } | null
  function curveAt(f, mx, my, kinds) {
    var S = SS(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index], uv = toUV(mx, my), best = null, bd = Infinity;
    if (!e || !uv) return null;
    S.curveRefs(f, hit.index).forEach(function (r) {
      var c = S.refCurve(f, r);
      if (!c || kinds.indexOf(c.kind) < 0) return;
      if (r === String(hit.index) && e.t !== 'line' && e.t !== 'circle' && e.t !== 'arc') return;   // a slot's own ref is its centre line
      var d = c.kind === 'line' ? (function () { var d0 = sub(c.b, c.a), l2 = dot(d0, d0), t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(uv, c.a), d0) / l2)) : 0; return dist(uv, add(c.a, mul(d0, t))); })() : Math.abs(dist(uv, c.c) - c.r);
      if (d < bd) { bd = d; var nm = r; try { nm = S.refName(f, r); } catch (er) { } best = { r: r, i: hit.index, curve: c, uv: uv, label: nm }; }
    });
    return best || { bad: true };
  }
  function freshCurve(f, pk) { var c = pk && SS().refCurve(f, pk.r); return c || null; }
  // The sketch point (or the origin) exactly at P, other than entity `self`'s own: its ref, or null.
  function pointRefAt(f, P, self) {
    var S = SS(), tol = 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]));
    if (Math.abs(P[0]) < tol && Math.abs(P[1]) < tol) return 'O';
    for (var j = 0; j < f.entities.length; j++) {
      if (j === self || !f.entities[j]) continue;
      var e = f.entities[j], prs = S.pointRefs(f, j);
      for (var k = 0; k < prs.length; k++) {
        if (/\.mid$/.test(prs[k].ref) || (/\.c$/.test(prs[k].ref) && (e.t === 'rect' || e.t === 'slot'))) continue;
        if (Math.abs(prs[k].pt[0] - P[0]) < tol && Math.abs(prs[k].pt[1] - P[1]) < tol) return prs[k].ref;
      }
    }
    return null;
  }
  // a relation the placement needs: one that would over-define the sketch refuses the whole placement
  function must(f, type, refs, opts) {
    var S = SS(), o = { rejectOver: true };
    if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    var r = S.addRelation(f, type, refs, o);
    if (!r.ok) throw new Error((S.TYPES[type] ? S.TYPES[type].name : type) + ' would over-define the sketch: nothing was added.');
    return r;
  }
  // a driving dimension, left out when it would over-define the sketch (as typed values are)
  function optDim(f, d) {
    f.dims = f.dims || [];
    f.dims.push(d);
    if (SS().overDefines(f, 'dim', f.dims.length - 1)) { f.dims.pop(); if (!f.dims.length) delete f.dims; return false; }
    return true;
  }
  function dimOff() { var s = (UI.cam && UI.cam.scale) || 0.1; return Math.round(14 * s * 1e4) / 1e4; }
  // One placement = one undo step: fn(f) changes the sketch and returns { ok, … } (or throws); a failure puts the
  // sketch back exactly and takes the undo step back. A success remembers how to take it back (Next solution).
  function placeStep(fn) {
    var f = sketch();
    if (!f || !SS()) return { ok: false, error: 'Open a sketch first.' };
    var snap = snapState(f), dirty0 = App.sketchDirty;
    UI.pushUndo(); App.sketchDirty = true;
    var depth = App.undo.length, r, n0 = f.entities.length;
    try { r = fn(f) || { ok: false }; } catch (er) { r = { ok: false, error: er.message || String(er) }; }
    if (!r.ok) { restoreState(f, snap); if (App.undo.length === depth) App.undo.pop(); App.sketchDirty = dirty0; }
    else if (UI.afterSketchCommit) UI.afterSketchCommit(sketch() || f, n0);   // sketch-hooks: Dynamic Mirror copies what this step placed, in the same undo step
    refresh();
    if (r.ok) { var g = sketch() || f; r.undo = { snap: snap, after: snapState(g), key: placedKey(g), depth: depth, dirty0: dirty0 }; }
    return r;
  }
  // what must not have changed for a placement to be taken back (the dimension labels may have been laid out since)
  function placedKey(f) { return JSON.stringify({ e: f.entities, r: f.rels || null, d: (f.dims || []).map(function (d) { return d.e + d.k + (d.driven ? 'd' : ''); }) }); }
  // Take the placement u back when nothing has changed since; returns a way to put it back again, or null.
  function takeBack(u) {
    var f = sketch();
    if (!f || !u || App.undo.length !== u.depth || placedKey(f) !== u.key) return null;
    var entry = App.undo.pop(), after = snapState(f);
    restoreState(f, u.snap); App.sketchDirty = u.dirty0;
    return function () { var g = sketch(); if (!g) return; restoreState(g, after); App.undo.push(entry); App.sketchDirty = true; refresh(); };
  }

  // A command PropertyManager: o = { id, title, icon, message, values, groups, onPoint(uv, mx, my), onMove(uv, mx, my),
  // onChange(v, key), onOK(v), next(), hint() }. Clicks in the graphics area go to onPoint, moves to onMove; ✓ / Esc end.
  var cur = null;
  UI.sketchConstructActive = function (id) { var s = UI.pmSpec && UI.pmSpec(); return !!(s && s.construct && (!id || s.construct === id)); };
  function openCommand(o) {
    if (App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return false; }
    if (UI.sketchConstructActive(o.id)) { UI.pmCancel(); return false; }
    if (App.tool !== 'select') UI.setTool('select');
    cur = o;
    UI.openPM({
      title: o.title, icon: o.icon, construct: o.id, noFocus: true, keepSelection: !!o.keepSelection, values: o.values, message: o.message,
      command: o.onPoint ? {
        ownHover: true, dynMirror: true,   // sketch-hooks: Dynamic Mirror mirrors the lines / circles these commands place
        onSketchMove: function (uv, mx, my) { if (o.onMove) o.onMove(uv, mx, my); },
        onSketchPoint: function (uv, mx, my) { if (!uv) uv = toUV(mx, my); if (uv) o.onPoint(uv, mx, my); }
      } : null,
      onSelection: o.onSelection, okBlocked: o.okBlocked,
      groups: o.groups,
      onChange: function (v, key) { if (key && o.onChange) o.onChange(v, key); },
      onOK: function (v) { return o.onOK ? o.onOK(v) : undefined; },
      onClose: function () { if (cur === o) cur = null; App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    });
    UI.refreshRibbon();
    if (o.hint) o.hint();
    return true;
  }
  // N: the next solution, while a command that has them is open (not while typing in a box)
  document.addEventListener('keydown', function (ev) {
    if (!cur || !cur.next || ev.ctrlKey || ev.metaKey || ev.altKey || (ev.key !== 'n' && ev.key !== 'N')) return;
    var t = ev.target, tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select' || (tag === 'input' && !/^(checkbox|radio|button)$/i.test(t.type || ''))) return;
    if (!UI.sketchConstructActive() || App.mode !== 'sketch') return;
    ev.preventDefault(); ev.stopPropagation();
    cur.next();
  }, true);
  function feedback() { if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
  function showPick(f, pk) { var c = freshCurve(f, pk); if (c) UI.sketchPreview([curvePts(c, f.entities[pk.i])], PICK, 'sk-trim-pick'); }
  function showHot(f, c) { if (c && c.curve) UI.sketchPreview([curvePts(c.curve, f.entities[c.i])], HOT, 'sk-trim-span'); }
  function temp(ents) { App.tempEntities = ents || []; UI.updateTemp(); }
  function lineEnt(a, b, construction) { var e = { t: 'line', x1: clean(a[0]), y1: clean(a[1]), x2: clean(b[0]), y2: clean(b[1]) }; if (construction) e.construction = true; return e; }
  // Solutions engine shared by Tangent Line, Bisector and Tangent Circle: tool = { solve(ctx, v) -> [sol], build(f, sol,
  // ctx, v) -> { ok }, name }; the placement stays replaceable (Next solution, a changed value) until the sketch changes.
  function solutions(tool) {
    var st = { last: null };
    st.place = function (ctx, k, v) {
      var sols = tool.solve(ctx, v);
      if (!sols.length) { var why = tool.none ? tool.none(ctx, v) : 'No solution there.'; UI.toast(why); UI.setStatus(why); return { ok: false, error: why }; }
      k = ((k % sols.length) + sols.length) % sols.length;
      var r = placeStep(function (f) { return tool.build(f, sols[k], ctx, v); });
      if (!r.ok) { UI.toast(r.error || 'Nothing was added.'); UI.setStatus(r.error || ''); return r; }
      st.last = { ctx: ctx, k: k, n: sols.length, undo: r.undo };
      UI.setStatus(tool.name + ' placed' + (sols.length > 1 ? ' (solution ' + (k + 1) + ' of ' + sols.length + ': Next solution or N for another)' : '') + '. Pick again for another, or press ✓ / Esc to finish.');
      return r;
    };
    // the placement just made again, with solution k (or the same one with changed values); left as it was when the
    // new one cannot be made
    st.redo = function (k, v) {
      var L = st.last;
      if (!L) return false;
      var sols = tool.solve(L.ctx, v);
      if (!sols.length) { UI.setStatus(tool.none ? tool.none(L.ctx, v) : 'No solution.'); return false; }
      var back = takeBack(L.undo);
      if (!back) { st.last = null; return false; }
      var r = st.place(L.ctx, k == null ? Math.min(L.k, sols.length - 1) : k, v);
      if (!r.ok) { back(); st.last = L; return false; }
      return true;
    };
    st.label = function () { return st.last && st.last.n > 1 ? 'Solution ' + (st.last.k + 1) + ' of ' + st.last.n : st.last ? 'One solution' : 'No placement yet'; };
    return st;
  }
  function solutionGroup(st, next) {
    return { title: 'Solution', fields: [
      { type: 'static', label: '', value: function () { return st.label(); } },
      { type: 'buttons', buttons: [{ label: 'Next solution (N)', onclick: function () { next(); } }] }] };
  }

  // ------------------------------------------------------------------ Tangent Line
  // Mastercam's Line Tangent / AutoCAD's TAN TAN: pick two circles or arcs, the line tangent to both is placed (of the
  // up to four, outer and inner, the one whose touch points are nearest the picks), held by Tangent to each and its
  // ends Coincident on them. Angle: one circle and the Angle / Length of a line tangent to it there (its start
  // Coincident and Tangent; Horizontal / Vertical at 0° / 90°).
  var TLS = { mode: 'tt', angle: 0, len: null, construction: false, dims: true };
  function cmdTangentLine() {
    if (TLS.len == null) TLS.len = UI.lenDefault(20);
    var v = { mode: TLS.mode, angle: TLS.angle, len: TLS.len, construction: TLS.construction, dims: TLS.dims }, picks = [], hover = null;
    var tool = {
      name: 'Tangent Line',
      solve: function (ctx) {
        var f = sketch(), c1 = freshCurve(f, ctx.picks[0]);
        if (!c1) return [];
        if (ctx.mode === 'angle') {
          var tp = tangentAtAngle(c1, +ctx.angle || 0), L = +ctx.len > 0 ? +ctx.len : UI.lenDefault(20), out = [];
          byPicks(tp, function (s) { return s.t; }, [ctx.picks[0].uv]).forEach(function (s) { [1, -1].forEach(function (sg) { out.push({ a: s.t, b: add(s.t, mul(s.u, sg * L)) }); }); });
          return out;
        }
        var c2 = freshCurve(f, ctx.picks[1]);
        return c2 ? byPicks(tangentLines(c1, c2), function (s, i) { return i ? s.b : s.a; }, [ctx.picks[0].uv, ctx.picks[1].uv]) : [];
      },
      none: function (ctx) { return ctx.mode === 'angle' ? 'No tangent line there.' : 'No line is tangent to both: one lies inside the other.'; },
      build: function (f, s, ctx) {
        var i = f.entities.length, r1 = ctx.picks[0].r;
        f.entities.push(lineEnt(s.a, s.b, ctx.construction));
        must(f, 'coincident', [i + '.p1', r1]);
        if (ctx.mode === 'angle') {
          must(f, 'tangent', [String(i), r1]);
          var a = ((+ctx.angle % 180) + 180) % 180;
          if (Math.abs(a) < 1e-9 || Math.abs(a - 180) < 1e-9) must(f, 'horizontal', [String(i)]);
          else if (Math.abs(a - 90) < 1e-9) must(f, 'vertical', [String(i)]);
          if (ctx.dims) optDim(f, { e: i, k: 'len', off: dimOff() });
        } else {
          var r2 = ctx.picks[1].r;
          must(f, 'coincident', [i + '.p2', r2]);
          must(f, 'tangent', [String(i), r1]);
          must(f, 'tangent', [String(i), r2]);
        }
        return { ok: true, index: i };
      }
    };
    var st = solutions(tool);
    function ctxNow() { return { mode: v.mode, picks: picks.slice(), angle: +v.angle || 0, len: +v.len, construction: !!v.construction, dims: !!v.dims }; }
    function want() { return v.mode === 'angle' ? 1 : 2; }
    function hintNow(quiet) {
      var t = v.mode === 'angle' ? 'Select a circle or arc: the line is tangent to it at the Angle, on the side nearest the click.'
        : picks.length ? 'Select the second circle or arc.' : 'Select a circle or arc, then a second one: the line tangent to both.';
      hint('<b>Tangent Line:</b> ' + t); if (!quiet) UI.setStatus(t);
    }
    function draw() {
      var f = sketch();
      if (!f) return;
      feedback(); temp([]);
      picks.forEach(function (p) { showPick(f, p); });
      if (hover && hover.curve) showHot(f, hover);
      if (v.mode === 'tt' && picks.length === 1 && hover && hover.curve && hover.i !== picks[0].i) {
        var s = tool.solve({ mode: 'tt', picks: [picks[0], hover] });
        if (s.length) temp([lineEnt(s[0].a, s[0].b, v.construction)]);
      } else if (v.mode === 'angle' && !picks.length && hover && hover.curve) {
        var sa = tool.solve({ mode: 'angle', picks: [hover], angle: +v.angle || 0, len: +v.len });
        if (sa.length) temp([lineEnt(sa[0].a, sa[0].b, v.construction)]);
      }
    }
    function next() { if (!st.last) { UI.setStatus('Place a tangent line first: Next solution swaps the one just placed.'); return; } st.redo(st.last.k + 1, ctxNow()); UI.renderPM(); draw(); }
    openCommand({
      id: 'tangentLine', title: 'Tangent Line', icon: 'tangentLine', values: v,
      message: 'Select two circles or arcs: the line tangent to both. Angle: one circle and the line\'s angle.',
      hint: hintNow, next: next,
      onMove: function (uv, mx, my) { var f = sketch(); hover = f ? curveAt(f, mx, my, ['circle']) : null; draw(); },
      onPoint: function (uv, mx, my) {
        var f = sketch(), c = f && curveAt(f, mx, my, ['circle']);
        if (!c || !c.curve) { UI.setStatus('Select a circle or an arc.'); return; }
        if (picks.length && picks[0].i === c.i) { UI.setStatus('Select a different circle or arc.'); return; }
        picks.push(c);
        if (picks.length < want()) { UI.renderPM(); hintNow(); draw(); return; }
        st.place(ctxNow(), 0, ctxNow());
        picks = [];
        UI.renderPM(); hintNow(true); draw();
      },
      groups: [
        { title: 'Line Type', fields: [{ type: 'radio', key: 'mode', rerender: true, options: [['tt', 'Tangent to two arcs'], ['angle', 'Tangent at an angle']] }] },
        { title: 'Tangent To', fields: [{ type: 'pick', icon: 'circle', placeholder: 'Circles or arcs', value: function () { return picks.length ? picks.map(function (p) { return p.label; }).join(', ') : ''; }, active: function () { return true; } }] },
        { title: 'Parameters', show: function (x) { return x.mode === 'angle'; }, fields: [
          { type: 'number', key: 'angle', label: 'Angle', unit: '°' },
          { type: 'number', key: 'len', label: 'Length', unit: 'u', min: 0 }] },
        solutionGroup(st, next),
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'dims', label: 'Add dimensions', show: function (x) { return x.mode === 'angle'; } }] }
      ],
      onChange: function (x, key) {
        Object.keys(TLS).forEach(function (k) { TLS[k] = x[k]; });
        if (key === 'mode') { picks = []; st.last = null; hintNow(); }
        else if (st.last && st.last.ctx.mode === x.mode) {
          // a changed value redoes the line just placed (as SolidWorks' PropertyManagers edit the last entity)
          var c = st.last.ctx; c.angle = +x.angle || 0; c.len = +x.len; c.construction = !!x.construction; c.dims = !!x.dims;
          st.redo(null, c);
        }
        draw();
      }
    });
    draw();
  }

  // ------------------------------------------------------------------ Perpendicular Line
  // Mastercam's Line Perpendicular: pick a line (a sketch line or edge, or a straight model edge), then the point the
  // line passes through. The line starts at the foot on the reference (Coincident on it, Perpendicular to it) and ends
  // at the point (Coincident where it lands on a sketch point), or runs the typed Length towards it (a sketch point
  // there lies on the line; Add dimensions gives the length).
  var PPS = { len: 0, construction: false, dims: true };
  function modelEdgeAt(mx, my) {
    if (App.mode !== 'sketch' || !App.edges || !App.edges.length || !UI.pickEdge) return null;
    var pk = UI.pickEdge(mx, my), e = pk && pk.edge, V = K.vec;
    if (!e || !e.a || !e.b) return null;
    if (e.curve != null && App.curves && App.curves[e.curve]) return { bad: 'Select a straight edge.' };
    var pl = UI.activePlane(), a = K.to2D(pl, e.a), b = K.to2D(pl, e.b), r6 = function (x) { return Math.round(x * 1e6) / 1e6; };
    a = [r6(a[0]), r6(a[1])]; b = [r6(b[0]), r6(b[1])];
    if (dist(a, b) < 1e-9 || !V) return { bad: 'That edge is square to the sketch plane: select an edge that lies along it.' };
    return { edge: true, curve: { kind: 'line', a: a, b: b }, label: 'Edge<1>' };
  }
  function cmdPerpendicularLine() {
    var v = { len: PPS.len, construction: PPS.construction, dims: PPS.dims }, ref = null, last = null, count = 0;
    var pre = (function () { var f = sketch(); if (!f) return []; return selIdx(f).filter(function (i) { return f.entities[i].t === 'line'; }); })();
    if (pre.length === 1) { var f0 = sketch(); ref = { r: String(pre[0]), i: pre[0], curve: SS().refCurve(f0, String(pre[0])), label: SS().refName(f0, String(pre[0])) }; }
    function frame(f) { var c = ref && (ref.edge ? ref.curve : freshCurve(f, ref)); return c && c.kind === 'line' && dist(c.a, c.b) > 1e-12 ? c : null; }
    function hintNow(quiet) { var t = ref ? 'Click the point the line passes through' + (+v.len > 0 ? ' (it runs ' + UI.fmtNum(+v.len, 3) + ' from the reference towards it).' : ': it runs from the reference to that point.') : 'Select a line or edge to be perpendicular to.'; hint('<b>Perpendicular Line:</b> ' + t); if (!quiet) UI.setStatus(t); }
    // what a click at uv would place: { a (foot), b (end), P (the point), info } | { error }
    function plan(f, uv, mx, my) {
      var L = frame(f);
      if (!L) return { error: 'Select a line or edge first.' };
      var info = UI.sketchInferPoint && mx != null ? UI.sketchInferPoint(uv, mx, my) : { p: uv }, P = info.p, F = foot(L, P), d = sub(P, F), l = len(d);
      if (l < 1e-9 * Math.max(1, len(P))) return { error: 'Click off the reference: the line runs square to it from there.' };
      var b = +v.len > 0 ? add(F, mul(d, +v.len / l)) : P;
      return { a: F, b: b, P: P, info: info };
    }
    function draw() {
      var f = sketch();
      if (!f) return;
      feedback(); temp([]);
      var L = frame(f);
      if (L) UI.sketchPreview([[L.a, L.b]], PICK, 'sk-trim-pick');
      if (!last) return;
      if (!ref) { var c = curveAt(f, last.mx, last.my, ['line']); if (c && c.curve) showHot(f, c); else { var me = modelEdgeAt(last.mx, last.my); if (me && me.curve) UI.sketchPreview([[me.curve.a, me.curve.b]], HOT, 'sk-trim-span'); } return; }
      var p = plan(f, last.uv, last.mx, last.my);
      if (p.info && p.info.snap && UI.sketchSnapMark) UI.sketchSnapMark(p.info.p, [last.mx, last.my], p.info.snap.kind === 'on');
      if (L) UI.sketchPreview([[L.a, L.b]], PICK, 'sk-trim-pick');
      if (!p.error) temp([lineEnt(p.a, p.b, v.construction)]);
    }
    function place(p) {
      var r = placeStep(function (f) {
        var i = f.entities.length;
        f.entities.push(lineEnt(p.a, p.b, v.construction));
        if (!ref.edge) {
          must(f, 'perpendicular', [ref.r, String(i)]);
          must(f, 'coincident', [i + '.p1', ref.r]);
        }
        var pr = pointRefAt(f, cpt(p.P), i) || pointRefAt(f, p.P, i);
        if (pr && dist(p.P, p.b) < 1e-9 * Math.max(1, len(p.b))) must(f, 'coincident', [i + '.p2', pr]);
        else if (pr) must(f, 'coincident', [pr, String(i)]);
        if (+v.len > 0 && v.dims) optDim(f, { e: i, k: 'len', off: dimOff() });
        return { ok: true };
      });
      if (!r.ok) { UI.toast(r.error); return; }
      count++;
      temp([]);
      UI.setStatus('Perpendicular Line placed (' + count + ' so far). Click another point, or press ✓ / Esc to finish.');
    }
    openCommand({
      id: 'perpLine', title: 'Perpendicular Line', icon: 'perpLine', values: v,
      message: 'Select a line or edge, then the point the perpendicular line passes through.',
      hint: hintNow,
      onMove: function (uv, mx, my) { last = { uv: uv, mx: mx, my: my }; draw(); },
      onPoint: function (uv, mx, my) {
        var f = sketch();
        if (!f) return;
        last = { uv: uv, mx: mx, my: my };
        if (!ref) {
          var c = curveAt(f, mx, my, ['line']);
          if (c && c.bad) { UI.setStatus('Select a line or a straight edge: a Perpendicular Line is square to a line.'); return; }
          if (!c) { c = modelEdgeAt(mx, my); if (c && c.bad) { UI.setStatus(c.bad); return; } }
          if (!c) { UI.setStatus('Select a line or edge to be perpendicular to.'); return; }
          ref = c; UI.renderPM(); hintNow(); draw();
          return;
        }
        var p = plan(f, uv, mx, my);
        if (p.error) { UI.setStatus(p.error); return; }
        place(p); draw();
      },
      groups: [
        { title: 'Reference', fields: [{ type: 'pick', icon: 'line', placeholder: 'Line or edge', value: function () { return ref ? ref.label : ''; }, active: function () { return !ref; },
          onActivate: function () { ref = null; UI.renderPM(); hintNow(); draw(); } }] },
        { title: 'Length', fields: [{ type: 'number', key: 'len', label: 'Length (0: to the point)', unit: 'u', min: 0 }] },
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'dims', label: 'Add dimensions' }] }
      ],
      onChange: function (x) { PPS.len = +x.len || 0; PPS.construction = !!x.construction; PPS.dims = !!x.dims; hintNow(); draw(); }
    });
    draw();
  }

  // ------------------------------------------------------------------ Bisector
  // AutoCAD's XLINE Bisect / Mastercam's Line Bisect: pick two lines; the line bisecting the angle between the sides
  // picked runs from where they meet (Coincident with their shared end, else an Intersection relation with both), the
  // shorter line's length or a typed Length, as construction by default. *Keep bisecting* holds it parametric with a
  // small construction circle centred on its midpoint and tangent to both lines (the centre of a circle touching two
  // lines lies on their bisector): the solver has no equal-angle relation, and two angle dimensions would fix the angle.
  var BIS = { lenMode: 'short', len: null, construction: true, keep: true, dims: false };
  function cmdBisectorLine() {
    if (BIS.len == null) BIS.len = UI.lenDefault(20);
    var v = { lenMode: BIS.lenMode, len: BIS.len, construction: BIS.construction, keep: BIS.keep, dims: BIS.dims }, picks = [], hover = null;
    var tool = {
      name: 'Bisector',
      solve: function (ctx) {
        var f = sketch(), L1 = freshCurve(f, ctx.picks[0]), L2 = freshCurve(f, ctx.picks[1]);
        if (!L1 || !L2) return [];
        var bs = bisectors(L1, L2, ctx.picks[0].uv, ctx.picks[1].uv);
        if (!bs) return [];
        var L = ctx.lenMode === 'length' && +ctx.len > 0 ? +ctx.len : Math.min(dist(L1.a, L1.b), dist(L2.a, L2.b));
        return bs.dirs.map(function (d) { return { a: bs.at, b: add(bs.at, mul(d, L)), angle: bs.angle }; });
      },
      none: function () { return 'The lines are parallel: they have no bisector.'; },
      build: function (f, s, ctx) {
        var i = f.entities.length, r1 = ctx.picks[0].r, r2 = ctx.picks[1].r;
        f.entities.push(lineEnt(s.a, s.b, ctx.construction));
        // from the lines' shared end where they meet at one (it follows them), else where their carriers cross
        var at = null, S = SS(), tol = 1e-7 * Math.max(1, len(s.a));
        [ctx.picks[0].i, ctx.picks[1].i].forEach(function (j) { if (!at) S.pointRefs(f, j).forEach(function (pr) { if (!at && !/\.(mid|c)$/.test(pr.ref) && dist(pr.pt, s.a) < tol) at = pr.ref; }); });
        if (at) must(f, 'coincident', [i + '.p1', at]);
        else must(f, 'intersection', [i + '.p1', r1, r2]);
        if (ctx.keep) {
          var m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], c1 = freshCurve(f, ctx.picks[0]), rr = dist(m, foot(c1, m));
          if (rr > 1e-9) {
            var ci = f.entities.length;
            f.entities.push({ t: 'circle', cx: clean(m[0]), cy: clean(m[1]), r: clean(rr), construction: true });
            must(f, 'midpoint', [ci + '.c', String(i)]);
            must(f, 'tangent', [String(ci), r1]);
            must(f, 'tangent', [String(ci), r2]);
          }
        }
        if (ctx.dims) optDim(f, { e: i, k: 'len', off: dimOff() });
        return { ok: true, index: i };
      }
    };
    var st = solutions(tool);
    function ctxNow() { return { picks: picks.slice(), lenMode: v.lenMode, len: +v.len, construction: !!v.construction, keep: !!v.keep, dims: !!v.dims }; }
    function hintNow(quiet) { var t = picks.length ? 'Select the second line: the bisector runs between the sides picked.' : 'Select two lines: the line bisecting the angle between them.'; hint('<b>Bisector:</b> ' + t); if (!quiet) UI.setStatus(t); }
    function draw() {
      var f = sketch();
      if (!f) return;
      feedback(); temp([]);
      picks.forEach(function (p) { showPick(f, p); });
      if (hover && hover.curve) showHot(f, hover);
      if (picks.length === 1 && hover && hover.curve && hover.r !== picks[0].r) {
        var s = tool.solve({ picks: [picks[0], hover], lenMode: v.lenMode, len: +v.len });
        if (s.length) temp([lineEnt(s[0].a, s[0].b, v.construction)]);
      }
    }
    function next() { if (!st.last) { UI.setStatus('Place a bisector first: Next solution swaps the one just placed.'); return; } st.redo(st.last.k + 1, ctxNow()); UI.renderPM(); draw(); }
    openCommand({
      id: 'bisectorLine', title: 'Bisector', icon: 'bisectorLine', values: v,
      message: 'Select two lines: the bisector of the angle between the sides picked, from where they meet.',
      hint: hintNow, next: next,
      onMove: function (uv, mx, my) { var f = sketch(); hover = f ? curveAt(f, mx, my, ['line']) : null; draw(); },
      onPoint: function (uv, mx, my) {
        var f = sketch(), c = f && curveAt(f, mx, my, ['line']);
        if (!c || !c.curve) { UI.setStatus('Select a line.'); return; }
        if (picks.length && picks[0].r === c.r) { UI.setStatus('Select a different line.'); return; }
        picks.push(c);
        if (picks.length < 2) { UI.renderPM(); hintNow(); draw(); return; }
        st.place(ctxNow(), 0, ctxNow());
        picks = [];
        UI.renderPM(); hintNow(true); draw();
      },
      groups: [
        { title: 'Lines to Bisect', fields: [{ type: 'pick', icon: 'line', placeholder: 'Two lines', value: function () { return picks.map(function (p) { return p.label; }).join(', '); }, active: function () { return true; } }] },
        { title: 'Length', fields: [
          { type: 'radio', key: 'lenMode', rerender: true, options: [['short', 'Shorter line'], ['length', 'Length']] },
          { type: 'number', key: 'len', label: 'Length', unit: 'u', min: 0, show: function (x) { return x.lenMode === 'length'; } }] },
        solutionGroup(st, next),
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'keep', label: 'Keep bisecting (construction circle)' }, { type: 'check', key: 'dims', label: 'Add dimensions' }] }
      ],
      onChange: function (x) {
        Object.keys(BIS).forEach(function (k) { BIS[k] = x[k]; });
        if (st.last) { var c = st.last.ctx; c.lenMode = x.lenMode; c.len = +x.len; c.construction = !!x.construction; c.keep = !!x.keep; c.dims = !!x.dims; st.redo(null, c); }
        draw();
      }
    });
    draw();
  }

  // ------------------------------------------------------------------ Tangent Circle (Circle flyout)
  // AutoCAD's CIRCLE TTR / TTT, Mastercam's Circle Tangent 3: *Tangent, Tangent, Radius* (two lines, circles or arcs and
  // the Radius) and *Tangent, Tangent, Tangent* (three: every mix of lines and circles, Apollonius). Of the solutions
  // the one touching nearest the picks is placed, Tangent to each pick, with the radius dimension in TTR (Add
  // dimensions); Next solution swaps it.
  var TCS = { type: 'ttr', r: null, construction: false, dims: true };
  function cmdTangentCircle(mode) {
    if (TCS.r == null) TCS.r = UI.lenDefault(5);
    if (mode === 'ttr' || mode === 'ttt') TCS.type = mode;
    var v = { type: TCS.type, r: TCS.r, construction: TCS.construction, dims: TCS.dims }, picks = [], hover = null;
    var tool = {
      name: 'Tangent Circle',
      solve: function (ctx) {
        var f = sketch(), cs = ctx.picks.map(function (p) { return freshCurve(f, p); });
        if (cs.some(function (c) { return !c; })) return [];
        var sols = ctx.type === 'ttt' ? tangentCirclesTTT(cs) : tangentCirclesTTR(cs[0], cs[1], +ctx.r);
        return byPicks(sols, function (s, i) { return touchPoint(cs[i], s.c, s.r); }, ctx.picks.map(function (p) { return p.uv; }));
      },
      none: function (ctx) { return ctx.type === 'ttt' ? 'No circle is tangent to all three.' : 'No circle of radius ' + UI.fmtNum(+ctx.r, 4) + ' is tangent to both: try a larger radius.'; },
      build: function (f, s, ctx) {
        var i = f.entities.length, e = { t: 'circle', cx: clean(s.c[0]), cy: clean(s.c[1]), r: clean(s.r) };
        if (ctx.construction) e.construction = true;
        f.entities.push(e);
        ctx.picks.forEach(function (p) { must(f, 'tangent', [String(i), p.r]); });
        if (ctx.type === 'ttr' && ctx.dims) optDim(f, { e: i, k: 'dia', show: 'r', ang: 45, off: Math.round((s.r + 14 * ((UI.cam && UI.cam.scale) || 0.1)) * 1e4) / 1e4 });
        return { ok: true, index: i };
      }
    };
    var st = solutions(tool);
    function want() { return v.type === 'ttt' ? 3 : 2; }
    function ctxNow() { return { type: v.type, picks: picks.slice(), r: +v.r, construction: !!v.construction, dims: !!v.dims }; }
    function hintNow(quiet) {
      var n = want(), t = 'Select ' + (picks.length ? 'the ' + ['first', 'second', 'third'][picks.length] : n === 3 ? 'three' : 'two') + ' line' + (picks.length ? ', circle or arc' : 's, circles or arcs') + (picks.length ? '.' : ' the circle is tangent to' + (n === 2 ? ' (Radius ' + UI.fmtNum(+v.r, 4) + ').' : '.'));
      hint('<b>Tangent Circle:</b> ' + t); if (!quiet) UI.setStatus(t);
    }
    function draw() {
      var f = sketch();
      if (!f) return;
      feedback(); temp([]);
      picks.forEach(function (p) { showPick(f, p); });
      if (hover && hover.curve) showHot(f, hover);
      if (picks.length === want() - 1 && hover && hover.curve && !picks.some(function (p) { return p.r === hover.r; })) {
        var s = tool.solve({ type: v.type, picks: picks.concat([hover]), r: +v.r });
        if (s.length) temp([{ t: 'circle', cx: s[0].c[0], cy: s[0].c[1], r: s[0].r }]);
      }
    }
    function next() { if (!st.last) { UI.setStatus('Place a tangent circle first: Next solution swaps the one just placed.'); return; } st.redo(st.last.k + 1, ctxNow()); UI.renderPM(); draw(); }
    openCommand({
      id: 'tangentCircle', title: 'Tangent Circle', icon: 'tangentCircle', values: v,
      message: 'Select the lines, circles or arcs the circle is tangent to: two and a Radius, or three.',
      hint: hintNow, next: next,
      onMove: function (uv, mx, my) { var f = sketch(); hover = f ? curveAt(f, mx, my, ['line', 'circle']) : null; draw(); },
      onPoint: function (uv, mx, my) {
        var f = sketch(), c = f && curveAt(f, mx, my, ['line', 'circle']);
        if (!c || !c.curve) { UI.setStatus('Select a line, circle or arc.'); return; }
        if (picks.some(function (p) { return p.r === c.r; })) { UI.setStatus('That one is picked already: select another.'); return; }
        picks.push(c);
        if (picks.length < want()) { UI.renderPM(); hintNow(); draw(); return; }
        st.place(ctxNow(), 0, ctxNow());
        picks = [];
        UI.renderPM(); hintNow(true); draw();
      },
      groups: [
        { title: 'Circle Type', fields: [{ type: 'radio', key: 'type', rerender: true, options: [['ttr', 'Tangent, Tangent, Radius'], ['ttt', 'Tangent, Tangent, Tangent']] }] },
        { title: 'Tangent To', fields: [{ type: 'pick', icon: 'tangentCircle', placeholder: 'Lines, circles or arcs', value: function () { return picks.map(function (p) { return p.label; }).join(', '); }, active: function () { return true; } }] },
        { title: 'Parameters', show: function (x) { return x.type === 'ttr'; }, fields: [{ type: 'number', key: 'r', label: 'Radius', unit: 'u', min: 0 }] },
        solutionGroup(st, next),
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'For construction' }, { type: 'check', key: 'dims', label: 'Add dimensions', show: function (x) { return x.type === 'ttr'; } }] }
      ],
      onChange: function (x, key) {
        Object.keys(TCS).forEach(function (k) { TCS[k] = x[k]; });
        if (key === 'type') { picks = []; st.last = null; hintNow(); }
        else if (st.last && st.last.ctx.type === x.type) { var c = st.last.ctx; c.r = +x.r; c.construction = !!x.construction; c.dims = !!x.dims; st.redo(null, c); UI.renderPM(); }
        draw();
      }
    });
    UI.refreshRibbon();
    draw();
  }

  // ------------------------------------------------------------------ Split Entities (Trim flyout)
  // SolidWorks' Split Entities with AutoCAD's Break at point and Mastercam's Break at all intersections: click a line or
  // an arc where it should be split (a circle takes two clicks); the click snaps to where other entities cross it,
  // to points on it and to its midpoint (9 px). *Split all at intersections* splits the selected entities, or every
  // line, arc and circle when nothing is selected, wherever anything crosses them. The pieces keep the relations and
  // dimensions that still hold (as Trim keeps them) and meet at the split points (Coincident). One undo step each.
  function splitSnap(f, i, uv, mx, my) {
    var e = f.entities[i], P = pointOn(e, uv), px = pxWorld(mx, my), best = null, bd = 9 * px, S = SS(), sc = isSpl(e) ? splScale(e) : scaleOf(e);
    var cands = crossings(f, i);
    if (e.t === 'line') cands.push([(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]);
    if (e.t === 'arc') cands.push(arcAt(e, (e.a0 + e.a1) / 2));
    if (isSpl(e) && !e.style) e.pts.forEach(function (q) { cands.push([q[0], q[1]]); });   // rfAK: a spline's own points
    f.entities.forEach(function (o, j) { if (j !== i && o) S.pointRefs(f, j).forEach(function (pr) { if (dist(pointOn(e, pr.pt), pr.pt) < 1e-9 * sc) cands.push(pr.pt); }); });
    cands.forEach(function (q) { var d = dist(q, P); if (d < bd && (e.t === 'circle' || interior(e, q))) { bd = d; best = q; } });
    if (!best && UI.sketchInferPoint) { var inf = UI.sketchInferPoint(uv, mx, my); if (inf && inf.p) P = pointOn(e, inf.p); }
    return { p: best ? best.slice() : P, snapped: !!best };
  }
  function cmdSplitEntities() {
    var v = {}, pending = null, last = null, count = 0;
    var f0 = sketch(), pre = f0 ? selIdx(f0) : [];
    function closedEnt(e) { return !!e && (e.t === 'circle' || (isSpl(e) && !!e.closed)); }
    function hintNow(quiet) { var t = pending ? 'Click the second split point on the ' + (pending.spl ? 'closed spline.' : 'circle.') : 'Click a line, arc, circle or spline where it should be split (a circle or a closed spline needs two points).'; hint('<b>Split Entities:</b> ' + t); if (!quiet) UI.setStatus(t); }
    function target(f, mx, my) { var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index]; return e && (e.t === 'line' || e.t === 'arc' || e.t === 'circle' || isSpl(e)) ? hit.index : e ? -1 : null; }
    function draw() {
      var f = sketch();
      if (!f) return;
      feedback();
      if (pending && f.entities[pending.i]) { UI.sketchPreview([curvePts(SS().refCurve(f, String(pending.i)), f.entities[pending.i])], PICK, 'sk-trim-pick'); UI.sketchPreview([ring(pending.p, 6)], PICK, 'sk-trim-end'); }
      if (!last) return;
      var i = target(f, last.mx, last.my);
      if (i == null || i < 0) return;
      var sp = splitSnap(f, i, last.uv, last.mx, last.my);
      UI.sketchPreview([curvePts(SS().refCurve(f, String(i)), f.entities[i])], HOT, 'sk-trim-span');
      UI.sketchPreview([ring(sp.p, sp.snapped ? 7 : 5)], HOT, 'sk-trim-end');
    }
    function doSplit(i, pts) {
      var r = placeStep(function (f) { return splitEntity(f, i, pts); });
      if (!r.ok) { UI.toast(r.error); UI.setStatus(r.error); return; }
      count++;
      UI.setStatus('Split into ' + r.pieces.length + ' pieces (' + count + ' split' + (count === 1 ? '' : 's') + ' so far). Click another, or press ✓ / Esc to finish.');
    }
    function splitAllNow() {
      var r = placeStep(function (f) { var idx = pre.filter(function (i) { return f.entities[i]; }); return splitAll(f, idx); });
      if (!r.ok) { UI.toast(r.error); UI.setStatus(r.error); return; }
      pre = [];
      if (UI.setSelection) UI.setSelection([]); App.sel = null;
      count += r.split;
      UI.setStatus('Split ' + r.split + ' entit' + (r.split === 1 ? 'y' : 'ies') + ' at their intersections into ' + r.pieces + ' pieces.');
      UI.renderPM(); refresh();
    }
    openCommand({
      id: 'splitEnt', title: 'Split Entities', icon: 'splitEnt', values: v,
      message: 'Click where to split a line, arc, circle or spline (two points on a circle or a closed spline). Split all at intersections breaks the selected entities, or the whole sketch, wherever they cross.',
      hint: hintNow,
      onMove: function (uv, mx, my) { last = { uv: uv, mx: mx, my: my }; draw(); },
      onPoint: function (uv, mx, my) {
        var f = sketch();
        if (!f) return;
        last = { uv: uv, mx: mx, my: my };
        var i = target(f, mx, my);
        if (i == null) { UI.setStatus('Click on a line, arc, circle or spline.'); return; }
        if (i < 0) { UI.setStatus('Split Entities splits lines, arcs, circles and splines.'); return; }
        var sp = splitSnap(f, i, uv, mx, my), ce = f.entities[i];
        if (closedEnt(ce)) {
          if (!pending || pending.i !== i) { pending = { i: i, p: sp.p, spl: isSpl(ce) }; hintNow(); draw(); return; }
          if (dist(pending.p, sp.p) < 1e-6 * (isSpl(ce) ? splScale(ce) : scaleOf(ce))) { UI.setStatus('Click a second, different point on the ' + (isSpl(ce) ? 'spline.' : 'circle.')); return; }
          var p1 = pending.p; pending = null;
          doSplit(i, [p1, sp.p]);
        } else { pending = null; doSplit(i, [sp.p]); }
        hintNow(true); draw();
      },
      groups: [
        { title: 'Split Points', fields: [{ type: 'static', label: '', value: function () { return count ? count + ' split' + (count === 1 ? '' : 's') + ' made' : 'Click on the entity to split'; } }] },
        { title: 'Options', fields: [
          { type: 'buttons', buttons: [{ label: 'Split all at intersections', onclick: function () { splitAllNow(); } }] },
          { type: 'static', label: '', value: function () { return pre.length ? 'Splits the ' + pre.length + ' selected entit' + (pre.length === 1 ? 'y' : 'ies') + '.' : 'Splits every line, arc, circle and spline of the sketch.'; } }] }
      ]
    });
    draw();
  }

  // ------------------------------------------------------------------ Join Entities (Trim flyout)
  // AutoCAD's JOIN: the entities in *Entities to Join* (the selection when it opens, plus entities clicked while it is
  // open) become one on ✓: collinear lines that touch or overlap one line, arcs on one circle one arc (a circle when
  // they close it). See joinEntities for the relations kept.
  function cmdJoinEntities() {
    var f = sketch();
    if (!f) { UI.toast('Open a sketch first.'); return; }
    var v = { entities: selIdx(f) };
    function hintNow(quiet) { var t = 'Select the collinear lines, or the arcs on one circle, to join; then press ✓.'; hint('<b>Join Entities:</b> ' + t); UI.setStatus(t); }
    function preview() {
      var g = sketch();
      feedback();
      if (!g) return;
      v.entities.forEach(function (i) { var e = g.entities[i], c = e && SS().refCurve(g, String(i)); if (c) UI.sketchPreview([curvePts(c, e)], PICK, 'sk-trim-pick'); });
    }
    function names(g) { return v.entities.map(function (i) { var e = g.entities[i]; return { label: (e ? ({ line: 'Line', arc: 'Arc', circle: 'Circle' }[e.t] || 'Entity') : 'Entity') + (i + 1) }; }); }
    openCommand({
      id: 'joinEnt', title: 'Join Entities', icon: 'joinEnt', values: v,
      message: 'Select collinear lines that touch or overlap, or arcs on one circle; ✓ joins them into one.',
      hint: hintNow,
      onSelection: function () { var g = sketch(); if (!g) return; var s = selIdx(g); if (s.join() === v.entities.join()) return; v.entities = s; UI.renderPM(); preview(); },
      okBlocked: function (x) { return x.entities.length >= 2 ? '' : 'Select two or more entities to join.'; },
      groups: [{ title: 'Entities to Join', fields: [{ type: 'pick', icon: 'joinEnt', placeholder: 'Select sketch entities…',
        value: function (x) { return x.entities.length ? x.entities.length + ' entit' + (x.entities.length > 1 ? 'ies' : 'y') : ''; },
        items: function () { var g = sketch(); return g ? names(g) : []; },
        onRemove: function (x, i) { x.entities.splice(i, 1); if (UI.setSelection) UI.setSelection(x.entities.map(function (k) { return { kind: 'entity', index: k }; })); UI.renderPM(); preview(); },
        onClear: function (x) { x.entities.length = 0; if (UI.setSelection) UI.setSelection([]); UI.renderPM(); preview(); } }] }],
      onOK: function (x) {
        var idx = x.entities.slice(), r = placeStep(function (g) { return joinEntities(g, idx); });
        if (!r.ok) { UI.toast(r.error); UI.setStatus(r.error); return false; }
        App.sel = null; if (UI.setSelection) UI.setSelection([]);
        UI.setStatus('Joined ' + idx.length + ' entities into one ' + ({ line: 'line', arc: 'arc', circle: 'circle' }[r.kind] || 'entity') + '.');
      }
    });
    preview();
  }

  UI.cmdTangentLine = cmdTangentLine;
  UI.cmdPerpendicularLine = cmdPerpendicularLine;
  UI.cmdBisectorLine = cmdBisectorLine;
  UI.cmdTangentCircle = cmdTangentCircle;
  UI.cmdSplitEntities = cmdSplitEntities;
  UI.cmdJoinEntities = cmdJoinEntities;
})();
